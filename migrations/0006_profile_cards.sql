CREATE TABLE profile_cards (
  user_id TEXT PRIMARY KEY NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  snapshot TEXT NOT NULL,
  ovr INTEGER NOT NULL,
  published INTEGER NOT NULL DEFAULT 0 CHECK (published IN (0, 1)),
  updated_at INTEGER NOT NULL
);

CREATE INDEX profile_cards_leaderboard ON profile_cards(ovr DESC, updated_at DESC) WHERE published = 1;

CREATE TABLE profile_card_history (
  id INTEGER PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES profile_cards(user_id) ON DELETE CASCADE,
  snapshot TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX profile_card_history_by_user ON profile_card_history(user_id, id DESC);

CREATE TRIGGER profile_card_created AFTER INSERT ON profile_cards
BEGIN
  INSERT INTO profile_card_history (user_id, snapshot, updated_at) VALUES (NEW.user_id, NEW.snapshot, NEW.updated_at);
END;

CREATE TRIGGER profile_card_changed AFTER UPDATE OF snapshot ON profile_cards
WHEN NEW.snapshot <> OLD.snapshot
BEGIN
  INSERT INTO profile_card_history (user_id, snapshot, updated_at) VALUES (NEW.user_id, NEW.snapshot, NEW.updated_at);
END;

CREATE TABLE profile_collection (
  id INTEGER PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  snapshot TEXT NOT NULL,
  redeemed_at INTEGER NOT NULL,
  UNIQUE (user_id, snapshot)
);

CREATE INDEX profile_collection_by_date ON profile_collection(user_id, redeemed_at DESC, id DESC);
