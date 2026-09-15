"use client";

import * as React from "react";
import { Drawer } from "@/components/web/overlays/Drawer";
import { CurrencyInput, DateInput, Field, FieldSizeProvider, FormGrid, Select, TextInput, ValidationSummary } from "@/components/web/forms/Field";
import { Button } from "@/components/web/primitives/Button";
import { todayLocalDateOnly } from "@/lib/date-only";
import { uid, type PaymentStatus, type StructurePayment } from "@/lib/structures-utils";
import { RENT_PAYMENT_STATUS_OPTIONS } from "@/components/structures/v2/structure-model";

/**
 * «Registra pagamento» d'affitto in un cassetto da 480 (quattro campi). E il
 * modulo in linea della tab Pagamenti / Fitti V1: data (oggi), descrizione
 * («Canone struttura»), importo, stato (`In attesa` di partenza), `type:
 * "Quota"` fisso. La V1 usciva in silenzio su un modulo incompleto: qui gli
 * errori si dicono.
 */
type PaymentForm = { date: string; description: string; amount: string; status: PaymentStatus };

const emptyForm = (): PaymentForm => ({ date: todayLocalDateOnly(), description: "Canone struttura", amount: "", status: "In attesa" });

export function RentPaymentDrawer({
  open,
  onClose,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (payment: StructurePayment) => Promise<boolean>;
}) {
  const ID = "rent-payment";
  const [form, setForm] = React.useState<PaymentForm>(emptyForm);
  const [dirty, setDirty] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [errors, setErrors] = React.useState<Array<{ id?: string; label: string }>>([]);

  const [wasOpen, setWasOpen] = React.useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setForm(emptyForm());
      setDirty(false);
      setErrors([]);
    }
  }

  const patch = (next: Partial<PaymentForm>) => {
    setForm((current) => ({ ...current, ...next }));
    setDirty(true);
    if (errors.length) setErrors([]);
  };

  const errorFor = (id: string) => errors.find((error) => error.id === `${ID}-${id}`)?.label;

  const submit = async () => {
    const found: Array<{ id?: string; label: string }> = [];
    const amount = Number(String(form.amount).trim().replace(",", "."));
    if (!form.date) found.push({ id: `${ID}-date`, label: "Inserisci la data" });
    if (!form.description.trim()) found.push({ id: `${ID}-description`, label: "Inserisci la descrizione" });
    if (!String(form.amount).trim() || Number.isNaN(amount)) found.push({ id: `${ID}-amount`, label: "Importo non valido" });
    setErrors(found);
    if (found.length) {
      document.getElementById(found[0].id!)?.focus();
      return;
    }
    setSaving(true);
    try {
      const ok = await onSave({
        id: uid("payment"),
        date: form.date,
        description: form.description.trim(),
        type: "Quota",
        amount,
        status: form.status,
      });
      if (ok) setDirty(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Drawer
      open={open}
      onOpenChange={(next) => !next && onClose()}
      width="default"
      eyebrow="Affitti"
      title="Registra pagamento"
      dirty={dirty}
      locked={saving}
      data-test="rent-payment-drawer"
      footer={
        <>
          <Button variant="primary" onClick={() => void submit()} loading={saving}>
            Aggiungi
          </Button>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Annulla
          </Button>
        </>
      }
    >
      <FieldSizeProvider size="sm">
        <div className="flex flex-col gap-5">
          <ValidationSummary errors={errors} />
          <Field label="Data" htmlFor={`${ID}-date`} required error={errorFor("date")}>
            <DateInput id={`${ID}-date`} value={form.date} onChange={(event) => patch({ date: event.target.value })} />
          </Field>
          <Field label="Descrizione" htmlFor={`${ID}-description`} required error={errorFor("description")}>
            <TextInput id={`${ID}-description`} value={form.description} onChange={(event) => patch({ description: event.target.value })} placeholder="Es: Canone mensile" />
          </Field>
          <FormGrid>
            <Field label="Importo" htmlFor={`${ID}-amount`} required error={errorFor("amount")}>
              <CurrencyInput id={`${ID}-amount`} value={form.amount} onChange={(event) => patch({ amount: event.target.value })} />
            </Field>
            <Field label="Stato" htmlFor={`${ID}-status`} required>
              <Select
                id={`${ID}-status`}
                value={form.status}
                onValueChange={(value) => patch({ status: value as PaymentStatus })}
                options={RENT_PAYMENT_STATUS_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
              />
            </Field>
          </FormGrid>
        </div>
      </FieldSizeProvider>
    </Drawer>
  );
}
