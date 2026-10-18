// Input validation for finds, ducks, users and photo uploads.
import { badRequest, HttpError } from "./http.js";

export const DUCK_STATUSES = ["Sailing", "At sea", "On shore", "Rehidden", "Adopted", "Retired"];
export const ACCENTS = ["gold", "coral", "mint", "blue"];
export const ROLES = ["admin", "owner"];
export const FIND_STATUSES = ["pending", "approved", "rejected", "flagged"];

const DUCK_CODE = /^[A-Z]{2,4}-\d{3,6}$/;
const USERNAME = /^[A-Za-z0-9._-]{3,40}$/;

export function normalizeDuckCode(input) {
  const raw = String(input ?? "").trim().toUpperCase().replace(/\s+/g, "");
  if (/^\d{1,6}$/.test(raw)) return `DP-${raw.padStart(4, "0")}`;
  const glued = /^([A-Z]{2,4})(\d{3,6})$/.exec(raw);
  if (glued) return `${glued[1]}-${glued[2]}`;
  return raw;
}

export function isDuckCode(code) {
  return DUCK_CODE.test(code);
}

function text(fields, key, label, { required = false, max = 200 } = {}) {
  const value = fields[key];
  if (value !== undefined && value !== null && typeof value !== "string") {
    throw badRequest(`${label} must be text.`, "validation_failed");
  }
  const trimmed = (value ?? "").trim();
  if (required && !trimmed) throw badRequest(`${label} is required.`, "validation_failed");
  if (trimmed.length > max) throw badRequest(`${label} must be ${max} characters or fewer.`, "validation_failed");
  return trimmed;
}

function yesNo(value, fallback = true) {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  const v = String(value).toLowerCase();
  if (["yes", "true", "1", "rehidden"].includes(v)) return true;
  if (["no", "false", "0", "kept"].includes(v)) return false;
  throw badRequest("Rehidden must be yes or no.", "validation_failed");
}

export function validateFind(fields) {
  return {
    finderName: text(fields, "name", "Your name", { required: true, max: 80 }),
    place: text(fields, "place", "Place", { required: true, max: 120 }),
    spot: text(fields, "spot", "Spot", { max: 160 }),
    note: text(fields, "note", "Note", { required: true, max: 1000 }),
    rehidden: yesNo(fields.rehidden, true),
  };
}

export function accentForColor(color) {
  const c = String(color || "").toLowerCase();
  if (/coral|red|pink|orange/.test(c)) return "coral";
  if (/mint|sea|green|teal/.test(c)) return "mint";
  if (/blue|navy|cobalt|purple/.test(c)) return "blue";
  return "gold";
}

export function validateDuck(fields) {
  const code = normalizeDuckCode(fields.code);
  if (!isDuckCode(code)) throw badRequest("Duck code must look like DP-0427.", "validation_failed");
  const name = text(fields, "name", "Name", { required: true, max: 40 });
  const color = text(fields, "color", "Color", { required: true, max: 30 });
  const accent = fields.accent ? String(fields.accent) : accentForColor(color);
  if (!ACCENTS.includes(accent)) throw badRequest(`Accent must be one of ${ACCENTS.join(", ")}.`, "validation_failed");
  const status = fields.status ? String(fields.status) : "Sailing";
  if (!DUCK_STATUSES.includes(status)) {
    throw badRequest(`Status must be one of ${DUCK_STATUSES.join(", ")}.`, "validation_failed");
  }
  let miles = 0;
  if (fields.miles !== undefined && fields.miles !== "") {
    miles = Number(fields.miles);
    if (!Number.isInteger(miles) || miles < 0) throw badRequest("Miles must be a whole number.", "validation_failed");
  }
  return {
    code,
    name,
    color,
    accent,
    status,
    owner: text(fields, "owner", "Owner", { max: 40 }) || null,
    ship: text(fields, "ship", "Ship", { max: 80 }) || null,
    homePort: text(fields, "homePort", "Home port", { max: 80 }) || null,
    story: text(fields, "story", "Story", { max: 600 }) || null,
    imageUrl: text(fields, "imageUrl", "Image URL", { max: 300 }) || null,
    miles,
  };
}

export function validateUsername(username) {
  const value = String(username ?? "").trim();
  if (!USERNAME.test(value)) {
    throw badRequest("Username must be 3-40 letters, numbers, dots, dashes or underscores.", "validation_failed");
  }
  return value;
}

export function validatePassword(password) {
  if (typeof password !== "string" || password.length < 8) {
    throw badRequest("Password must be at least 8 characters.", "validation_failed");
  }
  if (password.length > 200) throw badRequest("Password is too long.", "validation_failed");
  return password;
}

export function validateNewUser(fields) {
  const role = fields.role ? String(fields.role) : "owner";
  if (!ROLES.includes(role)) throw badRequest("Role must be admin or owner.", "validation_failed");
  return {
    username: validateUsername(fields.username),
    password: validatePassword(fields.password),
    displayName: text(fields, "displayName", "Display name", { max: 60 }) || null,
    role,
  };
}

const IMAGE_TYPES = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

// Detects the real image type from magic bytes; the client-declared type is not trusted.
export function sniffImage(buf) {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (
    buf.length >= 8 &&
    buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return "image/png";
  }
  if (buf.length >= 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") {
    return "image/webp";
  }
  return null;
}

export function formatBytes(bytes) {
  if (bytes >= 1024 * 1024) return `${+(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${+(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} bytes`;
}

export function validatePhoto(buffer, maxBytes) {
  if (buffer.length > maxBytes) {
    throw new HttpError(413, "photo_too_large", `Photos must be ${formatBytes(maxBytes)} or smaller.`);
  }
  if (!buffer.length) throw badRequest("The photo is empty.", "invalid_photo");
  const type = sniffImage(buffer);
  if (!type) throw new HttpError(415, "unsupported_photo_type", "Photos must be JPEG, PNG or WebP images.");
  return { contentType: type, ext: IMAGE_TYPES[type], size: buffer.length };
}
