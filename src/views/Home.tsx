import { motion } from "motion/react";
import { useMemo, useState } from "react";
import { useData } from "../lib/data";
import { regionClass, teamOvr, teamTrend, tierKeyForOvr } from "../lib/cards";
import { RegionBackdrop } from "../components/RegionBackdrop";
import { TeamLogo } from "../components/TeamLogo";

export function Home({ onOpenTeam }: { onOpenTeam: (teamId: string) => void }) {
  const { teams, players, settings, heroNames, heroArt } = useData();
  const slides = useMemo(() => {
    const list = heroNames.flatMap((n) => {
      const url = heroArt(n)?.url;
      return url ? [{ name: n, url }] : [];
    });
    return settings.homeHero ? [{ name: "", url: settings.homeHero }, ...list] : list;
  }, [heroNames, heroArt, settings.homeHero]);
  const [heroIdx, setHeroIdx] = useState(0);
  const slide = slides[heroIdx % Math.max(1, slides.length)];
  const hero = slide?.name;
  const homeImg = slide?.url;
  const step = (d: number) => setHeroIdx((i) => (i + d + slides.length) % slides.length);

  const ranked = teams
    .map((team) => ({ team, ...teamOvr(players, team.id), delta: teamTrend(players, team.id) }))
    .sort((a, b) => b.exact - a.exact || a.team.name.localeCompare(b.team.name));

  return (
    <section className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8 items-start">
      <div className="home-col home-hero-box noir-glass rounded-2xl overflow-hidden relative">
        {homeImg && (
          <motion.img
            key={homeImg}
            src={homeImg}
            alt={hero ?? "Herói em destaque"}
            draggable={false}
            initial={{ opacity: 0, scale: 1.04 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
            className="absolute inset-0 w-full h-full object-cover object-center select-none"
          />
        )}
        <div className="absolute inset-x-0 bottom-0 h-1/3 pointer-events-none" style={{ background: "linear-gradient(to top, rgba(9,9,11,0.55), transparent)" }} />
        {slides.length > 1 && (
          <>
            <button type="button" className="home-hero-arrow home-hero-arrow--l" onClick={() => step(-1)} aria-label="Herói anterior">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M15 5l-7 7 7 7" /></svg>
            </button>
            <button type="button" className="home-hero-arrow home-hero-arrow--r" onClick={() => step(1)} aria-label="Próximo herói">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M9 5l7 7-7 7" /></svg>
            </button>
          </>
        )}
        {hero && <div className="home-hero-tag">{hero}</div>}
      </div>

      <div className="home-col home-teams-scroll flex flex-col gap-3.5" style={{ "--ft": "0px", "--fb": "120px" } as React.CSSProperties}>
        {ranked.length === 0 && <div className="noir-glass rounded-2xl p-6 text-sm text-zinc-300">Nenhum time cadastrado ainda.</div>}
        {ranked.map((r, idx) => {
          const tier = r.count ? settings.tierConfig!.find((t) => t.key === tierKeyForOvr(r.rounded, settings.tierConfig!)) : undefined;
          return (
            <motion.button
              key={r.team.id}
              type="button"
              onClick={() => onOpenTeam(r.team.id)}
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: idx * 0.05, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
              whileHover={{ y: -2 }}
              className={`home-team-box noir-glass team-region-card ${regionClass(r.team.region)} relative overflow-hidden rounded-2xl px-4 sm:px-5 flex items-center gap-3.5 sm:gap-5 cursor-pointer text-left hover:border-white`}
            >
              <RegionBackdrop region={r.team.region} />
              <span className="relative z-10 w-9 shrink-0 text-center text-xl sm:text-2xl font-black text-zinc-300">#{idx + 1}</span>
              <div className="team-logo-frame relative z-10 w-14 h-14 sm:w-16 sm:h-16"><TeamLogo team={r.team} /></div>
              <div className="relative z-10 min-w-0 flex-1">
                <div className="text-lg sm:text-2xl font-extrabold uppercase tracking-wider text-zinc-100 truncate leading-tight">{r.team.name}</div>
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] font-bold uppercase tracking-wider text-zinc-300">
                  <span>{r.team.tag}</span><span className="text-zinc-500">•</span><span>{r.team.region}</span><span className="text-zinc-500">•</span><span>{r.count} jogador(es)</span>
                </div>
              </div>
              <div className="relative z-10 shrink-0 flex flex-col items-center gap-1">
                <div className="team-ovr-chip team-ovr-chip--stack">
                  <span className="team-ovr-num">{r.count ? r.rounded : "--"}</span>
                  <span className="team-ovr-lbl">OVR</span>
                </div>
                <div className="flex items-center gap-1.5">
                  {tier && <span className="px-2 py-0.5 rounded-md text-[11px] font-black border border-black/25" style={{ background: tier.bg, color: tier.text }}>{tier.key}</span>}
                  {r.delta > 0 && <span className="text-[11px] font-extrabold text-emerald-300">▲ +{r.delta}</span>}
                  {r.delta < 0 && <span className="text-[11px] font-extrabold text-red-300">▼ {r.delta}</span>}
                </div>
              </div>
            </motion.button>
          );
        })}
      </div>
    </section>
  );
}
