import { SELF, env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { login, seedPlayer } from "../helpers/fixtures";

const stats = { MIR: 60, MAC: 60, SUP: 60, MOV: 60, POL: 60, CON: 60 };

function post(path: string, cookie?: string, body?: unknown) {
  const headers = new Headers();
  if (cookie) headers.set("cookie", cookie);
  if (body !== undefined) headers.set("content-type", "application/json");
  return SELF.fetch(`http://test/api/account/link/${path}`, { method: "POST", headers, body: body === undefined ? undefined : JSON.stringify(body) });
}

async function start(cookie: string, provider = "google") {
  const res = await post("start", cookie, { provider });
  expect(res.status).toBe(200);
  return res.headers.getSetCookie().find((c) => c.startsWith("dc_link="))!.split(";")[0];
}

const saveCard = (cookie: string, name: string) => SELF.fetch("http://test/api/profile/card", {
  method: "PUT", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify({ name, hero: "Abrams", stats }),
});

const ids = async (sql: string, ...binds: string[]) =>
  (await env.DB.prepare(sql).bind(...binds).all<{ v: string }>()).results.map((r) => r.v).sort();

describe("juntar contas", () => {
  it("valida login, provedor e o cookie assinado", async () => {
    const { cookie } = await login("a");
    expect((await post("start", undefined, { provider: "google" })).status).toBe(401);
    expect((await post("start", cookie, { provider: "github" })).status).toBe(400);
    expect((await post("finish", cookie)).status).toBe(400);
    const link = await start(cookie);
    const [name, value] = link.split("=");
    const forged = `${name}=${value.replace(/^[^.]+/, "someone-else")}`;
    expect((await post("finish", `${cookie}; ${forged}`)).status).toBe(400);
    expect(await (await post("finish", `${cookie}; ${link}`)).json()).toMatchObject({ merged: false });
  });

  it("move logins, cartas e o @ da outra conta e mantém a carta de quem iniciou", async () => {
    const a = await login("Hagizao");
    const b = await login("Victor", ["google"]);
    await seedPlayer("p1");
    await seedPlayer("p2");
    await env.DB.batch([
      env.DB.prepare("INSERT INTO user_cards (user_id, player_id) VALUES (?, 'p1')").bind(a.userId),
      env.DB.prepare("INSERT INTO user_cards (user_id, player_id) VALUES (?, 'p1'), (?, 'p2')").bind(b.userId, b.userId),
      env.DB.prepare("INSERT INTO profile_handles (user_id, handle, provider) VALUES (?, 'victor', 'google')").bind(b.userId),
    ]);
    await saveCard(a.cookie, "Card A");
    await saveCard(b.cookie, "Card B");

    const link = await start(a.cookie);
    const res = await post("finish", `${b.cookie}; ${link}`);
    expect(await res.json()).toEqual({ merged: true, provider: "google", profile: "victor" });
    expect(res.headers.getSetCookie().some((c) => c.startsWith("better-auth.session_token=;"))).toBe(true);

    expect(await env.DB.prepare(`SELECT 1 FROM "user" WHERE id = ?`).bind(b.userId).first()).toBeNull();
    expect(await ids(`SELECT "providerId" AS v FROM "account" WHERE "userId" = ?`, a.userId)).toEqual(["google", "twitch"]);
    expect(await ids("SELECT player_id AS v FROM user_cards WHERE user_id = ?", a.userId)).toEqual(["p1", "p2"]);
    expect(await ids("SELECT json_extract(snapshot, '$.name') AS v FROM profile_card_history WHERE user_id = ?", a.userId)).toEqual(["Card A"]);
    const profile = await SELF.fetch("http://test/api/users/victor").then((r) => r.json());
    expect(profile).toMatchObject({ id: a.userId, name: "Hagizao", card: { name: "Card A" }, cards: expect.arrayContaining(["p1", "p2"]) });
    const firstLogin = await env.DB.prepare(`SELECT "providerId" FROM "account" WHERE "userId" = ? ORDER BY "createdAt" LIMIT 1`).bind(a.userId).first<string>("providerId");
    expect(firstLogin).toBe("twitch");
  });

  it("traz a carta da outra conta quando quem iniciou ainda não tem", async () => {
    const a = await login("a");
    const b = await login("b", ["google"]);
    await saveCard(b.cookie, "Card B");
    const link = await start(a.cookie, "twitch");
    expect(await (await post("finish", `${b.cookie}; ${link}`)).json()).toMatchObject({ merged: true, provider: "twitch" });
    expect(await SELF.fetch(`http://test/api/users/${a.userId}`).then((r) => r.json())).toMatchObject({ card: { name: "Card B" } });
    expect(await ids("SELECT json_extract(snapshot, '$.name') AS v FROM profile_card_history WHERE user_id = ?", a.userId)).toEqual(["Card B"]);
  });
});
