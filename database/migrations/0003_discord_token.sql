-- Encrypted short-lived Discord OAuth token used only for live guild permission checks.
ALTER TABLE users ADD COLUMN discord_token_encrypted TEXT;
