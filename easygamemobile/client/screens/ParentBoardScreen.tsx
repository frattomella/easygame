import React, { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRoute, RouteProp } from "@react-navigation/native";

import {
  GlassCard,
  NotificationRow,
  ParentPrimaryScreenLayout,
  SignatureText,
  StateMessage,
} from "@/components/signature";
import { useParentContext } from "@/contexts/ParentContext";
import { useParentSectionStatus } from "@/hooks/useParentSectionStatus";
import { mobileBackendStorage } from "@/services/mobile-backend-storage";
import { formatItalianDate, formatRelativeOrAbsolute } from "@/lib/mobile-ui";
import {
  groupNotificationsByDay,
  resolveNotificationCategory,
  sortNotificationsNewestFirst,
} from "@/lib/parent-notifications";
import { Spacing } from "@/constants/theme";
import type { ParentBoardStackParamList } from "@/navigation/ParentBoardStackNavigator";

type Route = RouteProp<ParentBoardStackParamList, "ParentBoard">;
type Section = "board" | "notifications";

/**
 * Bacheca + Notifiche (WP6): due sezioni della stessa tab, come da
 * `guidelines/navigation.md` ("Notifications... shares Bacheca"). La
 * bacheca ha una fetch propria (`GET .../board`, sola lettura come sul
 * Web); le notifiche non hanno un GET dedicato — arrivano dentro il
 * payload aggregato gia condiviso con Home/Calendario (stessa query key,
 * nessuna fetch in piu).
 */
export default function ParentBoardScreen() {
  const route = useRoute<Route>();
  const { children, selectedChildId, switching, selectChild } =
    useParentContext();
  const [section, setSection] = useState<Section>(
    route.params?.initialSection || "board",
  );
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

  return (
    <ParentPrimaryScreenLayout
      title="Bacheca"
      linkedChildren={children}
      selectedChildId={selectedChildId}
      childrenSwitching={switching}
      onSelectChild={selectChild}
      scrollable={status === "ready"}
      content={
        <>
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
              (boardQuery.data || []).map((announcement) => (
                <Pressable
                  key={announcement.id}
                  onPress={() => markBoardRead(announcement.deliveryId)}
                >
                  <GlassCard style={{ gap: Spacing.xs }}>
                    <View style={styles.boardHeader}>
                      <SignatureText variant="eyebrow" tone="faint">
                        {formatItalianDate(announcement.publishedAt)}
                      </SignatureText>
                      {!announcement.readAt ? (
                        <View style={styles.unreadDot} />
                      ) : null}
                    </View>
                    <SignatureText variant="h4" tone="ink">
                      {announcement.title}
                    </SignatureText>
                    {announcement.body ? (
                      <SignatureText variant="body" tone="muted">
                        {announcement.body}
                      </SignatureText>
                    ) : null}
                  </GlassCard>
                </Pressable>
              ))
            )
          ) : notificationGroups.length === 0 ? (
            <StateMessage
              kind="empty"
              title="Nessuna notifica"
              message="Non ci sono notifiche per questo figlio."
            />
          ) : (
            <>
              {hasUnread ? (
                <Pressable
                  onPress={markAllNotificationsRead}
                  style={styles.markAll}
                >
                  <SignatureText variant="small" style={styles.markAllLabel}>
                    Segna tutte come lette
                  </SignatureText>
                </Pressable>
              ) : null}
              {notificationGroups.map((group) => (
                <View key={group.label} style={{ gap: Spacing.xs }}>
                  <SignatureText variant="eyebrow" tone="faint">
                    {group.label.toUpperCase()}
                  </SignatureText>
                  {group.items.map((item) => (
                    <NotificationRow
                      key={item.id}
                      title={item.title}
                      body={item.message}
                      read={item.read}
                      category={resolveNotificationCategory(item.type)}
                      timestampLabel={formatRelativeOrAbsolute(item.created_at)}
                      onPress={() => markNotificationRead(item.id)}
                    />
                  ))}
                </View>
              ))}
            </>
          )}
        </>
      }
    />
  );
}

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
      style={[styles.tab, active ? styles.tabActive : null]}
    >
      <SignatureText
        variant="small"
        style={{
          fontWeight: "700",
          color: active ? "#FFFFFF" : "rgba(11,26,58,0.62)",
        }}
      >
        {label}
      </SignatureText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tabs: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  tab: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(11,26,58,0.14)",
    backgroundColor: "rgba(255,255,255,0.6)",
  },
  tabActive: {
    backgroundColor: "#2563EB",
    borderColor: "#2563EB",
  },
  boardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#2563EB",
  },
  markAll: {
    alignSelf: "flex-end",
    marginBottom: Spacing.sm,
  },
  markAllLabel: {
    color: "#2563EB",
    fontWeight: "700",
  },
});
