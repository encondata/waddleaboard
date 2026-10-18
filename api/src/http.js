// Small HTTP helpers shared by the router and handlers.

export class HttpError extends Error {
  constructor(status, code, message, extra = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.headers = extra.headers || {};
  }
}

export const badRequest = (message, code = "bad_request") => new HttpError(400, code, message);
export const unauthorized = (message = "Please log in first.") => new HttpError(401, "unauthorized", message);
export const forbidden = (message = "You do not have access to this.") => new HttpError(403, "forbidden", message);
export const notFound = (message = "Not found.", code = "not_found") => new HttpError(404, code, message);

export function sendJson(res, status, body, headers = {}) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload),
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    ...headers,
  });
  res.end(payload);
}

export function sendError(res, err) {
  const status = err instanceof HttpError ? err.status : 500;
  const code = err instanceof HttpError ? err.code : "internal_error";
  const message = err instanceof HttpError ? err.message : "Something went wrong on our side.";
  const headers = err instanceof HttpError ? err.headers : {};
  if (res.headersSent) {
    res.destroy();
    return;
  }
  sendJson(res, status, { error: { code, message } }, headers);
}

// Reads the whole request body, failing with 413 once `limit` bytes are exceeded.
export async function readBody(req, limit) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) {
      throw new HttpError(413, "payload_too_large", `Request body is larger than ${limit} bytes.`);
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

export function contentType(req) {
  return String(req.headers["content-type"] || "").split(";")[0].trim().toLowerCase();
}

export async function readJson(req, limit = 64 * 1024) {
  const type = contentType(req);
  if (type !== "application/json") {
    throw new HttpError(415, "unsupported_media_type", "Send the request as application/json.");
  }
  const raw = await readBody(req, limit);
  if (!raw.length) return {};
  try {
    const value = JSON.parse(raw.toString("utf8"));
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("not an object");
    }
    return value;
  } catch {
    throw badRequest("The request body is not valid JSON.", "invalid_json");
  }
}

// Parses multipart/form-data with the platform's WHATWG Request implementation.
export async function readMultipart(req, limit) {
  const raw = await readBody(req, limit);
  const request = new Request("http://local/upload", {
    method: "POST",
    headers: { "content-type": req.headers["content-type"] || "" },
    body: raw,
  });
  try {
    return await request.formData();
  } catch {
    throw badRequest("The upload could not be read as multipart/form-data.", "invalid_multipart");
  }
}

export function parseCookies(header = "") {
  const out = {};
  for (const part of String(header).split(";")) {
    const idx = part.indexOf("=");
    if (idx < 0) continue;
    const key = part.slice(0, idx).trim();
    if (!key) continue;
    try {
      out[key] = decodeURIComponent(part.slice(idx + 1).trim());
    } catch {
      out[key] = part.slice(idx + 1).trim();
    }
  }
  return out;
}

export function serializeCookie(name, value, { maxAge, secure = false, path = "/" } = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`, `Path=${path}`, "HttpOnly", "SameSite=Lax"];
  if (maxAge !== undefined) parts.push(`Max-Age=${Math.floor(maxAge)}`);
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

export function clientIp(req) {
  const real = req.headers["x-real-ip"];
  if (real) return String(real);
  return req.socket?.remoteAddress || "unknown";
}
