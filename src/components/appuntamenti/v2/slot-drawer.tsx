"use client";

import * as React from "react";
import { Drawer, DrawerSection } from "@/components/web/overlays/Drawer";
import { DateInput, Field, FieldSizeProvider, FormGrid, SearchableSelect, Select, TextInput, Textarea, TimeInput, ValidationSummary } from "@/components/web/forms/Field";
import { SegmentedControl, Toggle } from "@/components/web/primitives/Controls";
import { Button } from "@/components/web/primitives/Button";
import { InsetBlock } from "@/components/web/primitives/Surface";
import { GIORNI, emptySlotForm, slotFormFrom, validateSlotForm, type Operatore, type Sede, type SlotAmbito, type SlotFormValues } from "@/components/appuntamenti/v2/slot-model";
import type { AppointmentSlotRow } from "@/lib/api/appointments-client";

/**
 * «Nuova fascia» / «Modifica fascia» (cassetto 720, 9–20 campi in sezioni):
 * gli undici campi della V1 in quattro blocchi — quando, dove e chi, in
 * vigore, note e stato. La scrittura la fa la pagina (`createAppointmentSlot`
 * / `updateAppointmentSlot`, come la V1): qui si raccolgono i valori e si
 * dice cosa manca, in linea.
 */
const sameValues = (a: SlotFormValues, b: SlotFormValues) => (Object.keys(a) as Array<keyof SlotFormValues>).every((key) => a[key] === b[key]);

export function SlotDrawer({
  open,
  onOpenChange,
  slot,
  sedi,
  operatori,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** `null` = nuova fascia. */
  slot: AppointmentSlotRow | null;
  sedi: Sede[];
  operatori: Operatore[];
  /** Torna `true` se la scrittura e andata a buon fine (il cassetto si chiude). */
  onSubmit: (values: SlotFormValues) => Promise<boolean>;
}) {
  const [values, setValues] = React.useState<SlotFormValues>(emptySlotForm);
  const [initial, setInitial] = React.useState<SlotFormValues>(emptySlotForm);
  const [errors, setErrors] = React.useState<Partial<Record<keyof SlotFormValues, string>>>({});
  const [busy, setBusy] = React.useState(false);

  const slotId = slot?.id ?? null;
  React.useEffect(() => {
    if (!open) return;
    const start = slot ? slotFormFrom(slot) : emptySlotForm();
    setValues(start);
    setInitial(start);
    setErrors({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, slotId]);

  const set = <K extends keyof SlotFormValues>(key: K, value: SlotFormValues[K]) => {
    setValues((current) => ({ ...current, [key]: value }));
    if (errors[key]) setErrors((current) => ({ ...current, [key]: undefined }));
  };

  const dirty = !sameValues(values, initial);

  const submit = async () => {
    const next = validateSlotForm(values);
    setErrors(next);
    if (Object.keys(next).length) return;
    setBusy(true);
    try {
      const ok = await onSubmit(values);
      if (ok) onOpenChange(false);
    } finally {
      setBusy(false);
    }
  };

  const summary = (Object.keys(errors) as Array<keyof SlotFormValues>)
    .filter((key) => errors[key])
    .map((key) => ({ id: `slot-${key}`, label: errors[key] as string }));

  const sedeOptions = [{ value: "", label: "Tutte le sedi" }, ...sedi.map((sede) => ({ value: sede.id, label: sede.name }))];
  const operatoreOptions = [{ value: "", label: "Segreteria" }, ...operatori.map((operatore) => ({ value: operatore.userId, label: operatore.nome }))];

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      width="wide"
      eyebrow="Disponibilita"
      title={slot ? "Modifica fascia" : "Nuova fascia"}
      description="Una fascia di ricevimento: quando, dove e con chi la societa riceve. Si divide in colloqui della durata indicata."
      dirty={dirty && !busy}
      locked={busy}
      footer={
        <>
          <Button variant="primary" onClick={() => void submit()} loading={busy}>
            {slot ? "Salva la fascia" : "Aggiungi la fascia"}
          </Button>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={busy}>
            Annulla
          </Button>
        </>
      }
      data-test="slot-drawer"
    >
      <FieldSizeProvider size="sm">
        <ValidationSummary errors={summary} className="mb-5" />

        <DrawerSection eyebrow="Quando">
          <div className="flex flex-col gap-4">
            <Field label="Ricorrenza" htmlFor="slot-ambito">
              <SegmentedControl<SlotAmbito>
                aria-label="Ricorrenza"
                value={values.ambito}
                onChange={(value) => set("ambito", value)}
                options={[
                  { value: "weekly", label: "Ogni settimana" },
                  { value: "date", label: "Una data sola" },
                ]}
              />
            </Field>
            <FormGrid>
              {values.ambito === "weekly" ? (
                <Field label="Giorno della settimana" htmlFor="slot-weekday">
                  <Select id="slot-weekday" value={values.weekday} onValueChange={(value) => set("weekday", value)} options={GIORNI.map((giorno) => ({ value: String(giorno.valore), label: giorno.nome }))} />
                </Field>
              ) : (
                <Field label="Data" htmlFor="slot-specificDate" required error={errors.specificDate} width="14ch">
                  <DateInput id="slot-specificDate" value={values.specificDate} onChange={(event) => set("specificDate", event.target.value)} />
                </Field>
              )}
              <Field label="Durata del colloquio" htmlFor="slot-durationMinutes" helper="In minuti: la fascia si divide in appuntamenti di questa durata." width="12ch">
                <TextInput id="slot-durationMinutes" type="number" numeric min={5} step={5} value={values.durationMinutes} trailing="min" onChange={(event) => set("durationMinutes", event.target.value)} />
              </Field>
              <Field label="Dalle" htmlFor="slot-startTime" required error={errors.startTime} width="12ch">
                <TimeInput id="slot-startTime" value={values.startTime} onChange={(event) => set("startTime", event.target.value)} />
              </Field>
              <Field label="Alle" htmlFor="slot-endTime" required error={errors.endTime} width="12ch">
                <TimeInput id="slot-endTime" value={values.endTime} onChange={(event) => set("endTime", event.target.value)} />
              </Field>
            </FormGrid>
          </div>
        </DrawerSection>

        <DrawerSection eyebrow="Dove e con chi">
          <FormGrid>
            <Field label="Sede" htmlFor="slot-siteId">
              <Select id="slot-siteId" value={values.siteId || "__all__"} onValueChange={(value) => set("siteId", value === "__all__" ? "" : value)} options={sedeOptions.map((option) => ({ ...option, value: option.value || "__all__" }))} />
            </Field>
            <Field label="Operatore" htmlFor="slot-assignedToUserId" helper="Solo chi ha un account puo tenere un'agenda propria.">
              {operatoreOptions.length > 8 ? (
                <SearchableSelect id="slot-assignedToUserId" value={values.assignedToUserId || "__desk__"} onValueChange={(value) => set("assignedToUserId", !value || value === "__desk__" ? "" : value)} options={operatoreOptions.map((option) => ({ ...option, value: option.value || "__desk__" }))} searchPlaceholder="Cerca per nome" />
              ) : (
                <Select id="slot-assignedToUserId" value={values.assignedToUserId || "__desk__"} onValueChange={(value) => set("assignedToUserId", value === "__desk__" ? "" : value)} options={operatoreOptions.map((option) => ({ ...option, value: option.value || "__desk__" }))} />
              )}
            </Field>
          </FormGrid>
        </DrawerSection>

        <DrawerSection eyebrow="In vigore">
          <FormGrid>
            <Field label="In vigore dal" htmlFor="slot-validFrom" optional width="14ch">
              <DateInput id="slot-validFrom" value={values.validFrom} onChange={(event) => set("validFrom", event.target.value)} />
            </Field>
            <Field label="Fino al" htmlFor="slot-validUntil" optional width="14ch">
              <DateInput id="slot-validUntil" value={values.validUntil} onChange={(event) => set("validUntil", event.target.value)} />
            </Field>
          </FormGrid>
        </DrawerSection>

        <DrawerSection eyebrow="Note e stato">
          <div className="flex flex-col gap-4">
            <Field label="Note interne" htmlFor="slot-notes" optional>
              <Textarea id="slot-notes" rows={2} value={values.notes} placeholder="Promemoria per chi tiene l'agenda: la famiglia non le legge" onChange={(event) => set("notes", event.target.value)} />
            </Field>
            <InsetBlock className="flex items-start justify-between gap-3">
              <label htmlFor="slot-active" className="font-brand text-[12.5px] font-semibold text-egw-ink">
                Fascia attiva
                <span className="block font-normal text-egw-ink-62">{values.active ? "Attiva: si propone alle famiglie" : values.ambito === "date" ? "Non attiva: quel giorno non si riceve, nemmeno nelle fasce settimanali" : "Non attiva: non si propone, ma resta nella storia"}</span>
              </label>
              <Toggle id="slot-active" checked={values.active} onCheckedChange={(next) => set("active", next)} aria-label="Fascia attiva" />
            </InsetBlock>
          </div>
        </DrawerSection>
      </FieldSizeProvider>
    </Drawer>
  );
}
