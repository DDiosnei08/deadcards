import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { useState } from "react";
import { DataProvider, useData } from "./lib/data";
import { hexToRgba } from "./lib/cards";
import { Home } from "./views/Home";
import { Teams } from "./views/Teams";
import { TierList } from "./views/TierList";
import { Collection } from "./views/Collection";
import { Redeem } from "./views/Redeem";
import { Spotlight } from "./components/Spotlight";
import { Login } from "./views/Login";
import { Account } from "./components/Account";
import { Editor } from "./views/Editor";

type Tab = "home" | "teams" | "tierlist" | "collection" | "redeem" | "editor";
const TABS: { id: Exclude<Tab, "home">; label: string }[] = [
  { id: "teams", label: "Times" },
  { id: "tierlist", label: "Tier List" },
  { id: "collection", label: "Coleção" },
  { id: "redeem", label: "Resgatar" },
];

export default function App() {
  return (
    <MotionConfig reducedMotion="user">
      <DataProvider>
        {location.pathname === "/login" ? <><Background /><Login /></> : <Shell />}
      </DataProvider>
    </MotionConfig>
  );
}

function Background() {
  const { settings } = useData();
  const bg = settings.bg;
  if (!bg) return null;
  return (
    <div className="fixed inset-0 -z-10 pointer-events-none overflow-hidden" aria-hidden="true">
      {bg.imageUrl && (
        <div
          className="absolute -inset-6 bg-center bg-no-repeat"
          style={{ backgroundImage: `url("${bg.imageUrl}")`, backgroundSize: bg.size || "cover", opacity: bg.imageOpacity / 100, filter: `blur(${bg.blur}px)` }}
        />
      )}
      <div className="absolute inset-0" style={{ background: hexToRgba(bg.color, bg.overlayOpacity / 100) }} />
      <div className="absolute inset-0" style={{ background: "radial-gradient(circle at 50% 15%, rgba(255,255,255,0.03) 0%, rgba(9,9,11,0.72) 100%)" }} />
    </div>
  );
}

function Shell() {
  const [tab, setTab] = useState<Tab>("home");
  const [focusTeam, setFocusTeam] = useState<string>();
  const [spotlight, setSpotlight] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const { me } = useData();
  const tabs = me?.admin ? [...TABS, { id: "editor" as const, label: "Editor" }] : TABS;
  const openTeam = (id: string) => { setFocusTeam(id); setTab("teams"); };
  const editCard = (id: string) => { setSpotlight(null); setEditId(id); setTab("editor"); };

  return (
    <>
      <Background />
      <header className="sticky top-0 z-40 noir-glass border-b border-zinc-200/15">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 sm:h-20 flex items-center justify-between gap-3">
          <button type="button" onClick={() => setTab("home")} className="brand-badge shrink-0 px-4 py-2.5 sm:px-6 sm:py-3 rounded-xl flex items-center gap-3 text-left">
            <span className="w-2.5 h-2.5 rounded-full bg-zinc-100 shadow-[0_0_12px_rgba(255,255,255,0.9)]" />
            <span className="text-base sm:text-xl font-extrabold uppercase tracking-[0.18em] text-zinc-100"><span className="sm:hidden">DC</span><span className="hidden sm:inline">Deadlock Cards</span></span>
          </button>
          <nav className="relative ml-auto min-w-0 flex items-center gap-1.5 sm:gap-2.5 overflow-x-auto [scrollbar-width:none] py-1" aria-label="Navegação principal">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => { setFocusTeam(undefined); setTab(t.id); }}
                aria-current={tab === t.id ? "page" : undefined}
                className={`relative shrink-0 whitespace-nowrap px-3 py-2 sm:px-4 sm:py-2.5 rounded-xl text-xs sm:text-sm font-semibold tracking-wider uppercase cursor-pointer border transition-colors ${
                  tab === t.id ? "text-zinc-950 border-white" : "text-zinc-300 hover:text-white border-zinc-200/15 bg-zinc-900/60"
                }`}
              >
                {tab === t.id && <motion.span layoutId="nav-pill" className="absolute inset-0 rounded-xl bg-zinc-100 shadow-[0_0_18px_rgba(244,244,245,0.35)]" transition={{ type: "spring", stiffness: 380, damping: 30 }} />}
                <span className="relative">{t.label}</span>
              </button>
            ))}
          </nav>
          <div className="shrink-0"><Account /></div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10">
        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          >
            {tab === "home" && <Home onOpenTeam={openTeam} />}
            {tab === "teams" && <Teams focusTeamId={focusTeam} onOpenCard={setSpotlight} />}
            {tab === "tierlist" && <TierList onOpenCard={setSpotlight} onOpenTeam={openTeam} />}
            {tab === "collection" && <Collection onOpenCard={setSpotlight} />}
            {tab === "redeem" && <Redeem onOpenCard={setSpotlight} />}
            {tab === "editor" && me?.admin && <Editor editId={editId} onEditId={setEditId} />}          </motion.div>
        </AnimatePresence>
      </main>

      <AnimatePresence>
        {spotlight && <Spotlight key="spotlight" playerId={spotlight} onClose={() => setSpotlight(null)} onSwitch={setSpotlight} onEdit={me?.admin ? editCard : undefined} />}
      </AnimatePresence>
    </>
  );
}
