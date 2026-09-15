"use client";

import * as React from "react";
import { Drawer, DrawerSection } from "@/components/web/overlays/Drawer";
import { CurrencyInput, DateInput, Field, FieldSizeProvider, FormGrid, SearchableSelect, TextInput, ValidationSummary } from "@/components/web/forms/Field";
import { Button } from "@/components/web/primitives/Button";
import { InfoCard } from "@/components/web/page/Cards";
import { useToast } from "@/components/ui/toast-notification";
import { apiRequest } from "@/lib/api/client";
import type { RelationshipRow } from "@/components/sport-work/v2/sport-work-model";
import { emptyInvoiceDraft, validateInvoiceDraft, type FormError, type InvoiceDraft } from "@/components/sport-work/v2/sport-work-forms";

/**
 * «Nuova fattura ricevuta» in un cassetto da 480 (otto campi). Gli importi si
 * trascrivono dal documento: il calcolo lo ha fatto chi lo ha emesso, e
 * nessuna regola co.co.co. lo tocca. Stessa scrittura della V1:
 * `POST /api/v1/sport-work/vat-invoices`.
 */
export function InvoiceDrawer({
  open,
  onOpenChange,
  vatRelationships,
  personNameOf,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vatRelationships: RelationshipRow[];
  personNameOf: (personId: string) => string;
  onSaved: () => void;
}) {
  const { showToast } = useToast();
  const [draft, setDraft] = React.useState<InvoiceDraft>(emptyInvoiceDraft);
  const [errors, setErrors] = React.useState<FormError[]>([]);
  const [dirty, setDirty] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setDraft(emptyInvoiceDraft());
    setErrors([]);
    setDirty(false);
  }, [open]);

  const update = (patch: Partial<InvoiceDraft>) => {
    setDraft((current) => ({ ...current, ...patch }));
    setDirty(true);
    if (errors.length) setErrors([]);
  };
  const errorFor = (field: string) => errors.find((e) => e.field === field)?.label;

  const submit = async () => {
    const found = validateInvoiceDraft(draft);
    setErrors(found);
    if (found.length) return;
    setSaving(true);
    const { error } = await apiRequest("/api/v1/sport-work/vat-invoices", { method: "POST", body: draft });
    setSaving(false);
    if (error) {
      showToast("error", error.message || "Operazione non riuscita");
      return;
    }
    showToast("success", "Fattura registrata");
    setDirty(false);
    onOpenChange(false);
    onSaved();
  };

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      eyebrow="Fatture P.IVA"
      title="Nuova fattura ricevuta"
      description="Trascrivi gli importi dal documento: EasyGame non li ricalcola."
      dirty={dirty}
      locked={saving}
      data-test="sport-work-invoice-drawer"
      footer={
        <>
          <Button variant="primary" onClick={() => void submit()} loading={saving}>
            Registra
          </Button>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={saving}>
            Annulla
          </Button>
        </>
      }
    >
      <FieldSizeProvider size="sm">
        <div className="flex flex-col gap-6">
          <ValidationSummary errors={errors} />
          <DrawerSection eyebrow="Documento">
            <div className="flex flex-col gap-5">
              <Field label="Rapporto con partita IVA" htmlFor="inv-relationship" required error={errorFor("relationshipId")}>
                <SearchableSelect
                  id="inv-relationship"
                  value={draft.relationshipId || null}
                  onValueChange={(value) => update({ relationshipId: value || "" })}
                  options={vatRelationships.map((row) => ({ value: String(row.id), label: personNameOf(String(row.person_id)) || String(row.id) }))}
                  placeholder="Seleziona"
                  searchPlaceholder="Cerca per nome"
                  emptyLabel="Nessun rapporto con partita IVA"
                />
              </Field>
              <FormGrid>
                <Field label="Numero documento" htmlFor="inv-number" required error={errorFor("documentNumber")}>
                  <TextInput id="inv-number" className="egw-num" value={draft.documentNumber} onChange={(event) => update({ documentNumber: event.target.value })} />
                </Field>
                <Field label="Data documento" htmlFor="inv-date" required width="14ch" error={errorFor("documentDate")}>
                  <DateInput id="inv-date" value={draft.documentDate} onChange={(event) => update({ documentDate: event.target.value })} />
                </Field>
              </FormGrid>
            </div>
          </DrawerSection>
          <DrawerSection eyebrow="Importi">
            <FormGrid>
              <Field label="Imponibile" htmlFor="inv-taxable" width="16ch">
                <CurrencyInput id="inv-taxable" value={draft.taxableAmount} onChange={(event) => update({ taxableAmount: event.target.value })} />
              </Field>
              <Field label="IVA" htmlFor="inv-vat" width="16ch">
                <CurrencyInput id="inv-vat" value={draft.vatAmount} onChange={(event) => update({ vatAmount: event.target.value })} />
              </Field>
              <Field label="Ritenuta in fattura" htmlFor="inv-withholding" width="16ch">
                <CurrencyInput id="inv-withholding" value={draft.withholdingAmount} onChange={(event) => update({ withholdingAmount: event.target.value })} />
              </Field>
              <Field label="Totale documento" htmlFor="inv-total" required width="16ch" error={errorFor("totalAmount")}>
                <CurrencyInput id="inv-total" value={draft.totalAmount} onChange={(event) => update({ totalAmount: event.target.value })} />
              </Field>
              <Field label="Scadenza" htmlFor="inv-due" width="14ch" optional>
                <DateInput id="inv-due" value={draft.dueDate} onChange={(event) => update({ dueDate: event.target.value })} />
              </Field>
            </FormGrid>
          </DrawerSection>
          <InfoCard eyebrow="Nessun calcolo">Sulla fattura di un professionista non gira il motore co.co.co.: EasyGame registra documento, scadenza, pagamento e uscita.</InfoCard>
        </div>
      </FieldSizeProvider>
    </Drawer>
  );
}
