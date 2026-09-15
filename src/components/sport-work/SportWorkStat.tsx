"use client";

import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * Un riquadro di numero, con un secondo numero sotto.
 *
 * Ha due righe e non una perche in questo dominio quasi ogni cifra ne ha
 * un'altra accanto che le da senso: pagato e costo del club, da pagare e
 * scaduto, maturato e programmato. Mostrarne una sola costringe chi legge a
 * indovinare quale delle due sta guardando.
 *
 * Viveva in `SportWorkShell.tsx`, tolto con la migrazione Web V2 delle pagine
 * del modulo (Wave E). Resta solo per `PersonCompensationTab`, la sezione
 * «Lavoro e compensi» delle schede atleta, allenatore e staff, che non e di
 * quelle rotte e verra migrata con loro.
 */
export function SportWorkStat({
  label,
  value,
  hint,
  tone = "default",
  icon,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "positive" | "warning" | "danger";
  icon?: React.ReactNode;
}) {
  const toneClass =
    tone === "positive"
      ? "text-emerald-600"
      : tone === "warning"
        ? "text-amber-600"
        : tone === "danger"
          ? "text-rose-600"
          : "text-slate-900 dark:text-slate-100";

  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className={cn("mt-1 text-2xl font-bold", toneClass)}>{value}</p>
            {hint ? (
              <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
            ) : null}
          </div>
          {icon ? <div className="shrink-0 text-slate-400">{icon}</div> : null}
        </div>
      </CardContent>
    </Card>
  );
}
