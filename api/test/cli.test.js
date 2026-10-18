import assert from "node:assert/strict";
import { test } from "node:test";
import { isPasswordHash } from "../src/auth.js";
import { ensureUser, parseArgs } from "../src/cli.js";
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
