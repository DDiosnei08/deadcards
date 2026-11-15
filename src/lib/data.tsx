import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { AppData, HeroArt } from "./types";
import { DEFAULT_TIER_CONFIG } from "./cards";

type ApiHero = { name: string; player_selectable?: boolean; images?: { icon_hero_card_webp?: string; icon_image_small_webp?: string } };

type Ctx = AppData & {
  heroNames: string[];
  heroArt: (name: string) => HeroArt | null;
  heroIcon: (name: string) => string | null;
};

const DataContext = createContext<Ctx | null>(null);

export function DataProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData | null>(null);
  const [apiHeroes, setApiHeroes] = useState<ApiHero[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/data")
      .then((r) => (r.ok ? (r.json() as Promise<AppData>) : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(setData)
      .catch((e: Error) => setError(e.message));
    fetch("/api/deadlock?path=/v1/assets/heroes")
      .then((r) => (r.ok ? (r.json() as Promise<ApiHero[]>) : []))
      .then((list) => setApiHeroes(list.filter((h) => h.player_selectable !== false)))
      .catch(() => setApiHeroes([]));
  }, []);

  const value = useMemo<Ctx | null>(() => {
    if (!data) return null;
    const byName = new Map(apiHeroes.map((h) => [h.name.toLowerCase(), h]));
    const settings = { ...data.settings, tierConfig: data.settings.tierConfig?.length ? data.settings.tierConfig : DEFAULT_TIER_CONFIG };
    return {
      ...data,
      settings,
      heroNames: [...new Set([...apiHeroes.map((h) => h.name), ...Object.keys(data.heroes)])].sort(),
      heroArt: (name) => {
        const own = data.heroes[name];
        if (own) return own;
        const url = byName.get(name.toLowerCase())?.images?.icon_hero_card_webp;
        return url ? { name, url, zoom: 100, x: 50, y: 20 } : null;
      },
      heroIcon: (name) => byName.get(name.toLowerCase())?.images?.icon_image_small_webp ?? null,
    };
  }, [data, apiHeroes]);

  if (error) return <div className="min-h-dvh flex items-center justify-center text-red-300 text-sm">Falha ao carregar dados: {error}</div>;
  if (!value) return <div className="min-h-dvh flex items-center justify-center text-zinc-400 text-xs uppercase tracking-[0.3em]">Carregando…</div>;
  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData(): Ctx {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error("useData outside DataProvider");
  return ctx;
}
