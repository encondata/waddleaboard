-- Photo metadata. The bytes live in the private MinIO bucket under object_key.
CREATE TABLE photos (
  id uuid PRIMARY KEY,
  find_id bigint NOT NULL UNIQUE REFERENCES finds (id) ON DELETE CASCADE,
  object_key text NOT NULL UNIQUE,
  content_type text NOT NULL CHECK (content_type IN ('image/jpeg', 'image/png', 'image/webp')),
  size_bytes integer NOT NULL CHECK (size_bytes > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
