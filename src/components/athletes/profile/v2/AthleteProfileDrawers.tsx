"use client";

import * as React from "react";
import { Drawer, DrawerSection } from "@/components/web/overlays/Drawer";
import { Button } from "@/components/web/primitives/Button";
import {
  DateInput,
  Field,
  FieldSizeProvider,
  FormGrid,
  Select,
  TextInput,
  Textarea,
} from "@/components/web/forms/Field";
import { PersonIdentityFields } from "@/components/forms/person-identity-fields";
import { AssistedAddressFields } from "@/components/forms/assisted-anagrafica";
import { CapitalizedInput } from "@/components/forms/capitalized-input";
import { PhoneField } from "@/components/forms/phone-field";
import { DocumentExtractionField } from "@/components/forms/document-extraction-field";
import {
  LEGACY_PERSON_NAME_KEYS,
  readPersonIdentity,
  writePersonIdentity,
} from "@/lib/person-identity";
import type { AthleteCategoryMembership } from "@/lib/athlete-category-memberships";
import type { CategoryGroupLike } from "@/lib/categories/display";
import type { ClubSite } from "@/lib/club-sites";
import { AthleteCategoriesPanel } from "../athlete-categories-panel";

/**
 * I cassetti di modifica dell'area Profilo (guideline 08 §8.5): la finestra
 * unica «Modifica sezione» della V1 e il dialogo del tutore. Stessi campi,
 * stesse validazioni, stessi blocchi condivisi (`PersonIdentityFields`,
 * `AssistedAddressFields`, `PhoneField`, `DocumentExtractionField`): cambia
 * il contenitore, che ora e un cassetto con la guardia sulle modifiche.
 */

export type AthleteEditSection = "general" | "contact" | "address" | "medical" | "identity";

const SECTION_TITLES: Record<AthleteEditSection, string> = {
  general: "Modifica informazioni generali",
  contact: "Modifica contatti",
  address: "Modifica indirizzo",
  medical: "Modifica dati sanitari",
  identity: "Modifica documento di identità",
};

const BLOOD_TYPES = ["A+", "A-", "B+", "B-", "AB+", "AB-", "0+", "0-"];
const DOCUMENT_TYPES = ["Carta d'identità", "Passaporto", "Patente"];

export function AthleteSectionEditDrawer({
  section,
  open,
  onOpenChange,
  formData,
  setFormData,
  categories,
  onSave,
  onCancel,
}: {
  section: AthleteEditSection | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  formData: Record<string, any>;
  setFormData: React.Dispatch<React.SetStateAction<any>>;
  categories: {
    groups: readonly CategoryGroupLike[];
    catalog: { id: string; name: string }[];
    memberships: AthleteCategoryMembership[];
    primaryCategoryId: string;
    primarySiteId: string;
    sites: ClubSite[];
    onPrimaryCategoryChange: (categoryId: string) => void;
    onPrimarySiteChange: (siteId: string) => void;
    onToggleSecondaryCategory: (categoryId: string, enabled: boolean) => void;
  };
  onSave: () => void | Promise<void>;
  onCancel: () => void;
}) {
  const [dirty, setDirty] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  React.useEffect(() => {
    if (!open) setDirty(false);
  }, [open]);

  const patch = (changes: Record<string, any>) => {
    setDirty(true);
    setFormData((current: any) => ({ ...current, ...changes }));
  };

  const save = async () => {
    setSaving(true);
    try {
      await onSave();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Drawer
      open={open && Boolean(section)}
      onOpenChange={(next) => {
        if (!next) onCancel();
        onOpenChange(next);
      }}
      width={section === "general" ? "wide" : "default"}
      eyebrow="Scheda atleta"
      title={section ? SECTION_TITLES[section] : ""}
      dirty={dirty}
      locked={saving}
      footer={
        <>
          <Button variant="primary" onClick={() => void save()} loading={saving}>
            Salva
          </Button>
          <Button variant="secondary" onClick={onCancel} disabled={saving}>
            Annulla
          </Button>
        </>
      }
    >
      <FieldSizeProvider size="sm">
        {section === "general" ? (
          <>
            <DrawerSection eyebrow="Identità">
              {/*
                I sei campi di identita, nell'ordine condiviso (RC Fix 2,
                punto 1): il luogo di nascita e un campo, e sta prima del
                codice fiscale che e proprio lui a rendere calcolabile.
              */}
              <PersonIdentityFields
                idPrefix="athlete-edit"
                values={readPersonIdentity(formData, LEGACY_PERSON_NAME_KEYS)}
                onChange={(identity) => patch(writePersonIdentity(identity, LEGACY_PERSON_NAME_KEYS))}
              />
              <div className="mt-4">
                <Field label="Nazionalità" htmlFor="athlete-edit-nationality">
                  <CapitalizedInput
                    id="athlete-edit-nationality"
                    value={formData.nationality || ""}
                    onChange={(e) => patch({ nationality: e.target.value })}
                    onValueChange={(value) => patch({ nationality: value })}
                  />
                </Field>
              </div>
            </DrawerSection>
            <DrawerSection eyebrow="Categorie e sede">
              <AthleteCategoriesPanel
                groups={categories.groups}
                categories={categories.catalog}
                memberships={categories.memberships}
                primaryCategoryId={categories.primaryCategoryId}
                primarySiteId={categories.primarySiteId}
                sites={categories.sites}
                onPrimaryCategoryChange={(id) => {
                  setDirty(true);
                  categories.onPrimaryCategoryChange(id);
                }}
                onPrimarySiteChange={(id) => {
                  setDirty(true);
                  categories.onPrimarySiteChange(id);
                }}
                onToggleSecondaryCategory={(id, enabled) => {
                  setDirty(true);
                  categories.onToggleSecondaryCategory(id, enabled);
                }}
              />
            </DrawerSection>
            <DrawerSection eyebrow="Note">
              <Field label="Note" htmlFor="athlete-edit-notes">
                <Textarea id="athlete-edit-notes" value={formData.notes || ""} onChange={(e) => patch({ notes: e.target.value })} rows={3} />
              </Field>
            </DrawerSection>
          </>
        ) : null}

        {section === "contact" ? (
          <div className="flex flex-col gap-5">
            <PhoneField label="Telefono" value={formData.phone || ""} onChange={(value) => patch({ phone: value })} />
            <Field label="Email" htmlFor="athlete-edit-email">
              <TextInput id="athlete-edit-email" type="email" inputMode="email" value={formData.email || ""} onChange={(e) => patch({ email: e.target.value })} />
            </Field>
          </div>
        ) : null}

        {section === "address" ? (
          <div className="flex flex-col gap-5">
            <FormGrid columns={2}>
              <Field label="Indirizzo" htmlFor="athlete-edit-address">
                <CapitalizedInput
                  id="athlete-edit-address"
                  value={formData.address || ""}
                  onChange={(e) => patch({ address: e.target.value })}
                  onValueChange={(value) => patch({ address: value })}
                />
              </Field>
              <Field label="N. civico" htmlFor="athlete-edit-street-number" width="10ch">
                <TextInput id="athlete-edit-street-number" value={formData.streetNumber || ""} onChange={(e) => patch({ streetNumber: e.target.value })} />
              </Field>
            </FormGrid>
            <AssistedAddressFields
              idPrefix="athlete-residence"
              values={{
                postalCode: formData.postalCode,
                city: formData.city,
                province: formData.province,
                region: formData.region,
                country: formData.country,
              }}
              onChange={(changes) => patch(changes)}
            />
          </div>
        ) : null}

        {section === "medical" ? (
          <div className="flex flex-col gap-5">
            <FormGrid columns={2}>
              <Field label="Gruppo sanguigno" htmlFor="athlete-edit-blood">
                <Select
                  id="athlete-edit-blood"
                  value={formData.bloodType || ""}
                  onValueChange={(value) => patch({ bloodType: value })}
                  options={BLOOD_TYPES.map((type) => ({ value: type, label: type }))}
                />
              </Field>
              <Field label="Allergie" htmlFor="athlete-edit-allergies">
                <TextInput id="athlete-edit-allergies" value={formData.allergies || ""} onChange={(e) => patch({ allergies: e.target.value })} />
              </Field>
            </FormGrid>
            <Field label="Malattie croniche" htmlFor="athlete-edit-chronic">
              <Textarea id="athlete-edit-chronic" value={formData.chronicDiseases || ""} onChange={(e) => patch({ chronicDiseases: e.target.value })} rows={2} />
            </Field>
            <Field label="Farmaci" htmlFor="athlete-edit-medications">
              <Textarea id="athlete-edit-medications" value={formData.medications || ""} onChange={(e) => patch({ medications: e.target.value })} rows={2} />
            </Field>
            <FormGrid columns={2}>
              <Field label="Contatto di emergenza" htmlFor="athlete-edit-emergency">
                <CapitalizedInput
                  id="athlete-edit-emergency"
                  value={formData.emergencyContact || ""}
                  onChange={(e) => patch({ emergencyContact: e.target.value })}
                  onValueChange={(value) => patch({ emergencyContact: value })}
                />
              </Field>
              <PhoneField label="Telefono di emergenza" value={formData.emergencyPhone || ""} onChange={(value) => patch({ emergencyPhone: value })} />
            </FormGrid>
          </div>
        ) : null}

        {section === "identity" ? (
          <div className="flex flex-col gap-5">
            <FormGrid columns={2}>
              <Field label="Tipo di documento" htmlFor="athlete-edit-document-type">
                <Select
                  id="athlete-edit-document-type"
                  value={formData.documentType || ""}
                  onValueChange={(value) => patch({ documentType: value })}
                  options={DOCUMENT_TYPES.map((type) => ({ value: type, label: type }))}
                />
              </Field>
              <Field label="Numero documento" htmlFor="athlete-edit-document-number">
                <TextInput id="athlete-edit-document-number" value={formData.documentNumber || ""} onChange={(e) => patch({ documentNumber: e.target.value })} />
              </Field>
            </FormGrid>
            <FormGrid columns={2}>
              <Field label="Data rilascio" htmlFor="athlete-edit-document-issue">
                <DateInput id="athlete-edit-document-issue" value={formData.documentIssue || ""} onChange={(e) => patch({ documentIssue: e.target.value })} />
              </Field>
              <Field label="Data scadenza" htmlFor="athlete-edit-document-expiry">
                <DateInput id="athlete-edit-document-expiry" value={formData.documentExpiry || ""} onChange={(e) => patch({ documentExpiry: e.target.value })} />
              </Field>
            </FormGrid>
            <Field label="Scadenza permesso di soggiorno" htmlFor="athlete-edit-permit-expiry" width="16ch">
              <DateInput id="athlete-edit-permit-expiry" value={formData.residencePermitExpiry || ""} onChange={(e) => patch({ residencePermitExpiry: e.target.value })} />
            </Field>
          </div>
        ) : null}
      </FieldSizeProvider>
    </Drawer>
  );
}

/* ── Genitore o tutore ─────────────────────────────────────────────────── */
export type GuardianDraft = {
  id: string;
  name: string;
  surname: string;
  relationship: string;
  fiscalCode: string;
  birthDate: string;
  gender: string;
  birthPlace: string;
  birthPlaceCode: string;
  phone: string;
  email: string;
};

const RELATIONSHIPS = ["Padre", "Madre", "Tutore Legale", "Nonno", "Nonna", "Altro"];

export function AthleteGuardianDrawer({
  open,
  onOpenChange,
  isEditing,
  draft,
  setDraft,
  extractionValues,
  applyExtraction,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isEditing: boolean;
  draft: GuardianDraft;
  setDraft: React.Dispatch<React.SetStateAction<GuardianDraft>>;
  extractionValues: Record<string, string>;
  applyExtraction: (patch: Record<string, string>) => Record<string, string>;
  onSave: () => void | Promise<void>;
}) {
  const [dirty, setDirty] = React.useState(false);
  React.useEffect(() => {
    if (!open) setDirty(false);
  }, [open]);
  const patch = (changes: Partial<GuardianDraft>) => {
    setDirty(true);
    setDraft((current) => ({ ...current, ...changes }));
  };

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      width="wide"
      eyebrow="Famiglia"
      title={isEditing ? "Modifica tutore" : "Aggiungi tutore"}
      dirty={dirty}
      footer={
        <>
          <Button variant="primary" onClick={() => void onSave()}>
            {isEditing ? "Salva" : "Aggiungi"}
          </Button>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Annulla
          </Button>
        </>
      }
    >
      <FieldSizeProvider size="sm">
        <DrawerSection eyebrow="Dal documento">
          {/*
            Un genitore ha un documento d'identita come chiunque altro: stesso
            campo condiviso, stesso flusso — si legge, si vede cosa e stato
            letto, si sceglie cosa applicare.
          */}
          <DocumentExtractionField
            currentValues={extractionValues}
            onApply={(read) => {
              setDirty(true);
              setDraft((current) => ({ ...current, ...applyExtraction(read) }));
            }}
          />
        </DrawerSection>
        <DrawerSection eyebrow="Identità">
          {/* Un genitore e una persona fisica come le altre: stesso blocco, stesso ordine. */}
          <PersonIdentityFields
            idPrefix="guardian"
            values={readPersonIdentity(draft, LEGACY_PERSON_NAME_KEYS)}
            required={{ firstName: true, lastName: true }}
            onChange={(identity) => patch(writePersonIdentity(identity, LEGACY_PERSON_NAME_KEYS) as Partial<GuardianDraft>)}
          />
        </DrawerSection>
        <DrawerSection eyebrow="Parentela e recapiti">
          <div className="flex flex-col gap-5">
            <FormGrid columns={2}>
              <Field label="Parentela" htmlFor="guardian-relationship">
                <Select
                  id="guardian-relationship"
                  value={draft.relationship}
                  onValueChange={(value) => patch({ relationship: value })}
                  options={RELATIONSHIPS.map((value) => ({ value, label: value }))}
                />
              </Field>
              <PhoneField label="Telefono" value={draft.phone} onChange={(value) => patch({ phone: value })} />
            </FormGrid>
            <Field label="Email" htmlFor="guardian-email">
              <TextInput id="guardian-email" type="email" inputMode="email" value={draft.email} onChange={(e) => patch({ email: e.target.value })} />
            </Field>
          </div>
        </DrawerSection>
      </FieldSizeProvider>
    </Drawer>
  );
}
