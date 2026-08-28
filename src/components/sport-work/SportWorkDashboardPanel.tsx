"use client";

import React from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CalendarClock,
  FileWarning,
  Receipt,
  TrendingDown,
  Users,
  Wallet,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast-notification";
import { apiRequest } from "@/lib/api/client";
import { SportWorkStat } from "./SportWorkShell";
import {
  dueLabel,
  formatCurrency,
  formatDate,
  obligationKindLabel,
  obligationStatusBadge,
  statusBadgeOf,
} from "./sport-work-format";

/**
 * Il cruscotto «Lavoro sportivo».
 *
 * **Tre colonne per il denaro del mese, non una.** Programmato, maturato e
 * pagato sono tre grandezze diverse: quanto il piano prevede, quanto e
 * diventato dovuto, quanto e uscito davvero. Un cruscotto che ne mostrasse una
 * sola costringerebbe chi legge a indovinare quale sta guardando — ed e
 * esattamente l'ambiguita che questo dominio esiste per chiudere.
 *
 * Sotto, cio che richiede un'azione: scaduti, contratti in scadenza,
 * autocertificazioni mancanti, adempimenti vicini. Un cruscotto che mostra
 * solo totali si guarda una volta e poi non si apre piu.
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

const MONTH_NAMES = [
  "gennaio",
  "febbraio",
  "marzo",
  "aprile",
  "maggio",
  "giugno",
  "luglio",
  "agosto",
  "settembre",
  "ottobre",
  "novembre",
  "dicembre",
];

const monthLabel = (month: string) => {
  const [year, index] = String(month || "").split("-");
  const position = Number(index) - 1;
  return MONTH_NAMES[position] ? `${MONTH_NAMES[position]} ${year}` : month;
};

export function SportWorkDashboardPanel({ clubId }: { clubId: string | null }) {
  const { showToast } = useToast();
  const [dashboard, setDashboard] = React.useState<Dashboard | null>(null);
  const [obligations, setObligations] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [syncing, setSyncing] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    const [dashboardResult, obligationsResult] = await Promise.all([
      apiRequest<Dashboard>("/api/v1/sport-work/dashboard"),
      apiRequest<any[]>("/api/v1/sport-work/obligations?status=DUE"),
    ]);
    setLoading(false);

    if (dashboardResult.error) {
      showToast(
        "error",
        dashboardResult.error.message || "Errore nella lettura del cruscotto",
      );
      return;
    }

    setDashboard(dashboardResult.data);
    setObligations(
      Array.isArray(obligationsResult.data) ? obligationsResult.data : [],
    );
  }, [showToast]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const handleSync = async () => {
    setSyncing(true);
    const { data, error } = await apiRequest<any>(
      "/api/v1/sport-work/scheduler",
      { method: "POST" },
    );
    setSyncing(false);

    if (error) {
      showToast("error", error.message || "Aggiornamento non riuscito");
      return;
    }

    showToast(
      "success",
      `Agenda aggiornata: ${data?.obligations?.created ?? 0} adempimenti nuovi, ${
        data?.notifications ?? 0
      } avvisi.`,
    );
    await load();
  };

  const withClub = (href: string) =>
    clubId ? `${href}?clubId=${encodeURIComponent(clubId)}` : href;

  if (loading) {
    return <p className="text-sm text-muted-foreground">Caricamento…</p>;
  }

  if (!dashboard) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">
          Nessun dato disponibile per questa societa.
        </CardContent>
      </Card>
    );
  }

  const prossimi = [...obligations]
    .sort((left, right) =>
      String(left.due_date).localeCompare(String(right.due_date)),
    )
    .slice(0, 8);

  return (
    <div className="space-y-6">
      <section aria-labelledby="mese" className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="mese" className="text-lg font-semibold">
            {monthLabel(dashboard.month)}
          </h2>
          <Button
            variant="outline"
            size="sm"
            onClick={handleSync}
            disabled={syncing}
          >
            {syncing ? "Aggiornamento…" : "Aggiorna maturato e agenda"}
          </Button>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <SportWorkStat
            label="Programmato"
            value={formatCurrency(dashboard.scheduledThisMonth)}
            hint="Quanto il piano prevede in scadenza questo mese"
            icon={<CalendarClock className="h-5 w-5" />}
          />
          <SportWorkStat
            label="Maturato"
            value={formatCurrency(dashboard.accruedThisMonth)}
            hint="Periodo trascorso: dovuto, non ancora erogato"
            icon={<Receipt className="h-5 w-5" />}
          />
          <SportWorkStat
            label="Pagato"
            value={formatCurrency(dashboard.paidThisMonth)}
            hint="Denaro uscito davvero"
            tone="positive"
            icon={<Wallet className="h-5 w-5" />}
          />
          <SportWorkStat
            label="Costo per il club"
            value={formatCurrency(dashboard.clubCostThisMonth)}
            hint="Lordo piu la quota contributiva della societa"
            icon={<TrendingDown className="h-5 w-5" />}
          />
        </div>
      </section>

      <section aria-labelledby="attenzione" className="space-y-3">
        <h2 id="attenzione" className="text-lg font-semibold">
          Cosa richiede attenzione
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <SportWorkStat
            label="Da pagare"
            value={formatCurrency(dashboard.toPayTotal)}
            hint="Residuo di tutte le scadenze aperte"
          />
          <SportWorkStat
            label="Scaduti"
            value={formatCurrency(dashboard.overdueTotal)}
            hint={`${dashboard.overdueCount} scadenze oltre il termine`}
            tone={dashboard.overdueCount > 0 ? "danger" : "default"}
            icon={<AlertTriangle className="h-5 w-5" />}
          />
          <SportWorkStat
            label="Contratti in scadenza"
            value={String(dashboard.expiringContracts)}
            hint="Da rinnovare o cessare"
            tone={dashboard.expiringContracts > 0 ? "warning" : "default"}
          />
          <SportWorkStat
            label="Autocertificazioni mancanti"
            value={String(dashboard.missingDeclarations)}
            hint="Senza, il progressivo verso le soglie e parziale"
            tone={dashboard.missingDeclarations > 0 ? "warning" : "default"}
            icon={<FileWarning className="h-5 w-5" />}
          />
        </div>
      </section>

      <section aria-labelledby="anno" className="space-y-3">
        <h2 id="anno" className="text-lg font-semibold">
          Anno {dashboard.year}
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <SportWorkStat
            label="Compensi erogati"
            value={formatCurrency(dashboard.paidThisYear)}
            hint={`${dashboard.activeRelationships} rapporti attivi`}
            icon={<Users className="h-5 w-5" />}
          />
          <SportWorkStat
            label="Contributi lavoratore"
            value={formatCurrency(dashboard.employeeContributionThisYear)}
            hint="Trattenuti sulle erogazioni"
          />
          <SportWorkStat
            label="Contributi club"
            value={formatCurrency(dashboard.employerContributionThisYear)}
            hint="A carico della societa"
          />
          <SportWorkStat
            label="Oltre le soglie"
            value={`${dashboard.peopleOverSocialThreshold} / ${dashboard.peopleOverFiscalThreshold}`}
            hint="Persone oltre i 5.000 previdenziali / i 15.000 fiscali"
            tone={dashboard.peopleOverFiscalThreshold > 0 ? "warning" : "default"}
          />
        </div>
      </section>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle>Adempimenti prossimi</CardTitle>
            <Link
              href={withClub("/sport-work/obligations")}
              className="text-sm font-medium text-blue-600 hover:underline"
            >
              Vedi tutti
            </Link>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            EasyGame prepara i dati dell&apos;adempimento. Non lo trasmette: al
            RASD, a UNILAV, all&apos;INPS e all&apos;Agenzia delle Entrate ci va
            una persona.
          </p>
        </CardHeader>
        <CardContent className="p-0">
          {prossimi.length === 0 ? (
            <p className="px-6 pb-6 text-sm text-muted-foreground">
              Nessun adempimento in attesa.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-gray-700">
              {prossimi.map((obligation) => {
                const badge = statusBadgeOf(
                  obligationStatusBadge,
                  obligation.status,
                  "DUE",
                );
                return (
                  <li
                    key={obligation.id}
                    className="flex flex-col gap-2 px-6 py-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {obligation.title}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {obligationKindLabel(obligation.kind)} ·{" "}
                        {formatDate(obligation.due_date)} ·{" "}
                        {dueLabel(obligation.due_date)}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {obligation.amount ? (
                        <span className="text-sm tabular-nums">
                          {formatCurrency(obligation.amount)}
                        </span>
                      ) : null}
                      <Badge variant="outline" className={badge.className}>
                        {badge.label}
                      </Badge>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
