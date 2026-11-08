#!/bin/sh
# Runs MinIO as uid 1000. Started as root, it first hands /data to that user: a host folder
# that Docker created for a bind mount belongs to root, and MinIO could not write to it.
set -e
# The root password comes from the secrets volume unless it was given directly.
if [ -z "${MINIO_ROOT_PASSWORD:-}" ] && [ -n "${MINIO_ROOT_PASSWORD_FILE:-}" ]; then
  MINIO_ROOT_PASSWORD="$(cat "$MINIO_ROOT_PASSWORD_FILE")"
  export MINIO_ROOT_PASSWORD
  unset MINIO_ROOT_PASSWORD_FILE
fi
if [ "$(id -u)" = 0 ]; then
  [ "$(stat -c %u /data)" = 1000 ] || chown minio:minio /data
  exec su-exec minio minio "$@"
fi
exec minio "$@"
