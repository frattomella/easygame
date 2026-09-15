"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Eyebrow, Hairline, Panel } from "@/components/web/primitives/Surface";
import { IconChip } from "@/components/web/primitives/StatusPill";
import { Button } from "@/components/web/primitives/Button";
import { Skeleton } from "@/components/web/primitives/Controls";
import { MISSING } from "@/lib/web/format";

/**
 * Le card del Web V2 (guideline 09 §9.3). Tutte piano 1, raggio pannello.
 * Una card dentro una card e vietata: il blocco interno scende a piano 0.
 */

/* ── KPI ─────────────────────────────────────────────────────────────────── */
export function KpiCard({
  label,
  value,
  qualifier,
  delta,
  deltaTone,
  icon,
  iconTone = "blue",
  onClick,
  href,
  loading,
  className,
  ariaLabel,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  qualifier?: React.ReactNode;
  delta?: React.ReactNode;
  deltaTone?: "green" | "red" | "neutral";
  icon?: React.ReactNode;
  iconTone?: "blue" | "green" | "amber" | "red" | "orange" | "neutral";
  onClick?: () => void;
  href?: string;
  loading?: boolean;
  className?: string;
  ariaLabel?: string;
}) {
  const interactive = Boolean(onClick || href);
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <Eyebrow>{label}</Eyebrow>
        {icon ? (
          <IconChip tone={iconTone} size={32} className="-mt-1.5 [&>svg]:h-4 [&>svg]:w-4">
            {icon}
          </IconChip>
        ) : null}
      </div>
      {loading ? (
        <Skeleton className="mt-3 h-8 w-24" />
      ) : (
        <div className="mt-2.5 flex items-baseline gap-2">
          <span className="egw-num font-brand text-[30px] font-extrabold leading-none text-egw-ink">
            {value ?? MISSING}
          </span>
          {delta ? (
            <span
              className={cn(
                "egw-num font-brand text-[12px] font-bold",
                deltaTone === "green" && "text-egw-green",
                deltaTone === "red" && "text-egw-red",
                (!deltaTone || deltaTone === "neutral") && "text-egw-ink-62",
              )}
            >
              {delta}
            </span>
          ) : null}
        </div>
      )}
      {qualifier ? (
        <p className="mt-1.5 font-brand text-[11.5px] leading-[1.45] text-egw-ink-62">{qualifier}</p>
      ) : null}
    </>
  );
  const cls = cn(
    "block w-full text-left",
    "border border-egw-panel-border bg-egw-panel shadow-egw-plane-1 rounded-egw-panel px-[22px] py-5",
    interactive && "transition-[border-color] duration-hover hover:border-[rgba(37,99,235,.32)] focus-visible:outline-none focus-visible:shadow-egw-focus",
    className,
  );
  if (href) {
    return (
      <a href={href} className={cls} aria-label={ariaLabel}>
        {body}
      </a>
    );
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={cls} aria-label={ariaLabel}>
        {body}
      </button>
    );
  }
  return (
    <div className={cls} aria-label={ariaLabel}>
      {body}
    </div>
  );
}

export function KpiBar({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "grid gap-3.5 [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]",
        className,
      )}
    >
      {children}
    </div>
  );
}

/* ── Summary / finance ───────────────────────────────────────────────────── */
export type SummaryRow = {
  label: React.ReactNode;
  value: React.ReactNode;
  tone?: "ink" | "green" | "amber" | "red" | "muted";
  emphasis?: boolean;
};

export function SummaryCard({
  eyebrow,
  title,
  rows,
  total,
  footer,
  className,
  dashed,
}: {
  eyebrow?: React.ReactNode;
  title?: React.ReactNode;
  rows: SummaryRow[];
  total?: SummaryRow;
  footer?: React.ReactNode;
  className?: string;
  /** Il contenitore economico (crediti/debiti): tratteggiato, mai leggibile come cassa. */
  dashed?: boolean;
}) {
  const toneClass = (tone?: SummaryRow["tone"]) =>
    cn(
      tone === "green" && "text-egw-green",
      tone === "amber" && "text-egw-amber-ink",
      tone === "red" && "text-egw-red",
      tone === "muted" && "text-egw-ink-62",
      (!tone || tone === "ink") && "text-egw-ink",
    );
  const Wrapper = dashed ? "div" : Panel;
  return (
    <Wrapper
      className={cn(
        "p-5",
        dashed && "rounded-egw-panel border border-dashed border-[rgba(11,26,58,.22)] bg-transparent",
        className,
      )}
    >
      {eyebrow ? <Eyebrow className="mb-2">{eyebrow}</Eyebrow> : null}
      {title ? <h3 className="mb-3 font-brand text-[15px] font-bold text-egw-ink">{title}</h3> : null}
      <dl>
        {rows.map((row, index) => (
          <div
            key={index}
            className="flex items-baseline justify-between gap-4 border-b border-dashed border-egw-hairline py-2 last:border-0"
          >
            <dt className="font-brand text-[12px] text-egw-ink-62">{row.label}</dt>
            <dd className={cn("egw-num font-brand text-[13px] font-bold", toneClass(row.tone))}>
              {row.value ?? MISSING}
            </dd>
          </div>
        ))}
        {total ? (
          <div className="-mx-5 mt-2 flex items-baseline justify-between gap-4 bg-egw-page-100 px-5 py-2.5">
            <dt className="font-brand text-[13px] font-semibold text-egw-ink">{total.label}</dt>
            <dd className={cn("egw-num font-brand text-[15px] font-extrabold", toneClass(total.tone))}>
              {total.value ?? MISSING}
            </dd>
          </div>
        ) : null}
      </dl>
      {footer ? (
        <>
          <Hairline className="my-3.5" />
          <div className="flex flex-wrap items-center justify-end gap-2">{footer}</div>
        </>
      ) : null}
    </Wrapper>
  );
}

/* ── Info card (piano 0, nessun colore) ──────────────────────────────────── */
export function InfoCard({ eyebrow, children, className }: { eyebrow?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-egw-field border border-egw-hairline bg-egw-page-100 px-4 py-3.5", className)}>
      {eyebrow ? <Eyebrow className="mb-2">{eyebrow}</Eyebrow> : null}
      <p className="font-brand text-[12.5px] leading-[1.55] text-egw-ink-62">{children}</p>
    </div>
  );
}

/* ── Empty state ─────────────────────────────────────────────────────────── */
export function EmptyStateCard({
  icon,
  iconTone = "blue",
  title,
  description,
  primary,
  secondary,
  className,
  flat,
}: {
  icon?: React.ReactNode;
  iconTone?: "blue" | "green" | "amber" | "red" | "orange" | "neutral";
  title: React.ReactNode;
  description?: React.ReactNode;
  primary?: React.ReactNode;
  secondary?: React.ReactNode;
  className?: string;
  /** Senza pannello: dentro un pannello gia esistente (la griglia). */
  flat?: boolean;
}) {
  const content = (
    <div className="flex min-h-[200px] flex-col items-center justify-center px-6 py-8 text-center">
      {icon ? (
        <IconChip tone={iconTone} size={44} className="mb-4 [&>svg]:h-5 [&>svg]:w-5">
          {icon}
        </IconChip>
      ) : null}
      <h3 className="font-brand text-[15px] font-bold text-egw-ink">{title}</h3>
      {description ? (
        <p className="mt-1.5 max-w-[46ch] font-brand text-[12.5px] leading-[1.5] text-egw-ink-62">{description}</p>
      ) : null}
      {primary || secondary ? (
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5">
          {primary}
          {secondary}
        </div>
      ) : null}
    </div>
  );
  if (flat) return <div className={className}>{content}</div>;
  return <Panel className={cn("p-0", className)}>{content}</Panel>;
}

/* ── Detail card (scheda: label/value a 3 colonne) ───────────────────────── */
export type DetailField = {
  label: React.ReactNode;
  value: React.ReactNode;
  /** Occupa tutta la riga (indirizzo, note). */
  wide?: boolean;
};

export function DetailCard({
  eyebrow,
  title,
  fields,
  onEdit,
  editLabel = "Modifica",
  actions,
  columns = 3,
  className,
  children,
  loading,
}: {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  fields?: DetailField[];
  onEdit?: () => void;
  editLabel?: string;
  actions?: React.ReactNode;
  columns?: 2 | 3 | 4;
  className?: string;
  children?: React.ReactNode;
  loading?: boolean;
}) {
  return (
    <Panel as="section" className={cn("p-6", className)}>
      <div className="mb-4 flex items-start justify-between gap-4">
        <div className="min-w-0">
          {eyebrow ? <Eyebrow className="mb-2">{eyebrow}</Eyebrow> : null}
          <h3 className="font-brand text-[15px] font-bold leading-5 text-egw-ink">{title}</h3>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {actions}
          {onEdit ? (
            <Button variant="secondary" size="sm" onClick={onEdit}>
              {editLabel}
            </Button>
          ) : null}
        </div>
      </div>
      {loading ? (
        <div className={cn("grid gap-x-6 gap-y-[18px]", columns === 2 && "grid-cols-2", columns === 3 && "grid-cols-2 lg:grid-cols-3", columns === 4 && "grid-cols-2 lg:grid-cols-4")}>
          {Array.from({ length: columns * 2 }).map((_, i) => (
            <div key={i}>
              <Skeleton className="mb-2 h-3 w-20" />
              <Skeleton className="h-4 w-32" />
            </div>
          ))}
        </div>
      ) : fields ? (
        <dl
          className={cn(
            "grid gap-x-6 gap-y-[18px]",
            columns === 2 && "grid-cols-1 sm:grid-cols-2",
            columns === 3 && "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
            columns === 4 && "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4",
          )}
        >
          {fields.map((field, index) => (
            <div key={index} className={cn("min-w-0", field.wide && "sm:col-span-2 lg:col-span-full")}>
              <dt className="font-brand text-[12px] text-[rgba(11,26,58,.55)]">{field.label}</dt>
              <dd className="mt-1 break-words font-brand text-[13.5px] text-egw-ink">
                {field.value === null || field.value === undefined || field.value === "" ? MISSING : field.value}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
      {children}
    </Panel>
  );
}

/* ── Timeline card (rail orario) ─────────────────────────────────────────── */
export function TimelineRow({
  time,
  duration,
  title,
  meta,
  aside,
  stripe,
  className,
}: {
  time: React.ReactNode;
  duration?: React.ReactNode;
  title: React.ReactNode;
  meta?: React.ReactNode;
  aside?: React.ReactNode;
  /** Riga in corso: filo di 3px in gradiente sul bordo alto. */
  stripe?: "action" | "match" | null;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative flex items-start gap-4 border-b border-egw-rule py-3 last:border-0",
        stripe && "-mx-1 rounded-egw-chip px-1",
        className,
      )}
    >
      {stripe ? (
        <span
          aria-hidden
          className={cn("absolute inset-x-1 top-0 h-[3px] rounded-full", stripe === "match" ? "bg-egw-match" : "bg-egw-action")}
        />
      ) : null}
      <div className="w-14 shrink-0 border-r border-egw-hairline pr-3 text-right">
        <div className="egw-num font-brand text-[18px] font-extrabold leading-none text-egw-ink">{time}</div>
        {duration ? <div className="mt-1 font-brand text-[10px] text-egw-ink-42">{duration}</div> : null}
      </div>
      <div className="min-w-0 flex-1">
        <div className="font-brand text-[13px] font-semibold leading-5 text-egw-ink">{title}</div>
        {meta ? <div className="mt-0.5 font-brand text-[11.5px] leading-[1.45] text-egw-ink-62">{meta}</div> : null}
      </div>
      {aside ? <div className="flex shrink-0 items-center gap-2">{aside}</div> : null}
    </div>
  );
}
