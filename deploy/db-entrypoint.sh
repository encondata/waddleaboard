#!/bin/sh
# Prepares the stack's secrets, then starts PostgreSQL as the image normally does.
#
# Each secret is taken from its environment variable when that is set, so .env or a deployer
# such as Slipway decides. Otherwise one is generated on first start and kept in the secrets
# volume (/run/waddle), so a deploy works with no settings at all. The api and the photo
# store read the same files; they start only once this database is healthy.
set -eu
dir=/run/waddle
mkdir -p "$dir"

put() { # put NAME VALUE BYTES: the given value, or BYTES random bytes as hex if none is kept yet
  file="$dir/$1"
  if [ -n "$2" ]; then
    if [ ! -f "$file" ] || [ "$(cat "$file")" != "$2" ]; then printf '%s' "$2" > "$file.new" && mv -f "$file.new" "$file"; fi
    rm -f "$file.generated"
  elif [ ! -s "$file" ]; then
    head -c "$3" /dev/urandom | od -An -tx1 | tr -d ' \n' > "$file.new" && mv -f "$file.new" "$file"
    : > "$file.generated"
  fi
  chmod 444 "$file"
}

put postgres_password "${POSTGRES_PASSWORD:-}" 24
put minio_root_password "${MINIO_ROOT_PASSWORD:-}" 24
put session_secret "${SESSION_SECRET:-}" 32
put admin_password "${WADDLE_ADMIN_PASSWORD:-}" 12

# PostgreSQL reads its password from the file; the other values are not its business.
unset POSTGRES_PASSWORD MINIO_ROOT_PASSWORD SESSION_SECRET WADDLE_ADMIN_PASSWORD
export POSTGRES_PASSWORD_FILE="$dir/postgres_password"
exec docker-entrypoint.sh "$@"
