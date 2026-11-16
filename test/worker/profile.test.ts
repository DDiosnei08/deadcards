import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { login } from "../helpers/fixtures";
import { PROFILE_CARD_PATH, PROFILE_COLLECTION_PATH, PROFILE_LEADERBOARD_PATH, type ProfileCard, type ProfileCardState, type ProfileCollectionRedeem, type ProfileLeaderboard } from "../../src/lib/profile";

const stats = (v: number) => ({ MIR: v, MAC: v, SUP: v, MOV: v, POL: v, CON: v });
const myCard: ProfileCard = { name: "Fan", hero: "Abrams", stats: stats(70) };

function request(path: string, method: string, cookie?: string, body?: unknown) {
  const headers = new Headers();
  if (cookie) headers.set("cookie", cookie);
  if (body !== undefined) headers.set("content-type", "application/json");
  return SELF.fetch(`http://test${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
}

const card = (method: string, cookie?: string, body?: unknown) => request(PROFILE_CARD_PATH, method, cookie, body);
const collection = (method: string, cookie?: string) => request(PROFILE_COLLECTION_PATH, method, cookie);
const leaderboard = () => SELF.fetch(`http://test${PROFILE_LEADERBOARD_PATH}`).then((r) => r.json<ProfileLeaderboard>());

describe("Minha carta", () => {
  it("exige login e valida a carta", async () => {
    const { cookie } = await login("fan");
    expect((await card("GET")).status).toBe(401);
    expect((await card("PUT", undefined, myCard)).status).toBe(401);
    for (const bad of [
      { ...myCard, name: " " },
      { ...myCard, name: "x".repeat(25) },
      { ...myCard, hero: "" },
      { ...myCard, stats: { ...stats(70), MIR: 100 } },
      { ...myCard, stats: { ...stats(70), CON: 0 } },
      { ...myCard, stats: { ...stats(70), POL: 50.5 } },
      { name: "Fan", hero: "Abrams", stats: { MIR: 70 } },
      null,
    ]) expect((await card("PUT", cookie, bad)).status).toBe(400);
    expect(await (await card("GET", cookie)).json()).toEqual({ published: false, history: [] });
  });

  it("guarda versões só quando a carta muda e isola por usuário", async () => {
    const { cookie } = await login("fan");
    const { cookie: other } = await login("other");
    const first = await (await card("PUT", cookie, { ...myCard, name: "  Fan  ", extra: 1 })).json<ProfileCardState>();
    expect(first.history).toHaveLength(1);
    expect(first.history[0].card).toEqual(myCard);
    expect(await (await card("PUT", cookie, myCard)).json()).toEqual(first);
    expect(await (await card("GET", other)).json()).toEqual({ published: false, history: [] });

    const next = await (await card("PUT", cookie, { ...myCard, stats: stats(99) })).json<ProfileCardState>();
    expect(next.history).toHaveLength(2);
    expect(next.history[0].card.stats.MIR).toBe(99);
    expect(next.history[1]).toEqual(first.history[0]);
  });

  it("publica por escolha e ordena o ranking por OVR", async () => {
    const { cookie } = await login("fan");
    const { cookie: other } = await login("other");
    expect((await card("PATCH", cookie, { published: true })).status).toBe(409);

    await card("PUT", cookie, myCard);
    await card("PUT", other, { ...myCard, name: "Other", stats: stats(90) });
    expect((await leaderboard()).cards).toEqual([]);
    expect((await card("PATCH", cookie, { published: "yes" })).status).toBe(400);
    expect(await (await card("PATCH", cookie, { published: true })).json()).toMatchObject({ published: true });
    await card("PATCH", other, { published: true });
    expect((await leaderboard()).cards.map((c) => c.name)).toEqual(["Other", "Fan"]);

    await card("PUT", cookie, { ...myCard, stats: stats(95) });
    expect((await leaderboard()).cards.map((c) => c.name)).toEqual(["Fan", "Other"]);

    await card("PATCH", other, { published: false });
    expect((await leaderboard()).cards).toEqual([{ ...myCard, stats: stats(95) }]);
  });

  it("resgata cada versão uma vez, mesmo em pedidos concorrentes", async () => {
    const { cookie } = await login("fan");
    const { cookie: other } = await login("other");
    expect((await collection("GET")).status).toBe(401);
    expect((await collection("POST", cookie)).status).toBe(409);

    await card("PUT", cookie, myCard);
    const claims = await Promise.all([collection("POST", cookie), collection("POST", cookie)])
      .then((responses) => Promise.all(responses.map((r) => r.json<ProfileCollectionRedeem>())));
    expect(claims.filter((c) => c.added)).toHaveLength(1);
    expect(claims[0].card).toEqual(claims[1].card);
    expect(claims[0].card.card).toEqual(myCard);

    await card("PUT", cookie, { ...myCard, stats: stats(80) });
    expect(await (await collection("POST", cookie)).json()).toMatchObject({ added: true, card: { card: { stats: stats(80) } } });
    const owned = await (await collection("GET", cookie)).json<ProfileCollectionRedeem["card"][]>();
    expect(owned.map((c) => c.card.stats.MIR).sort()).toEqual([70, 80]);
    expect(await (await collection("GET", other)).json()).toEqual([]);
  });
});
