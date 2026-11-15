DROP TABLE IF EXISTS cards;
DROP TABLE IF EXISTS teams;

CREATE TABLE teams (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  tag TEXT NOT NULL,
  region TEXT NOT NULL DEFAULT 'Europa',
  logo_key TEXT,
  bg_json TEXT
);

CREATE TABLE players (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL,
  name TEXT NOT NULL,
  position TEXT NOT NULL DEFAULT 'Flex',
  hero TEXT NOT NULL,
  stats_json TEXT NOT NULL,
  ovr INTEGER,
  c1 TEXT NOT NULL,
  c2 TEXT NOT NULL,
  history_json TEXT NOT NULL DEFAULT '[]',
  extra_json TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX players_team ON players(team_id);

CREATE TABLE heroes (
  name TEXT PRIMARY KEY,
  image_key TEXT NOT NULL,
  zoom REAL NOT NULL DEFAULT 100,
  x REAL NOT NULL DEFAULT 50,
  y REAL NOT NULL DEFAULT 30
);

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL
);
