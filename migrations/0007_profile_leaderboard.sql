ALTER TABLE profile_cards ADD COLUMN published INTEGER NOT NULL DEFAULT 0 CHECK (published IN (0, 1));

CREATE INDEX profile_cards_published_accounts ON profile_cards(account_id, updated_at DESC) WHERE published = 1;
