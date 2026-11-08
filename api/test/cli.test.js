import assert from "node:assert/strict";
import { test } from "node:test";
import { isPasswordHash } from "../src/auth.js";
import { ensureUser, parseArgs } from "../src/cli.js";
import { loadConfig } from "../src/config.js";
import { ensureFirstAdmin } from "../src/users.js";
import { createMemoryStore } from "./fakes.js";

test("parseArgs reads the command and flags", () => {
  assert.deepEqual(parseArgs(["create-admin", "--username", "admin"]), { command: "create-admin", flags: { username: "admin" } });
  assert.deepEqual(parseArgs(["create-user", "--username=pat", "--role", "owner"]), {
    command: "create-user",
    flags: { username: "pat", role: "owner" },
  });
});

test("ensureUser creates the admin once and is idempotent on re-run", async () => {
  const store = createMemoryStore();
  assert.equal(await ensureUser(store, { username: "admin", password: "seaworthy1", role: "admin" }), "created");
  assert.equal(await ensureUser(store, { username: "admin", password: "different-pw", role: "admin" }), "exists");
  assert.equal(store.db.users.length, 1);
  assert.ok(isPasswordHash(store.db.users[0].passwordHash));
  assert.equal(await ensureUser(store, { username: "ADMIN", password: "seaworthy1", role: "owner" }), "exists-with-other-role");
  await assert.rejects(ensureUser(store, { username: "admin2", password: "short", role: "admin" }), /at least 8/);
});

test("ensureFirstAdmin creates the configured admin only while there is none", async () => {
  const store = createMemoryStore();
  assert.equal(await ensureFirstAdmin(store, { username: "", password: "" }), "not-configured");
  assert.equal(await ensureFirstAdmin(store, { username: "captain", password: "seaworthy1" }), "created");
  assert.equal(store.db.users[0].role, "admin");
  assert.equal(await ensureFirstAdmin(store, { username: "someone-else", password: "seaworthy2" }), "admin-exists");
  assert.equal(store.db.users.length, 1);

  const withOwner = createMemoryStore();
  await ensureUser(withOwner, { username: "pat", password: "owner-password", role: "owner" });
  assert.equal(await ensureFirstAdmin(withOwner, { username: "pat", password: "seaworthy1" }), "exists-with-other-role");
  await assert.rejects(ensureFirstAdmin(createMemoryStore(), { username: "captain", password: "short" }), /at least 8/);
});

test("the first administrator comes from WADDLE_ADMIN_USER and WADDLE_ADMIN_PASSWORD", () => {
  assert.deepEqual(loadConfig({ WADDLE_ADMIN_USER: " captain ", WADDLE_ADMIN_PASSWORD: "seaworthy1" }).firstAdmin, {
    username: "captain",
    password: "seaworthy1",
  });
  assert.deepEqual(loadConfig({}).firstAdmin, { username: "", password: "" });
});
