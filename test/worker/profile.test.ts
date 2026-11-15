import { SELF, env } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { login } from "../helpers/fixtures";
import { PROFILE_CARD_PATH, PROFILE_LEADERBOARD_PATH, type ProfileCardState, type ProfileLeaderboard } from "../../src/lib/profile";

const accountId = "123456789";
const match = (id: number, win: boolean) => ({
  match_id: id, start_time: 1_700_000_000 + id, hero_id: 2, player_team: 1,
  match_result: win ? 1 : 0, player_kills: 6, player_deaths: 4, player_assists: 8,
});

function mockPublicStats() {
  let matches = [match(100, true)];
  let historyStatus = 200;
  let rank: number | undefined = 7;
  const fetchStats = vi.fn(async (input: string | URL | Request) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/match-history")) return Response.json(matches, { status: historyStatus });
    if (url.pathname.endsWith("/rank")) return rank === undefined
      ? Response.json({}, { status: 503 })
      : Response.json({ rank, subrank: 2 });
    if (url.pathname.endsWith("/steam")) return Response.json([{ personaname: "Deadlock fan" }]);
    throw new Error("Unexpected upstream request");
  });
  vi.stubGlobal("fetch", fetchStats);
  return {
    fetchStats,
    setMatches: (value: typeof matches) => { matches = value; },
    setHistoryStatus: (value: number) => { historyStatus = value; },
    setRank: (value: number | undefined) => { rank = value; },
  };
}

function card(method: string, cookie?: string, id?: string, published?: boolean) {
  const headers = new Headers();
  if (cookie) headers.set("cookie", cookie);
  if (method === "PUT" || method === "PATCH") headers.set("content-type", "application/json");
  const query = method === "GET" && id ? `?id=${encodeURIComponent(id)}` : "";
  return SELF.fetch(`http://test${PROFILE_CARD_PATH}${query}`, {
    method,
    headers,
    body: method === "PUT" || method === "PATCH" ? JSON.stringify({ accountId: id, published }) : undefined,
  });
}

async function expireCard() {
  await env.DB.batch([
    env.DB.prepare("UPDATE profile_cards SET checked_at = 0"),
    env.DB.prepare("DELETE FROM api_cache"),
  ]);
}

afterEach(() => vi.unstubAllGlobals());

describe("Minha carta", () => {
  it("valida IDs e monta a prévia pelo SteamID64 sem gravar um perfil", async () => {
    const { cookie } = await login("fan");
    const { fetchStats } = mockPublicStats();
    expect((await card("PUT", undefined, accountId)).status).toBe(401);
    expect((await card("GET", cookie, "123/other")).status).toBe(400);
    expect(fetchStats).not.toHaveBeenCalled();
    const response = await card("GET", cookie, String(76561197960265728n + BigInt(accountId)));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      accountId, name: "Deadlock fan", matches: 1, wins: 1, kills: 6, rank: { tier: 7, subrank: 2 },
    });
    expect(await (await card("POST", cookie)).json()).toEqual({ accountId: null, published: false, history: [] });
  });

  it("guarda versões só quando a carta muda e isola o histórico por usuário", async () => {
    const { cookie } = await login("fan");
    const { cookie: otherCookie } = await login("other");
    const api = mockPublicStats();
    const first = await (await card("PUT", cookie, accountId)).json<ProfileCardState>();
    expect(first.history).toHaveLength(1);
    expect(first.history[0].automatic).toBe(false);
    expect(await (await card("POST", otherCookie)).json()).toEqual({ accountId: null, published: false, history: [] });
    expect(await (await card("POST", cookie)).json()).toEqual(first);

    await expireCard();
    api.setRank(undefined);
    expect(await (await card("POST", cookie)).json()).toEqual(first);

    await expireCard();
    api.setRank(7);
    api.setMatches([match(101, false), match(100, true), match(101, false)]);
    const refreshed = await (await card("POST", cookie)).json<ProfileCardState>();
    expect(refreshed.history).toHaveLength(2);
    expect(refreshed.history[0]).toMatchObject({ automatic: true, stats: { matches: 2, wins: 1, lastMatchId: 101 } });
    expect(refreshed.history[0].updatedAt).toBeGreaterThanOrEqual(first.history[0].updatedAt);
    expect(refreshed.history[1]).toEqual(first.history[0]);

    await expireCard();
    api.setMatches([match(100, true)]);
    expect(await (await card("POST", cookie)).json()).toEqual(refreshed);

    await expireCard();
    api.setHistoryStatus(503);
    expect(await (await card("POST", cookie)).json()).toEqual({ ...refreshed, issue: "unavailable" });

    await expireCard();
    api.setHistoryStatus(200);
    api.setMatches([match(101, false), match(100, true)]);
    api.setRank(0);
    const reset = await (await card("POST", cookie)).json<ProfileCardState>();
    expect(reset.history).toHaveLength(3);
    expect(reset.history[0]).toMatchObject({ automatic: true, stats: { rank: null } });
  });

  it("publica por escolha, ordena por patente e remove a carta ao sair do ranking", async () => {
    const { cookie } = await login("fan");
    const { cookie: otherCookie } = await login("other");
    const { cookie: duplicateCookie } = await login("duplicate");
    const api = mockPublicStats();
    const secondId = "987654321";
    const leaderboard = () => SELF.fetch(`http://test${PROFILE_LEADERBOARD_PATH}`).then((r) => r.json<ProfileLeaderboard>());

    await card("PUT", cookie, accountId);
    expect((await leaderboard()).cards).toEqual([]);
    expect((await card("PATCH", undefined, accountId, true)).status).toBe(401);
    expect((await card("PATCH", otherCookie, accountId, true)).status).toBe(409);
    expect(await (await card("PATCH", cookie, accountId, true)).json()).toMatchObject({ published: true });

    api.setRank(10);
    api.setMatches([match(101, false), match(100, true)]);
    await card("PUT", otherCookie, secondId);
    await card("PATCH", otherCookie, secondId, true);
    await card("PUT", duplicateCookie, secondId);
    await card("PATCH", duplicateCookie, secondId, true);
    const { cards } = await leaderboard();
    expect(cards.map(({ rank }) => rank?.tier)).toEqual([10, 7]);
    expect(cards[0]).toMatchObject({ matches: 2, wins: 1 });
    expect(cards[0]).not.toHaveProperty("accountId");
    expect(cards[0]).not.toHaveProperty("lastMatchId");

    expect(await (await card("PATCH", duplicateCookie, secondId, false)).json()).toMatchObject({ published: false });
    expect(await (await card("PATCH", otherCookie, secondId, false)).json()).toMatchObject({ published: false });
    expect((await leaderboard()).cards).toHaveLength(1);
    expect(await (await card("PUT", cookie, secondId)).json()).toMatchObject({ published: false });
    expect((await leaderboard()).cards).toEqual([]);
  });
});
