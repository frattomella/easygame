"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeftRight, ChevronRight, Mail, Plus, ReceiptText, X } from "lucide-react";
import { cn } from "@/lib/utils";
import Sidebar from "@/components/dashboard/Sidebar";
import Header from "@/components/dashboard/Header";
import {
  DashboardPageContainer,
  dashboardMainClassName,
} from "@/components/dashboard/dashboard-page-container";
import { useToast } from "@/components/ui/toast-notification";
import { useAuth } from "@/components/providers/AuthProvider";
import { PageHeader } from "@/components/web/page/PageHeader";
import { AlertBlock } from "@/components/web/page/Alerts";
import { InfoCard } from "@/components/web/page/Cards";
import { Button, IconButton } from "@/components/web/primitives/Button";
import { SegmentedControl } from "@/components/web/primitives/Controls";
import { Panel, PanelHeader } from "@/components/web/primitives/Surface";
import { DataGrid } from "@/components/web/datagrid/DataGrid";
import type { BulkActionDef, FilterState, RowActionDef, ViewDef } from "@/components/web/datagrid/types";
import { AthletePaymentLedger } from "@/components/payments/AthletePaymentLedger";
import { PaymentReminderDialog } from "@/components/payments/PaymentReminderDialog";
import { apiRequest } from "@/lib/api/client";
import { supabase } from "@/lib/supabase";
import { getClub, getClubAthletes, getClubData } from "@/lib/simplified-db";
import { canManageClubConfigurationAsActor } from "@/lib/access-roles";
import { getClubPaymentMethodChoices } from "@/lib/payments/payment-config-utils";
import { paymentDateOf, sortByDateDesc } from "@/lib/sorting";
import { normalizeClubSites, type ClubSite } from "@/lib/club-sites";
import { normalizeClubSeasons, type ClubSeason } from "@/lib/club-seasons";
import {
  canOpenAccounting,
  hasAccountingPermission,
} from "@/lib/accounting/permissions";
import type { AccountingLine } from "@/lib/accounting/model";
import { AccountingSummary } from "@/components/accounting/AccountingSummary";
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
  hasActiveFilters,
  hasReportUnawareFilter,
  ownEntryId,
  type AccountingFilterState,
  type AccountingReportView,
  type FinancialAccountView,
  type OperationTypeView,
} from "@/components/accounting/accounting-view";
import {
  PRIMA_NOTA_FILTER_IDS,
  PrimaNotaPager,
  buildPrimaNotaColumns,
  buildPrimaNotaFilters,
  buildPrimaNotaRowActions,
  gridFiltersToAccounting,
} from "@/components/accounting/v2/prima-nota-grid";
import {
  RATE_COLUMNS,
  RATE_FILTERS,
  RATE_VIEWS,
  isRemindable,
  rateSearch,
  toInstallmentRows,
  type InstallmentRow,
} from "@/components/accounting/v2/rate-grid";
import {
  FiscalYearContextControl,
  SeasonContextControl,
} from "@/components/accounting/v2/context-controls";

/**
 * **La prima nota** (Web V2, guideline 09 §9.1 pattern 10 «Dense
 * administration»: intestazione → riepilogo finanziario ed economico → griglia
 * con la sua barra di filtri).
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
 * Due letture in piu restano sulla colonna `clubs` perche non esiste altra
 * fonte: le sedi (per il filtro) e le impostazioni (stagioni per il controllo
 * di contesto, metodi di incasso per il registro delle rate). Nessun numero ne
 * dipende, e se non riescono il controllo semplicemente non si monta, che e il
 * comportamento giusto per un club con una sede sola (ADR-0038).
 *
 * ## La griglia mostra i filtri, il server li applica
 *
 * Il `DataGrid` filtra e pagina sul lato client le righe che ha in mano; qui in
 * mano ha **una pagina di cento righe**. Percio i suoi filtri e la sua casella
 * di ricerca non filtrano niente: `onFiltersChange` e `onQueryChange`
 * ricostruiscono la query (`buildEntriesQuery`) e rileggono dal servizio, e
 * «Precedenti / Successivi» chiedono la pagina prima o dopo. E lo stesso
 * contratto della V1 con la barra di filtri, nella forma della griglia.
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

type MovementsTab = "prima-nota" | "rate" | "previsti";

const TABS: { value: MovementsTab; label: string }[] = [
  { value: "prima-nota", label: "Prima nota" },
  { value: "rate", label: "Rate e solleciti" },
  { value: "previsti", label: "Previsti" },
];

const isMovementsTab = (value: unknown): value is MovementsTab =>
  TABS.some((tab) => tab.value === value);

/** Le viste di sistema del registro: ognuna e un filtro che il servizio applica. */
const PRIMA_NOTA_VIEWS: ViewDef[] = [
  { id: "in", label: "Solo entrate", filters: { [PRIMA_NOTA_FILTER_IDS.direction]: "IN" }, builtIn: true },
  { id: "out", label: "Solo uscite", filters: { [PRIMA_NOTA_FILTER_IDS.direction]: "OUT" }, builtIn: true },
  {
    id: "unreconciled",
    label: "Da riconciliare",
    filters: { [PRIMA_NOTA_FILTER_IDS.reconciliationStatus]: "unreconciled" },
    builtIn: true,
    tone: "amber",
  },
];

const sameFilters = (a: AccountingFilterState, b: AccountingFilterState) =>
  (Object.keys(a) as (keyof AccountingFilterState)[]).every((key) => a[key] === b[key]);

const PageShell = ({ children }: { children: React.ReactNode }) => (
  <div className="flex h-[100dvh] bg-egw-page">
    <Sidebar />
    <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
      <Header title="Prima nota" />
      <main className={dashboardMainClassName}>
        <DashboardPageContainer>{children}</DashboardPageContainer>
      </main>
    </div>
  </div>
);

const PAGE_DESCRIPTION =
  "Entrate, uscite e giroconti della societa, con la loro causale e il conto su cui il denaro si e mosso. Incassi, compensi e contributi restano ai loro domini e qui si leggono.";

export default function MovementsPage() {
  const { showToast } = useToast();
  const { activeClub, userRole } = useAuth();
  const router = useRouter();
  const pathname = usePathname() || "/movements";
  const rawSearchParams = useSearchParams();
  const searchParams = useMemo(() => rawSearchParams ?? new URLSearchParams(), [rawSearchParams]);
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
    il permesso sui conti, e la pagina mostra il diniego perche il numero
    manca — non perche ha dedotto che dovrebbe mancare. Un permesso valutato in
    due posti e un permesso che prima o poi diverge, ed e la lezione W3-14.
  */

  const [filters, setFilters] = useState<AccountingFilterState>(emptyFilters);
  const filtersRef = useRef(filters);
  filtersRef.current = filters;
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
  const [seasons, setSeasons] = useState<ClubSeason[]>([]);

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
  const [tab, setTab] = useState<MovementsTab>(() => {
    const requested = searchParams.get("tab");
    return isMovementsTab(requested) ? requested : "prima-nota";
  });
  const [installments, setInstallments] = useState<any[]>([]);
  const [installmentsLoaded, setInstallmentsLoaded] = useState(false);
  const [installmentsLoading, setInstallmentsLoading] = useState(false);
  const [athleteNames, setAthleteNames] = useState<Record<string, string>>({});
  const [clubPaymentMethodChoices, setClubPaymentMethodChoices] = useState<
    string[]
  >([]);
  const [openLedgerId, setOpenLedgerId] = useState<string | null>(null);
  const [showReminderDialog, setShowReminderDialog] = useState(false);
  const [reminderChargeIds, setReminderChargeIds] = useState<string[]>([]);
  const [reminderSelection, setReminderSelection] = useState<Set<string>>(() => new Set());

  /*
    Il sollecito lo governa lo stesso permesso che governa gli incassi, e la
    rotta risponde 403 a chi non ce l'ha. Mostrare un pulsante che apre un
    dialogo e poi fallisce e una promessa non mantenuta.
  */
  const canSendReminders = canManageClubConfigurationAsActor(activeClub?.role);

  /* ---------------------------------------------------------------------- */
  /* La scheda attiva e l'indirizzo                                          */
  /* ---------------------------------------------------------------------- */

  const selectTab = useCallback(
    (next: MovementsTab) => {
      setTab(next);
      const params = new URLSearchParams(searchParams.toString());
      if (next === "prima-nota") params.delete("tab");
      else params.set("tab", next);
      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  useEffect(() => {
    const requested = searchParams.get("tab");
    if (isMovementsTab(requested) && requested !== tab) setTab(requested);
    // Il valore in URL guida la scheda; `tab` cambia per il clic e non deve rieseguire l'effetto.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  /*
    L'azione rapida del guscio («Registra pagamento — rata, importo, metodo»)
    arriva con `?action=new`: e un incasso su una rata, quindi apre la scheda
    delle rate, dove si sceglie la rata e si registra l'incasso.
  */
  useEffect(() => {
    if (searchParams.get("action") !== "new") return;
    const params = new URLSearchParams(searchParams.toString());
    params.delete("action");
    params.set("tab", "rate");
    setTab("rate");
    const frame = window.requestAnimationFrame(() => {
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [pathname, router, searchParams]);

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
   * filtro e quella del cassetto di registrazione. I **saldi** arrivano dal
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
   * passa dalla colonna `clubs`, riservata — l'elenco resta vuoto e il filtro
   * sede non si monta: e esattamente il comportamento di ADR-0038 per chi una
   * sede sola ce l'ha. Nessun numero dipende da questa lettura, quindi il suo
   * fallimento non produce una pagina sbagliata.
   */
  const loadSites = useCallback(async () => {
    if (!activeClubId || !canOpen) return;
    const raw = await getClubData(activeClubId, "club_sites").catch(() => []);
    setSites(normalizeClubSites(raw));
  }, [activeClubId, canOpen]);

  /**
   * Le impostazioni del club, per due cose che non sono numeri: le stagioni
   * del controllo di contesto e i metodi di incasso configurati (che il
   * registro delle rate chiede). Se la lettura non riesce il controllo di
   * contesto non si monta e i metodi restano vuoti — nessun totale ne dipende.
   */
  const loadClubSettings = useCallback(async () => {
    if (!activeClubId || !canOpen) return;
    const club = await getClub(activeClubId).catch(() => null);
    const settings = (club as any)?.settings;
    setSeasons(club ? normalizeClubSeasons(settings).seasons : []);
    setClubPaymentMethodChoices(getClubPaymentMethodChoices(settings));
  }, [activeClubId, canOpen]);

  /**
   * Le rate delle famiglie, e solo quando la scheda si apre.
   *
   * Due letture, non ventidue: le rate e i nomi degli atleti. **Nessun totale
   * nasce da qui**: quanto e incassato su una rata lo dice
   * `readChargeCollectedAmount`, che e il proprietario del calcolo, e lo stato
   * lo deriva `resolveLedgerState` — non si legge da una colonna, che era il
   * difetto di ADR-0036.
   */
  const loadInstallments = useCallback(async () => {
    if (!activeClubId || !canOpen) return;

    setInstallmentsLoading(true);

    const [rows, athletes] = await Promise.all([
      supabase
        .from("payments")
        .select("*")
        .eq("organization_id", activeClubId)
        .then((result: any) => result?.data || [])
        .catch(() => []),
      getClubAthletes(activeClubId, { view: "summary" }).catch(() => []),
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
    void loadClubSettings();
  }, [activeClubId, canOpen, loadAccounts, loadOperationTypes, loadSites, loadClubSettings]);

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
        return false;
      }

      showToast("success", successMessage);
      onDone();
      await reloadAfterWrite();
      return true;
    },
    [reloadAfterWrite, showToast],
  );

  const handleRecord = useCallback(
    (payload: RecordEntryPayload, { keepOpen }: { keepOpen: boolean }) =>
      submit(
        "/api/v1/accounting/entries",
        payload,
        "Movimento registrato",
        () => {
          /* «Salva e aggiungi un altro» tiene il cassetto aperto (guideline 08 §8.8). */
          if (!keepOpen) setShowRecord(false);
        },
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
  /* Filtri: la griglia li mostra, il servizio li applica                    */
  /* ---------------------------------------------------------------------- */

  const applyFilters = useCallback((next: Partial<AccountingFilterState>) => {
    const merged = { ...filtersRef.current, ...next };
    if (sameFilters(filtersRef.current, merged)) return;
    /* Due cambi nello stesso giro (griglia e ricerca) non devono perdersi a vicenda. */
    filtersRef.current = merged;
    /* Cambiare un filtro riporta alla prima pagina: la seconda pagina di un
       elenco diverso non e la seconda pagina di niente. */
    setOffset(0);
    setFilters(merged);
  }, []);

  const handleGridFilters = useCallback(
    (state: FilterState) => applyFilters(gridFiltersToAccounting(state)),
    [applyFilters],
  );

  /*
    La ricerca in griglia scrive `q` nella query del servizio, con un breve
    ritardo: una richiesta per ogni tasto sarebbe la pagina che si disegna
    dieci volte per una parola.
  */
  const [searchDraft, setSearchDraft] = useState("");
  useEffect(() => {
    const handle = window.setTimeout(() => applyFilters({ search: searchDraft.trim() }), 300);
    return () => window.clearTimeout(handle);
  }, [applyFilters, searchDraft]);

  const columns = useMemo(() => buildPrimaNotaColumns(), []);
  const filterDefs = useMemo(
    () => buildPrimaNotaFilters({ accounts, operationTypes, sites }),
    [accounts, operationTypes, sites],
  );
  const rowActions = useMemo(
    () => buildPrimaNotaRowActions({ onReconcile: setToReconcile, onReverse: setToReverse }),
    [],
  );
  const entriesSearch = useMemo(
    () => ({
      placeholder: "Descrizione, controparte, causale, riferimento bancario",
      /* Il predicato non filtra: filtra il servizio, con `q`. */
      match: () => true,
    }),
    [],
  );

  /* ---------------------------------------------------------------------- */
  /* Le rate                                                                 */
  /* ---------------------------------------------------------------------- */

  /**
   * Le rate con il loro stato **derivato**. Una rata gia saldata non si
   * sollecita, e non e una regola di questa pagina: lo stato lo decide il
   * registro degli incassi.
   */
  const installmentRows = useMemo(
    () => toInstallmentRows(installments, athleteNames),
    [installments, athleteNames],
  );

  const remindableIds = useMemo(
    () => new Set(installmentRows.filter(isRemindable).map((row) => row.id)),
    [installmentRows],
  );

  /*
    Solo le rate sollecitabili entrano nella selezione: una selezione che tiene
    una rata saldata, o l'id di una rata sparita dopo una rilettura,
    mostrerebbe un conteggio che non corrisponde a niente.
  */
  const handleReminderSelection = useCallback(
    (next: Set<string>) => {
      setReminderSelection(new Set(Array.from(next).filter((id) => remindableIds.has(id))));
    },
    [remindableIds],
  );
  useEffect(() => {
    setReminderSelection((current) => {
      const pruned = new Set(Array.from(current).filter((id) => remindableIds.has(id)));
      return pruned.size === current.size ? current : pruned;
    });
  }, [remindableIds]);

  const rateBulkActions = useMemo<BulkActionDef<InstallmentRow>[]>(
    () =>
      canSendReminders
        ? [
            {
              id: "remind",
              label: "Sollecita",
              icon: <Mail />,
              onRun: (rows) => {
                setReminderChargeIds(rows.filter(isRemindable).map((row) => row.id));
                setShowReminderDialog(true);
              },
            },
          ]
        : [],
    [canSendReminders],
  );

  const rateRowActions = useMemo<RowActionDef<InstallmentRow>[]>(
    () => [
      {
        id: "ledger",
        label: "Apri il registro incassi",
        icon: <ChevronRight />,
        primary: true,
        hidden: (row) => !row.athleteId,
        onClick: (row) => setOpenLedgerId((current) => (current === row.id ? null : row.id)),
      },
    ],
    [],
  );

  const openLedgerRow = useMemo(
    () => installmentRows.find((row) => row.id === openLedgerId && row.athleteId) || null,
    [installmentRows, openLedgerId],
  );

  /* ---------------------------------------------------------------------- */
  /* Vista                                                                   */
  /* ---------------------------------------------------------------------- */

  if (!canOpen) {
    return (
      <PageShell>
        <PageHeader
          eyebrow="Cassa e amministrazione"
          title="Prima nota"
          description="Registro dei movimenti finanziari della societa."
        />
        <AlertBlock severity="warning" title="La prima nota non e accessibile">
          Il ruolo attivo su questo club non puo vedere la prima nota e il
          riepilogo gestionale. Chiedi al proprietario o al gestore della
          societa di attribuirti il permesso.
        </AlertBlock>
      </PageShell>
    );
  }

  const entriesState = error ? "error" : loading ? "loading" : "ready";

  return (
    <PageShell>
      <PageHeader
        eyebrow="Cassa e amministrazione"
        title="Prima nota"
        description={PAGE_DESCRIPTION}
        context={
          tab === "prima-nota" ? (
            <>
              <FiscalYearContextControl
                value={filters.fiscalYear}
                onChange={(fiscalYear) => applyFilters({ fiscalYear })}
              />
              <SeasonContextControl
                seasons={seasons}
                value={filters.seasonId}
                onChange={(seasonId) => applyFilters({ seasonId })}
              />
            </>
          ) : null
        }
        actions={
          canManage && tab === "prima-nota" ? (
            <>
              <Button variant="secondary" icon={<ArrowLeftRight />} onClick={() => setShowTransfer(true)}>
                Giroconto
              </Button>
              <Button variant="primary" icon={<Plus />} onClick={() => setShowRecord(true)}>
                Registra movimento
              </Button>
            </>
          ) : null
        }
      >
        <SegmentedControl<MovementsTab>
          aria-label="Sezioni della prima nota"
          value={tab}
          onChange={selectTab}
          options={TABS}
          className="max-w-full overflow-x-auto"
        />
      </PageHeader>

      {/* ── Prima nota ─────────────────────────────────────────────────── */}
      <div hidden={tab !== "prima-nota"} className={cn("flex-col gap-[18px]", tab === "prima-nota" ? "flex" : "hidden")}>
        <AccountingSummary
          accounts={accounts}
          report={report}
          loading={reportLoading && !report}
          filtersBeyondSummary={hasReportUnawareFilter(filters)}
        />

        <DataGrid<AccountingLine>
          module="prima-nota"
          aria-label="Registro della prima nota"
          rows={page.entries}
          getRowId={(line) => line.id}
          columns={columns}
          filters={filterDefs}
          views={PRIMA_NOTA_VIEWS}
          search={entriesSearch}
          onFiltersChange={handleGridFilters}
          onQueryChange={setSearchDraft}
          rowActions={rowActions}
          rowLabel={(line) => line.description}
          canSelect={false}
          state={entriesState}
          errorMessage={error ? `La prima nota non e stata letta. ${error}` : null}
          onRetry={() => void reloadAfterWrite()}
          noun={{ singular: "movimento", plural: "movimenti" }}
          totalCount={page.total}
          serverTotal={page.total}
          defaultPageSize={100}
          hideFooter
          footerRow={
            <PrimaNotaPager
              offset={page.offset || 0}
              limit={page.limit || PAGE_SIZE}
              count={page.entries.length}
              total={page.total}
              busy={busy || loading}
              onPageChange={setOffset}
            />
          }
          empty={{
            icon: <ReceiptText />,
            title: "Nessun movimento con questi filtri.",
            description: hasActiveFilters(filters)
              ? "Allarga il periodo o togli un filtro: i totali qui sopra seguono lo stesso perimetro."
              : "Gli incassi delle quote compaiono qui da soli; un fatto di cassa che nessun altro evento ha generato si registra con «Registra movimento».",
          }}
        />
      </div>

      {/*
        Le rate sono **crediti**, non cassa: stanno in una scheda a parte e
        non nella stessa riga di totali della prima nota. Da qui si fanno le
        due cose che appartengono al dominio pagamenti e non hanno altro
        posto: sollecitare, e registrare un incasso sulla rata.
      */}
      <div hidden={tab !== "rate"} className={cn("flex-col gap-[18px]", tab === "rate" ? "flex" : "hidden")}>
        <InfoCard eyebrow="Rate delle famiglie">
          Le rate dovute dalle famiglie. Non sono denaro incassato: lo
          diventano quando un incasso viene registrato, e allora compaiono in
          prima nota come proiezione del loro dominio.
        </InfoCard>

        <DataGrid<InstallmentRow>
          module="rate"
          aria-label="Rate e solleciti"
          rows={installmentRows}
          getRowId={(row) => row.id}
          columns={RATE_COLUMNS}
          filters={RATE_FILTERS}
          views={RATE_VIEWS}
          search={rateSearch}
          defaultSort={{ columnId: "dueDate", direction: "desc" }}
          bulkActions={rateBulkActions}
          selectedIds={reminderSelection}
          onSelectionChange={handleReminderSelection}
          rowActions={rateRowActions}
          rowLabel={(row) => `la rata di ${row.athleteName || "un atleta"}`}
          onOpenRow={(row) => {
            if (row.athleteId) setOpenLedgerId((current) => (current === row.id ? null : row.id));
          }}
          activeRowId={openLedgerId}
          state={installmentsLoading || (!installmentsLoaded && tab === "rate") ? "loading" : "ready"}
          noun={{ singular: "rata", plural: "rate" }}
          empty={{
            icon: <ReceiptText />,
            title: "Nessuna rata registrata per questo club.",
            description: "Le rate nascono dal piano di pagamento dell'iscrizione di ogni atleta.",
          }}
        />

        {/*
          Registrare un incasso su una rata e una scrittura del dominio
          pagamenti, e passa dal suo componente: due modi di registrare lo
          stesso incasso sono due idee di «quanto ha pagato». Il registro si
          apre in pagina, sotto l'elenco, cosi i suoi dialoghi non si
          sovrappongono a un cassetto.
        */}
        {openLedgerRow ? (
          <Panel as="section" data-test="installment-ledger-panel">
            <PanelHeader
              eyebrow="Registro incassi"
              title={openLedgerRow.athleteName || "Atleta"}
              description={openLedgerRow.description || undefined}
              actions={
                <IconButton aria-label="Chiudi il registro incassi" variant="secondary" onClick={() => setOpenLedgerId(null)}>
                  <X />
                </IconButton>
              }
            />
            <AthletePaymentLedger
              key={openLedgerRow.id}
              athleteId={openLedgerRow.athleteId}
              athleteName={openLedgerRow.athleteName || null}
              charges={[openLedgerRow.charge]}
              methodChoices={clubPaymentMethodChoices}
              showTotals={false}
              showHeading={false}
              onLedgerChanged={() => {
                void loadInstallments();
                void reloadAfterWrite();
              }}
            />
          </Panel>
        ) : null}
      </div>

      {/*
        I **previsti** sono impegni futuri: non sono cassa, non sono prima
        nota e non toccano nessun saldo. Stanno in una scheda a parte per la
        stessa ragione per cui ci stanno le rate — «Entrate» con sotto
        «Previste» era il numero che nessuno sapeva piu leggere.

        La scheda si carica da sola e scrive dalle sue rotte: il
        read-modify-write della colonna JSON dal browser, che era il difetto,
        non torna qui dentro.
      */}
      {tab === "previsti" ? <ExpectedEntries clubId={activeClubId} /> : null}

      <PaymentReminderDialog
        open={showReminderDialog}
        onOpenChange={setShowReminderDialog}
        chargeIds={reminderChargeIds}
        onSent={() => {
          setReminderSelection(new Set());
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
