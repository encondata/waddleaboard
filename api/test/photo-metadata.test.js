import assert from "node:assert/strict";
import { test } from "node:test";
import { exifOrientation, stripJpeg, stripPhotoMetadata, stripPng, stripWebp } from "../src/photo-metadata.js";
import { APP0_END, JPEG, JPEG_FROM_SIPS, PNG, WEBP, exifSegment, jpegSegment, jpegWith } from "./images.js";

const unreadable = (err) => err.status === 400 && err.code === "invalid_photo";

test("a JPEG without metadata comes back byte for byte", () => {
  assert.deepEqual(stripJpeg(JPEG), JPEG);
  assert.deepEqual(stripPhotoMetadata(JPEG, "image/jpeg"), JPEG);
});

test("Exif and Photoshop blocks from a real encoder are removed", () => {
  assert.deepEqual(stripJpeg(JPEG_FROM_SIPS), JPEG);
});

test("GPS-bearing Exif, XMP, IPTC and comments go; the orientation stays", () => {
  const dirty = jpegWith(
    exifSegment({ orientation: 6, description: "GPS 25.7617 N 80.1918 W secret" }),
    jpegSegment(0xe1, Buffer.from("http://ns.adobe.com/xap/1.0/\0<x:xmpmeta>secret place</x:xmpmeta>", "latin1")),
    jpegSegment(0xed, Buffer.from("Photoshop 3.0\0secret caption", "latin1")),
    jpegSegment(0xfe, Buffer.from("secret comment", "latin1")),
  );
  const clean = stripJpeg(dirty);
  assert.doesNotMatch(clean.toString("latin1"), /secret|GPS|xmpmeta|Photoshop/);
  // Exactly the clean image plus one small orientation-only APP1 after JFIF.
  const app1 = clean.subarray(APP0_END, APP0_END + 4 + 32);
  assert.deepEqual([app1[0], app1[1]], [0xff, 0xe1]);
  assert.equal(exifOrientation(app1.subarray(4)), 6);
  assert.deepEqual(Buffer.concat([clean.subarray(0, APP0_END), clean.subarray(APP0_END + app1.length)]), JPEG);
});

test("an upright orientation (1) needs no Exif at all", () => {
  assert.deepEqual(stripJpeg(jpegWith(exifSegment({ orientation: 1, description: "secret" }))), JPEG);
});

test("ICC colour profiles are kept", () => {
  const icc = jpegSegment(0xe2, Buffer.from("ICC_PROFILE\0\x01\x01fake-profile", "latin1"));
  assert.deepEqual(stripJpeg(jpegWith(icc)), jpegWith(icc));
});

test("anything after the end of the image is dropped, and a missing end is supplied", () => {
  assert.deepEqual(stripJpeg(Buffer.concat([JPEG, Buffer.from("trailer with secret maker notes")])), JPEG);
  assert.deepEqual(stripJpeg(JPEG.subarray(0, JPEG.length - 2)), JPEG);
});

test("JPEGs whose structure cannot be followed are refused", () => {
  const fake = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]), Buffer.from("JFIF\0fake-jpeg-body"), Buffer.from([0xff, 0xd9])]);
  assert.throws(() => stripJpeg(fake), unreadable);
  assert.throws(() => stripJpeg(JPEG.subarray(0, 30)), unreadable, "cut off before the image data");
  assert.throws(() => stripJpeg(Buffer.from([0xff, 0xd8, 0xff, 0xd9])), unreadable, "no image data");
});

function pngChunk(type, data) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, "latin1");
  return Buffer.concat([head, data, Buffer.alloc(4)]); // CRC is not checked
}

test("PNG text, time and Exif chunks are removed", () => {
  assert.deepEqual(stripPng(PNG), PNG);
  const ihdrEnd = 8 + 25;
  const dirty = Buffer.concat([
    PNG.subarray(0, ihdrEnd),
    pngChunk("tEXt", Buffer.from("Comment\0secret", "latin1")),
    pngChunk("iTXt", Buffer.from("XML:com.adobe.xmp\0\0\0\0\0secret", "latin1")),
    pngChunk("eXIf", Buffer.from("MM\0*secret", "latin1")),
    pngChunk("tIME", Buffer.alloc(7)),
    PNG.subarray(ihdrEnd),
    Buffer.from("after IEND secret"),
  ]);
  assert.deepEqual(stripPng(dirty), PNG);
  assert.throws(() => stripPng(Buffer.concat([PNG.subarray(0, 8), Buffer.from("fake-png")])), unreadable);
});

function riffChunk(fourcc, data) {
  const head = Buffer.alloc(8);
  head.write(fourcc, 0, "latin1");
  head.writeUInt32LE(data.length, 4);
  return Buffer.concat([head, data, data.length % 2 ? Buffer.alloc(1) : Buffer.alloc(0)]);
}

function riff(...chunks) {
  const body = Buffer.concat(chunks);
  const head = Buffer.alloc(12);
  head.write("RIFF", 0, "latin1");
  head.writeUInt32LE(4 + body.length, 4);
  head.write("WEBP", 8, "latin1");
  return Buffer.concat([head, body]);
}

test("WebP EXIF and XMP chunks are removed and their VP8X flags cleared", () => {
  assert.deepEqual(stripWebp(WEBP), WEBP);
  const vp8x = Buffer.alloc(10);
  vp8x[0] = 0x08 | 0x04 | 0x10; // EXIF, XMP, alpha
  const image = WEBP.subarray(12);
  const dirty = riff(riffChunk("VP8X", vp8x), image, riffChunk("EXIF", Buffer.from("secret!", "latin1")), riffChunk("XMP ", Buffer.from("<x>secret</x>", "latin1")));
  const clean = stripWebp(dirty);
  assert.doesNotMatch(clean.toString("latin1"), /secret|EXIF|XMP/);
  assert.equal(clean.readUInt32LE(4), clean.length - 8);
  assert.equal(clean[20], 0x10, "only the alpha flag is left");
  assert.deepEqual(clean.subarray(30), image);
  assert.throws(() => stripWebp(Buffer.concat([Buffer.from("RIFF"), Buffer.from([0x10, 0, 0, 0]), Buffer.from("WEBPVP8 fake")])), unreadable);
});
