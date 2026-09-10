import {
  DeepLinkRoleGate,
  ParsedDeepLink,
  resolvePasswordResetTarget,
  resolveRoleGatedDeepLinkTarget,
} from "@/lib/deep-linking";
import { navigationRef } from "@/lib/navigation-ref";

const MAX_ATTEMPTS = 10;
const RETRY_INTERVAL_MS = 300;

/**
 * Riprova una navigazione finche il `NavigationContainer` (e, per l'area
 * Parent, il contesto figlio che monta le sue tab solo dopo aver caricato)
 * non e pronto. `navigationRef.navigate` su una rotta che non esiste ancora
 * non lancia — non fa niente — quindi l'unico modo onesto di sapere se ha
 * funzionato e continuare a provare per una finestra limitata: **best
 * effort**, non una garanzia (documentato in
 * `docs/knowledge-base/05-mobile-architecture.md`).
 */
const navigateWhenReady = (perform: () => void) => {
  let attempts = 0;
  const tick = () => {
    attempts += 1;
    if (navigationRef.isReady()) {
      perform();
      return;
    }
    if (attempts < MAX_ATTEMPTS) {
      setTimeout(tick, RETRY_INTERVAL_MS);
    }
  };
  tick();
};

/**
 * Punto unico che trasforma un link gia interpretato (`parseDeepLink`) in
 * una navigazione reale — usato sia da `useDeepLinkRouter` (URL ricevuti da
 * `expo-linking`) sia dal tocco su una notifica push (`usePushNotifications`),
 * cosi le due sorgenti condividono esattamente la stessa risoluzione invece
 * di due copie che potrebbero divergere.
 *
 * Restituisce `true` quando il link e stato **consumato** — navigato, o
 * riconosciuto e scartato perche non porta a nessuna destinazione valida —
 * e `false` quando il chiamante deve tenerlo in sospeso e riprovare quando
 * `isReadyToNavigate` cambia (bootstrap, sessione o contesto non ancora
 * risolti).
 */
export const navigateToParsedDeepLink = (
  link: ParsedDeepLink,
  context: { isReadyToNavigate: boolean; roleGate: DeepLinkRoleGate },
): boolean => {
  const resetTarget = resolvePasswordResetTarget(link);
  if (resetTarget) {
    navigateWhenReady(() => {
      navigationRef.navigate("ResetPassword", resetTarget);
    });
    return true;
  }

  if (!context.isReadyToNavigate) {
    return false;
  }

  const target = resolveRoleGatedDeepLinkTarget(link, context.roleGate);
  if (!target) {
    // Consumato: niente da aprire (percorso sconosciuto, o non pertinente
    // al ruolo corrente). Non e "in sospeso" — riprovarlo piu tardi non
    // cambierebbe l'esito.
    return true;
  }

  navigateWhenReady(() => {
    if (target.tab) {
      navigationRef.navigate(
        context.roleGate === "parent" ? "ParentMain" : "Main",
        {
          screen: target.tab,
          params: { screen: target.screen, params: target.params },
        } as never,
      );
    } else {
      // Nessuna destinazione oggi risolve senza tab (ogni voce di
      // `resolveRoleGatedDeepLinkTarget` ne dichiara uno) — ramo di riserva
      // per una futura destinazione diretta nello stack radice, cablato allo
      // stesso modo di `ResetPassword` qui sopra.
      (navigationRef.navigate as (...args: unknown[]) => void)(
        target.screen,
        target.params,
      );
    }
  });
  return true;
};
