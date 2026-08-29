"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Sidebar from "@/components/dashboard/Sidebar";
import Header from "@/components/dashboard/Header";
import {
  DashboardPageContainer,
  dashboardMainClassName,
} from "@/components/dashboard/dashboard-page-container";
import { SharedPageHeader } from "@/components/dashboard/shared-page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  BulkSelectionToolbar,
  SelectAllCheckbox,
  SelectRowCheckbox,
  useListSelection,
} from "@/components/ui/list-selection";
import { useToast } from "@/components/ui/toast-notification";
import { useAuth } from "@/components/providers/AuthProvider";
import { AthletePaymentLedger } from "@/components/payments/AthletePaymentLedger";
import { PaymentReminderDialog } from "@/components/payments/PaymentReminderDialog";
import { apiRequest } from "@/lib/api/client";
import { supabase } from "@/lib/supabase";
import { getClub, getClubAthletes, getClubData } from "@/lib/simplified-db";
import { canManageClubConfiguration } from "@/lib/access-roles";
import { getClubPaymentMethodChoices } from "@/lib/payments/payment-config-utils";
import {
  buildStatusLabels,
  readChargeCollectedAmount,
  resolveLedgerState,
  toPaymentAmount,
} from "@/lib/payments/installment-ledger";
import { paymentDateOf, sortByDateDesc } from "@/lib/sorting";
import { normalizeClubSites, type ClubSite } from "@/lib/club-sites";
import {
  canOpenAccounting,
  hasAccountingPermission,
} from "@/lib/accounting/permissions";
import type { AccountingLine } from "@/lib/accounting/model";
import { AccountingSummary } from "@/components/accounting/AccountingSummary";
import { AccountingFilters } from "@/components/accounting/AccountingFilters";
import { AccountingEntries } from "@/components/accounting/AccountingEntries";
import { ExpectedEntries } from "@/components/accounting/ExpectedEntries";
import {
  ReconcileEntryDialog,
  RecordEntryDialog,
  ReverseEntryDialog,
  TransferDialog,
  type RecordEntryPayload,
  type TransferPayload,
} from "@/components/accounting/AccountingEntryDialogs";
import {
  buildEntriesQuery,
  buildReportQuery,
  emptyFilters,
  hasReportUnawareFilter,
  ownEntryId,
  type AccountingFilterState,
  type AccountingReportView,
  type FinancialAccountView,
  type OperationTypeView,
} from "@/components/accounting/accounting-view";
import { ArrowLeftRight, Mail, Plus, ShieldAlert } from "lucide-react";

/**
 * **La prima nota.**
 *
 * ---
 *
 * ## Cosa questa pagina non fa piu
 *
 * Faceva **circa diciassette viaggi HTTP** per disegnarsi, di cui quattordici
 * sulla **stessa singola riga** `clubs` — una per colonna, e ognuna riportava
 * comunque `settings`, la colonna piu grande. Poi normalizzava ventidue
 * sorgenti nel browser, con due deduplicazioni a chiavi diverse e un
 * ordinamento per confronto fra stringhe di date ISO. Due di quelle letture —
 * `suppliers` e `supplier_payments` — erano **morte da sempre**: non esistono
 * ne come colonna ne come risorsa, e tornavano vuote a ogni apertura.
 *
 * Non aveva **nessun filtro di data**, non paginava, e scaricava l'intera
 * tabella `invoices` e `receipts` a ogni apertura.
 *
 * Adesso legge **tre rotte**: l'elenco della prima nota, l'anagrafica dei conti
 * e il riepilogo gestionale. I filtri li applica il server, sugli indici;
 * l'aggregazione delle sorgenti la fa il servizio, che e anche l'unico posto in
 * cui sa cosa e una proiezione e cosa una riga propria; **le somme le fa il
 * riepilogo**, perche la pagina dell'elenco ne contiene cento righe e sommare
 * quelle darebbe il totale della pagina spacciato per totale del periodo.
 *
 * Una quarta lettura — le sedi, per il solo filtro — resta sulla colonna
 * `clubs` perche non esiste altra fonte; nessun numero ne dipende, e se non
 * riesce il filtro semplicemente non si monta, che e il comportamento giusto
 * per un club con una sede sola (ADR-0038).
 *
 * ## Il difetto di permessi che chiude
 *
 * `/movements` non era riservata a proprietario e gestore — passavano anche
 * staff e collaboratore — ma leggeva via `clubs`, che **e** admin-only, e
 * `getClubData` **inghiottiva il 403 restituendo un array vuoto**. Un
 * collaboratore apriva la pagina, si caricava senza errori e **mostrava tutto
 * a zero**; ogni salvataggio falliva con un messaggio generico.
 *
 * Qui la matrice e una sola — `src/lib/accounting/permissions.ts` — e la usano
 * sia questa pagina sia le rotte. Chi non puo aprire la prima nota legge
 * perche; chi non puo vedere i saldi legge perche; chi non puo stornare non
 * vede il pulsante, e se ci arrivasse lo stesso riceverebbe un 403 che dice
 * quale azione ha negato.
 *
 * ## Cosa non c'e, e non per dimenticanza
 *
 * **Non esiste un pulsante «Elimina».** Il denaro non si cancella: si storna.
 */

/*
  Cento righe per pagina. E lo stesso valore che il servizio usa come suo
  predefinito, e non e un caso: fissarne uno diverso qui avrebbe prodotto una
  paginazione che salta righe o le ripete a ogni cambio pagina.
*/
const PAGE_SIZE = 100;

type EntriesResponse = {
  entries: AccountingLine[];
  total: number;
  limit: number;
  offset: number;
};

type AccountsResponse = { accounts: FinancialAccountView[] };

type ReportResponse = { report: AccountingReportView };

const PageShell = ({ children }: { children: React.ReactNode }) => (
  <div className="flex h-[100dvh] bg-gray-50 dark:bg-gray-900">
    <Sidebar />
    <div className="flex flex-1 flex-col overflow-hidden">
      <Header title="Movimenti" />
      <main className={dashboardMainClassName}>
        <DashboardPageContainer>{children}</DashboardPageContainer>
      </main>
    </div>
  </div>
);

export default function MovementsPage() {
  const { showToast } = useToast();
  const { activeClub, userRole } = useAuth();
  const activeClubId = activeClub?.id || null;
  const activeRole = activeClub?.role || userRole || null;

  /*
    I permessi si leggono **una volta**, dalla matrice condivisa. Nessun `if`
    sul ruolo scritto qui dentro: e il modo in cui la matrice della pagina e
    quella della rotta smettono di coincidere.
  */
  const canOpen = canOpenAccounting(activeRole);
  const canManage = hasAccountingPermission(activeRole, "accounting.manage");
  /*
    **Il permesso sui saldi non si valuta qui**, e non e una dimenticanza: il
    riepilogo risponde `accountBalances: null` a chi non ha
    `accounting.accounts_read`, e la pagina mostra il diniego perche il numero
    manca — non perche ha dedotto che dovrebbe mancare. Un permesso valutato in
    due posti e un permesso che prima o poi diverge, ed e la lezione W3-14.
  */

  const [filters, setFilters] = useState<AccountingFilterState>(emptyFilters);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [page, setPage] = useState<EntriesResponse>({
    entries: [],
    total: 0,
    limit: PAGE_SIZE,
    offset: 0,
  });
  const [accounts, setAccounts] = useState<FinancialAccountView[]>([]);
  const [report, setReport] = useState<AccountingReportView | null>(null);
  const [reportLoading, setReportLoading] = useState(true);
  const [operationTypes, setOperationTypes] = useState<OperationTypeView[]>([]);
  const [sites, setSites] = useState<ClubSite[]>([]);

  const [showRecord, setShowRecord] = useState(false);
  const [showTransfer, setShowTransfer] = useState(false);
  const [toReverse, setToReverse] = useState<AccountingLine | null>(null);
  const [toReconcile, setToReconcile] = useState<AccountingLine | null>(null);

  /*
    Le rate delle famiglie **non** sono prima nota: sono crediti, e il loro
    proprietario e `payments` con il registro degli incassi. Vivono qui perche
    da qui si sollecita e si registra un incasso — due scritture del dominio
    pagamenti — e perche toglierle non le avrebbe spostate altrove: le avrebbe
    tolte e basta. Il loro carico si paga solo aprendo la scheda.
  */
  const [tab, setTab] = useState("prima-nota");
  const [installments, setInstallments] = useState<any[]>([]);
  const [installmentsLoaded, setInstallmentsLoaded] = useState(false);
  const [installmentsLoading, setInstallmentsLoading] = useState(false);
  const [athleteNames, setAthleteNames] = useState<Record<string, string>>({});
  const [clubPaymentMethodChoices, setClubPaymentMethodChoices] = useState<
    string[]
  >([]);
  const [openLedgerId, setOpenLedgerId] = useState<string | null>(null);
  const [showReminderDialog, setShowReminderDialog] = useState(false);
  const reminderSelection = useListSelection();

  /*
    Il sollecito lo governa lo stesso permesso che governa gli incassi, e la
    rotta risponde 403 a chi non ce l'ha. Mostrare un pulsante che apre un
    dialogo e poi fallisce e una promessa non mantenuta.
  */
  const canSendReminders = canManageClubConfiguration(activeClub?.role);

  /* ---------------------------------------------------------------------- */
  /* Letture                                                                 */
  /* ---------------------------------------------------------------------- */

  /**
   * La prima nota. **Una chiamata**, con i filtri e la pagina.
   */
  const loadEntries = useCallback(async () => {
    if (!activeClubId || !canOpen) return;

    setLoading(true);
    const query = buildEntriesQuery(filters, { limit: PAGE_SIZE, offset });
    const response = await apiRequest<EntriesResponse>(
      `/api/v1/accounting/entries?${query}`,
    );

    if (response.error) {
      /*
        L'errore si **mostra**. La versione precedente lo inghiottiva e
        disegnava una pagina di zeri, che e il modo piu efficace di far
        credere a un club di non avere movimenti.
      */
      setError(response.error.message);
      setPage({ entries: [], total: 0, limit: PAGE_SIZE, offset });
    } else {
      setError(null);
      setPage(
        response.data || {
          entries: [],
          total: 0,
          limit: PAGE_SIZE,
          offset,
        },
      );
    }

    setLoading(false);
  }, [activeClubId, canOpen, filters, offset]);

  /**
   * I conti: **solo l'anagrafica**, senza saldi.
   *
   * Serve a due cose, e nessuna delle due e un totale: riempire la tendina del
   * filtro e quella della finestra di registrazione. I **saldi** arrivano dal
   * riepilogo, che e il loro unico proprietario in questa pagina — chiederli
   * anche qui vorrebbe dire due letture dello stesso numero, e prima o poi due
   * numeri.
   */
  const loadAccounts = useCallback(async () => {
    if (!activeClubId || !canOpen) return;

    const response = await apiRequest<AccountsResponse>(
      "/api/v1/accounting/accounts",
    );

    setAccounts(response.error ? [] : response.data?.accounts || []);
  }, [activeClubId, canOpen]);

  /**
   * Il **riepilogo gestionale** del periodo filtrato.
   *
   * Somma il server, sulle righe gia filtrate: la pagina che l'elenco mostra
   * ne contiene cento, e sommare quelle darebbe il totale della pagina
   * spacciato per totale del periodo. Da qui arrivano anche crediti e debiti,
   * che il servizio prende dai loro proprietari — il registro delle rate, i
   * bandi, il lavoro sportivo — e i **saldi dei conti**, che valgono `null` e
   * mai zero per chi non puo vederli.
   */
  const loadReport = useCallback(async () => {
    if (!activeClubId || !canOpen) return;

    setReportLoading(true);
    const response = await apiRequest<ReportResponse>(
      `/api/v1/accounting/reports?${buildReportQuery(filters)}`,
    );

    setReport(response.error ? null : response.data?.report || null);
    setReportLoading(false);
  }, [activeClubId, canOpen, filters]);

  /**
   * Le causali, che sono l'elenco da cui si sceglie e il filtro per causale.
   *
   * Leggerle e lavoro di segreteria — senza l'elenco non si registra un
   * movimento — e la rotta lo sa: chiede `accounting.read`, non il permesso di
   * configurarle.
   */
  const loadOperationTypes = useCallback(async () => {
    if (!activeClubId || !canOpen) return;

    const response = await apiRequest<{ operationTypes: OperationTypeView[] }>(
      "/api/v1/fiscal/operation-types",
    );

    setOperationTypes(response.data?.operationTypes || []);
  }, [activeClubId, canOpen]);

  /**
   * Le sedi, e solo per il filtro.
   *
   * **Un club mono-sede non ne ha bisogno**, e se questa lettura non riesce —
   * e la sola che passi ancora dalla colonna `clubs`, riservata — l'elenco
   * resta vuoto e `SiteFilter` non si monta: e esattamente il comportamento di
   * ADR-0038 per chi una sede sola ce l'ha. Nessun numero dipende da questa
   * lettura, quindi il suo fallimento non produce una pagina sbagliata.
   */
  const loadSites = useCallback(async () => {
    if (!activeClubId || !canOpen) return;
    const raw = await getClubData(activeClubId, "club_sites").catch(() => []);
    setSites(normalizeClubSites(raw));
  }, [activeClubId, canOpen]);

  /**
   * Le rate delle famiglie, e solo quando la scheda si apre.
   *
   * Tre letture, non ventidue: le rate, i nomi degli atleti e i metodi di
   * incasso configurati dal club. **Nessun totale nasce da qui**: quanto e
   * incassato su una rata lo dice `readChargeCollectedAmount`, che e il
   * proprietario del calcolo, e lo stato lo deriva `resolveLedgerState` — non
   * si legge da una colonna, che era il difetto di ADR-0036.
   */
  const loadInstallments = useCallback(async () => {
    if (!activeClubId || !canOpen) return;

    setInstallmentsLoading(true);

    const [rows, athletes, club] = await Promise.all([
      supabase
        .from("payments")
        .select("*")
        .eq("organization_id", activeClubId)
        .then((result: any) => result?.data || [])
        .catch(() => []),
      getClubAthletes(activeClubId, { view: "summary" }).catch(() => []),
      getClub(activeClubId).catch(() => null),
    ]);

    const nomi: Record<string, string> = {};
    for (const athlete of athletes as any[]) {
      const id = String(athlete?.id || "").trim();
      if (!id) continue;
      nomi[id] = String(
        athlete?.name ||
          [athlete?.first_name, athlete?.last_name].filter(Boolean).join(" ") ||
          "",
      ).trim();
    }

    setAthleteNames(nomi);
    setClubPaymentMethodChoices(
      getClubPaymentMethodChoices((club as any)?.settings),
    );
    /* Le rate sono una cronologia: dalla piu recente, mai dall'inserimento. */
    setInstallments(sortByDateDesc(rows as any[], paymentDateOf));
    setInstallmentsLoaded(true);
    setInstallmentsLoading(false);
  }, [activeClubId, canOpen]);

  useEffect(() => {
    if (tab !== "rate" || installmentsLoaded || installmentsLoading) return;
    void loadInstallments();
  }, [tab, installmentsLoaded, installmentsLoading, loadInstallments]);

  useEffect(() => {
    if (!activeClubId) {
      setLoading(false);
      return;
    }
    if (!canOpen) {
      setLoading(false);
      return;
    }
    void loadAccounts();
    void loadOperationTypes();
    void loadSites();
  }, [activeClubId, canOpen, loadAccounts, loadOperationTypes, loadSites]);

  useEffect(() => {
    void loadEntries();
  }, [loadEntries]);

  useEffect(() => {
    if (!canOpen) {
      setReportLoading(false);
      return;
    }
    void loadReport();
  }, [canOpen, loadReport]);

  /* ---------------------------------------------------------------------- */
  /* Scritture                                                               */
  /* ---------------------------------------------------------------------- */

  /**
   * Dopo ogni scrittura si rileggono prima nota **e** riepilogo.
   *
   * I saldi sono derivati: nessuno li aggiorna a mano, e nessuno deve. Era la
   * seconda chiamata HTTP non transazionale che disallineava `current_balance`
   * dal movimento appena scritto.
   */
  const reloadAfterWrite = useCallback(async () => {
    await Promise.all([loadEntries(), loadReport()]);
  }, [loadEntries, loadReport]);

  const submit = useCallback(
    async (
      path: string,
      body: Record<string, unknown>,
      successMessage: string,
      onDone: () => void,
    ) => {
      setBusy(true);
      const response = await apiRequest(path, { method: "POST", body });
      setBusy(false);

      if (response.error) {
        /*
          Il messaggio e quello del dominio, non uno generico riscritto qui: il
          difetto che la Wave 3 ha misurato non era il 403, era il 403 senza
          motivo.
        */
        showToast("error", response.error.message);
        return;
      }

      showToast("success", successMessage);
      onDone();
      await reloadAfterWrite();
    },
    [reloadAfterWrite, showToast],
  );

  const handleRecord = useCallback(
    (payload: RecordEntryPayload) =>
      submit(
        "/api/v1/accounting/entries",
        payload,
        "Movimento registrato",
        () => setShowRecord(false),
      ),
    [submit],
  );

  const handleTransfer = useCallback(
    (payload: TransferPayload) =>
      submit(
        "/api/v1/accounting/entries?kind=transfer",
        payload,
        "Giroconto registrato",
        () => setShowTransfer(false),
      ),
    [submit],
  );

  const handleReverse = useCallback(
    (payload: { reason: string; entry_date: string }) => {
      const line = toReverse;
      if (!line) return;
      const id = ownEntryId(line);
      if (!id) return;
      return submit(
        `/api/v1/accounting/entries/${id}/reverse`,
        payload,
        "Movimento stornato",
        () => setToReverse(null),
      );
    },
    [submit, toReverse],
  );

  const handleReconcile = useCallback(
    (payload: { status: string; value_date: string; bank_reference: string }) => {
      const line = toReconcile;
      if (!line) return;
      const id = ownEntryId(line);
      if (!id) return;
      return submit(
        `/api/v1/accounting/entries/${id}/reconcile`,
        payload,
        "Riconciliazione aggiornata",
        () => setToReconcile(null),
      );
    },
    [submit, toReconcile],
  );

  /* ---------------------------------------------------------------------- */
  /* Vista                                                                   */
  /* ---------------------------------------------------------------------- */

  /**
   * Le rate sollecitabili, con il loro stato **derivato**.
   *
   * Una rata gia saldata non si sollecita, e non e una regola di questa
   * pagina: lo stato lo decide il registro degli incassi.
   */
  const installmentRows = useMemo(
    () =>
      installments.map((charge) => {
        const dueAmount = toPaymentAmount((charge as any)?.amount);
        const paidAmount = readChargeCollectedAmount(charge);
        const state = resolveLedgerState({ dueAmount, paidAmount });
        const dueDate = (charge as any)?.due_date || (charge as any)?.dueDate;
        const overdue =
          state !== "paid" &&
          Boolean(dueDate) &&
          new Date(dueDate).getTime() < Date.now();

        return {
          charge,
          id: String((charge as any)?.id || ""),
          athleteId: String((charge as any)?.athlete_id || "").trim(),
          dueAmount,
          paidAmount,
          state,
          labels: buildStatusLabels(state, overdue),
          dueDate: dueDate || null,
        };
      }),
    [installments],
  );

  const remindableIds = useMemo(
    () =>
      installmentRows
        .filter((row) => row.id && row.state !== "paid")
        .map((row) => row.id),
    [installmentRows],
  );

  /*
    Una selezione che tiene l'id di una rata sparita dopo una rilettura
    mostrerebbe un conteggio che non corrisponde a niente. La potatura passa da
    un riferimento e non dalle dipendenze dell'effetto: `useListSelection`
    restituisce un oggetto nuovo a ogni cambio di selezione, e metterlo fra le
    dipendenze farebbe rientrare l'effetto nel proprio risultato.
  */
  const reminderSelectionRef = useRef(reminderSelection);
  useEffect(() => {
    reminderSelectionRef.current = reminderSelection;
  }, [reminderSelection]);
  useEffect(() => {
    reminderSelectionRef.current.prune(remindableIds);
  }, [remindableIds]);

  const selectedReminderIds = useMemo(
    () => remindableIds.filter((id) => reminderSelection.isSelected(id)),
    [remindableIds, reminderSelection],
  );

  const applyFilters = useCallback((next: Partial<AccountingFilterState>) => {
    /* Cambiare un filtro riporta alla prima pagina: la seconda pagina di un
       elenco diverso non e la seconda pagina di niente. */
    setOffset(0);
    setFilters((prev) => ({ ...prev, ...next }));
  }, []);

  if (!canOpen) {
    return (
      <PageShell>
        <SharedPageHeader
          title="Prima nota"
          subtitle="Registro dei movimenti finanziari della societa."
        />
        <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" aria-hidden />
          <div className="text-sm text-amber-900">
            <p className="font-medium">La prima nota non e accessibile</p>
            <p className="mt-1">
              Il ruolo attivo su questo club non puo vedere la prima nota e il
              riepilogo gestionale. Chiedi al proprietario o al gestore della
              societa di attribuirti il permesso.
            </p>
          </div>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <SharedPageHeader
        title="Prima nota"
        subtitle="Entrate, uscite e giroconti della societa, con la loro causale e il conto su cui il denaro si e mosso. Incassi, compensi e contributi restano ai loro domini e qui si leggono."
        actions={
          canManage && tab === "prima-nota" ? (
            <>
              <Button type="button" onClick={() => setShowRecord(true)}>
                <Plus className="mr-2 h-4 w-4" aria-hidden />
                Registra movimento
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowTransfer(true)}
              >
                <ArrowLeftRight className="mr-2 h-4 w-4" aria-hidden />
                Giroconto
              </Button>
            </>
          ) : null
        }
      />

      <Tabs value={tab} onValueChange={setTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3 sm:flex sm:w-fit">
          <TabsTrigger value="prima-nota">Prima nota</TabsTrigger>
          <TabsTrigger value="rate">Rate e solleciti</TabsTrigger>
          <TabsTrigger value="previsti">Previsti</TabsTrigger>
        </TabsList>

        <TabsContent value="prima-nota" className="m-0 space-y-6 pt-6">
          <AccountingSummary
            accounts={accounts}
            report={report}
            loading={reportLoading}
            filtersBeyondSummary={hasReportUnawareFilter(filters)}
          />

          <AccountingFilters
            filters={filters}
            onChange={applyFilters}
            onReset={() => {
              setOffset(0);
              setFilters(emptyFilters);
            }}
            accounts={accounts}
            operationTypes={operationTypes}
            sites={sites}
            disabled={busy}
          />

          {error ? (
            <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4">
              <ShieldAlert
                className="mt-0.5 h-5 w-5 shrink-0 text-red-600"
                aria-hidden
              />
              <div className="text-sm text-red-900">
                <p className="font-medium">La prima nota non e stata letta</p>
                <p className="mt-1">{error}</p>
              </div>
            </div>
          ) : (
            <AccountingEntries
              entries={page.entries}
              total={page.total}
              limit={page.limit || PAGE_SIZE}
              offset={page.offset || 0}
              loading={loading}
              busy={busy}
              onPageChange={setOffset}
              onReverse={setToReverse}
              onReconcile={setToReconcile}
            />
          )}
        </TabsContent>

        {/*
          Le rate sono **crediti**, non cassa: stanno in una scheda a parte e
          non nella stessa riga di totali della prima nota. Da qui si fanno le
          due cose che appartengono al dominio pagamenti e non hanno altro
          posto: sollecitare, e registrare un incasso sulla rata.
        */}
        <TabsContent value="rate" className="m-0 space-y-4 pt-6">
          <p className="text-sm text-slate-600">
            Le rate dovute dalle famiglie. Non sono denaro incassato: lo
            diventano quando un incasso viene registrato, e allora compaiono in
            prima nota come proiezione del loro dominio.
          </p>

          <BulkSelectionToolbar
            selection={reminderSelection}
            nouns={{ one: "rata", many: "rate" }}
          >
            {canSendReminders ? (
              <Button
                size="sm"
                className="h-8"
                disabled={selectedReminderIds.length === 0}
                onClick={() => setShowReminderDialog(true)}
              >
                <Mail className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                Sollecita
              </Button>
            ) : null}
          </BulkSelectionToolbar>

          {installmentsLoading ? (
            <div className="rounded-lg border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
              Lettura delle rate...
            </div>
          ) : installmentRows.length === 0 ? (
            <div className="rounded-lg border border-slate-200 bg-white p-8 text-center text-sm text-slate-600">
              Nessuna rata registrata per questo club.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <SelectAllCheckbox
                        selection={reminderSelection}
                        ids={remindableIds}
                        label="le rate aperte in elenco"
                      />
                    </TableHead>
                    <TableHead className="whitespace-nowrap">Scadenza</TableHead>
                    <TableHead>Atleta</TableHead>
                    <TableHead>Descrizione</TableHead>
                    <TableHead className="text-right whitespace-nowrap">
                      Dovuto
                    </TableHead>
                    <TableHead className="text-right whitespace-nowrap">
                      Incassato
                    </TableHead>
                    <TableHead>Stato</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {installmentRows.map((row) => (
                    <TableRow
                      key={row.id}
                      className="cursor-pointer"
                      onClick={() =>
                        setOpenLedgerId((current) =>
                          current === row.id ? null : row.id,
                        )
                      }
                    >
                      <TableCell
                        className="w-10"
                        onClick={(event) => event.stopPropagation()}
                      >
                        {row.state !== "paid" ? (
                          <SelectRowCheckbox
                            selection={reminderSelection}
                            id={row.id}
                            label={`la rata di ${
                              athleteNames[row.athleteId] || "un atleta"
                            }`}
                          />
                        ) : null}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm">
                        {row.dueDate
                          ? new Date(row.dueDate).toLocaleDateString("it-IT")
                          : "-"}
                      </TableCell>
                      <TableCell className="text-sm">
                        {athleteNames[row.athleteId] || "-"}
                      </TableCell>
                      <TableCell className="text-sm">
                        {(row.charge as any)?.description || "-"}
                      </TableCell>
                      <TableCell className="text-right text-sm tabular-nums">
                        {row.dueAmount.toFixed(2)} EUR
                      </TableCell>
                      <TableCell className="text-right text-sm tabular-nums">
                        {row.paidAmount.toFixed(2)} EUR
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {row.labels.map((label) => (
                            <Badge
                              key={label}
                              variant="outline"
                              className="font-normal"
                            >
                              {label}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {/*
            Registrare un incasso su una rata e una scrittura del dominio
            pagamenti, e passa dal suo componente: due modi di registrare lo
            stesso incasso sono due idee di «quanto ha pagato».
          */}
          {openLedgerId
            ? installmentRows
                .filter((row) => row.id === openLedgerId && row.athleteId)
                .map((row) => (
                  <div
                    key={row.id}
                    className="rounded-lg border border-slate-200 bg-white p-4"
                  >
                    <AthletePaymentLedger
                      athleteId={row.athleteId}
                      athleteName={athleteNames[row.athleteId] || null}
                      charges={[row.charge]}
                      methodChoices={clubPaymentMethodChoices}
                      showTotals={false}
                      onLedgerChanged={() => {
                        void loadInstallments();
                        void reloadAfterWrite();
                      }}
                    />
                  </div>
                ))
            : null}
        </TabsContent>

        {/*
          I **previsti** sono impegni futuri: non sono cassa, non sono prima
          nota e non toccano nessun saldo. Stanno in una scheda a parte per la
          stessa ragione per cui ci stanno le rate — «Entrate» con sotto
          «Previste» era il numero che nessuno sapeva piu leggere.

          La scheda si carica da sola e scrive dalle sue rotte: il
          read-modify-write della colonna JSON dal browser, che era il difetto,
          non torna qui dentro.
        */}
        <TabsContent value="previsti" className="m-0 pt-6">
          {tab === "previsti" ? <ExpectedEntries clubId={activeClubId} /> : null}
        </TabsContent>
      </Tabs>

      <PaymentReminderDialog
        open={showReminderDialog}
        onOpenChange={setShowReminderDialog}
        chargeIds={selectedReminderIds}
        onSent={() => {
          reminderSelection.clear();
          void loadInstallments();
        }}
      />

      <RecordEntryDialog
        open={showRecord}
        onOpenChange={setShowRecord}
        accounts={accounts}
        operationTypes={operationTypes}
        sites={sites}
        saving={busy}
        onSubmit={handleRecord}
      />

      <TransferDialog
        open={showTransfer}
        onOpenChange={setShowTransfer}
        accounts={accounts}
        sites={sites}
        saving={busy}
        onSubmit={handleTransfer}
      />

      <ReverseEntryDialog
        line={toReverse}
        onOpenChange={(open) => {
          if (!open) setToReverse(null);
        }}
        saving={busy}
        onSubmit={handleReverse}
      />

      <ReconcileEntryDialog
        line={toReconcile}
        onOpenChange={(open) => {
          if (!open) setToReconcile(null);
        }}
        saving={busy}
        onSubmit={handleReconcile}
      />
    </PageShell>
  );
}
