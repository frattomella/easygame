"use client";

import * as React from "react";
import { CalendarDays, CreditCard, Trophy, Users } from "lucide-react";
import { Panel, PanelHeader } from "@/components/web/primitives/Surface";
import { EmptyStateCard } from "@/components/web/page/Cards";
import { DataGrid } from "@/components/web/datagrid/DataGrid";
import type { ColumnDef, ExportRequest } from "@/components/web/datagrid/types";
import { useToast } from "@/components/ui/toast-notification";
import { csvFileName, downloadCsv, toCsv } from "@/lib/csv";
import { formatInteger, formatMoney, formatPercent, MISSING } from "@/lib/web/format";
import type {
  AttendanceReport,
  CategoryReport,
  CategoryReportRow,
  MatchConvocationReport,
  PaymentReport,
} from "@/lib/club-report-utils";
import { ReportStatGrid, ReportStatTile } from "./report-stat-tile";

/**
 * I quattro report di attivita del club su `/reports` (pattern 4 «Analytics /
 * report»): un pannello per report, con l'occhiello, il titolo della V1 e il
 * suo stato vuoto. I numeri arrivano gia calcolati da
 * `src/lib/club-report-utils.ts`: qui non si somma niente.
 */

/* ── Report categoria per atleta ─────────────────────────────────────────── */

export const formatAthleteLastFirst = (athlete: any, fallback: string) => {
  const lastName = String(athlete?.last_name || athlete?.lastName || "").trim();
  const firstName = String(
    athlete?.first_name || athlete?.firstName || "",
  ).trim();
  return [lastName, firstName].filter(Boolean).join(" ") || fallback;
};

const ratio = (numerator: number, denominator: number) =>
  `${formatInteger(numerator)}/${formatInteger(denominator)}`;

export const categoryReportRowId = (row: CategoryReportRow) =>
  `${row.categoryId}-${row.athleteId}`;

/**
 * Le colonne del report categoria per atleta: le stesse sette della tabella
 * V1, nello stesso ordine. I rapporti (`n/n`) ordinano sul numeratore; le
 * percentuali sul loro valore.
 */
export const buildCategoryReportColumns = (): ColumnDef<CategoryReportRow>[] => [
  {
    id: "athlete",
    header: "Atleta",
    label: "Atleta",
    kind: "text",
    locked: true,
    width: 1.6,
    minWidth: 180,
    cell: (row) => (
      <span className="font-semibold text-egw-ink">
        {formatAthleteLastFirst(row.athlete, row.athleteName)}
      </span>
    ),
    sortValue: (row) => formatAthleteLastFirst(row.athlete, row.athleteName),
    title: (row) => formatAthleteLastFirst(row.athlete, row.athleteName),
  },
  {
    id: "category",
    header: "Categoria",
    label: "Categoria",
    kind: "classification",
    minWidth: 130,
    cell: (row) => row.categoryName,
    sortValue: (row) => row.categoryName,
    title: (row) => row.categoryName,
  },
  {
    id: "convocations",
    header: "Convocazioni / gare",
    label: "Convocazioni / gare",
    kind: "number",
    align: "right",
    minWidth: 120,
    cell: (row) => ratio(row.convocations, row.totalMatches),
    sortValue: (row) => row.convocations,
    exportValue: (row) => `${row.convocations}/${row.totalMatches}`,
  },
  {
    id: "presences",
    header: "Presenze / allenamenti",
    label: "Presenze / allenamenti",
    kind: "number",
    align: "right",
    minWidth: 130,
    cell: (row) => ratio(row.presences, row.totalTrainings),
    sortValue: (row) => row.presences,
    exportValue: (row) => `${row.presences}/${row.totalTrainings}`,
  },
  {
    id: "noResponse",
    header: "Senza risposta",
    label: "Senza risposta",
    kind: "number",
    align: "right",
    minWidth: 110,
    cell: (row) =>
      row.rsvpRequested ? ratio(row.noResponse, row.rsvpRequested) : MISSING,
    sortValue: (row) => (row.rsvpRequested ? row.noResponse : null),
    exportValue: (row) =>
      row.rsvpRequested ? `${row.noResponse}/${row.rsvpRequested}` : "",
  },
  {
    id: "convocationRate",
    header: "% convocazione",
    label: "% convocazione",
    kind: "number",
    align: "right",
    minWidth: 110,
    cell: (row) => (
      <span className="font-bold">{formatPercent(row.convocationRate)}</span>
    ),
    sortValue: (row) => row.convocationRate,
    exportValue: (row) => row.convocationRate,
  },
  {
    id: "presenceRate",
    header: "% presenza",
    label: "% presenza",
    kind: "number",
    align: "right",
    minWidth: 100,
    cell: (row) => (
      <span className="font-bold">{formatPercent(row.presenceRate)}</span>
    ),
    sortValue: (row) => row.presenceRate,
    exportValue: (row) => row.presenceRate,
  },
];

/**
 * L'export CSV della griglia: **cio che si vede** — le righe filtrate e le
 * colonne visibili, nell'ordine a schermo. Il tracciato e quello di
 * `src/lib/csv.ts`, unico proprietario del formato. La V1 non aveva un export
 * di questo report: e la griglia del sistema a portarlo (guideline 07 §7.10).
 */
export const buildCategoryReportCsv = (
  request: ExportRequest<CategoryReportRow>,
): string => {
  const columns = request.columns.map((column) => ({
    key: column.id,
    label: column.label ?? String(column.header),
  }));
  const rows = request.rows.map((row) =>
    Object.fromEntries(
      request.columns.map((column) => [
        column.id,
        column.exportValue
          ? column.exportValue(row)
          : column.sortValue
            ? column.sortValue(row)
            : "",
      ]),
    ),
  );
  return toCsv(columns, rows);
};

export function CategoryAthleteGrid({
  report,
  loading,
  gridId,
}: {
  report: CategoryReport;
  loading: boolean;
  /** L'ancora del collegamento `?report=categories` che arriva da Atleti. */
  gridId?: string;
}) {
  const { showToast } = useToast();
  const columns = React.useMemo(() => buildCategoryReportColumns(), []);

  const handleExport = (request: ExportRequest<CategoryReportRow>) => {
    if (request.kind !== "csv") return;
    if (!request.rows.length) {
      showToast("error", "Nessuna riga da esportare");
      return;
    }
    downloadCsv(
      csvFileName("Report categoria per atleta"),
      buildCategoryReportCsv(request),
    );
    showToast("success", "CSV scaricato");
  };

  return (
    <div id={gridId} className="scroll-mt-4">
      <DataGrid<CategoryReportRow>
        module="report-categorie"
        aria-label="Report categoria per atleta"
        rows={report.rows}
        getRowId={categoryReportRowId}
        rowLabel={(row) => formatAthleteLastFirst(row.athlete, row.athleteName)}
        columns={columns}
        defaultSort={{ columnId: "athlete", direction: "asc" }}
        noun={{ singular: "riga", plural: "righe" }}
        canSelect={false}
        hideViews
        hideFooter={report.rows.length <= 25}
        state={loading ? "loading" : "ready"}
        export={{ onExport: handleExport, kinds: ["csv"] }}
        banner={
          <div className="border-b border-egw-hairline px-4 py-3.5 sm:px-5">
            <PanelHeader
              eyebrow="Report"
              title="Report categoria per atleta"
              className="mb-0"
            />
          </div>
        }
        empty={{
          icon: <Users />,
          title: "Nessun dato categoria",
          description:
            "Il report si popola quando esistono categorie salvate nel club e atleti associati.",
        }}
      />
    </div>
  );
}

/* ── Report presenze ─────────────────────────────────────────────────────── */

export function AttendancePanel({
  report,
  loading,
}: {
  report: AttendanceReport;
  loading: boolean;
}) {
  const hasData = report.totalTrainings > 0 || report.expectedAttendances > 0;

  return (
    <Panel as="section" aria-labelledby="report-presenze-title">
      <PanelHeader
        eyebrow="Report"
        title={<span id="report-presenze-title">Report presenze</span>}
      />
      {loading ? (
        <ReportStatGrid>
          <ReportStatTile label="Allenamenti" value={null} loading />
          <ReportStatTile label="Presenze registrate" value={null} loading />
          <ReportStatTile label="Presenze mancanti" value={null} loading />
        </ReportStatGrid>
      ) : hasData ? (
        <ReportStatGrid>
          <ReportStatTile
            label="Allenamenti"
            value={formatInteger(report.totalTrainings)}
            qualifier="Allenamenti nel filtro"
          />
          <ReportStatTile
            label="Presenze registrate"
            value={ratio(report.presentAttendances, report.expectedAttendances)}
            qualifier={`${formatPercent(report.attendanceRate)} presenze`}
          />
          <ReportStatTile
            label="Presenze mancanti"
            value={formatInteger(report.missingAttendances)}
            qualifier={`${formatInteger(report.absentAttendances)} assenze registrate`}
          />
        </ReportStatGrid>
      ) : (
        <EmptyStateCard
          flat
          icon={<CalendarDays />}
          title="Nessuna presenza reale da mostrare"
          description="Quando verranno salvati allenamenti e presenze, questa sezione mostrerà totali e percentuali reali."
        />
      )}
    </Panel>
  );
}

/* ── Report gare e convocazioni ──────────────────────────────────────────── */

export function MatchPanel({
  report,
  loading,
}: {
  report: MatchConvocationReport;
  loading: boolean;
}) {
  return (
    <Panel as="section" aria-labelledby="report-gare-title">
      <PanelHeader
        eyebrow="Report"
        title={<span id="report-gare-title">Report gare e convocazioni</span>}
      />
      {loading ? (
        <ReportStatGrid>
          <ReportStatTile label="Gare" value={null} loading />
          <ReportStatTile label="Convocazioni" value={null} loading />
          <ReportStatTile label="Gare senza convocazioni" value={null} loading />
        </ReportStatGrid>
      ) : report.totalMatches > 0 ? (
        <ReportStatGrid>
          <ReportStatTile
            label="Gare"
            value={formatInteger(report.totalMatches)}
            qualifier="Gare nel filtro"
          />
          <ReportStatTile
            label="Convocazioni"
            value={formatInteger(report.totalConvocations)}
            qualifier={`${formatInteger(report.uniqueAthletesConvocated)} atleti convocati`}
          />
          <ReportStatTile
            label="Gare senza convocazioni"
            value={formatInteger(report.matchesWithoutConvocations)}
            qualifier={`${formatPercent(report.convocationCompletionRate)} gare compilate`}
            tone={report.matchesWithoutConvocations > 0 ? "amber" : "neutral"}
          />
        </ReportStatGrid>
      ) : (
        <EmptyStateCard
          flat
          icon={<Trophy />}
          iconTone="amber"
          title="Nessuna gara reale nel filtro"
          description="Le convocazioni appariranno qui quando saranno salvate gare associate alle categorie."
        />
      )}
    </Panel>
  );
}

/* ── Report pagamenti atleti ─────────────────────────────────────────────── */

export function PaymentPanel({
  report,
  loading,
}: {
  report: PaymentReport;
  loading: boolean;
}) {
  return (
    <Panel as="section" aria-labelledby="report-pagamenti-title">
      <PanelHeader
        eyebrow="Report"
        title={<span id="report-pagamenti-title">Report pagamenti atleti</span>}
      />
      {loading ? (
        <ReportStatGrid>
          <ReportStatTile label="Totale dovuto" value={null} loading />
          <ReportStatTile label="Pagato" value={null} loading />
          <ReportStatTile label="In attesa" value={null} loading />
          <ReportStatTile label="Scaduto" value={null} loading />
        </ReportStatGrid>
      ) : report.hasPayments ? (
        <ReportStatGrid>
          <ReportStatTile
            label="Totale dovuto"
            value={formatMoney(report.totalDue)}
            qualifier="Pagamenti atleti non annullati"
          />
          <ReportStatTile
            label="Pagato"
            value={formatMoney(report.totalPaid)}
            qualifier={
              report.partialCount
                ? `Denaro incassato · ${formatInteger(report.paidCount)} rate saldate, ${formatInteger(report.partialCount)} in parte`
                : `Denaro incassato · ${formatInteger(report.paidCount)} rate saldate`
            }
          />
          <ReportStatTile
            label="In attesa"
            value={formatMoney(report.totalPending)}
            qualifier={`Residuo su ${formatInteger(report.pendingCount)} rate`}
          />
          <ReportStatTile
            label="Scaduto"
            value={formatMoney(report.totalOverdue)}
            qualifier={`Residuo su ${formatInteger(report.overdueCount)} rate`}
            tone={report.totalOverdue > 0 ? "amber" : "neutral"}
          />
        </ReportStatGrid>
      ) : (
        <EmptyStateCard
          flat
          icon={<CreditCard />}
          iconTone="green"
          title="Nessun pagamento atleta reale"
          description="Questa sezione rimane vuota finché non esistono pagamenti salvati nel database."
        />
      )}
    </Panel>
  );
}
