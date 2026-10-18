import assert from "node:assert/strict";
import http from "node:http";
import { after, before, beforeEach, describe, test } from "node:test";
import { createApp } from "../src/app.js";
import { hashPassword } from "../src/auth.js";
import { loadConfig } from "../src/config.js";
import { createMemoryStorage, createMemoryStore } from "./fakes.js";
import { JPEG } from "./images.js";

const PHOTO_LIMIT = 64 * 1024;
let server;
let base;
let ctx;

async function setup() {
  const store = createMemoryStore();
  const storage = createMemoryStorage();
  const config = {
    ...loadConfig({ SESSION_SECRET: "test-secret-test-secret-test-secret" }),
    photoMaxBytes: PHOTO_LIMIT,
    loginMaxFailures: 3,
    loginFailureDelayMs: 0,
  };
  const errors = [];
  const app = createApp({ store, storage, config, logger: { error: (...a) => errors.push(a) } });
  await store.createUser({ username: "admin", passwordHash: await hashPassword("admin-password", 4), role: "admin" });
  const owner = await store.createUser({ username: "pat", passwordHash: await hashPassword("owner-password", 4), role: "owner" });
  await store.createDuck({ code: "DP-0427", name: "Sunny", color: "Marigold", ownerId: owner.id });
  return { store, storage, app, errors };
}

async function api(path, { method = "GET", json, body, headers = {}, cookie } = {}) {
  const init = { method, headers: { ...headers } };
  if (cookie) init.headers.cookie = cookie;
  if (json !== undefined) {
    init.headers["content-type"] = "application/json";
    init.body = JSON.stringify(json);
  } else if (body !== undefined) init.body = body;
  const res = await fetch(base + path, init);
  const type = res.headers.get("content-type") || "";
  const data = type.includes("json") ? await res.json() : Buffer.from(await res.arrayBuffer());
  return { res, status: res.status, data };
}

async function login(username, password) {
  const { res, status, data } = await api("/api/auth/login", { method: "POST", json: { username, password } });
  assert.equal(status, 200, JSON.stringify(data));
  return { cookie: res.headers.get("set-cookie").split(";")[0], setCookie: res.headers.get("set-cookie"), data };
}

function findForm(fields, photo) {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.set(k, v);
  if (photo) form.set("photo", new Blob([photo.bytes], { type: photo.type }), photo.name);
  return form;
}

function assertJsonError(result, status) {
  assert.equal(result.status, status);
  assert.equal(typeof result.data.error?.code, "string");
  assert.equal(typeof result.data.error?.message, "string");
  const text = JSON.stringify(result.data);
  assert.doesNotMatch(text, /at .*\.js:\d+|stack/i, "no stack traces");
}

before(async () => {
  server = http.createServer((req, res) => ctx.app.handle(req, res));
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => new Promise((r) => server.close(r)));
beforeEach(async () => {
  ctx = await setup();
});

describe("health", () => {
  test("reports db and storage reachable", async () => {
    const { status, data } = await api("/api/health");
    assert.equal(status, 200);
    assert.deepEqual(data, { status: "ok", db: "ok", storage: "ok" });
  });
  test("returns 503 when a dependency is down", async () => {
    ctx.storage.state.down = true;
    const { status, data } = await api("/api/health");
    assert.equal(status, 503);
    assert.equal(data.storage, "unreachable");
    assert.equal(data.db, "ok");
    assert.equal(data.error.code, "unhealthy");
  });
});

describe("public duck lookup", () => {
  test("finds a duck by any accepted code form", async () => {
    for (const code of ["DP-0427", "dp-0427", "0427"]) {
      const { status, data } = await api(`/api/ducks/${code}`);
      assert.equal(status, 200);
      assert.equal(data.duck.name, "Sunny");
      assert.equal(data.duck.findCount, 0);
      assert.equal(data.duck.id, undefined, "internal id not exposed");
    }
  });
  test("unknown or malformed codes are a JSON 404", async () => {
    assertJsonError(await api("/api/ducks/DP-9999"), 404);
    assertJsonError(await api("/api/ducks/%E0%A4%A"), 404);
    assertJsonError(await api("/api/ducks/DP-9999/finds"), 404);
  });
});

describe("submitting finds", () => {
  test("a JSON find is created pending and hidden until approved", async () => {
    const created = await api("/api/ducks/DP-0427/finds", {
      method: "POST",
      json: { name: "The Parkers", place: "Costa Maya", note: "Hello!", rehidden: "yes" },
    });
    assert.equal(created.status, 201);
    assert.equal(created.data.find.status, "pending");
    assert.equal(created.data.find.photoUrl, null);
    const pub = await api("/api/ducks/DP-0427/finds");
    assert.deepEqual(pub.data.finds, []);
  });

  test("a find with a JPEG photo appears with a loadable photo after approval", async () => {
    const form = findForm({ name: "Maya", place: "Cozumel", spot: "Pool deck", note: "Hi Sunny", rehidden: "no" }, { bytes: JPEG, type: "image/jpeg", name: "duck.jpg" });
    const created = await api("/api/ducks/DP-0427/finds", { method: "POST", body: form });
    assert.equal(created.status, 201, JSON.stringify(created.data));
    const { id, photoUrl } = created.data.find;
    assert.match(photoUrl, /^\/api\/photos\/[0-9a-f-]{36}$/);
    assert.equal(ctx.storage.objects.size, 1);
    const [key, obj] = [...ctx.storage.objects][0];
    assert.match(key, /^finds\/DP-0427\/.+\.jpg$/);
    assert.equal(obj.contentType, "image/jpeg");

    assertJsonError(await api(photoUrl), 404); // not public while pending
    assert.deepEqual((await api("/api/ducks/DP-0427/finds")).data.finds, []);

    const { cookie } = await login("admin", "admin-password");
    const adminView = await api(photoUrl, { cookie });
    assert.equal(adminView.status, 200, "admins can preview pending photos");

    const approved = await api(`/api/admin/finds/${id}/approve`, { method: "POST", cookie });
    assert.equal(approved.status, 200);
    assert.equal(approved.data.find.status, "approved");

    const pub = await api("/api/ducks/DP-0427/finds");
    assert.equal(pub.data.finds.length, 1);
    assert.equal(pub.data.finds[0].finder, "Maya");
    assert.equal(pub.data.finds[0].rehidden, false);
    assert.equal(pub.data.finds[0].photoUrl, photoUrl);
    const photo = await api(photoUrl);
    assert.equal(photo.status, 200);
    assert.equal(photo.res.headers.get("content-type"), "image/jpeg");
    assert.deepEqual(photo.data, JPEG);
    assert.equal((await api("/api/ducks/DP-0427")).data.duck.findCount, 1);
  });

  test("a non-image upload is rejected with a JSON 4xx", async () => {
    const form = findForm({ name: "A", place: "B", note: "C" }, { bytes: Buffer.from("<html>not a photo</html>"), type: "image/jpeg", name: "x.jpg" });
    const r = await api("/api/ducks/DP-0427/finds", { method: "POST", body: form });
    assertJsonError(r, 415);
    assert.equal(r.data.error.code, "unsupported_photo_type");
    assert.equal(ctx.store.db.finds.length, 0);
    assert.equal(ctx.storage.objects.size, 0);
  });

  test("an oversized upload is rejected with a JSON 413", async () => {
    const big = Buffer.concat([JPEG, Buffer.alloc(PHOTO_LIMIT + 10)]);
    const r = await api("/api/ducks/DP-0427/finds", { method: "POST", body: findForm({ name: "A", place: "B", note: "C" }, { bytes: big, type: "image/jpeg", name: "big.jpg" }) });
    assertJsonError(r, 413);
    assert.equal(r.data.error.code, "photo_too_large");
    const huge = Buffer.concat([JPEG, Buffer.alloc(PHOTO_LIMIT + 400 * 1024)]);
    const r2 = await api("/api/ducks/DP-0427/finds", { method: "POST", body: findForm({ name: "A", place: "B", note: "C" }, { bytes: huge, type: "image/jpeg", name: "huge.jpg" }) });
    assertJsonError(r2, 413);
    assert.equal(ctx.store.db.finds.length, 0);
  });

  test("missing required fields are a 400 validation error", async () => {
    const r = await api("/api/ducks/DP-0427/finds", { method: "POST", json: { name: "A", note: "C" } });
    assertJsonError(r, 400);
    assert.equal(r.data.error.code, "validation_failed");
  });

  test("the photo is removed again if saving the find fails", async () => {
    ctx.store.createFind = async () => {
      throw new Error("db exploded at /app/src/store.js:12");
    };
    const r = await api("/api/ducks/DP-0427/finds", { method: "POST", body: findForm({ name: "A", place: "B", note: "C" }, { bytes: JPEG, type: "image/jpeg", name: "a.jpg" }) });
    assertJsonError(r, 500);
    assert.equal(r.data.error.code, "internal_error");
    assert.doesNotMatch(JSON.stringify(r.data), /exploded/);
    assert.equal(ctx.storage.objects.size, 0);
  });
});

describe("auth", () => {
  test("login sets an httpOnly SameSite=Lax cookie and /me reflects it", async () => {
    const { cookie, setCookie, data } = await login("admin", "admin-password");
    assert.match(setCookie, /HttpOnly/);
    assert.match(setCookie, /SameSite=Lax/);
    assert.deepEqual(data.user, { id: 1, username: "admin", displayName: null, role: "admin" });
    assert.equal(data.user.passwordHash, undefined);
    const me = await api("/api/auth/me", { cookie });
    assert.equal(me.data.user.username, "admin");
    const [hash] = ctx.store.db.sessions.keys();
    assert.ok(!cookie.includes(hash), "only the token HMAC is stored");
  });

  test("logout clears the session", async () => {
    const { cookie } = await login("pat", "owner-password");
    const out = await api("/api/auth/logout", { method: "POST", cookie });
    assert.equal(out.status, 200);
    assert.match(out.res.headers.get("set-cookie"), /Max-Age=0/);
    assert.equal((await api("/api/auth/me", { cookie })).data.user, null);
  });

  test("wrong passwords are 401 and repeated failures are throttled with 429", async () => {
    for (let i = 0; i < 3; i++) {
      const r = await api("/api/auth/login", { method: "POST", json: { username: "admin", password: "nope-nope" } });
      assertJsonError(r, 401);
    }
    const blocked = await api("/api/auth/login", { method: "POST", json: { username: "admin", password: "admin-password" } });
    assertJsonError(blocked, 429);
    assert.ok(Number(blocked.res.headers.get("retry-after")) > 0);
    const other = await api("/api/auth/login", { method: "POST", json: { username: "pat", password: "owner-password" } });
    assert.equal(other.status, 200, "other accounts are unaffected");
  });

  test("unknown users get the same 401", async () => {
    const r = await api("/api/auth/login", { method: "POST", json: { username: "ghost", password: "whatever1" } });
    assertJsonError(r, 401);
    assert.equal(r.data.error.code, "invalid_credentials");
  });
});

describe("admin gating", () => {
  const adminRoutes = [
    ["GET", "/api/admin/stats"],
    ["GET", "/api/admin/finds"],
    ["GET", "/api/admin/ducks"],
    ["POST", "/api/admin/finds/1/approve"],
    ["POST", "/api/admin/finds/1/reject"],
    ["POST", "/api/admin/finds/1/flag"],
    ["POST", "/api/admin/ducks"],
    ["POST", "/api/admin/users"],
  ];

  test("admin endpoints return 401 without a session", async () => {
    for (const [method, path] of adminRoutes) {
      const r = await api(path, { method, json: method === "POST" ? {} : undefined });
      assertJsonError(r, 401);
    }
  });

  test("admin endpoints return 403 for an owner session", async () => {
    const { cookie } = await login("pat", "owner-password");
    for (const [method, path] of adminRoutes) {
      const r = await api(path, { method, cookie, json: method === "POST" ? {} : undefined });
      assertJsonError(r, 403);
    }
  });

  test("a forged cookie is treated as no session", async () => {
    assertJsonError(await api("/api/admin/stats", { cookie: "wa_session=forged" }), 401);
  });
});

describe("admin moderation and provisioning", () => {
  test("queue lists open finds, and reject/flag update status", async () => {
    for (const name of ["One", "Two", "Three"]) {
      await api("/api/ducks/DP-0427/finds", { method: "POST", json: { name, place: "Nassau", note: "hi" } });
    }
    const { cookie } = await login("admin", "admin-password");
    let queue = await api("/api/admin/finds", { cookie });
    assert.equal(queue.data.finds.length, 3);
    assert.deepEqual(queue.data.finds[0].duck, { code: "DP-0427", name: "Sunny" });

    assert.equal((await api("/api/admin/finds/1/reject", { method: "POST", cookie })).data.find.status, "rejected");
    assert.equal((await api("/api/admin/finds/2/flag", { method: "POST", cookie })).data.find.status, "flagged");
    queue = await api("/api/admin/finds", { cookie });
    assert.deepEqual(queue.data.finds.map((f) => f.status).sort(), ["flagged", "pending"]);
    assert.equal((await api("/api/admin/finds?status=flagged", { cookie })).data.finds.length, 1);
    assertJsonError(await api("/api/admin/finds?status=bogus", { cookie }), 400);
    assertJsonError(await api("/api/admin/finds/999/approve", { method: "POST", cookie }), 404);
    assertJsonError(await api("/api/admin/finds/abc/approve", { method: "POST", cookie }), 404);

    const stats = await api("/api/admin/stats", { cookie });
    assert.equal(stats.data.stats.needsReview, 2);
    assert.equal(stats.data.stats.flagged, 1);
    assert.equal(stats.data.stats.activeDucks, 1);
    assert.deepEqual((await api("/api/ducks/DP-0427/finds")).data.finds, [], "rejected and flagged stay hidden");
  });

  test("admin can create ducks (with owner) and owner accounts", async () => {
    const { cookie } = await login("admin", "admin-password");
    const created = await api("/api/admin/ducks", { method: "POST", cookie, json: { code: "dp-2001", name: "Pip", color: "Coral", owner: "pat" } });
    assert.equal(created.status, 201, JSON.stringify(created.data));
    assert.equal(created.data.duck.code, "DP-2001");
    assert.equal(created.data.duck.accent, "coral");
    assert.equal(created.data.duck.owner, "pat");
    assertJsonError(await api("/api/admin/ducks", { method: "POST", cookie, json: { code: "DP-2001", name: "Pip", color: "Coral" } }), 409);
    assertJsonError(await api("/api/admin/ducks", { method: "POST", cookie, json: { code: "DP-2002", name: "Pip", color: "Coral", owner: "nobody" } }), 400);
    assertJsonError(await api("/api/admin/ducks", { method: "POST", cookie, json: { code: "bad", name: "Pip", color: "Coral" } }), 400);
    assert.equal((await api("/api/admin/ducks", { cookie })).data.ducks.length, 2);

    const user = await api("/api/admin/users", { method: "POST", cookie, json: { username: "robin", password: "robin-password" } });
    assert.equal(user.status, 201);
    assert.equal(user.data.user.role, "owner");
    assertJsonError(await api("/api/admin/users", { method: "POST", cookie, json: { username: "ROBIN", password: "robin-password" } }), 409);
    await login("robin", "robin-password");
  });
});

describe("my flock", () => {
  test("requires a session and lists only the owner's ducks", async () => {
    assertJsonError(await api("/api/my/ducks"), 401);
    await ctx.store.createDuck({ code: "DP-0912", name: "Coral", color: "Coral" });
    const { cookie } = await login("pat", "owner-password");
    const r = await api("/api/my/ducks", { cookie });
    assert.equal(r.status, 200);
    assert.deepEqual(r.data.ducks.map((d) => d.code), ["DP-0427"]);
  });
});

describe("error handling", () => {
  test("malformed JSON is a 400 JSON error without a stack trace", async () => {
    const r = await api("/api/auth/login", { method: "POST", body: "{not json", headers: { "content-type": "application/json" } });
    assertJsonError(r, 400);
    assert.equal(r.data.error.code, "invalid_json");
    const arr = await api("/api/auth/login", { method: "POST", body: "[1,2]", headers: { "content-type": "application/json" } });
    assertJsonError(arr, 400);
  });

  test("non-JSON bodies on JSON endpoints are 415", async () => {
    const r = await api("/api/auth/login", { method: "POST", body: "username=a", headers: { "content-type": "application/x-www-form-urlencoded" } });
    assertJsonError(r, 415);
  });

  test("unknown routes and wrong methods are JSON errors", async () => {
    const r = await api("/api/nope");
    assertJsonError(r, 404);
    assert.equal(r.data.error.code, "route_not_found");
    assertJsonError(await api("/api/health", { method: "DELETE" }), 405);
  });

  test("unexpected errors are a generic 500", async () => {
    ctx.store.publicStats = async () => {
      throw new TypeError("Cannot read properties of undefined (reading 'x')");
    };
    const r = await api("/api/stats");
    assertJsonError(r, 500);
    assert.equal(r.data.error.message, "Something went wrong on our side.");
    assert.equal(ctx.errors.length, 1, "logged server-side");
  });
});
