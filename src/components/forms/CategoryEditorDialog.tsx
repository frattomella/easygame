"use client";

import React, { useState } from "react";
import { normalizeCategoryBirthYears } from "@/lib/category-utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast-notification";

const currentYear = new Date().getFullYear();
const birthYearOptions = Array.from({ length: 80 }, (_, index) =>
  String(currentYear - index),
);

export const CATEGORY_DESCRIPTION_MAX_LENGTH = 25;

interface CategoryEditorDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: any) => Promise<boolean | void> | boolean | void;
  initialData?: any;
  isEditing?: boolean;
  availableTrainers?: {
    id: string;
    name: string;
  }[];
  initialAssignedTrainerIds?: string[];
}

const getInitialFormState = (
  initialData?: any,
  initialAssignedTrainerIds: string[] = [],
) => {
  const birthYears = normalizeCategoryBirthYears(initialData || {});

  return {
    name: initialData?.name || "",
    description: initialData?.sport || initialData?.description || "",
    birthYearFrom: birthYears.birthYearFrom?.toString() || "",
    birthYearTo: birthYears.birthYearTo?.toString() || "",
    color: initialData?.color || "bg-blue-500 text-white",
    assignedTrainerIds: initialAssignedTrainerIds,
  };
};

export function CategoryEditorDialog({
  isOpen,
  onClose,
  onSubmit,
  initialData,
  isEditing = false,
  availableTrainers = [],
  initialAssignedTrainerIds = [],
}: CategoryEditorDialogProps) {
  const { showToast } = useToast();
  const [formData, setFormData] = useState(
    getInitialFormState(initialData, initialAssignedTrainerIds),
  );

  React.useEffect(() => {
    setFormData(getInitialFormState(initialData, initialAssignedTrainerIds));
  }, [initialData, initialAssignedTrainerIds, isOpen]);

  const colorOptions = [
    { value: "bg-blue-500 text-white", label: "Blu" },
    { value: "bg-green-500 text-white", label: "Verde" },
    { value: "bg-red-500 text-white", label: "Rosso" },
    { value: "bg-yellow-500 text-white", label: "Giallo" },
    { value: "bg-purple-500 text-white", label: "Viola" },
    { value: "bg-pink-500 text-white", label: "Rosa" },
    { value: "bg-indigo-500 text-white", label: "Indaco" },
    { value: "bg-orange-500 text-white", label: "Arancione" },
  ];

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleTrainerToggle = (trainerId: string) => {
    setFormData((prev) => ({
      ...prev,
      assignedTrainerIds: prev.assignedTrainerIds.includes(trainerId)
        ? prev.assignedTrainerIds.filter((id: string) => id !== trainerId)
        : [...prev.assignedTrainerIds, trainerId],
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const birthYearFrom = Number(formData.birthYearFrom);
    const birthYearTo = Number(formData.birthYearTo);

    if (!formData.name.trim()) {
      showToast("error", "Il nome categoria e' obbligatorio");
      return;
    }

    if (!Number.isInteger(birthYearFrom) || !Number.isInteger(birthYearTo)) {
      showToast(
        "error",
        "Inserisci un anno di nascita iniziale e finale validi",
      );
      return;
    }

    if (birthYearFrom > birthYearTo) {
      showToast(
        "error",
        "L'anno di nascita iniziale non puo' essere maggiore di quello finale",
      );
      return;
    }

    const trimmedDescription = formData.description.trim();
    if (trimmedDescription.length > CATEGORY_DESCRIPTION_MAX_LENGTH) {
      showToast(
        "error",
        `La descrizione categoria deve essere al massimo ${CATEGORY_DESCRIPTION_MAX_LENGTH} caratteri`,
      );
      return;
    }

    try {
      const result = await onSubmit({
        ...formData,
        name: formData.name.trim(),
        description: trimmedDescription,
        birthYearFrom,
        birthYearTo,
        ageRange:
          birthYearFrom === birthYearTo
            ? String(birthYearFrom)
            : `${birthYearFrom}-${birthYearTo}`,
        athletesCount: initialData?.athletesCount || 0,
        trainersCount: initialData?.trainersCount || 0,
        trainingsPerWeek: initialData?.trainingsPerWeek || 0,
        assignedTrainerIds: formData.assignedTrainerIds,
      });

      if (result === false) {
        return;
      }

      setFormData(getInitialFormState());
      onClose();
    } catch (error: any) {
      console.error("Error submitting category:", error);

      if (error.message?.includes("Impossibile connettersi")) {
        showToast(
          "error",
          "Problema di connessione al database. Riprova piu' tardi.",
        );
      } else if (error.message?.includes("Risorse insufficienti")) {
        showToast("error", "Server sovraccarico. Riprova tra qualche secondo.");
      } else {
        showToast("error", "Errore durante il salvataggio. Riprova.");
      }
    }
  };

  return (
    <Modal
      title={isEditing ? "Modifica Categoria" : "Aggiungi Nuova Categoria"}
      description={
        isEditing
          ? "Modifica i dettagli della categoria"
          : "Inserisci i dettagli della nuova categoria"
      }
      isOpen={isOpen}
      onClose={onClose}
      contentClassName="sm:max-w-2xl"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Annulla
          </Button>
          <Button
            type="submit"
            onClick={handleSubmit}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {isEditing ? "Aggiorna" : "Salva"}
          </Button>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="name">Nome Categoria</Label>
          <Input
            id="name"
            name="name"
            value={formData.name}
            onChange={handleChange}
            placeholder="Es. Under 14"
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="description">Descrizione</Label>
          <Input
            id="description"
            name="description"
            value={formData.description}
            onChange={handleChange}
            placeholder="Es. Calcio a 5"
            maxLength={CATEGORY_DESCRIPTION_MAX_LENGTH}
          />
          <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
            <span>
              Massimo 25 caratteri. La descrizione viene mostrata come badge.
            </span>
            <span>
              {formData.description.length}/{CATEGORY_DESCRIPTION_MAX_LENGTH}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="birthYearFrom">Anno di nascita dal</Label>
            <select
              id="birthYearFrom"
              name="birthYearFrom"
              value={formData.birthYearFrom}
              onChange={handleChange}
              className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
              required
            >
              <option value="" disabled>
                Seleziona anno
              </option>
              {birthYearOptions.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="birthYearTo">Anno di nascita al</Label>
            <select
              id="birthYearTo"
              name="birthYearTo"
              value={formData.birthYearTo}
              onChange={handleChange}
              className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
              required
            >
              <option value="" disabled>
                Seleziona anno
              </option>
              {birthYearOptions.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </div>
        </div>

        <p className="text-sm text-muted-foreground">
          Gli atleti potranno essere collegati automaticamente a questa
          categoria in base al loro anno di nascita.
        </p>

        <div className="space-y-2">
          <Label htmlFor="color">Colore</Label>
          <select
            id="color"
            name="color"
            value={formData.color}
            onChange={handleChange}
            className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
          >
            {colorOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-3">
          <div>
            <Label>Assegnazione rapida allenatori</Label>
            <p className="text-sm text-muted-foreground mt-1">
              Un allenatore può essere assegnato a più categorie.
            </p>
          </div>

          <div className="rounded-xl border border-border bg-muted/30 p-4">
            {availableTrainers.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nessun allenatore disponibile nel club.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {availableTrainers.map((trainer) => {
                  const selected = formData.assignedTrainerIds.includes(
                    trainer.id,
                  );

                  return (
                    <Button
                      key={trainer.id}
                      type="button"
                      variant={selected ? "default" : "outline"}
                      size="sm"
                      className={selected ? "bg-blue-600 hover:bg-blue-700" : ""}
                      onClick={() => handleTrainerToggle(trainer.id)}
                    >
                      {trainer.name}
                    </Button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </form>
    </Modal>
  );
}
