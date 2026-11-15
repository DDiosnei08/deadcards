export const PROFILE_CARD_PATH = "/api/profile/card";
export const PROFILE_COLLECTION_PATH = "/api/profile/collection";
export const PROFILE_LEADERBOARD_PATH = "/api/profile/leaderboard";
export const PROFILE_REFRESH_MS = 15 * 60 * 1000;

export type ProfileCardStats = {
  accountId: string;
  name: string | null;
  heroId: number;
  rank?: { tier: number; subrank: number } | null;
  matches: number;
  wins: number;
  kills: number;
  deaths: number;
  assists: number;
  lastMatchId: number;
  lastMatchAt: number;
};

export type ProfileCardVersion = {
  id: number;
  stats: ProfileCardStats;
  updatedAt: number;
  automatic: boolean;
};

export type ProfileCardState = {
  accountId: string | null;
  published: boolean;
  history: ProfileCardVersion[];
  issue?: "no_data" | "unavailable";
};

export type LeaderboardCard = Omit<ProfileCardStats, "accountId" | "lastMatchId" | "lastMatchAt">;
export type ProfileLeaderboard = { cards: LeaderboardCard[]; nextPage: number | null };
export type CollectedProfileCard = { stats: ProfileCardStats; redeemedAt: number };
export type ProfileCollectionRedeem = { card: CollectedProfileCard; added: boolean };

// Public individual SteamID64s embed the unsigned 32-bit account number.
export function normalizeAccountId(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const value = input.trim();
  const digits = /^\[U:1:(\d{1,10})\]$/.exec(value)?.[1] ?? value;
  if (!/^(?:\d{1,10}|\d{17})$/.test(digits)) return null;
  const number = BigInt(digits);
  const id = digits.length === 17 ? number - 76561197960265728n : number;
  return id > 0n && id <= 4294967295n ? String(id) : null;
}
