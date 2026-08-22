"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { EasyGameLogo } from "@/components/brand/easygame-logo";

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
        "rounded-xl border border-slate-200 bg-white",
        compact ? "p-5" : "p-8",
        className,
      )}
    >
      <div className="flex flex-col items-center text-center">
        <EasyGameLogo className="h-12 w-12" />

        <div className="mt-4 space-y-1">
          <p className="font-display text-base font-semibold tracking-tight text-slate-900">
            {title}
          </p>
          <p className="text-sm text-slate-500">{subtitle}</p>
        </div>

        <div
          aria-hidden
          className="mt-5 h-1 w-40 overflow-hidden rounded-full bg-slate-100"
        >
          <div className="h-full w-1/3 animate-[eg-progress_1.4s_ease-in-out_infinite] rounded-full bg-[var(--eg-blue)]" />
        </div>
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
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/40 px-4">
      <AppLoadingScreen
        title={title}
        subtitle={subtitle}
        className="w-full max-w-sm shadow-lg"
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
          className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-3"
        >
          <div className="h-9 w-9 shrink-0 animate-pulse rounded-full bg-slate-100" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="h-3 w-1/3 animate-pulse rounded bg-slate-100" />
            <div className="h-3 w-1/5 animate-pulse rounded bg-slate-100" />
          </div>
          <div className="hidden h-3 w-16 animate-pulse rounded bg-slate-100 sm:block" />
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
          className="h-24 animate-pulse rounded-xl border border-slate-200 bg-white"
        />
      ))}
    </div>
  );
}
