import { useState } from "react";
import { startLink, type LinkProvider } from "../lib/authClient";
import { useData } from "../lib/data";
import { strings, useT } from "../lib/i18n";
import { pageTitle, pill } from "../lib/ui";

const S = strings({
  pt: {
    title: "Configurações", accounts: "Contas vinculadas", linked: "vinculada", linking: "Abrindo login…", link: (p: string) => `Vincular ${p}`,
    accountsHint: "Seu @ vem da Twitch ou do canal do YouTube. Se a outra conta já tiver um perfil aqui, as cartas dela vêm para este perfil.",
    linkFailed: "Não foi possível iniciar a vinculação.",
  },
  en: {
    title: "Settings", accounts: "Linked accounts", linked: "linked", linking: "Opening sign-in…", link: (p: string) => `Link ${p}`,
    accountsHint: "Your @ comes from Twitch or your YouTube channel. If the other account already has a profile here, its cards move to this profile.",
    linkFailed: "Could not start linking.",
  },
  es: {
    title: "Configuración", accounts: "Cuentas vinculadas", linked: "vinculada", linking: "Abriendo inicio de sesión…", link: (p: string) => `Vincular ${p}`,
    accountsHint: "Tu @ viene de Twitch o de tu canal de YouTube. Si la otra cuenta ya tiene un perfil aquí, sus cartas pasan a este perfil.",
    linkFailed: "No se pudo iniciar la vinculación.",
  },
});

const PROVIDERS: { id: LinkProvider; label: string }[] = [{ id: "twitch", label: "Twitch" }, { id: "google", label: "YouTube" }];

export function Settings() {
  const t = useT(S);
  const { me } = useData();
  const providers = me?.providers ?? [];
  const [busy, setBusy] = useState<LinkProvider>();
  const [failed, setFailed] = useState(false);
  const link = (provider: LinkProvider) => {
    setBusy(provider);
    setFailed(false);
    startLink(provider).catch(() => { setFailed(true); setBusy(undefined); });
  };
  return (
    <section aria-labelledby="settings-title" className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <h1 id="settings-title" className={pageTitle}>{t.title}</h1>
      <section aria-labelledby="settings-accounts-title" className="noir-glass flex flex-col gap-3 rounded-2xl p-4 sm:p-6">
        <h2 id="settings-accounts-title" className="font-display text-lg font-black text-dl-text">{t.accounts}</h2>
        <p className="text-sm text-zinc-400">{t.accountsHint}</p>
        <ul className="flex flex-wrap gap-2">
          {PROVIDERS.map(({ id, label }) => (
            <li key={id}>
              {providers.includes(id)
                ? <span className="inline-flex min-h-11 items-center rounded-lg bg-zinc-900/70 px-4 text-sm font-semibold text-zinc-100 sm:min-h-9">{label} · {t.linked}</span>
                : <button type="button" disabled={!!busy} onClick={() => link(id)} className={`${pill(false)} disabled:cursor-wait disabled:opacity-60`}>
                    {busy === id ? t.linking : t.link(label)}
                  </button>}
            </li>
          ))}
        </ul>
        {failed && <p role="alert" className="text-sm text-red-300">{t.linkFailed}</p>}
      </section>
    </section>
  );
}
