import type { StatusSpec } from "@/lib/web/status";
import { PERSON_STATUS } from "@/lib/web/status";
import type { ViewDef } from "@/components/web/datagrid/types";
import { CONSENT_SUBJECT_KINDS, type ConsentDefinitionStatus, type ConsentSource, type ConsentStatus, type ConsentSubjectKind } from "@/lib/consents/model";

/**
 * Il modello di `/consensi` per il Web V2 (audit
 * `docs/redesign/audit/wave-e-consensi.md`): i tipi delle tre letture, le
 * parole, le viste. Le **regole** — quale decisione e ammessa da quale
 * stato, quale chiave e valida — restano in `src/lib/consents/model.ts`.
 * Modulo puro: niente React, niente rete.
 */

/* ── Le tre letture ────────────────────────────────────────────────────── */
export type Definizione = {
  id: string;
  key: string;
  title: string;
  description: string;
  required: boolean;
  status: string;
  publishedVersion: number;
  publishedVersionId: string | null;
  publishedAt: string | null;
};

export type Decisione = {
  id: string;
  status: string;
  version: number | null;
  subjectKind: string;
  subjectId: string;
  subjectLabel: string;
  decidedAt: string | null;
  source: string;
  note: string;
};

export type StatoSoggetto = {
  definitionId: string;
  definitionKey: string;
  definitionTitle: string;
  required: boolean;
  subjectKind: string;
  subjectId: string;
  subjectLabel: string;
  status: string;
  version: number | null;
  decidedAt: string | null;
  onOutdatedVersion: boolean;
  historyCount: number;
};

/* ── Le parole ─────────────────────────────────────────────────────────── */
const spec = (label: string, weight: StatusSpec["weight"], hue: StatusSpec["hue"]): StatusSpec =>
  Object.freeze({ label, weight, hue });

/** Lo stato di una definizione: bozza → attivo → ritirato («Ritirato» manca in `status.ts`). */
export const DEFINITION_STATUS: Record<ConsentDefinitionStatus, StatusSpec> = Object.freeze({
  draft: PERSON_STATUS.draft,
  active: PERSON_STATUS.active,
  retired: spec("RITIRATO", "outline", "amber"),
});

export const DEFINITION_STATUS_LABELS: Record<ConsentDefinitionStatus, string> = {
  draft: "Bozza",
  active: "Attivo",
  retired: "Ritirato",
};

export const definitionStatusSpec = (status: unknown): StatusSpec =>
  DEFINITION_STATUS[String(status ?? "") as ConsentDefinitionStatus] || PERSON_STATUS.draft;

export const definitionStatusLabel = (status: unknown): string =>
  DEFINITION_STATUS_LABELS[String(status ?? "") as ConsentDefinitionStatus] || String(status ?? "");

/**
 * Lo stato di una decisione, con le parole della V1: Accettato, Rifiutato,
 * Revocato, Manca. Nessuna di queste e in `status.ts`; la spec locale ha la
 * stessa forma ed e segnalata nel rapporto.
 */
export const DECISION_STATUS: Record<ConsentStatus | "missing", StatusSpec> = Object.freeze({
  accepted: spec("ACCETTATO", "solid", "green"),
  rejected: spec("RIFIUTATO", "solid", "amber"),
  revoked: spec("REVOCATO", "solid", "red"),
  missing: spec("MANCA", "quiet", "neutral"),
});

export const DECISION_STATUS_LABELS: Record<ConsentStatus | "missing", string> = {
  accepted: "Accettato",
  rejected: "Rifiutato",
  revoked: "Revocato",
  missing: "Manca",
};

export const decisionStatusSpec = (status: unknown): StatusSpec =>
  DECISION_STATUS[String(status ?? "") as ConsentStatus | "missing"] || DECISION_STATUS.missing;

export const decisionStatusLabel = (status: unknown): string =>
  DECISION_STATUS_LABELS[String(status ?? "") as ConsentStatus | "missing"] || String(status ?? "");

export const SUBJECT_KIND_LABELS: Record<ConsentSubjectKind, string> = {
  athlete: "Atleta",
  person: "Persona",
  member: "Socio",
  guardian: "Tutore",
};

export const subjectKindLabel = (kind: unknown): string =>
  SUBJECT_KIND_LABELS[String(kind ?? "") as ConsentSubjectKind] || String(kind ?? "");

export const SUBJECT_KIND_OPTIONS = CONSENT_SUBJECT_KINDS.map((kind) => ({ value: kind, label: SUBJECT_KIND_LABELS[kind] }));

/** Da dove arriva una decisione: la V1 mostrava la chiave grezza. */
export const SOURCE_LABELS: Record<ConsentSource, string> = {
  public_form: "Modulo pubblico",
  internal_form: "Compilato in segreteria",
  manual: "Registrata a mano",
  import: "Importazione",
  subject: "Dall'interessato",
};

export const sourceLabel = (source: unknown): string => {
  const key = String(source ?? "").trim();
  return SOURCE_LABELS[key as ConsentSource] || key;
};

/* ── Le viste ──────────────────────────────────────────────────────────── */
export const DEFINITION_VIEWS: ViewDef[] = [
  { id: "in-use", label: "In uso", filters: { status: ["active", "draft"] }, builtIn: true, isDefault: true },
  { id: "active", label: "Attivi", filters: { status: ["active"] }, builtIn: true },
  { id: "draft", label: "Bozze", filters: { status: ["draft"] }, builtIn: true },
  { id: "retired", label: "Ritirati", filters: { status: ["retired"] }, builtIn: true, tone: "amber" },
  { id: "required", label: "Obbligatori", filters: { required: true }, builtIn: true },
  { id: "unpublished", label: "Senza testo pubblicato", filters: { published: "no" }, builtIn: true, tone: "amber" },
];

export const DECISION_VIEWS: ViewDef[] = [
  { id: "accepted", label: "Accettati", filters: { status: ["accepted"] }, builtIn: true },
  { id: "rejected", label: "Rifiutati", filters: { status: ["rejected"] }, builtIn: true },
  { id: "revoked", label: "Revocati", filters: { status: ["revoked"] }, builtIn: true, tone: "red" },
];

/** «Testo in vigore: versione 2 del 24 set 2026.» oppure la frase della V1 quando non c'e. */
export const describePublishedText = (definizione: Pick<Definizione, "publishedVersion" | "publishedAt">, formatDate: (value: string | null) => string): string =>
  definizione.publishedVersion > 0
    ? `Testo in vigore: versione ${definizione.publishedVersion} del ${formatDate(definizione.publishedAt)}.`
    : "Nessun testo pubblicato: non si possono raccogliere decisioni.";

/** La chiave di riga di uno stato per soggetto (una riga per definizione). */
export const statoSoggettoId = (stato: StatoSoggetto): string => `${stato.definitionId}-${stato.subjectId}`;
