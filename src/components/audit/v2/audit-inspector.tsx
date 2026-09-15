"use client";

import * as React from "react";
import { getAccessRoleLabel } from "@/lib/access-roles";
import { Drawer, DrawerSection } from "@/components/web/overlays/Drawer";
import { StatusPill } from "@/components/web/primitives/StatusPill";
import { InsetBlock } from "@/components/web/primitives/Surface";
import { formatDateTime, MISSING } from "@/lib/web/format";
import { auditOutcomeSpec, metadataEntries, type AuditEvent } from "@/components/audit/v2/audit-model";

/**
 * L'ispettore di una riga del registro (392): tutto cio che la V1 metteva
 * nella card — attore, ruolo, risorsa, IP e ogni chiave dei metadati — che
 * in griglia sta in due chip e un «+3».
 */
export function AuditInspector({ event, onOpenChange }: { event: AuditEvent | null; onOpenChange: (open: boolean) => void }) {
  const rows = event
    ? [
        { label: "Quando", value: <span className="egw-num">{formatDateTime(event.created_at)}</span> },
        { label: "Chi", value: event.actor_email || MISSING },
        { label: "Ruolo", value: event.actor_role ? getAccessRoleLabel(event.actor_role) : MISSING },
        { label: "Risorsa", value: event.resource || MISSING },
        { label: "Identificativo", value: event.resource_id ? <span className="egw-num break-all">{event.resource_id}</span> : MISSING },
        { label: "IP", value: event.ip ? <span className="egw-num">{event.ip}</span> : MISSING },
      ]
    : [];
  const details = event ? metadataEntries(event.metadata) : [];
  return (
    <Drawer
      open={Boolean(event)}
      onOpenChange={onOpenChange}
      width="narrow"
      eyebrow="Operazione"
      title={<span className="font-mono text-[15px]">{event?.action || ""}</span>}
      headerAside={event ? <StatusPill status={auditOutcomeSpec(event.outcome)} /> : null}
      data-test="audit-inspector"
    >
      {event ? (
        <>
          <DrawerSection eyebrow="Chi e dove">
            <InsetBlock className="p-0">
              <dl className="divide-y divide-egw-rule">
                {rows.map((row) => (
                  <div key={row.label} className="flex items-baseline justify-between gap-4 px-4 py-2.5">
                    <dt className="shrink-0 font-brand text-[12px] text-egw-ink-62">{row.label}</dt>
                    <dd className="min-w-0 text-right font-brand text-[13px] font-semibold text-egw-ink">{row.value}</dd>
                  </div>
                ))}
              </dl>
            </InsetBlock>
          </DrawerSection>
          <DrawerSection eyebrow="Dettagli" title={details.length ? undefined : "Nessun dettaglio registrato"}>
            {details.length ? (
              <InsetBlock className="p-0">
                <dl className="divide-y divide-egw-rule">
                  {details.map((entry) => (
                    <div key={entry.key} className="flex flex-col gap-0.5 px-4 py-2.5">
                      <dt className="font-mono text-[11px] text-egw-ink-62">{entry.key}</dt>
                      <dd className="break-words font-brand text-[13px] text-egw-ink">{entry.value}</dd>
                    </div>
                  ))}
                </dl>
              </InsetBlock>
            ) : null}
          </DrawerSection>
        </>
      ) : null}
    </Drawer>
  );
}
