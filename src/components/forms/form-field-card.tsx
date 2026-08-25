"use client";

import React, { useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  Copy,
  Link2,
  Settings2,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { Textarea } from "@/components/ui/textarea";
import { DynamicFieldPicker } from "./dynamic-field-picker";
import {
  FORM_FIELD_TYPES,
  fieldCollectsAnswer,
  getFieldTypeDefinition,
  type FormField,
  type FormFieldType,
} from "@/lib/forms/model";
import { getDynamicFieldLabel } from "@/lib/forms/dynamic-fields";
import { hasServerOptions } from "@/lib/forms/field-options";

/**
 * Un campo, nella tela del builder.
 *
 * **Divulgazione progressiva.** Chiuso, un campo mostra tre cose: cosa
 * chiede, di che tipo e, e se e obbligatorio. Tutto il resto — descrizione,
 * testo di esempio, opzioni, collegamento a un dato EasyGame — sta dietro
 * «Impostazioni», che si apre per un campo alla volta.
 *
 * E la correzione del difetto per cui questo lavoro esiste: il vecchio editor
 * teneva aperte contemporaneamente nove impostazioni per ognuno dei
 * diciassette tipi, e chi doveva aggiungere «Nome del genitore» ne leggeva
 * otto che non lo riguardavano.
 */

type FormFieldCardProps = {
  field: FormField;
  index: number;
  total: number;
  onChange: (patch: Partial<FormField>) => void;
  onDuplicate: () => void;
  onRemove: () => void;
  onMove: (direction: -1 | 1) => void;
};

export function FormFieldCard({
  field,
  index,
  total,
  onChange,
  onDuplicate,
  onRemove,
  onMove,
}: FormFieldCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  const definition = getFieldTypeDefinition(field.type);
  const isSection = !fieldCollectsAnswer(field.type);
  /* Sede e categoria: le opzioni non si scrivono, le porta il club. */
  const serverOptions = hasServerOptions(field);
  const bindingLabel = getDynamicFieldLabel(field.binding);

  return (
    <div
      className={`rounded-lg border bg-white p-4 ${
        isSection ? "border-slate-300 bg-slate-50" : "border-slate-200"
      }`}
    >
      {/* Intestazione: una colonna a 375 px, due da sm in su. */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <div className="min-w-0 flex-1 space-y-2">
          <Label htmlFor={`label-${field.id}`} className="sr-only">
            Testo del campo
          </Label>
          <Input
            id={`label-${field.id}`}
            value={field.label}
            onChange={(event) => onChange({ label: event.target.value })}
            placeholder={isSection ? "Titolo della sezione" : "Cosa chiedi?"}
            className="font-medium"
          />

          {bindingLabel ? (
            <p className="flex items-center gap-1.5 text-xs text-sky-700">
              <Link2 className="h-3 w-3" />
              {bindingLabel}
            </p>
          ) : null}
        </div>

        <div className="w-full sm:w-52">
          <Label htmlFor={`type-${field.id}`} className="sr-only">
            Tipo di campo
          </Label>
          <Select
            value={field.type}
            onValueChange={(next) =>
              onChange({ type: next as FormFieldType, options: [] })
            }
          >
            <SelectTrigger id={`type-${field.id}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FORM_FIELD_TYPES.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Comandi: scorrono nel proprio contenitore, non allargano la pagina. */}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-slate-100 pt-3">
        {!isSection ? (
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <Switch
              checked={field.required}
              onCheckedChange={(checked) => onChange({ required: checked })}
              aria-label="Campo obbligatorio"
            />
            Obbligatorio
          </label>
        ) : null}

        <div className="ml-auto flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label="Sposta su"
            disabled={index === 0}
            onClick={() => onMove(-1)}
          >
            <ChevronUp className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label="Sposta giu"
            disabled={index === total - 1}
            onClick={() => onMove(1)}
          >
            <ChevronDown className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label="Duplica campo"
            onClick={onDuplicate}
          >
            <Copy className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label="Elimina campo"
            onClick={onRemove}
          >
            <Trash2 className="h-4 w-4 text-red-600" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setExpanded((current) => !current)}
            aria-expanded={expanded}
          >
            <Settings2 className="mr-1.5 h-4 w-4" />
            Impostazioni
          </Button>
        </div>
      </div>

      {expanded ? (
        <div className="mt-4 space-y-4 rounded-md bg-slate-50 p-4">
          <div className="space-y-2">
            <Label htmlFor={`description-${field.id}`}>
              Descrizione o istruzioni
            </Label>
            <Textarea
              id={`description-${field.id}`}
              rows={2}
              value={field.description}
              onChange={(event) => onChange({ description: event.target.value })}
              placeholder="Compare sotto la domanda. Facoltativa."
            />
          </div>

          {definition.hasPlaceholder ? (
            <div className="space-y-2">
              <Label htmlFor={`placeholder-${field.id}`}>Testo di esempio</Label>
              <Input
                id={`placeholder-${field.id}`}
                value={field.placeholder}
                onChange={(event) =>
                  onChange({ placeholder: event.target.value })
                }
                placeholder="Compare dentro la casella, in grigio."
              />
            </div>
          ) : null}

          {definition.hasOptions && serverOptions ? (
            <div className="space-y-2">
              <Label>Opzioni</Label>
              <p className="rounded-md border border-dashed border-muted-foreground/40 p-3 text-sm text-muted-foreground">
                Le voci di questo campo le mette EasyGame quando il modulo
                viene aperto: sono le sedi e le categorie di questa societa,
                aggiornate al momento. Non vanno scritte qui, e non restano
                indietro quando cambiano.
              </p>
            </div>
          ) : null}

          {definition.hasOptions && !serverOptions ? (
            <div className="space-y-2">
              <Label htmlFor={`options-${field.id}`}>
                Opzioni, una per riga
              </Label>
              <Textarea
                id={`options-${field.id}`}
                rows={4}
                value={field.options.join("\n")}
                onChange={(event) =>
                  onChange({
                    options: event.target.value
                      .split("\n")
                      .map((option) => option.trim())
                      .filter(Boolean),
                  })
                }
                placeholder={"Primi calci\nPulcini\nEsordienti"}
              />
            </div>
          ) : null}

          {!isSection ? (
            <div className="space-y-2">
              <Label>Dato EasyGame</Label>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setPickerOpen(true)}
                >
                  <Link2 className="mr-2 h-4 w-4" />
                  {bindingLabel || "Collega a un dato"}
                </Button>
                {bindingLabel ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => onChange({ binding: "" })}
                  >
                    Togli
                  </Button>
                ) : null}
              </div>
              <p className="text-xs text-slate-500">
                Un campo collegato si precompila da solo e, all&apos;approvazione,
                aggiorna la scheda della persona.
              </p>
            </div>
          ) : null}
        </div>
      ) : null}

      <DynamicFieldPicker
        open={pickerOpen}
        currentKey={field.binding}
        onClose={() => setPickerOpen(false)}
        onClear={() => onChange({ binding: "" })}
        onPick={(picked) =>
          onChange({
            binding: picked.key,
            type: picked.fieldType,
            /*
              L'etichetta si sostituisce solo se non e stata scritta a mano:
              chi ha gia scritto «Cellulare della mamma» non deve vederselo
              diventare «Telefono del genitore».
            */
            label:
              !field.label || field.label === "Domanda senza titolo"
                ? picked.label
                : field.label,
          })
        }
      />
    </div>
  );
}
