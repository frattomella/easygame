/**
 * Le bozze pubbliche ripristinabili (ADR-0189 §3, ADR-0191 §1) — l'unico
 * scrittore di `form_drafts`.
 *
 * Una bozza non e una compilazione: non entra in coda, non ha ricevuta,
 * non porta allegati, scade da sola. Il gettone di ripresa nasce a 256 bit,
 * esce in chiaro **una volta** e in archivio resta l'impronta; chi legge il
 * database non riprende la bozza di nessuno. Ogni lettura parte dal modulo
 * (slug → club) e cerca il gettone **dentro** quel modulo: una bozza di un
 * club non si apre da un altro.
 *
 * Le risposte si salvano **validate con la stessa funzione dell'invio ma
 * senza obbligatorieta**: una bozza e per definizione incompleta; cio che
 * non passa il tipo (una data che non e una data) si scarta, cio che manca
 * resta mancante.
 */

import { createHash, randomBytes, timingSafeEqual } from "crypto";
import { prisma } from "./prisma";
import { AUDIT_ACTIONS, recordAuditEvent } from "./audit";
import type { PublicFormMatch } from "./forms";
import { FORM_LIMITS, validateAnswers } from "@/lib/forms/validation";
import { fieldIsFile } from "@/lib/forms/model";

const asText = (value: unknown) => String(value ?? "").trim();

/** Trenta giorni: una famiglia che riprende dopo un mese trova ancora la bozza. */
export const FORM_DRAFT_TTL_MS = 30 * 24 * 60 * 60_000;

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{40,64}$/;
export const MAX_LIVE_DRAFTS_PER_TEMPLATE = 5000;

export const generateResumeToken = () => randomBytes(32).toString("base64url");

export const hashResumeToken = (token: string) =>
  createHash("sha256").update(asText(token), "utf8").digest("hex");

const hashesMatch = (a: string, b: string) => {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  return left.length === right.length && timingSafeEqual(left, right);
};

export class FormDraftError extends Error {
  readonly status: number;
  constructor(message: string, status = 404) {
    super(message);
    this.name = "FormDraftError";
    this.status = status;
  }
}

/**
 * Le risposte di una bozza: stessi tipi dell'invio, nessun obbligo. Si
 * riusa `validateAnswers` su uno schema con tutti i campi facoltativi, cosi
 * un valore fuori tipo si scarta con la stessa regola.
 */
const ripulisciRisposte = (match: PublicFormMatch, raw: unknown) => {
  const answers = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const facoltativo = {
    ...match.schema,
    fields: match.schema.fields.map((field) => ({ ...field, required: false })),
  };
  const validated = validateAnswers(facoltativo, answers);
  /* Un campo file non ha risposta in bozza: si ignora, come all'invio. */
  const pulite: Record<string, unknown> = {};
  for (const field of match.schema.fields) {
    if (fieldIsFile(field.type)) continue;
    if (field.id in validated.answers) pulite[field.id] = validated.answers[field.id];
  }
  return pulite;
};

export type FormDraftView = {
  answers: Record<string, unknown>;
  respondentEmail: string;
  expiresAt: string;
  updatedAt: string;
};

const toIso = (value: unknown) => (value instanceof Date ? value.toISOString() : asText(value));

const serialize = (row: { answers: unknown; respondent_email: string | null; expires_at: Date; updated_at?: Date | null }): FormDraftView => ({
  answers: row.answers && typeof row.answers === "object" ? (row.answers as Record<string, unknown>) : {},
  respondentEmail: asText(row.respondent_email),
  expiresAt: toIso(row.expires_at),
  updatedAt: toIso(row.updated_at) || new Date().toISOString(),
});

const findDraftRow = async (match: PublicFormMatch, token: string) => {
  if (!TOKEN_PATTERN.test(token)) return null;
  const hash = hashResumeToken(token);
  const row = await (prisma as any).formDraft.findUnique({
    where: { resume_token_hash: hash },
  });
  if (!row) return null;
  /* Stesso modulo, stesso club, non scaduta, non gia diventata pratica. */
  if (row.template_id !== match.templateId || row.organization_id !== match.organizationId) return null;
  if (!hashesMatch(row.resume_token_hash, hash)) return null;
  if (row.submitted_id) return null;
  if (row.expires_at.getTime() < Date.now()) return null;
  return row;
};

/**
 * Salva (o aggiorna) una bozza. Senza gettone ne crea una nuova e restituisce
 * il gettone in chiaro — l'unica volta. Con un gettone valido la aggiorna e
 * restituisce lo stesso gettone.
 */
export const saveFormDraft = async (
  match: PublicFormMatch,
  input: { token?: string | null; answers: unknown; respondentEmail?: string | null },
): Promise<{ token: string; draft: FormDraftView; created: boolean }> => {
  const answers = ripulisciRisposte(match, input.answers);
  if (JSON.stringify(answers).length > FORM_LIMITS.maxSubmissionBodyBytes) {
    throw new FormDraftError("La bozza e troppo grande.", 413);
  }
  const emailRaw = asText(input.respondentEmail).slice(0, 200).toLowerCase();
  /* Un recapito che non ha la forma di un indirizzo non si conserva: e una scrittura pubblica. */
  const email = emailRaw && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(emailRaw) ? emailRaw : null;
  const expiresAt = new Date(Date.now() + FORM_DRAFT_TTL_MS);
  const token = asText(input.token);

  if (token) {
    const row = await findDraftRow(match, token);
    if (!row) throw new FormDraftError("Bozza non trovata o scaduta.");
    const updated = await (prisma as any).formDraft.update({
      where: { id: row.id },
      data: { answers, respondent_email: email ?? row.respondent_email, expires_at: expiresAt, version_id: match.versionId },
    });
    return { token, draft: serialize(updated), created: false };
  }

  /*
    Un tetto per modulo alle bozze vive: una rotta senza sessione non deve
    poter far crescere una tabella senza limite. Un club vero ne ha decine.
  */
  const vive = await (prisma as any).formDraft.count({
    where: { template_id: match.templateId, submitted_id: null, expires_at: { gt: new Date() } },
  });
  if (vive >= MAX_LIVE_DRAFTS_PER_TEMPLATE) {
    throw new FormDraftError("Troppe bozze aperte per questo modulo: riprova piu tardi.", 429);
  }

  const nuovo = generateResumeToken();
  const created = await (prisma as any).formDraft.create({
    data: {
      organization_id: match.organizationId,
      template_id: match.templateId,
      version_id: match.versionId,
      resume_token_hash: hashResumeToken(nuovo),
      answers,
      respondent_email: email,
      expires_at: expiresAt,
    },
  });
  return { token: nuovo, draft: serialize(created), created: true };
};

/** Legge una bozza con il suo gettone; 404 per tutto cio che non e una bozza viva di questo modulo. */
export const readFormDraft = async (match: PublicFormMatch, token: string): Promise<FormDraftView> => {
  const row = await findDraftRow(match, asText(token));
  if (!row) throw new FormDraftError("Bozza non trovata o scaduta.");
  await recordAuditEvent({
    action: AUDIT_ACTIONS.formSubmissionResumed,
    organizationId: match.organizationId,
    resource: "form_drafts",
    resourceId: row.id,
    metadata: { templateId: match.templateId },
  });
  return serialize(row);
};

/** La bozza e diventata una pratica: il gettone non apre piu niente. */
export const consumeFormDraft = async ({
  templateId,
  token,
  submissionId,
}: {
  templateId: string;
  token: string;
  submissionId: string;
}) => {
  if (!TOKEN_PATTERN.test(asText(token))) return;
  await (prisma as any).formDraft.updateMany({
    where: { template_id: templateId, resume_token_hash: hashResumeToken(token), submitted_id: null },
    data: { submitted_id: submissionId },
  });
};

/** Le bozze scadute o gia diventate pratica da piu di un giorno si tolgono: dati personali senza piu uno scopo. */
export const purgeExpiredFormDrafts = async (now = new Date()) => {
  const esito = await (prisma as any).formDraft.deleteMany({
    where: {
      OR: [
        { expires_at: { lt: now } },
        { submitted_id: { not: null }, updated_at: { lt: new Date(now.getTime() - 24 * 60 * 60_000) } },
      ],
    },
  });
  return esito.count as number;
};
