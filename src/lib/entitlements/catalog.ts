/**
 * Il catalogo delle funzioni che un piano puo includere o escludere.
 *
 * **Il problema che questo file esiste per non far nascere.** «Questo club ha
 * i report avanzati?» e una domanda che, se non ha un posto solo dove essere
 * risposta, finisce scritta a mano in ogni componente che mostra un report:
 * un `plan === "plus"` qui, un `extras.includes(...)` la, e dopo sei mesi
 * nessuno sa piu quali schermate controllano davvero qualcosa. Aggiungere un
 * piano diventa allora un lavoro di archeologia.
 *
 * **La forma della risposta.** Una funzione e inclusa in un piano, oppure e un
 * servizio che si attiva a parte, oppure e sempre disponibile. Un club puo
 * avere un'eccezione — concessa o revocata dalla console di piattaforma — e
 * l'eccezione vince su tutto, perche esiste apposta per i casi che il listino
 * non prevede.
 *
 * **Cosa NON c'e qui, deliberatamente.** I prezzi. Il prezzo di un servizio
 * sta in `HUB_EXTRA_SERVICE_DEFINITIONS` con il resto del listino; questo
 * file risponde a «chi puo usare cosa», che e una domanda di autorizzazione,
 * non di fatturazione. Tenerle separate serve il giorno in cui un servizio
 * cambia prezzo e non deve cambiare chi ci accede.
 *
 * Modulo **puro**: nessun database, nessuna sessione.
 */

import type {
  ClubSubscriptionPlan,
  HubExtraServiceKey,
} from "@/lib/payments/payment-types";

export const ENTITLEMENT_KEYS = [
  "online_payments",
  "multi_site",
  "forms_v2",
  "funding_programs",
  "document_scanner",
  "advanced_reports",
  "sms_notifications",
  "ai_documents",
  "extra_storage",
  "public_booking_portal",
] as const;

export type EntitlementKey = (typeof ENTITLEMENT_KEYS)[number];

export const isEntitlementKey = (value: unknown): value is EntitlementKey =>
  ENTITLEMENT_KEYS.includes(String(value || "") as EntitlementKey);

export type EntitlementDefinition = {
  key: EntitlementKey;
  /** Cosa legge chi amministra la piattaforma. */
  label: string;
  /** Una riga: cosa smette di funzionare se manca. */
  description: string;
  /** Dove si vede, nell'applicazione. Serve a raggrupparle nella console. */
  area: "economia" | "organizzazione" | "documenti" | "comunicazione";
  /** I piani che la comprendono senza costi aggiuntivi. */
  includedIn: ClubSubscriptionPlan[];
  /**
   * Il servizio opzionale che la sblocca, se ce n'e uno.
   *
   * Quando c'e, attivare il servizio equivale a includerla: e la ragione per
   * cui un club `free` puo avere i report avanzati senza passare a `plus`.
   */
  unlockedByExtra?: HubExtraServiceKey;
};

/**
 * Il catalogo.
 *
 * **Perche le funzioni gia in produzione stanno in `free`.** Multi-sede,
 * moduli, contributi e scanner documenti sono in uso presso club veri da
 * prima che esistesse un piano. Metterli in `plus` non sarebbe una scelta di
 * listino: sarebbe **toglierli a chi li usa**, e non e una decisione che si
 * prende scrivendo un file di configurazione.
 */
export const ENTITLEMENTS: Record<EntitlementKey, EntitlementDefinition> = {
  online_payments: {
    key: "online_payments",
    label: "Pagamenti online",
    description:
      "La famiglia paga la quota dal link, senza passare dalla segreteria.",
    area: "economia",
    includedIn: ["plus"],
  },
  multi_site: {
    key: "multi_site",
    label: "Multi-sede",
    description:
      "Piu sedi operative, gruppi categoria per sede e filtri per sede.",
    area: "organizzazione",
    includedIn: ["free", "plus"],
  },
  forms_v2: {
    key: "forms_v2",
    label: "Moduli online",
    description:
      "Builder dei moduli, link pubblico, coda delle compilazioni e approvazione.",
    area: "documenti",
    includedIn: ["free", "plus"],
  },
  funding_programs: {
    key: "funding_programs",
    label: "Contributi e voucher",
    description:
      "Bandi, maturazione dalle presenze, rendicontazione e liquidazione.",
    area: "economia",
    includedIn: ["free", "plus"],
  },
  document_scanner: {
    key: "document_scanner",
    label: "Lettura documenti",
    description: "Estrazione dei dati anagrafici da una foto del documento.",
    area: "documenti",
    includedIn: ["free", "plus"],
  },
  advanced_reports: {
    key: "advanced_reports",
    label: "Report avanzati",
    description: "Analisi estese per andamento economico e sportivo.",
    area: "economia",
    includedIn: ["plus"],
    unlockedByExtra: "advanced_reports",
  },
  sms_notifications: {
    key: "sms_notifications",
    label: "Notifiche SMS",
    description: "Comunicazioni operative sul canale SMS.",
    area: "comunicazione",
    includedIn: [],
    unlockedByExtra: "sms_notifications",
  },
  ai_documents: {
    key: "ai_documents",
    label: "Modulistica assistita",
    description: "Generazione assistita di documenti e moduli.",
    area: "documenti",
    includedIn: [],
    unlockedByExtra: "ai_documents",
  },
  extra_storage: {
    key: "extra_storage",
    label: "Spazio extra",
    description: "Archivio aggiuntivo per documenti e allegati.",
    area: "documenti",
    includedIn: [],
    unlockedByExtra: "extra_storage",
  },
  public_booking_portal: {
    key: "public_booking_portal",
    label: "Portale prenotazioni",
    description: "Portale pubblico per la prenotazione delle strutture.",
    area: "organizzazione",
    includedIn: [],
    unlockedByExtra: "public_booking_portal",
  },
};

export const getEntitlementDefinition = (key: unknown) =>
  isEntitlementKey(key) ? ENTITLEMENTS[key] : null;

export const getEntitlementLabel = (key: unknown) =>
  getEntitlementDefinition(key)?.label || "";

/** Le funzioni di un'area, nell'ordine del catalogo. */
export const getEntitlementsByArea = (area: EntitlementDefinition["area"]) =>
  ENTITLEMENT_KEYS.map((key) => ENTITLEMENTS[key]).filter(
    (definition) => definition.area === area,
  );
