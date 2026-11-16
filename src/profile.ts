import { currentUser } from "./auth";
import type { Env } from "./worker";
import { parseProfileCard, type ProfileCard, type ProfileCardState, type PublicProfile } from "./lib/profile";

const HISTORY_LIMIT = 20;

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "cache-control": "private, no-store" } });

async function readProfile(env: Env, userId: string): Promise<ProfileCardState> {
  const { results } = await env.DB.prepare("SELECT id, snapshot, updated_at FROM profile_card_history WHERE user_id = ? ORDER BY id DESC LIMIT ?")
    .bind(userId, HISTORY_LIMIT).all<{ id: number; snapshot: string; updated_at: number }>();
  return { history: results.map((row) => ({ id: row.id, card: JSON.parse(row.snapshot) as ProfileCard, updatedAt: row.updated_at })) };
}

export async function profileCard(env: Env, request: Request): Promise<Response> {
  const user = await currentUser(env, request);
  if (!user) return json({ code: "login" }, 401);
  if (request.method === "GET") return json(await readProfile(env, user.id));
  if (request.method !== "PUT") return json({ code: "method" }, 405);
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return json({ code: "origin" }, 403);

  const card = parseProfileCard(await request.json().catch(() => null));
  if (!card) return json({ code: "invalid_card" }, 400);
  await env.DB.prepare(`INSERT INTO profile_cards (user_id, snapshot, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET snapshot = excluded.snapshot, updated_at = excluded.updated_at
    WHERE profile_cards.snapshot <> excluded.snapshot`)
    .bind(user.id, JSON.stringify(card), Date.now()).run();
  return json(await readProfile(env, user.id));
}

export async function publicProfile(env: Env, key: string): Promise<Response> {
  if (!/^@?[A-Za-z0-9._-]{1,64}$/.test(key)) return json({ code: "not_found" }, 404);
  const handle = key.replace(/^@/, "");
  const userId = await env.DB.prepare("SELECT user_id FROM profile_handles WHERE handle = ?").bind(handle).first<string>("user_id") ?? handle;
  const [user, card, cards] = await env.DB.batch<{ name?: string; image?: string | null; handle?: string | null; snapshot?: string; player_id?: string }>([
    env.DB.prepare(`SELECT u.name, u.image, h.handle FROM "user" u LEFT JOIN profile_handles h ON h.user_id = u.id WHERE u.id = ?`).bind(userId),
    env.DB.prepare("SELECT snapshot FROM profile_cards WHERE user_id = ?").bind(userId),
    env.DB.prepare("SELECT player_id FROM user_cards WHERE user_id = ? ORDER BY redeemed_at DESC").bind(userId),
  ]);
  const row = user.results[0];
  if (!row) return json({ code: "not_found" }, 404);
  const result: PublicProfile = {
    id: userId,
    handle: row.handle ?? null,
    name: row.name!,
    image: row.image ?? null,
    card: card.results[0] ? JSON.parse(card.results[0].snapshot!) as ProfileCard : null,
    cards: cards.results.map((r) => r.player_id!),
  };
  return Response.json(result, { headers: { "cache-control": "no-store" } });
}
