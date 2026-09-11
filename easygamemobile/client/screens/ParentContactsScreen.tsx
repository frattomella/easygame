import React from "react";
import { Linking, StyleSheet, View } from "react-native";
import { useQuery } from "@tanstack/react-query";

import {
  GlassCard,
  GlassRow,
  SecondaryScreenLayout,
  SectionLabel,
  SignatureText,
  StateMessage,
  StatusPill,
  SummaryCard,
} from "@/components/signature";
import { useParentContext } from "@/contexts/ParentContext";
import { useParentSectionStatus } from "@/hooks/useParentSectionStatus";
import { mobileBackendStorage } from "@/services/mobile-backend-storage";
import {
  formatOpeningHourSlots,
  normalizeOpeningHours,
} from "@/lib/opening-hours";

/**
 * Contatti club (WP8) — solo dati del club gia nel cruscotto aggregato
 * (`data.club.*`, la stessa fonte di `ParentContactsPage` sul Web): niente
 * URL o recapiti hardcoded nello schermo, tutto dinamico per club. Gli
 * orari di apertura sono JSON libero non normalizzato server-side — la
 * stessa forma che il Web normalizza lato client (`opening-hours-utils.ts`).
 *
 * Composizione: design `IA e Home` §3d ("Contatti") — scheda scura
 * "Segreteria · telefono" nel cielo, poi le righe di contatto (telefono,
 * email, sito, sede) con chevron: il tocco apre il canale. Sotto, gli orari
 * di apertura della segreteria.
 */
export default function ParentContactsScreen() {
  const { selectedChildId, selectedChild } = useParentContext();

  const dashboardQuery = useQuery({
    queryKey: ["parent-dashboard", selectedChildId],
    queryFn: () =>
      mobileBackendStorage.getParentDashboard(selectedChildId as string),
    enabled: Boolean(selectedChildId),
  });
  const { status, errorMessage } = useParentSectionStatus(dashboardQuery);

  const club = dashboardQuery.data?.club;
  const days = club ? normalizeOpeningHours(club.opening_hours) : [];
  const address = club
    ? [club.address, club.city, club.province].filter(Boolean).join(", ")
    : "";

  const openLink = async (url: string) => {
    if (await Linking.canOpenURL(url)) {
      await Linking.openURL(url);
    }
  };

  return (
    <SecondaryScreenLayout
      title="Contatti"
      eyebrow={`${club?.name || selectedChild?.clubName || "Club"} · Riferimenti`}
      skyHeight={300}
      contentGap={10}
      club={
        selectedChild
          ? {
              name: selectedChild.clubName,
              avatarUrl: selectedChild.clubLogoUrl,
            }
          : undefined
      }
    >
      {status === "loading" ? (
        <StateMessage kind="loading" tone="dark" title="Carico i contatti…" />
      ) : status === "forbidden" ? (
        <StateMessage
          kind="forbidden"
          tone="dark"
          message="Il club non ti ha dato accesso ai contatti."
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
          <SummaryCard
            icon="call-outline"
            eyebrow="Segreteria"
            title={club.contact_phone || club.contact_email || club.name}
            value="→"
            valueMuted
          />

          <SectionLabel label="Recapiti" style={{ paddingTop: 4 }} />
          {club.contact_phone ? (
            <GlassRow
              icon="call-outline"
              iconColor="#2563EB"
              title="Segreteria"
              meta={club.contact_phone}
              trailing={
                <StatusPill label="Chiama" tier="quiet" tone="success" small />
              }
              onPress={() => void openLink(`tel:${club.contact_phone}`)}
            />
          ) : null}
          {club.contact_email ? (
            <GlassRow
              icon="mail-outline"
              iconColor="#3533CD"
              title="Email"
              meta={club.contact_email}
              onPress={() => void openLink(`mailto:${club.contact_email}`)}
            />
          ) : null}
          {club.website ? (
            <GlassRow
              icon="globe-outline"
              iconColor="#2563EB"
              title="Sito web"
              meta={club.website}
              onPress={() =>
                void openLink(
                  club.website!.startsWith("http")
                    ? club.website!
                    : `https://${club.website}`,
                )
              }
            />
          ) : null}
          {address ? (
            <GlassRow
              icon="location-outline"
              iconColor="#10B981"
              title={club.name}
              meta={address}
              trailing={
                <StatusPill label="Sede" tier="quiet" tone="neutral" small />
              }
              onPress={() =>
                void openLink(
                  `https://maps.apple.com/?q=${encodeURIComponent(address)}`,
                )
              }
            />
          ) : null}
          {!club.contact_phone &&
          !club.contact_email &&
          !club.website &&
          !address ? (
            <StateMessage
              kind="empty"
              title="Nessun recapito"
              message="Il club non ha ancora indicato recapiti."
            />
          ) : null}

          {days.length > 0 ? (
            <GlassCard eyebrow="Orari di apertura" style={{ marginTop: 2 }}>
              <View style={styles.hours}>
                {days.map((day) => (
                  <View key={day.key} style={styles.hoursRow}>
                    <SignatureText style={styles.hoursDay}>
                      {day.label}
                    </SignatureText>
                    <SignatureText style={styles.hoursSlots}>
                      {formatOpeningHourSlots(day)}
                    </SignatureText>
                  </View>
                ))}
              </View>
            </GlassCard>
          ) : null}
        </>
      ) : null}
    </SecondaryScreenLayout>
  );
}

const styles = StyleSheet.create({
  hours: {
    gap: 6,
  },
  hoursRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    paddingVertical: 2,
  },
  hoursDay: {
    color: "#0B1A3A",
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "600",
  },
  hoursSlots: {
    color: "rgba(11,26,58,0.62)",
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "500",
    fontVariant: ["tabular-nums"],
  },
});
