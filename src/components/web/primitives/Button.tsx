"use client";

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Il pulsante del Web V2 (guideline 08 §8.4, 05 §5.6, 10 §10.4).
 *
 * Otto varianti, e **una sola** in gradiente per schermata: `primary`.
 * `neutral` (navy pieno) e il primario che non deve competere con un gradiente
 * gia presente. `danger` e un contorno rosso, mai un riempimento: la
 * distruzione non domina una tabella. Sul cielo si usano `ghost-on-sky` e
 * `inverted-on-sky`, perche il gradiente su blu e vietato.
 *
 * Tutti e sei gli stati sono definiti: riposo, hover (un passo di fondo, 90ms),
 * focus visibile (anello), premuto (1px giu, 110ms, nessuna scala), disabilitato
 * (solo per «temporaneamente non disponibile»: un permesso negato e assenza).
 * In caricamento l'etichetta resta e un anello di 14px sostituisce l'icona.
 */
export type ButtonVariant =
  | "primary"
  | "neutral"
  | "secondary"
  | "row"
  | "text"
  | "danger"
  | "ghost-on-sky"
  | "inverted-on-sky";

export type ButtonSize = "md" | "sm" | "xs";

const base =
  "inline-flex shrink-0 select-none items-center justify-center gap-2 whitespace-nowrap font-brand font-semibold leading-none transition-[background-color,border-color,box-shadow,filter,transform] duration-hover ease-egw focus-visible:outline-none disabled:cursor-not-allowed disabled:border-transparent disabled:bg-[rgba(11,26,58,.06)] disabled:text-egw-ink-42 disabled:shadow-none disabled:filter-none active:translate-y-px";

const variants: Record<ButtonVariant, string> = {
  primary:
    "rounded-egw-control border border-white/30 bg-egw-action text-white shadow-egw-glow hover:brightness-[1.06] active:brightness-[1.08] focus-visible:shadow-[var(--egw-focus-ring-dark)]",
  neutral:
    "rounded-egw-control border border-transparent bg-egw-navy-800 text-white hover:brightness-[1.1] focus-visible:shadow-egw-focus",
  secondary:
    "rounded-egw-control border border-egw-control-border bg-white text-egw-ink hover:border-[rgba(37,99,235,.32)] hover:bg-white focus-visible:border-egw-blue focus-visible:shadow-egw-focus active:bg-egw-page-050",
  row: "rounded-egw-micro border border-[rgba(11,26,58,.14)] bg-white text-egw-ink-62 hover:border-[rgba(37,99,235,.32)] hover:text-egw-ink focus-visible:border-egw-blue focus-visible:shadow-egw-focus",
  text: "rounded-egw-control border border-transparent bg-transparent text-egw-blue-700 hover:bg-egw-page-100 focus-visible:shadow-egw-focus",
  danger:
    "rounded-egw-control border-[1.5px] border-egw-red bg-white text-egw-red hover:bg-egw-tint-red focus-visible:shadow-egw-focus-danger",
  "ghost-on-sky":
    "rounded-egw-control border border-white/26 bg-white/14 text-white hover:bg-white/22 focus-visible:shadow-[var(--egw-focus-ring-dark)]",
  "inverted-on-sky":
    "rounded-egw-control border border-transparent bg-white text-egw-navy-800 hover:brightness-[.97] focus-visible:shadow-[var(--egw-focus-ring-dark)]",
};

const sizes: Record<ButtonSize, string> = {
  md: "h-10 px-4 text-[13px]",
  sm: "h-8 px-3 text-[12.5px]",
  xs: "h-7 px-2.5 text-[11.5px]",
};

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Renderizza il figlio come elemento (es. `<Link>`), mantenendo lo stile. */
  asChild?: boolean;
  loading?: boolean;
  /** Icona in testa; in caricamento viene sostituita dall'anello. */
  icon?: React.ReactNode;
  /** Icona in coda (es. la freccia del primario di pagina). */
  trailingIcon?: React.ReactNode;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = "secondary",
      size = "md",
      asChild = false,
      loading = false,
      icon,
      trailingIcon,
      children,
      disabled,
      type,
      ...props
    },
    ref,
  ) => {
    const Comp = asChild ? Slot : "button";
    const leading = loading ? (
      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
    ) : (
      icon
    );
    return (
      <Comp
        ref={ref}
        className={cn(base, variants[variant], sizes[size], className)}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        type={asChild ? undefined : type || "button"}
        {...props}
      >
        {asChild ? (
          children
        ) : (
          <>
            {leading ? (
              <span className="inline-flex shrink-0 items-center [&>svg]:h-[15px] [&>svg]:w-[15px]">
                {leading}
              </span>
            ) : null}
            {children}
            {trailingIcon ? (
              <span className="inline-flex shrink-0 items-center [&>svg]:h-[14px] [&>svg]:w-[14px]">
                {trailingIcon}
              </span>
            ) : null}
          </>
        )}
      </Comp>
    );
  },
);
Button.displayName = "Button";

/**
 * Il pulsante di sola icona: porta sempre un `aria-label` in italiano e un
 * riquadro di almeno 32px anche con il glifo a 13px (guideline 05 §5.9).
 */
export interface IconButtonProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  "aria-label": string;
  variant?: "row" | "secondary" | "text" | "ghost-on-sky" | "danger";
  size?: "md" | "sm" | "xs";
  children: React.ReactNode;
  loading?: boolean;
}

const iconSizes = {
  md: "h-[38px] w-[38px] [&>svg]:h-[17px] [&>svg]:w-[17px]",
  sm: "h-8 w-8 [&>svg]:h-[15px] [&>svg]:w-[15px]",
  xs: "h-[26px] w-[26px] [&>svg]:h-[13px] [&>svg]:w-[13px]",
};

export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  (
    { className, variant = "row", size = "sm", children, loading, disabled, type, ...props },
    ref,
  ) => (
    <button
      ref={ref}
      type={type || "button"}
      title={props.title ?? props["aria-label"]}
      className={cn(
        base,
        "p-0",
        variants[variant],
        variant === "row" && "rounded-egw-micro",
        iconSizes[size],
        className,
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? <Loader2 className="animate-spin" aria-hidden /> : children}
    </button>
  ),
);
IconButton.displayName = "IconButton";
