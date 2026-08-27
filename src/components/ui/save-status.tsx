"use client";

import React from "react";
import { Check, Loader2, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

export type SaveState = "idle" | "saving" | "saved" | "error";

/** Quanto resta a schermo la conferma di un salvataggio riuscito. */
const SAVED_VISIBLE_MS = 2500;

/**
 * Stato di un salvataggio automatico.
 *
 * **Prima**: diceva «Salvato automaticamente» anche prima che fosse stato
 * salvato qualcosa, e non distingueva un errore da un successo. I quattro
 * stati sono distinti da allora.
 *
 * **Da RC Fix 1**: l'indicatore e **discreto e temporaneo**. A riposo non
 * disegna niente. Il riquadro fisso che annunciava il salvataggio automatico
 * era rumore permanente su una pagina in cui l'autosave e ormai il
 * comportamento normale, non una novita. «Salvato» sparisce da solo dopo
 * qualche secondo; «Salvo» e l'errore restano finche la situazione dura,
 * perche sono le uniche due cose che chi guarda deve davvero sapere.
 *
 * L'errore puo portare un messaggio proprio: «l'IBAN non e ancora completo»
 * dice cosa fare, «non salvato» no.
 */
export function SaveStatus({
  state,
  savedAt,
  message,
  className,
}: {
  state: SaveState;
  savedAt?: Date | null;
  /** Motivo dell'errore, quando si conosce. */
  message?: string | null;
  className?: string;
}) {
  const [savedVisible, setSavedVisible] = React.useState(false);

  React.useEffect(() => {
    if (state !== "saved") {
      setSavedVisible(false);
      return;
    }

    setSavedVisible(true);
    const timer = setTimeout(() => setSavedVisible(false), SAVED_VISIBLE_MS);
    return () => clearTimeout(timer);
    // `savedAt` cambia a ogni scrittura: e cio che fa ripartire l'attesa
    // quando due salvataggi si susseguono.
  }, [state, savedAt]);

  const time = savedAt
    ? savedAt.toLocaleTimeString("it-IT", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  const content =
    state === "saving"
      ? {
          icon: <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />,
          label: "Salvataggio...",
          tone: "text-slate-500",
        }
      : state === "saved" && savedVisible
        ? {
            icon: <Check className="h-3.5 w-3.5" aria-hidden />,
            label: time ? `Salvato alle ${time}` : "Salvato",
            tone: "text-emerald-700",
          }
        : state === "error"
          ? {
              icon: <TriangleAlert className="h-3.5 w-3.5" aria-hidden />,
              label: message || "Non salvato: riprova a modificare",
              tone: "text-red-700",
            }
          : null;

  /*
    Il contenitore resta montato anche quando non mostra nulla: uno
    `aria-live` che compare e scompare dal DOM non viene annunciato.
  */
  return (
    <span
      role="status"
      aria-live="polite"
      className={cn(
        "inline-flex items-center gap-1.5 text-xs",
        content?.tone,
        className,
      )}
    >
      {content ? (
        <>
          {content.icon}
          <span className={state === "saved" ? "eg-tabular" : undefined}>
            {content.label}
          </span>
        </>
      ) : null}
    </span>
  );
}
