"use client";

import * as React from "react";
import Link from "next/link";
import { withClubId } from "@/components/web/hooks/use-route-club-id";
import { roleHasPermission } from "@/lib/permissions/catalog";
import { listTrialAthletes } from "@/lib/trials/client";
import { cn } from "@/lib/utils";

export type AthletesView = "athletes" | "trials";

/**
 * Le due viste dell'area Atleti, una accanto all'altra: **Atleti** e
 * **In prova** (ADR-0188). Prima «Atleti in prova» stava nel menu a tre
 * puntini, e chi apriva l'area non sapeva che esistesse.
 *
 * Sono due **pagine**, quindi due link con `aria-current` — non una tablist
 * (una tablist promette pannelli e frecce, e qui si cambia indirizzo). La
 * forma e quella del `SegmentedControl`. Il conteggio delle persone in prova
 * lo chiede da se, e solo a chi puo leggerle (`trials.read`).
 */
export function AthletesViewSwitch({
  value,
  clubId,
  role,
  athletesCount,
  trialsCount,
  className,
}: {
  value: AthletesView;
  clubId: string | null;
  role: string | null;
  athletesCount?: number | null;
  /** Se la pagina lo sa gia (la vista «In prova»), non lo richiede. */
  trialsCount?: number | null;
  className?: string;
}) {
  const canReadTrials = roleHasPermission(role, "trials.read");
  const [count, setCount] = React.useState<number | null>(trialsCount ?? null);

  React.useEffect(() => {
    if (typeof trialsCount === "number") {
      setCount(trialsCount);
      return;
    }
    if (!canReadTrials || !clubId) return;
    let alive = true;
    listTrialAthletes({ status: "in_trial" })
      .then((rows) => {
        if (alive) setCount(rows.length);
      })
      .catch(() => {
        /* Il numero e un aiuto, non un dato: senza, la voce resta. */
      });
    return () => {
      alive = false;
    };
  }, [canReadTrials, clubId, trialsCount]);

  if (!canReadTrials) return null;

  const voci: Array<{ value: AthletesView; label: string; href: string; count: number | null }> = [
    { value: "athletes", label: "Atleti", href: withClubId("/athletes", clubId), count: athletesCount ?? null },
    { value: "trials", label: "In prova", href: withClubId("/athletes/in-prova", clubId), count },
  ];

  return (
    <nav aria-label="Vista" className={cn("flex", className)} data-test="athletes-view-switch">
      <ul className="inline-flex items-center gap-0.5 rounded-egw-control border border-egw-hairline bg-egw-page-100 p-0.5">
        {voci.map((voce) => {
          const attiva = voce.value === value;
          return (
            <li key={voce.value}>
              <Link
                href={voce.href}
                aria-current={attiva ? "page" : undefined}
                className={cn(
                  "inline-flex h-8 items-center gap-1.5 rounded-egw-chip px-3 font-brand text-[12.5px] transition-colors focus-visible:outline-none focus-visible:shadow-egw-focus",
                  attiva ? "bg-white font-bold text-egw-ink shadow-egw-plane-1" : "font-medium text-egw-ink-72 hover:text-egw-ink",
                )}
              >
                {voce.label}
                {voce.count != null ? (
                  <span className={cn("egw-num rounded-full px-1.5 text-[10.5px]", attiva ? "bg-egw-tint-blue text-egw-blue-800" : "bg-white text-egw-ink-62")}>
                    {voce.count}
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
