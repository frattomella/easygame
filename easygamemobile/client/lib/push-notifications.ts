/**
 * Wrapper sottile su `expo-notifications` (WP11). Nessuna logica di dominio
 * qui: solo permesso, acquisizione del token, e la configurazione di come le
 * notifiche si mostrano mentre l'app e in primo piano. L'invio di una
 * notifica push non e implementato da nessuna parte del repository dopo
 * questo WP — vedi `docs/knowledge-base/05-mobile-architecture.md`.
 */
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { Platform } from "react-native";

import type { NotificationPermissionStatus } from "@/components/signature";

/**
 * Configura come una notifica si mostra **mentre l'app e aperta** —
 * `SetsNotificationHandler` non richiede ne concede alcun permesso, va
 * chiamata una volta sola all'avvio (design-source §G1: "il dialogo di
 * sistema non parte mai da solo all'avvio", e questo non lo fa).
 */
export const configurePushNotificationHandler = () => {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
};

const mapPermissionStatus = (
  response: Notifications.NotificationPermissionsStatus,
): NotificationPermissionStatus => {
  if (response.status === "granted") return "granted";
  if (response.status === "denied") return "denied";
  return "not_requested";
};

/** Legge lo stato attuale **senza** mai mostrare il dialogo di sistema. */
export const getPushPermissionStatus =
  async (): Promise<NotificationPermissionStatus> => {
    try {
      const response = await Notifications.getPermissionsAsync();
      return mapPermissionStatus(response);
    } catch {
      return "not_requested";
    }
  };

/**
 * L'unico punto che puo far comparire il dialogo di sistema — va chiamato
 * **solo** da un tocco esplicito su "Attiva" nella card di permesso, mai
 * all'avvio dell'app e mai in automatico dopo un rifiuto.
 */
export const requestPushPermission =
  async (): Promise<NotificationPermissionStatus> => {
    try {
      const response = await Notifications.requestPermissionsAsync();
      return mapPermissionStatus(response);
    } catch {
      return "denied";
    }
  };

/**
 * Il token Expo del dispositivo, o `null` se non ottenibile — mai
 * un'eccezione che risalga al chiamante. Tre ragioni per cui puo mancare,
 * tutte non fatali per il resto dell'app: un simulatore (le push richiedono
 * un dispositivo fisico), un permesso non concesso, o un `projectId` EAS non
 * ancora configurato (WP12 chiude la configurazione EAS; senza quella
 * questa funzione torna `null` invece di lanciare).
 */
export const getExpoPushTokenAsync = async (): Promise<string | null> => {
  if (!Device.isDevice) {
    return null;
  }

  try {
    const permission = await Notifications.getPermissionsAsync();
    if (permission.status !== "granted") {
      return null;
    }

    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", {
        name: "default",
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }

    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ||
      Constants.easConfig?.projectId;
    if (!projectId) {
      return null;
    }

    const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
    return data || null;
  } catch {
    return null;
  }
};
