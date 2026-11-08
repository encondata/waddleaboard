import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { loadConfig, secret } from "../src/config.js";

async function secretsDir(files) {
  const dir = await mkdtemp(path.join(tmpdir(), "waddle-secrets-"));
  for (const [name, value] of Object.entries(files)) await writeFile(path.join(dir, name), value);
  return dir;
}

test("secrets come from the variable itself, else from the file it names", async () => {
  const dir = await secretsDir({ pw: "from-file\n" });
  assert.equal(secret({ PW: "direct", PW_FILE: path.join(dir, "pw") }, "PW"), "direct");
  assert.equal(secret({ PW_FILE: path.join(dir, "pw") }, "PW"), "from-file", "one trailing newline dropped");
  assert.equal(secret({}, "PW"), "");
  assert.throws(() => secret({ PW_FILE: path.join(dir, "missing") }, "PW"), /Could not read PW_FILE/);
});

test("the compose stack's secret files configure the database, storage, sessions and admin", async () => {
  const dir = await secretsDir({
    postgres_password: "pg p@ss",
    minio_root_password: "minio-secret",
    session_secret: "s".repeat(64),
    admin_password: "generated-admin",
    "admin_password.generated": "",
  });
  const config = loadConfig({
    NODE_ENV: "production",
    POSTGRES_HOST: "db",
    POSTGRES_PASSWORD_FILE: path.join(dir, "postgres_password"),
    MINIO_ROOT_PASSWORD_FILE: path.join(dir, "minio_root_password"),
    SESSION_SECRET_FILE: path.join(dir, "session_secret"),
    WADDLE_ADMIN_USER: "admin",
    WADDLE_ADMIN_PASSWORD_FILE: path.join(dir, "admin_password"),
  });
  assert.equal(config.databaseUrl, "postgres://waddle:pg%20p%40ss@db:5432/waddleaboard");
  assert.equal(config.storage.secretKey, "minio-secret");
  assert.equal(config.sessionSecret, "s".repeat(64));
  assert.deepEqual(config.firstAdmin, { username: "admin", password: "generated-admin", generated: true });
});

test("a chosen admin password is never reported as generated", async () => {
  const dir = await secretsDir({ admin_password: "chosen-one", "admin_password.generated": "" });
  const file = path.join(dir, "admin_password");
  assert.equal(loadConfig({ WADDLE_ADMIN_PASSWORD: "typed-in", WADDLE_ADMIN_PASSWORD_FILE: file }).firstAdmin.generated, false);
  const fresh = await secretsDir({ admin_password: "from-env-via-db" });
  assert.equal(loadConfig({ WADDLE_ADMIN_PASSWORD_FILE: path.join(fresh, "admin_password") }).firstAdmin.generated, false);
});
