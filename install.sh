#!/usr/bin/env bash
# Waddle Aboard server installer.
#
#   curl -fsSL https://raw.githubusercontent.com/encondata/waddleaboard/main/install.sh | bash
#
# Clones or updates the repository, writes .env with fresh secrets and an administrator
# account on first run, builds the images and brings the stack up. Safe to run again: it
# never overwrites an existing .env, and it never invents a second administrator.
#
# Waddle Aboard serves plain HTTP on port 8430 and expects a reverse proxy in front of it for TLS.
set -euo pipefail

# Under curl | bash, bash reads this script from standard input while it runs, so a command
# that also reads standard input would swallow the rest of it. Everything is in main(), which
# bash reads in full before running any of it.
main() {

REPO="${WADDLE_REPO:-https://github.com/encondata/waddleaboard.git}"
BRANCH="${WADDLE_BRANCH:-main}"

say() { printf '\n\033[1m%s\033[0m\n' "$*"; }
warn() { printf '\n\033[33m%s\033[0m\n' "$*" >&2; }
die() { printf '\n\033[31m%s\033[0m\n' "$*" >&2; exit 1; }
# Ask on the terminal even under curl | bash (which has the script, not the keyboard, on
# standard input). With no terminal at all the suggestion is used.
ask() { # ask "Question" "suggestion" -> answer on stdout
  local answer=""
  if { exec 3</dev/tty; } 2>/dev/null; then
    printf '\n%s [%s] ' "$1" "$2" > /dev/tty
    read -r answer <&3 || answer=""
    exec 3<&-
  fi
  printf '%s' "${answer:-$2}"
}

UNRAID=no; [ -d /mnt/user ] && [ -f /etc/unraid-version ] && UNRAID=yes
if ! command -v git >/dev/null 2>&1; then
  [ "$UNRAID" = yes ] && die "git is not installed. On Unraid, add it with the NerdTools or un-get plugin (Apps tab), then run this again."
  die "git is not installed."
fi
command -v curl >/dev/null 2>&1 || die "curl is not installed."
command -v docker >/dev/null 2>&1 || die "docker is not installed. See https://docs.docker.com/get-docker/"
if ! docker compose version >/dev/null 2>&1; then
  [ "$UNRAID" = yes ] && die "This needs Docker Compose v2. On Unraid, install the Docker Compose Manager plugin (Apps tab), then run this again."
  die "This needs Docker Compose v2 (the 'docker compose' subcommand)."
fi
docker info >/dev/null 2>&1 || die "Docker is installed but not running. Start it and try again."

# Where it runs now, if it does. An install made by the first installer (sources copied to
# <dir>/app, recorded in /etc/waddleaboard/install.conf) is not a git checkout, so it cannot
# be updated in place; its settings and data are brought over instead.
RUNNING_WD="$(docker inspect -f '{{ index .Config.Labels "com.docker.compose.project.working_dir" }}' \
  waddleaboard-web-1 2>/dev/null || true)"
OLD_DIR=""
case "$RUNNING_WD" in */app/deploy) OLD_DIR="${RUNNING_WD%/app/deploy}"; RUNNING_WD="" ;; esac
if [ -z "$OLD_DIR" ] && [ -r /etc/waddleaboard/install.conf ]; then
  OLD_DIR="$(sed -n 's/^INSTALL_DIR="\{0,1\}\([^"]*\)"\{0,1\}$/\1/p' /etc/waddleaboard/install.conf | tail -1)"
fi
if [ -n "$OLD_DIR" ] && { [ ! -f "$OLD_DIR/.env" ] || [ -d "$OLD_DIR/.git" ]; }; then OLD_DIR=""; fi

# Where it goes. Suggested: where it runs now, so an update is just Enter; otherwise the
# array on Unraid, or the home directory. WADDLE_DIR skips the question.
if [ -n "$RUNNING_WD" ]; then DEFAULT_DIR="$RUNNING_WD"
elif [ -d /mnt/user ]; then DEFAULT_DIR=/mnt/user/waddleaboard
else DEFAULT_DIR="$HOME/waddleaboard"; fi
DIR="${WADDLE_DIR:-}"
[ -n "$DIR" ] || DIR="$(ask "Install Waddle Aboard where?" "$DEFAULT_DIR")"
case "$DIR" in "~"*) DIR="$HOME${DIR#\~}" ;; esac
DIR="${DIR%/}"
case "$DIR" in /*) ;; *) die "Please give a full path, starting with /." ;; esac
if [ -n "$RUNNING_WD" ] && [ "$DIR" != "$RUNNING_WD" ]; then
  die "Waddle Aboard is already running from $RUNNING_WD. Run this again and keep that folder, or stop it first:
  docker compose -f $RUNNING_WD/docker-compose.yml down"
fi
if [ -n "$OLD_DIR" ] && [ "$DIR" = "$OLD_DIR" ]; then
  die "$DIR holds an install made by the earlier installer, which this one cannot update in place.
Choose a new folder: its settings and data will be brought over from $DIR."
fi
# Somewhere with files in it that are not Waddle Aboard would make git refuse to clone.
if [ -d "$DIR" ] && [ ! -d "$DIR/.git" ] && [ -n "$(ls -A "$DIR" 2>/dev/null)" ]; then
  die "$DIR already has other files in it. Choose an empty or new folder."
fi

# When something will not start: which containers are up, and the last words of each, so
# the reason is on screen rather than behind another command.
report() {
  printf '\n\033[1mContainers:\033[0m\n' >&2
  docker compose ps -a >&2 || true
  for svc in db spaces api web; do
    printf '\n\033[1mLast lines from %s:\033[0m\n' "$svc" >&2
    docker compose logs --no-color --tail 25 "$svc" >&2 2>&1 || true
  done
}

# The compose file lives in the repository, so the code has to come first.
if [ -d "$DIR/.git" ]; then
  say "Updating $DIR"
  git -C "$DIR" fetch --depth 1 origin "$BRANCH"
  git -C "$DIR" checkout -q "$BRANCH"
  git -C "$DIR" reset --hard "origin/$BRANCH"
else
  say "Cloning into $DIR"
  git clone --depth 1 --branch "$BRANCH" "$REPO" "$DIR"
fi

cd "$DIR"

# A little randomness, from openssl when it is there and /dev/urandom when it is not.
rand_hex() {
  if command -v openssl >/dev/null 2>&1; then openssl rand -hex "$1"
  else head -c "$1" /dev/urandom | od -An -tx1 | tr -d ' \n'; fi
}
env_value() { sed -n "s/^$1=//p" .env | tail -1; }
# This machine's LAN address, for suggesting where to open the site.
lan_ip() {
  local ip
  ip="$( (hostname -I 2>/dev/null || true) | awk '{print $1}')"
  [ -n "$ip" ] || ip="$( (ip -4 route get 1.1.1.1 2>/dev/null || true) | sed -n 's/.* src \([0-9.]*\).*/\1/p')"
  printf '%s' "${ip:-localhost}"
}

ADOPTED=no
if [ ! -f .env ] && [ -n "$OLD_DIR" ]; then
  # Same passwords and the same data folder, so the database and photos carry on as they were.
  say "Bringing over the settings and data of the earlier install in $OLD_DIR"
  cp "$OLD_DIR/.env" .env
  chmod 600 .env
  grep -q '^WADDLE_DATA_DIR=/' .env || printf '\nWADDLE_DATA_DIR=%s/data\n' "$OLD_DIR" >> .env
  ADOPTED=yes
elif [ ! -f .env ]; then
  PORT="${WADDLE_PORT:-8430}"
  case "$PORT" in ''|*[!0-9]*) die "WADDLE_PORT must be a number." ;; esac
  URL="${WADDLE_SITE_URL:-}"
  [ -n "$URL" ] || URL="$(ask "Public address people will use (your reverse proxy's https:// URL)?" \
    "http://$(lan_ip):$PORT")"
  URL="${URL%/}"
  case "$URL" in http://*|https://*) ;; *) die "The address must start with http:// or https://." ;; esac
  SECURE=0; case "$URL" in https://*) SECURE=1 ;; esac
  ADMIN_USER="${WADDLE_ADMIN_USER:-admin}"
  printf '%s' "$ADMIN_USER" | grep -Eq '^[A-Za-z0-9._-]{3,40}$' ||
    die "WADDLE_ADMIN_USER must be 3-40 letters, numbers, dots, dashes or underscores."
  ADMIN_PASSWORD="${WADDLE_ADMIN_PASSWORD:-$(rand_hex 12)}"
  [ "${#ADMIN_PASSWORD}" -ge 8 ] || die "WADDLE_ADMIN_PASSWORD must be at least 8 characters."

  say "Generating secrets and an administrator password"
  {
    printf '# Waddle Aboard settings, written by install.sh. See .env.example for every option.\n'
    printf '# The address people use. An https:// address turns on secure cookies.\n'
    printf 'SITE_URL=%s\n' "$URL"
    printf 'COOKIE_SECURE=%s\n' "$SECURE"
    printf '# Port on this machine for the reverse proxy to forward to, and the interface it\n'
    printf '# listens on (127.0.0.1 when the proxy runs on this machine).\n'
    printf 'WEB_PORT=%s\n' "$PORT"
    printf 'WEB_BIND=0.0.0.0\n\n'
    printf '# Back these up together with the data folder.\n'
    printf 'POSTGRES_PASSWORD=%s\n' "$(rand_hex 24)"
    printf 'MINIO_ROOT_PASSWORD=%s\n' "$(rand_hex 24)"
    printf 'SESSION_SECRET=%s\n\n' "$(rand_hex 32)"
    printf '# The database (postgres/) and photos (minio/) live here.\n'
    printf 'WADDLE_DATA_DIR=%s/data\n\n' "$DIR"
    printf '# The first administrator. Used only when there is no administrator yet;\n'
    printf '# after that it is ignored, and the password here is just a record of what\n'
    printf '# was set.\n'
    printf 'WADDLE_ADMIN_USER=%s\n' "$ADMIN_USER"
    printf 'WADDLE_ADMIN_PASSWORD=%s\n\n' "$ADMIN_PASSWORD"
    printf '# 1 loads the sample ducks (Sunny DP-0427 and friends) each time the api starts.\n'
    printf 'SEED_DEMO=%s\n' "${WADDLE_SEED_DEMO:-0}"
  } > .env
  chmod 600 .env
fi

DATA_DIR="$(env_value WADDLE_DATA_DIR)"; DATA_DIR="${DATA_DIR:-./data}"
case "$DATA_DIR" in /*) ;; *) DATA_DIR="$DIR/${DATA_DIR#./}" ;; esac
mkdir -p "$DATA_DIR/postgres" "$DATA_DIR/minio" || die "Could not make $DATA_DIR. Is $DIR writable?"

say "Pulling images"
docker compose pull db

# The photo store runs as uid 1000 and cannot write to a folder it does not own. Docker can
# change that without sudo, using the database image that is already here.
if [ "$(uname -s)" = Linux ] && [ "$(stat -c %u "$DATA_DIR/minio")" != 1000 ]; then
  docker run --rm --user 0 -v "$DATA_DIR/minio:/d" --entrypoint chown postgres:17-alpine 1000:1000 /d \
    </dev/null || die "Could not hand $DATA_DIR/minio to the photo store (uid 1000)."
fi

say "Building and starting"
echo "The first build compiles the photo store (MinIO) from source, which takes several minutes."
UP_ARGS=(-d --build --remove-orphans)
# The earlier install's containers have the same names; replace them rather than keep them.
[ "$ADOPTED" = yes ] && UP_ARGS+=(--force-recreate)
if ! docker compose up "${UP_ARGS[@]}"; then
  report
  die "Waddle Aboard could not be started; the reason is above. If port $(env_value WEB_PORT) is already in use, set WEB_PORT in $DIR/.env and run this again."
fi

PORT="$(env_value WEB_PORT)"; PORT="${PORT:-8430}"
BIND="$(env_value WEB_BIND)"; BIND="${BIND:-0.0.0.0}"
URL="$(env_value SITE_URL)"; URL="${URL:-http://$(lan_ip):$PORT}"
BASE="http://127.0.0.1:$PORT"

printf '\nWaiting for the server'
UP=no
for _ in $(seq 1 90); do
  if curl -fsS "$BASE/api/health" >/dev/null 2>&1; then UP=yes; break; fi
  printf '.'; sleep 2
done
printf '\n'
if [ "$UP" != yes ]; then
  report
  die "The server did not answer on $BASE within three minutes; the reason is above. Once it is fixed, run this again: your data is kept."
fi

ADMIN_USER="$(env_value WADDLE_ADMIN_USER)"
ADMIN_PASSWORD="$(env_value WADDLE_ADMIN_PASSWORD)"
if [ -n "$ADMIN_USER" ] && [ -n "$ADMIN_PASSWORD" ] &&
   ! docker compose exec -T api node api/src/cli.js has-admin </dev/null >/dev/null 2>&1; then
  say "Creating the administrator $ADMIN_USER"
  # Over standard input, so the password never shows in a process list.
  if ! printf '%s' "$ADMIN_PASSWORD" | docker compose exec -T api node api/src/cli.js create-admin --username "$ADMIN_USER"; then
    warn "The administrator could not be created; the reason is above."
  fi
fi

# Rather than assume the account was created, try it. A 200 means these credentials are
# live and worth printing; anything else means an administrator already existed with a
# different password, and printing this one would be a lie.
ADMIN_WORKS=no
if [ -n "$ADMIN_USER" ] && [ -n "$ADMIN_PASSWORD" ]; then
  CODE="$(curl -s -o /dev/null -w '%{http_code}' -X POST \
    -H 'Content-Type: application/json' \
    --data "{\"username\":\"$ADMIN_USER\",\"password\":\"$ADMIN_PASSWORD\"}" \
    "$BASE/api/auth/login" 2>/dev/null || true)"
  [ "$CODE" = "200" ] && ADMIN_WORKS=yes
fi

# What the database holds, so an update can be seen to have kept everything.
PG_USER="$(env_value POSTGRES_USER)"; PG_USER="${PG_USER:-waddle}"
PG_DB="$(env_value POSTGRES_DB)"; PG_DB="${PG_DB:-waddleaboard}"
HELD="$(docker compose exec -T db psql -U "$PG_USER" -d "$PG_DB" -Atc \
  "SELECT (SELECT count(*) FROM duck_types) || ' duck types, ' || (SELECT count(*) FROM ducks) || ' ducks, ' ||
          (SELECT count(*) FROM finds) || ' finds, ' || (SELECT count(*) FROM users) || ' accounts'" \
  </dev/null 2>/dev/null || true)"

say "Waddle Aboard is up."
cat <<SUMMARY

  Listening on      $BIND:$PORT  (plain HTTP, for your reverse proxy)
  Public address    $URL

  Installed in      $DIR
  Data in           $DATA_DIR
  Holding           ${HELD:-(could not read the database)}

  Back up $DIR/.env and $DATA_DIR.
SUMMARY

if [ "$ADOPTED" = yes ]; then
  cat <<MOVED

The earlier install in $OLD_DIR has been replaced by this one. Its data is
still used where it is ($DATA_DIR); $OLD_DIR/app, $OLD_DIR/.env and
/etc/waddleaboard/install.conf are no longer needed.
MOVED
fi

if [ "$ADMIN_WORKS" = yes ]; then
  cat <<ADMIN

Sign in at $URL/login with

  Username    $ADMIN_USER
  Password    $ADMIN_PASSWORD

This is also kept in $DIR/.env.
ADMIN
else
  printf '\nAn administrator account already exists, so no new one was made.\n'
  [ -n "$ADMIN_PASSWORD" ] && printf 'The password in .env is not its password.\n'
  cat <<ADMIN
If nobody knows the password any more, add another administrator with a
name not taken yet:

  printf '%s' 'a-new-password' | docker compose -f $DIR/docker-compose.yml \\
    exec -T api node api/src/cli.js create-admin --username another-admin
ADMIN
fi

if [ "$(env_value COOKIE_SECURE)" = 1 ]; then
  cat <<TLS

Sign-in cookies are marked secure, so signing in works only through
$URL, not on port $PORT directly.
TLS
fi

cat <<TAIL

  Update   run this installer again
  Logs     docker compose -f $DIR/docker-compose.yml logs -f
  Stop     docker compose -f $DIR/docker-compose.yml down
TAIL
}

main "$@"
