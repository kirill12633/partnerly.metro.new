const COOKIE_SESSION = "mnp_session";
const COOKIE_STATE = "mnp_oauth_state";
const SESSION_TTL = 60 * 60 * 24 * 7;
const CALLBACK_PATH = "/api/auth/discord/callback";
const PUBLIC_SITE_URL = "https://kirill12633.github.io/partnerly.metro.new";
const PUBLIC_SITE_ORIGIN = "https://kirill12633.github.io";
const CATEGORIES = new Set(["games","chat","minecraft","rp","programming","education","creative","community","other"]);
const corsHeaders = {
  "Access-Control-Allow-Origin": PUBLIC_SITE_ORIGIN,
  "Access-Control-Allow-Credentials": "true",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Vary": "Origin"
};
const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), {
  status, headers: { "content-type":"application/json; charset=utf-8", "cache-control":"no-store", ...corsHeaders, ...headers }
});
function cookie(request,name) {
  const header=request.headers.get("Cookie")||"";
  const item=header.split(";").map(v=>v.trim()).find(v=>v.startsWith(name+"="));
  return item?item.slice(name.length+1):null;
}
function b64url(bytes) {
  let binary=""; for(const byte of bytes) binary+=String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"");
}
function decodeB64url(value) {
  const padded=value.replace(/-/g,"+").replace(/_/g,"/")+"=".repeat((4-value.length%4)%4);
  return Uint8Array.from(atob(padded),c=>c.charCodeAt(0));
}
async function sign(value,secret) {
  const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  return b64url(new Uint8Array(await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(value))));
}
async function makeSession(userId,secret) {
  const payload=b64url(new TextEncoder().encode(JSON.stringify({sub:userId,exp:Math.floor(Date.now()/1000)+SESSION_TTL})));
  return payload+"."+await sign(payload,secret);
}
async function readSession(request,secret) {
  const value=cookie(request,COOKIE_SESSION); if(!value||!secret)return null;
  const [payload,signature]=value.split(".");
  if(!payload||!signature||!constantTimeEqual(await sign(payload,secret),signature))return null;
  try { const data=JSON.parse(new TextDecoder().decode(decodeB64url(payload))); return data.exp>Math.floor(Date.now()/1000)?data:null; } catch{return null;}
}
function constantTimeEqual(a,b){if(a.length!==b.length)return false;let x=0;for(let i=0;i<a.length;i++)x|=a.charCodeAt(i)^b.charCodeAt(i);return x===0;}
function cookieHeader(name,value,maxAge,sameSite="Lax"){return name+"="+value+"; Path=/; HttpOnly; Secure; SameSite="+sameSite+"; Max-Age="+maxAge;}
function clearCookie(name){return name+"=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0";}
function redirect(url,headers={}){return new Response(null,{status:302,headers:{Location:url,"Cache-Control":"no-store",...headers}});}
function requireOAuth(env){return Boolean(env.DISCORD_CLIENT_ID&&env.DISCORD_CLIENT_SECRET&&env.SESSION_SECRET&&env.DB);}
async function encryptionKey(secret) {
  const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode("metro-partnerly-token:"+secret));
  return crypto.subtle.importKey("raw",digest,{name:"AES-GCM"},false,["encrypt","decrypt"]);
}
async function encryptSecret(value,secret) {
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const encrypted=await crypto.subtle.encrypt({name:"AES-GCM",iv},await encryptionKey(secret),new TextEncoder().encode(value));
  return b64url(iv)+"."+b64url(new Uint8Array(encrypted));
}
async function decryptSecret(value,secret) {
  const [iv,data]=String(value||"").split(".");
  if(!iv||!data)throw new Error("Encrypted token missing");
  const plain=await crypto.subtle.decrypt({name:"AES-GCM",iv:decodeB64url(iv)},await encryptionKey(secret),decodeB64url(data));
  return new TextDecoder().decode(plain);
}
async function handleDiscordStart(request,env) {
  if(!requireOAuth(env))return json({error:"OAuth setup required"},503);
  const state=b64url(crypto.getRandomValues(new Uint8Array(32)));
  const callback=new URL(CALLBACK_PATH,new URL(request.url).origin).toString();
  const authorize=new URL("https://discord.com/oauth2/authorize");
  authorize.search=new URLSearchParams({client_id:env.DISCORD_CLIENT_ID,response_type:"code",redirect_uri:callback,scope:"identify guilds",state}).toString();
  return redirect(authorize.toString(),{"Set-Cookie":cookieHeader(COOKIE_STATE,state,600)});
}
async function handleDiscordCallback(request,env) {
  if(!requireOAuth(env))return json({error:"OAuth setup required"},503);
  const url=new URL(request.url),state=url.searchParams.get("state"),savedState=cookie(request,COOKIE_STATE),code=url.searchParams.get("code");
  if(!state||!savedState||!constantTimeEqual(state,savedState)||!code)return redirect(PUBLIC_SITE_URL+"/?login=failed",{"Set-Cookie":clearCookie(COOKIE_STATE)});
  const callback=new URL(CALLBACK_PATH,url.origin).toString();
  const tokenResponse=await fetch("https://discord.com/api/oauth2/token",{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},body:new URLSearchParams({client_id:env.DISCORD_CLIENT_ID,client_secret:env.DISCORD_CLIENT_SECRET,grant_type:"authorization_code",code,redirect_uri:callback})});
  if(!tokenResponse.ok)return redirect(PUBLIC_SITE_URL+"/?login=failed",{"Set-Cookie":clearCookie(COOKIE_STATE)});
  const token=await tokenResponse.json();
  const profileResponse=await fetch("https://discord.com/api/users/@me",{headers:{Authorization:"Bearer "+token.access_token}});
  if(!profileResponse.ok)return redirect(PUBLIC_SITE_URL+"/?login=failed",{"Set-Cookie":clearCookie(COOKIE_STATE)});
  const profile=await profileResponse.json(),userId=crypto.randomUUID();
  const avatarUrl=profile.avatar?"https://cdn.discordapp.com/avatars/"+encodeURIComponent(profile.id)+"/"+encodeURIComponent(profile.avatar)+".png":null;
  const encryptedAccess=await encryptSecret(token.access_token,env.SESSION_SECRET);
  const encryptedRefresh=token.refresh_token?await encryptSecret(token.refresh_token,env.SESSION_SECRET):null;
  const expiresAt=new Date(Date.now()+Number(token.expires_in||604800)*1000).toISOString();
  await env.DB.prepare("INSERT INTO users (id,discord_id,username,avatar_url,locale,site_role,discord_token_encrypted,discord_refresh_encrypted,discord_token_expires_at) VALUES (?,?,?,?,'ru','user',?,?,?) ON CONFLICT(discord_id) DO UPDATE SET username=excluded.username,avatar_url=excluded.avatar_url,discord_token_encrypted=excluded.discord_token_encrypted,discord_refresh_encrypted=excluded.discord_refresh_encrypted,discord_token_expires_at=excluded.discord_token_expires_at").bind(userId,profile.id,profile.global_name||profile.username,avatarUrl,encryptedAccess,encryptedRefresh,expiresAt).run();
  const existing=await env.DB.prepare("SELECT id FROM users WHERE discord_id=?").bind(profile.id).first();
  const session=await makeSession(existing.id,env.SESSION_SECRET),headers=new Headers();
  headers.append("Set-Cookie",cookieHeader(COOKIE_SESSION,session,SESSION_TTL,"None"));
  headers.append("Set-Cookie",clearCookie(COOKIE_STATE));
  return redirect(PUBLIC_SITE_URL+"/",headers);
}
async function getUser(request,env) {
  const session=await readSession(request,env.SESSION_SECRET); if(!session)return null;
  return await env.DB.prepare("SELECT id,discord_id,username,avatar_url,locale,site_role,rules_accepted_at,created_at,discord_token_encrypted,discord_refresh_encrypted,discord_token_expires_at FROM users WHERE id=?").bind(session.sub).first();
}
async function handleAuthMe(request,env) {
  const user=await getUser(request,env); if(!user)return json({authenticated:false});
  const {discord_token_encrypted,discord_refresh_encrypted,discord_token_expires_at,...publicUser}=user;
  return json({authenticated:true,user:publicUser,needsRules:!user.rules_accepted_at});
}
async function handleAcceptRules(request,env) {
  const user=await getUser(request,env); if(!user)return json({error:"Authentication required"},401);
  const body=await request.json().catch(()=>({}));
  if(body.accept!==true)return json({error:"Rules must be accepted explicitly"},400);
  await env.DB.prepare("UPDATE users SET rules_accepted_at=CURRENT_TIMESTAMP WHERE id=?").bind(user.id).run();
  return json({ok:true});
}
async function getDiscordAccessToken(user,env) {
  if(!user.discord_token_encrypted)throw new Error("Повтори вход через Discord, чтобы обновить разрешения.");
  if(user.discord_token_expires_at&&Date.parse(user.discord_token_expires_at)>Date.now()+60000)return decryptSecret(user.discord_token_encrypted,env.SESSION_SECRET);
  if(!user.discord_refresh_encrypted)throw new Error("Срок авторизации Discord истёк. Войди заново.");
  const refresh=await decryptSecret(user.discord_refresh_encrypted,env.SESSION_SECRET);
  const response=await fetch("https://discord.com/api/oauth2/token",{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},body:new URLSearchParams({client_id:env.DISCORD_CLIENT_ID,client_secret:env.DISCORD_CLIENT_SECRET,grant_type:"refresh_token",refresh_token:refresh})});
  if(!response.ok)throw new Error("Не удалось обновить Discord OAuth. Войди заново.");
  const token=await response.json(),access=await encryptSecret(token.access_token,env.SESSION_SECRET);
  const nextRefresh=token.refresh_token?await encryptSecret(token.refresh_token,env.SESSION_SECRET):user.discord_refresh_encrypted;
  const expires=new Date(Date.now()+Number(token.expires_in||604800)*1000).toISOString();
  await env.DB.prepare("UPDATE users SET discord_token_encrypted=?,discord_refresh_encrypted=?,discord_token_expires_at=? WHERE id=?").bind(access,nextRefresh,expires,user.id).run();
  return token.access_token;
}
async function fetchManagedGuilds(user,env) {
  const access=await getDiscordAccessToken(user,env);
  const response=await fetch("https://discord.com/api/users/@me/guilds",{headers:{Authorization:"Bearer "+access}});
  if(!response.ok)throw new Error("Discord не вернул список серверов. Войди через Discord заново.");
  const guilds=await response.json();
  return guilds.filter(g=>g.owner||((BigInt(g.permissions||"0")&BigInt(0x20|0x8))!==BigInt(0))).map(g=>({id:g.id,name:g.name,icon:g.icon,owner:!!g.owner}));
}
async function handleGuilds(request,env) {
  const user=await getUser(request,env); if(!user)return json({error:"Сначала войди через Discord"},401);
  try{return json({items:await fetchManagedGuilds(user,env)});}catch(e){return json({error:e.message},400);}
}
async function handleCreateServer(request,env) {
  const user=await getUser(request,env); if(!user)return json({error:"Сначала войди через Discord"},401);
  if(!user.rules_accepted_at)return json({error:"Сначала прими правила каталога"},403);
  const body=await request.json().catch(()=>null);
  if(!body||typeof body.guildId!=="string"||typeof body.description!=="string"||!body.description.trim()||body.description.length>600)return json({error:"Заполни сервер и описание (до 600 символов)."},400);
  if(!CATEGORIES.has(body.category))return json({error:"Выбери корректную категорию."},400);
  let inviteUrl=null;
  if(body.inviteUrl) {
    try {const u=new URL(body.inviteUrl);if(u.protocol!=="https:"||!["discord.gg","www.discord.gg","discord.com","www.discord.com"].includes(u.hostname)||!(u.hostname.endsWith("discord.gg")||u.pathname.startsWith("/invite/")))throw new Error();inviteUrl=u.toString();}
    catch{return json({error:"Укажи корректную Discord invite-ссылку."},400);}
  }
  let guilds;
  try{guilds=await fetchManagedGuilds(user,env);}catch(e){return json({error:e.message},400);}
  const guild=guilds.find(g=>g.id===body.guildId);
  if(!guild)return json({error:"У тебя нет прав владельца или управления выбранным сервером."},403);
  const existing=await env.DB.prepare("SELECT id,status FROM servers WHERE discord_guild_id=?").bind(guild.id).first();
  if(existing)return json({error:"Этот Discord-сервер уже добавлен в каталог."},409);
  const tags=Array.isArray(body.tags)?body.tags.filter(t=>typeof t==="string").map(t=>t.trim().replace(/^#/,"").slice(0,24)).filter(Boolean).slice(0,8):[];
  const id=crypto.randomUUID();
  await env.DB.prepare("INSERT INTO servers (id,owner_user_id,discord_guild_id,name,description,invite_url,category,tags_json,status,partnership_open) VALUES (?,?,?,?,?,?,?,?, 'pending',1)").bind(id,user.id,guild.id,guild.name,body.description.trim(),inviteUrl,body.category,JSON.stringify(tags)).run();
  return json({ok:true,id,status:"pending",message:"Заявка отправлена на модерацию. После одобрения сервер появится в каталоге."},201);
}
async function handleServers(request,env) {
  if(!env.DB)return json({items:[],setupRequired:true});
  const category=new URL(request.url).searchParams.get("category"),q=(new URL(request.url).searchParams.get("q")||"").trim().slice(0,80),limit=Math.min(Math.max(Number(new URL(request.url).searchParams.get("limit")||24),1),60);
  const where=["status='published'","partnership_open=1"],values=[];
  if(category&&category!=="all"){if(!CATEGORIES.has(category))return json({error:"Invalid category"},400);where.push("category=?");values.push(category);}
  if(q){where.push("(name LIKE ? OR description LIKE ? OR tags_json LIKE ?)");values.push("%"+q+"%","%"+q+"%","%"+q+"%");}
  const result=await env.DB.prepare("SELECT id,name,description,category,tags_json,member_count,partner_count,vip_until,created_at FROM servers WHERE "+where.join(" AND ")+" ORDER BY CASE WHEN vip_until IS NOT NULL AND vip_until>CURRENT_TIMESTAMP THEN 0 ELSE 1 END,partner_count DESC,created_at DESC LIMIT ?").bind(...values,limit).all();
  return json({items:result.results||[]});
}
export default {
  async fetch(request,env) {
    const url=new URL(request.url);
    try {
      if(request.method==="OPTIONS"&&url.pathname.startsWith("/api/"))return new Response(null,{status:204,headers:corsHeaders});
      if(url.pathname==="/api/health")return json({ok:true,service:"metro-new-partnerly",databaseConfigured:!!env.DB,oauthConfigured:requireOAuth(env)});
      if(url.pathname==="/api/auth/discord"&&request.method==="GET")return await handleDiscordStart(request,env);
      if(url.pathname===CALLBACK_PATH&&request.method==="GET")return await handleDiscordCallback(request,env);
      if(url.pathname==="/api/auth/me"&&request.method==="GET")return await handleAuthMe(request,env);
      if(url.pathname==="/api/auth/accept-rules"&&request.method==="POST")return await handleAcceptRules(request,env);
      if(url.pathname==="/api/auth/logout"&&request.method==="POST")return json({ok:true},200,{"Set-Cookie":clearCookie(COOKIE_SESSION)});
      if(url.pathname==="/api/discord/guilds"&&request.method==="GET")return await handleGuilds(request,env);
      if(url.pathname==="/api/servers"&&request.method==="GET")return await handleServers(request,env);
      if(url.pathname==="/api/servers"&&request.method==="POST")return await handleCreateServer(request,env);
      if(url.pathname.startsWith("/api/"))return json({error:"Endpoint not found"},404);
      return env.ASSETS.fetch(request);
    } catch(error) {
      console.error("Worker request failed",error);
      return json({error:"Internal server error"},500);
    }
  }
};
