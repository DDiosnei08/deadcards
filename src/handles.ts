import type { Env } from "./worker";

type LinkedAccount = { userId: string; providerId: string; accessToken?: string | null };

const TWITCH_LOGIN = /^[a-z0-9_]{1,25}$/;
const YOUTUBE_HANDLE = /^[a-z0-9._-]{3,30}$/;

async function fetchHandle(env: Env, providerId: string, token: string): Promise<string | null> {
  const signal = AbortSignal.timeout(5000);
  if (providerId === "twitch") {
    const res = await fetch("https://api.twitch.tv/helix/users", { headers: { authorization: `Bearer ${token}`, "client-id": env.TWITCH_CLIENT_ID }, signal });
    const login = res.ok ? (await res.json<{ data?: { login?: unknown }[] }>()).data?.[0]?.login : null;
    return typeof login === "string" && TWITCH_LOGIN.test(login) ? login : null;
  }
  if (providerId === "google") {
    const res = await fetch("https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true", { headers: { authorization: `Bearer ${token}` }, signal });
    const url = res.ok ? (await res.json<{ items?: { snippet?: { customUrl?: unknown } }[] }>()).items?.[0]?.snippet?.customUrl : null;
    const handle = typeof url === "string" ? url.toLowerCase().replace(/^@/, "") : null;
    return handle && YOUTUBE_HANDLE.test(handle) ? handle : null;
  }
  return null;
}

// One namespace for both providers: a nick held by another user only moves when it comes from the same
// provider (a recycled Twitch login or YouTube handle). Across providers it stays put until the accounts are joined.
export async function syncHandle(env: Env, account: LinkedAccount) {
  try {
    if (!account.accessToken) return;
    const owned = await env.DB.prepare("SELECT provider FROM profile_handles WHERE user_id = ?").bind(account.userId).first<string>("provider");
    if (owned && owned !== account.providerId) return;
    const handle = await fetchHandle(env, account.providerId, account.accessToken);
    if (!handle) return;
    const holder = await env.DB.prepare("SELECT user_id, provider FROM profile_handles WHERE handle = ?").bind(handle).first<{ user_id: string; provider: string }>();
    if (holder && holder.user_id !== account.userId && holder.provider !== account.providerId) return;
    await env.DB.batch([
      env.DB.prepare("DELETE FROM profile_handles WHERE handle = ? AND user_id <> ?").bind(handle, account.userId),
      env.DB.prepare(`INSERT INTO profile_handles (user_id, handle, provider) VALUES (?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET handle = excluded.handle WHERE profile_handles.provider = excluded.provider`)
        .bind(account.userId, handle, account.providerId),
    ]);
  } catch (e) {
    console.error("handle sync failed", e);
  }
}

export async function handleOf(env: Env, userId: string) {
  return env.DB.prepare("SELECT handle FROM profile_handles WHERE user_id = ?").bind(userId).first<string>("handle");
}
