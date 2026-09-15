"use client";

import * as React from "react";
import { Suspense } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Award, ChevronRight, FileText, Plus, ReceiptText, Send, ThumbsUp, Wallet } from "lucide-react";
import { useToast } from "@/components/ui/toast-notification";
import { apiRequest } from "@/lib/api/client";
import { Button } from "@/components/web/primitives/Button";
import { SegmentedControl } from "@/components/web/primitives/Controls";
import { DataChip, StatusPill } from "@/components/web/primitives/StatusPill";
import { useConfirm } from "@/components/web/overlays/useConfirm";
import { DataGrid } from "@/components/web/datagrid/DataGrid";
import type { ColumnDef, ExportRequest, FilterDef, RowActionDef, ViewDef } from "@/components/web/datagrid/types";
import { formatDateShort, formatMoney, joinMeta } from "@/lib/web/format";
import { csvFileName, downloadCsv, toCsv } from "@/lib/csv";
import { EXPENSE_CATEGORIES, EXPENSE_CATEGORY_LABELS, REIMBURSEMENT_STATUSES, REIMBURSEMENT_STATUS_LABELS } from "@/lib/sport-work/model";
import { SportWorkShell } from "@/components/sport-work/v2/sport-work-shell";
import { useSportWorkRole } from "@/components/sport-work/v2/use-sport-work-role";
import { InstallmentsGrid, type InstallmentGridRow } from "@/components/sport-work/v2/installments-grid";
import { PayoutsGrid, type PayoutGridRow } from "@/components/sport-work/v2/payouts-grid";
import { PayoutDrawer } from "@/components/sport-work/v2/payout-drawer";
import { BonusDrawer } from "@/components/sport-work/v2/bonus-drawer";
import { ExpenseDrawer } from "@/components/sport-work/v2/expense-drawer";
import { InvoiceDrawer } from "@/components/sport-work/v2/invoice-drawer";
import { BONUS_STATUS_SPEC, REIMBURSEMENT_STATUS_SPEC, VAT_INVOICE_STATUS_SPEC, specOf } from "@/components/sport-work/v2/sport-work-status";
import {
  bonusTreatmentLabel,
  expenseCategoryLabel,
  personNameMap,
  relationshipHref,
  type InstallmentRow,
  type PayoutRow,
  type RelationshipRow,
  type SportWorkPerson,
} from "@/components/sport-work/v2/sport-work-model";

/**
 * `/sport-work/compensations` — cinque elenchi che il dominio tiene apposta
 * separati (Web V2, pattern 1 con aree: ogni area e una griglia).
 *
 * Scadenze, registro, premi, rimborsi e fatture dei professionisti non sono
 * cinque filtri della stessa tabella: sono cinque cose con regimi diversi.
 * Un premio ha un trattamento fiscale proprio; un rimborso non e reddito;
 * una fattura la calcola chi la emette. Metterle nella stessa lista sarebbe
 * il primo passo per sommarle, e sommarle rende falso il progressivo.
 *
 * Le letture e le scritture sono quelle della V1 (sette `GET` in parallelo,
 * i `POST`/`PATCH` per riga). La V1 non aveva un parametro di area: `?tab=`
 * lo aggiunge, cosi la fattura da pagare si manda per email a un collega.
 */
type Tab = "scadenze" | "registro" | "premi" | "rimborsi" | "fatture";

const TABS: Array<{ value: Tab; label: string }> = [
  { value: "scadenze", label: "Scadenze compenso" },
  { value: "registro", label: "Registro uscite" },
  { value: "premi", label: "Premi" },
  { value: "rimborsi", label: "Rimborsi" },
  { value: "fatture", label: "Fatture P.IVA" },
];

const resolveTab = (value: string | null): Tab => (TABS.some((tab) => tab.value === value) ? (value as Tab) : "scadenze");

type BonusRow = { id: string; person_id: string; reason: string; competition?: string | null; amount: number; award_date: string; fiscal_treatment: string; status: string; personName: string };
type ReimbursementRow = { id: string; person_id: string; category: string; description: string; expense_date: string; amount: number; status: string; personName: string };
type InvoiceRow = { id: string; person_id: string; document_number: string; document_date: string; due_date: string | null; total_amount: number; taxable_amount?: number; vat_amount?: number; withholding_amount?: number; status: string; personName: string };

const exportCsv = <Row,>(request: ExportRequest<Row>, name: string) => {
  const columns = request.columns.map((column) => ({ key: column.id, label: column.label || (typeof column.header === "string" ? column.header : column.id) }));
  const rows = request.rows.map((row) => Object.fromEntries(request.columns.map((column) => [column.id, column.exportValue?.(row) ?? column.sortValue?.(row) ?? ""])));
  downloadCsv(csvFileName(name), toCsv(columns, rows));
};

const REIMBURSEMENT_VIEWS: ViewDef[] = [
  { id: "to-approve", label: "Da approvare", filters: { status: "SUBMITTED" }, builtIn: true, tone: "amber" },
  { id: "to-pay", label: "Da liquidare", filters: { status: "APPROVED" }, builtIn: true },
  { id: "paid", label: "Liquidati", filters: { status: "PAID" }, builtIn: true },
];

function CompensationsPage() {
  const router = useRouter();
  const pathname = usePathname() || "/sport-work/compensations";
  const searchParams = useSearchParams();
  const { showToast } = useToast();
  const { canManage, canPay } = useSportWorkRole();
  const [confirm, confirmDialog] = useConfirm();
  const clubId = searchParams?.get("clubId") || null;
  const tab = resolveTab(searchParams?.get("tab") || null);

  const [installments, setInstallments] = React.useState<InstallmentRow[]>([]);
  const [payouts, setPayouts] = React.useState<PayoutRow[]>([]);
  const [bonuses, setBonuses] = React.useState<any[]>([]);
  const [reimbursements, setReimbursements] = React.useState<any[]>([]);
  const [invoices, setInvoices] = React.useState<any[]>([]);
  const [people, setPeople] = React.useState<SportWorkPerson[]>([]);
  const [relationships, setRelationships] = React.useState<RelationshipRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [payoutTarget, setPayoutTarget] = React.useState<string | null>(null);
  const [bonusOpen, setBonusOpen] = React.useState(false);
  const [expenseOpen, setExpenseOpen] = React.useState(false);
  const [invoiceOpen, setInvoiceOpen] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    const [installmentsResult, payoutsResult, bonusesResult, reimbursementsResult, invoicesResult, peopleResult, relationshipsResult] = await Promise.all([
      apiRequest<InstallmentRow[]>("/api/v1/sport-work/installments"),
      apiRequest<PayoutRow[]>("/api/v1/sport-work/payouts"),
      apiRequest<any[]>("/api/v1/sport-work/bonuses"),
      apiRequest<any[]>("/api/v1/sport-work/reimbursements"),
      apiRequest<any[]>("/api/v1/sport-work/vat-invoices"),
      apiRequest<SportWorkPerson[]>("/api/v1/sport-work/people"),
      apiRequest<RelationshipRow[]>("/api/v1/sport-work/relationships"),
    ]);
    setLoading(false);
    if (installmentsResult.error) {
      const message = installmentsResult.error.message || "Errore nella lettura dei compensi";
      setLoadError(message);
      showToast("error", message);
      return;
    }
    const asArray = <T,>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);
    setLoadError(null);
    setInstallments(asArray<InstallmentRow>(installmentsResult.data));
    setPayouts(asArray<PayoutRow>(payoutsResult.data));
    setBonuses(asArray(bonusesResult.data));
    setReimbursements(asArray(reimbursementsResult.data));
    setInvoices(asArray(invoicesResult.data));
    setPeople(asArray<SportWorkPerson>(peopleResult.data));
    setRelationships(asArray<RelationshipRow>(relationshipsResult.data));
  }, [showToast]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const selectTab = (next: Tab) => {
    const query = new URLSearchParams(searchParams?.toString() || "");
    query.set("tab", next);
    router.replace(`${pathname}?${query.toString()}`, { scroll: false });
  };

  const names = React.useMemo(() => personNameMap(people), [people]);
  const personOfRelationship = React.useMemo(() => new Map(relationships.map((row) => [String(row.id), String(row.person_id)])), [relationships]);
  const nameOf = React.useCallback((personId: string) => names.get(String(personId)) || "", [names]);
  const vatRelationships = React.useMemo(() => relationships.filter((row) => row.relationship_type === "SELF_EMPLOYED_VAT"), [relationships]);

  const installmentRows = React.useMemo<InstallmentGridRow[]>(
    () => installments.map((row) => ({ ...row, personName: nameOf(personOfRelationship.get(String(row.relationship_id)) || "") || row.label })),
    [installments, personOfRelationship, nameOf],
  );
  const payoutRows = React.useMemo<PayoutGridRow[]>(() => payouts.map((row) => ({ ...row, personName: nameOf(row.person_id) || "Persona" })), [payouts, nameOf]);
  const bonusRows = React.useMemo<BonusRow[]>(() => bonuses.map((row) => ({ ...row, personName: nameOf(row.person_id) || "Persona" })), [bonuses, nameOf]);
  const reimbursementRows = React.useMemo<ReimbursementRow[]>(() => reimbursements.map((row) => ({ ...row, personName: nameOf(row.person_id) || "Persona" })), [reimbursements, nameOf]);
  const invoiceRows = React.useMemo<InvoiceRow[]>(() => invoices.map((row) => ({ ...row, personName: nameOf(row.person_id) || "Persona" })), [invoices, nameOf]);

  /* ── Scritture per riga (le stesse della V1) ──────────────────────────── */
  const post = async (path: string, body: unknown, success: string, method: "POST" | "PATCH" = "POST") => {
    if (busy) return false;
    setBusy(true);
    const { error } = await apiRequest(path, { method, body });
    setBusy(false);
    if (error) {
      showToast("error", error.message || "Operazione non riuscita");
      return false;
    }
    showToast("success", success);
    await load();
    return true;
  };

  const payBonus = async (row: BonusRow) => {
    const ok = await confirm({
      title: `Erogare il premio a ${row.personName}?`,
      description: `${formatMoney(row.amount)} · ${row.reason}. L'uscita finisce nel registro con la data di oggi.`,
      confirmLabel: "Eroga",
    });
    if (!ok) return;
    await post(`/api/v1/sport-work/bonuses/${encodeURIComponent(row.id)}/pay`, {}, "Premio erogato");
  };

  const payReimbursement = async (row: ReimbursementRow) => {
    const ok = await confirm({
      title: `Liquidare il rimborso a ${row.personName}?`,
      description: `${formatMoney(row.amount)} · ${row.description}. L'uscita finisce nel registro e non concorre a nessuna soglia.`,
      confirmLabel: "Liquida",
    });
    if (!ok) return;
    await post(`/api/v1/sport-work/reimbursements/${encodeURIComponent(row.id)}/pay`, {}, "Rimborso liquidato");
  };

  const payInvoice = async (row: InvoiceRow) => {
    const ok = await confirm({
      title: `Pagare la fattura ${row.document_number}?`,
      description: `${formatMoney(row.total_amount)} a ${row.personName}. L'uscita finisce nel registro.`,
      confirmLabel: "Paga",
    });
    if (!ok) return;
    await post(`/api/v1/sport-work/vat-invoices/${encodeURIComponent(row.id)}/pay`, {}, "Fattura pagata");
  };

  const openRelationship = (id: string) => router.push(relationshipHref(id, clubId));

  /* ── Colonne ──────────────────────────────────────────────────────────── */
  const bonusColumns = React.useMemo<ColumnDef<BonusRow>[]>(
    () => [
      {
        id: "person",
        header: "Persona e causale",
        kind: "identity",
        locked: true,
        width: 2,
        cell: (row) => (
          <div className="min-w-0">
            <span className="egw-ellipsis block font-brand text-[12.5px] font-semibold text-egw-ink">{row.personName}</span>
            <span className="egw-ellipsis block font-brand text-[10px] text-egw-ink-62">{joinMeta(row.reason, row.competition)}</span>
          </div>
        ),
        sortValue: (row) => `${row.personName} ${row.reason}`.toLowerCase(),
        exportValue: (row) => `${row.personName} · ${row.reason}`,
        title: (row) => joinMeta(row.personName, row.reason, row.competition),
      },
      { id: "awardDate", header: "Assegnato il", kind: "date", cell: (row) => formatDateShort(row.award_date), sortValue: (row) => row.award_date },
      { id: "status", header: "Stato", kind: "status", cell: (row) => <StatusPill status={specOf(BONUS_STATUS_SPEC, row.status)} />, sortValue: (row) => row.status },
      { id: "treatment", header: "Trattamento fiscale", kind: "classification", cell: (row) => bonusTreatmentLabel(row.fiscal_treatment), sortValue: (row) => bonusTreatmentLabel(row.fiscal_treatment) },
      { id: "amount", header: "Importo", kind: "amount", cell: (row) => formatMoney(row.amount), sortValue: (row) => Number(row.amount) || 0 },
    ],
    [],
  );

  const reimbursementColumns = React.useMemo<ColumnDef<ReimbursementRow>[]>(
    () => [
      {
        id: "person",
        header: "Persona e causale",
        kind: "identity",
        locked: true,
        width: 2,
        cell: (row) => (
          <div className="min-w-0">
            <span className="egw-ellipsis block font-brand text-[12.5px] font-semibold text-egw-ink">{row.personName}</span>
            <span className="egw-ellipsis block font-brand text-[10px] text-egw-ink-62">{row.description}</span>
          </div>
        ),
        sortValue: (row) => `${row.personName} ${row.description}`.toLowerCase(),
        exportValue: (row) => `${row.personName} · ${row.description}`,
        title: (row) => joinMeta(row.personName, row.description),
      },
      { id: "category", header: "Categoria", kind: "classification", cell: (row) => <DataChip size="sm">{expenseCategoryLabel(row.category)}</DataChip>, sortValue: (row) => expenseCategoryLabel(row.category) },
      { id: "expenseDate", header: "Data della spesa", kind: "date", cell: (row) => formatDateShort(row.expense_date), sortValue: (row) => row.expense_date },
      {
        id: "status",
        header: "Stato",
        kind: "status",
        cell: (row) => <StatusPill status={specOf(REIMBURSEMENT_STATUS_SPEC, row.status)} />,
        sortValue: (row) => REIMBURSEMENT_STATUSES.indexOf(row.status as any),
        exportValue: (row) => REIMBURSEMENT_STATUS_LABELS[row.status as keyof typeof REIMBURSEMENT_STATUS_LABELS] || row.status,
      },
      { id: "amount", header: "Importo", kind: "amount", cell: (row) => formatMoney(row.amount), sortValue: (row) => Number(row.amount) || 0 },
    ],
    [],
  );

  const invoiceColumns = React.useMemo<ColumnDef<InvoiceRow>[]>(
    () => [
      {
        id: "person",
        header: "Persona e documento",
        kind: "identity",
        locked: true,
        width: 2,
        cell: (row) => (
          <div className="min-w-0">
            <span className="egw-ellipsis block font-brand text-[12.5px] font-semibold text-egw-ink">{row.personName}</span>
            <span className="egw-ellipsis egw-num block font-brand text-[10px] text-egw-ink-62">{row.document_number}</span>
          </div>
        ),
        sortValue: (row) => `${row.personName} ${row.document_number}`.toLowerCase(),
        exportValue: (row) => `${row.personName} · ${row.document_number}`,
        title: (row) => joinMeta(row.personName, row.document_number),
      },
      { id: "documentDate", header: "Data documento", kind: "date", cell: (row) => formatDateShort(row.document_date), sortValue: (row) => row.document_date },
      { id: "dueDate", header: "Scadenza", kind: "date", cell: (row) => (row.due_date ? formatDateShort(row.due_date) : null), sortValue: (row) => row.due_date || null },
      { id: "status", header: "Stato", kind: "status", cell: (row) => <StatusPill status={specOf(VAT_INVOICE_STATUS_SPEC, row.status)} />, sortValue: (row) => row.status },
      { id: "taxable", header: "Imponibile", kind: "amount", hidden: true, cell: (row) => formatMoney(row.taxable_amount ?? 0), sortValue: (row) => Number(row.taxable_amount) || 0 },
      { id: "vat", header: "IVA", kind: "amount", hidden: true, cell: (row) => formatMoney(row.vat_amount ?? 0), sortValue: (row) => Number(row.vat_amount) || 0 },
      { id: "withholding", header: "Ritenuta", kind: "amount", hidden: true, cell: (row) => formatMoney(row.withholding_amount ?? 0), sortValue: (row) => Number(row.withholding_amount) || 0 },
      { id: "total", header: "Totale documento", kind: "amount", cell: (row) => formatMoney(row.total_amount), sortValue: (row) => Number(row.total_amount) || 0 },
    ],
    [],
  );

  const bonusActions = React.useMemo<RowActionDef<BonusRow>[]>(
    () => [
      { id: "pay", label: "Eroga", icon: <Wallet />, primary: true, hidden: (row) => !canPay || row.status === "PAID", onClick: (row) => void payBonus(row) },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [canPay],
  );

  const reimbursementActions = React.useMemo<RowActionDef<ReimbursementRow>[]>(
    () => [
      {
        id: "submit",
        label: "Presenta",
        icon: <Send />,
        primary: true,
        hidden: (row) => !canManage || row.status !== "DRAFT",
        onClick: (row) => void post(`/api/v1/sport-work/reimbursements/${encodeURIComponent(row.id)}`, { status: "SUBMITTED" }, "Rimborso presentato", "PATCH"),
      },
      {
        id: "approve",
        label: "Approva",
        icon: <ThumbsUp />,
        primary: true,
        hidden: (row) => !canManage || row.status !== "SUBMITTED",
        onClick: (row) => void post(`/api/v1/sport-work/reimbursements/${encodeURIComponent(row.id)}`, { status: "APPROVED" }, "Rimborso approvato", "PATCH"),
      },
      { id: "pay", label: "Liquida", icon: <Wallet />, primary: true, hidden: (row) => !canPay || row.status !== "APPROVED", onClick: (row) => void payReimbursement(row) },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [canManage, canPay],
  );

  const invoiceActions = React.useMemo<RowActionDef<InvoiceRow>[]>(
    () => [
      { id: "pay", label: "Paga", icon: <Wallet />, primary: true, hidden: (row) => !canPay || row.status === "PAID", onClick: (row) => void payInvoice(row) },
      { id: "open", label: "Apri il rapporto", icon: <ChevronRight />, onClick: (row) => openRelationship(String((row as any).relationship_id || "")) },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [canPay, clubId],
  );

  const reimbursementFilters = React.useMemo<FilterDef<ReimbursementRow>[]>(
    () => [
      {
        id: "status",
        label: "Stato",
        type: "select",
        pinned: true,
        options: REIMBURSEMENT_STATUSES.map((status) => ({ value: status, label: REIMBURSEMENT_STATUS_LABELS[status], count: reimbursementRows.filter((row) => row.status === status).length })),
        apply: (row, value) => (typeof value === "string" && value ? row.status === value : true),
      },
      {
        id: "category",
        label: "Categoria",
        type: "select",
        options: EXPENSE_CATEGORIES.map((category) => ({ value: category, label: EXPENSE_CATEGORY_LABELS[category] })),
        apply: (row, value) => (typeof value === "string" && value ? row.category === value : true),
      },
    ],
    [reimbursementRows],
  );

  const gridState = loading ? "loading" : loadError ? "error" : "ready";

  const primaryAction =
    tab === "premi" && canManage ? (
      <Button variant="primary" icon={<Plus />} onClick={() => setBonusOpen(true)}>
        Nuovo premio
      </Button>
    ) : tab === "rimborsi" && canManage ? (
      <Button variant="primary" icon={<Plus />} onClick={() => setExpenseOpen(true)}>
        Nuovo rimborso
      </Button>
    ) : tab === "fatture" && canManage && vatRelationships.length > 0 ? (
      <Button variant="primary" icon={<Plus />} onClick={() => setInvoiceOpen(true)}>
        Nuova fattura
      </Button>
    ) : null;

  const descriptions: Record<Tab, string> = {
    scadenze: "Programmato, maturato ed erogato sono tre numeri diversi: la riga li mostra tutti e tre.",
    registro: "La fonte canonica del denaro uscito. Movimenti lo aggrega, non lo duplica.",
    premi: "Somme per un risultato, non per la prestazione. Il trattamento fiscale lo dichiara il contratto, non l'etichetta.",
    rimborsi: "Non sono compensi: non concorrono a nessuna soglia e non entrano nel progressivo.",
    fatture: "Gli importi si trascrivono dal documento: il calcolo lo ha fatto chi l'ha emesso.",
  };

  return (
    <SportWorkShell
      title="Compensi"
      description="Scadenze, registro delle uscite, premi, rimborsi e fatture dei professionisti. Cinque cose distinte, perché hanno regimi distinti."
      actions={primaryAction}
      banner={
        <div className="flex flex-col gap-2">
          <SegmentedControl<Tab> aria-label="Sezioni dei compensi" value={tab} onChange={selectTab} options={TABS} className="max-w-full overflow-x-auto" />
          <p className="font-brand text-[12.5px] text-egw-ink-62">{descriptions[tab]}</p>
        </div>
      }
    >
      {tab === "scadenze" ? (
        <InstallmentsGrid
          module="sport-work-installments"
          rows={installmentRows}
          state={gridState}
          errorMessage={loadError}
          onRetry={() => void load()}
          canPay={canPay}
          onPay={(id) => setPayoutTarget(id)}
          onOpenRelationship={openRelationship}
          withPerson
          emptyTitle="Nessuna scadenza"
          emptyDescription="Nascono dal piano compensi di un rapporto."
        />
      ) : null}

      {tab === "registro" ? (
        <PayoutsGrid module="sport-work-payouts" rows={payoutRows} state={gridState} errorMessage={loadError} onRetry={() => void load()} canPay={canPay} onOpenRelationship={openRelationship} withPerson />
      ) : null}

      {tab === "premi" ? (
        <DataGrid<BonusRow>
          module="sport-work-bonuses"
          aria-label="Premi"
          rows={bonusRows}
          getRowId={(row) => String(row.id)}
          rowLabel={(row) => `${row.personName} · ${row.reason}`}
          columns={bonusColumns}
          views={[
            { id: "to-pay", label: "Da erogare", filters: { status: "SCHEDULED" }, builtIn: true, tone: "amber" },
            { id: "paid", label: "Erogati", filters: { status: "PAID" }, builtIn: true },
          ]}
          filters={[
            {
              id: "status",
              label: "Stato",
              type: "select",
              pinned: true,
              options: [
                { value: "SCHEDULED", label: "Da erogare", count: bonusRows.filter((row) => row.status !== "PAID").length },
                { value: "PAID", label: "Erogati", count: bonusRows.filter((row) => row.status === "PAID").length },
              ],
              apply: (row, value) => (typeof value === "string" && value ? (value === "PAID" ? row.status === "PAID" : row.status !== "PAID") : true),
            },
          ]}
          search={{ placeholder: "Cerca per persona o causale", match: (row, query) => `${row.personName} ${row.reason} ${row.competition || ""}`.toLowerCase().includes(query.trim().toLowerCase()) }}
          defaultSort={{ columnId: "awardDate", direction: "desc" }}
          rowActions={bonusActions}
          state={gridState}
          errorMessage={loadError}
          onRetry={() => void load()}
          noun={{ singular: "premio", plural: "premi" }}
          canSelect={false}
          export={{ onExport: (request) => exportCsv(request, "Premi"), kinds: ["csv"] }}
          empty={{
            icon: <Award />,
           
            title: "Nessun premio registrato",
            description: "Un premio è una somma per un risultato: si registra con il suo trattamento fiscale dichiarato.",
            primary: canManage ? (
              <Button variant="primary" size="sm" icon={<Plus />} onClick={() => setBonusOpen(true)}>
                Nuovo premio
              </Button>
            ) : null,
          }}
        />
      ) : null}

      {tab === "rimborsi" ? (
        <DataGrid<ReimbursementRow>
          module="sport-work-reimbursements"
          aria-label="Rimborsi spese"
          rows={reimbursementRows}
          getRowId={(row) => String(row.id)}
          rowLabel={(row) => `${row.personName} · ${row.description}`}
          columns={reimbursementColumns}
          views={REIMBURSEMENT_VIEWS}
          filters={reimbursementFilters}
          search={{ placeholder: "Cerca per persona o causale", match: (row, query) => `${row.personName} ${row.description}`.toLowerCase().includes(query.trim().toLowerCase()) }}
          defaultSort={{ columnId: "expenseDate", direction: "desc" }}
          rowActions={reimbursementActions}
          state={gridState}
          errorMessage={loadError}
          onRetry={() => void load()}
          noun={{ singular: "rimborso", plural: "rimborsi" }}
          canSelect={false}
          export={{ onExport: (request) => exportCsv(request, "Rimborsi spese"), kinds: ["csv"] }}
          empty={{
            icon: <ReceiptText />,
           
            title: "Nessun rimborso registrato",
            description: "Un rimborso nasce in bozza, si presenta, si approva e poi si liquida.",
            primary: canManage ? (
              <Button variant="primary" size="sm" icon={<Plus />} onClick={() => setExpenseOpen(true)}>
                Nuovo rimborso
              </Button>
            ) : null,
          }}
        />
      ) : null}

      {tab === "fatture" ? (
        <DataGrid<InvoiceRow>
          module="sport-work-vat-invoices"
          aria-label="Fatture dei professionisti"
          rows={invoiceRows}
          getRowId={(row) => String(row.id)}
          rowLabel={(row) => `${row.personName} · ${row.document_number}`}
          columns={invoiceColumns}
          views={[
            { id: "to-pay", label: "Da pagare", filters: { status: "PENDING" }, builtIn: true, tone: "amber" },
            { id: "paid", label: "Pagate", filters: { status: "PAID" }, builtIn: true },
          ]}
          filters={[
            {
              id: "status",
              label: "Stato",
              type: "select",
              pinned: true,
              options: [
                { value: "PENDING", label: "Da pagare", count: invoiceRows.filter((row) => row.status !== "PAID").length },
                { value: "PAID", label: "Pagate", count: invoiceRows.filter((row) => row.status === "PAID").length },
              ],
              apply: (row, value) => (typeof value === "string" && value ? (value === "PAID" ? row.status === "PAID" : row.status !== "PAID") : true),
            },
          ]}
          search={{ placeholder: "Cerca per persona o numero", match: (row, query) => `${row.personName} ${row.document_number}`.toLowerCase().includes(query.trim().toLowerCase()) }}
          defaultSort={{ columnId: "documentDate", direction: "desc" }}
          rowActions={invoiceActions}
          state={gridState}
          errorMessage={loadError}
          onRetry={() => void load()}
          noun={{ singular: "fattura", plural: "fatture" }}
          canSelect={false}
          export={{ onExport: (request) => exportCsv(request, "Fatture dei professionisti"), kinds: ["csv"] }}
          empty={{
            icon: <FileText />,
           
            title: vatRelationships.length === 0 ? "Nessun rapporto con partita IVA" : "Nessuna fattura registrata",
            description: vatRelationships.length === 0 ? "Le fatture si registrano sui rapporti con partita IVA: il primo si crea da «Rapporti»." : "Trascrivi gli importi dal documento: EasyGame non li ricalcola.",
            primary:
              canManage && vatRelationships.length > 0 ? (
                <Button variant="primary" size="sm" icon={<Plus />} onClick={() => setInvoiceOpen(true)}>
                  Nuova fattura
                </Button>
              ) : null,
          }}
        />
      ) : null}

      <PayoutDrawer open={Boolean(payoutTarget)} onOpenChange={(open) => !open && setPayoutTarget(null)} installmentId={payoutTarget} onDone={() => void load()} />
      <BonusDrawer open={bonusOpen} onOpenChange={setBonusOpen} people={people} onSaved={() => void load()} />
      <ExpenseDrawer open={expenseOpen} onOpenChange={setExpenseOpen} people={people} onSaved={() => void load()} />
      <InvoiceDrawer open={invoiceOpen} onOpenChange={setInvoiceOpen} vatRelationships={vatRelationships} personNameOf={nameOf} onSaved={() => void load()} />
      {confirmDialog}
    </SportWorkShell>
  );
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <CompensationsPage />
    </Suspense>
  );
}
