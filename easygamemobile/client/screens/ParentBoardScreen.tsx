import React, { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRoute, RouteProp } from "@react-navigation/native";

import {
  GlassRow,
  NotificationPermissionCard,
  NotificationRow,
  SecondaryScreenLayout,
  SectionLabel,
  SignatureText,
  StateMessage,
  StatusPill,
} from "@/components/signature";
import { useNotificationPermissionCard } from "@/hooks/useNotificationPermissionCard";
import { useParentContext } from "@/contexts/ParentContext";
import { useParentSectionStatus } from "@/hooks/useParentSectionStatus";
import { mobileBackendStorage } from "@/services/mobile-backend-storage";
import { formatItalianDate, formatRelativeOrAbsolute } from "@/lib/mobile-ui";
import {
  groupNotificationsByDay,
  resolveNotificationCategory,
  sortNotificationsNewestFirst,
} from "@/lib/parent-notifications";
import type { ParentServicesStackParamList } from "@/navigation/ParentServicesStackNavigator";

type Route = RouteProp<ParentServicesStackParamList, "ParentBoard">;
type Section = "board" | "notifications";

/**
 * Bacheca + Notifiche (WP6): due sezioni della stessa schermata, come da
 * `guidelines/navigation.md` ("Notifications... shares Bacheca"). La
 * bacheca ha una fetch propria (`GET .../board`, sola lettura come sul
 * Web); le notifiche non hanno un GET dedicato — arrivano dentro il
 * payload aggregato gia condiviso con Home/Calendario (stessa query key,
 * nessuna fetch in piu).
 *
 * v3.0 (`migration-v3.md` passo 8): non e piu un tab primario del Dock —
 * confluito nel tab Servizi. Da `ParentPrimaryScreenLayout` (switcher
 * proprio) a `SecondaryScreenLayout` (freccia indietro, niente switcher —
 * "le schermate secondarie ereditano il figlio", `navigation.md`): il
 * figlio selezionato resta quello di `ParentContext`, condiviso da tutto
 * l'albero Parent, cambia solo l'assenza del selettore visivo qui.
 */
export default function ParentBoardScreen() {
  const route = useRoute<Route>();
  const { selectedChildId, selectedChild } = useParentContext();
  const [section, setSection] = useState<Section>(
    route.params?.initialSection || "board",
  );
  const permission = useNotificationPermissionCard();
  const queryClient = useQueryClient();

  const boardQuery = useQuery({
    queryKey: ["parent-board", selectedChildId],
    queryFn: () =>
      mobileBackendStorage.getParentBoard(selectedChildId as string),
    enabled: Boolean(selectedChildId) && section === "board",
  });
  const dashboardQuery = useQuery({
    queryKey: ["parent-dashboard", selectedChildId],
    queryFn: () =>
      mobileBackendStorage.getParentDashboard(selectedChildId as string),
    enabled: Boolean(selectedChildId) && section === "notifications",
  });

  const boardStatus = useParentSectionStatus(
    boardQuery,
    (list) => list.length === 0,
  );
  const notificationsStatus = useParentSectionStatus(dashboardQuery);
  const { status, errorMessage, onRetry } =
    section === "board"
      ? { ...boardStatus, onRetry: () => void boardQuery.refetch() }
      : {
          ...notificationsStatus,
          onRetry: () => void dashboardQuery.refetch(),
        };

  const markBoardRead = (deliveryId: string) => {
    if (!selectedChildId) return;
    mobileBackendStorage
      .markParentBoardRead(selectedChildId, deliveryId)
      .then(() =>
        queryClient.invalidateQueries({
          queryKey: ["parent-board", selectedChildId],
        }),
      )
      .catch(() => undefined);
  };

  const markNotificationRead = (id: string) => {
    if (!selectedChildId) return;
    mobileBackendStorage
      .markParentNotificationsRead(selectedChildId, { id })
      .then(() =>
        queryClient.invalidateQueries({
          queryKey: ["parent-dashboard", selectedChildId],
        }),
      )
      .catch(() => undefined);
  };

  const markAllNotificationsRead = () => {
    if (!selectedChildId) return;
    mobileBackendStorage
      .markParentNotificationsRead(selectedChildId, { all: true })
      .then(() =>
        queryClient.invalidateQueries({
          queryKey: ["parent-dashboard", selectedChildId],
        }),
      )
      .catch(() => undefined);
  };

  const notificationGroups = dashboardQuery.data
    ? groupNotificationsByDay(
        sortNotificationsNewestFirst(dashboardQuery.data.notifications),
      )
    : [];
  const hasUnread = (dashboardQuery.data?.notificationsUnread || 0) > 0;

  const announcements = boardQuery.data || [];
  const unreadBoard = announcements.filter((item) => !item.readAt).length;
  const unreadNotifications = dashboardQuery.data?.notificationsUnread || 0;

  return (
    <SecondaryScreenLayout
      title={section === "board" ? "Bacheca" : "Notifiche"}
      eyebrow={`Genitore · ${selectedChild?.name || "Atleta"}`}
      scrollable={status === "ready"}
      contentGap={8}
      club={
        selectedChild
          ? {
              name: selectedChild.clubName,
              avatarUrl: selectedChild.clubLogoUrl,
            }
          : undefined
      }
      aboveContent={
        <View style={styles.tabs}>
          <SectionTab
            label="Bacheca"
            active={section === "board"}
            onPress={() => setSection("board")}
          />
          <SectionTab
            label="Notifiche"
            active={section === "notifications"}
            onPress={() => setSection("notifications")}
          />
        </View>
      }
    >
      {status === "loading" ? (
        <StateMessage kind="loading" tone="dark" />
      ) : status === "forbidden" ? (
        <StateMessage kind="forbidden" tone="dark" message={errorMessage} />
      ) : status === "network" || status === "error" ? (
        <StateMessage
          kind="error"
          tone="dark"
          message={errorMessage}
          actionLabel="Riprova"
          onAction={onRetry}
        />
      ) : section === "board" ? (
        status === "empty" ? (
          <StateMessage
            kind="empty"
            title="Nessun avviso"
            message="Non ci sono avvisi in bacheca per questo figlio."
          />
        ) : (
          <>
            <SectionLabel
              label="Avvisi del club"
              trailing={
                unreadBoard > 0
                  ? `${unreadBoard} non ${unreadBoard === 1 ? "letto" : "letti"}`
                  : String(announcements.length)
              }
            />
            {announcements.map((announcement) => {
              const unread = !announcement.readAt;
              return (
                <GlassRow
                  key={announcement.id}
                  icon="megaphone-outline"
                  iconColor={unread ? "#2563EB" : "#64748B"}
                  title={announcement.title}
                  meta={`Club · ${formatItalianDate(announcement.publishedAt)}`}
                  emphasis={unread ? "strong" : "quiet"}
                  trailing={
                    <StatusPill
                      label={unread ? "Nuovo" : "Letto"}
                      tier={unread ? "solid" : "quiet"}
                      tone={unread ? "info" : "neutral"}
                      small
                    />
                  }
                  chevron={false}
                  onPress={
                    unread
                      ? () => markBoardRead(announcement.deliveryId)
                      : undefined
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
        )
      ) : (
        <>
          <NotificationPermissionCard
            status={permission.status}
            onEnable={() => void permission.enable()}
            onOpenSettings={permission.openSettings}
          />
          {notificationGroups.length === 0 ? (
            <StateMessage
              kind="empty"
              title="Nessuna notifica"
              message="Non ci sono notifiche per questo figlio."
            />
          ) : (
            notificationGroups.map((group, index) => (
              <View key={group.label} style={{ gap: 8 }}>
                <SectionLabel
                  label={group.label}
                  action={
                    index === 0 && hasUnread
                      ? {
                          label: "Segna tutte come lette",
                          onPress: markAllNotificationsRead,
                        }
                      : undefined
                  }
                  trailing={
                    index === 0 && unreadNotifications > 0
                      ? String(unreadNotifications)
                      : undefined
                  }
                  style={index > 0 ? { paddingTop: 6 } : undefined}
                />
                {group.items.map((item) => (
                  <NotificationRow
                    key={item.id}
                    title={item.title}
                    body={item.message}
                    read={item.read}
                    category={resolveNotificationCategory(item.type)}
                    timestampLabel={formatRelativeOrAbsolute(item.created_at)}
                    onPress={
                      item.read
                        ? undefined
                        : () => markNotificationRead(item.id)
                    }
                  />
                ))}
              </View>
            ))
          )}
        </>
      )}
    </SecondaryScreenLayout>
  );
}

/** I due filtri a pillola del prototipo (Calendario): attivo #1D4ED8 con etichetta bianca, gli altri bianco 70% con inchiostro. */
function SectionTab({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      style={[styles.tab, active ? styles.tabActive : null]}
    >
      <SignatureText
        style={[styles.tabLabel, active ? styles.tabLabelActive : null]}
      >
        {label}
      </SignatureText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tabs: {
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  tab: {
    height: 30,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.28)",
    backgroundColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  tabActive: {
    backgroundColor: "#FFFFFF",
    borderColor: "rgba(255,255,255,0.9)",
  },
  tabLabel: {
    color: "#FFFFFF",
    fontSize: 11.5,
    lineHeight: 14,
    fontWeight: "700",
    letterSpacing: 0.46,
  },
  tabLabelActive: {
    color: "#12265A",
  },
});
