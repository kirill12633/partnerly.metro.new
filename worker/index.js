const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
});

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/health") {
      return json({ ok: true, service: "metro-new-partnerly", databaseConfigured: Boolean(env.DB) });
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
  }
};
