import assert from "node:assert/strict";
import { test } from "node:test";
import { LoginThrottle, hashPassword, isPasswordHash, newSessionToken, sessionTokenHash, verifyPassword } from "../src/auth.js";
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
