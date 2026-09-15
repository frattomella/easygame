"use client";

import * as React from "react";
import { Undo2 } from "lucide-react";
import { Modal } from "@/components/web/overlays/Modal";
import { Field, FieldSizeProvider, Textarea } from "@/components/web/forms/Field";
import { Button } from "@/components/web/primitives/Button";
import { formatDateShort, formatMoney } from "@/lib/web/format";
import { fromSponsorCents } from "@/lib/sponsors/model";
import { collectionDescription, type SponsorCollectionRow } from "@/components/sponsors/v2/sponsor-model";

/**
 * Lo storno di un incasso sponsor, con il **motivo obbligatorio**: una
 * conferma distruttiva in un modale che non si chiude sul velo (guideline 08
 * §8.9), la stessa forma di `ReverseEntryDialog` della prima nota.
 *
 * Le due pagine V1 avevano un cestino che rispondeva con un toast di errore
 * («Un incasso non si cancella: si storna …») e nessuno storno cablato. Qui
 * lo storno esiste e passa dallo stesso endpoint del registro delle rate:
 * `POST /api/v1/payment-transactions/:id { action: "reverse", reason }`.
 * Nasce la riga opposta, l'originale resta con il motivo. Non esiste il
 * DELETE (ADR-0036).
 */
export function StornoIncassoDialog({
  row,
  onOpenChange,
  saving,
  onSubmit,
}: {
  row: SponsorCollectionRow | null;
  onOpenChange: (open: boolean) => void;
  saving: boolean;
  onSubmit: (reason: string) => void | Promise<void>;
}) {
  const [reason, setReason] = React.useState("");
  const cancelRef = React.useRef<HTMLButtonElement>(null);

  React.useEffect(() => {
    if (row) setReason("");
  }, [row]);

  return (
    <Modal
      open={Boolean(row)}
      onOpenChange={saving ? () => {} : onOpenChange}
      title="Storna l'incasso"
      description="Un incasso non si cancella: si storna. Restano visibili entrambe le righe, l'originale e la sua correzione, con il motivo scritto sopra."
      tone="danger"
      icon={<Undo2 />}
      strict
      width={560}
      initialFocusRef={cancelRef}
      footer={
        <>
          <Button ref={cancelRef} variant="secondary" onClick={() => onOpenChange(false)} disabled={saving}>
            Annulla
          </Button>
          <Button variant="danger" disabled={!reason.trim() || saving} loading={saving} onClick={() => void onSubmit(reason.trim())}>
            Storna
          </Button>
        </>
      }
    >
      {row ? (
        <div className="flex flex-col gap-4">
          <div className="rounded-egw-field border border-egw-tint-red-bd bg-egw-tint-red px-4 py-3">
            <p className="font-brand text-[13px] font-semibold text-egw-ink">{collectionDescription(row)}</p>
            <p className="egw-num mt-1 font-brand text-[12px] text-egw-ink-72">
              {row.sponsorName} · {formatDateShort(row.paidAt)} · {formatMoney(fromSponsorCents(row.amountCents))}
              {row.paymentMethod ? ` · ${row.paymentMethod}` : ""}
            </p>
          </div>
          <FieldSizeProvider size="sm">
            <Field label="Motivo dello storno" htmlFor="storno-incasso-motivo" required helper="Resta nello storico, accanto alle due righe.">
              <Textarea id="storno-incasso-motivo" rows={3} placeholder="Perché questo incasso va annullato" value={reason} onChange={(event) => setReason(event.target.value)} />
            </Field>
          </FieldSizeProvider>
        </div>
      ) : null}
    </Modal>
  );
}
