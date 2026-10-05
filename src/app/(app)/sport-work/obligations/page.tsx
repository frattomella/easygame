"use client";

import * as React from "react";
import { Suspense } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, ClipboardList, RefreshCw } from "lucide-react";
import { useToast } from "@/components/ui/toast-notification";
import { apiRequest } from "@/lib/api/client";
import { Button } from "@/components/web/primitives/Button";
import { SegmentedControl } from "@/components/web/primitives/Controls";
import { DataChip, StatusPill } from "@/components/web/primitives/StatusPill";
import { Select } from "@/components/web/forms/Field";
import { AlertBlock } from "@/components/web/page/Alerts";
import { InfoCard } from "@/components/web/page/Cards";
import { useConfirm } from "@/components/web/overlays/useConfirm";
import { DataGrid } from "@/components/web/datagrid/DataGrid";
import type { ColumnDef, FilterDef, RowActionDef, ViewDef } from "@/components/web/datagrid/types";
import { formatDateShort, formatMoney, joinMeta } from "@/lib/web/format";
import { exportGridCsv } from "@/lib/web/export-grid-csv";
import { OBLIGATION_KINDS, OBLIGATION_KIND_LABELS, OBLIGATION_STATUSES, OBLIGATION_STATUS_LABELS } from "@/lib/sport-work/model";
import { CONFIGURED_RULE_YEARS } from "@/lib/sport-work/rules";
import { SportWorkShell } from "@/components/sport-work/v2/sport-work-shell";
import { useSportWorkRole } from "@/components/sport-work/v2/use-sport-work-role";
import { OBLIGATION_STATUS_SPEC, specOf } from "@/components/sport-work/v2/sport-work-status";
import { defaultRuleYear, dueLabel, obligationKindLabel, type ObligationRow } from "@/components/sport-work/v2/sport-work-model";

/**
 * `/sport-work/obligations` — l'agenda degli adempimenti e i dataset che il
 * consulente si porta via (Web V2, pattern 1 con aree).
 *
 * **La frase che questa pagina deve dire, e dice, e una sola**: EasyGame
 * prepara l'input dell'adempimento, non l'adempimento. Non trasmette al
 * RASD, non compila l'F24, non predispone la CU. Sa che l'adempimento
 * esiste, entro quando, con quali dati, e se qualcuno lo ha marcato fatto.
 *
 * Le letture e le scritture sono quelle della V1: `GET /obligations`,
 * `GET /datasets?kind=f24|cu&year=`, `POST /obligations/sync`,
 * `POST /obligations/{id}/complete`. I due CSV escono dalla griglia con le
 * intestazioni italiane delle colonne (la V1 esportava le chiavi dell'API).
 */
type Tab = "agenda" | "f24" | "cu" | "storico";

const TABS: Array<{ value: Tab; label: string }> = [
  { value: "agenda", label: "Agenda" },
  { value: "f24", label: "Dati F24" },
  { value: "cu", label: "Dati CU" },
  { value: "storico", label: "Storico" },
];

const resolveTab = (value: string | null): Tab => (TABS.some((tab) => tab.value === value) ? (value as Tab) : "agenda");

type F24Row = { period: string; causale: string; employeeContribution: number; employerContribution: number; total: number; dueDate: string };
type CuRow = { personId: string; personName: string; fiscalCode: string | null; grossPaid: number; externalDeclared: number; progressive: number; taxableFiscal: number; attentionReason?: string | null };

const AGENDA_VIEWS: ViewDef[] = [
  { id: "self-declaration", label: "Autocertificazioni", filters: { kind: "SELF_DECLARATION" }, builtIn: true, tone: "amber" },
  { id: "contributions", label: "Contributi e F24", filters: { kind: ["CONTRIBUTION", "F24"] }, builtIn: true },
  { id: "contracts", label: "Contratti", filters: { kind: "CONTRACT_EXPIRY" }, builtIn: true },
];

function ObligationsPage() {
  const router = useRouter();
  const pathname = usePathname() || "/sport-work/obligations";
  const searchParams = useSearchParams();
  const { showToast } = useToast();
  const { canManage, canFiscal } = useSportWorkRole();
  const [confirm, confirmDialog] = useConfirm();
  const tab = resolveTab(searchParams?.get("tab") || null);
  const requestedView = searchParams?.get("view") || null;

  const [obligations, setObligations] = React.useState<ObligationRow[]>([]);
  const [f24, setF24] = React.useState<F24Row[]>([]);
  const [cu, setCu] = React.useState<CuRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [year, setYear] = React.useState(() => defaultRuleYear());
  const [requestedViewId, setRequestedViewId] = React.useState<string | null>(requestedView && AGENDA_VIEWS.some((view) => view.id === requestedView) ? requestedView : null);

  const load = React.useCallback(async () => {
    setLoading(true);
    const [obligationsResult, f24Result, cuResult] = await Promise.all([
      apiRequest<ObligationRow[]>("/api/v1/sport-work/obligations"),
      apiRequest<any>(`/api/v1/sport-work/datasets?kind=f24&year=${year}`),
      apiRequest<any>(`/api/v1/sport-work/datasets?kind=cu&year=${year}`),
    ]);
    setLoading(false);
    if (obligationsResult.error) {
      const message = obligationsResult.error.message || "Errore nella lettura dell'agenda";
      setLoadError(message);
      showToast("error", message);
      return;
    }
    setLoadError(null);
    setObligations(Array.isArray(obligationsResult.data) ? obligationsResult.data : []);
    setF24(Array.isArray(f24Result.data?.rows) ? f24Result.data.rows : []);
    setCu(Array.isArray(cuResult.data?.rows) ? cuResult.data.rows : []);
  }, [year, showToast]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const selectTab = (next: Tab) => {
    const query = new URLSearchParams(searchParams?.toString() || "");
    query.set("tab", next);
    router.replace(`${pathname}?${query.toString()}`, { scroll: false });
  };

  const sync = async () => {
    setBusy(true);
    const { data, error } = await apiRequest<any>("/api/v1/sport-work/obligations/sync", { method: "POST" });
    setBusy(false);
    if (error) {
      showToast("error", error.message || "Aggiornamento non riuscito");
      return;
    }
    showToast("success", `Agenda riallineata: ${data?.created ?? 0} nuovi, ${data?.updated ?? 0} aggiornati, ${data?.closed ?? 0} non più dovuti.`);
    await load();
  };

  const complete = async (row: ObligationRow) => {
    const ok = await confirm({
      title: `Segnare come assolto «${row.title}»?`,
      description: "«Assolto» significa che una persona lo ha fatto e lo dichiara qui. EasyGame non trasmette niente, e un adempimento assolto non si riapre.",
      confirmLabel: "Assolto",
    });
    if (!ok) return;
    setBusy(true);
    const { error } = await apiRequest(`/api/v1/sport-work/obligations/${encodeURIComponent(row.id)}/complete`, { method: "POST", body: {} });
    setBusy(false);
    if (error) {
      showToast("error", error.message || "Aggiornamento non riuscito");
      return;
    }
    showToast("success", "Adempimento marcato come assolto");
    await load();
  };

  const aperti = React.useMemo(() => obligations.filter((row) => row.status === "DUE"), [obligations]);
  const chiusi = React.useMemo(() => obligations.filter((row) => row.status !== "DUE"), [obligations]);

  /* ── Colonne ──────────────────────────────────────────────────────────── */
  const obligationColumns = React.useMemo<ColumnDef<ObligationRow>[]>(
    () => [
      {
        id: "title",
        header: "Adempimento",
        kind: "identity",
        locked: true,
        width: 2,
        cell: (row) => (
          <div className="min-w-0">
            <span className="egw-ellipsis block font-brand text-[12.5px] font-semibold text-egw-ink">{row.title}</span>
            <span className="egw-ellipsis block font-brand text-[10px] text-egw-ink-62">{joinMeta(row.description, dueLabel(row.due_date))}</span>
          </div>
        ),
        sortValue: (row) => row.title.toLowerCase(),
        exportValue: (row) => row.title,
        title: (row) => joinMeta(row.title, row.description),
      },
      { id: "kind", header: "Tipo", kind: "classification", cell: (row) => <DataChip size="sm">{obligationKindLabel(row.kind)}</DataChip>, sortValue: (row) => obligationKindLabel(row.kind) },
      { id: "due", header: "Scadenza", kind: "date", cell: (row) => formatDateShort(row.due_date), sortValue: (row) => row.due_date, exportValue: (row) => row.due_date },
      {
        id: "status",
        header: "Stato",
        kind: "status",
        cell: (row) => <StatusPill status={specOf(OBLIGATION_STATUS_SPEC, row.status)} detail={row.paymentReversed ? "versamento stornato" : undefined} />,
        sortValue: (row) => OBLIGATION_STATUSES.indexOf(row.status as any),
        exportValue: (row) => OBLIGATION_STATUS_LABELS[row.status as keyof typeof OBLIGATION_STATUS_LABELS] || row.status,
      },
      { id: "amount", header: "Importo", kind: "amount", cell: (row) => (row.amount ? formatMoney(row.amount) : null), sortValue: (row) => row.amount ?? null },
      { id: "period", header: "Periodo", kind: "text", hidden: true, cell: (row) => row.period, sortValue: (row) => row.period || null },
      { id: "description", header: "Descrizione", kind: "text", hidden: true, cell: (row) => row.description, sortValue: (row) => row.description || null },
    ],
    [],
  );

  const obligationFilters = React.useMemo<FilterDef<ObligationRow>[]>(
    () => [
      {
        id: "kind",
        label: "Tipo",
        type: "multi",
        pinned: true,
        options: OBLIGATION_KINDS.map((kind) => ({ value: kind, label: OBLIGATION_KIND_LABELS[kind], count: obligations.filter((row) => row.kind === kind).length })),
        apply: (row, value) => (Array.isArray(value) && value.length ? value.includes(row.kind) : typeof value === "string" && value ? row.kind === value : true),
      },
      {
        id: "status",
        label: "Stato",
        type: "select",
        options: OBLIGATION_STATUSES.map((status) => ({ value: status, label: OBLIGATION_STATUS_LABELS[status], count: obligations.filter((row) => row.status === status).length })),
        apply: (row, value) => (typeof value === "string" && value ? row.status === value : true),
      },
    ],
    [obligations],
  );

  const agendaActions = React.useMemo<RowActionDef<ObligationRow>[]>(
    () => [{ id: "complete", label: "Assolto", icon: <CheckCircle2 />, primary: true, hidden: () => !canManage, onClick: (row) => void complete(row) }],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [canManage, busy],
  );

  const f24Columns = React.useMemo<ColumnDef<F24Row>[]>(
    () => [
      { id: "period", header: "Periodo", kind: "identity", locked: true, cell: (row) => <span className="egw-num font-semibold text-egw-ink">{row.period}</span>, sortValue: (row) => row.period, exportValue: (row) => row.period },
      { id: "causale", header: "Causale", kind: "classification", cell: (row) => <span className="egw-num">{row.causale}</span>, sortValue: (row) => row.causale },
      { id: "employee", header: "Lavoratore", kind: "amount", cell: (row) => formatMoney(row.employeeContribution), sortValue: (row) => row.employeeContribution },
      { id: "employer", header: "Club", kind: "amount", cell: (row) => formatMoney(row.employerContribution), sortValue: (row) => row.employerContribution },
      { id: "total", header: "Totale", kind: "amount", cell: (row) => <span className="font-extrabold">{formatMoney(row.total)}</span>, sortValue: (row) => row.total, exportValue: (row) => row.total },
      { id: "dueDate", header: "Versamento entro", kind: "date", cell: (row) => formatDateShort(row.dueDate), sortValue: (row) => row.dueDate, exportValue: (row) => row.dueDate },
    ],
    [],
  );

  const cuColumns = React.useMemo<ColumnDef<CuRow>[]>(
    () => [
      {
        id: "person",
        header: "Persona",
        kind: "identity",
        locked: true,
        width: 2,
        cell: (row) => (
          <div className="min-w-0">
            <span className="egw-ellipsis block font-brand text-[12.5px] font-semibold text-egw-ink">{row.personName}</span>
            <span className="egw-ellipsis egw-num block font-brand text-[10px] uppercase text-egw-ink-62">{row.fiscalCode || "—"}</span>
          </div>
        ),
        sortValue: (row) => row.personName.toLowerCase(),
        exportValue: (row) => row.personName,
      },
      { id: "fiscalCode", header: "Codice fiscale", kind: "text", hidden: true, cell: (row) => <span className="egw-num uppercase">{row.fiscalCode}</span>, sortValue: (row) => row.fiscalCode || null },
      { id: "gross", header: "Lordo", kind: "amount", cell: (row) => formatMoney(row.grossPaid), sortValue: (row) => row.grossPaid },
      { id: "external", header: "Esterni", kind: "amount", cell: (row) => formatMoney(row.externalDeclared), sortValue: (row) => row.externalDeclared },
      { id: "progressive", header: "Progressivo", kind: "amount", cell: (row) => formatMoney(row.progressive), sortValue: (row) => row.progressive },
      { id: "taxable", header: "Imponibile fiscale", kind: "amount", cell: (row) => formatMoney(row.taxableFiscal), sortValue: (row) => row.taxableFiscal },
      { id: "note", header: "Nota", kind: "text", cell: (row) => (row.attentionReason ? <span className="text-egw-amber-ink">{row.attentionReason}</span> : null), sortValue: (row) => row.attentionReason || null, exportValue: (row) => row.attentionReason || "" },
    ],
    [],
  );

  const gridState = loading ? "loading" : loadError ? "error" : "ready";
  const datasetState = !canFiscal ? "restricted" : gridState;

  const yearControl = (
    <Select
      aria-label="Anno fiscale"
      value={String(year)}
      onValueChange={(value) => setYear(Number(value))}
      options={CONFIGURED_RULE_YEARS.map((configured) => ({ value: String(configured), label: `Anno ${configured}` }))}
      className="h-[34px] w-[128px]"
    />
  );

  return (
    <SportWorkShell
      title="Adempimenti"
      description="Comunicazioni, contributi, Certificazione Unica. EasyGame prepara i dati e ricorda la scadenza: trasmettere resta di una persona."
      context={tab === "f24" || tab === "cu" ? yearControl : null}
      actions={
        tab === "agenda" && canManage ? (
          <Button variant="secondary" icon={<RefreshCw />} onClick={() => void sync()} loading={busy}>
            Riallinea agenda
          </Button>
        ) : null
      }
      banner={
        <div className="flex flex-col gap-3">
          <SegmentedControl<Tab> aria-label="Sezioni degli adempimenti" value={tab} onChange={selectTab} options={TABS} className="max-w-full overflow-x-auto" />
          <AlertBlock severity="info" title="EasyGame prepara i dati dell'adempimento e ricorda la scadenza. Non trasmette niente.">
            Non al RASD, non a UNILAV, non all&apos;INPS, non all&apos;Agenzia delle Entrate. «Assolto» significa che una persona lo ha fatto e lo ha dichiarato qui.
          </AlertBlock>
        </div>
      }
    >
      {tab === "agenda" ? (
        <DataGrid<ObligationRow>
          module="sport-work-obligations"
          aria-label="Adempimenti dovuti"
          rows={aperti}
          getRowId={(row) => row.id}
          rowLabel={(row) => row.title}
          columns={obligationColumns}
          filters={obligationFilters}
          views={AGENDA_VIEWS}
          requestedViewId={requestedViewId}
          search={{ placeholder: "Cerca un adempimento", match: (row, query) => `${row.title} ${row.description || ""} ${obligationKindLabel(row.kind)}`.toLowerCase().includes(query.trim().toLowerCase()) }}
          defaultSort={{ columnId: "due", direction: "asc" }}
          rowActions={agendaActions}
          state={gridState}
          errorMessage={loadError}
          onRetry={() => void load()}
          noun={{ singular: "adempimento", plural: "adempimenti" }}
          canSelect={false}
          export={{ onExport: (request) => exportGridCsv(request, "adempimenti-dovuti.csv"), kinds: ["csv"] }}
          empty={{
            icon: <ClipboardList />,
           
            title: "Nessun adempimento dovuto",
            description: "Quando un contributo, una comunicazione o una scadenza diventa dovuta, compare qui. «Riallinea agenda» la ricalcola dai rapporti e dalle erogazioni.",
            primary: canManage ? (
              <Button variant="secondary" size="sm" icon={<RefreshCw />} onClick={() => void sync()} loading={busy}>
                Riallinea agenda
              </Button>
            ) : null,
          }}
        />
      ) : null}

      {tab === "f24" ? (
        <div className="flex flex-col gap-3">
          <InfoCard eyebrow="Dati per l'F24">Importi e causali calcolati sulle erogazioni registrate. EasyGame non compila e non invia l&apos;F24.</InfoCard>
          <DataGrid<F24Row>
            module="sport-work-f24"
            aria-label="Dati per l'F24"
            rows={f24}
            getRowId={(row) => `${row.period}-${row.causale}`}
            rowLabel={(row) => `${row.period} ${row.causale}`}
            columns={f24Columns}
            defaultSort={{ columnId: "period", direction: "asc" }}
            state={datasetState}
            errorMessage={loadError}
            onRetry={() => void load()}
            noun={{ singular: "riga", plural: "righe" }}
            canSelect={false}
            hideViews
            export={{ onExport: (request) => exportGridCsv(request, `f24-${year}.csv`), kinds: ["csv"] }}
            empty={{ icon: <ClipboardList />, title: `Nessun contributo maturato nel ${year}`, description: "Le righe nascono dalle erogazioni registrate nell'anno." }}
          />
        </div>
      ) : null}

      {tab === "cu" ? (
        <div className="flex flex-col gap-3">
          <InfoCard eyebrow="Dati per la Certificazione Unica">Dataset di appoggio. EasyGame non predispone e non trasmette la CU.</InfoCard>
          <DataGrid<CuRow>
            module="sport-work-cu"
            aria-label="Dati per la Certificazione Unica"
            rows={cu}
            getRowId={(row) => row.personId}
            rowLabel={(row) => row.personName}
            columns={cuColumns}
            defaultSort={{ columnId: "person", direction: "asc" }}
            search={{ placeholder: "Cerca per persona o codice fiscale", match: (row, query) => `${row.personName} ${row.fiscalCode || ""}`.toLowerCase().includes(query.trim().toLowerCase()) }}
            state={datasetState}
            errorMessage={loadError}
            onRetry={() => void load()}
            noun={{ singular: "persona", plural: "persone" }}
            canSelect={false}
            hideViews
            export={{ onExport: (request) => exportGridCsv(request, `cu-${year}.csv`), kinds: ["csv"] }}
            empty={{ icon: <ClipboardList />, title: `Nessun compenso erogato nel ${year}`, description: "Le righe nascono dalle erogazioni e dalle autocertificazioni dell'anno." }}
          />
        </div>
      ) : null}

      {tab === "storico" ? (
        <div className="flex flex-col gap-3">
          <InfoCard eyebrow="Assolti e non più dovuti">Un adempimento non si cancella: è stato dovuto, e la sua storia serve a spiegare perché.</InfoCard>
          <DataGrid<ObligationRow>
            module="sport-work-obligations-history"
            aria-label="Adempimenti assolti e non più dovuti"
            rows={chiusi}
            getRowId={(row) => row.id}
            rowLabel={(row) => row.title}
            columns={obligationColumns}
            filters={obligationFilters}
            search={{ placeholder: "Cerca un adempimento", match: (row, query) => `${row.title} ${row.description || ""} ${obligationKindLabel(row.kind)}`.toLowerCase().includes(query.trim().toLowerCase()) }}
            defaultSort={{ columnId: "due", direction: "desc" }}
            state={gridState}
            errorMessage={loadError}
            onRetry={() => void load()}
            noun={{ singular: "adempimento", plural: "adempimenti" }}
            canSelect={false}
            export={{ onExport: (request) => exportGridCsv(request, "adempimenti-storico.csv"), kinds: ["csv"] }}
            empty={{ icon: <ClipboardList />, title: "Nessun adempimento in questa vista", description: "Gli adempimenti assolti o non più dovuti restano qui." }}
          />
        </div>
      ) : null}

      {confirmDialog}
    </SportWorkShell>
  );
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <ObligationsPage />
    </Suspense>
  );
}
