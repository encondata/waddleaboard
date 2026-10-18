-- Demo content from the duckport-site sample. Only runs when SEED_DEMO=1. Safe to re-run.
-- Designs first. Slugs match what migration 005 derives for the original four demo ducks.
INSERT INTO duck_types (slug, name, color, accent, image_url, story)
VALUES
  ('sunny', 'Sunny', 'Marigold', 'gold', '/assets/duckport/sunny-hero.png',
   'Sunny began his voyage in Galveston with one mission: collect bright stories from kind people around the world.'),
  ('coral', 'Coral', 'Coral', 'coral', '/assets/duckport/coral-portrait.png',
   'Coral loves a sandy beach and a good postcard.'),
  ('minty', 'Minty', 'Seafoam', 'mint', '/assets/duckport/minty-portrait.png',
   'Minty has hopped between six islands and counting.'),
  ('skipper', 'Skipper', 'Blue', 'blue', '/assets/duckport/blue-portrait.png',
   'Skipper prefers the open ocean and long sea days.')
ON CONFLICT (slug) DO NOTHING;

-- Individuals. The first four carry their own design (as before types existed); the extra
-- Sunnys inherit color, accent, artwork and story from their type.
INSERT INTO ducks (code, type_id, name, color, accent, status, story, home_port, ship, miles, image_url)
SELECT v.code, t.id, v.name, v.color, v.accent, v.status, v.story, v.home_port, v.ship, v.miles, v.image_url
FROM (VALUES
  ('DP-0427', 'sunny', 'Sunny', 'Marigold', 'gold', 'Sailing',
   'Sunny began his voyage in Galveston with one mission: collect bright stories from kind people around the world.',
   'Galveston', 'Harmony of the Seas', 1284, '/assets/duckport/sunny-hero.png'),
  ('DP-0912', 'coral', 'Coral', 'Coral', 'coral', 'On shore',
   'Coral loves a sandy beach and a good postcard.', 'Miami', 'Wonder of the Seas', 862,
   '/assets/duckport/coral-portrait.png'),
  ('DP-1180', 'minty', 'Minty', 'Seafoam', 'mint', 'Rehidden',
   'Minty has hopped between six islands and counting.', 'Fort Lauderdale', 'Celebrity Beyond', 2016,
   '/assets/duckport/minty-portrait.png'),
  ('DP-1564', 'skipper', 'Skipper', 'Blue', 'blue', 'At sea',
   'Skipper prefers the open ocean and long sea days.', 'Port Canaveral', 'Carnival Jubilee', 734,
   '/assets/duckport/blue-portrait.png'),
  ('DP-0428', 'sunny', 'Sunny', NULL, NULL, 'Sailing', NULL, 'Galveston', 'Harmony of the Seas', 0, NULL),
  ('DP-0429', 'sunny', 'Sunny', NULL, NULL, 'Sailing', NULL, 'Miami', 'Wonder of the Seas', 0, NULL)
) AS v (code, type_slug, name, color, accent, status, story, home_port, ship, miles, image_url)
JOIN duck_types t ON t.slug = v.type_slug
ON CONFLICT (code) DO NOTHING;

INSERT INTO finds (duck_id, finder_name, place, spot, note, rehidden, status, image_url, created_at, moderated_at)
SELECT d.id, v.finder_name, v.place, v.spot, v.note, v.rehidden, v.status, v.image_url, v.created_at::timestamptz,
       CASE WHEN v.status = 'approved' THEN v.created_at::timestamptz END
FROM (VALUES
  ('DP-0427', 'Maya & Luis', 'Galveston, Texas', 'Terminal 10, waiting to board',
   'Our first cruise duck! Sunny came aboard with us and started his big adventure before sail-away.',
   true, 'approved', '/assets/duckport/galveston.png', '2026-10-08T15:00:00Z'),
  ('DP-0427', 'The Ortega family', 'Cozumel, Mexico', 'Near the pool deck, after a very serious taco lunch',
   'Sunny made our sea day! We signed the log and tucked him near a sunny window for the next explorer.',
   true, 'approved', '/assets/duckport/cozumel.png', '2026-10-12T18:00:00Z'),
  ('DP-0912', 'Jules & Sam', 'Nassau, Bahamas', 'By the straw market',
   'Found Coral watching the boats come in. She is off to the beach with us.',
   true, 'pending', NULL, '2026-10-17T12:00:00Z'),
  ('DP-0427', 'The Parkers', 'Costa Maya, Mexico', 'Lido deck, by the ice-cream counter',
   'Sunny is heading to the next port with a new friend.',
   true, 'pending', NULL, '2026-10-17T13:00:00Z'),
  ('DP-1180', 'Nana B.', 'St. Thomas, USVI', 'Atrium, deck 5',
   'Minty is on the move again!', true, 'approved', NULL, '2026-10-10T10:00:00Z')
) AS v (code, finder_name, place, spot, note, rehidden, status, image_url, created_at)
JOIN ducks d ON d.code = v.code
WHERE NOT EXISTS (
  SELECT 1 FROM finds f WHERE f.duck_id = d.id AND f.finder_name = v.finder_name AND f.place = v.place
);
