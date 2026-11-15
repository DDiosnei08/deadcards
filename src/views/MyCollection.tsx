import { useEffect, useRef, useState } from "react";
import { Card, type ProfileFace } from "../components/Card";
import { CardExportButton } from "../components/CardExportButton";
import { useData } from "../lib/data";
import { strings, useLocale, useT } from "../lib/i18n";
import { PROFILE_COLLECTION_PATH, type CollectedProfileCard } from "../lib/profile";
import { useProfileCardDisplay } from "../lib/profileDisplay";
import { pageTitle, pill, primaryBtn } from "../lib/ui";

const S = strings({
  pt: {
    title: "Minha coleção", profile: "Meu perfil", redeem: "Resgatar com código",
    generated: "Cartas geradas", official: "Cartas do catálogo", redeemed: "Resgatada em",
    empty: "Resgate uma carta na prévia do perfil ou use um código do catálogo.",
    loading: "Carregando sua coleção…", error: "Não foi possível carregar sua coleção.", retry: "Tentar novamente",
  },
  en: {
    title: "My collection", profile: "My profile", redeem: "Redeem a code",
    generated: "Generated cards", official: "Catalog cards", redeemed: "Redeemed on",
    empty: "Redeem a card from the profile preview or use a catalog code.",
    loading: "Loading your collection…", error: "Could not load your collection.", retry: "Try again",
  },
  es: {
    title: "Mi colección", profile: "Mi perfil", redeem: "Canjear con código",
    generated: "Cartas generadas", official: "Cartas del catálogo", redeemed: "Canjeada el",
    empty: "Canjea una carta en la vista previa del perfil o usa un código del catálogo.",
    loading: "Cargando tu colección…", error: "No se pudo cargar tu colección.", retry: "Reintentar",
  },
});

async function get<T>(path: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(path, { signal });
  if (!response.ok) throw new Error("Collection unavailable");
  return response.json() as Promise<T>;
}

export function MyCollection({ onOpenProfile, onRedeemCode, onOpenCard }: {
  onOpenProfile: () => void;
  onRedeemCode: () => void;
  onOpenCard: (id: string) => void;
}) {
  const t = useT(S);
  const locale = useLocale();
  const { players } = useData();
  const { faceFor } = useProfileCardDisplay();
  const [collection, setCollection] = useState<{ generated: CollectedProfileCard[]; officialIds: string[] }>();
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      get<CollectedProfileCard[]>(PROFILE_COLLECTION_PATH, controller.signal),
      get<string[]>("/api/collection", controller.signal),
    ]).then(([generated, officialIds]) => {
      if (!controller.signal.aborted) setCollection({ generated, officialIds });
    }).catch(() => {
      if (!controller.signal.aborted) setError(true);
    });
    return () => controller.abort();
  }, [attempt]);

  const owned = new Set(collection?.officialIds);
  const official = players.filter((player) => owned.has(player.id));
  const generated = collection?.generated ?? [];
  const date = new Intl.DateTimeFormat(locale, { dateStyle: "medium" });

  return (
    <section className="mx-auto flex max-w-6xl flex-col gap-6" aria-labelledby="my-collection-title">
      <header className="noir-glass flex flex-wrap items-center justify-between gap-4 rounded-2xl p-4 sm:p-6">
        <h1 id="my-collection-title" className={pageTitle}>{t.title}</h1>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={pill(false)} onClick={onOpenProfile}>{t.profile}</button>
          <button type="button" className={primaryBtn} onClick={onRedeemCode}>{t.redeem}</button>
        </div>
      </header>

      {!collection && !error && <p role="status" className="text-sm text-zinc-400">{t.loading}</p>}
      {error && <div className="flex flex-col items-start gap-2">
        <p role="alert" className="text-sm text-red-300">{t.error}</p>
        <button type="button" className={pill(false)} onClick={() => { setError(false); setAttempt((n) => n + 1); }}>{t.retry}</button>
      </div>}
      {collection && !generated.length && !official.length && (
        <p className="noir-glass rounded-2xl p-4 text-sm text-zinc-300 sm:p-6">{t.empty}</p>
      )}

      {generated.length > 0 && (
        <section aria-labelledby="generated-collection-title" className="noir-glass flex flex-col gap-5 rounded-2xl p-4 sm:p-6">
          <h2 id="generated-collection-title" className="font-display text-lg font-black text-dl-text">{t.generated}</h2>
          <ul className="flex flex-wrap justify-center gap-6 sm:justify-start">
            {generated.map(({ stats, redeemedAt }) => (
              <CollectedCard key={stats.accountId} face={faceFor(stats)} redeemedAt={redeemedAt} date={date} />
            ))}
          </ul>
        </section>
      )}
      {official.length > 0 && (
        <section aria-labelledby="official-collection-title" className="noir-glass flex flex-col gap-5 rounded-2xl p-4 sm:p-6">
          <h2 id="official-collection-title" className="font-display text-lg font-black text-dl-text">{t.official}</h2>
          <ul className="flex flex-wrap justify-center gap-6 sm:justify-start">
            {official.map((player) => (
              <li key={player.id}><Card player={player} variant="medium" onOpen={() => onOpenCard(player.id)} /></li>
            ))}
          </ul>
        </section>
      )}
    </section>
  );
}

function CollectedCard({ face, redeemedAt, date }: {
  face: ProfileFace;
  redeemedAt: number;
  date: Intl.DateTimeFormat;
}) {
  const t = useT(S);
  const cardRef = useRef<HTMLDivElement>(null);
  return (
    <li className="flex max-w-full flex-col items-center gap-2.5">
      <div ref={cardRef} className="w-fit max-w-full"><Card profile={face} /></div>
      <p className="text-xs text-zinc-400">
        {t.redeemed} <time dateTime={new Date(redeemedAt).toISOString()}>{date.format(redeemedAt)}</time>
      </p>
      <CardExportButton cardRef={cardRef} name={face.name} />
    </li>
  );
}
