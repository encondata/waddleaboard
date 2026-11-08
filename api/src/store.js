// PostgreSQL-backed data access. The api handlers only talk to this interface,
// so tests can swap in an in-memory store (see test/fakes.js).

import { nextSerials, slugify } from "./validation.js";

const DUCK_SELECT = `
  SELECT d.*, u.username AS owner_username,
    t.slug AS type_slug, t.name AS type_name, t.color AS type_color, t.accent AS type_accent,
    t.image_url AS type_image_url, t.story AS type_story,
    (SELECT count(*) FROM finds f WHERE f.duck_id = d.id AND f.status = 'approved')::int AS find_count,
    (SELECT f.place FROM finds f WHERE f.duck_id = d.id AND f.status = 'approved'
       ORDER BY f.created_at DESC LIMIT 1) AS last_seen
  FROM ducks d
  JOIN duck_types t ON t.id = d.type_id
  LEFT JOIN users u ON u.id = d.owner_id`;

// Serials sort by prefix, then numerically, so DP-0999 comes before DP-10000.
const SERIAL_ORDER = "split_part(d.code, '-', 1), split_part(d.code, '-', 2)::int";

const TYPE_SELECT = `
  SELECT t.*,
    (SELECT count(*) FROM ducks d WHERE d.type_id = t.id)::int AS duck_count,
    (SELECT count(*) FROM finds f JOIN ducks d ON d.id = f.duck_id
       WHERE d.type_id = t.id AND f.status = 'approved')::int AS find_count
  FROM duck_types t`;

const FIND_SELECT = `
  SELECT f.*, p.id AS photo_id, d.code AS duck_code, t.name AS duck_name
  FROM finds f
  JOIN ducks d ON d.id = f.duck_id
  JOIN duck_types t ON t.id = d.type_id
  LEFT JOIN photos p ON p.find_id = f.id`;

const iso = (v) => (v instanceof Date ? v.toISOString() : v ?? null);

export function mapDuck(r) {
  return {
    id: Number(r.id),
    code: r.code,
    name: r.name,
    color: r.color,
    accent: r.accent,
    status: r.status,
    story: r.story,
    homePort: r.home_port,
    ship: r.ship,
    miles: r.miles,
    imageUrl: r.image_url,
    ownerId: r.owner_id === null || r.owner_id === undefined ? null : Number(r.owner_id),
    ownerUsername: r.owner_username ?? null,
    createdAt: iso(r.created_at),
    findCount: r.find_count ?? 0,
    lastSeen: r.last_seen ?? null,
    typeId: r.type_id === null || r.type_id === undefined ? null : Number(r.type_id),
    typeSlug: r.type_slug ?? null,
    typeName: r.type_name ?? null,
    typeColor: r.type_color ?? null,
    typeAccent: r.type_accent ?? null,
    typeImageUrl: r.type_image_url ?? null,
    typeStory: r.type_story ?? null,
  };
}

export function mapDuckType(r) {
  return {
    id: Number(r.id),
    slug: r.slug,
    name: r.name,
    color: r.color,
    accent: r.accent,
    imageUrl: r.image_url,
    story: r.story,
    createdAt: iso(r.created_at),
    duckCount: r.duck_count ?? 0,
    findCount: r.find_count ?? 0,
  };
}

export function mapFind(r) {
  return {
    id: Number(r.id),
    duckId: Number(r.duck_id),
    duckCode: r.duck_code,
    duckName: r.duck_name,
    finderName: r.finder_name,
    place: r.place,
    spot: r.spot,
    note: r.note,
    rehidden: r.rehidden,
    status: r.status,
    imageUrl: r.image_url,
    photoId: r.photo_id ?? null,
    createdAt: iso(r.created_at),
    moderatedAt: iso(r.moderated_at),
  };
}

function mapUser(r) {
  return {
    id: Number(r.id),
    username: r.username,
    displayName: r.display_name,
    passwordHash: r.password_hash,
    role: r.role,
    createdAt: iso(r.created_at),
  };
}

const n = (v) => Number(v ?? 0);

export function createPgStore(pool) {
  async function tx(fn) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await fn(client);
      await client.query("COMMIT");
      return result;
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }

  async function duckById(db, id) {
    const { rows } = await db.query(`${DUCK_SELECT} WHERE d.id = $1`, [id]);
    return rows[0] ? mapDuck(rows[0]) : null;
  }

  // Matches an existing type on name and color (case-insensitive), else creates one with a
  // free slug. The transaction-scoped lock stops two creates from racing on the same slug.
  async function findOrCreateType(client, d) {
    await client.query("SELECT pg_advisory_xact_lock(hashtext('duck_types'))");
    const found = await client.query(
      "SELECT id FROM duck_types WHERE lower(name) = lower($1) AND lower(color) = lower($2) ORDER BY id LIMIT 1",
      [d.name, d.color],
    );
    if (found.rows[0]) return found.rows[0].id;
    const base = slugify(d.name);
    for (let n = 1; ; n++) {
      const slug = n === 1 ? base : `${base}-${n}`;
      const { rows } = await client.query(
        `INSERT INTO duck_types (slug, name, color, accent, image_url, story) VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (slug) DO NOTHING RETURNING id`,
        [slug, d.name, d.color, d.accent || "gold", d.imageUrl ?? null, d.story ?? null],
      );
      if (rows[0]) return rows[0].id;
    }
  }

  async function findById(db, id) {
    const { rows } = await db.query(`${FIND_SELECT} WHERE f.id = $1`, [id]);
    return rows[0] ? mapFind(rows[0]) : null;
  }

  return {
    async ping() {
      await pool.query("SELECT 1");
    },

    async findDuckByCode(code) {
      const { rows } = await pool.query(`${DUCK_SELECT} WHERE d.code = $1`, [code]);
      return rows[0] ? mapDuck(rows[0]) : null;
    },

    async listDucks() {
      const { rows } = await pool.query(`${DUCK_SELECT} ORDER BY d.created_at DESC, d.id DESC`);
      return rows.map(mapDuck);
    },

    async listDucksByOwner(userId) {
      const { rows } = await pool.query(`${DUCK_SELECT} WHERE d.owner_id = $1 ORDER BY d.created_at, d.id`, [userId]);
      return rows.map(mapDuck);
    },

    // Without d.typeId, reuses the type with the same name and color, or creates one.
    async createDuck(d) {
      return tx(async (client) => {
        const typeId = d.typeId ?? (await findOrCreateType(client, d));
        const { rows } = await client.query(
          `INSERT INTO ducks (code, type_id, name, color, accent, status, story, home_port, ship, miles, image_url, owner_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id`,
          [d.code, typeId, d.name, d.color, d.accent, d.status, d.story, d.homePort, d.ship, d.miles, d.imageUrl, d.ownerId],
        );
        return duckById(client, rows[0].id);
      });
    },

    async createDuckType(t) {
      const { rows } = await pool.query(
        `INSERT INTO duck_types (slug, name, color, accent, image_url, story) VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (slug) DO NOTHING RETURNING id`,
        [t.slug, t.name, t.color, t.accent || "gold", t.imageUrl, t.story],
      );
      if (!rows[0]) return null;
      const created = await pool.query(`${TYPE_SELECT} WHERE t.id = $1`, [rows[0].id]);
      return mapDuckType(created.rows[0]);
    },

    async findDuckTypeBySlug(slug) {
      const { rows } = await pool.query(`${TYPE_SELECT} WHERE t.slug = $1`, [slug]);
      return rows[0] ? mapDuckType(rows[0]) : null;
    },

    async listDuckTypes() {
      const { rows } = await pool.query(`${TYPE_SELECT} ORDER BY t.name, t.slug`);
      return rows.map(mapDuckType);
    },

    async listDucksByType(typeId) {
      const { rows } = await pool.query(`${DUCK_SELECT} WHERE d.type_id = $1 ORDER BY ${SERIAL_ORDER}`, [typeId]);
      return rows.map(mapDuck);
    },

    // Registers `count` individuals of a type with the next free serials under `prefix`.
    // The advisory lock serialises batches per prefix; UNIQUE (code) is the backstop.
    async createDucksBatch({ typeId, count, prefix, ownerId }) {
      return tx(async (client) => {
        await client.query("SELECT pg_advisory_xact_lock(hashtext('ducks_serial'), hashtext($1))", [prefix]);
        const { rows: top } = await client.query(
          `SELECT max(split_part(code, '-', 2)::int) AS highest FROM ducks WHERE split_part(code, '-', 1) = $1`,
          [prefix],
        );
        const serials = nextSerials(prefix, top[0].highest, count);
        const { rows } = await client.query(
          `INSERT INTO ducks (code, type_id, name, status, owner_id)
           SELECT s.code, t.id, t.name, 'Sailing', $3 FROM unnest($1::text[]) AS s (code)
           JOIN duck_types t ON t.id = $2
           RETURNING id`,
          [serials, typeId, ownerId ?? null],
        );
        const ids = rows.map((r) => r.id);
        const created = await client.query(`${DUCK_SELECT} WHERE d.id = ANY($1::bigint[]) ORDER BY ${SERIAL_ORDER}`, [ids]);
        return created.rows.map(mapDuck);
      });
    },

    async listApprovedFinds(duckId) {
      const { rows } = await pool.query(
        `${FIND_SELECT} WHERE f.duck_id = $1 AND f.status = 'approved' ORDER BY f.created_at DESC, f.id DESC`,
        [duckId],
      );
      return rows.map(mapFind);
    },

    async createFind(f) {
      return tx(async (client) => {
        const { rows } = await client.query(
          `INSERT INTO finds (duck_id, finder_name, place, spot, note, rehidden)
           VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
          [f.duckId, f.finderName, f.place, f.spot || null, f.note, f.rehidden],
        );
        const id = rows[0].id;
        if (f.photo) {
          await client.query(
            "INSERT INTO photos (id, find_id, object_key, content_type, size_bytes) VALUES ($1, $2, $3, $4, $5)",
            [f.photo.id, id, f.photo.objectKey, f.photo.contentType, f.photo.sizeBytes],
          );
        }
        return findById(client, id);
      });
    },

    async listFindsForModeration(status) {
      let where = "";
      const params = [];
      if (status === "open") where = "WHERE f.status IN ('pending', 'flagged')";
      else if (status !== "all") {
        where = "WHERE f.status = $1";
        params.push(status);
      }
      const { rows } = await pool.query(`${FIND_SELECT} ${where} ORDER BY f.created_at DESC, f.id DESC LIMIT 200`, params);
      return rows.map(mapFind);
    },

    async setFindStatus(id, status, moderatorId, now) {
      return tx(async (client) => {
        const { rows } = await client.query(
          `WITH old_find AS (SELECT status FROM finds WHERE id = $1 FOR UPDATE)
           UPDATE finds f SET status = $2, moderated_at = $3, moderated_by = $4
           FROM old_find WHERE f.id = $1 RETURNING f.duck_id, old_find.status AS previous`,
          [id, status, now, moderatorId],
        );
        if (!rows[0]) return null;
        // The duck's status follows its newest approved find, whatever order finds are
        // approved or rejected in. Only approvals (made or undone) touch it.
        if (status === "approved" || rows[0].previous === "approved") {
          await client.query(
            `UPDATE ducks d SET status = CASE WHEN latest.rehidden THEN 'Rehidden' ELSE 'Adopted' END
             FROM (SELECT rehidden FROM finds WHERE duck_id = $1 AND status = 'approved'
                   ORDER BY created_at DESC, id DESC LIMIT 1) latest
             WHERE d.id = $1 AND d.status <> 'Retired'`,
            [rows[0].duck_id],
          );
        }
        return findById(client, id);
      });
    },

    async getPhoto(id) {
      const { rows } = await pool.query(
        `SELECT p.object_key, p.content_type, p.size_bytes, f.status AS find_status
         FROM photos p JOIN finds f ON f.id = p.find_id WHERE p.id = $1`,
        [id],
      );
      if (!rows[0]) return null;
      return {
        objectKey: rows[0].object_key,
        contentType: rows[0].content_type,
        sizeBytes: rows[0].size_bytes,
        findStatus: rows[0].find_status,
      };
    },

    async getUserByUsername(username) {
      const { rows } = await pool.query("SELECT * FROM users WHERE lower(username) = lower($1)", [username]);
      return rows[0] ? mapUser(rows[0]) : null;
    },

    async createUser(u) {
      const { rows } = await pool.query(
        `INSERT INTO users (username, display_name, password_hash, role) VALUES ($1, $2, $3, $4)
         ON CONFLICT DO NOTHING RETURNING *`,
        [u.username, u.displayName || null, u.passwordHash, u.role],
      );
      return rows[0] ? mapUser(rows[0]) : null;
    },

    async countUsersByRole(role) {
      const { rows } = await pool.query("SELECT count(*)::int AS c FROM users WHERE role = $1", [role]);
      return rows[0].c;
    },

    async createSession(s) {
      await pool.query("DELETE FROM sessions WHERE expires_at < now()");
      await pool.query("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)", [
        s.tokenHash,
        s.userId,
        s.expiresAt,
      ]);
    },

    async getSession(tokenHash, now) {
      const { rows } = await pool.query(
        `SELECT s.expires_at, u.* FROM sessions s JOIN users u ON u.id = s.user_id
         WHERE s.token_hash = $1 AND s.expires_at > $2`,
        [tokenHash, now],
      );
      return rows[0] ? { user: mapUser(rows[0]), expiresAt: iso(rows[0].expires_at) } : null;
    },

    async deleteSession(tokenHash) {
      await pool.query("DELETE FROM sessions WHERE token_hash = $1", [tokenHash]);
    },

    async publicStats() {
      const { rows } = await pool.query(`SELECT
        (SELECT count(*) FROM ducks WHERE status NOT IN ('Retired', 'Adopted')) AS ducks,
        (SELECT count(*) FROM finds WHERE status = 'approved') AS finds,
        (SELECT count(DISTINCT lower(place)) FROM finds WHERE status = 'approved') AS places`);
      return { ducks: n(rows[0].ducks), finds: n(rows[0].finds), places: n(rows[0].places) };
    },

    async adminStats(now) {
      const { rows } = await pool.query(
        `SELECT
          (SELECT count(*) FROM ducks) AS total_ducks,
          (SELECT count(*) FROM ducks WHERE status NOT IN ('Retired', 'Adopted')) AS active_ducks,
          (SELECT count(*) FROM ducks WHERE created_at > $1::timestamptz - interval '7 days') AS ducks_this_week,
          (SELECT count(*) FROM finds WHERE status = 'approved') AS approved_finds,
          (SELECT count(*) FROM finds WHERE created_at > $1::timestamptz - interval '7 days') AS finds_this_week,
          (SELECT count(DISTINCT lower(place)) FROM finds WHERE status = 'approved') AS places,
          (SELECT count(*) FROM finds WHERE status = 'pending') AS pending,
          (SELECT count(*) FROM finds WHERE status = 'flagged') AS flagged,
          (SELECT count(*) FROM ducks WHERE status IN ('Retired', 'Adopted')) AS retired,
          (SELECT count(*) FROM ducks d WHERE d.status NOT IN ('Retired', 'Adopted') AND NOT EXISTS (
             SELECT 1 FROM finds f WHERE f.duck_id = d.id AND f.created_at > $1::timestamptz - interval '30 days'
           ) AND d.created_at <= $1::timestamptz - interval '30 days') AS quiet`,
        [now],
      );
      const r = rows[0];
      const activeDucks = n(r.active_ducks);
      return {
        activeDucks,
        ducksThisWeek: n(r.ducks_this_week),
        approvedFinds: n(r.approved_finds),
        findsThisWeek: n(r.finds_this_week),
        places: n(r.places),
        pending: n(r.pending),
        flagged: n(r.flagged),
        needsReview: n(r.pending) + n(r.flagged),
        fleet: {
          total: n(r.total_ducks),
          active: activeDucks - n(r.quiet),
          quiet: n(r.quiet),
          retired: n(r.retired),
        },
      };
    },
  };
}
