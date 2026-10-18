// Entry point: connect to Postgres and MinIO, migrate, then serve HTTP.
import http from "node:http";
import path from "node:path";
import pg from "pg";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { runMigrations, runSeed } from "./migrate.js";
import { createPgStore } from "./store.js";
import { createMinioStorage } from "./storage.js";

async function retry(label, fn, { attempts = 30, delayMs = 2000 } = {}) {
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (err) {
      if (i >= attempts) throw err;
      console.warn(`${label} not ready (${err.message}); retrying in ${delayMs}ms [${i}/${attempts}]`);
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}

async function main() {
  const config = { ...loadConfig(), logRequests: true };
  const pool = new pg.Pool({ connectionString: config.databaseUrl, max: 10 });
  pool.on("error", (err) => console.error("postgres pool error:", err.message));

  await retry("postgres", () => pool.query("SELECT 1"));
  if (config.runMigrations) {
    const client = await pool.connect();
    try {
      const applied = await runMigrations(client, config.migrationsDir);
      console.info(applied.length ? `migrations applied: ${applied.join(", ")}` : "migrations up to date");
      if (config.seedDemo) {
        await runSeed(client, path.join(config.seedsDir, "demo.sql"));
        console.info("demo seed applied");
      }
    } finally {
      client.release();
    }
  }

  const storage = createMinioStorage(config.storage);
  await retry("minio", async () => {
    if (await storage.ensureBucket()) console.info(`created bucket ${storage.bucket}`);
  });

  const app = createApp({ store: createPgStore(pool), storage, config });
  const server = http.createServer((req, res) => app.handle(req, res));
  server.requestTimeout = 120_000;
  server.listen(config.port, () => console.info(`waddleaboard api listening on :${config.port}`));

  const shutdown = () => {
    console.info("shutting down");
    server.close(() => pool.end().finally(() => process.exit(0)));
    setTimeout(() => process.exit(0), 10_000).unref();
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch((err) => {
  console.error("api failed to start:", err.message);
  process.exit(1);
});
