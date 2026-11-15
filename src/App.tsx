import { motion } from "motion/react";

export default function App() {
  return (
    <main className="min-h-dvh bg-neutral-950 text-neutral-100 flex items-center justify-center px-4">
      <motion.h1
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="text-4xl font-semibold tracking-tight"
      >
        DEADLOCK CARDS
      </motion.h1>
    </main>
  );
}
