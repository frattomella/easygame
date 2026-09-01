/**
 * **Quali consensi esistono, e quale comunicazione ne dipende.**
 *
 * Due elenchi chiusi, in un modulo puro, per due difetti diversi.
 *
 * ## 1. Le chiavi predefinite
 *
 * `ConsentDefinition.key` e testo libero (`/^[a-z0-9_-]+$/`, quaranta
 * caratteri) e non c'e nessun seed: due societa che vogliono la stessa cosa
 * scrivono `marketing` e `newsletter`, e da quel momento nessuna regola di
 * prodotto puo piu nominare «il consenso alle comunicazioni promozionali»
 * perche non ha un nome. Qui c'e quel nome. **Non e un vincolo**: un club puo
 * continuare a definire le proprie chiavi, e la validazione resta quella del
 * dominio. E il vocabolario che il prodotto conosce e su cui puo appoggiare
 * una regola.
 *
 * ## 2. La classe di ogni comunicazione
 *
 * La ricognizione G della Wave 6 ha censito venti percorsi di invio; quindici
 * hanno un contenuto o un destinatario che un consenso potrebbe governare, e
 * **zero** consultavano il registro. Prima di far consultare il registro
 * bisogna dire a chi si applica, e la risposta e una **regola di prodotto**
 * dichiarata al §15.1 del piano della Wave 6:
 *
 * > Solo la classe **marketing e generica** e governata dal consenso.
 * > Sicurezza, amministrativa necessaria, pagamento, sanitaria e sportiva
 * > passano.
 *
 * **Product rule, non legal validation.** Questa tabella dice quale meccanismo
 * il software applica; non e una consulenza legale e non pretende di esserlo.
 * Cio che la Wave 6 costruisce e il **meccanismo** — un consenso puo bloccare
 * un invio, e la revoca ha effetto — piu il default sicuro. Se un
 * professionista decidera che un'altra classe va governata, il cambiamento e
 * una riga di questa tabella: nessuna funzione di invio conosce il nome di una
 * chiave di consenso, e nessuna deve conoscerlo.
 *
 * Modulo **puro**: nessun Prisma, nessuna rete, nessun DOM.
 */

/* ----------------------------------------------- le chiavi predefinite */

/**
 * Le chiavi che il prodotto conosce per nome.
 *
 * Poche e stabili: una chiave in piu qui e un vocabolo che ogni club dovra
 * capire, e un vocabolario lungo si usa male quanto uno assente.
 */
export const STANDARD_CONSENT_KEYS = {
  /** L'informativa sul trattamento: presa d'atto, non scelta. */
  privacy: "privacy",
  /** Comunicazioni promozionali e generiche del club. */
  marketing: "marketing",
  /** Pubblicazione di foto e video che ritraggono la persona. */
  images: "images",
  /** Comunicazione dei dati a terzi: federazione, assicurazione, ente. */
  third_party: "third_party",
} as const;

export type StandardConsentKey =
  (typeof STANDARD_CONSENT_KEYS)[keyof typeof STANDARD_CONSENT_KEYS];

export type StandardConsentDefinition = {
  key: StandardConsentKey;
  title: string;
  description: string;
  /** Vero quando senza quella decisione il servizio non e erogabile. */
  required: boolean;
};

export const STANDARD_CONSENT_DEFINITIONS: readonly StandardConsentDefinition[] =
  [
    {
      key: STANDARD_CONSENT_KEYS.privacy,
      title: "Informativa sul trattamento dei dati",
      description:
        "Presa d'atto dell'informativa consegnata dalla societa al momento dell'iscrizione.",
      required: true,
    },
    {
      key: STANDARD_CONSENT_KEYS.marketing,
      title: "Comunicazioni promozionali e informative del club",
      description:
        "Newsletter, iniziative, eventi e comunicazioni non necessarie all'esecuzione del servizio.",
      required: false,
    },
    {
      key: STANDARD_CONSENT_KEYS.images,
      title: "Pubblicazione di immagini e video",
      description:
        "Fotografie e riprese realizzate durante allenamenti, gare e manifestazioni.",
      required: false,
    },
    {
      key: STANDARD_CONSENT_KEYS.third_party,
      title: "Comunicazione dei dati a terzi",
      description:
        "Federazione, ente di promozione sportiva, assicurazione e altri soggetti necessari al tesseramento.",
      required: false,
    },
  ] as const;

export const isStandardConsentKey = (
  value: unknown,
): value is StandardConsentKey =>
  Object.values(STANDARD_CONSENT_KEYS).includes(
    String(value ?? "").trim().toLowerCase() as StandardConsentKey,
  );

/* ------------------------------------------ le classi di comunicazione */

/**
 * Le sei nature di un messaggio in uscita. Sono la colonna «Natura» della
 * tabella del §15.1, e ognuna ha una ragione che sopravvive al singolo invio.
 */
export const COMMUNICATION_CLASSES = [
  /** Verifica email, verifica telefono, reset password. */
  "security",
  /** Esito di un modulo, richiesta documentale, appuntamento, scadenze. */
  "administrative",
  /** Rate in scadenza, rate scadute, sollecito insoluti. */
  "payment",
  /** Certificato mancante, in scadenza, scaduto: **a contenuto cieco**. */
  "health",
  /** Convocazioni, inviti a confermare, bacheca. */
  "sport",
  /** Comunicazione massiva del club, digest: l'unico canale a testo libero. */
  "marketing",
  /** Pubblicazione di foto e video: nessun percorso esiste ancora. */
  "media",
] as const;

export type CommunicationClass = (typeof COMMUNICATION_CLASSES)[number];

/**
 * I percorsi di invio censiti, con la loro natura.
 *
 * Il nome e quello del **percorso**, non della funzione che lo esegue: una
 * funzione si rinomina, e il piano parla di comunicazioni.
 */
export const COMMUNICATION_KIND_CLASSES = {
  auth_email_verification: "security",
  auth_phone_verification: "security",
  auth_password_reset: "security",
  auth_access_credentials: "security",

  form_submission_outcome: "administrative",
  document_request: "administrative",
  document_request_reminder: "administrative",
  document_expiry: "administrative",
  appointment_decision: "administrative",
  enrollment_outcome: "administrative",

  payment_reminder: "payment",
  payment_overdue: "payment",
  payment_link: "payment",

  medical_certificate_reminder: "health",

  event_convocation: "sport",
  event_rsvp_invite: "sport",
  board_announcement: "sport",

  club_broadcast: "marketing",
  club_digest: "marketing",

  media_publication: "media",
} as const satisfies Record<string, CommunicationClass>;

export type CommunicationKind = keyof typeof COMMUNICATION_KIND_CLASSES;

/**
 * Le classi governate dal consenso, e la chiave che le governa.
 *
 * **Una classe assente da questa mappa passa sempre.** E il default sicuro
 * dichiarato al §15.1: un club che non puo sollecitare una rata o avvisare di
 * un certificato scaduto non e un gestionale, e una revoca del consenso
 * promozionale non deve poter spegnere la verifica di un indirizzo email —
 * senza la quale l'account non e nemmeno proteggibile.
 */
const CONSENT_KEY_BY_CLASS: Partial<
  Record<CommunicationClass, StandardConsentKey>
> = {
  marketing: STANDARD_CONSENT_KEYS.marketing,
  /*
    Nessun percorso di pubblicazione foto esiste oggi: la riga c'e perche il
    giorno in cui esistera il suo autore trovi la regola gia scritta, invece di
    doverla decidere dentro la schermata che sta costruendo.
  */
  media: STANDARD_CONSENT_KEYS.images,
};

/** La classe di un percorso di invio, o `null` se il nome non e censito. */
export const communicationClassOf = (
  kind: unknown,
): CommunicationClass | null => {
  const name = String(kind ?? "").trim();
  return (
    (COMMUNICATION_KIND_CLASSES as Record<string, CommunicationClass>)[name] ||
    null
  );
};

/**
 * **La domanda che una funzione di invio deve fare.**
 *
 * «Questo messaggio ha bisogno di un consenso, e di quale?» Risposta `null` =
 * si manda. Il valore restituito si passa a `resolveAudience` come
 * `requiredConsentKey`, e li diventa un'esclusione con il motivo.
 *
 * Un percorso **non censito** restituisce `null` e passa: e deliberato. Un
 * invio nuovo non deve smettere di funzionare perche il suo autore non ha
 * aggiornato questa tabella; deve comparire nel test che elenca i percorsi
 * censiti, che e il posto dove la dimenticanza si vede.
 */
export const consentKeyForCommunication = (
  kind: unknown,
): StandardConsentKey | null => {
  const klass = communicationClassOf(kind);
  if (!klass) return null;
  return CONSENT_KEY_BY_CLASS[klass] ?? null;
};

/** I percorsi che oggi il consenso governa davvero. Per i test e per la KB. */
export const GOVERNED_COMMUNICATION_KINDS = (
  Object.keys(COMMUNICATION_KIND_CLASSES) as CommunicationKind[]
).filter((kind) => consentKeyForCommunication(kind) !== null);
