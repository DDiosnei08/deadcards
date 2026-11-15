CREATE TABLE redeem_codes (
  code TEXT PRIMARY KEY,
  player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  max_uses INTEGER NOT NULL DEFAULT 1,
  uses INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE user_cards (
  user_id TEXT NOT NULL,
  player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  redeemed_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (user_id, player_id)
);
