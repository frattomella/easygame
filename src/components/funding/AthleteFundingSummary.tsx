"use client";

import React from "react";
import {
  ChevronDown,
  ChevronRight,
  HandCoins,
  RefreshCw,
  UserPlus,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { apiRequest, readStoredActiveClub } from "@/lib/api/client";
import { canManageClubConfiguration } from "@/lib/access-roles";
import { useToast } from "@/components/ui/toast-notification";
import { EnrollAthletesDialog } from "./EnrollAthletesDialog";
import {
  mergeFundingSummaries,
  requirementUnitLabel,
  type FundingSummary,
} from "@/lib/funding/funding-model";

/**
 * I contributi di un atleta nella sua parte economica (ADR-0037).
 *
 * **Cinque numeri, non uno.** Un voucher assegnato non e denaro incassato: fra
 * «assegnato» e «arrivato» ci sono la frequenza, la rendicontazione e il
 * versamento dell'ente, e ognuno dei tre puo non essere ancora successo.
 * Mostrarne un totale solo — che e cio che una segreteria si aspetterebbe di
 * vedere — porterebbe a contare come cassa dei soldi che nessuno ha versato.
 *
 * Il pannello e **separato** dal Riepilogo Incassi di proposito: quello e
 * denaro della famiglia, questo e un credito verso un ente. Sono due
 * contabilita, e il momento in cui si sommano e il momento in cui smettono di
 * essere leggibili.
 */

const formatCurrency = (value: unknown) =>
  new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
  }).format(Number(value || 0));

const formatDate = (value?: unknown) => {
  if (!value) return "-";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
};

const ACCRUAL_BADGE: Record<string, { label: string; className: string }> = {
  not_accrued: {
    label: "NON MATURATO",
    className: "border-slate-200 bg-slate-100 text-slate-600",
  },
  accrued: {
    label: "MATURATO",
    className: "border-sky-200 bg-sky-50 text-sky-700",
  },
  reported: {
    label: "RENDICONTATO",
    className: "border-amber-200 bg-amber-50 text-amber-700",
  },
  settled: {
    label: "LIQUIDATO",
    className: "border-emerald-200 bg-emerald-50 text-emerald-700",
  },
};

type FundingOverview = {
  enrollment: Record<string, any>;
  program: Record<string, any>;
  accruals: Record<string, any>[];
  summary: FundingSummary;
};

const AmountTile = ({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: unknown;
  hint?: string;
  tone?: "neutral" | "accrued" | "settled" | "pending";
}) => {
  const toneClass =
    tone === "settled"
      ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300"
      : tone === "accrued"
        ? "bg-sky-50 text-sky-700 dark:bg-sky-900/20 dark:text-sky-300"
        : tone === "pending"
          ? "bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300"
          : "bg-slate-50 text-slate-900 dark:bg-slate-900/40 dark:text-slate-100";

  return (
    <div className={`rounded-lg p-3 ${toneClass}`}>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-bold">{formatCurrency(value)}</p>
      {hint ? <p className="mt-1 text-xs opacity-80">{hint}</p> : null}
    </div>
  );
};

export function AthleteFundingSummary({
  athleteId,
  athleteName,
  canManage,
}: {
  athleteId: string;
  /** Solo per il testo della finestra di iscrizione. */
  athleteName?: string | null;
  /** Se omesso si ricava dal ruolo attivo. L'autorizzazione vera la fa il server. */
  canManage?: boolean;
}) {
  const { showToast } = useToast();
  const [overviews, setOverviews] = React.useState<FundingOverview[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);
  const [busyEnrollmentId, setBusyEnrollmentId] = React.useState<string | null>(
    null,
  );
  const [expanded, setExpanded] = React.useState<Record<string, boolean>>({});
  const [derivedCanManage, setDerivedCanManage] = React.useState(false);

  /*
    I programmi a cui questo atleta **non** e ancora iscritto. L'elenco lo
    calcola il server: «non ancora iscritto» e una differenza fra due insiemi,
    e farla qui vorrebbe dire ricevere tutti i programmi per poi scartarne
    meta.
  */
  const [enrollablePrograms, setEnrollablePrograms] = React.useState<any[]>([]);
  const [enrollOpen, setEnrollOpen] = React.useState(false);

  React.useEffect(() => {
    if (canManage !== undefined) return;
    setDerivedCanManage(
      canManageClubConfiguration(readStoredActiveClub()?.role),
    );
  }, [canManage]);

  const allowManagement = canManage ?? derivedCanManage;

  const load = React.useCallback(async () => {
    if (!athleteId) return;

    setIsLoading(true);

    /*
      Due letture in parallelo e non in fila: la seconda serve solo al
      pulsante «Iscrivi a un programma», e metterla dopo aggiungerebbe un
      giro di rete all'apertura della scheda economica.
    */
    const [overviewResponse, enrollableResponse] = await Promise.all([
      apiRequest<FundingOverview[]>(
        `/api/v1/funding/enrollments?view=overview&athlete_id=${encodeURIComponent(athleteId)}`,
      ),
      apiRequest<any[]>(
        `/api/v1/funding/enrollments?view=enrollable&athlete_id=${encodeURIComponent(athleteId)}`,
      ),
    ]);

    setIsLoading(false);

    if (overviewResponse.error) {
      showToast(
        "error",
        overviewResponse.error.message || "Errore nella lettura dei contributi",
      );
      return;
    }

    setOverviews(
      Array.isArray(overviewResponse.data) ? overviewResponse.data : [],
    );
    setEnrollablePrograms(
      Array.isArray(enrollableResponse.data) ? enrollableResponse.data : [],
    );
  }, [athleteId, showToast]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const total = React.useMemo(
    () => mergeFundingSummaries(overviews.map((item) => item.summary)),
    [overviews],
  );

  const handleRecompute = async (enrollmentId: string) => {
    setBusyEnrollmentId(enrollmentId);
    const { error } = await apiRequest("/api/v1/funding/accruals", {
      method: "POST",
      body: { action: "recompute", enrollment_id: enrollmentId },
    });
    setBusyEnrollmentId(null);

    if (error) {
      showToast("error", error.message || "Ricalcolo non riuscito");
      return;
    }

    await load();
    showToast("success", "Maturato ricalcolato dalle presenze registrate");
  };

  const enrollAction =
    allowManagement && enrollablePrograms.length > 0 ? (
      <Button
        variant="outline"
        size="sm"
        className="w-full gap-2 sm:w-auto"
        onClick={() => setEnrollOpen(true)}
      >
        <UserPlus className="h-4 w-4" />
        Iscrivi a un programma
      </Button>
    ) : null;

  const enrollDialog = (
    <EnrollAthletesDialog
      open={enrollOpen}
      onOpenChange={setEnrollOpen}
      onEnrolled={() => void load()}
      mode="athlete"
      athleteId={athleteId}
      athleteName={athleteName || "questo atleta"}
      programs={enrollablePrograms}
    />
  );

  if (!isLoading && overviews.length === 0) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-slate-500">
          Nessun voucher o contributo assegnato a questo atleta.
          {allowManagement && enrollablePrograms.length === 0
            ? " Non ci sono programmi attivi a cui iscriverlo."
            : ""}
        </p>
        {enrollAction}
        {enrollDialog}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {enrollAction ? (
        <div className="flex justify-end">{enrollAction}</div>
      ) : null}

      {overviews.length > 1 ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <AmountTile label="Voucher assegnato" value={total.assignedAmount} />
          <AmountTile label="Maturato" value={total.accruedAmount} tone="accrued" />
          <AmountTile label="Liquidato" value={total.settledAmount} tone="settled" />
          <AmountTile
            label="Da liquidare"
            value={total.pendingSettlementAmount}
            tone="pending"
          />
          <AmountTile label="Residuo voucher" value={total.residualAmount} />
        </div>
      ) : null}

      {overviews.map((overview) => {
        const enrollmentId = String(overview.enrollment?.id || "");
        const isOpen = Boolean(expanded[enrollmentId]);
        const summary = overview.summary;
        const unit = String(
          overview.program?.requirement_unit || "hours",
        ) as any;

        return (
          <div
            key={enrollmentId}
            className="rounded-lg border border-slate-200 p-4 dark:border-slate-800"
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <HandCoins className="h-4 w-4 text-blue-600" />
                  <p className="font-semibold text-slate-900 dark:text-slate-100">
                    {overview.program?.name || "Programma"}
                  </p>
                  {overview.enrollment?.voucher_code ? (
                    <Badge variant="outline">
                      Voucher {overview.enrollment.voucher_code}
                    </Badge>
                  ) : null}
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  {overview.program?.funder_name} ·{" "}
                  {formatCurrency(overview.program?.period_amount)} per periodo,
                  con almeno {overview.program?.requirement_min}{" "}
                  {requirementUnitLabel(unit)}
                </p>
              </div>

              {allowManagement ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full sm:w-auto"
                  disabled={busyEnrollmentId === enrollmentId}
                  onClick={() => void handleRecompute(enrollmentId)}
                >
                  <RefreshCw className="mr-2 h-4 w-4" />
                  {busyEnrollmentId === enrollmentId
                    ? "Ricalcolo..."
                    : "Ricalcola dalle presenze"}
                </Button>
              ) : null}
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <AmountTile
                label="Voucher assegnato"
                value={summary.assignedAmount}
                hint="Non e denaro incassato"
              />
              <AmountTile
                label="Maturato"
                value={summary.accruedAmount}
                tone="accrued"
                hint="Credito verso l'ente"
              />
              <AmountTile
                label="Liquidato"
                value={summary.settledAmount}
                tone="settled"
                hint="Versato dall'ente"
              />
              <AmountTile
                label="Da liquidare"
                value={summary.pendingSettlementAmount}
                tone="pending"
              />
              <AmountTile
                label="Residuo voucher"
                value={summary.residualAmount}
                hint="Puo ancora maturare"
              />
            </div>

            {summary.assignedAmount > 0 ? (
              <div className="mt-3 space-y-1">
                <Progress
                  value={Math.round(
                    Math.min(
                      1,
                      summary.accruedAmount / summary.assignedAmount,
                    ) * 100,
                  )}
                  className="h-2"
                />
                <p className="text-xs text-slate-500">
                  {summary.accruedPeriodCount} periodi maturati su{" "}
                  {summary.periodCount}
                  {summary.unaccruedAmount > 0
                    ? ` · ${formatCurrency(summary.unaccruedAmount)} non maturati per requisito non raggiunto`
                    : ""}
                </p>
              </div>
            ) : null}

            <Button
              variant="ghost"
              size="sm"
              className="mt-3 w-full sm:w-auto"
              onClick={() =>
                setExpanded((current) => ({
                  ...current,
                  [enrollmentId]: !current[enrollmentId],
                }))
              }
            >
              {isOpen ? (
                <ChevronDown className="mr-1 h-4 w-4" />
              ) : (
                <ChevronRight className="mr-1 h-4 w-4" />
              )}
              Dettaglio per periodo ({overview.accruals.length})
            </Button>

            {isOpen ? (
              <div className="mt-3 overflow-x-auto rounded-md border border-slate-100 dark:border-slate-800">
                <table className="w-full min-w-[620px] text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                      <th className="p-2">Periodo</th>
                      <th className="p-2">Frequenza</th>
                      <th className="p-2">Requisito</th>
                      <th className="p-2">Maturato</th>
                      <th className="p-2">Non maturato</th>
                      <th className="p-2">Stato</th>
                    </tr>
                  </thead>
                  <tbody>
                    {overview.accruals.map((accrual) => {
                      const badge =
                        ACCRUAL_BADGE[String(accrual.status)] ||
                        ACCRUAL_BADGE.not_accrued;
                      const accrualUnit = String(
                        accrual.requirement_unit || "hours",
                      ) as any;

                      return (
                        <tr key={String(accrual.id)} className="border-b">
                          <td className="p-2">
                            <span className="font-medium capitalize">
                              {accrual.period_label}
                            </span>
                            <span className="block text-xs text-slate-500">
                              {formatDate(accrual.period_start)} —{" "}
                              {formatDate(accrual.period_end)}
                            </span>
                          </td>
                          <td className="p-2 whitespace-nowrap">
                            {accrual.measured_value}{" "}
                            {requirementUnitLabel(accrualUnit)}
                          </td>
                          <td className="p-2 whitespace-nowrap">
                            {accrual.requirement_min}{" "}
                            {requirementUnitLabel(accrualUnit)}
                            <span
                              className={`ml-2 text-xs ${accrual.requirement_met ? "text-emerald-600" : "text-red-600"}`}
                            >
                              {accrual.requirement_met ? "raggiunto" : "non raggiunto"}
                            </span>
                          </td>
                          <td className="p-2 whitespace-nowrap font-medium">
                            {formatCurrency(accrual.accrued_amount)}
                          </td>
                          <td className="p-2 whitespace-nowrap text-slate-500">
                            {formatCurrency(accrual.unaccrued_amount)}
                          </td>
                          <td className="p-2">
                            <Badge variant="outline" className={badge.className}>
                              {badge.label}
                            </Badge>
                            {accrual.data?.reason ? (
                              <span className="block text-xs text-slate-500">
                                {accrual.data.reason}
                              </span>
                            ) : null}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : null}
          </div>
        );
      })}

      {enrollDialog}
    </div>
  );
}
