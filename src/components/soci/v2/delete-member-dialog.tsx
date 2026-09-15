"use client";

import { DangerConfirmDialog } from "@/components/web/overlays/Modal";

/**
 * La conferma distruttiva di un socio (guideline 08 §8.9: un record, modale
 * rosso, cosa se ne va, nessuna conferma scritta).
 *
 * Sostituisce il `confirm("Sei sicuro di voler eliminare questo socio?")`
 * nativo che la V1 aveva in tre punti (tabella, card, scheda). La frase resta
 * come descrizione, cosi il testo che la segreteria conosce non cambia.
 *
 * Chi e nel libro **non si cancella**: il servizio rifiuta e spiega perche.
 * Il dialogo lo dice prima, quando la pagina lo sa gia, invece di far
 * scoprire il rifiuto dopo il clic.
 */
export function DeleteMemberDialog({
  open,
  onOpenChange,
  name,
  eventCount = 0,
  onConfirm,
  loading,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  name: string;
  /** Quanti eventi il libro registra per questa persona (0 = non e nel libro). */
  eventCount?: number;
  onConfirm: () => void | Promise<void>;
  loading?: boolean;
}) {
  return (
    <DangerConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Eliminare ${name}?`}
      description="Sei sicuro di voler eliminare questo socio?"
      consequences={[
        "L'anagrafica, i contatti e la residenza",
        "Il tipo di socio, le date di iscrizione e le note",
        "Le taglie registrate per il materiale del club",
      ]}
      confirmLabel="Elimina"
      onConfirm={onConfirm}
      loading={loading}
    >
      {eventCount > 0 ? (
        <p className="mt-3 font-brand text-[12.5px] leading-[1.5] text-egw-ink-72">
          Questo socio ha {eventCount} {eventCount === 1 ? "evento" : "eventi"} nel libro soci: la cancellazione verrà rifiutata. Chi non è più socio si dimette o si esclude, con una data e una delibera.
        </p>
      ) : null}
    </DangerConfirmDialog>
  );
}
