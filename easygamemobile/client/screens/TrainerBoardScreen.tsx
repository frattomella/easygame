import React from "react";

import {
  GlassRow,
  SecondaryScreenLayout,
  SectionLabel,
  SignatureText,
  StateMessage,
  StatusPill,
  SummaryCard,
} from "@/components/signature";
import { mobileBackendStorage } from "@/services/mobile-backend-storage";
import { useAsyncSection } from "@/hooks/useAsyncSection";
import { formatItalianDate } from "@/lib/mobile-ui";
import type { Announcement } from "@/services/api";

/**
 * La bacheca del club, sola lettura — stesso endpoint del Web
 * (`GET /api/v1/announcements?mine=1`, `trainer-board-dashboard-page.tsx`).
 * Nessun RSVP qui: e una scelta di prodotto dichiarata anche sul Web, non
 * un'omissione mobile.
 *
 * Composizione: design `IA e Home` §3c ("Bacheca") — scheda scura di
 * riepilogo ("Avvisi del club" · conteggio) che parte nel cielo, poi una
 * riga di vetro per avviso (icona, titolo, "chi · quando", pill). Il testo
 * dell'avviso si legge sotto il titolo; la pill "Nuovo"/"Letto" viene da
 * `readAt`, scritto dal server.
 */
export default function TrainerBoardScreen() {
  const { status, data, errorMessage, reload } = useAsyncSection<
    Announcement[]
  >(
    () => mobileBackendStorage.getBoardAnnouncements(),
    (list) => list.length === 0,
  );

  const announcements = data || [];
  const unreadCount = announcements.filter((item) => !item.readAt).length;

  return (
    <SecondaryScreenLayout
      title="Bacheca"
      eyebrow={`Allenatore · ${announcements.length === 1 ? "1 avviso" : `${announcements.length} avvisi`}`}
      skyHeight={300}
      contentGap={10}
    >
      {status === "loading" ? (
        <StateMessage kind="loading" tone="dark" title="Carico gli avvisi…" />
      ) : status === "forbidden" ? (
        <StateMessage
          kind="forbidden"
          tone="dark"
          message="Il club non ti ha dato accesso alla bacheca."
        />
      ) : status === "network" || status === "error" ? (
        <StateMessage
          kind="error"
          tone="dark"
          message={errorMessage}
          actionLabel="Riprova"
          onAction={reload}
        />
      ) : status === "empty" ? (
        <StateMessage
          kind="empty"
          tone="dark"
          title="Nessun avviso"
          message="Non hai avvisi in bacheca al momento."
        />
      ) : (
        <>
          <SummaryCard
            icon="megaphone-outline"
            eyebrow="Non letti"
            title="Avvisi del club"
            value={String(unreadCount)}
          />
          <SectionLabel
            label="Tutti gli avvisi"
            trailing={String(announcements.length)}
            style={{ paddingTop: 4 }}
          />
          {announcements.map((announcement) => {
            const recent = !announcement.readAt;
            return (
              <GlassRow
                key={announcement.id}
                icon="megaphone-outline"
                iconColor={recent ? "#2563EB" : "#64748B"}
                title={announcement.title}
                meta={`Club · ${formatItalianDate(announcement.publishedAt)}`}
                emphasis={recent ? "strong" : "default"}
                trailing={
                  <StatusPill
                    label={recent ? "Nuovo" : "Letto"}
                    tier={recent ? "solid" : "quiet"}
                    tone={recent ? "info" : "neutral"}
                    small
                  />
                }
                actions={
                  announcement.body ? (
                    <SignatureText variant="small" tone="muted">
                      {announcement.body}
                    </SignatureText>
                  ) : undefined
                }
              />
            );
          })}
        </>
      )}
    </SecondaryScreenLayout>
  );
}
