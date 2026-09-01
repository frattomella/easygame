"use client";

import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  normalizeAvailability,
  uid,
  WEEK_DAYS,
  type AvailabilitySlot,
  type ClubStructure,
  type StructureField,
} from "@/lib/structures-utils";

type StructureFieldsSectionProps = {
  structure: ClubStructure;
  onChange: (structure: ClubStructure) => void;
};

const newField = (): StructureField => ({
  id: uid("field"),
  name: "Nuovo campo",
  ownership: "Pubblica",
  inRent: false,
  isBookable: true,
  isVisible: true,
  availability: normalizeAvailability({
    days: ["Lun", "Mer", "Ven"],
    startTime: "18:00",
    endTime: "22:00",
  }),
  /*
    W6-55. Un campo nuovo non nasce con due tariffe a zero. «€ 0,00» non
    significa gratis: significa che nessuno ha ancora scritto un importo, e la
    famiglia non deve leggere una promessa che il club non ha fatto.
  */
  pricing: [],
});

export function StructureFieldsSection({
  structure,
  onChange,
}: StructureFieldsSectionProps) {
  const setFields = (fields: StructureField[]) =>
    onChange({ ...structure, fields });

  const updateField = (fieldId: string, patch: Partial<StructureField>) => {
    setFields(
      structure.fields.map((field) =>
        field.id === fieldId ? { ...field, ...patch } : field,
      ),
    );
  };

  const updateSlot = (
    field: StructureField,
    dayKey: string,
    index: number,
    patch: Partial<AvailabilitySlot>,
  ) => {
    const slots = [...(field.availability[dayKey] || [])];
    slots[index] = { ...slots[index], ...patch };
    updateField(field.id, {
      availability: { ...field.availability, [dayKey]: slots },
    });
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle>Campi</CardTitle>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setFields([...structure.fields, newField()])}
        >
          <Plus className="mr-2 h-4 w-4" />
          Aggiungi campo
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {structure.fields.length === 0 ? (
          <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            Nessun campo configurato.
          </div>
        ) : (
          structure.fields.map((field) => (
            <div key={field.id} className="rounded-lg border p-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div className="grid flex-1 gap-3 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Nome campo</Label>
                    <Input
                      value={field.name}
                      onChange={(event) =>
                        updateField(field.id, { name: event.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Proprieta</Label>
                    <Select
                      value={field.ownership}
                      onValueChange={(value) =>
                        updateField(field.id, {
                          ownership: value as StructureField["ownership"],
                        })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Pubblica">Pubblica</SelectItem>
                        <SelectItem value="Privata">Privata</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() =>
                    setFields(structure.fields.filter((item) => item.id !== field.id))
                  }
                  title="Elimina campo"
                >
                  <Trash2 className="h-4 w-4 text-red-500" />
                </Button>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-4">
                {[
                  ["inRent", "In affitto"],
                  ["isBookable", "Prenotabile"],
                  ["isVisible", "Visibile ai tesserati"],
                ].map(([key, label]) => (
                  <div
                    key={key}
                    className="flex items-center justify-between rounded-md border p-3"
                  >
                    <Label>{label}</Label>
                    <Switch
                      checked={Boolean(field[key as keyof StructureField])}
                      onCheckedChange={(checked) =>
                        updateField(field.id, { [key]: checked } as Partial<StructureField>)
                      }
                    />
                  </div>
                ))}
              </div>

              <div className="mt-5 space-y-3">
                <p className="font-medium">Disponibilita</p>
                {WEEK_DAYS.map((day) => {
                  const slots = field.availability[day.key] || [];
                  return (
                    <div key={day.key} className="rounded-md border p-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-medium">{day.label}</p>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            updateField(field.id, {
                              availability: {
                                ...field.availability,
                                [day.key]: [
                                  ...slots,
                                  { start: "18:00", end: "22:00" },
                                ],
                              },
                            })
                          }
                        >
                          <Plus className="mr-2 h-4 w-4" />
                          Fascia
                        </Button>
                      </div>
                      <div className="mt-3 space-y-2">
                        {slots.length === 0 ? (
                          <p className="text-sm text-muted-foreground">
                            Nessuna fascia.
                          </p>
                        ) : (
                          slots.map((slot, index) => (
                            <div
                              key={`${day.key}-${index}`}
                              className="flex flex-wrap items-end gap-2"
                            >
                              <div className="space-y-1">
                                <Label className="text-xs">Inizio</Label>
                                <Input
                                  type="time"
                                  className="w-32"
                                  value={slot.start}
                                  onChange={(event) =>
                                    updateSlot(field, day.key, index, {
                                      start: event.target.value,
                                    })
                                  }
                                />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs">Fine</Label>
                                <Input
                                  type="time"
                                  className="w-32"
                                  value={slot.end}
                                  onChange={(event) =>
                                    updateSlot(field, day.key, index, {
                                      end: event.target.value,
                                    })
                                  }
                                />
                              </div>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() =>
                                  updateField(field.id, {
                                    availability: {
                                      ...field.availability,
                                      [day.key]: slots.filter((_, itemIndex) => itemIndex !== index),
                                    },
                                  })
                                }
                                title="Rimuovi fascia"
                              >
                                <Trash2 className="h-4 w-4 text-red-500" />
                              </Button>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

