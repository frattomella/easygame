"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast-notification";
import {
  findTrainingLocationOption,
  getStructureFieldOptions,
  type TrainingLocationOption,
} from "@/lib/training-location-options";
import { getAssociatedTrainerIds } from "@/lib/trainer-utils";
import { isValidTimeRange } from "@/lib/training-utils";

interface AddTrainingFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: any) => void;
  categories: { id: string; name: string }[];
  trainers?: { id: string; name: string; categories?: any[] }[];
  locations?: TrainingLocationOption[];
  selectedDate?: Date;
  isAppointment?: boolean;
  availableTimes?: string[];
}

export function AddTrainingForm({
  isOpen,
  onClose,
  onSubmit,
  categories = [],
  trainers = [],
  locations = [],
  selectedDate,
  isAppointment = false,
  availableTimes = [],
}: AddTrainingFormProps) {
  const { showToast } = useToast();
  const [formData, setFormData] = useState({
    title: "",
    date: selectedDate
      ? selectedDate.toISOString().split("T")[0]
      : new Date().toISOString().split("T")[0],
    time: "18:00",
    endTime: "19:30",
    categories: [] as string[],
    trainerIds: [] as string[],
    structureId: "",
    locationId: "",
    location: "",
    contactName: "",
    athleteName: "",
    description: "",
  });
  const previousAutoTrainerIdsRef = React.useRef<string[]>([]);

  const structureOptions = React.useMemo(() => {
    const structureMap = new Map<string, { id: string; name: string }>();

    locations.forEach((location) => {
      if (!structureMap.has(location.structureId)) {
        structureMap.set(location.structureId, {
          id: location.structureId,
          name: location.structureName,
        });
      }
    });

    return Array.from(structureMap.values());
  }, [locations]);

  const availableFields = React.useMemo(
    () => getStructureFieldOptions(locations, formData.structureId),
    [locations, formData.structureId],
  );

  const autoTrainerIds = React.useMemo(
    () => getAssociatedTrainerIds(trainers, formData.categories, categories),
    [trainers, formData.categories, categories],
  );

  React.useEffect(() => {
    if (!isOpen || isAppointment) {
      return;
    }

    if (!structureOptions.length) {
      return;
    }

    const matchedLocation = findTrainingLocationOption(locations, {
      structureId: formData.structureId,
      fieldId: formData.locationId,
      location: formData.location,
    });

    const nextStructureId =
      matchedLocation?.structureId || formData.structureId || structureOptions[0].id;
    const nextFields = getStructureFieldOptions(locations, nextStructureId);
    const nextFieldId =
      matchedLocation?.fieldId ||
      (nextFields.some((field) => field.id === formData.locationId)
        ? formData.locationId
        : nextFields[0]?.id || "");
    const nextLocation = findTrainingLocationOption(locations, {
      structureId: nextStructureId,
      fieldId: nextFieldId,
    });

    if (
      nextStructureId !== formData.structureId ||
      nextFieldId !== formData.locationId ||
      (nextLocation?.name || "") !== formData.location
    ) {
      setFormData((prev) => ({
        ...prev,
        structureId: nextStructureId,
        locationId: nextFieldId,
        location: nextLocation?.name || "",
      }));
    }
  }, [
    isOpen,
    isAppointment,
    locations,
    structureOptions,
    formData.structureId,
    formData.locationId,
    formData.location,
  ]);

  React.useEffect(() => {
    if (isAppointment) {
      return;
    }

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
        nextTrainerIds.every((trainerId, index) => trainerId === prev.trainerIds[index])
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
  }, [autoTrainerIds, isAppointment]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    const { name, value } = e.target;
    if (name === "structureId") {
      const nextFields = getStructureFieldOptions(locations, value);
      const nextFieldId = nextFields[0]?.id || "";
      const nextLocation = findTrainingLocationOption(locations, {
        structureId: value,
        fieldId: nextFieldId,
      });
      setFormData((prev) => ({
        ...prev,
        structureId: value,
        locationId: nextFieldId,
        location: nextLocation?.name || "",
      }));
      return;
    }

    if (name === "locationId") {
      const nextLocation = findTrainingLocationOption(locations, {
        structureId: formData.structureId,
        fieldId: value,
      });
      setFormData((prev) => ({
        ...prev,
        locationId: value,
        location: nextLocation?.name || "",
      }));
      return;
    }

    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleCategoryChange = (categoryId: string, checked: boolean) => {
    setFormData((prev) => {
      const categories = [...prev.categories];
      if (checked && !categories.includes(categoryId)) {
        categories.push(categoryId);
      } else if (!checked && categories.includes(categoryId)) {
        const index = categories.indexOf(categoryId);
        categories.splice(index, 1);
      }
      return { ...prev, categories };
    });
  };

  const handleTrainerToggle = (trainerId: string, checked: boolean) => {
    setFormData((prev) => {
      const trainerIds = new Set(prev.trainerIds);
      if (checked) {
        trainerIds.add(trainerId);
      } else {
        trainerIds.delete(trainerId);
      }

      return {
        ...prev,
        trainerIds: Array.from(trainerIds),
      };
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Validate form
    if (
      !formData.title ||
      !formData.date ||
      !formData.time ||
      (isAppointment
        ? !formData.contactName
        : formData.categories.length === 0 ||
          !formData.structureId ||
          !formData.locationId ||
          formData.trainerIds.length === 0)
    ) {
      showToast("error", "Compila tutti i campi obbligatori");
      return;
    }

    if (
      !isAppointment &&
      !isValidTimeRange(formData.time, formData.endTime)
    ) {
      showToast(
        "error",
        "L'orario di fine deve essere successivo all'orario di inizio",
      );
      return;
    }

    // Submit form
    onSubmit({
      ...formData,
      trainers: formData.trainerIds,
      status: "upcoming",
      attendees: 0,
    });

    // Reset form
    setFormData({
      title: "",
      date: selectedDate
        ? selectedDate.toISOString().split("T")[0]
        : new Date().toISOString().split("T")[0],
      time: "18:00",
      endTime: "19:30",
      categories: [],
      trainerIds: [],
      structureId: structureOptions[0]?.id || "",
      locationId: "",
      location: "",
      contactName: "",
      athleteName: "",
      description: "",
    });
    previousAutoTrainerIdsRef.current = [];

    // Close modal
    onClose();

    // Show success toast
    showToast(
      "success",
      isAppointment
        ? "Appuntamento aggiunto con successo"
        : "Allenamento aggiunto con successo",
    );
  };

  return (
    <Modal
      title={
        isAppointment
          ? "Aggiungi Nuovo Appuntamento"
          : "Aggiungi Nuovo Allenamento"
      }
      description={
        isAppointment
          ? "Inserisci i dettagli del nuovo appuntamento"
          : "Inserisci i dettagli del nuovo allenamento"
      }
      isOpen={isOpen}
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Annulla
          </Button>
          <Button
            onClick={handleSubmit}
            className="bg-blue-600 hover:bg-blue-700"
          >
            Salva
          </Button>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="title">Titolo</Label>
          <Input
            id="title"
            name="title"
            value={formData.title}
            onChange={handleChange}
            placeholder="Es. Allenamento settimanale"
            required
          />
        </div>

        <div className={`grid gap-4 ${isAppointment ? "grid-cols-2" : "grid-cols-3"}`}>
          <div className="space-y-2">
            <Label htmlFor="date">Data</Label>
            <Input
              id="date"
              name="date"
              type="date"
              value={formData.date}
              onChange={handleChange}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="time">{isAppointment ? "Ora" : "Ora inizio"}</Label>
            {availableTimes.length > 0 ? (
              <select
                id="time"
                name="time"
                value={formData.time}
                onChange={handleChange}
                className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
                required
              >
                <option value="" disabled>
                  Seleziona un orario
                </option>
                {availableTimes.map((time) => (
                  <option key={time} value={time}>
                    {time}
                  </option>
                ))}
              </select>
            ) : (
              <Input
                id="time"
                name="time"
                type="time"
                value={formData.time}
                onChange={handleChange}
                required
              />
            )}
          </div>

          {!isAppointment && (
            <div className="space-y-2">
              <Label htmlFor="endTime">Ora fine</Label>
              <Input
                id="endTime"
                name="endTime"
                type="time"
                value={formData.endTime}
                onChange={handleChange}
                required
              />
            </div>
          )}
        </div>

        {!isAppointment ? (
          <>
            <div className="space-y-2">
              <Label>Categorie</Label>
              <div className="border rounded-md p-3 max-h-32 overflow-y-auto">
                {categories.length > 0 ? (
                  categories.map((category) => (
                    <div
                      key={category.id}
                      className="flex items-center space-x-2 mb-2"
                    >
                      <input
                        type="checkbox"
                        id={`category-${category.id}`}
                        checked={formData.categories.includes(category.id)}
                        onChange={(e) =>
                          handleCategoryChange(category.id, e.target.checked)
                        }
                        className="h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                      />
                      <Label
                        htmlFor={`category-${category.id}`}
                        className="text-sm"
                      >
                        {category.name}
                      </Label>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-gray-500">
                    Nessuna categoria disponibile
                  </p>
                )}
              </div>
              {formData.categories.length === 0 && (
                <p className="text-xs text-red-500">
                  Seleziona almeno una categoria
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Allenatori</Label>
              <div className="rounded-md border p-3">
                {trainers.length > 0 ? (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {trainers.map((trainer) => {
                      const isAutoAssigned = autoTrainerIds.includes(trainer.id);
                      return (
                        <label
                          key={trainer.id}
                          className="flex items-center gap-2 rounded-md border border-transparent px-2 py-1 text-sm hover:bg-muted/50"
                        >
                          <input
                            type="checkbox"
                            checked={formData.trainerIds.includes(trainer.id)}
                            onChange={(event) =>
                              handleTrainerToggle(trainer.id, event.target.checked)
                            }
                            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          />
                          <span className="flex-1">{trainer.name}</span>
                          {isAutoAssigned && (
                            <span className="text-[11px] font-medium text-blue-600">
                              Associato
                            </span>
                          )}
                        </label>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-gray-500">
                    Nessun allenatore disponibile
                  </p>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Gli allenatori collegati alle categorie selezionate vengono
                proposti automaticamente. Puoi aggiungerne altri manualmente.
              </p>
              {formData.trainerIds.length === 0 && (
                <p className="text-xs text-red-500">
                  Seleziona almeno un allenatore
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="location">Luogo</Label>
              <select
                id="structureId"
                name="structureId"
                value={formData.structureId}
                onChange={handleChange}
                className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
                required
              >
                <option value="" disabled>
                  Seleziona una struttura
                </option>
                {structureOptions.length > 0 ? (
                  structureOptions.map((structure) => (
                    <option key={structure.id} value={structure.id}>
                      {structure.name}
                    </option>
                  ))
                ) : (
                  <option value="" disabled>
                    Nessuna struttura disponibile
                  </option>
                )}
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="locationId">Campo della struttura</Label>
              <select
                id="locationId"
                name="locationId"
                value={formData.locationId}
                onChange={handleChange}
                className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
                required
              >
                <option value="" disabled>
                  Seleziona un campo
                </option>
                {availableFields.length > 0 ? (
                  availableFields.map((field) => (
                    <option key={field.id} value={field.id}>
                      {field.name}
                    </option>
                  ))
                ) : (
                  <option value="" disabled>
                    Nessun campo disponibile
                  </option>
                )}
              </select>
            </div>
          </>
        ) : (
          <>
            <div className="space-y-2">
              <Label htmlFor="contactName">Nome Richiedente</Label>
              <Input
                id="contactName"
                name="contactName"
                value={formData.contactName}
                onChange={handleChange}
                placeholder="Es. Marco Bianchi"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="athleteName">Nome Atleta (se applicabile)</Label>
              <Input
                id="athleteName"
                name="athleteName"
                value={formData.athleteName}
                onChange={handleChange}
                placeholder="Es. Luca Bianchi"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Descrizione</Label>
              <Input
                id="description"
                name="description"
                value={formData.description}
                onChange={handleChange}
                placeholder="Descrizione dell'appuntamento"
              />
            </div>
          </>
        )}
      </form>
    </Modal>
  );
}
