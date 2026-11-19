-- Databaseschema voor Cloudflare D1 (SQLite).
-- Uitvoeren met: npm run db:init:remote   (of db:init:local voor lokaal testen)

CREATE TABLE IF NOT EXISTS world (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  seed INTEGER NOT NULL,
  size INTEGER NOT NULL,
  start_at INTEGER NOT NULL,      -- ms sinds epoch
  prep_ms INTEGER NOT NULL,       -- duur van de vredesperiode
  war_ms INTEGER NOT NULL,        -- duur van de oorlogsperiode
  speed REAL NOT NULL DEFAULT 1,
  team_size INTEGER NOT NULL DEFAULT 2,
  join_code TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS teams (
  id INTEGER PRIMARY KEY,
  slot INTEGER NOT NULL,
  name TEXT NOT NULL,
  color TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS players (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE,
  pass_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  team_id INTEGER NOT NULL,
  kill_pts INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  last_seen INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  player_id INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS towns (
  id INTEGER PRIMARY KEY,
  player_id INTEGER NOT NULL UNIQUE,
  name TEXT NOT NULL,
  x INTEGER NOT NULL,
  y INTEGER NOT NULL,
  state TEXT NOT NULL,            -- JSON, zie public/shared/sim.js
  version INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS camps (
  id INTEGER PRIMARY KEY,
  x INTEGER NOT NULL,
  y INTEGER NOT NULL,
  level INTEGER NOT NULL,
  state TEXT NOT NULL,            -- JSON: { units, res, refresh_at }
  version INTEGER NOT NULL DEFAULT 0
);

-- Legers en karavanen onderweg. status: 'out' (heenweg) of 'back' (terugweg)
CREATE TABLE IF NOT EXISTS marches (
  id INTEGER PRIMARY KEY,
  player_id INTEGER NOT NULL,
  team_id INTEGER NOT NULL,
  kind TEXT NOT NULL,             -- attack | scout | support | trade | return
  from_town INTEGER NOT NULL,
  from_x INTEGER NOT NULL,
  from_y INTEGER NOT NULL,
  target_kind TEXT NOT NULL,      -- town | camp
  target_id INTEGER NOT NULL,
  target_team INTEGER,            -- team van het doelwit (0 voor kampen)
  to_x INTEGER NOT NULL,
  to_y INTEGER NOT NULL,
  units TEXT NOT NULL,
  res TEXT NOT NULL DEFAULT '{}',
  depart_at INTEGER NOT NULL,
  arrive_at INTEGER NOT NULL,
  status TEXT NOT NULL,
  lock_until INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS marches_due ON marches (status, arrive_at);
CREATE INDEX IF NOT EXISTS marches_player ON marches (player_id);
CREATE INDEX IF NOT EXISTS marches_target_team ON marches (target_team);

-- Ondersteunende troepen die bij een bondgenoot gestationeerd zijn
CREATE TABLE IF NOT EXISTS support (
  id INTEGER PRIMARY KEY,
  player_id INTEGER NOT NULL,
  from_town INTEGER NOT NULL,
  host_town INTEGER NOT NULL,
  units TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS support_host ON support (host_town);
CREATE INDEX IF NOT EXISTS support_player ON support (player_id);

CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY,
  player_id INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  data TEXT NOT NULL,
  seen INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS reports_player ON reports (player_id, id);
CREATE INDEX IF NOT EXISTS reports_unseen ON reports (player_id, seen);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY,
  channel TEXT NOT NULL,          -- 'world' of 'team:<id>'
  player_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  text TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS messages_channel ON messages (channel, id);
