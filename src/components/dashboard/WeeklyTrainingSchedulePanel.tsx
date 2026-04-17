"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast-notification";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/components/providers/AuthProvider";
import {
  getClubWeeklySchedule,
  updateClubData,
} from "@/lib/simplified-db";
import {
  resolveCategoryId,
  resolveCategoryLabel,
} from "@/lib/category-utils";
import {
  findTrainingLocationOption,
  getFallbackTrainingLocationOptions,
  getStructureFieldOptions,
  type TrainingLocationOption,
} from "@/lib/training-location-options";
import { getAssociatedTrainerIds } from "@/lib/trainer-utils";
import {
  findScheduleConflicts,
  isValidTimeRange,
  resolveCategoryLabelForTraining,
  resolveTrainingWeekday,
} from "@/lib/training-utils";
import { TrainingScheduleAutomationPanel } from "@/components/trainer/TrainingScheduleAutomationPanel";
import {
  Pencil,
  Plus,
  Save,
  Sparkles,
  Trash2,
} from "lucide-react";

type CategoryOption = { id: string; name: string };
type TrainerOption = { id: string; name: string; categories?: any[] };

export interface WeeklyTrainingItem {
  id: string;
  day: string;
  startTime: string;
  endTime: string;
  categoryId: string;
  categoryName?: string | null;
  trainerIds: string[];
  structureId: string;
  locationId: string;
  location?: string | null;
}

interface WeeklyTrainingSchedulePanelProps {
  categories: CategoryOption[];
  trainers: TrainerOption[];
  locations: TrainingLocationOption[];
  onSave: (schedule: WeeklyTrainingItem[]) => void | Promise<void>;
  initialSchedule?: WeeklyTrainingItem[];
  autoSave?: boolean;
  allowDragDrop?: boolean;
  onTrainingsGenerated?: () => void;
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

const createScheduleId = () =>
  `weekly-training-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const normalizeDay = (value?: string | null) => {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  const match = DAYS_OF_WEEK.find(
    (day) =>
      day
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "") === normalized,
  );
  return match || DAYS_OF_WEEK[0];
};

const groupLocationsByStructure = (locations: TrainingLocationOption[]) => {
  const groups = new Map<
    string,
    { structureId: string; structureName: string; fields: TrainingLocationOption[] }
  >();

  locations.forEach((location) => {
    if (!groups.has(location.structureId)) {
      groups.set(location.structureId, {
        structureId: location.structureId,
        structureName: location.structureName,
        fields: [],
      });
    }

    groups.get(location.structureId)?.fields.push(location);
  });

  return Array.from(groups.values());
};

export function WeeklyTrainingSchedule({
  categories = [],
  trainers = [],
  locations = [],
  onSave,
  initialSchedule = [],
  autoSave = true,
  allowDragDrop = true,
  onTrainingsGenerated = () => {},
}: WeeklyTrainingSchedulePanelProps) {
  const { showToast } = useToast();
  const { activeClub } = useAuth();
  const [schedule, setSchedule] = React.useState<WeeklyTrainingItem[]>([]);
  const [loaded, setLoaded] = React.useState(false);
  const [showAutomation, setShowAutomation] = React.useState(false);
  const [draggedItemId, setDraggedItemId] = React.useState<string | null>(null);
  const [showAddDialog, setShowAddDialog] = React.useState(false);
  const [showEditDialog, setShowEditDialog] = React.useState(false);
  const [editingTraining, setEditingTraining] =
    React.useState<WeeklyTrainingItem | null>(null);
  const [saving, setSaving] = React.useState(false);
  const lastPersistedScheduleRef = React.useRef("[]");
  const defaultCategoryId = categories[0]?.id || "";
  const [newTraining, setNewTraining] = React.useState<WeeklyTrainingItem>({
    id: "",
    day: DAYS_OF_WEEK[0],
    startTime: "18:00",
    endTime: "19:30",
    categoryId: defaultCategoryId,
    categoryName: categories[0]?.name || null,
    trainerIds: defaultCategoryId
      ? getAssociatedTrainerIds(trainers, [defaultCategoryId], categories)
      : [],
    structureId: "",
    locationId: "",
    location: null,
  });

  const effectiveLocations = React.useMemo(() => {
    const base =
      Array.isArray(locations) && locations.length > 0
        ? locations
        : getFallbackTrainingLocationOptions();
    return base;
  }, [locations]);

  const groupedLocations = React.useMemo(
    () => groupLocationsByStructure(effectiveLocations),
    [effectiveLocations],
  );

  const getAutoTrainerIdsForCategory = React.useCallback(
    (categoryId: string) =>
      categoryId
        ? getAssociatedTrainerIds(trainers, [categoryId], categories)
        : [],
    [trainers, categories],
  );

  const syncTrainerIdsForCategory = React.useCallback(
    (
      currentTrainerIds: string[],
      previousCategoryId: string,
      nextCategoryId: string,
    ) => {
      const previousAutoTrainerIds = new Set(
        getAutoTrainerIdsForCategory(previousCategoryId),
      );
      const manualTrainerIds = (currentTrainerIds || []).filter(
        (trainerId) => !previousAutoTrainerIds.has(trainerId),
      );

      return Array.from(
        new Set([
          ...getAutoTrainerIdsForCategory(nextCategoryId),
          ...manualTrainerIds,
        ]),
      );
    },
    [getAutoTrainerIdsForCategory],
  );

  const resetNewTraining = React.useCallback(() => {
    const firstStructure = groupedLocations[0];
    const firstField = firstStructure?.fields?.[0];

    setNewTraining({
      id: createScheduleId(),
      day: DAYS_OF_WEEK[0],
      startTime: "18:00",
      endTime: "19:30",
      categoryId: categories[0]?.id || "",
      categoryName: categories[0]?.name || null,
      trainerIds:
        categories[0]?.id
          ? getAutoTrainerIdsForCategory(categories[0].id)
          : [],
      structureId: firstStructure?.structureId || "",
      locationId: firstField?.fieldId || "",
      location: firstField?.name || null,
    });
  }, [categories, getAutoTrainerIdsForCategory, groupedLocations]);

  const normalizeScheduleItem = React.useCallback(
    (item: any): WeeklyTrainingItem => {
      const resolvedDay = normalizeDay(resolveTrainingWeekday(item) || item?.day);
      const matchedLocation = findTrainingLocationOption(effectiveLocations, {
        structureId: item?.structureId,
        fieldId: item?.locationId,
        locationId: item?.locationId,
        location: item?.location,
      });
      const hasKnownStructure = groupedLocations.some(
        (structure) =>
          structure.structureId === String(item?.structureId || "").trim(),
      );
      const resolvedStructureId =
        matchedLocation?.structureId ||
        (hasKnownStructure
          ? String(item?.structureId || "").trim()
          : groupedLocations[0]?.structureId || "");
      const structureFields = getStructureFieldOptions(
        effectiveLocations,
        resolvedStructureId,
      );
      const rawLocationId = String(
        item?.locationId || item?.location_id || "",
      ).trim();
      const hasKnownField = structureFields.some(
        (field) => field.id === rawLocationId,
      );
      const resolvedLocationId =
        matchedLocation?.fieldId ||
        (hasKnownField ? rawLocationId : structureFields[0]?.id || "");
      const resolvedCategoryId =
        resolveCategoryId(
          item?.categoryId ||
            item?.category_id ||
            item?.category?.id ||
            item?.category?.name ||
            item?.categoryName ||
            item?.category_name ||
            item?.category,
          categories,
        ) || String(item?.categoryId || item?.category_id || "").trim();
      const resolvedCategoryName =
        (resolvedCategoryId
          ? categories.find((category) => category.id === resolvedCategoryId)?.name
          : null) ||
        resolveCategoryLabelForTraining(item, categories) ||
        null;

      return {
        id: String(item?.id || createScheduleId()),
        day: resolvedDay,
        startTime: String(
          item?.startTime || item?.start_time || item?.time || "18:00",
        ).slice(0, 5),
        endTime: String(item?.endTime || item?.end_time || "19:30").slice(
          0,
          5,
        ),
        categoryId: resolvedCategoryId || String(categories[0]?.id || ""),
        categoryName:
          resolvedCategoryName ||
          categories.find((category) => category.id === resolvedCategoryId)?.name ||
          null,
        trainerIds: Array.isArray(item?.trainerIds)
          ? item.trainerIds.filter(Boolean).map(String)
          : Array.isArray(item?.trainers)
            ? item.trainers.filter(Boolean).map(String)
            : [],
        structureId: resolvedStructureId,
        locationId: resolvedLocationId,
        location:
          matchedLocation?.name || String(item?.location || item?.fieldName || "").trim() || null,
      };
    },
    [categories, effectiveLocations, groupedLocations],
  );

  const buildScheduleSnapshot = React.useCallback(
    (items: WeeklyTrainingItem[]) =>
      JSON.stringify(
        (Array.isArray(items) ? items : []).map((item) => ({
          id: item.id,
          day: item.day,
          startTime: item.startTime,
          endTime: item.endTime,
          categoryId: item.categoryId,
          categoryName: item.categoryName || null,
          trainerIds: [...(item.trainerIds || [])].sort(),
          structureId: item.structureId,
          locationId: item.locationId,
          location: item.location || null,
        })),
      ),
    [],
  );

  React.useEffect(() => {
    if (!activeClub?.id) {
      setSchedule([]);
      lastPersistedScheduleRef.current = "[]";
      setLoaded(true);
      return;
    }

    const loadSchedule = async () => {
      try {
        const savedSchedule =
          Array.isArray(initialSchedule) && initialSchedule.length > 0
            ? initialSchedule
            : await getClubWeeklySchedule(activeClub.id);
        const normalizedSchedule = savedSchedule.map(normalizeScheduleItem);

        setSchedule(normalizedSchedule);
        lastPersistedScheduleRef.current =
          buildScheduleSnapshot(normalizedSchedule);
      } catch (error) {
        console.error("Error loading weekly schedule:", error);
        const normalizedFallback = initialSchedule.map(normalizeScheduleItem);
        setSchedule(normalizedFallback);
        lastPersistedScheduleRef.current =
          buildScheduleSnapshot(normalizedFallback);
      } finally {
        setLoaded(true);
      }
    };

    loadSchedule();
  }, [
    activeClub?.id,
    buildScheduleSnapshot,
    initialSchedule,
    normalizeScheduleItem,
  ]);

  React.useEffect(() => {
    if (showAddDialog) {
      resetNewTraining();
    }
  }, [resetNewTraining, showAddDialog]);

  const persistSchedule = React.useCallback(
    async (nextSchedule: WeeklyTrainingItem[], notify = false) => {
      if (!activeClub?.id) {
        return;
      }

      setSaving(true);
      try {
        await updateClubData(activeClub.id, "weekly_schedule", nextSchedule);
        lastPersistedScheduleRef.current =
          buildScheduleSnapshot(nextSchedule);
        await onSave(nextSchedule);
        if (notify) {
          showToast("success", "Programma settimanale salvato con successo");
        }
      } catch (error) {
        console.error("Error saving weekly schedule:", error);
        showToast("error", "Errore durante il salvataggio del programma");
      } finally {
        setSaving(false);
      }
    },
    [activeClub?.id, buildScheduleSnapshot, onSave, showToast],
  );

  React.useEffect(() => {
    if (!autoSave || !loaded) {
      return;
    }

    if (buildScheduleSnapshot(schedule) === lastPersistedScheduleRef.current) {
      return;
    }

    const timer = setTimeout(() => {
      persistSchedule(schedule, false);
    }, 1200);

    return () => clearTimeout(timer);
  }, [autoSave, buildScheduleSnapshot, loaded, persistSchedule, schedule]);

  const hydrateStructureAndField = React.useCallback(
    (item: WeeklyTrainingItem) => {
      const next = { ...item };

      if (next.structureId) {
        const availableFields = getStructureFieldOptions(
          effectiveLocations,
          next.structureId,
        );
        if (
          !next.locationId ||
          !availableFields.some((field) => field.id === next.locationId)
        ) {
          next.locationId = availableFields[0]?.id || "";
        }

        next.location =
          availableFields.find((field) => field.id === next.locationId)?.name ||
          next.location ||
          null;
      }

      return next;
    },
    [effectiveLocations],
  );

  const buildConflictMessage = React.useCallback(
    (item: WeeklyTrainingItem, ignoreId?: string) => {
      const conflicts = findScheduleConflicts(schedule, item, { ignoreId });

      if (!conflicts.length) {
        return null;
      }

      const locationName = getLocationName(item);
      const dayLabel = item.day || "giorno selezionato";
      const conflictsLabel = conflicts
        .map(
          (conflict) =>
            `${getCategoryName(conflict)} (${conflict.startTime}-${conflict.endTime})`,
        )
        .join(", ");

      return `Attenzione: nel ${locationName} di ${dayLabel} esistono già altri allenamenti nella stessa fascia oraria: ${conflictsLabel}. Vuoi comunque continuare?`;
    },
    [schedule],
  );

  const toggleTrainer = (itemId: string, trainerId: string, checked: boolean) => {
    setSchedule((current) =>
      current.map((item) => {
        if (item.id !== itemId) {
          return item;
        }

        const trainerIds = new Set(item.trainerIds || []);
        if (checked) {
          trainerIds.add(trainerId);
        } else {
          trainerIds.delete(trainerId);
        }

        return {
          ...item,
          trainerIds: Array.from(trainerIds),
        };
      }),
    );
  };

  const removeScheduleItem = (itemId: string) => {
    setSchedule((current) => current.filter((item) => item.id !== itemId));
  };

  const addScheduleItem = () => {
    const normalizedNewTraining = hydrateStructureAndField(
      normalizeScheduleItem(newTraining),
    );

    if (
      !normalizedNewTraining.categoryId ||
      !normalizedNewTraining.structureId ||
      !normalizedNewTraining.locationId ||
      !normalizedNewTraining.trainerIds.length
    ) {
      showToast("error", "Compila tutti i campi del nuovo allenamento");
      return;
    }

    if (
      !isValidTimeRange(
        normalizedNewTraining.startTime,
        normalizedNewTraining.endTime,
      )
    ) {
      showToast(
        "error",
        "L'orario di fine deve essere successivo all'orario di inizio",
      );
      return;
    }

    const conflictMessage = buildConflictMessage(normalizedNewTraining);
    if (conflictMessage && !window.confirm(conflictMessage)) {
      return;
    }

    setSchedule((current) => [...current, normalizedNewTraining]);
    setShowAddDialog(false);
  };

  const openEditDialog = (item: WeeklyTrainingItem) => {
    setEditingTraining({ ...item });
    setShowEditDialog(true);
  };

  const saveEditedTraining = () => {
    if (!editingTraining) {
      return;
    }

    const normalizedEditingTraining = hydrateStructureAndField(
      normalizeScheduleItem(editingTraining),
    );

    if (
      !normalizedEditingTraining.categoryId ||
      !normalizedEditingTraining.structureId ||
      !normalizedEditingTraining.locationId ||
      !normalizedEditingTraining.trainerIds.length
    ) {
      showToast("error", "Compila tutti i campi dell'allenamento");
      return;
    }

    if (
      !isValidTimeRange(
        normalizedEditingTraining.startTime,
        normalizedEditingTraining.endTime,
      )
    ) {
      showToast(
        "error",
        "L'orario di fine deve essere successivo all'orario di inizio",
      );
      return;
    }

    const conflictMessage = buildConflictMessage(
      normalizedEditingTraining,
      normalizedEditingTraining.id,
    );
    if (conflictMessage && !window.confirm(conflictMessage)) {
      return;
    }

    setSchedule((current) =>
      current.map((item) =>
        item.id === normalizedEditingTraining.id ? normalizedEditingTraining : item,
      ),
    );
    setShowEditDialog(false);
    setEditingTraining(null);
  };

  const moveScheduleItem = (
    itemId: string,
    day: string,
    structureId: string,
    locationId: string,
  ) => {
    const currentItem = schedule.find((item) => item.id === itemId);
    if (!currentItem) {
      return;
    }

    const nextItem = hydrateStructureAndField({
      ...currentItem,
      day,
      structureId,
      locationId,
    });
    const conflictMessage = buildConflictMessage(nextItem, itemId);

    if (conflictMessage && !window.confirm(conflictMessage)) {
      return;
    }

    setSchedule((current) =>
      current.map((item) => (item.id === itemId ? nextItem : item)),
    );
  };

  const getCategoryName = (item: Partial<WeeklyTrainingItem> | string) => {
    if (typeof item === "string") {
      return resolveCategoryLabel(item, categories);
    }

    return (
      categories.find((category) => category.id === item.categoryId)?.name ||
      item.categoryName ||
      resolveCategoryLabel(item.categoryId || "", categories)
    );
  };

  const getTrainerNames = (trainerIds: string[]) =>
    trainerIds
      .map((trainerId) => trainers.find((trainer) => trainer.id === trainerId)?.name)
      .filter(Boolean)
      .join(", ");

  const getLocationName = (item: WeeklyTrainingItem) =>
    findTrainingLocationOption(effectiveLocations, {
      structureId: item.structureId,
      fieldId: item.locationId,
      locationId: item.locationId,
    })?.name || "Campo";

  const canDrag = allowDragDrop;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            onClick={() => setShowAutomation((current) => !current)}
          >
            <Sparkles className="mr-2 h-4 w-4" />
            {showAutomation ? "Nascondi automazione" : "Assistente Automazione"}
          </Button>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() => persistSchedule(schedule, true)}
            disabled={saving}
          >
            <Save className="mr-2 h-4 w-4" />
            {saving ? "Salvataggio..." : "Salva"}
          </Button>
          <Button
            onClick={() => setShowAddDialog(true)}
            className="bg-blue-600 hover:bg-blue-700"
          >
            <Plus className="mr-2 h-4 w-4" />
            Aggiungi Allenamento
          </Button>
        </div>
      </div>

      {showAutomation && (
        <TrainingScheduleAutomationPanel
          weeklySchedule={schedule}
          onGenerateTrainings={onTrainingsGenerated}
        />
      )}

      {schedule.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center text-sm text-slate-500">
          Nessun allenamento nel programma settimanale. Aggiungi la prima
          sessione e poi usa l&apos;automazione per creare gli allenamenti reali.
        </div>
      ) : (
        <div className="space-y-5">
          {groupedLocations.map((structure) => (
            <div key={structure.structureId} className="rounded-2xl border bg-white p-4 shadow-sm">
              <div className="mb-4">
                <h3 className="text-lg font-semibold text-slate-900">
                  {structure.structureName}
                </h3>
                <p className="text-sm text-slate-500">
                  Ogni campo della struttura ha la propria colonna operativa.
                </p>
              </div>

              <div className="grid gap-4 xl:grid-cols-2 2xl:grid-cols-3">
                {structure.fields.map((field) => (
                  <div
                    key={field.fieldId}
                    className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
                  >
                    <div className="mb-3 rounded-xl bg-white px-3 py-2 shadow-sm">
                      <p className="text-sm font-semibold text-slate-900">
                        {field.fieldName}
                      </p>
                    </div>

                    <div className="space-y-3">
                      {DAYS_OF_WEEK.map((day) => {
                        const dayItems = schedule.filter(
                          (item) =>
                            item.day === day &&
                            item.structureId === structure.structureId &&
                            item.locationId === field.fieldId,
                        );

                        return (
                          <div
                            key={`${field.fieldId}-${day}`}
                            className="rounded-xl border bg-white p-3"
                            onDragOver={(event) => {
                              if (!allowDragDrop) {
                                return;
                              }
                              event.preventDefault();
                            }}
                            onDrop={() => {
                              if (!canDrag || !draggedItemId) {
                                return;
                              }

                              moveScheduleItem(
                                draggedItemId,
                                day,
                                structure.structureId,
                                field.fieldId,
                              );
                              setDraggedItemId(null);
                            }}
                          >
                            <div className="mb-2 flex items-center justify-between">
                              <p className="text-sm font-medium text-slate-700">
                                {day}
                              </p>
                              <span className="text-xs text-slate-400">
                                {dayItems.length} sessioni
                              </span>
                            </div>

                            {dayItems.length === 0 ? (
                              <div className="rounded-lg border border-dashed p-3 text-xs text-slate-400">
                                Nessun allenamento
                              </div>
                            ) : (
                              <div className="space-y-2">
                                {dayItems.map((item) => (
                                  <div
                                    key={item.id}
                                    draggable={canDrag}
                                    onDragStart={() => setDraggedItemId(item.id)}
                                    onDragEnd={() => setDraggedItemId(null)}
                                    className="rounded-xl border border-blue-100 bg-blue-50 p-3"
                                  >
                                    <div className="flex items-start justify-between gap-2">
                                      <div>
                                        <p className="text-sm font-semibold text-slate-900">
                                          {getCategoryName(item)}
                                        </p>
                                        <p className="text-xs text-slate-500">
                                          {item.startTime} - {item.endTime}
                                        </p>
                                        <p className="mt-1 text-xs text-slate-600">
                                          {getTrainerNames(item.trainerIds) || "Allenatore da assegnare"}
                                        </p>
                                      </div>

                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => openEditDialog(item)}
                                        className="h-8 w-8 text-blue-600 hover:bg-blue-50 hover:text-blue-700"
                                      >
                                        <Pencil className="h-4 w-4" />
                                      </Button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Aggiungi Nuovo Allenamento</DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 py-2 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Giorno</Label>
              <select
                value={newTraining.day}
                onChange={(event) =>
                  setNewTraining((current) => ({
                    ...current,
                    day: event.target.value,
                  }))
                }
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                {DAYS_OF_WEEK.map((day) => (
                  <option key={day} value={day}>
                    {day}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label>Categoria</Label>
              <select
                value={newTraining.categoryId}
                disabled={categories.length === 0}
                onChange={(event) =>
                  setNewTraining((current) => ({
                    ...current,
                    categoryId: event.target.value,
                    categoryName:
                      categories.find(
                        (category) => category.id === event.target.value,
                      )?.name || current.categoryName || null,
                    trainerIds: syncTrainerIdsForCategory(
                      current.trainerIds,
                      current.categoryId,
                      event.target.value,
                    ),
                  }))
                }
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="" disabled>
                  {categories.length > 0
                    ? "Seleziona categoria"
                    : "Nessuna categoria disponibile"}
                </option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
              {categories.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  Nessuna categoria registrata per questo club.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Orario inizio</Label>
              <Input
                type="time"
                value={newTraining.startTime}
                onChange={(event) =>
                  setNewTraining((current) => ({
                    ...current,
                    startTime: event.target.value,
                  }))
                }
              />
            </div>

            <div className="space-y-2">
              <Label>Orario fine</Label>
              <Input
                type="time"
                value={newTraining.endTime}
                onChange={(event) =>
                  setNewTraining((current) => ({
                    ...current,
                    endTime: event.target.value,
                  }))
                }
              />
            </div>

            <div className="space-y-2">
              <Label>Struttura</Label>
              <select
                value={newTraining.structureId}
                onChange={(event) => {
                  const nextStructureId = event.target.value;
                  const nextField = getStructureFieldOptions(
                    effectiveLocations,
                    nextStructureId,
                  )[0];
                  setNewTraining((current) => ({
                    ...current,
                    structureId: nextStructureId,
                    locationId: nextField?.id || "",
                    location: nextField?.name || null,
                  }));
                }}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                {groupedLocations.map((structure) => (
                  <option key={structure.structureId} value={structure.structureId}>
                    {structure.structureName}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label>Campo della struttura</Label>
              <select
                value={newTraining.locationId}
                onChange={(event) =>
                  setNewTraining((current) => ({
                    ...current,
                    locationId: event.target.value,
                    location:
                      getStructureFieldOptions(
                        effectiveLocations,
                        current.structureId,
                      ).find((field) => field.id === event.target.value)?.name ||
                      current.location ||
                      null,
                  }))
                }
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                {getStructureFieldOptions(
                  effectiveLocations,
                  newTraining.structureId,
                ).map((field) => (
                  <option key={field.id} value={field.id}>
                    {field.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label>Allenatori</Label>
              <div className="grid gap-2 rounded-xl border p-3 sm:grid-cols-2">
                {trainers.length > 0 ? (
                  trainers.map((trainer) => (
                    <label key={trainer.id} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={newTraining.trainerIds.includes(trainer.id)}
                        onChange={(event) => {
                          const trainerIds = new Set(newTraining.trainerIds);
                          if (event.target.checked) {
                            trainerIds.add(trainer.id);
                          } else {
                            trainerIds.delete(trainer.id);
                          }
                          setNewTraining((current) => ({
                            ...current,
                            trainerIds: Array.from(trainerIds),
                          }));
                        }}
                      />
                      <span>{trainer.name}</span>
                      {getAutoTrainerIdsForCategory(newTraining.categoryId).includes(
                        trainer.id,
                      ) && (
                        <span className="ml-auto text-[11px] font-medium text-blue-600">
                          Associato
                        </span>
                      )}
                    </label>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Nessun allenatore disponibile.
                  </p>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Gli allenatori associati alla categoria selezionata vengono
                inseriti automaticamente. Puoi aggiungerne altri se necessario.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>
              Annulla
            </Button>
            <Button onClick={addScheduleItem} className="bg-blue-600 hover:bg-blue-700">
              Conferma
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={showEditDialog}
        onOpenChange={(open) => {
          setShowEditDialog(open);
          if (!open) {
            setEditingTraining(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Modifica Allenamento Programma</DialogTitle>
          </DialogHeader>

          {editingTraining && (
            <div className="grid gap-4 py-2 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Giorno</Label>
                <select
                  value={editingTraining.day}
                  onChange={(event) =>
                    setEditingTraining((current) =>
                      current
                        ? {
                            ...current,
                            day: event.target.value,
                          }
                        : current,
                    )
                  }
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  {DAYS_OF_WEEK.map((day) => (
                    <option key={day} value={day}>
                      {day}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
              <Label>Categoria</Label>
              <select
                value={editingTraining.categoryId}
                disabled={categories.length === 0}
                onChange={(event) =>
                  setEditingTraining((current) =>
                    current
                      ? {
                            ...current,
                            categoryId: event.target.value,
                            categoryName:
                              categories.find(
                                (category) => category.id === event.target.value,
                              )?.name || current.categoryName || null,
                            trainerIds: syncTrainerIdsForCategory(
                              current.trainerIds,
                              current.categoryId,
                              event.target.value,
                            ),
                          }
                        : current,
                    )
                }
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="" disabled>
                  {categories.length > 0
                    ? "Seleziona categoria"
                    : "Nessuna categoria disponibile"}
                </option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
              {categories.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  Nessuna categoria registrata per questo club.
                </p>
              )}
            </div>

              <div className="space-y-2">
                <Label>Orario inizio</Label>
                <Input
                  type="time"
                  value={editingTraining.startTime}
                  onChange={(event) =>
                    setEditingTraining((current) =>
                      current
                        ? {
                            ...current,
                            startTime: event.target.value,
                          }
                        : current,
                    )
                  }
                />
              </div>

              <div className="space-y-2">
                <Label>Orario fine</Label>
                <Input
                  type="time"
                  value={editingTraining.endTime}
                  onChange={(event) =>
                    setEditingTraining((current) =>
                      current
                        ? {
                            ...current,
                            endTime: event.target.value,
                          }
                        : current,
                    )
                  }
                />
              </div>

              <div className="space-y-2">
                <Label>Struttura</Label>
                <select
                  value={editingTraining.structureId}
                  onChange={(event) => {
                    const nextStructureId = event.target.value;
                    const nextField = getStructureFieldOptions(
                      effectiveLocations,
                      nextStructureId,
                    )[0];
                    setEditingTraining((current) =>
                      current
                      ? {
                            ...current,
                            structureId: nextStructureId,
                            locationId: nextField?.id || "",
                            location: nextField?.name || null,
                          }
                        : current,
                    );
                  }}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  {groupedLocations.map((structure) => (
                    <option key={structure.structureId} value={structure.structureId}>
                      {structure.structureName}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <Label>Campo della struttura</Label>
                <select
                  value={editingTraining.locationId}
                  onChange={(event) =>
                    setEditingTraining((current) =>
                      current
                      ? {
                            ...current,
                            locationId: event.target.value,
                            location:
                              getStructureFieldOptions(
                                effectiveLocations,
                                current.structureId,
                              ).find((field) => field.id === event.target.value)?.name ||
                              current.location ||
                              null,
                          }
                        : current,
                    )
                  }
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  {getStructureFieldOptions(
                    effectiveLocations,
                    editingTraining.structureId,
                  ).map((field) => (
                    <option key={field.id} value={field.id}>
                      {field.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label>Allenatori</Label>
                <div className="grid gap-2 rounded-xl border p-3 sm:grid-cols-2">
                  {trainers.length > 0 ? (
                    trainers.map((trainer) => (
                      <label key={trainer.id} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={editingTraining.trainerIds.includes(trainer.id)}
                          onChange={(event) => {
                            const trainerIds = new Set(editingTraining.trainerIds);
                            if (event.target.checked) {
                              trainerIds.add(trainer.id);
                            } else {
                              trainerIds.delete(trainer.id);
                            }
                            setEditingTraining((current) =>
                              current
                                ? {
                                    ...current,
                                    trainerIds: Array.from(trainerIds),
                                  }
                                : current,
                            );
                          }}
                        />
                        <span>{trainer.name}</span>
                        {getAutoTrainerIdsForCategory(editingTraining.categoryId).includes(
                          trainer.id,
                        ) && (
                          <span className="ml-auto text-[11px] font-medium text-blue-600">
                            Associato
                          </span>
                        )}
                      </label>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Nessun allenatore disponibile.
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
            <Button
              variant="outline"
              className="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
              onClick={() => {
                if (
                  editingTraining &&
                  window.confirm(
                    "Vuoi eliminare questo allenamento dal programma settimanale?",
                  )
                ) {
                  removeScheduleItem(editingTraining.id);
                  setShowEditDialog(false);
                  setEditingTraining(null);
                }
              }}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Elimina
            </Button>

            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setShowEditDialog(false);
                  setEditingTraining(null);
                }}
              >
                Annulla
              </Button>
              <Button
                onClick={saveEditedTraining}
                className="bg-blue-600 hover:bg-blue-700"
              >
                Salva modifiche
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
