"use client";

import * as React from "react";
import { useId } from "react";
import { ChevronDown, Plus, Trash2 } from "lucide-react";
import { LogoUpload } from "@/components/ui/avatar-upload";
import { AssistedAddressFields } from "@/components/forms/assisted-anagrafica";
import { Drawer } from "@/components/web/overlays/Drawer";
import { DateInput, Field, FieldSizeProvider, TextInput, ValidationSummary } from "@/components/web/forms/Field";
import { Button, IconButton } from "@/components/web/primitives/Button";
import { DataChip } from "@/components/web/primitives/StatusPill";
import { InsetBlock } from "@/components/web/primitives/Surface";
import { cn } from "@/lib/utils";
import { CLUB_TYPE_PRESETS, CREATE_CLUB_TABS, FEDERATION_PRESETS, type ClubCreateFormState } from "@/components/account/account-shared";

export type CreateClubSection = (typeof CREATE_CLUB_TABS)[number]["value"];

/**
 * Il modulo con cui nasce un club, in un cassetto da 720 (guideline 08 §8.5:
 * piu gruppi di campi, sezioni chiudibili). Le sei schede della modale V1
 * diventano sei sezioni impilate di cui **una aperta alla volta**: la sezione
 * aperta e lo stesso stato che la V1 chiamava `tab`, e quando manca un dato
 * obbligatorio e la pagina a dire quale sezione aprire
 * (`CREATE_CLUB_REQUIRED_FIELDS`), esattamente come prima.
 *
 * Stessi campi, stessi id dove esistevano, stesso invio (fatto da chi monta
 * il cassetto: `POST /api/v1/clubs`). Il logo, che la V1 montava dentro un
 * blocco `hidden`, qui e raggiungibile: il corpo della richiesta lo mandava
 * gia.
 */
export function AccountCreateClubDrawer({
  open,
  onOpenChange,
  form,
  dirty,
  section,
  creating,
  availableClubSlots,
  clubSlotLimit,
  ownedClubCount,
  missing,
  onSectionChange,
  onFieldChange,
  onFederationChange,
  onFederationAdd,
  onFederationRemove,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  form: ClubCreateFormState;
  dirty: boolean;
  section: CreateClubSection;
  creating: boolean;
  availableClubSlots: number | null;
  clubSlotLimit: number | null;
  ownedClubCount: number;
  /** I dati obbligatori che mancano, gia calcolati dalla pagina (etichetta + sezione). */
  missing: Array<{ field: keyof ClubCreateFormState; label: string; tab: CreateClubSection }>;
  onSectionChange: (value: CreateClubSection) => void;
  onFieldChange: (field: keyof ClubCreateFormState, value: any) => void;
  onFederationChange: (federationId: string, field: "name" | "registrationNumber" | "affiliationDate", value: string) => void;
  onFederationAdd: () => void;
  onFederationRemove: (federationId: string) => void;
  onSubmit: () => void;
}) {
  const summary = missing.map((entry) => ({ id: `club-${entry.field}`, label: entry.label }));

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      width="wide"
      eyebrow="Club di proprietà"
      title="Configura un nuovo club"
      description="Inserisci subito i dati essenziali e, se vuoi, anticipa già anche fiscali, bancari, contatti, federazioni, social e logo."
      dirty={dirty}
      locked={creating}
      data-test="account-create-club-drawer"
      headerAside={
        <span className="egw-num font-brand text-[11px] font-semibold text-egw-ink-62" title={clubSlotLimit === null ? "Nessun limite configurato per questo account." : `${ownedClubCount} club già creati su ${clubSlotLimit} slot disponibili.`}>
          {clubSlotLimit === null ? "Slot: nessun limite" : `Slot: ${availableClubSlots} su ${clubSlotLimit}`}
        </span>
      }
      footer={
        <>
          <Button variant="primary" icon={<Plus />} onClick={onSubmit} loading={creating}>
            Crea club
          </Button>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={creating}>
            Chiudi
          </Button>
        </>
      }
    >
      <FieldSizeProvider size="sm">
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit();
          }}
        >
          <ValidationSummary errors={summary} />

          <Section id="general" label="Generali" open={section === "general"} onOpen={onSectionChange} summary={form.name || "Nome, tipologia, sede"} required>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Field label="Nome club" htmlFor="club-name" required>
                <TextInput id="club-name" value={form.name} onChange={(event) => onFieldChange("name", event.target.value)} placeholder="Es. EasyGame Academy" />
              </Field>
              <Field label="Tipologia" htmlFor="club-type" required>
                <TextInput id="club-type" value={form.type} onChange={(event) => onFieldChange("type", event.target.value)} placeholder="Es. Dilettante" />
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {CLUB_TYPE_PRESETS.map((preset) => (
                    <button key={preset} type="button" onClick={() => onFieldChange("type", preset)} className="rounded-egw-chip focus-visible:outline-none focus-visible:shadow-egw-focus">
                      <DataChip size="sm" tone={form.type === preset ? "navy" : "neutral"}>
                        {preset}
                      </DataChip>
                    </button>
                  ))}
                </div>
              </Field>
              <Field label="Anno fondazione" htmlFor="club-founding-year" width="12ch">
                <TextInput id="club-founding-year" numeric inputMode="numeric" value={form.foundingYear} onChange={(event) => onFieldChange("foundingYear", event.target.value)} placeholder="Es. 2012" />
              </Field>
              <Field label="Indirizzo" htmlFor="club-address" required className="md:col-span-2">
                <TextInput id="club-address" value={form.address} onChange={(event) => onFieldChange("address", event.target.value)} autoComplete="street-address" />
              </Field>
              <div className="md:col-span-2">
                <AssistedAddressFields
                  idPrefix="club"
                  values={{ postalCode: form.postalCode, city: form.city, province: form.province, region: form.region, country: form.country }}
                  onChange={(patch) => {
                    (Object.keys(patch) as (keyof typeof patch)[]).forEach((key) => {
                      onFieldChange(key, patch[key]);
                    });
                  }}
                />
              </div>
              <InsetBlock className="flex flex-wrap items-center gap-4 md:col-span-2">
                <LogoUpload currentLogo={form.logoUrl || null} onLogoChange={(value) => onFieldChange("logoUrl", value || "")} name={form.name || "Nuovo club"} />
                <div className="min-w-0 flex-1">
                  <p className="font-brand text-[13px] font-semibold text-egw-ink">Logo del club</p>
                  <p className="mt-0.5 font-brand text-[12px] leading-[1.5] text-egw-ink-62">Facoltativo: lo puoi aggiungere anche dopo, dalla pagina del club.</p>
                </div>
              </InsetBlock>
            </div>
          </Section>

          <Section id="fiscal" label="Dati fiscali" open={section === "fiscal"} onOpen={onSectionChange} summary={form.businessName || form.vatNumber || "Ragione sociale, partita IVA, sede legale"}>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <InputWithLabel label="Ragione sociale" value={form.businessName} onChange={(value) => onFieldChange("businessName", value)} />
              <InputWithLabel label="PEC" type="email" value={form.pec} onChange={(value) => onFieldChange("pec", value)} />
              <InputWithLabel label="Partita IVA" value={form.vatNumber} onChange={(value) => onFieldChange("vatNumber", value)} />
              <InputWithLabel label="Codice fiscale" value={form.fiscalCode} onChange={(value) => onFieldChange("fiscalCode", value)} />
              <InputWithLabel label="Regime fiscale" value={form.taxRegime} onChange={(value) => onFieldChange("taxRegime", value)} />
              <InputWithLabel label="Codice ATECO" value={form.atecoCode} onChange={(value) => onFieldChange("atecoCode", value)} />
              <InputWithLabel label="Codice SDI" value={form.sdiCode} onChange={(value) => onFieldChange("sdiCode", value)} />
            </div>
            <p className="mb-3 mt-6 font-brand text-[10px] font-bold uppercase tracking-[var(--egw-track-eyebrow)] text-egw-ink-42">Sede legale e rappresentante</p>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Field label="Indirizzo sede legale" htmlFor="legal-address" className="md:col-span-2">
                <TextInput id="legal-address" value={form.legalAddress} onChange={(event) => onFieldChange("legalAddress", event.target.value)} />
              </Field>
              <InputWithLabel label="Città sede legale" value={form.legalCity} onChange={(value) => onFieldChange("legalCity", value)} />
              <InputWithLabel label="CAP sede legale" value={form.legalPostalCode} onChange={(value) => onFieldChange("legalPostalCode", value)} />
              <InputWithLabel label="Regione sede legale" value={form.legalRegion} onChange={(value) => onFieldChange("legalRegion", value)} />
              <InputWithLabel label="Provincia sede legale" value={form.legalProvince} onChange={(value) => onFieldChange("legalProvince", value)} />
              <InputWithLabel label="Paese sede legale" value={form.legalCountry} onChange={(value) => onFieldChange("legalCountry", value)} />
              <InputWithLabel label="Nome rappresentante" value={form.representativeName} onChange={(value) => onFieldChange("representativeName", value)} />
              <InputWithLabel label="Cognome rappresentante" value={form.representativeSurname} onChange={(value) => onFieldChange("representativeSurname", value)} />
              <InputWithLabel label="Codice fiscale rappresentante" value={form.representativeFiscalCode} onChange={(value) => onFieldChange("representativeFiscalCode", value)} />
            </div>
          </Section>

          <Section id="bank" label="Dati bancari" open={section === "bank"} onOpen={onSectionChange} summary={form.iban || "Banca e IBAN"}>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <InputWithLabel label="Nome banca" value={form.bankName} onChange={(value) => onFieldChange("bankName", value)} />
              <InputWithLabel label="IBAN" value={form.iban} onChange={(value) => onFieldChange("iban", value)} />
            </div>
          </Section>

          <Section id="contacts" label="Contatti" open={section === "contacts"} onOpen={onSectionChange} summary={form.contactEmail || "Email e telefono del club"} required>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <InputWithLabel id="club-contactEmail" label="Email contatto" type="email" value={form.contactEmail} onChange={(value) => onFieldChange("contactEmail", value)} required />
              <InputWithLabel id="club-contactPhone" label="Telefono contatto" type="tel" value={form.contactPhone} onChange={(value) => onFieldChange("contactPhone", value)} required />
            </div>
            <p className="mb-3 mt-6 font-brand text-[10px] font-bold uppercase tracking-[var(--egw-track-eyebrow)] text-egw-ink-42">Contatto amministrativo</p>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <InputWithLabel label="Nome contatto" value={form.contact1Name} onChange={(value) => onFieldChange("contact1Name", value)} />
              <InputWithLabel label="Telefono" type="tel" value={form.contact1Phone} onChange={(value) => onFieldChange("contact1Phone", value)} />
              <InputWithLabel label="Email" type="email" value={form.contact1Email} onChange={(value) => onFieldChange("contact1Email", value)} />
            </div>
            <p className="mb-3 mt-6 font-brand text-[10px] font-bold uppercase tracking-[var(--egw-track-eyebrow)] text-egw-ink-42">Secondo contatto</p>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <InputWithLabel label="Nome contatto" value={form.contact2Name} onChange={(value) => onFieldChange("contact2Name", value)} />
              <InputWithLabel label="Telefono" type="tel" value={form.contact2Phone} onChange={(value) => onFieldChange("contact2Phone", value)} />
              <InputWithLabel label="Email" type="email" value={form.contact2Email} onChange={(value) => onFieldChange("contact2Email", value)} />
            </div>
          </Section>

          <Section id="federation" label="Federazione" open={section === "federation"} onOpen={onSectionChange} summary={form.federations.length ? `${form.federations.length} ${form.federations.length === 1 ? "affiliazione" : "affiliazioni"}` : "Affiliazioni federali"}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="font-brand text-[12.5px] text-egw-ink-62">Se vuoi puoi anticipare già le affiliazioni principali.</p>
              <Button variant="secondary" size="sm" icon={<Plus />} onClick={onFederationAdd}>
                Aggiungi federazione
              </Button>
            </div>
            <div className="mt-4 flex flex-col gap-3">
              {form.federations.length === 0 ? (
                <InsetBlock dashed className="text-center font-brand text-[12.5px] text-egw-ink-62">
                  Nessuna affiliazione inserita per ora.
                </InsetBlock>
              ) : (
                form.federations.map((item) => (
                  <InsetBlock key={item.id}>
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-[1.6fr_1fr_1fr_auto]">
                      <div>
                        <InputWithLabel label="Federazione" value={item.name} onChange={(value) => onFederationChange(item.id, "name", value)} placeholder="Es. FIGC - Federazione Italiana Giuoco Calcio" />
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {FEDERATION_PRESETS.map((preset) => (
                            <button key={preset} type="button" onClick={() => onFederationChange(item.id, "name", preset)} className="rounded-egw-chip focus-visible:outline-none focus-visible:shadow-egw-focus" title={preset}>
                              <DataChip size="sm" tone={item.name === preset ? "navy" : "neutral"}>
                                {preset.split(" - ")[0]}
                              </DataChip>
                            </button>
                          ))}
                        </div>
                      </div>
                      <InputWithLabel label="Numero iscrizione" value={item.registrationNumber} onChange={(value) => onFederationChange(item.id, "registrationNumber", value)} />
                      <InputWithLabel label="Data affiliazione" type="date" value={item.affiliationDate} onChange={(value) => onFederationChange(item.id, "affiliationDate", value)} />
                      <div className="flex items-end">
                        <IconButton aria-label={`Rimuovi ${item.name || "la federazione"}`} onClick={() => onFederationRemove(item.id)}>
                          <Trash2 />
                        </IconButton>
                      </div>
                    </div>
                  </InsetBlock>
                ))
              )}
            </div>
          </Section>

          <Section id="social" label="Social" open={section === "social"} onOpen={onSectionChange} summary={form.website || "Sito e canali social"}>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <InputWithLabel label="Sito web" type="url" value={form.website} onChange={(value) => onFieldChange("website", value)} placeholder="https://..." />
              <InputWithLabel label="Facebook" type="url" value={form.facebook} onChange={(value) => onFieldChange("facebook", value)} placeholder="https://facebook.com/..." />
              <InputWithLabel label="Instagram" type="url" value={form.instagram} onChange={(value) => onFieldChange("instagram", value)} placeholder="https://instagram.com/..." />
              <InputWithLabel label="X / Twitter" type="url" value={form.twitter} onChange={(value) => onFieldChange("twitter", value)} placeholder="https://x.com/..." />
              <Field label="YouTube" htmlFor="youtube" className="md:col-span-2">
                <TextInput id="youtube" type="url" value={form.youtube} onChange={(event) => onFieldChange("youtube", event.target.value)} placeholder="https://youtube.com/..." />
              </Field>
            </div>
          </Section>

          <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
        </form>
      </FieldSizeProvider>
    </Drawer>
  );
}

/**
 * Una sezione del modulo: intestazione sempre visibile (titolo, riepilogo in
 * una riga, chevron), corpo montato solo quando e aperta. Una aperta alla
 * volta, come le schede della V1, cosi il cassetto resta corto quanto la
 * sezione su cui si sta lavorando.
 */
function Section({
  id,
  label,
  summary,
  open,
  required,
  onOpen,
  children,
}: {
  id: CreateClubSection;
  label: string;
  summary?: string;
  open: boolean;
  required?: boolean;
  onOpen: (id: CreateClubSection) => void;
  children: React.ReactNode;
}) {
  const bodyId = `club-section-${id}`;
  return (
    <section className={cn("rounded-egw-panel-sm border bg-white", open ? "border-[rgba(37,99,235,.28)]" : "border-egw-hairline")} data-section={id}>
      <button
        type="button"
        onClick={() => onOpen(id)}
        aria-expanded={open}
        aria-controls={bodyId}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left focus-visible:outline-none focus-visible:shadow-egw-focus"
      >
        <span className="min-w-0">
          <span className="block font-brand text-[13.5px] font-bold text-egw-ink">
            {label}
            {required ? (
              <span className="ml-0.5 text-egw-red" aria-hidden>
                *
              </span>
            ) : null}
          </span>
          {!open && summary ? <span className="egw-ellipsis mt-0.5 block font-brand text-[11.5px] text-egw-ink-62">{summary}</span> : null}
        </span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-egw-ink-62 transition-transform duration-panel", open && "rotate-180")} aria-hidden />
      </button>
      {open ? (
        <div id={bodyId} className="border-t border-egw-hairline px-4 pb-4 pt-4">
          {children}
        </div>
      ) : null}
    </section>
  );
}

function InputWithLabel({
  label,
  value,
  onChange,
  id,
  type = "text",
  placeholder,
  required = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  id?: string;
  type?: string;
  placeholder?: string;
  required?: boolean;
}) {
  /*
    L'id derivato dal testo dell'etichetta produceva **doppioni** (due «Nome
    contatto», due «Telefono», due «Email», una riga per federazione): con due
    elementi dello stesso id, `htmlFor` porta sempre al primo. `useId` da un
    identificativo diverso a ogni istanza; chi ha bisogno di un id stabile
    continua a passarlo.
  */
  const generatedId = useId();
  const inputId = id || `campo-${generatedId}`;

  return (
    <Field label={label} htmlFor={inputId} required={required}>
      {type === "date" ? (
        <DateInput id={inputId} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
      ) : (
        <TextInput id={inputId} type={type} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
      )}
    </Field>
  );
}
