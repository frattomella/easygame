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
  FORM_LEGAL_KIND_HINTS,
  FORM_LEGAL_KIND_LABELS,
  fieldCollectsAnswer,
  fieldIsFile,
  getFieldTypeDefinition,
  type FormField,
  type FormFieldType,
  type FormLegalKind,
} from "@/lib/forms/model";
import { getDynamicFieldLabel } from "@/lib/forms/dynamic-fields";
import { hasServerOptions } from "@/lib/forms/field-options";
import { RichTextEditor } from "@/components/rich-text/RichTextEditor";

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
  /** I campi che vengono prima: sono quelli da cui una condizione di visibilita puo dipendere. */
  siblingsBefore?: FormField[];
  /** Carica un'immagine per un blocco di contenuto e ne restituisce l'URL. */
  onUploadImage?: (file: File) => Promise<string>;
  onChange: (patch: Partial<FormField>) => void;
  onDuplicate: () => void;
  onRemove: () => void;
  onMove: (direction: -1 | 1) => void;
};

export function FormFieldCard({
  field,
  index,
  total,
  siblingsBefore = [],
  onUploadImage,
  onChange,
  onDuplicate,
  onRemove,
  onMove,
}: FormFieldCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  const definition = getFieldTypeDefinition(field.type);
  const isSection = !fieldCollectsAnswer(field.type);
  const isContent = field.type === "content";
  const isLegal = field.type === "checkbox" && Boolean(field.legalKind);
  const NESSUNA = "__nessuna__";
  /* Le condizioni di visibilita dipendono da un campo precedente con una risposta chiusa o si/no. */
  const controllabili = siblingsBefore.filter(
    (f) => fieldCollectsAnswer(f.type) && !fieldIsFile(f.type) && (f.type === "checkbox" || f.options.length > 0 || f.type === "single_choice" || f.type === "dropdown" || f.type === "multiple_choice"),
  );
  const controllo = field.visibleWhen ? controllabili.find((f) => f.id === field.visibleWhen?.fieldId) : null;
  /* Sede e categoria: le opzioni non si scrivono, le porta il club. */
  const serverOptions = hasServerOptions(field);
  const bindingLabel = getDynamicFieldLabel(field.binding);

  return (
    <div
      className={`rounded-egw-control border bg-white p-4 ${
        isSection ? "border-egw-hairline bg-egw-page-100" : "border-egw-hairline"
      }`}
    >
      {/* Intestazione: una colonna a 375 px, due da sm in su. */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <div className="min-w-0 flex-1 space-y-2">
          <Label htmlFor={`label-${field.id}`} className="sr-only">
            Testo del campo
          </Label>
          {isContent ? (
            <>
              <Input
                id={`label-${field.id}`}
                value={field.label}
                onChange={(event) => onChange({ label: event.target.value })}
                placeholder="Nome del blocco (solo per te: non si vede nel modulo)"
                className="text-sm"
              />
              <RichTextEditor
                aria-label="Contenuto del blocco"
                value={field.content}
                onChange={(content) => onChange({ content })}
                onUploadImage={onUploadImage}
                placeholder="Il testo dell'informativa, le istruzioni, una tabella…"
                minHeight={140}
              />
            </>
          ) : (
            <Input
              id={`label-${field.id}`}
              value={field.label}
              onChange={(event) => onChange({ label: event.target.value })}
              placeholder={isSection ? "Titolo della sezione" : isLegal ? "Titolo della dichiarazione" : "Cosa chiedi?"}
              className="font-medium"
            />
          )}

          {bindingLabel ? (
            <p className="flex items-center gap-1.5 text-xs text-egw-blue-800">
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
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-egw-rule pt-3">
        {!isSection && field.legalKind !== "optional_consent" ? (
          <label className="flex items-center gap-2 text-sm text-egw-ink-72">
            <Switch
              checked={field.legalKind === "required_acceptance" ? true : field.required}
              disabled={field.legalKind === "required_acceptance"}
              onCheckedChange={(checked) => onChange({ required: checked })}
              aria-label="Campo obbligatorio"
            />
            Obbligatorio
          </label>
        ) : null}
        {field.legalKind === "optional_consent" ? (
          <span className="text-xs text-egw-ink-62">Facoltativo per costruzione: un consenso non si puo imporre.</span>
        ) : null}
        {field.visibleWhen ? (
          <span className="rounded-full border border-egw-tint-blue-bd bg-egw-tint-blue px-2 py-0.5 text-[11px] text-egw-blue-800">
            visibile se «{controllo?.label || "?"}» = {field.visibleWhen.equals}
          </span>
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
            <Trash2 className="h-4 w-4 text-egw-red" />
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
        <div className="mt-4 space-y-4 rounded-egw-control bg-egw-page-100 p-4">
          {!isContent ? (
          <div className="space-y-2">
            <Label htmlFor={`description-${field.id}`}>
              {isLegal ? "Testo della dichiarazione" : "Descrizione o istruzioni"}
            </Label>
            <Textarea
              id={`description-${field.id}`}
              rows={2}
              value={field.description}
              onChange={(event) => onChange({ description: event.target.value })}
              placeholder={isLegal ? "Il testo che la persona dichiara di aver letto o accettato." : "Compare sotto la domanda. Facoltativa."}
            />
          </div>
          ) : null}

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
              <p className="rounded-egw-control border border-dashed border-muted-foreground/40 p-3 text-sm text-muted-foreground">
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

          {field.type === "checkbox" ? (
            /*
              **Cosa significa questa casella** (ADR-0192): una domanda si/no,
              oppure una presa visione, un'accettazione richiesta, un consenso
              facoltativo, un'autorizzazione. Il builder lo sa e il modulo lo
              mostra per quello che e.
            */
            <div className="space-y-2">
              <Label htmlFor={`legal-${field.id}`}>Cosa significa spuntare</Label>
              <Select
                value={field.legalKind || NESSUNA}
                onValueChange={(next) =>
                  onChange({
                    legalKind: (next === NESSUNA ? "" : next) as FormLegalKind,
                    required: next === "required_acceptance" ? true : next === "optional_consent" ? false : field.required,
                  })
                }
              >
                <SelectTrigger id={`legal-${field.id}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NESSUNA}>Una domanda si/no</SelectItem>
                  {(Object.keys(FORM_LEGAL_KIND_LABELS) as Array<Exclude<FormLegalKind, "">>).map((kind) => (
                    <SelectItem key={kind} value={kind}>
                      {FORM_LEGAL_KIND_LABELS[kind]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {field.legalKind ? (
                <p className="text-xs text-egw-ink-62">{FORM_LEGAL_KIND_HINTS[field.legalKind as Exclude<FormLegalKind, "">]} Il testo mostrato (la descrizione qui sopra e il blocco di testo subito sopra la casella) viene conservato nella pratica come prova.</p>
              ) : null}
            </div>
          ) : null}

          {!isSection && !isContent && controllabili.length ? (
            <div className="space-y-2">
              <Label htmlFor={`visible-${field.id}`}>Mostra solo se</Label>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <Select
                  value={field.visibleWhen?.fieldId || NESSUNA}
                  onValueChange={(next) =>
                    onChange({ visibleWhen: next === NESSUNA ? null : { fieldId: next, equals: field.visibleWhen?.fieldId === next ? field.visibleWhen.equals : "" } })
                  }
                >
                  <SelectTrigger id={`visible-${field.id}`}>
                    <SelectValue placeholder="Sempre visibile" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NESSUNA}>Sempre visibile</SelectItem>
                    {controllabili.map((f) => (
                      <SelectItem key={f.id} value={f.id}>
                        {f.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {controllo ? (
                  controllo.type === "checkbox" ? (
                    <Select value={field.visibleWhen?.equals || "true"} onValueChange={(next) => onChange({ visibleWhen: { fieldId: controllo.id, equals: next } })}>
                      <SelectTrigger aria-label="vale">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="true">e spuntato</SelectItem>
                        <SelectItem value="false">non e spuntato</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <Select value={field.visibleWhen?.equals || NESSUNA} onValueChange={(next) => onChange({ visibleWhen: { fieldId: controllo.id, equals: next === NESSUNA ? "" : next } })}>
                      <SelectTrigger aria-label="vale">
                        <SelectValue placeholder="vale…" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NESSUNA}>vale…</SelectItem>
                        {controllo.options.map((option) => (
                          <SelectItem key={option} value={option}>
                            {option}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )
                ) : null}
              </div>
              <p className="text-xs text-egw-ink-62">Un campo nascosto non e obbligatorio e la sua risposta non si accetta: vale nel modulo e sul server.</p>
            </div>
          ) : null}

          {fieldIsFile(field.type) && field.type !== "signature" ? (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor={`accept-${field.id}`}>Tipi di file</Label>
                <Select
                  value={field.type === "image_upload" ? "images" : field.upload?.accept || "documents"}
                  onValueChange={(next) => onChange({ upload: { accept: next as "documents" | "images", maxBytes: field.upload?.maxBytes || 8 * 1024 * 1024 } })}
                >
                  <SelectTrigger id={`accept-${field.id}`} disabled={field.type === "image_upload"}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="documents">PDF e immagini</SelectItem>
                    <SelectItem value="images">Solo immagini</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor={`maxbytes-${field.id}`}>Dimensione massima</Label>
                <Select
                  value={String(field.upload?.maxBytes || 8 * 1024 * 1024)}
                  onValueChange={(next) => onChange({ upload: { accept: field.type === "image_upload" ? "images" : field.upload?.accept || "documents", maxBytes: Number(next) } })}
                >
                  <SelectTrigger id={`maxbytes-${field.id}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[1, 2, 4, 8].map((mb) => (
                      <SelectItem key={mb} value={String(mb * 1024 * 1024)}>
                        {mb} MB
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          ) : null}

          {field.type === "checkbox" ? (
            <div className="space-y-2">
              <Label htmlFor={`consent-${field.id}`}>
                Chiave del consenso
              </Label>
              <Input
                id={`consent-${field.id}`}
                value={field.consentKey}
                onChange={(event) =>
                  onChange({ consentKey: event.target.value })
                }
                placeholder="privacy, immagini, sanitari…"
              />
              <p className="text-xs text-egw-ink-62">
                Con una chiave, la spunta non resta dentro la compilazione:
                all&apos;approvazione diventa un consenso della persona, che si
                puo dimostrare e revocare. La chiave e quella del consenso
                definito in Organizzazione: se non corrisponde a nessuno, la
                segreteria lo legge nell&apos;esito dell&apos;approvazione.
              </p>
            </div>
          ) : null}

          {!isSection && !isContent ? (
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
              <p className="text-xs text-egw-ink-62">
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
