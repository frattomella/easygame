"use client";

import { DangerConfirmDialog } from "@/components/web/overlays/Modal";

/**
 * La conferma distruttiva di un'assegnazione (guideline 08 §8.9: un record,
 * modale rosso, cosa se ne va, nessuna conferma scritta). Sostituisce il
 * `window.confirm("Eliminare questa assegnazione e liberare lo stock
 * collegato?")` della V1; la frase resta come descrizione.
 */
export function DeleteAssignmentDialog({
  open,
  onOpenChange,
  athleteName,
  kitName,
  linkedStockCount,
  onConfirm,
  loading,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  athleteName: string;
  kitName: string;
  /** Quante righe di magazzino tornano disponibili. */
  linkedStockCount: number;
  onConfirm: () => void | Promise<void>;
  loading?: boolean;
}) {
  return (
    <DangerConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Eliminare l'assegnazione di ${athleteName}?`}
      description="Eliminare questa assegnazione e liberare lo stock collegato?"
      consequences={[
        `${kitName}: gli articoli assegnati e le consegne registrate`,
        linkedStockCount
          ? `${linkedStockCount} ${linkedStockCount === 1 ? "riga di magazzino torna disponibile" : "righe di magazzino tornano disponibili"}`
          : "Nessuno stock di magazzino collegato",
        "I numeri di maglia legati a questa assegnazione vengono liberati",
      ]}
      confirmLabel="Elimina"
      onConfirm={onConfirm}
      loading={loading}
    />
  );
}
