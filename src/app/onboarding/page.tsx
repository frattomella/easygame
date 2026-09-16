"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button, IconButton } from "@/components/web/primitives/Button";
import { ProgressBar } from "@/components/web/primitives/Controls";
import { Hairline, InsetBlock, Panel } from "@/components/web/primitives/Surface";
import { DateInput, Field, FieldSizeProvider, TextInput } from "@/components/web/forms/Field";
import { AlertBlock } from "@/components/web/page/Alerts";
import { OutsideShell, OutsideStatus } from "@/components/web/shell/OutsideShell";
import { CapitalizedInput } from "@/components/forms/capitalized-input";
import { useToast } from "@/components/ui/toast-notification";
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
        /*
          **Una stagione sintetizzata non e una stagione del club.**

          `normalizeClubSeasons` ne restituisce sempre una, anche quando il
          club non ne ha salvata nessuna, perche l'interfaccia non puo restare
          senza perimetro dei dati. Presa per buona qui, il passo Stagione
          annunciava «Stagione attiva: 2026/2027. Puoi passare avanti.» su un
          club appena creato che non ne aveva **nessuna** — e chi accettava
          l'invito usciva dall'avvio guidato senza stagione: `saveSeasonStep`
          non ha date da scrivere e non scrive niente, l'intestazione continua
          a dire «Nessuna stagione attiva», e le categorie create subito dopo
          nascono senza annata. E il difetto 1 del Full Club UAT che rientra
          dalla porta di servizio, sul percorso piu probabile: quello di chi
          non tocca i campi.

          `isFallback` e la distinzione che quella correzione ha introdotto
          proprio per questo. Le date della stagione sintetizzata restano
          utili: sono l'annata sportiva corrente, cioe la proposta giusta da
          mettere nei due campi. Cosi «Avanti» crea la stagione invece di
          saltarla.
        */
        setExistingSeasonLabel(
          seasons.isFallback ? null : seasons.activeSeason?.label || null,
        );
        if (seasons.isFallback && seasons.activeSeason) {
          setSeasonForm({
            startDate: seasons.activeSeason.startDate,
            endDate: seasons.activeSeason.endDate,
          });
        }
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
    rememberActiveSeason(season.id, season.label, clubId);
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
        /*
          Nessuna descrizione. Il campo e un **badge** da 25 caratteri —
          «Under 12», «Misto» — e l'onboarding ci scriveva dentro una frase da
          51: aprendo la scheda della categoria il contatore diceva «51/25» su
          un testo che l'applicazione aveva scritto da sola, e il badge sulla
          card portava una riga intera. Che la categoria sia nata durante la
          configurazione iniziale non e un'informazione che serva a chi la
          guarda: il nome basta.
        */
        description: "",
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

  /*
    Pattern 9 «Onboarding» (guideline 09 §9.1): ambiente 3 — il cielo pieno
    fuori dal club — la colonna dei passi e un pannello bianco per il passo
    corrente. Ogni testo che poggia sul cielo e bianco; l'inchiostro scuro
    sta solo dentro il pannello.
  */
  if (loading) {
    return (
      <OutsideShell width="stepper">
        <OutsideStatus icon={<Building2 />} title="Configurazione iniziale" description="Preparo la configurazione iniziale del club." busy busyLabel="Un momento…" />
      </OutsideShell>
    );
  }

  if (loadError || !state) {
    return (
      <OutsideShell width="stepper">
        <OutsideStatus
          icon={<Building2 />}
          tone="amber"
          title="Configurazione non disponibile"
          description={loadError || "Stato dell'onboarding non leggibile."}
          primary={
            <Button variant="primary" onClick={() => router.push("/account")}>
              Torna ai tuoi club
            </Button>
          }
        />
      </OutsideShell>
    );
  }

  const stepCorrente = ONBOARDING_STEPS[Math.max(stepIndex, 0)];

  const rigaCategoria = (draft: CategoryDraft, index: number) => (
    <InsetBlock key={`category-draft-${index}`} className="grid gap-3 sm:grid-cols-[1fr,110px,110px,auto]">
      <Field label="Nome" htmlFor={`onboarding-category-name-${index}`}>
        <TextInput
          id={`onboarding-category-name-${index}`}
          value={draft.name}
          placeholder="Under 14"
          onChange={(event) =>
            setCategoryDrafts((current) =>
              current.map((item, position) =>
                position === index ? { ...item, name: event.target.value } : item,
              ),
            )
          }
        />
      </Field>
      <Field label="Anno da" htmlFor={`onboarding-category-from-${index}`}>
        <TextInput
          id={`onboarding-category-from-${index}`}
          numeric
          inputMode="numeric"
          value={draft.birthYearFrom}
          onChange={(event) =>
            setCategoryDrafts((current) =>
              current.map((item, position) =>
                position === index ? { ...item, birthYearFrom: event.target.value } : item,
              ),
            )
          }
        />
      </Field>
      <Field label="Anno a" htmlFor={`onboarding-category-to-${index}`}>
        <TextInput
          id={`onboarding-category-to-${index}`}
          numeric
          inputMode="numeric"
          value={draft.birthYearTo}
          onChange={(event) =>
            setCategoryDrafts((current) =>
              current.map((item, position) =>
                position === index ? { ...item, birthYearTo: event.target.value } : item,
              ),
            )
          }
        />
      </Field>
      <div className="flex items-end">
        <IconButton
          aria-label="Rimuovi categoria"
          variant="row"
          onClick={() =>
            setCategoryDrafts((current) =>
              current.length === 1 ? [emptyCategoryDraft()] : current.filter((_, position) => position !== index),
            )
          }
        >
          <Trash2 />
        </IconButton>
      </div>
    </InsetBlock>
  );

  const rigaAtleta = (draft: AthleteDraft, index: number) => (
    /*
      Nome, poi Cognome, poi Data di nascita: e l'ordine che ADR-0066 ha reso
      un componente per le nove anagrafiche di persona. Questa griglia non puo
      montare `PersonIdentityFields` — chiede tre dati su sei, in riga — ma non
      ha ragione di chiederli in un ordine diverso da tutto il resto del
      prodotto. E la maiuscola la mette lo stesso campo che la mette altrove.
    */
    <InsetBlock key={`athlete-draft-${index}`} className="grid gap-3 sm:grid-cols-[1fr,1fr,150px,auto]">
      <Field label="Nome" htmlFor={`onboarding-athlete-first-${index}`}>
        <CapitalizedInput
          id={`onboarding-athlete-first-${index}`}
          value={draft.firstName}
          onChange={(event) =>
            setAthleteDrafts((current) =>
              current.map((item, position) =>
                position === index ? { ...item, firstName: event.target.value } : item,
              ),
            )
          }
        />
      </Field>
      <Field label="Cognome" htmlFor={`onboarding-athlete-last-${index}`}>
        <CapitalizedInput
          id={`onboarding-athlete-last-${index}`}
          value={draft.lastName}
          onChange={(event) =>
            setAthleteDrafts((current) =>
              current.map((item, position) =>
                position === index ? { ...item, lastName: event.target.value } : item,
              ),
            )
          }
        />
      </Field>
      <Field label="Nascita" htmlFor={`onboarding-athlete-birth-${index}`}>
        <DateInput
          id={`onboarding-athlete-birth-${index}`}
          value={draft.birthDate}
          onChange={(event) =>
            setAthleteDrafts((current) =>
              current.map((item, position) =>
                position === index ? { ...item, birthDate: event.target.value } : item,
              ),
            )
          }
        />
      </Field>
      <div className="flex items-end">
        <IconButton
          aria-label="Rimuovi atleta"
          variant="row"
          onClick={() =>
            setAthleteDrafts((current) =>
              current.length === 1 ? [emptyAthleteDraft()] : current.filter((_, position) => position !== index),
            )
          }
        >
          <Trash2 />
        </IconButton>
      </div>
    </InsetBlock>
  );

  return (
    <OutsideShell
      width="full"
      bare
      above={
        <div className="flex flex-wrap items-center justify-between gap-3 text-left">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[var(--egw-track-eyebrow)] text-white/70">Configurazione iniziale</p>
            <p className="egw-num mt-1 text-[13px] font-semibold text-white/90">
              {progress.completed} di {progress.total} passi
            </p>
          </div>
          <Button
            variant="ghost-on-sky"
            size="sm"
            disabled={saving}
            onClick={() => {
              void skipOnboarding();
            }}
          >
            Salta per ora
          </Button>
          <div className="basis-full">
            <ProgressBar value={progress.percent} label="Avanzamento della configurazione" className="[&>div]:bg-white/20" />
          </div>
        </div>
      }
    >
      <FieldSizeProvider size="sm">
        {/*
          `minmax(0,1fr)` e `min-w-0` sulla colonna dei passi.

          L'elenco dei passi scorre gia nel proprio contenitore, ma la colonna
          che lo contiene aveva larghezza minima pari al **contenuto**: a 375 px
          la pagina diventava larga 722 e scorreva tutta di lato, intestazione
          compresa. Il primo schermo che una societa vede era il piu rotto.
        */}
        <main className="grid w-full grid-cols-[minmax(0,1fr)] gap-[18px] lg:grid-cols-[240px,minmax(0,1fr)]">
          <nav aria-label="Passi della configurazione" className="min-w-0 lg:pt-1">
            <ol className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:gap-1 lg:overflow-visible">
              {ONBOARDING_STEPS.map((step, index) => {
                const done = state.completedSteps.includes(step.id);
                const current = step.id === activeStep;
                return (
                  <li key={step.id} className="shrink-0 lg:shrink">
                    <button
                      type="button"
                      onClick={() => goToStep(step.id)}
                      aria-current={current ? "step" : undefined}
                      className={cn(
                        "flex w-full items-center gap-2.5 rounded-egw-control px-3 text-left text-[13px] transition-colors duration-hover focus-visible:outline-none focus-visible:shadow-egw-focus-dark",
                        current ? "h-10 bg-white font-bold text-egw-navy-800 shadow-[0_10px_22px_-12px_rgba(7,18,43,.5)]" : "h-[38px] font-medium text-white hover:bg-white/10",
                      )}
                    >
                      <span
                        className={cn(
                          "egw-num grid h-5 w-5 shrink-0 place-items-center rounded-egw-micro text-[11px] font-bold",
                          done ? "bg-egw-green text-white" : current ? "bg-egw-tint-blue text-egw-blue-800" : "bg-white/16 text-white",
                        )}
                      >
                        {done ? <Check className="h-3 w-3" aria-hidden /> : index + 1}
                      </span>
                      <span className="egw-ellipsis">{step.title}</span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </nav>

          <Panel as="section" className="min-w-0">
            <h1 className="text-[22px] font-extrabold leading-[1.15] tracking-[var(--egw-track-display)] text-egw-ink">{stepCorrente.title}</h1>
            <p className="mt-1.5 text-[13px] leading-[1.5] text-egw-ink-62">{stepCorrente.description}</p>

            <div className="mt-6 flex flex-col gap-5">
              {activeStep === "club" ? (
                <>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Nome del club" htmlFor="onboarding-club-name" className="sm:col-span-2">
                      <TextInput
                        id="onboarding-club-name"
                        value={clubDraft.name}
                        onChange={(event) =>
                          setClubDraft((current) => ({
                            ...current,
                            name: event.target.value,
                          }))
                        }
                      />
                    </Field>
                    <Field label="Sport principale" htmlFor="onboarding-club-sport">
                      <TextInput
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
                        placeholder="Calcio, Pallavolo, Basket…"
                      />
                    </Field>
                    <Field label="Email del club" htmlFor="onboarding-club-email">
                      <TextInput
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
                    </Field>
                    <Field label="Telefono" htmlFor="onboarding-club-phone">
                      <TextInput
                        id="onboarding-club-phone"
                        type="tel"
                        value={clubDraft.contact1Phone}
                        onChange={(event) =>
                          setClubDraft((current) => ({
                            ...current,
                            contact1Phone: event.target.value,
                          }))
                        }
                      />
                    </Field>
                    <Field label="Indirizzo" htmlFor="onboarding-club-address" className="sm:col-span-2">
                      <TextInput
                        id="onboarding-club-address"
                        value={clubDraft.address}
                        onChange={(event) =>
                          setClubDraft((current) => ({
                            ...current,
                            address: event.target.value,
                          }))
                        }
                      />
                    </Field>
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
                    <AlertBlock severity="success" title={`Stagione attiva: ${existingSeasonLabel}. Puoi passare avanti.`} />
                  ) : null}

                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Inizio stagione" htmlFor="onboarding-season-start">
                      <DateInput
                        id="onboarding-season-start"
                        value={seasonForm.startDate}
                        onChange={(event) =>
                          setSeasonForm((current) => ({
                            ...current,
                            startDate: event.target.value,
                          }))
                        }
                      />
                    </Field>
                    <Field label="Fine stagione" htmlFor="onboarding-season-end">
                      <DateInput
                        id="onboarding-season-end"
                        value={seasonForm.endDate}
                        onChange={(event) =>
                          setSeasonForm((current) => ({
                            ...current,
                            endDate: event.target.value,
                          }))
                        }
                      />
                    </Field>
                  </div>

                  {seasonForm.startDate && seasonForm.endDate ? (
                    <p className="flex items-center gap-2 text-[13px] text-egw-ink-62">
                      <CalendarRange className="h-4 w-4" aria-hidden />
                      Verra creata la stagione{" "}
                      <span className="egw-num font-semibold text-egw-ink">
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
                <div className="flex flex-col gap-3">
                  {categoryDrafts.map(rigaCategoria)}

                  <div>
                    <Button
                      type="button"
                      variant="secondary"
                      icon={<Plus />}
                      onClick={() =>
                        setCategoryDrafts((current) => [...current, emptyCategoryDraft()])
                      }
                    >
                      Aggiungi categoria
                    </Button>
                  </div>

                  <p className="text-[12.5px] text-egw-ink-62">
                    Puoi lasciare vuoto e crearle piu tardi dalla sezione Categorie.
                  </p>
                </div>
              ) : null}

              {activeStep === "athletes" ? (
                <div className="flex flex-col gap-3">
                  {athleteDrafts.map(rigaAtleta)}

                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      icon={<Plus />}
                      onClick={() =>
                        setAthleteDrafts((current) => [...current, emptyAthleteDraft()])
                      }
                    >
                      Aggiungi riga
                    </Button>
                    <Button
                      type="button"
                      variant="text"
                      icon={<Users />}
                      onClick={() => router.push("/athletes")}
                    >
                      Importa da file
                    </Button>
                  </div>
                </div>
              ) : null}

              {activeStep === "tour" ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  {AREA_TOUR.map((area) => (
                    <InsetBlock key={area.title}>
                      <p className="flex items-center gap-2 text-[13px] font-semibold text-egw-ink">
                        <Building2 className="h-4 w-4 text-egw-ink-42" aria-hidden />
                        {area.title}
                      </p>
                      <p className="mt-1 text-[12.5px] leading-[1.5] text-egw-ink-62">
                        {area.description}
                      </p>
                    </InsetBlock>
                  ))}
                </div>
              ) : null}
            </div>

            <Hairline className="mt-7" />
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <Button
                type="button"
                variant="text"
                icon={<ArrowLeft />}
                disabled={stepIndex <= 0 || saving}
                onClick={() => goToStep(ONBOARDING_STEPS[stepIndex - 1].id)}
              >
                Indietro
              </Button>

              <Button
                type="button"
                variant="secondary"
                className="ml-auto"
                disabled={saving}
                onClick={advance}
              >
                Salta questo passo
              </Button>

              <Button
                type="button"
                variant="primary"
                loading={saving}
                trailingIcon={activeStep === "tour" ? undefined : <ArrowRight />}
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
                {activeStep === "tour" ? "Concludi" : "Salva e continua"}
              </Button>
            </div>
          </Panel>
        </main>
      </FieldSizeProvider>
    </OutsideShell>
  );
}
