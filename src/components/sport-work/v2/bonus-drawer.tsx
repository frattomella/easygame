"use client";

import * as React from "react";
import { Drawer } from "@/components/web/overlays/Drawer";
import { CurrencyInput, DateInput, Field, FieldSizeProvider, FormGrid, SearchableSelect, Select, TextInput, ValidationSummary } from "@/components/web/forms/Field";
import { Button } from "@/components/web/primitives/Button";
import { useToast } from "@/components/ui/toast-notification";
import { apiRequest } from "@/lib/api/client";
import { BONUS_FISCAL_TREATMENTS, BONUS_FISCAL_TREATMENT_LABELS } from "@/lib/sport-work/model";
import type { SportWorkPerson } from "@/components/sport-work/v2/sport-work-model";
import { emptyBonusDraft, validateBonusDraft, type BonusDraft, type FormError } from "@/components/sport-work/v2/sport-work-forms";

/**
 * «Nuovo premio» in un cassetto da 480 (sei campi). Il trattamento fiscale
 * si **dichiara**: la distinzione fra premio e retribuzione variabile la fa
 * il contratto, non l'etichetta, e il valore predefinito e «da verificare».
 * Stessa scrittura della V1: `POST /api/v1/sport-work/bonuses`.
 */
export function BonusDrawer({ open, onOpenChange, people, onSaved }: { open: boolean; onOpenChange: (open: boolean) => void; people: SportWorkPerson[]; onSaved: () => void }) {
  const { showToast } = useToast();
  const [draft, setDraft] = React.useState<BonusDraft>(emptyBonusDraft);
  const [errors, setErrors] = React.useState<FormError[]>([]);
  const [dirty, setDirty] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setDraft(emptyBonusDraft());
    setErrors([]);
    setDirty(false);
  }, [open]);

  const update = (patch: Partial<BonusDraft>) => {
    setDraft((current) => ({ ...current, ...patch }));
    setDirty(true);
    if (errors.length) setErrors([]);
  };
  const errorFor = (field: string) => errors.find((e) => e.field === field)?.label;

  const submit = async () => {
    const found = validateBonusDraft(draft);
    setErrors(found);
    if (found.length) return;
    setSaving(true);
    const { error } = await apiRequest("/api/v1/sport-work/bonuses", { method: "POST", body: draft });
    setSaving(false);
    if (error) {
      showToast("error", error.message || "Operazione non riuscita");
      return;
    }
    showToast("success", "Premio registrato");
    setDirty(false);
    onOpenChange(false);
    onSaved();
  };

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      eyebrow="Premi"
      title="Nuovo premio"
      description="Il trattamento fiscale si dichiara. La distinzione fra premio e retribuzione variabile la fa il contratto."
      dirty={dirty}
      locked={saving}
      data-test="sport-work-bonus-drawer"
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
          <Field label="Persona" htmlFor="bonus-person" required error={errorFor("personId")}>
            <SearchableSelect
              id="bonus-person"
              value={draft.personId || null}
              onValueChange={(value) => update({ personId: value || "" })}
              options={people.map((person) => ({ value: String(person.id), label: person.full_name }))}
              placeholder="Seleziona"
              searchPlaceholder="Cerca una persona"
              emptyLabel="Nessuna persona censita"
            />
          </Field>
          <Field label="Causale" htmlFor="bonus-reason" required error={errorFor("reason")}>
            <TextInput id="bonus-reason" value={draft.reason} onChange={(event) => update({ reason: event.target.value })} placeholder="Premio playoff" />
          </Field>
          <FormGrid>
            <Field label="Competizione" htmlFor="bonus-competition" optional>
              <TextInput id="bonus-competition" value={draft.competition} onChange={(event) => update({ competition: event.target.value })} />
            </Field>
            <Field label="Importo" htmlFor="bonus-amount" required width="16ch" error={errorFor("amount")}>
              <CurrencyInput id="bonus-amount" value={draft.amount} onChange={(event) => update({ amount: event.target.value })} />
            </Field>
            <Field label="Data di assegnazione" htmlFor="bonus-date" required width="14ch" error={errorFor("awardDate")}>
              <DateInput id="bonus-date" value={draft.awardDate} onChange={(event) => update({ awardDate: event.target.value })} />
            </Field>
            <Field label="Trattamento fiscale" htmlFor="bonus-treatment">
              <Select
                id="bonus-treatment"
                value={draft.fiscalTreatment}
                onValueChange={(value) => update({ fiscalTreatment: value })}
                options={BONUS_FISCAL_TREATMENTS.map((treatment) => ({ value: treatment, label: BONUS_FISCAL_TREATMENT_LABELS[treatment] }))}
              />
            </Field>
          </FormGrid>
        </div>
      </FieldSizeProvider>
    </Drawer>
  );
}
