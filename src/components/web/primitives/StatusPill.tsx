import * as React from "react";
import { cn } from "@/lib/utils";
import {
  resolveStatus,
  type StatusHue,
  type StatusSpec,
  type StatusWeight,
} from "@/lib/web/status";

/**
 * La pillola di stato (guideline 09 §9.4): **l'unica** forma a raggio pieno
 * insieme all'avatar. Punto ad anello + etichetta in maiuscolo tracciato.
 * La parola c'e sempre; il colore da solo non e mai uno stato.
 *
 * Quattro pesi: quiet (non ti chiede niente) · outline (te lo chiedera) ·
 * solid (e lo stato di fatto) · urgent (blocca il lavoro).
 */
const hueSolid: Record<StatusHue, string> = {
  neutral: "bg-egw-navy-800 text-white",
  green: "bg-egw-green text-white",
  amber: "bg-egw-amber text-white",
  red: "bg-egw-red text-white",
  blue: "bg-egw-blue-700 text-white",
  orange: "bg-egw-orange text-white",
};

const hueOutline: Record<StatusHue, string> = {
  neutral: "border-[rgba(11,26,58,.4)] text-egw-ink",
  green: "border-egw-green text-egw-green",
  amber: "border-egw-amber text-egw-amber-ink",
  red: "border-egw-red text-egw-red",
  blue: "border-egw-blue-700 text-egw-blue-700",
  orange: "border-egw-orange text-egw-orange",
};

export interface StatusPillProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Una specifica del sistema, oppure un valore grezzo dell'API da risolvere. */
  status: StatusSpec | string | null | undefined;
  /** Un suffisso dopo l'etichetta: la data o i giorni di «in scadenza». */
  detail?: React.ReactNode;
  size?: "md" | "sm";
}

export function StatusPill({ status, detail, size = "md", className, ...props }: StatusPillProps) {
  const spec: StatusSpec =
    status && typeof status === "object" ? status : resolveStatus(status as string | null);
  const weight: StatusWeight = spec.weight;
  return (
    <span
      className={cn(
        "inline-flex w-fit shrink-0 items-center gap-1.5 whitespace-nowrap rounded-egw-pill border font-brand font-bold uppercase leading-none tracking-[var(--egw-track-pill)]",
        size === "md" ? "px-2.5 py-1 text-[9.5px]" : "px-2 py-[3px] text-[9px]",
        weight === "quiet" && "border-[rgba(11,26,58,.16)] bg-[rgba(11,26,58,.07)] text-egw-ink",
        weight === "outline" && cn("border-[1.5px] bg-white", hueOutline[spec.hue]),
        (weight === "solid" || weight === "urgent") &&
          cn("border-transparent", weight === "urgent" ? hueSolid.red : hueSolid[spec.hue]),
        className,
      )}
      data-status-weight={weight}
      {...props}
    >
      <span
        aria-hidden
        className={cn(
          "inline-block h-[5px] w-[5px] shrink-0 rounded-full border",
          weight === "quiet" && "border-egw-ink-42 bg-transparent",
          weight === "outline" && "border-current bg-transparent",
          (weight === "solid" || weight === "urgent") && "border-white/80 bg-white",
        )}
      />
      <span>{spec.label}</span>
      {detail ? <span className="opacity-90">{detail}</span> : null}
    </span>
  );
}

/**
 * Il chip dati (10/4 tagliato): categoria, sede, tag, contatore. **Mai** una
 * parola di stato — per quella c'e la pillola qui sopra.
 */
export interface DataChipProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: "neutral" | "blue" | "green" | "amber" | "red" | "orange" | "navy";
  /** Un puntino colorato in testa (il colore della categoria). */
  dot?: string | null;
  size?: "md" | "sm";
  onRemove?: () => void;
  removeLabel?: string;
}

const chipTones = {
  neutral: "border-[rgba(11,26,58,.12)] bg-egw-page-100 text-egw-ink-72",
  blue: "border-egw-tint-blue-bd bg-egw-tint-blue text-egw-blue-800",
  green: "border-egw-tint-green-bd bg-egw-tint-green text-egw-green",
  amber: "border-egw-tint-amber-bd bg-egw-tint-amber text-egw-amber-ink",
  red: "border-egw-tint-red-bd bg-egw-tint-red text-egw-red",
  orange: "border-egw-tint-orange-bd bg-egw-tint-orange text-egw-orange",
  navy: "border-transparent bg-egw-navy-800 text-white",
};

export function DataChip({
  tone = "neutral",
  dot,
  size = "md",
  onRemove,
  removeLabel = "Rimuovi",
  className,
  children,
  ...props
}: DataChipProps) {
  return (
    <span
      className={cn(
        "inline-flex w-fit max-w-full shrink-0 items-center gap-1.5 whitespace-nowrap rounded-egw-chip border font-brand font-medium leading-none",
        size === "md" ? "h-[26px] px-2.5 text-[11.5px]" : "h-[22px] px-2 text-[10.5px]",
        chipTones[tone],
        className,
      )}
      {...props}
    >
      {dot ? (
        <span
          aria-hidden
          className="inline-block h-2 w-2 shrink-0 rounded-full"
          style={{ background: dot }}
        />
      ) : null}
      <span className="egw-ellipsis">{children}</span>
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          aria-label={removeLabel}
          className="-mr-1 inline-flex h-4 w-4 items-center justify-center rounded-full text-current opacity-70 hover:opacity-100 focus-visible:outline-none focus-visible:shadow-egw-focus"
        >
          <svg viewBox="0 0 16 16" className="h-3 w-3" aria-hidden>
            <path
              d="M4 4l8 8M12 4l-8 8"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          </svg>
        </button>
      ) : null}
    </span>
  );
}

/** Il chip icona: quadrato tinteggiato con un glifo, per righe e avvisi. */
export function IconChip({
  tone = "blue",
  size = 34,
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & {
  tone?: "blue" | "green" | "amber" | "red" | "orange" | "neutral";
  size?: number;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-egw-chip border shadow-[inset_0_1px_0_rgba(255,255,255,.7)] [&>svg]:h-[17px] [&>svg]:w-[17px]",
        chipTones[tone === "neutral" ? "neutral" : tone],
        className,
      )}
      style={{ width: size, height: size }}
      {...props}
    >
      {children}
    </span>
  );
}
