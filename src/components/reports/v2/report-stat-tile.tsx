"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Eyebrow, InsetBlock } from "@/components/web/primitives/Surface";
import { Skeleton } from "@/components/web/primitives/Controls";
import { MISSING } from "@/lib/web/format";

/**
 * Un numero **dentro** un pannello (guideline 09 §9.3): la stessa anatomia
 * della KPI card — occhiello, valore tabellare, una riga che lo qualifica —
 * ma a piano 0 su `--egw-page-100`, perche una card dentro una card e
 * vietata. Le fondamenta hanno solo la `KpiCard` a piano 1: questa e la sua
 * forma annidata, candidata alla promozione.
 *
 * `owner` e la riga «chi possiede il numero» del riepilogo gestionale: il
 * percorso del modulo server, non una parafrasi. Non e un dettaglio da
 * sviluppatori: e la risposta a «perche qui e diverso dall'altra pagina».
 */
export function ReportStatTile({
  label,
  value,
  qualifier,
  owner,
  tone = "neutral",
  loading,
  className,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  qualifier?: React.ReactNode;
  owner?: string;
  tone?: "neutral" | "amber";
  loading?: boolean;
  className?: string;
}) {
  return (
    <InsetBlock
      className={cn(
        "min-w-0",
        tone === "amber" && "border-egw-tint-amber-bd bg-egw-tint-amber",
        className,
      )}
    >
      <Eyebrow tone={tone === "amber" ? "amber" : "ink"}>{label}</Eyebrow>
      {loading ? (
        <Skeleton className="mt-3 h-7 w-24" />
      ) : (
        <p className="egw-num mt-2.5 break-words font-brand text-[24px] font-extrabold leading-none text-egw-ink">
          {value ?? MISSING}
        </p>
      )}
      {qualifier ? (
        <p className="mt-1.5 font-brand text-[11.5px] leading-[1.45] text-egw-ink-62">
          {qualifier}
        </p>
      ) : null}
      {owner ? (
        <p className="egw-num mt-2 break-all font-brand text-[10px] leading-tight text-egw-ink-42">
          {owner}
        </p>
      ) : null}
    </InsetBlock>
  );
}

/** La riga di tessere dentro un pannello: da una a quattro colonne, mai due fisse a 375 px. */
export function ReportStatGrid({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(100%,190px),1fr))]",
        className,
      )}
    >
      {children}
    </div>
  );
}
