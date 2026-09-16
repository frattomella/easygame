/**
 * La prova delle dichiarazioni di una pratica (ADR-0192 §2) e l'impronta
 * della pratica (ADR-0192 §5).
 *
 * Per ogni casella con una semantica legale si conserva **cio che e stato
 * mostrato**: l'etichetta, il testo (la descrizione del campo, e il blocco
 * di contenuto immediatamente precedente se ce n'e uno), la sua impronta, la
 * versione del modulo, la risposta, l'ora e il metodo. Non un riferimento a
 * cio che si esibiva: cio che si esibiva. E la forma in cui un titolare
 * dimostra un consenso (EDPB 05/2020 §108).
 */

import { createHash } from "crypto";
import {
  getLegalFields,
  type FormDeclaration,
  type FormSchema,
  type FormSubmissionFile,
} from "@/lib/forms/model";
import { richHtmlToText } from "@/lib/rich-text/sanitize";

const sha256 = (value: string) => createHash("sha256").update(value, "utf8").digest("hex");

/** Il testo che accompagnava una casella: la sua descrizione e il blocco di testo subito sopra. */
const testoMostrato = (schema: FormSchema, fieldId: string) => {
  const index = schema.fields.findIndex((field) => field.id === fieldId);
  const field = schema.fields[index];
  if (!field) return "";
  const parti: string[] = [];
  const precedente = index > 0 ? schema.fields[index - 1] : null;
  if (precedente && precedente.type === "content") {
    parti.push(richHtmlToText(precedente.content));
  }
  if (field.description) parti.push(field.description.trim());
  return parti.join("\n").trim();
};

export const buildDeclarations = ({
  schema,
  versionId,
  answers,
  respondent,
  at = new Date(),
}: {
  schema: FormSchema;
  versionId: string;
  answers: Record<string, unknown>;
  respondent: string;
  at?: Date;
}): FormDeclaration[] =>
  getLegalFields(schema).map((field) => {
    const text = testoMostrato(schema, field.id);
    return {
      fieldId: field.id,
      legalKind: field.legalKind as FormDeclaration["legalKind"],
      consentKey: field.consentKey,
      label: field.label,
      text,
      textHash: sha256(`${field.label}\n${text}`),
      versionId,
      answer: answers[field.id] === true,
      at: at.toISOString(),
      method: "web_checkbox",
      respondent,
    };
  });

/**
 * L'impronta della pratica: versione, risposte, dichiarazioni e impronte
 * degli allegati, in una serializzazione stabile (chiavi ordinate).
 */
export const buildSnapshotHash = ({
  versionId,
  answers,
  declarations,
  files,
}: {
  versionId: string;
  answers: Record<string, unknown>;
  declarations: FormDeclaration[];
  files: Array<Pick<FormSubmissionFile, "fieldId" | "reference"> & { checksum?: string | null }>;
}) => {
  const stabile = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(stabile);
    if (value && typeof value === "object") {
      return Object.keys(value as Record<string, unknown>)
        .sort()
        .reduce<Record<string, unknown>>((acc, key) => {
          acc[key] = stabile((value as Record<string, unknown>)[key]);
          return acc;
        }, {});
    }
    return value;
  };
  return sha256(
    JSON.stringify(
      stabile({
        versionId,
        answers,
        declarations: declarations.map(({ at: _at, ...rest }) => rest),
        files: files.map((file) => ({ fieldId: file.fieldId, reference: file.reference, checksum: file.checksum || null })),
      }),
    ),
  );
};

export const normalizeDeclarations = (value: unknown): FormDeclaration[] =>
  (Array.isArray(value) ? value : [])
    .map((entry) => (entry && typeof entry === "object" ? (entry as Record<string, unknown>) : null))
    .filter((entry): entry is Record<string, unknown> => Boolean(entry))
    .map((entry) => ({
      fieldId: String(entry.fieldId ?? ""),
      legalKind: String(entry.legalKind ?? "acknowledgement") as FormDeclaration["legalKind"],
      consentKey: String(entry.consentKey ?? ""),
      label: String(entry.label ?? ""),
      text: String(entry.text ?? ""),
      textHash: String(entry.textHash ?? ""),
      versionId: String(entry.versionId ?? ""),
      answer: entry.answer === true,
      at: String(entry.at ?? ""),
      method: "web_checkbox" as const,
      respondent: String(entry.respondent ?? ""),
    }))
    .filter((entry) => entry.fieldId);
