import { useState, type RefObject } from "react";
import { strings, useT } from "../lib/i18n";

const S = strings({
  pt: { export: "Exportar PNG", saving: "Exportando…", error: "Não foi possível exportar a carta. Tente de novo." },
  en: { export: "Export PNG", saving: "Exporting…", error: "Could not export the card. Try again." },
  es: { export: "Exportar PNG", saving: "Exportando…", error: "No se pudo exportar la carta. Inténtalo de nuevo." },
});

export function CardExportButton({ cardRef, name, disabled }: { cardRef: RefObject<HTMLDivElement | null>; name: string; disabled?: boolean }) {
  const t = useT(S);
  const [exporting, setExporting] = useState(false);
  const [failed, setFailed] = useState(false);

  const download = async () => {
    const card = cardRef.current?.querySelector<HTMLElement>(".rk-wrap");
    if (!card) return;
    setExporting(true);
    setFailed(false);
    try {
      const { toBlob } = await import("html-to-image");
      await document.fonts.ready;
      const blob = await toBlob(card, {
        pixelRatio: 2,
        style: { transform: "none", filter: "none" },
        filter: (node) => !(node instanceof Element && node.matches(".rk-particles, .rk-glint, .sp-card-fx, .card-hover-overlay")),
      });
      if (!blob?.size) throw new Error("Empty PNG");
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `deadcards-${name.trim().replace(/[^\p{L}\p{N}_-]+/gu, "-").slice(0, 80) || "card"}.png`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setFailed(true);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="flex flex-col items-start gap-2">
      <button
        type="button"
        onClick={download}
        disabled={exporting || disabled}
        className="min-h-11 cursor-pointer rounded-lg bg-zinc-800 px-3 text-xs font-bold text-zinc-100 hover:bg-zinc-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-100 active:bg-zinc-600 disabled:cursor-wait disabled:opacity-60"
      >
        {exporting ? t.saving : t.export}
      </button>
      {failed && <p role="alert" className="text-xs text-red-300">{t.error}</p>}
    </div>
  );
}
