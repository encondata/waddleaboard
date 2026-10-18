-- Duck types (designs such as Sunny or Coral). Each row in ducks becomes an individual of a
-- type: ducks.code is its serial number. Shared design lives on the type; a duck's own
-- color, accent, image_url and story override the type's when set.
CREATE TABLE duck_types (
  id bigserial PRIMARY KEY,
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9-]{2,40}$'),
  name text NOT NULL,
  color text NOT NULL,
  accent text NOT NULL DEFAULT 'gold' CHECK (accent IN ('gold', 'coral', 'mint', 'blue')),
  image_url text,
  story text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ducks ADD COLUMN type_id bigint REFERENCES duck_types (id) ON DELETE RESTRICT;

-- Individuals may now inherit color and accent from their type.
ALTER TABLE ducks ALTER COLUMN color DROP NOT NULL;
ALTER TABLE ducks ALTER COLUMN accent DROP NOT NULL;
ALTER TABLE ducks ALTER COLUMN accent DROP DEFAULT;

-- Backfill: one type per distinct (lower(name), lower(color)). The type copies the design of the
-- oldest duck in the group. Slugs come from the name, with -2, -3... on collision.
DO $$
DECLARE
  g record;
  base text;
  candidate text;
  n int;
  new_id bigint;
BEGIN
  FOR g IN
    SELECT (array_agg(id ORDER BY id))[1] AS first_id, lower(name) AS lname, lower(color) AS lcolor
    FROM ducks
    GROUP BY lower(name), lower(color)
    ORDER BY min(id)
  LOOP
    SELECT left(trim(BOTH '-' FROM regexp_replace(lower(d.name), '[^a-z0-9]+', '-', 'g')), 36)
      INTO base FROM ducks d WHERE d.id = g.first_id;
    base := trim(BOTH '-' FROM base);
    IF length(base) < 2 THEN base := 'duck'; END IF;
    candidate := base;
    n := 1;
    WHILE EXISTS (SELECT 1 FROM duck_types WHERE slug = candidate) LOOP
      n := n + 1;
      candidate := base || '-' || n;
    END LOOP;

    INSERT INTO duck_types (slug, name, color, accent, image_url, story)
    SELECT candidate, d.name, d.color, d.accent, d.image_url, d.story FROM ducks d WHERE d.id = g.first_id
    RETURNING id INTO new_id;

    UPDATE ducks SET type_id = new_id WHERE lower(name) = g.lname AND lower(color) = g.lcolor;
  END LOOP;
END
$$;

ALTER TABLE ducks ALTER COLUMN type_id SET NOT NULL;
CREATE INDEX ducks_type_id_idx ON ducks (type_id);
