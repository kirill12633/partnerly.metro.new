# Настройка Metro New Partnerly в Cloudflare

Код и интерфейс находятся в GitHub. После push Cloudflare Workers Builds должен собрать Worker автоматически.

## 1. D1 migration

В Cloudflare Dashboard открой **Workers & Pages → D1 → metro-new-partnerly-db → Console** и выполни SQL из файла `database/migrations/0003_discord_token.sql`:

```sql
ALTER TABLE users ADD COLUMN discord_token_encrypted TEXT;
ALTER TABLE users ADD COLUMN discord_refresh_encrypted TEXT;
ALTER TABLE users ADD COLUMN discord_token_expires_at TEXT;
```

Выполняй этот SQL один раз. Если Cloudflare сообщит, что колонка уже существует, не запускай эти строки повторно.

## 2. Worker bindings и secrets

В настройках Worker должны быть:
- D1 binding с именем `DB`, указывающий на `metro-new-partnerly-db`;
- Secrets `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `SESSION_SECRET`.

Значения секретов нельзя публиковать или добавлять в GitHub.

## 3. Discord OAuth

В Discord Developer Portal → OAuth2 → Redirects должен быть точный адрес:

`https://metro-new-partnerly.kirilltyr123.workers.dev/api/auth/discord/callback`

OAuth scopes используются `identify` и `guilds`. После изменения Redirect URI нажми Save.

## 4. Проверка

Открой:

`https://metro-new-partnerly.kirilltyr123.workers.dev/api/health`

Ожидается JSON с `ok: true`, `databaseConfigured: true`, `oauthConfigured: true`.

Затем открой GitHub Pages, войди через Discord и попробуй отправить сервер. В список попадут только Discord-серверы, где у пользователя есть право владельца или управления сервером. Новые серверы сохраняются со статусом `pending` и не показываются в публичном каталоге до модерации.

## Важно

Не вставляй содержимое Worker в отдельный ручной редактор, если GitHub-интеграция уже развёртывает репозиторий: это может перезаписать автоматическую версию. Сначала дождись успешного Git deployment.
