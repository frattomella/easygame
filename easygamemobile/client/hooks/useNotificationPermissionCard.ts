import { useCallback, useState } from "react";
import { Linking, Platform } from "react-native";
import { useFocusEffect } from "@react-navigation/native";

import type { NotificationPermissionStatus } from "@/components/signature";
import {
  getExpoPushTokenAsync,
  getPushPermissionStatus,
  requestPushPermission,
} from "@/lib/push-notifications";
import { mobileBackendStorage } from "@/services/mobile-backend-storage";

/**
 * Stato e azioni per la card di permesso notifiche (§G1) su una singola
 * schermata "Profilo → Notifiche" — Trainer (`NotificationsScreen`) e
 * Parent (`ParentBoardScreen`, sezione Notifiche) la chiamano ciascuna per
 * conto proprio: e uno stato locale alla schermata, non globale, perche
 * tornarci dopo aver cambiato il permesso dalle impostazioni di sistema deve
 * mostrarlo aggiornato senza un meccanismo di notifica fra schermate.
 *
 * La registrazione del token e i suoi listener restano un'unica cosa,
 * montata alla radice (`usePushNotifications`, `RootStackNavigator`): questo
 * hook non duplica quella responsabilita, chiede solo lo stato e — se
 * l'utente lo attiva da qui — registra il token una volta.
 */
export function useNotificationPermissionCard() {
  const [status, setStatus] =
    useState<NotificationPermissionStatus>("not_requested");

  useFocusEffect(
    useCallback(() => {
      void getPushPermissionStatus().then(setStatus);
    }, []),
  );

  const enable = useCallback(async () => {
    const next = await requestPushPermission();
    setStatus(next);
    if (next === "granted") {
      const token = await getExpoPushTokenAsync();
      if (token) {
        await mobileBackendStorage.registerDeviceToken(
          token,
          Platform.OS === "android" ? "android" : "ios",
        );
      }
    }
  }, []);

  const openSettings = useCallback(() => {
    void Linking.openSettings();
  }, []);

  return { status, enable, openSettings };
}
