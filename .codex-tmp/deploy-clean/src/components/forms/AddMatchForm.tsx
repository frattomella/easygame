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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { CalendarIcon } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";

type MatchLocationOption = {
  id: string;
  name: string;
  structureId?: string;
  structureName?: string;
  fieldId?: string;
  fieldName?: string;
  label?: string;
};

interface AddMatchFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: any) => void;
  categories: { id: string; name: string }[];
  trainers: { id: string; name: string }[];
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
  trainers,
  selectedDate,
  editMode = false,
  homeFields = [],
  initialData,
}: AddMatchFormProps) {
  const [formData, setFormData] = useState({
    title: initialData?.title || "",
    date: initialData?.date || selectedDate || new Date(),
    time: initialData?.time || "",
    categoryIds: initialData?.categoryIds || ([] as string[]),
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

  const structureOptions = React.useMemo(() => {
    const structureMap = new Map<string, { id: string; name: string }>();

    homeFields.forEach((field) => {
      if (field.structureId && field.structureName) {
        structureMap.set(field.structureId, {
          id: field.structureId,
          name: field.structureName,
        });
      }
    });

    return Array.from(structureMap.values());
  }, [homeFields]);

  const fieldOptions = React.useMemo(
    () =>
      homeFields.filter(
        (field) =>
          !formData.structureId || field.structureId === formData.structureId,
      ),
    [formData.structureId, homeFields],
  );

  // Update form data when initialData changes
  React.useEffect(() => {
    if (initialData) {
      setFormData({
        title: initialData.title,
        date: initialData.date,
        time: initialData.time,
        categoryIds: initialData.categoryIds,
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
  }, [initialData]);

  React.useEffect(() => {
    if (formData.venueMode !== "home") {
      return;
    }

    const nextStructureId =
      formData.structureId || structureOptions[0]?.id || "";
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

  const handleCategoryChange = (categoryId: string, checked: boolean) => {
    setFormData((prev) => {
      const categoryIds = [...prev.categoryIds];
      if (checked && !categoryIds.includes(categoryId)) {
        categoryIds.push(categoryId);
      } else if (!checked && categoryIds.includes(categoryId)) {
        const index = categoryIds.indexOf(categoryId);
        categoryIds.splice(index, 1);
      }
      return { ...prev, categoryIds };
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
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
      location: resolvedLocation,
      isHome: formData.venueMode === "home",
    });
    if (!editMode) {
      resetForm();
    }
    onClose();
  };

  const resetForm = () => {
    setFormData({
      title: "",
      date: new Date(),
      time: "",
      categoryIds: [],
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
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
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

          <div className="space-y-2">
            <Label>Categorie</Label>
            <div className="border rounded-md p-3 space-y-2 max-h-40 overflow-y-auto">
              {categories.map((category) => (
                <div key={category.id} className="flex items-center space-x-2">
                  <Checkbox
                    id={`category-${category.id}`}
                    checked={formData.categoryIds.includes(category.id)}
                    onCheckedChange={(checked) =>
                      handleCategoryChange(category.id, checked as boolean)
                    }
                  />
                  <Label
                    htmlFor={`category-${category.id}`}
                    className="text-sm font-normal"
                  >
                    {category.name}
                  </Label>
                </div>
              ))}
            </div>
          </div>

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
                  {structureOptions.map((structure) => (
                    <option key={structure.id} value={structure.id}>
                      {structure.name}
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
              {trainers.map((trainer) => (
                <div key={trainer.id} className="flex items-center space-x-2">
                  <Checkbox
                    id={`trainer-${trainer.id}`}
                    checked={formData.trainerIds.includes(trainer.id)}
                    onCheckedChange={(checked) =>
                      handleTrainerChange(trainer.id, checked as boolean)
                    }
                  />
                  <Label
                    htmlFor={`trainer-${trainer.id}`}
                    className="text-sm font-normal"
                  >
                    {trainer.name}
                  </Label>
                </div>
              ))}
            </div>
          </div>

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
            <Button type="submit" className="bg-blue-600 hover:bg-blue-700">
              {editMode ? "Salva Modifiche" : "Aggiungi Gara"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
