"use client";

import * as React from "react";
import { Drawer } from "@/components/web/overlays/Drawer";
import { CurrencyInput, DateInput, Field, FieldSizeProvider, FormGrid, TextInput, Textarea } from "@/components/web/forms/Field";
import { Button } from "@/components/web/primitives/Button";
import { useToast } from "@/components/ui/toast-notification";
import {
  fromSponsorCents,
  sanitizeSponsorContract,
  toSponsorCents,
  type SponsorContract,
} from "@/lib/sponsors/model";

/**
 * «Registra contratto» / «Modifica contratto» in un cassetto da 480: cinque
 * campi (guideline 08 §8.5). Sostituisce l'editor in linea della card
 * «Contratto e credito» della scheda V1, con la stessa validazione a elenco
 * (`sanitizeSponsorContract`: importo non negativo, fine non prima
 * dell'inizio) e lo stesso toast «Contratto non valido: …».
 *
 * L'importo si scrive in notazione italiana (`5.000,00`) e lo legge
 * `toSponsorCents`, che sa che l'ultimo separatore comanda.
 */
type ContractDraft = {
  agreedAmount: string;
  startDate: string;
  endDate: string;
  documentReference: string;
  notes: string;
};

const draftFrom = (contract: SponsorContract): ContractDraft => ({
  agreedAmount: contract.agreedAmountCents ? String(fromSponsorCents(contract.agreedAmountCents)).replace(".", ",") : "",
  startDate: contract.startDate || "",
  endDate: contract.endDate || "",
  documentReference: contract.documentReference,
  notes: contract.notes,
});

const isSame = (a: ContractDraft, b: ContractDraft) => JSON.stringify(a) === JSON.stringify(b);

export function ContractDrawer({
  open,
  onOpenChange,
  contract,
  hasContract,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contract: SponsorContract;
  hasContract: boolean;
  onSave: (next: SponsorContract) => Promise<boolean>;
}) {
  const { showToast } = useToast();
  const [initial, setInitial] = React.useState<ContractDraft>(() => draftFrom(contract));
  const [draft, setDraft] = React.useState<ContractDraft>(() => draftFrom(contract));
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    const next = draftFrom(contract);
    setInitial(next);
    setDraft(next);
    setError(null);
  }, [open, contract]);

  const dirty = !isSame(draft, initial);
  const update = (patch: Partial<ContractDraft>) => {
    setDraft((current) => ({ ...current, ...patch }));
    if (error) setError(null);
  };

  const submit = async () => {
    let next: SponsorContract;
    try {
      next = sanitizeSponsorContract({
        agreedAmountCents: toSponsorCents(draft.agreedAmount),
        startDate: draft.startDate,
        endDate: draft.endDate,
        documentReference: draft.documentReference,
        notes: draft.notes,
      });
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Contratto non valido";
      setError(message);
      showToast("error", message);
      return;
    }
    setSaving(true);
    try {
      const ok = await onSave(next);
      if (ok) onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      eyebrow="Contratto"
      title={hasContract ? "Modifica contratto" : "Registra contratto"}
      description="Importo pattuito, periodo e riferimento della scrittura firmata. Il pattuito non e cassa: il residuo si ricava dagli incassi."
      dirty={dirty}
      locked={saving}
      data-test="sponsor-contract-drawer"
      footer={
        <>
          <Button variant="primary" onClick={() => void submit()} loading={saving}>
            Salva contratto
          </Button>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={saving}>
            Annulla
          </Button>
        </>
      }
    >
      <FieldSizeProvider size="sm">
        <div className="flex flex-col gap-5">
          {error ? (
            <div role="alert" className="rounded-egw-field border border-egw-tint-red-bd bg-egw-tint-red px-4 py-3 font-brand text-[12.5px] font-medium text-egw-ink">
              {error}
            </div>
          ) : null}
          <FormGrid columns={2}>
            <Field label="Importo pattuito" htmlFor="contract-amount" helper="In euro, con la virgola per i decimali.">
              <CurrencyInput id="contract-amount" value={draft.agreedAmount} onChange={(event) => update({ agreedAmount: event.target.value })} />
            </Field>
            <Field label="Riferimento del contratto" htmlFor="contract-reference" helper="Numero, protocollo o titolo della scrittura.">
              <TextInput id="contract-reference" value={draft.documentReference} onChange={(event) => update({ documentReference: event.target.value })} placeholder="Es. Contratto 2026/01" />
            </Field>
            <Field label="Dal" htmlFor="contract-start">
              <DateInput id="contract-start" value={draft.startDate} onChange={(event) => update({ startDate: event.target.value })} />
            </Field>
            <Field label="Al" htmlFor="contract-end">
              <DateInput id="contract-end" value={draft.endDate} onChange={(event) => update({ endDate: event.target.value })} />
            </Field>
          </FormGrid>
          <Field label="Note" htmlFor="contract-notes">
            <Textarea id="contract-notes" rows={3} value={draft.notes} onChange={(event) => update({ notes: event.target.value })} placeholder="Clausole, visibilità concordata, rinnovi" />
          </Field>
        </div>
      </FieldSizeProvider>
    </Drawer>
  );
}
