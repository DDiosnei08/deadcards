import { useEffect, useState } from "react";
import { Card } from "./Card";
import { strings, useT } from "../lib/i18n";
import { PROFILE_LEADERBOARD_PATH, type ProfileLeaderboard } from "../lib/profile";
import { useProfileCardDisplay } from "../lib/profileDisplay";

const S = strings({
  pt: {
    title: "Ranking dos participantes", order: "Por patente e percentual de vitórias nas partidas recentes.",
    empty: "As cartas publicadas pelos participantes aparecem aqui.",
    loading: "Carregando ranking…", error: "Não foi possível carregar o ranking.",
    retry: "Tentar novamente", more: "Ver mais cartas", profile: "Abrir meu perfil", login: "Entrar para participar",
  },
  en: {
    title: "Community leaderboard", order: "By rank and recent match win rate.",
    empty: "Cards shared by participants will appear here.",
    loading: "Loading leaderboard…", error: "Could not load the leaderboard.",
    retry: "Try again", more: "See more cards", profile: "Open my profile", login: "Sign in to join",
  },
  es: {
    title: "Clasificación de participantes", order: "Por rango y porcentaje de victorias recientes.",
    empty: "Aquí aparecen las cartas que publican los participantes.",
    loading: "Cargando clasificación…", error: "No se pudo cargar la clasificación.",
    retry: "Reintentar", more: "Ver más cartas", profile: "Abrir mi perfil", login: "Inicia sesión para participar",
  },
});

async function loadPage(page: number, signal?: AbortSignal): Promise<ProfileLeaderboard> {
  const response = await fetch(`${PROFILE_LEADERBOARD_PATH}?page=${page}`, { signal });
  if (!response.ok) throw new Error("Leaderboard unavailable");
  return response.json() as Promise<ProfileLeaderboard>;
}

const button = "inline-flex min-h-11 cursor-pointer items-center justify-center rounded-lg bg-zinc-800 px-4 text-sm font-bold text-zinc-100 hover:bg-zinc-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-100 active:bg-zinc-600 disabled:cursor-wait disabled:opacity-60";

export function ParticipantsRanking({ onOpenProfile }: { onOpenProfile?: () => void }) {
  const t = useT(S);
  const { faceFor } = useProfileCardDisplay();
  const [board, setBoard] = useState<ProfileLeaderboard>();
  const [error, setError] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    loadPage(0, controller.signal).then(setBoard).catch(() => {
      if (!controller.signal.aborted) setError(true);
    });
    return () => controller.abort();
  }, []);

  const loadMore = async () => {
    const page = board?.nextPage ?? 0;
    setLoadingMore(true);
    setError(false);
    try {
      const result = await loadPage(page);
      setBoard(board && page > 0 ? { ...result, cards: [...board.cards, ...result.cards] } : result);
    } catch {
      setError(true);
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <section aria-labelledby="participants-title" className="noir-glass flex min-w-0 flex-col gap-6 rounded-2xl p-4 sm:p-6 lg:col-span-2">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h2 id="participants-title" className="font-display text-xl font-black tracking-wide text-dl-text sm:text-2xl">{t.title}</h2>
          <p className="text-sm text-zinc-400">{t.order}</p>
        </div>
        {onOpenProfile
          ? <button type="button" className={button} onClick={onOpenProfile}>{t.profile}</button>
          : <a className={button} href="/login">{t.login}</a>}
      </header>
      {!board && !error && <p role="status" className="text-sm text-zinc-400">{t.loading}</p>}
      {board?.cards.length === 0 && <p className="text-sm text-zinc-400">{t.empty}</p>}
      {!!board?.cards.length && (
        <ol className="grid grid-cols-1 justify-items-center gap-8 md:grid-cols-2 xl:grid-cols-3">
          {board.cards.map((stats, index) => (
            <li key={index} className="flex w-full min-w-0 flex-col items-center gap-2">
              <span className="text-sm font-black text-zinc-300">#{index + 1}</span>
              <Card profile={faceFor(stats)} />
            </li>
          ))}
        </ol>
      )}
      {error && <p role="status" className="text-sm text-red-300">{t.error}</p>}
      {(error || board?.nextPage != null) && (
        <button type="button" className={`${button} self-center`} disabled={loadingMore} onClick={loadMore}>
          {loadingMore ? t.loading : error ? t.retry : t.more}
        </button>
      )}
    </section>
  );
}
