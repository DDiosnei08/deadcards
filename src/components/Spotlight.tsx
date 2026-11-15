import { motion } from "motion/react";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import gsap from "gsap";
import { SplitText } from "gsap/SplitText";
import { useData } from "../lib/data";
import { strings, useLocale, useT } from "../lib/i18n";
import { getPlayerHistory, getPlayerOvr, getPlayerTrend, isMainCard, teamOf, useLabel } from "../lib/cards";
import { getCardTier } from "../lib/rarity";
import { Card } from "./Card";
import { TrendBadge } from "./TrendBadge";
import { Icon } from "./Icon";
import { pill } from "../lib/ui";

gsap.registerPlugin(SplitText);
const revealed = new Set<string>();

const S = strings({
  pt: { cardOf: (name: string) => `Carta de ${name}`, close: "Fechar", special: "Especial", edit: "Editar carta", history: "Histórico de OVR", versions: "Versões", main: "Principal", version: "Versão" },
  en: { cardOf: (name: string) => `${name}'s card`, close: "Close", special: "Special", edit: "Edit card", history: "OVR history", versions: "Versions", main: "Main", version: "Version" },
  es: { cardOf: (name: string) => `Carta de ${name}`, close: "Cerrar", special: "Especial", edit: "Editar carta", history: "Historial de OVR", versions: "Versiones", main: "Principal", version: "Versión" },
});

export function Spotlight({ playerId, onClose, onSwitch, onEdit }: { playerId: string; onClose: () => void; onSwitch: (id: string) => void; onEdit?: (id: string) => void }) {
  const t = useT(S);
  const label = useLabel();
  const { teams, players, settings } = useData();
  const player = players.find((p) => p.id === playerId);
  const cardRef = useRef<HTMLDivElement>(null);
  const flashRef = useRef<HTMLDivElement>(null);
  const nameRef = useRef<HTMLSpanElement>(null);
  const tier = player ? getCardTier(player, settings.tierConfig!) : null;
  const ovr = player ? getPlayerOvr(player) : 0;
  const reveal = useMemo(
    () => !!tier && !revealed.has(playerId) && (tier.lvl >= 3 || !!tier.custom) && !matchMedia("(prefers-reduced-motion: reduce)").matches,
    [playerId], // eslint-disable-line react-hooks/exhaustive-deps
  );

  useLayoutEffect(() => {
    if (!reveal || !cardRef.current) return;
    revealed.add(playerId);
    const ovrEl = cardRef.current.querySelector("[data-ovr]")?.firstChild;
    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ delay: 0.12 });
      tl.fromTo(flashRef.current, { opacity: 0, scale: 0.5 }, { opacity: 0.9, scale: 1.1, duration: 0.25, ease: "power2.out" })
        .to(flashRef.current, { opacity: 0, scale: 1.35, duration: 0.5, ease: "power2.in" });
      tl.from(cardRef.current, { y: 40, scale: 0.85, opacity: 0, duration: 0.6, ease: "back.out(1.6)", clearProps: "transform,opacity" }, 0.05);
      if (ovrEl) {
        const n = { v: 0 };
        ovrEl.nodeValue = "0";
        tl.to(n, { v: ovr, duration: 0.5, ease: "power2.out", onUpdate: () => { ovrEl.nodeValue = String(Math.round(n.v)); } }, 0.3);
      }
      if (nameRef.current) {
        const split = SplitText.create(nameRef.current, { type: "chars" });
        tl.from(split.chars, { opacity: 0, y: 12, duration: 0.3, stagger: 0.025, ease: "power2.out" }, 0.4);
      }
    });
    return () => { ctx.revert(); if (ovrEl) ovrEl.nodeValue = String(ovr); };
  }, [reveal, playerId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!player) return null;
  const team = teamOf(teams, player);
  if (!tier) return null;
  const history = getPlayerHistory(player);
  const groupKey = player.variantOf || player.id;
  const versions = players.filter((p) => p.id === groupKey || p.variantOf === groupKey);

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-md"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={t.cardOf(player.name)}
    >
      <motion.div
        className="noir-glass-strong flex max-h-[92dvh] w-full max-w-4xl flex-col items-center gap-8 overflow-y-auto rounded-3xl p-4 sm:p-8 md:flex-row md:items-start"
        initial={{ scale: 0.8, y: 30, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        exit={{ scale: 0.9, y: 20, opacity: 0 }}
        transition={{ type: "spring", stiffness: 260, damping: 22 }}
        onClick={(e) => e.stopPropagation()}
      >
        <motion.div key={player.id} className="relative max-w-full" initial={reveal ? false : { rotateY: -90, opacity: 0 }} animate={{ rotateY: 0, opacity: 1 }} transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }} style={{ transformPerspective: 1200 }}>
          {reveal && (
            <div ref={flashRef} aria-hidden="true" className="pointer-events-none absolute -inset-16 rounded-full opacity-0" style={{ background: `radial-gradient(circle, ${tier.hi} 0%, ${tier.c}99 30%, transparent 68%)` }} />
          )}
          <div ref={cardRef} className="relative">
            <Card player={player} variant="editor" />
          </div>
        </motion.div>

        <div className="w-full min-w-0 flex-1 space-y-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-display text-3xl font-black tracking-[0.12em] text-dl-text uppercase"><span ref={nameRef} key={player.id + player.name}>{player.name}</span></h2>
              <p className="mt-1 text-sm text-zinc-300">{label(team.name)} ({team.tag}) · {label(player.position || "Flex")} · {player.hero}</p>
            </div>
            <button type="button" onClick={onClose} aria-label={t.close} className="flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full bg-zinc-800/60 text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-100 sm:size-9"><Icon name="x" /></button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="rk-chip" style={{ color: tier.c, borderColor: tier.c }}>{tier.custom ? t.special : tier.name}</span>
            <TrendBadge delta={getPlayerTrend(player)} size="editor" />
            {onEdit && <button type="button" onClick={() => onEdit(player.id)} className={`${pill(true)} ml-auto hover:bg-white`}>{t.edit}</button>}
            {player.special && player.specialText && <span className="text-xs font-bold text-amber-200">✦ {player.specialText}</span>}
          </div>

          <div>
            <h3 className="mb-2 text-xs font-bold tracking-[0.2em] text-zinc-400 uppercase">{t.history}</h3>
            <HistoryChart points={history} color={tier.c} />
          </div>

          {versions.length > 1 && (
            <div>
              <h3 className="mb-2 text-xs font-bold tracking-[0.2em] text-zinc-400 uppercase">{t.versions} ({versions.length})</h3>
              <div className="flex flex-wrap gap-2">
                {versions.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => onSwitch(v.id)}
                    className={pill(v.id === player.id)}
                  >
                    {isMainCard(v) ? t.main : v.special ? t.special : t.version} · {teamOf(teams, v).tag}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

function HistoryChart({ points, color }: { points: { date: string; ovr: number }[]; color: string }) {
  const locale = useLocale();
  // Datas são ISO (YYYY-MM-DD); formata dia/mês na ordem do idioma, caindo no texto original se não for data válida.
  const short = (iso: string) => {
    const d = new Date(iso);
    return isNaN(+d) ? iso : d.toLocaleDateString(locale, { day: "2-digit", month: "2-digit", timeZone: "UTC" });
  };
  const W = 420, H = 160, P = 32;
  const vals = points.map((p) => p.ovr);
  const min = Math.min(...vals) - 2, max = Math.max(...vals) + 2;
  const x = (i: number) => (points.length === 1 ? W / 2 : P + (i * (W - 2 * P)) / (points.length - 1));
  const y = (v: number) => H - P - ((v - min) / Math.max(1, max - min)) * (H - 2 * P);
  const d = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.ovr).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full rounded-xl border border-zinc-200/10 bg-black/40">
      <motion.path d={d} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.9, ease: "easeOut" }} style={{ filter: `drop-shadow(0 0 6px ${color})` }} />
      {points.map((p, i) => (
        <g key={i}>
          <circle cx={x(i)} cy={y(p.ovr)} r="4" fill="#09090b" stroke={color} strokeWidth="2" />
          <text x={x(i)} y={y(p.ovr) - 12} textAnchor="middle" fontSize="16" fontWeight="800" fill="#f4f4f5">{p.ovr}</text>
          <text x={x(i)} y={H - 8} textAnchor="middle" fontSize="15" fill="#a1a1aa">{short(p.date)}</text>
        </g>
      ))}
    </svg>
  );
}
