import React, { useCallback, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";

import {
  NotificationPermissionCard,
  NotificationRow,
  SecondaryScreenLayout,
  SectionLabel,
  StateMessage,
} from "@/components/signature";
import { useNotificationPermissionCard } from "@/hooks/useNotificationPermissionCard";
import { formatItalianDate } from "@/lib/mobile-ui";
import { Task } from "@/services/api";
import { mobileBackendStorage } from "@/services/mobile-backend-storage";

/**
 * Stessa fonte dati di prima (`mobileBackendStorage.getTasks()`): i
 * promemoria del club per il proprio ruolo. Composizione: prototipo
 * `isNotifications` — intestazione "Oggi" e righe di vetro
 * (`NotificationRow`: pallino, chip, titolo, testo, quando). I promemoria
 * non hanno uno stato "letto" lato server: la riga e sempre in evidenza e
 * non c'e "Segna tutte come lette", che qui non scriverebbe nulla. La card
 * di permesso notifiche (WP11, §G1) apre la sezione: mai un dialogo di
 * sistema al solo aprire questa schermata.
 */
export default function NotificationsScreen() {
  const [notifications, setNotifications] = useState<Task[]>([]);
  const [loaded, setLoaded] = useState(false);
  const permission = useNotificationPermissionCard();

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

  const pending = notifications.filter((item) => !item.completed);
  const done = notifications.filter((item) => item.completed);

  return (
    <SecondaryScreenLayout
      title="Notifiche"
      eyebrow={`Allenatore · ${pending.length === 1 ? "1 promemoria" : `${pending.length} promemoria`}`}
      contentGap={8}
    >
      <NotificationPermissionCard
        status={permission.status}
        onEnable={() => void permission.enable()}
        onOpenSettings={permission.openSettings}
      />

      {!loaded ? (
        <StateMessage kind="loading" />
      ) : notifications.length === 0 ? (
        <StateMessage
          kind="empty"
          title="Nessuna notifica"
          message="Quando arrivano nuovi avvisi del club li vedi qui."
        />
      ) : (
        <>
          {pending.length > 0 ? (
            <SectionLabel label="Da fare" trailing={String(pending.length)} />
          ) : null}
          {pending.map((notification) => (
            <NotificationRow
              key={notification.id}
              title={notification.title}
              body={notification.description || "Promemoria del club"}
              timestampLabel={
                notification.dueDate
                  ? formatItalianDate(notification.dueDate, "d MMM")
                  : ""
              }
              read={false}
              category={
                notification.type === "task" ? "operational" : "priority"
              }
            />
          ))}
          {done.length > 0 ? (
            <SectionLabel
              label="Completati"
              trailing={String(done.length)}
              style={{ paddingTop: 6 }}
            />
          ) : null}
          {done.map((notification) => (
            <NotificationRow
              key={notification.id}
              title={notification.title}
              body={notification.description || "Promemoria del club"}
              timestampLabel={
                notification.dueDate
                  ? formatItalianDate(notification.dueDate, "d MMM")
                  : ""
              }
              read
            />
          ))}
        </>
      )}
    </SecondaryScreenLayout>
  );
}
