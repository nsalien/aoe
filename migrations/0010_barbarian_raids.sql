-- Overvallen van het barbarenkamp (sim.js: raidStart/raidAuto): wanneer de cron een stad moet bekijken voor de melding
-- 'barbaren vallen je dorp aan' (15 minuten om de slag zelf te spelen). saveTown houdt dit bij (raidNotice in game.js):
-- het begin van de volgende overval, of het einde van de lopende. NULL = niets te melden (of een computerspeler).
ALTER TABLE towns ADD COLUMN raid_at INTEGER;
CREATE INDEX IF NOT EXISTS towns_raid_at ON towns (raid_at) WHERE raid_at IS NOT NULL;

-- bestaande steden van echte spelers: de cron rekent ze één keer door en zet zo hun eerste raid_at
UPDATE towns SET raid_at = 0 WHERE player_id IN (SELECT id FROM players WHERE bot = 0);
