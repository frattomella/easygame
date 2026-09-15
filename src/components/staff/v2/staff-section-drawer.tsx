"use client";

import * as React from "react";
import { Drawer } from "@/components/web/overlays/Drawer";
import { FieldSizeProvider, ValidationSummary } from "@/components/web/forms/Field";
import { Button } from "@/components/web/primitives/Button";
import type { StaffDepartment } from "@/lib/staff-directory";
import {
  StaffClothingSection,
  StaffCompanySection,
  StaffContactsSection,
  StaffDocumentSection,
  StaffIdentitySection,
  StaffNotesSection,
} from "@/components/staff/v2/staff-form";
import {
  staffFormValuesFrom,
  staffSectionPayload,
  validateStaffSection,
  type StaffEditSection,
  type StaffFormError,
  type StaffFormValues,
} from "@/components/staff/v2/staff-form-model";

export { staffSectionPayload } from "@/components/staff/v2/staff-form-model";
export type { StaffEditSection } from "@/components/staff/v2/staff-form-model";

/**
 * La modifica di **una sezione** della scheda, in un cassetto (guideline 08
 * §8.5: 480 fino a otto campi, 720 oltre). Sostituisce la modale unica
 * «Modifica Informazioni» della V1 con le stesse cinque sezioni —
 * `personal`, `contacts`, `company`, `clothing`, `document` — e gli stessi
 * campi, montati dagli stessi componenti del modulo a pagina intera.
 *
 * Il cassetto restituisce **solo i campi della sua sezione**: chi salva li
 * fonde nel record con `updateClubDataItem`, che gia fonde.
 */
const TITLES: Record<StaffEditSection, { eyebrow: string; title: string; width: "default" | "wide" }> = {
  personal: { eyebrow: "Anagrafica", title: "Informazioni personali", width: "wide" },
  contacts: { eyebrow: "Contatti", title: "Contatti e residenza", width: "default" },
  company: { eyebrow: "Dati societari", title: "Informazioni societarie", width: "default" },
  clothing: { eyebrow: "Taglie vestiario", title: "Taglie", width: "default" },
  document: { eyebrow: "Documenti", title: "Documento di identità", width: "default" },
};

export function StaffSectionDrawer({
  section,
  member,
  roles,
  departments,
  onClose,
  onSave,
}: {
  section: StaffEditSection | null;
  member: Record<string, any> | null;
  roles: string[];
  departments: StaffDepartment[];
  onClose: () => void;
  onSave: (section: StaffEditSection, payload: Record<string, any>) => Promise<void>;
}) {
  const idPrefix = "staff-edit";
  const [values, setValues] = React.useState<StaffFormValues>(() => staffFormValuesFrom(member));
  const [dirty, setDirty] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [errors, setErrors] = React.useState<StaffFormError[]>([]);

  /*
    I valori si rileggono dal record **nel render** in cui il cassetto si
    apre, non in un effetto dopo: le sezioni con uno stato proprio (il ruolo
    «Altro») si inizializzano al primo render e non vedrebbero un valore
    arrivato un istante dopo.
  */
  const [openedFor, setOpenedFor] = React.useState<StaffEditSection | null>(null);
  if (section !== openedFor) {
    setOpenedFor(section);
    if (section) {
      setValues(staffFormValuesFrom(member));
      setDirty(false);
      setErrors([]);
    }
  }

  const update = (patch: Partial<StaffFormValues>) => {
    setValues((current) => ({ ...current, ...patch }));
    setDirty(true);
    if (errors.length) setErrors([]);
  };

  const submit = async () => {
    if (!section) return;
    const found = validateStaffSection(section, values, idPrefix);
    setErrors(found);
    if (found.length) return;
    setSaving(true);
    try {
      await onSave(section, staffSectionPayload(section, values));
      setDirty(false);
    } finally {
      setSaving(false);
    }
  };

  const meta = section ? TITLES[section] : null;

  return (
    <Drawer
      open={Boolean(section)}
      onOpenChange={(open) => !open && onClose()}
      width={meta?.width ?? "default"}
      eyebrow={meta?.eyebrow}
      title={meta?.title ?? "Modifica"}
      dirty={dirty}
      locked={saving}
      data-test="staff-section-drawer"
      footer={
        <>
          <Button variant="primary" onClick={() => void submit()} loading={saving}>
            Salva modifiche
          </Button>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Annulla
          </Button>
        </>
      }
    >
      <FieldSizeProvider size="sm">
        <div className="flex flex-col gap-5">
          <ValidationSummary errors={errors} />
          {section === "personal" ? (
            <>
              <StaffIdentitySection idPrefix={idPrefix} values={values} onChange={update} errors={errors} withExtras requireNames={false} />
              <StaffNotesSection idPrefix={idPrefix} values={values} onChange={update} />
            </>
          ) : null}
          {section === "contacts" ? <StaffContactsSection idPrefix={idPrefix} values={values} onChange={update} errors={errors} requireContact={false} /> : null}
          {section === "company" ? <StaffCompanySection idPrefix={idPrefix} values={values} onChange={update} errors={errors} roles={roles} departments={departments} /> : null}
          {section === "clothing" ? <StaffClothingSection idPrefix={idPrefix} values={values} onChange={update} /> : null}
          {section === "document" ? <StaffDocumentSection idPrefix={idPrefix} values={values} onChange={update} /> : null}
        </div>
      </FieldSizeProvider>
    </Drawer>
  );
}
