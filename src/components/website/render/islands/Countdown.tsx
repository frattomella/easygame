"use client";

import { useEffect, useState } from "react";

/**
 * Il conto alla rovescia di una gara. Il server ne disegna gia la data; qui
 * si aggiungono giorni, ore e minuti, aggiornati una volta al minuto (non al
 * secondo: un numero che cambia di continuo distrae e non serve a nessuno).
 */
export function Countdown({ target, tone = "inherit" }: { target: string; tone?: "inherit" | "light" }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  if (now === null) return null;
  const diff = new Date(target).getTime() - now;
  if (!Number.isFinite(diff) || diff <= 0) return null;
  const days = Math.floor(diff / 86_400_000);
  const hours = Math.floor((diff % 86_400_000) / 3_600_000);
  const minutes = Math.floor((diff % 3_600_000) / 60_000);
  const cell = (value: number, label: string) => (
    <div className="min-w-[4rem] rounded-ws bg-black/20 px-3 py-2 text-center">
      <div className="font-heading text-2xl font-bold tabular-nums">{String(value).padStart(2, "0")}</div>
      <div className="text-xs uppercase tracking-wider opacity-80">{label}</div>
    </div>
  );
  return (
    <div className={`flex gap-2 ${tone === "light" ? "text-white" : ""}`} aria-label={`Mancano ${days} giorni, ${hours} ore e ${minutes} minuti`} role="timer">
      {cell(days, "giorni")}
      {cell(hours, "ore")}
      {cell(minutes, "minuti")}
    </div>
  );
}
