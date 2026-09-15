"use client";

import * as React from "react";
import { Drawer, DrawerSection } from "@/components/web/overlays/Drawer";
import { CurrencyInput, DateInput, Field, FieldSizeProvider, FormGrid, SearchableSelect, Select, TextInput, Textarea, ValidationSummary } from "@/components/web/forms/Field";
import { Button } from "@/components/web/primitives/Button";
import { SegmentedControl } from "@/components/web/primitives/Controls";
import { InfoCard } from "@/components/web/page/Cards";
import { useToast } from "@/components/ui/toast-notification";
import { apiRequest } from "@/lib/api/client";
import {
  COMPENSATION_FREQUENCIES,
  COMPENSATION_FREQUENCY_LABELS,
  RELATIONSHIP_TYPES,
  RELATIONSHIP_TYPE_HINTS,
  RELATIONSHIP_TYPE_LABELS,
  SPORT_WORK_ROLES,
  SPORT_WORK_ROLE_LABELS,
  type RelationshipType,
} from "@/lib/sport-work/model";
import { SOCIAL_COVERAGES, SOCIAL_COVERAGE_LABELS } from "@/lib/sport-work/rules";
import type { SportWorkPerson } from "@/components/sport-work/v2/sport-work-model";
import {
  emptyPersonDraft,
  emptyRelationshipDraft,
  validateRelationshipDraft,
  type FormError,
  type PersonDraft,
  type RelationshipDraft,
  type RelationshipDraftMode as Mode,
} from "@/components/sport-work/v2/sport-work-forms";

/**
 * «Nuovo rapporto» in un cassetto da 720 (guideline 08 §8.5: da nove a venti
 * campi, a sezioni). Sostituisce il dialogo della V1 con gli stessi due modi
 * — persona gia censita o persona nuova — gli stessi campi e le stesse due
 * scritture: `POST /api/v1/sport-work/people` (solo nel modo «nuova») e poi
 * `POST /api/v1/sport-work/relationships`.
 *
 * **Il tipo di rapporto si sceglie con la sua conseguenza accanto**: sotto la
 * tendina c'e cosa comporta (`RELATIONSHIP_TYPE_HINTS`). Chiedere una sigla
 * senza dire cosa cambia e il modo in cui un gestionale ottiene dati che
 * sembrano scelte e non lo sono.
 *
 * **Il rapporto nasce in bozza**, e il cassetto lo dice: attivarlo e un atto
 * separato, dalla scheda, che verifica contratto e anagrafica.
 */
export function RelationshipDrawer({
  open,
  onOpenChange,
  people,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  people: SportWorkPerson[];
  onCreated: (relationshipId: string) => void;
}) {
  const { showToast } = useToast();
  const idPrefix = "sw";
  const [mode, setMode] = React.useState<Mode>("existing");
  const [person, setPerson] = React.useState<PersonDraft>(emptyPersonDraft);
  const [form, setForm] = React.useState<RelationshipDraft>(emptyRelationshipDraft);
  const [errors, setErrors] = React.useState<FormError[]>([]);
  const [dirty, setDirty] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setMode("existing");
    setPerson(emptyPersonDraft());
    setForm(emptyRelationshipDraft());
    setErrors([]);
    setDirty(false);
  }, [open]);

  const errorFor = (field: string) => errors.find((e) => e.field === field)?.label;

  const setPersonField = (patch: Partial<PersonDraft>) => {
    setPerson((current) => ({ ...current, ...patch }));
    setDirty(true);
    if (errors.length) setErrors([]);
  };
  const setField = (patch: Partial<RelationshipDraft>) => {
    setForm((current) => ({ ...current, ...patch }));
    setDirty(true);
    if (errors.length) setErrors([]);
  };

  const submit = async () => {
    const found = validateRelationshipDraft(mode, person, form, idPrefix);
    setErrors(found);
    if (found.length) return;

    setSaving(true);
    try {
      let personId = form.personId;
      if (mode === "new") {
        const { data, error } = await apiRequest<any>("/api/v1/sport-work/people", { method: "POST", body: person });
        if (error || !data) {
          showToast("error", error?.message || "Creazione della persona non riuscita");
          return;
        }
        personId = data.id;
      }
      if (!personId) {
        showToast("error", "Seleziona una persona o creane una nuova");
        return;
      }
      const { data, error } = await apiRequest<any>("/api/v1/sport-work/relationships", { method: "POST", body: { ...form, personId } });
      if (error || !data) {
        showToast("error", error?.message || "Creazione del rapporto non riuscita");
        return;
      }
      setDirty(false);
      showToast("success", "Rapporto creato in bozza");
      onOpenChange(false);
      onCreated(String(data.id));
    } finally {
      setSaving(false);
    }
  };

  const peopleOptions = React.useMemo(
    () => people.map((row) => ({ value: String(row.id), label: row.fiscal_code ? `${row.full_name} — ${row.fiscal_code}` : row.full_name })),
    [people],
  );

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      width="wide"
      eyebrow="Rapporti"
      title="Nuovo rapporto di lavoro sportivo"
      description="Il rapporto nasce in bozza. Si attiva dalla sua scheda, quando ci sono contratto e anagrafica."
      dirty={dirty}
      locked={saving}
      data-test="sport-work-relationship-drawer"
      footer={
        <>
          <Button variant="primary" onClick={() => void submit()} loading={saving}>
            Crea rapporto
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

          <DrawerSection eyebrow="Persona">
            <SegmentedControl<Mode>
              aria-label="Persona del rapporto"
              value={mode}
              onChange={(next) => {
                setMode(next);
                if (errors.length) setErrors([]);
              }}
              options={[
                { value: "existing", label: "Persona già censita" },
                { value: "new", label: "Nuova persona" },
              ]}
              className="mb-4"
            />
            {mode === "existing" ? (
              <Field label="Persona" htmlFor={`${idPrefix}-person`} required error={errorFor("personId")}>
                <SearchableSelect
                  id={`${idPrefix}-person`}
                  value={form.personId || null}
                  onValueChange={(value) => setField({ personId: value || "" })}
                  options={peopleOptions}
                  placeholder="Seleziona una persona"
                  searchPlaceholder="Cerca per nome o codice fiscale"
                  emptyLabel="Nessuna persona censita"
                />
              </Field>
            ) : (
              <div className="flex flex-col gap-5">
                <FormGrid>
                  <Field label="Nome" htmlFor={`${idPrefix}-first`} required error={errorFor("firstName")}>
                    <TextInput id={`${idPrefix}-first`} value={person.firstName} onChange={(event) => setPersonField({ firstName: event.target.value })} autoComplete="off" />
                  </Field>
                  <Field label="Cognome" htmlFor={`${idPrefix}-last`} required error={errorFor("lastName")}>
                    <TextInput id={`${idPrefix}-last`} value={person.lastName} onChange={(event) => setPersonField({ lastName: event.target.value })} autoComplete="off" />
                  </Field>
                  <Field label="Codice fiscale" htmlFor={`${idPrefix}-cf`} width="20ch" error={errorFor("fiscalCode")}>
                    <TextInput id={`${idPrefix}-cf`} className="egw-num uppercase" value={person.fiscalCode} onChange={(event) => setPersonField({ fiscalCode: event.target.value })} maxLength={16} />
                  </Field>
                  <Field label="Email" htmlFor={`${idPrefix}-email`}>
                    <TextInput id={`${idPrefix}-email`} type="email" inputMode="email" value={person.email} onChange={(event) => setPersonField({ email: event.target.value })} />
                  </Field>
                </FormGrid>
                <Field label="Copertura previdenziale dichiarata" htmlFor={`${idPrefix}-coverage`} helper="Decide l'aliquota. La dichiara il lavoratore: EasyGame non la deduce dal ruolo.">
                  <Select
                    id={`${idPrefix}-coverage`}
                    value={person.socialCoverage}
                    onValueChange={(value) => setPersonField({ socialCoverage: value })}
                    options={SOCIAL_COVERAGES.map((coverage) => ({ value: coverage, label: SOCIAL_COVERAGE_LABELS[coverage] }))}
                  />
                </Field>
              </div>
            )}
          </DrawerSection>

          <DrawerSection eyebrow="Rapporto">
            <div className="flex flex-col gap-5">
              <FormGrid>
                <Field label="Ruolo" htmlFor={`${idPrefix}-role`}>
                  <Select
                    id={`${idPrefix}-role`}
                    value={form.role}
                    onValueChange={(value) => setField({ role: value })}
                    options={SPORT_WORK_ROLES.map((role) => ({ value: role, label: SPORT_WORK_ROLE_LABELS[role] }))}
                  />
                </Field>
                <Field label="Tipo di rapporto" htmlFor={`${idPrefix}-type`} helper={RELATIONSHIP_TYPE_HINTS[form.relationshipType]}>
                  <Select
                    id={`${idPrefix}-type`}
                    value={form.relationshipType}
                    onValueChange={(value) => setField({ relationshipType: value as RelationshipType })}
                    options={RELATIONSHIP_TYPES.map((type) => ({ value: type, label: RELATIONSHIP_TYPE_LABELS[type] }))}
                  />
                </Field>
                <Field label="Inizio" htmlFor={`${idPrefix}-start`} required width="14ch" error={errorFor("startDate")}>
                  <DateInput id={`${idPrefix}-start`} value={form.startDate} onChange={(event) => setField({ startDate: event.target.value })} />
                </Field>
                <Field label="Fine" htmlFor={`${idPrefix}-end`} width="14ch" error={errorFor("endDate")}>
                  <DateInput id={`${idPrefix}-end`} value={form.endDate} onChange={(event) => setField({ endDate: event.target.value })} />
                </Field>
                <Field label="Importo pattuito" htmlFor={`${idPrefix}-amount`} width="16ch">
                  <CurrencyInput id={`${idPrefix}-amount`} value={form.contractAmount} onChange={(event) => setField({ contractAmount: event.target.value })} />
                </Field>
                <Field label="Periodicità" htmlFor={`${idPrefix}-frequency`}>
                  <Select
                    id={`${idPrefix}-frequency`}
                    value={form.compensationFrequency}
                    onValueChange={(value) => setField({ compensationFrequency: value })}
                    options={COMPENSATION_FREQUENCIES.map((frequency) => ({ value: frequency, label: COMPENSATION_FREQUENCY_LABELS[frequency] }))}
                  />
                </Field>
                <Field
                  label="Ore settimanali dichiarate"
                  htmlFor={`${idPrefix}-hours`}
                  width="12ch"
                  helper="Oltre 24 ore la presunzione di autonomia non opera più: il dato serve al consulente, EasyGame non ne trae conclusioni."
                >
                  <TextInput id={`${idPrefix}-hours`} numeric inputMode="decimal" value={form.weeklyHours} onChange={(event) => setField({ weeklyHours: event.target.value })} />
                </Field>
              </FormGrid>
              <Field label="Note" htmlFor={`${idPrefix}-notes`} optional>
                <Textarea id={`${idPrefix}-notes`} rows={2} value={form.notes} onChange={(event) => setField({ notes: event.target.value })} />
              </Field>
            </div>
          </DrawerSection>

          <InfoCard eyebrow="Cosa succede dopo">
            Il rapporto nasce in bozza. Dalla scheda si allega il contratto, si costruisce il piano compensi e si attiva quando anagrafica e contratto ci sono.
          </InfoCard>
        </div>
      </FieldSizeProvider>
    </Drawer>
  );
}
