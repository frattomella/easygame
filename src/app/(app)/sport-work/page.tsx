"use client";

import * as React from "react";
import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, CalendarClock, FileWarning, Receipt, RefreshCw, TrendingDown, Users, Wallet } from "lucide-react";
import { useToast } from "@/components/ui/toast-notification";
import { apiRequest } from "@/lib/api/client";
import { Button } from "@/components/web/primitives/Button";
import { Eyebrow } from "@/components/web/primitives/Surface";
import { StatusPill } from "@/components/web/primitives/StatusPill";
import { KpiBar, KpiCard, InfoCard } from "@/components/web/page/Cards";
import { DataGrid } from "@/components/web/datagrid/DataGrid";
import type { ColumnDef } from "@/components/web/datagrid/types";
import { formatDateShort, formatInteger, formatMoney, joinMeta } from "@/lib/web/format";
import { SportWorkShell } from "@/components/sport-work/v2/sport-work-shell";
import { useSportWorkRole } from "@/components/sport-work/v2/use-sport-work-role";
import { OBLIGATION_STATUS_SPEC, specOf } from "@/components/sport-work/v2/sport-work-status";
import { dueLabel, monthLabel, obligationKindLabel, withClubId, type ObligationRow } from "@/components/sport-work/v2/sport-work-model";

/**
 * `/sport-work` — il cruscotto del lavoro sportivo (Web V2, pattern 4:
 * intestazione + righe di KPI + un pannello di elenco).
 *
 * **Tre colonne per il denaro del mese, non una.** Programmato, maturato e
 * pagato sono tre grandezze diverse: quanto il piano prevede, quanto e
 * diventato dovuto, quanto e uscito davvero. Sotto, cio che richiede
 * un'azione — scaduti, contratti in scadenza, autocertificazioni mancanti —
 * e ogni conteggio porta alla pagina che lo risolve (guideline 10 §10.5.14).
 *
 * I dati e le scritture sono quelli della V1: `GET /api/v1/sport-work/dashboard`,
 * `GET /api/v1/sport-work/obligations?status=DUE`, `POST /api/v1/sport-work/scheduler`.
 */
type Dashboard = {
  organizationId: string;
  month: string;
  year: number;
  scheduledThisMonth: number;
  accruedThisMonth: number;
  paidThisMonth: number;
  clubCostThisMonth: number;
  toPayTotal: number;
  overdueTotal: number;
  overdueCount: number;
  activeRelationships: number;
  expiringContracts: number;
  missingDeclarations: number;
  upcomingObligations: number;
  overdueObligations: number;
  paidThisYear: number;
  employeeContributionThisYear: number;
  employerContributionThisYear: number;
  peopleOverSocialThreshold: number;
  peopleOverFiscalThreshold: number;
};

function SportWorkDashboardPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { showToast } = useToast();
  const { canManage } = useSportWorkRole();
  const clubId = searchParams?.get("clubId") || null;

  const [dashboard, setDashboard] = React.useState<Dashboard | null>(null);
  const [obligations, setObligations] = React.useState<ObligationRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [syncing, setSyncing] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    const [dashboardResult, obligationsResult] = await Promise.all([
      apiRequest<Dashboard>("/api/v1/sport-work/dashboard"),
      apiRequest<ObligationRow[]>("/api/v1/sport-work/obligations?status=DUE"),
    ]);
    setLoading(false);
    if (dashboardResult.error) {
      const message = dashboardResult.error.message || "Errore nella lettura del cruscotto";
      setLoadError(message);
      showToast("error", message);
      return;
    }
    setLoadError(null);
    setDashboard(dashboardResult.data);
    setObligations(Array.isArray(obligationsResult.data) ? obligationsResult.data : []);
  }, [showToast]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const handleSync = async () => {
    setSyncing(true);
    const { data, error } = await apiRequest<any>("/api/v1/sport-work/scheduler", { method: "POST" });
    setSyncing(false);
    if (error) {
      showToast("error", error.message || "Aggiornamento non riuscito");
      return;
    }
    showToast("success", `Agenda aggiornata: ${data?.obligations?.created ?? 0} adempimenti nuovi, ${data?.notifications ?? 0} avvisi.`);
    await load();
  };

  const prossimi = React.useMemo(
    () => [...obligations].sort((left, right) => String(left.due_date).localeCompare(String(right.due_date))).slice(0, 8),
    [obligations],
  );

  const columns = React.useMemo<ColumnDef<ObligationRow>[]>(
    () => [
      {
        id: "title",
        header: "Adempimento",
        kind: "identity",
        locked: true,
        cell: (row) => (
          <div className="min-w-0">
            <span className="egw-ellipsis block font-brand text-[12.5px] font-semibold text-egw-ink">{row.title}</span>
            <span className="egw-ellipsis block font-brand text-[10px] text-egw-ink-62">{joinMeta(obligationKindLabel(row.kind), dueLabel(row.due_date))}</span>
          </div>
        ),
        sortValue: (row) => row.title,
        title: (row) => row.title,
      },
      { id: "due", header: "Scadenza", kind: "date", cell: (row) => formatDateShort(row.due_date), sortValue: (row) => row.due_date },
      { id: "amount", header: "Importo", kind: "amount", cell: (row) => (row.amount ? formatMoney(row.amount) : null), sortValue: (row) => row.amount ?? null },
      { id: "status", header: "Stato", kind: "status", cell: (row) => <StatusPill status={specOf(OBLIGATION_STATUS_SPEC, row.status)} />, sortValue: (row) => row.status },
    ],
    [],
  );

  const gridState = loading ? "loading" : loadError ? "error" : "ready";

  return (
    <SportWorkShell
      title="Lavoro sportivo"
      description="Rapporti, compensi, contributi e adempimenti. EasyGame calcola e prepara i dati; versare e trasmettere restano di chi ne ha la responsabilità."
      actions={
        canManage ? (
          <Button variant="secondary" icon={<RefreshCw />} onClick={() => void handleSync()} loading={syncing}>
            Aggiorna maturato e agenda
          </Button>
        ) : null
      }
    >
      <div className="flex flex-col gap-6">
        <section aria-labelledby="sw-mese" className="flex flex-col gap-3">
          <Eyebrow as="h2" id="sw-mese">
            {dashboard ? monthLabel(dashboard.month) : "Questo mese"}
          </Eyebrow>
          <KpiBar>
            <KpiCard label="Programmato" value={dashboard ? formatMoney(dashboard.scheduledThisMonth) : null} qualifier="Quanto il piano prevede in scadenza questo mese" icon={<CalendarClock />} loading={loading} />
            <KpiCard label="Maturato" value={dashboard ? formatMoney(dashboard.accruedThisMonth) : null} qualifier="Periodo trascorso: dovuto, non ancora erogato" icon={<Receipt />} loading={loading} />
            <KpiCard label="Pagato" value={dashboard ? formatMoney(dashboard.paidThisMonth) : null} qualifier="Denaro uscito davvero" icon={<Wallet />} iconTone="green" loading={loading} />
            <KpiCard label="Costo per il club" value={dashboard ? formatMoney(dashboard.clubCostThisMonth) : null} qualifier="Lordo più la quota contributiva della società" icon={<TrendingDown />} loading={loading} />
          </KpiBar>
        </section>

        <section aria-labelledby="sw-attenzione" className="flex flex-col gap-3">
          <Eyebrow as="h2" id="sw-attenzione">
            Cosa richiede attenzione
          </Eyebrow>
          <KpiBar>
            <KpiCard
              label="Da pagare"
              value={dashboard ? formatMoney(dashboard.toPayTotal) : null}
              qualifier="Residuo di tutte le scadenze aperte"
              href={withClubId("/sport-work/deadlines", clubId)}
              loading={loading}
            />
            <KpiCard
              label="Scaduti"
              value={dashboard ? formatMoney(dashboard.overdueTotal) : null}
              qualifier={dashboard ? `${formatInteger(dashboard.overdueCount)} scadenze oltre il termine` : null}
              icon={<AlertTriangle />}
              iconTone={dashboard && dashboard.overdueCount > 0 ? "red" : "neutral"}
              href={withClubId("/sport-work/deadlines?view=overdue", clubId)}
              loading={loading}
              ariaLabel={dashboard ? `${dashboard.overdueCount} scadenze oltre il termine` : undefined}
            />
            <KpiCard
              label="Contratti in scadenza"
              value={dashboard ? formatInteger(dashboard.expiringContracts) : null}
              qualifier="Da rinnovare o cessare"
              iconTone={dashboard && dashboard.expiringContracts > 0 ? "amber" : "neutral"}
              icon={<CalendarClock />}
              href={withClubId("/sport-work/relationships?view=expiring", clubId)}
              loading={loading}
            />
            <KpiCard
              label="Autocertificazioni mancanti"
              value={dashboard ? formatInteger(dashboard.missingDeclarations) : null}
              qualifier="Senza, il progressivo verso le soglie è parziale"
              icon={<FileWarning />}
              iconTone={dashboard && dashboard.missingDeclarations > 0 ? "amber" : "neutral"}
              href={withClubId("/sport-work/obligations?view=self-declaration", clubId)}
              loading={loading}
            />
          </KpiBar>
        </section>

        <section aria-labelledby="sw-anno" className="flex flex-col gap-3">
          <Eyebrow as="h2" id="sw-anno">
            {dashboard ? `Anno ${dashboard.year}` : "Anno"}
          </Eyebrow>
          <KpiBar>
            <KpiCard
              label="Compensi erogati"
              value={dashboard ? formatMoney(dashboard.paidThisYear) : null}
              qualifier={dashboard ? `${formatInteger(dashboard.activeRelationships)} rapporti attivi` : null}
              icon={<Users />}
              href={withClubId("/sport-work/relationships", clubId)}
              loading={loading}
            />
            <KpiCard label="Contributi lavoratore" value={dashboard ? formatMoney(dashboard.employeeContributionThisYear) : null} qualifier="Trattenuti sulle erogazioni" loading={loading} />
            <KpiCard label="Contributi club" value={dashboard ? formatMoney(dashboard.employerContributionThisYear) : null} qualifier="A carico della società" loading={loading} />
            <KpiCard
              label="Oltre le soglie"
              value={dashboard ? `${formatInteger(dashboard.peopleOverSocialThreshold)} / ${formatInteger(dashboard.peopleOverFiscalThreshold)}` : null}
              qualifier="Persone oltre i 5.000 previdenziali / i 15.000 fiscali"
              iconTone={dashboard && dashboard.peopleOverFiscalThreshold > 0 ? "amber" : "neutral"}
              icon={<AlertTriangle />}
              loading={loading}
            />
          </KpiBar>
        </section>

        <section aria-labelledby="sw-adempimenti" className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Eyebrow as="h2" id="sw-adempimenti">
              Adempimenti prossimi
            </Eyebrow>
            <Button variant="text" size="sm" onClick={() => router.push(withClubId("/sport-work/obligations", clubId))}>
              Vedi tutti
            </Button>
          </div>
          <InfoCard eyebrow="Cosa fa EasyGame">
            EasyGame prepara i dati dell&apos;adempimento. Non lo trasmette: al RASD, a UNILAV, all&apos;INPS e all&apos;Agenzia delle Entrate ci va una persona.
          </InfoCard>
          <DataGrid<ObligationRow>
            module="sport-work-dashboard"
            aria-label="Adempimenti prossimi"
            rows={prossimi}
            getRowId={(row) => row.id}
            rowLabel={(row) => row.title}
            columns={columns}
            defaultSort={{ columnId: "due", direction: "asc" }}
            state={gridState}
            errorMessage={loadError}
            onRetry={() => void load()}
            noun={{ singular: "adempimento", plural: "adempimenti" }}
            hideViews
            hideFooter
            persist={false}
            canSelect={false}
            onOpenRow={() => router.push(withClubId("/sport-work/obligations", clubId))}
            empty={{ title: "Nessun adempimento in attesa", description: "Quando un contributo, una comunicazione o una scadenza diventa dovuta, compare qui." }}
          />
          {!loading && !dashboard && !loadError ? <InfoCard>Nessun dato disponibile per questa società.</InfoCard> : null}
        </section>
      </div>
    </SportWorkShell>
  );
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <SportWorkDashboardPage />
    </Suspense>
  );
}

