"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/toast-notification";
import { useAuth } from "@/components/providers/AuthProvider";
import { apiRequest } from "@/lib/api/client";
import {
  clearUpcomingGeneratedTrainings,
  getClubSettings,
  saveClubSettings,
} from "@/lib/simplified-db";
import {
  DEFAULT_TRAINING_AUTOMATION_SETTINGS,
  TRAINING_AUTOMATION_DAY_LABELS,
  getNextTrainingAutomationRun,
  parseTrainingAutomationSettings,
  type TrainingAutomationFrequency,
  type TrainingAutomationSettings,
} from "@/lib/training-automation-utils";
import {
  CalendarClock,
  CalendarRange,
  RefreshCw,
  RotateCcw,
  Save,
  Sparkles,
  Trash2,
} from "lucide-react";

/** Preset del rolling automatico (WP-02): 7 / 14 / 21 (default) / 30 / 60 giorni. */
const GENERATE_DAYS_AHEAD_PRESETS = [7, 14, 21, 30, 60] as const;

/**
 * La stessa forma di `BatchConflict` (`src/lib/server/events.ts`), ripetuta
 * qui invece di importata: un componente client non importa `src/lib/server/**`
 * (CLAUDE.md §8), nemmeno un tipo che si cancella alla compilazione.
 */
type GenerateUntilConflict = {
  data: string | null;
  categoryId: string | null;
  categoryName: string | null;
  structureId: string | null;
  fieldId: string | null;
  siteId: string | null;
  legacyId: string | null;
  conflictsWith: Array<{ id: string; title: string | null }>;
};

/**
 * La stessa forma di `BatchExclusion` (`src/lib/server/events.ts`), ripetuta
 * per lo stesso motivo di `GenerateUntilConflict` qui sopra: una fascia
 * saltata perche il campo era chiuso in quel giorno e a quell'ora, con
 * abbastanza dettaglio da mostrare "quale" senza rileggere niente.
 */
type GenerateUntilExclusion = {
  data: string | null;
  categoryId: string | null;
  categoryName: string | null;
  structureId: string | null;
  fieldId: string | null;
  siteId: string | null;
  startsAt: string;
  endsAt: string | null;
  legacyId: string | null;
  reasonCode: "OUTSIDE_OPENING_HOURS";
  reason: string;
};

/**
 * La diagnostica del programma (ADR-0197): quante voci, quante generabili e
 * — per quelle che non lo sono — quante e perche. E cio che sostituisce il
 * generico «non contiene sessioni valide».
 */
type WeeklyProgramDiagnostics = {
  seasonId: string | null;
  seasonLabel: string | null;
  totalRules: number;
  validRules: number;
  invalidRules: number;
  rulesWithoutOccurrence: number;
  outsideSeasonCount: number;
  reasons: Array<{ code: string; count: number; label: string; examples: string[] }>;
};

type GenerateUntilResponse = {
  ran: boolean;
  due: boolean;
  generatedCount: number;
  existingCount: number;
  excludedCount: number;
  excludedSlots: GenerateUntilExclusion[];
  conflicts: GenerateUntilConflict[];
  preview: boolean;
  generatedUntil: string | null;
  reason?: string;
  diagnostics?: WeeklyProgramDiagnostics;
};

/**
 * «40 sessioni trovate: 32 valide, 8 non generabili perche…». Una frase
 * per la diagnostica, con i motivi in coda: mai un numero senza il perche.
 */
const describeDiagnostics = (diagnostics: WeeklyProgramDiagnostics | undefined) => {
  if (!diagnostics || !diagnostics.totalRules) {
    return "Il programma settimanale non contiene nessuna sessione: aggiungine una prima di generare";
  }
  const motivi = diagnostics.reasons
    .filter((reason) => reason.code !== "no_occurrence")
    .map((reason) => `${reason.count} ${reason.label}`);
  const senzaOccorrenza = diagnostics.rulesWithoutOccurrence
    ? `${diagnostics.rulesWithoutOccurrence} valid${diagnostics.rulesWithoutOccurrence === 1 ? "a" : "e"} ma senza occorrenze nel periodo richiesto`
    : "";
  return [
    `${diagnostics.totalRules} session${diagnostics.totalRules === 1 ? "e" : "i"} trovat${diagnostics.totalRules === 1 ? "a" : "e"}${diagnostics.seasonLabel ? ` per la stagione ${diagnostics.seasonLabel}` : ""}: ${diagnostics.validRules} valid${diagnostics.validRules === 1 ? "a" : "e"}`,
    diagnostics.invalidRules
      ? `${diagnostics.invalidRules} non generabil${diagnostics.invalidRules === 1 ? "e" : "i"} perche ${motivi.join("; ")}`
      : "",
    senzaOccorrenza,
    diagnostics.outsideSeasonCount
      ? `${diagnostics.outsideSeasonCount} occorrenz${diagnostics.outsideSeasonCount === 1 ? "a" : "e"} fuori dal periodo della stagione`
      : "",
  ]
    .filter(Boolean)
    .join(", ") + ".";
};

/**
 * La diagnostica del programma, a schermo (ADR-0197 §45): conteggi e, per
 * ogni motivo, quante voci e qualche esempio. Compare anche a esito buono —
 * «40 valide» e un'informazione — e resta quando non si e generato niente.
 */
function DiagnosticaProgramma({ diagnostics }: { diagnostics: WeeklyProgramDiagnostics }) {
  const motivi = diagnostics.reasons;
  return (
    <div className="mt-2 text-sm text-egw-ink-72" data-testid="diagnostica-programma">
      <p>
        {diagnostics.totalRules} session{diagnostics.totalRules === 1 ? "e" : "i"} nel programma
        {diagnostics.seasonLabel ? ` della stagione ${diagnostics.seasonLabel}` : ""}:{" "}
        {diagnostics.validRules} valid{diagnostics.validRules === 1 ? "a" : "e"}
        {diagnostics.invalidRules ? `, ${diagnostics.invalidRules} non generabil${diagnostics.invalidRules === 1 ? "e" : "i"}` : ""}
        {diagnostics.outsideSeasonCount ? `, ${diagnostics.outsideSeasonCount} occorrenze fuori dal periodo della stagione` : ""}
        .
      </p>
      {motivi.length > 0 ? (
        <ul className="mt-1 list-disc space-y-0.5 pl-5">
          {motivi.map((reason) => (
            <li key={reason.code}>
              {reason.count} {reason.label}
              {reason.examples.length ? ` (es. ${reason.examples.join("; ")})` : ""}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

const formatItTime = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
};

const formatItWeekday = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleDateString("it-IT", { weekday: "long", day: "2-digit", month: "2-digit" });
};

const formatItDate = (value: string) => {
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString("it-IT");
};

const formatNextRun = (settings: TrainingAutomationSettings) =>
  getNextTrainingAutomationRun(settings).toLocaleString("it-IT", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

interface TrainingScheduleAutomationPanelProps {
  weeklySchedule?: any[];
  onGenerateTrainings?: () => void;
}

export function TrainingScheduleAutomationPanel({
  weeklySchedule = [],
  onGenerateTrainings = () => {},
}: TrainingScheduleAutomationPanelProps) {
  const { showToast } = useToast();
  const { activeClub } = useAuth();
  const [isGenerating, setIsGenerating] = React.useState(false);
  const [isResetting, setIsResetting] = React.useState(false);
  const [isSaving, setIsSaving] = React.useState(false);
  /**
   * L'esito dell'ultima "Genera ora" (WP-XX, issue UAT Fortitudo Scauri):
   * non solo un toast a una riga, lo stesso riepilogo con dettaglio che
   * "Genera fino a..." mostra gia in anteprima — creati, esistenti,
   * conflitti ed esclusi, questi ultimi con giorno/categoria/motivo.
   */
  const [lastGenerationResult, setLastGenerationResult] =
    React.useState<GenerateUntilResponse | null>(null);
  const [settings, setSettings] = React.useState<TrainingAutomationSettings>(
    DEFAULT_TRAINING_AUTOMATION_SETTINGS,
  );

  /* ---- "Genera fino a..." + anteprima (WP-03, WP-17) ------------------- */
  const [untilDate, setUntilDate] = React.useState("");
  const [isPreviewing, setIsPreviewing] = React.useState(false);
  const [isGeneratingUntil, setIsGeneratingUntil] = React.useState(false);
  const [preview, setPreview] = React.useState<GenerateUntilResponse | null>(
    null,
  );

  /* ---- Sospensioni/eccezioni (WP-15) ------------------------------------ */
  const [newExclusionFrom, setNewExclusionFrom] = React.useState("");
  const [newExclusionTo, setNewExclusionTo] = React.useState("");
  const [newExclusionReason, setNewExclusionReason] = React.useState("");

  const addExclusion = () => {
    if (!newExclusionFrom) {
      showToast("error", "Scegli almeno la data di inizio");
      return;
    }

    const from = newExclusionFrom;
    const to = newExclusionTo || newExclusionFrom;
    if (to < from) {
      showToast("error", "La data di fine non puo precedere l'inizio");
      return;
    }

    setSettings((current) => ({
      ...current,
      exclusions: [
        ...current.exclusions,
        {
          id: `excl-${from}-${to}-club-${Date.now()}`,
          from,
          to,
          reason: newExclusionReason.trim() || null,
          slotId: null,
        },
      ],
    }));
    setNewExclusionFrom("");
    setNewExclusionTo("");
    setNewExclusionReason("");
  };

  const removeExclusion = (id: string) => {
    setSettings((current) => ({
      ...current,
      exclusions: current.exclusions.filter((exclusion) => exclusion.id !== id),
    }));
  };

  const loadSettings = React.useCallback(async () => {
    if (!activeClub?.id) {
      return;
    }

    const clubSettings = await getClubSettings(activeClub.id);
    setSettings(
      parseTrainingAutomationSettings(clubSettings?.trainingAutomation),
    );
  }, [activeClub?.id]);

  React.useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const persistSettings = React.useCallback(
    async (nextSettings: TrainingAutomationSettings) => {
      if (!activeClub?.id) {
        return;
      }

      setIsSaving(true);
      try {
        await saveClubSettings(activeClub.id, {
          trainingAutomation: nextSettings,
        });
        setSettings(nextSettings);
      } finally {
        setIsSaving(false);
      }
    },
    [activeClub?.id],
  );

  const runGeneration = React.useCallback(async () => {
    if (!activeClub?.id) {
      showToast("error", "Nessun club attivo selezionato");
      return;
    }

    if (!Array.isArray(weeklySchedule) || weeklySchedule.length === 0) {
      showToast(
        "error",
        "Configura prima il programma settimanale per generare gli allenamenti",
      );
      return;
    }

    setIsGenerating(true);
    setLastGenerationResult(null);
    try {
      const response = await apiRequest<
        GenerateUntilResponse & {
          generatedTrainings: any[];
          lastRunAt: string | null;
        }
      >("/api/v1/training-automation", {
        method: "POST",
        body: {
          force: true,
          weeklySchedule,
          settings,
        },
      });

      if (response.error) {
        throw new Error(response.error.message || "Generazione fallita");
      }

      if (
        response.data?.reason === "missing_schedule" ||
        response.data?.reason === "no_valid_rules"
      ) {
        showToast("error", describeDiagnostics(response.data?.diagnostics));
        if (response.data) setLastGenerationResult(response.data);
        return;
      }

      const data = response.data;
      const nextLastRunAt = data?.lastRunAt || new Date().toISOString();

      setSettings((current) => ({
        ...current,
        lastRunAt: nextLastRunAt,
      }));
      onGenerateTrainings();

      /*
        **`generatedCount`, non la lunghezza di `generatedTrainings`.**

        `generatedTrainings` e l'elenco delle candidate costruite dal
        planner, prima che il batch scarti conflitti ed esclusioni: con
        `campoChiuso: "salta"` una candidata puo non diventare mai una riga.
        Il numero che conta per l'utente e quante righe sono state scritte
        davvero (`generatedCount`, cioe `createdCount` lato server).
      */
      const createdCount = data?.generatedCount ?? 0;
      const conflictsCount = data?.conflicts?.length || 0;
      const excludedCount = data?.excludedCount || 0;
      if (data) {
        /*
          **Il risultato resta a schermo, non solo nel toast** (issue UAT
          Fortitudo Scauri): un "1 escluso" letto e basta non dice quale
          fascia, ne perche. Il pannello sotto il pulsante lo mostra.
        */
        setLastGenerationResult(data);
      }

      if (conflictsCount > 0 || excludedCount > 0) {
        showToast(
          "success",
          `${createdCount} creati · ${conflictsCount} conflitt${conflictsCount === 1 ? "o" : "i"} · ${excludedCount} escl${excludedCount === 1 ? "uso" : "usi"}: dettaglio qui sotto`,
        );
      } else if (createdCount > 0) {
        showToast(
          "success",
          `${createdCount} allenamenti creati dal programma settimanale`,
        );
      } else {
        showToast(
          "success",
          "Nessun duplicato creato: il calendario era già allineato",
        );
      }
    } catch (error) {
      console.error("Error generating trainings:", error);
      showToast(
        "error",
        error instanceof Error && error.message
          ? error.message
          : "Errore nella generazione degli allenamenti",
      );
    } finally {
      setIsGenerating(false);
    }
  }, [activeClub?.id, onGenerateTrainings, settings, showToast, weeklySchedule]);

  /*
    **"Genera fino a..." usa lo stesso servizio di generazione** dell'
    automazione — la stessa rotta, lo stesso planner, lo stesso scrittore
    canonico — con una data assoluta al posto della finestra relativa
    (WP-03). L'anteprima e l'esecuzione passano dalla stessa funzione, con
    `preview` a cambiare se si scrive o no (WP-17): le stesse regole di
    dominio decidono in tutti e due i casi.
  */
  const runGenerateUntil = React.useCallback(
    async (mode: "preview" | "execute") => {
      if (!activeClub?.id) {
        showToast("error", "Nessun club attivo selezionato");
        return;
      }

      if (!untilDate) {
        showToast("error", "Scegli prima una data");
        return;
      }

      if (!Array.isArray(weeklySchedule) || weeklySchedule.length === 0) {
        showToast(
          "error",
          "Configura prima il programma settimanale per generare gli allenamenti",
        );
        return;
      }

      const setLoading =
        mode === "preview" ? setIsPreviewing : setIsGeneratingUntil;
      setLoading(true);
      try {
        const response = await apiRequest<GenerateUntilResponse>(
          "/api/v1/training-automation",
          {
            method: "POST",
            body: {
              force: true,
              weeklySchedule,
              settings,
              untilDate,
              preview: mode === "preview",
            },
          },
        );

        if (response.error) {
          throw new Error(response.error.message || "Generazione fallita");
        }

        const data = response.data;
        if (!data) {
          return;
        }

        if (data.reason === "missing_schedule" || data.reason === "no_valid_rules") {
          showToast("error", describeDiagnostics(data.diagnostics));
          if (mode === "preview") setPreview(data);
          else setLastGenerationResult(data);
          return;
        }

        if (mode === "preview") {
          setPreview(data);
          return;
        }

        setPreview(null);
        setSettings((current) => ({
          ...current,
          lastRunAt: new Date().toISOString(),
          generatedUntil: data.generatedUntil ?? current.generatedUntil,
        }));
        onGenerateTrainings();

        showToast(
          "success",
          `Generazione completata: ${data.generatedCount} creati, ${data.existingCount} già esistenti, ${data.conflicts.length} conflitti, ${data.excludedCount} esclusi`,
        );
      } catch (error) {
        console.error("Error generating trainings until date:", error);
        showToast(
          "error",
          error instanceof Error && error.message
            ? error.message
            : "Errore nella generazione degli allenamenti",
        );
      } finally {
        setLoading(false);
      }
    },
    [activeClub?.id, onGenerateTrainings, settings, showToast, untilDate, weeklySchedule],
  );

  const saveManualSettings = async () => {
    try {
      await persistSettings(settings);
      showToast("success", "Automazione programma settimanale salvata");
    } catch (error) {
      console.error("Error saving automation settings:", error);
      showToast("error", "Errore nel salvataggio dell'automazione");
    }
  };

  const clearUpcomingTrainings = React.useCallback(
    async (options?: { silent?: boolean }) => {
      if (!activeClub?.id) {
        showToast("error", "Nessun club attivo selezionato");
        return 0;
      }

      setIsResetting(true);
      try {
        const result = await clearUpcomingGeneratedTrainings(activeClub.id);
        onGenerateTrainings();

        if (!options?.silent) {
          showToast(
            "success",
            result.removedTrainings.length > 0
              ? `${result.removedTrainings.length} allenamenti programmati rimossi`
              : "Non c'erano allenamenti generati futuri da rimuovere",
          );
        }

        return result.removedTrainings.length;
      } catch (error) {
        console.error("Error clearing generated trainings:", error);
        showToast(
          "error",
          "Errore durante la rimozione degli allenamenti programmati",
        );
        return 0;
      } finally {
        setIsResetting(false);
      }
    },
    [activeClub?.id, onGenerateTrainings, showToast],
  );

  const handleClearUpcoming = async () => {
    if (
      !window.confirm(
        "Vuoi eliminare tutti gli allenamenti futuri generati automaticamente dal programma settimanale?",
      )
    ) {
      return;
    }

    await clearUpcomingTrainings();
  };

  const handleRegenerateAll = async () => {
    if (
      !window.confirm(
        "Vuoi rimuovere tutti gli allenamenti futuri generati e rigenerarli da capo in base al programma settimanale attuale?",
      )
    ) {
      return;
    }

    await clearUpcomingTrainings({ silent: true });
    await runGeneration();
  };

  return (
    <div className="rounded-egw-panel border border-egw-panel-border bg-egw-panel p-5 shadow-egw-plane-1">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-2 rounded-egw-chip border border-egw-tint-blue-bd bg-egw-tint-blue px-2.5 py-1 text-[11.5px] font-semibold text-egw-blue-800">
            <Sparkles className="h-3.5 w-3.5" />
            Assistente Automazione
          </div>
          <h3 className="text-xl font-semibold text-egw-ink">
            Generazione automatica degli allenamenti
          </h3>
          <p className="max-w-2xl text-sm text-egw-ink-72">
            Il programma settimanale crea in automatico gli allenamenti reali
            nell&apos;app, pronti per presenze, note e gestione dati.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={handleClearUpcoming}
            disabled={isResetting}
          >
            {isResetting ? (
              <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="mr-2 h-4 w-4" />
            )}
            Rimuovi programmati
          </Button>
          <Button
            variant="outline"
            onClick={handleRegenerateAll}
            disabled={isGenerating || isResetting || !weeklySchedule.length}
          >
            {isGenerating || isResetting ? (
              <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RotateCcw className="mr-2 h-4 w-4" />
            )}
            Rigenera da capo
          </Button>
          <Button
            onClick={() => runGeneration()}
            disabled={isGenerating || isResetting || !weeklySchedule.length}
            className="bg-egw-blue hover:bg-egw-blue-700"
          >
            {isGenerating ? (
              <>
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                Generazione...
              </>
            ) : (
              <>
                <CalendarClock className="mr-2 h-4 w-4" />
                Genera ora
              </>
            )}
          </Button>
        </div>
      </div>

      {lastGenerationResult ? (
        <div className="mt-4 rounded-egw-field border bg-white p-4 shadow-egw-plane-1">
          <p className="font-medium text-egw-ink">Ultima generazione</p>
          <p className="mt-1 text-sm text-egw-ink-72">
            Creati: {lastGenerationResult.generatedCount} · Già esistenti:{" "}
            {lastGenerationResult.existingCount} · Conflitti:{" "}
            {lastGenerationResult.conflicts.length} · Non disponibili:{" "}
            {lastGenerationResult.excludedCount}
            {lastGenerationResult.diagnostics?.seasonLabel
              ? ` · Stagione ${lastGenerationResult.diagnostics.seasonLabel}`
              : ""}
          </p>
          {lastGenerationResult.diagnostics ? (
            <DiagnosticaProgramma diagnostics={lastGenerationResult.diagnostics} />
          ) : null}

          {lastGenerationResult.excludedSlots.length > 0 ? (
            <div className="mt-3">
              <p className="text-sm font-medium text-egw-amber-ink">
                Impossibile generare {lastGenerationResult.excludedSlots.length}{" "}
                allenament
                {lastGenerationResult.excludedSlots.length === 1 ? "o" : "i"}:
              </p>
              <ul className="mt-2 space-y-2">
                {lastGenerationResult.excludedSlots.map((slot, index) => (
                  <li
                    key={`${slot.legacyId || index}`}
                    className="rounded-egw-control border border-egw-tint-amber-bd bg-egw-tint-amber px-3 py-2 text-sm text-egw-amber-ink"
                  >
                    <span className="font-medium">
                      {slot.categoryName || "Categoria"}
                    </span>
                    {" · "}
                    {formatItWeekday(slot.startsAt)} {formatItTime(slot.startsAt)}
                    {slot.endsAt ? `–${formatItTime(slot.endsAt)}` : ""}
                    <br />
                    <span className="text-egw-amber-ink">Motivo: {slot.reason}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {lastGenerationResult.conflicts.length > 0 ? (
            <div className="mt-3">
              <p className="text-sm font-medium text-egw-amber-ink">
                {lastGenerationResult.conflicts.length} fascia
                {lastGenerationResult.conflicts.length === 1 ? "" : "e"} da
                verificare: occupano un posto gia occupato e non sono state
                create.
              </p>
              <ul className="mt-2 space-y-2">
                {lastGenerationResult.conflicts.map((conflict, index) => (
                  <li
                    key={`${conflict.legacyId || index}`}
                    className="rounded-egw-control border border-egw-tint-amber-bd bg-egw-tint-amber px-3 py-2 text-sm text-egw-amber-ink"
                  >
                    <span className="font-medium">
                      {conflict.categoryName || "Categoria"}
                    </span>
                    {" · "}
                    Occupa lo stesso posto di «
                    {conflict.conflictsWith[0]?.title || "un altro evento"}»
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <div className="rounded-egw-field border bg-white p-4 shadow-egw-plane-1">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-egw-ink">
                Automazione attiva
              </p>
              <p className="text-xs text-egw-ink-62">
                Quando attiva, il controllo gira lato server e genera gli
                allenamenti senza dover aprire questa pagina.
              </p>
            </div>
            <Switch
              checked={settings.enabled}
              onCheckedChange={(checked) =>
                setSettings((prev) => ({ ...prev, enabled: checked }))
              }
            />
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Frequenza</Label>
              <select
                value={settings.frequency}
                onChange={(event) =>
                  setSettings((prev) => ({
                    ...prev,
                    frequency:
                      event.target.value as TrainingAutomationFrequency,
                  }))
                }
                className="w-full rounded-egw-control border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="weekly">Settimanale</option>
                <option value="interval">Ogni tot giorni</option>
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="automation-time">Orario di esecuzione</Label>
              <Input
                id="automation-time"
                type="time"
                value={settings.time}
                onChange={(event) =>
                  setSettings((prev) => ({
                    ...prev,
                    time: event.target.value,
                  }))
                }
              />
            </div>
          </div>

          {settings.frequency === "weekly" ? (
            <div className="mt-4 space-y-2">
              <Label>Giorno di esecuzione</Label>
              <select
                value={settings.day}
                onChange={(event) =>
                  setSettings((prev) => ({
                    ...prev,
                    day: event.target.value,
                  }))
                }
                className="w-full rounded-egw-control border border-input bg-background px-3 py-2 text-sm"
              >
                {Object.entries(TRAINING_AUTOMATION_DAY_LABELS).map(
                  ([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ),
                )}
              </select>
            </div>
          ) : (
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="interval-days">Ogni quanti giorni</Label>
                <Input
                  id="interval-days"
                  type="number"
                  min={1}
                  value={settings.intervalDays}
                  onChange={(event) =>
                    setSettings((prev) => ({
                      ...prev,
                      intervalDays: Math.max(1, Number(event.target.value || 1)),
                    }))
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="interval-start">Data iniziale</Label>
                <Input
                  id="interval-start"
                  type="date"
                  value={settings.startDate}
                  onChange={(event) =>
                    setSettings((prev) => ({
                      ...prev,
                      startDate: event.target.value,
                    }))
                  }
                />
              </div>
            </div>
          )}
        </div>

        <div className="rounded-egw-field border bg-white p-4 shadow-egw-plane-1">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="generate-days-ahead">
                Generazione automatica
              </Label>
              <select
                id="generate-days-ahead"
                value={settings.generateDaysAhead}
                onChange={(event) =>
                  setSettings((prev) => ({
                    ...prev,
                    generateDaysAhead: Number(event.target.value),
                  }))
                }
                className="w-full rounded-egw-control border border-input bg-background px-3 py-2 text-sm"
              >
                {GENERATE_DAYS_AHEAD_PRESETS.map((giorni) => (
                  <option key={giorni} value={giorni}>
                    {giorni} giorni{giorni === 21 ? " (predefinito)" : ""}
                  </option>
                ))}
              </select>
              <p className="text-xs text-egw-ink-62">
                Per disattivare la generazione automatica, usa
                l&apos;interruttore &quot;Automazione attiva&quot;.
              </p>
            </div>

            <div className="space-y-2">
              <Label>Ultima esecuzione</Label>
              <div className="rounded-egw-control border bg-egw-page-100 px-3 py-2 text-sm text-egw-ink-72">
                {settings.lastRunAt
                  ? new Date(settings.lastRunAt).toLocaleString("it-IT")
                  : "Mai eseguita"}
              </div>
            </div>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="rounded-egw-field bg-egw-page-100 p-4 text-sm text-egw-ink-72">
              <p className="font-medium text-egw-ink">Prossima esecuzione</p>
              <p className="mt-1">{formatNextRun(settings)}</p>
            </div>
            <div className="rounded-egw-field bg-egw-page-100 p-4 text-sm text-egw-ink-72">
              <p className="font-medium text-egw-ink">
                Allenamenti generati fino al
              </p>
              <p className="mt-1">
                {settings.generatedUntil
                  ? formatItDate(settings.generatedUntil)
                  : "Nessuna generazione ancora eseguita"}
              </p>
            </div>
          </div>

          <div className="mt-4 rounded-egw-field border p-4">
            <p className="text-sm font-medium text-egw-ink">
              Sospensioni ed eccezioni
            </p>
            <p className="text-xs text-egw-ink-62">
              Un intervallo (vacanze, chiusura impianti) o un singolo giorno
              in cui non generare: la regola resta attiva, riprende da sola
              subito dopo.
            </p>

            {settings.exclusions.length > 0 ? (
              <ul className="mt-3 space-y-2">
                {settings.exclusions.map((exclusion) => (
                  <li
                    key={exclusion.id}
                    className="flex items-center justify-between rounded-egw-control border bg-egw-page-100 px-3 py-2 text-sm"
                  >
                    <span>
                      {formatItDate(exclusion.from)}
                      {exclusion.to !== exclusion.from
                        ? ` → ${formatItDate(exclusion.to)}`
                        : ""}
                      {exclusion.reason ? ` · ${exclusion.reason}` : ""}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeExclusion(exclusion.id)}
                      className="h-7 w-7 text-egw-ink-62 hover:text-egw-red"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-xs text-egw-ink-42">
                Nessuna sospensione attiva.
              </p>
            )}

            <div className="mt-3 grid gap-2 sm:grid-cols-4">
              <Input
                type="date"
                value={newExclusionFrom}
                onChange={(event) => setNewExclusionFrom(event.target.value)}
                aria-label="Dal"
              />
              <Input
                type="date"
                value={newExclusionTo}
                onChange={(event) => setNewExclusionTo(event.target.value)}
                aria-label="Al"
                placeholder="Al (opzionale)"
              />
              <Input
                value={newExclusionReason}
                onChange={(event) => setNewExclusionReason(event.target.value)}
                placeholder="Motivo (opzionale)"
              />
              <Button variant="outline" onClick={addExclusion}>
                Aggiungi
              </Button>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap justify-end gap-2">
            <Button
              variant="outline"
              onClick={() =>
                setSettings(DEFAULT_TRAINING_AUTOMATION_SETTINGS)
              }
              disabled={isSaving}
            >
              Ripristina
            </Button>
            <Button
              onClick={saveManualSettings}
              disabled={isSaving}
              className="bg-egw-blue hover:bg-egw-blue-700"
            >
              <Save className="mr-2 h-4 w-4" />
              {isSaving ? "Salvataggio..." : "Salva impostazioni"}
            </Button>
          </div>
        </div>
      </div>

      <div className="mt-4 rounded-egw-field border bg-white p-4 shadow-egw-plane-1">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-2">
            <Label htmlFor="generate-until-date">Genera fino a...</Label>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                id="generate-until-date"
                type="date"
                value={untilDate}
                onChange={(event) => {
                  setUntilDate(event.target.value);
                  setPreview(null);
                }}
                className="w-auto"
              />
              <Button
                variant="outline"
                onClick={() => runGenerateUntil("preview")}
                disabled={isPreviewing || isGeneratingUntil || !untilDate}
              >
                {isPreviewing ? (
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <CalendarRange className="mr-2 h-4 w-4" />
                )}
                Anteprima
              </Button>
            </div>
            <p className="text-xs text-egw-ink-62">
              Usa lo stesso motore di generazione dell&apos;automazione, con
              una data assoluta al posto della finestra a giorni.
            </p>
          </div>

          {preview ? (
            <div className="rounded-egw-field bg-egw-page-100 p-4 text-sm text-egw-ink-72">
              <p className="font-medium text-egw-ink">
                Generazione fino al {formatItDate(untilDate)}
              </p>
              <p className="mt-1">
                Da creare: {preview.generatedCount} · Già esistenti:{" "}
                {preview.existingCount} · Conflitti: {preview.conflicts.length}{" "}
                · Esclusi: {preview.excludedCount}
                {preview.diagnostics?.seasonLabel ? ` · Stagione ${preview.diagnostics.seasonLabel}` : ""}
              </p>
              {preview.diagnostics ? <DiagnosticaProgramma diagnostics={preview.diagnostics} /> : null}
              {preview.conflicts.length > 0 ? (
                <p className="mt-1 text-egw-amber-ink">
                  {preview.conflicts.length} fascia
                  {preview.conflicts.length === 1 ? "" : "e"} da verificare:
                  occupano un posto gia occupato e non verranno create.
                </p>
              ) : null}
              {preview.excludedSlots.length > 0 ? (
                <div className="mt-2">
                  <p className="text-egw-amber-ink">
                    {preview.excludedSlots.length} fascia
                    {preview.excludedSlots.length === 1 ? "" : "e"} non
                    disponibile{preview.excludedSlots.length === 1 ? "" : "i"}:
                  </p>
                  <ul className="mt-1 space-y-1">
                    {preview.excludedSlots.map((slot, index) => (
                      <li
                        key={`${slot.legacyId || index}`}
                        className="rounded-egw-control border border-egw-tint-amber-bd bg-white px-2 py-1 text-xs text-egw-amber-ink"
                      >
                        <span className="font-medium">
                          {slot.categoryName || "Categoria"}
                        </span>
                        {" · "}
                        {formatItWeekday(slot.startsAt)}{" "}
                        {formatItTime(slot.startsAt)}
                        {slot.endsAt ? `–${formatItTime(slot.endsAt)}` : ""} —{" "}
                        {slot.reason}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <div className="mt-3 flex flex-wrap justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => setPreview(null)}
                  disabled={isGeneratingUntil}
                >
                  Annulla
                </Button>
                <Button
                  onClick={() => runGenerateUntil("execute")}
                  disabled={isGeneratingUntil}
                  className="bg-egw-blue hover:bg-egw-blue-700"
                >
                  {isGeneratingUntil ? (
                    <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <CalendarClock className="mr-2 h-4 w-4" />
                  )}
                  Genera {preview.generatedCount} allenamenti
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
