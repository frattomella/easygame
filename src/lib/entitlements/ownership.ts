/**
 * Di chi sono il piano e i servizi di un club: **della piattaforma**.
 *
 * **Il problema che questo file chiude.** Piano, stato dell'abbonamento e
 * servizi aggiuntivi stanno in `clubs.settings`, e `clubs.settings` si scrive
 * dalla pagina Organizzazione, cioe dal club. Finche quei campi
 * **descrivevano** non era un problema. Da quando decidono cosa un club puo
 * usare ([ADR-0046](../../../docs/knowledge-base/18-decision-log.md)), un
 * club che li scrive si concede il piano superiore da solo: e D37, ed e il
 * motivo per cui il gating vero non e mai stato acceso.
 *
 * **Perche una funzione pura e non un controllo nella pagina.** Nascondere i
 * campi nell'interfaccia non protegge niente: la scrittura passa da
 * `PATCH /api/v1/clubs/:id`, e chiunque sappia aprire la console del browser
 * la puo rifare a mano. La regola deve stare **dove il dato viene scritto**, e
 * deve essere provabile senza database.
 *
 * **Perche si conserva invece di rifiutare.** La pagina Organizzazione
 * rimanda l'intero blocco delle impostazioni a ogni salvataggio, anche quando
 * si e cambiato solo un recapito. Rispondere «Accesso negato» al salvataggio
 * di un numero di telefono renderebbe la pagina inutilizzabile. Il valore che
 * arriva dal club viene quindi **ignorato** e sostituito con quello che c'e
 * gia; l'elenco di cio che e stato ignorato torna al chiamante, che lo
 * registra nell'audit — perche un tentativo di cambiarsi il piano e
 * esattamente il genere di cosa che si vuole poter leggere dopo.
 *
 * Modulo **puro**: nessun database, nessuna sessione.
 */

/**
 * Le chiavi di `clubs.settings` che solo la piattaforma puo scrivere.
 *
 * `subscription` e la chiave scritta oggi dalla pagina Organizzazione;
 * `subscriptionSettings` e il nome che il lettore degli entitlement usava, ed
 * e conservato perche esistono installazioni con l'una o con l'altra. Sono
 * **entrambe** di proprieta della piattaforma: proteggerne una sola vorrebbe
 * dire lasciare aperta la seconda.
 */
export const PLATFORM_OWNED_SETTINGS_KEYS = [
  "subscription",
  "subscriptionSettings",
  "extraServices",
  "entitlements",
] as const;

export type PlatformOwnedSettingsKey =
  (typeof PLATFORM_OWNED_SETTINGS_KEYS)[number];

const asRecord = (value: unknown): Record<string, any> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {};

/**
 * Confronto per valore, senza dipendenze.
 *
 * Serve a distinguere «il club ha rimandato indietro cio che aveva letto» —
 * che succede a ogni salvataggio ed e innocuo — da «il club ha cambiato il
 * piano», che e un tentativo e va registrato.
 */
const sameValue = (a: unknown, b: unknown) => {
  if (a === b) return true;
  if (a === undefined || b === undefined) return false;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
};

export type PlatformOwnedGuardResult = {
  /** Le impostazioni da scrivere davvero. */
  settings: Record<string, any>;
  /** Le chiavi che il chiamante ha provato a cambiare senza poterlo fare. */
  rejectedKeys: PlatformOwnedSettingsKey[];
};

/**
 * Rimette al loro posto i campi che il club non puo scrivere.
 *
 * `isPlatformAdmin` non deve **mai** arrivare dal corpo di una richiesta: si
 * ricava dalla sessione, come ovunque negli entitlement.
 */
export const withPlatformOwnedSettings = (
  existingSettings: unknown,
  incomingSettings: unknown,
  options: { isPlatformAdmin?: boolean } = {},
): PlatformOwnedGuardResult => {
  const existing = asRecord(existingSettings);
  const incoming = asRecord(incomingSettings);

  if (options.isPlatformAdmin) {
    return { settings: incoming, rejectedKeys: [] };
  }

  const settings: Record<string, any> = { ...incoming };
  const rejectedKeys: PlatformOwnedSettingsKey[] = [];

  for (const key of PLATFORM_OWNED_SETTINGS_KEYS) {
    const wanted = incoming[key];
    const current = existing[key];

    if (!sameValue(wanted, current)) {
      /*
        Il club voleva un valore diverso. Non lo si nega: lo si ignora, e lo
        si dice a chi ha chiamato.
      */
      if (Object.prototype.hasOwnProperty.call(incoming, key)) {
        rejectedKeys.push(key);
      }
    }

    if (Object.prototype.hasOwnProperty.call(existing, key)) {
      settings[key] = current;
    } else {
      delete settings[key];
    }
  }

  return { settings, rejectedKeys };
};

/**
 * Il valore grezzo delle impostazioni di abbonamento, da qualunque delle due
 * chiavi sia stato scritto.
 *
 * **Era un difetto reale.** Il lettore degli entitlement guardava
 * `subscriptionSettings`; la pagina Organizzazione scriveva `subscription`.
 * Nessun club aveva quindi il piano che credeva di avere: il calcolo partiva
 * sempre dai valori predefiniti. Il test che avrebbe dovuto accorgersene
 * seminava a sua volta `subscriptionSettings`, cioe provava la stessa cosa
 * sbagliata.
 */
export const readSubscriptionSettingsSource = (settings: unknown) => {
  const record = asRecord(settings);
  return record.subscription !== undefined
    ? record.subscription
    : record.subscriptionSettings;
};
