"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast-notification";
import { normalizeCategoryBirthYears } from "@/lib/category-utils";

interface AddCategoryFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: any) => void;
  initialData?: any;
  isEditing?: boolean;
}

export function AddCategoryForm({
  isOpen,
  onClose,
  onSubmit,
  initialData,
  isEditing = false,
}: AddCategoryFormProps) {
  const { showToast } = useToast();
  const initialBirthYears = normalizeCategoryBirthYears(initialData || {});
  const [formData, setFormData] = useState({
    name: initialData?.name || "",
    description: initialData?.sport || "",
    birthYearFrom: initialBirthYears.birthYearFrom?.toString() || "",
    birthYearTo: initialBirthYears.birthYearTo?.toString() || "",
    color: initialData?.color || "bg-blue-500 text-white",
  });

  // Update form data when initialData changes
  React.useEffect(() => {
    if (initialData) {
      const birthYears = normalizeCategoryBirthYears(initialData);
      setFormData({
        name: initialData.name || "",
        description: initialData.sport || initialData.description || "",
        birthYearFrom: birthYears.birthYearFrom?.toString() || "",
        birthYearTo: birthYears.birthYearTo?.toString() || "",
        color: initialData.color || "bg-blue-500 text-white",
      });
      return;
    }

    setFormData({
      name: "",
      description: "",
      birthYearFrom: "",
      birthYearTo: "",
      color: "bg-blue-500 text-white",
    });
  }, [initialData]);

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const birthYearFrom = Number(formData.birthYearFrom);
    const birthYearTo = Number(formData.birthYearTo);

    // Validate form
    if (!formData.name?.trim() || !formData.ageRange?.trim()) {
      showToast("error", "Nome categoria e fascia d'età sono obbligatori");
      return;
    }

    console.log("Form submission started:", formData);

    try {
      // Show loading state
      const submitButton = document.querySelector(
        'button[type="submit"]',
      ) as HTMLButtonElement;
      if (submitButton) {
        submitButton.disabled = true;
        submitButton.textContent = isEditing
          ? "Aggiornamento..."
          : "Salvataggio...";
      }

      // Submit form and wait for completion
      await onSubmit({
        ...formData,
        name: formData.name.trim(),
        description: formData.description?.trim() || "",
        ageRange: formData.ageRange.trim(),
        athletesCount: 0,
        trainersCount: 0,
        trainingsPerWeek: 0,
      });

      console.log("Form submission completed successfully");

      // Reset form only after successful submission
      setFormData({
        name: "",
        description: "",
        ageRange: "",
        color: "bg-blue-500 text-white",
      });

      // Close modal only after successful submission
      onClose();
    } catch (error: any) {
      console.error("Error submitting category:", error);
      // Show a more user-friendly error message
      if (error.message?.includes("Impossibile connettersi")) {
        showToast(
          "error",
          "Problema di connessione al database. Riprova più tardi.",
        );
      } else if (error.message?.includes("Risorse insufficienti")) {
        showToast("error", "Server sovraccarico. Riprova tra qualche secondo.");
      } else {
        showToast("error", "Errore durante il salvataggio. Riprova.");
      }
    } finally {
      // Reset button state
      const submitButton = document.querySelector(
        'button[type="submit"]',
      ) as HTMLButtonElement;
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = isEditing ? "Aggiorna" : "Salva";
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
      <form onSubmit={handleSubmit} className="space-y-4">
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
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="ageRange">Fascia d'Età</Label>
          <Input
            id="ageRange"
            name="ageRange"
            value={formData.ageRange}
            onChange={handleChange}
            placeholder="Es. 12-14"
            required
          />
        </div>

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
      </form>
    </Modal>
  );
}
