"use client";

import React from "react";
import { cn } from "@/lib/utils";
import Image from "next/image";
import { ProgressBar } from "@/components/web/primitives/Controls";
import iconBrand from "@/../public/images/brand/icon-w.png";

/**
 * Attese dell'applicazione, con una voce sola.
 *
 * La versione precedente animava cerchi pulsanti, puntini rimbalzanti e due
 * gradienti radiali: rumore che non diceva nulla su cosa stesse succedendo.
 * Qui restano il marchio, una frase che nomina l'operazione e una barra
 * indeterminata. `role="status"` fa annunciare l'attesa agli screen reader,
 * e `prefers-reduced-motion` ferma l'animazione (vedi globals.css).
 */
type AppLoadingScreenProps = {
  title?: string;
  subtitle?: string;
  compact?: boolean;
  className?: string;
};

export function AppLoadingScreen({
  title = "EasyGame",
  subtitle = "Carico i dati",
  compact = false,
  className,
}: AppLoadingScreenProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "rounded-egw-panel border border-egw-panel-border bg-white font-brand shadow-egw-plane-1",
        compact ? "p-5" : "p-8",
        className,
      )}
    >
      <div className="flex flex-col items-center text-center">
        <span className="inline-flex h-12 w-12 items-center justify-center rounded-egw-chip bg-egw-action shadow-egw-glow">
          <Image src={iconBrand} alt="" aria-hidden width={26} height={26} className="h-[26px] w-[26px] object-contain" />
        </span>

        <div className="mt-4 space-y-1">
          <p className="font-brand text-base font-semibold tracking-tight text-egw-ink">
            {title}
          </p>
          <p className="text-sm text-egw-ink-62">{subtitle}</p>
        </div>

        <ProgressBar value={null} className="mt-5 w-40" />
      </div>
    </div>
  );
}

type AppBlockingOverlayProps = {
  visible: boolean;
  title?: string;
  subtitle?: string;
};

export function AppBlockingOverlay({
  visible,
  title = "EasyGame",
  subtitle = "Operazione in corso",
}: AppBlockingOverlayProps) {
  if (!visible) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-[var(--egw-scrim)] px-4">
      <AppLoadingScreen
        title={title}
        subtitle={subtitle}
        className="w-full max-w-sm shadow-egw-plane-1"
      />
    </div>
  );
}

/**
 * Scheletro di una lista mentre arriva.
 *
 * Preferibile a uno spinner a tutta pagina: tiene lo spazio che il contenuto
 * occupera, quindi la pagina non salta quando i dati arrivano.
 */
export function ListSkeleton({
  rows = 5,
  className,
}: {
  rows?: number;
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className={cn("space-y-2", className)}
    >
      <span className="sr-only">Carico l&apos;elenco</span>
      {Array.from({ length: rows }).map((_, index) => (
        <div
          key={index}
          className="flex items-center gap-3 rounded-egw-control border border-egw-hairline bg-white p-3"
        >
          <div className="h-9 w-9 shrink-0 egw-skeleton rounded-full" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="h-3 w-1/3 egw-skeleton rounded-egw-micro" />
            <div className="h-3 w-1/5 egw-skeleton rounded-egw-micro" />
          </div>
          <div className="hidden h-3 w-16 egw-skeleton rounded-egw-micro sm:block" />
        </div>
      ))}
    </div>
  );
}

/** Scheletro per le griglie di schede riassuntive. */
export function CardsSkeleton({
  cards = 3,
  className,
}: {
  cards?: number;
  className?: string;
}) {
  return (
    <div
      aria-hidden
      className={cn("grid gap-4 sm:grid-cols-2 lg:grid-cols-3", className)}
    >
      {Array.from({ length: cards }).map((_, index) => (
        <div
          key={index}
          className="egw-skeleton h-24 rounded-egw-field"
        />
      ))}
    </div>
  );
}
