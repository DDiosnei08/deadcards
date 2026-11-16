CREATE TABLE user_favorites (
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (user_id, player_id)
);
