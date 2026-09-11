import React, { useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { format } from "date-fns";
import { it } from "date-fns/locale";

import {
  InfoNote,
  ParentPrimaryScreenLayout,
  SectionLabel,
  SignatureText,
  StateMessage,
} from "@/components/signature";
import { ParentEventCard } from "@/components/parent/ParentEventCard";
import { useParentContext } from "@/contexts/ParentContext";
import { useParentRsvp } from "@/hooks/useParentRsvp";
import { useParentSectionStatus } from "@/hooks/useParentSectionStatus";
import { mobileBackendStorage } from "@/services/mobile-backend-storage";
import {
  buildParentCalendarItems,
  eventDayKey,
  filterParentCalendarItems,
  ParentCalendarFilter,
  ParentCalendarItem,
  parseEventDate,
} from "@/lib/parent-calendar";
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

const dayLabel = (isoDate?: string) => {
  const parsed = parseEventDate(isoDate);
  if (!parsed) return "Data da definire";
  const label = format(parsed, "EEEE d MMMM", { locale: it });
  return label.charAt(0).toUpperCase() + label.slice(1);
};

/**
 * Il calendario unificato (prototipo `isPCalendar`): la riga dei filtri
 * a pillola (Tutto · Allenamenti · Gare), poi gli eventi raggruppati per
 * giorno ("Mercoledì 18 marzo") come `EventCard`, con "Ci sarà / Non ci
 * sarà" direttamente sulla scheda quando l'invito e aperto. Il tocco sulla
 * scheda apre il dettaglio. Stesso `GET /api/parent-dashboard/[athleteId]`
 * della Home (stessa query key), stessi inviti (`useParentRsvp`).
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
  const rsvp = useParentRsvp(selectedChildId);
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

  /** Raggruppati per giorno, in ordine cronologico — la data e gia parte dell'ordinamento. */
  const groups = useMemo(() => {
    const map = new Map<string, ParentCalendarItem[]>();
    filteredItems.forEach((item) => {
      const key = eventDayKey(item.date);
      map.set(key, [...(map.get(key) || []), item]);
    });
    return Array.from(map.entries()).map(([date, list]) => ({ date, list }));
  }, [filteredItems]);

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
      initial: false,
    });

  const monthLabel = format(new Date(), "MMMM yyyy", { locale: it });

  return (
    <ParentPrimaryScreenLayout
      title="Calendario"
      eyebrow={`Genitore · ${monthLabel.charAt(0).toUpperCase()}${monthLabel.slice(1)}`}
      linkedChildren={children}
      selectedChildId={selectedChildId}
      onNotifications={openNotifications}
      notificationCount={dashboardQuery.data?.notificationsUnread || 0}
      childrenSwitching={switching}
      onSelectChild={selectChild}
      scrollable={status === "ready"}
      skyHeight={250}
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
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    style={[
                      styles.filterChip,
                      active ? styles.filterChipActive : null,
                    ]}
                  >
                    <SignatureText
                      style={[
                        styles.filterLabel,
                        active ? styles.filterLabelActive : null,
                      ]}
                    >
                      {entry.label}
                    </SignatureText>
                  </Pressable>
                );
              })}
            </View>

            {rsvp.loadFailed ? (
              <InfoNote tone="warning">
                Conferme non aggiornate: non riesco a verificare quali eventi
                aspettano ancora una risposta.{" "}
                <SignatureText style={styles.retry} onPress={rsvp.refetch}>
                  Riprova
                </SignatureText>
              </InfoNote>
            ) : null}

            {groups.length === 0 ? (
              <StateMessage
                kind="empty"
                title="Nessun evento"
                message="Non ci sono allenamenti o gare in programma per questo filtro."
              />
            ) : (
              groups.map((group) => (
                <View key={group.date || "undated"} style={styles.group}>
                  <SectionLabel label={dayLabel(group.date)} />
                  {group.list.map((item) => (
                    <ParentEventCard
                      key={`${item.kind}-${item.id}`}
                      item={item}
                      hideDate
                      invitations={rsvp.invitations}
                      invitationsLoadFailed={rsvp.loadFailed}
                      onAnswer={(eventId, answer) =>
                        void rsvp.answer(eventId, answer)
                      }
                      updatingId={rsvp.updatingId}
                      errorMessage={rsvp.errorFor(item.id)}
                      onRetry={rsvp.refetch}
                      onPress={() => openEvent(item)}
                    />
                  ))}
                </View>
              ))
            )}
          </>
        )
      }
    />
  );
}

const styles = StyleSheet.create({
  filterRow: {
    flexDirection: "row",
    gap: 6,
  },
  filterChip: {
    height: 30,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(11,26,58,0.14)",
    backgroundColor: "rgba(255,255,255,0.7)",
    alignItems: "center",
    justifyContent: "center",
  },
  filterChipActive: {
    backgroundColor: "#1D4ED8",
    borderColor: "rgba(255,255,255,0.3)",
  },
  filterLabel: {
    color: "#0B1A3A",
    fontSize: 11.5,
    lineHeight: 14,
    fontWeight: "700",
    letterSpacing: 0.46,
  },
  filterLabelActive: {
    color: "#FFFFFF",
  },
  group: {
    gap: 12,
  },
  retry: {
    color: "#1D4ED8",
    fontWeight: "700",
  },
});
