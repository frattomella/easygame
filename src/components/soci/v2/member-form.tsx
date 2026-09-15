"use client";

import * as React from "react";
import { DateInput, Field, FormGrid, Select, TextInput, Textarea, ValidationSummary } from "@/components/web/forms/Field";
import { Panel, PanelHeader } from "@/components/web/primitives/Surface";
import { DangerZone, StickyActionBar } from "@/components/web/page/StickyActionBar";
import { PersonIdentityFields } from "@/components/forms/person-identity-fields";
import { PersonResidenceFields } from "@/components/forms/assisted-anagrafica";
import { PhoneField } from "@/components/forms/phone-field";
import { DocumentExtractionField } from "@/components/forms/document-extraction-field";
import { ClothingSizesFields } from "@/components/forms/clothing-sizes-fields";
import { MEMBER_TYPES } from "@/lib/member-types";
import { MEMBERSHIP_REGISTER_DISCLAIMER } from "@/lib/members/model";
import { validateMemberForm, type MemberFormError, type MemberFormValues } from "@/components/soci/v2/member-form-model";

export { emptyMemberFormValues, memberFormValuesFrom, validateMemberForm } from "@/components/soci/v2/member-form-model";
export type { MemberFormError, MemberFormValues } from "@/components/soci/v2/member-form-model";

/**
 * Il modulo di un socio (guideline 08 §8.4–8.5: pagina intera a sezioni,
 * barra delle azioni appiccicosa, riepilogo degli errori in cima).
 *
 * Le sezioni sono le quattro card della V1 (`/soci/new`: anagrafica,
 * indirizzo, taglie, ammissione) piu i dati associativi che la scheda V1
 * modificava nella sua modale (tipo, data di iscrizione, scadenza, stato).
 * Ogni sezione e anche un componente a se, cosi i cassetti della scheda
 * (`member-section-drawer.tsx`) montano **gli stessi campi** senza una
 * seconda copia: il blocco anagrafico, la residenza, il telefono, le taglie
 * e la lettura del documento restano quelli condivisi da tutte le anagrafiche.
 */
type SectionProps = {
  idPrefix: string;
  values: MemberFormValues;
  onChange: (patch: Partial<MemberFormValues>) => void;
  errors?: MemberFormError[];
};

const errorFor = (errors: MemberFormError[] | undefined, field: string) => errors?.find((e) => e.field === field)?.label;

export const MEMBER_STATUS_OPTIONS = [
  { value: "active", label: "Attivo" },
  { value: "inactive", label: "Inattivo" },
] as const;

/** Un tipo storico fuori elenco resta scelto: cancellarlo sarebbe una perdita di dato. */
const memberTypeOptions = (current: string) => {
  const known = (MEMBER_TYPES as readonly string[]).includes(current);
  return [
    ...MEMBER_TYPES.map((memberType) => ({ value: memberType, label: memberType })),
    ...(current && !known ? [{ value: current, label: current }] : []),
  ];
};

/* ── Anagrafica ──────────────────────────────────────────────────────────── */
export function MemberIdentitySection({
  idPrefix,
  values,
  onChange,
  errors,
  withDocumentReader = false,
  withType = false,
  requireNames = true,
}: SectionProps & {
  /** La lettura OCR del documento (solo dove si crea, come nella V1). */
  withDocumentReader?: boolean;
  /** Il tipo di socio si decide alla creazione (Blocco 7, punto 8). */
  withType?: boolean;
  requireNames?: boolean;
}) {
  const nameError = errorFor(errors, "name");
  return (
    <div className="flex flex-col gap-5">
      {withDocumentReader ? <DocumentExtractionField currentValues={{ ...values }} onApply={(patch) => onChange(patch as Partial<MemberFormValues>)} /> : null}
      {/* I sei campi di identita, nell'ordine condiviso: i recapiti stanno in un'altra sezione. */}
      <PersonIdentityFields
        idPrefix={idPrefix}
        values={values}
        required={requireNames ? { firstName: true, lastName: true } : undefined}
        onChange={(patch) => onChange(patch as Partial<MemberFormValues>)}
      />
      {nameError ? (
        <p role="alert" className="-mt-2 font-brand text-[11.5px] font-medium text-egw-red">
          {nameError}
        </p>
      ) : null}
      {withType ? (
        <FormGrid>
          <Field label="Tipo socio" htmlFor={`${idPrefix}-type`}>
            <Select id={`${idPrefix}-type`} value={values.type} onValueChange={(type) => onChange({ type })} options={memberTypeOptions(values.type)} placeholder="Seleziona il tipo" />
          </Field>
        </FormGrid>
      ) : null}
    </div>
  );
}

/* ── Contatti e residenza ────────────────────────────────────────────────── */
export function MemberContactsSection({ idPrefix, values, onChange }: SectionProps) {
  return (
    <div className="flex flex-col gap-5">
      <FormGrid>
        <Field label="Email" htmlFor={`${idPrefix}-email`}>
          <TextInput
            id={`${idPrefix}-email`}
            type="email"
            inputMode="email"
            autoComplete="email"
            value={values.email}
            onChange={(event) => onChange({ email: event.target.value })}
            placeholder="mario.rossi@email.com"
          />
        </Field>
        <div className="flex min-w-0 flex-col">
          <PhoneField id={`${idPrefix}-phone`} label="Telefono" value={values.phone} onChange={(phone) => onChange({ phone })} />
        </div>
      </FormGrid>
      {/* Via, comune e CAP dal componente condiviso: il comune si cerca nell'archivio ISTAT e porta con se il CAP quando ne ha uno solo. */}
      <PersonResidenceFields
        idPrefix={idPrefix}
        addressLabel="Via/Piazza"
        values={{ address: values.address, city: values.city, postalCode: values.postalCode }}
        onChange={(patch) => onChange(patch as Partial<MemberFormValues>)}
      />
    </div>
  );
}

/* ── Taglie vestiario ────────────────────────────────────────────────────── */
export function MemberClothingSection({ idPrefix, values, onChange }: SectionProps) {
  return (
    <ClothingSizesFields
      idPrefix={`${idPrefix}-clothing`}
      value={values.clothingSizes}
      onChange={(clothingSizes) => onChange({ clothingSizes })}
      person={{ gender: values.gender, birthDate: values.birthDate }}
    />
  );
}

/* ── Dati associativi (scheda) ───────────────────────────────────────────── */
export function MemberMembershipSection({ idPrefix, values, onChange }: SectionProps) {
  return (
    <FormGrid>
      <Field label="Tipo socio" htmlFor={`${idPrefix}-type`}>
        <Select id={`${idPrefix}-type`} value={values.type} onValueChange={(type) => onChange({ type })} options={memberTypeOptions(values.type)} placeholder="Seleziona il tipo" />
      </Field>
      <Field label="Stato della scheda" htmlFor={`${idPrefix}-status`} helper="Dice se la scheda è in uso. La qualifica di socio è nel libro soci.">
        <Select id={`${idPrefix}-status`} value={values.status} onValueChange={(status) => onChange({ status })} options={MEMBER_STATUS_OPTIONS} placeholder="Seleziona stato" />
      </Field>
      <Field label="Data iscrizione" htmlFor={`${idPrefix}-registration-date`} width="16ch">
        <DateInput id={`${idPrefix}-registration-date`} value={values.registrationDate} onChange={(event) => onChange({ registrationDate: event.target.value })} />
      </Field>
      <Field label="Scadenza iscrizione" htmlFor={`${idPrefix}-membership-expiry`} width="16ch">
        <DateInput id={`${idPrefix}-membership-expiry`} value={values.membershipExpiry} onChange={(event) => onChange({ membershipExpiry: event.target.value })} />
      </Field>
    </FormGrid>
  );
}

/* ── Ammissione (creazione) ──────────────────────────────────────────────── */
export function MemberAdmissionSection({ idPrefix, values, onChange, errors }: SectionProps) {
  return (
    <div className="flex flex-col gap-5">
      <FormGrid>
        <Field label="Data di ammissione" htmlFor={`${idPrefix}-membership-date`} width="16ch">
          <DateInput id={`${idPrefix}-membership-date`} value={values.membershipDate} onChange={(event) => onChange({ membershipDate: event.target.value })} />
        </Field>
        <Field label="Data della delibera" htmlFor={`${idPrefix}-resolution-date`} width="16ch">
          <DateInput id={`${idPrefix}-resolution-date`} value={values.resolutionDate} onChange={(event) => onChange({ resolutionDate: event.target.value })} />
        </Field>
      </FormGrid>
      <Field
        label="Estremi della delibera"
        htmlFor={`${idPrefix}-resolution-reference`}
        required
        error={errorFor(errors, "resolutionReference")}
        helper="Il numero di tessera lo assegna il libro soci: non si digita più a mano."
      >
        <TextInput
          id={`${idPrefix}-resolution-reference`}
          value={values.resolutionReference}
          onChange={(event) => onChange({ resolutionReference: event.target.value })}
          placeholder="Delibera del consiglio direttivo n. 12 del 28/08/2026"
        />
      </Field>
    </div>
  );
}

/* ── Note ────────────────────────────────────────────────────────────────── */
export function MemberNotesSection({ idPrefix, values, onChange }: SectionProps) {
  return (
    <Field label="Note" htmlFor={`${idPrefix}-notes`}>
      <Textarea id={`${idPrefix}-notes`} value={values.notes} onChange={(event) => onChange({ notes: event.target.value })} placeholder="Note aggiuntive..." rows={4} />
    </Field>
  );
}

/* ── La pagina intera ────────────────────────────────────────────────────── */
export function MemberForm({
  mode,
  idPrefix,
  initialValues,
  onSubmit,
  onCancel,
  submitLabel,
  submitting = false,
  dangerZone,
}: {
  mode: "create" | "edit";
  idPrefix: string;
  initialValues: MemberFormValues;
  onSubmit: (values: MemberFormValues) => Promise<void> | void;
  onCancel: () => void;
  submitLabel: string;
  submitting?: boolean;
  /** Il pulsante della «Zona pericolosa» in fondo (solo in modifica). */
  dangerZone?: React.ReactNode;
}) {
  const [values, setValues] = React.useState<MemberFormValues>(initialValues);
  const [errors, setErrors] = React.useState<MemberFormError[]>([]);
  const [dirty, setDirty] = React.useState(false);
  const formId = `${idPrefix}-form`;

  const update = (patch: Partial<MemberFormValues>) => {
    setValues((current) => ({ ...current, ...patch }));
    setDirty(true);
    if (errors.length) {
      setErrors((current) => current.filter((e) => !(e.field in patch || (e.field === "name" && ("firstName" in patch || "lastName" in patch)))));
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const found = validateMemberForm(values, idPrefix, mode);
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
    <form id={formId} onSubmit={handleSubmit} noValidate className="flex flex-col gap-[18px]" data-test="member-form">
      <ValidationSummary errors={errors} />

      <Panel as="section">
        <PanelHeader eyebrow="Anagrafica" title="Dati del socio" description="Nome, cognome, nascita, codice fiscale e tipo di socio." />
        <MemberIdentitySection idPrefix={idPrefix} values={values} onChange={update} errors={errors} withDocumentReader={mode === "create"} withType={mode === "create"} />
      </Panel>

      <Panel as="section">
        <PanelHeader eyebrow="Contatti" title="Contatti e residenza" description="Email, telefono e indirizzo." />
        <MemberContactsSection idPrefix={idPrefix} values={values} onChange={update} errors={errors} />
      </Panel>

      <Panel as="section">
        <PanelHeader eyebrow="Taglie vestiario" title="Taglie" description="Profilo, maglia, pantalone e scarpe per il materiale del club." />
        <MemberClothingSection idPrefix={idPrefix} values={values} onChange={update} />
      </Panel>

      {mode === "edit" ? (
        <Panel as="section">
          <PanelHeader eyebrow="Dati associativi" title="Dati associativi" description="Tipo di socio, stato della scheda, date di iscrizione e scadenza." />
          <MemberMembershipSection idPrefix={idPrefix} values={values} onChange={update} />
        </Panel>
      ) : (
        <Panel as="section">
          <PanelHeader eyebrow="Libro soci" title="Ammissione" description={MEMBERSHIP_REGISTER_DISCLAIMER} />
          <MemberAdmissionSection idPrefix={idPrefix} values={values} onChange={update} errors={errors} />
        </Panel>
      )}

      <Panel as="section">
        <PanelHeader eyebrow="Note" title="Note" />
        <MemberNotesSection idPrefix={idPrefix} values={values} onChange={update} />
      </Panel>

      {dangerZone ? (
        <DangerZone description="Eliminare la scheda toglie la persona dall'elenco dei soci. Chi ha una storia nel libro non si cancella: si dimette o si esclude." action={dangerZone} />
      ) : null}

      <StickyActionBar dirty={dirty} saving={submitting} formId={formId} saveLabel={submitLabel} onCancel={onCancel} />
    </form>
  );
}
