"use client";

import * as React from "react";
import { Check, X } from "lucide-react";
import { cn } from "@/lib/utils";

/** I tre stati di un appello: da segnare, presente, assente. */
export type Mark = "present" | "absent" | null;

export const nextMark = (mark: Mark): Mark => (mark === null ? "present" : mark === "present" ? "absent" : null);

/**
 * Il controllo a tre stati: un anello vuoto (da segnare), verde con la spunta
 * (presente), rosso con la croce (assente). E una casella con un nome —
 * `Presente: {nome}` — perche qui si segnano le presenze di un minore, e chi
 * legge con lo schermo deve sapere di chi e.
 *
 * Uno solo, per gli atleti e per le persone in prova: due stesure dello
 * stesso anello sono due modi di divergere (revisione ostile ADR-0187, M9).
 */
export function MarkControl({
  mark,
  name,
  onCycle,
  label = "Presente",
}: {
  mark: Mark;
  name: string;
  onCycle: () => void;
  /** L'occhiello del nome accessibile: «Presente» o «Presente in prova». */
  label?: string;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={mark === "present" ? true : mark === "absent" ? false : "mixed"}
      aria-label={`${label}: ${name}`}
      onClick={onCycle}
      className={cn(
        "inline-flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-egw-pill border-[1.5px] transition-colors duration-hover focus-visible:outline-none focus-visible:shadow-egw-focus",
        mark === "present" && "border-egw-green bg-egw-tint-green text-egw-green",
        mark === "absent" && "border-egw-red bg-egw-tint-red text-egw-red",
        mark === null && "border-[rgba(11,26,58,.2)] bg-white text-transparent hover:border-[rgba(37,99,235,.32)]",
      )}
    >
      {mark === "present" ? <Check className="h-4 w-4" aria-hidden /> : mark === "absent" ? <X className="h-4 w-4" aria-hidden /> : null}
    </button>
  );
}
