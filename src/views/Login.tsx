import { motion } from "motion/react";
import { createAuthClient } from "better-auth/client";
import { useData } from "../lib/data";

const auth = createAuthClient();

export function Login() {
  const { me } = useData();
  return (
    <div className="min-h-dvh flex items-center justify-center p-4">
      <motion.div
        className="noir-glass-strong rounded-3xl p-8 w-full max-w-sm text-center space-y-6"
        initial={{ opacity: 0, y: 24, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: "spring", stiffness: 240, damping: 22 }}
      >
        <h1 className="text-xl font-extrabold uppercase tracking-[0.18em] text-zinc-100">Deadlock Cards</h1>
        {!me ? (
          <button
            type="button"
            onClick={() => auth.signIn.social({ provider: "twitch", callbackURL: "/login" })}
            className="w-full py-3 rounded-xl font-bold uppercase tracking-wider text-sm text-white bg-[#9146ff] hover:bg-[#a970ff] shadow-[0_0_24px_rgba(145,70,255,0.45)] transition cursor-pointer"
          >
            Entrar com Twitch
          </button>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-center gap-3">
              {me.image && <img src={me.image} alt="" className="w-10 h-10 rounded-full" />}
              <span className="font-bold text-zinc-100">{me.name}</span>
            </div>
            <p className={`text-sm ${me.admin ? "text-emerald-300" : "text-red-300"}`}>
              {me.admin ? "Acesso de editor liberado." : "Esta conta não tem acesso de editor."}
            </p>
            {me.admin && (
              <a href="/" className="block w-full py-3 rounded-xl font-bold uppercase tracking-wider text-sm bg-zinc-100 text-zinc-950 hover:bg-white transition">
                Abrir site
              </a>
            )}
            <button
              type="button"
              onClick={() => auth.signOut().then(() => location.reload())}
              className="w-full py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider border border-zinc-200/20 text-zinc-300 hover:text-white cursor-pointer"
            >
              Sair
            </button>
          </div>
        )}
      </motion.div>
    </div>
  );
}
