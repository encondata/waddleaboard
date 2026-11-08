import assert from "node:assert/strict";
import { test } from "node:test";
import { LoginThrottle, burnPasswordCheck, hashPassword, loginKeys, isPasswordHash, newSessionToken, sessionTokenHash, verifyPassword } from "../src/auth.js";
import { parseCookies, serializeCookie } from "../src/http.js";

test("passwords are stored as bcrypt hashes and verify correctly", async () => {
  const hash = await hashPassword("correct horse", 4);
  assert.ok(isPasswordHash(hash), "looks like bcrypt");
  assert.ok(!hash.includes("correct horse"));
  assert.equal(await verifyPassword("correct horse", hash), true);
  assert.equal(await verifyPassword("wrong horse", hash), false);
  assert.equal(await verifyPassword("anything", null), false);
});

test("session tokens are random and only their HMAC is stored", () => {
  const a = newSessionToken();
  const b = newSessionToken();
  assert.notEqual(a, b);
  assert.ok(a.length >= 40);
  const h = sessionTokenHash(a, "secret-one");
  assert.match(h, /^[0-9a-f]{64}$/);
  assert.notEqual(h, sessionTokenHash(a, "secret-two"));
});

test("cookies are httpOnly and SameSite=Lax", () => {
  const c = serializeCookie("wa_session", "abc", { maxAge: 60 });
  assert.match(c, /HttpOnly/);
  assert.match(c, /SameSite=Lax/);
  assert.match(c, /Max-Age=60/);
  assert.doesNotMatch(c, /Secure/);
  assert.match(serializeCookie("x", "y", { secure: true }), /Secure/);
  assert.deepEqual(parseCookies("a=1; wa_session=abc%3D; b"), { a: "1", wa_session: "abc=" });
});

test("LoginThrottle blocks after max failures and recovers after the window", () => {
  let t = 1_000_000;
  const throttle = new LoginThrottle({ maxFailures: 3, windowMs: 60_000, now: () => t });
  assert.equal(throttle.retryAfter("k"), 0);
  throttle.fail("k");
  throttle.fail("k");
  assert.equal(throttle.retryAfter("k"), 0);
  throttle.fail("k");
  assert.equal(throttle.retryAfter("k"), 60);
  assert.equal(throttle.retryAfter("other"), 0);
  t += 61_000;
  assert.equal(throttle.retryAfter("k"), 0);
  throttle.fail("k");
  throttle.reset("k");
  assert.equal(throttle.retryAfter("k"), 0);
});

test("LoginThrottle takes back a recorded attempt and honours per-key limits", () => {
  let t = 1_000_000;
  const throttle = new LoginThrottle({ maxFailures: 2, windowMs: 60_000, now: () => t });
  const stamp = throttle.fail("k");
  throttle.forget("k", stamp);
  assert.equal(throttle.failures.has("k"), false);
  for (let i = 0; i < 5; i++) throttle.fail("k");
  assert.equal(throttle.retryAfter("k", 10), 0, "under a higher limit");
  assert.ok(throttle.retryAfter("k", 5) > 0);
});

test("LoginThrottle drops expired keys before live ones when full", () => {
  let t = 1_000_000;
  const throttle = new LoginThrottle({ maxFailures: 5, windowMs: 60_000, now: () => t, maxKeys: 2 });
  throttle.fail("old-a");
  throttle.fail("old-b");
  t += 61_000;
  throttle.fail("live-a");
  throttle.fail("live-b");
  throttle.fail("live-b");
  assert.deepEqual([...throttle.failures.keys()].sort(), ["live-a", "live-b"]);
});

test("loginKeys counts per address + name, per address and per name", () => {
  assert.deepEqual(loginKeys("1.2.3.4", "Admin", 5), [
    { key: "pair|1.2.3.4|admin", limit: 5 },
    { key: "ip|1.2.3.4", limit: 20 },
    { key: "user|admin", limit: 50 },
  ]);
});

test("the stand-in check for unknown users costs as much as a real one", async () => {
  assert.equal(await burnPasswordCheck("anything"), false);
  const started = performance.now();
  await burnPasswordCheck("anything");
  const burn = performance.now() - started;
  const real = await hashPassword("x".repeat(10));
  const started2 = performance.now();
  await verifyPassword("anything", real);
  const check = performance.now() - started2;
  assert.ok(burn > check * 0.5, `burn ${burn.toFixed(0)}ms vs real ${check.toFixed(0)}ms`);
});
