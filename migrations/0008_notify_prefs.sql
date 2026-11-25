-- Meldingen apart aan/uit per toestel (één rij in push_subs per toestel):
--   n_attack = aanval op je stad (meteen bij vertrek en ±2 min voor aankomst)
--   n_build  = een bouwer is vrij (een bouwwerk is klaar)
--   n_march  = je eigen leger komt bijna aan (±2 min vooraf: zelf besturen of automatisch)
ALTER TABLE push_subs ADD COLUMN n_attack INTEGER NOT NULL DEFAULT 1;
ALTER TABLE push_subs ADD COLUMN n_build INTEGER NOT NULL DEFAULT 1;
ALTER TABLE push_subs ADD COLUMN n_march INTEGER NOT NULL DEFAULT 1;

-- Wanneer het volgende bouwwerk van een stad klaar is (voor de melding 'bouwer vrij'); NULL = niets in aanbouw of een
-- computerspeler. saveTown houdt dit bij; de cron (en het vangnet na gewone verzoeken) zoekt via de index wat klaar is.
ALTER TABLE towns ADD COLUMN build_at INTEGER;
CREATE INDEX IF NOT EXISTS towns_build_at ON towns (build_at) WHERE build_at IS NOT NULL;

-- steden die nu al iets bouwen (geen computerspelers)
UPDATE towns SET build_at = (SELECT MIN(json_extract(value, '$.end')) FROM json_each(towns.state, '$.builds'))
WHERE json_extract(state, '$.bot') IS NULL AND json_valid(state);
