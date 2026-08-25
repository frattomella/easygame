import {
  FORM_LIMITS,
  MAX_PUBLIC_FORM_UPLOAD_BYTES,
} from "@/lib/forms/validation";
import { FormSubmissionError, type IncomingFormFile } from "./form-submissions";

/**
 * Come arriva una compilazione dalla rete.
 *
 * **`multipart/form-data`, non JSON con base64.** Un certificato medico
 * scansionato pesa un paio di megabyte; in base64 ne pesa un terzo di piu, e
 * un corpo JSON va tenuto in memoria per intero prima di poterlo leggere. E
 * la stessa ragione per cui l'endpoint degli allegati e multipart
 * (09 — Convenzioni API).
 *
 * Un modulo senza allegati puo inviare JSON e basta: chiedere multipart per
 * quattro campi di testo sarebbe cerimonia.
 *
 * Il campo `payload` contiene le risposte; ogni file arriva in una parte
 * chiamata `file:<idCampo>`. Il nome della parte e l'**unico** posto in cui il
 * client dice a quale campo appartiene un file, e il server lo confronta con
 * lo schema prima di salvarlo.
 */

export type SubmissionPayload = {
  answers: Record<string, unknown>;
  files: IncomingFormFile[];
  respondentName: string;
  respondentEmail: string;
  subjects: unknown;
  templateId: string;
};

const FILE_PART_PREFIX = "file:";

const asText = (value: unknown) => String(value ?? "").trim();

const asAnswers = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const parsePayloadJson = (raw: string) => {
  if (raw.length > FORM_LIMITS.maxSubmissionBodyBytes) {
    throw new FormSubmissionError("Risposta troppo grande.", 413);
  }

  try {
    return JSON.parse(raw);
  } catch {
    throw new FormSubmissionError("Richiesta non leggibile.", 400);
  }
};

export const readSubmissionPayload = async (
  request: Request,
): Promise<SubmissionPayload> => {
  const contentType = request.headers.get("content-type") || "";

  if (!contentType.includes("multipart/form-data")) {
    const raw = await request.text();
    const body = parsePayloadJson(raw || "{}");

    return {
      answers: asAnswers(body?.answers),
      files: [],
      respondentName: asText(body?.respondentName),
      respondentEmail: asText(body?.respondentEmail),
      subjects: body?.subjects,
      templateId: asText(body?.templateId),
    };
  }

  const form = await request.formData();
  const body = parsePayloadJson(asText(form.get("payload")) || "{}");
  const files: IncomingFormFile[] = [];

  for (const [name, value] of form.entries()) {
    if (!name.startsWith(FILE_PART_PREFIX)) continue;
    if (typeof value === "string") continue;

    if (files.length >= FORM_LIMITS.maxFilesPerSubmission) {
      throw new FormSubmissionError(
        `Un invio puo contenere al massimo ${FORM_LIMITS.maxFilesPerSubmission} allegati.`,
        413,
      );
    }

    /*
      Il limite si controlla prima di leggere i byte: `arrayBuffer()` su un
      file da mezzo gigabyte lo porta in memoria comunque.
    */
    if (value.size > MAX_PUBLIC_FORM_UPLOAD_BYTES) {
      throw new FormSubmissionError(
        `«${value.name}» supera ${Math.round(MAX_PUBLIC_FORM_UPLOAD_BYTES / (1024 * 1024))} MB.`,
        413,
      );
    }

    files.push({
      fieldId: name.slice(FILE_PART_PREFIX.length),
      fileName: value.name || "allegato",
      mimeType: value.type || "application/octet-stream",
      content: Buffer.from(await value.arrayBuffer()),
    });
  }

  return {
    answers: asAnswers(body?.answers),
    files,
    respondentName: asText(body?.respondentName),
    respondentEmail: asText(body?.respondentEmail),
    subjects: body?.subjects,
    templateId: asText(body?.templateId),
  };
};
