import { getPlayerOvr, STAT_KEYS } from "./cards";
import { getCardTier, RARITY_TIERS } from "./rarity";
import type { Player, Stats, TierBand } from "./types";

export const PROFILE_CARD_PATH = "/api/profile/card";
export const PROFILE_NAME_MAX = 24;

export type ProfileCard = { name: string; hero: string; stats: Stats };

export type ProfileCardVersion = { id: number; card: ProfileCard; updatedAt: number };

export type ProfileCardState = { history: ProfileCardVersion[] };

export type PublicProfile = { id: string; handle: string | null; name: string; image: string | null; card: ProfileCard | null; cards: string[] };

export const profileUrl = (key: string) => `/u/${key}`;

export function parseProfileCard(input: unknown): ProfileCard | null {
  if (!input || typeof input !== "object") return null;
  const { name, hero, stats } = input as Partial<Record<keyof ProfileCard, unknown>>;
  if (typeof name !== "string" || typeof hero !== "string" || !stats || typeof stats !== "object") return null;
  const cleanName = name.trim();
  const cleanHero = hero.trim();
  if (!cleanName || cleanName.length > PROFILE_NAME_MAX || !cleanHero || cleanHero.length > 40) return null;
  const values = stats as Record<string, unknown>;
  if (!STAT_KEYS.every((k) => Number.isInteger(values[k]) && (values[k] as number) >= 1 && (values[k] as number) <= 99)) return null;
  return {
    name: cleanName,
    hero: cleanHero,
    stats: Object.fromEntries(STAT_KEYS.map((k) => [k, values[k]])) as Stats,
  };
}

export function profilePlayer(card: ProfileCard): Player {
  return { id: "profile", teamId: "", position: "Flex", c1: "#27272a", c2: "#18181b", history: [], ...card };
}

/** A porcentagem considera todas as cartas publicadas, incluindo versões especiais. */
export function summarizeCollection(players: Player[], ownedIds: string[], tiers: TierBand[]) {
  const owned = new Set(ownedIds);
  const cards = players.filter((player) => owned.has(player.id));
  const best = cards.reduce<Player | null>((top, player) =>
    !top || getPlayerOvr(player) > getPlayerOvr(top) ? player : top, null);
  const counts = new Map<string, number>();
  for (const player of cards) {
    const tier = getCardTier(player, tiers).tierKey;
    counts.set(tier, (counts.get(tier) ?? 0) + 1);
  }

  return {
    cards,
    total: players.length,
    percent: players.length ? Math.round((cards.length / players.length) * 100) : 0,
    best,
    rarities: RARITY_TIERS.map((tier) => ({ ...tier, count: counts.get(tier.tierKey) ?? 0 })),
  };
}
