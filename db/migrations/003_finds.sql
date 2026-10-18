-- Guest-book entries. New finds are pending until an admin approves them.
CREATE TABLE finds (
  id bigserial PRIMARY KEY,
  duck_id bigint NOT NULL REFERENCES ducks (id) ON DELETE CASCADE,
  finder_name text NOT NULL,
  place text NOT NULL,
  spot text,
  note text NOT NULL,
  rehidden boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'flagged')),
  image_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  moderated_at timestamptz,
  moderated_by bigint REFERENCES users (id) ON DELETE SET NULL
);
CREATE INDEX finds_duck_status_idx ON finds (duck_id, status, created_at DESC);
CREATE INDEX finds_status_idx ON finds (status, created_at DESC);
