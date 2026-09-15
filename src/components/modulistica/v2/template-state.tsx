"use client";

import * as React from "react";
import { DataChip, StatusPill } from "@/components/web/primitives/StatusPill";
import { formatDateShort, formatInteger, MISSING } from "@/lib/web/format";
import type { DocumentTemplateSummary } from "@/lib/api/documents";
import { describeTemplateVersion, templateStatusSpec } from "@/components/modulistica/v2/modulistica-model";

const formatDate = (value: string | null) => (value ? formatDateShort(value) : MISSING);

/**
 * Lo stato di un modello, detto per intero: la pillola, la versione
 * pubblicata (o «Mai pubblicato»), il chip «Modifiche non pubblicate» e
 * quanti documenti ha prodotto. E la riga che la V1 metteva sotto ogni
 * card; qui sta nell'intestazione dell'editor e nel cassetto di generazione.
 */
export function TemplateStateLine({ template, className }: { template: DocumentTemplateSummary; className?: string }) {
  return (
    <div className={className ? `flex flex-wrap items-center gap-2 ${className}` : "flex flex-wrap items-center gap-2"}>
      <StatusPill status={templateStatusSpec(template.status)} />
      <span className="font-brand text-[12px] text-egw-ink-62">{describeTemplateVersion(template, formatDate)}</span>
      {template.hasUnpublishedChanges ? (
        <DataChip size="sm" tone="blue">
          Modifiche non pubblicate
        </DataChip>
      ) : null}
      {template.generatedCount > 0 ? (
        <span className="font-brand text-[12px] text-egw-ink-62">
          <span className="egw-num font-bold text-egw-ink">{formatInteger(template.generatedCount)}</span> {template.generatedCount === 1 ? "documento prodotto" : "documenti prodotti"}
        </span>
      ) : null}
    </div>
  );
}
