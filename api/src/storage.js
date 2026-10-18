// MinIO (S3-compatible) photo storage. The bucket stays private; the api proxies reads.
import { Client } from "minio";

export function createMinioStorage(cfg) {
  const client = new Client({
    endPoint: cfg.endPoint,
    port: cfg.port,
    useSSL: cfg.useSSL,
    accessKey: cfg.accessKey,
    secretKey: cfg.secretKey,
    region: cfg.region,
  });
  const bucket = cfg.bucket;

  return {
    bucket,
    async ping() {
      if (!(await client.bucketExists(bucket))) throw new Error(`bucket ${bucket} is missing`);
    },
    async ensureBucket() {
      if (!(await client.bucketExists(bucket))) {
        await client.makeBucket(bucket, cfg.region);
        return true;
      }
      return false;
    },
    async putObject(key, buffer, contentType) {
      await client.putObject(bucket, key, buffer, buffer.length, { "Content-Type": contentType });
    },
    getObject(key) {
      return client.getObject(bucket, key);
    },
    async removeObject(key) {
      await client.removeObject(bucket, key);
    },
  };
}
