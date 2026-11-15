import { motion } from "motion/react";
import { useEffect } from "react";
import { useData } from "../lib/data";
import { formatDateBR, getPlayerHistory, getPlayerTrend, isMainCard, teamOf } from "../lib/cards";
import { getCardTier } from "../lib/rarity";
import { Card } from "./Card";
import { TrendBadge } from "./TrendBadge";

export function Spotlight({ playerId, onClose, onSwitch }: { playerId: string; onClose: () => void; onSwitch: (id: string) => void }) {
  const { teams, players, settings } = useData();
  const player = players.find((p) => p.id === playerId);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!player) return null;
  const team = teamOf(teams, player);
  const tier = getCardTier(player, settings.tierConfig!);
  const history = getPlayerHistory(player);
  const groupKey = player.variantOf || player.id;
  const versions = players.filter((p) => p.id === groupKey || p.variantOf === groupKey);

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Carta de ${player.name}`}
    >
      <motion.div
        className="noir-glass-strong rounded-3xl p-5 sm:p-8 max-w-4xl w-full max-h-[92dvh] overflow-y-auto flex flex-col md:flex-row gap-8 items-center md:items-start"
        initial={{ scale: 0.8, y: 30, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        exit={{ scale: 0.9, y: 20, opacity: 0 }}
        transition={{ type: "spring", stiffness: 260, damping: 22 }}
        onClick={(e) => e.stopPropagation()}
      >
        <motion.div key={player.id} initial={{ rotateY: -90, opacity: 0 }} animate={{ rotateY: 0, opacity: 1 }} transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }} style={{ transformPerspective: 1200 }}>
          <Card player={player} variant="editor" />
        </motion.div>

        <div className="flex-1 min-w-0 w-full space-y-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-3xl font-black uppercase tracking-[0.12em] text-white">{player.name}</h2>
              <p className="text-sm text-zinc-300 mt-1">{team.name} ({team.tag}) • {player.position} • {player.hero}</p>
            </div>
            <button type="button" onClick={onClose} aria-label="Fechar" className="w-9 h-9 rounded-full bg-zinc-900/80 border border-zinc-200/20 text-zinc-300 hover:text-white cursor-pointer">✕</button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="rk-chip" style={{ color: tier.c, borderColor: tier.c }}>{tier.custom ? "Especial" : tier.name}</span>
            <TrendBadge delta={getPlayerTrend(player)} size="editor" />
            {player.special && player.specialText && <span className="text-xs text-amber-200 font-bold">✦ {player.specialText}</span>}
          </div>

          <div>
            <h3 className="text-[11px] font-bold uppercase tracking-[0.2em] text-zinc-400 mb-2">Histórico de OVR</h3>
            <HistoryChart points={history} color={tier.c} />
          </div>

          {versions.length > 1 && (
            <div>
              <h3 className="text-[11px] font-bold uppercase tracking-[0.2em] text-zinc-400 mb-2">Versões ({versions.length})</h3>
              <div className="flex flex-wrap gap-2">
                {versions.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => onSwitch(v.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold border cursor-pointer ${v.id === player.id ? "bg-zinc-100 text-zinc-950 border-white" : "bg-zinc-900/70 text-zinc-300 border-zinc-200/15 hover:text-white"}`}
                  >
                    {isMainCard(v) ? "Principal" : v.special ? "Especial" : "Versão"} • {teamOf(teams, v).tag}
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
  const W = 420, H = 140, P = 24;
  const vals = points.map((p) => p.ovr);
  const min = Math.min(...vals) - 2, max = Math.max(...vals) + 2;
  const x = (i: number) => (points.length === 1 ? W / 2 : P + (i * (W - 2 * P)) / (points.length - 1));
  const y = (v: number) => H - P - ((v - min) / Math.max(1, max - min)) * (H - 2 * P);
  const d = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.ovr).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto rounded-xl bg-black/40 border border-zinc-200/10">
      <motion.path d={d} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.9, ease: "easeOut" }} style={{ filter: `drop-shadow(0 0 6px ${color})` }} />
      {points.map((p, i) => (
        <g key={i}>
          <circle cx={x(i)} cy={y(p.ovr)} r="4" fill="#09090b" stroke={color} strokeWidth="2" />
          <text x={x(i)} y={y(p.ovr) - 9} textAnchor="middle" fontSize="11" fontWeight="800" fill="#f4f4f5">{p.ovr}</text>
          <text x={x(i)} y={H - 6} textAnchor="middle" fontSize="9" fill="#a1a1aa">{formatDateBR(p.date).slice(0, 5)}</text>
        </g>
      ))}
    </svg>
  );
}
