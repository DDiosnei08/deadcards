CREATE TABLE teams (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  tag TEXT NOT NULL,
  region TEXT,
  logo_key TEXT,
  bg_json TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE cards (
  id TEXT PRIMARY KEY,
  team_id TEXT REFERENCES teams(id) ON DELETE CASCADE,
  player_name TEXT NOT NULL,
  account_id INTEGER,
  hero_id INTEGER,
  overall INTEGER NOT NULL DEFAULT 0,
  stats_json TEXT,
  art_key TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE api_cache (
  cache_key TEXT PRIMARY KEY,
  body TEXT NOT NULL,
  fetched_at INTEGER NOT NULL
);
