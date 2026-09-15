"use client";

import { DangerConfirmDialog } from "@/components/web/overlays/Modal";
import { athletesOf, contactsOf, paymentsOf, trainersOf, type Procura } from "@/components/procura/v2/procura-model";

/**
 * La conferma distruttiva di una procura (guideline 08 §8.9: un record,
 * modale rosso, cosa se ne va, nessuna conferma scritta).
 *
 * Sostituisce il `confirm("Sei sicuro di voler eliminare questa procura?")`
 * nativo della V1; la frase resta come descrizione. L'eliminazione riscrive
 * la colonna `clubs.procure` senza quell'elemento: contatti, associazioni e
 * pagamenti registrati se ne vanno con lei, e i pagamenti spariscono anche
 * dai movimenti consolidati del club.
 */
const plural = (count: number, singular: string, many: string) => `${count} ${count === 1 ? singular : many}`;

export function DeleteProcuraDialog({
  open,
  onOpenChange,
  procura,
  onConfirm,
  loading,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  procura: Procura | null;
  onConfirm: () => void | Promise<void>;
  loading?: boolean;
}) {
  const contacts = procura ? contactsOf(procura).length : 0;
  const associations = procura ? athletesOf(procura).length + trainersOf(procura).length : 0;
  const payments = procura ? paymentsOf(procura).length : 0;
  return (
    <DangerConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Eliminare ${procura?.name ?? "questa procura"}?`}
      description="Sei sicuro di voler eliminare questa procura?"
      consequences={[
        `L'indirizzo della sede e ${plural(contacts, "contatto procuratore", "contatti procuratori")}`,
        `${plural(associations, "associazione", "associazioni")} con atleti e allenatori, costi e note comprese`,
        `${plural(payments, "pagamento registrato", "pagamenti registrati")}, che non compariranno più tra i movimenti del club`,
      ]}
      confirmLabel="Elimina"
      onConfirm={onConfirm}
      loading={loading}
    />
  );
}
