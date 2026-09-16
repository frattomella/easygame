"use client";

import React from "react";
import { Paperclip, Sparkles } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { SignaturePad } from "./signature-pad";
import {
  fieldCollectsAnswer,
  fieldIsFile,
  FORM_LEGAL_KIND_LABELS,
  isFieldVisible,
  type FormField,
} from "@/lib/forms/model";
import { PUBLIC_FORM_UPLOAD_MIME_TYPES } from "@/lib/forms/validation";
import { RichContent } from "@/components/rich-text/RichContent";

/**
 * Il modulo come lo vede chi lo compila.
 *
 * **Uno solo.** Lo usano il modulo pubblico, l'anteprima del builder e la
 * compilazione dalla scheda atleta. Tre rendering diversi sarebbero tre
 * occasioni di far vedere in anteprima qualcosa di diverso da cio che il
 * genitore poi compila — che e l'unico modo in cui un'anteprima puo mentire.
 *
 * `readOnly` serve all'anteprima: si vede il modulo, non lo si compila.
 */

const ACCEPT_ATTRIBUTE = PUBLIC_FORM_UPLOAD_MIME_TYPES.join(",");
const ACCEPT_IMAGES = PUBLIC_FORM_UPLOAD_MIME_TYPES.filter((mime) => mime.startsWith("image/")).join(",");

const formatMegabytes = (bytes: number) => `${Math.round((bytes / (1024 * 1024)) * 10) / 10} MB`;

export type FormRendererProps = {
  fields: FormField[];
  values: Record<string, unknown>;
  files: Record<string, File | null>;
  errors?: Record<string, string>;
  /** Campi il cui valore arriva dall'archivio: si dichiara, non si nasconde. */
  prefilledFieldIds?: string[];
  readOnly?: boolean;
  /**
   * Nell'integrazione (ADR-0189 §4) si correggono **solo** i campi che il
   * club ha chiesto: gli altri si mostrano bloccati, con la risposta data.
   */
  editableFieldIds?: string[] | null;
  /** I file gia inviati, per nome: nell'integrazione si vedono e si possono sostituire. */
  existingFiles?: Record<string, string>;
  /** Sul modulo pubblico: la base della rotta che serve le immagini di contenuto senza sessione. */
  assetBase?: string;
  onChange?: (fieldId: string, value: unknown) => void;
  onFileChange?: (fieldId: string, file: File | null) => void;
};

const FieldLabel = ({
  field,
  prefilled,
}: {
  field: FormField;
  prefilled: boolean;
}) => (
  <div className="flex flex-wrap items-center gap-2">
    <Label htmlFor={field.id} className="text-sm font-medium text-egw-ink">
      {field.label}
      {field.required ? <span className="ml-1 text-egw-red">*</span> : null}
    </Label>
    {prefilled ? (
      <span className="inline-flex items-center gap-1 rounded-full border border-egw-tint-blue-bd bg-egw-tint-blue px-2 py-0.5 text-[11px] text-egw-blue-800">
        <Sparkles className="h-3 w-3" />
        Dato gia in archivio
      </span>
    ) : null}
  </div>
);

export function FormRenderer({
  fields,
  values,
  files,
  errors = {},
  prefilledFieldIds = [],
  readOnly = false,
  editableFieldIds = null,
  existingFiles = {},
  assetBase = "",
  onChange,
  onFileChange,
}: FormRendererProps) {
  const prefilled = new Set(prefilledFieldIds);
  const editable = editableFieldIds ? new Set(editableFieldIds) : null;

  const set = (fieldId: string, value: unknown) => {
    if (readOnly) return;
    if (editable && !editable.has(fieldId)) return;
    onChange?.(fieldId, value);
  };

  const setFile = (fieldId: string, file: File | null) => {
    if (readOnly) return;
    if (editable && !editable.has(fieldId)) return;
    onFileChange?.(fieldId, file);
  };

  return (
    <div className="space-y-6">
      {fields.map((field) => {
        /* «Se X vale Y mostra questo campo» (ADR-0190 §1): la stessa regola del server. */
        if (!isFieldVisible(field, values)) return null;

        if (field.type === "content") {
          return (
            <RichContent key={field.id} html={field.content} className="egw-rich-content" assetBase={assetBase} />
          );
        }

        if (!fieldCollectsAnswer(field.type)) {
          return (
            <div key={field.id} className="border-t border-egw-hairline pt-5">
              <h3 className="font-brand text-base font-semibold text-egw-ink">
                {field.label}
              </h3>
              {field.description ? (
                <p className="mt-1 text-sm text-egw-ink-72">{field.description}</p>
              ) : null}
            </div>
          );
        }

        const value = values[field.id];
        const error = errors[field.id];
        const locked = Boolean(editable && !editable.has(field.id));
        const readOnlyHere = readOnly || locked;

        /*
          Una casella con una semantica legale (ADR-0192) si presenta per
          quello che e — presa visione, accettazione, consenso facoltativo,
          autorizzazione — e non come una domanda si/no qualunque.
        */
        if (field.type === "checkbox" && field.legalKind) {
          const kindLabel = FORM_LEGAL_KIND_LABELS[field.legalKind];
          const optional = field.legalKind === "optional_consent";
          return (
            <div
              key={field.id}
              data-legal-kind={field.legalKind}
              className={`space-y-2 rounded-egw-panel border p-4 ${optional ? "border-egw-hairline bg-egw-page-050" : "border-egw-tint-blue-bd bg-egw-tint-blue/40"}`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-brand text-[10px] font-bold uppercase tracking-[var(--egw-track-eyebrow)] text-egw-ink-62">
                  {kindLabel}
                  {optional ? " · facoltativo" : field.required ? " · richiesto" : ""}
                </span>
                {prefilled.has(field.id) ? (
                  <span className="inline-flex items-center gap-1 rounded-full border border-egw-tint-blue-bd bg-egw-tint-blue px-2 py-0.5 text-[11px] text-egw-blue-800">
                    <Sparkles className="h-3 w-3" />
                    Dato gia in archivio
                  </span>
                ) : null}
              </div>
              <p className="font-brand text-sm font-semibold text-egw-ink">{field.label}</p>
              {field.description ? (
                <p className="text-sm leading-[1.55] text-egw-ink-72">{field.description}</p>
              ) : null}
              <label className="flex items-start gap-3 rounded-egw-control border border-egw-hairline bg-white p-3 text-sm">
                <Checkbox
                  id={field.id}
                  disabled={readOnlyHere}
                  checked={Boolean(value)}
                  aria-describedby={error ? `${field.id}-error` : undefined}
                  onCheckedChange={(checked) => set(field.id, Boolean(checked))}
                />
                <span>
                  {field.placeholder ||
                    (field.legalKind === "acknowledgement"
                      ? "Dichiaro di aver letto"
                      : field.legalKind === "optional_consent"
                        ? "Acconsento"
                        : field.legalKind === "authorization"
                          ? "Autorizzo"
                          : "Accetto")}
                  {optional ? (
                    <span className="block text-xs text-egw-ink-62">Puoi lasciare la casella vuota: non cambia l&apos;iscrizione.</span>
                  ) : null}
                </span>
              </label>
              {error ? (
                <p id={`${field.id}-error`} role="alert" className="text-sm font-medium text-egw-red">
                  {error}
                </p>
              ) : null}
            </div>
          );
        }

        return (
          <div key={field.id} className="space-y-2" data-locked={locked ? "true" : undefined}>
            <FieldLabel field={field} prefilled={prefilled.has(field.id)} />

            {field.description ? (
              <p className="text-sm text-egw-ink-72">{field.description}</p>
            ) : null}

            {locked ? (
              <p className="text-xs text-egw-ink-62">Questo campo non e fra quelli da correggere.</p>
            ) : null}

            {field.type === "long_text" ? (
              <Textarea
                id={field.id}
                rows={4}
                disabled={readOnlyHere}
                placeholder={field.placeholder}
                value={String(value ?? "")}
                onChange={(event) => set(field.id, event.target.value)}
              />
            ) : null}

            {["short_text", "number", "email", "phone", "date"].includes(
              field.type,
            ) ? (
              <Input
                id={field.id}
                disabled={readOnlyHere}
                type={
                  field.type === "number"
                    ? "number"
                    : field.type === "email"
                      ? "email"
                      : field.type === "phone"
                        ? "tel"
                        : field.type === "date"
                          ? "date"
                          : "text"
                }
                placeholder={field.placeholder}
                value={String(value ?? "")}
                onChange={(event) => set(field.id, event.target.value)}
              />
            ) : null}

            {field.type === "dropdown" ? (
              <Select
                disabled={readOnlyHere}
                value={String(value ?? "")}
                onValueChange={(next) => set(field.id, next)}
              >
                <SelectTrigger id={field.id}>
                  <SelectValue placeholder="Scegli" />
                </SelectTrigger>
                <SelectContent>
                  {field.options.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}

            {field.type === "single_choice" ? (
              <div className="space-y-2">
                {field.options.map((option) => (
                  <label
                    key={option}
                    className="flex items-start gap-3 rounded-egw-control border border-egw-hairline p-3 text-sm"
                  >
                    <input
                      type="radio"
                      className="mt-0.5 h-4 w-4"
                      disabled={readOnlyHere}
                      name={field.id}
                      checked={String(value ?? "") === option}
                      onChange={() => set(field.id, option)}
                    />
                    <span>{option}</span>
                  </label>
                ))}
              </div>
            ) : null}

            {field.type === "multiple_choice" ? (
              <div className="space-y-2">
                {field.options.map((option) => {
                  const selected = Array.isArray(value) ? value : [];
                  return (
                    <label
                      key={option}
                      className="flex items-start gap-3 rounded-egw-control border border-egw-hairline p-3 text-sm"
                    >
                      <Checkbox
                        disabled={readOnlyHere}
                        checked={selected.includes(option)}
                        onCheckedChange={(checked) =>
                          set(
                            field.id,
                            checked
                              ? [...selected, option]
                              : selected.filter((entry) => entry !== option),
                          )
                        }
                      />
                      <span>{option}</span>
                    </label>
                  );
                })}
              </div>
            ) : null}

            {field.type === "checkbox" ? (
              <label className="flex items-start gap-3 rounded-egw-control border border-egw-hairline p-3 text-sm">
                <Checkbox
                  disabled={readOnlyHere}
                  checked={Boolean(value)}
                  onCheckedChange={(checked) => set(field.id, Boolean(checked))}
                />
                <span>{field.placeholder || "Confermo"}</span>
              </label>
            ) : null}

            {field.type === "file_upload" || field.type === "image_upload" ? (
              <div className="space-y-2">
                <Input
                  id={field.id}
                  type="file"
                  disabled={readOnlyHere}
                  accept={field.type === "image_upload" || field.upload?.accept === "images" ? ACCEPT_IMAGES : ACCEPT_ATTRIBUTE}
                  onChange={(event) =>
                    setFile(field.id, event.target.files?.[0] || null)
                  }
                />
                {files[field.id] ? (
                  <p className="flex items-center gap-2 text-xs text-egw-ink-72">
                    <Paperclip className="h-3 w-3" />
                    {files[field.id]?.name}
                  </p>
                ) : existingFiles[field.id] ? (
                  <p className="flex items-center gap-2 text-xs text-egw-ink-72">
                    <Paperclip className="h-3 w-3" />
                    Gia inviato: {existingFiles[field.id]}
                    {locked ? "" : " — carica un file per sostituirlo"}
                  </p>
                ) : (
                  <p className="text-xs text-egw-ink-62">
                    {field.type === "image_upload" || field.upload?.accept === "images"
                      ? "Immagine (JPEG, PNG, WebP o HEIC)"
                      : "PDF o foto"}
                    , fino a {formatMegabytes(field.upload?.maxBytes || 8 * 1024 * 1024)}.
                  </p>
                )}
              </div>
            ) : null}

            {field.type === "signature" ? (
              readOnlyHere ? (
                <div className="rounded-egw-control border border-dashed border-egw-hairline p-6 text-center text-sm text-egw-ink-62">
                  {existingFiles[field.id] ? "Firma gia inviata." : "Qui chi compila traccia la firma."}
                </div>
              ) : (
                <SignaturePad
                  hasSignature={Boolean(files[field.id])}
                  onChange={(file) => setFile(field.id, file)}
                />
              )
            ) : null}

            {error ? (
              <p role="alert" className="text-sm font-medium text-egw-red">
                {error}
              </p>
            ) : null}
          </div>
        );
      })}

      {fields.every((field) => !fieldCollectsAnswer(field.type) && field.type !== "content") ? (
        <p className="rounded-egw-control border border-dashed border-egw-hairline p-6 text-center text-sm text-egw-ink-62">
          Questo modulo non ha ancora campi da compilare.
        </p>
      ) : null}
    </div>
  );
}

/** I campi che richiedono un file: serve a chi costruisce l'invio. */
export const getFileFieldIds = (fields: FormField[]) =>
  fields.filter((field) => fieldIsFile(field.type)).map((field) => field.id);
