"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/toast-notification";
import { useAuth } from "@/components/providers/AuthProvider";
import {
  clearUpcomingGeneratedTrainings,
  generateTrainingsFromWeeklySchedule,
  getClubSettings,
  saveClubSettings,
} from "@/lib/simplified-db";
import {
  CalendarClock,
  RefreshCw,
  RotateCcw,
  Save,
  Sparkles,
  Trash2,
} from "lucide-react";

type AutomationFrequency = "weekly" | "interval";

type TrainingAutomationSettings = {
  enabled: boolean;
  frequency: AutomationFrequency;
  time: string;
  day: string;
  intervalDays: number;
  startDate: string;
  generateDaysAhead: number;
  lastRunAt: string | null;
};

const DEFAULT_SETTINGS: TrainingAutomationSettings = {
  enabled: false,
  frequency: "weekly",
  time: "23:00",
  day: "sunday",
  intervalDays: 7,
  startDate: new Date().toISOString().split("T")[0],
  generateDaysAhead: 21,
  lastRunAt: null,
};

const DAY_LABELS: Record<string, string> = {
  monday: "Lunedì",
  tuesday: "Martedì",
  wednesday: "Mercoledì",
  thursday: "Giovedì",
  friday: "Venerdì",
  saturday: "Sabato",
  sunday: "Domenica",
};

const DAY_TO_NUMBER: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

const parseSettings = (value: any): TrainingAutomationSettings => ({
  ...DEFAULT_SETTINGS,
  ...(typeof value === "object" && value ? value : {}),
  intervalDays: Math.max(1, Number(value?.intervalDays || DEFAULT_SETTINGS.intervalDays)),
  generateDaysAhead: Math.max(
    7,
    Number(value?.generateDaysAhead || DEFAULT_SETTINGS.generateDaysAhead),
  ),
  startDate:
    String(value?.startDate || DEFAULT_SETTINGS.startDate).slice(0, 10) ||
    DEFAULT_SETTINGS.startDate,
  time: String(value?.time || DEFAULT_SETTINGS.time).slice(0, 5),
  lastRunAt: value?.lastRunAt || null,
});

const combineDateAndTime = (date: Date, time: string) => {
  const [hours, minutes] = String(time || "00:00")
    .split(":")
    .map((value) => Number(value || 0));
  const next = new Date(date);
  next.setHours(hours, minutes, 0, 0);
  return next;
};

const getNextWeeklyDue = (settings: TrainingAutomationSettings, now: Date) => {
  const targetDay = DAY_TO_NUMBER[settings.day] ?? 0;
  const next = new Date(now);
  const diff = (targetDay - now.getDay() + 7) % 7;
  next.setDate(now.getDate() + diff);
  const due = combineDateAndTime(next, settings.time);

  if (due > now) {
    return due;
  }

  due.setDate(due.getDate() + 7);
  return due;
};

const getLastIntervalDue = (settings: TrainingAutomationSettings, now: Date) => {
  const start = combineDateAndTime(new Date(settings.startDate), settings.time);

  if (Number.isNaN(start.getTime())) {
    return combineDateAndTime(new Date(), settings.time);
  }

  if (start > now) {
    return start;
  }

  const intervalMs = settings.intervalDays * 24 * 60 * 60 * 1000;
  const elapsedIntervals = Math.floor(
    (now.getTime() - start.getTime()) / intervalMs,
  );
  return new Date(start.getTime() + elapsedIntervals * intervalMs);
};

const shouldRunAutomation = (
  settings: TrainingAutomationSettings,
  now: Date,
) => {
  if (!settings.enabled) {
    return false;
  }

  const due =
    settings.frequency === "weekly"
      ? (() => {
          const lastRun = settings.lastRunAt ? new Date(settings.lastRunAt) : null;
          const thisWeekDue = combineDateAndTime(new Date(now), settings.time);
          thisWeekDue.setDate(
            now.getDate() +
              ((DAY_TO_NUMBER[settings.day] ?? 0) - now.getDay()),
          );

          if (thisWeekDue <= now) {
            return thisWeekDue;
          }

          const previousDue = new Date(thisWeekDue);
          previousDue.setDate(previousDue.getDate() - 7);
          return lastRun && lastRun >= thisWeekDue ? null : previousDue;
        })()
      : getLastIntervalDue(settings, now);

  if (!due || due > now) {
    return false;
  }

  if (!settings.lastRunAt) {
    return true;
  }

  return new Date(settings.lastRunAt) < due;
};

const formatNextRun = (settings: TrainingAutomationSettings) => {
  const now = new Date();
  const nextRun =
    settings.frequency === "weekly"
      ? getNextWeeklyDue(settings, now)
      : (() => {
          const lastDue = getLastIntervalDue(settings, now);
          if (lastDue > now) {
            return lastDue;
          }
          return new Date(
            lastDue.getTime() + settings.intervalDays * 24 * 60 * 60 * 1000,
          );
        })();

  return nextRun.toLocaleString("it-IT", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

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
  const [settings, setSettings] =
    React.useState<TrainingAutomationSettings>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = React.useState(false);
  const autoRunGuardRef = React.useRef(false);

  const loadSettings = React.useCallback(async () => {
    if (!activeClub?.id) {
      setLoaded(true);
      return;
    }

    const clubSettings = await getClubSettings(activeClub.id);
    const trainingAutomation = parseSettings(clubSettings?.trainingAutomation);
    setSettings(trainingAutomation);
    setLoaded(true);
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

  const runGeneration = React.useCallback(
    async (options?: { automated?: boolean }) => {
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
        const start = new Date();
        const end = new Date();
        end.setDate(end.getDate() + Math.max(7, settings.generateDaysAhead));

        const generated = await generateTrainingsFromWeeklySchedule(
          activeClub.id,
          weeklySchedule,
          start,
          end,
        );

        const nextSettings = {
          ...settings,
          lastRunAt: new Date().toISOString(),
        };
        await persistSettings(nextSettings);
        onGenerateTrainings();

        if (generated.length > 0) {
          showToast(
            "success",
            `${generated.length} allenamenti creati dal programma settimanale`,
          );
        } else if (!options?.automated) {
          showToast(
            "success",
            "Nessun duplicato creato: il calendario era già allineato",
          );
        }
      } catch (error) {
        console.error("Error generating trainings:", error);
        showToast("error", "Errore nella generazione degli allenamenti");
      } finally {
        setIsGenerating(false);
      }
    },
    [
      activeClub?.id,
      onGenerateTrainings,
      persistSettings,
      settings,
      showToast,
      weeklySchedule,
    ],
  );

  React.useEffect(() => {
    if (!loaded || autoRunGuardRef.current) {
      return;
    }

    if (shouldRunAutomation(settings, new Date())) {
      autoRunGuardRef.current = true;
      runGeneration({ automated: true });
    }
  }, [loaded, runGeneration, settings]);

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
                Quando attiva, alla prima apertura utile dell&apos;app esegue la
                generazione prevista.
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
                    frequency: event.target.value as AutomationFrequency,
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
                {Object.entries(DAY_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
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
              onClick={() => setSettings(DEFAULT_SETTINGS)}
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
