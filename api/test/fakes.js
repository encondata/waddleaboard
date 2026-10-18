// In-memory stand-ins for Postgres and MinIO so api tests run without Docker.
import { Readable } from "node:stream";

export function createMemoryStore() {
  const db = { users: [], sessions: new Map(), ducks: [], finds: [], photos: [] };
  let ids = { users: 0, ducks: 0, finds: 0 };
  const state = { down: false };

  const duckView = (d) => {
    const approved = db.finds
      .filter((f) => f.duckId === d.id && f.status === "approved")
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const owner = db.users.find((u) => u.id === d.ownerId);
    return { ...d, findCount: approved.length, lastSeen: approved[0]?.place ?? null, ownerUsername: owner?.username ?? null };
  };
  const findView = (f) => {
    const duck = db.ducks.find((d) => d.id === f.duckId);
    const photo = db.photos.find((p) => p.findId === f.id);
    return { ...f, duckCode: duck.code, duckName: duck.name, photoId: photo?.id ?? null };
  };

  return {
    db,
    state,
    async ping() {
      if (state.down) throw new Error("db down");
    },
    async findDuckByCode(code) {
      const d = db.ducks.find((x) => x.code === code);
      return d ? duckView(d) : null;
    },
    async listDucks() {
      return db.ducks.map(duckView);
    },
    async listDucksByOwner(userId) {
      return db.ducks.filter((d) => d.ownerId === userId).map(duckView);
    },
    async createDuck(input) {
      const duck = {
        id: ++ids.ducks,
        code: input.code,
        name: input.name,
        color: input.color,
        accent: input.accent || "gold",
        status: input.status || "Sailing",
        story: input.story ?? null,
        homePort: input.homePort ?? null,
        ship: input.ship ?? null,
        miles: input.miles ?? 0,
        imageUrl: input.imageUrl ?? null,
        ownerId: input.ownerId ?? null,
        createdAt: new Date().toISOString(),
      };
      db.ducks.push(duck);
      return duckView(duck);
    },
    async listApprovedFinds(duckId) {
      return db.finds
        .filter((f) => f.duckId === duckId && f.status === "approved")
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map(findView);
    },
    async createFind(input) {
      const find = {
        id: ++ids.finds,
        duckId: input.duckId,
        finderName: input.finderName,
        place: input.place,
        spot: input.spot || null,
        note: input.note,
        rehidden: input.rehidden,
        status: "pending",
        imageUrl: null,
        createdAt: new Date(Date.now() + ids.finds).toISOString(),
        moderatedAt: null,
      };
      db.finds.push(find);
      if (input.photo) db.photos.push({ ...input.photo, findId: find.id });
      return findView(find);
    },
    async listFindsForModeration(status) {
      return db.finds
        .filter((f) => status === "all" || (status === "open" ? ["pending", "flagged"].includes(f.status) : f.status === status))
        .map(findView);
    },
    async setFindStatus(id, status, moderatorId, now) {
      const f = db.finds.find((x) => x.id === id);
      if (!f) return null;
      Object.assign(f, { status, moderatedAt: now.toISOString(), moderatedBy: moderatorId });
      return findView(f);
    },
    async getPhoto(id) {
      const p = db.photos.find((x) => x.id === id);
      if (!p) return null;
      const f = db.finds.find((x) => x.id === p.findId);
      return { objectKey: p.objectKey, contentType: p.contentType, sizeBytes: p.sizeBytes, findStatus: f.status };
    },
    async getUserByUsername(username) {
      return db.users.find((u) => u.username.toLowerCase() === String(username).toLowerCase()) || null;
    },
    async createUser(u) {
      if (db.users.some((x) => x.username.toLowerCase() === u.username.toLowerCase())) return null;
      const user = { id: ++ids.users, username: u.username, displayName: u.displayName ?? null, passwordHash: u.passwordHash, role: u.role };
      db.users.push(user);
      return user;
    },
    async createSession(s) {
      db.sessions.set(s.tokenHash, s);
    },
    async getSession(tokenHash, now) {
      const s = db.sessions.get(tokenHash);
      if (!s || s.expiresAt <= now) return null;
      return { user: db.users.find((u) => u.id === s.userId), expiresAt: s.expiresAt };
    },
    async deleteSession(tokenHash) {
      db.sessions.delete(tokenHash);
    },
    async publicStats() {
      const approved = db.finds.filter((f) => f.status === "approved");
      return { ducks: db.ducks.length, finds: approved.length, places: new Set(approved.map((f) => f.place.toLowerCase())).size };
    },
    async adminStats() {
      const approved = db.finds.filter((f) => f.status === "approved");
      const pending = db.finds.filter((f) => f.status === "pending").length;
      const flagged = db.finds.filter((f) => f.status === "flagged").length;
      return {
        activeDucks: db.ducks.length,
        ducksThisWeek: db.ducks.length,
        approvedFinds: approved.length,
        findsThisWeek: db.finds.length,
        places: new Set(approved.map((f) => f.place.toLowerCase())).size,
        pending,
        flagged,
        needsReview: pending + flagged,
        fleet: { total: db.ducks.length, active: db.ducks.length, quiet: 0, retired: 0 },
      };
    },
  };
}

export function createMemoryStorage() {
  const objects = new Map();
  const state = { down: false };
  return {
    objects,
    state,
    async ping() {
      if (state.down) throw new Error("storage down");
    },
    async ensureBucket() {
      return false;
    },
    async putObject(key, buffer, contentType) {
      objects.set(key, { buffer, contentType });
    },
    async getObject(key) {
      const obj = objects.get(key);
      if (!obj) throw new Error("NoSuchKey");
      return Readable.from([obj.buffer]);
    },
    async removeObject(key) {
      objects.delete(key);
    },
  };
}

// Records SQL sent to it and emulates just enough of schema_migrations for the runner.
export function createFakeMigrationClient({ failOn } = {}) {
  const tracking = [];
  const executed = [];
  let pendingInsert = null;
  let inTx = false;
  let txExecuted = [];
  return {
    tracking,
    executed,
    async query(sql, params = []) {
      const s = sql.trim();
      if (s.startsWith("CREATE TABLE IF NOT EXISTS schema_migrations")) return { rows: [] };
      if (s.startsWith("SELECT pg_advisory")) return { rows: [] };
      if (s === "SELECT name FROM schema_migrations") return { rows: tracking.map((name) => ({ name })) };
      if (s === "BEGIN") {
        inTx = true;
        txExecuted = [];
        pendingInsert = null;
        return { rows: [] };
      }
      if (s === "COMMIT") {
        inTx = false;
        executed.push(...txExecuted);
        if (pendingInsert) tracking.push(pendingInsert);
        return { rows: [] };
      }
      if (s === "ROLLBACK") {
        inTx = false;
        txExecuted = [];
        pendingInsert = null;
        return { rows: [] };
      }
      if (s.startsWith("INSERT INTO schema_migrations")) {
        pendingInsert = params[0];
        return { rows: [] };
      }
      if (failOn && s.includes(failOn)) throw new Error("syntax error (fake)");
      (inTx ? txExecuted : executed).push(s);
      return { rows: [] };
    },
  };
}
