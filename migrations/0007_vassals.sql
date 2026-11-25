-- Vazallen: een stad waarvan de trouw door edelmannen op 0 viel, is een tijd lang vazal van de aanvaller.
-- De trouw zelf staat in towns.state (loy); deze tabel dient om vazallen snel te vinden (schatting, bevrijding, punten).
CREATE TABLE IF NOT EXISTS vassals (
  town_id INTEGER PRIMARY KEY,     -- de stad die vazal is
  player_id INTEGER NOT NULL,      -- de eigenaar van die stad
  lord_player INTEGER NOT NULL,    -- de heer
  lord_town INTEGER NOT NULL,
  since INTEGER NOT NULL,
  until INTEGER NOT NULL,          -- daarna is de stad weer vrij
  next_tribute INTEGER NOT NULL    -- volgende karavaan met schatting
);
CREATE INDEX IF NOT EXISTS vassals_lord ON vassals (lord_player);
CREATE INDEX IF NOT EXISTS vassals_next ON vassals (next_tribute);
