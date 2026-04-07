"use client";

import React, { useMemo, useState } from "react";
import {
  findCategoryForBirthDate,
  formatCategoryBirthYears,
} from "@/lib/category-utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast-notification";

interface AthleteQuickCreateDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: any) => Promise<boolean | void> | boolean | void;
  categories: {
    id: string;
    name: string;
    birthYearFrom?: number;
    birthYearTo?: number;
  }[];
}

const getInitialFormState = () => ({
  firstName: "",
  lastName: "",
  birthDate: "",
  categoryId: "",
});

export function AthleteQuickCreateDialog({
  isOpen,
  onClose,
  onSubmit,
  categories = [],
}: AthleteQuickCreateDialogProps) {
  const { showToast } = useToast();
  const [formData, setFormData] = useState(getInitialFormState());

  React.useEffect(() => {
    if (!isOpen) {
      setFormData(getInitialFormState());
    }
  }, [isOpen]);

  const suggestedCategory = useMemo(
    () => findCategoryForBirthDate(formData.birthDate, categories),
    [formData.birthDate, categories],
  );

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (
      !formData.firstName.trim() ||
      !formData.lastName.trim() ||
      !formData.birthDate
    ) {
      showToast("error", "Nome, cognome e data di nascita sono obbligatori");
      return;
    }

    try {
      const result = await onSubmit({
        firstName: formData.firstName.trim(),
        lastName: formData.lastName.trim(),
        birthDate: formData.birthDate,
        categoryId: formData.categoryId || suggestedCategory?.id || "",
      });

      if (result === false) {
        return;
      }

      setFormData(getInitialFormState());
      onClose();
    } catch (error) {
      console.error("Error creating athlete:", error);
      showToast("error", "Errore durante la creazione dell'atleta");
    }
  };

  return (
    <Modal
      title="Aggiungi Nuovo Atleta"
      description="Inserisci solo le informazioni iniziali dell'atleta"
      isOpen={isOpen}
      onClose={onClose}
      contentClassName="sm:max-w-xl"
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
            Salva
          </Button>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="firstName">Nome</Label>
            <Input
              id="firstName"
              name="firstName"
              value={formData.firstName}
              onChange={handleChange}
              placeholder="Es. Mario"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="lastName">Cognome</Label>
            <Input
              id="lastName"
              name="lastName"
              value={formData.lastName}
              onChange={handleChange}
              placeholder="Es. Rossi"
              required
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="birthDate">Data di nascita</Label>
          <Input
            id="birthDate"
            name="birthDate"
            type="date"
            value={formData.birthDate}
            onChange={handleChange}
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="categoryId">Categoria (opzionale)</Label>
          <select
            id="categoryId"
            name="categoryId"
            value={formData.categoryId}
            onChange={handleChange}
            className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
          >
            <option value="">Collegamento automatico per anno di nascita</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name} - {formatCategoryBirthYears(category)}
              </option>
            ))}
          </select>
        </div>

        {suggestedCategory && !formData.categoryId ? (
          <p className="text-sm text-muted-foreground">
            Categoria suggerita in automatico:{" "}
            <span className="font-medium text-foreground">
              {suggestedCategory.name}
            </span>
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            Le altre informazioni verranno completate nella scheda atleta.
          </p>
        )}
      </form>
    </Modal>
  );
}
