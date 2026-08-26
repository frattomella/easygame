"use client";

import React from "react";
import { ChevronDown, ChevronRight, CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  fundingAccrualOriginLabel,
  requirementUnitLabel,
  type FundingAccrualOrigin,
  type FundingRequirementUnit,
} from "@/lib/funding/funding-model";

/**
 * Il ciclo di vita di un contributo, periodo per periodo (ADR-0054).
 *
 * **Perche righe e non una data-grid.** Le colonne che servono davvero sono
 * otto — periodo, frequenza, requisito, previsione, stato ufficiale, maturato,
 * rendicontato, liquidato — e otto colonne a 375 px sono una tabella che
 * scorre di lato e non si legge. Qui la riga chiusa dice le tre cose che
 * decidono (quale periodo, quanto vale, a che punto e), e il resto si apre.
 *
 * **Perche previsione e maturato sono due voci separate.** Su un programma la
 * cui fonte ufficiale sta fuori da EasyGame, cio che le presenze del club
 * dicono non e un credito: e un'indicazione. Metterle nella stessa colonna
 * significherebbe far leggere come maturato un numero che l'ente non ha
 * riconosciuto.
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

export const ACCRUAL_STATUS_BADGE: Record<
  string,
  { label: string; className: string }
> = {
  not_accrued: {
    label: "NON MATURATO",
    className: "border-slate-200 bg-slate-100 text-slate-600",
  },
  pending_confirmation: {
    label: "DA CONFERMARE",
    className: "border-violet-200 bg-violet-50 text-violet-700",
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

const DetailRow = ({
  label,
  value,
  hint,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
}) => (
  <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-dashed border-slate-100 py-1.5 last:border-0 dark:border-slate-800">
    <span className="text-xs uppercase tracking-wide text-muted-foreground">
      {label}
    </span>
    <span className="text-sm font-medium text-slate-900 dark:text-slate-100">
      {value}
      {hint ? (
        <span className="ml-2 text-xs font-normal text-muted-foreground">
          {hint}
        </span>
      ) : null}
    </span>
  </div>
);

export type FundingAccrualRow = Record<string, any>;

export function FundingPeriodsTable({
  accruals,
  externalSource,
  canManage = false,
  onConfirm,
}: {
  accruals: FundingAccrualRow[];
  /** Vero quando la fonte ufficiale del programma sta fuori da EasyGame. */
  externalSource: boolean;
  canManage?: boolean;
  onConfirm?: (accrual: FundingAccrualRow) => void;
}) {
  const [openId, setOpenId] = React.useState<string | null>(null);

  if (!accruals.length) {
    return (
      <p className="text-sm text-slate-500">
        Nessun periodo calcolato. Ricalcola dalle presenze per vedere il
        dettaglio.
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {accruals.map((accrual) => {
        const id = String(accrual.id);
        const isOpen = openId === id;
        const status = String(accrual.status || "not_accrued");
        const badge =
          ACCRUAL_STATUS_BADGE[status] || ACCRUAL_STATUS_BADGE.not_accrued;
        const unit = String(
          accrual.requirement_unit || "hours",
        ) as FundingRequirementUnit;
        const pending = status === "pending_confirmation";
        const reportedAmount = ["reported", "settled"].includes(status)
          ? Number(accrual.accrued_amount || 0)
          : 0;
        const settledAmount = Number(accrual.settled_amount || 0);

        return (
          <li
            key={id}
            className="rounded-lg border border-slate-200 dark:border-slate-800"
          >
            <button
              type="button"
              onClick={() => setOpenId(isOpen ? null : id)}
              aria-expanded={isOpen}
              className="flex w-full flex-col gap-2 p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 sm:flex-row sm:items-center sm:justify-between"
            >
              <span className="flex min-w-0 items-center gap-2">
                {isOpen ? (
                  <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
                ) : (
                  <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
                )}
                <span className="min-w-0">
                  <span className="block truncate font-medium capitalize text-slate-900 dark:text-slate-100">
                    {accrual.period_label}
                  </span>
                  <span className="block text-xs text-slate-500">
                    {accrual.measured_value} {requirementUnitLabel(unit)} su{" "}
                    {accrual.requirement_min} richieste
                  </span>
                </span>
              </span>

              <span className="flex flex-wrap items-center gap-2 sm:justify-end">
                <span className="text-sm font-semibold">
                  {pending
                    ? formatCurrency(accrual.estimated_amount)
                    : formatCurrency(accrual.accrued_amount)}
                </span>
                {pending ? (
                  <span className="text-xs text-violet-700">previsione</span>
                ) : null}
                <Badge variant="outline" className={badge.className}>
                  {badge.label}
                </Badge>
              </span>
            </button>

            {isOpen ? (
              <div className="border-t border-slate-100 px-3 pb-3 pt-2 dark:border-slate-800">
                <DetailRow
                  label="Periodo"
                  value={`${formatDate(accrual.period_start)} — ${formatDate(accrual.period_end)}`}
                />
                <DetailRow
                  label="Frequenza EasyGame"
                  value={`${accrual.measured_value} ${requirementUnitLabel(unit)}`}
                  hint={
                    accrual.data?.sessionsWithoutDuration
                      ? `${accrual.data.sessionsWithoutDuration} allenamenti senza orario`
                      : undefined
                  }
                />
                <DetailRow
                  label="Requisito"
                  value={`${accrual.requirement_min} ${requirementUnitLabel(unit)}`}
                  hint={accrual.requirement_met ? "raggiunto" : "non raggiunto"}
                />
                <DetailRow
                  label="Previsione EasyGame"
                  value={formatCurrency(accrual.estimated_amount)}
                />
                <DetailRow
                  label="Stato ufficiale"
                  value={
                    <Badge variant="outline" className={badge.className}>
                      {badge.label}
                    </Badge>
                  }
                />
                <DetailRow
                  label="Maturato"
                  value={formatCurrency(accrual.accrued_amount)}
                  hint={
                    accrual.accrual_origin
                      ? fundingAccrualOriginLabel(
                          accrual.accrual_origin as FundingAccrualOrigin,
                        )
                      : undefined
                  }
                />
                <DetailRow
                  label="Rendicontato"
                  value={formatCurrency(reportedAmount)}
                  hint={
                    accrual.reported_at
                      ? `il ${formatDate(accrual.reported_at)}`
                      : undefined
                  }
                />
                <DetailRow
                  label="Liquidato"
                  value={formatCurrency(settledAmount)}
                />

                {accrual.confirmed_at ? (
                  <DetailRow
                    label="Conferma"
                    value={formatDate(accrual.confirmed_at)}
                    hint={
                      [accrual.external_reference, accrual.confirmation_notes]
                        .filter(Boolean)
                        .join(" · ") || undefined
                    }
                  />
                ) : null}

                {Array.isArray(accrual.data?.previousConfirmations) &&
                accrual.data.previousConfirmations.length > 0 ? (
                  <div className="mt-2 rounded-md bg-slate-50 p-2 dark:bg-slate-900/40">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Conferme precedenti
                    </p>
                    <ul className="mt-1 space-y-1">
                      {accrual.data.previousConfirmations.map(
                        (entry: any, index: number) => (
                          <li key={index} className="text-xs text-slate-600">
                            {formatCurrency(entry.amount)} ·{" "}
                            {formatDate(entry.confirmedAt)}
                            {entry.externalReference
                              ? ` · ${entry.externalReference}`
                              : ""}
                          </li>
                        ),
                      )}
                    </ul>
                  </div>
                ) : null}

                {accrual.data?.reason ? (
                  <p className="mt-2 text-xs text-slate-500">
                    {accrual.data.reason}
                  </p>
                ) : null}

                {externalSource && canManage && status !== "settled" ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-3 w-full sm:w-auto"
                    onClick={() => onConfirm?.(accrual)}
                  >
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                    {accrual.confirmed_at
                      ? "Correggi la maturazione"
                      : "Conferma maturazione"}
                  </Button>
                ) : null}
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
