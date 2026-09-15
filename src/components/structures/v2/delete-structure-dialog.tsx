"use client";

import * as React from "react";
import { DangerConfirmDialog } from "@/components/web/overlays/Modal";
import type { ClubStructure } from "@/lib/structures-utils";
import { countEventsUsingStructure, pluralize } from "@/components/structures/v2/structure-model";

/**
 * La conferma distruttiva di una struttura (guideline 08 §8.9: un record,
 * modale rosso, **cosa se ne va**, nessuna conferma scritta).
 *
 * Sostituisce l'`AlertDialog` V1 «Eliminare la struttura?» con le stesse
 * conseguenze — campi, tariffe, pagamenti — piu quelle che la V1 taceva: le
 * prenotazioni (anche della famiglia) e gli allenamenti e le gare che la
 * indicano come luogo, che restano senza struttura. Quel conteggio si legge
 * **all'apertura** dalle proiezioni storiche (`getClubTrainings`,
 * `getClubData("matches")`), tollerando il fallimento: la conferma non
 * dipende da una lettura in piu.
 */
export function DeleteStructureDialog({
  open,
  onOpenChange,
  structure,
  clubId,
  onConfirm,
  loading,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  structure: ClubStructure | null;
  clubId: string | null;
  onConfirm: () => void | Promise<void>;
  loading?: boolean;
}) {
  const [usage, setUsage] = React.useState<{ trainings: number; matches: number } | null>(null);

  React.useEffect(() => {
    if (!open || !structure || !clubId) {
      setUsage(null);
      return;
    }
    let cancelled = false;
    const load = async () => {
      try {
        const { getClubTrainings, getClubData } = await import("@/lib/simplified-db");
        const [trainings, matches] = await Promise.allSettled([getClubTrainings(clubId), getClubData(clubId, "matches")]);
        if (cancelled) return;
        const read = (result: PromiseSettledResult<unknown>) =>
          result.status === "fulfilled" && Array.isArray(result.value) ? (result.value as unknown[]) : [];
        setUsage({
          trainings: countEventsUsingStructure(read(trainings), structure.id),
          matches: countEventsUsingStructure(read(matches), structure.id),
        });
      } catch {
        if (!cancelled) setUsage(null);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [open, structure, clubId]);

  if (!structure) return null;

  const fieldsCount = structure.fields.length;
  const pricingCount = structure.fields.reduce((total, field) => total + field.pricing.length, 0);
  const paymentsCount = structure.payments.length;
  const bookingsCount = (structure.bookings || []).length;
  const eventsLine = usage
    ? usage.trainings + usage.matches > 0
      ? `${[usage.trainings ? pluralize(usage.trainings, "allenamento", "allenamenti") : null, usage.matches ? pluralize(usage.matches, "gara", "gare") : null]
          .filter(Boolean)
          .join(" e ")} la indicano come luogo e restano senza struttura`
      : "Nessun allenamento o gara la indica come luogo"
    : "Gli allenamenti e le gare che la indicano come luogo restano senza struttura";

  return (
    <DangerConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Eliminare ${structure.name || "la struttura"}?`}
      description="Questa azione eliminerà anche campi, tariffe e pagamenti associati."
      consequences={[
        fieldsCount ? `${pluralize(fieldsCount, "campo", "campi")} con le fasce orarie e ${pluralize(pricingCount, "tariffa", "tariffe")}` : "I campi e le tariffe (nessuno configurato)",
        paymentsCount ? `${pluralize(paymentsCount, "pagamento d'affitto", "pagamenti d'affitto")} e il contratto` : "Il contratto d'affitto e i pagamenti (nessuno registrato)",
        bookingsCount ? `${pluralize(bookingsCount, "prenotazione", "prenotazioni")}, comprese quelle chieste dalle famiglie` : "Le prenotazioni (nessuna registrata)",
        eventsLine,
      ]}
      confirmLabel="Elimina"
      onConfirm={onConfirm}
      loading={loading}
    />
  );
}
