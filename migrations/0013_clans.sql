-- Clans wisselen (verlaten, toetreding vragen, uitnodigen), verraad en privéberichten.

-- Uitnodigingen (een clan nodigt een speler uit) en verzoeken (een speler vraagt om toe te treden).
CREATE TABLE IF NOT EXISTS clan_invites (
  id INTEGER PRIMARY KEY,
  team_id INTEGER NOT NULL,       -- de clan
  player_id INTEGER NOT NULL,     -- de speler die misschien toetreedt
  kind TEXT NOT NULL,             -- 'invite' (de clan nodigt uit) of 'request' (de speler vraagt)
  by_player INTEGER NOT NULL,     -- wie het stuurde
  created_at INTEGER NOT NULL,
  UNIQUE (team_id, player_id)
);
CREATE INDEX IF NOT EXISTS clan_invites_player ON clan_invites (player_id);
CREATE INDEX IF NOT EXISTS clan_invites_team ON clan_invites (team_id);

-- Privéberichten tussen twee spelers (om te onderhandelen). pair = 'kleinste:grootste' speler-id.
CREATE TABLE IF NOT EXISTS dms (
  id INTEGER PRIMARY KEY,
  pair TEXT NOT NULL,
  from_id INTEGER NOT NULL,
  to_id INTEGER NOT NULL,
  name TEXT NOT NULL,             -- naam van de afzender
  text TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  seen INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS dms_pair ON dms (pair, id);
CREATE INDEX IF NOT EXISTS dms_to ON dms (to_id, seen);
CREATE INDEX IF NOT EXISTS dms_from ON dms (from_id);

-- wie een clan zelf stichtte (bij het verlaten van zijn clan); NULL = automatisch gekoppeld team
ALTER TABLE teams ADD COLUMN founder INTEGER;
-- laatste wissel van clan (wachttijd) en laatste verraad (aanval op een clanlid)
ALTER TABLE players ADD COLUMN clan_at INTEGER NOT NULL DEFAULT 0;
ALTER TABLE players ADD COLUMN traitor_at INTEGER;
