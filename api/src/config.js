// Reads runtime configuration from environment variables.

function int(value, fallback) {
  const n = Number.parseInt(value ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function bool(value, fallback = false) {
  if (value === undefined || value === "") return fallback;
  return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
}

export function loadConfig(env = process.env) {
  const sessionSecret = env.SESSION_SECRET || "";
  if (env.NODE_ENV === "production" && sessionSecret.length < 32) {
    throw new Error("SESSION_SECRET must be set to at least 32 characters in production.");
  }
  return {
    port: int(env.PORT, 3000),
    databaseUrl:
      env.DATABASE_URL ||
      `postgres://${encodeURIComponent(env.POSTGRES_USER || "waddle")}:${encodeURIComponent(env.POSTGRES_PASSWORD || "")}@${env.POSTGRES_HOST || "localhost"}:${env.POSTGRES_PORT || 5432}/${env.POSTGRES_DB || "waddleaboard"}`,
    sessionSecret: sessionSecret || "dev-only-insecure-session-secret-change-me",
    sessionTtlHours: int(env.SESSION_TTL_HOURS, 24 * 7),
    cookieSecure: bool(env.COOKIE_SECURE, false),
    photoMaxBytes: int(env.PHOTO_MAX_BYTES, 8 * 1024 * 1024),
    loginMaxFailures: int(env.LOGIN_MAX_FAILURES, 5),
    loginWindowMinutes: int(env.LOGIN_WINDOW_MINUTES, 15),
    runMigrations: bool(env.RUN_MIGRATIONS, true),
    seedDemo: bool(env.SEED_DEMO, false),
    firstAdmin: { username: (env.WADDLE_ADMIN_USER || "").trim(), password: env.WADDLE_ADMIN_PASSWORD || "" },
    migrationsDir: env.MIGRATIONS_DIR || new URL("../../db/migrations", import.meta.url).pathname,
    seedsDir: env.SEEDS_DIR || new URL("../../db/seeds", import.meta.url).pathname,
    storage: {
      endPoint: env.MINIO_ENDPOINT || "localhost",
      port: int(env.MINIO_PORT, 9000),
      useSSL: bool(env.MINIO_USE_SSL, false),
      accessKey: env.MINIO_ROOT_USER || env.MINIO_ACCESS_KEY || "",
      secretKey: env.MINIO_ROOT_PASSWORD || env.MINIO_SECRET_KEY || "",
      bucket: env.MINIO_BUCKET || "waddleaboard-photos",
      region: env.MINIO_REGION || "us-east-1",
    },
  };
}
