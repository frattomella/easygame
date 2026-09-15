"use client";

import { DangerConfirmDialog } from "@/components/web/overlays/Modal";

/**
 * La conferma distruttiva di un membro dello staff (guideline 08 §8.9:
 * un record, modale rosso, cosa se ne va, nessuna conferma scritta).
 *
 * Sostituisce il `confirm("Sei sicuro di voler eliminare questo membro dello
 * staff?")` nativo che la V1 aveva in tre punti (tabella, card, scheda). La
 * frase resta come descrizione, cosi il testo che la segreteria conosce non
 * cambia.
 */
export function DeleteStaffDialog({
  open,
  onOpenChange,
  name,
  onConfirm,
  loading,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  name: string;
  onConfirm: () => void | Promise<void>;
  loading?: boolean;
}) {
  return (
    <DangerConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Eliminare ${name}?`}
      description="Sei sicuro di voler eliminare questo membro dello staff?"
      consequences={[
        "L'anagrafica, i contatti e il documento di identità",
        "Il ruolo, il reparto e la data di assunzione",
        "Gli inviti EasyGame ancora aperti per questa scheda",
      ]}
      confirmLabel="Elimina"
      onConfirm={onConfirm}
      loading={loading}
    />
  );
}
