import { currentUser } from "./auth";
import type { Env } from "./worker";
import { calculateOVR } from "./lib/cards";
import { parseProfileCard, type CollectedProfileCard, type ProfileCard, type ProfileCardState, type ProfileCollectionRedeem, type ProfileLeaderboard } from "./lib/profile";

const HISTORY_LIMIT = 20;
const LEADERBOARD_PAGE_SIZE = 6;

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "cache-control": "private, no-store" } });
const sameOrigin = (request: Request) => {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
};

async function readProfile(env: Env, userId: string): Promise<ProfileCardState> {
  const [card, history] = await env.DB.batch<{ published?: number; id?: number; snapshot?: string; updated_at?: number }>([
    env.DB.prepare("SELECT published FROM profile_cards WHERE user_id = ?").bind(userId),
    env.DB.prepare("SELECT id, snapshot, updated_at FROM profile_card_history WHERE user_id = ? ORDER BY id DESC LIMIT ?").bind(userId, HISTORY_LIMIT),
  ]);
  return {
    published: card.results[0]?.published === 1,
    history: history.results.map((row) => ({ id: row.id!, card: JSON.parse(row.snapshot!) as ProfileCard, updatedAt: row.updated_at! })),
  };
}

export async function profileCard(env: Env, request: Request): Promise<Response> {
  const user = await currentUser(env, request);
  if (!user) return json({ code: "login" }, 401);
  if (request.method === "GET") return json(await readProfile(env, user.id));
  if (request.method !== "PUT" && request.method !== "PATCH") return json({ code: "method" }, 405);
  if (!sameOrigin(request)) return json({ code: "origin" }, 403);
  const body = await request.json<Record<string, unknown>>().catch(() => null);

  if (request.method === "PATCH") {
    if (typeof body?.published !== "boolean") return json({ code: "invalid_visibility" }, 400);
    const updated = await env.DB.prepare("UPDATE profile_cards SET published = ? WHERE user_id = ?").bind(body.published ? 1 : 0, user.id).run();
    if (!updated.meta.changes) return json({ code: "save_first" }, 409);
    return json(await readProfile(env, user.id));
  }

  const card = parseProfileCard(body);
  if (!card) return json({ code: "invalid_card" }, 400);
  await env.DB.prepare(`INSERT INTO profile_cards (user_id, snapshot, ovr, updated_at) VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET snapshot = excluded.snapshot, ovr = excluded.ovr, updated_at = excluded.updated_at
    WHERE profile_cards.snapshot <> excluded.snapshot`)
    .bind(user.id, JSON.stringify(card), calculateOVR(card.stats), Date.now()).run();
  return json(await readProfile(env, user.id));
}

export async function profileLeaderboard(env: Env, request: Request): Promise<Response> {
  if (request.method !== "GET") return json({ code: "method" }, 405);
  const raw = new URL(request.url).searchParams.get("page") ?? "0";
  const page = Number(raw);
  if (!/^\d+$/.test(raw) || !Number.isSafeInteger(page * LEADERBOARD_PAGE_SIZE)) return json({ code: "invalid_page" }, 400);
  const { results } = await env.DB.prepare(`SELECT snapshot FROM profile_cards WHERE published = 1
    ORDER BY ovr DESC, updated_at DESC, user_id LIMIT ? OFFSET ?`)
    .bind(LEADERBOARD_PAGE_SIZE + 1, page * LEADERBOARD_PAGE_SIZE).all<{ snapshot: string }>();
  const result: ProfileLeaderboard = {
    cards: results.slice(0, LEADERBOARD_PAGE_SIZE).map(({ snapshot }) => JSON.parse(snapshot) as ProfileCard),
    nextPage: results.length > LEADERBOARD_PAGE_SIZE ? page + 1 : null,
  };
  return json(result);
}

type CollectionRow = { id: number; snapshot: string; redeemed_at: number };

const collectedCard = (row: CollectionRow): CollectedProfileCard =>
  ({ id: row.id, card: JSON.parse(row.snapshot) as ProfileCard, redeemedAt: row.redeemed_at });

export async function profileCollection(env: Env, request: Request): Promise<Response> {
  const user = await currentUser(env, request);
  if (!user) return json({ code: "login" }, 401);
  if (request.method === "GET") {
    const { results } = await env.DB.prepare("SELECT id, snapshot, redeemed_at FROM profile_collection WHERE user_id = ? ORDER BY redeemed_at DESC, id DESC")
      .bind(user.id).all<CollectionRow>();
    return json(results.map(collectedCard));
  }
  if (request.method !== "POST") return json({ code: "method" }, 405);
  if (!sameOrigin(request)) return json({ code: "origin" }, 403);

  const snapshot = await env.DB.prepare("SELECT snapshot FROM profile_cards WHERE user_id = ?").bind(user.id).first<string>("snapshot");
  if (!snapshot) return json({ code: "save_first" }, 409);
  const inserted = await env.DB.prepare(`INSERT INTO profile_collection (user_id, snapshot, redeemed_at) VALUES (?, ?, ?)
    ON CONFLICT(user_id, snapshot) DO NOTHING RETURNING id, snapshot, redeemed_at`)
    .bind(user.id, snapshot, Date.now()).first<CollectionRow>();
  const row = inserted ?? await env.DB.prepare("SELECT id, snapshot, redeemed_at FROM profile_collection WHERE user_id = ? AND snapshot = ?")
    .bind(user.id, snapshot).first<CollectionRow>();
  if (!row) return json({ code: "unavailable" }, 503);
  return json({ card: collectedCard(row), added: !!inserted } satisfies ProfileCollectionRedeem);
}
