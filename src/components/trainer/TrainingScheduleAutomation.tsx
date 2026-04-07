"use client";

import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast-notification";
import { Calendar, RefreshCw, Settings, Clock, Save } from "lucide-react";
import { useAuth } from "@/components/providers/AuthProvider";
import {
  generateTrainingsFromWeeklySchedule,
  getClubData,
} from "@/lib/simplified-db";

interface TrainingScheduleAutomationProps {
  onGenerateTrainings?: () => void;
  weeklySchedule?: any[];
}

export function TrainingScheduleAutomation({
  onGenerateTrainings = () => {},
  weeklySchedule = [],
}: TrainingScheduleAutomationProps) {
  const { showToast } = useToast();
  const { activeClub } = useAuth();
  const [isGenerating, setIsGenerating] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [automationSettings, setAutomationSettings] = useState({
    frequency: "weekly", // "weekly" or "daily"
    time: "23:30",
    day: "sunday", // for weekly generation
    enabled: false,
  });

  // Load automation settings from localStorage on component mount
  React.useEffect(() => {
    const savedSettings = localStorage.getItem("training-automation-settings");
    if (savedSettings) {
      try {
        const parsedSettings = JSON.parse(savedSettings);
        setAutomationSettings(parsedSettings);
      } catch (error) {
        console.error("Error loading automation settings:", error);
      }
    }
  }, []);

  // Save automation settings to localStorage whenever they change
  React.useEffect(() => {
    localStorage.setItem(
      "training-automation-settings",
      JSON.stringify(automationSettings),
    );
  }, [automationSettings]);

  const handleGenerateTrainings = async () => {
    if (!activeClub?.id) {
      showToast("error", "Nessun club attivo selezionato");
      return;
    }

    setIsGenerating(true);

    try {
      // Get the current weekly schedule from database
      let schedule = weeklySchedule;
      if (schedule.length === 0) {
        // Try to load from database if not provided
        const clubData = await getClubData(activeClub.id, "weekly_schedule");
        schedule = clubData || [];
      }

      if (schedule.length === 0) {
        showToast(
          "error",
          "Nessun programma settimanale trovato. Configura prima il programma settimanale.",
        );
        setIsGenerating(false);
        return;
      }

      // Generate trainings for the next week
      const today = new Date();
      const nextMonday = new Date(today);
      nextMonday.setDate(today.getDate() + ((1 + 7 - today.getDay()) % 7));
      const nextSunday = new Date(nextMonday);
      nextSunday.setDate(nextMonday.getDate() + 6);

      const generatedTrainings = await generateTrainingsFromWeeklySchedule(
        activeClub.id,
        schedule,
        nextMonday,
        nextSunday,
      );

      setIsGenerating(false);
      onGenerateTrainings();

      if (generatedTrainings.length > 0) {
        showToast(
          "success",
          `${generatedTrainings.length} allenamenti generati automaticamente per la prossima settimana`,
        );
      } else {
        showToast(
          "info",
          "Nessun nuovo allenamento da generare. Gli allenamenti per la prossima settimana sono già presenti.",
        );
      }
    } catch (error) {
      console.error("Error generating trainings:", error);
      showToast("error", "Errore nella generazione degli allenamenti");
      setIsGenerating(false);
    }
  };

  const handleSaveSettings = () => {
    // In a real implementation, this would save to database or trigger a cron job setup
    showToast(
      "success",
      `Impostazioni salvate: generazione ${automationSettings.frequency === "weekly" ? "settimanale" : "giornaliera"} alle ${automationSettings.time}`,
    );
    setShowSettings(false);
  };

  return (
    <Card className="border-2 border-dashed border-blue-200 dark:border-blue-800">
      <CardHeader className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
              <RefreshCw className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <CardTitle className="text-lg font-semibold text-blue-900 dark:text-blue-100">
                Assistente Automazione
              </CardTitle>
              <p className="text-sm text-blue-600 dark:text-blue-300 mt-1">
                Genera automaticamente gli allenamenti dalla programmazione
                settimanale
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowSettings(!showSettings)}
            className="border-blue-200 text-blue-600 hover:bg-blue-50 dark:border-blue-700 dark:text-blue-400 dark:hover:bg-blue-900/20"
          >
            <Settings className="h-4 w-4 mr-2" />
            {showSettings ? "Nascondi" : "Configura"}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="pt-6">
        <div className="space-y-6">
          {!showSettings ? (
            <>
              {/* Quick Action Section */}
              <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                <div className="flex items-center gap-3 mb-3">
                  <div className="p-1.5 bg-green-100 dark:bg-green-900/30 rounded-full">
                    <Calendar className="h-4 w-4 text-green-600 dark:text-green-400" />
                  </div>
                  <h3 className="font-medium text-gray-900 dark:text-gray-100">
                    Generazione Rapida
                  </h3>
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                  Crea automaticamente tutti gli allenamenti per la prossima
                  settimana basandoti sul tuo programma settimanale salvato.
                </p>
                <Button
                  onClick={handleGenerateTrainings}
                  disabled={isGenerating}
                  className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-lg"
                  size="lg"
                >
                  {isGenerating ? (
                    <>
                      <RefreshCw className="mr-2 h-5 w-5 animate-spin" />
                      Generazione in corso...
                    </>
                  ) : (
                    <>
                      <Calendar className="mr-2 h-5 w-5" />
                      Genera Allenamenti Settimanali
                    </>
                  )}
                </Button>
              </div>

              {/* Status Section */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20 p-4 rounded-lg border border-blue-200 dark:border-blue-700">
                  <div className="flex items-center gap-2 mb-2">
                    <Clock className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                    <span className="text-sm font-medium text-blue-800 dark:text-blue-200">
                      Configurazione Attuale
                    </span>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-blue-700 dark:text-blue-300">
                      Frequenza:{" "}
                      {automationSettings.frequency === "weekly"
                        ? "Settimanale"
                        : "Giornaliera"}
                    </p>
                    <p className="text-xs text-blue-700 dark:text-blue-300">
                      Orario: {automationSettings.time}
                    </p>
                    {automationSettings.frequency === "weekly" && (
                      <p className="text-xs text-blue-700 dark:text-blue-300">
                        Giorno:{" "}
                        {automationSettings.day === "sunday"
                          ? "Domenica"
                          : "Lunedì"}
                      </p>
                    )}
                  </div>
                </div>

                <div
                  className={`p-4 rounded-lg border ${
                    automationSettings.enabled
                      ? "bg-gradient-to-br from-green-50 to-green-100 dark:from-green-900/20 dark:to-green-800/20 border-green-200 dark:border-green-700"
                      : "bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-800/20 dark:to-gray-700/20 border-gray-200 dark:border-gray-600"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <div
                      className={`w-2 h-2 rounded-full ${
                        automationSettings.enabled
                          ? "bg-green-500"
                          : "bg-gray-400"
                      }`}
                    ></div>
                    <span className="text-sm font-medium">
                      {automationSettings.enabled
                        ? "Automazione Attiva"
                        : "Automazione Disattiva"}
                    </span>
                  </div>
                  <p className="text-xs text-gray-600 dark:text-gray-400">
                    {automationSettings.enabled
                      ? "Gli allenamenti verranno generati automaticamente"
                      : "Usa il pulsante sopra per generare manualmente"}
                  </p>
                </div>
              </div>
            </>
          ) : (
            <div className="space-y-6">
              <div className="flex items-center gap-3 pb-4 border-b border-gray-200 dark:border-gray-700">
                <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                  <Settings className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <h4 className="font-semibold text-gray-900 dark:text-gray-100">
                    Configurazione Avanzata
                  </h4>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Personalizza le impostazioni di automazione
                  </p>
                </div>
              </div>

              <div className="space-y-5">
                <div className="bg-gray-50 dark:bg-gray-800/50 p-4 rounded-lg">
                  <Label className="text-sm font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    Frequenza di Generazione
                  </Label>
                  <div className="mt-3 space-y-3">
                    <div className="flex items-center space-x-3 p-3 bg-white dark:bg-gray-800 rounded-md border border-gray-200 dark:border-gray-700">
                      <input
                        type="radio"
                        id="weekly"
                        name="frequency"
                        value="weekly"
                        checked={automationSettings.frequency === "weekly"}
                        onChange={(e) =>
                          setAutomationSettings({
                            ...automationSettings,
                            frequency: e.target.value,
                          })
                        }
                        className="h-4 w-4 text-blue-600"
                      />
                      <div className="flex-1">
                        <Label
                          htmlFor="weekly"
                          className="text-sm font-medium cursor-pointer"
                        >
                          Settimanale
                        </Label>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          Genera tutti gli allenamenti ogni domenica sera
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-3 p-3 bg-white dark:bg-gray-800 rounded-md border border-gray-200 dark:border-gray-700">
                      <input
                        type="radio"
                        id="daily"
                        name="frequency"
                        value="daily"
                        checked={automationSettings.frequency === "daily"}
                        onChange={(e) =>
                          setAutomationSettings({
                            ...automationSettings,
                            frequency: e.target.value,
                          })
                        }
                        className="h-4 w-4 text-blue-600"
                      />
                      <div className="flex-1">
                        <Label
                          htmlFor="daily"
                          className="text-sm font-medium cursor-pointer"
                        >
                          Giornaliera
                        </Label>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          Genera gli allenamenti del giorno successivo ogni sera
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-gray-50 dark:bg-gray-800/50 p-4 rounded-lg">
                  <Label
                    htmlFor="time"
                    className="text-sm font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2"
                  >
                    <Clock className="h-4 w-4" />
                    Orario di Generazione
                  </Label>
                  <p className="text-xs text-gray-600 dark:text-gray-400 mb-3">
                    Scegli quando eseguire la generazione automatica
                  </p>
                  <input
                    type="time"
                    id="time"
                    value={automationSettings.time}
                    onChange={(e) =>
                      setAutomationSettings({
                        ...automationSettings,
                        time: e.target.value,
                      })
                    }
                    className="w-full h-11 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-4 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                {automationSettings.frequency === "weekly" && (
                  <div className="bg-gray-50 dark:bg-gray-800/50 p-4 rounded-lg">
                    <Label className="text-sm font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                      <Calendar className="h-4 w-4" />
                      Giorno della Settimana
                    </Label>
                    <p className="text-xs text-gray-600 dark:text-gray-400 mb-3">
                      Quando eseguire la generazione settimanale
                    </p>
                    <select
                      value={automationSettings.day}
                      onChange={(e) =>
                        setAutomationSettings({
                          ...automationSettings,
                          day: e.target.value,
                        })
                      }
                      className="w-full h-11 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-4 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="sunday">Domenica</option>
                      <option value="monday">Lunedì</option>
                    </select>
                  </div>
                )}

                <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 p-4 rounded-lg border border-blue-200 dark:border-blue-700">
                  <div className="flex items-center space-x-3">
                    <input
                      type="checkbox"
                      id="enabled"
                      checked={automationSettings.enabled}
                      onChange={(e) =>
                        setAutomationSettings({
                          ...automationSettings,
                          enabled: e.target.checked,
                        })
                      }
                      className="h-5 w-5 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                    />
                    <div className="flex-1">
                      <Label
                        htmlFor="enabled"
                        className="text-sm font-medium cursor-pointer flex items-center gap-2"
                      >
                        <Settings className="h-4 w-4" />
                        Abilita Automazione
                      </Label>
                      <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                        {automationSettings.enabled
                          ? "Gli allenamenti verranno generati automaticamente secondo la configurazione"
                          : "L'automazione è disattivata, usa la generazione manuale"}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
                <Button
                  onClick={handleSaveSettings}
                  className="flex-1 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-lg"
                  size="lg"
                >
                  <Save className="h-4 w-4 mr-2" />
                  Salva Configurazione
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setShowSettings(false)}
                  className="px-6 border-gray-300 dark:border-gray-600"
                  size="lg"
                >
                  Annulla
                </Button>
              </div>

              <div className="bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 p-4 rounded-lg border border-amber-200 dark:border-amber-700">
                <div className="flex items-start gap-3">
                  <div className="p-1 bg-amber-100 dark:bg-amber-900/30 rounded-full flex-shrink-0 mt-0.5">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="text-amber-600 dark:text-amber-400"
                    >
                      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"></path>
                      <path d="M12 9v4"></path>
                      <path d="M12 17h.01"></path>
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-amber-800 dark:text-amber-200 mb-1">
                      Funzionalità in Sviluppo
                    </p>
                    <p className="text-xs text-amber-700 dark:text-amber-300">
                      L'automazione completa richiede la configurazione di un
                      servizio di scheduling sul server.
                      <strong>
                        Per ora, utilizza il pulsante "Genera Allenamenti
                        Settimanali" per la generazione manuale.
                      </strong>
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
