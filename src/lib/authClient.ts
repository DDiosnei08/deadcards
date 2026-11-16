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

export type LinkResult = { code: "confirm"; name: string; cards: number } | { code: "already_linked" | "failed" };

// Resolves only when the join did not go through; on success the page navigates away.
export async function finishLink(confirm = false): Promise<LinkResult | undefined> {
  history.replaceState(null, "", "/");
  const res = await fetch("/api/account/link/finish", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ confirm }) }).catch(() => null);
  const body = await res?.json().catch(() => null) as { code?: string; name?: string; cards?: number; merged?: boolean; provider?: LinkProvider; profile?: string } | null;
  if (body?.code === "confirm") return { code: "confirm", name: body.name ?? "", cards: body.cards ?? 0 };
  if (body?.code === "already_linked") return { code: "already_linked" };
  if (!res?.ok || !body?.profile) return { code: "failed" };
  const profile = `/u/${body.profile}`;
  if (body.merged && body.provider) await auth.signIn.social({ provider: body.provider, callbackURL: profile });
  else location.assign(profile);
}
