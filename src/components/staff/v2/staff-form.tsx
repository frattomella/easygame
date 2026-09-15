"use client";

import * as React from "react";
import { Field, FormGrid, Select, TextInput, Textarea, DateInput, ValidationSummary } from "@/components/web/forms/Field";
import { Button } from "@/components/web/primitives/Button";
import { InsetBlock, Panel, PanelHeader } from "@/components/web/primitives/Surface";
import { PersonIdentityFields } from "@/components/forms/person-identity-fields";
import { PersonResidenceFields } from "@/components/forms/assisted-anagrafica";
import { PhoneField } from "@/components/forms/phone-field";
import { DocumentExtractionField } from "@/components/forms/document-extraction-field";
import { ClothingSizesFields } from "@/components/forms/clothing-sizes-fields";
import { LEGACY_PERSON_NAME_KEYS, readPersonIdentity, writePersonIdentity } from "@/lib/person-identity";
import { CUSTOM_OPTION_VALUE, normalizeDepartmentName, type StaffDepartment } from "@/lib/staff-directory";
import { STAFF_DOCUMENT_TYPES, STAFF_STATUS_OPTIONS } from "@/components/staff/v2/staff-model";
import { validateStaffForm, type StaffFormError, type StaffFormValues } from "@/components/staff/v2/staff-form-model";

export { emptyStaffFormValues, staffFormValuesFrom, validateStaffForm } from "@/components/staff/v2/staff-form-model";
export type { StaffFormError, StaffFormValues } from "@/components/staff/v2/staff-form-model";

/**
 * Il modulo di un membro dello staff (guideline 08 §8.4–8.5: pagina intera a
 * sezioni, barra delle azioni appiccicosa, riepilogo degli errori in cima).
 *
 * Le sezioni sono le sei card della V1 (`/staff/new`) piu i campi che la
 * scheda V1 modificava nella sua modale (eta, formazione, data di rilascio e
 * permesso di soggiorno). Ogni sezione e anche un componente a se, cosi i
 * cassetti della scheda (`staff-section-drawer.tsx`) montano **gli stessi
 * campi** senza una seconda copia: il blocco anagrafico, la residenza, il
 * telefono, le taglie e la lettura del documento restano quelli condivisi da
 * tutte le anagrafiche.
 */
type SectionProps = {
  idPrefix: string;
  values: StaffFormValues;
  onChange: (patch: Partial<StaffFormValues>) => void;
  errors?: StaffFormError[];
};

const errorFor = (errors: StaffFormError[] | undefined, field: string) =>
  errors?.find((e) => e.field === field)?.label;

/* ── Anagrafica ──────────────────────────────────────────────────────────── */
export function StaffIdentitySection({
  idPrefix,
  values,
  onChange,
  errors,
  withDocumentReader = false,
  withExtras = false,
  requireNames = true,
}: SectionProps & {
  /** La lettura OCR del documento (solo dove si crea, come nella V1). */
  withDocumentReader?: boolean;
  /** Eta e formazione scolastica: la scheda V1 li modificava, il modulo di creazione no. */
  withExtras?: boolean;
  requireNames?: boolean;
}) {
  return (
    <div className="flex flex-col gap-5">
      {withDocumentReader ? (
        <DocumentExtractionField
          currentValues={{ ...values }}
          onApply={(patch) => onChange(patch as Partial<StaffFormValues>)}
        />
      ) : null}
      <PersonIdentityFields
        idPrefix={idPrefix}
        values={readPersonIdentity(values, LEGACY_PERSON_NAME_KEYS)}
        required={requireNames ? { firstName: true, lastName: true } : undefined}
        onChange={(patch) => onChange(writePersonIdentity(patch, LEGACY_PERSON_NAME_KEYS) as Partial<StaffFormValues>)}
      />
      {errorFor(errors, "name") || errorFor(errors, "surname") ? (
        <p role="alert" className="-mt-2 font-brand text-[11.5px] font-medium text-egw-red">
          {[errorFor(errors, "name"), errorFor(errors, "surname")].filter(Boolean).join(" · ")}
        </p>
      ) : null}
      <FormGrid>
        <Field label="Nazionalità" htmlFor={`${idPrefix}-nationality`}>
          <TextInput
            id={`${idPrefix}-nationality`}
            value={values.nationality}
            onChange={(event) => onChange({ nationality: event.target.value })}
            placeholder="Inserisci la nazionalità"
          />
        </Field>
        {withExtras ? (
          <>
            <Field label="Età" htmlFor={`${idPrefix}-age`} width="12ch">
              <TextInput
                id={`${idPrefix}-age`}
                type="number"
                numeric
                inputMode="numeric"
                value={values.age}
                onChange={(event) => onChange({ age: event.target.value })}
              />
            </Field>
            <Field label="Formazione scolastica" htmlFor={`${idPrefix}-education`}>
              <TextInput
                id={`${idPrefix}-education`}
                value={values.education}
                onChange={(event) => onChange({ education: event.target.value })}
              />
            </Field>
          </>
        ) : null}
      </FormGrid>
    </div>
  );
}

/* ── Taglie vestiario ────────────────────────────────────────────────────── */
export function StaffClothingSection({ idPrefix, values, onChange }: SectionProps) {
  return (
    <ClothingSizesFields
      idPrefix={`${idPrefix}-clothing`}
      value={values.clothingSizes}
      onChange={(clothingSizes) => onChange({ clothingSizes })}
      person={{ gender: values.gender, birthDate: values.birthDate }}
    />
  );
}

/* ── Contatti e residenza ────────────────────────────────────────────────── */
export function StaffContactsSection({ idPrefix, values, onChange, errors, requireContact = true }: SectionProps & { requireContact?: boolean }) {
  const contactError = errorFor(errors, "contact");
  return (
    <div className="flex flex-col gap-5">
      <FormGrid>
        <Field label="Email" htmlFor={`${idPrefix}-email`} required={requireContact} error={contactError}>
          <TextInput
            id={`${idPrefix}-email`}
            type="email"
            inputMode="email"
            autoComplete="email"
            value={values.email}
            onChange={(event) => onChange({ email: event.target.value })}
            placeholder="email@esempio.com"
          />
        </Field>
        <div className="flex min-w-0 flex-col">
          <PhoneField
            id={`${idPrefix}-phone`}
            label={requireContact ? "Telefono *" : "Telefono"}
            value={values.phone}
            onChange={(phone) => onChange({ phone })}
          />
          {requireContact ? (
            <p className="mt-[7px] font-brand text-[11.5px] font-medium text-[rgba(11,26,58,.55)]">* Almeno un contatto è obbligatorio</p>
          ) : null}
        </div>
      </FormGrid>
      <PersonResidenceFields
        idPrefix={idPrefix}
        values={{ address: values.address, city: values.city, postalCode: values.postalCode }}
        onChange={(patch) => onChange(patch as Partial<StaffFormValues>)}
      />
    </div>
  );
}

/* ── Documento di identita ───────────────────────────────────────────────── */
export function StaffDocumentSection({ idPrefix, values, onChange }: SectionProps) {
  const known = STAFF_DOCUMENT_TYPES.some((t) => t.value === values.documentType);
  const options = [
    ...STAFF_DOCUMENT_TYPES,
    ...(values.documentType && !known ? [{ value: values.documentType, label: values.documentType }] : []),
  ];
  return (
    <FormGrid>
      <Field label="Tipo documento" htmlFor={`${idPrefix}-document-type`}>
        <Select
          id={`${idPrefix}-document-type`}
          value={values.documentType}
          onValueChange={(documentType) => onChange({ documentType })}
          options={options}
          placeholder="Seleziona tipo"
        />
      </Field>
      <Field label="Numero documento" htmlFor={`${idPrefix}-document-number`}>
        <TextInput
          id={`${idPrefix}-document-number`}
          value={values.documentNumber}
          onChange={(event) => onChange({ documentNumber: event.target.value })}
          placeholder="Inserisci il numero"
        />
      </Field>
      <Field label="Data di rilascio" htmlFor={`${idPrefix}-document-issue`} width="16ch">
        <DateInput
          id={`${idPrefix}-document-issue`}
          value={values.documentIssueDate}
          onChange={(event) => onChange({ documentIssueDate: event.target.value })}
        />
      </Field>
      <Field label="Scadenza documento" htmlFor={`${idPrefix}-document-expiry`} width="16ch">
        <DateInput
          id={`${idPrefix}-document-expiry`}
          value={values.documentExpiry}
          onChange={(event) => onChange({ documentExpiry: event.target.value })}
        />
      </Field>
      <Field label="Scadenza permesso di soggiorno" htmlFor={`${idPrefix}-permit-expiry`} width="16ch">
        <DateInput
          id={`${idPrefix}-permit-expiry`}
          value={values.residencePermitExpiry}
          onChange={(event) => onChange({ residencePermitExpiry: event.target.value })}
        />
      </Field>
    </FormGrid>
  );
}

/* ── Dati societari ──────────────────────────────────────────────────────── */
const NO_DEPARTMENT = "__none__";

export function StaffCompanySection({
  idPrefix,
  values,
  onChange,
  errors,
  roles,
  departments,
}: SectionProps & { roles: string[]; departments: StaffDepartment[] }) {
  const roleKnown = roles.some((role) => role === values.role);
  const [customRole, setCustomRole] = React.useState(() => Boolean(values.role) && !roleKnown);
  const currentDepartment = normalizeDepartmentName(values.department);
  const departmentNames = departments.map((d) => normalizeDepartmentName(d.name)).filter(Boolean);
  const savedDepartmentName = departmentNames.find((name) => name.toLowerCase() === currentDepartment.toLowerCase());
  const departmentKnown = Boolean(savedDepartmentName);
  /** Il valore della tendina: il nome salvato, il nome della scheda se non e in elenco, «Non assegnato» se vuoto. */
  const departmentValue = currentDepartment ? savedDepartmentName || currentDepartment : NO_DEPARTMENT;
  const [customDepartment, setCustomDepartment] = React.useState(() => Boolean(currentDepartment) && !departmentKnown);

  const roleOptions = [
    ...roles.map((role) => ({ value: role, label: role })),
    { value: CUSTOM_OPTION_VALUE, label: "Altro..." },
  ];
  const departmentOptions = [
    { value: NO_DEPARTMENT, label: "Non assegnato" },
    ...departmentNames.map((name) => ({ value: name, label: name })),
    { value: CUSTOM_OPTION_VALUE, label: "Altro..." },
  ];

  return (
    <FormGrid>
      <Field label="Ruolo" htmlFor={`${idPrefix}-role`} required error={errorFor(errors, "role")}>
        <div className="flex flex-col gap-2">
          <Select
            id={`${idPrefix}-role`}
            value={customRole ? CUSTOM_OPTION_VALUE : values.role}
            onValueChange={(value) => {
              if (value === CUSTOM_OPTION_VALUE) {
                setCustomRole(true);
                onChange({ role: "" });
              } else {
                setCustomRole(false);
                onChange({ role: value });
              }
            }}
            options={roleOptions}
            placeholder="Seleziona ruolo"
          />
          {customRole ? (
            <TextInput
              id={`${idPrefix}-role-custom`}
              aria-label="Ruolo personalizzato"
              value={values.role}
              onChange={(event) => onChange({ role: event.target.value })}
              placeholder="Inserisci ruolo personalizzato"
            />
          ) : null}
        </div>
      </Field>
      <Field label="Reparto" htmlFor={`${idPrefix}-department`} helper="I reparti disponibili arrivano dalla gestione reparti dello staff.">
        <div className="flex flex-col gap-2">
          <Select
            id={`${idPrefix}-department`}
            value={customDepartment ? CUSTOM_OPTION_VALUE : departmentValue}
            onValueChange={(value) => {
              if (value === CUSTOM_OPTION_VALUE) {
                setCustomDepartment(true);
                onChange({ department: "" });
              } else {
                setCustomDepartment(false);
                onChange({ department: value === NO_DEPARTMENT ? "" : value });
              }
            }}
            options={
              currentDepartment && !departmentKnown && !customDepartment
                ? [...departmentOptions, { value: currentDepartment, label: currentDepartment }]
                : departmentOptions
            }
            placeholder="Seleziona reparto"
          />
          {customDepartment ? (
            <TextInput
              id={`${idPrefix}-department-custom`}
              aria-label="Reparto personalizzato"
              value={values.department}
              onChange={(event) => onChange({ department: event.target.value })}
              placeholder="Inserisci reparto personalizzato"
            />
          ) : null}
        </div>
      </Field>
      <Field label="Data assunzione" htmlFor={`${idPrefix}-hire-date`} width="16ch">
        <DateInput
          id={`${idPrefix}-hire-date`}
          value={values.hireDate}
          onChange={(event) => onChange({ hireDate: event.target.value })}
        />
      </Field>
      <Field label="Stato" htmlFor={`${idPrefix}-status`}>
        <Select
          id={`${idPrefix}-status`}
          value={values.status}
          onValueChange={(status) => onChange({ status })}
          options={STAFF_STATUS_OPTIONS}
          placeholder="Seleziona stato"
        />
      </Field>
    </FormGrid>
  );
}

/* ── Note ────────────────────────────────────────────────────────────────── */
export function StaffNotesSection({ idPrefix, values, onChange }: SectionProps) {
  return (
    <Field label="Note" htmlFor={`${idPrefix}-notes`}>
      <Textarea
        id={`${idPrefix}-notes`}
        value={values.notes}
        onChange={(event) => onChange({ notes: event.target.value })}
        placeholder="Inserisci eventuali note..."
        rows={4}
      />
    </Field>
  );
}

/* ── La pagina intera ────────────────────────────────────────────────────── */
export function StaffForm({
  mode,
  idPrefix,
  initialValues,
  roles,
  departments,
  onSubmit,
  onCancel,
  submitLabel,
  submitting = false,
  dangerZone,
}: {
  mode: "create" | "edit";
  idPrefix: string;
  initialValues: StaffFormValues;
  roles: string[];
  departments: StaffDepartment[];
  onSubmit: (values: StaffFormValues) => Promise<void> | void;
  onCancel: () => void;
  submitLabel: string;
  submitting?: boolean;
  /** Il blocco «Zona pericolosa» in fondo (solo in modifica). */
  dangerZone?: React.ReactNode;
}) {
  const [values, setValues] = React.useState<StaffFormValues>(initialValues);
  const [errors, setErrors] = React.useState<StaffFormError[]>([]);
  const [dirty, setDirty] = React.useState(false);
  const formId = `${idPrefix}-form`;

  const update = (patch: Partial<StaffFormValues>) => {
    setValues((current) => ({ ...current, ...patch }));
    setDirty(true);
    if (errors.length) setErrors((current) => current.filter((e) => !(e.field in patch || (e.field === "contact" && ("email" in patch || "phone" in patch)))));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const found = validateStaffForm(values, idPrefix);
    setErrors(found);
    if (found.length) {
      const first = found[0]?.id ? document.getElementById(found[0].id!) : null;
      first?.scrollIntoView({ block: "center" });
      first?.focus();
      return;
    }
    await onSubmit(values);
    setDirty(false);
  };

  return (
    <form id={formId} onSubmit={handleSubmit} noValidate className="flex flex-col gap-[18px]" data-test="staff-form">
      <ValidationSummary errors={errors} />

      <Panel as="section">
        <PanelHeader eyebrow="Anagrafica" title="Dati della persona" description="Nome, cognome, nascita e codice fiscale." />
        <StaffIdentitySection idPrefix={idPrefix} values={values} onChange={update} errors={errors} withDocumentReader={mode === "create"} withExtras={mode === "edit"} />
      </Panel>

      <Panel as="section">
        <PanelHeader eyebrow="Taglie vestiario" title="Taglie" description="Profilo, maglia, pantalone e scarpe per il materiale del club." />
        <StaffClothingSection idPrefix={idPrefix} values={values} onChange={update} />
      </Panel>

      <Panel as="section">
        <PanelHeader eyebrow="Contatti" title="Contatti e residenza" description="Almeno un recapito fra email e telefono." />
        <StaffContactsSection idPrefix={idPrefix} values={values} onChange={update} errors={errors} />
      </Panel>

      <Panel as="section">
        <PanelHeader eyebrow="Documenti" title="Documento di identità" />
        <StaffDocumentSection idPrefix={idPrefix} values={values} onChange={update} />
      </Panel>

      <Panel as="section">
        <PanelHeader eyebrow="Dati societari" title="Ruolo nel club" description="Ruolo, reparto, data di assunzione e stato." />
        <StaffCompanySection idPrefix={idPrefix} values={values} onChange={update} errors={errors} roles={roles} departments={departments} />
      </Panel>

      <Panel as="section">
        <PanelHeader eyebrow="Note" title="Note" />
        <StaffNotesSection idPrefix={idPrefix} values={values} onChange={update} />
      </Panel>

      {dangerZone ? (
        <InsetBlock className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="font-brand text-[10px] font-bold uppercase tracking-[var(--egw-track-eyebrow)] text-egw-red">Zona pericolosa</p>
            <p className="mt-1 font-brand text-[12.5px] text-egw-ink-72">Eliminare la scheda toglie la persona dall&apos;elenco dello staff. L&apos;operazione non è reversibile.</p>
          </div>
          {dangerZone}
        </InsetBlock>
      ) : null}

      <div className="sticky bottom-0 z-[3] mt-2 flex min-h-[64px] flex-wrap items-center justify-between gap-3 rounded-egw-panel-sm border border-egw-panel-border bg-white px-4 py-3 shadow-egw-plane-1">
        <span className="font-brand text-[12px] font-medium text-egw-amber-ink" aria-live="polite">
          {dirty ? "Modifiche non salvate" : ""}
        </span>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" variant="primary" loading={submitting}>
            {submitLabel}
          </Button>
          <Button type="button" variant="secondary" onClick={onCancel} disabled={submitting}>
            Annulla
          </Button>
        </div>
      </div>
    </form>
  );
}
