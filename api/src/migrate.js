// Applies ordered SQL migrations once each, tracked in schema_migrations.
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const MIGRATION_FILE = /^\d{3,}_[A-Za-z0-9_-]+\.sql$/;
const LOCK_ID = 727274; // arbitrary constant shared by every api instance

export async function listMigrations(dir) {
  const files = (await readdir(dir)).filter((f) => MIGRATION_FILE.test(f)).sort();
  return Promise.all(files.map(async (name) => ({ name, sql: await readFile(path.join(dir, name), "utf8") })));
}

// `client` must be a single connection (not a pool) so the lock and transactions hold.
export async function runMigrations(client, dir, { logger = console } = {}) {
  const migrations = await listMigrations(dir);
  // Lock first: two runners creating schema_migrations at once would collide.
  await client.query("SELECT pg_advisory_lock($1)", [LOCK_ID]);
  const applied = [];
  try {
    await client.query(
      "CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())",
    );
    const { rows } = await client.query("SELECT name FROM schema_migrations");
    const done = new Set(rows.map((r) => r.name));
    for (const migration of migrations) {
      if (done.has(migration.name)) continue;
      await client.query("BEGIN");
      try {
        await client.query(migration.sql);
        await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [migration.name]);
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK");
        throw new Error(`Migration ${migration.name} failed: ${err.message}`, { cause: err });
      }
      applied.push(migration.name);
      logger.info?.(`applied migration ${migration.name}`);
    }
  } finally {
    await client.query("SELECT pg_advisory_unlock($1)", [LOCK_ID]);
  }
  return applied;
}

export async function runSeed(client, file) {
  const sql = await readFile(file, "utf8");
  await client.query("BEGIN");
  try {
    await client.query(sql);
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  }
}
