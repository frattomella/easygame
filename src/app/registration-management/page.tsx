"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  CreditCard,
  ExternalLink,
  HandCoins,
  Landmark,
  Pencil,
  Plus,
  Tag,
  Trash2,
  Trophy,
} from "lucide-react";
import { cn } from "@/lib/utils";
import Sidebar from "@/components/dashboard/Sidebar";
import Header from "@/components/dashboard/Header";
import {
  DashboardPageContainer,
  dashboardMainClassName,
} from "@/components/dashboard/dashboard-page-container";
import { useToast } from "@/components/ui/toast-notification";
import { useAuth } from "@/components/providers/AuthProvider";
import { ContextControl, HeaderStat, PageHeader } from "@/components/web/page/PageHeader";
import { AlertBlock } from "@/components/web/page/Alerts";
import { InfoCard } from "@/components/web/page/Cards";
import { Button } from "@/components/web/primitives/Button";
import { SegmentedControl } from "@/components/web/primitives/Controls";
import { PanelHeader } from "@/components/web/primitives/Surface";
import { Menu, MenuContent, MenuItem, MenuLabel, MenuTrigger } from "@/components/web/primitives/Overlays";
import { DataGrid } from "@/components/web/datagrid/DataGrid";
import type { ExportRequest, RowActionDef } from "@/components/web/datagrid/types";
import { useConfirm } from "@/components/web/overlays/useConfirm";
import { FundingProgramsPanel } from "@/components/funding/FundingProgramsPanel";
import {
  addClubData,
  deleteClubDataItem,
  getClubData,
  getClubSettings,
  saveClubSettings,
  updateClubDataItem,
} from "@/lib/simplified-db";
import { canManageClubConfigurationAsActor } from "@/lib/access-roles";
import { normalizeClubSeasons } from "@/lib/club-seasons";
import {
  getAvailableRegistrationPaymentMethods,
  normalizePaymentSettings,
  normalizeClubPaymentMethod,
  serializeClubPaymentMethodsForSettings,
  type ClubPaymentMethodOption,
} from "@/lib/payments/payment-config-utils";
import { PAYMENT_PROVIDER_ORDER, PAYMENT_PROVIDER_REGISTRY } from "@/lib/payments/provider-registry";
import type { ClubPaymentSettings } from "@/lib/payments/payment-types";
import { csvFileName, downloadCsv, toCsv } from "@/lib/csv";
import { PaymentPlanDrawer } from "@/components/registration-management/v2/payment-plan-drawer";
import { PaymentMethodDrawer, type PaymentMethodDraft } from "@/components/registration-management/v2/payment-method-drawer";
import { DiscountDrawer, type DiscountDraft } from "@/components/registration-management/v2/discount-drawer";
import { buildPlanRecord, computePlanPreview, type PaymentPlanDraft, type PlanServiceDraft, type SeasonPeriod } from "@/components/registration-management/v2/plan-form-model";
import {
  DISCOUNT_COLUMNS,
  DISCOUNT_FILTERS,
  DISCOUNT_VIEWS,
  METHOD_COLUMNS,
  METHOD_FILTERS,
  METHOD_VIEWS,
  PLAN_COLUMNS,
  PLAN_FILTERS,
  PLAN_VIEWS,
  PROVIDER_COLUMNS,
  discountSearch,
  methodSearch,
  planSearch,
  toDiscountRows,
  toPlanRows,
  type DiscountRow,
  type MethodRow,
  type PlanRow,
  type ProviderRow,
} from "@/components/registration-management/v2/registration-grids";

/**
 * **Iscrizioni** (Web V2, guideline 09 §9.1 pattern 10 «Dense
 * administration»: intestazione → avviso → griglia con la sua barra di
 * filtri, una scheda per famiglia di configurazione).
 *
 * ---
 *
 * ## Cosa e questa pagina, e cosa non e
 *
 * E la **configurazione economica dell'iscrizione**: i piani di pagamento
 * (i listini che un'iscrizione puo scegliere), i metodi di pagamento manuali
 * e la lettura dei provider online, gli sconti, i programmi di contributo.
 * L'iscrizione del singolo atleta — stato, piano scelto, data inizio, rate —
 * vive nella sua scheda (`/athletes/[id]`, area Amministrazione); l'elenco
 * delle rate del club con i solleciti in `/movements?tab=rate`. La V1 non
 * aveva un elenco per atleta e questa pagina non ne inventa uno
 * (`docs/redesign/audit/wave-d-iscrizioni.md`).
 *
 * ## Cosa questa pagina non fa piu
 *
 * Portava con se **una scheda intera irraggiungibile**: i kit di
 * abbigliamento e la loro assegnazione, con quattro letture (`athletes`,
 * `categories`, `clothing_kits`, `kit_assignments`) e due dialoghi da
 * settecento righe che nessuna `TabsTrigger` apriva. La stessa funzione vive
 * per intero in `/clothing`. Qui non c'e piu.
 *
 * Dopo una modifica o una cancellazione rimetteva in stato **la colonna
 * intera** restituita dalla scrittura, non filtrata per stagione: i piani e
 * gli sconti delle altre annate comparivano fino al reload. Adesso ogni
 * scrittura e seguita da una rilettura con la stessa funzione che legge
 * all'apertura (`getClubData`, che filtra sulla stagione attiva).
 *
 * ## Il permesso che chiude
 *
 * Piani, sconti e metodi manuali passano tutti dalla risorsa `clubs`
 * (`GET/PATCH /api/v1/clubs?fields=…`), riservata a proprietario e gestore
 * canonici. La V1 non valutava nessun predicato: `getClubData` inghiotte il
 * 403 e una segreteria apriva la pagina, la trovava vuota e vedeva fallire
 * ogni salvataggio con un toast generico. Il predicato client che coincide
 * con quel perimetro e quello che la pagina gia usava per i contributi,
 * `canManageClubConfigurationAsActor`: chi non lo passa legge perche, e non
 * vede pulsanti che poi falliscono. I contributi restano leggibili con il
 * gettone di sempre (`accounting.read`) e scrivibili con `funding.manage`,
 * dentro il loro componente condiviso.
 *
 * ## Cosa non c'e, e non per dimenticanza
 *
 * **Nessun controllo per cambiare stagione**: piani e sconti seguono la
 * stagione attiva del club (`SEASON_SCOPED_DATA_TYPES`), che si cambia in
 * Organizzazione › Stagioni. Il controllo di contesto lo dice e ci porta.
 */

type RegistrationTab = "piani" | "metodi" | "sconti" | "contributi";

const TABS: { value: RegistrationTab; label: string }[] = [
  { value: "piani", label: "Piani e listini" },
  { value: "metodi", label: "Metodi di pagamento" },
  { value: "sconti", label: "Sconti e promozioni" },
  { value: "contributi", label: "Contributi e bandi" },
];

const isRegistrationTab = (value: unknown): value is RegistrationTab =>
  TABS.some((tab) => tab.value === value);

const PAGE_DESCRIPTION =
  "Configura piani, metodi di pagamento, sconti e programmi di contributo che un'iscrizione puo usare.";

const PageShell = ({ children }: { children: React.ReactNode }) => (
  <div className="flex h-[100dvh] bg-egw-page">
    <Sidebar />
    <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
      <Header title="Iscrizioni" />
      <main className={dashboardMainClassName}>
        <DashboardPageContainer>{children}</DashboardPageContainer>
      </main>
    </div>
  </div>
);

/** Il CSV di una griglia: le colonne visibili con il loro `exportValue`. */
const exportGridCsv = <Row,>(request: ExportRequest<Row>, name: string) => {
  const columns = request.columns.map((column) => ({
    key: column.id,
    label: column.label || (typeof column.header === "string" ? column.header : column.id),
  }));
  const rows = request.rows.map((row) =>
    Object.fromEntries(
      request.columns.map((column) => {
        const value = column.exportValue?.(row) ?? column.sortValue?.(row);
        return [column.id, value ?? ""];
      }),
    ),
  );
  downloadCsv(csvFileName(name), toCsv(columns, rows));
};

export default function RegistrationManagementPage() {
  const { showToast } = useToast();
  const { activeClub, user } = useAuth();
  const router = useRouter();
  const pathname = usePathname() || "/registration-management";
  const rawSearchParams = useSearchParams();
  const searchParams = useMemo(() => rawSearchParams ?? new URLSearchParams(), [rawSearchParams]);
  const activeClubId = activeClub?.id || null;
  const [confirm, confirmDialog] = useConfirm();

  /*
    Un predicato solo, ed e lo stesso che la pagina usava gia per i
    contributi: coincide con il perimetro della risorsa `clubs` da cui
    piani, sconti e metodi si leggono e si scrivono.
  */
  const canConfigure = canManageClubConfigurationAsActor(activeClub?.role);

  const [loading, setLoading] = useState(true);
  const [paymentPlans, setPaymentPlans] = useState<any[]>([]);
  const [discounts, setDiscounts] = useState<any[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<ClubPaymentMethodOption[]>([]);
  const [clubPaymentSettings, setClubPaymentSettings] = useState<ClubPaymentSettings>(() =>
    normalizePaymentSettings(null),
  );
  const [seasonPeriod, setSeasonPeriod] = useState<SeasonPeriod | null>(null);
  const [seasonLabel, setSeasonLabel] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [planDrawer, setPlanDrawer] = useState<{ open: boolean; plan: Record<string, any> | null }>({ open: false, plan: null });
  const [methodDrawer, setMethodDrawer] = useState<{ open: boolean; method: ClubPaymentMethodOption | null }>({ open: false, method: null });
  const [discountDrawer, setDiscountDrawer] = useState<{ open: boolean; discount: Record<string, any> | null }>({ open: false, discount: null });

  /* ---------------------------------------------------------------------- */
  /* La scheda attiva e l'indirizzo                                          */
  /* ---------------------------------------------------------------------- */

  const [tab, setTab] = useState<RegistrationTab>(() => {
    const requested = searchParams.get("tab");
    return isRegistrationTab(requested) ? requested : "piani";
  });

  const selectTab = useCallback(
    (next: RegistrationTab) => {
      setTab(next);
      const params = new URLSearchParams(searchParams.toString());
      if (next === "piani") params.delete("tab");
      else params.set("tab", next);
      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  useEffect(() => {
    const requested = searchParams.get("tab");
    if (isRegistrationTab(requested) && requested !== tab) setTab(requested);
    // Il valore in URL guida la scheda; `tab` cambia per il clic e non deve rieseguire l'effetto.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  /*
    `?action=new` apre il modulo di creazione della scheda corrente (piano,
    metodo o sconto), come fanno le altre pagine con le azioni rapide.
  */
  useEffect(() => {
    if (searchParams.get("action") !== "new" || !canConfigure) return;
    const params = new URLSearchParams(searchParams.toString());
    params.delete("action");
    const requested = params.get("tab");
    const target: RegistrationTab = isRegistrationTab(requested) ? requested : "piani";
    if (target === "piani") setPlanDrawer({ open: true, plan: null });
    else if (target === "metodi") setMethodDrawer({ open: true, method: null });
    else if (target === "sconti") setDiscountDrawer({ open: true, discount: null });
    const query = params.toString();
    const frame = window.requestAnimationFrame(() => {
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [canConfigure, pathname, router, searchParams]);

  /* ---------------------------------------------------------------------- */
  /* Letture                                                                 */
  /* ---------------------------------------------------------------------- */

  /** I piani della stagione attiva: la stessa lettura dopo ogni scrittura. */
  const loadPlans = useCallback(async () => {
    if (!activeClubId) return;
    const plansData = await getClubData(activeClubId, "payment_plans").catch(() => []);
    setPaymentPlans(Array.isArray(plansData) ? plansData : []);
  }, [activeClubId]);

  const loadDiscounts = useCallback(async () => {
    if (!activeClubId) return;
    const discountsData = await getClubData(activeClubId, "discounts").catch(() => []);
    setDiscounts(Array.isArray(discountsData) ? discountsData : []);
  }, [activeClubId]);

  /**
   * Le impostazioni del club: i metodi manuali, i provider online e il
   * periodo della stagione attiva, che e il ripiego del pro-rata quando il
   * piano non ne dichiara uno (mostrarlo evita di far riscrivere due date
   * che il club ha gia dichiarato altrove).
   */
  const loadSettings = useCallback(async () => {
    if (!activeClubId) return;
    try {
      const clubSettings = await getClubSettings(activeClubId);
      setClubPaymentSettings(normalizePaymentSettings(clubSettings?.paymentSettings));
      const { activeSeason } = normalizeClubSeasons(clubSettings || {});
      setSeasonPeriod(
        activeSeason?.startDate && activeSeason?.endDate
          ? { startDate: activeSeason.startDate, endDate: activeSeason.endDate }
          : null,
      );
      setSeasonLabel(activeSeason?.label || null);
      const settingsMethods = Array.isArray(clubSettings?.paymentMethods)
        ? clubSettings.paymentMethods.map(normalizeClubPaymentMethod)
        : [];
      setPaymentMethods(settingsMethods);
    } catch {
      setClubPaymentSettings(normalizePaymentSettings(null));
      setPaymentMethods([]);
    }
  }, [activeClubId]);

  useEffect(() => {
    if (!activeClubId || !user || !canConfigure) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void Promise.all([loadPlans(), loadSettings(), loadDiscounts()])
      .catch(() => {
        if (!cancelled) showToast("error", "Errore nel caricamento dei dati");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeClubId, user, canConfigure, loadPlans, loadSettings, loadDiscounts, showToast]);

  /* ---------------------------------------------------------------------- */
  /* Scritture                                                               */
  /* ---------------------------------------------------------------------- */

  const savePlan = useCallback(
    async (draft: PaymentPlanDraft, validServices: PlanServiceDraft[]) => {
      if (!activeClubId) {
        showToast("error", "Club non trovato");
        return false;
      }
      const editing = planDrawer.plan;
      const { currentPlanTotal, displayedInstallmentAmount } = computePlanPreview(draft, seasonPeriod);
      const planToSave = buildPlanRecord({ draft, validServices, editing, currentPlanTotal, displayedInstallmentAmount });
      setSaving(true);
      try {
        if (editing) {
          await updateClubDataItem(activeClubId, "payment_plans", editing.id, planToSave);
          await loadPlans();
          showToast("success", "Piano di pagamento aggiornato con successo");
        } else {
          await addClubData(activeClubId, "payment_plans", planToSave);
          await loadPlans();
          showToast("success", "Nuovo piano di pagamento aggiunto con successo");
        }
        return true;
      } catch (error: any) {
        console.warn("Error saving payment plan:", error?.message || error);
        showToast("error", "Errore nel salvataggio del piano di pagamento");
        return false;
      } finally {
        setSaving(false);
      }
    },
    [activeClubId, loadPlans, planDrawer.plan, seasonPeriod, showToast],
  );

  const deletePlan = useCallback(
    async (row: PlanRow) => {
      if (!activeClubId) {
        showToast("error", "Club non trovato");
        return;
      }
      const ok = await confirm({
        tone: "danger",
        title: `Eliminare il piano «${row.plan.name}»?`,
        description: "Il piano non sara piu proponibile a nessuna iscrizione.",
        consequences: [
          "Le iscrizioni che lo hanno gia scelto smettono di trovarlo.",
          "Le rate gia generate per gli atleti non vengono toccate.",
        ],
        confirmLabel: "Elimina piano",
      });
      if (!ok) return;
      try {
        await deleteClubDataItem(activeClubId, "payment_plans", row.id);
        await loadPlans();
        showToast("success", "Piano di pagamento eliminato con successo");
      } catch (error) {
        console.error("Error deleting payment plan:", error);
        showToast("error", "Errore nell'eliminazione del piano di pagamento");
      }
    },
    [activeClubId, confirm, loadPlans, showToast],
  );

  const persistPaymentMethods = useCallback(
    async (methods: ClubPaymentMethodOption[]) => {
      if (!activeClubId) throw new Error("Club non trovato");
      const normalizedMethods = methods.map(normalizeClubPaymentMethod);
      await saveClubSettings(activeClubId, {
        paymentMethods: serializeClubPaymentMethodsForSettings(normalizedMethods),
      });
      return normalizedMethods;
    },
    [activeClubId],
  );

  const saveMethod = useCallback(
    async (draft: PaymentMethodDraft) => {
      if (!activeClubId) {
        showToast("error", "Club non trovato");
        return false;
      }
      const editing = methodDrawer.method;
      setSaving(true);
      try {
        const normalizedMethod = normalizeClubPaymentMethod({
          ...draft,
          id:
            editing?.id ||
            (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `method_${Date.now()}`),
        });
        const nextMethods = editing
          ? paymentMethods.map((method) => (method.id === editing.id ? normalizedMethod : method))
          : [...paymentMethods, normalizedMethod];
        const persisted = await persistPaymentMethods(nextMethods);
        setPaymentMethods(persisted);
        showToast(
          "success",
          editing ? "Metodo di pagamento aggiornato con successo" : "Nuovo metodo di pagamento aggiunto con successo",
        );
        return true;
      } catch (error) {
        console.error("Error saving payment method:", error);
        showToast("error", "Errore nel salvataggio del metodo di pagamento");
        return false;
      } finally {
        setSaving(false);
      }
    },
    [activeClubId, methodDrawer.method, paymentMethods, persistPaymentMethods, showToast],
  );

  const deleteMethod = useCallback(
    async (row: MethodRow) => {
      if (!activeClubId) {
        showToast("error", "Club non trovato");
        return;
      }
      const ok = await confirm({
        tone: "danger",
        title: `Eliminare il metodo «${row.name}»?`,
        description: "Il metodo sparisce dalle scelte di «Registra pagamento».",
        consequences: ["Gli incassi gia registrati con questo metodo conservano la loro etichetta."],
        confirmLabel: "Elimina metodo",
      });
      if (!ok) return;
      try {
        const persisted = await persistPaymentMethods(paymentMethods.filter((method) => method.id !== row.id));
        setPaymentMethods(persisted);
        showToast("success", "Metodo di pagamento eliminato con successo");
      } catch (error) {
        console.error("Error deleting payment method:", error);
        showToast("error", "Errore nell'eliminazione del metodo di pagamento");
      }
    },
    [activeClubId, confirm, paymentMethods, persistPaymentMethods, showToast],
  );

  const saveDiscount = useCallback(
    async (draft: DiscountDraft) => {
      if (!activeClubId) {
        showToast("error", "Club non trovato");
        return false;
      }
      const editing = discountDrawer.discount;
      setSaving(true);
      try {
        const discountToSave = {
          ...draft,
          id: editing?.id || `discount_${Date.now()}`,
          createdAt: editing?.createdAt || new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        if (editing) {
          await updateClubDataItem(activeClubId, "discounts", editing.id, discountToSave);
          await loadDiscounts();
          showToast("success", "Sconto aggiornato con successo");
        } else {
          await addClubData(activeClubId, "discounts", discountToSave);
          await loadDiscounts();
          showToast("success", "Sconto aggiunto con successo");
        }
        return true;
      } catch (error) {
        console.error("Error saving discount:", error);
        showToast("error", "Errore nel salvataggio dello sconto");
        return false;
      } finally {
        setSaving(false);
      }
    },
    [activeClubId, discountDrawer.discount, loadDiscounts, showToast],
  );

  const deleteDiscount = useCallback(
    async (row: DiscountRow) => {
      if (!activeClubId) {
        showToast("error", "Club non trovato");
        return;
      }
      const ok = await confirm({
        tone: "danger",
        title: `Eliminare lo sconto «${row.title}»?`,
        description: "Lo sconto non sara piu applicabile a nessun piano.",
        consequences: ["Le iscrizioni che lo hanno gia applicato smettono di trovarlo."],
        confirmLabel: "Elimina sconto",
      });
      if (!ok) return;
      try {
        await deleteClubDataItem(activeClubId, "discounts", row.id);
        await loadDiscounts();
        showToast("success", "Sconto eliminato con successo");
      } catch (error) {
        console.error("Error deleting discount:", error);
        showToast("error", "Errore nell'eliminazione dello sconto");
      }
    },
    [activeClubId, confirm, loadDiscounts, showToast],
  );

  /* ---------------------------------------------------------------------- */
  /* Le righe e le azioni                                                    */
  /* ---------------------------------------------------------------------- */

  const planRows = useMemo(() => toPlanRows(paymentPlans), [paymentPlans]);
  const discountRows = useMemo(() => toDiscountRows(discounts), [discounts]);
  const onlineRegistrationMethods = useMemo(
    () => getAvailableRegistrationPaymentMethods(clubPaymentSettings),
    [clubPaymentSettings],
  );
  const providerRows = useMemo<ProviderRow[]>(
    () =>
      PAYMENT_PROVIDER_ORDER.map((provider) => ({
        id: provider,
        definition: PAYMENT_PROVIDER_REGISTRY[provider],
        config: clubPaymentSettings.providers[provider],
        available: onlineRegistrationMethods.some((method) => method.provider === provider),
      })),
    [clubPaymentSettings, onlineRegistrationMethods],
  );

  const activePlans = planRows.filter((row) => row.plan.active).length;
  const activeMethods = paymentMethods.filter((method) => method.active).length;
  const activeDiscounts = discountRows.filter((row) => row.active).length;

  const planRowActions = useMemo<RowActionDef<PlanRow>[]>(
    () =>
      canConfigure
        ? [
            { id: "edit", label: "Modifica piano", icon: <Pencil />, primary: true, onClick: (row) => setPlanDrawer({ open: true, plan: row.raw }) },
            { id: "delete", label: "Elimina piano", icon: <Trash2 />, tone: "danger", onClick: (row) => void deletePlan(row) },
          ]
        : [],
    [canConfigure, deletePlan],
  );

  const methodRowActions = useMemo<RowActionDef<MethodRow>[]>(
    () =>
      canConfigure
        ? [
            { id: "edit", label: "Modifica metodo", icon: <Pencil />, primary: true, onClick: (row) => setMethodDrawer({ open: true, method: row }) },
            { id: "delete", label: "Elimina metodo", icon: <Trash2 />, tone: "danger", onClick: (row) => void deleteMethod(row) },
          ]
        : [],
    [canConfigure, deleteMethod],
  );

  const discountRowActions = useMemo<RowActionDef<DiscountRow>[]>(
    () =>
      canConfigure
        ? [
            { id: "edit", label: "Modifica sconto", icon: <Pencil />, primary: true, onClick: (row) => setDiscountDrawer({ open: true, discount: row.raw }) },
            { id: "delete", label: "Elimina sconto", icon: <Trash2 />, tone: "danger", onClick: (row) => void deleteDiscount(row) },
          ]
        : [],
    [canConfigure, deleteDiscount],
  );

  /* ---------------------------------------------------------------------- */
  /* Vista                                                                   */
  /* ---------------------------------------------------------------------- */

  const gridState = !canConfigure ? "restricted" : loading ? "loading" : "ready";

  const primaryAction =
    canConfigure && tab === "piani" ? (
      <Button variant="primary" icon={<Plus />} onClick={() => setPlanDrawer({ open: true, plan: null })}>
        Nuovo piano
      </Button>
    ) : canConfigure && tab === "metodi" ? (
      <Button variant="primary" icon={<Plus />} onClick={() => setMethodDrawer({ open: true, method: null })}>
        Nuovo metodo
      </Button>
    ) : canConfigure && tab === "sconti" ? (
      <Button variant="primary" icon={<Plus />} onClick={() => setDiscountDrawer({ open: true, discount: null })}>
        Nuovo sconto
      </Button>
    ) : null;

  return (
    <PageShell>
      <PageHeader
        eyebrow="Segreteria"
        title="Iscrizioni"
        description={PAGE_DESCRIPTION}
        stats={
          canConfigure ? (
            <>
              <HeaderStat value={activePlans} label="Piani attivi" tone="green" onClick={() => selectTab("piani")} />
              <HeaderStat value={activeMethods} label="Metodi attivi" onClick={() => selectTab("metodi")} />
              <HeaderStat value={onlineRegistrationMethods.length} label="Metodi online" tone={onlineRegistrationMethods.length ? "blue" : "ink"} onClick={() => selectTab("metodi")} />
              <HeaderStat value={activeDiscounts} label="Sconti attivi" onClick={() => selectTab("sconti")} />
            </>
          ) : null
        }
        context={
          seasonLabel ? (
            <Menu>
              <MenuTrigger asChild>
                <ContextControl icon={<Trophy />}>
                  <span className="sr-only">Stagione: </span>
                  {seasonLabel}
                </ContextControl>
              </MenuTrigger>
              <MenuContent align="end" width={260}>
                <MenuLabel>Piani e sconti seguono la stagione attiva</MenuLabel>
                <MenuItem onSelect={() => router.push("/organization?tab=stagioni")}>Gestisci le stagioni</MenuItem>
              </MenuContent>
            </Menu>
          ) : null
        }
        actions={primaryAction}
      >
        <SegmentedControl<RegistrationTab>
          aria-label="Sezioni delle iscrizioni"
          value={tab}
          onChange={selectTab}
          options={TABS}
          className="max-w-full overflow-x-auto"
        />
      </PageHeader>

      {!canConfigure ? (
        <AlertBlock severity="warning" title="Piani, metodi e sconti sono riservati alla direzione" className="mb-[18px]">
          Si leggono e si scrivono con il perimetro del proprietario e del gestore della societa. I contributi e i
          bandi restano leggibili qui sotto.
        </AlertBlock>
      ) : null}

      {/* ── Piani e listini ────────────────────────────────────────────── */}
      <div className={cn("flex-col gap-[18px]", tab === "piani" ? "flex" : "hidden")}>
        <DataGrid<PlanRow>
          module="iscrizioni-piani"
          aria-label="Piani di pagamento"
          rows={planRows}
          getRowId={(row) => row.id}
          columns={PLAN_COLUMNS}
          filters={PLAN_FILTERS}
          views={PLAN_VIEWS}
          search={planSearch}
          defaultSort={{ columnId: "name", direction: "asc" }}
          rowActions={planRowActions}
          rowLabel={(row) => row.plan.name}
          onOpenRow={canConfigure ? (row) => setPlanDrawer({ open: true, plan: row.raw }) : undefined}
          canSelect={false}
          state={gridState}
          noun={{ singular: "piano", plural: "piani" }}
          export={{ onExport: (request) => exportGridCsv(request, "Piani di pagamento"), kinds: ["csv"] }}
          empty={{
            icon: <CreditCard />,
            title: "Nessun piano di pagamento configurato.",
            description: "Un piano e il listino di un'iscrizione: i servizi, il totale, le rate e il pro-rata.",
            primary: canConfigure ? (
              <Button variant="primary" icon={<Plus />} onClick={() => setPlanDrawer({ open: true, plan: null })}>
                Crea il primo piano
              </Button>
            ) : undefined,
          }}
        />
      </div>

      {/* ── Metodi di pagamento ───────────────────────────────────────── */}
      <div className={cn("flex-col gap-[18px]", tab === "metodi" ? "flex" : "hidden")}>
        {/*
          I provider online si configurano in Organizzazione › Pagamenti: qui
          si leggono soltanto. La griglia e la tabella della V1 con le stesse
          quattro colonne; l'intestazione e l'avviso stanno nel suo `banner`,
          perche un pannello dentro un pannello e vietato (§9.3).
        */}
        <DataGrid<ProviderRow>
          module="iscrizioni-provider"
          aria-label="Provider di pagamento online"
          rows={providerRows}
          getRowId={(row) => row.id}
          columns={PROVIDER_COLUMNS}
          canSelect={false}
          persist={false}
          hideViews
          hideFooter
          state={gridState}
          noun={{ singular: "provider", plural: "provider" }}
          banner={
            <div className="px-4 pt-4" data-test="online-payment-methods">
              <PanelHeader
                eyebrow="Metodi online da Organizzazione › Pagamenti"
                title="Provider online"
                description="Le iscrizioni usano solo i provider abilitati, configurati e inclusi dal club."
                actions={
                  <Button variant="secondary" size="sm" icon={<ExternalLink />} onClick={() => router.push("/organization?tab=pagamenti")}>
                    Apri Pagamenti
                  </Button>
                }
              />
              {onlineRegistrationMethods.length === 0 && canConfigure && !loading ? (
                <InfoCard className="mb-4">
                  Nessun metodo di pagamento online configurato. Configura i metodi nella pagina Organizzazione › Pagamenti.
                </InfoCard>
              ) : null}
            </div>
          }
        />

        <DataGrid<MethodRow>
          module="iscrizioni-metodi"
          aria-label="Metodi di pagamento manuali"
          rows={paymentMethods}
          getRowId={(row) => row.id}
          columns={METHOD_COLUMNS}
          filters={METHOD_FILTERS}
          views={METHOD_VIEWS}
          search={methodSearch}
          defaultSort={{ columnId: "name", direction: "asc" }}
          rowActions={methodRowActions}
          rowLabel={(row) => row.name}
          onOpenRow={canConfigure ? (row) => setMethodDrawer({ open: true, method: row }) : undefined}
          canSelect={false}
          state={gridState}
          noun={{ singular: "metodo", plural: "metodi" }}
          export={{ onExport: (request) => exportGridCsv(request, "Metodi di pagamento"), kinds: ["csv"] }}
          empty={{
            icon: <Landmark />,
            title: "Nessun metodo di pagamento configurato.",
            description: "Bonifico, contanti, POS: i metodi manuali che compaiono quando si registra un incasso.",
            primary: canConfigure ? (
              <Button variant="primary" icon={<Plus />} onClick={() => setMethodDrawer({ open: true, method: null })}>
                Crea il primo metodo
              </Button>
            ) : undefined,
          }}
        />
      </div>

      {/* ── Sconti e promozioni ───────────────────────────────────────── */}
      <div className={cn("flex-col gap-[18px]", tab === "sconti" ? "flex" : "hidden")}>
        <DataGrid<DiscountRow>
          module="iscrizioni-sconti"
          aria-label="Sconti e promozioni"
          rows={discountRows}
          getRowId={(row) => row.id}
          columns={DISCOUNT_COLUMNS}
          filters={DISCOUNT_FILTERS}
          views={DISCOUNT_VIEWS}
          search={discountSearch}
          defaultSort={{ columnId: "title", direction: "asc" }}
          rowActions={discountRowActions}
          rowLabel={(row) => row.title}
          onOpenRow={canConfigure ? (row) => setDiscountDrawer({ open: true, discount: row.raw }) : undefined}
          canSelect={false}
          state={gridState}
          noun={{ singular: "sconto", plural: "sconti" }}
          export={{ onExport: (request) => exportGridCsv(request, "Sconti e promozioni"), kinds: ["csv"] }}
          empty={{
            icon: <Tag />,
            title: "Nessuno sconto configurato.",
            description: "Crea il tuo primo sconto o promozione: in percentuale o a importo fisso, applicabile ai piani che scegli.",
            primary: canConfigure ? (
              <Button variant="primary" icon={<Plus />} onClick={() => setDiscountDrawer({ open: true, discount: null })}>
                Crea il primo sconto
              </Button>
            ) : undefined,
          }}
        />
      </div>

      {/*
        I programmi di contributo stanno qui perche sono configurazione
        economica del club, accanto a piani e sconti. Il pannello e un
        componente condiviso con le sue rotte e i suoi permessi
        (`funding.manage`): si compone, non si riscrive.
      */}
      <div className={cn("flex-col gap-[18px]", tab === "contributi" ? "flex" : "hidden")}>
        <InfoCard eyebrow="Voucher e contributi">
          <HandCoins className="mr-1.5 inline h-3.5 w-3.5 align-[-2px]" aria-hidden />
          Un voucher assegnato non e denaro incassato: e una copertura che matura con la frequenza e che
          l&apos;ente liquida. Le regole di ogni bando sono configurazione, non codice.
        </InfoCard>
        <FundingProgramsPanel />
      </div>

      <PaymentPlanDrawer
        open={planDrawer.open}
        onOpenChange={(open) => setPlanDrawer((current) => ({ ...current, open }))}
        plan={planDrawer.plan}
        discounts={discounts}
        seasonPeriod={seasonPeriod}
        saving={saving}
        onSave={savePlan}
      />

      <PaymentMethodDrawer
        open={methodDrawer.open}
        onOpenChange={(open) => setMethodDrawer((current) => ({ ...current, open }))}
        method={methodDrawer.method}
        saving={saving}
        onSave={saveMethod}
      />

      <DiscountDrawer
        open={discountDrawer.open}
        onOpenChange={(open) => setDiscountDrawer((current) => ({ ...current, open }))}
        discount={discountDrawer.discount}
        saving={saving}
        onSave={saveDiscount}
      />

      {confirmDialog}
    </PageShell>
  );
}
