"use client";

import * as React from "react";
import { Drawer } from "@/components/web/overlays/Drawer";
import { DateInput, Field, FieldSizeProvider, Select, TextInput, Textarea, ValidationSummary, type SelectOption } from "@/components/web/forms/Field";
import { Button } from "@/components/web/primitives/Button";
import { todayLocalDateOnly } from "@/lib/date-only";
import { SuggestInput } from "@/components/secretariat/v2/suggest-input";
import { deskSlotsForDate, type OpeningHours, type PersonOption } from "@/components/secretariat/v2/secretariat-model";

/**
 * «Nuovo appuntamento» dal desk (cassetto 480, ≤8 campi): gli stessi cinque
 * campi della V1 — data, titolo, orario fra gli slot di trenta minuti degli
 * orari di apertura, nominativo suggerito fra atleti, tutori, staff e
 * allenatori, descrizione. Il campo «Atleta collegato» della V1 non c'e piu:
 * raccoglieva un nome che nessuna scrittura inviava (GAP dichiarato
 * nell'audit).
 *
 * La scrittura la fa la pagina (`createClubAppointment`, come la V1): qui si
 * raccolgono i valori e si dice cosa manca, in linea e non a toast.
 */
export type NewAppointmentValues = {
  date: string;
  title: string;
  time: string;
  person: string;
  description: string;
};

export const emptyNewAppointment = (): NewAppointmentValues => ({
  date: todayLocalDateOnly(),
  title: "",
  time: "",
  person: "",
  description: "",
});

export function NewAppointmentDrawer({
  open,
  onOpenChange,
  openingHours,
  nominativi,
  onSubmit,
  onConfigureHours,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  openingHours: OpeningHours;
  nominativi: PersonOption[];
  /** Torna `true` se la scrittura e andata a buon fine (il cassetto si chiude). */
  onSubmit: (values: NewAppointmentValues) => Promise<boolean>;
  /** «Configura gli orari»: porta all'area degli orari di apertura. */
  onConfigureHours: () => void;
}) {
  const [values, setValues] = React.useState<NewAppointmentValues>(emptyNewAppointment);
  const [errors, setErrors] = React.useState<Partial<Record<keyof NewAppointmentValues, string>>>({});
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setValues(emptyNewAppointment());
      setErrors({});
    }
  }, [open]);

  const set = <K extends keyof NewAppointmentValues>(key: K, value: NewAppointmentValues[K]) => {
    setValues((current) => ({ ...current, [key]: value }));
    if (errors[key]) setErrors((current) => ({ ...current, [key]: undefined }));
  };

  const slots = React.useMemo(() => deskSlotsForDate(openingHours, values.date), [openingHours, values.date]);
  const slotOptions = React.useMemo<SelectOption[]>(
    () => [
      ...slots.morning.map((slot) => ({ value: slot, label: slot, description: "Mattina" })),
      ...slots.afternoon.map((slot) => ({ value: slot, label: slot, description: "Pomeriggio" })),
    ],
    [slots],
  );
  const noSlots = Boolean(values.date) && slotOptions.length === 0;

  const dirty = Boolean(values.title || values.time || values.person || values.description);

  const validate = () => {
    const next: typeof errors = {};
    if (!values.date) next.date = "Indica il giorno dell'appuntamento";
    if (!values.title.trim()) next.title = "Il titolo e obbligatorio";
    if (!values.time.trim()) next.time = noSlots ? "Nessun orario disponibile in questo giorno" : "Scegli un orario";
    if (!values.person.trim()) next.person = "Il nominativo e obbligatorio";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const submit = async () => {
    if (!validate()) return;
    setBusy(true);
    try {
      const ok = await onSubmit({ ...values, title: values.title.trim(), person: values.person.trim() });
      if (ok) onOpenChange(false);
    } finally {
      setBusy(false);
    }
  };

  const summary = (Object.keys(errors) as Array<keyof NewAppointmentValues>)
    .filter((key) => errors[key])
    .map((key) => ({ id: `desk-appointment-${key}`, label: errors[key] as string }));

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      width="default"
      eyebrow="Agenda"
      title="Nuovo appuntamento"
      description="Un colloquio preso allo sportello o al telefono: entra in agenda come richiesta da confermare."
      dirty={dirty && !busy}
      locked={busy}
      footer={
        <>
          <Button variant="primary" onClick={() => void submit()} loading={busy}>
            Aggiungi appuntamento
          </Button>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={busy}>
            Annulla
          </Button>
        </>
      }
      data-test="desk-appointment-drawer"
    >
      <FieldSizeProvider size="sm">
        <div className="flex flex-col gap-4">
          <ValidationSummary errors={summary} />
          <Field label="Data" htmlFor="desk-appointment-date" required error={errors.date} width="14ch">
            <DateInput id="desk-appointment-date" value={values.date} min={todayLocalDateOnly()} onChange={(event) => set("date", event.target.value)} />
          </Field>
          <Field label="Titolo" htmlFor="desk-appointment-title" required error={errors.title}>
            <TextInput id="desk-appointment-title" value={values.title} placeholder="Titolo appuntamento" onChange={(event) => set("title", event.target.value)} />
          </Field>
          <Field
            label="Orario"
            htmlFor="desk-appointment-time"
            required
            error={errors.time}
            warning={
              !values.date
                ? "Seleziona prima una data per vedere gli orari disponibili"
                : noSlots
                  ? `Nessun orario di apertura configurato per ${slots.dayLabel || "questo giorno"}: configura gli orari o scegli un altro giorno.`
                  : undefined
            }
            helper={!noSlots && values.date ? "Slot di trenta minuti dentro l'orario di apertura del giorno." : undefined}
          >
            <Select id="desk-appointment-time" value={values.time} onValueChange={(value) => set("time", value)} options={slotOptions} placeholder="Seleziona orario" disabled={!values.date || noSlots} />
          </Field>
          {noSlots ? (
            <div>
              <Button variant="text" size="xs" onClick={onConfigureHours}>
                Vai agli orari di apertura
              </Button>
            </div>
          ) : null}
          <Field
            label="Nominativo"
            htmlFor="desk-appointment-person"
            required
            error={errors.person}
            helper="La ricerca include atleti, tutori, genitori, staff e allenatori registrati nel club."
          >
            <SuggestInput
              id="desk-appointment-person"
              value={values.person}
              onValueChange={(value) => set("person", value)}
              options={nominativi.map((person) => ({
                id: person.id,
                label: person.label,
                description: person.athleteLabel && person.athleteLabel !== person.label ? `collegato a ${person.athleteLabel}` : undefined,
              }))}
              placeholder="Cerca atleta, genitore, tutore, staff o allenatore"
            />
          </Field>
          <Field label="Descrizione" htmlFor="desk-appointment-description" optional>
            <Textarea id="desk-appointment-description" value={values.description} placeholder="Dettagli appuntamento" rows={3} onChange={(event) => set("description", event.target.value)} />
          </Field>
        </div>
      </FieldSizeProvider>
    </Drawer>
  );
}
