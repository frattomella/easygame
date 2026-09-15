"use client";

import React, { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Sidebar from "@/components/dashboard/Sidebar";
import Header from "@/components/dashboard/Header";
import {
  DashboardPageContainer,
  dashboardMainClassName,
} from "@/components/dashboard/dashboard-page-container";
import { PageHeader } from "@/components/web/page/PageHeader";
import { AlertBlock } from "@/components/web/page/Alerts";
import { Panel, PanelHeader } from "@/components/web/primitives/Surface";
import { Button } from "@/components/web/primitives/Button";
import { DataChip } from "@/components/web/primitives/StatusPill";
import {
  DateInput,
  Field,
  FormGrid,
  MultiSelect,
  TextInput,
  Textarea,
  ValidationSummary,
} from "@/components/web/forms/Field";
import { useToast } from "@/components/ui/toast-notification";
import { useAuth } from "@/components/providers/AuthProvider";
import { supabase } from "@/lib/supabase";
import { buildCategoryDisplayIndex } from "@/lib/categories/display";
import {
  buildCategoryGroups,
  normalizeClubSites,
  type CategoryGroup,
} from "@/lib/club-sites";
import { addClubData } from "@/lib/simplified-db";
import { PersonResidenceFields } from "@/components/forms/assisted-anagrafica";
import { PersonIdentityFields } from "@/components/forms/person-identity-fields";
import { PhoneField } from "@/components/forms/phone-field";
import { DocumentExtractionField } from "@/components/forms/document-extraction-field";
import { ClothingSizesFields } from "@/components/forms/clothing-sizes-fields";
import { DEFAULT_CLOTHING_SIZES, type ClothingSizes } from "@/lib/clothing-sizes";
import { Mail } from "lucide-react";
import { todayLocalDateOnly } from "@/lib/date-only";

/**
 * Nuovo allenatore nel Web V2 (pattern 6, guideline 09 §9.1): pannelli a
 * sezioni, griglia a due colonne dove i campi sono pari, barra delle azioni
 * appiccicata in fondo. Stessi campi, stesse regole e stessa scrittura della
 * V1 (`addClubData(clubId, "trainers", …)`).
 */
type TrainerFormState = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  /**
   * La data intera, non il solo anno: senza data e sesso il codice fiscale
   * non si calcola. `birthYear` resta scritto, derivato, per le schede che
   * lo leggono ancora.
   */
  birthDate: string;
  gender: string;
  birthPlace: string;
  birthPlaceCode: string;
  fiscalCode: string;
  clothingSizes: ClothingSizes;
  address: string;
  city: string;
  postalCode: string;
  salary: string;
  startDate: string;
  bio: string;
  selectedCategories: string[];
};

const initialFormState: TrainerFormState = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  birthDate: "",
  gender: "",
  birthPlace: "",
  birthPlaceCode: "",
  fiscalCode: "",
  clothingSizes: DEFAULT_CLOTHING_SIZES,
  address: "",
  city: "",
  postalCode: "",
  salary: "",
  startDate: todayLocalDateOnly(),
  bio: "",
  selectedCategories: [],
};

type FormError = { id?: string; label: string };

function NewTrainerPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { showToast } = useToast();
  const { activeClub } = useAuth();
  const [clubId, setClubId] = useState<string | null>(null);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [categoryGroups, setCategoryGroups] = useState<CategoryGroup[]>([]);
  /** Come si scrive una categoria (ADR-0185): la sede solo dove il nome ne nomina due. */
  const categoryDisplay = useMemo(
    () => buildCategoryDisplayIndex({ categories, groups: categoryGroups }),
    [categories, categoryGroups],
  );
  const [formData, setFormData] = useState<TrainerFormState>(initialFormState);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingCategories, setIsLoadingCategories] = useState(true);
  const [errors, setErrors] = useState<FormError[]>([]);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    const clubIdFromParams = searchParams?.get("clubId");
    if (clubIdFromParams && clubIdFromParams !== "null") {
      setClubId(clubIdFromParams);
      return;
    }
    if (activeClub?.id) {
      setClubId(activeClub.id);
      return;
    }
    if (typeof window !== "undefined") {
      const storedClub = localStorage.getItem("activeClub");
      if (storedClub) {
        try {
          const parsed = JSON.parse(storedClub);
          if (parsed?.id) {
            setClubId(parsed.id);
            return;
          }
        } catch (error) {
          console.error("Error parsing activeClub from localStorage", error);
        }
      }
    }
  }, [activeClub, searchParams]);

  useEffect(() => {
    const loadCategories = async () => {
      if (!clubId) {
        setCategories([]);
        setIsLoadingCategories(false);
        return;
      }
      setIsLoadingCategories(true);
      try {
        const { data: clubData, error } = await supabase
          .from("clubs")
          .select("categories, club_sites, category_groups")
          .eq("id", clubId)
          .single();
        if (error) throw error;
        const nextCategories = Array.isArray(clubData?.categories)
          ? clubData.categories
              .map((category: any) => ({
                id: String(category?.id || "").trim(),
                name: String(category?.name || "").trim(),
              }))
              .filter((category: { id: string; name: string }) => Boolean(category.id && category.name))
          : [];
        setCategories(nextCategories);
        setCategoryGroups(
          buildCategoryGroups({
            categories: nextCategories,
            sites: normalizeClubSites(clubData?.club_sites),
            groups: clubData?.category_groups,
          }),
        );
      } catch (error) {
        console.error("Error loading trainer categories:", error);
        setCategories([]);
        showToast("error", "Errore nel caricamento delle categorie del club");
      } finally {
        setIsLoadingCategories(false);
      }
    };
    void loadCategories();
  }, [clubId, showToast]);

  const selectedCategoryNames = useMemo(
    () =>
      categories
        .filter((category) => formData.selectedCategories.includes(category.id))
        .map((category) => ({ id: category.id, label: categoryDisplay.label(category.id) })),
    [categories, categoryDisplay, formData.selectedCategories],
  );

  const patch = (next: Partial<TrainerFormState>) => {
    setDirty(true);
    setFormData((previous) => ({ ...previous, ...next }));
  };

  const handleInputChange = (field: keyof TrainerFormState, value: string) => patch({ [field]: value });

  const validate = (): FormError[] => {
    const next: FormError[] = [];
    if (!formData.firstName.trim()) next.push({ id: "trainer-first-name", label: "Nome" });
    if (!formData.lastName.trim()) next.push({ id: "trainer-last-name", label: "Cognome" });
    if (!formData.email.trim() && !formData.phone.trim()) {
      next.push({ id: "trainer-new-email", label: "Almeno un contatto tra email e telefono" });
    }
    return next;
  };

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!clubId) {
      showToast("error", "Club attivo non trovato. Seleziona prima un club.");
      return;
    }

    const nextErrors = validate();
    setErrors(nextErrors);
    if (nextErrors.length) {
      const first = nextErrors[0].id ? document.getElementById(nextErrors[0].id) : null;
      first?.scrollIntoView({ block: "center", behavior: "smooth" });
      first?.focus();
      return;
    }

    setIsSaving(true);
    try {
      const firstName = formData.firstName.trim();
      const lastName = formData.lastName.trim();
      const fullName = [firstName, lastName].filter(Boolean).join(" ");
      const trainerId = `trainer-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      const newTrainer = {
        id: trainerId,
        name: fullName,
        fullName,
        firstName,
        lastName,
        surname: lastName,
        email: formData.email.trim().toLowerCase(),
        phone: formData.phone.trim(),
        birthDate: formData.birthDate || null,
        // Derivato: chi legge ancora l'anno lo trova dov'era.
        birthYear: formData.birthDate ? Number(formData.birthDate.slice(0, 4)) : null,
        gender: formData.gender || null,
        birthPlace: formData.birthPlace.trim(),
        birthPlaceCode: formData.birthPlaceCode.trim(),
        fiscalCode: formData.fiscalCode.trim(),
        clothingSizes: formData.clothingSizes,
        address: formData.address.trim(),
        city: formData.city.trim(),
        postalCode: formData.postalCode.trim(),
        salary: formData.salary ? Number(formData.salary) : 0,
        hireDate: formData.startDate,
        startDate: formData.startDate,
        bio: formData.bio.trim(),
        role: "trainer",
        status: "active",
        categories: formData.selectedCategories,
        avatar: null,
        payments: [],
        contracts: [],
      };

      const savedTrainer = await addClubData(clubId, "trainers", newTrainer);
      setDirty(false);
      showToast("success", "Allenatore creato con successo");
      router.push(`/trainers/${savedTrainer.id}?clubId=${clubId}`);
    } catch (error) {
      console.error("Error creating trainer:", error);
      showToast("error", error instanceof Error ? error.message : "Errore durante la creazione dell'allenatore");
    } finally {
      setIsSaving(false);
    }
  };

  const backHref = clubId ? `/trainers?clubId=${clubId}` : "/trainers";
  const contactError = errors.find((e) => e.id === "trainer-new-email");

  return (
    <div className="flex h-[100dvh] bg-egw-page">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Header title="Nuovo allenatore" />
        <main className={dashboardMainClassName}>
          <DashboardPageContainer className="max-w-[1100px] pb-20">
            <PageHeader
              eyebrow="Persone · Allenatori"
              title="Nuovo allenatore"
              description="Crea una nuova anagrafica allenatore per il club selezionato."
            >
              {!clubId ? (
                <AlertBlock severity="warning" title="Seleziona prima un club">
                  Scegli il club dalla tua area account, poi torna qui per creare il nuovo allenatore.
                </AlertBlock>
              ) : null}
            </PageHeader>

            <form id="new-trainer-form" onSubmit={handleSave} className="flex flex-col gap-[18px]" noValidate>
              <ValidationSummary errors={errors} />

              <Panel as="section">
                <PanelHeader
                  eyebrow="Anagrafica"
                  title="Dati della persona"
                  description="Puoi compilare i campi da un documento d'identità: i dati letti si propongono, non si scrivono da soli."
                />
                <div className="space-y-5">
                  <DocumentExtractionField
                    currentValues={formData}
                    onApply={(fieldsPatch) => patch(fieldsPatch as Partial<TrainerFormState>)}
                  />
                  {/*
                    I sei campi di identita, nell'ordine condiviso: nome,
                    cognome, data e luogo di nascita, sesso, codice fiscale.
                  */}
                  <PersonIdentityFields
                    idPrefix="trainer"
                    values={formData}
                    required={{ firstName: true, lastName: true }}
                    onChange={(identityPatch) => patch(identityPatch as Partial<TrainerFormState>)}
                  />
                </div>
              </Panel>

              <Panel as="section">
                <PanelHeader
                  eyebrow="Contatti"
                  title="Contatti e residenza"
                  description="Serve almeno un recapito tra email e telefono."
                />
                <FormGrid>
                  <Field label="Email" htmlFor="trainer-new-email" error={contactError ? "Inserisci almeno un contatto tra email e telefono" : undefined}>
                    <TextInput
                      id="trainer-new-email"
                      type="email"
                      inputMode="email"
                      leading={<Mail />}
                      value={formData.email}
                      onChange={(event) => handleInputChange("email", event.target.value)}
                      placeholder="Es. marco.bianchi@easygame.it"
                    />
                  </Field>
                  <div>
                    <PhoneField
                      id="trainer-new-phone"
                      value={formData.phone}
                      onChange={(value) => handleInputChange("phone", value)}
                    />
                  </div>
                  {/*
                    Via, comune e CAP dal componente condiviso: il comune si
                    cerca nell'archivio ISTAT e porta con se il CAP quando ne
                    ha uno solo.
                  */}
                  <div className="laptop:col-span-2">
                    <PersonResidenceFields
                      idPrefix="trainer-new"
                      values={formData}
                      onChange={(residencePatch) => {
                        for (const [field, value] of Object.entries(residencePatch)) {
                          handleInputChange(field as keyof TrainerFormState, value as string);
                        }
                      }}
                    />
                  </div>
                </FormGrid>
              </Panel>

              {/*
                Taglie: stesse definizioni dell'abbigliamento. Nessun numero di
                maglia — chi non scende in campo non ne ha uno.
              */}
              <Panel as="section">
                <PanelHeader eyebrow="Vestiario" title="Taglie vestiario" />
                <ClothingSizesFields
                  idPrefix="trainer-clothing"
                  value={formData.clothingSizes}
                  onChange={(next) => patch({ clothingSizes: next })}
                  person={{ gender: formData.gender, birthDate: formData.birthDate }}
                />
              </Panel>

              <Panel as="section">
                <PanelHeader eyebrow="Inquadramento" title="Inizio, compenso e categorie" />
                <FormGrid>
                  <Field label="Data inizio" htmlFor="trainer-new-start-date" width="20ch">
                    <DateInput
                      id="trainer-new-start-date"
                      value={formData.startDate}
                      onChange={(event) => handleInputChange("startDate", event.target.value)}
                    />
                  </Field>
                  <Field label="Compenso mensile" htmlFor="trainer-new-salary" width="16ch" helper="Promemoria: il rapporto di lavoro si registra nella scheda, in «Lavoro e compensi».">
                    <TextInput
                      id="trainer-new-salary"
                      type="number"
                      numeric
                      min="0"
                      step="0.01"
                      trailing="€"
                      value={formData.salary}
                      onChange={(event) => handleInputChange("salary", event.target.value)}
                      placeholder="Es. 1500"
                    />
                  </Field>
                  <div className="laptop:col-span-2">
                    {isLoadingCategories ? (
                      <Field label="Categorie allenate">
                        <div className="h-[46px] animate-pulse rounded-egw-field bg-[rgba(11,26,58,.07)]" />
                      </Field>
                    ) : categories.length === 0 ? (
                      <AlertBlock severity="warning" title="Nessuna categoria disponibile">
                        Puoi comunque creare l&apos;allenatore e assegnargli le categorie in un secondo momento.
                      </AlertBlock>
                    ) : (
                      <Field
                        label="Categorie allenate"
                        htmlFor="trainer-new-categories"
                        helper="Un allenatore può seguire più categorie."
                      >
                        <MultiSelect
                          id="trainer-new-categories"
                          values={formData.selectedCategories}
                          onValuesChange={(next) => patch({ selectedCategories: next })}
                          options={categories.map((category) => ({ value: category.id, label: categoryDisplay.label(category.id) }))}
                          placeholder="Seleziona le categorie"
                        />
                        <div className="mt-2.5 flex flex-wrap gap-1.5">
                          {selectedCategoryNames.length > 0 ? (
                            selectedCategoryNames.map((category) => (
                              <DataChip key={category.id} tone="blue" size="sm">
                                {category.label}
                              </DataChip>
                            ))
                          ) : (
                            <p className="font-brand text-[11.5px] text-egw-ink-62">Nessuna categoria selezionata.</p>
                          )}
                        </div>
                      </Field>
                    )}
                  </div>
                  <Field label="Note professionali" htmlFor="trainer-new-bio" className="laptop:col-span-2">
                    <Textarea
                      id="trainer-new-bio"
                      value={formData.bio}
                      onChange={(event) => handleInputChange("bio", event.target.value)}
                      placeholder="Inserisci una breve presentazione o eventuali note sull'allenatore"
                      rows={4}
                    />
                  </Field>
                </FormGrid>
              </Panel>
            </form>
          </DashboardPageContainer>

          {/* Barra delle azioni appiccicata al fondo (guideline 08 §8.4). */}
          <div className="sticky bottom-0 z-10 -mx-4 mt-[18px] border-t border-egw-hairline bg-white px-4 py-3 shadow-[0_-1px_0_rgba(11,26,58,.09)] md:-mx-5 md:px-5 lg:-mx-6 lg:px-6 xl:-mx-8 xl:px-8">
            <div className="mx-auto flex w-full max-w-[1100px] flex-wrap items-center justify-between gap-3">
              <span className="font-brand text-[12px] font-medium text-egw-amber-ink">
                {dirty ? "Modifiche non salvate" : ""}
              </span>
              <div className="flex flex-wrap items-center gap-2.5">
                <Button variant="secondary" onClick={() => router.push(backHref)} disabled={isSaving}>
                  Annulla
                </Button>
                <Button type="submit" form="new-trainer-form" variant="primary" loading={isSaving} disabled={!clubId}>
                  Salva allenatore
                </Button>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

export default function NewTrainerPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center font-brand text-egw-ink-62">Caricamento</div>}>
      <NewTrainerPageContent />
    </Suspense>
  );
}
