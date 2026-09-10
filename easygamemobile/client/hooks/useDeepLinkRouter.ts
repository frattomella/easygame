import { useEffect, useRef } from "react";
import * as Linking from "expo-linking";

import {
  DeepLinkRoleGate,
  ParsedDeepLink,
  parseDeepLink,
} from "@/lib/deep-linking";
import { navigateToParsedDeepLink } from "@/lib/deep-link-navigator";

interface UseDeepLinkRouterParams {
  /** `false` finche bootstrap/sessione/contesto non sono risolti — vedi `RootStackNavigator`. */
  isReadyToNavigate: boolean;
  roleGate: DeepLinkRoleGate;
}

/**
 * Il risolutore di deep link (WP11). Cattura l'URL di avvio a freddo e ogni
 * URL ricevuto mentre l'app e aperta, e naviga tramite
 * `navigateToParsedDeepLink` — la stessa risoluzione che usa il tocco su una
 * notifica push, cosi le due sorgenti non divergono.
 *
 * Un link ricevuto mentre l'utente non e ancora pronto (loggato ma senza
 * contesto, per esempio) resta **in sospeso** in questo hook: viene
 * riprovato a ogni cambio di `isReadyToNavigate`/`roleGate`, quindi si
 * risolve da solo non appena lo stato lo permette — nessun pending-link
 * store separato.
 */
export function useDeepLinkRouter({
  isReadyToNavigate,
  roleGate,
}: UseDeepLinkRouterParams) {
  const pendingLink = useRef<ParsedDeepLink | null>(null);

  const attemptPendingNavigation = () => {
    const link = pendingLink.current;
    if (!link) return;

    const consumed = navigateToParsedDeepLink(link, {
      isReadyToNavigate,
      roleGate,
    });
    if (consumed) {
      pendingLink.current = null;
    }
  };

  const handleIncomingUrl = (url: string | null) => {
    if (!url) return;
    const link = parseDeepLink(url);
    if (link.path.length === 0) return;

    pendingLink.current = link;
    attemptPendingNavigation();
  };

  useEffect(() => {
    void Linking.getInitialURL().then(handleIncomingUrl);

    const subscription = Linking.addEventListener("url", (event) => {
      handleIncomingUrl(event.url);
    });

    return () => subscription.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    attemptPendingNavigation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReadyToNavigate, roleGate]);
}
