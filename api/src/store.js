// PostgreSQL-backed data access. The api handlers only talk to this interface,
// so tests can swap in an in-memory store (see test/fakes.js).

const DUCK_SELECT = `
  SELECT d.*, u.username AS owner_username,
    (SELECT count(*) FROM finds f WHERE f.duck_id = d.id AND f.status = 'approved')::int AS find_count,
    (SELECT f.place FROM finds f WHERE f.duck_id = d.id AND f.status = 'approved'
       ORDER BY f.created_at DESC LIMIT 1) AS last_seen
  FROM ducks d LEFT JOIN users u ON u.id = d.owner_id`;

const FIND_SELECT = `
  SELECT f.*, p.id AS photo_id, d.code AS duck_code, d.name AS duck_name
  FROM finds f
  JOIN ducks d ON d.id = f.duck_id
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

    async createDuck(d) {
      const { rows } = await pool.query(
        `INSERT INTO ducks (code, name, color, accent, status, story, home_port, ship, miles, image_url, owner_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
        [d.code, d.name, d.color, d.accent, d.status, d.story, d.homePort, d.ship, d.miles, d.imageUrl, d.ownerId],
      );
      const created = await pool.query(`${DUCK_SELECT} WHERE d.id = $1`, [rows[0].id]);
      return mapDuck(created.rows[0]);
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
          "UPDATE finds SET status = $2, moderated_at = $3, moderated_by = $4 WHERE id = $1 RETURNING duck_id, rehidden",
          [id, status, now, moderatorId],
        );
        if (!rows[0]) return null;
        if (status === "approved") {
          await client.query(
            `UPDATE ducks SET status = CASE WHEN $2::boolean THEN 'Rehidden' ELSE 'Adopted' END
             WHERE id = $1 AND status <> 'Retired'`,
            [rows[0].duck_id, rows[0].rehidden],
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
