import { betterAuth } from "better-auth";
import type { Env } from "./worker";

export function createAuth(env: Env, request: Request) {
  return betterAuth({
    baseURL: new URL(request.url).origin,
    secret: env.BETTER_AUTH_SECRET,
    database: env.DB,
    // admin é decidido pelo nome + conta Twitch, então o usuário não pode trocar o nome nem ligar outra conta
    disabledPaths: ["/update-user", "/change-email", "/link-social"],
    socialProviders: {
      twitch: { clientId: env.TWITCH_CLIENT_ID, clientSecret: env.TWITCH_CLIENT_SECRET },
      google: { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET },
    },
    session: { cookieCache: { enabled: true, maxAge: 5 * 60, strategy: "jwe" } },
    account: { storeStateStrategy: "cookie", storeAccountCookie: false, accountLinking: { enabled: false } },
    advanced: { ipAddress: { ipAddressHeaders: ["cf-connecting-ip"] } },
  });
}

export async function currentUser(env: Env, request: Request) {
  const session = await createAuth(env, request).api.getSession({ headers: request.headers });
  if (!session) return null;
  const admins = env.ADMINS.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  const { id, name, image } = session.user;
  const admin = admins.includes(name.toLowerCase()) &&
    !!(await env.DB.prepare("SELECT 1 FROM account WHERE userId = ? AND providerId = 'twitch'").bind(id).first());
  return { id, name, image: image ?? null, admin };
}
