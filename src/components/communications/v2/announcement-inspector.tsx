"use client";

import * as React from "react";
import { Send, Undo2 } from "lucide-react";
import { Drawer, DrawerSection } from "@/components/web/overlays/Drawer";
import { Button } from "@/components/web/primitives/Button";
import { StatusPill } from "@/components/web/primitives/StatusPill";
import { InsetBlock } from "@/components/web/primitives/Surface";
import { formatDateShort, MISSING } from "@/lib/web/format";
import { shelfStatusSpec } from "@/components/communications/v2/communication-status";
import {
  canPublishAnnouncement,
  canWithdrawAnnouncement,
  describeAudience,
  describeReads,
  type Announcement,
} from "@/components/communications/v2/announcement-model";

/**
 * L'ispettore di un avviso (guideline 09 §9.3 «Inspector summary block»):
 * il testo intero — che in griglia e una riga meta — il pubblico, le date, i
 * due numeri di lettura, e i due verbi che la V1 metteva sotto ogni card.
 */
export function AnnouncementInspector({
  announcement,
  onOpenChange,
  busy,
  onPublish,
  onWithdraw,
}: {
  announcement: Announcement | null;
  onOpenChange: (open: boolean) => void;
  busy: boolean;
  onPublish: (announcement: Announcement) => void;
  onWithdraw: (announcement: Announcement) => void;
}) {
  const reads = announcement ? describeReads(announcement) : null;
  return (
    <Drawer
      open={Boolean(announcement)}
      onOpenChange={onOpenChange}
      width="narrow"
      eyebrow="Avviso"
      title={announcement?.title || ""}
      headerAside={announcement ? <StatusPill status={shelfStatusSpec(announcement.shelf)} /> : null}
      locked={busy}
      data-test="announcement-inspector"
      footer={
        announcement ? (
          <>
            {canPublishAnnouncement(announcement) ? (
              <Button variant="primary" icon={<Send />} loading={busy} onClick={() => onPublish(announcement)}>
                Pubblica
              </Button>
            ) : null}
            {canWithdrawAnnouncement(announcement) ? (
              <Button variant="secondary" icon={<Undo2 />} loading={busy} onClick={() => onWithdraw(announcement)}>
                Ritira
              </Button>
            ) : null}
          </>
        ) : null
      }
    >
      {announcement ? (
        <>
          <DrawerSection eyebrow="Testo">
            <p className="whitespace-pre-wrap break-words font-brand text-[13px] leading-[1.55] text-egw-ink">{announcement.body}</p>
          </DrawerSection>
          <DrawerSection eyebrow="Dettagli">
            <InsetBlock className="p-0">
              <dl className="divide-y divide-egw-rule">
                {[
                  { label: "Chi lo legge", value: describeAudience(announcement.criteria) || MISSING },
                  { label: "Esce il", value: announcement.publishAt ? formatDateShort(announcement.publishAt) : "Quando lo pubblichi" },
                  { label: "Scade il", value: announcement.expiresAt ? formatDateShort(announcement.expiresAt) : "Mai" },
                  { label: "Pubblicato il", value: announcement.publishedAt ? formatDateShort(announcement.publishedAt) : MISSING },
                  { label: "Letto da", value: reads ? <span className="egw-num">{reads}</span> : MISSING },
                ].map((row) => (
                  <div key={String(row.label)} className="flex items-baseline justify-between gap-4 px-4 py-2.5">
                    <dt className="font-brand text-[12px] text-egw-ink-62">{row.label}</dt>
                    <dd className="text-right font-brand text-[13px] font-semibold text-egw-ink">{row.value}</dd>
                  </div>
                ))}
              </dl>
            </InsetBlock>
          </DrawerSection>
        </>
      ) : null}
    </Drawer>
  );
}
