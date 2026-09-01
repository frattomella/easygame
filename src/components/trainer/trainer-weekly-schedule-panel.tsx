"use client";

import React from "react";
import { CalendarDays } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  SectionEmptyState,
  SurfacePanel,
} from "@/components/trainer/trainer-dashboard-shared";
import { resolveCategoryId, resolveCategoryLabel } from "@/lib/category-utils";
import { recordMatchesCategory } from "@/lib/trainer-dashboard-helpers";
import {
  findTrainingLocationOption,
  type TrainingLocationOption,
} from "@/lib/training-location-options";

type CategoryOption = { id?: string | null; name?: string | null };
type TrainerOption = { id?: string | null; name?: string | null };

type DisplayWeeklyTraining = {
  id: string;
  day: string;
  startTime: string;
  endTime: string;
  categoryId: string;
  categoryName: string;
  trainerNames: string[];
  structureId: string;
  structureName: string;
  locationId: string;
  fieldName: string;
};

const DAYS_OF_WEEK = [
  "Lunedi",
  "Martedi",
  "Mercoledi",
  "Giovedi",
  "Venerdi",
  "Sabato",
  "Domenica",
];

const normalizeValue = (value: unknown) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

const normalizeDay = (value: unknown) => {
  const normalized = normalizeValue(value);
  const matchedDay = DAYS_OF_WEEK.find((day) => normalizeValue(day) === normalized);
  return matchedDay || DAYS_OF_WEEK[0];
};

const firstNonEmptyString = (...values: unknown[]) => {
  for (const value of values) {
    const candidate = String(value || "").trim();
    if (candidate) {
      return candidate;
    }
  }

  return "";
};

const makeKey = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const collectValues = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value.flatMap((entry) => collectValues(entry));
  }

  if (value && typeof value === "object") {
    const record = value as Record<string, any>;
    return [
      record.id,
      record.value,
      record.name,
      record.label,
      record.fullName,
      record.full_name,
    ]
      .map((entry) => String(entry || "").trim())
      .filter(Boolean);
  }

  return String(value || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
};

const getTrainerNames = (item: any, trainers: TrainerOption[]) => {
  const trainerRefs = [
    item?.trainerIds,
    item?.trainer_ids,
    item?.trainers,
    item?.trainer,
    item?.trainerNames,
    item?.trainer_names,
  ].flatMap((value) => collectValues(value));
  const trainerNames = trainerRefs
    .map((ref) => {
      const normalizedRef = normalizeValue(ref);
      const trainer = trainers.find(
        (entry) =>
          normalizeValue(entry?.id) === normalizedRef ||
          normalizeValue(entry?.name) === normalizedRef,
      );
      return String(trainer?.name || ref).trim();
    })
    .filter(Boolean);

  return Array.from(new Set(trainerNames));
};

const buildEffectiveLocations = (
  schedule: any[],
  locations: TrainingLocationOption[],
) => {
  const options = [...(Array.isArray(locations) ? locations : [])];
  const seen = new Set(options.map((option) => `${option.structureId}:${option.fieldId}`));

  schedule.forEach((item, index) => {
    const matchedLocation = findTrainingLocationOption(options, {
      structureId: item?.structureId,
      fieldId: item?.locationId || item?.fieldId,
      locationId: item?.locationId || item?.fieldId,
      location: item?.location || item?.fieldName,
    });

    if (matchedLocation) {
      return;
    }

    const structureName = firstNonEmptyString(
      item?.structureName,
      item?.structure,
      "Struttura non assegnata",
    );
    const fieldName = firstNonEmptyString(
      item?.fieldName,
      item?.location,
      item?.field,
      "Campo non assegnato",
    );
    const structureId = firstNonEmptyString(
      item?.structureId,
      item?.structure_id,
      `structure-${makeKey(structureName) || index}`,
    );
    const fieldId = firstNonEmptyString(
      item?.locationId,
      item?.fieldId,
      item?.location_id,
      `field-${makeKey(fieldName) || index}`,
    );
    const key = `${structureId}:${fieldId}`;

    if (seen.has(key)) {
      return;
    }

    seen.add(key);
    options.push({
      id: fieldId,
      structureId,
      structureName,
      fieldId,
      fieldName,
      name: `${structureName} - ${fieldName}`,
      siteId: null,
      label: `${structureName} / ${fieldName}`,
    });
  });

  return options;
};

const groupLocationsByStructure = (locations: TrainingLocationOption[]) => {
  const groups = new Map<
    string,
    {
      structureId: string;
      structureName: string;
      fields: TrainingLocationOption[];
    }
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

const normalizeScheduleItem = ({
  item,
  index,
  categories,
  trainers,
  locations,
}: {
  item: any;
  index: number;
  categories: CategoryOption[];
  trainers: TrainerOption[];
  locations: TrainingLocationOption[];
}): DisplayWeeklyTraining => {
  const matchedLocation = findTrainingLocationOption(locations, {
    structureId: item?.structureId || item?.structure_id,
    fieldId: item?.fieldId || item?.locationId || item?.location_id,
    locationId: item?.fieldId || item?.locationId || item?.location_id,
    location: item?.location || item?.fieldName,
  });
  const categoryId =
    resolveCategoryId(
      item?.categoryId ||
        item?.category_id ||
        item?.category?.id ||
        item?.category?.name ||
        item?.categoryName ||
        item?.category_name ||
        item?.category,
      categories,
    ) || "";
  const categoryName = resolveCategoryLabel(
    categoryId ||
      item?.categoryName ||
      item?.category_name ||
      item?.category ||
      "Categoria",
    categories,
  );
  const structureName = firstNonEmptyString(
    matchedLocation?.structureName,
    item?.structureName,
    item?.structure,
    "Struttura non assegnata",
  );
  const fieldName = firstNonEmptyString(
    matchedLocation?.fieldName,
    item?.fieldName,
    item?.location,
    item?.field,
    "Campo non assegnato",
  );

  return {
    id: firstNonEmptyString(item?.id, `weekly-schedule-${index}`),
    day: normalizeDay(item?.day || item?.weekday || item?.giorno),
    startTime: firstNonEmptyString(item?.startTime, item?.start_time, item?.time, "00:00").slice(0, 5),
    endTime: firstNonEmptyString(item?.endTime, item?.end_time, "00:00").slice(0, 5),
    categoryId,
    categoryName,
    trainerNames: getTrainerNames(item, trainers),
    structureId: firstNonEmptyString(
      matchedLocation?.structureId,
      item?.structureId,
      item?.structure_id,
      `structure-${makeKey(structureName) || index}`,
    ),
    structureName,
    locationId: firstNonEmptyString(
      matchedLocation?.fieldId,
      item?.fieldId,
      item?.locationId,
      item?.location_id,
      `field-${makeKey(fieldName) || index}`,
    ),
    fieldName,
  };
};

export function TrainerWeeklySchedulePanel({
  weeklySchedule,
  categories,
  assignedCategories,
  trainers,
  locations,
  loading = false,
}: {
  weeklySchedule: any[];
  categories: CategoryOption[];
  assignedCategories: CategoryOption[];
  trainers: TrainerOption[];
  locations: TrainingLocationOption[];
  loading?: boolean;
}) {
  const [mode, setMode] = React.useState<"mine" | "club">("mine");
  const effectiveLocations = React.useMemo(
    () => buildEffectiveLocations(weeklySchedule, locations),
    [locations, weeklySchedule],
  );
  const normalizedSchedule = React.useMemo(
    () =>
      (Array.isArray(weeklySchedule) ? weeklySchedule : [])
        .map((item, index) =>
          normalizeScheduleItem({
            item,
            index,
            categories,
            trainers,
            locations: effectiveLocations,
          }),
        )
        .sort((left, right) => {
          const dayDiff =
            DAYS_OF_WEEK.indexOf(left.day) - DAYS_OF_WEEK.indexOf(right.day);
          return dayDiff || left.startTime.localeCompare(right.startTime);
        }),
    [categories, effectiveLocations, trainers, weeklySchedule],
  );
  const filteredSchedule = React.useMemo(() => {
    if (mode === "club") {
      return normalizedSchedule;
    }

    return normalizedSchedule.filter((item) =>
      assignedCategories.some((category) =>
        recordMatchesCategory(item, category, categories),
      ),
    );
  }, [assignedCategories, categories, mode, normalizedSchedule]);
  const groupedLocations = React.useMemo(
    () => groupLocationsByStructure(effectiveLocations),
    [effectiveLocations],
  );

  const renderSession = (item: DisplayWeeklyTraining) => (
    <div
      key={item.id}
      className="rounded-xl border border-blue-100 bg-blue-50 p-3"
    >
      <p className="text-sm font-semibold text-slate-950">{item.categoryName}</p>
      <p className="mt-1 text-xs text-slate-500">
        {item.startTime} - {item.endTime}
      </p>
      <p className="mt-1 text-xs text-slate-600">
        {item.trainerNames.length > 0
          ? item.trainerNames.join(", ")
          : "Allenatore da assegnare"}
      </p>
    </div>
  );

  return (
    <SurfacePanel
      title="Programma settimanale"
      description="Vista read-only del programma fisso del club."
      icon={CalendarDays}
      action={
        <div className="inline-flex rounded-2xl border border-slate-200 bg-slate-50 p-1">
          <Button
            type="button"
            size="sm"
            variant={mode === "mine" ? "default" : "ghost"}
            aria-pressed={mode === "mine"}
            className={mode === "mine" ? "rounded-xl bg-blue-600 hover:bg-blue-700" : "rounded-xl"}
            onClick={() => setMode("mine")}
          >
            Le mie categorie
          </Button>
          <Button
            type="button"
            size="sm"
            variant={mode === "club" ? "default" : "ghost"}
            aria-pressed={mode === "club"}
            className={mode === "club" ? "rounded-xl bg-blue-600 hover:bg-blue-700" : "rounded-xl"}
            onClick={() => setMode("club")}
          >
            Tutto il club
          </Button>
        </div>
      }
    >
      {loading ? (
        <SectionEmptyState
          title="Caricamento programma"
          description="Sto recuperando il programma settimanale salvato."
        />
      ) : filteredSchedule.length === 0 ? (
        <SectionEmptyState
          title={
            mode === "mine"
              ? "Nessun allenamento per le tue categorie"
              : "Programma settimanale vuoto"
          }
          description={
            mode === "mine"
              ? "Le categorie assegnate non hanno sessioni nel programma fisso."
              : "Il club non ha ancora salvato sessioni nel programma settimanale."
          }
        />
      ) : (
        <div className="space-y-5">
          <div className="flex flex-wrap gap-2">
            <Badge className="border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-50">
              {filteredSchedule.length} sessioni
            </Badge>
            <Badge className="border-slate-200 bg-slate-100 text-slate-700 hover:bg-slate-100">
              Read-only
            </Badge>
          </div>

          <div className="hidden space-y-5 lg:block">
            {groupedLocations.map((structure) => (
              <div
                key={structure.structureId}
                className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
              >
                <div className="mb-4">
                  <h3 className="text-lg font-semibold text-slate-950">
                    {structure.structureName}
                  </h3>
                  <p className="text-sm text-slate-500">
                    Campi e giorni del programma operativo fisso.
                  </p>
                </div>

                <div className="grid gap-4 xl:grid-cols-2 2xl:grid-cols-3">
                  {structure.fields.map((field) => (
                    <div
                      key={field.fieldId}
                      className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
                    >
                      <div className="mb-3 rounded-xl bg-white px-3 py-2 shadow-sm">
                        <p className="text-sm font-semibold text-slate-950">
                          {field.fieldName}
                        </p>
                      </div>

                      <div className="space-y-3">
                        {DAYS_OF_WEEK.map((day) => {
                          const dayItems = filteredSchedule.filter(
                            (item) =>
                              item.day === day &&
                              item.structureId === structure.structureId &&
                              item.locationId === field.fieldId,
                          );

                          return (
                            <div
                              key={`${field.fieldId}-${day}`}
                              className="rounded-xl border bg-white p-3"
                            >
                              <div className="mb-2 flex items-center justify-between gap-3">
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
                                  {dayItems.map(renderSession)}
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

          <div className="space-y-3 lg:hidden">
            {DAYS_OF_WEEK.map((day) => {
              const dayItems = filteredSchedule.filter((item) => item.day === day);

              return (
                <div key={day} className="rounded-2xl border bg-white p-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <p className="font-semibold text-slate-950">{day}</p>
                    <span className="text-xs text-slate-400">
                      {dayItems.length} sessioni
                    </span>
                  </div>
                  {dayItems.length === 0 ? (
                    <div className="rounded-xl border border-dashed p-3 text-sm text-slate-400">
                      Nessun allenamento
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {dayItems.map((item) => (
                        <div key={item.id} className="rounded-xl border border-blue-100 bg-blue-50 p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-semibold text-slate-950">
                                {item.categoryName}
                              </p>
                              <p className="mt-1 text-xs text-slate-500">
                                {item.startTime} - {item.endTime}
                              </p>
                            </div>
                            <Badge className="shrink-0 border-blue-200 bg-white text-blue-700 hover:bg-white">
                              {item.fieldName}
                            </Badge>
                          </div>
                          <p className="mt-2 text-xs text-slate-600">
                            {item.structureName}
                          </p>
                          <p className="mt-1 text-xs text-slate-600">
                            {item.trainerNames.length > 0
                              ? item.trainerNames.join(", ")
                              : "Allenatore da assegnare"}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </SurfacePanel>
  );
}
