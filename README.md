# Waddle Aboard

A public guest book for cruise ducks (WaddleAboard.com). Each duck has a short code
(like `DP-0427`) and a QR label. Finders open its guest book, log a find with an optional
photo, and keep or rehide the duck. Owners follow their flock. Admins moderate entries and
register ducks.

| Path | What it holds |
| --- | --- |
| `web/` | React 19 + Vite site (pages, styles and artwork copied from `duckport-site`) |
| `api/` | Node 22 HTTP/JSON API (`node:http`, `pg`, `minio`, `bcryptjs`) |
| `db/migrations/` | Ordered SQL migrations; `db/seeds/demo.sql` holds the optional sample ducks |
| `deploy/` | `docker-compose.yml`, Dockerfiles, nginx config, `smoke-test.sh` |
| `install.sh` | One-shot installer for a Linux host |

## Install on a server

You need a Debian/Ubuntu or RHEL-family host (RHEL, CentOS, Rocky, Alma, Fedora) and root or sudo.

```bash
git clone https://github.com/encondata/waddleaboard.git
cd waddleaboard
sudo ./install.sh
```

The installer does the following:

1. Installs Docker Engine and the Compose v2 plugin from download.docker.com if they are missing.
2. Asks for an install directory (default `/mntuser/waddleaboard`) and records it in
   `/etc/waddleaboard/install.conf`.
3. Asks for the first admin username and password (hidden, confirmed, at least 8 characters).
4. Writes `<dir>/.env` (mode 600) with generated database, MinIO and session secrets.
5. Copies the app to `<dir>/app`, builds and starts the stack, waits for every service to be
   healthy, runs migrations and creates the admin.

The install dir holds `app/` (sources), `.env`, and `data/postgres` and `data/minio`
(bind mounts). Back up `.env` and `data/`.

You can run it again at any time, for example after a `git pull` to deploy an update.
A re-run reuses the recorded directory, never overwrites `.env`, and never creates a
second admin.

Non-interactive (CI or testing):

```bash
WADDLE_YES=1 WADDLE_INSTALL_DIR=/srv/waddle WADDLE_ADMIN_USER=admin \
  WADDLE_ADMIN_PASSWORD='a-long-password' ./install.sh
```

Optional variables, read on first install only: `WADDLE_WEB_PORT` (default 80) and
`WADDLE_SEED_DEMO=1` (loads Sunny DP-0427 and the other sample ducks).
`WADDLE_CONF_FILE` moves the install record.

### Operating the stack

```bash
cd /mntuser/waddleaboard
alias wa='docker compose -p waddleaboard -f app/deploy/docker-compose.yml --env-file .env'
wa ps                      # health of web, api, db, spaces
wa logs -f api
wa exec -T api node api/src/cli.js create-user --username pat --role owner <<< 'owner-password'
wa exec -T api node api/src/cli.js seed-demo
```

Admins can also add owners and ducks from `/admin`.

## Develop

Requires Node 22 and npm 11.

```bash
npm install                      # installs the api and web workspaces
cp .env.example .env             # then set real passwords and a SESSION_SECRET
docker compose -f deploy/docker-compose.yml --env-file .env up -d --build
```

The site is then at `http://localhost` (or `WEB_PORT`). For hot reload, keep `db` and
`spaces` running in compose and run the api and Vite locally:

```bash
docker compose -f deploy/docker-compose.yml --env-file .env up -d db spaces
# expose 5432/9000 locally (for example with a compose override), then:
POSTGRES_PASSWORD=... MINIO_ROOT_PASSWORD=... npm run dev:api
npm run dev:web                  # Vite proxies /api to http://localhost:3000
```

## Test

```bash
npm test
```

This runs `node --test` over `api/test` and `web/test`. The API tests use in-memory fakes
for Postgres and MinIO, so they do not need Docker.

To test a running stack end to end, run the smoke test:

```bash
BASE_URL=http://localhost WADDLE_ADMIN_USER=admin WADDLE_ADMIN_PASSWORD=... deploy/smoke-test.sh
```

## API at a glance

All errors have the shape `{ "error": { "code", "message" } }`.

| Method & path | Who |
| --- | --- |
| `GET /api/health` | anyone (reports `db` and `storage`) |
| `GET /api/stats` | anyone |
| `GET /api/ducks/:code`, `GET /api/ducks/:code/finds` | anyone (approved finds only) |
| `GET /api/duck-types`, `GET /api/duck-types/:slug` | anyone (types with duck and find counts; one type plus its ducks) |
| `POST /api/ducks/:code/finds` | anyone; multipart (`name`, `place`, `spot`, `note`, `rehidden`, `photo`) or JSON. Creates a `pending` find |
| `GET /api/photos/:id` | anyone for approved finds; admins for any |
| `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me` | anyone |
| `GET /api/my/ducks` | logged-in owner or admin |
| `GET /api/admin/stats`, `GET /api/admin/finds?status=open\|pending\|flagged\|approved\|rejected\|all` | admin |
| `POST /api/admin/finds/:id/approve\|reject\|flag` | admin |
| `GET /api/admin/ducks`, `POST /api/admin/ducks`, `POST /api/admin/users` | admin |
| `POST /api/admin/duck-types`, `POST /api/admin/duck-types/:slug/ducks` | admin |

### Duck types and individuals

A **duck type** is a design, such as Sunny or Coral. It holds the shared name, color, accent,
artwork and default story. Every physical duck is an **individual** of one type. Its code
(`DP-0427`) is its serial number, and it has its own guest book, owner, status and miles. A
duck's own color, accent, artwork or story overrides the type's when set. Duck JSON includes
`serial` and `type: { slug, name, color, accent, imageUrl }`.

- `POST /api/admin/duck-types` with `{ slug, name, color, accent?, imageUrl?, story? }` creates
  a type. A slug is 2-40 lowercase letters, numbers or dashes. A duplicate slug returns 409
  `duck_type_exists`.
- `POST /api/admin/duck-types/:slug/ducks` with `{ count, prefix?, owner? }` registers `count`
  (1-100) ducks of that type in one transaction. They get the next free serials after the highest
  one under `prefix` (default `DP`), zero-padded to 4 digits, for example `DP-0429`, `DP-0430`. The
  response lists the new `serials`.
- `POST /api/admin/ducks` accepts an optional `type` slug. With a type, `name` and `color` are
  optional and inherited. Without one, the duck joins the type with the same name and color, or a
  new type is created for it.

Migration `005_duck_types.sql` backfills existing ducks into types grouped by name and color.

## Notes

- Photos live in a private MinIO bucket. The API checks each file's magic bytes
  (JPEG/PNG/WebP), enforces `PHOTO_MAX_BYTES` (default 8 MB) and streams photos back itself.
- MinIO no longer publishes container images, so `deploy/minio.Dockerfile` builds the
  pinned upstream release from source. MinIO is AGPL-3.0.
- No TLS yet. Put a TLS-terminating proxy in front and set `COOKIE_SECURE=1`.
