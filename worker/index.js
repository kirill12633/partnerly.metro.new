const COOKIE_SESSION = "mnp_session";
const COOKIE_STATE = "mnp_oauth_state";
const SESSION_TTL = 60 * 60 * 24 * 7;
const CALLBACK_PATH = "/api/auth/discord/callback";

const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), {
  status,
  headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers }
});

function cookie(request, name) {
  const header = request.headers.get("Cookie") || "";
  const item = header.split(";").map(v => v.trim()).find(v => v.startsWith(name + "="));
  return item ? item.slice(name.length + 1) : null;
}
function b64url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
function decodeB64url(value) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - value.length % 4) % 4);
  return Uint8Array.from(atob(padded), c => c.charCodeAt(0));
}
async function sign(value, secret) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64url(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value))));
}
async function makeSession(userId, secret) {
  const payload = b64url(new TextEncoder().encode(JSON.stringify({ sub: userId, exp: Math.floor(Date.now() / 1000) + SESSION_TTL })));
  return payload + "." + await sign(payload, secret);
}
async function readSession(request, secret) {
  const value = cookie(request, COOKIE_SESSION);
  if (!value || !secret) return null;
  const [payload, signature] = value.split(".");
  if (!payload || !signature || (await sign(payload, secret)) !== signature) return null;
  try {
    const data = JSON.parse(new TextDecoder().decode(decodeB64url(payload)));
    return data.exp > Math.floor(Date.now() / 1000) ? data : null;
  } catch { return null; }
}
function cookieHeader(name, value, maxAge) {
  return name + "=" + value + "; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=" + maxAge;
}
function clearCookie(name) {
  return name + "=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0";
}
function redirect(url, headers = {}) {
  return new Response(null, { status: 302, headers: { Location: url, "Cache-Control": "no-store", ...headers } });
}
function requireOAuth(env) {
  return Boolean(env.DISCORD_CLIENT_ID && env.DISCORD_CLIENT_SECRET && env.SESSION_SECRET && env.DB);
}

async function handleDiscordStart(request, env) {
  if (!requireOAuth(env)) return json({ error: "OAuth setup required", required: ["DISCORD_CLIENT_ID", "DISCORD_CLIENT_SECRET", "SESSION_SECRET", "DB"] }, 503);
  const state = b64url(crypto.getRandomValues(new Uint8Array(32)));
  const callback = new URL(CALLBACK_PATH, new URL(request.url).origin).toString();
  const authorize = new URL("https://discord.com/oauth2/authorize");
  authorize.search = new URLSearchParams({
    client_id: env.DISCORD_CLIENT_ID,
    response_type: "code",
    redirect_uri: callback,
    scope: "identify guilds",
    state
  }).toString();
  return redirect(authorize.toString(), { "Set-Cookie": cookieHeader(COOKIE_STATE, state, 600) });
}

async function handleDiscordCallback(request, env) {
  if (!requireOAuth(env)) return json({ error: "OAuth setup required" }, 503);
  const url = new URL(request.url);
  const state = url.searchParams.get("state");
  const savedState = cookie(request, COOKIE_STATE);
  const code = url.searchParams.get("code");
  if (!state || !savedState || state !== savedState || !code) {
    return redirect("/?login=failed", { "Set-Cookie": clearCookie(COOKIE_STATE) });
  }
  const callback = new URL(CALLBACK_PATH, url.origin).toString();
  const tokenResponse = await fetch("https://discord.com/api/oauth2/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.DISCORD_CLIENT_ID,
      client_secret: env.DISCORD_CLIENT_SECRET,
      grant_type: "authorization_code",
      code,
      redirect_uri: callback
    })
  });
  if (!tokenResponse.ok) return redirect("/?login=failed", { "Set-Cookie": clearCookie(COOKIE_STATE) });
  const token = await tokenResponse.json();
  const profileResponse = await fetch("https://discord.com/api/users/@me", {
    headers: { Authorization: "Bearer " + token.access_token }
  });
  if (!profileResponse.ok) return redirect("/?login=failed", { "Set-Cookie": clearCookie(COOKIE_STATE) });
  const profile = await profileResponse.json();
  const userId = crypto.randomUUID();
  const avatarUrl = profile.avatar
    ? "https://cdn.discordapp.com/avatars/" + encodeURIComponent(profile.id) + "/" + encodeURIComponent(profile.avatar) + ".png"
    : null;
  await env.DB.prepare(
    "INSERT INTO users (id, discord_id, username, avatar_url, locale, site_role) VALUES (?, ?, ?, ?, 'ru', 'user') " +
    "ON CONFLICT(discord_id) DO UPDATE SET username = excluded.username, avatar_url = excluded.avatar_url"
  ).bind(userId, profile.id, profile.global_name || profile.username, avatarUrl).run();
  const existing = await env.DB.prepare("SELECT id FROM users WHERE discord_id = ?").bind(profile.id).first();
  const session = await makeSession(existing.id, env.SESSION_SECRET);
  const headers = new Headers();
  headers.append("Set-Cookie", cookieHeader(COOKIE_SESSION, session, SESSION_TTL));
  headers.append("Set-Cookie", clearCookie(COOKIE_STATE));
  return redirect("/", headers);
}

async function handleAuthMe(request, env) {
  const session = await readSession(request, env.SESSION_SECRET);
  if (!session) return json({ authenticated: false });
  const user = await env.DB.prepare(
    "SELECT id, discord_id, username, avatar_url, locale, site_role, rules_accepted_at, created_at FROM users WHERE id = ?"
  ).bind(session.sub).first();
  if (!user) return json({ authenticated: false });
  return json({ authenticated: true, user, needsRules: !user.rules_accepted_at });
}

async function handleAcceptRules(request, env) {
  const session = await readSession(request, env.SESSION_SECRET);
  if (!session) return json({ error: "Authentication required" }, 401);
  const body = await request.json().catch(() => ({}));
  if (body.accept !== true) return json({ error: "Rules must be accepted explicitly" }, 400);
  await env.DB.prepare("UPDATE users SET rules_accepted_at = CURRENT_TIMESTAMP WHERE id = ?").bind(session.sub).run();
  return json({ ok: true });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    try {
      if (url.pathname === "/api/health") {
        return json({ ok: true, service: "metro-new-partnerly", databaseConfigured: Boolean(env.DB), oauthConfigured: requireOAuth(env) });
      }
      if (url.pathname === "/api/auth/discord" && request.method === "GET") return await handleDiscordStart(request, env);
      if (url.pathname === CALLBACK_PATH && request.method === "GET") return await handleDiscordCallback(request, env);
      if (url.pathname === "/api/auth/me" && request.method === "GET") return await handleAuthMe(request, env);
      if (url.pathname === "/api/auth/accept-rules" && request.method === "POST") return await handleAcceptRules(request, env);
      if (url.pathname === "/api/auth/logout" && request.method === "POST") {
        return json({ ok: true }, 200, { "Set-Cookie": clearCookie(COOKIE_SESSION) });
      }
      if (url.pathname === "/api/servers" && request.method === "GET") {
        if (!env.DB) return json({ items: [], setupRequired: true });
        const category = url.searchParams.get("category");
        const q = (url.searchParams.get("q") || "").trim().slice(0, 80);
        const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || 24), 1), 60);
        const where = ["status = 'published'", "partnership_open = 1"];
        const values = [];
        if (category && category !== "all") { where.push("category = ?"); values.push(category); }
        if (q) { where.push("(name LIKE ? OR description LIKE ? OR tags_json LIKE ?)"); values.push("%" + q + "%", "%" + q + "%", "%" + q + "%"); }
        const result = await env.DB.prepare(
          "SELECT id,name,description,category,tags_json,member_count,partner_count,vip_until,created_at FROM servers WHERE " +
          where.join(" AND ") + " ORDER BY CASE WHEN vip_until IS NOT NULL AND vip_until > CURRENT_TIMESTAMP THEN 0 ELSE 1 END, partner_count DESC, created_at DESC LIMIT ?"
        ).bind(...values, limit).all();
        return json({ items: result.results || [] });
      }
      if (url.pathname.startsWith("/api/")) return json({ error: "Endpoint not implemented yet" }, 501);
      return env.ASSETS.fetch(request);
    } catch (error) {
      console.error("Worker request failed", error);
      return json({ error: "Internal server error" }, 500);
    }
  }
};
