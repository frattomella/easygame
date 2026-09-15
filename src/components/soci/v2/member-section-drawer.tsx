"use client";

import * as React from "react";
import { Drawer } from "@/components/web/overlays/Drawer";
import { FieldSizeProvider, ValidationSummary } from "@/components/web/forms/Field";
import { Button } from "@/components/web/primitives/Button";
import {
  MemberClothingSection,
  MemberContactsSection,
  MemberIdentitySection,
  MemberMembershipSection,
  MemberNotesSection,
} from "@/components/soci/v2/member-form";
import {
  memberFormValuesFrom,
  memberSectionPayload,
  validateMemberSection,
  type MemberEditSection,
  type MemberFormError,
  type MemberFormValues,
} from "@/components/soci/v2/member-form-model";

export { memberSectionPayload } from "@/components/soci/v2/member-form-model";
export type { MemberEditSection } from "@/components/soci/v2/member-form-model";

/**
 * La modifica di **una sezione** della scheda, in un cassetto (guideline 08
 * §8.5: 480 fino a otto campi, 720 oltre). Sostituisce la modale unica
 * «Modifica Informazioni» della V1 con le stesse quattro sezioni —
 * `personal`, `contacts`, `clothing`, `membership` — e gli stessi campi,
 * montati dagli stessi componenti del modulo a pagina intera.
 *
 * Il cassetto restituisce **solo i campi della sua sezione**: chi salva li
 * manda a `updateMemberProfile`, che corregge una riga sola.
 */
const TITLES: Record<MemberEditSection, { eyebrow: string; title: string; width: "default" | "wide" }> = {
  personal: { eyebrow: "Anagrafica", title: "Informazioni personali", width: "wide" },
  contacts: { eyebrow: "Contatti", title: "Contatti e residenza", width: "default" },
  clothing: { eyebrow: "Taglie vestiario", title: "Taglie", width: "default" },
  membership: { eyebrow: "Dati associativi", title: "Dati associativi", width: "default" },
};

export function MemberSectionDrawer({
  section,
  member,
  onClose,
  onSave,
}: {
  section: MemberEditSection | null;
  member: Record<string, any> | null;
  onClose: () => void;
  onSave: (section: MemberEditSection, payload: Record<string, any>) => Promise<void>;
}) {
  const idPrefix = "member-edit";
  const [values, setValues] = React.useState<MemberFormValues>(() => memberFormValuesFrom(member));
  const [dirty, setDirty] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [errors, setErrors] = React.useState<MemberFormError[]>([]);

  /*
    I valori si rileggono dal record **nel render** in cui il cassetto si
    apre, non in un effetto dopo: cosi il primo render ha gia i valori giusti.
  */
  const [openedFor, setOpenedFor] = React.useState<MemberEditSection | null>(null);
  if (section !== openedFor) {
    setOpenedFor(section);
    if (section) {
      setValues(memberFormValuesFrom(member));
      setDirty(false);
      setErrors([]);
    }
  }

  const update = (patch: Partial<MemberFormValues>) => {
    setValues((current) => ({ ...current, ...patch }));
    setDirty(true);
    if (errors.length) setErrors([]);
  };

  const submit = async () => {
    if (!section) return;
    const found = validateMemberSection(section, values, idPrefix);
    setErrors(found);
    if (found.length) return;
    setSaving(true);
    try {
      await onSave(section, memberSectionPayload(section, values));
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
      data-test="member-section-drawer"
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
              <MemberIdentitySection idPrefix={idPrefix} values={values} onChange={update} errors={errors} requireNames={false} />
              <MemberNotesSection idPrefix={idPrefix} values={values} onChange={update} />
            </>
          ) : null}
          {section === "contacts" ? <MemberContactsSection idPrefix={idPrefix} values={values} onChange={update} /> : null}
          {section === "clothing" ? <MemberClothingSection idPrefix={idPrefix} values={values} onChange={update} /> : null}
          {section === "membership" ? <MemberMembershipSection idPrefix={idPrefix} values={values} onChange={update} /> : null}
        </div>
      </FieldSizeProvider>
    </Drawer>
  );
}
