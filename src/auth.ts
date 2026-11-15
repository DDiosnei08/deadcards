import { betterAuth } from "better-auth";
import type { Env } from "./worker";

export function createAuth(env: Env, request: Request) {
  return betterAuth({
    baseURL: new URL(request.url).origin,
    secret: env.BETTER_AUTH_SECRET,
    socialProviders: {
      twitch: { clientId: env.TWITCH_CLIENT_ID, clientSecret: env.TWITCH_CLIENT_SECRET },
    },
    session: { cookieCache: { enabled: true, maxAge: 7 * 24 * 60 * 60, strategy: "jwe", refreshCache: true } },
    account: { storeStateStrategy: "cookie", storeAccountCookie: false },
    advanced: { ipAddress: { ipAddressHeaders: ["cf-connecting-ip"] } },
  });
}

export async function currentUser(env: Env, request: Request) {
  const session = await createAuth(env, request).api.getSession({ headers: request.headers });
  if (!session) return null;
  const admins = env.ADMINS.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  const { name, image } = session.user;
  return { name, image: image ?? null, admin: admins.includes(name.toLowerCase()) };
}
