-- Accounts. Finders never need one; admins create owner accounts.
CREATE TABLE users (
  id bigserial PRIMARY KEY,
  username text NOT NULL CHECK (username ~ '^[A-Za-z0-9._-]{3,40}$'),
  display_name text,
  password_hash text NOT NULL,
  role text NOT NULL DEFAULT 'owner' CHECK (role IN ('admin', 'owner')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_username_lower_idx ON users (lower(username));

-- Login sessions. Only an HMAC of the cookie token is stored.
CREATE TABLE sessions (
  token_hash text PRIMARY KEY,
  user_id bigint NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
CREATE INDEX sessions_expires_at_idx ON sessions (expires_at);
