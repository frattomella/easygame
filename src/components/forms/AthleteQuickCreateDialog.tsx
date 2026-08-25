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
        },
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
