"use client";

import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  uid,
  type ClubStructure,
  type FieldPricing,
  type StructureField,
} from "@/lib/structures-utils";

type StructurePricingSectionProps = {
  structure: ClubStructure;
  onChange: (structure: ClubStructure) => void;
};

const clampDuration = (value: unknown, min = 15, max = 240) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 60;
  return Math.min(max, Math.max(min, parsed));
};

function DurationCounter({
  value,
  onChange,
  min = 15,
  max = 240,
  step = 15,
}: {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  const current = clampDuration(value, min, max);

  return (
    <div className="flex h-10 w-40 items-center rounded-md border bg-white">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-9 w-9 shrink-0 rounded-r-none"
        onClick={() => onChange(clampDuration(current - step, min, max))}
        disabled={current <= min}
      >
        -
      </Button>
      <Input
        type="number"
        min={min}
        max={max}
        step={step}
        className="h-9 border-0 text-center shadow-none focus-visible:ring-0"
        value={current}
        onChange={(event) =>
          onChange(clampDuration(event.target.value, min, max))
        }
      />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-9 w-9 shrink-0 rounded-l-none"
        onClick={() => onChange(clampDuration(current + step, min, max))}
        disabled={current >= max}
      >
        +
      </Button>
    </div>
  );
}

export function StructurePricingSection({
  structure,
  onChange,
}: StructurePricingSectionProps) {
  const setFields = (fields: StructureField[]) =>
    onChange({ ...structure, fields });

  const updateFieldPricing = (
    fieldId: string,
    pricing: FieldPricing[],
  ) => {
    setFields(
      structure.fields.map((field) =>
        field.id === fieldId ? { ...field, pricing } : field,
      ),
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Tariffe</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {structure.fields.length === 0 ? (
          <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            Aggiungi un campo prima di configurare le tariffe.
          </div>
        ) : (
          structure.fields.map((field) => (
            <div key={field.id} className="rounded-lg border p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-semibold">{field.name}</p>
                  <p className="text-sm text-muted-foreground">
                    Durata e prezzo per fascia prenotabile.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    updateFieldPricing(field.id, [
                      ...field.pricing,
                      { id: uid("price"), durationMinutes: 60, price: 0 },
                    ])
                  }
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Aggiungi tariffa
                </Button>
              </div>

              <div className="mt-4 space-y-3">
                {field.pricing.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Nessuna tariffa configurata.
                  </p>
                ) : (
                  field.pricing.map((price) => (
                    <div
                      key={price.id}
                      className="flex flex-wrap items-end gap-3 rounded-md border p-3"
                    >
                      <div className="space-y-1">
                        <Label className="text-xs">Durata minuti</Label>
                        <DurationCounter
                          value={price.durationMinutes}
                          onChange={(nextDuration) =>
                            updateFieldPricing(
                              field.id,
                              field.pricing.map((item) =>
                                item.id === price.id
                                  ? {
                                      ...item,
                                      durationMinutes: nextDuration,
                                    }
                                  : item,
                              ),
                            )
                          }
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Prezzo</Label>
                        <Input
                          type="number"
                          step="0.01"
                          className="w-36"
                          value={price.price}
                          onChange={(event) =>
                            updateFieldPricing(
                              field.id,
                              field.pricing.map((item) =>
                                item.id === price.id
                                  ? { ...item, price: Number(event.target.value || 0) }
                                  : item,
                              ),
                            )
                          }
                        />
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() =>
                          updateFieldPricing(
                            field.id,
                            field.pricing.filter((item) => item.id !== price.id),
                          )
                        }
                        title="Elimina tariffa"
                      >
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
