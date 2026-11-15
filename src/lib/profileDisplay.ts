import { useEffect, useState } from "react";
import { useData } from "./data";
import { strings, useLocale, useT } from "./i18n";
import type { LeaderboardCard } from "./profile";

const S = strings({
  pt: { noRank: "Sem patente", unavailable: "Patente indisponível", rank: "Patente", hero: "Herói", player: "Jogador", labels: ["Jogos", "Vit.%", "Abates", "Mortes", "Assist.", "Vitórias"] },
  en: { noRank: "Unranked", unavailable: "Rank unavailable", rank: "Rank", hero: "Hero", player: "Player", labels: ["Games", "Win%", "Kills", "Deaths", "Assists", "Wins"] },
  es: { noRank: "Sin rango", unavailable: "Rango no disponible", rank: "Rango", hero: "Héroe", player: "Jugador", labels: ["Partidas", "Vict.%", "Bajas", "Muertes", "Asist.", "Victorias"] },
});

type RankAsset = { tier: number; name: string };

export function useProfileCardDisplay() {
  const t = useT(S);
  const locale = useLocale();
  const { heroName } = useData();
  const [ranks, setRanks] = useState<RankAsset[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/deadlock?path=/v1/assets/ranks", { signal: controller.signal })
      .then((r) => r.ok ? r.json() as Promise<RankAsset[]> : [])
      .then((list) => { if (Array.isArray(list) && !controller.signal.aborted) setRanks(list); })
      .catch(() => {});
    return () => controller.abort();
  }, []);

  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
  const percent = new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 1 });
  const rankLabel = (rank: LeaderboardCard["rank"]) => {
    if (rank === undefined) return t.unavailable;
    if (rank === null) return t.noRank;
    const name = ranks.find((item) => item.tier === rank.tier)?.name ?? `${t.rank} ${rank.tier}`;
    return rank.subrank ? `${name} ${rank.subrank}` : name;
  };
  const faceFor = (stats: LeaderboardCard) => {
    const values = [number.format(stats.matches), percent.format(stats.wins / stats.matches),
      number.format(stats.kills / stats.matches), number.format(stats.deaths / stats.matches),
      number.format(stats.assists / stats.matches), number.format(stats.wins)];
    return {
      name: stats.name ?? t.player,
      hero: heroName(stats.heroId) ?? `${t.hero} ${stats.heroId}`,
      rank: rankLabel(stats.rank),
      rankTier: stats.rank?.tier,
      stats: t.labels.map((label, index) => ({ label, value: values[index] })),
    };
  };
  return { faceFor, rankLabel, percent };
}
