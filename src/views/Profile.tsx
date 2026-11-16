import { useEffect, useRef, useState, type FormEvent } from "react";
import { Card } from "../components/Card";
import { CardExportButton } from "../components/CardExportButton";
import { Range } from "../components/Range";
import { STAT_KEYS, calculateOVR } from "../lib/cards";
import { useData } from "../lib/data";
import { strings, useLocale, useT } from "../lib/i18n";
import { PROFILE_CARD_PATH, PROFILE_COLLECTION_PATH, PROFILE_NAME_MAX, profilePlayer, type ProfileCard, type ProfileCardState, type ProfileCollectionRedeem } from "../lib/profile";
import { field, pageTitle, pill, primaryBtn } from "../lib/ui";

const S = strings({
  pt: {
    title: "Meu perfil", collection: "Minha coleção", name: "Nome na carta", hero: "Herói", stats: "Seus atributos",
    hint: "Defina como você se vê no jogo. A carta não entra na tier list.",
    save: "Salvar no meu perfil", saving: "Salvando…", saved: "Carta salva no seu perfil.", unsaved: "Alterações não salvas.",
    collect: "Resgatar na minha coleção", collecting: "Resgatando…", collected: "Carta resgatada na sua coleção.", alreadyCollected: "Esta versão já está na sua coleção.", viewCollection: "Ver na minha coleção",
    loading: "Carregando sua carta…", history: "Histórico de versões", updated: "Última atualização",
    publish: "Entrar no ranking", unpublish: "Sair do ranking",
    public: "Sua carta aparece no ranking da página inicial.", private: "Publique a carta para aparecer no ranking da página inicial.",
    invalid_card: "Confira o nome, o herói e os atributos.", unavailable: "Não foi possível salvar agora.", login: "Entre para acessar sua carta.",
    save_first: "Salve esta carta no perfil primeiro.",
  },
  en: {
    title: "My profile", collection: "My collection", name: "Name on card", hero: "Hero", stats: "Your attributes",
    hint: "Set how you see yourself in game. This card does not enter the tier list.",
    save: "Save to my profile", saving: "Saving…", saved: "Card saved to your profile.", unsaved: "Unsaved changes.",
    collect: "Redeem to my collection", collecting: "Redeeming…", collected: "Card added to your collection.", alreadyCollected: "This version is already in your collection.", viewCollection: "See in my collection",
    loading: "Loading your card…", history: "Version history", updated: "Last updated",
    publish: "Join the leaderboard", unpublish: "Leave the leaderboard",
    public: "Your card appears on the home leaderboard.", private: "Publish the card to appear on the home leaderboard.",
    invalid_card: "Check the name, hero and attributes.", unavailable: "Could not save right now.", login: "Sign in to access your card.",
    save_first: "Save this card to your profile first.",
  },
  es: {
    title: "Mi perfil", collection: "Mi colección", name: "Nombre en la carta", hero: "Héroe", stats: "Tus atributos",
    hint: "Define cómo te ves en el juego. La carta no entra en la tier list.",
    save: "Guardar en mi perfil", saving: "Guardando…", saved: "Carta guardada en tu perfil.", unsaved: "Cambios sin guardar.",
    collect: "Canjear en mi colección", collecting: "Canjeando…", collected: "Carta canjeada en tu colección.", alreadyCollected: "Esta versión ya está en tu colección.", viewCollection: "Ver en mi colección",
    loading: "Cargando tu carta…", history: "Historial de versiones", updated: "Última actualización",
    publish: "Entrar en la clasificación", unpublish: "Salir de la clasificación",
    public: "Tu carta aparece en la clasificación de inicio.", private: "Publica la carta para aparecer en la clasificación de inicio.",
    invalid_card: "Revisa el nombre, el héroe y los atributos.", unavailable: "No se pudo guardar ahora.", login: "Inicia sesión para acceder a tu carta.",
    save_first: "Guarda esta carta en tu perfil primero.",
  },
});

type Issue = "invalid_card" | "unavailable" | "login" | "save_first";

async function profileRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init);
  if (response.ok) return response.json() as Promise<T>;
  const payload = await response.json().catch(() => null) as { code?: Issue } | null;
  throw new Error(payload?.code ?? "unavailable");
}

function issueOf(error: unknown): Issue {
  const code = error instanceof Error ? error.message : "";
  return code === "invalid_card" || code === "login" || code === "save_first" ? code : "unavailable";
}

const sendJson = (method: string, body?: unknown): RequestInit =>
  ({ method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });

const secondary = `${pill(false)} disabled:cursor-not-allowed disabled:opacity-50`;

export function Profile({ onOpenCollection }: { onOpenCollection: () => void }) {
  const t = useT(S);
  const locale = useLocale();
  const { me, heroNames } = useData();
  const [profile, setProfile] = useState<ProfileCardState>();
  const [draft, setDraft] = useState<ProfileCard>();
  const [busy, setBusy] = useState<"save" | "publish" | "collect">();
  const [error, setError] = useState<Issue>();
  const [saved, setSaved] = useState(false);
  const [claim, setClaim] = useState<ProfileCollectionRedeem>();
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    profileRequest<ProfileCardState>(PROFILE_CARD_PATH, { signal: controller.signal })
      .then(setProfile)
      .catch((e) => { if (!controller.signal.aborted) setError(issueOf(e)); });
    return () => controller.abort();
  }, []);

  const current = profile?.history[0];
  const card = draft ?? current?.card ?? (profile && {
    name: (me?.name ?? "").slice(0, PROFILE_NAME_MAX),
    hero: heroNames[0] ?? "Abrams",
    stats: { MIR: 50, MAC: 50, SUP: 50, MOV: 50, POL: 50, CON: 50 },
  });
  const dirty = !!card && JSON.stringify(card) !== JSON.stringify(current?.card);
  const collected = claim && JSON.stringify(claim.card.card) === JSON.stringify(current?.card) ? claim : undefined;
  const date = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" });

  const run = async (kind: NonNullable<typeof busy>, action: () => Promise<void>) => {
    setError(undefined);
    setBusy(kind);
    try { await action(); } catch (e) { setError(issueOf(e)); } finally { setBusy(undefined); }
  };

  const save = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!card) return;
    void run("save", async () => {
      setProfile(await profileRequest<ProfileCardState>(PROFILE_CARD_PATH, sendJson("PUT", { ...card, name: card.name.trim() })));
      setDraft(undefined);
      setSaved(true);
    });
  };
  const togglePublished = () => run("publish", async () => {
    setProfile(await profileRequest<ProfileCardState>(PROFILE_CARD_PATH, sendJson("PATCH", { published: !profile?.published })));
  });
  const collect = () => run("collect", async () => {
    setClaim(await profileRequest<ProfileCollectionRedeem>(PROFILE_COLLECTION_PATH, sendJson("POST")));
  });
  const update = (patch: Partial<ProfileCard>) => {
    setSaved(false);
    if (card) setDraft({ ...card, ...patch });
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
        <button type="button" onClick={onOpenCollection} className={primaryBtn}>{t.collection}</button>
      </header>

      {!card && !error && <p role="status" className="text-sm text-zinc-400">{t.loading}</p>}
      {error && <p role="alert" className="text-sm text-red-300">{t[error]}</p>}

      {card && (
        <div className="noir-glass flex min-w-0 flex-col items-center gap-5 rounded-2xl p-3 sm:p-6 md:flex-row md:items-start">
          <div ref={cardRef} className="w-fit max-w-full">
            <Card player={profilePlayer(card)} variant="editor" />
          </div>
          <div className="flex w-full min-w-0 flex-1 flex-col gap-5">
            <form onSubmit={save} className="flex flex-col gap-4">
              <p className="text-sm text-zinc-400">{t.hint}</p>
              <div className="flex flex-wrap gap-3">
                <label className="flex min-w-0 flex-1 basis-48 flex-col gap-1.5 text-sm font-semibold text-zinc-100">
                  {t.name}
                  <input value={card.name} onChange={(e) => update({ name: e.target.value })} maxLength={PROFILE_NAME_MAX} required
                    autoComplete="off" disabled={!!busy} className={`${field} disabled:opacity-60`} />
                </label>
                <label className="flex min-w-0 flex-1 basis-40 flex-col gap-1.5 text-sm font-semibold text-zinc-100">
                  {t.hero}
                  <select value={card.hero} onChange={(e) => update({ hero: e.target.value })} disabled={!!busy} className={`${field} disabled:opacity-60`}>
                    {!heroNames.includes(card.hero) && <option value={card.hero}>{card.hero}</option>}
                    {heroNames.map((h) => <option key={h} value={h}>{h}</option>)}
                  </select>
                </label>
              </div>
              <fieldset className="flex flex-col gap-3" disabled={!!busy}>
                <legend className="mb-3 flex w-full items-center justify-between text-sm font-bold text-zinc-100">
                  {t.stats}
                  <span className="text-zinc-400 tabular-nums">OVR {calculateOVR(card.stats)}</span>
                </legend>
                <div className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
                  {STAT_KEYS.map((k) => (
                    <Range key={k} label={k} value={card.stats[k]} min={1} max={99} onChange={(v) => update({ stats: { ...card.stats, [k]: v } })} />
                  ))}
                </div>
              </fieldset>
              <div className="flex flex-wrap items-center gap-2">
                <button type="submit" disabled={!!busy || !dirty} className={primaryBtn}>{busy === "save" ? t.saving : t.save}</button>
                {saved && !dirty && <p role="status" className="text-sm text-emerald-300">{t.saved}</p>}
                {current && dirty && <p role="status" className="text-sm text-amber-200">{t.unsaved}</p>}
              </div>
            </form>

            {current && (
              <div className="flex flex-col items-start gap-4">
                <div className="flex flex-wrap items-start gap-2">
                  <button type="button" disabled={!!busy} onClick={collected ? onOpenCollection : collect} className={secondary}>
                    {collected ? t.viewCollection : busy === "collect" ? t.collecting : t.collect}
                  </button>
                  <button type="button" disabled={!!busy} onClick={togglePublished} className={secondary}>
                    {busy === "publish" ? t.saving : profile?.published ? t.unpublish : t.publish}
                  </button>
                  <CardExportButton cardRef={cardRef} name={card.name} />
                </div>
                {collected && <p role="status" className="text-sm text-emerald-300">{collected.added ? t.collected : t.alreadyCollected}</p>}
                <p role="status" className="text-sm text-zinc-400">{profile?.published ? t.public : t.private}</p>
                <div className="flex w-full flex-col gap-2">
                  <h2 className="text-sm font-bold text-zinc-100">{t.history}</h2>
                  <ol className="flex flex-col gap-2">
                    {profile.history.map(({ id, updatedAt, card }) => (
                      <li key={id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-lg bg-zinc-900/70 p-3 text-sm text-zinc-300">
                        <time dateTime={new Date(updatedAt).toISOString()} className="font-semibold text-zinc-100">{date.format(updatedAt)}</time>
                        <span>{card.hero} · OVR {calculateOVR(card.stats)}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
