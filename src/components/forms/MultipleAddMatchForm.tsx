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
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { CalendarIcon, Plus, Trash } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";

interface MultipleAddMatchFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: any[]) => void;
  categories: { id: string; name: string }[];
  trainers: { id: string; name: string }[];
  selectedDate?: Date;
  homeFields?: { id: string; name: string }[];
}

interface MatchEntry {
  opponent: string;
  location: string;
  date: Date;
  time: string;
  matchNumber: string;
}

export function MultipleAddMatchForm({
  isOpen,
  onClose,
  onSubmit,
  categories,
  trainers,
  selectedDate,
  homeFields = [],
}: MultipleAddMatchFormProps) {
  const [categoryIds, setCategoryIds] = useState<string[]>([]);
  const [trainerIds, setTrainerIds] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [matchEntries, setMatchEntries] = useState<MatchEntry[]>([
    {
      opponent: "",
      location: "",
      date: selectedDate || new Date(),
      time: "",
      matchNumber: "",
    },
  ]);

  const handleTrainerChange = (trainerId: string, checked: boolean) => {
    setTrainerIds((prev) => {
      if (checked && !prev.includes(trainerId)) {
        return [...prev, trainerId];
      } else if (!checked && prev.includes(trainerId)) {
        return prev.filter((id) => id !== trainerId);
      }
      return prev;
    });
  };

  const handleCategoryChange = (categoryId: string, checked: boolean) => {
    setCategoryIds((prev) => {
      if (checked && !prev.includes(categoryId)) {
        return [...prev, categoryId];
      } else if (!checked && prev.includes(categoryId)) {
        return prev.filter((id) => id !== categoryId);
      }
      return prev;
    });
  };

  const handleAddMatchEntry = () => {
    setMatchEntries([
      ...matchEntries,
      {
        opponent: "",
        location: "",
        date: selectedDate || new Date(),
        time: "",
        matchNumber: "",
      },
    ]);
  };

  const handleRemoveMatchEntry = (index: number) => {
    if (matchEntries.length > 1) {
      setMatchEntries(matchEntries.filter((_, i) => i !== index));
    }
  };

  const handleMatchEntryChange = (
    index: number,
    field: keyof MatchEntry,
    value: any,
  ) => {
    const updatedEntries = [...matchEntries];
    updatedEntries[index] = {
      ...updatedEntries[index],
      [field]: value,
    };
    setMatchEntries(updatedEntries);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Validate required fields
    if (categoryIds.length === 0) {
      alert("Seleziona almeno una categoria");
      return;
    }

    // Validate each match entry
    for (let i = 0; i < matchEntries.length; i++) {
      const entry = matchEntries[i];
      if (!entry.opponent || !entry.location || !entry.time) {
        alert(`Compila tutti i campi obbligatori per la partita ${i + 1}`);
        return;
      }
    }

    // Prepare data for submission
    const matchesData = matchEntries.map((entry) => ({
      title: `Partita vs ${entry.opponent}`,
      categoryIds,
      trainerIds,
      notes,
      opponent: entry.opponent,
      location: entry.location,
      date: entry.date,
      time: entry.time,
      matchNumber: entry.matchNumber,
    }));

    onSubmit(matchesData);
    resetForm();
  };

  const resetForm = () => {
    setCategoryIds([]);
    setTrainerIds([]);
    setNotes("");
    setMatchEntries([
      {
        opponent: "",
        location: "",
        date: new Date(),
        time: "",
        matchNumber: "",
      },
    ]);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Aggiungi Multiple Gare</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Categorie</Label>
            <div className="border rounded-md p-3 space-y-2 max-h-40 overflow-y-auto">
              {categories.map((category) => (
                <div key={category.id} className="flex items-center space-x-2">
                  <Checkbox
                    id={`category-${category.id}`}
                    checked={categoryIds.includes(category.id)}
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
            <Label>Allenatori</Label>
            <div className="border rounded-md p-3 space-y-2 max-h-40 overflow-y-auto">
              {trainers.map((trainer) => (
                <div key={trainer.id} className="flex items-center space-x-2">
                  <Checkbox
                    id={`trainer-${trainer.id}`}
                    checked={trainerIds.includes(trainer.id)}
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
            <Label htmlFor="notes">Note (comuni a tutte le gare)</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Es. Portare divisa da trasferta"
              className="min-h-[80px]"
            />
          </div>

          <div className="border-t pt-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-medium">Dettagli Partite</h3>
              <Button
                type="button"
                onClick={handleAddMatchEntry}
                variant="outline"
                size="sm"
              >
                <Plus className="h-4 w-4 mr-2" /> Aggiungi Partita
              </Button>
            </div>

            {matchEntries.map((entry, index) => (
              <div key={index} className="border rounded-md p-4 mb-4">
                <div className="flex justify-between items-center mb-3">
                  <h4 className="font-medium">Partita {index + 1}</h4>
                  {matchEntries.length > 1 && (
                    <Button
                      type="button"
                      onClick={() => handleRemoveMatchEntry(index)}
                      variant="ghost"
                      size="sm"
                      className="text-red-600 hover:text-red-800 hover:bg-red-50"
                    >
                      <Trash className="h-4 w-4" />
                    </Button>
                  )}
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
                          {entry.date ? (
                            format(entry.date, "PPP", { locale: it })
                          ) : (
                            <span>Seleziona data</span>
                          )}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0">
                        <Calendar
                          mode="single"
                          selected={entry.date}
                          onSelect={(date) =>
                            handleMatchEntryChange(
                              index,
                              "date",
                              date || new Date(),
                            )
                          }
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor={`time-${index}`}>Orario</Label>
                    <Input
                      id={`time-${index}`}
                      value={entry.time}
                      onChange={(e) =>
                        handleMatchEntryChange(index, "time", e.target.value)
                      }
                      placeholder="Es. 16:30 - 18:00"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor={`opponent-${index}`}>Avversario</Label>
                    <Input
                      id={`opponent-${index}`}
                      value={entry.opponent}
                      onChange={(e) =>
                        handleMatchEntryChange(
                          index,
                          "opponent",
                          e.target.value,
                        )
                      }
                      placeholder="Es. Juventus Academy"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor={`location-${index}`}>Luogo</Label>
                    <select
                      className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      value={entry.location}
                      onChange={(e) =>
                        handleMatchEntryChange(
                          index,
                          "location",
                          e.target.value,
                        )
                      }
                    >
                      <option value="">Seleziona campo...</option>
                      {homeFields.map((field) => (
                        <option key={field.id} value={field.name}>
                          🏠 {field.name}
                        </option>
                      ))}
                    </select>
                    {entry.location === "" && (
                      <Input
                        placeholder="Es. Campo Avversario, Via Roma 123"
                        onChange={(e) =>
                          handleMatchEntryChange(
                            index,
                            "location",
                            e.target.value,
                          )
                        }
                        className="mt-2"
                      />
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor={`matchNumber-${index}`}>
                      Numero di Gara
                    </Label>
                    <Input
                      id={`matchNumber-${index}`}
                      value={entry.matchNumber}
                      onChange={(e) =>
                        handleMatchEntryChange(
                          index,
                          "matchNumber",
                          e.target.value,
                        )
                      }
                      placeholder="Es. 12345"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          <DialogFooter className="mt-6">
            <Button type="button" variant="outline" onClick={handleClose}>
              Annulla
            </Button>
            <Button type="submit" className="bg-blue-600 hover:bg-blue-700">
              Salva Tutte le Gare
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
