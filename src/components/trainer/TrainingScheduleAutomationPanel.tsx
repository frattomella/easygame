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

type GenerateUntilResponse = {
  ran: boolean;
  due: boolean;
  generatedCount: number;
  existingCount: number;
  excludedCount: number;
  conflicts: GenerateUntilConflict[];
  preview: boolean;
  generatedUntil: string | null;
  reason?: string;
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
    try {
      const response = await apiRequest<{
        generatedCount: number;
        generatedTrainings: any[];
        lastRunAt: string | null;
        reason?: string;
      }>("/api/v1/training-automation", {
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

      if (response.data?.reason === "missing_schedule") {
        showToast(
          "error",
          "Il programma settimanale non contiene sessioni valide da generare",
        );
        return;
      }

      const generatedTrainings = Array.isArray(response.data?.generatedTrainings)
        ? response.data.generatedTrainings
        : [];
      const nextLastRunAt =
        response.data?.lastRunAt || new Date().toISOString();

      setSettings((current) => ({
        ...current,
        lastRunAt: nextLastRunAt,
      }));
      onGenerateTrainings();

      if (generatedTrainings.length > 0) {
        showToast(
          "success",
          `${generatedTrainings.length} allenamenti creati dal programma settimanale`,
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

        if (data.reason === "missing_schedule") {
          showToast(
            "error",
            "Il programma settimanale non contiene sessioni valide da generare",
          );
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
    <div className="rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50 via-white to-indigo-50 p-5 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-2 rounded-full bg-white/80 px-3 py-1 text-xs font-semibold text-blue-700 shadow-sm">
            <Sparkles className="h-3.5 w-3.5" />
            Assistente Automazione
          </div>
          <h3 className="text-xl font-semibold text-slate-900">
            Generazione automatica degli allenamenti
          </h3>
          <p className="max-w-2xl text-sm text-slate-600">
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
            className="bg-blue-600 hover:bg-blue-700"
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

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-900">
                Automazione attiva
              </p>
              <p className="text-xs text-slate-500">
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
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
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
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
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

        <div className="rounded-xl border bg-white p-4 shadow-sm">
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
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                {GENERATE_DAYS_AHEAD_PRESETS.map((giorni) => (
                  <option key={giorni} value={giorni}>
                    {giorni} giorni{giorni === 21 ? " (predefinito)" : ""}
                  </option>
                ))}
              </select>
              <p className="text-xs text-slate-500">
                Per disattivare la generazione automatica, usa
                l&apos;interruttore &quot;Automazione attiva&quot;.
              </p>
            </div>

            <div className="space-y-2">
              <Label>Ultima esecuzione</Label>
              <div className="rounded-md border bg-slate-50 px-3 py-2 text-sm text-slate-600">
                {settings.lastRunAt
                  ? new Date(settings.lastRunAt).toLocaleString("it-IT")
                  : "Mai eseguita"}
              </div>
            </div>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
              <p className="font-medium text-slate-900">Prossima esecuzione</p>
              <p className="mt-1">{formatNextRun(settings)}</p>
            </div>
            <div className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
              <p className="font-medium text-slate-900">
                Allenamenti generati fino al
              </p>
              <p className="mt-1">
                {settings.generatedUntil
                  ? formatItDate(settings.generatedUntil)
                  : "Nessuna generazione ancora eseguita"}
              </p>
            </div>
          </div>

          <div className="mt-4 rounded-xl border p-4">
            <p className="text-sm font-medium text-slate-900">
              Sospensioni ed eccezioni
            </p>
            <p className="text-xs text-slate-500">
              Un intervallo (vacanze, chiusura impianti) o un singolo giorno
              in cui non generare: la regola resta attiva, riprende da sola
              subito dopo.
            </p>

            {settings.exclusions.length > 0 ? (
              <ul className="mt-3 space-y-2">
                {settings.exclusions.map((exclusion) => (
                  <li
                    key={exclusion.id}
                    className="flex items-center justify-between rounded-md border bg-slate-50 px-3 py-2 text-sm"
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
                      className="h-7 w-7 text-slate-500 hover:text-red-600"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-xs text-slate-400">
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
              className="bg-blue-600 hover:bg-blue-700"
            >
              <Save className="mr-2 h-4 w-4" />
              {isSaving ? "Salvataggio..." : "Salva impostazioni"}
            </Button>
          </div>
        </div>
      </div>

      <div className="mt-4 rounded-xl border bg-white p-4 shadow-sm">
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
            <p className="text-xs text-slate-500">
              Usa lo stesso motore di generazione dell&apos;automazione, con
              una data assoluta al posto della finestra a giorni.
            </p>
          </div>

          {preview ? (
            <div className="rounded-xl bg-slate-50 p-4 text-sm text-slate-700">
              <p className="font-medium text-slate-900">
                Generazione fino al {formatItDate(untilDate)}
              </p>
              <p className="mt-1">
                Da creare: {preview.generatedCount} · Già esistenti:{" "}
                {preview.existingCount} · Conflitti: {preview.conflicts.length}{" "}
                · Esclusi: {preview.excludedCount}
              </p>
              {preview.conflicts.length > 0 ? (
                <p className="mt-1 text-amber-700">
                  {preview.conflicts.length} fascia
                  {preview.conflicts.length === 1 ? "" : "e"} da verificare:
                  occupano un posto gia occupato e non verranno create.
                </p>
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
                  className="bg-blue-600 hover:bg-blue-700"
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
