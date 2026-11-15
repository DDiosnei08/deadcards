import { useEffect, useState, type FormEvent } from "react";
import { call, useData } from "../lib/data";
import { Card } from "../components/Card";
import { SignInOptions } from "./Login";

export function Redeem({ onOpenCard }: { onOpenCard: (id: string) => void }) {
  const { me, players } = useData();
  const [owned, setOwned] = useState<string[]>([]);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (!me) return;
    fetch("/api/collection").then((r) => (r.ok ? (r.json() as Promise<string[]>) : [])).then(setOwned).catch(() => setOwned([]));
  }, [me]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const body = await call("/api/redeem", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code }) });
      const id = body.playerId!;
      setOwned((o) => [...o, id]);
      setCode("");
      setMsg({ ok: true, text: `Carta resgatada: ${players.find((p) => p.id === id)?.name ?? id}` });
    } catch (err) {
      setMsg({ ok: false, text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const cards = players.filter((p) => owned.includes(p.id));
  const field = "px-3 py-2 rounded-xl bg-zinc-900/80 border border-zinc-200/15 text-sm text-zinc-100 uppercase tracking-[0.2em] placeholder:text-zinc-500 placeholder:normal-case placeholder:tracking-normal";

  return (
    <section className="space-y-5">
      <div className="noir-glass rounded-2xl p-5 sm:p-7 space-y-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold uppercase tracking-[0.11em] text-zinc-100">Resgatar</h1>
          <p className="text-xs text-zinc-400 mt-1.5">{me ? `${cards.length} carta(s) na sua coleção` : "Entre para resgatar cartas com um código."}</p>
        </div>
        {!me ? (
          <div className="max-w-sm"><SignInOptions /></div>
        ) : (
          <form onSubmit={submit} className="flex flex-wrap gap-2 items-center">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Código"
              aria-label="Código de resgate"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              required
              className={`${field} w-56`}
            />
            <button type="submit" disabled={busy} className="px-5 py-2.5 rounded-xl bg-zinc-100 text-zinc-950 text-xs font-extrabold uppercase tracking-wider cursor-pointer disabled:opacity-50">
              {busy ? "Resgatando…" : "Resgatar"}
            </button>
            {msg && <p role="status" className={`text-xs ${msg.ok ? "text-emerald-300" : "text-red-300"}`}>{msg.text}</p>}
          </form>
        )}
      </div>

      {me && (
        <div className="flex flex-wrap justify-center sm:justify-start gap-6">
          {cards.map((p) => (
            <Card key={p.id} player={p} variant="medium" onOpen={() => onOpenCard(p.id)} />
          ))}
        </div>
      )}
    </section>
  );
}
