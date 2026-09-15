"use client";

import { DangerConfirmDialog } from "@/components/web/overlays/Modal";
import { sponsorKindLabel, sponsorName, type SponsorRecord } from "@/components/sponsors/v2/sponsor-model";

/**
 * La conferma distruttiva di uno sponsor o fornitore (guideline 08 §8.9:
 * un record, modale rosso, cosa se ne va, nessuna conferma scritta).
 *
 * Sostituisce i due `confirm()` nativi della V1 («Sei sicuro di voler
 * eliminare questo sponsor?» nell'elenco, «… questo sponsor/fornitore?»
 * nella scheda). L'eliminazione toglie l'elemento da `clubs.sponsors`:
 * anagrafica, contratto e documenti se ne vanno con lui. **Gli incassi
 * restano** nel registro, con l'etichetta della controparte congelata: il
 * denaro e entrato davvero e la prima nota continua a dirlo.
 */
export function DeleteSponsorDialog({
  open,
  onOpenChange,
  sponsor,
  collectionsCount,
  onConfirm,
  loading,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sponsor: SponsorRecord | null;
  /** Gli incassi registrati per questo sponsor, che non se ne vanno. */
  collectionsCount: number;
  onConfirm: () => void | Promise<void>;
  loading?: boolean;
}) {
  const kind = sponsor ? sponsorKindLabel(sponsor.type).toLowerCase() : "sponsor";
  return (
    <DangerConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Eliminare ${sponsor ? sponsorName(sponsor) : `questo ${kind}`}?`}
      description={`Sei sicuro di voler eliminare questo ${kind}?`}
      consequences={[
        "L'anagrafica: contatti, dati fiscali e sede",
        "Il contratto registrato, con il dovuto e il residuo",
        "I documenti allegati alla scheda",
        collectionsCount > 0
          ? `${collectionsCount} ${collectionsCount === 1 ? "incasso registrato resta" : "incassi registrati restano"} nel registro e in prima nota, con il nome congelato sulla riga`
          : "Gli incassi eventualmente registrati restano nel registro e in prima nota",
      ]}
      confirmLabel="Elimina"
      onConfirm={onConfirm}
      loading={loading}
    />
  );
}
