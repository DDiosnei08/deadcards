CREATE TABLE profile_collection (
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  account_id TEXT NOT NULL,
  snapshot TEXT NOT NULL,
  redeemed_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, account_id)
);

CREATE INDEX profile_collection_by_date ON profile_collection(user_id, redeemed_at DESC, account_id);
