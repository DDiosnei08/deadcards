/// <reference types="@cloudflare/workers-types" />
import { createAuth, currentUser } from "./auth";

export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  ASSETS_BUCKET: R2Bucket;
  DEADLOCK_API_BASE: string;
  BETTER_AUTH_SECRET: string;
  TWITCH_CLIENT_ID: string;
  TWITCH_CLIENT_SECRET: string;
  ADMINS: string;
}

const IMAGE_TYPES: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif" };
const UPLOAD_FOLDERS = ["players", "teams", "heroes", "bg", "home"];
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const PLAYER_EXTRA = ["footer", "footerSize", "footerColor", "special", "specialText", "frame", "variantOf", "inactive", "art"];
const ID_RE = /^[\w-]{1,64}$/;

const keyOf = (url: unknown) => (typeof url === "string" && url.startsWith("/img/") ? url.slice(5) : null);
const num = (v: unknown, fallback: number) => (typeof v === "number" && Number.isFinite(v) ? v : fallback);
const bad = (msg: string, status = 400) => Response.json({ error: msg }, { status });

const CACHE_TTL_SECONDS = 60 * 60 * 6;
const ALLOWED_PATHS = ["/v1/assets/heroes", "/v1/analytics/hero-stats", "/v1/patches"];
const UPSERT_CACHE =
  "INSERT INTO api_cache (cache_key, body, fetched_at) VALUES (?, ?, ?) ON CONFLICT(cache_key) DO UPDATE SET body = excluded.body, fetched_at = excluded.fetched_at";

const imgUrl = (key: string | null) => (key ? `/img/${key}` : undefined);
const parse = <T>(s: string | null, fallback: T): T => {
  if (!s) return fallback;
  try { return JSON.parse(s) as T; } catch { return fallback; }
};

async function cachedFetch(env: Env, path: string): Promise<Response> {
  const now = Math.floor(Date.now() / 1000);
  const row = await env.DB.prepare("SELECT body, fetched_at FROM api_cache WHERE cache_key = ?")
    .bind(path)
    .first<{ body: string; fetched_at: number }>();
  if (row && now - row.fetched_at < CACHE_TTL_SECONDS) {
    return new Response(row.body, { headers: { "content-type": "application/json", "x-cache": "hit" } });
  }
  const upstream = await fetch(env.DEADLOCK_API_BASE + path);
  if (!upstream.ok) return upstream;
  const body = await upstream.text();
  await env.DB.prepare(UPSERT_CACHE).bind(path, body, now).run();
  return new Response(body, { headers: { "content-type": "application/json", "x-cache": "miss" } });
}

async function syncFromDeadlockApi(env: Env): Promise<void> {
  for (const path of ALLOWED_PATHS) {
    const res = await fetch(env.DEADLOCK_API_BASE + path);
    if (!res.ok) continue;
    await env.DB.prepare(UPSERT_CACHE).bind(path, await res.text(), Math.floor(Date.now() / 1000)).run();
  }
}

async function appData(env: Env): Promise<Response> {
  const [teams, players, heroes, settings] = await env.DB.batch([
    env.DB.prepare("SELECT * FROM teams ORDER BY rowid"),
    env.DB.prepare("SELECT * FROM players ORDER BY rowid"),
    env.DB.prepare("SELECT * FROM heroes"),
    env.DB.prepare("SELECT * FROM settings"),
  ]);
  const s = Object.fromEntries((settings.results as { key: string; value_json: string }[]).map((r) => [r.key, parse<unknown>(r.value_json, null)]));
  const bg = s.bg as Record<string, unknown> | null;
  return Response.json({
    teams: (teams.results as Record<string, string | null>[]).map((t) => {
      const tbg = parse<Record<string, unknown> | null>(t.bg_json, null);
      return { id: t.id, name: t.name, tag: t.tag, region: t.region, logo: imgUrl(t.logo_key), ...(tbg ? { bg: tbg } : {}) };
    }),
    players: (players.results as Record<string, string | number | null>[]).map((p) => ({
      ...parse(p.extra_json as string, {}),
      id: p.id, teamId: p.team_id, name: p.name, position: p.position, hero: p.hero,
      stats: parse(p.stats_json as string, {}), ...(p.ovr !== null ? { ovr: p.ovr } : {}),
      c1: p.c1, c2: p.c2, history: parse(p.history_json as string, []),
    })),
    heroes: Object.fromEntries((heroes.results as { name: string; image_key: string; zoom: number; x: number; y: number }[])
      .map((h) => [h.name, { name: h.name, url: imgUrl(h.image_key), zoom: h.zoom, x: h.x, y: h.y }])),
    settings: {
      tierConfig: s.tierConfig ?? undefined,
      bg: bg ? { ...bg, imageUrl: imgUrl((s.bgImageKey as string) ?? null) } : undefined,
      homeHero: imgUrl((s.homeHeroKey as string) ?? null),
    },
  });
}

async function serveImage(env: Env, key: string): Promise<Response> {
  const obj = await env.ASSETS_BUCKET.get(key);
  if (!obj) return new Response("not found", { status: 404 });
  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set("etag", obj.httpEtag);
  headers.set("cache-control", "public, max-age=86400");
  return new Response(obj.body, { headers });
}

async function upload(env: Env, request: Request, folder: string): Promise<Response> {
  const ext = IMAGE_TYPES[request.headers.get("content-type") ?? ""];
  if (!ext) return bad("tipo de imagem não suportado");
  if (!UPLOAD_FOLDERS.includes(folder)) return bad("pasta inválida");
  const body = await request.arrayBuffer();
  if (!body.byteLength || body.byteLength > MAX_UPLOAD_BYTES) return bad("imagem vazia ou maior que 8 MB");
  const key = `${folder}/${crypto.randomUUID()}.${ext}`;
  await env.ASSETS_BUCKET.put(key, body, { httpMetadata: { contentType: request.headers.get("content-type")! } });
  return Response.json({ url: `/img/${key}` });
}

// shortcut: replaced or deleted images stay in R2, add a sweep if the bucket grows
async function write(env: Env, request: Request, kind: string, id: string): Promise<Response> {
  const del = request.method === "DELETE";
  if (!del && request.method !== "PUT") return bad("método não suportado", 405);
  const b = del ? {} : ((await request.json()) as Record<string, any>);
  const db = env.DB;
  if (kind === "players") {
    if (del) await db.prepare("DELETE FROM players WHERE id = ?").bind(id).run();
    else {
      if (!b.name || !b.teamId || !b.stats) return bad("jogador incompleto");
      const extra = Object.fromEntries(PLAYER_EXTRA.filter((k) => b[k] !== undefined && b[k] !== null).map((k) => [k, b[k]]));
      await db.prepare(
        "INSERT INTO players (id, team_id, name, position, hero, stats_json, ovr, c1, c2, history_json, extra_json) VALUES (?,?,?,?,?,?,?,?,?,?,?) " +
        "ON CONFLICT(id) DO UPDATE SET team_id=excluded.team_id, name=excluded.name, position=excluded.position, hero=excluded.hero, stats_json=excluded.stats_json, ovr=excluded.ovr, c1=excluded.c1, c2=excluded.c2, history_json=excluded.history_json, extra_json=excluded.extra_json",
      ).bind(id, b.teamId, b.name, b.position ?? "Flex", b.hero ?? "Abrams", JSON.stringify(b.stats), Number.isFinite(b.ovr) ? Math.round(b.ovr) : null,
        b.c1 ?? "#0e7490", b.c2 ?? "#082f49", JSON.stringify(b.history ?? []), JSON.stringify(extra)).run();
    }
  } else if (kind === "teams") {
    if (del) await db.batch([db.prepare("DELETE FROM players WHERE team_id = ?").bind(id), db.prepare("DELETE FROM teams WHERE id = ?").bind(id)]);
    else {
      if (!b.name || !b.tag) return bad("time incompleto");
      await db.prepare(
        "INSERT INTO teams (id, name, tag, region, logo_key, bg_json) VALUES (?,?,?,?,?,?) " +
        "ON CONFLICT(id) DO UPDATE SET name=excluded.name, tag=excluded.tag, region=excluded.region, logo_key=excluded.logo_key, bg_json=excluded.bg_json",
      ).bind(id, b.name, b.tag, b.region ?? "Europa", keyOf(b.logo), b.bg ? JSON.stringify(b.bg) : null).run();
    }
  } else if (kind === "heroes") {
    if (del) await db.prepare("DELETE FROM heroes WHERE name = ?").bind(id).run();
    else {
      const key = keyOf(b.url);
      if (!key) return bad("imagem do herói obrigatória");
      await db.prepare("INSERT INTO heroes (name, image_key, zoom, x, y) VALUES (?,?,?,?,?) ON CONFLICT(name) DO UPDATE SET image_key=excluded.image_key, zoom=excluded.zoom, x=excluded.x, y=excluded.y")
        .bind(id, key, num(b.zoom, 100), num(b.x, 50), num(b.y, 30)).run();
    }
  } else if (kind === "settings" && !del) {
    const rows: Record<string, unknown> = {};
    if (b.tierConfig !== undefined) rows.tierConfig = b.tierConfig;
    if (b.bg !== undefined) { rows.bg = b.bg ? { ...b.bg, imageUrl: "" } : null; rows.bgImageKey = keyOf(b.bg?.imageUrl); }
    if (b.homeHero !== undefined) rows.homeHeroKey = keyOf(b.homeHero);
    await db.batch(Object.entries(rows).map(([k, v]) => db.prepare("INSERT INTO settings (key, value_json) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json").bind(k, JSON.stringify(v))));
  } else return bad("rota inválida", 404);
  return Response.json({ ok: true });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/auth/")) return createAuth(env, request).handler(request);
    if (url.pathname === "/api/me") return Response.json(await currentUser(env, request));
    const admin = url.pathname.match(/^\/api\/(players|teams|heroes|settings|upload)\/([^/]+)$/);
    if (admin) {
      if (!(await currentUser(env, request))?.admin) return bad("sem permissão", 403);
      const id = decodeURIComponent(admin[2]);
      if (admin[1] === "upload") return request.method === "POST" ? upload(env, request, id) : bad("método não suportado", 405);
      if (admin[1] !== "heroes" && !ID_RE.test(id)) return bad("id inválido");
      return write(env, request, admin[1], id);
    }
    if (url.pathname === "/api/health") return Response.json({ ok: true });
    if (url.pathname === "/api/data") return appData(env);
    if (url.pathname === "/api/deadlock") {
      const path = url.searchParams.get("path") ?? "";
      if (!ALLOWED_PATHS.includes(path)) return Response.json({ error: "path not allowed" }, { status: 400 });
      return cachedFetch(env, path);
    }
    if (url.pathname.startsWith("/img/")) {
      const key = decodeURIComponent(url.pathname.slice(5));
      if (!/^[a-z0-9/_.-]+$/i.test(key) || key.includes("..")) return new Response("bad key", { status: 400 });
      return serveImage(env, key);
    }
    return env.ASSETS.fetch(request);
  },

  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(syncFromDeadlockApi(env));
  },
} satisfies ExportedHandler<Env>;
