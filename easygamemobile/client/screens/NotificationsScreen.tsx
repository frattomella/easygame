import React, { useCallback, useState } from "react";
import { View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";

import {
  GlassCard,
  IconChip,
  SecondaryScreenLayout,
  SignatureText,
  StateMessage,
} from "@/components/signature";
import { formatItalianDate } from "@/lib/mobile-ui";
import { Task } from "@/services/api";
import { mobileBackendStorage } from "@/services/mobile-backend-storage";
import { Spacing } from "@/constants/theme";

/**
 * Stessa fonte dati di prima (`mobileBackendStorage.getTasks()`), veste
 * allineata alle altre schermate secondarie del Trainer (WP10) —
 * `SecondaryScreenLayout` + `GlassCard`, come `TrainerBoardScreen`.
 */
export default function NotificationsScreen() {
  const [notifications, setNotifications] = useState<Task[]>([]);
  const [loaded, setLoaded] = useState(false);

  const loadData = useCallback(async () => {
    const nextNotifications = await mobileBackendStorage.getTasks();
    setNotifications(nextNotifications);
    setLoaded(true);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadData();
    }, [loadData]),
  );

  return (
    <SecondaryScreenLayout title="Notifiche" eyebrow="Club">
      <SignatureText variant="small" tone="muted" style={{ marginBottom: 4 }}>
        Promemoria e avvisi collegati al club attivo e al tuo ruolo.
      </SignatureText>

      {!loaded ? (
        <StateMessage kind="loading" />
      ) : notifications.length > 0 ? (
        notifications.map((notification) => (
          <GlassCard key={notification.id} style={{ gap: Spacing.xs }}>
            <View style={{ flexDirection: "row", gap: Spacing.md }}>
              <IconChip name="notifications-outline" size={40} />
              <View style={{ flex: 1, gap: 2 }}>
                <SignatureText
                  variant="body"
                  tone="ink"
                  style={{ fontWeight: "700" }}
                >
                  {notification.title}
                </SignatureText>
                <SignatureText variant="small" tone="muted">
                  {notification.dueDate
                    ? formatItalianDate(notification.dueDate, "d MMM yyyy")
                    : "Senza scadenza"}
                </SignatureText>
              </View>
            </View>
            {notification.description ? (
              <SignatureText variant="small" tone="muted">
                {notification.description}
              </SignatureText>
            ) : null}
          </GlassCard>
        ))
      ) : (
        <StateMessage
          kind="empty"
          title="Nessuna notifica"
          message="Quando arrivano nuovi avvisi del club li vedi qui."
        />
      )}
    </SecondaryScreenLayout>
  );
}
