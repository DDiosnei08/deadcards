import { useEffect, useState } from "react";
import { Card } from "./Card";
import { Icon } from "./Icon";
import { useData } from "../lib/data";
import { strings, useT } from "../lib/i18n";
import { getPlayerOvr } from "../lib/cards";
import { PROFILE_LEADERBOARD_PATH, profilePlayer, type ProfileLeaderboard } from "../lib/profile";
import { getCardTier } from "../lib/rarity";
import { pill } from "../lib/ui";

const S = strings({
  pt: {
    title: "Ranking dos participantes", order: "Por OVR, definido por cada participante.",
    empty: "As cartas publicadas pelos participantes aparecem aqui.",
    loading: "Carregando ranking…", error: "Não foi possível carregar o ranking.",
    retry: "Tentar novamente", more: "Ver mais cartas", profile: "Abrir meu perfil", login: "Entrar para participar",
  },
  en: {
    title: "Community leaderboard", order: "By OVR, set by each participant.",
    empty: "Cards shared by participants will appear here.",
    loading: "Loading leaderboard…", error: "Could not load the leaderboard.",
    retry: "Try again", more: "See more cards", profile: "Open my profile", login: "Sign in to join",
  },
  es: {
    title: "Clasificación de participantes", order: "Por OVR, definido por cada participante.",
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

export function ParticipantsRanking({ onOpenProfile }: { onOpenProfile?: () => void }) {
  const t = useT(S);
  const { heroIcon, settings } = useData();
  const [board, setBoard] = useState<ProfileLeaderboard>();
  const [error, setError] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [openIndex, setOpenIndex] = useState<number>();

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
    <section aria-label={t.title} className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 lg:overflow-y-auto">
      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        <p className="text-xs text-zinc-400">{t.order}</p>
        {onOpenProfile
          ? <button type="button" className={pill(false)} onClick={onOpenProfile}>{t.profile}</button>
          : <a className={pill(false)} href="/login">{t.login}</a>}
      </div>
      {!board && !error && <p role="status" className="text-sm text-zinc-400">{t.loading}</p>}
      {board?.cards.length === 0 && <p className="noir-glass rounded-xl p-4 text-sm text-zinc-400">{t.empty}</p>}
      {!!board?.cards.length && (
        <ol className="flex flex-col gap-2">
          {board.cards.map((card, index) => {
            const player = profilePlayer(card);
            const tier = getCardTier(player, settings.tierConfig!);
            const icon = heroIcon(card.hero);
            const open = openIndex === index;
            return (
              <li key={index} className="min-w-0">
                <button type="button" aria-expanded={open} onClick={() => setOpenIndex(open ? undefined : index)}
                  className="noir-glass flex min-h-16 w-full cursor-pointer items-center gap-2 rounded-xl px-3 py-2 text-left hover:bg-zinc-800/80 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-zinc-100 sm:gap-3">
                  <span className="w-8 shrink-0 text-center text-sm font-black text-zinc-300 tabular-nums">#{index + 1}</span>
                  {icon && <img src={icon} alt="" loading="lazy" className="size-8 shrink-0 rounded-md object-cover sm:size-10" />}
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate font-display text-sm font-black text-dl-text uppercase">{card.name}</span>
                    <span className="truncate text-xs text-zinc-300">{card.hero}</span>
                  </span>
                  <span className="text-xs font-bold text-zinc-100 tabular-nums">{getPlayerOvr(player)}</span>
                  <span className="rk-chip" style={{ color: tier.c, borderColor: tier.c }} title={tier.name}>{tier.tierKey}</span>
                  <Icon name={open ? "chevron-up" : "chevron-down"} className="size-3.5" />
                </button>
                {open && <div className="flex justify-center py-3"><Card player={player} /></div>}
              </li>
            );
          })}
        </ol>
      )}
      {error && <p role="status" className="text-sm text-red-300">{t.error}</p>}
      {(error || board?.nextPage != null) && (
        <button type="button" className={`${pill(false)} self-center disabled:cursor-wait disabled:opacity-60`} disabled={loadingMore} onClick={loadMore}>
          {loadingMore ? t.loading : error ? t.retry : t.more}
        </button>
      )}
    </section>
  );
}
