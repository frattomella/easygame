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
import { FundingPeriodsTable } from "./FundingPeriodsTable";
import {
  ConfirmAccrualDialog,
  type AccrualConfirmationSubmission,
} from "./ConfirmAccrualDialog";
import {
  fundingAccrualSourceLabel,
  mergeFundingSummaries,
  requirementUnitLabel,
  type FundingAccrualSource,
  type FundingSummary,
} from "@/lib/funding/funding-model";

/**
 * I contributi di un atleta nella sua parte economica (ADR-0037, ADR-0054).
 *
 * **Sei numeri, non uno.** Un voucher assegnato non e denaro incassato, e il
 * massimale del bando non e cio che l'atleta usa qui: fra «il bando riconosce
 * fino a 500» e «l'ente ci ha versato 60» ci sono quattro passaggi che possono
 * fallire separatamente. Mostrarne un totale solo — che e cio che una
 * segreteria si aspetterebbe di vedere — porterebbe a contare come cassa dei
 * soldi che nessuno ha versato.
 *
 * **Massimale del programma e assegnato al club sono due righe diverse.**
 * Mario ha diritto a 500 EUR complessivi e decide di usarne 300 qui: gli altri
 * 200 non sono disponibili a questa societa, e EasyGame non deve mai
 * comportarsi come se lo fossero. Il limite di questa iscrizione e 300.
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

type FundingOverview = {
  enrollment: Record<string, any>;
  program: Record<string, any>;
  accruals: Record<string, any>[];
  summary: FundingSummary;
};

/**
 * Una riga del riepilogo economico.
 *
 * Righe e non riquadri affiancati: sei importi in griglia diventano due
 * colonne strette a 375 px, e i sei numeri che raccontano una storia in
 * sequenza vanno letti in sequenza.
 */
const AmountLine = ({
  label,
  value,
  hint,
  emphasis = false,
}: {
  label: string;
  value: unknown;
  hint?: string;
  emphasis?: boolean;
}) => (
  <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-dashed border-slate-100 py-1.5 last:border-0 dark:border-slate-800">
    <span className="text-sm text-muted-foreground">
      {label}
      {hint ? (
        <span className="ml-2 text-xs opacity-80">{hint}</span>
      ) : null}
    </span>
    <span
      className={`text-sm tabular-nums ${emphasis ? "font-bold text-slate-900 dark:text-slate-100" : "font-medium"}`}
    >
      {formatCurrency(value)}
    </span>
  </div>
);

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
  const [confirmTarget, setConfirmTarget] = React.useState<{
    enrollmentId: string;
    accrual: Record<string, any>;
    residualAmount: number;
  } | null>(null);
  const [isConfirming, setIsConfirming] = React.useState(false);

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
    showToast("success", "Calcolo aggiornato dalle presenze registrate");
  };

  const handleConfirm = async (submission: AccrualConfirmationSubmission) => {
    if (!confirmTarget) return;

    setIsConfirming(true);
    const { error } = await apiRequest("/api/v1/funding/accruals", {
      method: "POST",
      body: {
        action: "confirm",
        enrollment_id: confirmTarget.enrollmentId,
        confirmations: [
          {
            accrual_id: confirmTarget.accrual.id,
            amount: submission.amount,
            confirmed_at: submission.confirmedAt,
            external_reference: submission.externalReference,
            notes: submission.notes,
          },
        ],
      },
    });
    setIsConfirming(false);

    if (error) {
      showToast("error", error.message || "Conferma non riuscita");
      return;
    }

    setConfirmTarget(null);
    await load();
    showToast("success", "Maturazione confermata");
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
          Nessun programma assegnato a questo atleta.
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
    <div className="space-y-4">
      {enrollAction ? (
        <div className="flex justify-end">{enrollAction}</div>
      ) : null}

      {overviews.length > 1 ? (
        <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-900/40">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Totale contributi
          </p>
          <div className="mt-1">
            <AmountLine label="Assegnato al club" value={total.assignedAmount} />
            <AmountLine label="Maturato" value={total.accruedAmount} />
            <AmountLine label="Rendicontato" value={total.reportedAmount} />
            <AmountLine label="Liquidato" value={total.settledAmount} emphasis />
            <AmountLine label="Residuo" value={total.residualAmount} />
          </div>
        </div>
      ) : null}

      {overviews.map((overview) => {
        const enrollmentId = String(overview.enrollment?.id || "");
        const isOpen = Boolean(expanded[enrollmentId]);
        const summary = overview.summary;
        const unit = String(
          overview.program?.requirement_unit || "hours",
        ) as any;
        const source = String(
          overview.program?.accrual_source || "easygame_attendance",
        ) as FundingAccrualSource;
        const externalSource = source !== "easygame_attendance";

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
                <p className="mt-1 text-xs text-slate-500">
                  Fonte della maturazione: {fundingAccrualSourceLabel(source)}
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
                    : externalSource
                      ? "Aggiorna previsione"
                      : "Ricalcola dalle presenze"}
                </Button>
              ) : null}
            </div>

            {/*
              I sei importi in sequenza. Il massimale del programma sta in cima
              perche e il contesto — «il bando arriva fino a qui» — e
              l'assegnato subito sotto perche e il limite vero di questa
              iscrizione (ADR-0054).
            */}
            <div className="mt-3">
              <AmountLine
                label="Massimale programma"
                value={overview.program?.athlete_plafond}
                hint="tetto del bando"
              />
              <AmountLine
                label="Assegnato al club"
                value={summary.assignedAmount}
                hint="limite di questa iscrizione"
                emphasis
              />
              {externalSource ? (
                <AmountLine
                  label="Previsione EasyGame"
                  value={summary.estimatedAmount}
                  hint="da confermare"
                />
              ) : null}
              <AmountLine label="Maturato" value={summary.accruedAmount} />
              <AmountLine label="Rendicontato" value={summary.reportedAmount} />
              <AmountLine
                label="Liquidato"
                value={summary.settledAmount}
                hint="versato dall'ente"
              />
              <AmountLine label="Residuo" value={summary.residualAmount} />
            </div>

            {summary.assignedAmount > 0 ? (
              <div className="mt-3 space-y-1">
                <Progress
                  value={Math.round(
                    Math.min(1, summary.accruedAmount / summary.assignedAmount) *
                      100,
                  )}
                  className="h-2"
                />
                <p className="text-xs text-slate-500">
                  {summary.accruedPeriodCount} periodi maturati su{" "}
                  {summary.periodCount}
                  {summary.pendingConfirmationPeriodCount > 0
                    ? ` · ${summary.pendingConfirmationPeriodCount} da confermare`
                    : ""}
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
              aria-expanded={isOpen}
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
              Dettagli ({overview.accruals.length} periodi)
            </Button>

            {isOpen ? (
              <div className="mt-3">
                <FundingPeriodsTable
                  accruals={overview.accruals}
                  externalSource={externalSource}
                  canManage={allowManagement}
                  onConfirm={(accrual) =>
                    setConfirmTarget({
                      enrollmentId,
                      accrual,
                      residualAmount: summary.residualAmount,
                    })
                  }
                />
              </div>
            ) : null}
          </div>
        );
      })}

      <ConfirmAccrualDialog
        accrual={confirmTarget?.accrual ?? null}
        residualAmount={confirmTarget?.residualAmount ?? 0}
        isSaving={isConfirming}
        onOpenChange={(open) => {
          if (!open) setConfirmTarget(null);
        }}
        onSubmit={handleConfirm}
      />

      {enrollDialog}
    </div>
  );
}
