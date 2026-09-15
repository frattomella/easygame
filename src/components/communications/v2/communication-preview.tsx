"use client";

import * as React from "react";
import { Mail, Send, Users } from "lucide-react";
import { AUDIENCE_EXCLUSION_LABELS } from "@/lib/audience/recipients";
import { AlertBlock } from "@/components/web/page/Alerts";
import { HeaderStat } from "@/components/web/page/PageHeader";
import { Button } from "@/components/web/primitives/Button";
import { DataChip, StatusPill } from "@/components/web/primitives/StatusPill";
import { Eyebrow, InsetBlock, Panel, PanelHeader } from "@/components/web/primitives/Surface";
import { DataGrid } from "@/components/web/datagrid/DataGrid";
import type { ColumnDef, FilterDef, ViewDef } from "@/components/web/datagrid/types";
import { formatInteger, joinMeta, MISSING } from "@/lib/web/format";
import { ACCOUNT_STATUS, type StatusSpec } from "@/lib/web/status";
import { deliveryStatusSpec } from "@/components/communications/v2/communication-status";

/**
 * L'anteprima e l'esito di una comunicazione massiva (Web V2).
 *
 * **Perche l'anteprima non e facoltativa.** Un invio massivo e irreversibile
 * e raggiunge persone reali fuori dal prodotto: l'unico momento in cui si
 * puo correggere e **prima**. Il pulsante «Manda» esiste solo dopo aver
 * visto chi si raggiunge, chi no e con che motivo, e il messaggio **come lo
 * leggera il primo destinatario** — non un esempio con dati finti.
 *
 * I dati sono quelli che `POST /api/v1/communications { preview: true }`
 * gia mandava alla V1; l'elenco dei raggiungibili era nel payload e non
 * veniva disegnato — qui e una vista della stessa griglia degli esclusi.
 */
export type CommunicationPreview = {
  clubName: string;
  communicationId: string;
  criteriaLabel: string;
  reachable: Array<{ email: string; name: string; athleteNames: string[]; hasAccount: boolean }>;
  excluded: Array<{ athleteName: string; guardianName: string | null; email: string | null; reason: keyof typeof AUDIENCE_EXCLUSION_LABELS | string }>;
  counts: { recipients: number; positions: number; excluded: number };
  sample: { to: string; subject: string; text: string; unresolved: string[] } | null;
  invalidPlaceholders: string[];
  emailConfigured: boolean;
  canSend: boolean;
  blockedReason: string | null;
};

export type CommunicationOutcome = {
  totals: { sent: number; skipped: number; failed: number };
  remaining: number;
  deliveries: Array<{ email: string; name: string; status: "sent" | "skipped" | "failed"; reason: string | null }>;
};

/* ── Pannello dell'anteprima ─────────────────────────────────────────────── */

export function CommunicationPreviewPanel({
  preview,
  busy,
  onSend,
}: {
  preview: CommunicationPreview | null;
  busy: boolean;
  onSend: () => void;
}) {
  return (
    <Panel as="section" data-test="communication-preview">
      <PanelHeader
        eyebrow="Passo 2"
        title="Anteprima"
        description={
          preview
            ? "Cosi lo leggera il primo destinatario. Controlla i numeri prima di mandare."
            : "Scrivi il messaggio e premi «Vedi chi raggiungo»: nessun invio parte prima di questo passaggio."
        }
        actions={
          preview && preview.canSend ? (
            <Button variant="primary" icon={<Send />} loading={busy} onClick={onSend}>
              Manda a {formatInteger(preview.counts.recipients)}
            </Button>
          ) : null
        }
      />

      {preview ? (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
            <HeaderStat value={formatInteger(preview.counts.recipients)} label="raggiungibili" tone={preview.counts.recipients > 0 ? "green" : "ink"} />
            <HeaderStat value={formatInteger(preview.counts.excluded)} label="esclusi" tone={preview.counts.excluded > 0 ? "amber" : "ink"} />
            <HeaderStat value={formatInteger(preview.counts.positions)} label="posizioni" />
            <DataChip title={preview.criteriaLabel}>{preview.criteriaLabel}</DataChip>
          </div>

          {preview.blockedReason ? (
            <AlertBlock severity="warning" title="L'invio non puo partire">
              {preview.blockedReason}
            </AlertBlock>
          ) : null}

          {preview.sample ? (
            <InsetBlock>
              <Eyebrow className="mb-2">Come lo leggera {preview.sample.to}</Eyebrow>
              <p className="font-brand text-[13.5px] font-semibold text-egw-ink">{preview.sample.subject}</p>
              <pre className="mt-2 whitespace-pre-wrap break-words font-brand text-[12.5px] leading-[1.55] text-egw-ink-72">{preview.sample.text}</pre>
              {preview.sample.unresolved.length > 0 ? (
                <p className="mt-2 font-brand text-[11.5px] font-medium text-egw-amber-ink">
                  Senza valore: {preview.sample.unresolved.join(", ")}
                </p>
              ) : null}
            </InsetBlock>
          ) : null}
        </div>
      ) : (
        <InsetBlock dashed className="flex min-h-[120px] items-center justify-center">
          <p className="flex items-center gap-2 font-brand text-[12.5px] text-egw-ink-62">
            <Mail className="h-4 w-4" aria-hidden />
            Nessuna anteprima ancora.
          </p>
        </InsetBlock>
      )}
    </Panel>
  );
}

/* ── Griglia dei destinatari: raggiungibili ed esclusi ───────────────────── */

type RecipientRow = {
  id: string;
  kind: "reachable" | "excluded";
  name: string;
  email: string;
  athletes: string;
  hasAccount: boolean | null;
  reason: string;
};

const REACHABLE_SPEC: StatusSpec = Object.freeze({ label: "RAGGIUNGIBILE", weight: "solid", hue: "green" });
const EXCLUDED_SPEC: StatusSpec = Object.freeze({ label: "ESCLUSO", weight: "outline", hue: "amber" });

const exclusionLabel = (reason: string) => (AUDIENCE_EXCLUSION_LABELS as Record<string, string>)[reason] || reason;

export const recipientRowsFrom = (preview: CommunicationPreview): RecipientRow[] => [
  ...preview.reachable.map((row, index) => ({
    id: `r-${row.email || index}`,
    kind: "reachable" as const,
    name: row.name,
    email: row.email,
    athletes: row.athleteNames.join(", "),
    hasAccount: row.hasAccount,
    reason: "",
  })),
  ...preview.excluded.map((row, index) => ({
    id: `x-${row.athleteName}-${row.email || index}`,
    kind: "excluded" as const,
    name: row.guardianName || row.athleteName,
    email: row.email || "",
    athletes: row.athleteName,
    hasAccount: null,
    reason: exclusionLabel(String(row.reason)),
  })),
];

const RECIPIENT_COLUMNS: ColumnDef<RecipientRow>[] = [
  {
    id: "name",
    header: "Destinatario",
    kind: "identity",
    locked: true,
    width: 1.6,
    cell: (row) => (
      <span className="min-w-0">
        <span className="egw-ellipsis block font-brand text-[12.5px] font-semibold text-egw-ink">{row.name || MISSING}</span>
        <span className="egw-ellipsis block font-brand text-[10px] text-[rgba(11,26,58,.5)]">{joinMeta(row.email) || MISSING}</span>
      </span>
    ),
    sortValue: (row) => row.name.toLowerCase(),
    title: (row) => joinMeta(row.name, row.email),
  },
  {
    id: "status",
    header: "Stato",
    kind: "status",
    cell: (row) => <StatusPill status={row.kind === "reachable" ? REACHABLE_SPEC : EXCLUDED_SPEC} />,
    sortValue: (row) => row.kind,
  },
  {
    id: "athletes",
    header: "Atleti",
    kind: "text",
    width: 1.4,
    cell: (row) => row.athletes,
    sortValue: (row) => row.athletes.toLowerCase(),
    title: (row) => row.athletes,
  },
  {
    id: "reason",
    header: "Motivo",
    kind: "text",
    width: 1.4,
    cell: (row) => row.reason,
    sortValue: (row) => row.reason,
    title: (row) => row.reason || undefined,
  },
  {
    id: "account",
    header: "Account",
    kind: "status",
    hidden: true,
    cell: (row) => (row.hasAccount === null ? MISSING : <StatusPill status={row.hasAccount ? ACCOUNT_STATUS.linked : ACCOUNT_STATUS.none} size="sm" />),
    sortValue: (row) => (row.hasAccount === null ? null : row.hasAccount ? 1 : 0),
  },
];

const RECIPIENT_FILTERS: FilterDef<RecipientRow>[] = [
  {
    id: "kind",
    label: "Stato",
    type: "select",
    pinned: true,
    options: [
      { value: "reachable", label: "Raggiungibili", tone: "green" },
      { value: "excluded", label: "Esclusi", tone: "amber" },
    ],
    apply: (row, value) => (typeof value === "string" && value ? row.kind === value : true),
  },
];

const RECIPIENT_VIEWS: ViewDef[] = [
  { id: "reachable", label: "Raggiungibili", filters: { kind: "reachable" }, builtIn: true },
  { id: "excluded", label: "Esclusi", filters: { kind: "excluded" }, builtIn: true, tone: "amber" },
];

export function CommunicationRecipientsGrid({ preview }: { preview: CommunicationPreview }) {
  const rows = React.useMemo(() => recipientRowsFrom(preview), [preview]);
  return (
    <DataGrid<RecipientRow>
      module="comunicazioni-destinatari"
      aria-label="Destinatari della comunicazione"
      rows={rows}
      getRowId={(row) => row.id}
      rowLabel={(row) => row.name}
      columns={RECIPIENT_COLUMNS}
      filters={RECIPIENT_FILTERS}
      views={RECIPIENT_VIEWS}
      defaultSort={{ columnId: "status", direction: "desc" }}
      canSelect={false}
      persist={false}
      noun={{ singular: "destinatario", plural: "destinatari" }}
      empty={{ icon: <Users />, title: "Nessun destinatario", description: "Con i criteri scelti nessuna famiglia viene raggiunta." }}
    />
  );
}

/* ── Esito per destinatario ──────────────────────────────────────────────── */

type DeliveryRow = CommunicationOutcome["deliveries"][number] & { id: string };

const DELIVERY_COLUMNS: ColumnDef<DeliveryRow>[] = [
  {
    id: "recipient",
    header: "Destinatario",
    kind: "identity",
    locked: true,
    width: 1.6,
    cell: (row) => (
      <span className="min-w-0">
        <span className="egw-ellipsis block font-brand text-[12.5px] font-semibold text-egw-ink">{row.email || row.name || MISSING}</span>
        {row.email && row.name ? <span className="egw-ellipsis block font-brand text-[10px] text-[rgba(11,26,58,.5)]">{row.name}</span> : null}
      </span>
    ),
    sortValue: (row) => (row.email || row.name).toLowerCase(),
    title: (row) => joinMeta(row.name, row.email),
  },
  {
    id: "status",
    header: "Esito",
    kind: "status",
    cell: (row) => <StatusPill status={deliveryStatusSpec(row.status)} />,
    sortValue: (row) => row.status,
  },
  {
    id: "reason",
    header: "Motivo",
    kind: "text",
    width: 1.6,
    cell: (row) => row.reason,
    sortValue: (row) => row.reason || null,
    title: (row) => row.reason || undefined,
  },
];

const DELIVERY_FILTERS: FilterDef<DeliveryRow>[] = [
  {
    id: "status",
    label: "Esito",
    type: "select",
    pinned: true,
    options: [
      { value: "sent", label: "Inviati", tone: "green" },
      { value: "skipped", label: "Saltati" },
      { value: "failed", label: "Non riusciti", tone: "red" },
    ],
    apply: (row, value) => (typeof value === "string" && value ? row.status === value : true),
  },
];

const DELIVERY_VIEWS: ViewDef[] = [
  { id: "sent", label: "Inviati", filters: { status: "sent" }, builtIn: true },
  { id: "failed", label: "Non riusciti", filters: { status: "failed" }, builtIn: true, tone: "red" },
];

export function CommunicationOutcomePanel({
  outcome,
  busy,
  onContinue,
}: {
  outcome: CommunicationOutcome;
  busy: boolean;
  onContinue: () => void;
}) {
  const rows = React.useMemo<DeliveryRow[]>(() => outcome.deliveries.map((row, index) => ({ ...row, id: `${row.email}-${index}` })), [outcome]);
  return (
    <>
      <Panel as="section" data-test="communication-outcome">
        <PanelHeader
          eyebrow="Esito"
          title={
            <>
              Inviati <span className="egw-num">{formatInteger(outcome.totals.sent)}</span> · saltati <span className="egw-num">{formatInteger(outcome.totals.skipped)}</span> · falliti{" "}
              <span className="egw-num">{formatInteger(outcome.totals.failed)}</span>
            </>
          }
          description={
            outcome.remaining > 0
              ? `Restano ${formatInteger(outcome.remaining)} destinatari: l'invio procede a lotti sullo stesso identificativo, chi e gia stato raggiunto non riceve due volte.`
              : "Ogni destinatario ha il suo esito qui sotto."
          }
          actions={
            outcome.remaining > 0 ? (
              <Button variant="neutral" loading={busy} onClick={onContinue}>
                Continua: restano {formatInteger(outcome.remaining)}
              </Button>
            ) : null
          }
        />
      </Panel>
      <DataGrid<DeliveryRow>
        module="comunicazioni-esito"
        aria-label="Esito della comunicazione per destinatario"
        rows={rows}
        getRowId={(row) => row.id}
        rowLabel={(row) => row.email || row.name}
        columns={DELIVERY_COLUMNS}
        filters={DELIVERY_FILTERS}
        views={DELIVERY_VIEWS}
        canSelect={false}
        persist={false}
        noun={{ singular: "consegna", plural: "consegne" }}
        empty={{ icon: <Mail />, title: "Nessuna consegna", description: "Nessun messaggio e partito in questo lotto." }}
      />
    </>
  );
}
