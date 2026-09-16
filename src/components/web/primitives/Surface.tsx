"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * **Su che fondo sono?** Il cielo (ambienti 2 e 3) e blu scuro: un testo
 * d'inchiostro o una tinta al 10% che vi poggiano direttamente non si leggono.
 * I contenitori che dipingono il cielo lo dichiarano con `SkyProvider`; ogni
 * `Panel` — che e bianco — lo azzera per cio che contiene. Le primitive che
 * hanno una forma «sul cielo» (`AlertBlock`, `Eyebrow`) la scelgono da qui,
 * cosi la regressione «inchiostro scuro su fondo scuro» non dipende da chi
 * monta la pagina.
 */
const SkyContext = React.createContext(false);

export function SkyProvider({ onSky = true, children }: { onSky?: boolean; children: React.ReactNode }) {
  return <SkyContext.Provider value={onSky}>{children}</SkyContext.Provider>;
}

export const useOnSky = () => React.useContext(SkyContext);

/**
 * Le superfici del Web V2 (guideline 05 §5.4, 09 §9.3).
 *
 * Tre piani, mai un quarto. `Panel` e il piano 1 (pannello di contenuto,
 * angolo tagliato in basso a destra, ombra morbida). `InsetBlock` e il piano 0
 * su `--egw-page-100`: e cio in cui **deve** cadere un blocco annidato dentro
 * un pannello — un pannello dentro un pannello e vietato.
 */
export interface PanelProps extends React.HTMLAttributes<HTMLDivElement> {
  /** `sm` usa il raggio della griglia (18/6). */
  radius?: "md" | "sm";
  /** Senza padding interno (la griglia gestisce il proprio). */
  flush?: boolean;
  as?: "div" | "section" | "article" | "aside" | "header";
}

export const Panel = React.forwardRef<HTMLDivElement, PanelProps>(
  ({ className, radius = "md", flush = false, as = "div", ...props }, ref) => {
    const Comp = as as "div";
    return (
      <SkyContext.Provider value={false}>
        <Comp
          ref={ref}
          className={cn(
            "border border-egw-panel-border bg-egw-panel shadow-egw-plane-1",
            radius === "sm" ? "rounded-egw-panel-sm" : "rounded-egw-panel",
            !flush && "p-6",
            className,
          )}
          {...props}
        />
      </SkyContext.Provider>
    );
  },
);
Panel.displayName = "Panel";

export const InsetBlock = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { dashed?: boolean }
>(({ className, dashed, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "rounded-egw-field border border-egw-hairline bg-egw-page-100 p-4",
      dashed && "border-dashed border-[rgba(11,26,58,.22)] bg-transparent",
      className,
    )}
    {...props}
  />
));
InsetBlock.displayName = "InsetBlock";

/** L'occhiello: 700/10 +0.12em maiuscolo, inchiostro 42%. */
export const Eyebrow = React.forwardRef<
  HTMLSpanElement,
  React.HTMLAttributes<HTMLSpanElement> & { as?: "span" | "p" | "h2" | "h3" | "div"; tone?: "ink" | "white" | "blue" | "red" | "amber" }
>(({ className, as = "span", tone = "ink", ...props }, ref) => {
  const Comp = as as "span";
  return (
    <Comp
      ref={ref}
      className={cn(
        "block font-brand text-[10px] font-bold uppercase leading-none tracking-[var(--egw-track-eyebrow)]",
        tone === "ink" && "text-egw-ink-42",
        tone === "white" && "text-white/72",
        tone === "blue" && "text-egw-blue-700",
        tone === "red" && "text-egw-red",
        tone === "amber" && "text-egw-amber-ink",
        className,
      )}
      {...props}
    />
  );
});
Eyebrow.displayName = "Eyebrow";

/**
 * Intestazione di pannello: occhiello + titolo 700/15 + descrizione, con uno
 * slot azioni a destra. Un'icona di modifica 24px in alto a destra e il
 * pattern della «Detail card».
 */
export function PanelHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
  titleAs: TitleTag = "h2",
}: {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
  titleAs?: "h1" | "h2" | "h3" | "h4";
}) {
  return (
    <div className={cn("mb-4 flex items-start justify-between gap-4", className)}>
      <div className="min-w-0">
        {eyebrow ? <Eyebrow className="mb-2">{eyebrow}</Eyebrow> : null}
        <TitleTag className="font-brand text-[15px] font-bold leading-5 text-egw-ink">
          {title}
        </TitleTag>
        {description ? (
          <p className="mt-1 font-brand text-[12.5px] leading-[1.5] text-egw-ink-62">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}

/** Un filo sottile fra due blocchi pari dentro un pannello. */
export function Hairline({ className }: { className?: string }) {
  return <div className={cn("h-px w-full bg-egw-hairline", className)} role="presentation" />;
}
