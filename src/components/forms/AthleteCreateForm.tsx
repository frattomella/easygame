"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import {
  findCategoryForBirthDate,
  formatCategoryBirthYears,
} from "@/lib/category-utils";
import {
  buildRegistrationFederationReference,
  type ClubFederation,
} from "@/lib/club-federations";
import { useToast } from "@/components/ui/toast-notification";
import { Button } from "@/components/web/primitives/Button";
import {
  Panel,
  PanelHeader,
  InsetBlock,
} from "@/components/web/primitives/Surface";
import { Checkbox } from "@/components/web/primitives/Controls";
import { AlertBlock } from "@/components/web/page/Alerts";
import { CollapsedSection } from "@/components/web/record/Record";
import { DirtyGuardDialog } from "@/components/web/overlays/Modal";
import {
  controlClasses,
  DateInput,
  Field,
  FormGrid,
  Select,
  Textarea,
  TextInput,
  ValidationSummary,
} from "@/components/web/forms/Field";
import { AssistedAddressFields } from "@/components/forms/assisted-anagrafica";
import { PersonIdentityFields } from "@/components/forms/person-identity-fields";
import {
  LEGACY_PERSON_NAME_KEYS,
  readPersonIdentity,
  writePersonIdentity,
} from "@/lib/person-identity";
import { CapitalizedInput } from "@/components/forms/capitalized-input";
import { PhoneField } from "@/components/forms/phone-field";
import { ClothingSizesFields } from "@/components/forms/clothing-sizes-fields";
import { DocumentExtractionField } from "@/components/forms/document-extraction-field";
import {
  DEFAULT_CLOTHING_SIZES,
  type ClothingSizes,
} from "@/lib/clothing-sizes";
import { cn } from "@/lib/utils";

/**
 * Il modulo di iscrizione di un nuovo atleta.
 *
 * **Il ciclo che questo form rompe** (Blocco 7, punto 14): creare un atleta
 * con tre campi, aprire la sua scheda e ricompilare tutto il resto. Chi
 * iscrive un atleta ha davanti il modulo cartaceo con **tutti** i dati:
 * farglieli inserire in due momenti diversi non e semplicita, e lavoro doppio.
 *
 * Il rimedio non e una pagina infinita. Obbligatori restano tre campi, gli
 * stessi di prima; tutto il resto vive in sezioni **chiuse di default**, che
 * si aprono se e quando servono. Chi ha fretta fa esattamente i tre campi di
 * prima e salva; chi ha il modulo in mano compila tutto in una volta.
 *
 * **Perche una pagina e non una finestra** (ADR-0057). Iscrivere un atleta e
 * il modulo piu lungo che una segreteria compila: anagrafica, residenza,
 * contatti, genitori, tesseramento, taglie. Dentro una finestra quel modulo
 * scorre dentro un riquadro che scorre dentro la pagina, a 375 px non ha dove
 * stare, e un clic fuori lo chiude portandosi via quello che era stato
 * scritto. Allenatori e soci hanno una pagina dedicata dal Blocco 7: l'atleta
 * — che ha piu campi di entrambi — era rimasto l'unico in una finestra.
 *
 * Le sezioni usano i componenti condivisi del Blocco 7 — codice fiscale
 * assistito con comune di nascita, telefono internazionale, indirizzo
 * assistito, taglie, lettura del documento — invece di reimplementarli.
 *
 * **Nel Web V2** (pattern 6, «Full-page form»): un pannello sempre aperto con
 * l'identita e la categoria, poi le otto sezioni come `CollapsedSection`
 * (chiuse di default, stato ricordato per utente), e la barra delle azioni
 * appiccicata in fondo con la nota «Modifiche non salvate». I campi che il
 * modulo disegna da se sono le primitive di `@/components/web/forms/Field`; i
 * blocchi condivisi con le altre nove anagrafiche restano quelli, avvolti.
 */

interface AthleteCreateFormProps {
  /** L'id del modulo, per il pulsante di salvataggio nell'intestazione. */
  formId?: string;
  onSubmit: (data: any) => Promise<boolean | void> | boolean | void;
  onCancel?: () => void;
  /** Nasconde i pulsanti in fondo quando la pagina ne ha gia in cima. */
  showFooterActions?: boolean;
  /** Avvisa la pagina quando ci sono modifiche non salvate (guardia sul ritorno). */
  onDirtyChange?: (dirty: boolean) => void;
  /**
   * Un blocco sotto l'identita, disegnato dalla pagina con nome, cognome e
   * data di nascita correnti: e «Possibile anagrafica gia presente»
   * (ADR-0188), che cerca fra le persone in prova mentre si scrive.
   */
  identityNotice?: (identity: { firstName: string; lastName: string; birthDate: string }) => React.ReactNode;
  categories: {
    id: string;
    name: string;
    birthYearFrom?: number;
    birthYearTo?: number;
  }[];
  /**
   * Come si scrive una categoria (ADR-0185): la pagina la chiede all'indice
   * canonico (`buildCategoryDisplayIndex`), che accosta la sede dove il nome
   * ne nomina due. Senza, due «Pulcini» su due sedi erano due voci identiche
   * nella tendina di chi sta iscrivendo un ragazzo. Assente, resta il nome.
   */
  categoryLabel?: (categoryId: string) => string;
  /**
   * Le federazioni configurate dal club (N2).
   *
   * Qui viveva un campo di testo libero con `placeholder="Es. FIP"`: «FIP»,
   * «F.I.P.» e «Fip» erano tre enti diversi per il prodotto, e nessuno dei tre
   * era necessariamente uno di quelli del club. La creazione e la scheda
   * scrivono lo stesso dato e devono percio offrire la stessa scelta.
   */
  federations?: readonly ClubFederation[];
}

/**
 * Un genitore o tutore, come lo raccoglie la creazione.
 *
 * Sono gli stessi campi della scheda atleta, con le stesse chiavi: cosi cio
 * che si inserisce qui **e** cio che si vedra li, senza mappature intermedie
 * da tenere allineate.
 */
export type AthleteDraftGuardian = {
  name: string;
  surname: string;
  relationship: string;
  /**
   * Un genitore e una persona fisica come le altre (RC Fix 2, punti 1 e 3).
   *
   * Qui il codice fiscale era un `<Input>` in maiuscolo senza validazione ne
   * calcolo, mentre la stessa anagrafica aperta dalla scheda dell'atleta lo
   * aveva assistito: lo stesso dato, due trattamenti, a seconda di dove si
   * era passati per inserirlo. Data, luogo e sesso arrivano con il campo
   * assistito perche sono cio da cui il codice si calcola.
   */
  birthDate: string;
  birthPlace: string;
  birthPlaceCode: string;
  gender: string;
  fiscalCode: string;
  phone: string;
  email: string;
};

const createEmptyGuardian = (): AthleteDraftGuardian => ({
  name: "",
  surname: "",
  relationship: "",
  birthDate: "",
  birthPlace: "",
  birthPlaceCode: "",
  gender: "",
  fiscalCode: "",
  phone: "",
  email: "",
});

/** Vero quando il genitore ha almeno un dato: gli altri non si salvano. */
const guardianHasContent = (guardian: AthleteDraftGuardian) =>
  Object.values(guardian).some((value) => String(value || "").trim());

type AthleteDraft = {
  firstName: string;
  lastName: string;
  birthDate: string;
  categoryId: string;
  gender: string;
  birthPlace: string;
  birthPlaceCode: string;
  fiscalCode: string;
  nationality: string;
  email: string;
  phone: string;
  address: string;
  streetNumber: string;
  city: string;
  postalCode: string;
  province: string;
  region: string;
  country: string;
  medicalCertExpiry: string;
  bloodType: string;
  allergies: string;
  emergencyContact: string;
  emergencyPhone: string;
  notes: string;
  clothingSizes: ClothingSizes;
  /** Categorie oltre a quella primaria. */
  secondaryCategoryIds: string[];
  guardians: AthleteDraftGuardian[];
  registrationFederation: string;
  registrationNumber: string;
  registrationStatus: string;
  registrationIssueDate: string;
  registrationExpiryDate: string;
};

const getInitialFormState = (): AthleteDraft => ({
  firstName: "",
  lastName: "",
  birthDate: "",
  categoryId: "",
  gender: "",
  birthPlace: "",
  birthPlaceCode: "",
  fiscalCode: "",
  nationality: "Italiana",
  email: "",
  phone: "",
  address: "",
  streetNumber: "",
  city: "",
  postalCode: "",
  province: "",
  region: "",
  country: "Italia",
  medicalCertExpiry: "",
  bloodType: "",
  allergies: "",
  emergencyContact: "",
  emergencyPhone: "",
  notes: "",
  clothingSizes: DEFAULT_CLOTHING_SIZES,
  secondaryCategoryIds: [],
  guardians: [createEmptyGuardian()],
  registrationFederation: "",
  registrationNumber: "",
  registrationStatus: "In corso",
  registrationIssueDate: "",
  registrationExpiryDate: "",
});

/*
  Le tendine del Web V2 non accettano un valore vuoto (Radix): «automatica»,
  «nessuno» e «seleziona» viaggiano con un valore sentinella e tornano a
  stringa vuota nello stato, cosi il payload resta quello di sempre.
*/
const AUTO_CATEGORY = "__auto__";
const NO_FEDERATION = "__none__";
const NO_RELATIONSHIP = "__none__";

const RELATIONSHIP_OPTIONS = [
  { value: NO_RELATIONSHIP, label: "Seleziona" },
  { value: "Padre", label: "Padre" },
  { value: "Madre", label: "Madre" },
  { value: "Tutore Legale", label: "Tutore Legale" },
  { value: "Nonno", label: "Nonno" },
  { value: "Nonna", label: "Nonna" },
  { value: "Altro", label: "Altro" },
];

const REGISTRATION_STATUS_OPTIONS = [
  { value: "In corso", label: "In corso" },
  { value: "Attivo", label: "Attivo" },
  { value: "Scaduto", label: "Scaduto" },
];

/**
 * Le sezioni chiuse di default. `recordType` e la chiave della preferenza
 * `egw.<recordType>.sections`: chi apre sempre «Contatti» se la ritrova
 * aperta, senza che cio cambi il modulo per chi ha fretta.
 */
const SECTIONS_PREFERENCE = "atleta-nuovo";

/** Il campo condiviso della V1 con l'aspetto del campo V2. */
const v2InputClassName = cn(controlClasses("md"), "focus-visible:ring-0");

export function AthleteCreateForm({
  formId = "athlete-create-form",
  onSubmit,
  onCancel,
  showFooterActions = true,
  onDirtyChange,
  identityNotice,
  categories = [],
  categoryLabel,
  federations = [],
}: AthleteCreateFormProps) {
  const { showToast } = useToast();
  const [formData, setFormData] = useState<AthleteDraft>(getInitialFormState());
  const [isSaving, setIsSaving] = useState(false);
  const [validationErrors, setValidationErrors] = useState<
    Array<{ id?: string; label: string }>
  >([]);
  const [guardOpen, setGuardOpen] = useState(false);

  const suggestedCategory = useMemo(
    () => findCategoryForBirthDate(formData.birthDate, categories),
    [formData.birthDate, categories],
  );

  /*
    Sporco = diverso dallo stato iniziale. Un confronto strutturale, non un
    contatore di eventi: chi scrive e poi cancella non ha modifiche.
  */
  const initialSerialized = useMemo(
    () => JSON.stringify(getInitialFormState()),
    [],
  );
  const dirty = JSON.stringify(formData) !== initialSerialized;

  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  const set = (patch: Partial<AthleteDraft>) =>
    setFormData((previous) => ({ ...previous, ...patch }));

  const updateGuardian = (
    index: number,
    patch: Partial<AthleteDraftGuardian>,
  ) =>
    setFormData((previous) => ({
      ...previous,
      guardians: previous.guardians.map((guardian, position) =>
        position === index ? { ...guardian, ...patch } : guardian,
      ),
    }));

  /**
   * Le categorie che si possono aggiungere come secondarie.
   *
   * La primaria si esclude: sceglierla due volte non vuol dire niente, e
   * lasciarla in elenco fa credere che significhi qualcosa.
   */
  const secondaryCategoryOptions = useMemo(() => {
    const primaryId = formData.categoryId || suggestedCategory?.id || "";
    return categories.filter((category) => category.id !== primaryId);
  }, [categories, formData.categoryId, suggestedCategory]);

  const handleChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >,
  ) => {
    const { name, value } = e.target;
    set({ [name]: value } as Partial<AthleteDraft>);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (
      !formData.firstName.trim() ||
      !formData.lastName.trim() ||
      !formData.birthDate
    ) {
      /*
        Il riepilogo in cima al modulo elenca i campi da controllare e li
        raggiunge con un clic; il toast resta perche chi e in fondo alla
        pagina lo vede comunque.
      */
      setValidationErrors(
        [
          !formData.firstName.trim()
            ? { id: "athlete-create-first-name", label: "Nome" }
            : null,
          !formData.lastName.trim()
            ? { id: "athlete-create-last-name", label: "Cognome" }
            : null,
          !formData.birthDate
            ? { id: "athlete-create-birth-date", label: "Data di nascita" }
            : null,
        ].filter(
          (item): item is { id: string; label: string } => item !== null,
        ),
      );
      showToast("error", "Nome, cognome e data di nascita sono obbligatori");
      return;
    }

    setValidationErrors([]);

    /*
      L'ente si risolve **una volta**, sul registro del club, e cio che viaggia
      e il suo identificativo piu l'etichetta congelata. Un valore che non
      nomina nessuna federazione del club non produce un tesseramento: la
      stessa regola che la rotta generica fa valere per tutti (N2).
    */
    const federationReference = buildRegistrationFederationReference(
      formData.registrationFederation.trim(),
      federations,
    );

    setIsSaving(true);
    try {
      /*
        Tutto cio che e stato compilato viaggia in `data`, con le stesse chiavi
        che legge la scheda atleta: cosi il dato inserito qui **e** il dato che
        si vedra li, senza mappature intermedie da tenere allineate.
      */
      const result = await onSubmit({
        firstName: formData.firstName.trim(),
        lastName: formData.lastName.trim(),
        birthDate: formData.birthDate,
        categoryId: formData.categoryId || suggestedCategory?.id || "",
        medicalCertExpiry: formData.medicalCertExpiry || null,
        data: {
          gender: formData.gender,
          birthPlace: formData.birthPlace,
          birthPlaceCode: formData.birthPlaceCode,
          fiscalCode: formData.fiscalCode,
          nationality: formData.nationality,
          email: formData.email,
          phone: formData.phone,
          address: formData.address,
          streetNumber: formData.streetNumber,
          city: formData.city,
          postalCode: formData.postalCode,
          province: formData.province,
          region: formData.region,
          country: formData.country,
          bloodType: formData.bloodType,
          allergies: formData.allergies,
          emergencyContact: formData.emergencyContact,
          emergencyPhone: formData.emergencyPhone,
          notes: formData.notes,
          clothingSizes: formData.clothingSizes,
          /*
            Solo i genitori con almeno un dato: una riga vuota lasciata aperta
            nel form non deve diventare un tutore senza nome in archivio.
          */
          guardians: formData.guardians.filter(guardianHasContent),
          /*
            Il tesseramento si registra come lo registra la scheda atleta, ed
            e una collezione: la stessa persona puo essere tesserata con piu
            enti nella stessa stagione. Il numero **non** e obbligatorio (la
            federazione lo emette dopo), la federazione si.
          */
          registrations: federationReference
            ? [
                {
                  id: `registration-${federationReference.federationId
                    .toLowerCase()
                    .replace(/[^a-z0-9]+/g, "-")}`,
                  federationId: federationReference.federationId,
                  federation: federationReference.federation,
                  number: formData.registrationNumber.trim(),
                  status: formData.registrationStatus,
                  issueDate: formData.registrationIssueDate,
                  expiryDate: formData.registrationExpiryDate,
                  notes: "",
                  fileName: "",
                  fileUrl: "",
                },
              ]
            : [],
        },
        secondaryCategoryIds: formData.secondaryCategoryIds,
      });

      if (result === false) {
        return;
      }

      setFormData(getInitialFormState());
    } catch (error) {
      console.error("Error creating athlete:", error);
      showToast("error", "Errore durante la creazione dell'atleta");
    } finally {
      setIsSaving(false);
    }
  };

  const requestCancel = () => {
    if (!onCancel) return;
    if (dirty) {
      setGuardOpen(true);
      return;
    }
    onCancel();
  };

  const etichetta = useCallback(
    (category: { id: string; name: string }) =>
      categoryLabel ? categoryLabel(category.id) : category.name,
    [categoryLabel],
  );

  const categoryOptions = useMemo(
    () => [
      { value: AUTO_CATEGORY, label: "Automatica per anno di nascita" },
      ...categories.map((category) => ({
        value: category.id,
        label: `${etichetta(category)} - ${formatCategoryBirthYears(category)}`,
      })),
    ],
    [categories, etichetta],
  );

  const federationOptions = useMemo(
    () => [
      { value: NO_FEDERATION, label: "Nessun tesseramento" },
      ...federations.map((federation) => ({
        value: federation.id,
        label: federation.name,
      })),
    ],
    [federations],
  );

  return (
    <form
      id={formId}
      onSubmit={handleSubmit}
      className="flex flex-col gap-[18px]"
    >
      <ValidationSummary errors={validationErrors} />

      <Panel as="section">
        <PanelHeader
          eyebrow="Anagrafica"
          title="Chi è l'atleta"
          description="Tre campi obbligatori; tutto il resto si può aggiungere ora o dalla scheda."
        />

        <DocumentExtractionField
          currentValues={{ ...formData }}
          onApply={(patch) => set(patch as Partial<AthleteDraft>)}
          className="mb-5"
        />

        {/*
          I sei campi di identita, nell'ordine condiviso (RC Fix 2, punto 1).

          Prima la categoria stava **fra** la data di nascita e il sesso, e il
          codice fiscale era chiuso in una fisarmonica dopo di essa: il campo
          che si calcola dai dati anagrafici viveva tre sezioni sotto i dati da
          cui si calcola. Adesso il blocco e intero e la categoria — che non e
          un dato anagrafico ma una scelta sportiva — viene dopo.
        */}
        <PersonIdentityFields
          idPrefix="athlete-create"
          values={formData}
          required={{ firstName: true, lastName: true, birthDate: true }}
          onChange={(patch) => set(patch as Partial<AthleteDraft>)}
        />
        {identityNotice
          ? identityNotice({
              firstName: formData.firstName,
              lastName: formData.lastName,
              birthDate: formData.birthDate,
            })
          : null}

        <FormGrid className="mt-5">
          <Field
            label="Categoria"
            htmlFor="categoryId"
            helper={
              suggestedCategory && !formData.categoryId ? (
                <>
                  Categoria suggerita in automatico:{" "}
                  <span className="font-semibold text-egw-ink">
                    {suggestedCategory.name}
                  </span>
                </>
              ) : undefined
            }
          >
            <Select
              id="categoryId"
              name="categoryId"
              value={formData.categoryId || AUTO_CATEGORY}
              onValueChange={(next) =>
                set({ categoryId: next === AUTO_CATEGORY ? "" : next })
              }
              options={categoryOptions}
            />
          </Field>
        </FormGrid>

        {/*
          Categorie secondarie. Un atleta che si allena con due gruppi lo fa
          dal primo giorno, non da quando qualcuno riapre la scheda.
        */}
        {secondaryCategoryOptions.length ? (
          <div className="mt-5">
            <Field label="Altre categorie">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 laptop:grid-cols-3">
                {secondaryCategoryOptions.map((category) => (
                  <label
                    key={`athlete-create-secondary-${category.id}`}
                    className="flex min-h-[42px] cursor-pointer items-center gap-2.5 rounded-egw-control border border-egw-field-border bg-egw-page-100 px-3 font-brand text-[13px] font-medium text-egw-ink hover:border-egw-control-border"
                  >
                    <Checkbox
                      size={16}
                      checked={formData.secondaryCategoryIds.includes(
                        category.id,
                      )}
                      onChange={(event) =>
                        set({
                          secondaryCategoryIds: event.target.checked
                            ? [...formData.secondaryCategoryIds, category.id]
                            : formData.secondaryCategoryIds.filter(
                                (id) => id !== category.id,
                              ),
                        })
                      }
                    />
                    <span className="egw-ellipsis">{etichetta(category)}</span>
                  </label>
                ))}
              </div>
            </Field>
          </div>
        ) : null}
      </Panel>

      {/*
        Tutto il resto e facoltativo e sta chiuso: la pagina resta corta come
        prima per chi vuole solo creare l'atleta.
      */}
      <CollapsedSection
        id="anagrafica"
        recordType={SECTIONS_PREFERENCE}
        title="Altri dati anagrafici"
      >
        <FormGrid>
          <Field label="Nazionalità" htmlFor="nationality">
            <CapitalizedInput
              id="nationality"
              name="nationality"
              className={v2InputClassName}
              value={formData.nationality}
              onChange={handleChange}
              onValueChange={(value) => set({ nationality: value })}
            />
          </Field>
        </FormGrid>
      </CollapsedSection>

      <CollapsedSection
        id="contatti"
        recordType={SECTIONS_PREFERENCE}
        title="Contatti"
      >
        <FormGrid>
          <Field label="Email" htmlFor="email">
            <TextInput
              id="email"
              name="email"
              type="email"
              value={formData.email}
              onChange={handleChange}
              placeholder="mario.rossi@example.org"
            />
          </Field>

          <PhoneField
            id="athlete-create-phone"
            value={formData.phone}
            onChange={(value) => set({ phone: value })}
          />
        </FormGrid>
      </CollapsedSection>

      <CollapsedSection
        id="residenza"
        recordType={SECTIONS_PREFERENCE}
        title="Residenza"
      >
        <div className="flex flex-col gap-5">
          <div className="grid grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-[1fr_140px]">
            <Field label="Via o piazza" htmlFor="address">
              <CapitalizedInput
                id="address"
                name="address"
                className={v2InputClassName}
                value={formData.address}
                onChange={handleChange}
                onValueChange={(value) => set({ address: value })}
                placeholder="Via Roma"
              />
            </Field>

            <Field label="Numero" htmlFor="streetNumber">
              <TextInput
                id="streetNumber"
                name="streetNumber"
                value={formData.streetNumber}
                onChange={handleChange}
                placeholder="12"
              />
            </Field>
          </div>

          <AssistedAddressFields
            idPrefix="athlete-create-address"
            values={{
              postalCode: formData.postalCode,
              city: formData.city,
              province: formData.province,
              region: formData.region,
              country: formData.country,
            }}
            onChange={(patch) => set(patch as Partial<AthleteDraft>)}
          />
        </div>
      </CollapsedSection>

      <CollapsedSection
        id="sanitari"
        recordType={SECTIONS_PREFERENCE}
        title="Dati sanitari"
      >
        <FormGrid>
          <Field
            label="Scadenza certificato medico"
            htmlFor="medicalCertExpiry"
          >
            <DateInput
              id="medicalCertExpiry"
              name="medicalCertExpiry"
              value={formData.medicalCertExpiry}
              onChange={handleChange}
            />
          </Field>

          <Field label="Gruppo sanguigno" htmlFor="bloodType">
            <TextInput
              id="bloodType"
              name="bloodType"
              value={formData.bloodType}
              onChange={handleChange}
              placeholder="0+"
            />
          </Field>

          <Field
            label="Allergie"
            htmlFor="allergies"
            className="laptop:col-span-2"
          >
            <TextInput
              id="allergies"
              name="allergies"
              value={formData.allergies}
              onChange={handleChange}
            />
          </Field>

          <Field label="Contatto di emergenza" htmlFor="emergencyContact">
            <CapitalizedInput
              id="emergencyContact"
              name="emergencyContact"
              className={v2InputClassName}
              value={formData.emergencyContact}
              onChange={handleChange}
              onValueChange={(value) => set({ emergencyContact: value })}
            />
          </Field>

          <PhoneField
            id="athlete-create-emergency-phone"
            label="Telefono di emergenza"
            value={formData.emergencyPhone}
            onChange={(value) => set({ emergencyPhone: value })}
          />
        </FormGrid>
      </CollapsedSection>

      {/*
        Il numero di maglia non si chiede all'iscrizione (ADR-0057): non e
        un dato della persona, e un'assegnazione che appartiene a un gruppo
        di numerazione, ha una stagione e puo essere gia occupata.
        Chiederlo qui produceva un numero che nessuna regola aveva
        verificato, e che l'assegnazione vera avrebbe poi contraddetto.
      */}
      <CollapsedSection
        id="squadra"
        recordType={SECTIONS_PREFERENCE}
        title="Taglie"
      >
        <ClothingSizesFields
          idPrefix="athlete-create-clothing"
          value={formData.clothingSizes}
          onChange={(next) => set({ clothingSizes: next })}
          person={{
            gender: formData.gender,
            birthDate: formData.birthDate,
          }}
        />
      </CollapsedSection>

      {/*
        Genitori e tutori. Per un minore sono il recapito che serve
        davvero, e finora si potevano inserire solo dopo, aprendo la
        scheda: cioe il secondo giro che questo form esiste per togliere.
      */}
      <CollapsedSection
        id="genitori"
        recordType={SECTIONS_PREFERENCE}
        title="Genitori e tutori"
        count={formData.guardians.filter(guardianHasContent).length || null}
      >
        <div className="flex flex-col gap-4">
          {formData.guardians.map((guardian, index) => (
            <InsetBlock
              key={`guardian-${index}`}
              className="flex flex-col gap-4"
            >
              <div className="flex items-center justify-between gap-3">
                <p className="font-brand text-[13.5px] font-bold text-egw-ink">
                  Genitore/tutore {index + 1}
                </p>
                {formData.guardians.length > 1 ? (
                  <Button
                    type="button"
                    variant="danger"
                    size="xs"
                    onClick={() =>
                      set({
                        guardians: formData.guardians.filter(
                          (_, position) => position !== index,
                        ),
                      })
                    }
                  >
                    Togli
                  </Button>
                ) : null}
              </div>

              <PersonIdentityFields
                idPrefix={`guardian-${index}`}
                values={readPersonIdentity(guardian, LEGACY_PERSON_NAME_KEYS)}
                onChange={(patch) =>
                  updateGuardian(
                    index,
                    writePersonIdentity(patch, LEGACY_PERSON_NAME_KEYS),
                  )
                }
              />

              <FormGrid>
                <Field
                  label="Parentela"
                  htmlFor={`guardian-${index}-relationship`}
                >
                  <Select
                    id={`guardian-${index}-relationship`}
                    value={guardian.relationship || NO_RELATIONSHIP}
                    onValueChange={(next) =>
                      updateGuardian(index, {
                        relationship: next === NO_RELATIONSHIP ? "" : next,
                      })
                    }
                    options={RELATIONSHIP_OPTIONS}
                  />
                </Field>

                <PhoneField
                  id={`guardian-${index}-phone`}
                  label="Telefono"
                  value={guardian.phone}
                  onChange={(value) => updateGuardian(index, { phone: value })}
                />

                <Field label="Email" htmlFor={`guardian-${index}-email`}>
                  <TextInput
                    id={`guardian-${index}-email`}
                    type="email"
                    value={guardian.email}
                    onChange={(event) =>
                      updateGuardian(index, { email: event.target.value })
                    }
                    placeholder="genitore@esempio.it"
                  />
                </Field>
              </FormGrid>
            </InsetBlock>
          ))}

          <div>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              icon={<Plus />}
              onClick={() =>
                set({
                  guardians: [...formData.guardians, createEmptyGuardian()],
                })
              }
            >
              Aggiungi genitore/tutore
            </Button>
          </div>
        </div>
      </CollapsedSection>

      {/*
        Tesseramento. Il numero **non** e obbligatorio: un tesseramento si
        registra a inizio stagione e la federazione emette il numero dopo
        (Blocco 7, punto 9). Senza la federazione invece il record non
        dice niente, e non viene salvato.
      */}
      <CollapsedSection
        id="tesseramento"
        recordType={SECTIONS_PREFERENCE}
        title="Tesseramento"
      >
        <div className="flex flex-col gap-5">
          {federations.length === 0 ? (
            <AlertBlock
              severity="warning"
              title="Nessuna federazione registrata nel club"
            >
              Aggiungila nella pagina Club prima di tesserare.
            </AlertBlock>
          ) : null}

          <FormGrid>
            <Field label="Federazione o ente" htmlFor="registrationFederation">
              <Select
                id="registrationFederation"
                name="registrationFederation"
                value={formData.registrationFederation || NO_FEDERATION}
                onValueChange={(next) =>
                  set({
                    registrationFederation: next === NO_FEDERATION ? "" : next,
                  })
                }
                options={federationOptions}
              />
            </Field>

            <Field
              label="Numero tessera"
              htmlFor="registrationNumber"
              helper="Numero non obbligatorio: la federazione lo emette dopo."
            >
              <TextInput
                id="registrationNumber"
                name="registrationNumber"
                className="egw-num"
                value={formData.registrationNumber}
                onChange={handleChange}
              />
            </Field>

            <Field label="Stato" htmlFor="registrationStatus">
              <Select
                id="registrationStatus"
                name="registrationStatus"
                value={formData.registrationStatus}
                onValueChange={(next) => set({ registrationStatus: next })}
                options={REGISTRATION_STATUS_OPTIONS}
              />
            </Field>

            <Field label="Data di rilascio" htmlFor="registrationIssueDate">
              <DateInput
                id="registrationIssueDate"
                name="registrationIssueDate"
                value={formData.registrationIssueDate}
                onChange={handleChange}
              />
            </Field>

            <Field label="Scadenza" htmlFor="registrationExpiryDate">
              <DateInput
                id="registrationExpiryDate"
                name="registrationExpiryDate"
                value={formData.registrationExpiryDate}
                onChange={handleChange}
              />
            </Field>
          </FormGrid>
        </div>
      </CollapsedSection>

      <CollapsedSection id="note" recordType={SECTIONS_PREFERENCE} title="Note">
        <Field label="Note" htmlFor="notes">
          <Textarea
            id="notes"
            name="notes"
            rows={3}
            value={formData.notes}
            onChange={handleChange}
            placeholder="Annotazioni sull'atleta"
          />
        </Field>
      </CollapsedSection>

      {showFooterActions ? (
        /*
          La barra delle azioni resta in vista in fondo (pattern 6): Salva e
          l'unico gradiente della schermata, Annulla e secondario, e la nota
          ambra dice se c'e qualcosa da perdere.
        */
        <div className="sticky bottom-0 z-[5] flex flex-wrap items-center justify-between gap-3 rounded-egw-panel-sm border border-egw-panel-border bg-white px-4 py-3 shadow-egw-plane-1">
          <span
            className={cn(
              "font-brand text-[12.5px] font-semibold",
              dirty ? "text-egw-amber-ink" : "text-egw-ink-42",
            )}
            role="status"
            aria-live="polite"
          >
            {dirty ? "Modifiche non salvate" : "Nessuna modifica"}
          </span>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
            {onCancel ? (
              <Button
                type="button"
                variant="secondary"
                className="w-full sm:w-auto"
                onClick={requestCancel}
                disabled={isSaving}
              >
                Annulla
              </Button>
            ) : null}
            <Button
              type="submit"
              variant="primary"
              className="w-full sm:w-auto"
              loading={isSaving}
            >
              {isSaving ? "Salvataggio…" : "Salva atleta"}
            </Button>
          </div>
        </div>
      ) : null}

      <DirtyGuardDialog
        open={guardOpen}
        onOpenChange={setGuardOpen}
        onDiscard={() => {
          setGuardOpen(false);
          onCancel?.();
        }}
      />
    </form>
  );
}
