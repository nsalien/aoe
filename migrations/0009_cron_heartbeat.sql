-- Wanneer de cron-worker (elke minuut) het laatst liep. Loopt hij, dan laten gewone verzoeken de bots, de meldingen en
-- de meeste aangekomen legers aan hem over (minder rekentijd per verzoek: het gratis plan geeft ±10 ms CPU).
ALTER TABLE world ADD COLUMN cron_at INTEGER;

-- indexen voor vragen die anders de hele tabel lezen (D1 telt gelezen rijen): oude sessies opruimen bij het aanmelden,
-- clanleden opzoeken (/team, de bots)
CREATE INDEX IF NOT EXISTS sessions_player ON sessions (player_id, expires_at);
CREATE INDEX IF NOT EXISTS players_team ON players (team_id);
