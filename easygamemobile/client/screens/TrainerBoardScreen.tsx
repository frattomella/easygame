import React from "react";
import { View } from "react-native";

import {
  GlassCard,
  SecondaryScreenLayout,
  SignatureText,
  StateMessage,
} from "@/components/signature";
import { mobileBackendStorage } from "@/services/mobile-backend-storage";
import { useAsyncSection } from "@/hooks/useAsyncSection";
import { formatItalianDate } from "@/lib/mobile-ui";
import { Spacing } from "@/constants/theme";
import type { Announcement } from "@/services/api";

/**
 * La bacheca del club, sola lettura — stesso endpoint del Web
 * (`GET /api/v1/announcements?mine=1`, `trainer-board-dashboard-page.tsx`).
 * Nessun RSVP qui: e una scelta di prodotto dichiarata anche sul Web, non
 * un'omissione mobile.
 */
export default function TrainerBoardScreen() {
  const { status, data, errorMessage, reload } = useAsyncSection<
    Announcement[]
  >(
    () => mobileBackendStorage.getBoardAnnouncements(),
    (list) => list.length === 0,
  );

  return (
    <SecondaryScreenLayout title="Bacheca" eyebrow="Club">
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
        (data || []).map((announcement) => (
          <GlassCard key={announcement.id} style={{ gap: Spacing.xs }}>
            <SignatureText variant="eyebrow" tone="faint">
              {formatItalianDate(announcement.publishedAt)}
            </SignatureText>
            <SignatureText variant="h4" tone="ink">
              {announcement.title}
            </SignatureText>
            {announcement.body ? (
              <SignatureText variant="body" tone="muted">
                {announcement.body}
              </SignatureText>
            ) : null}
          </GlassCard>
        ))
      )}
      <View style={{ height: Spacing.lg }} />
    </SecondaryScreenLayout>
  );
}
