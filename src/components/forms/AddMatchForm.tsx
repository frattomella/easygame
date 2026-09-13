"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Calendar } from "@/components/ui/calendar";
import {
  EMPTY_EVENT_RSVP,
  EventRsvpFields,
  fromEventRsvpPayload,
  toEventRsvpPayload,
  type EventRsvpValue,
} from "@/components/events/event-rsvp-fields";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { CalendarIcon } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { getAssociatedTrainerIds } from "@/lib/trainer-utils";
import {
  categoryIdsFromGroups,
  groupIdsForCategories,
  TrainingGroupSelector,
  type TrainingGroupOption,
} from "@/components/training/TrainingGroupSelector";
import { resolveRecommendedStructures } from "@/lib/club-sites";

type MatchLocationOption = {
  id: string;
  name: string;
  structureId?: string;
  structureName?: string;
  fieldId?: string;
  fieldName?: string;
  label?: string;
  /** Sede della struttura (`TrainingLocationOption.siteId`, ADR-0038). */
  siteId?: string | null;
};

type MatchCategoryOption = {
  id?: string;
  name?: string;
};

type MatchTrainerOption = {
  id: string;
  name: string;
  categories?: any[];
};

interface AddMatchFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: any) => void;
  categories: MatchCategoryOption[];
  /**
   * I gruppi operativi del club (ADR-0055), stessa fonte del form
   * allenamento. Senza `groups` si ricade su un gruppo per categoria — vedi
   * `groupOptions` — il comportamento di un club mono-sede.
   */
  groups?: TrainingGroupOption[];
  trainers: MatchTrainerOption[];
  selectedDate?: Date;
  editMode?: boolean;
  homeFields?: MatchLocationOption[];
  initialData?: {
    title: string;
    date: Date;
    time: string;
    categoryIds: string[];
    opponent: string;
    location: string;
    venueMode?: "home" | "away";
    structureId?: string;
    fieldId?: string;
    manualLocation?: string;
    trainerIds: string[];
    notes: string;
    matchNumber: string;
  };
}

export function AddMatchForm({
  isOpen,
  onClose,
  onSubmit,
  categories,
  groups = [],
  trainers,
  selectedDate,
  editMode = false,
  homeFields = [],
  initialData,
}: AddMatchFormProps) {
  const previousAutoTrainerIdsRef = React.useRef<string[]>([]);
  const [formData, setFormData] = useState({
    title: initialData?.title || "",
    date: initialData?.date || selectedDate || new Date(),
    time: initialData?.time || "",
    categoryIds: initialData?.categoryIds || ([] as string[]),
    groupIds: [] as string[],
    opponent: initialData?.opponent || "",
    location: initialData?.location || "",
    venueMode: initialData?.venueMode || ("home" as "home" | "away"),
    structureId: initialData?.structureId || "",
    fieldId: initialData?.fieldId || "",
    manualLocation: initialData?.manualLocation || "",
    trainerIds: initialData?.trainerIds || ([] as string[]),
    notes: initialData?.notes || "",
    matchNumber: initialData?.matchNumber || "",
  });
  /*
    **La gara ottiene cio che l'allenamento aveva gia** (W5-03, W5-05, W5-12).
    Il dominio RSVP era cablato sull'allenamento perche una gara non aveva dove
    ospitare una risposta: adesso l'evento e uno solo, e la conferma della
    famiglia vale per entrambi.
  */
  const [rsvp, setRsvp] = React.useState<EventRsvpValue>(
    initialData ? fromEventRsvpPayload(initialData) : EMPTY_EVENT_RSVP,
  );

  const categoryOptions = React.useMemo(
    () =>
      (Array.isArray(categories) ? categories : [])
        .map((category) => ({
          id: String(category?.id || "").trim(),
          name: String(category?.name || category?.id || "").trim(),
        }))
        .filter((category) => category.id && category.name),
    [categories],
  );

  /**
   * I gruppi selezionabili (ADR-0055) — stessa logica di `AddTrainingForm`.
   * Senza gruppi configurati si ricade sulle categorie, una per una: e il
   * comportamento di un club mono-sede.
   */
  const groupOptions: TrainingGroupOption[] = React.useMemo(() => {
    if (groups.length) return groups;

    return categoryOptions.map((category) => ({
      id: `group:${category.id}`,
      name: category.name,
      categoryId: category.id,
      categoryName: category.name,
      siteId: "",
      siteName: "",
    }));
  }, [groups, categoryOptions]);

  const structureOptions = React.useMemo(() => {
    const structureMap = new Map<
      string,
      { id: string; name: string; siteId: string | null }
    >();

    homeFields.forEach((field) => {
      if (field.structureId && field.structureName) {
        structureMap.set(field.structureId, {
          id: field.structureId,
          name: field.structureName,
          siteId: field.siteId ?? null,
        });
      }
    });

    return Array.from(structureMap.values());
  }, [homeFields]);

  /*
    **La sede del gruppo scelto, se e una sola** — stessa logica di
    `AddTrainingForm`. Con gruppi di sedi diverse selezionati insieme, o
    senza gruppi con sede, nessuna struttura e "consigliata".
  */
  const selectedGroupSiteId = React.useMemo(() => {
    const selected = groupOptions.filter((group) =>
      formData.groupIds.includes(group.id),
    );
    const siteIds = Array.from(
      new Set(selected.map((group) => group.siteId).filter(Boolean)),
    );
    return siteIds.length === 1 ? siteIds[0]! : "";
  }, [groupOptions, formData.groupIds]);

  /**
   * Le strutture con quelle della sede del gruppo scelto **consigliate e in
   * cima** — non filtrate: una struttura di un'altra sede resta
   * selezionabile, con un avviso alla conferma (gestito dal chiamante, vedi
   * `src/app/matches/page.tsx`).
   */
  const structureRecommendations = React.useMemo(
    () => resolveRecommendedStructures(structureOptions, selectedGroupSiteId),
    [structureOptions, selectedGroupSiteId],
  );

  const fieldOptions = React.useMemo(
    () =>
      homeFields.filter(
        (field) =>
          !formData.structureId || field.structureId === formData.structureId,
      ),
    [formData.structureId, homeFields],
  );

  const autoTrainerIds = React.useMemo(
    () => getAssociatedTrainerIds(trainers, formData.categoryIds, categoryOptions),
    [trainers, formData.categoryIds, categoryOptions],
  );

  // Update form data when initialData changes
  React.useEffect(() => {
    if (initialData) {
      previousAutoTrainerIdsRef.current = [];
      setFormData({
        title: initialData.title,
        date: initialData.date,
        time: initialData.time,
        categoryIds: initialData.categoryIds,
        // Una gara creata prima dei gruppi non ne dichiara nessuno: le
        // spunte partono da tutte le squadre delle sue categorie, e chi
        // modifica puo restringerle (stesso comportamento di
        // AddTrainingForm per un allenamento pre-esistente).
        groupIds: groupIdsForCategories(groupOptions, initialData.categoryIds),
        opponent: initialData.opponent,
        location: initialData.location,
        venueMode: initialData.venueMode || "home",
        structureId: initialData.structureId || "",
        fieldId: initialData.fieldId || "",
        manualLocation: initialData.manualLocation || "",
        trainerIds: initialData.trainerIds,
        notes: initialData.notes,
        matchNumber: initialData.matchNumber,
      });
    }
  }, [initialData, groupOptions]);

  React.useEffect(() => {
    setFormData((prev) => {
      const previousAutoIds = previousAutoTrainerIdsRef.current;
      const manualTrainerIds = prev.trainerIds.filter(
        (trainerId) => !previousAutoIds.includes(trainerId),
      );
      const nextTrainerIds = Array.from(
        new Set([...autoTrainerIds, ...manualTrainerIds]),
      );

      if (
        nextTrainerIds.length === prev.trainerIds.length &&
        nextTrainerIds.every(
          (trainerId, index) => trainerId === prev.trainerIds[index],
        )
      ) {
        previousAutoTrainerIdsRef.current = autoTrainerIds;
        return prev;
      }

      previousAutoTrainerIdsRef.current = autoTrainerIds;
      return {
        ...prev,
        trainerIds: nextTrainerIds,
      };
    });
  }, [autoTrainerIds]);

  React.useEffect(() => {
    if (formData.venueMode !== "home") {
      return;
    }

    const nextStructureId =
      formData.structureId ||
      structureRecommendations[0]?.structure.id ||
      structureOptions[0]?.id ||
      "";
    const nextFieldOptions = homeFields.filter(
      (field) => field.structureId === nextStructureId,
    );
    const nextFieldId =
      formData.fieldId || nextFieldOptions[0]?.fieldId || nextFieldOptions[0]?.id || "";
    const selectedField = nextFieldOptions.find(
      (field) => (field.fieldId || field.id) === nextFieldId,
    );
    const nextLocation = selectedField?.label || selectedField?.name || "";

    if (
      nextStructureId !== formData.structureId ||
      nextFieldId !== formData.fieldId ||
      nextLocation !== formData.location
    ) {
      setFormData((prev) => ({
        ...prev,
        structureId: nextStructureId,
        fieldId: nextFieldId,
        location: nextLocation,
      }));
    }
  }, [
    formData.fieldId,
    formData.location,
    formData.structureId,
    formData.venueMode,
    homeFields,
    structureOptions,
    structureRecommendations,
  ]);

  const handleChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >,
  ) => {
    const { name, value } = e.target;
    if (name === "venueMode") {
      setFormData((prev) => ({
        ...prev,
        venueMode: value as "home" | "away",
        location:
          value === "away"
            ? prev.manualLocation
            : prev.location,
      }));
      return;
    }

    if (name === "structureId") {
      const nextFieldOptions = homeFields.filter(
        (field) => field.structureId === value,
      );
      const nextField = nextFieldOptions[0];
      setFormData((prev) => ({
        ...prev,
        structureId: value,
        fieldId: nextField?.fieldId || nextField?.id || "",
        location: nextField?.label || nextField?.name || "",
      }));
      return;
    }

    if (name === "fieldId") {
      const selectedField = fieldOptions.find(
        (field) => (field.fieldId || field.id) === value,
      );
      setFormData((prev) => ({
        ...prev,
        fieldId: value,
        location: selectedField?.label || selectedField?.name || "",
      }));
      return;
    }

    if (name === "manualLocation") {
      setFormData((prev) => ({
        ...prev,
        manualLocation: value,
        location: value,
      }));
      return;
    }

    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleTrainerChange = (trainerId: string, checked: boolean) => {
    setFormData((prev) => {
      const trainerIds = [...prev.trainerIds];
      if (checked && !trainerIds.includes(trainerId)) {
        trainerIds.push(trainerId);
      } else if (!checked && trainerIds.includes(trainerId)) {
        const index = trainerIds.indexOf(trainerId);
        trainerIds.splice(index, 1);
      }
      return { ...prev, trainerIds };
    });
  };

  /*
    Le categorie restano nel dato — titoli, compatibilita e la creazione di
    una gara per categoria in `proceedWithMatchCreation` ci ragionano ancora
    — ma si derivano dai gruppi invece di essere una seconda selezione da
    tenere allineata a mano (stessa logica di AddTrainingForm).
  */
  const handleGroupToggle = (group: TrainingGroupOption, checked: boolean) => {
    setFormData((prev) => {
      const groupIds = checked
        ? Array.from(new Set([...prev.groupIds, group.id]))
        : prev.groupIds.filter((id) => id !== group.id);

      return {
        ...prev,
        groupIds,
        categoryIds: categoryIdsFromGroups(groupOptions, groupIds),
      };
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (categoryOptions.length === 0) {
      alert("Nessuna categoria registrata. Crea prima una categoria.");
      return;
    }

    if (formData.categoryIds.length === 0) {
      alert("Seleziona almeno una categoria");
      return;
    }
    const resolvedLocation =
      formData.venueMode === "home" ? formData.location : formData.manualLocation;

    if (
      formData.venueMode === "home" &&
      (!formData.structureId || !formData.fieldId)
    ) {
      alert("Seleziona struttura e campo per la gara in casa");
      return;
    }

    if (!formData.opponent || !resolvedLocation || !formData.time) {
      alert("Compila tutti i campi obbligatori");
      return;
    }
    onSubmit({
      ...formData,
      ...toEventRsvpPayload(rsvp),
      location: resolvedLocation,
      isHome: formData.venueMode === "home",
    });
    if (!editMode) {
      resetForm();
    }
    onClose();
  };

  const resetForm = () => {
    previousAutoTrainerIdsRef.current = [];
    setFormData({
      title: "",
      date: new Date(),
      time: "",
      categoryIds: [],
      groupIds: [],
      opponent: "",
      location: "",
      venueMode: "home" as const,
      structureId: structureOptions[0]?.id || "",
      fieldId: "",
      manualLocation: "",
      trainerIds: [],
      notes: "",
      matchNumber: "",
    });
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {editMode ? "Modifica Gara" : "Aggiungi Nuova Gara"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="title">Titolo</Label>
            <Input
              id="title"
              name="title"
              value={formData.title}
              onChange={handleChange}
              placeholder="Es. Partita Under 14 vs Juventus"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Data</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-full justify-start text-left font-normal"
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {formData.date ? (
                      format(formData.date, "PPP", { locale: it })
                    ) : (
                      <span>Seleziona data</span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={formData.date}
                    onSelect={(date) =>
                      setFormData((prev) => ({
                        ...prev,
                        date: date || new Date(),
                      }))
                    }
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-2">
              <Label htmlFor="time">Orario</Label>
              <Input
                id="time"
                name="time"
                value={formData.time}
                onChange={handleChange}
                placeholder="Es. 16:30 - 18:00"
              />
            </div>
          </div>

          {categoryOptions.length > 0 ? (
            <TrainingGroupSelector
              groups={groupOptions}
              selectedGroupIds={formData.groupIds}
              onToggle={handleGroupToggle}
              idPrefix="add-match-group"
            />
          ) : (
            <div className="space-y-2">
              <Label>Categorie</Label>
              <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-700">
                Nessuna categoria registrata. Crea prima una categoria.
              </p>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="opponent">Avversario</Label>
            <Input
              id="opponent"
              name="opponent"
              value={formData.opponent}
              onChange={handleChange}
              placeholder="Es. Juventus Academy"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="venueMode">Sede gara</Label>
            <select
              id="venueMode"
              name="venueMode"
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              value={formData.venueMode}
              onChange={handleChange}
            >
              <option value="home">In casa</option>
              <option value="away">Trasferta</option>
            </select>
          </div>

          {formData.venueMode === "home" ? (
            <>
              <div className="space-y-2">
                <Label htmlFor="structureId">Struttura</Label>
                <select
                  id="structureId"
                  name="structureId"
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  value={formData.structureId}
                  onChange={handleChange}
                >
                  <option value="">Seleziona struttura...</option>
                  {structureRecommendations.map(({ structure, recommended }) => (
                    <option key={structure.id} value={structure.id}>
                      {structure.name}
                      {recommended ? " · Consigliata (stessa sede)" : ""}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="fieldId">Campo</Label>
                <select
                  id="fieldId"
                  name="fieldId"
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  value={formData.fieldId}
                  onChange={handleChange}
                >
                  <option value="">Seleziona campo...</option>
                  {fieldOptions.map((field) => (
                    <option
                      key={field.fieldId || field.id}
                      value={field.fieldId || field.id}
                    >
                      {field.fieldName || field.name}
                    </option>
                  ))}
                </select>
              </div>
            </>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="manualLocation">Campo / luogo trasferta</Label>
              <Input
                id="manualLocation"
                name="manualLocation"
                value={formData.manualLocation}
                onChange={handleChange}
                placeholder="Es. Campo Avversario, Via Roma 123"
              />
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="matchNumber">Numero di Gara</Label>
            <Input
              id="matchNumber"
              name="matchNumber"
              value={formData.matchNumber}
              onChange={handleChange}
              placeholder="Es. 12345"
            />
          </div>

          <div className="space-y-2">
            <Label>Allenatori</Label>
            <div className="border rounded-md p-3 space-y-2 max-h-40 overflow-y-auto">
              {trainers.length > 0 ? (
                trainers.map((trainer) => {
                  const isAutoAssigned = autoTrainerIds.includes(trainer.id);

                  return (
                    <div
                      key={trainer.id}
                      className="flex items-center space-x-2"
                    >
                      <Checkbox
                        id={`trainer-${trainer.id}`}
                        checked={formData.trainerIds.includes(trainer.id)}
                        onCheckedChange={(checked) =>
                          handleTrainerChange(trainer.id, checked as boolean)
                        }
                      />
                      <Label
                        htmlFor={`trainer-${trainer.id}`}
                        className="flex flex-1 items-center gap-2 text-sm font-normal"
                      >
                        <span>{trainer.name}</span>
                        {isAutoAssigned ? (
                          <span className="ml-auto rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-600">
                            Associato
                          </span>
                        ) : null}
                      </Label>
                    </div>
                  );
                })
              ) : (
                <p className="text-sm text-gray-500">
                  Nessun allenatore disponibile.
                </p>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Gli allenatori collegati alle categorie selezionate vengono
              proposti automaticamente. Puoi modificarli manualmente.
            </p>
          </div>

          <EventRsvpFields value={rsvp} onChange={setRsvp} idPrefix="add-match" />

          <div className="space-y-2">
            <Label htmlFor="notes">Note</Label>
            <Textarea
              id="notes"
              name="notes"
              value={formData.notes}
              onChange={handleChange}
              placeholder="Es. Portare divisa da trasferta"
              className="min-h-[80px]"
            />
          </div>

          <DialogFooter className="mt-6">
            <Button type="button" variant="outline" onClick={handleClose}>
              Annulla
            </Button>
            <Button
              type="submit"
              className="bg-blue-600 hover:bg-blue-700"
              disabled={categoryOptions.length === 0}
            >
              {editMode ? "Salva Modifiche" : "Aggiungi Gara"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
