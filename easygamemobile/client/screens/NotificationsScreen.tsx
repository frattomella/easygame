import React, { useCallback, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";

import { Card } from "@/components/Card";
import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { formatItalianDate } from "@/lib/mobile-ui";
import { Task } from "@/services/api";
import { mobileBackendStorage } from "@/services/mobile-backend-storage";
import { BorderRadius, Colors, Spacing } from "@/constants/theme";

export default function NotificationsScreen() {
  const { theme } = useTheme();
  const [notifications, setNotifications] = useState<Task[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    const nextNotifications = await mobileBackendStorage.getTasks();
    setNotifications(nextNotifications);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadData();
    }, [loadData]),
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.backgroundRoot }]}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      <View style={styles.hero}>
        <ThemedText type="h4">Notifiche importanti</ThemedText>
        <ThemedText
          type="small"
          style={{ color: theme.textSecondary, marginTop: Spacing.xs }}
        >
          Promemoria e avvisi collegati al club attivo e al tuo ruolo.
        </ThemedText>
      </View>

      {notifications.length > 0 ? (
        notifications.map((notification) => (
          <Card key={notification.id} style={styles.card}>
            <View style={styles.cardHeader}>
              <View
                style={[
                  styles.iconWrap,
                  { backgroundColor: "rgba(37,99,235,0.12)" },
                ]}
              >
                <Ionicons
                  name="notifications-outline"
                  size={18}
                  color={Colors.light.primary}
                />
              </View>
              <View style={{ flex: 1 }}>
                <ThemedText type="body" style={styles.cardTitle}>
                  {notification.title}
                </ThemedText>
                <ThemedText
                  type="small"
                  style={{ color: theme.textSecondary }}
                >
                  {notification.dueDate
                    ? formatItalianDate(notification.dueDate, "d MMM yyyy")
                    : "Senza scadenza"}
                </ThemedText>
              </View>
            </View>
            {notification.description ? (
              <ThemedText
                type="small"
                style={{ color: theme.textSecondary, marginTop: Spacing.sm }}
              >
                {notification.description}
              </ThemedText>
            ) : null}
          </Card>
        ))
      ) : (
        <Card style={styles.emptyCard}>
          <Ionicons
            name="notifications-off-outline"
            size={24}
            color={theme.textSecondary}
          />
          <ThemedText type="body" style={styles.cardTitle}>
            Nessuna notifica
          </ThemedText>
          <ThemedText type="small" style={{ color: theme.textSecondary }}>
            Quando arrivano nuovi avvisi del club li vedi qui.
          </ThemedText>
        </Card>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: {
    padding: Spacing.lg,
    paddingBottom: Spacing["4xl"],
    gap: Spacing.md,
  },
  hero: {
    marginBottom: Spacing.sm,
  },
  card: {
    marginBottom: Spacing.md,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  cardTitle: {
    fontWeight: "700",
  },
  emptyCard: {
    alignItems: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing["3xl"],
  },
});
