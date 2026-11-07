# Discord OAuth2 setup

The Worker implements:
- GET /api/auth/discord — starts the OAuth2 authorization-code flow with state validation.
- GET /api/auth/discord/callback — exchanges the code server-side and creates a signed HttpOnly session cookie.
- GET /api/auth/me — returns the current session and whether rules still need acceptance.
- POST /api/auth/accept-rules — records explicit acceptance for an authenticated user.
- POST /api/auth/logout — clears the session cookie.

## Cloudflare Worker variables and secrets

Set these in Worker → Settings → Variables and Secrets:

- Variable `DISCORD_CLIENT_ID`: the application's public Client ID.
- Secret `DISCORD_CLIENT_SECRET`: create/reset it in Discord Developer Portal → OAuth2 → General.
- Secret `SESSION_SECRET`: a long random value (at least 32 random bytes).

Never put either secret in GitHub or send it in chat.

## Discord Redirect URI

Register this exact URI in Discord Developer Portal → OAuth2 → General → Redirects:

`https://metro-new-partnerly.kirilltyr123.workers.dev/api/auth/discord/callback`

The Worker constructs the same callback from the request origin. If the Worker URL changes, update the Redirect URI.

## Database

The D1 database created earlier with the dashboard SQL needs the compatibility migration
`database/migrations/0002_auth_compatibility.sql` applied once in D1 Console before testing sign-in.
The repository's original migration describes the intended fresh-install schema; this compatibility
migration adds the missing fields to the already-created dashboard database.

## Important

OAuth login does not yet grant server-management permissions. Guild ownership / MANAGE_GUILD
verification and the rule-acceptance screen must be completed before enabling server submissions.
