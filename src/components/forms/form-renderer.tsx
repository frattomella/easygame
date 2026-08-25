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
  type FormField,
} from "@/lib/forms/model";
import { PUBLIC_FORM_UPLOAD_MIME_TYPES } from "@/lib/forms/validation";

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

export type FormRendererProps = {
  fields: FormField[];
  values: Record<string, unknown>;
  files: Record<string, File | null>;
  errors?: Record<string, string>;
  /** Campi il cui valore arriva dall'archivio: si dichiara, non si nasconde. */
  prefilledFieldIds?: string[];
  readOnly?: boolean;
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
    <Label htmlFor={field.id} className="text-sm font-medium text-slate-800">
      {field.label}
      {field.required ? <span className="ml-1 text-red-600">*</span> : null}
    </Label>
    {prefilled ? (
      <span className="inline-flex items-center gap-1 rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[11px] text-sky-700">
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
  onChange,
  onFileChange,
}: FormRendererProps) {
  const prefilled = new Set(prefilledFieldIds);

  const set = (fieldId: string, value: unknown) => {
    if (readOnly) return;
    onChange?.(fieldId, value);
  };

  const setFile = (fieldId: string, file: File | null) => {
    if (readOnly) return;
    onFileChange?.(fieldId, file);
  };

  return (
    <div className="space-y-6">
      {fields.map((field) => {
        if (!fieldCollectsAnswer(field.type)) {
          return (
            <div key={field.id} className="border-t border-slate-200 pt-5">
              <h3 className="font-display text-base font-semibold text-slate-900">
                {field.label}
              </h3>
              {field.description ? (
                <p className="mt-1 text-sm text-slate-600">{field.description}</p>
              ) : null}
            </div>
          );
        }

        const value = values[field.id];
        const error = errors[field.id];

        return (
          <div key={field.id} className="space-y-2">
            <FieldLabel field={field} prefilled={prefilled.has(field.id)} />

            {field.description ? (
              <p className="text-sm text-slate-600">{field.description}</p>
            ) : null}

            {field.type === "long_text" ? (
              <Textarea
                id={field.id}
                rows={4}
                disabled={readOnly}
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
                disabled={readOnly}
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
                disabled={readOnly}
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
                    className="flex items-start gap-3 rounded-md border border-slate-200 p-3 text-sm"
                  >
                    <input
                      type="radio"
                      className="mt-0.5 h-4 w-4"
                      disabled={readOnly}
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
                      className="flex items-start gap-3 rounded-md border border-slate-200 p-3 text-sm"
                    >
                      <Checkbox
                        disabled={readOnly}
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
              <label className="flex items-start gap-3 rounded-md border border-slate-200 p-3 text-sm">
                <Checkbox
                  disabled={readOnly}
                  checked={Boolean(value)}
                  onCheckedChange={(checked) => set(field.id, Boolean(checked))}
                />
                <span>{field.placeholder || "Confermo"}</span>
              </label>
            ) : null}

            {field.type === "file_upload" ? (
              <div className="space-y-2">
                <Input
                  id={field.id}
                  type="file"
                  disabled={readOnly}
                  accept={ACCEPT_ATTRIBUTE}
                  onChange={(event) =>
                    setFile(field.id, event.target.files?.[0] || null)
                  }
                />
                {files[field.id] ? (
                  <p className="flex items-center gap-2 text-xs text-slate-600">
                    <Paperclip className="h-3 w-3" />
                    {files[field.id]?.name}
                  </p>
                ) : (
                  <p className="text-xs text-slate-500">
                    PDF o foto, fino a 8 MB.
                  </p>
                )}
              </div>
            ) : null}

            {field.type === "signature" ? (
              readOnly ? (
                <div className="rounded-md border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
                  Qui chi compila traccia la firma.
                </div>
              ) : (
                <SignaturePad
                  hasSignature={Boolean(files[field.id])}
                  onChange={(file) => setFile(field.id, file)}
                />
              )
            ) : null}

            {error ? (
              <p role="alert" className="text-sm font-medium text-red-600">
                {error}
              </p>
            ) : null}
          </div>
        );
      })}

      {fields.every((field) => !fieldCollectsAnswer(field.type)) ? (
        <p className="rounded-md border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
          Questo modulo non ha ancora campi da compilare.
        </p>
      ) : null}
    </div>
  );
}

/** I campi che richiedono un file: serve a chi costruisce l'invio. */
export const getFileFieldIds = (fields: FormField[]) =>
  fields.filter((field) => fieldIsFile(field.type)).map((field) => field.id);
