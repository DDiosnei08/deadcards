import { betterAuth } from "better-auth";
import type { Env } from "./worker";

export function createAuth(env: Env, request: Request) {
  return betterAuth({
    baseURL: new URL(request.url).origin,
    secret: env.BETTER_AUTH_SECRET,
    database: env.DB,
    // admin depende do nome vindo do Twitch, então o usuário não pode trocar o nome
    disabledPaths: ["/update-user", "/change-email", "/link-social"],
    socialProviders: {
      twitch: { clientId: env.TWITCH_CLIENT_ID, clientSecret: env.TWITCH_CLIENT_SECRET },
      google: { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET },
    },
    session: { cookieCache: { enabled: true, maxAge: 5 * 60, strategy: "jwe" } },
    account: { storeStateStrategy: "cookie", storeAccountCookie: false },
    advanced: { ipAddress: { ipAddressHeaders: ["cf-connecting-ip"] } },
  });
}

export async function currentUser(env: Env, request: Request) {
  const session = await createAuth(env, request).api.getSession({ headers: request.headers });
  if (!session) return null;
  const admins = env.ADMINS.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  const { id, name, image } = session.user;
  // contas com o mesmo e-mail se ligam, então só vale o nome de quem foi criado pelo Twitch (o nome vem de lá)
  const admin = admins.includes(name.toLowerCase()) &&
    (await env.DB.prepare("SELECT providerId FROM account WHERE userId = ? ORDER BY createdAt LIMIT 1").bind(id).first<string>("providerId")) === "twitch";
  return { id, name, image: image ?? null, admin };
}
