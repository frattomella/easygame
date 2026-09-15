"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Panel, PanelHeader } from "@/components/web/primitives/Surface";
import {
  CERTIFICATE_STATUS,
  ACCOUNT_STATUS,
  STATUS_UNKNOWN,
  resolveStatus,
  type StatusSpec,
} from "@/lib/web/status";
import { formatDateShort, MISSING } from "@/lib/web/format";

/**
 * I mattoni della scheda atleta V2 che le fondamenta non hanno ancora.
 *
 * - `FieldList`: la griglia etichetta/valore della «Detail card» (09 §9.3),
 *   **senza** il pannello — serve dentro una `CollapsedSection`, dove un
 *   secondo pannello sarebbe una card in una card.
 * - `RecordRowList`: l'elenco compatto di una scheda (righe ≤48px, piano 0),
 *   per i sotto-elenchi corti dove una griglia intera sarebbe di troppo:
 *   certificati, visite, allegati, tesseramenti. E **uno** solo, cosi nessuna
 *   sezione si disegna la propria tabella.
 * - `RecordSection`: pannello con intestazione e azioni per una sezione
 *   espansa che non e una griglia etichetta/valore.
 *
 * Candidati alle fondamenta: segnalati nel rapporto di migrazione.
 */

/* ── FieldList ─────────────────────────────────────────────────────────── */
export type RecordField = {
  label: React.ReactNode;
  value: React.ReactNode;
  wide?: boolean;
};

export function FieldList({
  fields,
  columns = 3,
  className,
}: {
  fields: RecordField[];
  columns?: 2 | 3 | 4;
  className?: string;
}) {
  return (
    <dl
      className={cn(
        "grid gap-x-6 gap-y-[18px]",
        columns === 2 && "grid-cols-1 sm:grid-cols-2",
        columns === 3 && "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
        columns === 4 && "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4",
        className,
      )}
    >
      {fields.map((field, index) => (
        <div key={index} className={cn("min-w-0", field.wide && "sm:col-span-2 lg:col-span-full")}>
          <dt className="font-brand text-[12px] text-[rgba(11,26,58,.55)]">{field.label}</dt>
          <dd className="mt-1 break-words font-brand text-[13.5px] text-egw-ink">
            {field.value === null || field.value === undefined || field.value === "" ? MISSING : field.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/* ── RecordSection ─────────────────────────────────────────────────────── */
export function RecordSection({
  id,
  eyebrow,
  title,
  description,
  actions,
  children,
  className,
}: {
  id?: string;
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Panel as="section" id={id} className={cn("p-6 scroll-mt-24", className)}>
      <PanelHeader eyebrow={eyebrow} title={title} description={description} actions={actions} titleAs="h3" />
      {children}
    </Panel>
  );
}

/* ── RecordRowList ─────────────────────────────────────────────────────── */
export type RecordRowItem = {
  id: string;
  title: React.ReactNode;
  meta?: React.ReactNode;
  /** Un valore a destra (data, importo): tabellare. */
  aside?: React.ReactNode;
  status?: React.ReactNode;
  actions?: React.ReactNode;
  /** Una seconda riga sotto (note, dettagli), quando serve. */
  detail?: React.ReactNode;
};

export function RecordRowList({
  rows,
  empty,
  className,
  "aria-label": ariaLabel,
}: {
  rows: RecordRowItem[];
  empty: React.ReactNode;
  className?: string;
  "aria-label"?: string;
}) {
  if (!rows.length) {
    return (
      <p className={cn("rounded-egw-field border border-dashed border-[rgba(11,26,58,.22)] px-4 py-5 text-center font-brand text-[12.5px] text-egw-ink-62", className)}>
        {empty}
      </p>
    );
  }
  return (
    <ul aria-label={ariaLabel} className={cn("divide-y divide-egw-rule rounded-egw-field border border-egw-hairline bg-egw-page-100", className)}>
      {rows.map((row) => (
        <li key={row.id} className="flex min-h-[48px] flex-wrap items-center gap-x-4 gap-y-2 px-3.5 py-2">
          <div className="min-w-0 flex-1 basis-[200px]">
            <div className="egw-ellipsis font-brand text-[13px] font-semibold text-egw-ink" title={typeof row.title === "string" ? row.title : undefined}>
              {row.title}
            </div>
            {row.meta ? <div className="egw-ellipsis font-brand text-[11.5px] text-egw-ink-62">{row.meta}</div> : null}
            {row.detail ? <div className="mt-1 font-brand text-[12px] text-egw-ink-72">{row.detail}</div> : null}
          </div>
          {row.aside ? <div className="egw-num shrink-0 font-brand text-[12.5px] font-semibold text-egw-ink">{row.aside}</div> : null}
          {row.status ? <div className="shrink-0">{row.status}</div> : null}
          {row.actions ? <div className="flex shrink-0 flex-wrap items-center gap-1.5">{row.actions}</div> : null}
        </li>
      ))}
    </ul>
  );
}

/* ── Stati del dominio → pillole ───────────────────────────────────────── */
const spec = (label: string, weight: StatusSpec["weight"], hue: StatusSpec["hue"]): StatusSpec =>
  Object.freeze({ label, weight, hue });

/** Il certificato medico: `valid` · `expiring` · `expired` · `missing`. */
export const medicalCertificateStatus = (value: unknown): StatusSpec =>
  resolveStatus(String(value || ""), CERTIFICATE_STATUS.missing);

/** Il tesseramento: «In corso» · «In rinnovo» · «Scaduto». */
export const registrationStatus = (value: unknown): StatusSpec => {
  const text = String(value || "").trim().toLowerCase();
  if (text === "in corso") return CERTIFICATE_STATUS.valid;
  if (text === "in rinnovo") return spec("IN RINNOVO", "outline", "amber");
  if (text === "scaduto") return CERTIFICATE_STATUS.expired;
  return STATUS_UNKNOWN;
};

/** L'accesso di un genitore (`getGuardianAccessStatus`). */
export const guardianAccessStatus = (state: string, label: string): StatusSpec => {
  const upper = label.toUpperCase();
  switch (state) {
    case "linked":
      return spec(upper, "solid", "green");
    case "token-active":
      return spec(upper, "solid", "blue");
    case "token-expired":
    case "contact-only":
      return spec(upper, "outline", "amber");
    default:
      return spec(upper, "quiet", "neutral");
  }
};

/** L'accesso EasyGame dell'atleta (`none` · `invited` · `active` · `revoked`). */
export const athleteAccountStatus = (value: string): StatusSpec => {
  if (value === "active") return ACCOUNT_STATUS.linked;
  if (value === "invited") return ACCOUNT_STATUS.invited;
  if (value === "revoked") return ACCOUNT_STATUS.revoked;
  return ACCOUNT_STATUS.none;
};

/** Le assegnazioni di abbigliamento (`assignmentStatusLabels`). */
export const clothingAssignmentStatus = (state: string, label: string): StatusSpec => {
  const upper = label.toUpperCase();
  if (state === "delivered" || state === "received") return spec(upper, "solid", "green");
  if (state === "to_order" || state === "ordered" || state === "in_production") return spec(upper, "outline", "amber");
  if (state === "cancelled") return spec(upper, "quiet", "neutral");
  if (state === "unavailable") return spec(upper, "urgent", "red");
  return spec(upper, "solid", "blue");
};

/** I documenti condivisi con la famiglia (`getSharedDocumentStatusLabel`). */
export const sharedDocumentStatus = (state: string, label: string): StatusSpec => {
  const upper = label.toUpperCase();
  switch (state) {
    case "approved":
      return spec(upper, "solid", "green");
    case "rejected":
    case "expired":
      return spec(upper, "urgent", "red");
    case "required":
    case "under_review":
    case "uploaded":
      return spec(upper, "outline", "amber");
    default:
      return spec(upper, "quiet", "neutral");
  }
};

/** `24 set 2026` oppure `—`: la data in una riga di scheda. */
export const dateOrMissing = (value: unknown) =>
  value ? formatDateShort(value as string) : MISSING;
