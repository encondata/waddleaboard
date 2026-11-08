#!/bin/sh
# Runs MinIO as uid 1000. Started as root, it first hands /data to that user: a host folder
# that Docker created for a bind mount belongs to root, and MinIO could not write to it.
set -e
if [ "$(id -u)" = 0 ]; then
  [ "$(stat -c %u /data)" = 1000 ] || chown minio:minio /data
  exec su-exec minio minio "$@"
fi
exec minio "$@"
