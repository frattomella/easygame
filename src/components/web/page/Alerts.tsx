"use client";

import * as React from "react";
import { Bell, CheckCircle2, HelpCircle, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Eyebrow, Panel, useOnSky } from "@/components/web/primitives/Surface";
import { IconChip } from "@/components/web/primitives/StatusPill";

/**
 * Gli avvisi azionabili (guideline 09 §9.6): un conteggio, una gravita, una
 * spiegazione della **conseguenza**, e il verbo che risolve. Un avviso su cui
 * non si puo agire non e un avviso: e un KPI.
 */
export type AlertSeverity = "danger" | "warning" | "info" | "success";

const severityStyles: Record<AlertSeverity, { box: string; icon: React.ReactNode; chip: "red" | "amber" | "blue" | "green" }> = {
  danger: { box: "border-egw-tint-red-bd bg-egw-tint-red", icon: <XCircle />, chip: "red" },
  warning: { box: "border-egw-tint-amber-bd bg-egw-tint-amber", icon: <HelpCircle />, chip: "amber" },
  info: { box: "border-egw-tint-blue-bd bg-egw-tint-blue", icon: <Bell />, chip: "blue" },
  success: { box: "border-egw-tint-green-bd bg-egw-tint-green", icon: <CheckCircle2 />, chip: "green" },
};

const severityInk: Record<AlertSeverity, string> = {
  danger: "text-egw-red",
  warning: "text-egw-amber-ink",
  info: "text-egw-blue-700",
  success: "text-egw-green",
};

/** Il blocco di avviso in pagina, a tutta larghezza. */
export function AlertBlock({
  severity = "info",
  title,
  children,
  actions,
  className,
  role,
}: {
  severity?: AlertSeverity;
  title: React.ReactNode;
  children?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
  role?: "alert" | "status";
}) {
  const s = severityStyles[severity];
  /*
    Sul cielo una tinta al 10% diventa un riquadro scuro con dentro inchiostro
    scuro: il blocco si fa bianco e opaco, e la gravita la dice l'icona.
  */
  const onSky = useOnSky();
  return (
    <div
      role={role ?? (severity === "danger" ? "alert" : "status")}
      className={cn(
        "flex flex-wrap items-start gap-3 rounded-egw-field border px-4 py-3.5 font-brand",
        onSky ? "border-white/60 bg-white shadow-egw-plane-1" : s.box,
        className,
      )}
    >
      <span className={cn("mt-px shrink-0 [&>svg]:h-[17px] [&>svg]:w-[17px]", severityInk[severity])}>
        {s.icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold leading-5 text-egw-ink">{title}</p>
        {children ? <div className="mt-0.5 text-[12.5px] leading-[1.5] text-egw-ink-72">{children}</div> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

/**
 * La card di avviso della Dashboard: occhiello `DA SISTEMARE`, il conteggio in
 * 800/20 prima del sostantivo, la conseguenza, fino a tre righe nominative e
 * il verbo che risolve.
 */
export function AlertCard({
  severity = "warning",
  eyebrow = "Da sistemare",
  count,
  noun,
  consequence,
  rows,
  seeAll,
  actions,
  className,
}: {
  severity?: AlertSeverity;
  eyebrow?: React.ReactNode;
  count: number;
  noun: React.ReactNode;
  consequence: React.ReactNode;
  rows?: React.ReactNode[];
  seeAll?: { label: React.ReactNode; onClick?: () => void; href?: string };
  actions?: React.ReactNode;
  className?: string;
}) {
  const s = severityStyles[severity];
  return (
    <Panel className={cn("flex flex-col gap-4 p-5", className)} as="section">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Eyebrow tone={severity === "danger" ? "red" : severity === "warning" ? "amber" : "ink"}>
            {eyebrow}
          </Eyebrow>
          <h3 className="mt-2 font-brand text-[15px] font-bold leading-5 text-egw-ink">
            <span className={cn("egw-num text-[20px] font-extrabold", severityInk[severity])}>{count}</span>{" "}
            {noun}
          </h3>
          <p className="mt-1 text-[12.5px] leading-[1.5] text-egw-ink-62">{consequence}</p>
        </div>
        <IconChip tone={s.chip} size={36}>
          {s.icon}
        </IconChip>
      </div>
      {rows && rows.length ? (
        <ul className="divide-y divide-egw-rule rounded-egw-field border border-egw-hairline bg-egw-page-100">
          {rows.slice(0, 3).map((row, index) => (
            <li key={index} className="flex min-h-[44px] items-center gap-3 px-3 py-2">
              {row}
            </li>
          ))}
        </ul>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-2">
        {seeAll ? (
          seeAll.href ? (
            <a
              href={seeAll.href}
              className="text-[12.5px] font-semibold text-egw-blue-700 hover:underline focus-visible:outline-none focus-visible:underline"
            >
              {seeAll.label}
            </a>
          ) : (
            <button
              type="button"
              onClick={seeAll.onClick}
              className="text-[12.5px] font-semibold text-egw-blue-700 hover:underline focus-visible:outline-none focus-visible:underline"
            >
              {seeAll.label}
            </button>
          )
        ) : (
          <span />
        )}
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </Panel>
  );
}
