import { useDeferredValue, useEffect, useRef, useState, type FormEvent } from "react";
import { Card } from "../components/Card";
import { CardExportButton } from "../components/CardExportButton";
import { Icon } from "../components/Icon";
import { Range } from "../components/Range";
import { STAT_KEYS, calculateOVR, getPlayerOvr, teamOf } from "../lib/cards";
import { useData } from "../lib/data";
import { strings, useLocale, useT } from "../lib/i18n";
import { PROFILE_CARD_PATH, PROFILE_NAME_MAX, favoritePath, profilePlayer, profileUrl, summarizeCollection, type ProfileCard, type ProfileCardState, type PublicProfile } from "../lib/profile";
import { getCardTier } from "../lib/rarity";
import { field, pageTitle, pill, primaryBtn } from "../lib/ui";

const S = strings({
  pt: {
    favorites: "Favoritas", addFavorite: (n: string) => `Favoritar ${n}`, removeFavorite: (n: string) => `Desfavoritar ${n}`, favoriteFailed: "Não foi possível salvar o favorito.",
    progress: "Progresso", best: "Maior OVR", catalog: (owned: number, total: number) => `${owned} de ${total} cartas`,
    rarity: "Filtrar por raridade", all: "Todas", search: "Buscar cartas", searchPlaceholder: "Jogador, herói ou time…",
    sort: "Ordenar cartas", sortOvr: "Ordenar: OVR", sortName: "Ordenar: Nome", sortTeam: "Ordenar: Time",
    noResults: "Nenhuma carta corresponde aos filtros.", more: (n: number) => `Mostrar mais (${n})`,
    name: "Nome na carta", hero: "Herói", stats: "Atributos",
    hint: "Defina como você se vê no jogo. A carta aparece só no seu perfil, fora da tier list.",
    save: "Salvar carta", saving: "Salvando…", cancel: "Cancelar", unsaved: "Alterações não salvas.",
    loading: "Carregando perfil…", history: "Histórico de versões",
    edit: "Editar minha carta", create: "Montar minha carta", share: "Copiar link", copied: "Link copiado.", copyFailed: "Não foi possível copiar o link.",
    noCard: "Ainda não montou uma carta.", cards: "Cartas resgatadas", noCards: "Nenhuma carta resgatada ainda.", redeem: "Resgatar carta",
    not_found: "Perfil não encontrado.",
    invalid_card: "Confira o nome, o herói e os atributos.", unavailable: "Não foi possível carregar agora.", login: "Entre para editar sua carta.",
  },
  en: {
    favorites: "Favorites", addFavorite: (n: string) => `Favorite ${n}`, removeFavorite: (n: string) => `Unfavorite ${n}`, favoriteFailed: "Could not save the favorite.",
    progress: "Progress", best: "Highest OVR", catalog: (owned: number, total: number) => `${owned} of ${total} cards`,
    rarity: "Filter by rarity", all: "All", search: "Search cards", searchPlaceholder: "Player, hero or team…",
    sort: "Sort cards", sortOvr: "Sort: OVR", sortName: "Sort: Name", sortTeam: "Sort: Team",
    noResults: "No cards match your filters.", more: (n: number) => `Show more (${n})`,
    name: "Name on card", hero: "Hero", stats: "Attributes",
    hint: "Set how you see yourself in game. The card only shows on your profile, outside the tier list.",
    save: "Save card", saving: "Saving…", cancel: "Cancel", unsaved: "Unsaved changes.",
    loading: "Loading profile…", history: "Version history",
    edit: "Edit my card", create: "Build my card", share: "Copy link", copied: "Link copied.", copyFailed: "Could not copy the link.",
    noCard: "No card built yet.", cards: "Redeemed cards", noCards: "No cards redeemed yet.", redeem: "Redeem a card",
    not_found: "Profile not found.",
    invalid_card: "Check the name, hero and attributes.", unavailable: "Could not load right now.", login: "Sign in to edit your card.",
  },
  es: {
    favorites: "Favoritas", addFavorite: (n: string) => `Marcar ${n} como favorita`, removeFavorite: (n: string) => `Quitar ${n} de favoritas`, favoriteFailed: "No se pudo guardar el favorito.",
    progress: "Progreso", best: "OVR más alto", catalog: (owned: number, total: number) => `${owned} de ${total} cartas`,
    rarity: "Filtrar por rareza", all: "Todas", search: "Buscar cartas", searchPlaceholder: "Jugador, héroe o equipo…",
    sort: "Ordenar cartas", sortOvr: "Ordenar: OVR", sortName: "Ordenar: Nombre", sortTeam: "Ordenar: Equipo",
    noResults: "Ninguna carta coincide con los filtros.", more: (n: number) => `Mostrar más (${n})`,
    name: "Nombre en la carta", hero: "Héroe", stats: "Atributos",
    hint: "Define cómo te ves en el juego. La carta solo aparece en tu perfil, fuera de la tier list.",
    save: "Guardar carta", saving: "Guardando…", cancel: "Cancelar", unsaved: "Cambios sin guardar.",
    loading: "Cargando perfil…", history: "Historial de versiones",
    edit: "Editar mi carta", create: "Armar mi carta", share: "Copiar enlace", copied: "Enlace copiado.", copyFailed: "No se pudo copiar el enlace.",
    noCard: "Todavía no armó una carta.", cards: "Cartas canjeadas", noCards: "Todavía no canjeó cartas.", redeem: "Canjear carta",
    not_found: "Perfil no encontrado.",
    invalid_card: "Revisa el nombre, el héroe y los atributos.", unavailable: "No se pudo cargar ahora.", login: "Inicia sesión para editar tu carta.",
  },
});

type Issue = "invalid_card" | "unavailable" | "login" | "not_found";

async function profileRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init);
  if (response.ok) return response.json() as Promise<T>;
  const payload = await response.json().catch(() => null) as { code?: Issue } | null;
  throw new Error(payload?.code ?? "unavailable");
}

function issueOf(error: unknown): Issue {
  const code = error instanceof Error ? error.message : "";
  return code === "invalid_card" || code === "login" || code === "not_found" ? code : "unavailable";
}

export function Profile({ userId, onOpenCard, onRedeem }: { userId: string; onOpenCard: (id: string) => void; onRedeem: () => void }) {
  const t = useT(S);
  const { me, settings } = useData();
  const [profile, setProfile] = useState<PublicProfile>();
  const [error, setError] = useState<Issue>();
  const [editing, setEditing] = useState(false);
  const [copy, setCopy] = useState<"copied" | "copyFailed">();
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    profileRequest<PublicProfile>(`/api/users/${encodeURIComponent(userId)}`, { signal: controller.signal })
      .then((p) => {
        setProfile(p);
        if (p.handle && p.handle !== userId) history.replaceState(null, "", profileUrl(p.handle));
      })
      .catch((e) => { if (!controller.signal.aborted) setError(issueOf(e)); });
    return () => controller.abort();
  }, [userId]);

  const share = () => {
    navigator.clipboard.writeText(location.origin + profileUrl(profile?.handle ?? userId))
      .then(() => setCopy("copied"), () => setCopy("copyFailed"));
  };

  if (error) return <p role="alert" className="text-sm text-red-300">{t[error]}</p>;
  if (!profile) return <p role="status" className="text-sm text-zinc-400">{t.loading}</p>;

  const owner = me?.id === profile.id;
  const card = profile.card;
  const tier = card && getCardTier(profilePlayer(card), settings.tierConfig!);
  const identity = (
    <div className="flex min-w-0 items-center gap-3">
      {profile.image
        ? <img src={profile.image} alt="" className="size-12 shrink-0 rounded-xl object-cover sm:size-14" />
        : <span aria-hidden="true" className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-zinc-800 text-xl font-black text-dl-text sm:size-14">{profile.name.charAt(0).toUpperCase()}</span>}
      <div className="flex min-w-0 flex-col gap-0.5">
        <h1 id="profile-title" className={`${pageTitle} truncate`}>{profile.name}</h1>
        {profile.handle && <p className="truncate text-sm font-semibold text-zinc-300">@{profile.handle}</p>}
        {card && <p className="truncate text-sm text-zinc-400">{card.name} · {card.hero}</p>}
      </div>
    </div>
  );

  return (
    <section className="mx-auto flex max-w-6xl flex-col gap-6" aria-labelledby="profile-title">
      {editing ? (
        <>
          {identity}
          <ProfileEditor
            onCancel={() => setEditing(false)}
            onSaved={(saved) => { setProfile({ ...profile, card: saved }); setEditing(false); }}
          />
        </>
      ) : (
        <div className="noir-glass flex flex-col items-center gap-6 rounded-2xl p-4 sm:p-6 md:flex-row md:items-stretch md:gap-8">
          {card && <div ref={cardRef} className="w-fit max-w-full shrink-0"><Card player={profilePlayer(card)} /></div>}
          <div className="flex w-full min-w-0 flex-1 flex-col gap-6">
            {identity}
            {card && tier ? (
              <div className="flex flex-col gap-5">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="font-display text-5xl leading-none font-black text-dl-text tabular-nums">{calculateOVR(card.stats)}</span>
                  <span className="text-xs font-bold tracking-widest text-zinc-400 uppercase">OVR</span>
                  <span className="rk-chip" style={{ color: tier.c, borderColor: tier.c }}>{tier.name}</span>
                </div>
                <dl className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
                  {STAT_KEYS.map((k) => (
                    <div key={k} className="flex flex-col gap-1.5">
                      <div className="flex items-center justify-between text-xs font-bold tracking-[0.18em] uppercase">
                        <dt className="text-zinc-400">{k}</dt>
                        <dd className="text-zinc-100 tabular-nums">{card.stats[k]}</dd>
                      </div>
                      <div aria-hidden="true" className="h-1.5 rounded-full bg-zinc-800">
                        <div className="h-full rounded-full" style={{ width: `${card.stats[k]}%`, background: tier.c }} />
                      </div>
                    </div>
                  ))}
                </dl>
              </div>
            ) : <p className="text-sm text-zinc-400">{t.noCard}</p>}
            <div className="flex flex-wrap items-center gap-2 md:mt-auto">
              {owner && <button type="button" onClick={() => setEditing(true)} className={primaryBtn}>{card ? t.edit : t.create}</button>}
              <button type="button" onClick={share} className={pill(false)}>{t.share}</button>
              {card && <CardExportButton cardRef={cardRef} name={card.name} />}
              {copy && <p role="status" className={`text-sm ${copy === "copied" ? "text-emerald-300" : "text-red-300"}`}>{t[copy]}</p>}
            </div>
          </div>
        </div>
      )}

      <ProfileCards ids={profile.cards} initialFavorites={profile.favorites} owner={owner} onOpenCard={onOpenCard} onRedeem={onRedeem} />
    </section>
  );
}

const PAGE = 18;
type Sort = "ovr" | "name" | "team";

function ProfileCards({ ids, initialFavorites, owner, onOpenCard, onRedeem }: { ids: string[]; initialFavorites: string[]; owner: boolean; onOpenCard: (id: string) => void; onRedeem: () => void }) {
  const t = useT(S);
  const { players, teams, settings } = useData();
  const [q, setQ] = useState("");
  const [rarity, setRarity] = useState<string>();
  const [sort, setSort] = useState<Sort>("ovr");
  const [limit, setLimit] = useState(PAGE);
  const [favorites, setFavorites] = useState(initialFavorites);
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const [busy, setBusy] = useState<string>();
  const [favoriteFailed, setFavoriteFailed] = useState(false);
  const query = useDeferredValue(q.trim().toLowerCase());
  const favoriteIds = new Set(favorites);

  const summary = summarizeCollection(players, ids, settings.tierConfig!);
  const list = summary.cards
    .filter((p) => !onlyFavorites || favoriteIds.has(p.id))
    .filter((p) => !rarity || getCardTier(p, settings.tierConfig!).tierKey === rarity)
    .filter((p) => !query || `${p.name} ${p.hero} ${teamOf(teams, p).name} ${teamOf(teams, p).tag}`.toLowerCase().includes(query))
    .sort((a, b) => sort === "name" ? a.name.localeCompare(b.name)
      : sort === "team" ? teamOf(teams, a).name.localeCompare(teamOf(teams, b).name) || a.name.localeCompare(b.name)
        : getPlayerOvr(b) - getPlayerOvr(a) || a.name.localeCompare(b.name));
  const pick = (key?: string) => { setRarity(key); setLimit(PAGE); };
  const favoriteCount = summary.cards.filter((p) => favoriteIds.has(p.id)).length;

  const toggleFavorite = async (id: string) => {
    setBusy(id);
    setFavoriteFailed(false);
    try {
      const res = await fetch(favoritePath(id), { method: favoriteIds.has(id) ? "DELETE" : "PUT" });
      if (!res.ok) throw new Error(String(res.status));
      setFavorites((await res.json() as { favorites: string[] }).favorites);
    } catch {
      setFavoriteFailed(true);
    } finally {
      setBusy(undefined);
    }
  };

  return (
    <section aria-labelledby="profile-cards-title" className="noir-glass flex flex-col gap-5 rounded-2xl p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="profile-cards-title" className="font-display text-lg font-black text-dl-text">{t.cards} · {summary.cards.length}</h2>
        {owner && <button type="button" onClick={onRedeem} className={pill(false)}>{t.redeem}</button>}
      </div>
      {summary.cards.length ? (
        <>
          <div className="flex flex-wrap gap-x-10 gap-y-4">
            <div className="flex min-w-48 flex-1 flex-col gap-2">
              <span className="text-xs font-bold tracking-widest text-zinc-400 uppercase">{t.progress}</span>
              <div className="flex flex-wrap items-baseline gap-x-3">
                <span className="font-display text-3xl font-black text-dl-text tabular-nums">{summary.percent}%</span>
                <span className="text-sm text-zinc-400">{t.catalog(summary.cards.length, summary.total)}</span>
              </div>
              <div role="progressbar" aria-label={t.progress} aria-valuenow={summary.percent} aria-valuemin={0} aria-valuemax={100} className="h-1.5 rounded-full bg-zinc-800">
                <div className="h-full rounded-full bg-dl-text" style={{ width: `${summary.percent}%` }} />
              </div>
            </div>
            {summary.best && (
              <div className="flex flex-col gap-2">
                <span className="text-xs font-bold tracking-widest text-zinc-400 uppercase">{t.best}</span>
                <div className="flex flex-wrap items-baseline gap-x-3">
                  <span className="font-display text-3xl font-black text-dl-text tabular-nums">{getPlayerOvr(summary.best)}</span>
                  <span className="text-sm text-zinc-400">{summary.best.name}</span>
                </div>
              </div>
            )}
          </div>
          <div role="group" aria-label={t.rarity} className="flex flex-wrap gap-2">
            <button type="button" aria-pressed={!rarity} onClick={() => pick()} className={pill(!rarity)}>{t.all}</button>
            {summary.rarities.map((r) => (
              <button key={r.tierKey} type="button" aria-pressed={rarity === r.tierKey} disabled={!r.count}
                onClick={() => pick(rarity === r.tierKey ? undefined : r.tierKey)}
                className={`${pill(rarity === r.tierKey)} disabled:cursor-not-allowed disabled:opacity-40`}>
                <span aria-hidden="true" className="size-2 rounded-full" style={{ background: r.c }} />
                {r.name}
                <span className="tabular-nums opacity-70">{r.count}</span>
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {(owner || favoriteCount > 0) && (
              <button type="button" aria-pressed={onlyFavorites} disabled={!favoriteCount}
                onClick={() => { setOnlyFavorites(!onlyFavorites); setLimit(PAGE); }}
                className={`${pill(onlyFavorites)} disabled:cursor-not-allowed disabled:opacity-40`}>
                <Icon name="star" className={`size-3.5 ${onlyFavorites ? "fill-current" : ""}`} />
                {t.favorites}
                <span className="tabular-nums opacity-70">{favoriteCount}</span>
              </button>
            )}
            <input value={q} onChange={(e) => { setQ(e.target.value); setLimit(PAGE); }} placeholder={t.searchPlaceholder} aria-label={t.search} className={`${field} min-w-0 flex-1 basis-56`} />
            <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label={t.sort} className={field}>
              <option value="ovr">{t.sortOvr}</option>
              <option value="name">{t.sortName}</option>
              <option value="team">{t.sortTeam}</option>
            </select>
          </div>
          {favoriteFailed && <p role="alert" className="text-sm text-red-300">{t.favoriteFailed}</p>}
          {list.length ? (
            <ul className="flex flex-wrap justify-center gap-6 sm:justify-start">
              {list.slice(0, limit).map((player) => {
                const fav = favoriteIds.has(player.id);
                return (
                  <li key={player.id} className="relative">
                    <Card player={player} variant="medium" onOpen={() => onOpenCard(player.id)} />
                    {owner ? (
                      <button type="button" aria-pressed={fav} disabled={busy === player.id} onClick={() => toggleFavorite(player.id)}
                        aria-label={fav ? t.removeFavorite(player.name) : t.addFavorite(player.name)} title={fav ? t.removeFavorite(player.name) : t.addFavorite(player.name)}
                        className={`absolute top-2 right-2 z-20 flex size-11 cursor-pointer items-center justify-center rounded-full bg-dl-black/80 shadow-lg backdrop-blur-sm transition-transform hover:scale-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-100 active:scale-95 disabled:cursor-wait disabled:opacity-60 motion-reduce:transition-none sm:size-9 ${fav ? "text-amber-300" : "text-zinc-300 hover:text-white"}`}>
                        <Icon name="star" className={`size-5 ${fav ? "fill-current" : ""}`} />
                      </button>
                    ) : fav && (
                      <span role="img" aria-label={t.favorites} className="absolute top-2 right-2 z-20 flex size-9 items-center justify-center rounded-full bg-dl-black/80 text-amber-300">
                        <Icon name="star" className="size-5 fill-current" />
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : <p role="status" className="text-sm text-zinc-400">{t.noResults}</p>}
          {list.length > limit && (
            <button type="button" onClick={() => setLimit((l) => l + PAGE)} className={`${primaryBtn} self-center`}>{t.more(list.length - limit)}</button>
          )}
        </>
      ) : <p className="text-sm text-zinc-400">{t.noCards}</p>}
    </section>
  );
}

function ProfileEditor({ onSaved, onCancel }: { onSaved: (card: ProfileCard) => void; onCancel: () => void }) {
  const t = useT(S);
  const locale = useLocale();
  const { me, heroNames } = useData();
  const [state, setState] = useState<ProfileCardState>();
  const [draft, setDraft] = useState<ProfileCard>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Issue>();

  useEffect(() => {
    const controller = new AbortController();
    profileRequest<ProfileCardState>(PROFILE_CARD_PATH, { signal: controller.signal })
      .then(setState)
      .catch((e) => { if (!controller.signal.aborted) setError(issueOf(e)); });
    return () => controller.abort();
  }, []);

  const current = state?.history[0];
  const card = draft ?? current?.card ?? (state && {
    name: (me?.name ?? "").slice(0, PROFILE_NAME_MAX),
    hero: heroNames[0] ?? "Abrams",
    stats: { MIR: 50, MAC: 50, SUP: 50, MOV: 50, POL: 50, CON: 50 },
  });
  const dirty = !!card && JSON.stringify(card) !== JSON.stringify(current?.card);
  const date = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" });
  const update = (patch: Partial<ProfileCard>) => { if (card) setDraft({ ...card, ...patch }); };

  const save = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!card) return;
    setError(undefined);
    setBusy(true);
    try {
      const next = await profileRequest<ProfileCardState>(PROFILE_CARD_PATH, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...card, name: card.name.trim() }),
      });
      onSaved(next.history[0].card);
    } catch (err) {
      setError(issueOf(err));
    } finally {
      setBusy(false);
    }
  };

  if (!card) return error
    ? <p role="alert" className="text-sm text-red-300">{t[error]}</p>
    : <p role="status" className="text-sm text-zinc-400">{t.loading}</p>;

  return (
    <div className="noir-glass flex min-w-0 flex-col items-center gap-5 rounded-2xl p-3 sm:p-6 md:flex-row md:items-start">
      <Card player={profilePlayer(card)} />
      <div className="flex w-full min-w-0 flex-1 flex-col gap-5">
        <form onSubmit={save} className="flex flex-col gap-4">
          <p className="text-sm text-zinc-400">{t.hint}</p>
          <div className="flex flex-wrap gap-3">
            <label className="flex min-w-0 flex-1 basis-48 flex-col gap-1.5 text-sm font-semibold text-zinc-100">
              {t.name}
              <input value={card.name} onChange={(e) => update({ name: e.target.value })} maxLength={PROFILE_NAME_MAX} required
                autoComplete="off" disabled={busy} className={`${field} disabled:opacity-60`} />
            </label>
            <label className="flex min-w-0 flex-1 basis-40 flex-col gap-1.5 text-sm font-semibold text-zinc-100">
              {t.hero}
              <select value={card.hero} onChange={(e) => update({ hero: e.target.value })} disabled={busy} className={`${field} disabled:opacity-60`}>
                {!heroNames.includes(card.hero) && <option value={card.hero}>{card.hero}</option>}
                {heroNames.map((h) => <option key={h} value={h}>{h}</option>)}
              </select>
            </label>
          </div>
          <fieldset className="flex flex-col gap-3" disabled={busy}>
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
            <button type="submit" disabled={busy || !dirty} className={primaryBtn}>{busy ? t.saving : t.save}</button>
            <button type="button" disabled={busy} onClick={onCancel} className={`${pill(false)} disabled:opacity-50`}>{t.cancel}</button>
            {current && dirty && <p role="status" className="text-sm text-amber-200">{t.unsaved}</p>}
          </div>
          {error && <p role="alert" className="text-sm text-red-300">{t[error]}</p>}
        </form>

        {!!state?.history.length && (
          <div className="flex w-full flex-col gap-2">
            <h2 className="text-sm font-bold text-zinc-100">{t.history}</h2>
            <ol className="flex flex-col gap-2">
              {state.history.map(({ id, updatedAt, card: version }) => (
                <li key={id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-lg bg-zinc-900/70 p-3 text-sm text-zinc-300">
                  <time dateTime={new Date(updatedAt).toISOString()} className="font-semibold text-zinc-100">{date.format(updatedAt)}</time>
                  <span>{version.hero} · OVR {calculateOVR(version.stats)}</span>
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>
    </div>
  );
}
