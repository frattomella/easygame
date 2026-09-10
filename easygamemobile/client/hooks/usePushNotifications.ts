import { useCallback, useEffect, useRef, useState } from "react";
import * as Notifications from "expo-notifications";
import { Linking, Platform } from "react-native";

import type { NotificationPermissionStatus } from "@/components/signature";
import { DeepLinkRoleGate, parseDeepLink } from "@/lib/deep-linking";
import { navigateToParsedDeepLink } from "@/lib/deep-link-navigator";
import { queryClient } from "@/lib/query-client";
import {
  configurePushNotificationHandler,
  getExpoPushTokenAsync,
  getPushPermissionStatus,
  requestPushPermission,
} from "@/lib/push-notifications";
import { mobileBackendStorage } from "@/services/mobile-backend-storage";

let handlerConfigured = false;

/**
 * Il ciclo di vita del token push (WP11): stato del permesso, acquisizione e
 * registrazione (`POST /api/v1/auth/device-tokens`), rinnovo quando
 * `expo-notifications` ne riporta uno diverso, e instradamento del tocco su
 * una notifica verso la stessa risoluzione dei deep link
 * (`navigateToParsedDeepLink`) — una notifica e, per questa app, un deep
 * link consegnato da APNs/FCM invece che da un link cliccato.
 *
 * Nessun invio di notifiche parte da questo hook: registra solo il
 * destinatario. Va montato una sola volta, vicino alla radice
 * (`RootStackNavigator`), con lo stesso `isReadyToNavigate`/`roleGate` del
 * risolutore di deep link.
 */
export function usePushNotifications({
  isLoggedIn,
  isReadyToNavigate,
  roleGate,
}: {
  isLoggedIn: boolean;
  isReadyToNavigate: boolean;
  roleGate: DeepLinkRoleGate;
}) {
  const [permissionStatus, setPermissionStatus] =
    useState<NotificationPermissionStatus>("not_requested");
  const registeredTokenRef = useRef<string | null>(null);
  const contextRef = useRef({ isReadyToNavigate, roleGate });
  contextRef.current = { isReadyToNavigate, roleGate };

  const registerCurrentToken = useCallback(async () => {
    const token = await getExpoPushTokenAsync();
    if (!token || token === registeredTokenRef.current) {
      return;
    }
    const platform = Platform.OS === "android" ? "android" : "ios";
    const ok = await mobileBackendStorage.registerDeviceToken(token, platform);
    if (ok) {
      registeredTokenRef.current = token;
    }
  }, []);

  const refreshPermissionStatus = useCallback(async () => {
    const status = await getPushPermissionStatus();
    setPermissionStatus(status);
    return status;
  }, []);

  const requestPermission = useCallback(async () => {
    const status = await requestPushPermission();
    setPermissionStatus(status);
    if (status === "granted") {
      await registerCurrentToken();
    }
    return status;
  }, [registerCurrentToken]);

  const openSystemSettings = useCallback(() => {
    void Linking.openSettings();
  }, []);

  // Configura una sola volta come una notifica si mostra in primo piano —
  // non richiede e non concede alcun permesso.
  useEffect(() => {
    if (!handlerConfigured) {
      configurePushNotificationHandler();
      handlerConfigured = true;
    }
  }, []);

  // Al login, se il permesso e gia concesso (da una sessione precedente),
  // rinnova la registrazione — l'app non chiede mai da sola il permesso qui.
  useEffect(() => {
    if (!isLoggedIn) return;
    void refreshPermissionStatus().then((status) => {
      if (status === "granted") {
        void registerCurrentToken();
      }
    });
  }, [isLoggedIn, refreshPermissionStatus, registerCurrentToken]);

  // Il token puo cambiare sotto l'app (reinstallazione, rotazione lato OS):
  // "token refresh/change handling".
  useEffect(() => {
    if (!isLoggedIn) return;
    const subscription = Notifications.addPushTokenListener(() => {
      void registerCurrentToken();
    });
    return () => subscription.remove();
  }, [isLoggedIn, registerCurrentToken]);

  // Ricevuta in primo piano ("foreground handling"): l'OS mostra comunque
  // il banner (configurato sopra), qui si invalidano le query Parent gia in
  // cache — le uniche schermate su TanStack Query in questa app — cosi chi
  // sta gia guardando Bacheca o Home vede il dato nuovo senza dover uscire e
  // rientrare. Le schermate Trainer si aggiornano gia da sole al focus
  // (`useFocusEffect`), non serve invalidare niente per loro.
  useEffect(() => {
    const subscription = Notifications.addNotificationReceivedListener(() => {
      void queryClient.invalidateQueries({ queryKey: ["parent-dashboard"] });
      void queryClient.invalidateQueries({ queryKey: ["parent-board"] });
    });
    return () => subscription.remove();
  }, []);

  // Tocco su una notifica, in background o a freddo: stessa risoluzione dei
  // deep link. `data.url` e la convenzione con cui una notifica porta una
  // destinazione — nessun invio reale la valorizza ancora oggi (vedi il
  // report del WP), ma il percorso e pronto per quando esistera.
  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const url = response.notification.request.content.data?.url;
        if (typeof url !== "string" || !url) return;

        const link = parseDeepLink(url);
        if (link.path.length === 0) return;

        navigateToParsedDeepLink(link, contextRef.current);
      },
    );
    return () => subscription.remove();
  }, []);

  return {
    permissionStatus,
    requestPermission,
    openSystemSettings,
    refreshPermissionStatus,
  };
}
