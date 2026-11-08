# MinIO no longer publishes container images, so build the server from the
# upstream release tag. Bump MINIO_RELEASE to upgrade.
# MinIO is AGPL-3.0 licensed; running it unmodified for self-hosting is fine.
ARG MINIO_RELEASE=RELEASE.2025-10-15T17-29-55Z

FROM golang:1.24-alpine AS build
ARG MINIO_RELEASE
RUN apk add --no-cache git
ENV CGO_ENABLED=0
RUN git clone --depth 1 --branch ${MINIO_RELEASE} https://github.com/minio/minio.git /src
WORKDIR /src
RUN go build -trimpath -tags kqueue \
      -ldflags "-s -w $(go run buildscripts/gen-ldflags.go)" \
      -o /out/minio .

FROM alpine:3.22
RUN apk add --no-cache ca-certificates su-exec \
 && adduser -D -H -u 1000 minio \
 && mkdir /data && chown minio:minio /data
COPY --from=build /out/minio /usr/local/bin/minio
# Starts as root only to give /data to the minio user, then runs MinIO as that user.
COPY minio-entrypoint.sh /usr/local/bin/minio-entrypoint.sh
RUN chmod 755 /usr/local/bin/minio-entrypoint.sh
VOLUME /data
EXPOSE 9000 9001
ENTRYPOINT ["minio-entrypoint.sh"]
CMD ["server", "/data", "--console-address", ":9001"]
