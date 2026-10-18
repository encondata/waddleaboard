// Framework-free helpers for the web app. Kept out of App.jsx so node --test can import them.

export function matchRoute(pathname) {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  const fixed = {
    "/": "home",
    "/how-it-works": "how",
    "/my-flock": "flock",
    "/admin": "admin",
    "/login": "login",
  };
  if (fixed[path]) return { name: fixed[path], params: {} };
  const duck = /^\/duck\/([^/]+)$/.exec(path);
  if (duck) {
    let code = duck[1];
    try {
      code = decodeURIComponent(code);
    } catch {
      // keep the raw segment
    }
    return { name: "duck", params: { code } };
  }
  return { name: "notFound", params: {} };
}

// Mirrors api/src/validation.js normalizeDuckCode so links are canonical.
export function normalizeDuckCode(input) {
  const raw = String(input ?? "").trim().toUpperCase().replace(/\s+/g, "");
  if (/^\d{1,6}$/.test(raw)) return `DP-${raw.padStart(4, "0")}`;
  const glued = /^([A-Z]{2,4})(\d{3,6})$/.exec(raw);
  if (glued) return `${glued[1]}-${glued[2]}`;
  return raw;
}

export function isDuckCode(code) {
  return /^[A-Z]{2,4}-\d{3,6}$/.test(code);
}

export function formatDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
}

export function formatMonthYear(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

export function timeAgo(iso, now = Date.now()) {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const s = Math.max(0, Math.round((now - then) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hr ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d} day${d === 1 ? "" : "s"} ago`;
  return formatDate(iso);
}

export function formatNumber(n) {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return "—";
  return Number(n).toLocaleString("en-US");
}

export function initials(name) {
  const parts = String(name || "").trim().split(/[\s._-]+/).filter(Boolean);
  if (!parts.length) return "?";
  return (parts[0][0] + (parts[1]?.[0] || "")).toUpperCase();
}

const ACCENT_ART = {
  gold: "/assets/duckport/sunny-hero.png",
  coral: "/assets/duckport/coral-portrait.png",
  mint: "/assets/duckport/minty-portrait.png",
  blue: "/assets/duckport/blue-portrait.png",
};

export function duckImage(duck) {
  return duck?.imageUrl || ACCENT_ART[duck?.accent] || ACCENT_ART.gold;
}

const STATUS_LINES = {
  Sailing: "Currently sailing",
  "At sea": "Currently at sea",
  "On shore": "Currently on shore",
  Rehidden: "Rehidden for the next finder",
  Adopted: "Home with a finder",
  Retired: "Retired from sailing",
};

export function statusLine(status) {
  return STATUS_LINES[status] || "Currently sailing";
}

export class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

// Wraps fetch: sends cookies, encodes JSON, and turns { error } bodies into ApiError.
export function createApiClient(fetchImpl, base = "") {
  return async function request(path, { method = "GET", json, body } = {}) {
    const init = { method, credentials: "same-origin", headers: { Accept: "application/json" } };
    if (json !== undefined) {
      init.headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(json);
    } else if (body !== undefined) {
      init.body = body;
    }
    let res;
    try {
      res = await fetchImpl(base + path, init);
    } catch {
      throw new ApiError(0, "network_error", "We couldn't reach Waddle Aboard. Check your connection and try again.");
    }
    let data = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }
    if (!res.ok) {
      const err = data?.error;
      throw new ApiError(res.status, err?.code || "http_error", err?.message || `Request failed (${res.status}).`);
    }
    return data;
  };
}
