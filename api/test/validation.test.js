import assert from "node:assert/strict";
import { test } from "node:test";
import {
  accentForColor,
  normalizeDuckCode,
  sniffImage,
  nextSerials,
  slugify,
  validateDuck,
  validateDuckBatch,
  validateDuckType,
  validateFind,
  validateNewUser,
  validatePhoto,
} from "../src/validation.js";
import { HttpError } from "../src/http.js";
import { JPEG, PNG, WEBP } from "./images.js";

test("normalizeDuckCode accepts the forms finders type", () => {
  assert.equal(normalizeDuckCode("dp-0427"), "DP-0427");
  assert.equal(normalizeDuckCode(" DP 0427 "), "DP-0427");
  assert.equal(normalizeDuckCode("dp0427"), "DP-0427");
  assert.equal(normalizeDuckCode("427"), "DP-0427");
  assert.equal(normalizeDuckCode("sunny"), "SUNNY");
});

test("validateFind requires name, place and note and trims input", () => {
  const ok = validateFind({ name: " The Parkers ", place: "Nassau", note: "Hi!", rehidden: "no" });
  assert.deepEqual(ok, { finderName: "The Parkers", place: "Nassau", spot: "", note: "Hi!", rehidden: false });
  for (const missing of ["name", "place", "note"]) {
    const fields = { name: "a", place: "b", note: "c" };
    delete fields[missing];
    assert.throws(() => validateFind(fields), (err) => err instanceof HttpError && err.status === 400);
  }
  assert.throws(() => validateFind({ name: "a", place: "b", note: "x".repeat(1001) }), /1000 characters/);
  assert.throws(() => validateFind({ name: "a", place: "b", note: "c", rehidden: "maybe" }), /yes or no/);
  assert.throws(() => validateFind({ name: 5, place: "b", note: "c" }), /must be text/);
});

test("sniffImage detects JPEG, PNG and WebP by magic bytes only", () => {
  assert.equal(sniffImage(JPEG), "image/jpeg");
  assert.equal(sniffImage(PNG), "image/png");
  assert.equal(sniffImage(WEBP), "image/webp");
  assert.equal(sniffImage(Buffer.from("GIF89a....")), null);
  assert.equal(sniffImage(Buffer.from("<svg></svg>")), null);
});

test("validatePhoto enforces size and type", () => {
  assert.deepEqual(validatePhoto(JPEG, 1024), { contentType: "image/jpeg", ext: "jpg", size: JPEG.length });
  assert.throws(() => validatePhoto(JPEG, 4), (err) => err.status === 413 && err.code === "photo_too_large");
  assert.throws(() => validatePhoto(Buffer.from("hello world"), 1024), (err) => err.status === 415);
  assert.throws(() => validatePhoto(Buffer.alloc(0), 1024), (err) => err.status === 400);
});

test("validateDuck normalizes the code and derives an accent", () => {
  const duck = validateDuck({ code: "dp-2001", name: "Pip", color: "Seafoam green", miles: "12" });
  assert.equal(duck.code, "DP-2001");
  assert.equal(duck.accent, "mint");
  assert.equal(duck.status, "Sailing");
  assert.equal(duck.miles, 12);
  assert.throws(() => validateDuck({ code: "nope", name: "Pip", color: "Blue" }), /DP-0427/);
  assert.throws(() => validateDuck({ code: "DP-2001", name: "Pip", color: "Blue", status: "Lost" }), /Status/);
  assert.throws(() => validateDuck({ code: "DP-2001", name: "Pip", color: "Blue", miles: -1 }), /whole number/);
  assert.equal(accentForColor("Coral"), "coral");
  assert.equal(accentForColor("Marigold"), "gold");
});

test("validateNewUser checks username, password length and role", () => {
  assert.equal(validateNewUser({ username: "captain", password: "longenough" }).role, "owner");
  assert.throws(() => validateNewUser({ username: "x", password: "longenough" }), /Username/);
  assert.throws(() => validateNewUser({ username: "captain", password: "short" }), /at least 8/);
  assert.throws(() => validateNewUser({ username: "captain", password: "longenough", role: "root" }), /Role/);
});

test("validateDuck takes no per-duck name; name is the series name only without a type", () => {
  const duck = validateDuck({ code: "DP-0500", type: "sunny" });
  assert.equal(duck.type, "sunny");
  assert.equal(duck.name, null);
  assert.equal(duck.color, null);
  assert.equal(duck.accent, null, "inherited from the type");
  assert.equal(validateDuck({ code: "DP-0500", type: "sunny", color: "Coral" }).accent, "coral");
  assert.equal(validateDuck({ code: "DP-0500", name: "Pip", color: "Blue" }).type, null);
  assert.equal(validateDuck({ code: "DP-0500", type: "sunny", name: "Pip" }).name, null, "a per-duck name is ignored");
  assert.throws(() => validateDuck({ code: "DP-0500" }), /Series name is required/);
  assert.throws(() => validateDuck({ code: "DP-0500", name: "Pip" }), /Color is required/);
  assert.throws(() => validateDuck({ code: "DP-0500", type: "Sunny!" }), /Type must be/);
});

test("validateDuckType requires a lowercase slug, name and color", () => {
  assert.deepEqual(validateDuckType({ slug: "coral", name: "Coral", color: "Coral" }), {
    slug: "coral",
    name: "Coral",
    color: "Coral",
    accent: "coral",
    imageUrl: null,
    story: null,
  });
  for (const slug of ["Coral", "c", "a b", "x".repeat(41), "", undefined, "sunny_2"]) {
    assert.throws(() => validateDuckType({ slug, name: "A", color: "B" }), (err) => err.status === 400 && err.code === "validation_failed");
  }
  assert.ok(validateDuckType({ slug: "sunny-2", name: "A", color: "B" }));
  assert.throws(() => validateDuckType({ slug: "ok", color: "B" }), /Name is required/);
  assert.throws(() => validateDuckType({ slug: "ok", name: "A" }), /Color is required/);
  assert.throws(() => validateDuckType({ slug: "ok", name: "A", color: "B", accent: "pink" }), /Accent/);
});

test("validateDuckBatch checks count 1-100, prefix and owner", () => {
  assert.deepEqual(validateDuckBatch({ count: 3 }), { count: 3, prefix: "DP", owner: null });
  assert.deepEqual(validateDuckBatch({ count: "100", prefix: "wa", owner: "pat" }), { count: 100, prefix: "WA", owner: "pat" });
  for (const count of [0, 101, 1.5, -1, "1.5", "x", null, undefined, true]) {
    assert.throws(() => validateDuckBatch({ count }), (err) => err.status === 400 && err.code === "validation_failed");
  }
  for (const prefix of ["D", "D1", "ABCDE"]) assert.throws(() => validateDuckBatch({ count: 1, prefix }), /Prefix/);
});

test("nextSerials pads to four digits and continues past the highest", () => {
  assert.deepEqual(nextSerials("DP", 428, 3), ["DP-0429", "DP-0430", "DP-0431"]);
  assert.deepEqual(nextSerials("WA", null, 1), ["WA-0001"]);
  assert.deepEqual(nextSerials("DP", 9999, 1), ["DP-10000"]);
  assert.throws(() => nextSerials("DP", 999999, 1), (err) => err.code === "serials_exhausted");
});

test("slugify derives type slugs from names", () => {
  assert.equal(slugify("Sunny"), "sunny");
  assert.equal(slugify("  Captain Quack Jr. "), "captain-quack-jr");
  assert.equal(slugify("!"), "duck");
  assert.equal(slugify("x".repeat(60)).length, 36);
});

test("text fields drop NUL bytes and miles stay inside an integer column", () => {
  assert.equal(validateFind({ name: "Ma\u0000ya", place: "Coz\u0000umel", note: "Hi" }).finderName, "Maya");
  assert.throws(() => validateFind({ name: "\u0000", place: "B", note: "C" }), /Your name is required/);
  assert.equal(validateDuck({ code: "DP-0001", name: "A", color: "B", miles: 2147483647 }).miles, 2147483647);
  assert.throws(() => validateDuck({ code: "DP-0001", name: "A", color: "B", miles: 2147483648 }), /Miles/);
});
