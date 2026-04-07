"use client";

import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Trash2, Plus, Shirt, Info } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface KitComponent {
  id: string;
  name: string;
  selected: boolean;
  jerseyNumber?: number;
  size?: string;
  notes?: string;
  deliveryStatus?: "pending" | "processing" | "shipped" | "delivered";
}

interface CustomKitComponentsBuilderProps {
  value: KitComponent[];
  onChange: (components: KitComponent[]) => void;
  defaultComponents?: KitComponent[];
  categoryId?: string;
  availableJerseyNumbers?: number[];
  availableSizes?: string[];
  onJerseyNumberChange?: (componentId: string, number: number) => void;
  showSizeFields?: boolean;
  showJerseyNumbers?: boolean;
  showDeliveryStatus?: boolean;
  showNotesField?: boolean;
}

export function CustomKitComponentsBuilder({
  value,
  onChange,
  defaultComponents = [],
  categoryId,
  availableJerseyNumbers = Array.from({ length: 99 }, (_, i) => i + 1),
  availableSizes = ["XS", "S", "M", "L", "XL", "XXL"],
  onJerseyNumberChange,
  showSizeFields = true,
  showJerseyNumbers = true,
  showDeliveryStatus = true,
  showNotesField = true,
}: CustomKitComponentsBuilderProps) {
  const defaultSize = availableSizes[0] || "M";
  const realComponents =
    defaultComponents.length > 0
      ? defaultComponents
      : [
          {
            id: "comp-1",
            name: "Maglia da Gara",
            selected: false,
            jerseyNumber: 0,
            size: defaultSize,
            deliveryStatus: "pending" as "pending",
          },
          {
            id: "comp-2",
            name: "Pantaloncini da Gara",
            selected: false,
            size: defaultSize,
            deliveryStatus: "pending" as "pending",
          },
          {
            id: "comp-3",
            name: "Tuta di Rappresentanza",
            selected: false,
            size: defaultSize,
            deliveryStatus: "pending" as "pending",
          },
          {
            id: "comp-4",
            name: "Maglia Allenamento",
            selected: false,
            size: defaultSize,
            deliveryStatus: "pending" as "pending",
          },
          {
            id: "comp-5",
            name: "Borsa",
            selected: false,
            deliveryStatus: "pending" as "pending",
          },
          {
            id: "comp-6",
            name: "K-Way",
            selected: false,
            size: defaultSize,
            deliveryStatus: "pending" as "pending",
          },
          {
            id: "comp-7",
            name: "Calzettoni",
            selected: false,
            size: defaultSize,
            deliveryStatus: "pending" as "pending",
          },
        ];
  const [components, setComponents] = useState<KitComponent[]>(
    value.length > 0
      ? value
      : defaultComponents.length > 0
        ? defaultComponents
        : realComponents,
  );
  const [newComponentName, setNewComponentName] = useState("");
  const [newComponentSize, setNewComponentSize] = useState(defaultSize);
  const [usedJerseyNumbers, setUsedJerseyNumbers] = useState<number[]>([]);
  const [showNotes, setShowNotes] = useState<string | null>(null);

  // Initialize used jersey numbers from components
  useEffect(() => {
    const numbers = components
      .filter((comp) => comp.jerseyNumber && comp.jerseyNumber > 0)
      .map((comp) => comp.jerseyNumber as number);
    setUsedJerseyNumbers(numbers);
  }, [components]);

  // Update components when value prop changes
  useEffect(() => {
    if (value.length > 0) {
      setComponents(value);
    }
  }, [value]);

  const handleComponentChange = (id: string, checked: boolean) => {
    const updatedComponents = components.map((component) =>
      component.id === id ? { ...component, selected: checked } : component,
    );
    setComponents(updatedComponents);
    onChange(updatedComponents);
  };

  const handleJerseyNumberChange = (id: string, number: number) => {
    // Update the jersey number for the component
    const updatedComponents = components.map((component) =>
      component.id === id ? { ...component, jerseyNumber: number } : component,
    );
    setComponents(updatedComponents);
    onChange(updatedComponents);

    // Update used jersey numbers
    const numbers = updatedComponents
      .filter((comp) => comp.jerseyNumber && comp.jerseyNumber > 0)
      .map((comp) => comp.jerseyNumber as number);
    setUsedJerseyNumbers(numbers);

    // Call the callback if provided
    if (onJerseyNumberChange) {
      onJerseyNumberChange(id, number);
    }
  };

  const handleSizeChange = (id: string, size: string) => {
    const updatedComponents = components.map((component) =>
      component.id === id ? { ...component, size } : component,
    );
    setComponents(updatedComponents);
    onChange(updatedComponents);
  };

  const handleDeliveryStatusChange = (
    id: string,
    status: "pending" | "processing" | "shipped" | "delivered",
  ) => {
    const updatedComponents = components.map((component) =>
      component.id === id
        ? { ...component, deliveryStatus: status }
        : component,
    );
    setComponents(updatedComponents);
    onChange(updatedComponents);
  };

  const handleNotesChange = (id: string, notes: string) => {
    const updatedComponents = components.map((component) =>
      component.id === id ? { ...component, notes } : component,
    );
    setComponents(updatedComponents);
    onChange(updatedComponents);
    setShowNotes(null);
  };

  const addCustomComponent = () => {
    if (!newComponentName.trim()) return;

    const newComponent: KitComponent = {
      id: `comp-${Date.now()}`,
      name: newComponentName,
      selected: true,
      size: showSizeFields ? newComponentSize : undefined,
      deliveryStatus: "pending",
    };

    const updatedComponents = [...components, newComponent];
    setComponents(updatedComponents);
    onChange(updatedComponents);
    setNewComponentName("");
  };

  const removeComponent = (id: string) => {
    const updatedComponents = components.filter(
      (component) => component.id !== id,
    );
    setComponents(updatedComponents);
    onChange(updatedComponents);
  };

  // Separate default and custom components
  const baseComponents =
    defaultComponents.length > 0 ? defaultComponents : realComponents;
  const baseComponentIds = baseComponents.map((comp) => comp.id);
  const customComponents = components.filter(
    (comp) => !baseComponentIds.includes(comp.id),
  );

  const getDeliveryStatusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return (
          <span className="text-xs px-2 py-1 bg-gray-100 text-gray-700 rounded-full">
            In attesa
          </span>
        );
      case "processing":
        return (
          <span className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded-full">
            In lavorazione
          </span>
        );
      case "shipped":
        return (
          <span className="text-xs px-2 py-1 bg-amber-100 text-amber-700 rounded-full">
            Spedito
          </span>
        );
      case "delivered":
        return (
          <span className="text-xs px-2 py-1 bg-green-100 text-green-700 rounded-full">
            Consegnato
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <TooltipProvider>
      <div className="space-y-4">
        <div>
          <Label className="text-sm font-medium">Componenti Standard</Label>
          <div className="mt-2 space-y-2 max-h-96 overflow-y-auto">
            {components
              .filter((comp) => baseComponentIds.includes(comp.id))
              .map((component) => (
                <div
                  key={component.id}
                  className="flex flex-col space-y-2 border-b pb-2 mb-2"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id={component.id}
                        checked={component.selected}
                        onCheckedChange={(checked) =>
                          handleComponentChange(
                            component.id,
                            checked as boolean,
                          )
                        }
                      />
                      <Label htmlFor={component.id} className="text-sm">
                        {component.name}
                      </Label>
                    </div>

                    {showJerseyNumbers &&
                      component.name.toLowerCase().includes("maglia") && (
                      <div className="flex items-center space-x-2">
                        <Shirt className="h-4 w-4 text-blue-500" />
                        <select
                          className="text-sm border rounded p-1"
                          value={component.jerseyNumber || 0}
                          onChange={(e) =>
                            handleJerseyNumberChange(
                              component.id,
                              parseInt(e.target.value),
                            )
                          }
                        >
                          <option value={0}>Numero</option>
                          {availableJerseyNumbers
                            .filter(
                              (num) =>
                                !usedJerseyNumbers.includes(num) ||
                                num === component.jerseyNumber,
                            )
                            .map((num) => (
                              <option key={num} value={num}>
                                {num}
                              </option>
                            ))}
                        </select>
                      </div>
                    )}
                  </div>

                  {component.selected && (
                    <div className="ml-6 space-y-2">
                      {showSizeFields && (
                        <div className="flex items-center space-x-2">
                          <Label className="text-xs">Taglia:</Label>
                          <select
                            className="text-xs border rounded p-1"
                            value={component.size || defaultSize}
                            onChange={(e) =>
                              handleSizeChange(component.id, e.target.value)
                            }
                          >
                            {availableSizes.map((size) => (
                              <option key={size} value={size}>
                                {size}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}

                      {showDeliveryStatus && (
                        <div className="flex items-center space-x-2">
                          <Label className="text-xs">Stato:</Label>
                          <select
                            className="text-xs border rounded p-1"
                            value={component.deliveryStatus || "pending"}
                            onChange={(e) =>
                              handleDeliveryStatusChange(
                                component.id,
                                e.target.value as
                                  | "pending"
                                  | "processing"
                                  | "shipped"
                                  | "delivered",
                              )
                            }
                          >
                            <option value="pending">In attesa</option>
                            <option value="processing">In lavorazione</option>
                            <option value="shipped">Spedito</option>
                            <option value="delivered">Consegnato</option>
                          </select>
                        </div>
                      )}

                      {showNotesField && (
                        <div className="flex items-center space-x-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-xs h-7 px-2"
                            onClick={() => setShowNotes(component.id)}
                          >
                            {component.notes ? "Modifica note" : "Aggiungi note"}
                          </Button>

                          {component.notes && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Info className="h-4 w-4 text-blue-500 cursor-help" />
                              </TooltipTrigger>
                              <TooltipContent>
                                <p className="max-w-xs text-xs">
                                  {component.notes}
                                </p>
                              </TooltipContent>
                            </Tooltip>
                          )}
                        </div>
                      )}

                      {showNotesField && showNotes === component.id && (
                        <div className="mt-2">
                          <textarea
                            className="w-full text-xs border rounded p-2"
                            rows={3}
                            placeholder="Inserisci note (es. personalizzazione, dettagli consegna)"
                            value={component.notes || ""}
                            onChange={(e) => {
                              const updatedComponents = components.map(
                                (comp) =>
                                  comp.id === component.id
                                    ? { ...comp, notes: e.target.value }
                                    : comp,
                              );
                              setComponents(updatedComponents);
                              onChange(updatedComponents);
                            }}
                          />
                          <div className="flex justify-end mt-1">
                            <Button
                              size="sm"
                              className="text-xs h-7"
                              onClick={() => setShowNotes(null)}
                            >
                              Salva note
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
          </div>
        </div>

        {customComponents.length > 0 && (
          <div>
            <Label className="text-sm font-medium">
              Componenti Personalizzate
            </Label>
            <div className="mt-2 space-y-2 max-h-64 overflow-y-auto">
              {customComponents.map((component) => (
                <div
                  key={component.id}
                  className="flex items-center justify-between border rounded-md p-2"
                >
                  <div className="flex flex-col space-y-2">
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id={component.id}
                        checked={component.selected}
                        onCheckedChange={(checked) =>
                          handleComponentChange(
                            component.id,
                            checked as boolean,
                          )
                        }
                      />
                      <Label htmlFor={component.id} className="text-sm">
                        {component.name}
                      </Label>
                    </div>

                    {component.selected && (
                      <div className="ml-6 space-y-2">
                        {showSizeFields && (
                          <div className="flex items-center space-x-2">
                            <Label className="text-xs">Taglia:</Label>
                            <select
                              className="text-xs border rounded p-1"
                              value={component.size || defaultSize}
                              onChange={(e) =>
                                handleSizeChange(component.id, e.target.value)
                              }
                            >
                              {availableSizes.map((size) => (
                                <option key={size} value={size}>
                                  {size}
                                </option>
                              ))}
                            </select>
                          </div>
                        )}

                        {showDeliveryStatus && (
                          <div className="flex items-center space-x-2">
                            <Label className="text-xs">Stato:</Label>
                            <select
                              className="text-xs border rounded p-1"
                              value={component.deliveryStatus || "pending"}
                              onChange={(e) =>
                                handleDeliveryStatusChange(
                                  component.id,
                                  e.target.value as
                                    | "pending"
                                    | "processing"
                                    | "shipped"
                                    | "delivered",
                                )
                              }
                            >
                              <option value="pending">In attesa</option>
                              <option value="processing">In lavorazione</option>
                              <option value="shipped">Spedito</option>
                              <option value="delivered">Consegnato</option>
                            </select>
                          </div>
                        )}

                        {showNotesField && (
                          <div className="flex items-center space-x-2">
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-xs h-7 px-2"
                              onClick={() => setShowNotes(component.id)}
                            >
                              {component.notes
                                ? "Modifica note"
                                : "Aggiungi note"}
                            </Button>

                            {component.notes && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Info className="h-4 w-4 text-blue-500 cursor-help" />
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p className="max-w-xs text-xs">
                                    {component.notes}
                                  </p>
                                </TooltipContent>
                              </Tooltip>
                            )}
                          </div>
                        )}

                        {showNotesField && showNotes === component.id && (
                          <div className="mt-2">
                            <textarea
                              className="w-full text-xs border rounded p-2"
                              rows={3}
                              placeholder="Inserisci note (es. personalizzazione, dettagli consegna)"
                              value={component.notes || ""}
                              onChange={(e) => {
                                const updatedComponents = components.map(
                                  (comp) =>
                                    comp.id === component.id
                                      ? { ...comp, notes: e.target.value }
                                      : comp,
                                );
                                setComponents(updatedComponents);
                                onChange(updatedComponents);
                              }}
                            />
                            <div className="flex justify-end mt-1">
                              <Button
                                size="sm"
                                className="text-xs h-7"
                                onClick={() => setShowNotes(null)}
                              >
                                Salva note
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-red-500 hover:text-red-700 hover:bg-red-50"
                    onClick={() => removeComponent(component.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="pt-4 border-t">
          <div className="flex items-end space-x-2">
            <div className="flex-1">
              <Label htmlFor="new-component" className="text-sm">
                Aggiungi Componente Personalizzato
              </Label>
              <Input
                id="new-component"
                value={newComponentName}
                onChange={(e) => setNewComponentName(e.target.value)}
                placeholder="Nome componente"
                className="mt-1"
              />
            </div>
            {showSizeFields && (
              <div>
                <Label htmlFor="new-size" className="text-sm">
                  Taglia
                </Label>
                <select
                  id="new-size"
                  className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
                  value={newComponentSize}
                  onChange={(e) => setNewComponentSize(e.target.value)}
                >
                  {availableSizes.map((size) => (
                    <option key={size} value={size}>
                      {size}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <Button
              type="button"
              onClick={addCustomComponent}
              className="flex items-center space-x-1"
              disabled={!newComponentName.trim()}
            >
              <Plus className="h-4 w-4" />
              <span>Aggiungi</span>
            </Button>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
