CREATE TABLE ducks (
  id bigserial PRIMARY KEY,
  code text NOT NULL UNIQUE CHECK (code ~ '^[A-Z]{2,4}-[0-9]{3,6}$'),
  name text NOT NULL,
  color text NOT NULL,
  accent text NOT NULL DEFAULT 'gold' CHECK (accent IN ('gold', 'coral', 'mint', 'blue')),
  status text NOT NULL DEFAULT 'Sailing'
    CHECK (status IN ('Sailing', 'At sea', 'On shore', 'Rehidden', 'Adopted', 'Retired')),
  story text,
  home_port text,
  ship text,
  miles integer NOT NULL DEFAULT 0 CHECK (miles >= 0),
  image_url text,
  owner_id bigint REFERENCES users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ducks_owner_id_idx ON ducks (owner_id);
