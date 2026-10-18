// Password hashing, session tokens and login throttling.
import { createHmac, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";

export const SESSION_COOKIE = "wa_session";
const BCRYPT_COST = 12;

export function hashPassword(password, cost = BCRYPT_COST) {
  return bcrypt.hash(password, cost);
}

export function verifyPassword(password, hash) {
  if (!hash) return Promise.resolve(false);
  return bcrypt.compare(password, hash);
}

export function isPasswordHash(value) {
  return /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(String(value));
}

// A real bcrypt hash used to keep timing similar when the username does not exist.
const DUMMY_HASH = bcrypt.hashSync("waddle-aboard-dummy-password", 4);
export function burnPasswordCheck(password) {
  return bcrypt.compare(password, DUMMY_HASH);
}

export function newSessionToken() {
  return randomBytes(32).toString("base64url");
}

// Only an HMAC of the token is stored, so a database leak does not expose live sessions.
export function sessionTokenHash(token, secret) {
  return createHmac("sha256", secret).update(token).digest("hex");
}

// Counts failed logins per key (ip + username) inside a sliding window.
export class LoginThrottle {
  constructor({ maxFailures = 5, windowMs = 15 * 60 * 1000, now = () => Date.now() } = {}) {
    this.maxFailures = maxFailures;
    this.windowMs = windowMs;
    this.now = now;
    this.failures = new Map();
  }

  #recent(key) {
    const cutoff = this.now() - this.windowMs;
    const list = (this.failures.get(key) || []).filter((t) => t > cutoff);
    if (list.length) this.failures.set(key, list);
    else this.failures.delete(key);
    return list;
  }

  // Returns seconds until the key may try again, or 0 when allowed.
  retryAfter(key) {
    const list = this.#recent(key);
    if (list.length < this.maxFailures) return 0;
    return Math.max(1, Math.ceil((list[0] + this.windowMs - this.now()) / 1000));
  }

  fail(key) {
    const list = this.#recent(key);
    list.push(this.now());
    this.failures.set(key, list);
    if (this.failures.size > 10000) {
      const oldest = this.failures.keys().next().value;
      this.failures.delete(oldest);
    }
    return list.length;
  }

  reset(key) {
    this.failures.delete(key);
  }
}
