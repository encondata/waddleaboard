// Removes metadata from uploaded photos: EXIF (GPS position, time, camera), XMP, IPTC, comments
// and text chunks. Without this, every approved photo would publish where its finder stood.
// A JPEG keeps one thing from its EXIF, the orientation, or portrait phone photos would show
// sideways. Pixel data is copied unchanged.
import { badRequest } from "./http.js";

const unreadable = () => badRequest("That photo could not be read. Please try another one.", "invalid_photo");

// --- JPEG ------------------------------------------------------------------

// APPn segments worth keeping: none of them can carry a location.
function keepAppSegment(marker, payload) {
  if (marker === 0xe0) return true; // APP0: JFIF
  if (marker === 0xe2) return payload.toString("latin1", 0, 12) === "ICC_PROFILE\0"; // colour profile
  if (marker === 0xee) return payload.toString("latin1", 0, 5) === "Adobe"; // colour transform
  return false;
}

// The Orientation tag (0x0112) from an APP1 Exif payload, or null.
export function exifOrientation(payload) {
  if (payload.length < 14 || payload.toString("latin1", 0, 6) !== "Exif\0\0") return null;
  const tiff = payload.subarray(6);
  const little = tiff[0] === 0x49 && tiff[1] === 0x49;
  if (!little && !(tiff[0] === 0x4d && tiff[1] === 0x4d)) return null;
  const u16 = (o) => (little ? tiff.readUInt16LE(o) : tiff.readUInt16BE(o));
  const u32 = (o) => (little ? tiff.readUInt32LE(o) : tiff.readUInt32BE(o));
  if (u16(2) !== 42) return null;
  const ifd = u32(4);
  if (ifd + 2 > tiff.length) return null;
  const count = u16(ifd);
  for (let k = 0; k < count; k++) {
    const entry = ifd + 2 + k * 12;
    if (entry + 12 > tiff.length) return null;
    if (u16(entry) === 0x0112 && u16(entry + 2) === 3) return u16(entry + 8);
  }
  return null;
}

// A minimal APP1 segment holding nothing but the orientation.
function orientationSegment(orientation) {
  const tiff = Buffer.from([
    0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08, // big-endian TIFF header, IFD0 at 8
    0x00, 0x01, // one entry
    0x01, 0x12, 0x00, 0x03, 0x00, 0x00, 0x00, 0x01, 0x00, orientation, 0x00, 0x00, // Orientation, SHORT
    0x00, 0x00, 0x00, 0x00, // no next IFD
  ]);
  const payload = Buffer.concat([Buffer.from("Exif\0\0", "latin1"), tiff]);
  const head = Buffer.from([0xff, 0xe1, 0, 0]);
  head.writeUInt16BE(payload.length + 2, 2);
  return Buffer.concat([head, payload]);
}

const isRestart = (byte) => byte >= 0xd0 && byte <= 0xd7;

export function stripJpeg(buf) {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) throw unreadable();
  const out = [buf.subarray(0, 2)];
  let insertAt = 1; // orientation goes after SOI, or after APP0 when there is one
  let orientation = 1;
  let scanned = false;
  let i = 2;
  for (;;) {
    if (i >= buf.length && scanned) {
      out.push(Buffer.from([0xff, 0xd9])); // truncated after the image data: close it
      break;
    }
    if (i >= buf.length || buf[i] !== 0xff) throw unreadable();
    while (i < buf.length && buf[i] === 0xff) i++; // fill bytes may precede a marker
    if (i >= buf.length) throw unreadable();
    const marker = buf[i++];
    if (marker === 0xd9) {
      // End of image. Anything after it (extra images, maker trailers) is dropped.
      out.push(Buffer.from([0xff, 0xd9]));
      break;
    }
    if (marker === 0x01 || isRestart(marker)) {
      out.push(Buffer.from([0xff, marker]));
      continue;
    }
    if (marker === 0x00 || marker === 0xd8 || i + 2 > buf.length) throw unreadable();
    const length = buf.readUInt16BE(i);
    if (length < 2 || i + length > buf.length) throw unreadable();
    const segment = buf.subarray(i, i + length); // length bytes + payload
    const payload = segment.subarray(2);
    i += length;

    const isApp = marker >= 0xe0 && marker <= 0xef;
    if (isApp || marker === 0xfe) {
      if (marker === 0xe1 && orientation === 1) orientation = exifOrientation(payload) ?? 1;
      if (isApp && keepAppSegment(marker, payload)) {
        out.push(Buffer.from([0xff, marker]), segment);
        if (marker === 0xe0) insertAt = out.length;
      }
      continue;
    }
    out.push(Buffer.from([0xff, marker]), segment);

    if (marker === 0xda) {
      // Entropy-coded data runs to the next 0xFF that is not stuffing (0xFF00) or a restart.
      scanned = true;
      let j = i;
      while (j < buf.length - 1 && !(buf[j] === 0xff && buf[j + 1] !== 0x00 && !isRestart(buf[j + 1]))) j++;
      if (j === buf.length - 1) j = buf.length;
      out.push(buf.subarray(i, j));
      i = j;
    }
  }
  if (!scanned) throw unreadable();
  if (orientation >= 2 && orientation <= 8) out.splice(insertAt, 0, orientationSegment(orientation));
  return Buffer.concat(out);
}

// --- PNG -------------------------------------------------------------------

const PNG_METADATA = new Set(["eXIf", "tEXt", "zTXt", "iTXt", "tIME"]);

export function stripPng(buf) {
  const out = [buf.subarray(0, 8)];
  let i = 8;
  for (;;) {
    if (i + 12 > buf.length) throw unreadable();
    const length = buf.readUInt32BE(i);
    const end = i + 12 + length;
    if (end > buf.length) throw unreadable();
    const type = buf.toString("latin1", i + 4, i + 8);
    if (!PNG_METADATA.has(type)) out.push(buf.subarray(i, end));
    i = end;
    if (type === "IEND") break; // anything after it is dropped
  }
  return Buffer.concat(out);
}

// --- WebP ------------------------------------------------------------------

export function stripWebp(buf) {
  if (buf.length < 12) throw unreadable();
  const riffEnd = 8 + buf.readUInt32LE(4);
  if (riffEnd > buf.length || riffEnd < 12) throw unreadable();
  const chunks = [];
  let i = 12;
  while (i < riffEnd) {
    if (i + 8 > riffEnd) throw unreadable();
    const fourcc = buf.toString("latin1", i, i + 4);
    const size = buf.readUInt32LE(i + 4);
    if (i + 8 + size > riffEnd) throw unreadable();
    const end = Math.min(i + 8 + size + (size & 1), riffEnd);
    if (fourcc !== "EXIF" && fourcc !== "XMP ") chunks.push(Buffer.from(buf.subarray(i, end)));
    i = end;
  }
  if (!chunks.length) throw unreadable();
  // VP8X flags say which optional chunks follow; clear the EXIF (0x08) and XMP (0x04) bits.
  for (const chunk of chunks) {
    if (chunk.toString("latin1", 0, 4) === "VP8X" && chunk.length > 8) chunk[8] &= ~0x0c;
  }
  const body = Buffer.concat(chunks);
  const header = Buffer.alloc(12);
  header.write("RIFF", 0, "latin1");
  header.writeUInt32LE(4 + body.length, 4);
  header.write("WEBP", 8, "latin1");
  return Buffer.concat([header, body]);
}

export function stripPhotoMetadata(buffer, contentType) {
  if (contentType === "image/jpeg") return stripJpeg(buffer);
  if (contentType === "image/png") return stripPng(buffer);
  if (contentType === "image/webp") return stripWebp(buffer);
  throw unreadable();
}
