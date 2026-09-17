"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { Button as WebButton, IconButton } from "@/components/web/primitives/Button";
import { Eyebrow, InsetBlock, Panel, PanelHeader } from "@/components/web/primitives/Surface";
import { StatusPill } from "@/components/web/primitives/StatusPill";
import { AlertBlock } from "@/components/web/page/Alerts";
import { EmptyStateCard } from "@/components/web/page/Cards";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/toast-notification";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/components/providers/AuthProvider";
import { apiRequest } from "@/lib/api/client";
import {
  getClubWeeklySchedule,
  updateClubData,
} from "@/lib/simplified-db";
import { resolveCategoryId } from "@/lib/category-utils";
import {
  findTrainingLocationOption,
  getFallbackTrainingLocationOptions,
  getStructureFieldOptions,
  type TrainingLocationOption,
} from "@/lib/training-location-options";
import { getAssociatedTrainerIds } from "@/lib/trainer-utils";
import {
  buildCategoryDisplayIndex,
  UNKNOWN_SITE_LABEL,
} from "@/lib/categories/display";
import {
  labelCategoryGroupOptions,
  isCrossSiteEvent,
  resolveRecommendedStructures,
} from "@/lib/club-sites";
import type { TrainingGroupOption } from "@/components/training/TrainingGroupSelector";
import { createCoalescingSaver } from "@/lib/performance";
import { SaveStatus, type SaveState } from "@/components/ui/save-status";
import {
  findScheduleConflicts,
  isValidTimeRange,
  resolveTrainingWeekday,
} from "@/lib/training-utils";
import { TrainingScheduleAutomationPanel } from "@/components/trainer/TrainingScheduleAutomationPanel";
import { useConfirm } from "@/components/web/overlays/useConfirm";
import {
  CalendarDays,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
} from "lucide-react";

type CategoryOption = { id: string; name: string };
type TrainerOption = { id: string; name: string; categories?: any[] };

export interface WeeklyTrainingItem {
  /** La stagione a cui la voce appartiene, com'e in archivio (ADR-0197). */
  seasonId?: string;
  id: string;
  day: string;
  startTime: string;
  endTime: string;
  categoryId: string;
  categoryName?: string | null;
  /** Il gruppo operativo. Vuoto sul dato precedente ai gruppi (ADR-0055). */
  groupId?: string;
  trainerIds: string[];
  structureId: string;
  locationId: string;
  location?: string | null;
  /**
   * Assente o `true`: la voce genera. `false`: smette di generare **nuove**
   * occorrenze, ma non tocca quelle gia create (WP-14) — la stessa
   * distinzione di ADR-0169 fra "genera" e "cancella cio che ha gia
   * generato".
   */
  active?: boolean;
}

interface WeeklyTrainingSchedulePanelProps {
  categories: CategoryOption[];
  /**
   * I gruppi operativi del club: le squadre vere. Quando la stessa categoria
   * si svolge in piu sedi, il programma deve dire **quale** si allena il
   * martedi alle 18, non solo in che fascia (ADR-0055).
   */
  groups?: TrainingGroupOption[];
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
    {
      structureId: string;
      structureName: string;
      siteId: string | null;
      fields: TrainingLocationOption[];
    }
  >();

  locations.forEach((location) => {
    if (!groups.has(location.structureId)) {
      groups.set(location.structureId, {
        structureId: location.structureId,
        structureName: location.structureName,
        siteId: location.siteId,
        fields: [],
      });
    }

    groups.get(location.structureId)?.fields.push(location);
  });

  return Array.from(groups.values());
};

/**
 * Attesa prima che l'autosave scriva.
 *
 * Trascinare un allenamento sulla griglia produce molti aggiornamenti di stato
 * consecutivi: senza attesa ognuno diventerebbe una scrittura.
 */
const AUTOSAVE_DEBOUNCE_MS = 1200;

export function WeeklyTrainingSchedule({
  categories = [],
  groups = [],
  trainers = [],
  locations = [],
  onSave,
  initialSchedule = [],
  autoSave = true,
  allowDragDrop = true,
  onTrainingsGenerated = () => {},
}: WeeklyTrainingSchedulePanelProps) {
  /*
    Le conferme (conflitto d'orario, sede incrociata, rimozione) passano dal
    dialogo del sistema invece che da `window.confirm` (guideline 08 §8.9).
  */
  const [confirm, confirmDialog] = useConfirm();
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
  const [saveState, setSaveState] = React.useState<SaveState>("idle");
  const [savedAt, setSavedAt] = React.useState<Date | null>(null);
  const saving = saveState === "saving";
  const lastPersistedScheduleRef = React.useRef("[]");
  /*
    La stessa cosa di `lastPersistedScheduleRef`, ma l'array e non
    l'impronta: serve a WP-08 per chiedere "cosa e cambiato rispetto a
    prima?" dopo un salvataggio riuscito, senza dover riparlare del server.
  */
  const lastPersistedScheduleArrayRef = React.useRef<WeeklyTrainingItem[]>([]);
  const [scheduleImpact, setScheduleImpact] = React.useState<{
    previousSchedule: WeeklyTrainingItem[];
    nextSchedule: WeeklyTrainingItem[];
    slots: Array<{
      slotId: string;
      changeType: "modified" | "removed";
      matchedCount: number;
      activeCount: number;
      manuallyModifiedCount: number;
      safeCount: number;
    }>;
  } | null>(null);
  const [isApplyingImpact, setIsApplyingImpact] = React.useState(false);
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
      /*
        Il nome che finisce nello stato (e poi in `weekly_schedule`) e quello
        del catalogo se l'identificativo si risolve, altrimenti quello che la
        riga portava: **mai** un'etichetta derivata — un ripiego come «Categoria
        non disponibile» scritto qui diventerebbe un nome in archivio (D-RD-17).
      */
      const resolvedCategoryName =
        (resolvedCategoryId
          ? categories.find((category) => category.id === resolvedCategoryId)?.name
          : null) ||
        String(item?.categoryName || item?.category_name || "").trim() ||
        null;

      return {
        id: String(item?.id || createScheduleId()),
        /*
          La stagione della voce viaggia con la voce (ADR-0197): il pannello
          la manda al server come override, e senza questo campo il server
          non poteva sapere di quale stagione fossero le 40 righe.
        */
        ...(String(item?.seasonId || item?.season_id || "").trim()
          ? { seasonId: String(item?.seasonId || item?.season_id).trim() }
          : {}),
        day: resolvedDay,
        startTime: String(
          item?.startTime || item?.start_time || item?.time || "18:00",
        ).slice(0, 5),
        endTime: String(item?.endTime || item?.end_time || "19:30").slice(
          0,
          5,
        ),
        categoryId: resolvedCategoryId || String(categories[0]?.id || ""),
        groupId: String(item?.groupId || item?.group_id || "").trim() || undefined,
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
        // Assente sul dato precedente al flag: si legge come attiva, non
        // come disattivata (WP-14) — un vuoto non deve spegnere in silenzio
        // ogni voce salvata prima che il flag esistesse.
        active: item?.active === false ? false : true,
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
          groupId: item.groupId || null,
          categoryName: item.categoryName || null,
          trainerIds: [...(item.trainerIds || [])].sort(),
          structureId: item.structureId,
          locationId: item.locationId,
          location: item.location || null,
          active: item.active === false ? false : true,
        })),
      ),
    [],
  );

  React.useEffect(() => {
    if (!activeClub?.id) {
      setSchedule([]);
      lastPersistedScheduleRef.current = "[]";
      lastPersistedScheduleArrayRef.current = [];
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
        lastPersistedScheduleArrayRef.current = normalizedSchedule;
      } catch (error) {
        console.error("Error loading weekly schedule:", error);
        const normalizedFallback = initialSchedule.map(normalizeScheduleItem);
        setSchedule(normalizedFallback);
        lastPersistedScheduleRef.current =
          buildScheduleSnapshot(normalizedFallback);
        lastPersistedScheduleArrayRef.current = normalizedFallback;
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

  /*
    **"La modifica interessa X allenamenti futuri gia generati"** (WP-08).
    Un avviso non bloccante dopo l'autosave, non una finestra prima: vedi il
    commento dentro `persistSchedule`. Usa lo stesso servizio che poi
    l'aggiornamento in blocco chiamera per davvero (WP-17): l'anteprima e
    l'esecuzione condividono le stesse regole di dominio.
  */
  const checkScheduleImpact = React.useCallback(
    async (
      previousSchedule: WeeklyTrainingItem[],
      nextSchedule: WeeklyTrainingItem[],
    ) => {
      if (!activeClub?.id) {
        return;
      }

      try {
        const response = await apiRequest<{
          impact: Array<{
            slotId: string;
            changeType: "modified" | "removed";
            matchedCount: number;
            activeCount: number;
            manuallyModifiedCount: number;
            safeCount: number;
          }>;
        }>("/api/v1/training-automation/schedule-impact", {
          method: "POST",
          body: { previousSchedule, nextSchedule },
        });

        const impatto = (response.data?.impact || []).filter(
          (voce) => voce.matchedCount > 0,
        );

        setScheduleImpact(
          impatto.length ? { previousSchedule, nextSchedule, slots: impatto } : null,
        );
      } catch (error) {
        // Un avviso in piu che non arriva non deve rompere il salvataggio,
        // che a questo punto e gia riuscito.
        console.error("Error checking weekly schedule impact:", error);
      }
    },
    [activeClub?.id],
  );

  const applyScheduleImpact = React.useCallback(async () => {
    if (!activeClub?.id || !scheduleImpact) {
      return;
    }

    setIsApplyingImpact(true);
    try {
      const response = await apiRequest<{
        applied: Array<{ slotId: string; updatedCount: number; skippedCount: number }>;
      }>("/api/v1/training-automation/schedule-impact", {
        method: "POST",
        body: {
          previousSchedule: scheduleImpact.previousSchedule,
          nextSchedule: scheduleImpact.nextSchedule,
          apply: true,
        },
      });

      if (response.error) {
        throw new Error(response.error.message || "Aggiornamento fallito");
      }

      const applicati = response.data?.applied || [];
      const aggiornati = applicati.reduce((tot, voce) => tot + voce.updatedCount, 0);
      const saltati = applicati.reduce((tot, voce) => tot + voce.skippedCount, 0);

      showToast(
        "success",
        `${aggiornati} allenamenti futuri aggiornati${saltati ? `, ${saltati} lasciati com'erano` : ""}`,
      );
      setScheduleImpact(null);
      onTrainingsGenerated();
    } catch (error) {
      console.error("Error applying weekly schedule impact:", error);
      showToast(
        "error",
        "Errore durante l'aggiornamento degli allenamenti futuri",
      );
    } finally {
      setIsApplyingImpact(false);
    }
  }, [activeClub?.id, onTrainingsGenerated, scheduleImpact, showToast]);

  const saveRunnerRef = React.useRef<
    ((value: { schedule: WeeklyTrainingItem[]; notify: boolean }) => Promise<void>) | null
  >(null);

  const persistSchedule = React.useCallback(
    async (nextSchedule: WeeklyTrainingItem[], notify = false) => {
      if (!activeClub?.id) {
        return;
      }

      const clubId = activeClub.id;

      if (!saveRunnerRef.current) {
        // Una scrittura per volta, con accorpamento di quelle richieste nel
        // frattempo: le PATCH non si sovrappongono e l'ultima modifica non si
        // perde per una corsa fra risposte.
        saveRunnerRef.current = createCoalescingSaver(
          async ({ schedule: scheduleToSave, notify: shouldNotify }) => {
            setSaveState("saving");
            const scheduleDiPrima = lastPersistedScheduleArrayRef.current;
            try {
              await updateClubData(clubId, "weekly_schedule", scheduleToSave);
              lastPersistedScheduleRef.current =
                buildScheduleSnapshot(scheduleToSave);
              lastPersistedScheduleArrayRef.current = scheduleToSave;
              await onSave(scheduleToSave);
              setSavedAt(new Date());
              setSaveState("saved");
              if (shouldNotify) {
                showToast("success", "Programma settimanale salvato");
              }
              /*
                **WP-08, dopo il salvataggio, non prima.** Il programma si
                salva in automatico a ogni modifica (autosave, ~1200ms di
                debounce): una finestra di conferma bloccante a ogni
                digitazione sarebbe inutilizzabile. L'impatto si informa
                quindi come un avviso non bloccante, dopo che il salvataggio
                e gia avvenuto — e chi lo vede decide se estendere la
                modifica anche agli allenamenti futuri gia generati.
              */
              checkScheduleImpact(scheduleDiPrima, scheduleToSave);
            } catch (error) {
              console.error("Error saving weekly schedule:", error);
              setSaveState("error");
              showToast(
                "error",
                "Programma non salvato. Controlla la connessione e riprova.",
              );
            }
          },
          {
            isEqual: ({ schedule: candidate }) =>
              buildScheduleSnapshot(candidate) ===
              lastPersistedScheduleRef.current,
          },
        );
      }

      await saveRunnerRef.current({ schedule: nextSchedule, notify });
    },
    [activeClub?.id, buildScheduleSnapshot, checkScheduleImpact, onSave, showToast],
  );

  // Cambiando club il runner precedente scriverebbe sul club sbagliato.
  React.useEffect(() => {
    saveRunnerRef.current = null;
  }, [activeClub?.id]);

  React.useEffect(() => {
    if (!autoSave || !loaded) {
      return;
    }

    if (buildScheduleSnapshot(schedule) === lastPersistedScheduleRef.current) {
      return;
    }

    const timer = setTimeout(() => {
      persistSchedule(schedule, false);
    }, AUTOSAVE_DEBOUNCE_MS);

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
            `${getScheduleItemLabel(conflict)} (${conflict.startTime}-${conflict.endTime})`,
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

  const addScheduleItem = async () => {
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
    if (
      conflictMessage &&
      !(await confirm({ title: "Orario in conflitto", description: conflictMessage, confirmLabel: "Inserisci comunque" }))
    ) {
      return;
    }

    const crossSiteMessage = buildCrossSiteWarning(normalizedNewTraining);
    if (
      crossSiteMessage &&
      !(await confirm({ title: "Struttura di un'altra sede", description: crossSiteMessage, confirmLabel: "Conferma" }))
    ) {
      return;
    }

    setSchedule((current) => [...current, normalizedNewTraining]);
    setShowAddDialog(false);
  };

  /*
    **La combinazione struttura/sede al momento dell'apertura** — non si
    riavvisa un evento gia salvato cross-site che l'utente non ha toccato
    (issue UAT): il confronto in `saveEditedTraining` e contro questo
    riferimento, non contro un valore ricalcolato a ogni render.
  */
  const editingOriginalStructureIdRef = React.useRef<string>("");

  const openEditDialog = (item: WeeklyTrainingItem) => {
    editingOriginalStructureIdRef.current = item.structureId;
    setEditingTraining({ ...item });
    setShowEditDialog(true);
  };

  const saveEditedTraining = async () => {
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
    if (
      conflictMessage &&
      !(await confirm({ title: "Orario in conflitto", description: conflictMessage, confirmLabel: "Inserisci comunque" }))
    ) {
      return;
    }

    /*
      Solo se la struttura e **cambiata** rispetto a quella con cui il
      dialogo si e aperto: riaprire e risalvare un evento gia cross-site
      senza toccare la struttura non deve riproporre l'avviso.
    */
    if (
      normalizedEditingTraining.structureId !==
      editingOriginalStructureIdRef.current
    ) {
      const crossSiteMessage = buildCrossSiteWarning(normalizedEditingTraining);
      if (
        crossSiteMessage &&
        !(await confirm({ title: "Struttura di un'altra sede", description: crossSiteMessage, confirmLabel: "Conferma" }))
      ) {
        return;
      }
    }

    setSchedule((current) =>
      current.map((item) =>
        item.id === normalizedEditingTraining.id ? normalizedEditingTraining : item,
      ),
    );
    setShowEditDialog(false);
    setEditingTraining(null);
  };

  const moveScheduleItem = async (
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

    if (
      conflictMessage &&
      !(await confirm({ title: "Orario in conflitto", description: conflictMessage, confirmLabel: "Inserisci comunque" }))
    ) {
      return;
    }

    setSchedule((current) =>
      current.map((item) => (item.id === itemId ? nextItem : item)),
    );
  };

  const getCategoryName = (item: Partial<WeeklyTrainingItem> | string) => {
    if (typeof item === "string") {
      return categoryDisplay.label(item);
    }

    return categoryDisplay.label({
      categoryId: item.categoryId || "",
      categoryName: item.categoryName || "",
    });
  };

  /**
   * Le squadre selezionabili nel programma.
   *
   * Senza gruppi configurati sono le categorie, una per una: il club
   * mono-sede non vede niente di diverso da prima.
   */
  const groupOptions: TrainingGroupOption[] = React.useMemo(() => {
    if (groups.length) return groups;

    return categories.map((category) => ({
      id: `group:${category.id}`,
      name: category.name,
      categoryId: category.id,
      categoryName: category.name,
      siteId: "",
      siteName: "",
    }));
  }, [groups, categories]);

  /*
    **Il conteggio e per nome, non per `categoryId`** (pilota Fortitudo Scauri;
    stessa famiglia di difetto di P0-4 e D-AUD-35, ma un terzo lettore: quello
    non toccava questa select).

    Un club puo avere due categorie *diverse* — due identificativi veri,
    ADR-0155 — chiamate entrambe «Pulcini»: dato storico, precedente ai
    gruppi, in cui ogni sede aveva la propria anagrafica categoria. Ciascuna
    ha un solo gruppo operativo, e contare per `categoryId` darebbe sempre
    uno: la sede non compariva mai, e le due squadre si leggevano come due
    voci «Pulcini» identiche e indistinguibili in ogni tendina di questo
    pannello. Il conteggio giusto e quello del **nome scritto a schermo**.
  */
  /*
    L'etichetta porta la sede **solo** quando serve a distinguere: con una
    squadra sola per categoria «Pulcini · Scauri» aggiunge rumore e non
    informazione (ADR-0055). La regola vive in `labelCategoryGroupOptions`
    (ADR-0185), la stessa del selettore dei gruppi e dell'elenco atleti.
  */
  const getGroupLabel = React.useMemo(
    () => labelCategoryGroupOptions(groupOptions),
    [groupOptions],
  );

  /*
    Come si scrive una categoria in questo pannello (ADR-0185, D-RD-17 a): un
    indice solo, con i gruppi che il pannello ha gia. Un riferimento che il
    catalogo non conosce non esce com'e — `category-1757…` — ma come
    «Categoria non disponibile».
  */
  const categoryDisplay = React.useMemo(
    () => buildCategoryDisplayIndex({ categories, groups: groupOptions }),
    [categories, groupOptions],
  );

  /** Il gruppo di una riga: dichiarato, o dedotto dalla sua categoria. */
  const resolveItemGroup = React.useCallback(
    (item: Partial<WeeklyTrainingItem>) =>
      groupOptions.find((group) => group.id === item.groupId) ||
      groupOptions.find((group) => group.categoryId === item.categoryId) ||
      null,
    [groupOptions],
  );

  /**
   * Le strutture con quelle della sede del **gruppo** scelto consigliate e
   * in cima — non filtrate: una struttura di un'altra sede resta
   * selezionabile, con un avviso alla conferma (issue UAT).
   */
  const structureRecommendationsForNewTraining = React.useMemo(
    () =>
      resolveRecommendedStructures(
        groupedLocations,
        resolveItemGroup(newTraining)?.siteId || "",
      ),
    [groupedLocations, resolveItemGroup, newTraining],
  );
  const structureRecommendationsForEditingTraining = React.useMemo(
    () =>
      resolveRecommendedStructures(
        groupedLocations,
        editingTraining ? resolveItemGroup(editingTraining)?.siteId || "" : "",
      ),
    [groupedLocations, resolveItemGroup, editingTraining],
  );

  /** Il nome di una sede, a partire dal suo id — dai gruppi, che gia lo portano. */
  const siteNameById = React.useMemo(() => {
    const map = new Map<string, string>();
    groupOptions.forEach((group) => {
      if (group.siteId && group.siteName) {
        map.set(group.siteId, group.siteName);
      }
    });
    return map;
  }, [groupOptions]);

  /**
   * **La struttura scelta e di un'altra sede rispetto al gruppo?** Un
   * messaggio di conferma pronto per `window.confirm` — stessa primitiva
   * gia in uso in questo pannello per la sovrapposizione (`buildConflictMessage`)
   * — o `null` quando non c'e niente da confermare (nessun gruppo con sede,
   * struttura senza sede, o stessa sede: comportamento attuale, invariato).
   */
  const buildCrossSiteWarning = React.useCallback(
    (item: WeeklyTrainingItem) => {
      const group = resolveItemGroup(item);
      const groupSiteId = group?.siteId || "";
      const struttura = groupedLocations.find(
        (voce) => voce.structureId === item.structureId,
      );
      const structureSiteId = struttura?.siteId || "";

      if (!isCrossSiteEvent(groupSiteId, structureSiteId)) {
        return null;
      }

      const groupSiteName = siteNameById.get(groupSiteId) || UNKNOWN_SITE_LABEL;
      const structureSiteName =
        siteNameById.get(structureSiteId) || structureSiteId;

      return (
        "Attenzione: la struttura selezionata appartiene a una sede diversa dalla categoria.\n\n" +
        `Categoria: ${group?.categoryName || item.categoryName || ""}\n` +
        `Sede categoria: ${groupSiteName}\n\n` +
        `Struttura: ${struttura?.structureName || ""}\n` +
        `Sede struttura: ${structureSiteName}\n\n` +
        "Vuoi continuare comunque?"
      );
    },
    [resolveItemGroup, groupedLocations, siteNameById],
  );

  const getScheduleItemLabel = React.useCallback(
    (item: Partial<WeeklyTrainingItem>) => {
      const group = resolveItemGroup(item);
      return group ? getGroupLabel(group) : getCategoryName(item);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [resolveItemGroup, getGroupLabel, categories],
  );

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
      {confirmDialog}
      {/*
        La barra operativa del programma (guideline 09 §9.2): l'assistente e
        un secondario, «Aggiungi allenamento» il primario della schermata,
        lo stato di salvataggio accanto. Densa: e una superficie di lavoro.
      */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <WebButton
            variant="secondary"
            size="sm"
            icon={<Sparkles />}
            aria-expanded={showAutomation}
            onClick={() => setShowAutomation((current) => !current)}
          >
            {showAutomation ? "Nascondi automazione" : "Assistente Automazione"}
          </WebButton>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <SaveStatus state={saveState} savedAt={savedAt} />
          <WebButton variant="primary" size="sm" icon={<Plus />} onClick={() => setShowAddDialog(true)}>
            Aggiungi Allenamento
          </WebButton>
        </div>
      </div>

      {scheduleImpact ? (
        <AlertBlock
          severity="warning"
          title={
            <>
              La modifica interessa{" "}
              {scheduleImpact.slots.reduce((tot, voce) => tot + voce.matchedCount, 0)}{" "}
              allenament
              {scheduleImpact.slots.reduce((tot, voce) => tot + voce.matchedCount, 0) === 1
                ? "o"
                : "i"}{" "}
              futuri gia generati.
            </>
          }
          actions={
            <>
              <WebButton
                variant="secondary"
                size="sm"
                onClick={() => setScheduleImpact(null)}
                disabled={isApplyingImpact}
              >
                Applica solo alle nuove generazioni
              </WebButton>
              <WebButton
                variant="neutral"
                size="sm"
                onClick={applyScheduleImpact}
                loading={isApplyingImpact}
                disabled={
                  scheduleImpact.slots.reduce((tot, voce) => tot + voce.safeCount, 0) === 0
                }
              >
                Aggiorna{" "}
                {scheduleImpact.slots.reduce((tot, voce) => tot + voce.safeCount, 0)}{" "}
                allenamenti futuri non modificati
              </WebButton>
            </>
          }
        >
          {scheduleImpact.slots.reduce((tot, voce) => tot + voce.safeCount, 0)}{" "}
          si possono aggiornare in sicurezza (nessuno modificato a mano,
          annullato o con presenze registrate). Puoi anche non fare niente:
          gli allenamenti gia creati restano come sono, e solo le prossime
          generazioni useranno la nuova definizione.
        </AlertBlock>
      ) : null}

      {showAutomation && (
        <TrainingScheduleAutomationPanel
          weeklySchedule={schedule}
          onGenerateTrainings={onTrainingsGenerated}
        />
      )}

      {schedule.length === 0 ? (
        <EmptyStateCard
          icon={<CalendarDays />}
          title="Nessun allenamento nel programma settimanale"
          description="Aggiungi la prima sessione e poi usa l'automazione per creare gli allenamenti reali."
          primary={
            <WebButton variant="primary" size="sm" icon={<Plus />} onClick={() => setShowAddDialog(true)}>
              Aggiungi Allenamento
            </WebButton>
          }
        />
      ) : (
        <div className="space-y-5">
          {groupedLocations.map((structure) => (
            <Panel key={structure.structureId} as="section" radius="sm" className="p-5">
              <PanelHeader
                eyebrow="Struttura"
                title={structure.structureName}
                description="Ogni campo della struttura ha la propria colonna operativa."
                titleAs="h3"
                className="mb-3"
              />

              <div className="grid gap-3 xl:grid-cols-2 2xl:grid-cols-3">
                {structure.fields.map((field) => (
                  <InsetBlock key={field.fieldId} className="p-3">
                    <div className="mb-2.5 flex items-center justify-between gap-2 px-1">
                      <Eyebrow as="p">Campo</Eyebrow>
                      <p className="egw-ellipsis text-[13px] font-bold text-egw-ink">
                        {field.fieldName}
                      </p>
                    </div>

                    <div className="space-y-2">
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
                            className="rounded-egw-field border border-egw-hairline bg-white px-3 py-2.5"
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
                            <div className="mb-1.5 flex items-center justify-between">
                              <p className="text-[12.5px] font-semibold text-egw-ink-72">
                                {day}
                              </p>
                              <span className="egw-num text-[11px] font-semibold text-egw-ink-42">
                                {dayItems.length} {dayItems.length === 1 ? "sessione" : "sessioni"}
                              </span>
                            </div>

                            {dayItems.length === 0 ? (
                              <div className="rounded-egw-control border border-dashed border-egw-hairline px-3 py-2 text-[11.5px] text-egw-ink-42">
                                Nessun allenamento
                              </div>
                            ) : (
                              <div className="space-y-1.5">
                                {dayItems.map((item) => (
                                  <div
                                    key={item.id}
                                    draggable={canDrag}
                                    onDragStart={() => setDraggedItemId(item.id)}
                                    onDragEnd={() => setDraggedItemId(null)}
                                    className={
                                      item.active === false
                                        ? "relative rounded-egw-control border border-egw-hairline bg-egw-page-100 px-3 py-2 opacity-75"
                                        : "relative rounded-egw-control border border-egw-tint-blue-bd bg-egw-tint-blue px-3 py-2"
                                    }
                                  >
                                    {/* La striscia blu dell'allenamento (guideline 05: blue-700 = allenamento). */}
                                    <div aria-hidden className={item.active === false ? "absolute inset-y-2 left-0 w-[3px] rounded-full bg-[rgba(11,26,58,.18)]" : "absolute inset-y-2 left-0 w-[3px] rounded-full bg-egw-blue-700"} />
                                    <div className="flex items-start justify-between gap-2 pl-1.5">
                                      <div className="min-w-0">
                                        <div className="flex flex-wrap items-center gap-1.5">
                                          <p className="egw-num text-[12px] font-bold text-egw-ink">
                                            {item.startTime}–{item.endTime}
                                          </p>
                                          <p className="egw-ellipsis text-[12.5px] font-semibold text-egw-ink">
                                            {getScheduleItemLabel(item)}
                                          </p>
                                          {item.active === false ? <StatusPill status="inactive" size="sm" /> : null}
                                        </div>
                                        <p className="egw-ellipsis mt-0.5 text-[11.5px] text-egw-ink-62">
                                          {getTrainerNames(item.trainerIds) || "Allenatore da assegnare"}
                                        </p>
                                      </div>

                                      <IconButton
                                        aria-label={`Modifica ${getScheduleItemLabel(item)} ${item.startTime}`}
                                        variant="row"
                                        onClick={() => openEditDialog(item)}
                                      >
                                        <Pencil />
                                      </IconButton>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </InsetBlock>
                ))}
              </div>
            </Panel>
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
                className="h-10 w-full rounded-egw-control border border-egw-field-border bg-egw-page-100 px-3 font-brand text-[13.5px] text-egw-ink focus:border-egw-blue focus:bg-white focus:outline-none focus:shadow-egw-focus"
              >
                {DAYS_OF_WEEK.map((day) => (
                  <option key={day} value={day}>
                    {day}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label>Gruppo</Label>
              <select
                value={resolveItemGroup(newTraining)?.id || ""}
                disabled={groupOptions.length === 0}
                onChange={(event) =>
                  setNewTraining((current) => {
                    const group = groupOptions.find(
                      (option) => option.id === event.target.value,
                    );
                    const nextCategoryId = group?.categoryId || current.categoryId;

                    return {
                      ...current,
                      groupId: event.target.value,
                      categoryId: nextCategoryId,
                      categoryName: group?.categoryName || current.categoryName || null,
                      trainerIds: syncTrainerIdsForCategory(
                        current.trainerIds,
                        current.categoryId,
                        nextCategoryId || "",
                      ),
                    };
                  })
                }
                className="h-10 w-full rounded-egw-control border border-egw-field-border bg-egw-page-100 px-3 font-brand text-[13.5px] text-egw-ink focus:border-egw-blue focus:bg-white focus:outline-none focus:shadow-egw-focus"
              >
                <option value="" disabled>
                  {groupOptions.length > 0
                    ? "Seleziona gruppo"
                    : "Nessun gruppo disponibile"}
                </option>
                {groupOptions.map((group) => (
                  <option key={group.id} value={group.id}>
                    {getGroupLabel(group)}
                  </option>
                ))}
              </select>
              {groupOptions.length === 0 && (
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
                className="h-10 w-full rounded-egw-control border border-egw-field-border bg-egw-page-100 px-3 font-brand text-[13.5px] text-egw-ink focus:border-egw-blue focus:bg-white focus:outline-none focus:shadow-egw-focus"
              >
                {structureRecommendationsForNewTraining.map(
                  ({ structure, recommended }) => (
                    <option key={structure.structureId} value={structure.structureId}>
                      {structure.structureName}
                      {recommended ? " · Consigliata (stessa sede)" : ""}
                    </option>
                  ),
                )}
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
                className="h-10 w-full rounded-egw-control border border-egw-field-border bg-egw-page-100 px-3 font-brand text-[13.5px] text-egw-ink focus:border-egw-blue focus:bg-white focus:outline-none focus:shadow-egw-focus"
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
              <div className="grid gap-2 rounded-egw-field border p-3 sm:grid-cols-2">
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
                        <span className="ml-auto text-[11px] font-medium text-egw-blue-700">
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
            <Button onClick={addScheduleItem} className="bg-egw-blue hover:bg-egw-blue-700">
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
                  className="h-10 w-full rounded-egw-control border border-egw-field-border bg-egw-page-100 px-3 font-brand text-[13.5px] text-egw-ink focus:border-egw-blue focus:bg-white focus:outline-none focus:shadow-egw-focus"
                >
                  {DAYS_OF_WEEK.map((day) => (
                    <option key={day} value={day}>
                      {day}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
              <Label>Gruppo</Label>
              <select
                value={resolveItemGroup(editingTraining)?.id || ""}
                disabled={groupOptions.length === 0}
                onChange={(event) =>
                  setEditingTraining((current) => {
                    if (!current) return current;

                    const group = groupOptions.find(
                      (option) => option.id === event.target.value,
                    );
                    const nextCategoryId = group?.categoryId || current.categoryId;

                    return {
                      ...current,
                      groupId: event.target.value,
                      categoryId: nextCategoryId,
                      categoryName: group?.categoryName || current.categoryName || null,
                      trainerIds: syncTrainerIdsForCategory(
                        current.trainerIds,
                        current.categoryId,
                        nextCategoryId,
                      ),
                    };
                  })
                }
                className="h-10 w-full rounded-egw-control border border-egw-field-border bg-egw-page-100 px-3 font-brand text-[13.5px] text-egw-ink focus:border-egw-blue focus:bg-white focus:outline-none focus:shadow-egw-focus"
              >
                <option value="" disabled>
                  {groupOptions.length > 0
                    ? "Seleziona gruppo"
                    : "Nessun gruppo disponibile"}
                </option>
                {groupOptions.map((group) => (
                  <option key={group.id} value={group.id}>
                    {getGroupLabel(group)}
                  </option>
                ))}
              </select>
              {groupOptions.length === 0 && (
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
                  className="h-10 w-full rounded-egw-control border border-egw-field-border bg-egw-page-100 px-3 font-brand text-[13.5px] text-egw-ink focus:border-egw-blue focus:bg-white focus:outline-none focus:shadow-egw-focus"
                >
                  {structureRecommendationsForEditingTraining.map(
                    ({ structure, recommended }) => (
                      <option key={structure.structureId} value={structure.structureId}>
                        {structure.structureName}
                        {recommended ? " · Consigliata (stessa sede)" : ""}
                      </option>
                    ),
                  )}
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
                  className="h-10 w-full rounded-egw-control border border-egw-field-border bg-egw-page-100 px-3 font-brand text-[13.5px] text-egw-ink focus:border-egw-blue focus:bg-white focus:outline-none focus:shadow-egw-focus"
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
                <div className="grid gap-2 rounded-egw-field border p-3 sm:grid-cols-2">
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
                          <span className="ml-auto text-[11px] font-medium text-egw-blue-700">
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

              <div className="flex items-center justify-between rounded-egw-field border bg-egw-page-100 p-3 md:col-span-2">
                <div>
                  <p className="text-sm font-medium text-egw-ink">
                    Regola attiva
                  </p>
                  <p className="text-xs text-egw-ink-62">
                    Disattivata, questa voce smette di generare nuovi
                    allenamenti. Quelli gia creati restano: disattivare non li
                    tocca.
                  </p>
                </div>
                <Switch
                  checked={editingTraining.active !== false}
                  onCheckedChange={(checked) =>
                    setEditingTraining((current) =>
                      current ? { ...current, active: checked } : current,
                    )
                  }
                />
              </div>
            </div>
          )}

          <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
            <Button
              variant="outline"
              className="border-egw-tint-red-bd text-egw-red hover:bg-egw-tint-red hover:text-egw-red"
              onClick={async () => {
                if (
                  editingTraining &&
                  (await confirm({
                    title: "Eliminare questo allenamento dal programma settimanale?",
                    description: "La fascia sparisce dal programma; gli allenamenti gia generati restano in calendario.",
                    confirmLabel: "Elimina",
                    tone: "danger",
                  }))
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
                className="bg-egw-blue hover:bg-egw-blue-700"
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
