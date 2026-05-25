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
  RefreshCw,
  RotateCcw,
  Save,
  Sparkles,
  Trash2,
} from "lucide-react";

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
                Giorni da generare in anticipo
              </Label>
              <Input
                id="generate-days-ahead"
                type="number"
                min={7}
                value={settings.generateDaysAhead}
                onChange={(event) =>
                  setSettings((prev) => ({
                    ...prev,
                    generateDaysAhead: Math.max(
                      7,
                      Number(event.target.value || 7),
                    ),
                  }))
                }
              />
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

          <div className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
            <p className="font-medium text-slate-900">Prossima esecuzione</p>
            <p className="mt-1">{formatNextRun(settings)}</p>
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
    </div>
  );
}
