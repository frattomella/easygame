"use client";

import * as React from "react";
import { Drawer, DrawerSection } from "@/components/web/overlays/Drawer";
import {
  Field,
  FieldGroup,
  FieldSizeProvider,
  FormGrid,
  Select,
  TextInput,
  ValidationSummary,
} from "@/components/web/forms/Field";
import { Toggle } from "@/components/web/primitives/Controls";
import { Button } from "@/components/web/primitives/Button";
import { useToast } from "@/components/ui/toast-notification";
import { LogoUpload } from "@/components/ui/avatar-upload";
import type { SponsorKind } from "@/lib/sponsors/model";
import {
  SPONSOR_FORM_SECTIONS,
  SPONSOR_KIND_OPTIONS,
  emptySponsorDraft,
  sponsorDraftFrom,
  sponsorKindLabel,
  validateSponsorDraft,
  type SponsorDraft,
  type SponsorFormError,
  type SponsorFormSection,
  type SponsorRecord,
} from "@/components/sponsors/v2/sponsor-model";

/**
 * «Nuovo sponsor» / «Modifica sponsor» in un cassetto (guideline 08 §8.5:
 * 720 per il modulo intero a quattro sezioni, 480 per una sezione sola).
 *
 * Sostituisce il `Dialog` dell'elenco V1 — che aveva il caricamento del logo
 * in un `div.hidden` — e la modale «Modifica Informazioni» della scheda,
 * che apriva tre sezioni (`anagrafica`, `sede`, `finanza`) con gli stessi
 * campi. Le regole restano quelle della V1: nome, email e partita IVA
 * obbligatori, con il toast «Compila tutti i campi obbligatori».
 *
 * `section` assente = modulo intero (creazione, o «Modifica» dalla scheda);
 * presente = solo quella sezione, come le tre matite della scheda V1.
 */
const SECTION_META: Record<SponsorFormSection, { eyebrow: string; title: string }> = {
  identity: { eyebrow: "Identità", title: "Dati anagrafici" },
  contacts: { eyebrow: "Contatti", title: "Contatti" },
  fiscal: { eyebrow: "Dati fiscali", title: "Dati fiscali" },
  address: { eyebrow: "Sede", title: "Sede e localizzazione" },
};

const isSameDraft = (a: SponsorDraft, b: SponsorDraft) => JSON.stringify(a) === JSON.stringify(b);

export function SponsorDrawer({
  open,
  onOpenChange,
  sponsor,
  section = null,
  defaultKind = "sponsor",
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Lo sponsor da modificare; assente = creazione. */
  sponsor: SponsorRecord | null;
  /** Una sezione sola (dalla scheda) o tutto il modulo. */
  section?: SponsorFormSection | null;
  /** La tipologia preimpostata alla creazione (la scheda «Fornitori» della V1). */
  defaultKind?: SponsorKind;
  onSave: (draft: SponsorDraft, sections: ReadonlyArray<SponsorFormSection>) => Promise<boolean>;
}) {
  const { showToast } = useToast();
  const idPrefix = "sponsor";
  const [initial, setInitial] = React.useState<SponsorDraft>(() => emptySponsorDraft(defaultKind));
  const [draft, setDraft] = React.useState<SponsorDraft>(() => emptySponsorDraft(defaultKind));
  const [errors, setErrors] = React.useState<SponsorFormError[]>([]);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    const next = sponsor ? sponsorDraftFrom(sponsor) : emptySponsorDraft(defaultKind);
    setInitial(next);
    setDraft(next);
    setErrors([]);
  }, [open, sponsor, defaultKind]);

  const sections: ReadonlyArray<SponsorFormSection> = section ? [section] : SPONSOR_FORM_SECTIONS;
  const editing = Boolean(sponsor);
  const dirty = !isSameDraft(draft, initial);

  const update = (patch: Partial<SponsorDraft>) => {
    setDraft((current) => ({ ...current, ...patch }));
    if (errors.length) setErrors([]);
  };

  const errorFor = (field: keyof SponsorDraft) => errors.find((error) => error.field === field)?.label ?? null;
  const fieldError = (field: keyof SponsorDraft) => (errorFor(field) ? "Campo obbligatorio" : null);

  const submit = async () => {
    const found = validateSponsorDraft(draft, sections, idPrefix);
    setErrors(found);
    if (found.length) {
      showToast("error", "Compila tutti i campi obbligatori");
      return;
    }
    setSaving(true);
    try {
      const ok = await onSave(draft, sections);
      if (ok) onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  const meta = section ? SECTION_META[section] : null;
  const kindLabel = sponsorKindLabel(draft.type);
  const title = meta ? meta.title : editing ? `Modifica ${kindLabel.toLowerCase()}` : `Nuovo ${kindLabel.toLowerCase()}`;

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      width={section ? "default" : "wide"}
      eyebrow={meta ? meta.eyebrow : "Sponsor"}
      title={title}
      description={section ? undefined : "Identità, contatti, dati fiscali e sede. Nome, email e partita IVA sono obbligatori."}
      dirty={dirty}
      locked={saving}
      data-test="sponsor-drawer"
      footer={
        <>
          <Button variant="primary" onClick={() => void submit()} loading={saving}>
            {editing ? "Salva modifiche" : "Crea partner"}
          </Button>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={saving}>
            Annulla
          </Button>
        </>
      }
    >
      <FieldSizeProvider size="sm">
        <div className="flex flex-col gap-5">
          <ValidationSummary errors={errors} />

          {sections.includes("identity") ? (
            <DrawerSection eyebrow={section ? undefined : "Identità"}>
              <FormGrid columns={2}>
                <Field label="Nome / Ragione sociale" htmlFor={`${idPrefix}-name`} required error={fieldError("name")} className="laptop:col-span-2">
                  <TextInput
                    id={`${idPrefix}-name`}
                    value={draft.name}
                    onChange={(event) => update({ name: event.target.value })}
                    placeholder="Es. Partner Italia SRL"
                    autoComplete="organization"
                  />
                </Field>
                <Field label="Tipologia" htmlFor={`${idPrefix}-type`} required>
                  <Select
                    id={`${idPrefix}-type`}
                    value={draft.type}
                    onValueChange={(value) => update({ type: value === "fornitore" ? "fornitore" : "sponsor" })}
                    options={SPONSOR_KIND_OPTIONS}
                  />
                </Field>
                <Field label="Pubblica amministrazione" htmlFor={`${idPrefix}-pa`} helper="Un ente pubblico: cambia come si fattura.">
                  <div className="flex h-[38px] items-center">
                    <Toggle
                      id={`${idPrefix}-pa`}
                      checked={draft.isPublicAdministration}
                      onCheckedChange={(next) => update({ isPublicAdministration: next })}
                      aria-label="Pubblica amministrazione"
                    />
                  </div>
                </Field>
              </FormGrid>
              <div className="mt-4">
                <p className="mb-2 font-brand text-[12px] font-semibold leading-none text-egw-ink-62">Logo</p>
                <LogoUpload currentLogo={draft.logo || null} onLogoChange={(value) => update({ logo: value || "" })} name={draft.name || "Nuovo partner"} />
              </div>
            </DrawerSection>
          ) : null}

          {sections.includes("contacts") ? (
            <DrawerSection eyebrow={section ? undefined : "Contatti"}>
              <FormGrid columns={2}>
                <Field label="Email" htmlFor={`${idPrefix}-email`} required error={fieldError("email")}>
                  <TextInput id={`${idPrefix}-email`} type="email" value={draft.email} onChange={(event) => update({ email: event.target.value })} placeholder="amministrazione@azienda.it" autoComplete="email" />
                </Field>
                <Field label="PEC" htmlFor={`${idPrefix}-pec`}>
                  <TextInput id={`${idPrefix}-pec`} type="email" value={draft.pec} onChange={(event) => update({ pec: event.target.value })} placeholder="partner@pec.it" />
                </Field>
                <Field label="Telefono" htmlFor={`${idPrefix}-phone`}>
                  <TextInput id={`${idPrefix}-phone`} type="tel" value={draft.phone} onChange={(event) => update({ phone: event.target.value })} placeholder="+39 333 1234567" autoComplete="tel" />
                </Field>
                <Field label="Telefono secondario" htmlFor={`${idPrefix}-phone-secondary`}>
                  <TextInput id={`${idPrefix}-phone-secondary`} type="tel" value={draft.phoneSecondary} onChange={(event) => update({ phoneSecondary: event.target.value })} placeholder="+39 02 1234567" />
                </Field>
              </FormGrid>
            </DrawerSection>
          ) : null}

          {sections.includes("fiscal") ? (
            <DrawerSection eyebrow={section ? undefined : "Dati fiscali"}>
              <FormGrid columns={2}>
                <Field label="Partita IVA" htmlFor={`${idPrefix}-vat`} required error={fieldError("vatNumber")}>
                  <TextInput id={`${idPrefix}-vat`} value={draft.vatNumber} onChange={(event) => update({ vatNumber: event.target.value })} placeholder="IT01234567890" className="egw-num uppercase" />
                </Field>
                <Field label="Codice fiscale" htmlFor={`${idPrefix}-fiscal-code`} helper="Accanto alla partita IVA: una persona fisica o un ente non commerciale non ne ha una.">
                  <TextInput id={`${idPrefix}-fiscal-code`} value={draft.fiscalCode} onChange={(event) => update({ fiscalCode: event.target.value })} placeholder="RSSMRA80A01H501U" className="egw-num uppercase" />
                </Field>
                <Field label="Codice SDI" htmlFor={`${idPrefix}-sdi`}>
                  <TextInput id={`${idPrefix}-sdi`} value={draft.sdi} onChange={(event) => update({ sdi: event.target.value })} placeholder="ABC1234" className="egw-num uppercase" />
                </Field>
                <Field label="IBAN" htmlFor={`${idPrefix}-iban`}>
                  <TextInput id={`${idPrefix}-iban`} value={draft.iban} onChange={(event) => update({ iban: event.target.value })} placeholder="IT60X0542811101000000123456" className="egw-num uppercase" />
                </Field>
              </FormGrid>
            </DrawerSection>
          ) : null}

          {sections.includes("address") ? (
            <DrawerSection eyebrow={section ? undefined : "Sede"}>
              <FieldGroup eyebrow="Sede e localizzazione" columns={2}>
                <Field label="Indirizzo" htmlFor={`${idPrefix}-address`}>
                  <TextInput id={`${idPrefix}-address`} value={draft.address} onChange={(event) => update({ address: event.target.value })} placeholder="Via Roma" autoComplete="street-address" />
                </Field>
                <Field label="Numero civico" htmlFor={`${idPrefix}-street-number`}>
                  <TextInput id={`${idPrefix}-street-number`} value={draft.streetNumber} onChange={(event) => update({ streetNumber: event.target.value })} placeholder="10" />
                </Field>
                <Field label="Città" htmlFor={`${idPrefix}-city`}>
                  <TextInput id={`${idPrefix}-city`} value={draft.city} onChange={(event) => update({ city: event.target.value })} placeholder="Milano" autoComplete="address-level2" />
                </Field>
                <Field label="Provincia" htmlFor={`${idPrefix}-province`}>
                  <TextInput id={`${idPrefix}-province`} value={draft.province} onChange={(event) => update({ province: event.target.value })} placeholder="MI" autoComplete="address-level1" />
                </Field>
                <Field label="CAP" htmlFor={`${idPrefix}-postal-code`}>
                  <TextInput id={`${idPrefix}-postal-code`} value={draft.postalCode} onChange={(event) => update({ postalCode: event.target.value })} placeholder="20100" inputMode="numeric" autoComplete="postal-code" />
                </Field>
                <Field label="Regione" htmlFor={`${idPrefix}-region`}>
                  <TextInput id={`${idPrefix}-region`} value={draft.region} onChange={(event) => update({ region: event.target.value })} placeholder="Lombardia" />
                </Field>
                <Field label="Nazione" htmlFor={`${idPrefix}-country`} className="md:col-span-2">
                  <TextInput id={`${idPrefix}-country`} value={draft.country} onChange={(event) => update({ country: event.target.value })} placeholder="Italia" autoComplete="country-name" />
                </Field>
              </FieldGroup>
            </DrawerSection>
          ) : null}
        </div>
      </FieldSizeProvider>
    </Drawer>
  );
}
