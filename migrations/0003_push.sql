-- Meldingen op je gsm (web push) en een voorkeuze per aanval.
-- push_subs: waar de browser/app van een speler meldingen ontvangt (één rij per toestel).
CREATE TABLE IF NOT EXISTS push_subs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id INTEGER NOT NULL,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS push_subs_player ON push_subs (player_id);

-- vaste instellingen van de server (bv. de VAPID-sleutels voor meldingen; blijven over seizoenen heen)
CREATE TABLE IF NOT EXISTS config (
  k TEXT PRIMARY KEY,
  v TEXT NOT NULL
);

-- notified: melding 'leger komt bijna aan' is verstuurd; pref_mode: vooraf gekozen 'manual' of 'auto'
ALTER TABLE marches ADD COLUMN notified INTEGER NOT NULL DEFAULT 0;
ALTER TABLE marches ADD COLUMN pref_mode TEXT;
