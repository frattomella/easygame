/**
 * **Chi deve dare il numero, e chi deve dimostrare di averlo.**
 *
 * Modulo puro. Prima questo file conosceva Twilio per nome: tre variabili
 * d'ambiente di **un** fornitore decidevano se il prodotto avesse o no il
 * concetto di «numero di cellulare». Le conseguenze erano due, e nessuna delle
 * due era voluta:
 *
 * 1. su un'installazione senza quelle tre variabili — cioe tutte quelle
 *    esistenti — il campo «Cellulare» **non compariva nemmeno** nel modulo di
 *    registrazione (`auth-shell.tsx` lo mostrava solo se
 *    `capabilities.phoneVerification`), l'utente veniva creato con `phone`
 *    nullo, `phone_verification_required` falso, e l'intero flusso OTP —
 *    rotte, challenge, contatori, il test sui tentativi atomici — era codice
 *    **irraggiungibile** (CLAUDE.md §11, punto 8);
 * 2. cambiare fornitore avrebbe cambiato una regola di prodotto, che e
 *    esattamente il contrario di come devono stare le due cose.
 *
 * Da PP-05 le due domande sono separate (ADR-0115):
 *
 * - **il numero e obbligatorio**: sempre, per ogni account nuovo. Non dipende
 *   da nessun fornitore, perche raccogliere un dato non richiede un contratto;
 * - **la verifica e obbligatoria**: quando si puo consegnare un codice, e
 *   finche non e disattivata per scelta esplicita.
 */

export type PhoneVerificationEnvironment = Partial<
  Record<
    | "NODE_ENV"
    | "AUTH_ALLOW_TEST_CODES"
    | "AUTH_REQUIRE_PHONE_VERIFICATION"
    | "SMS_PROVIDER",
    string | undefined
  >
>;

/**
 * C'e un trasporto che possa portare un SMS fuori di qui?
 *
 * Ricalca `resolveSmsProvider` (`src/lib/server/sms/sms-service.ts`) senza
 * importarlo: quello e un modulo server, questo e puro e lo importa anche chi
 * non puo caricare `src/lib/server/**`. La duplicazione e una riga e il
 * contratto e dichiarato in entrambi i posti — l'alternativa era rendere
 * questo file non testabile senza database.
 */
export const isSmsTransportConfigured = (
  environment: PhoneVerificationEnvironment = process.env,
) => String(environment.SMS_PROVIDER || "").trim().toLowerCase() === "noop";

/**
 * Si puo far arrivare un codice a una persona?
 *
 * Due strade: un trasporto vero, oppure i codici di prova — che in sviluppo
 * tornano nella risposta e in produzione non esistono mai
 * (`shouldExposeVerificationPreviewCode`).
 */
export const canDeliverPhoneOtp = (
  environment: PhoneVerificationEnvironment = process.env,
) =>
  isSmsTransportConfigured(environment) ||
  (environment.NODE_ENV !== "production" &&
    environment.AUTH_ALLOW_TEST_CODES === "true");

/**
 * **Il numero e obbligatorio. Punto.**
 *
 * Non prende l'ambiente perche non lo guarda: e la regola di prodotto decisa
 * in PP-05, e una regola che si puo spegnere con una variabile e una regola
 * che prima o poi qualcuno spegne.
 */
export const isPhoneNumberRequiredAtSignup = () => true;

/**
 * La verifica del telefono blocca l'accesso?
 *
 * `AUTH_REQUIRE_PHONE_VERIFICATION` vale `true` se non detto altrimenti: il
 * default e la regola, non la deroga. Ma **non si puo richiedere cio che non
 * si puo consegnare**: senza un trasporto e senza codici di prova, pretendere
 * la verifica significherebbe chiudere fuori ogni account nuovo di
 * un'installazione che non ha ancora comprato un operatore SMS.
 *
 * Questo non e un ripiego silenzioso: `/api/v1/auth/providers` restituisce
 * `phoneVerificationRequired` e la schermata di registrazione lo dice. Chi
 * installa vede la differenza fra «verificato» e «raccolto e basta» senza
 * doverla dedurre.
 */
export const isPhoneVerificationRequired = (
  environment: PhoneVerificationEnvironment = process.env,
) =>
  String(environment.AUTH_REQUIRE_PHONE_VERIFICATION || "true")
    .trim()
    .toLowerCase() !== "false" && canDeliverPhoneOtp(environment);

/**
 * Il nome storico, mantenuto per i chiamanti che chiedono «esiste il concetto
 * di verifica telefono su questa installazione». Oggi coincide con «la si puo
 * consegnare»: raccogliere il numero non e piu una capability opzionale.
 */
export const isPhoneVerificationEnabled = (
  environment: PhoneVerificationEnvironment = process.env,
) => canDeliverPhoneOtp(environment);
