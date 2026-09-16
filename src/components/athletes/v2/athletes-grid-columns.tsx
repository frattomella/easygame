"use client";

import * as React from "react";
import type { ColumnDef } from "@/components/web/datagrid/types";
import { IdentityCell } from "@/components/web/primitives/Identity";
import { DataChip, StatusPill } from "@/components/web/primitives/StatusPill";
import { ENROLMENT_STATUS, CERTIFICATE_STATUS } from "@/lib/web/status";
import {
  formatDateNumeric,
  formatDateShort,
  formatDaysLabel,
  joinMeta,
  MISSING,
} from "@/lib/web/format";
import { ATHLETE_STATUS_LABELS } from "@/lib/athletes/status";
import {
  athleteCertificateStatus,
  certificateDaysLeft,
  ATHLETE_STATUS_PILL,
  type Athlete,
} from "@/components/athletes/v2/athlete-grid-model";

/**
 * Le colonne della griglia Atleti (guideline 07 §7.4): identita a sinistra,
 * classificazione al centro, gli stati dopo, le azioni in fondo. Due
 * lifecycle — stato dell'atleta e certificato — sono due colonne con due
 * intestazioni, mai due pillole in una cella.
 *
 * L'ordine delle colonne e le loro etichette di esportazione sono quelli
 * della V1 («Atleta», «Categoria», «Anno di Nascita», «Stato», «Certificato
 * Medico», «Iscrizione», «Numero Maglia»), cosi un CSV esportato ieri e uno
 * esportato oggi hanno la stessa intestazione. «Eta» resta fuori: la V1 la
 * teneva nascosta e non selezionabile.
 */
const birthYearOf = (row: Athlete) =>
  row.birthDate ? new Date(row.birthDate).getFullYear() : null;

/** Il valore del certificato come lo esportava la V1: data e «(scaduto)». */
const certificateExportValue = (row: Athlete) => {
  if (!row.medicalCertExpiry) return "-";
  const date = new Date(row.medicalCertExpiry).toLocaleDateString("it-IT", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
  const expired =
    athleteCertificateStatus(row.medicalCertExpiry) ===
    CERTIFICATE_STATUS.expired;
  return `${date}${expired ? " (scaduto)" : ""}`;
};

export const buildAthleteColumns = ({
  clubId,
  onOpen,
  categoryLabel = (row) => row.categoryLabel,
}: {
  clubId: string | null | undefined;
  /** Apre la scheda senza ricaricare la pagina; l'`href` resta per il tasto centrale. */
  onOpen?: (row: Athlete) => void;
  /**
   * Come si scrive la categoria della riga (ADR-0185): la pagina la chiede
   * all'indice canonico, che accosta la sede dove il nome ne nomina due.
   * Senza, due «Pulcini» erano due chip identici e l'export li mescolava.
   */
  categoryLabel?: (row: Athlete) => string;
}): ColumnDef<Athlete>[] => [
  {
    id: "atleta",
    header: "Atleta",
    label: "Atleta",
    kind: "identity",
    locked: true,
    width: 2,
    minWidth: 240,
    sortValue: (row) =>
      `${row.lastName} ${row.firstName} ${row.name}`.trim().toLowerCase(),
    exportValue: (row) => row.name,
    title: (row) => row.name,
    cell: (row) => (
      <span className="flex min-w-0 items-center gap-2">
        <IdentityCell
          number={row.jerseyNumber || null}
          name={row.name}
          href={`/athletes/${row.id}?clubId=${encodeURIComponent(clubId || "")}`}
          onClick={onOpen ? () => onOpen(row) : undefined}
          meta={
            row.membershipType === "secondary"
              ? joinMeta(
                  birthYearOf(row),
                  row.siteName,
                  `Categoria primaria: ${
                    row.primaryCategoryId
                      ? categoryLabel({
                          ...row,
                          categoryId: row.primaryCategoryId,
                          categoryLabel: row.primaryCategoryLabel || "",
                        })
                      : row.primaryCategoryLabel || "Non definita"
                  }`,
                )
              : joinMeta(birthYearOf(row), row.siteName)
          }
          className="min-w-0 flex-1"
        />
        {row.membershipType === "secondary" ? (
          <DataChip size="sm" tone="blue">
            Secondaria
          </DataChip>
        ) : null}
      </span>
    ),
  },
  {
    id: "categoria",
    header: "Categoria",
    label: "Categoria",
    kind: "chips",
    minWidth: 150,
    sortValue: (row) => categoryLabel(row),
    exportValue: (row) =>
      row.membershipType === "secondary"
        ? `${categoryLabel(row)} (secondaria)`
        : categoryLabel(row),
    title: (row) => categoryLabel(row),
    cell: (row) => (
      <>
        <DataChip size="sm">{categoryLabel(row)}</DataChip>
        {row.membershipType === "primary" && row.categoryId ? (
          <DataChip size="sm" tone="green">
            Primaria
          </DataChip>
        ) : null}
      </>
    ),
  },
  /*
    La sede della riga (ADR-0194 §18): e quella dell'appartenenza — la
    squadra — non una «sede dell'atleta». Ogni riga e un'appartenenza, quindi
    l'export dice la sede della primaria e quella di ogni secondaria, senza
    inventare una sede unica per chi gioca in due sedi. L'export prende le
    colonne visibili: percio la colonna e visibile, e si puo nascondere.
  */
  {
    id: "sede",
    header: "Sede",
    label: "Sede",
    kind: "text",
    minWidth: 120,
    sortValue: (row) => row.siteName || "",
    exportValue: (row) => row.siteName || "-",
    cell: (row) => <span className="egw-ellipsis">{row.siteName || MISSING}</span>,
  },
  {
    id: "anno",
    header: "Anno di nascita",
    label: "Anno di nascita",
    kind: "number",
    minWidth: 96,
    width: 0.7,
    sortValue: (row) => birthYearOf(row),
    exportValue: (row) => (birthYearOf(row) ? String(birthYearOf(row)) : "-"),
    cell: (row) => birthYearOf(row) ?? MISSING,
  },
  {
    id: "stato",
    header: "Stato",
    label: "Stato",
    kind: "status",
    minWidth: 120,
    sortValue: (row) => ATHLETE_STATUS_LABELS[row.status],
    exportValue: (row) => ATHLETE_STATUS_LABELS[row.status],
    title: (row) => ATHLETE_STATUS_LABELS[row.status],
    cell: (row) => <StatusPill status={ATHLETE_STATUS_PILL[row.status]} />,
  },
  {
    id: "certificato",
    header: "Certificato medico",
    label: "Certificato medico",
    kind: "status",
    minWidth: 170,
    width: 1.2,
    sortValue: (row) => row.medicalCertExpiry || null,
    exportValue: certificateExportValue,
    title: (row) =>
      row.medicalCertExpiry
        ? `Scadenza ${formatDateNumeric(row.medicalCertExpiry)}`
        : "Nessuna scadenza registrata",
    cell: (row) => {
      const spec = athleteCertificateStatus(row.medicalCertExpiry);
      const days = certificateDaysLeft(row.medicalCertExpiry);
      const detail =
        spec === CERTIFICATE_STATUS.expiring && days != null
          ? formatDaysLabel(days)
          : spec === CERTIFICATE_STATUS.missing
            ? undefined
            : formatDateShort(row.medicalCertExpiry);
      return <StatusPill status={spec} detail={detail} />;
    },
  },
  {
    id: "iscrizione",
    header: "Iscrizione",
    label: "Iscrizione",
    kind: "status",
    hidden: true,
    minWidth: 120,
    sortValue: (row) => (row.registrationComplete ? 1 : 0),
    exportValue: (row) =>
      row.registrationComplete ? "Completa" : "Da completare",
    title: (row) =>
      row.registrationComplete
        ? "Iscrizione completata"
        : "Iscrizione da completare",
    cell: (row) => (
      <StatusPill
        status={
          row.registrationComplete
            ? ENROLMENT_STATUS.active
            : ENROLMENT_STATUS.incomplete
        }
      />
    ),
  },
  {
    id: "maglia",
    header: "Numero maglia",
    label: "Numero maglia",
    kind: "number",
    hidden: true,
    minWidth: 96,
    width: 0.7,
    sortValue: (row) =>
      row.jerseyNumber ? Number(row.jerseyNumber) || row.jerseyNumber : null,
    exportValue: (row) => row.jerseyNumber || "-",
    cell: (row) => row.jerseyNumber || MISSING,
  },
];
