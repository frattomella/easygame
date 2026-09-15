"use client";

import * as React from "react";
import { Check, ExternalLink, FileCheck, RefreshCw, X } from "lucide-react";
import Header from "@/components/dashboard/Header";
import Sidebar from "@/components/dashboard/Sidebar";
import { DashboardPageContainer, dashboardMainClassName } from "@/components/dashboard/dashboard-page-container";
import { useAuth } from "@/components/providers/AuthProvider";
import { useToast } from "@/components/ui/toast-notification";
import { HeaderStat, PageHeader } from "@/components/web/page/PageHeader";
import { Button } from "@/components/web/primitives/Button";
import { DataChip, StatusPill } from "@/components/web/primitives/StatusPill";
import { IdentityCell } from "@/components/web/primitives/Identity";
import { DataGrid } from "@/components/web/datagrid/DataGrid";
import type { ColumnDef, FilterDef, RowActionDef } from "@/components/web/datagrid/types";
import { formatDateShort, formatInteger, joinMeta } from "@/lib/web/format";
import { apiRequest } from "@/lib/api/client";
import { openClientFileUrl } from "@/lib/client-files";
import { parseCustomRoleValue } from "@/lib/access-roles";
import { roleHasPermission } from "@/lib/permissions/catalog";
import {
  countReviewQueue,
  reviewQueueActions,
  searchReviewQueue,
  type DocumentReviewRow,
} from "@/lib/documents/review-queue";
import { DocumentDecisionDrawer } from "@/components/documents/v2/document-decision-drawer";
import {
  REVIEW_QUEUE_FILTER_OPTIONS,
  REVIEW_QUEUE_VIEWS,
  reviewDecisionTarget,
  reviewQueueStatusSpec,
  reviewRowId,
  reviewSourceLabel,
  rowPassesQueueFilter,
  type ReviewDecision,
} from "@/components/documents/v2/review-queue-model";

/**
 * `/documenti` — la coda dei documenti da verificare (Web V2, pattern 1:
 * intestazione di pagina + DataGrid a tutta larghezza). Audit:
 * `docs/redesign/audit/wave-e-documenti.md`.
 *
 * Verificare i documenti e un lavoro **per coda**, non per persona: si apre
 * la mattina, si guarda cosa e arrivato, si decide. La scheda atleta risponde
 * alla domanda opposta — «cosa manca a Marco» — e con duecento atleti
 * significava non guardare mai.
 *
 * La lettura e la scrittura sono quelle della V1: `GET
 * /api/v1/document-submissions?view=queue` e `POST
 * /api/v1/document-submissions/{id}` con la decisione. Le sette pastiglie
 * della V1 sono le viste della griglia; le regole di filtro, ricerca e
 * azione restano nel dominio (`src/lib/documents/review-queue.ts`), cosi la
 * stessa domanda ha la stessa risposta nel conteggio e nell'elenco.
 *
 * **Il cancello e la chiave, non un elenco di ruoli.** `documents.review` e
 * `documents.read_dossier` sono le stesse chiavi che il servizio pretende
 * (`listDocumentReviewQueue`). Su un ruolo di club di cui il browser conosce
 * solo lo slug non si finge di sapere: si lascia rispondere la rotta, che il
 * vaglio ce l'ha per davvero, e l'elenco ristretto compare solo quando
 * qualcuno e stato negato sul serio.
 */
type Decisione = { row: DocumentReviewRow; decision: ReviewDecision };

export default function DocumentiPage() {
  const { activeClub, userRole } = useAuth();
  const { showToast } = useToast();
  const role = activeClub?.role || userRole || null;

  const personalizzato = parseCustomRoleValue(role);
  const chiaviNonRisolte = Boolean(personalizzato) && personalizzato!.permissions.length === 0;
  const canReview =
    chiaviNonRisolte || (roleHasPermission(role, "documents.review") && roleHasPermission(role, "documents.read_dossier"));

  const [rows, setRows] = React.useState<DocumentReviewRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [reloadKey, setReloadKey] = React.useState(0);
  const [requestedViewId, setRequestedViewId] = React.useState<string | null>(null);
  const [decisione, setDecisione] = React.useState<Decisione | null>(null);
  const [inCorso, setInCorso] = React.useState(false);

  React.useEffect(() => {
    if (!canReview) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    const carica = async () => {
      setLoading(true);
      const parametri = new URLSearchParams({ view: "queue" });
      const payload = await apiRequest<DocumentReviewRow[]>(`/api/v1/document-submissions?${parametri.toString()}`);
      if (cancelled) return;
      if (payload?.error) {
        /*
          Un elenco vuoto e un elenco che non si e caricato sono due cose
          diverse, e per una segreteria la differenza fra «nessuno ha
          caricato niente» e «non lo so» e tutta.
        */
        setRows([]);
        setLoadError(payload.error.message || "Impossibile leggere la coda dei documenti");
      } else {
        setRows(Array.isArray(payload?.data) ? payload.data : []);
        setLoadError(null);
      }
      setLoading(false);
    };
    void carica();
    return () => {
      cancelled = true;
    };
  }, [canReview, reloadKey]);

  const reload = () => setReloadKey((k) => k + 1);

  /* ── La decisione ───────────────────────────────────────────────────── */
  const decidi = async (note: string | null) => {
    if (!decisione) return;
    const { row, decision } = decisione;
    if (decision === "rejected" && !note) {
      showToast("error", "Il motivo del rifiuto è obbligatorio");
      return;
    }
    setInCorso(true);
    const payload = await apiRequest<unknown>(`/api/v1/document-submissions/${reviewDecisionTarget(row)}`, {
      method: "POST",
      body: { decision, note },
    });
    setInCorso(false);
    if (payload?.error) {
      showToast("error", payload.error.message || "Decisione non riuscita");
      return;
    }
    showToast("success", decision === "approved" ? "Documento approvato" : "Documento rifiutato");
    setDecisione(null);
    reload();
  };

  /* ── Griglia ────────────────────────────────────────────────────────── */
  const conteggi = React.useMemo(() => countReviewQueue(rows), [rows]);

  const columns = React.useMemo<ColumnDef<DocumentReviewRow>[]>(
    () => [
      {
        id: "identity",
        header: "Atleta",
        kind: "identity",
        locked: true,
        width: 1.6,
        cell: (row) => <IdentityCell name={row.subjectName || "Atleta"} round meta={joinMeta(row.title, row.documentKindLabel)} />,
        sortValue: (row) => (row.subjectName || "").toLowerCase(),
        exportValue: (row) => row.subjectName || "Atleta",
        title: (row) => row.subjectName || "Atleta",
      },
      {
        id: "title",
        header: "Documento",
        kind: "text",
        width: 1.4,
        minWidth: 160,
        cell: (row) => row.title,
        sortValue: (row) => row.title.toLowerCase(),
        title: (row) => row.title,
      },
      {
        id: "kind",
        header: "Tipo",
        kind: "classification",
        cell: (row) => (
          <DataChip size="sm" title={row.documentKindLabel}>
            {row.documentKindLabel}
          </DataChip>
        ),
        sortValue: (row) => row.documentKindLabel.toLowerCase(),
        exportValue: (row) => row.documentKindLabel,
      },
      {
        id: "state",
        header: "Stato",
        kind: "status",
        cell: (row) => <StatusPill status={reviewQueueStatusSpec(row.state)} />,
        sortValue: (row) => reviewQueueStatusSpec(row.state).label,
        exportValue: (row) => reviewQueueStatusSpec(row.state).label,
      },
      {
        id: "submittedAt",
        header: "Caricato il",
        kind: "date",
        cell: (row) =>
          row.submittedAt ? (
            <span className="egw-num">{formatDateShort(row.submittedAt)}</span>
          ) : (
            <span className="text-egw-ink-62">Nessun file consegnato</span>
          ),
        sortValue: (row) => row.submittedAt || null,
        exportValue: (row) => row.submittedAt,
      },
      {
        id: "submittedBy",
        header: "Caricato da",
        kind: "text",
        cell: (row) => row.submittedByName,
        sortValue: (row) => row.submittedByName.toLowerCase() || null,
        title: (row) => row.submittedByName || undefined,
      },
      {
        id: "source",
        header: "Fonte",
        kind: "classification",
        cell: (row) => (reviewSourceLabel(row.source) ? <DataChip size="sm">{reviewSourceLabel(row.source)}</DataChip> : null),
        sortValue: (row) => reviewSourceLabel(row.source) || null,
        exportValue: (row) => reviewSourceLabel(row.source),
      },
      {
        /*
          Una scadenza superata e una data che e anche uno stato: la pillola
          «Scaduto» con la data accanto, come vuole la guideline 07 §7.4. E
          la seconda colonna di stato della riga — due cicli di vita, due
          intestazioni — perche un deposito puo essere da verificare **e**
          in ritardo.
        */
        id: "dueDate",
        header: "Scadenza",
        kind: "date",
        cell: (row) =>
          row.overdue ? (
            <StatusPill status="expired" detail={row.dueDate ? formatDateShort(row.dueDate) : undefined} />
          ) : row.dueDate ? (
            <span className="egw-num">{formatDateShort(row.dueDate)}</span>
          ) : null,
        sortValue: (row) => row.dueDate || null,
        exportValue: (row) => row.dueDate,
      },
      {
        id: "decisionNote",
        header: "Motivo",
        kind: "text",
        hidden: true,
        cell: (row) => (row.state === "rejected" ? row.decisionNote : null),
        sortValue: (row) => (row.state === "rejected" ? row.decisionNote?.toLowerCase() || null : null),
        exportValue: (row) => (row.state === "rejected" ? row.decisionNote : null),
        title: (row) => (row.state === "rejected" ? row.decisionNote || undefined : undefined),
      },
      {
        id: "decidedAt",
        header: "Deciso il",
        kind: "date",
        hidden: true,
        cell: (row) => (row.decidedAt ? <span className="egw-num">{formatDateShort(row.decidedAt)}</span> : null),
        sortValue: (row) => row.decidedAt || null,
        exportValue: (row) => row.decidedAt,
      },
      {
        id: "historyCount",
        header: "Depositi",
        kind: "number",
        hidden: true,
        align: "right",
        cell: (row) => <span className="egw-num">{formatInteger(row.historyCount)}</span>,
        sortValue: (row) => row.historyCount,
        exportValue: (row) => row.historyCount,
      },
    ],
    [],
  );

  const filters = React.useMemo<FilterDef<DocumentReviewRow>[]>(
    () => [
      {
        id: "queue",
        label: "Coda",
        type: "select",
        pinned: true,
        options: REVIEW_QUEUE_FILTER_OPTIONS.map((voce) => ({
          value: voce.key,
          label: voce.label,
          count: conteggi[voce.key] ?? 0,
          tone: voce.key === "overdue" ? "red" : voce.key === "to_fix" ? "amber" : "neutral",
        })),
        apply: rowPassesQueueFilter,
      },
      {
        id: "source",
        label: "Fonte",
        type: "select",
        options: [
          { value: "parent", label: "Famiglia" },
          { value: "club", label: "Segreteria" },
          { value: "public_form", label: "Modulo pubblico" },
        ],
        apply: (row, value) => (typeof value === "string" && value ? row.source === value : true),
      },
    ],
    [conteggi],
  );

  const rowActions = React.useMemo<RowActionDef<DocumentReviewRow>[]>(
    () => [
      /*
        `openClientFileUrl` e non un `<a href>`: un allegato puo arrivare
        come `data:` URL, e su ogni browser recente un link diretto a un
        data URL non apre niente (presidio in `tests/lib/attachment-names`).
        Le tre azioni compaiono solo dove `reviewQueueActions` le concede:
        un pulsante che si vede e risponde 403 e un difetto quanto una porta
        aperta, e su una richiesta senza file non c'e niente da decidere.
      */
      { id: "open", label: "Apri", icon: <ExternalLink />, primary: true, hidden: (row) => !reviewQueueActions(row).canOpen, onClick: (row) => openClientFileUrl(row.fileUrl) },
      { id: "approve", label: "Approva", icon: <Check />, hidden: (row) => !reviewQueueActions(row).canDecide, onClick: (row) => setDecisione({ row, decision: "approved" }) },
      { id: "reject", label: "Rifiuta", icon: <X />, hidden: (row) => !reviewQueueActions(row).canDecide, onClick: (row) => setDecisione({ row, decision: "rejected" }) },
    ],
    [],
  );

  const search = React.useMemo(
    () => ({
      placeholder: "Atleta, documento, genitore",
      match: (row: DocumentReviewRow, query: string) => searchReviewQueue([row], query).length > 0,
    }),
    [],
  );

  const gridState = !canReview ? "restricted" : loading ? "loading" : loadError ? "error" : "ready";

  return (
    <div className="flex h-[100dvh] bg-egw-page">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* `Header` monta gia `MobileTopBar` sotto i 1024 px: il titolo passa da qui. */}
        <Header title="Documenti" />
        <main className={dashboardMainClassName}>
          <DashboardPageContainer>
            <PageHeader
              eyebrow="Segreteria"
              title="Documenti da verificare"
              description="Cosa le famiglie hanno caricato, cosa il club sta ancora aspettando, e cosa è stato deciso. Una decisione presa non si riscrive: si chiede un altro file."
              stats={
                canReview && !loading && !loadError ? (
                  <>
                    <HeaderStat value={formatInteger(conteggi.new)} label="da verificare" tone={conteggi.new ? "amber" : "ink"} onClick={() => setRequestedViewId("new")} />
                    <HeaderStat value={formatInteger(conteggi.to_fix)} label="da integrare" tone={conteggi.to_fix ? "amber" : "ink"} onClick={() => setRequestedViewId("to_fix")} />
                    <HeaderStat value={formatInteger(conteggi.overdue)} label="scaduti" tone={conteggi.overdue ? "red" : "ink"} onClick={() => setRequestedViewId("overdue")} />
                  </>
                ) : null
              }
              actions={
                canReview ? (
                  <Button variant="secondary" icon={<RefreshCw />} onClick={reload} disabled={loading}>
                    Aggiorna
                  </Button>
                ) : null
              }
            />

            <DataGrid<DocumentReviewRow>
              module="documenti"
              aria-label="Documenti da verificare"
              rows={rows}
              getRowId={reviewRowId}
              rowLabel={(row) => joinMeta(row.subjectName || "Atleta", row.title)}
              columns={columns}
              filters={filters}
              views={REVIEW_QUEUE_VIEWS}
              requestedViewId={requestedViewId}
              search={search}
              defaultSort={{ columnId: "submittedAt", direction: "desc" }}
              rowActions={rowActions}
              canSelect={false}
              state={gridState}
              errorMessage={loadError}
              onRetry={reload}
              noun={{ singular: "documento", plural: "documenti" }}
              empty={{
                icon: <FileCheck />,
                title: "Nessun documento in questa vista",
                description: "Le richieste e i depositi delle famiglie compaiono qui appena arrivano.",
              }}
            />
          </DashboardPageContainer>
        </main>
      </div>

      <DocumentDecisionDrawer
        open={Boolean(decisione)}
        onOpenChange={(open) => !open && !inCorso && setDecisione(null)}
        row={decisione?.row || null}
        decision={decisione?.decision || "approved"}
        onConfirm={decidi}
        loading={inCorso}
      />
    </div>
  );
}
