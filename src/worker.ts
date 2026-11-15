/// <reference types="@cloudflare/workers-types" />

export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  ASSETS_BUCKET: R2Bucket;
  DEADLOCK_API_BASE: string;
}

const CACHE_TTL_SECONDS = 60 * 60 * 6;
const ALLOWED_PATHS = ["/v1/assets/heroes", "/v1/analytics/hero-stats", "/v1/patches"];

async function cachedFetch(env: Env, path: string): Promise<Response> {
  const cacheKey = path;
  const now = Math.floor(Date.now() / 1000);
  const row = await env.DB.prepare("SELECT body, fetched_at FROM api_cache WHERE cache_key = ?")
    .bind(cacheKey)
    .first<{ body: string; fetched_at: number }>();
  if (row && now - row.fetched_at < CACHE_TTL_SECONDS) {
    return new Response(row.body, { headers: { "content-type": "application/json", "x-cache": "hit" } });
  }
  const upstream = await fetch(env.DEADLOCK_API_BASE + path);
  if (!upstream.ok) return upstream;
  const body = await upstream.text();
  await env.DB.prepare(
    "INSERT INTO api_cache (cache_key, body, fetched_at) VALUES (?, ?, ?) ON CONFLICT(cache_key) DO UPDATE SET body = excluded.body, fetched_at = excluded.fetched_at",
  )
    .bind(cacheKey, body, now)
    .run();
  return new Response(body, { headers: { "content-type": "application/json", "x-cache": "miss" } });
}

async function syncFromDeadlockApi(env: Env): Promise<void> {
  for (const path of ALLOWED_PATHS) {
    const res = await fetch(env.DEADLOCK_API_BASE + path);
    if (!res.ok) continue;
    const body = await res.text();
    await env.DB.prepare(
      "INSERT INTO api_cache (cache_key, body, fetched_at) VALUES (?, ?, ?) ON CONFLICT(cache_key) DO UPDATE SET body = excluded.body, fetched_at = excluded.fetched_at",
    )
      .bind(path, body, Math.floor(Date.now() / 1000))
      .run();
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/api/health") {
      return Response.json({ ok: true });
    }
    if (url.pathname === "/api/deadlock") {
      const path = url.searchParams.get("path") ?? "";
      if (!ALLOWED_PATHS.includes(path)) {
        return Response.json({ error: "path not allowed" }, { status: 400 });
      }
      return cachedFetch(env, path);
    }
    return env.ASSETS.fetch(request);
  },

  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(syncFromDeadlockApi(env));
  },
} satisfies ExportedHandler<Env>;
