const API = "https://metro-new-partnerly.kirilltyr123.workers.dev";
const $ = (id) => document.getElementById(id);
const categories = {games:"Игры",chat:"Общение",minecraft:"Minecraft",rp:"Ролевые игры",programming:"Программирование",education:"Обучение",creative:"Творчество",community:"Сообщества",other:"Другое"};
let currentUser = null;
let selectedCategory = "all";
let searchTimer;

async function api(path, options = {}) {
  const response = await fetch(API + path, { credentials:"include", ...options, headers:{ ...(options.body ? {"Content-Type":"application/json"} : {}), ...(options.headers || {}) } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Ошибка запроса");
  return data;
}
function showMessage(message, isError = false) {
  const el = $("formMessage");
  if (el) { el.textContent = message; el.className = isError ? "error" : "success"; }
}
function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}
async function loadAuth() {
  try {
    const data = await api("/api/auth/me");
    currentUser = data.authenticated ? data.user : null;
    $("loginBtn").hidden = !!currentUser;
    $("logoutBtn").hidden = !currentUser;
    $("userName").hidden = !currentUser;
    $("userName").textContent = currentUser ? currentUser.username : "";
    $("submitSection").hidden = !currentUser;
    if (currentUser) {
      $("rulesBox").hidden = !!currentUser.rules_accepted_at;
      if (!currentUser.rules_accepted_at) $("serverForm").hidden = true;
    }
  } catch (error) { console.warn("Auth check:", error.message); }
}
async function loadServers() {
  const params = new URLSearchParams();
  if (selectedCategory !== "all") params.set("category", selectedCategory);
  const q = $("searchInput").value.trim();
  if (q) params.set("q", q);
  const grid = $("serverGrid");
  grid.innerHTML = '<div class="empty"><div>⌕</div><h3>Загружаем каталог</h3><p>Пожалуйста, подожди…</p></div>';
  try {
    const data = await api("/api/servers?" + params.toString());
    const items = data.items || [];
    $("serverCount").textContent = "Найдено: " + items.length;
    if (!items.length) {
      grid.innerHTML = '<div class="empty"><div>✦</div><h3>Пока здесь пусто</h3><p>Подходящих опубликованных серверов пока нет. Можно добавить свой!</p></div>';
      return;
    }
    grid.innerHTML = items.map(server => {
      let tags = [];
      try { tags = JSON.parse(server.tags_json || "[]"); } catch {}
      return '<article class="server"><div class="server-top"><span class="server-category">' + escapeHtml(categories[server.category] || "Другое") + '</span><span class="server-members">' + Number(server.member_count || 0).toLocaleString("ru-RU") + ' участников</span></div><h3>' + escapeHtml(server.name) + '</h3><p>' + escapeHtml(server.description) + '</p><div class="server-tags">' + tags.slice(0,5).map(t => '<span>#' + escapeHtml(t) + '</span>').join("") + '</div><div class="meta">Партнёров: ' + Number(server.partner_count || 0) + '</div></article>';
    }).join("");
  } catch (error) {
    $("serverCount").textContent = "Каталог временно недоступен";
    grid.innerHTML = '<div class="empty"><div>!</div><h3>Не удалось загрузить каталог</h3><p>' + escapeHtml(error.message) + '</p><button class="btn outline" onclick="location.reload()">Повторить</button></div>';
  }
}
async function loadGuilds() {
  const select = $("guildSelect");
  select.innerHTML = '<option value="">Получаем список серверов…</option>';
  try {
    const data = await api("/api/discord/guilds");
    if (!data.items.length) {
      select.innerHTML = '<option value="">Нет серверов с правами управления</option>';
      showMessage("В твоём аккаунте не найдено серверов, которыми ты можешь управлять.", true);
      return;
    }
    select.innerHTML = '<option value="">Выбери сервер</option>' + data.items.map(g => '<option value="' + escapeHtml(g.id) + '">' + escapeHtml(g.name) + '</option>').join("");
  } catch (error) {
    select.innerHTML = '<option value="">Не удалось получить серверы</option>';
    showMessage(error.message, true);
  }
}
$("loginBtn").addEventListener("click", () => location.href = API + "/api/auth/discord");
$("logoutBtn").addEventListener("click", async () => {
  try { await api("/api/auth/logout", {method:"POST"}); } catch {}
  location.reload();
});
$("menuBtn").addEventListener("click", () => $("mainNav").classList.toggle("open"));
$("searchBtn").addEventListener("click", loadServers);
$("searchInput").addEventListener("input", () => { clearTimeout(searchTimer); searchTimer = setTimeout(loadServers, 250); });
$("categoryFilter").addEventListener("change", e => { selectedCategory = e.target.value; document.querySelectorAll(".chip").forEach(c => c.classList.toggle("active", c.dataset.category === selectedCategory)); loadServers(); });
$("categoryChips").addEventListener("click", e => {
  const chip = e.target.closest("[data-category]");
  if (!chip) return;
  selectedCategory = chip.dataset.category;
  $("categoryFilter").value = selectedCategory;
  document.querySelectorAll(".chip").forEach(c => c.classList.toggle("active", c === chip));
  loadServers();
});
$("addServerBtn").addEventListener("click", async e => {
  e.preventDefault();
  if (!currentUser) { location.href = API + "/api/auth/discord"; return; }
  $("submitSection").hidden = false;
  $("submitSection").scrollIntoView({behavior:"smooth"});
  await loadGuilds();
});
$("acceptRulesBtn").addEventListener("click", async () => {
  if (!$("rulesCheck").checked) { showMessage("Отметь согласие с правилами.", true); return; }
  try {
    await api("/api/auth/accept-rules", {method:"POST", body:JSON.stringify({accept:true})});
    $("rulesBox").hidden = true;
    $("serverForm").hidden = false;
    showMessage("Правила приняты. Теперь можно добавить сервер.");
  } catch (error) { showMessage(error.message, true); }
});
$("serverForm").addEventListener("submit", async e => {
  e.preventDefault();
  const button = $("submitServerBtn");
  button.disabled = true;
  showMessage("Проверяем права и отправляем заявку…");
  try {
    const result = await api("/api/servers", {method:"POST", body:JSON.stringify({
      guildId:$("guildSelect").value,
      description:$("serverDescription").value.trim(),
      category:$("serverCategory").value,
      inviteUrl:$("serverInvite").value.trim(),
      tags:$("serverTags").value.split(",").map(t=>t.trim()).filter(Boolean)
    })});
    showMessage(result.message || "Сервер отправлен на модерацию!");
    $("serverForm").reset();
  } catch (error) { showMessage(error.message, true); }
  finally { button.disabled = false; }
});
(async function init() {
  await loadAuth();
  await loadServers();
  if (new URLSearchParams(location.search).has("login")) {
    showMessage("Не удалось войти через Discord. Попробуй ещё раз.", true);
    history.replaceState({}, "", location.pathname);
  }
})();