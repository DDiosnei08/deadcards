CREATE TABLE profile_cards (
  user_id TEXT PRIMARY KEY NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  snapshot TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

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
