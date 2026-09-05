/**
 * **Il registro dei trasporti SMS: un nome, e cosa quel nome sa fare.**
 *
 * Modulo puro, in `src/lib/auth/` perche lo leggono due mondi che non possono
 * importarsi a vicenda: `src/lib/server/sms/sms-service.ts`, che costruisce il
 * trasporto, e `src/lib/auth/provider-policy.ts`, che decide se la verifica
 * del telefono blocchi l'accesso.
 *
 * ## Il difetto che chiude (HIGH-2 della revisione ostile PP-05A)
 *
 * I due file conoscevano l'elenco **ciascuno per conto proprio**, e a mano.
 * Erano gia divergenti nell'intento, e le due direzioni dello sbaglio erano
 * entrambe gravi:
 *
 * - `SMS_PROVIDER=noop` — l'unico valore riconosciuto — faceva **bloccare**
 *   l'accesso in attesa di una verifica che `NoopSmsProvider` non puo
 *   consegnare, perche per contratto non spedisce. Ogni account nuovo restava
 *   fuori per sempre, con il codice scritto in archivio e nessuno a riceverlo;
 * - `SMS_PROVIDER=<nome di un operatore vero>` non era riconosciuto, quindi
 *   `resolveSmsProvider` tornava `null` e la verifica **si spegneva in
 *   silenzio**. Cioe: il giorno in cui si compra l'operatore e si scrive il suo
 *   nome, si disattiva la difesa invece di attivarla. E il verso peggiore in
 *   assoluto, perche succede esattamente quando qualcuno crede di aver
 *   completato la configurazione.
 *
 * Qui l'elenco e uno e porta con se la proprieta che conta: **consegna, o non
 * consegna**. Aggiungere un operatore vero significa aggiungere una riga qui e
 * un file in `src/lib/server/sms/`; non c'e un secondo posto da ricordarsi.
 */

export type SmsTransportName = "noop";

export type SmsTransportDescriptor = {
  name: SmsTransportName;
  /**
   * `false` per un trasporto che accetta il messaggio e non lo porta a
   * nessuno. E la differenza fra «configurato» e «consegna», e su di essa si
   * decide se pretendere una verifica: pretendere cio che non si puo
   * consegnare chiude fuori le persone.
   */
  delivers: boolean;
};

export const SMS_TRANSPORTS: Record<SmsTransportName, SmsTransportDescriptor> =
  {
    noop: { name: "noop", delivers: false },
  };

export type SmsTransportResolution =
  /** Nessun `SMS_PROVIDER`: l'installazione non ha comprato un operatore. */
  | { kind: "absent" }
  /** Un nome che questo codice non conosce: e un errore di configurazione. */
  | { kind: "unknown" }
  | { kind: "configured"; transport: SmsTransportDescriptor };

/**
 * Legge `SMS_PROVIDER` e dice cosa c'e, senza costruire niente.
 *
 * I tre esiti sono distinti di proposito: «assente» e lo stato normale di
 * un'installazione senza contratto, «sconosciuto» e un errore di chi ha
 * scritto la variabile, e confonderli e il modo in cui un refuso diventa una
 * difesa spenta senza che nessuno lo noti.
 */
export const resolveSmsTransport = (
  environment: Record<string, string | undefined> = process.env,
): SmsTransportResolution => {
  const nome = String(environment.SMS_PROVIDER || "")
    .trim()
    .toLowerCase();
  if (!nome) return { kind: "absent" };

  /*
    **`Object.hasOwn` e non l'accesso diretto** (L-1 del secondo round). Un
    oggetto letterale porta con se il prototipo di `Object`: `SMS_PROVIDER=constructor`
    e `SMS_PROVIDER=__proto__` restituivano un valore veritiero, quindi
    passavano per «configurato» e **spegnevano la segnalazione di
    configurazione errata** — cioe proprio la cosa che questo modulo esiste per
    accendere. Nessun bypass, perche `delivers` restava `undefined`; ma la
    forma era quella sbagliata, e `smsTransportDelivers` restituiva `undefined`
    dove il tipo promette un booleano.
  */
  if (!Object.hasOwn(SMS_TRANSPORTS, nome)) return { kind: "unknown" };
  const trasporto = (SMS_TRANSPORTS as Record<string, SmsTransportDescriptor>)[
    nome
  ]!;
  return { kind: "configured", transport: trasporto };
};

/**
 * **Un SMS puo davvero arrivare a destinazione?**
 *
 * Non «e configurato qualcosa»: **consegna**. `noop` e configurato e non
 * consegna, e su questa distinzione si regge la differenza fra un'installazione
 * che puo pretendere la verifica del telefono e una che chiuderebbe fuori
 * chiunque.
 */
export const smsTransportDelivers = (
  environment: Record<string, string | undefined> = process.env,
) => {
  const esito = resolveSmsTransport(environment);
  return esito.kind === "configured" && esito.transport.delivers === true;
};

/**
 * Il messaggio da mostrare a chi ha configurato male, in un posto solo.
 * Non contiene il valore scritto nell'ambiente: finirebbe in un log o in una
 * risposta, e un valore d'ambiente non si ripete mai in chiaro.
 */
export const SMS_TRANSPORT_UNKNOWN_MESSAGE =
  "SMS_PROVIDER indica un operatore che questa versione non conosce: l'invio di SMS resta spento.";
