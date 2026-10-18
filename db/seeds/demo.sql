-- Demo content from the duckport-site sample. Only runs when SEED_DEMO=1. Safe to re-run.
INSERT INTO ducks (code, name, color, accent, status, story, home_port, ship, miles, image_url)
VALUES
  ('DP-0427', 'Sunny', 'Marigold', 'gold', 'Sailing',
   'Sunny began his voyage in Galveston with one mission: collect bright stories from kind people around the world.',
   'Galveston', 'Harmony of the Seas', 1284, '/assets/duckport/sunny-hero.png'),
  ('DP-0912', 'Coral', 'Coral', 'coral', 'On shore',
   'Coral loves a sandy beach and a good postcard.', 'Miami', 'Wonder of the Seas', 862,
   '/assets/duckport/coral-portrait.png'),
  ('DP-1180', 'Minty', 'Seafoam', 'mint', 'Rehidden',
   'Minty has hopped between six islands and counting.', 'Fort Lauderdale', 'Celebrity Beyond', 2016,
   '/assets/duckport/minty-portrait.png'),
  ('DP-1564', 'Skipper', 'Blue', 'blue', 'At sea',
   'Skipper prefers the open ocean and long sea days.', 'Port Canaveral', 'Carnival Jubilee', 734,
   '/assets/duckport/blue-portrait.png')
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
