-- Encrypted Discord OAuth credentials for guild permission checks.
ALTER TABLE users ADD COLUMN discord_token_encrypted TEXT;
ALTER TABLE users ADD COLUMN discord_refresh_encrypted TEXT;
ALTER TABLE users ADD COLUMN discord_token_expires_at TEXT;
