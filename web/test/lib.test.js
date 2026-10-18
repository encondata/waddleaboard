import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ApiError,
  createApiClient,
  duckImage,
  formatDate,
  formatNumber,
  initials,
  isDuckCode,
  matchRoute,
  normalizeDuckCode,
  serialLabel,
  serialRange,
  slugify,
  statusLine,
  timeAgo,
  typePath,
} from "../src/lib.js";

test("matchRoute keeps the sample routes and matches any duck code", () => {
  assert.deepEqual(matchRoute("/"), { name: "home", params: {} });
  assert.equal(matchRoute("/how-it-works").name, "how");
  assert.equal(matchRoute("/my-flock").name, "flock");
  assert.equal(matchRoute("/my-flock/").name, "flock");
  assert.equal(matchRoute("/admin").name, "admin");
  assert.equal(matchRoute("/login").name, "login");
  assert.deepEqual(matchRoute("/duck/DP-0427"), { name: "duck", params: { code: "DP-0427" } });
  assert.deepEqual(matchRoute("/duck/DP-9999"), { name: "duck", params: { code: "DP-9999" } });
  assert.deepEqual(matchRoute("/duck/dp%200427"), { name: "duck", params: { code: "dp 0427" } });
  assert.equal(matchRoute("/duck/%E0%A4%A").name, "duck");
  assert.equal(matchRoute("/duck").name, "notFound");
  assert.equal(matchRoute("/duck/DP-0427/extra").name, "notFound");
  assert.equal(matchRoute("/no-such-page").name, "notFound");
});

test("matchRoute resolves type pages by slug", () => {
  assert.deepEqual(matchRoute("/types/sunny"), { name: "type", params: { slug: "sunny" } });
  assert.deepEqual(matchRoute("/types/sunny-2/"), { name: "type", params: { slug: "sunny-2" } });
  assert.equal(matchRoute("/types").name, "notFound");
  assert.equal(matchRoute("/types/Sunny").name, "notFound");
  assert.equal(matchRoute("/types/sunny/extra").name, "notFound");
  assert.equal(typePath("sunny"), "/types/sunny");
  assert.equal(matchRoute(typePath("coral")).params.slug, "coral");
});

test("serial labels name the design and the individual's serial", () => {
  assert.equal(serialLabel({ code: "DP-0427", serial: "DP-0427", name: "Sunny", type: { slug: "sunny", name: "Sunny" } }), "Sunny · Serial DP-0427");
  assert.equal(serialLabel({ code: "DP-0431", name: "Pip", type: { name: "Sunny" } }), "Sunny · Serial DP-0431", "type name wins");
  assert.equal(serialLabel({ code: "DP-0500", name: "Pip" }), "Pip · Serial DP-0500");
  assert.equal(serialLabel({ code: "DP-0500" }), "Serial DP-0500");
  assert.equal(serialRange(["DP-0429", "DP-0430", "DP-0431"]), "DP-0429 – DP-0431");
  assert.equal(serialRange(["DP-0429"]), "DP-0429");
  assert.equal(serialRange([]), "");
});

test("slugify prefills type slugs the API accepts", () => {
  assert.equal(slugify("Sunny"), "sunny");
  assert.equal(slugify("Captain Quack Jr."), "captain-quack-jr");
  assert.equal(slugify("!"), "");
  assert.match(slugify("Ünïcode Duck 2"), /^[a-z0-9-]{2,40}$/);
});

test("duck codes normalize the same way as the API", () => {
  assert.equal(normalizeDuckCode(" dp 0427"), "DP-0427");
  assert.equal(normalizeDuckCode("427"), "DP-0427");
  assert.equal(normalizeDuckCode("DP0427"), "DP-0427");
  assert.ok(isDuckCode("DP-0427"));
  assert.ok(!isDuckCode("SUNNY"));
});

test("formatting helpers", () => {
  assert.equal(formatDate("2026-10-12T18:00:00Z"), "October 12, 2026");
  assert.equal(formatDate("garbage"), "");
  assert.equal(formatNumber(18492), "18,492");
  assert.equal(formatNumber(undefined), "—");
  assert.equal(initials("Jamie Duckworth"), "JD");
  assert.equal(initials("admin"), "A");
  assert.equal(initials("first.mate"), "FM");
  const now = Date.parse("2026-10-18T12:00:00Z");
  assert.equal(timeAgo("2026-10-18T11:48:00Z", now), "12 min ago");
  assert.equal(timeAgo("2026-10-18T10:00:00Z", now), "2 hr ago");
  assert.equal(timeAgo("2026-10-16T12:00:00Z", now), "2 days ago");
  assert.equal(timeAgo("2026-10-18T11:59:50Z", now), "just now");
  assert.equal(statusLine("Sailing"), "Currently sailing");
  assert.equal(statusLine("Adopted"), "Home with a finder");
});

test("duckImage uses the duck's image or the sample artwork for its accent", () => {
  assert.equal(duckImage({ imageUrl: "/x.png", accent: "mint" }), "/x.png");
  assert.equal(duckImage({ accent: "coral" }), "/assets/duckport/coral-portrait.png");
  assert.equal(duckImage({}), "/assets/duckport/sunny-hero.png");
});

test("api client sends JSON and surfaces { error } bodies as ApiError", async () => {
  const calls = [];
  const fakeFetch = async (url, init) => {
    calls.push([url, init]);
    if (url.endsWith("/missing")) {
      return new Response(JSON.stringify({ error: { code: "duck_not_found", message: "No duck has that code." } }), { status: 404, headers: { "content-type": "application/json" } });
    }
    if (url.endsWith("/html")) return new Response("<html>bad gateway</html>", { status: 502 });
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json" } });
  };
  const request = createApiClient(fakeFetch);
  assert.deepEqual(await request("/api/x", { method: "POST", json: { a: 1 } }), { ok: true });
  assert.equal(calls[0][1].headers["Content-Type"], "application/json");
  assert.equal(calls[0][1].body, '{"a":1}');
  assert.equal(calls[0][1].credentials, "same-origin");
  await assert.rejects(request("/missing"), (err) => err instanceof ApiError && err.status === 404 && err.code === "duck_not_found");
  await assert.rejects(request("/html"), (err) => err.status === 502 && /502/.test(err.message));
  const offline = createApiClient(async () => { throw new TypeError("fetch failed"); });
  await assert.rejects(offline("/api/x"), (err) => err.code === "network_error");
});
