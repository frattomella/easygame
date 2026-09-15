"use client";

import * as React from "react";
import { Drawer } from "@/components/web/overlays/Drawer";
import { CurrencyInput, DateInput, Field, FieldSizeProvider, FormGrid, SearchableSelect, Select, TextInput, ValidationSummary } from "@/components/web/forms/Field";
import { Button } from "@/components/web/primitives/Button";
import { useToast } from "@/components/ui/toast-notification";
import { apiRequest } from "@/lib/api/client";
import { EXPENSE_CATEGORIES, EXPENSE_CATEGORY_LABELS } from "@/lib/sport-work/model";
import type { SportWorkPerson } from "@/components/sport-work/v2/sport-work-model";
import { emptyExpenseDraft, validateExpenseDraft, type ExpenseDraft, type FormError } from "@/components/sport-work/v2/sport-work-forms";

/**
 * «Nuovo rimborso spese» in un cassetto da 480 (cinque campi). Nasce in
 * bozza e si liquida solo dopo l'approvazione; non e un compenso e non
 * concorre a nessuna soglia. Stessa scrittura della V1:
 * `POST /api/v1/sport-work/reimbursements`.
 */
export function ExpenseDrawer({ open, onOpenChange, people, onSaved }: { open: boolean; onOpenChange: (open: boolean) => void; people: SportWorkPerson[]; onSaved: () => void }) {
  const { showToast } = useToast();
  const [draft, setDraft] = React.useState<ExpenseDraft>(emptyExpenseDraft);
  const [errors, setErrors] = React.useState<FormError[]>([]);
  const [dirty, setDirty] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setDraft(emptyExpenseDraft());
    setErrors([]);
    setDirty(false);
  }, [open]);

  const update = (patch: Partial<ExpenseDraft>) => {
    setDraft((current) => ({ ...current, ...patch }));
    setDirty(true);
    if (errors.length) setErrors([]);
  };
  const errorFor = (field: string) => errors.find((e) => e.field === field)?.label;

  const submit = async () => {
    const found = validateExpenseDraft(draft);
    setErrors(found);
    if (found.length) return;
    setSaving(true);
    const { error } = await apiRequest("/api/v1/sport-work/reimbursements", { method: "POST", body: draft });
    setSaving(false);
    if (error) {
      showToast("error", error.message || "Operazione non riuscita");
      return;
    }
    showToast("success", "Rimborso registrato");
    setDirty(false);
    onOpenChange(false);
    onSaved();
  };

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      eyebrow="Rimborsi"
      title="Nuovo rimborso spese"
      description="Nasce in bozza. Si liquida solo dopo l'approvazione."
      dirty={dirty}
      locked={saving}
      data-test="sport-work-expense-drawer"
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
        <div className="flex flex-col gap-5">
          <ValidationSummary errors={errors} />
          <Field label="Persona" htmlFor="exp-person" required error={errorFor("personId")}>
            <SearchableSelect
              id="exp-person"
              value={draft.personId || null}
              onValueChange={(value) => update({ personId: value || "" })}
              options={people.map((person) => ({ value: String(person.id), label: person.full_name }))}
              placeholder="Seleziona"
              searchPlaceholder="Cerca una persona"
              emptyLabel="Nessuna persona censita"
            />
          </Field>
          <Field label="Causale" htmlFor="exp-description" required error={errorFor("description")}>
            <TextInput id="exp-description" value={draft.description} onChange={(event) => update({ description: event.target.value })} placeholder="Trasferta Bologna" />
          </Field>
          <FormGrid>
            <Field label="Categoria" htmlFor="exp-category">
              <Select
                id="exp-category"
                value={draft.category}
                onValueChange={(value) => update({ category: value })}
                options={EXPENSE_CATEGORIES.map((category) => ({ value: category, label: EXPENSE_CATEGORY_LABELS[category] }))}
              />
            </Field>
            <Field label="Importo" htmlFor="exp-amount" required width="16ch" error={errorFor("amount")}>
              <CurrencyInput id="exp-amount" value={draft.amount} onChange={(event) => update({ amount: event.target.value })} />
            </Field>
            <Field label="Data della spesa" htmlFor="exp-date" required width="14ch" error={errorFor("expenseDate")}>
              <DateInput id="exp-date" value={draft.expenseDate} onChange={(event) => update({ expenseDate: event.target.value })} />
            </Field>
          </FormGrid>
        </div>
      </FieldSizeProvider>
    </Drawer>
  );
}
