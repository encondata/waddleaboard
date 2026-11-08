import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { listMigrations, runMigrations } from "../src/migrate.js";
import { createFakeMigrationClient } from "./fakes.js";

const quiet = { logger: {} };
const REPO_MIGRATIONS = new URL("../../db/migrations", import.meta.url).pathname;

async function tempMigrations(files) {
  const dir = await mkdtemp(path.join(tmpdir(), "waddle-mig-"));
  for (const [name, sql] of Object.entries(files)) await writeFile(path.join(dir, name), sql);
  return dir;
}

test("runner applies each migration once, in order; second run is a no-op", async () => {
  const dir = await tempMigrations({
    "002_second.sql": "CREATE TABLE b ();",
    "001_first.sql": "CREATE TABLE a ();",
    "README.md": "not a migration",
  });
  const client = createFakeMigrationClient();
  assert.deepEqual(await runMigrations(client, dir, quiet), ["001_first.sql", "002_second.sql"]);
  assert.deepEqual(client.tracking, ["001_first.sql", "002_second.sql"]);
  assert.deepEqual(client.executed, ["CREATE TABLE a ();", "CREATE TABLE b ();"]);

  const before = client.tracking.length;
  assert.deepEqual(await runMigrations(client, dir, quiet), []);
  assert.equal(client.tracking.length, before, "tracking row count unchanged");
  assert.equal(client.executed.length, 2, "no SQL re-executed");
});

test("a failing migration is rolled back and not recorded", async () => {
  const dir = await tempMigrations({ "001_ok.sql": "CREATE TABLE ok ();", "002_bad.sql": "CREATE TABLE BROKEN" });
  const client = createFakeMigrationClient({ failOn: "BROKEN" });
  await assert.rejects(runMigrations(client, dir, quiet), /002_bad\.sql failed/);
  assert.deepEqual(client.tracking, ["001_ok.sql"]);
});

test("repo migrations are ordered and define users, ducks, finds and photos", async () => {
  const migrations = await listMigrations(REPO_MIGRATIONS);
  const names = migrations.map((m) => m.name);
  assert.deepEqual(names, [...names].sort());
  const sql = migrations.map((m) => m.sql).join("\n");
  for (const table of ["users", "sessions", "ducks", "finds", "photos"]) {
    assert.match(sql, new RegExp(`CREATE TABLE ${table} \\(`), `${table} table`);
  }
  assert.match(sql, /role IN \('admin', 'owner'\)/);
  assert.match(sql, /CREATE TABLE duck_types \(/);
  assert.match(sql, /DEFAULT 'pending'/);
});

test("migration 005 adds duck types, backfills ducks and then requires type_id", async () => {
  const migrations = await listMigrations(REPO_MIGRATIONS);
  const names = migrations.map((m) => m.name);
  assert.ok(names.includes("005_duck_types.sql"));
  assert.ok(names.every((n) => /^\d{3}_[a-z0-9_]+\.sql$/.test(n)), "name pattern");
  assert.equal(names.indexOf("005_duck_types.sql"), names.length - 1, "runs after 001-004");
  const sql = migrations.find((m) => m.name === "005_duck_types.sql").sql;
  assert.match(sql, /slug text NOT NULL UNIQUE/);
  assert.match(sql, /accent IN \('gold', 'coral', 'mint', 'blue'\)/);
  assert.match(sql, /ADD COLUMN type_id bigint REFERENCES duck_types/);
  const backfill = sql.indexOf("UPDATE ducks SET type_id");
  const notNull = sql.indexOf("ALTER COLUMN type_id SET NOT NULL");
  assert.ok(backfill > 0 && notNull > backfill, "backfill before NOT NULL");
  assert.match(sql, /CREATE INDEX ducks_type_id_idx ON ducks \(type_id\)/);
  assert.doesNotMatch(sql, /CONCURRENTLY/, "runs inside the migrator transaction");
});

test("the advisory lock is taken before anything else touches the database", async () => {
  const dir = await tempMigrations({ "001_a.sql": "CREATE TABLE a ();" });
  const client = createFakeMigrationClient();
  const seen = [];
  const query = client.query.bind(client);
  client.query = (sql, params) => {
    seen.push(sql.trim().split(/\s+/).slice(0, 2).join(" "));
    return query(sql, params);
  };
  await runMigrations(client, dir, quiet);
  assert.equal(seen[0], "SELECT pg_advisory_lock($1)");
  assert.equal(seen.at(-1), "SELECT pg_advisory_unlock($1)");
});
