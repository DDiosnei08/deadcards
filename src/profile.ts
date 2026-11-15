import { currentUser } from "./auth";
import type { Env } from "./worker";
import { normalizeAccountId, PROFILE_REFRESH_MS, type CollectedProfileCard, type LeaderboardCard, type ProfileCardState, type ProfileCardStats, type ProfileCollectionRedeem, type ProfileLeaderboard } from "./lib/profile";

const MATCH_LIMIT = 30;
const HISTORY_LIMIT = 20;
const CACHE_PREFIX = "profile-card:";
const LEADERBOARD_PAGE_SIZE = 6;

type Match = {
  match_id: number;
  start_time: number;
  hero_id: number;
  match_result: number;
  player_team: number;
  player_kills: number;
  player_deaths: number;
  player_assists: number;
};

type CardRow = {
  account_id: string;
  snapshot: string;
  checked_at: number;
};

type Lookup = { stats: ProfileCardStats } | { code: "no_data" | "unavailable"; status: number };

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "cache-control": "private, no-store" } });
const integer = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;

function validMatch(value: unknown): value is Match {
  if (!value || typeof value !== "object") return false;
  const m = value as Partial<Match>;
  return integer(m.match_id) && m.match_id > 0 && integer(m.start_time) &&
    integer(m.hero_id) && m.hero_id > 0 &&
    (m.match_result === 0 || m.match_result === 1) && (m.player_team === 0 || m.player_team === 1) &&
    integer(m.player_kills) && integer(m.player_deaths) && integer(m.player_assists);
}

async function fetchPublicData(env: Env, path: string) {
  return fetch(env.DEADLOCK_API_BASE + path, { signal: AbortSignal.timeout(8000) });
}

async function lookupCard(env: Env, accountId: string): Promise<Lookup> {
  const key = CACHE_PREFIX + accountId;
  const now = Math.floor(Date.now() / 1000);
  const cached = await env.DB.prepare("SELECT body FROM api_cache WHERE cache_key = ? AND fetched_at > ?")
    .bind(key, now - PROFILE_REFRESH_MS / 1000).first<string>("body");
  if (cached) return { stats: JSON.parse(cached) as ProfileCardStats };

  const path = `/v1/players/${accountId}`;
  const history = await fetchPublicData(env, `${path}/match-history`).catch(() => null);
  if (history?.status === 403 || history?.status === 404) return { code: "no_data", status: history.status };
  if (!history?.ok && history?.status !== 429) return { code: "unavailable", status: 502 };
  const body: unknown = await history.json().catch(() => null);
  if (!Array.isArray(body)) return { code: "unavailable", status: 502 };
  const matches = [...new Map(body.filter(validMatch).map((m) => [m.match_id, m])).values()]
    .sort((a, b) => b.start_time - a.start_time || b.match_id - a.match_id)
    .slice(0, MATCH_LIMIT);
  if (!matches.length) return history.status === 429
    ? { code: "unavailable", status: 502 }
    : { code: "no_data", status: 404 };

  const [rank, steam] = await Promise.all([
    fetchPublicData(env, `${path}/rank`)
      .then((r) => r.ok ? r.json<{ rank?: number; subrank?: number }>() : r.status === 404 ? { rank: 0 } : null).catch(() => null),
    fetchPublicData(env, `/v1/players/steam?account_ids=${accountId}`)
      .then((r) => r.ok ? r.json<{ personaname?: string }[]>() : []).catch(() => []),
  ]);
  const heroes = new Map<number, number>();
  let wins = 0, kills = 0, deaths = 0, assists = 0;
  for (const m of matches) {
    heroes.set(m.hero_id, (heroes.get(m.hero_id) ?? 0) + 1);
    wins += Number(m.player_team === m.match_result);
    kills += m.player_kills;
    deaths += m.player_deaths;
    assists += m.player_assists;
  }
  const [heroId] = [...heroes].sort((a, b) => b[1] - a[1])[0];
  const name = Array.isArray(steam) ? steam[0]?.personaname : null;
  const badge = rank?.rank === 0 ? null : integer(rank?.rank) && integer(rank?.subrank)
    ? { tier: rank.rank, subrank: rank.subrank } : undefined;
  const stats: ProfileCardStats = {
    accountId, name: typeof name === "string" ? name.trim().slice(0, 80) || null : null,
    heroId, rank: badge,
    matches: matches.length, wins, kills, deaths, assists, lastMatchId: matches[0].match_id, lastMatchAt: matches[0].start_time,
  };
  await env.DB.prepare("INSERT INTO api_cache (cache_key, body, fetched_at) VALUES (?, ?, ?) ON CONFLICT(cache_key) DO UPDATE SET body = excluded.body, fetched_at = excluded.fetched_at WHERE excluded.fetched_at > api_cache.fetched_at")
    .bind(key, JSON.stringify(stats), now).run();
  return { stats };
}

async function readProfile(env: Env, userId: string): Promise<ProfileCardState> {
  const rows = await env.DB.prepare(`SELECT h.id, p.account_id, p.published, h.snapshot, h.updated_at, h.automatic
    FROM profile_cards p JOIN profile_card_history h ON h.user_id = p.user_id AND h.account_id = p.account_id
    WHERE p.user_id = ? ORDER BY h.id DESC LIMIT ?`)
    .bind(userId, HISTORY_LIMIT).all<{ id: number; account_id: string; published: number; snapshot: string; updated_at: number; automatic: number }>();
  return {
    accountId: rows.results[0]?.account_id ?? null,
    published: rows.results[0]?.published === 1,
    history: rows.results.map((row) => ({
      id: row.id, stats: JSON.parse(row.snapshot) as ProfileCardStats, updatedAt: row.updated_at, automatic: row.automatic === 1,
    })),
  };
}

async function refreshProfile(env: Env, userId: string): Promise<ProfileCardState> {
  const card = await env.DB.prepare("SELECT account_id, snapshot, checked_at FROM profile_cards WHERE user_id = ?")
    .bind(userId).first<CardRow>();
  const now = Date.now();
  if (!card || now - card.checked_at < PROFILE_REFRESH_MS) return readProfile(env, userId);

  const result = await lookupCard(env, card.account_id);
  if ("code" in result) {
    if (result.status === 403) {
      const hidden = await env.DB.prepare("UPDATE profile_cards SET published = 0 WHERE user_id = ? AND account_id = ? AND checked_at = ?")
        .bind(userId, card.account_id, card.checked_at).run();
      if (hidden.meta.changes) return { accountId: card.account_id, published: false, history: [], issue: "no_data" };
      return readProfile(env, userId);
    }
    return { ...await readProfile(env, userId), issue: result.code };
  }

  const previous = JSON.parse(card.snapshot) as ProfileCardStats;
  const next = result.stats;
  // Preserve the last good card if the upstream returns an older slice or omits optional lookups.
  const older = next.lastMatchAt < previous.lastMatchAt ||
    (next.lastMatchAt === previous.lastMatchAt && next.lastMatchId < previous.lastMatchId) ||
    (next.lastMatchId === previous.lastMatchId && next.matches < previous.matches);
  const { accountId, name, heroId, rank, ...totals } = next;
  const snapshot = older ? card.snapshot : JSON.stringify({
    accountId, name: name ?? previous.name, heroId, rank: rank === undefined ? previous.rank : rank, ...totals,
  });
  const changed = snapshot !== card.snapshot;
  await env.DB.prepare(`UPDATE profile_cards SET snapshot = ?, checked_at = ?,
    updated_at = CASE WHEN ? THEN ? ELSE updated_at END, automatic = CASE WHEN ? THEN 1 ELSE automatic END
    WHERE user_id = ? AND account_id = ? AND checked_at = ?`)
    .bind(snapshot, now, changed, now, changed, userId, card.account_id, card.checked_at).run();
  return readProfile(env, userId);
}

export async function profileCard(env: Env, request: Request): Promise<Response> {
  const user = await currentUser(env, request);
  if (!user) return json({ code: "login" }, 401);
  const url = new URL(request.url);
  if (request.method === "GET") {
    const accountId = normalizeAccountId(url.searchParams.get("id"));
    if (!accountId) return json({ code: "invalid_id" }, 400);
    const result = await lookupCard(env, accountId);
    return "stats" in result ? json(result.stats) : json({ code: result.code }, result.status);
  }
  if (request.method !== "POST" && request.method !== "PUT" && request.method !== "PATCH") return json({ code: "method" }, 405);
  const origin = request.headers.get("origin");
  if (origin && origin !== url.origin) return json({ code: "origin" }, 403);
  if (request.method === "POST") return json(await refreshProfile(env, user.id));

  const body = await request.json<{ accountId?: unknown; published?: unknown }>().catch(() => null);
  const accountId = normalizeAccountId(body?.accountId);
  if (!accountId) return json({ code: "invalid_id" }, 400);
  if (request.method === "PATCH") {
    if (typeof body?.published !== "boolean") return json({ code: "invalid_visibility" }, 400);
    const saved = await env.DB.prepare("SELECT 1 AS saved FROM profile_cards WHERE user_id = ? AND account_id = ?")
      .bind(user.id, accountId).first();
    if (!saved) return json({ code: "save_first" }, 409);
    if (body.published) {
      const result = await lookupCard(env, accountId);
      if ("code" in result) return json({ code: result.code }, result.status);
    }
    const updated = await env.DB.prepare("UPDATE profile_cards SET published = ? WHERE user_id = ? AND account_id = ?")
      .bind(body.published, user.id, accountId).run();
    if (!updated.meta.changes) return json({ code: "save_first" }, 409);
    return json(await readProfile(env, user.id));
  }
  const result = await lookupCard(env, accountId);
  if ("code" in result) return json({ code: result.code }, result.status);

  const now = Date.now();
  await env.DB.prepare(`INSERT INTO profile_cards (user_id, account_id, snapshot, checked_at, updated_at) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET account_id = excluded.account_id, snapshot = excluded.snapshot,
    checked_at = excluded.checked_at, updated_at = excluded.updated_at, automatic = 0, published = 0
    WHERE profile_cards.account_id <> excluded.account_id`)
    .bind(user.id, accountId, JSON.stringify(result.stats), now, now).run();
  return json(await readProfile(env, user.id));
}

export async function profileLeaderboard(env: Env, request: Request): Promise<Response> {
  if (request.method !== "GET") return json({ code: "method" }, 405);
  const raw = new URL(request.url).searchParams.get("page") ?? "0";
  const page = Number(raw);
  if (!/^\d+$/.test(raw) || !Number.isSafeInteger(page * LEADERBOARD_PAGE_SIZE)) return json({ code: "invalid_page" }, 400);
  const { results } = await env.DB.prepare(`WITH candidates AS (
    SELECT account_id, snapshot,
      ROW_NUMBER() OVER (PARTITION BY account_id ORDER BY updated_at DESC, user_id) AS latest
    FROM profile_cards WHERE published = 1
  )
  SELECT snapshot FROM candidates WHERE latest = 1
  ORDER BY COALESCE(json_extract(snapshot, '$.rank.tier'), 0) DESC,
    COALESCE(json_extract(snapshot, '$.rank.subrank'), 0) DESC,
    1.0 * json_extract(snapshot, '$.wins') / json_extract(snapshot, '$.matches') DESC,
    json_extract(snapshot, '$.matches') DESC, account_id
  LIMIT ? OFFSET ?`).bind(LEADERBOARD_PAGE_SIZE + 1, page * LEADERBOARD_PAGE_SIZE).all<{ snapshot: string }>();
  const cards = results.slice(0, LEADERBOARD_PAGE_SIZE).map(({ snapshot }): LeaderboardCard => {
    const { name, heroId, rank, matches, wins, kills, deaths, assists } = JSON.parse(snapshot) as ProfileCardStats;
    return { name, heroId, rank, matches, wins, kills, deaths, assists };
  });
  const result: ProfileLeaderboard = { cards, nextPage: results.length > LEADERBOARD_PAGE_SIZE ? page + 1 : null };
  return json(result);
}

type CollectionRow = { snapshot: string; redeemed_at: number };

function collectedCard(row: CollectionRow): CollectedProfileCard {
  return { stats: JSON.parse(row.snapshot) as ProfileCardStats, redeemedAt: row.redeemed_at };
}

export async function profileCollection(env: Env, request: Request): Promise<Response> {
  const user = await currentUser(env, request);
  if (!user) return json({ code: "login" }, 401);
  if (request.method === "GET") {
    const { results } = await env.DB.prepare("SELECT snapshot, redeemed_at FROM profile_collection WHERE user_id = ? ORDER BY redeemed_at DESC, account_id")
      .bind(user.id).all<CollectionRow>();
    return json(results.map(collectedCard));
  }
  if (request.method !== "POST") return json({ code: "method" }, 405);
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return json({ code: "origin" }, 403);

  const body = await request.json<{ accountId?: unknown }>().catch(() => null);
  const accountId = normalizeAccountId(body?.accountId);
  if (!accountId) return json({ code: "invalid_id" }, 400);
  const find = env.DB.prepare("SELECT snapshot, redeemed_at FROM profile_collection WHERE user_id = ? AND account_id = ?").bind(user.id, accountId);
  const existing = await find.first<CollectionRow>();
  if (existing) return json({ card: collectedCard(existing), added: false } satisfies ProfileCollectionRedeem);

  const result = await lookupCard(env, accountId);
  if ("code" in result) return json({ code: result.code }, result.status);
  const inserted = await env.DB.prepare(`INSERT INTO profile_collection (user_id, account_id, snapshot, redeemed_at)
    VALUES (?, ?, ?, ?) ON CONFLICT(user_id, account_id) DO NOTHING RETURNING snapshot, redeemed_at`)
    .bind(user.id, accountId, JSON.stringify(result.stats), Date.now()).first<CollectionRow>();
  const row = inserted ?? await find.first<CollectionRow>();
  if (!row) return json({ code: "unavailable" }, 503);
  return json({ card: collectedCard(row), added: !!inserted } satisfies ProfileCollectionRedeem);
}

export async function pruneProfileCache(env: Env) {
  await env.DB.prepare("DELETE FROM api_cache WHERE cache_key GLOB ? AND fetched_at < unixepoch() - ?")
    .bind(CACHE_PREFIX + "*", PROFILE_REFRESH_MS / 1000).run();
}
