-- Align the D1 database created manually in the dashboard with the Worker API.
-- Apply once in the D1 Console. Existing user/server data is preserved.
ALTER TABLE users ADD COLUMN avatar_url TEXT;
ALTER TABLE users ADD COLUMN locale TEXT NOT NULL DEFAULT 'ru';
ALTER TABLE users ADD COLUMN site_role TEXT NOT NULL DEFAULT 'user';
ALTER TABLE users ADD COLUMN rules_accepted_at TEXT;

ALTER TABLE servers ADD COLUMN tags_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE servers ADD COLUMN partner_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE servers ADD COLUMN vip_until TEXT;

CREATE INDEX IF NOT EXISTS idx_users_discord_id ON users(discord_id);
