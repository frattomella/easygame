"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { useOnSky } from "@/components/web/primitives/Surface";

/**
 * Controlli piccoli del Web V2: segmented control, skeleton, barra di
 * avanzamento, interruttore di densita (guideline 08 §8.2, 09 §9.5).
 */

/* ── Segmented control ───────────────────────────────────────────────────── */
export type SegmentOption<T extends string> = {
  value: T;
  label: React.ReactNode;
  count?: number | null;
  disabled?: boolean;
};

/**
 * Due semantiche, una forma. `tabs` (default) e una scelta di vista: le
 * schede di una pagina. `radio` e una scelta di **valore** dentro un modulo
 * («Ti registri come»): un gruppo di radio con un solo tabstop e le frecce
 * che spostano la scelta, come vuole WAI-ARIA — una tablist senza pannelli
 * non lo era (revisione ostile ADR-0187, M11). `aria-labelledby` lega il
 * gruppo all'etichetta del campo che lo contiene.
 */
export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  size = "md",
  className,
  mode = "tabs",
  id,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
}: {
  value: T;
  onChange: (value: T) => void;
  options: readonly SegmentOption<T>[];
  size?: "md" | "sm";
  className?: string;
  mode?: "tabs" | "radio";
  id?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
}) {
  const radio = mode === "radio";
  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!radio) return;
    const abilitate = options.filter((option) => !option.disabled);
    const indice = abilitate.findIndex((option) => option.value === value);
    if (indice < 0) return;
    let prossimo = indice;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") prossimo = (indice + 1) % abilitate.length;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp") prossimo = (indice - 1 + abilitate.length) % abilitate.length;
    else if (event.key === "Home") prossimo = 0;
    else if (event.key === "End") prossimo = abilitate.length - 1;
    else return;
    event.preventDefault();
    onChange(abilitate[prossimo].value);
    const bottone = event.currentTarget.querySelector<HTMLButtonElement>(`[data-value="${abilitate[prossimo].value}"]`);
    bottone?.focus();
  };
  return (
    <div
      id={id}
      role={radio ? "radiogroup" : "tablist"}
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy}
      onKeyDown={onKeyDown}
      className={cn(
        "inline-flex shrink-0 items-center rounded-egw-control border border-[rgba(11,26,58,.1)] bg-[#e9eef9] p-[2px]",
        className,
      )}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            data-value={option.value}
            role={radio ? "radio" : "tab"}
            aria-selected={radio ? undefined : active}
            aria-checked={radio ? active : undefined}
            tabIndex={radio ? (active ? 0 : -1) : undefined}
            disabled={option.disabled}
            onClick={() => onChange(option.value)}
            className={cn(
              "inline-flex items-center gap-1.5 whitespace-nowrap rounded-egw-chip px-3 font-brand font-semibold leading-none text-egw-ink-62 transition-colors duration-hover focus-visible:outline-none focus-visible:shadow-egw-focus disabled:opacity-40",
              size === "md" ? "h-[30px] text-[12.5px]" : "h-6 text-[11px]",
              active && "bg-white font-bold text-egw-navy-800 shadow-[0_1px_2px_rgba(11,26,58,.16)]",
            )}
          >
            {option.label}
            {option.count != null ? (
              <span className={cn("egw-num text-[10.5px] font-bold", active ? "text-egw-ink-62" : "text-egw-ink-42")}>
                {option.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

/* ── Skeleton ────────────────────────────────────────────────────────────── */
export function Skeleton({
  className,
  style,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden
      className={cn("egw-skeleton rounded-egw-micro", className)}
      style={style}
      {...props}
    />
  );
}

/* ── Progress ────────────────────────────────────────────────────────────── */
export function ProgressBar({
  value,
  max = 100,
  label,
  className,
  tone = "action",
}: {
  value: number | null;
  max?: number;
  label?: React.ReactNode;
  className?: string;
  tone?: "action" | "green" | "amber" | "red";
}) {
  const determinate = value != null && Number.isFinite(value);
  const pct = determinate ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  /* Sul cielo la barra e bianca e l'etichetta anche: blu su blu non si legge (ADR-0187 §4). */
  const onSky = useOnSky();
  return (
    <div className={cn("w-full", className)}>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={determinate ? value : undefined}
        className={cn(
          "relative h-1.5 w-full overflow-hidden rounded-egw-pill",
          onSky ? "bg-white/25" : "bg-[rgba(11,26,58,.08)]",
          !determinate && "egw-indeterminate",
        )}
      >
        {determinate ? (
          <div
            className={cn(
              "h-full rounded-egw-pill transition-[width] duration-panel ease-egw",
              onSky
                ? "bg-white"
                : [
                    tone === "action" && "bg-egw-action",
                    tone === "green" && "bg-egw-green",
                    tone === "amber" && "bg-egw-amber",
                    tone === "red" && "bg-egw-red",
                  ],
            )}
            style={{ width: `${pct}%` }}
          />
        ) : null}
      </div>
      {label ? (
        <div className={cn("egw-num mt-1.5 font-brand text-[11.5px] font-semibold", onSky ? "text-white/85" : "text-egw-ink-62")}>
          {label}
        </div>
      ) : null}
    </div>
  );
}

/* ── Checkbox (18px, angolo 5/2) ─────────────────────────────────────────── */
export const Checkbox = React.forwardRef<
  HTMLInputElement,
  Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "size"> & {
    indeterminate?: boolean;
    size?: 16 | 18;
  }
>(({ className, indeterminate, size = 18, ...props }, ref) => {
  const inner = React.useRef<HTMLInputElement | null>(null);
  React.useEffect(() => {
    if (inner.current) inner.current.indeterminate = Boolean(indeterminate);
  }, [indeterminate]);
  return (
    <span
      className="relative inline-flex shrink-0 items-center justify-center"
      style={{ width: size, height: size }}
    >
      <input
        ref={(node) => {
          inner.current = node;
          if (typeof ref === "function") ref(node);
          else if (ref) ref.current = node;
        }}
        type="checkbox"
        className={cn(
          "peer absolute inset-0 m-0 cursor-pointer appearance-none rounded-egw-check border-[1.5px] border-[rgba(11,26,58,.3)] bg-white transition-colors duration-hover checked:border-transparent checked:bg-egw-action indeterminate:border-transparent indeterminate:bg-egw-action focus-visible:outline-none focus-visible:shadow-egw-focus disabled:cursor-not-allowed disabled:opacity-40",
          className,
        )}
        {...props}
      />
      <svg
        viewBox="0 0 16 16"
        aria-hidden
        className="pointer-events-none relative hidden h-3 w-3 text-white peer-checked:block"
      >
        <path d="M3.5 8.5l3 3 6-7" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span
        aria-hidden
        className="pointer-events-none absolute hidden h-[2px] w-2 rounded-full bg-white peer-indeterminate:block"
      />
    </span>
  );
});
Checkbox.displayName = "Checkbox";

/* ── Toggle 40×22 ────────────────────────────────────────────────────────── */
export function Toggle({
  checked,
  onCheckedChange,
  disabled,
  "aria-label": ariaLabel,
  id,
}: {
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
  disabled?: boolean;
  "aria-label"?: string;
  id?: string;
}) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        "relative inline-flex h-[22px] w-10 shrink-0 items-center rounded-egw-pill transition-colors duration-press ease-egw focus-visible:outline-none focus-visible:shadow-egw-focus disabled:cursor-not-allowed disabled:opacity-40",
        checked ? "bg-egw-action" : "bg-[rgba(11,26,58,.18)]",
      )}
    >
      <span
        className={cn(
          "absolute top-[2px] h-[18px] w-[18px] rounded-full bg-white shadow-[0_1px_2px_rgba(11,26,58,.25)] transition-[left] duration-press ease-egw",
          checked ? "left-[20px]" : "left-[2px]",
        )}
      />
    </button>
  );
}
