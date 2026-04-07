"use client";

import React, { useState, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast-notification";
import {
  Plus,
  Trash2,
  Save,
  Calendar,
  ListTodo,
  Move,
  CalendarDays,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useAuth } from "@/components/providers/AuthProvider";
import { supabase } from "@/lib/supabase";

interface WeeklyScheduleProps {
  categories: { id: string; name: string }[];
  trainers: { id: string; name: string }[];
  locations: { id: string; name: string }[];
  onSave: (schedule: WeeklyTrainingItem[]) => void;
  initialSchedule?: WeeklyTrainingItem[];
}

export interface WeeklyTrainingItem {
  id: string;
  day: string;
  startTime: string;
  endTime: string;
  categoryId: string;
  trainerIds: string[];
  locationId: string;
}

const DAYS_OF_WEEK = [
  "Lunedì",
  "Martedì",
  "Mercoledì",
  "Giovedì",
  "Venerdì",
  "Sabato",
  "Domenica",
];

export function WeeklyTrainingSchedule({
  categories = [],
  trainers = [],
  locations = [],
  onSave,
  initialSchedule = [],
}: WeeklyScheduleProps) {
  const { showToast } = useToast();
  const { user, activeClub } = useAuth();
  const [schedule, setSchedule] =
    useState<WeeklyTrainingItem[]>(initialSchedule);
  const [activeView, setActiveView] = useState<"list" | "calendar">("calendar");
  const [draggedItem, setDraggedItem] = useState<WeeklyTrainingItem | null>(
    null,
  );
  const [dragOverDay, setDragOverDay] = useState<string | null>(null);

  const [showAddTrainingModal, setShowAddTrainingModal] = useState(false);
  const [newTraining, setNewTraining] = useState<Partial<WeeklyTrainingItem>>({
    day: DAYS_OF_WEEK[0],
    startTime: "18:00",
    endTime: "19:30",
    categoryId: categories.length > 0 ? categories[0].id : "",
    trainerIds: trainers.length > 0 ? [trainers[0].id] : [],
    locationId: locations.length > 0 ? locations[0].id : "",
  });

  // Load schedule from database on component mount
  React.useEffect(() => {
    const loadSchedule = async () => {
      if (!user || !activeClub) {
        // Load from localStorage if no user/club
        const savedSchedule = localStorage.getItem(
          `weekly-schedule-${activeClub?.id || "default"}`,
        );
        if (savedSchedule) {
          try {
            const parsedSchedule = JSON.parse(savedSchedule);
            setSchedule(parsedSchedule);
          } catch (error) {
            console.error("Error loading schedule from localStorage:", error);
          }
        }
        return;
      }

      try {
        // Load directly from clubs table
        const { data: clubData, error } = await supabase
          .from("clubs")
          .select("trainings")
          .eq("id", activeClub.id)
          .single();

        if (error) {
          console.error(
            "Error loading training schedule from database:",
            error,
          );
          // Load from localStorage as fallback
          const savedSchedule = localStorage.getItem(
            `weekly-schedule-${activeClub.id}`,
          );
          if (savedSchedule) {
            try {
              const parsedSchedule = JSON.parse(savedSchedule);
              setSchedule(parsedSchedule);
            } catch (error) {
              console.error("Error loading schedule from localStorage:", error);
            }
          }
          return;
        }

        if (clubData?.trainings && Array.isArray(clubData.trainings)) {
          setSchedule(clubData.trainings);
          // Save to localStorage as backup
          localStorage.setItem(
            `weekly-schedule-${activeClub.id}`,
            JSON.stringify(clubData.trainings),
          );
        } else {
          // Load from localStorage if database is empty
          const savedSchedule = localStorage.getItem(
            `weekly-schedule-${activeClub.id}`,
          );
          if (savedSchedule) {
            try {
              const parsedSchedule = JSON.parse(savedSchedule);
              setSchedule(parsedSchedule);
            } catch (error) {
              console.error("Error loading schedule from localStorage:", error);
            }
          }
        }
      } catch (error) {
        console.error("Error loading training schedule:", error);
        // Load from localStorage as fallback
        const savedSchedule = localStorage.getItem(
          `weekly-schedule-${activeClub.id}`,
        );
        if (savedSchedule) {
          try {
            const parsedSchedule = JSON.parse(savedSchedule);
            setSchedule(parsedSchedule);
          } catch (error) {
            console.error("Error loading schedule from localStorage:", error);
          }
        }
      }
    };

    loadSchedule();
  }, [user, activeClub]);

  // Save schedule to localStorage whenever it changes
  React.useEffect(() => {
    if (activeClub?.id && schedule.length > 0) {
      localStorage.setItem(
        `weekly-schedule-${activeClub.id}`,
        JSON.stringify(schedule),
      );
    }
  }, [schedule, activeClub?.id]);

  const handleAddTraining = () => {
    setNewTraining({
      day: DAYS_OF_WEEK[0],
      startTime: "18:00",
      endTime: "19:30",
      categoryId: categories.length > 0 ? categories[0].id : "",
      trainerIds: trainers.length > 0 ? [trainers[0].id] : [],
      locationId: locations.length > 0 ? locations[0].id : "",
    });
    setShowAddTrainingModal(true);
  };

  const handleAddTrainingSubmit = () => {
    const trainingItem: WeeklyTrainingItem = {
      id: `training-${Date.now()}`,
      day: newTraining.day || DAYS_OF_WEEK[0],
      startTime: newTraining.startTime || "18:00",
      endTime: newTraining.endTime || "19:30",
      categoryId:
        newTraining.categoryId ||
        (categories.length > 0 ? categories[0].id : ""),
      trainerIds:
        newTraining.trainerIds && newTraining.trainerIds.length > 0
          ? newTraining.trainerIds
          : trainers.length > 0
            ? [trainers[0].id]
            : [],
      locationId:
        newTraining.locationId || (locations.length > 0 ? locations[0].id : ""),
    };

    console.log("Adding new training item:", trainingItem);
    setSchedule([...schedule, trainingItem]);
    setShowAddTrainingModal(false);
  };

  const handleRemoveTraining = (id: string) => {
    setSchedule(schedule.filter((item) => item.id !== id));
  };

  const handleChange = (
    id: string,
    field: keyof WeeklyTrainingItem,
    value: string | string[],
  ) => {
    setSchedule(
      schedule.map((item) =>
        item.id === id ? { ...item, [field]: value } : item,
      ),
    );
  };

  const handleTrainerChange = (
    id: string,
    trainerId: string,
    checked: boolean,
  ) => {
    setSchedule(
      schedule.map((item) => {
        if (item.id === id) {
          const trainerIds = item.trainerIds ? [...item.trainerIds] : [];
          if (checked && !trainerIds.includes(trainerId)) {
            trainerIds.push(trainerId);
          } else if (!checked && trainerIds.includes(trainerId)) {
            const index = trainerIds.indexOf(trainerId);
            trainerIds.splice(index, 1);
          }
          return { ...item, trainerIds };
        }
        return item;
      }),
    );
  };

  // Drag and drop handlers
  const handleDragStart = (item: WeeklyTrainingItem) => {
    setDraggedItem(item);
  };

  const handleDragOver = (day: string, e: React.DragEvent) => {
    if (!draggedItem) return;
    e.preventDefault();
    setDragOverDay(day);
  };

  const handleDrop = (day: string, e: React.DragEvent, locationId?: string) => {
    if (!draggedItem) return;
    e.preventDefault();

    // Update the day and location of the dragged item
    const updatedItem = {
      ...draggedItem,
      day,
      ...(locationId && { locationId }),
    };

    // Update the schedule
    const updatedSchedule = schedule.map((item) =>
      item.id === draggedItem.id ? updatedItem : item,
    );

    setSchedule(updatedSchedule);
    setDraggedItem(null);
    setDragOverDay(null);

    const locationName =
      locationId === "1"
        ? "Campo Principale"
        : locationId === "2"
          ? "Campo Secondario"
          : "";
    const message = locationId
      ? `Allenamento spostato a ${day} - ${locationName}`
      : `Allenamento spostato a ${day}`;

    showToast("success", message);
  };

  const handleDragEnd = () => {
    setDraggedItem(null);
    setDragOverDay(null);
  };

  // Save schedule to database
  const saveScheduleToDatabase = async (
    scheduleToSave: WeeklyTrainingItem[],
  ) => {
    if (!user || !activeClub) {
      throw new Error("User or club not found");
    }

    try {
      // Save directly to clubs table
      const { error } = await supabase
        .from("clubs")
        .update({ trainings: scheduleToSave })
        .eq("id", activeClub.id);

      if (error) {
        console.error("Error saving training schedule:", error);
        throw error;
      }
    } catch (error) {
      console.error("Error saving training schedule:", error);
      throw error;
    }
  };

  // Funzione per il salvataggio automatico
  const autoSave = React.useCallback(() => {
    // Always allow saving, even with empty schedule
    onSave(schedule);

    // Only validate if there are items in the schedule
    if (schedule.length > 0) {
      // Verifica che tutti gli allenamenti abbiano i campi obbligatori compilati
      let invalidItems = [];
      for (const item of schedule) {
        const errors = [];

        // Controlli più precisi per i campi obbligatori
        if (!item.day || item.day.trim() === "") errors.push("giorno");
        if (!item.startTime || item.startTime.trim() === "")
          errors.push("orario di inizio");
        if (!item.endTime || item.endTime.trim() === "")
          errors.push("orario di fine");
        if (!item.categoryId || item.categoryId.trim() === "")
          errors.push("categoria");
        if (!item.locationId || item.locationId.trim() === "")
          errors.push("luogo");
        if (
          !item.trainerIds ||
          !Array.isArray(item.trainerIds) ||
          item.trainerIds.length === 0 ||
          item.trainerIds.every((id) => !id || id.trim() === "")
        )
          errors.push("almeno un allenatore");

        if (errors.length > 0) {
          invalidItems.push({ id: item.id, errors });
        }
      }

      // Only save to database if all items are valid or schedule is empty
      if (invalidItems.length === 0) {
        saveScheduleToDatabase(schedule).catch((error) => {
          console.error("Auto-save failed:", error);
        });
      }
    } else {
      // Save empty schedule to database
      saveScheduleToDatabase(schedule).catch((error) => {
        console.error("Auto-save failed:", error);
      });
    }
  }, [schedule, onSave, user, activeClub]);

  // Effetto per il salvataggio automatico
  React.useEffect(() => {
    const timer = setTimeout(() => {
      autoSave();
    }, 3000); // Salva automaticamente dopo 3 secondi dall'ultima modifica

    return () => clearTimeout(timer);
  }, [schedule, autoSave]);

  const handleSave = async () => {
    // Always allow saving, even with empty schedule
    try {
      // Only validate if there are items in the schedule
      if (schedule.length > 0) {
        // Verifica che tutti gli allenamenti abbiano i campi obbligatori compilati
        let invalidItems = [];
        for (const item of schedule) {
          const errors = [];

          // Controlli più precisi per i campi obbligatori
          if (!item.day || item.day.trim() === "") errors.push("giorno");
          if (!item.startTime || item.startTime.trim() === "")
            errors.push("orario di inizio");
          if (!item.endTime || item.endTime.trim() === "")
            errors.push("orario di fine");
          if (!item.categoryId || item.categoryId.trim() === "")
            errors.push("categoria");
          if (!item.locationId || item.locationId.trim() === "")
            errors.push("luogo");
          if (
            !item.trainerIds ||
            !Array.isArray(item.trainerIds) ||
            item.trainerIds.length === 0 ||
            item.trainerIds.every((id) => !id || id.trim() === "")
          )
            errors.push("almeno un allenatore");

          if (errors.length > 0) {
            invalidItems.push({ id: item.id, errors });
          }
        }

        if (invalidItems.length > 0) {
          // Log per debug
          console.log("Validation errors found:", invalidItems);
          console.log("Current schedule:", schedule);

          // Highlight the invalid items in the UI
          invalidItems.forEach((item) => {
            const element = document.getElementById(`training-${item.id}`);
            if (element) {
              element.classList.add("border-red-500");
              setTimeout(() => {
                element.classList.remove("border-red-500");
              }, 3000);
            }
          });

          showToast(
            "error",
            `Compila tutti i campi per ogni allenamento e seleziona almeno un allenatore. Mancano: ${invalidItems.map((item) => item.errors.join(", ")).join("; ")}`,
          );
          return;
        }
      }

      // Save to database and local callback
      await saveScheduleToDatabase(schedule);
      await onSave(schedule);
      showToast("success", "Programma settimanale salvato con successo");
    } catch (error) {
      console.error("Error saving schedule:", error);
      showToast("error", "Errore durante il salvataggio del programma");
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Programma Settimanale Allenamenti</CardTitle>
          <div className="flex mt-2 space-x-2">
            <Button
              variant={activeView === "calendar" ? "default" : "outline"}
              size="sm"
              onClick={() => setActiveView("calendar")}
              className={
                activeView === "calendar" ? "bg-blue-600 hover:bg-blue-700" : ""
              }
            >
              <Calendar className="h-4 w-4 mr-2" />
              Vista Calendario
            </Button>
            <Button
              variant={activeView === "list" ? "default" : "outline"}
              size="sm"
              onClick={() => setActiveView("list")}
              className={
                activeView === "list" ? "bg-blue-600 hover:bg-blue-700" : ""
              }
            >
              <ListTodo className="h-4 w-4 mr-2" />
              Vista Lista
            </Button>
          </div>
        </div>
        <Button
          onClick={handleAddTraining}
          className="bg-blue-600 hover:bg-blue-700"
        >
          <Plus className="h-4 w-4 mr-2" />
          Aggiungi Allenamento
        </Button>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {schedule.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              Nessun allenamento programmato. Aggiungi il primo allenamento
              settimanale.
            </div>
          ) : activeView === "list" ? (
            <div className="space-y-4">
              {schedule.map((training) => (
                <div
                  id={`training-${training.id}`}
                  key={training.id}
                  className="grid grid-cols-1 md:grid-cols-7 gap-4 p-4 border rounded-lg"
                  draggable
                  onDragStart={() => handleDragStart(training)}
                  onDragEnd={handleDragEnd}
                >
                  <div>
                    <Label
                      htmlFor={`day-${training.id}`}
                      className="flex items-center gap-1"
                    >
                      <Move className="h-3.5 w-3.5 text-gray-400 cursor-move" />
                      Giorno
                    </Label>
                    <select
                      id={`day-${training.id}`}
                      value={training.day}
                      onChange={(e) =>
                        handleChange(training.id, "day", e.target.value)
                      }
                      className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
                    >
                      {DAYS_OF_WEEK.map((day) => (
                        <option key={day} value={day}>
                          {day}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <Label htmlFor={`startTime-${training.id}`}>Inizio</Label>
                    <Input
                      id={`startTime-${training.id}`}
                      type="time"
                      value={training.startTime}
                      onChange={(e) =>
                        handleChange(training.id, "startTime", e.target.value)
                      }
                    />
                  </div>

                  <div>
                    <Label htmlFor={`endTime-${training.id}`}>Fine</Label>
                    <Input
                      id={`endTime-${training.id}`}
                      type="time"
                      value={training.endTime}
                      onChange={(e) =>
                        handleChange(training.id, "endTime", e.target.value)
                      }
                    />
                  </div>

                  <div>
                    <Label htmlFor={`category-${training.id}`}>Categoria</Label>
                    <select
                      id={`category-${training.id}`}
                      value={training.categoryId}
                      onChange={(e) =>
                        handleChange(training.id, "categoryId", e.target.value)
                      }
                      className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
                    >
                      <option value="" disabled>
                        Seleziona categoria
                      </option>
                      {categories.map((category) => (
                        <option key={category.id} value={category.id}>
                          {category.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <Label htmlFor={`trainers-${training.id}`}>
                      Allenatori
                    </Label>
                    <div className="mt-2 space-y-2 max-h-32 overflow-y-auto border rounded-md p-2">
                      {trainers.map((trainer) => (
                        <div
                          key={trainer.id}
                          className="flex items-center space-x-2"
                        >
                          <input
                            type="checkbox"
                            id={`trainer-${training.id}-${trainer.id}`}
                            checked={
                              training.trainerIds?.includes(trainer.id) || false
                            }
                            onChange={(e) =>
                              handleTrainerChange(
                                training.id,
                                trainer.id,
                                e.target.checked,
                              )
                            }
                            className="h-3.5 w-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          />
                          <Label
                            htmlFor={`trainer-${training.id}-${trainer.id}`}
                            className="text-sm"
                          >
                            {trainer.name}
                          </Label>
                        </div>
                      ))}
                    </div>
                    {(!training.trainerIds ||
                      training.trainerIds.length === 0) && (
                      <p className="text-xs text-amber-500 mt-1">
                        Seleziona almeno un allenatore
                      </p>
                    )}
                  </div>

                  <div>
                    <Label htmlFor={`location-${training.id}`}>Luogo</Label>
                    <select
                      id={`location-${training.id}`}
                      value={training.locationId}
                      onChange={(e) =>
                        handleChange(training.id, "locationId", e.target.value)
                      }
                      className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
                    >
                      <option value="" disabled>
                        Seleziona luogo
                      </option>
                      {locations.map((location) => (
                        <option key={location.id} value={location.id}>
                          {location.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex items-end">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRemoveTraining(training.id)}
                      className="text-red-500 hover:text-red-700 hover:bg-red-50"
                    >
                      <Trash2 className="h-5 w-5" />
                    </Button>
                  </div>
                </div>
              ))}

              <div className="flex justify-end mt-6">
                <Button
                  onClick={handleSave}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  <Save className="h-4 w-4 mr-2" />
                  Salva Programma
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Campo Principale */}
                <div className="border rounded-lg p-4">
                  <h3 className="font-medium mb-4">Campo Principale</h3>
                  <div className="space-y-4">
                    {DAYS_OF_WEEK.map((day) => {
                      const dayTrainings = schedule.filter(
                        (t) =>
                          t.day === day &&
                          t.locationId === (locations[0]?.id || "1"),
                      );
                      return (
                        <div
                          key={day}
                          className={`border-b pb-3 last:border-b-0 ${dragOverDay === day ? "bg-blue-50 rounded-md" : ""}`}
                          onDragOver={(e) => handleDragOver(day, e)}
                          onDrop={(e) => handleDrop(day, e, "1")}
                          onDragLeave={() => setDragOverDay(null)}
                        >
                          <h4 className="font-medium text-sm mb-2">{day}</h4>
                          {dayTrainings.length > 0 ? (
                            <div className="space-y-2">
                              {dayTrainings.map((training) => {
                                const category = categories.find(
                                  (c) => c.id === training.categoryId,
                                );
                                const trainerNames = training.trainerIds
                                  ?.map(
                                    (id) =>
                                      trainers.find((t) => t.id === id)?.name,
                                  )
                                  .filter(Boolean)
                                  .join(", ");
                                return (
                                  <div
                                    key={training.id}
                                    className={`bg-blue-50 p-2 rounded-md flex justify-between items-center ${draggedItem?.id === training.id ? "opacity-50 border-dashed border-2" : ""}`}
                                    draggable
                                    onDragStart={() =>
                                      handleDragStart(training)
                                    }
                                    onDragEnd={handleDragEnd}
                                  >
                                    <div className="flex-1">
                                      <div className="flex items-center gap-1">
                                        <Move className="h-3.5 w-3.5 text-gray-400 cursor-move" />
                                        <div className="font-medium">
                                          {category?.name || "Categoria"}
                                        </div>
                                      </div>
                                      <div className="text-xs text-muted-foreground">
                                        {training.startTime} -{" "}
                                        {training.endTime} • {trainerNames}
                                      </div>
                                    </div>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() =>
                                        handleRemoveTraining(training.id)
                                      }
                                      className="text-red-500 hover:text-red-700 hover:bg-red-50 h-8 w-8"
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <div className="text-sm text-muted-foreground">
                              Nessun allenamento
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Campo Secondario */}
                <div className="border rounded-lg p-4">
                  <h3 className="font-medium mb-4">Campo Secondario</h3>
                  <div className="space-y-4">
                    {DAYS_OF_WEEK.map((day) => {
                      const dayTrainings = schedule.filter(
                        (t) =>
                          t.day === day &&
                          t.locationId === (locations[1]?.id || "2"),
                      );
                      return (
                        <div
                          key={day}
                          className={`border-b pb-3 last:border-b-0 ${dragOverDay === day ? "bg-green-50 rounded-md" : ""}`}
                          onDragOver={(e) => handleDragOver(day, e)}
                          onDrop={(e) => handleDrop(day, e, "2")}
                          onDragLeave={() => setDragOverDay(null)}
                        >
                          <h4 className="font-medium text-sm mb-2">{day}</h4>
                          {dayTrainings.length > 0 ? (
                            <div className="space-y-2">
                              {dayTrainings.map((training) => {
                                const category = categories.find(
                                  (c) => c.id === training.categoryId,
                                );
                                const trainerNames = training.trainerIds
                                  ?.map(
                                    (id) =>
                                      trainers.find((t) => t.id === id)?.name,
                                  )
                                  .filter(Boolean)
                                  .join(", ");
                                return (
                                  <div
                                    key={training.id}
                                    className={`bg-green-50 p-2 rounded-md flex justify-between items-center ${draggedItem?.id === training.id ? "opacity-50 border-dashed border-2" : ""}`}
                                    draggable
                                    onDragStart={() =>
                                      handleDragStart(training)
                                    }
                                    onDragEnd={handleDragEnd}
                                  >
                                    <div className="flex-1">
                                      <div className="flex items-center gap-1">
                                        <Move className="h-3.5 w-3.5 text-gray-400 cursor-move" />
                                        <div className="font-medium">
                                          {category?.name || "Categoria"}
                                        </div>
                                      </div>
                                      <div className="text-xs text-muted-foreground">
                                        {training.startTime} -{" "}
                                        {training.endTime} • {trainerNames}
                                      </div>
                                    </div>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() =>
                                        handleRemoveTraining(training.id)
                                      }
                                      className="text-red-500 hover:text-red-700 hover:bg-red-50 h-8 w-8"
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <div className="text-sm text-muted-foreground">
                              Nessun allenamento
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="flex justify-end mt-6">
                <Button
                  onClick={handleSave}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  <Save className="h-4 w-4 mr-2" />
                  Salva Programma
                </Button>
              </div>
            </div>
          )}
        </div>
      </CardContent>

      {/* Add Training Modal */}
      <Dialog
        open={showAddTrainingModal}
        onOpenChange={setShowAddTrainingModal}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Aggiungi Nuovo Allenamento</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="day" className="text-right">
                Giorno
              </Label>
              <select
                id="day"
                value={newTraining.day}
                onChange={(e) =>
                  setNewTraining({ ...newTraining, day: e.target.value })
                }
                className="col-span-3 h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
              >
                {DAYS_OF_WEEK.map((day) => (
                  <option key={day} value={day}>
                    {day}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="startTime" className="text-right">
                Inizio
              </Label>
              <Input
                id="startTime"
                type="time"
                value={newTraining.startTime}
                onChange={(e) =>
                  setNewTraining({ ...newTraining, startTime: e.target.value })
                }
                className="col-span-3"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="endTime" className="text-right">
                Fine
              </Label>
              <Input
                id="endTime"
                type="time"
                value={newTraining.endTime}
                onChange={(e) =>
                  setNewTraining({ ...newTraining, endTime: e.target.value })
                }
                className="col-span-3"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="category" className="text-right">
                Categoria
              </Label>
              <select
                id="category"
                value={newTraining.categoryId}
                onChange={(e) =>
                  setNewTraining({ ...newTraining, categoryId: e.target.value })
                }
                className="col-span-3 h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
              >
                <option value="" disabled>
                  Seleziona categoria
                </option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-4 items-start gap-4">
              <Label htmlFor="trainers" className="text-right pt-2">
                Allenatori
              </Label>
              <div className="col-span-3 space-y-2 max-h-32 overflow-y-auto border rounded-md p-2">
                {trainers.map((trainer) => {
                  const isSelected = newTraining.trainerIds?.includes(
                    trainer.id,
                  );
                  return (
                    <div
                      key={trainer.id}
                      className="flex items-center space-x-2"
                    >
                      <input
                        type="checkbox"
                        id={`new-trainer-${trainer.id}`}
                        checked={isSelected}
                        onChange={(e) => {
                          const trainerIds = [
                            ...(newTraining.trainerIds || []),
                          ];
                          if (e.target.checked && !isSelected) {
                            trainerIds.push(trainer.id);
                          } else if (!e.target.checked && isSelected) {
                            const index = trainerIds.indexOf(trainer.id);
                            trainerIds.splice(index, 1);
                          }
                          setNewTraining({ ...newTraining, trainerIds });
                        }}
                        className="h-3.5 w-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <Label
                        htmlFor={`new-trainer-${trainer.id}`}
                        className="text-sm"
                      >
                        {trainer.name}
                      </Label>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="location" className="text-right">
                Luogo
              </Label>
              <select
                id="location"
                value={newTraining.locationId}
                onChange={(e) =>
                  setNewTraining({ ...newTraining, locationId: e.target.value })
                }
                className="col-span-3 h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
              >
                <option value="" disabled>
                  Seleziona luogo
                </option>
                {locations.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowAddTrainingModal(false)}
            >
              Annulla
            </Button>
            <Button
              onClick={handleAddTrainingSubmit}
              className="bg-blue-600 hover:bg-blue-700"
            >
              Aggiungi
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
