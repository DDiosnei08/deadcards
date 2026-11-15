CREATE TABLE profile_cards (
  user_id TEXT PRIMARY KEY NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  account_id TEXT NOT NULL,
  snapshot TEXT NOT NULL,
  checked_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  automatic INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE profile_card_history (
  id INTEGER PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES profile_cards(user_id) ON DELETE CASCADE,
  account_id TEXT NOT NULL,
  snapshot TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  automatic INTEGER NOT NULL
);

CREATE INDEX profile_card_history_by_account ON profile_card_history(user_id, account_id, id DESC);

CREATE TRIGGER profile_card_created AFTER INSERT ON profile_cards
BEGIN
  INSERT INTO profile_card_history (user_id, account_id, snapshot, updated_at, automatic)
  VALUES (NEW.user_id, NEW.account_id, NEW.snapshot, NEW.updated_at, NEW.automatic);
END;

CREATE TRIGGER profile_card_changed AFTER UPDATE OF snapshot ON profile_cards
WHEN NEW.account_id <> OLD.account_id OR NEW.snapshot <> OLD.snapshot
BEGIN
  INSERT INTO profile_card_history (user_id, account_id, snapshot, updated_at, automatic)
  VALUES (NEW.user_id, NEW.account_id, NEW.snapshot, NEW.updated_at, NEW.automatic);
END;
