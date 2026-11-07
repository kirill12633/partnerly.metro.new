-- The current 0001_initial.sql already contains the authentication and catalog columns.
-- Keep this migration idempotent for databases that apply the migration chain from scratch.
CREATE INDEX IF NOT EXISTS idx_users_discord_id ON users(discord_id);
