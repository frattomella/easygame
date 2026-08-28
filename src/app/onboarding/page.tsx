"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CapitalizedInput } from "@/components/forms/capitalized-input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast-notification";
import { EasyGameLogo } from "@/components/brand/easygame-logo";
import { AssistedAddressFields } from "@/components/forms/assisted-anagrafica";
import { supabase } from "@/lib/supabase";
import { readStoredActiveClub, rememberActiveSeason } from "@/lib/api/client";
import { addClubAthlete } from "@/lib/simplified-db";
import {
  emptyClubProfileDraft,
  loadClubProfile,
  patchClubSettings,
  saveClubProfileSection,
  type ClubProfileDraft,
} from "@/lib/club-profile";
import {
  buildSeasonLabelFromDates,
  normalizeClubSeasons,
} from "@/lib/club-seasons";
import { createSeason } from "@/lib/api/seasons";
import {
  ONBOARDING_STEPS,
  normalizeOnboardingState,
  onboardingProgress,
  resumeOnboardingStep,
  withCompletedOnboarding,
  withCompletedStep,
  withOnboardingSettings,
  withSkippedOnboarding,
  withStartedOnboarding,
  type OnboardingState,
  type OnboardingStepId,
} from "@/lib/onboarding";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  CalendarRange,
  Check,
  CircleCheck,
  Loader2,
  Plus,
  Trash2,
  Users,
} from "lucide-react";

/**
 * Onboarding breve, opzionale e riprendibile.
 *
 * Dopo la creazione di un club la vecchia applicazione portava direttamente
 * alla dashboard: vuota, senza stagione, senza categorie e senza atleti — e
 * senza dire da dove cominciare. Nulla era rotto, semplicemente non c'era un
 * primo passo.
 *
 * Qui i passi sono cinque e nessuno e obbligatorio: si puo saltare tutto con
 * un click e riprendere dopo (lo stato vive in `clubs.settings.onboarding`).
 * Ogni passo scrive **solo quando lo si conferma**: non c'e autosave, perche
 * un onboarding a meta scritto per errore e peggio di uno non iniziato.
 */

type CategoryDraft = { name: string; birthYearFrom: string; birthYearTo: string };
type AthleteDraft = { firstName: string; lastName: string; birthDate: string };

const emptyCategoryDraft = (): CategoryDraft => ({
  name: "",
  birthYearFrom: "",
  birthYearTo: "",
});

const emptyAthleteDraft = (): AthleteDraft => ({
  firstName: "",
  lastName: "",
  birthDate: "",
});

const AREA_TOUR = [
  {
    title: "Atleti",
    description:
      "L'anagrafica: schede, certificati medici, documenti e quote. Da qui si importa anche un elenco da CSV o XML.",
  },
  {
    title: "Categorie",
    description:
      "I gruppi per anno di nascita. Un atleta puo appartenere a piu categorie, una sola e la primaria.",
  },
  {
    title: "Allenamenti e Gare",
    description:
      "Programma settimanale, presenze e convocazioni. Il programma si salva da solo mentre lo componi.",
  },
  {
    title: "Pagamenti e Movimenti",
    description:
      "Quote, rate, incassi e prima nota. I dati economici si salvano solo con una conferma esplicita.",
  },
  {
    title: "Club",
    description:
      "Dati societari, stagioni, listini e federazioni. La stagione attiva decide quali dati vedi.",
  },
];

const slugifyCategoryId = (value: string) =>
  `category-${value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")}-${Date.now().toString(36).slice(-6)}`;

export default function OnboardingPage() {
  const router = useRouter();
  const { showToast } = useToast();

  const [clubId, setClubId] = useState<string | null>(null);
  const [clubDraft, setClubDraft] = useState<ClubProfileDraft>(
    emptyClubProfileDraft(),
  );
  const [state, setState] = useState<OnboardingState | null>(null);
  const [activeStep, setActiveStep] = useState<OnboardingStepId>("club");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);

  const [seasonForm, setSeasonForm] = useState({ startDate: "", endDate: "" });
  const [existingSeasonLabel, setExistingSeasonLabel] = useState<string | null>(
    null,
  );
  const [categoryDrafts, setCategoryDrafts] = useState<CategoryDraft[]>([
    emptyCategoryDraft(),
  ]);
  const [athleteDrafts, setAthleteDrafts] = useState<AthleteDraft[]>([
    emptyAthleteDraft(),
  ]);

  useEffect(() => {
    const activeClub = readStoredActiveClub();
    const id = activeClub?.id ? String(activeClub.id) : null;

    if (!id) {
      setLoadError("Nessun club attivo: aprine uno dalla home account.");
      setLoading(false);
      return;
    }

    setClubId(id);

    const load = async () => {
      try {
        const profile = await loadClubProfile(id);
        const onboarding = normalizeOnboardingState(profile.settings);
        const seasons = normalizeClubSeasons(profile.settings);

        setClubDraft(profile.draft);
        setState(onboarding);
        setActiveStep(resumeOnboardingStep(onboarding));
        setExistingSeasonLabel(seasons.activeSeason?.label || null);
      } catch (error: any) {
        setLoadError(error?.message || "Caricamento del club non riuscito");
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, []);

  const progress = useMemo(
    () => (state ? onboardingProgress(state) : { completed: 0, total: 5, percent: 0 }),
    [state],
  );

  const persistState = useCallback(
    async (next: OnboardingState) => {
      if (!clubId) return;
      await patchClubSettings(clubId, (settings) =>
        withOnboardingSettings(settings, next),
      );
      setState(next);
    },
    [clubId],
  );

  const goToStep = (step: OnboardingStepId) => setActiveStep(step);

  const stepIndex = ONBOARDING_STEPS.findIndex((step) => step.id === activeStep);

  const advance = () => {
    const next = ONBOARDING_STEPS[stepIndex + 1];
    if (next) {
      setActiveStep(next.id);
    } else {
      void finish();
    }
  };

  const completeStep = async (step: OnboardingStepId, work?: () => Promise<void>) => {
    if (!state || !clubId) return;

    setSaving(true);
    try {
      if (work) await work();
      const now = new Date().toISOString();
      await persistState(
        withCompletedStep(withStartedOnboarding(state, now), step, now),
      );
      advance();
    } catch (error: any) {
      showToast("error", error?.message || "Salvataggio non riuscito");
    } finally {
      setSaving(false);
    }
  };

  const skipOnboarding = async () => {
    if (!state) return;
    setSaving(true);
    try {
      await persistState(withSkippedOnboarding(state, new Date().toISOString()));
      showToast(
        "success",
        "Onboarding rimandato: lo riprendi quando vuoi dalla dashboard.",
      );
      router.push("/dashboard");
    } catch (error: any) {
      showToast("error", error?.message || "Operazione non riuscita");
    } finally {
      setSaving(false);
    }
  };

  const finish = async () => {
    if (!state) return;
    setSaving(true);
    try {
      await persistState(withCompletedOnboarding(state, new Date().toISOString()));
      showToast("success", "Configurazione iniziale completata");
      router.push("/dashboard");
    } catch (error: any) {
      showToast("error", error?.message || "Operazione non riuscita");
    } finally {
      setSaving(false);
    }
  };

  // --- lavoro dei singoli passi ---------------------------------------------

  const saveClubStep = async () => {
    if (!clubId) return;
    if (!clubDraft.name.trim()) {
      throw new Error("Il nome del club e obbligatorio");
    }
    await saveClubProfileSection(clubId, "generale", clubDraft);
    await saveClubProfileSection(clubId, "contatti", clubDraft);
  };

  const saveSeasonStep = async () => {
    if (!clubId) return;
    if (!seasonForm.startDate || !seasonForm.endDate) {
      if (existingSeasonLabel) return;
      throw new Error("Indica inizio e fine della stagione");
    }
    if (new Date(seasonForm.startDate) >= new Date(seasonForm.endDate)) {
      throw new Error("La data di fine deve essere successiva a quella di inizio");
    }

    /*
      La stagione la crea il suo dominio, non questa pagina.
      `POST /api/v1/seasons` passa da `createClubSeason`, che riapplica
      l'invariante «una sola stagione attiva» prima di salvare e non porta con
      se la stagione sintetizzata in lettura. Scrivere `settings.seasons` da
      qui — come si faceva — lasciava sul club appena creato **due** stagioni
      con la stessa etichetta, entrambe `active` (CLAUDE.md §2).
    */
    const { season } = await createSeason({
      label: buildSeasonLabelFromDates(seasonForm.startDate, seasonForm.endDate),
      startDate: seasonForm.startDate,
      endDate: seasonForm.endDate,
      activate: true,
    });

    setExistingSeasonLabel(season.label);
    /*
      Lo scaffale locale del club attivo era stato scritto alla creazione, con
      la stagione a `null`: senza questa riga la barra in cima all'app continua
      a dire «Nessuna stagione attiva» su un club che la stagione ce l'ha, e lo
      dice finche non si rientra dal pannello account.
    */
    rememberActiveSeason(season.id, season.label);
  };

  const saveCategoriesStep = async () => {
    if (!clubId) return;
    const drafts = categoryDrafts.filter((draft) => draft.name.trim());
    if (!drafts.length) return;

    for (const draft of drafts) {
      const from = Number(draft.birthYearFrom) || null;
      const to = Number(draft.birthYearTo) || from;

      const { error } = await supabase.from("categories").upsert({
        id: slugifyCategoryId(draft.name),
        club_id: clubId,
        name: draft.name.trim(),
        description: "Categoria creata durante la configurazione iniziale",
        sport: clubDraft.sports[0] || "",
        ageRange: from ? (to && to !== from ? `${from}-${to}` : String(from)) : "",
        birthYearFrom: from,
        birthYearTo: to,
        color: "bg-blue-500 text-white",
      });

      if (error) {
        throw new Error(
          `Creazione della categoria "${draft.name.trim()}" non riuscita`,
        );
      }
    }
  };

  const saveAthletesStep = async () => {
    if (!clubId) return;
    const drafts = athleteDrafts.filter(
      (draft) => draft.firstName.trim() && draft.lastName.trim(),
    );
    if (!drafts.length) return;

    for (const draft of drafts) {
      await addClubAthlete(clubId, {
        firstName: draft.firstName.trim(),
        lastName: draft.lastName.trim(),
        birthDate: draft.birthDate || "",
        status: "active",
      });
    }
  };

  // --- rendering -------------------------------------------------------------

  if (loading) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-[var(--eg-paper)]">
        <p
          className="flex items-center gap-3 text-slate-600"
          role="status"
          aria-live="polite"
        >
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
          Preparo la configurazione iniziale
        </p>
      </div>
    );
  }

  if (loadError || !state) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-[var(--eg-paper)] p-6">
        <div className="max-w-md rounded-2xl border border-slate-200 bg-white p-6 text-center">
          <h1 className="font-display text-xl font-semibold text-slate-900">
            Configurazione non disponibile
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            {loadError || "Stato dell'onboarding non leggibile."}
          </p>
          <Button className="mt-5" onClick={() => router.push("/account")}>
            Torna ai tuoi club
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-[var(--eg-paper)]">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-3 px-4 py-3 md:px-6">
          <EasyGameLogo className="h-8 w-8 shrink-0" />
          <span className="font-display text-sm font-semibold text-slate-900">
            Configurazione iniziale
          </span>
          <span className="eg-tabular ml-auto text-xs text-slate-500">
            {progress.completed} di {progress.total} passi
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="text-slate-500"
            disabled={saving}
            onClick={() => {
              void skipOnboarding();
            }}
          >
            Salta per ora
          </Button>
        </div>
        <div className="h-1 w-full bg-slate-100">
          <div
            className="h-full bg-blue-600 transition-[width] duration-300"
            style={{ width: `${progress.percent}%` }}
          />
        </div>
      </header>

      {/*
        `minmax(0,1fr)` e `min-w-0` sulla colonna dei passi.

        L'elenco dei passi scorre gia nel proprio contenitore, ma la colonna
        che lo contiene aveva larghezza minima pari al **contenuto**: a 375 px
        la pagina diventava larga 722 e scorreva tutta di lato, intestazione
        compresa. Il primo schermo che una societa vede era il piu rotto.
      */}
      <main className="mx-auto grid w-full max-w-5xl grid-cols-[minmax(0,1fr)] gap-6 px-4 py-6 md:px-6 lg:grid-cols-[240px,minmax(0,1fr)]">
        <nav
          aria-label="Passi della configurazione"
          className="min-w-0 lg:pt-1"
        >
          <ol className="flex gap-2 overflow-x-auto lg:flex-col lg:gap-1 lg:overflow-visible">
            {ONBOARDING_STEPS.map((step, index) => {
              const done = state.completedSteps.includes(step.id);
              const current = step.id === activeStep;
              return (
                <li key={step.id} className="shrink-0 lg:shrink">
                  <button
                    type="button"
                    onClick={() => goToStep(step.id)}
                    aria-current={current ? "step" : undefined}
                    className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                      current
                        ? "bg-white font-medium text-slate-900 shadow-sm ring-1 ring-slate-200"
                        : "text-slate-600 hover:bg-white/70"
                    }`}
                  >
                    <span
                      className={`eg-tabular grid h-5 w-5 shrink-0 place-items-center rounded-full text-[11px] ${
                        done
                          ? "bg-emerald-600 text-white"
                          : "bg-slate-200 text-slate-600"
                      }`}
                    >
                      {done ? <Check className="h-3 w-3" aria-hidden /> : index + 1}
                    </span>
                    <span className="truncate">{step.title}</span>
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>

        <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5 md:p-6">
          <h1 className="font-display text-xl font-semibold tracking-tight text-slate-900 md:text-2xl">
            {ONBOARDING_STEPS[Math.max(stepIndex, 0)].title}
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            {ONBOARDING_STEPS[Math.max(stepIndex, 0)].description}
          </p>

          <div className="mt-6 space-y-5">
            {activeStep === "club" ? (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="onboarding-club-name">Nome del club</Label>
                    <Input
                      id="onboarding-club-name"
                      value={clubDraft.name}
                      onChange={(event) =>
                        setClubDraft((current) => ({
                          ...current,
                          name: event.target.value,
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="onboarding-club-sport">Sport principale</Label>
                    <Input
                      id="onboarding-club-sport"
                      value={clubDraft.sports[0] || ""}
                      onChange={(event) =>
                        setClubDraft((current) => ({
                          ...current,
                          sports: event.target.value
                            ? [event.target.value, ...current.sports.slice(1)]
                            : current.sports.slice(1),
                        }))
                      }
                      placeholder="Calcio, Pallavolo, Basket..."
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="onboarding-club-email">Email del club</Label>
                    <Input
                      id="onboarding-club-email"
                      type="email"
                      value={clubDraft.companyEmail}
                      onChange={(event) =>
                        setClubDraft((current) => ({
                          ...current,
                          companyEmail: event.target.value,
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="onboarding-club-phone">Telefono</Label>
                    <Input
                      id="onboarding-club-phone"
                      value={clubDraft.contact1Phone}
                      onChange={(event) =>
                        setClubDraft((current) => ({
                          ...current,
                          contact1Phone: event.target.value,
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="onboarding-club-address">Indirizzo</Label>
                    <Input
                      id="onboarding-club-address"
                      value={clubDraft.address}
                      onChange={(event) =>
                        setClubDraft((current) => ({
                          ...current,
                          address: event.target.value,
                        }))
                      }
                    />
                  </div>
                </div>

                <AssistedAddressFields
                  idPrefix="onboarding-club"
                  values={{
                    postalCode: clubDraft.postalCode,
                    city: clubDraft.city,
                    province: clubDraft.province,
                    region: clubDraft.region,
                    country: clubDraft.country,
                  }}
                  onChange={(patch) =>
                    setClubDraft((current) => ({ ...current, ...patch }))
                  }
                />
              </>
            ) : null}

            {activeStep === "season" ? (
              <>
                {existingSeasonLabel ? (
                  <p className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
                    <CircleCheck className="h-4 w-4" aria-hidden />
                    Stagione attiva: {existingSeasonLabel}. Puoi passare avanti.
                  </p>
                ) : null}

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="onboarding-season-start">Inizio stagione</Label>
                    <Input
                      id="onboarding-season-start"
                      type="date"
                      value={seasonForm.startDate}
                      onChange={(event) =>
                        setSeasonForm((current) => ({
                          ...current,
                          startDate: event.target.value,
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="onboarding-season-end">Fine stagione</Label>
                    <Input
                      id="onboarding-season-end"
                      type="date"
                      value={seasonForm.endDate}
                      onChange={(event) =>
                        setSeasonForm((current) => ({
                          ...current,
                          endDate: event.target.value,
                        }))
                      }
                    />
                  </div>
                </div>

                {seasonForm.startDate && seasonForm.endDate ? (
                  <p className="flex items-center gap-2 text-sm text-slate-600">
                    <CalendarRange className="h-4 w-4" aria-hidden />
                    Verra creata la stagione{" "}
                    <span className="eg-tabular font-medium">
                      {buildSeasonLabelFromDates(
                        seasonForm.startDate,
                        seasonForm.endDate,
                      )}
                    </span>
                  </p>
                ) : null}
              </>
            ) : null}

            {activeStep === "categories" ? (
              <div className="space-y-3">
                {categoryDrafts.map((draft, index) => (
                  <div
                    key={`category-draft-${index}`}
                    className="grid gap-3 rounded-xl border border-slate-200 p-3 sm:grid-cols-[1fr,110px,110px,auto]"
                  >
                    <div className="space-y-1.5">
                      <Label htmlFor={`onboarding-category-name-${index}`}>
                        Nome
                      </Label>
                      <Input
                        id={`onboarding-category-name-${index}`}
                        value={draft.name}
                        placeholder="Under 14"
                        onChange={(event) =>
                          setCategoryDrafts((current) =>
                            current.map((item, position) =>
                              position === index
                                ? { ...item, name: event.target.value }
                                : item,
                            ),
                          )
                        }
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor={`onboarding-category-from-${index}`}>
                        Anno da
                      </Label>
                      <Input
                        id={`onboarding-category-from-${index}`}
                        className="eg-tabular"
                        inputMode="numeric"
                        value={draft.birthYearFrom}
                        onChange={(event) =>
                          setCategoryDrafts((current) =>
                            current.map((item, position) =>
                              position === index
                                ? { ...item, birthYearFrom: event.target.value }
                                : item,
                            ),
                          )
                        }
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor={`onboarding-category-to-${index}`}>
                        Anno a
                      </Label>
                      <Input
                        id={`onboarding-category-to-${index}`}
                        className="eg-tabular"
                        inputMode="numeric"
                        value={draft.birthYearTo}
                        onChange={(event) =>
                          setCategoryDrafts((current) =>
                            current.map((item, position) =>
                              position === index
                                ? { ...item, birthYearTo: event.target.value }
                                : item,
                            ),
                          )
                        }
                      />
                    </div>
                    <div className="flex items-end">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label="Rimuovi categoria"
                        onClick={() =>
                          setCategoryDrafts((current) =>
                            current.length === 1
                              ? [emptyCategoryDraft()]
                              : current.filter((_, position) => position !== index),
                          )
                        }
                      >
                        <Trash2 className="h-4 w-4" aria-hidden />
                      </Button>
                    </div>
                  </div>
                ))}

                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    setCategoryDrafts((current) => [...current, emptyCategoryDraft()])
                  }
                >
                  <Plus className="mr-2 h-4 w-4" aria-hidden />
                  Aggiungi categoria
                </Button>

                <p className="text-sm text-slate-500">
                  Puoi lasciare vuoto e crearle piu tardi dalla sezione Categorie.
                </p>
              </div>
            ) : null}

            {activeStep === "athletes" ? (
              <div className="space-y-3">
                {athleteDrafts.map((draft, index) => (
                  <div
                    key={`athlete-draft-${index}`}
                    className="grid gap-3 rounded-xl border border-slate-200 p-3 sm:grid-cols-[1fr,1fr,150px,auto]"
                  >
                    {/*
                      Nome, poi Cognome, poi Data di nascita: e l'ordine che
                      ADR-0066 ha reso un componente per le nove anagrafiche di
                      persona. Questa griglia non puo montare
                      `PersonIdentityFields` — chiede tre dati su sei, in riga —
                      ma non ha ragione di chiederli in un ordine diverso da
                      tutto il resto del prodotto. E la maiuscola la mette lo
                      stesso campo che la mette altrove, invece di comparire
                      solo dopo il salvataggio.
                    */}
                    <div className="space-y-1.5">
                      <Label htmlFor={`onboarding-athlete-first-${index}`}>
                        Nome
                      </Label>
                      <CapitalizedInput
                        id={`onboarding-athlete-first-${index}`}
                        value={draft.firstName}
                        onChange={(event) =>
                          setAthleteDrafts((current) =>
                            current.map((item, position) =>
                              position === index
                                ? { ...item, firstName: event.target.value }
                                : item,
                            ),
                          )
                        }
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor={`onboarding-athlete-last-${index}`}>
                        Cognome
                      </Label>
                      <CapitalizedInput
                        id={`onboarding-athlete-last-${index}`}
                        value={draft.lastName}
                        onChange={(event) =>
                          setAthleteDrafts((current) =>
                            current.map((item, position) =>
                              position === index
                                ? { ...item, lastName: event.target.value }
                                : item,
                            ),
                          )
                        }
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor={`onboarding-athlete-birth-${index}`}>
                        Nascita
                      </Label>
                      <Input
                        id={`onboarding-athlete-birth-${index}`}
                        type="date"
                        value={draft.birthDate}
                        onChange={(event) =>
                          setAthleteDrafts((current) =>
                            current.map((item, position) =>
                              position === index
                                ? { ...item, birthDate: event.target.value }
                                : item,
                            ),
                          )
                        }
                      />
                    </div>
                    <div className="flex items-end">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label="Rimuovi atleta"
                        onClick={() =>
                          setAthleteDrafts((current) =>
                            current.length === 1
                              ? [emptyAthleteDraft()]
                              : current.filter((_, position) => position !== index),
                          )
                        }
                      >
                        <Trash2 className="h-4 w-4" aria-hidden />
                      </Button>
                    </div>
                  </div>
                ))}

                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() =>
                      setAthleteDrafts((current) => [...current, emptyAthleteDraft()])
                    }
                  >
                    <Plus className="mr-2 h-4 w-4" aria-hidden />
                    Aggiungi riga
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => router.push("/athletes")}
                  >
                    <Users className="mr-2 h-4 w-4" aria-hidden />
                    Importa da file
                  </Button>
                </div>
              </div>
            ) : null}

            {activeStep === "tour" ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {AREA_TOUR.map((area) => (
                  <div
                    key={area.title}
                    className="rounded-xl border border-slate-200 p-4"
                  >
                    <p className="flex items-center gap-2 font-medium text-slate-900">
                      <Building2 className="h-4 w-4 text-slate-400" aria-hidden />
                      {area.title}
                    </p>
                    <p className="mt-1 text-sm text-slate-600">
                      {area.description}
                    </p>
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          <div className="mt-7 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-5">
            <Button
              type="button"
              variant="ghost"
              disabled={stepIndex <= 0 || saving}
              onClick={() => goToStep(ONBOARDING_STEPS[stepIndex - 1].id)}
            >
              <ArrowLeft className="mr-2 h-4 w-4" aria-hidden />
              Indietro
            </Button>

            <Button
              type="button"
              variant="outline"
              className="ml-auto"
              disabled={saving}
              onClick={advance}
            >
              Salta questo passo
            </Button>

            <Button
              type="button"
              disabled={saving}
              onClick={() => {
                if (activeStep === "club") {
                  void completeStep("club", saveClubStep);
                  return;
                }
                if (activeStep === "season") {
                  void completeStep("season", saveSeasonStep);
                  return;
                }
                if (activeStep === "categories") {
                  void completeStep("categories", saveCategoriesStep);
                  return;
                }
                if (activeStep === "athletes") {
                  void completeStep("athletes", saveAthletesStep);
                  return;
                }
                void completeStep("tour");
              }}
            >
              {saving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
              ) : null}
              {activeStep === "tour" ? "Concludi" : "Salva e continua"}
              {activeStep === "tour" ? null : (
                <ArrowRight className="ml-2 h-4 w-4" aria-hidden />
              )}
            </Button>
          </div>
        </section>
      </main>
    </div>
  );
}
