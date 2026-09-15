"use client";

import * as React from "react";
import { Drawer, DrawerSection } from "@/components/web/overlays/Drawer";
import { Button } from "@/components/web/primitives/Button";
import { Toggle } from "@/components/web/primitives/Controls";
import { InsetBlock } from "@/components/web/primitives/Surface";
import {
  DateInput,
  Field,
  FieldSizeProvider,
  FormGrid,
  MultiSelect,
  Select,
  TextInput,
  Textarea,
} from "@/components/web/forms/Field";
import { PersonIdentityFields } from "@/components/forms/person-identity-fields";
import { PersonResidenceFields } from "@/components/forms/assisted-anagrafica";
import { PhoneField } from "@/components/forms/phone-field";
import { CapitalizedInput } from "@/components/forms/capitalized-input";
import { ClothingSizesFields } from "@/components/forms/clothing-sizes-fields";
import {
  LEGACY_PERSON_NAME_KEYS,
  readPersonIdentity,
  writePersonIdentity,
} from "@/lib/person-identity";
import type { CategoryGroup } from "@/lib/club-sites";

/**
 * Le sezioni modificabili della scheda allenatore, ognuna nel suo cassetto
 * (guideline 08 §8.5: 480 fino a otto campi, 720 oltre). Sostituisce la
 * modale generica «Modifica Informazioni» della V1: stessi campi, stesse
 * chiavi, e un salvataggio solo — `onSave` riceve il modulo intero e la
 * scheda lo normalizza come prima (categorie, gruppi, `hireDate`).
 */
export type TrainerSection =
  | "personal"
  | "document"
  | "contacts"
  | "banking"
  | "company"
  | "clothing"
  | "certificates"
  | "health";

const SECTION_META: Record<TrainerSection, { eyebrow: string; title: string; width: "default" | "wide" }> = {
  personal: { eyebrow: "Profilo", title: "Informazioni personali", width: "wide" },
  document: { eyebrow: "Profilo", title: "Documento d'identità", width: "default" },
  contacts: { eyebrow: "Profilo", title: "Contatti e residenza", width: "default" },
  banking: { eyebrow: "Lavoro e compensi", title: "Informazioni bancarie", width: "default" },
  company: { eyebrow: "Club e accesso", title: "Informazioni societarie", width: "default" },
  clothing: { eyebrow: "Profilo", title: "Taglie vestiario", width: "default" },
  certificates: { eyebrow: "Documenti e sanità", title: "Attestati", width: "default" },
  health: { eyebrow: "Documenti e sanità", title: "Anagrafica sanitaria", width: "default" },
};

export function TrainerSectionDrawer({
  section,
  initialValues,
  categories,
  categoryLabel,
  assignableGroups,
  onClose,
  onSave,
}: {
  section: TrainerSection | null;
  /** Il record dell'allenatore piu `categoryIds` e `groupIds` gia risolti. */
  initialValues: Record<string, any>;
  categories: Array<{ id: string; name: string }>;
  /**
   * Come si scrive una categoria (ADR-0185): la pagina la chiede all'indice
   * canonico. Senza, due «Pulcini» su due sedi erano due voci identiche nel
   * multiselect, e assegnare l'allenatore a quella sbagliata era un clic.
   */
  categoryLabel?: (categoryId: string) => string;
  assignableGroups: CategoryGroup[];
  onClose: () => void;
  onSave: (values: Record<string, any>) => Promise<void>;
}) {
  const [form, setForm] = React.useState<Record<string, any>>(initialValues);
  const [dirty, setDirty] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (section) {
      setForm(initialValues);
      setDirty(false);
    }
    // Il modulo si reinizializza all'apertura di una sezione, non a ogni
    // render della scheda.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section]);

  const patch = (next: Record<string, any>) => {
    setDirty(true);
    setForm((current) => ({ ...current, ...next }));
  };

  const handleSave = async () => {
    if (!dirty) {
      onClose();
      return;
    }
    setSaving(true);
    try {
      await onSave(form);
      setDirty(false);
    } catch {
      // La scheda ha gia avvisato con il toast: il cassetto resta aperto e sporco.
    } finally {
      setSaving(false);
    }
  };

  const meta = section ? SECTION_META[section] : null;
  const categoryIds: string[] = Array.isArray(form.categoryIds) ? form.categoryIds : [];
  const groupIds: string[] = Array.isArray(form.groupIds) ? form.groupIds : [];

  return (
    <Drawer
      open={Boolean(section)}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      width={meta?.width ?? "default"}
      eyebrow={meta?.eyebrow}
      title={meta?.title ?? ""}
      dirty={dirty}
      locked={saving}
      data-test="trainer-section-drawer"
      footer={
        <>
          <Button variant="primary" onClick={() => void handleSave()} loading={saving}>
            Salva
          </Button>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Annulla
          </Button>
        </>
      }
    >
      <FieldSizeProvider size="sm">
        {section === "personal" ? (
          <>
            {/*
              I sei campi di identita, nell'ordine condiviso: il luogo di
              nascita e il codice fiscale arrivano dal blocco, non da una
              seconda casella.
            */}
            <DrawerSection eyebrow="Identità">
              <PersonIdentityFields
                idPrefix="trainer-edit"
                values={readPersonIdentity(form, LEGACY_PERSON_NAME_KEYS)}
                onChange={(identityPatch) => patch(writePersonIdentity(identityPatch, LEGACY_PERSON_NAME_KEYS))}
              />
            </DrawerSection>
            <DrawerSection eyebrow="Altro">
              <FormGrid columns={1}>
                <Field label="Età" htmlFor="trainer-edit-age" width="10ch">
                  <TextInput
                    id="trainer-edit-age"
                    type="number"
                    numeric
                    min="0"
                    value={form.age ?? ""}
                    onChange={(event) => patch({ age: event.target.value })}
                  />
                </Field>
                <Field label="Nazionalità" htmlFor="trainer-edit-nationality">
                  <CapitalizedInput
                    id="trainer-edit-nationality"
                    name="nationality"
                    value={form.nationality ?? ""}
                    onChange={(event) => patch({ nationality: event.target.value })}
                    onValueChange={(value) => patch({ nationality: value })}
                  />
                </Field>
                <Field label="Formazione scolastica" htmlFor="trainer-edit-education">
                  <CapitalizedInput
                    id="trainer-edit-education"
                    name="education"
                    value={form.education ?? ""}
                    onChange={(event) => patch({ education: event.target.value })}
                    onValueChange={(value) => patch({ education: value })}
                  />
                </Field>
                <Field label="Note" htmlFor="trainer-edit-notes">
                  <Textarea
                    id="trainer-edit-notes"
                    rows={3}
                    value={form.notes ?? ""}
                    onChange={(event) => patch({ notes: event.target.value })}
                  />
                </Field>
              </FormGrid>
            </DrawerSection>
          </>
        ) : null}

        {section === "document" ? (
          <FormGrid columns={1}>
            <Field label="Tipo di documento" htmlFor="trainer-edit-document-type">
              <TextInput
                id="trainer-edit-document-type"
                value={form.documentType ?? ""}
                onChange={(event) => patch({ documentType: event.target.value })}
                placeholder="Es. Carta d'identità"
              />
            </Field>
            <Field label="Numero documento" htmlFor="trainer-edit-document-number">
              <TextInput
                id="trainer-edit-document-number"
                value={form.documentNumber ?? ""}
                onChange={(event) => patch({ documentNumber: event.target.value })}
              />
            </Field>
            <Field label="Data di rilascio" htmlFor="trainer-edit-document-issue" width="20ch">
              <DateInput
                id="trainer-edit-document-issue"
                value={form.documentIssueDate ?? ""}
                onChange={(event) => patch({ documentIssueDate: event.target.value })}
              />
            </Field>
            <Field label="Scadenza del documento" htmlFor="trainer-edit-document-expiry" width="20ch">
              <DateInput
                id="trainer-edit-document-expiry"
                value={form.documentExpiry ?? ""}
                onChange={(event) => patch({ documentExpiry: event.target.value })}
              />
            </Field>
            <Field label="Scadenza permesso di soggiorno" htmlFor="trainer-edit-permit-expiry" width="20ch">
              <DateInput
                id="trainer-edit-permit-expiry"
                value={form.residencePermitExpiry ?? ""}
                onChange={(event) => patch({ residencePermitExpiry: event.target.value })}
              />
            </Field>
          </FormGrid>
        ) : null}

        {section === "contacts" ? (
          <FormGrid columns={1}>
            <Field label="Email" htmlFor="trainer-edit-email">
              <TextInput
                id="trainer-edit-email"
                type="email"
                inputMode="email"
                value={form.email ?? ""}
                onChange={(event) => patch({ email: event.target.value })}
              />
            </Field>
            <PhoneField
              id="trainer-edit-phone"
              label="Telefono"
              value={form.phone ?? ""}
              onChange={(value) => patch({ phone: value })}
            />
            {/*
              Via, comune e CAP dal componente condiviso: il comune si cerca
              nell'archivio ISTAT e porta con se il CAP quando ne ha uno solo.
            */}
            <PersonResidenceFields
              idPrefix="trainer-edit"
              values={form}
              onChange={(residencePatch) => patch(residencePatch)}
            />
          </FormGrid>
        ) : null}

        {section === "banking" ? (
          <FormGrid columns={1}>
            <Field label="IBAN" htmlFor="trainer-edit-iban">
              <TextInput
                id="trainer-edit-iban"
                className="egw-num uppercase"
                value={form.iban ?? ""}
                onChange={(event) => patch({ iban: event.target.value })}
                autoComplete="off"
                spellCheck={false}
              />
            </Field>
            <Field label="Stipendio mensile" htmlFor="trainer-edit-salary" width="16ch">
              <TextInput
                id="trainer-edit-salary"
                type="number"
                numeric
                min="0"
                step="0.01"
                trailing="€"
                value={form.salary ?? ""}
                onChange={(event) => patch({ salary: event.target.value })}
              />
            </Field>
          </FormGrid>
        ) : null}

        {section === "company" ? (
          <>
            {/*
              «Ruolo» non e qui: su una scheda allenatore vale sempre
              «Allenatore» e ripeterebbe il titolo della pagina.
            */}
            <FormGrid columns={1}>
              <Field label="Tesserato" htmlFor="trainer-edit-member">
                <Select
                  id="trainer-edit-member"
                  value={form.isMember ? "true" : "false"}
                  onValueChange={(value) => patch({ isMember: value === "true" })}
                  options={[
                    { value: "true", label: "Sì" },
                    { value: "false", label: "No" },
                  ]}
                />
              </Field>
              <Field label="Numero di tesseramento" htmlFor="trainer-edit-membership-number" optional>
                <TextInput
                  id="trainer-edit-membership-number"
                  value={form.membershipNumber ?? ""}
                  onChange={(event) => patch({ membershipNumber: event.target.value })}
                />
              </Field>
              <Field label="Data di tesseramento" htmlFor="trainer-edit-membership-date" width="20ch">
                <DateInput
                  id="trainer-edit-membership-date"
                  value={form.membershipDate ?? ""}
                  onChange={(event) => patch({ membershipDate: event.target.value })}
                />
              </Field>
              {/*
                La data di inizio si vedeva in scheda ma non compariva in
                nessun modulo: si modifica da qui e la scheda la scrive su
                entrambe le chiavi (`startDate` e `hireDate`).
              */}
              <Field label="Data di inizio" htmlFor="trainer-edit-start-date" width="20ch">
                <DateInput
                  id="trainer-edit-start-date"
                  value={form.startDate ?? ""}
                  onChange={(event) => patch({ startDate: event.target.value })}
                />
              </Field>
              <Field
                label="Categorie assegnate"
                htmlFor="trainer-edit-categories"
                helper="Un allenatore può avere più categorie assegnate."
              >
                {categories.length === 0 ? (
                  <InsetBlock className="font-brand text-[12.5px] text-egw-ink-62">Nessuna categoria disponibile.</InsetBlock>
                ) : (
                  <MultiSelect
                    id="trainer-edit-categories"
                    values={categoryIds}
                    onValuesChange={(next) => patch({ categoryIds: next })}
                    options={categories.map((category) => ({
                      value: category.id,
                      label: categoryLabel ? categoryLabel(category.id) : category.name,
                    }))}
                    placeholder="Seleziona le categorie"
                  />
                )}
              </Field>
              {/*
                I gruppi operativi compaiono solo dove esistono davvero: con
                una squadra sola per categoria sarebbero una seconda spunta
                che dice la stessa cosa (ADR-0055).
              */}
              {assignableGroups.length > 0 ? (
                <Field
                  label="Gruppi seguiti"
                  htmlFor="trainer-edit-groups"
                  helper="Lo stesso allenatore può seguire più squadre della stessa categoria in sedi diverse. Senza nessuna scelta segue tutte le squadre delle sue categorie."
                >
                  <MultiSelect
                    id="trainer-edit-groups"
                    values={groupIds}
                    onValuesChange={(next) => patch({ groupIds: next })}
                    options={assignableGroups.map((group) => ({ value: group.id, label: group.name }))}
                    placeholder="Tutte le squadre delle sue categorie"
                  />
                </Field>
              ) : null}
            </FormGrid>
          </>
        ) : null}

        {section === "clothing" ? (
          <ClothingSizesFields
            idPrefix="trainer-clothing"
            value={form.clothingSizes}
            person={{ gender: form.gender, birthDate: form.birthDate }}
            onChange={(next) => patch({ clothingSizes: next })}
          />
        ) : null}

        {section === "certificates" ? (
          <div className="flex flex-col gap-3">
            {(
              [
                ["hasBlsd", "BLSD", "trainer-edit-blsd"],
                ["hasFirstAid", "Primo soccorso", "trainer-edit-first-aid"],
                ["hasFireSafety", "Antincendio", "trainer-edit-fire-safety"],
              ] as const
            ).map(([key, label, id]) => (
              <InsetBlock key={key} className="flex items-center justify-between gap-4">
                <label htmlFor={id} className="font-brand text-[13px] font-semibold text-egw-ink">
                  {label}
                  <span className="block text-[11.5px] font-medium text-egw-ink-62">
                    {form[key] ? "Conseguito" : "Non conseguito"}
                  </span>
                </label>
                <Toggle id={id} checked={Boolean(form[key])} onCheckedChange={(checked) => patch({ [key]: checked })} aria-label={label} />
              </InsetBlock>
            ))}
          </div>
        ) : null}

        {section === "health" ? (
          <FormGrid columns={1}>
            <Field label="Tessera sanitaria" htmlFor="trainer-edit-health-card">
              <TextInput
                id="trainer-edit-health-card"
                value={form.healthCard ?? ""}
                onChange={(event) => patch({ healthCard: event.target.value })}
              />
            </Field>
            <Field label="Assicurazione" htmlFor="trainer-edit-insurance">
              <TextInput
                id="trainer-edit-insurance"
                value={form.insurance ?? ""}
                onChange={(event) => patch({ insurance: event.target.value })}
              />
            </Field>
            <Field label="Patologie e malattie" htmlFor="trainer-edit-pathologies">
              <Textarea
                id="trainer-edit-pathologies"
                rows={3}
                value={form.pathologies ?? ""}
                onChange={(event) => patch({ pathologies: event.target.value })}
              />
            </Field>
            <Field label="Allergie e preferenze alimentari" htmlFor="trainer-edit-allergies">
              <Textarea
                id="trainer-edit-allergies"
                rows={3}
                value={form.allergies ?? ""}
                onChange={(event) => patch({ allergies: event.target.value })}
              />
            </Field>
          </FormGrid>
        ) : null}
      </FieldSizeProvider>
    </Drawer>
  );
}
