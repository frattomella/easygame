"use client";

import { Check, Loader2, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

export type SaveState = "idle" | "saving" | "saved" | "error";

/**
 * Stato di un salvataggio automatico.
 *
 * Prima l'indicatore diceva "Salvato automaticamente" anche prima che fosse
 * stato salvato qualcosa, e non distingueva un errore da un successo. Qui i
 * quattro stati sono distinti, l'ora dell'ultimo salvataggio e visibile e il
 * cambiamento viene annunciato agli screen reader senza rubare il fuoco.
 */
export function SaveStatus({
  state,
  savedAt,
  className,
}: {
  state: SaveState;
  savedAt?: Date | null;
  className?: string;
}) {
  const time = savedAt
    ? savedAt.toLocaleTimeString("it-IT", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  const content = {
    idle: {
      icon: null,
      label: "Le modifiche si salvano da sole",
      tone: "text-slate-500",
    },
    saving: {
      icon: <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />,
      label: "Salvo",
      tone: "text-slate-600",
    },
    saved: {
      icon: <Check className="h-3.5 w-3.5" aria-hidden />,
      label: time ? `Salvato alle ${time}` : "Salvato",
      tone: "text-emerald-700",
    },
    error: {
      icon: <TriangleAlert className="h-3.5 w-3.5" aria-hidden />,
      label: "Non salvato: riprova a modificare",
      tone: "text-red-700",
    },
  }[state];

  return (
    <span
      role="status"
      aria-live="polite"
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs",
        content.tone,
        className,
      )}
    >
      {content.icon}
      <span className={state === "saved" ? "eg-tabular" : undefined}>
        {content.label}
      </span>
    </span>
  );
}
