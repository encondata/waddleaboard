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
| `deploy/` | Dockerfiles, nginx config, `smoke-test.sh` |
| `docker-compose.yml` | The stack: `db` (PostgreSQL), `spaces` (MinIO), `api`, `web` (nginx) |
| `install.sh` | One-line installer for a Docker host |

## Install on a server

On a Linux machine with Docker and Compose v2:

```bash
curl -fsSL https://raw.githubusercontent.com/encondata/waddleaboard/main/install.sh | bash
```

It asks where to install (default `~/waddleaboard`, or `/mnt/user/waddleaboard` on Unraid) and the
address people will use, clones the repository, writes `.env` with fresh secrets and an administrator
account, builds the images and starts the stack. The first build compiles MinIO from source and takes
several minutes. The database and photos live in `data/postgres` and `data/minio` inside the install
folder (set `WADDLE_DATA_DIR` in `.env` to move them). Back up `.env` and `data/`.

Run the same command again to update: it keeps `.env` and the data, and only prints the admin
password while it still works. `WADDLE_DIR`, `WADDLE_SITE_URL`, `WADDLE_PORT`, `WADDLE_ADMIN_USER`,
`WADDLE_ADMIN_PASSWORD` and `WADDLE_SEED_DEMO=1` (loads Sunny DP-0427 and the other sample ducks)
answer the questions up front; `WADDLE_REPO` and `WADDLE_BRANCH` pick another source.

Waddle Aboard serves plain HTTP on port 8430 (`WEB_PORT`) for a TLS reverse proxy. Give the installer
the proxy's `https://` address and it marks sign-in cookies secure (`COOKIE_SECURE=1`), after which
signing in works only through the proxy.

An install made by the earlier installer (sources copied to `<dir>/app`, recorded in
`/etc/waddleaboard/install.conf`) is picked up: install into a new folder and its `.env` and data
folder are carried over.

### Operating the stack

```bash
cd ~/waddleaboard                # or wherever you installed it
docker compose ps                # health of web, api, db, spaces
docker compose logs -f api
docker compose exec -T api node api/src/cli.js create-user --username pat --role owner <<< 'owner-password'
docker compose exec -T api node api/src/cli.js seed-demo
```

Admins can also add owners and ducks from `/admin`.

## Develop

Requires Node 22 and npm 11.

```bash
npm install                      # installs the api and web workspaces
cp .env.example .env             # then set real passwords and a SESSION_SECRET
docker compose up -d --build
```

The site is then at `http://localhost:8430` (or `WEB_PORT`). For hot reload, keep `db` and
`spaces` running in compose and run the api and Vite locally:

```bash
docker compose up -d db spaces
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
BASE_URL=http://localhost:8430 WADDLE_ADMIN_USER=admin WADDLE_ADMIN_PASSWORD=... deploy/smoke-test.sh
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

A **duck type** (series) is a design, such as Sunny or Coral. It holds the name, color, accent,
artwork and default story. Every physical duck is an **individual** of one series. It has no name
of its own. It is identified by series name plus serial, for example "Sunny · Serial DP-0427",
where the code (`DP-0427`) is its serial number. Each individual has its own guest book, owner,
status and miles. A duck's own color, accent, artwork or story overrides the series' values when
set. Duck JSON includes `serial`, `name` (always the series name) and
`type: { slug, name, color, accent, imageUrl }`.

**Privacy.** A duck's trip details (`status`, `homePort`, `ship`, `miles`, `lastSeen`) and any
owner-written story are returned only to the duck's owner. Everyone else gets them as `null` and
`private: true`, with the series story in place of the owner's. "Everyone else" includes anonymous
visitors, other owners and admins viewing ducks they do not own. This applies on every endpoint
that returns ducks. Guest-book entries (`/api/ducks/:code/finds`) stay public, because they are
the shared journey.

- `POST /api/admin/duck-types` with `{ slug, name, color, accent?, imageUrl?, story? }` creates
  a type. A slug is 2-40 lowercase letters, numbers or dashes. A duplicate slug returns 409
  `duck_type_exists`.
- `POST /api/admin/duck-types/:slug/ducks` with `{ count, prefix?, owner? }` registers `count`
  (1-100) ducks of that type in one transaction. They get the next free serials after the highest
  one under `prefix` (default `DP`), zero-padded to 4 digits, for example `DP-0429`, `DP-0430`. The
  response lists the new `serials`.
- `POST /api/admin/ducks` accepts an optional `type` slug. With a type, `color` is optional and
  any `name` is ignored. Without one, `name` and `color` name the series: the duck joins the
  series with the same name and color, or a new one is created.

Migration `005_duck_types.sql` backfills existing ducks into types grouped by name and color.

## Notes

- Photos live in a private MinIO bucket. The API checks each file's magic bytes
  (JPEG/PNG/WebP), enforces `PHOTO_MAX_BYTES` (default 8 MB) and streams photos back itself.
- MinIO no longer publishes container images, so `deploy/minio.Dockerfile` builds the
  pinned upstream release from source. MinIO is AGPL-3.0.
- No TLS of its own. Put a TLS-terminating proxy in front; `COOKIE_SECURE=1` (set by the installer
  for an `https://` address) keeps the session cookie off plain HTTP.
