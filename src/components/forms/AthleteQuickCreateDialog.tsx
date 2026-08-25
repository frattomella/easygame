"use client";

import React, { useMemo, useState } from "react";
import {
  findCategoryForBirthDate,
  formatCategoryBirthYears,
} from "@/lib/category-utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast-notification";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  AssistedAddressFields,
  AssistedFiscalCodeField,
} from "@/components/forms/assisted-anagrafica";
import { CapitalizedInput } from "@/components/forms/capitalized-input";
import { PhoneField } from "@/components/forms/phone-field";
import { ClothingSizesFields } from "@/components/forms/clothing-sizes-fields";
import { DocumentExtractionField } from "@/components/forms/document-extraction-field";
import {
  DEFAULT_CLOTHING_SIZES,
  type ClothingSizes,
} from "@/lib/clothing-sizes";

/**
 * Nuovo atleta.
 *
 * **Il ciclo che questo form rompe** (Blocco 7, punto 14): creare un atleta
 * con tre campi, aprire la sua scheda e ricompilare tutto il resto. Chi
 * iscrive un atleta ha davanti il modulo cartaceo con **tutti** i dati: farglieli
 * inserire in due momenti diversi non e semplicita, e lavoro doppio.
 *
 * Il rimedio non e una pagina infinita. Obbligatori restano tre campi, gli
 * stessi di prima; tutto il resto vive in sezioni **chiuse di default**, che
 * si aprono se e quando servono. Chi ha fretta fa esattamente i tre campi di
 * prima e chiude; chi ha il modulo in mano compila tutto in una volta.
 *
 * Le sezioni usano i componenti condivisi del Blocco 7 — codice fiscale
 * assistito con comune di nascita, telefono internazionale, indirizzo
 * assistito, taglie, lettura del documento — invece di reimplementarli.
 */

interface AthleteQuickCreateDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: any) => Promise<boolean | void> | boolean | void;
  categories: {
    id: string;
    name: string;
    birthYearFrom?: number;
    birthYearTo?: number;
  }[];
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
  fiscalCode: string;
  phone: string;
  email: string;
};

const createEmptyGuardian = (): AthleteDraftGuardian => ({
  name: "",
  surname: "",
  relationship: "",
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
  jerseyNumber: string;
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
  jerseyNumber: "",
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

export function AthleteQuickCreateDialog({
  isOpen,
  onClose,
  onSubmit,
  categories = [],
}: AthleteQuickCreateDialogProps) {
  const { showToast } = useToast();
  const [formData, setFormData] = useState<AthleteDraft>(getInitialFormState());
  const [isSaving, setIsSaving] = useState(false);

  React.useEffect(() => {
    if (!isOpen) {
      setFormData(getInitialFormState());
    }
  }, [isOpen]);

  const suggestedCategory = useMemo(
    () => findCategoryForBirthDate(formData.birthDate, categories),
    [formData.birthDate, categories],
  );

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
      showToast("error", "Nome, cognome e data di nascita sono obbligatori");
      return;
    }

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
          jerseyNumber: formData.jerseyNumber,
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
          registrations: formData.registrationFederation.trim()
            ? [
                {
                  id: `registration-${formData.registrationFederation
                    .trim()
                    .toLowerCase()
                    .replace(/[^a-z0-9]+/g, "-")}`,
                  federation: formData.registrationFederation.trim(),
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
      onClose();
    } catch (error) {
      console.error("Error creating athlete:", error);
      showToast("error", "Errore durante la creazione dell'atleta");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal
      title="Nuovo atleta"
      description="Obbligatori nome, cognome e data di nascita. Il resto si puo compilare ora o dopo."
      isOpen={isOpen}
      onClose={onClose}
      contentClassName="sm:max-w-2xl"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={isSaving}>
            Annulla
          </Button>
          <Button
            type="submit"
            onClick={handleSubmit}
            disabled={isSaving}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {isSaving ? "Salvataggio…" : "Salva"}
          </Button>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        <DocumentExtractionField
          currentValues={{ ...formData }}
          onApply={(patch) => set(patch as Partial<AthleteDraft>)}
        />

        {/* --- obbligatori: gli stessi tre di prima --- */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="firstName">Nome *</Label>
            <CapitalizedInput
              id="firstName"
              name="firstName"
              value={formData.firstName}
              onChange={handleChange}
              onValueChange={(value) => set({ firstName: value })}
              placeholder="Es. Mario"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="lastName">Cognome *</Label>
            <CapitalizedInput
              id="lastName"
              name="lastName"
              value={formData.lastName}
              onChange={handleChange}
              onValueChange={(value) => set({ lastName: value })}
              placeholder="Es. Rossi"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="birthDate">Data di nascita *</Label>
            <Input
              id="birthDate"
              name="birthDate"
              type="date"
              value={formData.birthDate}
              onChange={handleChange}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="categoryId">Categoria</Label>
            <select
              id="categoryId"
              name="categoryId"
              value={formData.categoryId}
              onChange={handleChange}
              className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="">Automatica per anno di nascita</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name} - {formatCategoryBirthYears(category)}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/*
          Categorie secondarie. Un atleta che si allena con due gruppi lo fa
          dal primo giorno, non da quando qualcuno riapre la scheda.
        */}
        {secondaryCategoryOptions.length ? (
          <div className="space-y-2">
            <Label>Altre categorie</Label>
            <div className="grid gap-2 sm:grid-cols-2">
              {secondaryCategoryOptions.map((category) => (
                <label
                  key={`athlete-create-secondary-${category.id}`}
                  className="flex cursor-pointer items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
                >
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={formData.secondaryCategoryIds.includes(category.id)}
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
                  <span>{category.name}</span>
                </label>
              ))}
            </div>
          </div>
        ) : null}

        {suggestedCategory && !formData.categoryId ? (
          <p className="text-sm text-muted-foreground">
            Categoria suggerita in automatico:{" "}
            <span className="font-medium text-foreground">
              {suggestedCategory.name}
            </span>
          </p>
        ) : null}

        {/*
          Tutto il resto e facoltativo e sta chiuso: la dialog resta corta come
          prima per chi vuole solo creare l'atleta.
        */}
        <Accordion type="multiple" className="w-full">
          <AccordionItem value="anagrafica">
            <AccordionTrigger>Anagrafica e codice fiscale</AccordionTrigger>
            <AccordionContent className="space-y-4 pt-2">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="gender">Sesso</Label>
                  <select
                    id="gender"
                    name="gender"
                    value={formData.gender}
                    onChange={handleChange}
                    className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value="">Non indicato</option>
                    <option value="M">Maschio</option>
                    <option value="F">Femmina</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="nationality">Nazionalita</Label>
                  <CapitalizedInput
                    id="nationality"
                    name="nationality"
                    value={formData.nationality}
                    onChange={handleChange}
                    onValueChange={(value) => set({ nationality: value })}
                  />
                </div>
              </div>

              <AssistedFiscalCodeField
                id="athlete-create-fiscal-code"
                value={formData.fiscalCode}
                onChange={(value) => set({ fiscalCode: value })}
                person={{
                  firstName: formData.firstName,
                  lastName: formData.lastName,
                  birthDate: formData.birthDate,
                  gender: formData.gender,
                }}
                belfioreCode={formData.birthPlaceCode}
                onBelfioreCodeChange={(value) => set({ birthPlaceCode: value })}
                birthPlace={formData.birthPlace}
                onBirthPlaceChange={(value) => set({ birthPlace: value })}
              />
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="contatti">
            <AccordionTrigger>Contatti</AccordionTrigger>
            <AccordionContent className="space-y-4 pt-2">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    value={formData.email}
                    onChange={handleChange}
                    placeholder="mario.rossi@example.org"
                  />
                </div>

                <PhoneField
                  id="athlete-create-phone"
                  value={formData.phone}
                  onChange={(value) => set({ phone: value })}
                />
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="residenza">
            <AccordionTrigger>Residenza</AccordionTrigger>
            <AccordionContent className="space-y-4 pt-2">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_120px]">
                <div className="space-y-2">
                  <Label htmlFor="address">Via o piazza</Label>
                  <CapitalizedInput
                    id="address"
                    name="address"
                    value={formData.address}
                    onChange={handleChange}
                    onValueChange={(value) => set({ address: value })}
                    placeholder="Via Roma"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="streetNumber">Numero</Label>
                  <Input
                    id="streetNumber"
                    name="streetNumber"
                    value={formData.streetNumber}
                    onChange={handleChange}
                    placeholder="12"
                  />
                </div>
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
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="sanitari">
            <AccordionTrigger>Dati sanitari</AccordionTrigger>
            <AccordionContent className="space-y-4 pt-2">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="medicalCertExpiry">
                    Scadenza certificato medico
                  </Label>
                  <Input
                    id="medicalCertExpiry"
                    name="medicalCertExpiry"
                    type="date"
                    value={formData.medicalCertExpiry}
                    onChange={handleChange}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="bloodType">Gruppo sanguigno</Label>
                  <Input
                    id="bloodType"
                    name="bloodType"
                    value={formData.bloodType}
                    onChange={handleChange}
                    placeholder="0+"
                  />
                </div>

                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="allergies">Allergie</Label>
                  <Input
                    id="allergies"
                    name="allergies"
                    value={formData.allergies}
                    onChange={handleChange}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="emergencyContact">
                    Contatto di emergenza
                  </Label>
                  <CapitalizedInput
                    id="emergencyContact"
                    name="emergencyContact"
                    value={formData.emergencyContact}
                    onChange={handleChange}
                    onValueChange={(value) => set({ emergencyContact: value })}
                  />
                </div>

                <PhoneField
                  id="athlete-create-emergency-phone"
                  label="Telefono di emergenza"
                  value={formData.emergencyPhone}
                  onChange={(value) => set({ emergencyPhone: value })}
                />
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="squadra">
            <AccordionTrigger>Taglie e numero di maglia</AccordionTrigger>
            <AccordionContent className="space-y-4 pt-2">
              <div className="space-y-2 sm:max-w-[200px]">
                <Label htmlFor="jerseyNumber">Numero di maglia</Label>
                <Input
                  id="jerseyNumber"
                  name="jerseyNumber"
                  inputMode="numeric"
                  className="eg-tabular"
                  value={formData.jerseyNumber}
                  onChange={handleChange}
                  placeholder="10"
                />
              </div>

              <ClothingSizesFields
                idPrefix="athlete-create-clothing"
                value={formData.clothingSizes}
                onChange={(next) => set({ clothingSizes: next })}
                person={{
                  gender: formData.gender,
                  birthDate: formData.birthDate,
                }}
              />
            </AccordionContent>
          </AccordionItem>

          {/*
            Genitori e tutori. Per un minore sono il recapito che serve
            davvero, e finora si potevano inserire solo dopo, aprendo la
            scheda: cioe il secondo giro che questo form esiste per togliere.
          */}
          <AccordionItem value="genitori">
            <AccordionTrigger>Genitori e tutori</AccordionTrigger>
            <AccordionContent className="space-y-4 pt-2">
              {formData.guardians.map((guardian, index) => (
                <div
                  key={`guardian-${index}`}
                  className="space-y-3 rounded-lg border border-slate-200 p-3"
                >
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-slate-700">
                      Genitore/tutore {index + 1}
                    </p>
                    {formData.guardians.length > 1 ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-red-600 hover:bg-red-50 hover:text-red-700"
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

                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor={`guardian-${index}-name`}>Nome</Label>
                      <CapitalizedInput
                        id={`guardian-${index}-name`}
                        name="firstName"
                        value={guardian.name}
                        onChange={(event) =>
                          updateGuardian(index, { name: event.target.value })
                        }
                        onValueChange={(value) => updateGuardian(index, { name: value })}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor={`guardian-${index}-surname`}>Cognome</Label>
                      <CapitalizedInput
                        id={`guardian-${index}-surname`}
                        name="lastName"
                        value={guardian.surname}
                        onChange={(event) =>
                          updateGuardian(index, { surname: event.target.value })
                        }
                        onValueChange={(value) => updateGuardian(index, { surname: value })}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor={`guardian-${index}-relationship`}>
                        Parentela
                      </Label>
                      <select
                        id={`guardian-${index}-relationship`}
                        value={guardian.relationship}
                        onChange={(event) =>
                          updateGuardian(index, { relationship: event.target.value })
                        }
                        className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      >
                        <option value="">Seleziona</option>
                        <option value="Padre">Padre</option>
                        <option value="Madre">Madre</option>
                        <option value="Tutore Legale">Tutore Legale</option>
                        <option value="Nonno">Nonno</option>
                        <option value="Nonna">Nonna</option>
                        <option value="Altro">Altro</option>
                      </select>
                    </div>

                    <PhoneField
                      id={`guardian-${index}-phone`}
                      label="Telefono"
                      value={guardian.phone}
                      onChange={(value) => updateGuardian(index, { phone: value })}
                    />

                    <div className="space-y-2">
                      <Label htmlFor={`guardian-${index}-email`}>Email</Label>
                      <Input
                        id={`guardian-${index}-email`}
                        type="email"
                        value={guardian.email}
                        onChange={(event) =>
                          updateGuardian(index, { email: event.target.value })
                        }
                        placeholder="genitore@esempio.it"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor={`guardian-${index}-fiscal-code`}>
                        Codice fiscale
                      </Label>
                      <Input
                        id={`guardian-${index}-fiscal-code`}
                        value={guardian.fiscalCode}
                        onChange={(event) =>
                          updateGuardian(index, {
                            fiscalCode: event.target.value.toUpperCase(),
                          })
                        }
                        maxLength={16}
                        className="eg-tabular uppercase"
                      />
                    </div>
                  </div>
                </div>
              ))}

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  set({ guardians: [...formData.guardians, createEmptyGuardian()] })
                }
              >
                Aggiungi genitore/tutore
              </Button>
            </AccordionContent>
          </AccordionItem>

          {/*
            Tesseramento. Il numero **non** e obbligatorio: un tesseramento si
            registra a inizio stagione e la federazione emette il numero dopo
            (Blocco 7, punto 9). Senza la federazione invece il record non
            dice niente, e non viene salvato.
          */}
          <AccordionItem value="tesseramento">
            <AccordionTrigger>Tesseramento</AccordionTrigger>
            <AccordionContent className="space-y-4 pt-2">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="registrationFederation">
                    Federazione o ente
                  </Label>
                  <Input
                    id="registrationFederation"
                    name="registrationFederation"
                    value={formData.registrationFederation}
                    onChange={handleChange}
                    placeholder="Es. FIP"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="registrationNumber">
                    Numero tessera
                    <span className="ml-1 text-xs font-normal text-muted-foreground">
                      (non obbligatorio)
                    </span>
                  </Label>
                  <Input
                    id="registrationNumber"
                    name="registrationNumber"
                    className="eg-tabular"
                    value={formData.registrationNumber}
                    onChange={handleChange}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="registrationStatus">Stato</Label>
                  <select
                    id="registrationStatus"
                    name="registrationStatus"
                    value={formData.registrationStatus}
                    onChange={handleChange}
                    className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value="In corso">In corso</option>
                    <option value="Attivo">Attivo</option>
                    <option value="Scaduto">Scaduto</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="registrationIssueDate">Data di rilascio</Label>
                  <Input
                    id="registrationIssueDate"
                    name="registrationIssueDate"
                    type="date"
                    value={formData.registrationIssueDate}
                    onChange={handleChange}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="registrationExpiryDate">Scadenza</Label>
                  <Input
                    id="registrationExpiryDate"
                    name="registrationExpiryDate"
                    type="date"
                    value={formData.registrationExpiryDate}
                    onChange={handleChange}
                  />
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="note">
            <AccordionTrigger>Note</AccordionTrigger>
            <AccordionContent className="pt-2">
              <Textarea
                id="notes"
                name="notes"
                rows={3}
                value={formData.notes}
                onChange={handleChange}
                placeholder="Annotazioni sull'atleta"
              />
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </form>
    </Modal>
  );
}
