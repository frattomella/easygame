"use client";

import * as React from "react";
import { Save } from "lucide-react";
import { Panel, PanelHeader, Hairline } from "@/components/web/primitives/Surface";
import { Field, FieldGroup, Select, TimeInput, type SelectOption } from "@/components/web/forms/Field";
import { Button } from "@/components/web/primitives/Button";
import { Skeleton } from "@/components/web/primitives/Controls";
import {
  OPENING_DAYS,
  buildTimeRange,
  parseTimeRange,
  type OpeningDayKey,
  type OpeningHours,
  type PersonOption,
} from "@/components/secretariat/v2/secretariat-model";

/**
 * Gli orari di apertura della segreteria (area «Orari di apertura»): sette
 * giorni, mattina e pomeriggio, ognuno con l'ora di inizio, di fine e la
 * persona dello staff allo sportello — la stessa forma di
 * `clubs.opening_hours` della V1 (fasce `HH:MM-HH:MM`, staff **per nome**).
 * Un salvataggio solo per tutta la settimana, come la V1; la barra dice
 * «Modifiche non salvate» finche non si salva.
 */
export function OpeningHoursPanel({
  value,
  onChange,
  staff,
  dirty,
  saving,
  loading,
  onSave,
}: {
  value: OpeningHours;
  onChange: (next: OpeningHours) => void;
  staff: PersonOption[];
  dirty: boolean;
  saving: boolean;
  loading: boolean;
  onSave: () => void;
}) {
  const staffOptions = React.useMemo<SelectOption[]>(() => staff.map((person) => ({ value: person.label, label: person.label })), [staff]);

  const update = (day: OpeningDayKey, field: keyof OpeningHours[OpeningDayKey], next: string) => {
    onChange({ ...value, [day]: { ...value[day], [field]: next } });
  };

  const optionsWith = (current: string): SelectOption[] => {
    if (!current || staffOptions.some((option) => option.value === current)) return staffOptions;
    // Un nome salvato che non e piu in organico non sparisce dal campo.
    return [{ value: current, label: `${current} (non piu in organico)` }, ...staffOptions];
  };

  return (
    <Panel as="section" aria-labelledby="egw-opening-hours-title">
      <PanelHeader
        eyebrow="Sportello"
        title={<span id="egw-opening-hours-title">Orari di apertura della segreteria</span>}
        description="Le fasce in cui la segreteria riceve. Servono anche al desk per proporre gli orari di un appuntamento e, senza una disponibilita dichiarata, alle famiglie."
        actions={
          <div className="flex items-center gap-3">
            {dirty ? <span className="font-brand text-[12px] font-medium text-egw-amber-ink">Modifiche non salvate</span> : null}
            {/* L'unico gradiente dell'area: l'intestazione di pagina non ha un primario sugli orari. */}
            <Button variant="primary" size="sm" icon={<Save />} onClick={onSave} loading={saving} disabled={loading}>
              Salva orari
            </Button>
          </div>
        }
      />
      {staffOptions.length === 0 && !loading ? (
        <p className="mb-4 font-brand text-[12.5px] text-egw-ink-62">Nessun membro dello staff trovato: aggiungilo dalla pagina Staff per assegnarlo a una fascia.</p>
      ) : null}
      <div className="flex flex-col">
        {OPENING_DAYS.map(({ key, label }, index) => {
          const day = value[key];
          const morning = parseTimeRange(day.morning);
          const afternoon = parseTimeRange(day.afternoon);
          return (
            <React.Fragment key={key}>
              {index > 0 ? <Hairline className="my-5" /> : null}
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-[132px_1fr_1fr]">
                <p className="font-brand text-[14px] font-bold text-egw-ink lg:pt-4">{label}</p>
                {loading ? (
                  <>
                    <Skeleton className="h-[112px]" />
                    <Skeleton className="h-[112px]" />
                  </>
                ) : (
                  <>
                    <FieldGroup eyebrow="Mattina" columns={3}>
                      <Field label="Dalle" htmlFor={`${key}-morning-start`}>
                        <TimeInput id={`${key}-morning-start`} value={morning.start} onChange={(event) => update(key, "morning", buildTimeRange(event.target.value, morning.end))} />
                      </Field>
                      <Field label="Alle" htmlFor={`${key}-morning-end`}>
                        <TimeInput id={`${key}-morning-end`} value={morning.end} onChange={(event) => update(key, "morning", buildTimeRange(morning.start, event.target.value))} />
                      </Field>
                      <Field label="Staff" htmlFor={`${key}-morning-staff`}>
                        <Select id={`${key}-morning-staff`} value={day.morningStaff} onValueChange={(next) => update(key, "morningStaff", next)} options={optionsWith(day.morningStaff)} placeholder="Seleziona staff" disabled={optionsWith(day.morningStaff).length === 0} />
                      </Field>
                    </FieldGroup>
                    <FieldGroup eyebrow="Pomeriggio" columns={3}>
                      <Field label="Dalle" htmlFor={`${key}-afternoon-start`}>
                        <TimeInput id={`${key}-afternoon-start`} value={afternoon.start} onChange={(event) => update(key, "afternoon", buildTimeRange(event.target.value, afternoon.end))} />
                      </Field>
                      <Field label="Alle" htmlFor={`${key}-afternoon-end`}>
                        <TimeInput id={`${key}-afternoon-end`} value={afternoon.end} onChange={(event) => update(key, "afternoon", buildTimeRange(afternoon.start, event.target.value))} />
                      </Field>
                      <Field label="Staff" htmlFor={`${key}-afternoon-staff`}>
                        <Select id={`${key}-afternoon-staff`} value={day.afternoonStaff} onValueChange={(next) => update(key, "afternoonStaff", next)} options={optionsWith(day.afternoonStaff)} placeholder="Seleziona staff" disabled={optionsWith(day.afternoonStaff).length === 0} />
                      </Field>
                    </FieldGroup>
                  </>
                )}
              </div>
            </React.Fragment>
          );
        })}
      </div>
    </Panel>
  );
}
