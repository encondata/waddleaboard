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
    ["POST", "/api/admin/duck-types"],
    ["POST", "/api/admin/duck-types/sunny/ducks"],
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

describe("duck types and individuals", () => {
  const sunny = () => ctx.store.findDuckTypeBySlug("sunny");

  test("duck JSON carries serial and type, with design inherited from the type", async () => {
    const type = await sunny();
    assert.ok(type, "the setup duck was given a sunny type");
    await ctx.store.createDuck({ code: "DP-0430", typeId: type.id, name: "Sunny" });
    const { status, data } = await api("/api/ducks/DP-0430");
    assert.equal(status, 200);
    assert.equal(data.duck.serial, "DP-0430");
    assert.equal(data.duck.code, "DP-0430");
    assert.equal(data.duck.type.slug, "sunny");
    assert.equal(data.duck.type.name, "Sunny");
    assert.equal(data.duck.color, "Marigold", "color falls back to the type");
    assert.equal(data.duck.accent, "gold");
    for (const key of ["name", "status", "story", "homePort", "ship", "miles", "imageUrl", "launchedAt", "lastSeen", "findCount"]) {
      assert.ok(key in data.duck, `${key} still present`);
    }
  });

  test("a duck's own design overrides its type", async () => {
    const type = await sunny();
    await ctx.store.createDuck({ code: "DP-0431", typeId: type.id, name: "Pip", color: "Coral", accent: "coral", imageUrl: "/x.png", story: "Mine." });
    const { data } = await api("/api/ducks/DP-0431");
    assert.equal(data.duck.name, "Pip");
    assert.equal(data.duck.color, "Coral");
    assert.equal(data.duck.accent, "coral");
    assert.equal(data.duck.imageUrl, "/x.png");
    assert.equal(data.duck.story, "Mine.");
    assert.equal(data.duck.type.color, "Marigold");
  });

  test("individuals of one type keep separate guest books, status and counts", async () => {
    const type = await sunny();
    await ctx.store.createDuck({ code: "DP-0428", typeId: type.id, name: "Sunny" });
    const sent = await api("/api/ducks/DP-0428/finds", { method: "POST", json: { name: "Maya", place: "Cozumel, Mexico", note: "Hi", rehidden: "yes" } });
    const { cookie } = await login("admin", "admin-password");
    assert.equal((await api(`/api/admin/finds/${sent.data.find.id}/approve`, { method: "POST", cookie })).status, 200);

    const found = (await api("/api/ducks/DP-0428")).data.duck;
    const other = (await api("/api/ducks/DP-0427")).data.duck;
    assert.deepEqual([found.findCount, found.lastSeen, found.status], [1, "Cozumel, Mexico", "Rehidden"]);
    assert.deepEqual([other.findCount, other.lastSeen, other.status], [0, null, "Sailing"]);
    assert.equal((await api("/api/ducks/DP-0427/finds")).data.finds.length, 0);

    const listed = await api("/api/duck-types/sunny");
    assert.equal(listed.status, 200);
    assert.deepEqual(listed.data.ducks.map((d) => [d.serial, d.findCount]), [["DP-0427", 0], ["DP-0428", 1]]);
    assert.equal(listed.data.type.duckCount, 2);
    assert.equal(listed.data.type.findCount, 1, "type-level total");
    assert.equal(listed.data.ducks[0].id, undefined, "public fields only");
    assert.equal(listed.data.ducks[0].ownerId, undefined);

    const all = await api("/api/duck-types");
    assert.equal(all.status, 200);
    const row = all.data.types.find((t) => t.slug === "sunny");
    assert.deepEqual([row.duckCount, row.findCount], [2, 1]);
    assertJsonError(await api("/api/duck-types/nope"), 404);
    assert.equal((await api("/api/duck-types/nope")).data.error.code, "duck_type_not_found");
    assertJsonError(await api("/api/duck-types/BAD%20SLUG"), 404);
  });

  test("individuals of a type are listed in serial order", async () => {
    const type = await sunny();
    for (const code of ["DP-10000", "DP-0999", "AB-0001"]) await ctx.store.createDuck({ code, typeId: type.id, name: "Sunny" });
    const { data } = await api("/api/duck-types/sunny");
    assert.deepEqual(data.ducks.map((d) => d.serial), ["AB-0001", "DP-0427", "DP-0999", "DP-10000"]);
  });

  test("admins create types; duplicates, bad slugs and non-admins are rejected", async () => {
    const body = { slug: "coral", name: "Coral", color: "Coral" };
    assertJsonError(await api("/api/admin/duck-types", { method: "POST", json: body }), 401);
    const owner = await login("pat", "owner-password");
    assertJsonError(await api("/api/admin/duck-types", { method: "POST", cookie: owner.cookie, json: body }), 403);

    const { cookie } = await login("admin", "admin-password");
    const created = await api("/api/admin/duck-types", { method: "POST", cookie, json: body });
    assert.equal(created.status, 201, JSON.stringify(created.data));
    assert.deepEqual(
      { slug: created.data.type.slug, name: created.data.type.name, color: created.data.type.color, accent: created.data.type.accent },
      { slug: "coral", name: "Coral", color: "Coral", accent: "coral" },
    );
    const dup = await api("/api/admin/duck-types", { method: "POST", cookie, json: body });
    assertJsonError(dup, 409);
    assert.equal(dup.data.error.code, "duck_type_exists");
    for (const slug of ["Coral", "c", "has space", "x".repeat(41), "", undefined, 42]) {
      const bad = await api("/api/admin/duck-types", { method: "POST", cookie, json: { ...body, slug } });
      assertJsonError(bad, 400);
      assert.equal(bad.data.error.code, "validation_failed", `slug ${slug}`);
    }
  });

  test("batch registration allocates the next consecutive serials", async () => {
    const type = await sunny();
    await ctx.store.createDuck({ code: "DP-0428", typeId: type.id, name: "Sunny" });
    const { cookie } = await login("admin", "admin-password");
    const r = await api("/api/admin/duck-types/sunny/ducks", { method: "POST", cookie, json: { count: 3 } });
    assert.equal(r.status, 201, JSON.stringify(r.data));
    assert.deepEqual(r.data.serials, ["DP-0429", "DP-0430", "DP-0431"]);
    for (const duck of r.data.ducks) {
      assert.equal(duck.type.slug, "sunny");
      assert.equal(duck.name, "Sunny");
      assert.equal(duck.color, "Marigold");
      assert.equal(duck.status, "Sailing");
    }
    assert.equal((await api("/api/ducks/DP-0431")).data.duck.type.slug, "sunny");

    const owned = await api("/api/admin/duck-types/sunny/ducks", { method: "POST", cookie, json: { count: 2, prefix: "wa", owner: "pat" } });
    assert.equal(owned.status, 201, JSON.stringify(owned.data));
    assert.deepEqual(owned.data.serials, ["WA-0001", "WA-0002"]);
    const pat = await login("pat", "owner-password");
    assert.deepEqual((await api("/api/my/ducks", { cookie: pat.cookie })).data.ducks.map((d) => d.code), ["DP-0427", "WA-0001", "WA-0002"]);
  });

  test("batch registration validates count, type and owner", async () => {
    const { cookie } = await login("admin", "admin-password");
    const before = ctx.store.db.ducks.length;
    for (const count of [0, 101, 2.5, "three", null, undefined]) {
      const r = await api("/api/admin/duck-types/sunny/ducks", { method: "POST", cookie, json: { count } });
      assertJsonError(r, 400);
      assert.equal(r.data.error.code, "validation_failed", `count ${count}`);
    }
    assertJsonError(await api("/api/admin/duck-types/sunny/ducks", { method: "POST", cookie, json: { count: 1, prefix: "D1" } }), 400);
    const missing = await api("/api/admin/duck-types/nope/ducks", { method: "POST", cookie, json: { count: 1 } });
    assertJsonError(missing, 404);
    assert.equal(missing.data.error.code, "duck_type_not_found");
    const owner = await api("/api/admin/duck-types/sunny/ducks", { method: "POST", cookie, json: { count: 1, owner: "nobody" } });
    assertJsonError(owner, 400);
    assert.equal(owner.data.error.code, "unknown_owner");
    assert.equal(ctx.store.db.ducks.length, before, "nothing created");
  });

  test("single create without a type still works and finds or creates a matching type", async () => {
    const { cookie } = await login("admin", "admin-password");
    const same = await api("/api/admin/ducks", { method: "POST", cookie, json: { code: "DP-2001", name: "sunny", color: "marigold" } });
    assert.equal(same.status, 201, JSON.stringify(same.data));
    assert.equal(same.data.duck.type.slug, "sunny", "matched case-insensitively");
    const fresh = await api("/api/admin/ducks", { method: "POST", cookie, json: { code: "DP-2002", name: "Sunny", color: "Blue" } });
    assert.equal(fresh.status, 201);
    assert.equal(fresh.data.duck.type.slug, "sunny-2", "slug suffix on collision");
    assert.equal(fresh.data.duck.accent, "blue");
  });

  test("single create with a type inherits name and color", async () => {
    const { cookie } = await login("admin", "admin-password");
    const r = await api("/api/admin/ducks", { method: "POST", cookie, json: { code: "DP-0500", type: "sunny" } });
    assert.equal(r.status, 201, JSON.stringify(r.data));
    assert.equal(r.data.duck.name, "Sunny");
    assert.equal(r.data.duck.color, "Marigold");
    assert.equal(r.data.duck.type.slug, "sunny");
    const named = await api("/api/admin/ducks", { method: "POST", cookie, json: { code: "DP-0501", type: "sunny", name: "Pip" } });
    assert.equal(named.data.duck.name, "Pip");
    const unknown = await api("/api/admin/ducks", { method: "POST", cookie, json: { code: "DP-0502", type: "nope" } });
    assertJsonError(unknown, 400);
    assert.equal(unknown.data.error.code, "unknown_type");
    assertJsonError(await api("/api/admin/ducks", { method: "POST", cookie, json: { code: "DP-0503" } }), 400);

    const list = await api("/api/admin/ducks", { cookie });
    const row = list.data.ducks.find((d) => d.code === "DP-0500");
    assert.deepEqual([row.type.slug, row.type.name], ["sunny", "Sunny"]);
  });

  test("stats still count individuals", async () => {
    const { cookie } = await login("admin", "admin-password");
    await api("/api/admin/duck-types/sunny/ducks", { method: "POST", cookie, json: { count: 2 } });
    assert.equal((await api("/api/stats")).data.stats.ducks, 3);
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
    assert.equal(r.data.ducks[0].type.name, "Sunny");
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
