"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { SegmentedControl } from "@/components/web/primitives/Controls";
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
 * E una scelta di vista, non un filtro: cambia pagina. Il conteggio delle
 * persone in prova lo chiede da se, e solo a chi puo leggerle (`trials.read`):
 * a un ruolo che non le vede non mostra la voce, invece di mostrargliela e
 * poi rispondergli «accesso negato».
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
  const router = useRouter();
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

  return (
    <div className={cn("flex", className)} data-test="athletes-view-switch">
      <SegmentedControl<AthletesView>
        aria-label="Vista"
        value={value}
        onChange={(next) => {
          if (next === value) return;
          router.push(withClubId(next === "trials" ? "/athletes/in-prova" : "/athletes", clubId));
        }}
        options={[
          { value: "athletes", label: "Atleti", count: athletesCount ?? null },
          { value: "trials", label: "In prova", count: count },
        ]}
      />
    </div>
  );
}
