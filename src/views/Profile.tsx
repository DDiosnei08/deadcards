import { useEffect, useRef, useState, type FormEvent } from "react";
import { Card } from "../components/Card";
import { CardExportButton } from "../components/CardExportButton";
import { useData } from "../lib/data";
import { strings, useLocale, useT } from "../lib/i18n";
import { normalizeAccountId, PROFILE_CARD_PATH, PROFILE_COLLECTION_PATH, PROFILE_REFRESH_MS, type ProfileCardState, type ProfileCardStats, type ProfileCollectionRedeem } from "../lib/profile";
import { useProfileCardDisplay } from "../lib/profileDisplay";
import { field, pageTitle, pill, primaryBtn } from "../lib/ui";

const S = strings({
  pt: {
    title: "Meu perfil", card: "Minha carta", collection: "Minha coleção", searchAgain: "Gerar outra carta", closeSearch: "Fechar busca",
    id: "ID da conta Deadlock ou SteamID64",
    hint: "Cole o ID para consultar as estatísticas públicas do jogador.",
    generate: "Gerar prévia", generating: "Buscando partidas…", preview: "Prévia",
    save: "Usar no meu perfil", saving: "Salvando…", saved: "Carta salva no seu perfil.", back: "Voltar à minha carta",
    collect: "Resgatar na minha coleção", collecting: "Resgatando…", collected: "Carta resgatada na sua coleção.", alreadyCollected: "Esta carta já está na sua coleção.", viewCollection: "Ver na minha coleção",
    loading: "Carregando sua carta…", history: "Histórico de atualizações", auto: "Atualização automática", first: "Salva no perfil",
    updated: "Última atualização", publish: "Entrar no ranking", unpublish: "Sair do ranking",
    public: "Sua carta aparece no ranking da página inicial.", private: "Publique a carta para aparecer no ranking da página inicial.",
    invalid_id: "Informe um ID de conta válido.", no_data: "Sem partidas públicas disponíveis para este ID.",
    unavailable: "A Deadlock API está indisponível no momento.", login: "Entre para acessar sua carta.",
    save_first: "Salve esta carta no perfil primeiro.",
  },
  en: {
    title: "My profile", card: "My card", collection: "My collection", searchAgain: "Generate another card", closeSearch: "Close search",
    id: "Deadlock account ID or SteamID64",
    hint: "Paste an ID to look up the player's public stats.",
    generate: "Generate preview", generating: "Looking up matches…", preview: "Preview",
    save: "Use on my profile", saving: "Saving…", saved: "Card saved to your profile.", back: "Back to my card",
    collect: "Redeem to my collection", collecting: "Redeeming…", collected: "Card added to your collection.", alreadyCollected: "This card is already in your collection.", viewCollection: "See in my collection",
    loading: "Loading your card…", history: "Update history", auto: "Automatic update", first: "Saved to profile",
    updated: "Last updated", publish: "Join the leaderboard", unpublish: "Leave the leaderboard",
    public: "Your card appears on the home leaderboard.", private: "Publish the card to appear on the home leaderboard.",
    invalid_id: "Enter a valid account ID.", no_data: "No public matches are available for this ID.",
    unavailable: "Deadlock API is temporarily unavailable.", login: "Sign in to access your card.",
    save_first: "Save this card to your profile first.",
  },
  es: {
    title: "Mi perfil", card: "Mi carta", collection: "Mi colección", searchAgain: "Generar otra carta", closeSearch: "Cerrar búsqueda",
    id: "ID de cuenta de Deadlock o SteamID64",
    hint: "Pega el ID para consultar las estadísticas públicas del jugador.",
    generate: "Generar vista previa", generating: "Buscando partidas…", preview: "Vista previa",
    save: "Usar en mi perfil", saving: "Guardando…", saved: "Carta guardada en tu perfil.", back: "Volver a mi carta",
    collect: "Canjear en mi colección", collecting: "Canjeando…", collected: "Carta canjeada en tu colección.", alreadyCollected: "Esta carta ya está en tu colección.", viewCollection: "Ver en mi colección",
    loading: "Cargando tu carta…", history: "Historial de actualizaciones", auto: "Actualización automática", first: "Guardada en el perfil",
    updated: "Última actualización", publish: "Entrar en la clasificación", unpublish: "Salir de la clasificación",
    public: "Tu carta aparece en la clasificación de inicio.", private: "Publica la carta para aparecer en la clasificación de inicio.",
    invalid_id: "Introduce un ID de cuenta válido.", no_data: "No hay partidas públicas disponibles para este ID.",
    unavailable: "La API de Deadlock no está disponible en este momento.", login: "Inicia sesión para acceder a tu carta.",
    save_first: "Guarda esta carta en tu perfil primero.",
  },
});

type Issue = "invalid_id" | "no_data" | "unavailable" | "login" | "save_first";

async function profileRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init);
  if (response.ok) return response.json() as Promise<T>;
  const payload = await response.json().catch(() => null) as { code?: Issue } | null;
  throw new Error(payload?.code ?? "unavailable");
}

function issueOf(error: unknown): Issue {
  const code = error instanceof Error ? error.message : "";
  return code === "invalid_id" || code === "no_data" || code === "login" || code === "save_first" ? code : "unavailable";
}

const secondary = `${pill(false)} disabled:cursor-not-allowed disabled:opacity-50`;

export function Profile({ onOpenCollection }: { onOpenCollection: () => void }) {
  const t = useT(S);
  const locale = useLocale();
  const { me } = useData();
  const { faceFor, rankLabel, percent } = useProfileCardDisplay();
  const [accountId, setAccountId] = useState("");
  const [profile, setProfile] = useState<ProfileCardState>();
  const [preview, setPreview] = useState<ProfileCardStats>();
  const [busy, setBusy] = useState<"preview" | "save" | "publish" | "collect">();
  const [error, setError] = useState<Issue>();
  const [loadError, setLoadError] = useState<Issue>();
  const [saved, setSaved] = useState(false);
  const [showGenerator, setShowGenerator] = useState(false);
  const [claim, setClaim] = useState<ProfileCollectionRedeem>();
  const cardRef = useRef<HTMLDivElement>(null);
  const saveVersion = useRef(0);

  useEffect(() => {
    const controller = new AbortController();
    const refresh = async () => {
      const version = saveVersion.current;
      try {
        const state = await profileRequest<ProfileCardState>(PROFILE_CARD_PATH, { method: "POST", signal: controller.signal });
        if (!controller.signal.aborted && version === saveVersion.current) {
          setProfile(state);
          setLoadError(undefined);
        }
      } catch (e) {
        if (!controller.signal.aborted && version === saveVersion.current) setLoadError(issueOf(e));
      }
    };
    void refresh();
    const timer = window.setInterval(() => { if (!document.hidden) void refresh(); }, PROFILE_REFRESH_MS);
    return () => { controller.abort(); window.clearInterval(timer); };
  }, []);

  const generate = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(undefined);
    setSaved(false);
    setPreview(undefined);
    const id = normalizeAccountId(accountId);
    if (!id) { setError("invalid_id"); return; }
    setBusy("preview");
    try {
      setPreview(await profileRequest<ProfileCardStats>(`${PROFILE_CARD_PATH}?id=${id}`));
    } catch (e) {
      setError(issueOf(e));
    } finally {
      setBusy(undefined);
    }
  };

  const save = async () => {
    if (!preview) return;
    setError(undefined);
    setBusy("save");
    saveVersion.current += 1;
    try {
      const state = await profileRequest<ProfileCardState>(PROFILE_CARD_PATH, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ accountId: preview.accountId }),
      });
      saveVersion.current += 1;
      setProfile(state);
      setPreview(undefined);
      setShowGenerator(false);
      setLoadError(undefined);
      setSaved(true);
    } catch (e) {
      setError(issueOf(e));
    } finally {
      setBusy(undefined);
    }
  };

  const setPublished = async () => {
    if (!profile?.accountId) return;
    setError(undefined);
    setBusy("publish");
    saveVersion.current += 1;
    try {
      const state = await profileRequest<ProfileCardState>(PROFILE_CARD_PATH, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ accountId: profile.accountId, published: !profile.published }),
      });
      saveVersion.current += 1;
      setProfile(state);
      setLoadError(undefined);
    } catch (e) {
      setError(issueOf(e));
    } finally {
      setBusy(undefined);
    }
  };

  const history = profile?.history ?? [];
  const current = history[0];
  const stats = preview ?? current?.stats;
  const collected = claim?.card.stats.accountId === stats?.accountId ? claim : undefined;
  const status = loadError ?? profile?.issue;
  const date = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" });
  const face = stats && faceFor(stats);
  const collect = async () => {
    if (!stats) return;
    setError(undefined);
    setBusy("collect");
    try {
      setClaim(await profileRequest<ProfileCollectionRedeem>(PROFILE_COLLECTION_PATH, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ accountId: stats.accountId }),
      }));
    } catch (e) {
      setError(issueOf(e));
    } finally {
      setBusy(undefined);
    }
  };

  return (
    <section className="mx-auto flex max-w-5xl flex-col gap-6" aria-labelledby="profile-title">
      <header className="noir-glass flex flex-wrap items-center justify-between gap-5 rounded-2xl p-4 sm:p-6">
        <div className="flex min-w-0 items-center gap-3">
          {me?.image
            ? <img src={me.image} alt="" className="size-12 shrink-0 rounded-xl object-cover sm:size-16" />
            : <span aria-hidden="true" className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-zinc-800 text-xl font-black text-dl-text sm:size-16">{me?.name.charAt(0).toUpperCase()}</span>}
          <div className="flex min-w-0 flex-col gap-1">
            <h1 id="profile-title" className={pageTitle}>{t.title}</h1>
            <p className="truncate text-sm text-zinc-300">{me?.name}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {current && (
            <button type="button" disabled={!!busy} aria-expanded={showGenerator} aria-controls="profile-generator"
              onClick={() => { if (showGenerator) setPreview(undefined); setShowGenerator(!showGenerator); }} className={secondary}>
              {showGenerator ? t.closeSearch : t.searchAgain}
            </button>
          )}
          <button type="button" onClick={onOpenCollection} className={primaryBtn}>{t.collection}</button>
        </div>
      </header>

      {(!current || showGenerator) && (
        <div id="profile-generator" className="noir-glass flex flex-col gap-3 rounded-2xl p-4 sm:p-6">
          <form onSubmit={generate} className="flex flex-col items-start gap-3 sm:flex-row sm:items-end">
            <label className="flex w-full min-w-0 flex-col gap-1.5 text-sm font-semibold text-zinc-100 sm:max-w-sm">
              {t.id}
              <input
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                placeholder={profile?.accountId ?? "123456789"}
                aria-describedby="profile-id-hint"
                autoComplete="off"
                maxLength={30}
                required
                disabled={!!busy}
                className={`${field} disabled:opacity-60`}
              />
            </label>
            <button type="submit" disabled={!!busy} className={primaryBtn}>{busy === "preview" ? t.generating : t.generate}</button>
          </form>
          <p id="profile-id-hint" className="text-sm text-zinc-400">{t.hint}</p>
        </div>
      )}

      {!profile && !loadError && <p role="status" className="text-sm text-zinc-400">{t.loading}</p>}
      {error && <p role="alert" className="text-sm text-red-300">{t[error]}</p>}
      {saved && <p role="status" className="text-sm text-emerald-300">{t.saved}</p>}
      {status && <p role="status" className="text-sm text-amber-200">{t[status]}</p>}

      {face && stats && (
        <div className="noir-glass flex min-w-0 flex-col items-center gap-5 rounded-2xl p-3 sm:p-6 md:flex-row md:items-start">
          <div ref={cardRef} className="w-fit max-w-full">
            <Card profile={face} variant="editor" />
          </div>
          <div className="flex w-full min-w-0 flex-1 flex-col items-start gap-4">
            <div className="flex flex-col gap-1">
              <h2 className="font-display text-xl font-black text-dl-text">{preview ? t.preview : t.card}</h2>
              {!preview && current && <p className="text-sm text-zinc-400">{t.updated} <time dateTime={new Date(current.updatedAt).toISOString()}>{date.format(current.updatedAt)}</time></p>}
            </div>
            <div className="flex flex-wrap items-start gap-2">
              <button type="button" disabled={!!busy} onClick={collected ? onOpenCollection : collect} className={primaryBtn}>
                {collected ? t.viewCollection : busy === "collect" ? t.collecting : t.collect}
              </button>
              {preview && preview.accountId !== profile?.accountId && (
                <button type="button" disabled={!!busy} onClick={save} className={secondary}>{busy === "save" ? t.saving : t.save}</button>
              )}
              {preview && current && (
                <button type="button" disabled={!!busy} onClick={() => { setPreview(undefined); setShowGenerator(false); }} className={secondary}>{t.back}</button>
              )}
              {!preview && current && (
                <button type="button" disabled={!!busy} onClick={setPublished} className={secondary}>
                  {busy === "publish" ? t.saving : profile?.published ? t.unpublish : t.publish}
                </button>
              )}
              <CardExportButton key={stats.accountId} cardRef={cardRef} name={face.name} />
            </div>
            {collected && <p role="status" className="text-sm text-emerald-300">{collected.added ? t.collected : t.alreadyCollected}</p>}
            {!preview && current && (
              <div className="flex w-full flex-col gap-2">
                <p role="status" className="text-sm text-zinc-400">{profile?.published ? t.public : t.private}</p>
                <h3 className="text-sm font-bold text-zinc-100">{t.history}</h3>
                <ol className="flex flex-col gap-2">
                  {history.map(({ id, updatedAt, automatic, stats }) => (
                    <li key={id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-lg bg-zinc-900/70 p-3 text-sm text-zinc-300">
                      <div className="flex flex-col gap-1">
                        <time dateTime={new Date(updatedAt).toISOString()} className="font-semibold text-zinc-100">{date.format(updatedAt)}</time>
                        <span className="text-xs text-zinc-400">{automatic ? t.auto : t.first}</span>
                      </div>
                      <span>{rankLabel(stats.rank)} · {percent.format(stats.wins / stats.matches)}</span>
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
