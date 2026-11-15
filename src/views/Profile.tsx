import { useEffect, useRef, useState, type FormEvent } from "react";
import { Card } from "../components/Card";
import { CardExportButton } from "../components/CardExportButton";
import { strings, useLocale, useT } from "../lib/i18n";
import { normalizeAccountId, PROFILE_CARD_PATH, PROFILE_REFRESH_MS, type ProfileCardState, type ProfileCardStats } from "../lib/profile";
import { useProfileCardDisplay } from "../lib/profileDisplay";
import { pageTitle } from "../lib/ui";

const S = strings({
  pt: {
    title: "Minha carta", id: "ID da conta Deadlock ou SteamID64",
    hint: "Cole o ID para consultar as estatísticas públicas do jogador.",
    generate: "Gerar prévia", generating: "Buscando partidas…", preview: "Prévia",
    save: "Usar no meu perfil", saving: "Salvando…", saved: "Carta salva no seu perfil.", back: "Voltar à minha carta",
    loading: "Carregando sua carta…", history: "Histórico de atualizações", auto: "Atualização automática", first: "Salva no perfil",
    updated: "Última atualização", publish: "Entrar no ranking", unpublish: "Sair do ranking",
    public: "Sua carta aparece no ranking da página inicial.", private: "Publique a carta para aparecer no ranking da página inicial.",
    invalid_id: "Informe um ID de conta válido.", no_data: "Sem partidas públicas disponíveis para este ID.",
    unavailable: "A Deadlock API está indisponível no momento.", login: "Entre para acessar sua carta.",
    save_first: "Salve esta carta no perfil primeiro.",
  },
  en: {
    title: "My card", id: "Deadlock account ID or SteamID64",
    hint: "Paste an ID to look up the player's public stats.",
    generate: "Generate preview", generating: "Looking up matches…", preview: "Preview",
    save: "Use on my profile", saving: "Saving…", saved: "Card saved to your profile.", back: "Back to my card",
    loading: "Loading your card…", history: "Update history", auto: "Automatic update", first: "Saved to profile",
    updated: "Last updated", publish: "Join the leaderboard", unpublish: "Leave the leaderboard",
    public: "Your card appears on the home leaderboard.", private: "Publish the card to appear on the home leaderboard.",
    invalid_id: "Enter a valid account ID.", no_data: "No public matches are available for this ID.",
    unavailable: "Deadlock API is temporarily unavailable.", login: "Sign in to access your card.",
    save_first: "Save this card to your profile first.",
  },
  es: {
    title: "Mi carta", id: "ID de cuenta de Deadlock o SteamID64",
    hint: "Pega el ID para consultar las estadísticas públicas del jugador.",
    generate: "Generar vista previa", generating: "Buscando partidas…", preview: "Vista previa",
    save: "Usar en mi perfil", saving: "Guardando…", saved: "Carta guardada en tu perfil.", back: "Volver a mi carta",
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

const button = "min-h-11 cursor-pointer rounded-lg bg-zinc-100 px-4 text-sm font-bold text-zinc-950 hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white active:bg-zinc-300 disabled:cursor-not-allowed disabled:opacity-60";

export function Profile() {
  const t = useT(S);
  const locale = useLocale();
  const { faceFor, rankLabel, percent } = useProfileCardDisplay();
  const [accountId, setAccountId] = useState("");
  const [profile, setProfile] = useState<ProfileCardState>();
  const [preview, setPreview] = useState<ProfileCardStats>();
  const [busy, setBusy] = useState<"preview" | "save" | "publish">();
  const [error, setError] = useState<Issue>();
  const [loadError, setLoadError] = useState<Issue>();
  const [saved, setSaved] = useState(false);
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
  const status = loadError ?? profile?.issue;
  const date = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" });
  const face = stats && faceFor(stats);

  return (
    <section className="mx-auto flex max-w-5xl flex-col gap-6" aria-labelledby="profile-title">
      <div className="noir-glass flex flex-col gap-4 rounded-2xl p-4 sm:p-6">
        <h1 id="profile-title" className={pageTitle}>{t.title}</h1>
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
              className="min-h-11 rounded-lg border border-zinc-200/20 bg-zinc-950 px-3 text-zinc-100 placeholder:text-zinc-500 hover:border-zinc-200/40 focus-visible:outline-2 focus-visible:outline-zinc-100 disabled:opacity-60"
            />
          </label>
          <button type="submit" disabled={!!busy} className={button}>{busy === "preview" ? t.generating : t.generate}</button>
        </form>
        <p id="profile-id-hint" className="text-sm text-zinc-400">{t.hint}</p>
        {!profile && !loadError && <p role="status" className="text-sm text-zinc-400">{t.loading}</p>}
        {error && <p role="alert" className="text-sm text-red-300">{t[error]}</p>}
        {saved && <p role="status" className="text-sm text-emerald-300">{t.saved}</p>}
        {status && <p role="status" className="text-sm text-amber-200">{t[status]}</p>}
      </div>

      {face && stats && (
        <div className="noir-glass flex min-w-0 flex-col items-center gap-5 rounded-2xl p-3 sm:p-6 md:flex-row md:items-start">
          <div ref={cardRef} className="w-fit max-w-full">
            <Card profile={face} variant="editor" />
          </div>
          <div className="flex w-full min-w-0 flex-1 flex-col items-start gap-4">
            <p className="text-sm text-zinc-400">
              {preview ? t.preview : current && <>{t.updated} <time dateTime={new Date(current.updatedAt).toISOString()}>{date.format(current.updatedAt)}</time></>}
            </p>
            <div className="flex flex-wrap items-start gap-2">
              {preview && preview.accountId !== profile?.accountId && (
                <button type="button" disabled={!!busy} onClick={save} className={button}>{busy === "save" ? t.saving : t.save}</button>
              )}
              {preview && current && (
                <button type="button" disabled={!!busy} onClick={() => setPreview(undefined)} className={button}>{t.back}</button>
              )}
              {!preview && current && (
                <button type="button" disabled={!!busy} onClick={setPublished} className={button}>
                  {busy === "publish" ? t.saving : profile?.published ? t.unpublish : t.publish}
                </button>
              )}
              <CardExportButton key={stats.accountId} cardRef={cardRef} name={face.name} />
            </div>
            {!preview && current && (
              <div className="flex w-full flex-col gap-2">
                <p role="status" className="text-sm text-zinc-400">{profile?.published ? t.public : t.private}</p>
                <h2 className="text-sm font-bold text-zinc-100">{t.history}</h2>
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
