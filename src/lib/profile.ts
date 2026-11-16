import { STAT_KEYS } from "./cards";
import type { Player, Stats } from "./types";

export const PROFILE_CARD_PATH = "/api/profile/card";
export const PROFILE_COLLECTION_PATH = "/api/profile/collection";
export const PROFILE_LEADERBOARD_PATH = "/api/profile/leaderboard";
export const PROFILE_NAME_MAX = 24;

export type ProfileCard = { name: string; hero: string; stats: Stats };

export type ProfileCardVersion = { id: number; card: ProfileCard; updatedAt: number };

export type ProfileCardState = { published: boolean; history: ProfileCardVersion[] };

export type ProfileLeaderboard = { cards: ProfileCard[]; nextPage: number | null };
export type CollectedProfileCard = { id: number; card: ProfileCard; redeemedAt: number };
export type ProfileCollectionRedeem = { card: CollectedProfileCard; added: boolean };

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
