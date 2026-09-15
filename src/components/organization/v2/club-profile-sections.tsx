"use client";

import * as React from "react";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Panel, PanelHeader } from "@/components/web/primitives/Surface";
import { Button } from "@/components/web/primitives/Button";
import { Field, FormGrid, MultiSelect, Select, TextInput, controlClasses, useFieldSize } from "@/components/web/forms/Field";
import { CapitalizedInput, type CapitalizedInputProps } from "@/components/forms/capitalized-input";
import { PhoneField } from "@/components/forms/phone-field";
import { AssistedAddressFields, AssistedFiscalCodeField } from "@/components/forms/assisted-anagrafica";
import { LogoUpload } from "@/components/ui/avatar-upload";
import {
  CLUB_SECTIONS,
  CLUB_TYPES_LIST,
  OTHER_OPTION,
  SPORTS_LIST,
  TAX_REGIMES_LIST,
  type ClubFormValues,
  type ClubSectionId,
} from "@/components/organization/v2/club-model";

/**
 * Le sezioni in autosave della scheda Club (guideline 08 §8.4–8.5: pagina
 * intera a pannelli, un pannello per gruppo di campi). Sono le cinque schede
 * descrittive della V1 — Generale, Dati fiscali, Dati bancari, Contatti,
 * Social — con **gli stessi campi e gli stessi blocchi condivisi**:
 * `CapitalizedInput`, `PhoneField`, `AssistedAddressFields`,
 * `AssistedFiscalCodeField`, `LogoUpload`. Nessun pulsante «Salva»: scrive
 * l'autosave della pagina, sezione per sezione.
 */
type SectionProps = {
  values: ClubFormValues;
  onChange: (patch: Partial<ClubFormValues>) => void;
};

const sectionMeta = (id: ClubSectionId) => CLUB_SECTIONS.find((section) => section.id === id);

/** `CapitalizedInput` con il campo del sistema: stessa regola di maiuscole, stessa altezza degli altri. */
export function ClubCapitalizedInput({ className, ...props }: CapitalizedInputProps) {
  const size = useFieldSize();
  return <CapitalizedInput {...props} className={cn(controlClasses(size), "focus-visible:ring-0", className)} />;
}

/** Valori scelti fuori lista restano scelti: la tendina li mostra insieme a quelli del catalogo. */
const withCustomOptions = (list: readonly string[], selected: readonly string[]) => [
  ...list.filter((item) => item !== OTHER_OPTION).map((item) => ({ value: item, label: item })),
  ...selected.filter((item) => !list.includes(item)).map((item) => ({ value: item, label: item })),
];

/**
 * «Altro» della V1: un campo libero e un «Aggiungi» che mette il valore fra
 * quelli scelti. Vale per le tipologie e per gli sport.
 */
function CustomValueAdder({ id, label, placeholder, onAdd }: { id: string; label: string; placeholder: string; onAdd: (value: string) => void }) {
  const [value, setValue] = React.useState("");
  const add = () => {
    const next = value.trim();
    if (!next) return;
    onAdd(next);
    setValue("");
  };
  return (
    <Field label={label} htmlFor={id} helper="Non e nel catalogo: scrivilo e aggiungilo.">
      <div className="flex flex-wrap items-center gap-2">
        <TextInput
          id={id}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder={placeholder}
          className="flex-1 basis-[200px]"
          wrapperClassName="flex-1 basis-[200px]"
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              add();
            }
          }}
        />
        <Button variant="secondary" icon={<Plus />} onClick={add} disabled={!value.trim()}>
          Aggiungi
        </Button>
      </div>
    </Field>
  );
}

/* ── Generale ────────────────────────────────────────────────────────────── */
export function ClubGeneralSection({
  values,
  onChange,
  logo,
  onLogoChange,
}: SectionProps & { logo: string | null; onLogoChange: (logo: string | null) => void }) {
  const meta = sectionMeta("generale");
  const addUnique = (key: "types" | "sports", value: string) => {
    if (values[key].includes(value)) return;
    onChange({ [key]: [...values[key], value] } as Partial<ClubFormValues>);
  };

  return (
    <Panel as="section" id="club-section-generale" aria-labelledby="club-section-generale-title">
      <PanelHeader eyebrow="Generale" title={<span id="club-section-generale-title">Informazioni generali</span>} description={meta?.description} />
      <div className="flex flex-col gap-5">
        <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:gap-6">
          <LogoUpload currentLogo={logo} onLogoChange={onLogoChange} name={values.name} aspectRatio="square" />
          <p className="font-brand text-[12.5px] leading-[1.5] text-egw-ink-62">Trascina o clicca per caricare il logo. Compare nel guscio e sui documenti che il club stampa.</p>
        </div>

        <FormGrid>
          <Field label="Nome" htmlFor="name" required>
            <ClubCapitalizedInput id="name" name="name" value={values.name} onChange={(event) => onChange({ name: event.target.value })} onValueChange={(name) => onChange({ name })} />
          </Field>
          <Field label="Anno di fondazione" htmlFor="foundingYear" width="12ch">
            <TextInput id="foundingYear" name="foundingYear" type="number" numeric inputMode="numeric" value={values.foundingYear} onChange={(event) => onChange({ foundingYear: event.target.value })} />
          </Field>
        </FormGrid>

        <FormGrid>
          <div className="flex flex-col gap-3">
            <Field label="Tipologia" htmlFor="club-types" helper="Puo essere piu di una.">
              <MultiSelect id="club-types" values={values.types} onValuesChange={(types) => onChange({ types })} options={withCustomOptions(CLUB_TYPES_LIST, values.types)} placeholder="Seleziona una tipologia" />
            </Field>
            <CustomValueAdder id="club-type-custom" label="Altra tipologia" placeholder="Inserisci tipologia" onAdd={(value) => addUnique("types", value)} />
          </div>
          <div className="flex flex-col gap-3">
            <Field label="Sport" htmlFor="club-sports" helper="Cerca nel catalogo oppure aggiungi uno sport che non c'e.">
              <MultiSelect id="club-sports" values={values.sports} onValuesChange={(sports) => onChange({ sports })} options={withCustomOptions(SPORTS_LIST, values.sports)} placeholder="Aggiungi sport" searchPlaceholder="Cerca sport" />
            </Field>
            <CustomValueAdder id="club-sport-custom" label="Altro sport" placeholder="Inserisci nome sport" onAdd={(value) => addUnique("sports", value)} />
          </div>
        </FormGrid>

        <Field label="Indirizzo" htmlFor="address">
          <ClubCapitalizedInput id="address" name="address" value={values.address} onChange={(event) => onChange({ address: event.target.value })} onValueChange={(address) => onChange({ address })} />
        </Field>

        {/* CAP, comune, provincia, regione e paese dal blocco condiviso: il comune si cerca nell'archivio ISTAT. */}
        <AssistedAddressFields
          idPrefix="club-operational"
          values={{ postalCode: values.postalCode, city: values.city, province: values.province, region: values.region, country: values.country }}
          onChange={(patch) => onChange(patch as Partial<ClubFormValues>)}
        />
      </div>
    </Panel>
  );
}

/* ── Dati fiscali ────────────────────────────────────────────────────────── */
export function ClubFiscalSection({ values, onChange }: SectionProps) {
  const meta = sectionMeta("fiscali");
  const taxPreset = values.taxRegimeCustom ? OTHER_OPTION : values.taxRegime;

  const chooseTaxRegime = (value: string) => {
    if (value === OTHER_OPTION) {
      /* Come nella V1: si apre il campo libero e si tiene cio che c'era. */
      onChange({ taxRegimeCustom: true, taxRegime: values.taxRegimeCustom ? values.taxRegime : "" });
      return;
    }
    onChange({ taxRegimeCustom: false, taxRegime: value });
  };

  return (
    <div className="flex flex-col gap-[18px]">
      <Panel as="section" id="club-section-fiscali" aria-labelledby="club-section-fiscali-title">
        <PanelHeader eyebrow="Dati fiscali" title={<span id="club-section-fiscali-title">Anagrafica fiscale</span>} description={meta?.description} />
        <div className="flex flex-col gap-5">
          <FormGrid>
            <Field label="Ragione sociale" htmlFor="businessName">
              <ClubCapitalizedInput id="businessName" name="businessName" value={values.businessName} onChange={(event) => onChange({ businessName: event.target.value })} onValueChange={(businessName) => onChange({ businessName })} />
            </Field>
            <Field label="Codice SDI" htmlFor="sdiCode" helper="Codice per fatturazione elettronica" width="16ch">
              <TextInput id="sdiCode" name="sdiCode" value={values.sdiCode} onChange={(event) => onChange({ sdiCode: event.target.value })} />
            </Field>
          </FormGrid>
          <FormGrid>
            <Field label="Partita IVA" htmlFor="vatNumber" helper="Undici cifre" width="20ch">
              <TextInput id="vatNumber" name="vatNumber" inputMode="numeric" value={values.vatNumber} onChange={(event) => onChange({ vatNumber: event.target.value })} className="egw-num" />
            </Field>
            <Field label="Codice fiscale" htmlFor="fiscalCode" helper="Undici cifre o sedici caratteri" width="24ch">
              <TextInput id="fiscalCode" name="fiscalCode" value={values.fiscalCode} onChange={(event) => onChange({ fiscalCode: event.target.value })} className="egw-num uppercase" />
            </Field>
          </FormGrid>
          <FormGrid>
            <div className="flex flex-col gap-3">
              <Field label="Regime fiscale" htmlFor="taxRegime">
                <Select id="taxRegime" value={taxPreset} onValueChange={chooseTaxRegime} options={TAX_REGIMES_LIST.map((regime) => ({ value: regime, label: regime }))} placeholder="Seleziona regime fiscale" />
              </Field>
              {values.taxRegimeCustom ? (
                <Field label="Regime fiscale scritto a mano" htmlFor="customTaxRegime">
                  <TextInput id="customTaxRegime" value={values.taxRegime} onChange={(event) => onChange({ taxRegime: event.target.value })} placeholder="Scrivi il tuo regime fiscale" />
                </Field>
              ) : null}
            </div>
            <Field label="Codice ATECO" htmlFor="atecoCode" width="14ch">
              <TextInput id="atecoCode" name="atecoCode" value={values.atecoCode} onChange={(event) => onChange({ atecoCode: event.target.value })} className="egw-num" />
            </Field>
          </FormGrid>
        </div>
      </Panel>

      <Panel as="section" aria-labelledby="club-section-sede-legale-title">
        <PanelHeader eyebrow="Dati fiscali" title={<span id="club-section-sede-legale-title">Sede legale</span>} />
        <div className="flex flex-col gap-5">
          <Field label="Indirizzo" htmlFor="legalAddress">
            <ClubCapitalizedInput id="legalAddress" name="legalAddress" value={values.legalAddress} onChange={(event) => onChange({ legalAddress: event.target.value })} onValueChange={(legalAddress) => onChange({ legalAddress })} />
          </Field>
          <AssistedAddressFields
            idPrefix="club-legal"
            values={{ postalCode: values.legalPostalCode, city: values.legalCity, province: values.legalProvince, region: values.legalRegion, country: values.legalCountry }}
            onChange={(patch) =>
              onChange({
                ...(patch.postalCode !== undefined ? { legalPostalCode: patch.postalCode } : {}),
                ...(patch.city !== undefined ? { legalCity: patch.city } : {}),
                ...(patch.province !== undefined ? { legalProvince: patch.province } : {}),
                ...(patch.region !== undefined ? { legalRegion: patch.region } : {}),
                ...(patch.country !== undefined ? { legalCountry: patch.country } : {}),
              })
            }
          />
        </div>
      </Panel>

      <Panel as="section" aria-labelledby="club-section-rappresentante-title">
        <PanelHeader eyebrow="Dati fiscali" title={<span id="club-section-rappresentante-title">Legale rappresentante</span>} description="Chi firma per il club. Il codice fiscale si verifica, non si calcola: la scheda non raccoglie data di nascita e sesso." />
        <div className="flex flex-col gap-5">
          <FormGrid>
            <Field label="Nome" htmlFor="representativeName">
              <ClubCapitalizedInput id="representativeName" name="representativeName" value={values.representativeName} onChange={(event) => onChange({ representativeName: event.target.value })} onValueChange={(representativeName) => onChange({ representativeName })} />
            </Field>
            <Field label="Cognome" htmlFor="representativeSurname">
              <ClubCapitalizedInput id="representativeSurname" name="representativeSurname" value={values.representativeSurname} onChange={(event) => onChange({ representativeSurname: event.target.value })} onValueChange={(representativeSurname) => onChange({ representativeSurname })} />
            </Field>
          </FormGrid>
          <AssistedFiscalCodeField
            id="representativeFiscalCode"
            label="Codice fiscale"
            value={values.representativeFiscalCode}
            onChange={(representativeFiscalCode) => onChange({ representativeFiscalCode })}
            person={{ firstName: values.representativeName, lastName: values.representativeSurname }}
            enableCompute={false}
          />
        </div>
      </Panel>
    </div>
  );
}

/* ── Dati bancari ────────────────────────────────────────────────────────── */
export function ClubBankSection({ values, onChange }: SectionProps) {
  const meta = sectionMeta("bancari");
  return (
    <Panel as="section" id="club-section-bancari" aria-labelledby="club-section-bancari-title">
      <PanelHeader eyebrow="Dati bancari" title={<span id="club-section-bancari-title">Conto del club</span>} description={meta?.description} />
      <FormGrid>
        <Field label="IBAN" htmlFor="iban" helper="Si salva solo quando e completo: due lettere di paese, due cifre di controllo e almeno undici caratteri.">
          <TextInput id="iban" name="iban" value={values.iban} onChange={(event) => onChange({ iban: event.target.value })} className="egw-num uppercase" autoComplete="off" spellCheck={false} />
        </Field>
        <Field label="Nome banca" htmlFor="bankName">
          <ClubCapitalizedInput id="bankName" name="bankName" value={values.bankName} onChange={(event) => onChange({ bankName: event.target.value })} onValueChange={(bankName) => onChange({ bankName })} />
        </Field>
      </FormGrid>
    </Panel>
  );
}

/* ── Contatti ────────────────────────────────────────────────────────────── */
function ContactPanel({ index, values, onChange }: SectionProps & { index: 1 | 2 }) {
  const nameKey = `contact${index}Name` as const;
  const phoneKey = `contact${index}Phone` as const;
  const emailKey = `contact${index}Email` as const;
  return (
    <Panel as="section" aria-labelledby={`club-section-contatto-${index}-title`}>
      <PanelHeader eyebrow="Contatti" title={<span id={`club-section-contatto-${index}-title`}>Contatto {index}</span>} />
      <div className="flex flex-col gap-5">
        <Field label="Nome contatto" htmlFor={nameKey}>
          <ClubCapitalizedInput id={nameKey} name={nameKey} value={values[nameKey]} onChange={(event) => onChange({ [nameKey]: event.target.value })} onValueChange={(value) => onChange({ [nameKey]: value })} placeholder="Nome e cognome" />
        </Field>
        <FormGrid>
          <div className="flex min-w-0 flex-col">
            <PhoneField id={phoneKey} label="Telefono" value={values[phoneKey]} onChange={(value) => onChange({ [phoneKey]: value })} />
          </div>
          <Field label="Email" htmlFor={emailKey}>
            <TextInput id={emailKey} name={emailKey} type="email" inputMode="email" autoComplete="email" value={values[emailKey]} onChange={(event) => onChange({ [emailKey]: event.target.value })} />
          </Field>
        </FormGrid>
      </div>
    </Panel>
  );
}

export function ClubContactsSection({ values, onChange }: SectionProps) {
  const meta = sectionMeta("contatti");
  return (
    <div className="flex flex-col gap-[18px]">
      <Panel as="section" id="club-section-contatti" aria-labelledby="club-section-contatti-title">
        <PanelHeader eyebrow="Contatti" title={<span id="club-section-contatti-title">Dati societa</span>} description={meta?.description} />
        <FormGrid>
          <Field label="Email societa" htmlFor="companyEmail">
            <TextInput id="companyEmail" type="email" inputMode="email" value={values.companyEmail} onChange={(event) => onChange({ companyEmail: event.target.value })} placeholder="email@societa.it" />
          </Field>
          <Field label="PEC" htmlFor="companyPec" helper="Finisce nei documenti fiscali.">
            <TextInput id="companyPec" type="email" inputMode="email" value={values.companyPec} onChange={(event) => onChange({ companyPec: event.target.value })} placeholder="pec@pec.it" />
          </Field>
        </FormGrid>
      </Panel>
      <ContactPanel index={1} values={values} onChange={onChange} />
      <ContactPanel index={2} values={values} onChange={onChange} />
    </div>
  );
}

/* ── Social ──────────────────────────────────────────────────────────────── */
const SOCIAL_FIELDS: Array<{ key: keyof ClubFormValues & ("facebook" | "instagram" | "twitter" | "youtube" | "website"); label: string; placeholder: string }> = [
  { key: "website", label: "Sito web", placeholder: "https://..." },
  { key: "facebook", label: "Facebook", placeholder: "https://facebook.com/..." },
  { key: "instagram", label: "Instagram", placeholder: "https://instagram.com/..." },
  { key: "twitter", label: "X (Twitter)", placeholder: "https://x.com/..." },
  { key: "youtube", label: "YouTube", placeholder: "https://youtube.com/..." },
];

export function ClubSocialSection({ values, onChange }: SectionProps) {
  const meta = sectionMeta("social");
  return (
    <Panel as="section" id="club-section-social" aria-labelledby="club-section-social-title">
      <PanelHeader eyebrow="Social" title={<span id="club-section-social-title">Social media e web</span>} description={meta?.description} />
      <FormGrid>
        {SOCIAL_FIELDS.map((field) => (
          <Field key={field.key} label={field.label} htmlFor={field.key}>
            <TextInput id={field.key} name={field.key} type="url" inputMode="url" value={values[field.key]} onChange={(event) => onChange({ [field.key]: event.target.value })} placeholder={field.placeholder} />
          </Field>
        ))}
      </FormGrid>
    </Panel>
  );
}
