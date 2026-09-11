import React, { useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";

import {
  ActionButton,
  EventCard,
  GlassCard,
  IconChip,
  ParentPrimaryScreenLayout,
  SignatureText,
  StateMessage,
} from "@/components/signature";
import { useParentContext } from "@/contexts/ParentContext";
import { useParentSectionStatus } from "@/hooks/useParentSectionStatus";
import { mobileBackendStorage } from "@/services/mobile-backend-storage";
import {
  buildParentCalendarItems,
  filterParentCalendarItems,
  formatEventDateRail,
  ParentCalendarFilter,
  ParentCalendarItem,
} from "@/lib/parent-calendar";
import {
  findInvitationForEvent,
  resolveCalendarRsvpBadge,
} from "@/lib/parent-rsvp";
import { Spacing } from "@/constants/theme";
import type { ParentCalendarStackParamList } from "@/navigation/ParentCalendarStackNavigator";

type Navigation = NativeStackNavigationProp<
  ParentCalendarStackParamList,
  "ParentCalendar"
>;

const FILTERS: { key: ParentCalendarFilter; label: string }[] = [
  { key: "all", label: "Tutto" },
  { key: "training", label: "Allenamenti" },
  { key: "match", label: "Gare" },
];

/**
 * Il calendario unificato (WP5): stesso principio del Web — nessuna azione
 * RSVP direttamente da qui (`ParentCalendarPage` non la offre), solo
 * apertura del dettaglio, dove vive `RSVPControl`. Legge lo stesso
 * `GET /api/parent-dashboard/[athleteId]` della Home: nessuna fetch
 * propria, stessa query key condivisa via TanStack Query.
 */
export default function ParentCalendarScreen() {
  const navigation = useNavigation<Navigation>();
  const { children, selectedChildId, switching, selectChild } =
    useParentContext();
  const [filter, setFilter] = useState<ParentCalendarFilter>("all");

  const dashboardQuery = useQuery({
    queryKey: ["parent-dashboard", selectedChildId],
    queryFn: () =>
      mobileBackendStorage.getParentDashboard(selectedChildId as string),
    enabled: Boolean(selectedChildId),
  });
  const rsvpQuery = useQuery({
    queryKey: ["parent-rsvp", selectedChildId],
    queryFn: () =>
      mobileBackendStorage.getParentRsvpInvitations(selectedChildId as string),
    enabled: Boolean(selectedChildId),
  });
  const { status, errorMessage } = useParentSectionStatus(
    dashboardQuery,
    () => false,
  );

  const items = useMemo(() => {
    if (!dashboardQuery.data) return [];
    return buildParentCalendarItems(
      dashboardQuery.data.trainings.all,
      dashboardQuery.data.matches.all,
    );
  }, [dashboardQuery.data]);
  const filteredItems = filterParentCalendarItems(items, filter);
  const invitations = rsvpQuery.data || [];
  const invitationsLoadFailed = rsvpQuery.isError;

  const openEvent = (item: ParentCalendarItem) =>
    navigation.navigate("ParentEventDetail", {
      eventId: item.id,
      kind: item.kind,
    });
  const openNotifications = () =>
    (
      navigation.getParent() as
        | { navigate: (...args: unknown[]) => void }
        | undefined
    )?.navigate("ParentServicesTab", {
      screen: "ParentBoard",
      params: { initialSection: "notifications" },
    });

  return (
    <ParentPrimaryScreenLayout
      title="Calendario"
      linkedChildren={children}
      selectedChildId={selectedChildId}
      onNotifications={openNotifications}
      notificationCount={dashboardQuery.data?.notificationsUnread || 0}
      childrenSwitching={switching}
      onSelectChild={selectChild}
      scrollable={status === "ready"}
      content={
        status === "loading" ? (
          <StateMessage kind="loading" tone="dark" />
        ) : status === "forbidden" ? (
          <StateMessage kind="forbidden" tone="dark" message={errorMessage} />
        ) : status === "network" || status === "error" ? (
          <StateMessage
            kind="error"
            tone="dark"
            message={errorMessage}
            actionLabel="Riprova"
            onAction={() => void dashboardQuery.refetch()}
          />
        ) : (
          <>
            <View style={styles.filterRow}>
              {FILTERS.map((entry) => {
                const active = entry.key === filter;
                return (
                  <Pressable
                    key={entry.key}
                    onPress={() => setFilter(entry.key)}
                    style={[
                      styles.filterChip,
                      active ? styles.filterChipActive : null,
                    ]}
                  >
                    <SignatureText
                      variant="small"
                      style={{
                        fontWeight: "700",
                        color: active ? "#FFFFFF" : "rgba(11,26,58,0.62)",
                      }}
                    >
                      {entry.label}
                    </SignatureText>
                  </Pressable>
                );
              })}
            </View>

            {invitationsLoadFailed ? (
              <GlassCard style={styles.rsvpErrorCard}>
                <IconChip
                  name="alert-circle-outline"
                  color="#F59E0B"
                  size={36}
                />
                <View style={{ flex: 1, gap: 2 }}>
                  <SignatureText
                    variant="small"
                    tone="ink"
                    style={{ fontWeight: "700" }}
                  >
                    Conferme non aggiornate
                  </SignatureText>
                  <SignatureText variant="small" tone="muted">
                    Non riesco a verificare quali eventi aspettano ancora una
                    conferma.
                  </SignatureText>
                </View>
                <ActionButton
                  size="sm"
                  variant="secondary"
                  onPress={() => void rsvpQuery.refetch()}
                >
                  Riprova
                </ActionButton>
              </GlassCard>
            ) : null}

            {filteredItems.length === 0 ? (
              <StateMessage
                kind="empty"
                title="Nessun evento"
                message="Non ci sono allenamenti o gare in programma per questo filtro."
              />
            ) : (
              filteredItems.map((item) => {
                const rail = formatEventDateRail(item.date);
                const invitation = findInvitationForEvent(invitations, item.id);
                const badge = resolveCalendarRsvpBadge({
                  rsvpRequired: item.rsvpRequired,
                  invitation,
                  invitationsLoadFailed,
                });
                return (
                  <EventCard
                    key={item.id}
                    kind={item.kind}
                    title={
                      item.kind === "match"
                        ? item.opponent
                          ? `vs ${item.opponent}`
                          : item.title || "Gara"
                        : item.title || item.categoryName || "Allenamento"
                    }
                    dateLabel={
                      rail
                        ? `${rail.dayName.toUpperCase()} ${rail.dayNumber} ${rail.monthLabel.toUpperCase()}`
                        : undefined
                    }
                    time={item.time || "--:--"}
                    endTime={item.endTime}
                    meta={
                      item.location
                        ? [{ icon: "location-outline", label: item.location }]
                        : []
                    }
                    pill={
                      badge === "pending"
                        ? { label: "Da confermare", variant: "warning" }
                        : badge === "unknown"
                          ? { label: "Da verificare", variant: "default" }
                          : undefined
                    }
                    onPress={() => openEvent(item)}
                  />
                );
              })
            )}
          </>
        )
      }
    />
  );
}

const styles = StyleSheet.create({
  rsvpErrorCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    marginBottom: Spacing.sm,
  },
  filterRow: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  filterChip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(11,26,58,0.14)",
    backgroundColor: "rgba(255,255,255,0.6)",
  },
  filterChipActive: {
    backgroundColor: "#2563EB",
    borderColor: "#2563EB",
  },
});
