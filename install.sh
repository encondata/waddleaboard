#!/usr/bin/env bash
# Waddle Aboard installer: takes a Linux host with nothing but bash to a running site.
#
#   sudo ./install.sh
#
# Non-interactive (for testing / automation):
#   WADDLE_YES=1 WADDLE_INSTALL_DIR=/srv/waddle WADDLE_ADMIN_USER=admin \
#     WADDLE_ADMIN_PASSWORD='...' ./install.sh
#
# Optional env: WADDLE_WEB_PORT (default 80, first install only), WADDLE_SEED_DEMO=1 (first install only),
# WADDLE_CONF_FILE (default /etc/waddleaboard/install.conf; records the chosen install dir).
#
# Safe to re-run: it reuses the recorded install dir, never overwrites .env, and never creates a
# second admin.
set -euo pipefail

DEFAULT_INSTALL_DIR="/mntuser/waddleaboard"
CONF_FILE="${WADDLE_CONF_FILE:-/etc/waddleaboard/install.conf}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
YES="${WADDLE_YES:-0}"
PROJECT="waddleaboard"

SUDO=()
DOCKER=(docker)
INSTALL_DIR=""
APP_DIR=""
ENV_FILE=""
ADMIN_USER=""
ADMIN_PASSWORD=""

log() { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33mwarning:\033[0m %s\n' "$*" >&2; }
die() {
  printf '\033[1;31merror:\033[0m %s\n' "$*" >&2
  exit 1
}

interactive() { [[ "$YES" != "1" && -t 0 ]]; }

# --- privileges ------------------------------------------------------------

setup_privileges() {
  if [[ "${EUID:-$(id -u)}" -eq 0 ]]; then
    SUDO=()
  elif command -v sudo >/dev/null 2>&1; then
    SUDO=(sudo)
  else
    SUDO=()
  fi
}

as_root() {
  if [[ "${EUID:-$(id -u)}" -eq 0 ]]; then
    "$@"
  elif [[ ${#SUDO[@]} -gt 0 ]]; then
    "${SUDO[@]}" "$@"
  else
    die "This step needs root: re-run as root or install sudo. (Command: $*)"
  fi
}

# --- docker ----------------------------------------------------------------

os_family() {
  [[ -r /etc/os-release ]] || {
    echo unknown
    return
  }
  # shellcheck disable=SC1091
  . /etc/os-release
  local ids=" ${ID:-} ${ID_LIKE:-} "
  case "$ids" in
    *" ubuntu "*) echo ubuntu ;;
    *" debian "*) echo debian ;;
    *" fedora "*) [[ "${ID:-}" == fedora ]] && echo fedora || echo rhel ;;
    *" rhel "* | *" centos "*) echo rhel ;;
    *) echo unknown ;;
  esac
}

install_docker_debian() {
  local distro="$1"
  log "Installing Docker Engine and the Compose plugin from download.docker.com ($distro)"
  local codename
  # shellcheck disable=SC1091
  codename="$(. /etc/os-release && echo "${VERSION_CODENAME:-}")"
  [[ -n "$codename" ]] || die "Could not determine the $distro release codename from /etc/os-release."
  as_root apt-get update -y
  as_root apt-get install -y ca-certificates curl
  as_root install -m 0755 -d /etc/apt/keyrings
  as_root curl -fsSL "https://download.docker.com/linux/${distro}/gpg" -o /etc/apt/keyrings/docker.asc
  as_root chmod a+r /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/${distro} ${codename} stable" |
    as_root tee /etc/apt/sources.list.d/docker.list >/dev/null
  as_root apt-get update -y
  as_root apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
}

install_docker_rhel() {
  local repo="$1"
  log "Installing Docker Engine and the Compose plugin from download.docker.com ($repo)"
  if command -v dnf >/dev/null 2>&1; then
    as_root dnf -y install dnf-plugins-core
    if dnf config-manager --help 2>/dev/null | grep -q -- '--add-repo'; then
      as_root dnf config-manager --add-repo "https://download.docker.com/linux/${repo}/docker-ce.repo"
    else
      as_root dnf config-manager addrepo --from-repofile="https://download.docker.com/linux/${repo}/docker-ce.repo"
    fi
    as_root dnf -y install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  elif command -v yum >/dev/null 2>&1; then
    as_root yum install -y yum-utils
    as_root yum-config-manager --add-repo "https://download.docker.com/linux/${repo}/docker-ce.repo"
    as_root yum install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  else
    die "Neither dnf nor yum is available; install Docker manually and re-run."
  fi
}

ensure_docker() {
  if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
    log "Docker $(docker version --format '{{.Server.Version}}' 2>/dev/null || echo '(daemon not reachable yet)') with $(docker compose version --short 2>/dev/null | sed 's/^/Compose /')"
  else
    if [[ "$(uname -s)" != "Linux" ]]; then
      die "Docker with the Compose v2 plugin is required. On $(uname -s), install Docker Desktop and re-run."
    fi
    local family
    family="$(os_family)"
    case "$family" in
      ubuntu | debian) install_docker_debian "$family" ;;
      rhel) install_docker_rhel centos ;;
      fedora) install_docker_rhel fedora ;;
      *) die "Unsupported OS for automatic Docker install. Supported: Debian/Ubuntu and RHEL-family (RHEL, CentOS, Rocky, Alma, Fedora). Install Docker Engine + Compose v2 yourself, then re-run." ;;
    esac
    if command -v systemctl >/dev/null 2>&1; then
      as_root systemctl enable --now docker
    fi
    docker compose version >/dev/null 2>&1 || die "Docker installed but 'docker compose' is still unavailable."
  fi

  if docker info >/dev/null 2>&1; then
    DOCKER=(docker)
  elif [[ ${#SUDO[@]} -gt 0 ]] && "${SUDO[@]}" docker info >/dev/null 2>&1; then
    DOCKER=("${SUDO[@]}" docker)
  else
    if command -v systemctl >/dev/null 2>&1; then as_root systemctl start docker || true; fi
    if docker info >/dev/null 2>&1; then
      DOCKER=(docker)
    elif [[ ${#SUDO[@]} -gt 0 ]] && "${SUDO[@]}" docker info >/dev/null 2>&1; then
      DOCKER=("${SUDO[@]}" docker)
    else
      die "Cannot reach the Docker daemon. Is it running, and are you root or in the docker group?"
    fi
  fi
}

# --- install dir -----------------------------------------------------------

read_conf_dir() {
  [[ -r "$CONF_FILE" ]] || return 1
  local line
  line="$(grep -E '^INSTALL_DIR=' "$CONF_FILE" | tail -n 1)" || return 1
  line="${line#INSTALL_DIR=}"
  line="${line%\"}"
  line="${line#\"}"
  [[ -n "$line" ]] || return 1
  printf '%s' "$line"
}

record_conf_dir() {
  local dir="$1" tmp
  tmp="$(mktemp)"
  printf '# Written by Waddle Aboard install.sh\nINSTALL_DIR="%s"\n' "$dir" >"$tmp"
  if mkdir -p "$(dirname "$CONF_FILE")" 2>/dev/null && cp "$tmp" "$CONF_FILE" 2>/dev/null; then
    :
  else
    as_root mkdir -p "$(dirname "$CONF_FILE")"
    as_root cp "$tmp" "$CONF_FILE"
  fi
  rm -f "$tmp"
  log "Recorded install dir in $CONF_FILE"
}

resolve_install_dir() {
  local recorded=""
  recorded="$(read_conf_dir || true)"
  if [[ -n "${WADDLE_INSTALL_DIR:-}" ]]; then
    INSTALL_DIR="$WADDLE_INSTALL_DIR"
    if [[ -n "$recorded" && "$recorded" != "$INSTALL_DIR" ]]; then
      warn "WADDLE_INSTALL_DIR ($INSTALL_DIR) differs from the recorded install dir ($recorded); using $INSTALL_DIR."
    fi
  elif [[ -n "$recorded" ]]; then
    INSTALL_DIR="$recorded"
    log "Using recorded install dir $INSTALL_DIR"
  elif interactive; then
    local answer
    read -r -p "Install directory [$DEFAULT_INSTALL_DIR]: " answer
    INSTALL_DIR="${answer:-$DEFAULT_INSTALL_DIR}"
  else
    INSTALL_DIR="$DEFAULT_INSTALL_DIR"
  fi
  [[ "$INSTALL_DIR" == /* ]] || die "Install directory must be an absolute path (got '$INSTALL_DIR')."
  INSTALL_DIR="${INSTALL_DIR%/}"
  APP_DIR="$INSTALL_DIR/app"
  ENV_FILE="$INSTALL_DIR/.env"

  if [[ ! -d "$INSTALL_DIR" ]]; then
    mkdir -p "$INSTALL_DIR" 2>/dev/null || {
      as_root mkdir -p "$INSTALL_DIR"
      as_root chown "$(id -u):$(id -g)" "$INSTALL_DIR"
    }
  fi
  [[ -w "$INSTALL_DIR" ]] || die "$INSTALL_DIR is not writable; re-run with sudo."
  if [[ "$recorded" != "$INSTALL_DIR" ]]; then record_conf_dir "$INSTALL_DIR"; fi
}

# --- sources ---------------------------------------------------------------

sync_sources() {
  [[ -f "$SCRIPT_DIR/deploy/docker-compose.yml" ]] || die "Run install.sh from a Waddle Aboard checkout (deploy/docker-compose.yml not found next to it)."
  if [[ "$SCRIPT_DIR" == "$APP_DIR" ]]; then
    log "Running from the installed copy; sources already in place"
    return
  fi
  log "Copying app sources to $APP_DIR"
  mkdir -p "$APP_DIR"
  rm -rf "${APP_DIR:?}/api" "${APP_DIR:?}/web" "${APP_DIR:?}/db" "${APP_DIR:?}/deploy"
  local items=(api web db deploy package.json package-lock.json .npmrc .dockerignore .env.example install.sh README.md)
  local present=()
  local item
  for item in "${items[@]}"; do
    [[ -e "$SCRIPT_DIR/$item" ]] && present+=("$item")
  done
  tar -C "$SCRIPT_DIR" --exclude=node_modules --exclude=dist --exclude=.DS_Store -cf - "${present[@]}" | tar -C "$APP_DIR" -xf -
}

# --- secrets & .env --------------------------------------------------------

random_hex() {
  local bytes="$1"
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex "$bytes"
  else
    od -An -N "$bytes" -tx1 /dev/urandom | tr -d ' \n'
  fi
}

write_env() {
  if [[ -e "$ENV_FILE" ]]; then
    log "Keeping existing $ENV_FILE (never overwritten)"
    return 1
  fi
  local port="${WADDLE_WEB_PORT:-80}"
  [[ "$port" =~ ^[0-9]+$ ]] || die "WADDLE_WEB_PORT must be a number."
  local host_url="http://localhost"
  [[ "$port" == "80" ]] || host_url="http://localhost:$port"
  log "Writing $ENV_FILE with generated secrets"
  (
    umask 077
    cat >"$ENV_FILE" <<EOF
# Generated by Waddle Aboard install.sh on $(date -u +%Y-%m-%dT%H:%M:%SZ). Keep this file private.
WEB_PORT=$port
WEB_BIND=0.0.0.0
WEB_MAX_BODY_SIZE=12m
SITE_URL=$host_url
POSTGRES_DB=waddleaboard
POSTGRES_USER=waddle
POSTGRES_PASSWORD=$(random_hex 24)
MINIO_ROOT_USER=waddle
MINIO_ROOT_PASSWORD=$(random_hex 24)
MINIO_BUCKET=waddleaboard-photos
MINIO_RELEASE=RELEASE.2025-10-15T17-29-55Z
SESSION_SECRET=$(random_hex 32)
SESSION_TTL_HOURS=168
COOKIE_SECURE=0
PHOTO_MAX_BYTES=8388608
LOGIN_MAX_FAILURES=5
LOGIN_WINDOW_MINUTES=15
RUN_MIGRATIONS=1
SEED_DEMO=${WADDLE_SEED_DEMO:-0}
WADDLE_DATA_DIR=$INSTALL_DIR/data
EOF
  )
  chmod 600 "$ENV_FILE"
  return 0
}

env_value() {
  grep -E "^$1=" "$ENV_FILE" | tail -n 1 | cut -d= -f2-
}

prepare_data_dirs() {
  local data_dir
  data_dir="$(env_value WADDLE_DATA_DIR)"
  [[ -n "$data_dir" ]] || data_dir="$INSTALL_DIR/data"
  mkdir -p "$data_dir/postgres" "$data_dir/minio" 2>/dev/null || as_root mkdir -p "$data_dir/postgres" "$data_dir/minio"
  # The spaces (MinIO) container runs as uid 1000; postgres fixes its own ownership.
  if [[ "$(uname -s)" == "Linux" ]]; then
    if [[ "$(stat -c %u "$data_dir/minio")" != "1000" ]]; then
      as_root chown 1000:1000 "$data_dir/minio"
    fi
  fi
}

# --- admin -----------------------------------------------------------------

valid_username() { [[ "$1" =~ ^[A-Za-z0-9._-]{3,40}$ ]]; }

ask_admin() {
  [[ -n "$ADMIN_USER" && -n "$ADMIN_PASSWORD" ]] && return 0
  ADMIN_USER="${WADDLE_ADMIN_USER:-}"
  ADMIN_PASSWORD="${WADDLE_ADMIN_PASSWORD:-}"
  if [[ -n "$ADMIN_USER" && -n "$ADMIN_PASSWORD" ]]; then
    valid_username "$ADMIN_USER" || die "WADDLE_ADMIN_USER must be 3-40 letters, numbers, dots, dashes or underscores."
    [[ ${#ADMIN_PASSWORD} -ge 8 ]] || die "WADDLE_ADMIN_PASSWORD must be at least 8 characters."
    return 0
  fi
  interactive || die "No admin account exists yet. Set WADDLE_ADMIN_USER and WADDLE_ADMIN_PASSWORD, or run interactively."

  log "Create the first admin account"
  while :; do
    read -r -p "Admin username: " ADMIN_USER
    valid_username "$ADMIN_USER" && break
    warn "Use 3-40 letters, numbers, dots, dashes or underscores."
  done
  local confirm
  while :; do
    read -r -s -p "Admin password (min 8 characters): " ADMIN_PASSWORD
    echo
    if [[ ${#ADMIN_PASSWORD} -lt 8 ]]; then
      warn "Password must be at least 8 characters."
      continue
    fi
    read -r -s -p "Confirm password: " confirm
    echo
    [[ "$ADMIN_PASSWORD" == "$confirm" ]] && break
    warn "Passwords did not match; try again."
  done
}

# --- stack -----------------------------------------------------------------

compose() {
  "${DOCKER[@]}" compose -p "$PROJECT" -f "$APP_DIR/deploy/docker-compose.yml" --env-file "$ENV_FILE" "$@"
}

start_stack() {
  log "Building and starting the stack (the first build compiles MinIO and can take several minutes)"
  compose up -d --build --remove-orphans --wait --wait-timeout 900 ||
    die "The stack did not become healthy. Inspect with: docker compose -p $PROJECT -f $APP_DIR/deploy/docker-compose.yml --env-file $ENV_FILE logs"
  log "Checking /api/health through the web container"
  local _
  for _ in $(seq 1 30); do
    if compose exec -T web wget -q -O - http://127.0.0.1/api/health 2>/dev/null | grep -q '"status":"ok"'; then
      return 0
    fi
    sleep 2
  done
  die "The api health check did not pass through the web container."
}

run_migrations() {
  log "Running database migrations"
  compose exec -T api node api/src/cli.js migrate
}

seed_admin() {
  if compose exec -T api node api/src/cli.js has-admin >/dev/null 2>&1; then
    log "An admin account already exists; not creating another"
    return 0
  fi
  ask_admin
  log "Creating admin account '$ADMIN_USER'"
  # The password goes over stdin so it never appears in a process list or in .env.
  printf '%s' "$ADMIN_PASSWORD" | compose exec -T api node api/src/cli.js create-admin --username "$ADMIN_USER"
}

site_url() {
  local port host
  port="$(env_value WEB_PORT)"
  port="${port:-80}"
  host="$(hostname -I 2>/dev/null | awk '{print $1}' || true)"
  host="${host:-localhost}"
  if [[ "$port" == "80" ]]; then echo "http://$host/"; else echo "http://$host:$port/"; fi
}

main() {
  log "Waddle Aboard installer"
  setup_privileges
  ensure_docker
  resolve_install_dir
  sync_sources
  local fresh=0
  if write_env; then fresh=1; fi
  # Ask for the admin before the long build on a first install.
  if [[ "$fresh" == "1" ]]; then ask_admin; fi
  prepare_data_dirs
  start_stack
  run_migrations
  seed_admin
  log "Waddle Aboard is running at $(site_url)"
  log "Admin login: $(site_url)login"
}

main "$@"
