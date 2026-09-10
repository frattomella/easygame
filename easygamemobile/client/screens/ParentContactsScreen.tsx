import React from "react";
import { Linking, Pressable, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";

import {
  GlassCard,
  IconChip,
  SecondaryScreenLayout,
  SignatureText,
  StateMessage,
} from "@/components/signature";
import { useParentContext } from "@/contexts/ParentContext";
import { useParentSectionStatus } from "@/hooks/useParentSectionStatus";
import { mobileBackendStorage } from "@/services/mobile-backend-storage";
import {
  formatOpeningHourSlots,
  normalizeOpeningHours,
} from "@/lib/opening-hours";
import { Spacing } from "@/constants/theme";

/**
 * Contatti club (WP8) — solo dati del club gia nel cruscotto aggregato
 * (`data.club.*`, la stessa fonte di `ParentContactsPage` sul Web): niente
 * URL o recapiti hardcoded nello schermo, tutto dinamico per club. Gli
 * orari di apertura sono JSON libero non normalizzato server-side — la
 * stessa forma che il Web normalizza lato client (`opening-hours-utils.ts`),
 * portata qui identica (`client/lib/opening-hours.ts`).
 */
export default function ParentContactsScreen() {
  const { selectedChildId } = useParentContext();

  const dashboardQuery = useQuery({
    queryKey: ["parent-dashboard", selectedChildId],
    queryFn: () =>
      mobileBackendStorage.getParentDashboard(selectedChildId as string),
    enabled: Boolean(selectedChildId),
  });
  const { status, errorMessage } = useParentSectionStatus(dashboardQuery);

  const club = dashboardQuery.data?.club;
  const days = club ? normalizeOpeningHours(club.opening_hours) : [];

  const openLink = async (url: string) => {
    if (await Linking.canOpenURL(url)) {
      await Linking.openURL(url);
    }
  };

  return (
    <SecondaryScreenLayout title="Contatti" eyebrow="Segreteria">
      {status === "loading" ? (
        <StateMessage kind="loading" tone="dark" title="Carico i contatti…" />
      ) : status === "forbidden" ? (
        <StateMessage
          kind="forbidden"
          tone="dark"
          message="Il club non ti ha dato accesso a questa sezione."
        />
      ) : status === "network" || status === "error" ? (
        <StateMessage
          kind="error"
          tone="dark"
          message={errorMessage}
          actionLabel="Riprova"
          onAction={() => void dashboardQuery.refetch()}
        />
      ) : club ? (
        <>
          <GlassCard
            eyebrow="Club"
            title={club.name}
            description={
              [club.address, club.city, club.province]
                .filter(Boolean)
                .join(", ") || undefined
            }
            style={{ gap: Spacing.sm }}
          >
            {club.contact_phone ? (
              <ContactRow
                icon="call-outline"
                label={club.contact_phone}
                onPress={() => void openLink(`tel:${club.contact_phone}`)}
              />
            ) : null}
            {club.contact_email ? (
              <ContactRow
                icon="mail-outline"
                label={club.contact_email}
                onPress={() => void openLink(`mailto:${club.contact_email}`)}
              />
            ) : null}
            {club.website ? (
              <ContactRow
                icon="globe-outline"
                label={club.website}
                onPress={() =>
                  void openLink(
                    club.website!.startsWith("http")
                      ? club.website!
                      : `https://${club.website}`,
                  )
                }
              />
            ) : null}
            {!club.contact_phone && !club.contact_email && !club.website ? (
              <SignatureText variant="small" tone="muted">
                Il club non ha ancora indicato recapiti.
              </SignatureText>
            ) : null}
          </GlassCard>

          {days.length > 0 ? (
            <GlassCard
              eyebrow="Segreteria"
              title="Orari di apertura"
              style={{ marginTop: Spacing.md, gap: 6 }}
            >
              {days.map((day) => (
                <View
                  key={day.key}
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    paddingVertical: 4,
                  }}
                >
                  <SignatureText variant="small" tone="ink">
                    {day.label}
                  </SignatureText>
                  <SignatureText variant="small" tone="muted">
                    {formatOpeningHourSlots(day)}
                  </SignatureText>
                </View>
              ))}
            </GlassCard>
          ) : null}
        </>
      ) : null}
      <View style={{ height: Spacing.lg }} />
    </SecondaryScreenLayout>
  );
}

function ContactRow({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{ flexDirection: "row", alignItems: "center", gap: Spacing.sm }}
    >
      <IconChip name={icon} size={32} />
      <SignatureText
        variant="body"
        style={{ color: "#2563EB", fontWeight: "600" }}
      >
        {label}
      </SignatureText>
    </Pressable>
  );
}
