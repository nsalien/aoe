-- Veldslagen die spelers zelf kunnen besturen (zie public/shared/fieldbattle.js).
-- status: choose (kiezen: zelf of automatisch), live (bezig), done (afgelopen, nog even zichtbaar)
CREATE TABLE IF NOT EXISTS battles (
  id INTEGER PRIMARY KEY,
  march_id INTEGER NOT NULL,
  att_player INTEGER NOT NULL,
  def_player INTEGER,              -- NULL bij een roverskamp
  target_kind TEXT NOT NULL,       -- town | camp
  target_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL,
  choose_until INTEGER NOT NULL,
  att_mode TEXT,                   -- manual | auto
  def_mode TEXT,
  state TEXT,                      -- JSON van het slagveld
  result TEXT,                     -- JSON met de uitslag (als status = done)
  version INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS battles_att ON battles(att_player, status);
CREATE INDEX IF NOT EXISTS battles_def ON battles(def_player, status);
CREATE INDEX IF NOT EXISTS battles_status ON battles(status, choose_until);
