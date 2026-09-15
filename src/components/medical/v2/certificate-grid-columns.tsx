"use client";

import * as React from "react";
import { Download, Eye } from "lucide-react";
import type { ColumnDef } from "@/components/web/datagrid/types";
import { IdentityCell } from "@/components/web/primitives/Identity";
import { DataChip, StatusPill } from "@/components/web/primitives/StatusPill";
import { Button } from "@/components/web/primitives/Button";
import {
  formatDateNumeric,
  formatDateShort,
  formatDaysLabel,
  MISSING,
} from "@/lib/web/format";
import {
  CERTIFICATE_ROW_LABELS,
  CERTIFICATE_ROW_PILL,
  certificateDaysLeft,
  hasCertificateFile,
  type CertificateRow,
} from "@/components/medical/v2/certificate-grid-model";

/**
 * Le colonne dell'elenco Certificati medici (guideline 07 §7.4): identita a
 * sinistra, classificazione, la scadenza come data, poi lo stato — una
 * pillola, con i giorni quando e «in scadenza» — e l'allegato con i suoi due
 * verbi scritti per esteso: su un documento un'icona da sola non basta.
 *
 * «Emissione» e «Sede» sono nascoste di default: la V1 mostrava «Emesso il»
 * in riga, ma la scadenza e cio che una segreteria legge per prima.
 */
export const buildCertificateColumns = ({
  athleteHref,
  onOpenAthlete,
  onView,
  onDownload,
  showSite,
}: {
  athleteHref: (row: CertificateRow) => string;
  onOpenAthlete: (row: CertificateRow) => void;
  onView: (row: CertificateRow) => void;
  onDownload: (row: CertificateRow) => void;
  showSite: boolean;
}): ColumnDef<CertificateRow>[] => [
  {
    id: "atleta",
    header: "Atleta",
    label: "Atleta",
    kind: "identity",
    locked: true,
    width: 2,
    minWidth: 220,
    sortValue: (row) => row.athleteName.toLowerCase(),
    exportValue: (row) => row.athleteName,
    title: (row) => row.athleteName,
    cell: (row) => (
      <IdentityCell
        round
        avatarSrc={row.avatar || null}
        name={row.athleteName}
        href={athleteHref(row)}
        onClick={() => onOpenAthlete(row)}
        meta={row.siteName || undefined}
        className="min-w-0 flex-1"
      />
    ),
  },
  {
    id: "categoria",
    header: "Categoria",
    label: "Categoria",
    kind: "chips",
    minWidth: 130,
    sortValue: (row) => row.categoryLabel,
    exportValue: (row) => row.categoryLabel,
    title: (row) => row.categoryLabel,
    cell: (row) => <DataChip size="sm">{row.categoryLabel}</DataChip>,
  },
  {
    id: "tipo",
    header: "Tipo certificato",
    label: "Tipo certificato",
    kind: "classification",
    minWidth: 150,
    sortValue: (row) => row.certificateType,
    exportValue: (row) => row.certificateType,
    title: (row) => row.certificateType,
    cell: (row) => (row.status === "missing" ? MISSING : row.certificateType),
  },
  {
    id: "scadenza",
    header: "Scadenza",
    label: "Scadenza",
    kind: "date",
    minWidth: 110,
    width: 0.8,
    sortValue: (row) => row.expiryDate || null,
    exportValue: (row) => (row.expiryDate ? formatDateNumeric(row.expiryDate) : "-"),
    title: (row) =>
      row.expiryDate ? `Scade il ${formatDateNumeric(row.expiryDate)}` : "Nessuna scadenza registrata",
    cell: (row) => (row.expiryDate ? formatDateShort(row.expiryDate) : MISSING),
  },
  {
    id: "stato",
    header: "Stato",
    label: "Stato",
    kind: "status",
    minWidth: 150,
    sortValue: (row) => CERTIFICATE_ROW_LABELS[row.status],
    exportValue: (row) => CERTIFICATE_ROW_LABELS[row.status],
    title: (row) => CERTIFICATE_ROW_LABELS[row.status],
    cell: (row) => {
      const days = row.status === "expiring" ? certificateDaysLeft(row) : null;
      return (
        <StatusPill
          status={CERTIFICATE_ROW_PILL[row.status]}
          detail={days != null ? formatDaysLabel(Math.max(0, days)) : undefined}
        />
      );
    },
  },
  {
    id: "allegato",
    header: "Allegato",
    label: "Allegato",
    kind: "chips",
    minWidth: 190,
    width: 1.2,
    sortValue: (row) => (hasCertificateFile(row) ? 1 : 0),
    exportValue: (row) => (hasCertificateFile(row) ? "Presente" : "-"),
    cell: (row) =>
      hasCertificateFile(row) ? (
        <>
          <Button variant="row" size="xs" icon={<Eye />} onClick={() => onView(row)}>
            Visualizza
          </Button>
          <Button variant="row" size="xs" icon={<Download />} onClick={() => onDownload(row)}>
            Scarica
          </Button>
        </>
      ) : (
        MISSING
      ),
  },
  {
    id: "emissione",
    header: "Emissione",
    label: "Data di emissione",
    kind: "date",
    hidden: true,
    minWidth: 110,
    width: 0.8,
    sortValue: (row) => row.issueDate || null,
    exportValue: (row) => (row.issueDate ? formatDateNumeric(row.issueDate) : "-"),
    cell: (row) => (row.issueDate ? formatDateShort(row.issueDate) : MISSING),
  },
  ...(showSite
    ? [
        {
          id: "sede",
          header: "Sede",
          label: "Sede",
          kind: "chips",
          hidden: true,
          minWidth: 130,
          sortValue: (row) => row.siteName,
          exportValue: (row) => row.siteName || "-",
          title: (row) => row.siteName || undefined,
          cell: (row) => (row.siteName ? <DataChip size="sm">{row.siteName}</DataChip> : MISSING),
        } satisfies ColumnDef<CertificateRow>,
      ]
    : []),
];
