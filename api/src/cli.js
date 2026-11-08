// Operator commands, run inside the api container:
//   node src/cli.js migrate
//   node src/cli.js seed-demo
//   node src/cli.js create-admin --username NAME   (password on stdin, else WADDLE_ADMIN_PASSWORD)
//   node src/cli.js create-user --username NAME --role owner   (password on stdin)
//   node src/cli.js has-admin   (exit 0 if an admin account exists, 1 if not)
import path from "node:path";
import pg from "pg";
import { loadConfig } from "./config.js";
import { runMigrations, runSeed } from "./migrate.js";
import { createPgStore } from "./store.js";
import { ensureUser } from "./users.js";

export { ensureUser };

export function parseArgs(argv) {
  const [command, ...rest] = argv;
  const flags = {};
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (!arg.startsWith("--")) continue;
    const eq = arg.indexOf("=");
    if (eq > 0) flags[arg.slice(2, eq)] = arg.slice(eq + 1);
    else if (rest[i + 1] !== undefined && !rest[i + 1].startsWith("--")) flags[arg.slice(2)] = rest[++i];
    else flags[arg.slice(2)] = true;
  }
  return { command, flags };
}

async function readStdin() {
  if (process.stdin.isTTY) return "";
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8").replace(/\r?\n$/, "");
}

async function main() {
  const { command, flags } = parseArgs(process.argv.slice(2));
  const config = loadConfig();
  const pool = new pg.Pool({ connectionString: config.databaseUrl, max: 2 });
  try {
    if (command === "migrate") {
      const client = await pool.connect();
      try {
        const applied = await runMigrations(client, config.migrationsDir);
        console.log(applied.length ? `applied: ${applied.join(", ")}` : "migrations up to date");
      } finally {
        client.release();
      }
    } else if (command === "seed-demo") {
      const client = await pool.connect();
      try {
        await runSeed(client, path.join(config.seedsDir, "demo.sql"));
        console.log("demo seed applied");
      } finally {
        client.release();
      }
    } else if (command === "has-admin") {
      const count = await createPgStore(pool).countUsersByRole("admin");
      console.log(count ? `${count} admin account(s)` : "no admin account");
      process.exitCode = count ? 0 : 1;
    } else if (command === "create-admin" || command === "create-user") {
      const role = command === "create-admin" ? "admin" : String(flags.role || "owner");
      const username = String(flags.username || "");
      // The api container also has WADDLE_ADMIN_PASSWORD (for the first administrator), so a
      // password given on stdin always wins, and only create-admin falls back to it.
      const typed = await readStdin();
      const password = typed || (role === "admin" ? process.env.WADDLE_ADMIN_PASSWORD || "" : "");
      const status = await ensureUser(createPgStore(pool), { username, password, role });
      if (status === "created") console.log(`created ${role} ${username}`);
      else if (status === "exists") console.log(`${role} ${username} already exists; left unchanged`);
      else {
        console.error(`user ${username} already exists with a different role; left unchanged`);
        process.exitCode = 2;
      }
    } else {
      console.error("usage: cli.js migrate | seed-demo | has-admin | create-admin --username NAME | create-user --username NAME [--role owner]");
      process.exitCode = 64;
    }
  } finally {
    await pool.end();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err.status ? err.message : `error: ${err.message}`);
    process.exit(1);
  });
}
