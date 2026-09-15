"use client";

import * as React from "react";
import { Button } from "@/components/web/primitives/Button";
import { DetailCard, InfoCard } from "@/components/web/page/Cards";
import { formatInteger, formatMoney } from "@/lib/web/format";
import { planKindLabel, type InstallmentRow } from "@/components/sport-work/v2/sport-work-model";

/**
 * Il pannello del **piano compensi** nella scheda del rapporto: forma,
 * numero di scadenze, importo, e il verbo che lo crea o lo rifa.
 *
 * **Rifare il piano cancella le scadenze e le riscrive**, per questo il
 * pulsante non c'e quando una scadenza ha gia ricevuto denaro: quelle righe
 * sono collegate a movimenti del registro (la V1 lo disabilitava con un
 * `title`; qui il motivo e scritto accanto, e l'azione e assente).
 */
export function PlanSection({
  plan,
  installments,
  canManage,
  onEdit,
}: {
  plan: any | null;
  installments: InstallmentRow[];
  canManage: boolean;
  onEdit: () => void;
}) {
  const paidSomething = installments.some((row) => Number(row.paid_amount) > 0);

  if (!plan) {
    return (
      <DetailCard
        eyebrow="Compensi"
        title="Piano compensi"
        actions={
          canManage ? (
            <Button variant="secondary" size="sm" onClick={onEdit}>
              Crea il piano
            </Button>
          ) : null
        }
      >
        <p className="font-brand text-[12.5px] leading-[1.5] text-egw-ink-62">
          Nessun piano: le scadenze nascono dal piano compensi. Le scadenze nascono programmate e maturano quando il loro periodo è trascorso, non quando qualcuno lo dice.
        </p>
      </DetailCard>
    );
  }

  return (
    <DetailCard
      eyebrow="Compensi"
      title="Piano compensi"
      fields={[
        { label: "Forma", value: planKindLabel(plan.kind) },
        { label: "Scadenze", value: <span className="egw-num">{formatInteger(installments.length)}</span> },
        { label: "Importo complessivo", value: <span className="egw-num font-bold">{formatMoney(plan.total_amount)}</span> },
      ]}
      actions={
        canManage && !paidSomething ? (
          <Button variant="secondary" size="sm" onClick={onEdit}>
            Rifai il piano
          </Button>
        ) : null
      }
    >
      {paidSomething ? (
        <InfoCard eyebrow="Perché non si rifà" className="mt-4">
          Alcune scadenze hanno già ricevuto denaro: rifare il piano cancellerebbe righe collegate a movimenti del registro. Per correggere, annulla le rate residue e aggiungine di nuove.
        </InfoCard>
      ) : null}
    </DetailCard>
  );
}
