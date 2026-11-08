// Input validation for finds, ducks, users and photo uploads.
import { badRequest, HttpError } from "./http.js";

export const DUCK_STATUSES = ["Sailing", "At sea", "On shore", "Rehidden", "Adopted", "Retired"];
export const ACCENTS = ["gold", "coral", "mint", "blue"];
export const ROLES = ["admin", "owner"];
export const FIND_STATUSES = ["pending", "approved", "rejected", "flagged"];

const DUCK_CODE = /^[A-Z]{2,4}-\d{3,6}$/;
const USERNAME = /^[A-Za-z0-9._-]{3,40}$/;
const TYPE_SLUG = /^[a-z0-9-]{2,40}$/;
const SERIAL_PREFIX = /^[A-Z]{2,4}$/;
export const MAX_BATCH = 100;

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
  // Postgres text cannot hold NUL, so it is dropped rather than left to fail the insert.
  const trimmed = (value ?? "").replace(/\u0000/g, "").trim();
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

export function isTypeSlug(slug) {
  return typeof slug === "string" && TYPE_SLUG.test(slug);
}

// Lowercase, dash-separated slug from a display name ("Sunny Jr." -> "sunny-jr").
export function slugify(name) {
  const slug = String(name ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 36)
    .replace(/-+$/, "");
  return slug.length >= 2 ? slug : "duck";
}

function accentFor(fields, color) {
  if (!fields.accent && !color) return null;
  const accent = fields.accent ? String(fields.accent) : accentForColor(color);
  if (!ACCENTS.includes(accent)) throw badRequest(`Accent must be one of ${ACCENTS.join(", ")}.`, "validation_failed");
  return accent;
}

// Individuals have no name of their own: they are "<series name> · Serial <code>".
// With a `type` (series slug), any `name` is ignored and color is optional (inherited).
// Without one, `name` is the series name used to find or create the series.
export function validateDuck(fields) {
  const code = normalizeDuckCode(fields.code);
  if (!isDuckCode(code)) throw badRequest("Duck code must look like DP-0427.", "validation_failed");
  const type = text(fields, "type", "Type", { max: 40 }) || null;
  if (type !== null && !isTypeSlug(type)) {
    throw badRequest("Type must be a slug of 2-40 lowercase letters, numbers or dashes.", "validation_failed");
  }
  const name = type ? null : text(fields, "name", "Series name", { required: true, max: 40 });
  const color = text(fields, "color", "Color", { required: !type, max: 30 }) || null;
  const accent = accentFor(fields, color);
  const status = fields.status ? String(fields.status) : "Sailing";
  if (!DUCK_STATUSES.includes(status)) {
    throw badRequest(`Status must be one of ${DUCK_STATUSES.join(", ")}.`, "validation_failed");
  }
  let miles = 0;
  if (fields.miles !== undefined && fields.miles !== "") {
    miles = Number(fields.miles);
    if (!Number.isInteger(miles) || miles < 0 || miles > 2147483647) {
      throw badRequest("Miles must be a whole number.", "validation_failed");
    }
  }
  return {
    code,
    type,
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

export function validateDuckType(fields) {
  const slug = typeof fields.slug === "string" ? fields.slug.trim() : "";
  if (!TYPE_SLUG.test(slug)) {
    throw badRequest("Slug must be 2-40 lowercase letters, numbers or dashes, like sunny.", "validation_failed");
  }
  const name = text(fields, "name", "Name", { required: true, max: 40 });
  const color = text(fields, "color", "Color", { required: true, max: 30 });
  return {
    slug,
    name,
    color,
    accent: accentFor(fields, color),
    imageUrl: text(fields, "imageUrl", "Image URL", { max: 300 }) || null,
    story: text(fields, "story", "Story", { max: 600 }) || null,
  };
}

export function validateDuckBatch(fields) {
  const raw = fields.count;
  const count = typeof raw === "string" && /^\d+$/.test(raw.trim()) ? Number(raw) : raw;
  if (typeof count !== "number" || !Number.isInteger(count) || count < 1 || count > MAX_BATCH) {
    throw badRequest(`Count must be a whole number from 1 to ${MAX_BATCH}.`, "validation_failed");
  }
  const prefixInput = text(fields, "prefix", "Prefix", { max: 4 }).toUpperCase();
  const prefix = prefixInput || "DP";
  if (!SERIAL_PREFIX.test(prefix)) throw badRequest("Prefix must be 2-4 letters, like DP.", "validation_failed");
  return { count, prefix, owner: text(fields, "owner", "Owner", { max: 40 }) || null };
}

// Serials for the next `count` ducks after `highest` (the largest numeric suffix in use).
export function nextSerials(prefix, highest, count) {
  const start = (highest || 0) + 1;
  const last = start + count - 1;
  if (last > 999999) throw badRequest(`No room for ${count} more ${prefix} serials.`, "serials_exhausted");
  return Array.from({ length: count }, (_, i) => `${prefix}-${String(start + i).padStart(4, "0")}`);
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
