"use client";

import * as React from "react";
import { Archive, Check, Inbox, Mail, Phone, Undo2 } from "lucide-react";
import { Panel } from "@/components/web/primitives/Surface";
import { Button } from "@/components/web/primitives/Button";
import { SegmentedControl } from "@/components/web/primitives/Controls";
import { DataChip, StatusPill } from "@/components/web/primitives/StatusPill";
import { AlertBlock } from "@/components/web/page/Alerts";
import { EmptyStateCard, InfoCard } from "@/components/web/page/Cards";
import { useToast } from "@/components/ui/toast-notification";
import { formatDateTime } from "@/lib/web/format";
import { websiteApi, type InquiryDto } from "@/lib/website/client";
import { useWebsiteArea } from "./WebsiteAreaShell";
import { INQUIRY_STATUS, ListSkeleton } from "./admin-ui";

/** I messaggi arrivati dal modulo contatti del sito (`website_inquiries`). */

type Filter = InquiryDto["status"];

const FILTERS: Array<{ value: Filter; label: string }> = [
  { value: "new", label: "Nuove" },
  { value: "handled", label: "Gestite" },
  { value: "archived", label: "Archiviate" },
];

const mailto = (inquiry: InquiryDto) =>
  `mailto:${encodeURIComponent(inquiry.email)}?subject=${encodeURIComponent(`Re: ${inquiry.topic || "la tua richiesta dal sito"}`)}`;

export function InquiriesScreen() {
  const { can, canEdit } = useWebsiteArea();
  const { showToast } = useToast();
  const [filter, setFilter] = React.useState<Filter>("new");
  const [data, setData] = React.useState<{ unread: number; items: InquiryDto[] } | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const allowed = can("website.settings.manage");

  const load = React.useCallback(async () => {
    const result = await websiteApi.inquiries(filter);
    if (result.error) setError(result.error.message);
    else {
      setError(null);
      setData(result.data);
    }
  }, [filter]);

  React.useEffect(() => {
    if (!allowed) return;
    setData(null);
    void load();
  }, [allowed, load]);

  if (!allowed) {
    return <InfoCard eyebrow="Accesso riservato">I messaggi del sito li legge chi gestisce le impostazioni del sito.</InfoCard>;
  }

  const setStatus = async (inquiry: InquiryDto, status: InquiryDto["status"]) => {
    setBusyId(inquiry.id);
    const result = await websiteApi.setInquiryStatus(inquiry.id, status);
    setBusyId(null);
    if (result.error) {
      showToast("error", result.error.message);
      return;
    }
    showToast("success", status === "handled" ? "Segnata come gestita" : status === "archived" ? "Messaggio archiviato" : "Riportata tra le nuove");
    await load();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SegmentedControl
          value={filter}
          onChange={setFilter}
          options={FILTERS.map((option) => ({ ...option, count: option.value === "new" ? data?.unread ?? null : null }))}
          aria-label="Filtra i messaggi"
        />
        <p className="text-[12px] text-egw-ink-62">I messaggi si conservano per due anni, poi si cancellano.</p>
      </div>
      {error ? (
        <AlertBlock severity="danger" title="I messaggi non si possono caricare">{error}</AlertBlock>
      ) : !data ? (
        <ListSkeleton />
      ) : !data.items.length ? (
        <EmptyStateCard
          icon={<Inbox className="h-6 w-6" />}
          title={filter === "new" ? "Nessun messaggio nuovo" : filter === "handled" ? "Nessun messaggio gestito" : "Nessun messaggio archiviato"}
          description="I messaggi arrivano dal blocco «Modulo contatti» delle pagine del sito."
        />
      ) : (
        <ul className="space-y-3">
          {data.items.map((inquiry) => (
            <li key={inquiry.id}>
              <Panel as="article" className="p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[14px] font-bold text-egw-ink">{inquiry.name}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px]">
                      <a href={mailto(inquiry)} className="inline-flex items-center gap-1 break-all text-egw-blue-700 hover:underline">
                        <Mail className="h-3.5 w-3.5 shrink-0" aria-hidden />{inquiry.email}
                      </a>
                      {inquiry.phone ? (
                        <a href={`tel:${inquiry.phone.replace(/\s+/g, "")}`} className="inline-flex items-center gap-1 text-egw-blue-700 hover:underline">
                          <Phone className="h-3.5 w-3.5 shrink-0" aria-hidden />{inquiry.phone}
                        </a>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <StatusPill status={INQUIRY_STATUS[inquiry.status]} size="sm" />
                    <span className="text-[11.5px] text-egw-ink-62">{formatDateTime(inquiry.createdAt)}</span>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {inquiry.topic ? <DataChip size="sm" tone="blue">{inquiry.topic}</DataChip> : null}
                  {inquiry.sourcePath ? <DataChip size="sm">Da {inquiry.sourcePath}</DataChip> : null}
                </div>
                <p className="mt-3 whitespace-pre-wrap break-words text-[13px] leading-[1.55] text-egw-ink-72">{inquiry.message}</p>
                {inquiry.handledAt && inquiry.status !== "new" ? (
                  <p className="mt-2 text-[11.5px] text-egw-ink-42">Gestita il {formatDateTime(inquiry.handledAt)}</p>
                ) : null}
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button asChild variant="secondary" size="sm">
                    <a href={mailto(inquiry)}><Mail className="h-4 w-4" aria-hidden />Rispondi</a>
                  </Button>
                  {canEdit && inquiry.status === "new" ? (
                    <Button variant="secondary" size="sm" icon={<Check className="h-4 w-4" />} loading={busyId === inquiry.id} onClick={() => void setStatus(inquiry, "handled")}>Segna come gestita</Button>
                  ) : null}
                  {canEdit && inquiry.status !== "archived" ? (
                    <Button variant="text" size="sm" icon={<Archive className="h-4 w-4" />} disabled={busyId === inquiry.id} onClick={() => void setStatus(inquiry, "archived")}>Archivia</Button>
                  ) : null}
                  {canEdit && inquiry.status !== "new" ? (
                    <Button variant="text" size="sm" icon={<Undo2 className="h-4 w-4" />} disabled={busyId === inquiry.id} onClick={() => void setStatus(inquiry, "new")}>Riporta tra le nuove</Button>
                  ) : null}
                </div>
              </Panel>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
