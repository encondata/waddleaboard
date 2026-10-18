// Request handling for the Waddle Aboard API. Dependencies are injected so tests can use fakes.
import { randomUUID } from "node:crypto";
import {
  HttpError,
  badRequest,
  clientIp,
  contentType,
  forbidden,
  notFound,
  parseCookies,
  readJson,
  readMultipart,
  sendError,
  sendJson,
  serializeCookie,
  unauthorized,
} from "./http.js";
import { createRouter } from "./router.js";
import {
  LoginThrottle,
  SESSION_COOKIE,
  burnPasswordCheck,
  hashPassword,
  newSessionToken,
  sessionTokenHash,
  verifyPassword,
} from "./auth.js";
import {
  FIND_STATUSES,
  isDuckCode,
  normalizeDuckCode,
  validateDuck,
  validateFind,
  validateNewUser,
  validatePhoto,
} from "./validation.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function photoUrl(find) {
  if (find.photoId) return `/api/photos/${find.photoId}`;
  return find.imageUrl || null;
}

function publicDuck(duck) {
  return {
    code: duck.code,
    name: duck.name,
    color: duck.color,
    accent: duck.accent,
    status: duck.status,
    story: duck.story,
    homePort: duck.homePort,
    ship: duck.ship,
    miles: duck.miles,
    imageUrl: duck.imageUrl,
    launchedAt: duck.createdAt,
    lastSeen: duck.lastSeen || null,
    findCount: duck.findCount ?? 0,
  };
}

function publicFind(find) {
  return {
    id: find.id,
    date: find.createdAt,
    place: find.place,
    spot: find.spot,
    finder: find.finderName,
    note: find.note,
    rehidden: find.rehidden,
    photoUrl: photoUrl(find),
  };
}

function adminFind(find) {
  return {
    ...publicFind(find),
    status: find.status,
    duck: { code: find.duckCode, name: find.duckName },
    moderatedAt: find.moderatedAt || null,
  };
}

function publicUser(user) {
  return { id: user.id, username: user.username, displayName: user.displayName || null, role: user.role };
}

export function createApp({ store, storage, config, now = () => Date.now(), sleep, logger = console }) {
  const wait = sleep || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const throttle = new LoginThrottle({
    maxFailures: config.loginMaxFailures,
    windowMs: config.loginWindowMinutes * 60 * 1000,
    now,
  });
  const failureDelayMs = config.loginFailureDelayMs ?? 400;
  const router = createRouter();

  async function currentUser(req) {
    if (req.user !== undefined) return req.user;
    const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
    req.user = null;
    if (token) {
      const session = await store.getSession(sessionTokenHash(token, config.sessionSecret), new Date(now()));
      if (session) req.user = session.user;
    }
    return req.user;
  }

  async function requireUser(req) {
    const user = await currentUser(req);
    if (!user) throw unauthorized();
    return user;
  }

  async function requireAdmin(req) {
    const user = await requireUser(req);
    if (user.role !== "admin") throw forbidden("Only admins can do that.");
    return user;
  }

  async function loadDuck(code) {
    const normalized = normalizeDuckCode(code);
    if (!isDuckCode(normalized)) throw notFound("No duck has that code.", "duck_not_found");
    const duck = await store.findDuckByCode(normalized);
    if (!duck) throw notFound("No duck has that code.", "duck_not_found");
    return duck;
  }

  // --- public ---
  router.get("/api/health", async (req, res) => {
    const check = async (fn) => {
      try {
        await fn();
        return "ok";
      } catch (err) {
        logger.error?.("health check failed:", err?.message);
        return "unreachable";
      }
    };
    const [db, storageState] = await Promise.all([check(() => store.ping()), check(() => storage.ping())]);
    const healthy = db === "ok" && storageState === "ok";
    const body = { status: healthy ? "ok" : "degraded", db, storage: storageState };
    if (!healthy) body.error = { code: "unhealthy", message: "A backing service is unreachable." };
    sendJson(res, healthy ? 200 : 503, body);
  });

  router.get("/api/stats", async (req, res) => {
    sendJson(res, 200, { stats: await store.publicStats() });
  });

  router.get("/api/ducks/:code", async (req, res, { params }) => {
    const duck = await loadDuck(params.code);
    sendJson(res, 200, { duck: publicDuck(duck) });
  });

  router.get("/api/ducks/:code/finds", async (req, res, { params }) => {
    const duck = await loadDuck(params.code);
    const finds = await store.listApprovedFinds(duck.id);
    sendJson(res, 200, { finds: finds.map(publicFind) });
  });

  router.post("/api/ducks/:code/finds", async (req, res, { params }) => {
    const duck = await loadDuck(params.code);
    const type = contentType(req);
    let fields;
    let photoFile = null;
    if (type === "multipart/form-data") {
      const declared = Number(req.headers["content-length"] || 0);
      const limit = config.photoMaxBytes + 256 * 1024;
      if (declared > limit) {
        throw new HttpError(413, "photo_too_large", "That upload is too large.");
      }
      let form;
      try {
        form = await readMultipart(req, limit);
      } catch (err) {
        if (err instanceof HttpError && err.status === 413) {
          throw new HttpError(413, "photo_too_large", "That upload is too large.");
        }
        throw err;
      }
      fields = {};
      for (const key of ["name", "place", "spot", "note", "rehidden"]) {
        const value = form.get(key);
        if (typeof value === "string") fields[key] = value;
      }
      const file = form.get("photo");
      if (file && typeof file === "object" && file.size > 0) photoFile = file;
    } else {
      fields = await readJson(req);
    }
    const input = validateFind(fields);

    let photo = null;
    if (photoFile) {
      const buffer = Buffer.from(await photoFile.arrayBuffer());
      const meta = validatePhoto(buffer, config.photoMaxBytes);
      const id = randomUUID();
      const objectKey = `finds/${duck.code}/${id}.${meta.ext}`;
      await storage.putObject(objectKey, buffer, meta.contentType);
      photo = { id, objectKey, contentType: meta.contentType, sizeBytes: meta.size };
    }

    let find;
    try {
      find = await store.createFind({ duckId: duck.id, ...input, photo });
    } catch (err) {
      if (photo) await storage.removeObject(photo.objectKey).catch(() => {});
      throw err;
    }
    sendJson(res, 201, {
      find: { ...publicFind(find), status: find.status },
      message: "Thanks! Your entry will appear in the guest book once a moderator approves it.",
    });
  });

  router.get("/api/photos/:id", async (req, res, { params }) => {
    if (!UUID.test(params.id)) throw notFound("Photo not found.");
    const photo = await store.getPhoto(params.id);
    if (!photo) throw notFound("Photo not found.");
    if (photo.findStatus !== "approved") {
      const user = await currentUser(req);
      if (!user || user.role !== "admin") throw notFound("Photo not found.");
    }
    const object = await storage.getObject(photo.objectKey);
    res.writeHead(200, {
      "Content-Type": photo.contentType,
      ...(photo.sizeBytes ? { "Content-Length": photo.sizeBytes } : {}),
      "Cache-Control": photo.findStatus === "approved" ? "public, max-age=86400" : "private, no-store",
      "X-Content-Type-Options": "nosniff",
    });
    if (req.method === "HEAD") {
      object.destroy?.();
      res.end();
      return;
    }
    object.on("error", () => res.destroy());
    object.pipe(res);
  });

  // --- auth ---
  router.post("/api/auth/login", async (req, res) => {
    const body = await readJson(req);
    const username = typeof body.username === "string" ? body.username.trim() : "";
    const password = typeof body.password === "string" ? body.password : "";
    if (!username || !password) throw badRequest("Enter your username and password.", "validation_failed");

    const key = `${clientIp(req)}|${username.toLowerCase()}`;
    const retry = throttle.retryAfter(key);
    if (retry) {
      throw new HttpError(429, "too_many_attempts", "Too many failed logins. Please wait and try again.", {
        headers: { "Retry-After": String(retry) },
      });
    }

    const user = await store.getUserByUsername(username);
    const ok = user ? await verifyPassword(password, user.passwordHash) : await burnPasswordCheck(password).then(() => false);
    if (!ok) {
      throttle.fail(key);
      await wait(failureDelayMs);
      throw new HttpError(401, "invalid_credentials", "That username and password do not match.");
    }
    throttle.reset(key);

    const token = newSessionToken();
    const maxAge = config.sessionTtlHours * 3600;
    await store.createSession({
      tokenHash: sessionTokenHash(token, config.sessionSecret),
      userId: user.id,
      expiresAt: new Date(now() + maxAge * 1000),
    });
    sendJson(res, 200, { user: publicUser(user) }, {
      "Set-Cookie": serializeCookie(SESSION_COOKIE, token, { maxAge, secure: config.cookieSecure }),
    });
  });

  router.post("/api/auth/logout", async (req, res) => {
    const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
    if (token) await store.deleteSession(sessionTokenHash(token, config.sessionSecret));
    sendJson(res, 200, { ok: true }, {
      "Set-Cookie": serializeCookie(SESSION_COOKIE, "", { maxAge: 0, secure: config.cookieSecure }),
    });
  });

  router.get("/api/auth/me", async (req, res) => {
    const user = await currentUser(req);
    sendJson(res, 200, { user: user ? publicUser(user) : null });
  });

  // --- owners ---
  router.get("/api/my/ducks", async (req, res) => {
    const user = await requireUser(req);
    const ducks = await store.listDucksByOwner(user.id);
    sendJson(res, 200, { ducks: ducks.map(publicDuck) });
  });

  // --- admin ---
  router.get("/api/admin/stats", async (req, res) => {
    await requireAdmin(req);
    sendJson(res, 200, { stats: await store.adminStats(new Date(now())) });
  });

  router.get("/api/admin/finds", async (req, res, { url }) => {
    await requireAdmin(req);
    const status = url.searchParams.get("status") || "open";
    const allowed = ["open", "all", ...FIND_STATUSES];
    if (!allowed.includes(status)) throw badRequest(`Status must be one of ${allowed.join(", ")}.`);
    const finds = await store.listFindsForModeration(status);
    sendJson(res, 200, { finds: finds.map(adminFind) });
  });

  const moderate = (status) => async (req, res, { params }) => {
    const admin = await requireAdmin(req);
    const id = Number(params.id);
    if (!Number.isInteger(id) || id <= 0) throw notFound("Find not found.");
    const find = await store.setFindStatus(id, status, admin.id, new Date(now()));
    if (!find) throw notFound("Find not found.");
    sendJson(res, 200, { find: adminFind(find) });
  };
  router.post("/api/admin/finds/:id/approve", moderate("approved"));
  router.post("/api/admin/finds/:id/reject", moderate("rejected"));
  router.post("/api/admin/finds/:id/flag", moderate("flagged"));

  router.get("/api/admin/ducks", async (req, res) => {
    await requireAdmin(req);
    const ducks = await store.listDucks();
    sendJson(res, 200, { ducks: ducks.map((d) => ({ ...publicDuck(d), owner: d.ownerUsername || null })) });
  });

  router.post("/api/admin/ducks", async (req, res) => {
    await requireAdmin(req);
    const input = validateDuck(await readJson(req));
    let ownerId = null;
    if (input.owner) {
      const owner = await store.getUserByUsername(input.owner);
      if (!owner) throw badRequest(`No user named ${input.owner}.`, "unknown_owner");
      ownerId = owner.id;
    }
    if (await store.findDuckByCode(input.code)) {
      throw new HttpError(409, "duck_exists", `A duck with code ${input.code} already exists.`);
    }
    const duck = await store.createDuck({ ...input, ownerId });
    sendJson(res, 201, { duck: { ...publicDuck(duck), owner: input.owner } });
  });

  router.post("/api/admin/users", async (req, res) => {
    await requireAdmin(req);
    const input = validateNewUser(await readJson(req));
    const passwordHash = await hashPassword(input.password);
    const user = await store.createUser({ ...input, passwordHash });
    if (!user) throw new HttpError(409, "user_exists", `A user named ${input.username} already exists.`);
    sendJson(res, 201, { user: publicUser(user) });
  });

  async function handle(req, res) {
    const started = now();
    let url;
    try {
      url = new URL(req.url || "/", "http://localhost");
      const { handler, params, pathMatched } = router.match(req.method, url.pathname);
      if (!handler) {
        if (pathMatched) throw new HttpError(405, "method_not_allowed", "That method is not allowed here.");
        throw notFound("No such API route.", "route_not_found");
      }
      await handler(req, res, { params, url });
    } catch (err) {
      if (!(err instanceof HttpError)) logger.error?.("unhandled error", err);
      sendError(res, err);
    } finally {
      if (config.logRequests && !(url?.pathname === "/api/health" && res.statusCode === 200)) {
        logger.info?.(`${req.method} ${url?.pathname ?? req.url} ${res.statusCode} ${now() - started}ms`);
      }
    }
  }

  return { handle, throttle };
}
