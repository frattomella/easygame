"use client";

import * as React from "react";
import { Drawer } from "@/components/web/overlays/Drawer";
import {
  CurrencyInput,
  DateInput,
  Field,
  FieldSizeProvider,
  FormGrid,
  SearchableSelect,
  Select,
  TextInput,
  Textarea,
  ValidationSummary,
} from "@/components/web/forms/Field";
import { Button } from "@/components/web/primitives/Button";
import { useToast } from "@/components/ui/toast-notification";
import { useCausaliIncasso } from "@/components/payments/use-causali-incasso";
import { useContiIncasso } from "@/components/payments/use-conti-incasso";
import { todayLocalDateOnly } from "@/lib/date-only";
import { SPONSORSHIP_OPERATION_TYPE_CODE, fromSponsorCents, toSponsorCents } from "@/lib/sponsors/model";
import { sponsorName, type SponsorRecord } from "@/components/sponsors/v2/sponsor-model";

/**
 * «Registra incasso» in un cassetto da 480 (otto campi, guideline 08 §8.5).
 *
 * Sostituisce le due finestre V1 — «Nuovo pagamento sponsor» dell'elenco
 * (metodo sempre «Bonifico», niente conto ne causale) e «Crea Nuovo
 * Pagamento» della scheda (metodo a testo libero, «In uscita» e «Conto
 * Corrente» ignorati dal server) — con un modulo solo che manda cio che
 * `POST /api/v1/sponsorships/:id/collections` accetta: importo, data,
 * metodo, conto finanziario, causale del catalogo, note.
 *
 * Le regole restano quelle della V1: sponsor, descrizione, importo > 0 e
 * metodo obbligatori, con il toast «Compila tutti i campi obbligatori». Il
 * conto e la causale sono facoltativi come nella finestra delle rate: un
 * incasso non classificato resta un incasso, e il rendiconto lo dichiara.
 */
export type SponsorCollectionSubmission = {
  sponsorId: string;
  amount: number;
  paidAt: string | null;
  paymentMethod: string;
  financialAccountId: string | null;
  operationTypeCode: string | null;
  notes: string | null;
};

const NO_ACCOUNT = "__none__";
const NO_CAUSE = "__none__";

type Draft = {
  sponsorId: string;
  description: string;
  amount: string;
  date: string;
  paymentMethod: string;
  financialAccountId: string;
  operationTypeCode: string;
  notes: string;
};

const emptyDraft = (sponsorId: string, paymentMethod: string): Draft => ({
  sponsorId,
  description: "",
  amount: "",
  date: todayLocalDateOnly(),
  paymentMethod,
  financialAccountId: NO_ACCOUNT,
  operationTypeCode: NO_CAUSE,
  notes: "",
});

export function CollectionDrawer({
  open,
  onOpenChange,
  sponsor,
  sponsors,
  methodChoices,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Lo sponsor fissato (dalla scheda); assente = si sceglie nel modulo. */
  sponsor: SponsorRecord | null;
  sponsors: SponsorRecord[];
  /** I metodi di incasso configurati dal club; vuoto = testo libero, come la scheda V1. */
  methodChoices: string[];
  onSubmit: (submission: SponsorCollectionSubmission) => Promise<boolean>;
}) {
  const { showToast } = useToast();
  const causali = useCausaliIncasso();
  const conti = useContiIncasso();
  const [initial, setInitial] = React.useState<Draft>(() => emptyDraft(sponsor?.id || "", methodChoices[0] || ""));
  const [draft, setDraft] = React.useState<Draft>(initial);
  const [errors, setErrors] = React.useState<Array<{ id: string; label: string; key: keyof Draft }>>([]);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    const next = emptyDraft(sponsor?.id || "", methodChoices[0] || "");
    setInitial(next);
    setDraft(next);
    setErrors([]);
  }, [open, sponsor, methodChoices]);

  /*
    Il primo conto attivo e la causale di sponsorizzazione si **propongono**,
    e restano cambiabili: chiederli a ogni incasso significa che prima o poi
    nessuno li sceglie. Le tendine possono arrivare dopo l'apertura, quindi la
    proposta si applica solo finche il campo e ancora al segnaposto — senza
    toccare cio che l'operatore ha gia scritto.
  */
  React.useEffect(() => {
    if (!open) return;
    const propose = (current: Draft): Draft => {
      let next = current;
      if (current.financialAccountId === NO_ACCOUNT && conti[0]) {
        next = { ...next, financialAccountId: conti[0].id };
      }
      if (current.operationTypeCode === NO_CAUSE && causali.some((causale) => causale.code === SPONSORSHIP_OPERATION_TYPE_CODE)) {
        next = { ...next, operationTypeCode: SPONSORSHIP_OPERATION_TYPE_CODE };
      }
      return next;
    };
    setInitial(propose);
    setDraft(propose);
  }, [open, conti, causali]);

  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);
  const update = (patch: Partial<Draft>) => {
    setDraft((current) => ({ ...current, ...patch }));
    if (errors.length) setErrors([]);
  };
  const errorFor = (key: keyof Draft) => (errors.some((error) => error.key === key) ? "Campo obbligatorio" : null);

  const submit = async () => {
    const found: typeof errors = [];
    if (!sponsor && !draft.sponsorId) found.push({ id: "incasso-sponsor", label: "Sponsor / Fornitore", key: "sponsorId" });
    if (!draft.description.trim()) found.push({ id: "incasso-descrizione", label: "Descrizione", key: "description" });
    if (toSponsorCents(draft.amount) <= 0) found.push({ id: "incasso-importo", label: "Importo", key: "amount" });
    if (!draft.paymentMethod.trim()) found.push({ id: "incasso-metodo", label: "Metodo di pagamento", key: "paymentMethod" });
    setErrors(found);
    if (found.length) {
      showToast("error", "Compila tutti i campi obbligatori");
      return;
    }
    setSaving(true);
    try {
      const ok = await onSubmit({
        sponsorId: sponsor?.id || draft.sponsorId,
        amount: fromSponsorCents(toSponsorCents(draft.amount)),
        paidAt: draft.date || null,
        paymentMethod: draft.paymentMethod.trim(),
        financialAccountId: draft.financialAccountId === NO_ACCOUNT ? null : draft.financialAccountId,
        operationTypeCode: draft.operationTypeCode === NO_CAUSE ? null : draft.operationTypeCode,
        notes: [draft.description.trim(), draft.notes.trim()].filter(Boolean).join(" - ") || null,
      });
      if (ok) onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  const sponsorOptions = React.useMemo(
    () => sponsors.map((row) => ({ value: String(row.id), label: sponsorName(row) })),
    [sponsors],
  );

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      eyebrow="Incassi"
      title="Registra incasso"
      description={sponsor ? `Un incasso di ${sponsorName(sponsor)} nel registro degli incassi: da li passa in prima nota.` : "Un incasso di uno sponsor o fornitore nel registro degli incassi: da li passa in prima nota."}
      dirty={dirty}
      locked={saving}
      data-test="sponsor-collection-drawer"
      footer={
        <>
          <Button variant="primary" onClick={() => void submit()} loading={saving}>
            Registra incasso
          </Button>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={saving}>
            Annulla
          </Button>
        </>
      }
    >
      <FieldSizeProvider size="sm">
        <div className="flex flex-col gap-5">
          <ValidationSummary errors={errors} />

          {!sponsor ? (
            <Field label="Sponsor / Fornitore" htmlFor="incasso-sponsor" required error={errorFor("sponsorId")}>
              {sponsorOptions.length > 8 ? (
                <SearchableSelect id="incasso-sponsor" value={draft.sponsorId} onValueChange={(value) => update({ sponsorId: value || "" })} options={sponsorOptions} placeholder="Seleziona un partner" searchPlaceholder="Cerca per nome" />
              ) : (
                <Select id="incasso-sponsor" value={draft.sponsorId} onValueChange={(value) => update({ sponsorId: value })} options={sponsorOptions} placeholder="Seleziona un partner" />
              )}
            </Field>
          ) : null}

          <Field label="Descrizione" htmlFor="incasso-descrizione" required error={errorFor("description")}>
            <TextInput id="incasso-descrizione" value={draft.description} onChange={(event) => update({ description: event.target.value })} placeholder="Es. Saldo sponsorizzazione stagione 2026" />
          </Field>

          <FormGrid columns={2}>
            <Field label="Importo" htmlFor="incasso-importo" required error={errorFor("amount")}>
              <CurrencyInput id="incasso-importo" value={draft.amount} onChange={(event) => update({ amount: event.target.value })} />
            </Field>
            <Field label="Data" htmlFor="incasso-data" required>
              <DateInput id="incasso-data" value={draft.date} onChange={(event) => update({ date: event.target.value })} />
            </Field>
            <Field label="Metodo di pagamento" htmlFor="incasso-metodo" required error={errorFor("paymentMethod")}>
              {methodChoices.length ? (
                <Select id="incasso-metodo" value={draft.paymentMethod} onValueChange={(value) => update({ paymentMethod: value })} options={methodChoices.map((method) => ({ value: method, label: method }))} placeholder="Seleziona un metodo" />
              ) : (
                <TextInput id="incasso-metodo" value={draft.paymentMethod} onChange={(event) => update({ paymentMethod: event.target.value })} placeholder="Bonifico" />
              )}
            </Field>
            <Field label="Conto" htmlFor="incasso-conto" optional helper={conti.length ? undefined : "Nessun conto configurato: l'incasso resta «senza conto»."}>
              <Select
                id="incasso-conto"
                value={draft.financialAccountId}
                onValueChange={(value) => update({ financialAccountId: value })}
                options={[{ value: NO_ACCOUNT, label: "Senza conto" }, ...conti.map((conto) => ({ value: conto.id, label: conto.name }))]}
              />
            </Field>
          </FormGrid>

          <Field label="Causale" htmlFor="incasso-causale" optional helper={causali.length ? "La causale classifica l'incasso in prima nota." : "Il club non ha ancora configurato le causali: l'incasso resta non classificato."}>
            <Select
              id="incasso-causale"
              value={draft.operationTypeCode}
              onValueChange={(value) => update({ operationTypeCode: value })}
              options={[{ value: NO_CAUSE, label: "Non classificato" }, ...causali.map((causale) => ({ value: causale.code, label: causale.label }))]}
            />
          </Field>

          <Field label="Note" htmlFor="incasso-note" optional>
            <Textarea id="incasso-note" rows={3} value={draft.notes} onChange={(event) => update({ notes: event.target.value })} placeholder="Riferimento della fattura, tranche, accordi" />
          </Field>
        </div>
      </FieldSizeProvider>
    </Drawer>
  );
}
