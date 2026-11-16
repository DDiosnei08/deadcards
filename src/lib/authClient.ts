import { createAuthClient } from "better-auth/client";

export const auth = createAuthClient();

export const signInWithTwitch = () => auth.signIn.social({ provider: "twitch", callbackURL: "/" });
export const signInWithGoogle = () => auth.signIn.social({ provider: "google", callbackURL: "/" });

export type LinkProvider = "twitch" | "google";

export async function startLink(provider: LinkProvider) {
  const res = await fetch("/api/account/link/start", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ provider }) });
  if (!res.ok) throw new Error("link");
  await auth.signIn.social({ provider, callbackURL: "/?link=finish", errorCallbackURL: "/?link=finish" });
}

export async function finishLink() {
  history.replaceState(null, "", "/");
  const res = await fetch("/api/account/link/finish", { method: "POST" });
  const body = await res.json().catch(() => null) as { merged?: boolean; provider?: LinkProvider; profile?: string } | null;
  if (!res.ok || !body?.profile) return;
  const profile = `/u/${body.profile}`;
  if (body.merged && body.provider) await auth.signIn.social({ provider: body.provider, callbackURL: profile });
  else location.assign(profile);
}
