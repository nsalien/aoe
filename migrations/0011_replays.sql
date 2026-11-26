-- Replays van automatisch uitgerekende slagen: het 'recept' (legers, stad, richting, uitslag) waarmee de browser de
-- slag naspeelt (fieldbattle.js + setFate). 24 uur te bekijken (REPLAY.ms in rules.js), daarna opgeruimd.
-- who = ',1,5,9,' : de spelers die de replay mogen zien (aanvaller, verdediger, wie versterking stuurde).
CREATE TABLE IF NOT EXISTS replays (
  id INTEGER PRIMARY KEY,
  created_at INTEGER NOT NULL,
  who TEXT NOT NULL,
  data TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS replays_created ON replays(created_at);
