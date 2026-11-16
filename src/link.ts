import { currentUser } from "./auth";
import { handleOf } from "./handles";
import type { Env } from "./worker";

export const LINK_PROVIDERS = ["twitch", "google"] as const;
type Provider = (typeof LINK_PROVIDERS)[number];

const COOKIE = "dc_link";
const TTL_MS = 10 * 60 * 1000;
const SESSION_COOKIES = ["better-auth.session_token", "better-auth.session_data", "__Secure-better-auth.session_token", "__Secure-better-auth.session_data"];

async function sign(env: Env, value: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(env.BETTER_AUTH_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`link:${value}`));
  return btoa(String.fromCharCode(...new Uint8Array(mac))).replace(/[+/=]/g, (c) => ({ "+": "-", "/": "_", "=": "" })[c]!);
}

function cookie(request: Request, name: string, value: string, maxAge: number) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

function readCookie(request: Request, name: string) {
  return request.headers.get("cookie")?.split(/;\s*/).find((c) => c.startsWith(`${name}=`))?.slice(name.length + 1);
}

async function readLink(env: Env, request: Request) {
  const [userId, provider, exp, mac] = readCookie(request, COOKIE)?.split(".") ?? [];
  if (!userId || !provider || !exp || !mac || Number(exp) < Date.now()) return null;
  if (mac !== await sign(env, `${userId}.${provider}.${exp}`)) return null;
  return { userId, provider };
}

const json = (body: unknown, status = 200, cookies: string[] = []) => {
  const headers = new Headers({ "cache-control": "no-store" });
  cookies.forEach((c) => headers.append("set-cookie", c));
  return Response.json(body, { status, headers });
};

// Joining needs proof of both sides: the signed cookie is issued to the logged-in user A, and the
// finish call runs after the same browser signed in with the other provider as user B.
export async function accountLink(env: Env, request: Request, step: string): Promise<Response> {
  if (request.method !== "POST") return json({ code: "method" }, 405);
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return json({ code: "origin" }, 403);
  const user = await currentUser(env, request);
  if (!user) return json({ code: "login" }, 401);

  if (step === "start") {
    const body = await request.json<{ provider?: unknown }>().catch(() => null);
    const provider = body?.provider;
    if (!LINK_PROVIDERS.includes(provider as Provider)) return json({ code: "invalid_provider" }, 400);
    const value = `${user.id}.${provider}.${Date.now() + TTL_MS}`;
    return json({ ok: true }, 200, [cookie(request, COOKIE, `${value}.${await sign(env, value)}`, TTL_MS / 1000)]);
  }
  if (step !== "finish") return json({ code: "not_found" }, 404);

  const link = await readLink(env, request);
  const clear = cookie(request, COOKIE, "", 0);
  if (!link) return json({ code: "expired" }, 400, [clear]);
  const target = link.userId;
  const source = user.id;
  if (source === target) return json({ merged: false, profile: await handleOf(env, target) ?? target }, 200, [clear]);
  if (!await env.DB.prepare(`SELECT 1 FROM "user" WHERE id = ?`).bind(target).first()) return json({ code: "expired" }, 400, [clear]);

  const now = new Date().toISOString();
  const noCard = "NOT EXISTS (SELECT 1 FROM profile_cards WHERE user_id = ?1)";
  await env.DB.batch([
    env.DB.prepare("PRAGMA defer_foreign_keys = on"),
    // Moved logins get a fresh createdAt so the target's original first login still decides admin.
    env.DB.prepare(`UPDATE "account" SET "userId" = ?1, "createdAt" = ?3, "updatedAt" = ?3 WHERE "userId" = ?2`).bind(target, source, now),
    env.DB.prepare("INSERT OR IGNORE INTO user_cards (user_id, player_id, redeemed_at) SELECT ?1, player_id, redeemed_at FROM user_cards WHERE user_id = ?2").bind(target, source),
    env.DB.prepare("DELETE FROM user_cards WHERE user_id = ?").bind(source),
    env.DB.prepare(`UPDATE profile_card_history SET user_id = ?1 WHERE user_id = ?2 AND ${noCard}`).bind(target, source),
    env.DB.prepare(`UPDATE profile_cards SET user_id = ?1 WHERE user_id = ?2 AND ${noCard}`).bind(target, source),
    env.DB.prepare("UPDATE profile_handles SET user_id = ?1 WHERE user_id = ?2 AND NOT EXISTS (SELECT 1 FROM profile_handles WHERE user_id = ?1)").bind(target, source),
    env.DB.prepare(`DELETE FROM "user" WHERE id = ?`).bind(source),
  ]);
  return json(
    { merged: true, provider: link.provider, profile: await handleOf(env, target) ?? target },
    200,
    [clear, ...SESSION_COOKIES.map((name) => cookie(request, name, "", 0))],
  );
}
