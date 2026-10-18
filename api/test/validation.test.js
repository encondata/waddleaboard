import assert from "node:assert/strict";
import { test } from "node:test";
import {
  accentForColor,
  normalizeDuckCode,
  sniffImage,
  validateDuck,
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
