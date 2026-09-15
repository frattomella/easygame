"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Eyebrow } from "@/components/web/primitives/Surface";

/**
 * L'intestazione di pagina (guideline 09 §9.2). Ordine fisso: occhiello ·
 * titolo 800/32 · descrizione (una riga, cosa serve la pagina) · controlli di
 * contesto a destra del titolo · azioni (una primaria, al piu due secondarie).
 *
 * Sul cielo (`onSky`) il titolo e bianco. Dopo 120px di scorrimento la
 * pagina la condensa (52px, titolo 20) — lo fa `StickyPageHeader`.
 */
export interface PageHeaderProps {
  title: React.ReactNode;
  eyebrow?: React.ReactNode;
  description?: React.ReactNode;
  /** Sede, stagione, ruolo, categoria: cambiano cosa la pagina *significa*. */
  context?: React.ReactNode;
  /** Le azioni: la primaria prima. */
  actions?: React.ReactNode;
  /** Una riga di numeri accanto al titolo (Atleti: 184 tesserati · 171 attivi). */
  stats?: React.ReactNode;
  onSky?: boolean;
  className?: string;
  /** Per il blocco di avviso sotto l'intestazione (§9.2 punto 6). */
  children?: React.ReactNode;
}

export function PageHeader({
  title,
  eyebrow,
  description,
  context,
  actions,
  stats,
  onSky = false,
  className,
  children,
}: PageHeaderProps) {
  return (
    <div className={cn("mb-[18px]", className)} data-test="page-header">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div className="min-w-0 flex-1">
          {eyebrow ? (
            <Eyebrow tone={onSky ? "white" : "ink"} className="mb-2">
              {eyebrow}
            </Eyebrow>
          ) : null}
          <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1">
            <h1
              className={cn(
                "font-brand text-[32px] font-extrabold leading-[1.08] tracking-[var(--egw-track-display)]",
                onSky ? "text-white" : "text-egw-ink",
              )}
            >
              {title}
            </h1>
            {stats ? <div className="flex flex-wrap items-baseline gap-4">{stats}</div> : null}
          </div>
          {description ? (
            <p
              className={cn(
                "mt-2 max-w-[88ch] font-brand text-[13.5px] leading-[1.5]",
                onSky ? "text-white/80" : "text-egw-ink-62",
              )}
            >
              {description}
            </p>
          ) : null}
        </div>
        {context || actions ? (
          <div className="flex flex-wrap gap-2 sm:shrink-0 items-center">
            {context}
            {context && actions ? (
              <span aria-hidden className="mx-1 hidden h-6 w-px bg-egw-hairline sm:block" />
            ) : null}
            {actions}
          </div>
        ) : null}
      </div>
      {children ? <div className="mt-4">{children}</div> : null}
    </div>
  );
}

/** Un numero dell'intestazione: `184` 800/20 tabellare + etichetta sotto. */
export function HeaderStat({
  value,
  label,
  tone = "ink",
  onClick,
}: {
  value: React.ReactNode;
  label: React.ReactNode;
  tone?: "ink" | "green" | "amber" | "red" | "blue";
  onClick?: () => void;
}) {
  const Comp = onClick ? "button" : "div";
  return (
    <Comp
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={cn(
        "flex flex-col items-start leading-none",
        onClick && "rounded-egw-chip hover:underline focus-visible:outline-none focus-visible:shadow-egw-focus",
      )}
    >
      <span
        className={cn(
          "egw-num font-brand text-[20px] font-extrabold",
          tone === "ink" && "text-egw-ink",
          tone === "green" && "text-egw-green",
          tone === "amber" && "text-egw-amber-ink",
          tone === "red" && "text-egw-red",
          tone === "blue" && "text-egw-blue-700",
        )}
      >
        {value}
      </span>
      <span className="mt-1 font-brand text-[10px] font-medium uppercase tracking-[.06em] text-egw-ink-42">
        {label}
      </span>
    </Comp>
  );
}

/**
 * Un controllo di contesto (34px, bianco, 600/12.5 + chevron) — lo si usa come
 * `asChild` intorno a un trigger di menu/popover.
 */
export const ContextControl = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & { icon?: React.ReactNode; onSky?: boolean }
>(({ className, children, icon, onSky, ...props }, ref) => (
  <button
    ref={ref}
    type="button"
    className={cn(
      "inline-flex h-[34px] items-center gap-2 whitespace-nowrap rounded-egw-control border px-3 font-brand text-[12.5px] font-semibold transition-colors duration-hover focus-visible:outline-none",
      onSky
        ? "border-white/26 bg-white/14 text-white hover:bg-white/22 focus-visible:shadow-egw-focus-dark"
        : "border-egw-control-border bg-white text-egw-ink hover:border-[rgba(37,99,235,.32)] focus-visible:shadow-egw-focus",
      className,
    )}
    {...props}
  >
    {icon ? <span className="[&>svg]:h-3.5 [&>svg]:w-3.5">{icon}</span> : null}
    <span className="egw-ellipsis max-w-[220px]">{children}</span>
    <svg viewBox="0 0 16 16" className="h-3 w-3 opacity-60" aria-hidden>
      <path d="M3 6l5 5 5-5" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" />
    </svg>
  </button>
));
ContextControl.displayName = "ContextControl";
