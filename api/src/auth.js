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

// A real bcrypt hash at the same cost as real passwords, so a login for a username that does
// not exist takes as long as one that does. Made on first use rather than at startup.
let dummyHash;
export function burnPasswordCheck(password) {
  dummyHash ??= bcrypt.hash("waddle-aboard-dummy-password", BCRYPT_COST);
  return dummyHash.then((hash) => bcrypt.compare(password, hash));
}

export function newSessionToken() {
  return randomBytes(32).toString("base64url");
}

// Only an HMAC of the token is stored, so a database leak does not expose live sessions.
export function sessionTokenHash(token, secret) {
  return createHmac("sha256", secret).update(token).digest("hex");
}

// Counts failed logins per key inside a sliding window. A key is any string; the login route
// uses one per client address + username, one per address and one per username, each with its
// own limit (see loginKeys).
export class LoginThrottle {
  constructor({ maxFailures = 5, windowMs = 15 * 60 * 1000, now = () => Date.now(), maxKeys = 10000 } = {}) {
    this.maxFailures = maxFailures;
    this.windowMs = windowMs;
    this.now = now;
    this.maxKeys = maxKeys;
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
  retryAfter(key, limit = this.maxFailures) {
    const list = this.#recent(key);
    if (list.length < limit) return 0;
    return Math.max(1, Math.ceil((list[list.length - limit] + this.windowMs - this.now()) / 1000));
  }

  // Records an attempt and returns its timestamp, which forget() takes back.
  fail(key) {
    const list = this.#recent(key);
    const stamp = this.now();
    list.push(stamp);
    this.failures.set(key, list);
    if (this.failures.size > this.maxKeys) this.#prune();
    return stamp;
  }

  forget(key, stamp) {
    const list = this.failures.get(key);
    const at = list ? list.indexOf(stamp) : -1;
    if (at < 0) return;
    list.splice(at, 1);
    if (!list.length) this.failures.delete(key);
  }

  reset(key) {
    this.failures.delete(key);
  }

  // Over the cap: drop expired keys first. Only if every key is live is the oldest one dropped,
  // and the per-address limit means one address cannot fill the map to push its own key out.
  #prune() {
    for (const key of [...this.failures.keys()]) this.#recent(key);
    while (this.failures.size > this.maxKeys) this.failures.delete(this.failures.keys().next().value);
  }
}

// The keys and limits a login attempt counts against: a few tries per address and username,
// more per address across usernames (guessing many accounts), and more again per username
// across addresses (one account guessed from many places).
export function loginKeys(ip, username, maxFailures) {
  const name = username.toLowerCase();
  return [
    { key: `pair|${ip}|${name}`, limit: maxFailures },
    { key: `ip|${ip}`, limit: maxFailures * 4 },
    { key: `user|${name}`, limit: maxFailures * 10 },
  ];
}
