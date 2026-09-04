import { reportServerError } from "../observability";
import {
  SMS_TRANSPORT_UNKNOWN_MESSAGE,
  resolveSmsTransport,
} from "../../auth/sms-transport";
import type {
  SafeSmsErrorCode,
  SmsDeliveryResult,
  SmsMessage,
  SmsProvider,
} from "./provider";

/**
 * **L'unico punto da cui esce un SMS.**
 *
 * Stessa regola di `src/lib/server/email/`: chi vuole mandare un messaggio
 * passa di qui, e nessuno istanzia un provider per conto proprio.
 *
 * ## Lo stato di questo modulo (ADR-0114)
 *
 * Nessun operatore reale e cablato, ed e una scelta: la scelta dell'operatore
 * e una **decisione commerciale** — contratto, DPA, budget, registrazione del
 * mittente alfanumerico presso gli operatori italiani — e non e una decisione
 * che si prende scrivendo codice. Quello che c'e qui e l'astrazione piu il
 * provider che **non spedisce**, cioe esattamente cio che serve perche il
 * flusso sia completo, provabile e pronto a ricevere l'operatore scelto in un
 * file solo.
 *
 * Aggiungere l'operatore vero significa: un file `<nome>-provider.ts` che
 * implementa `SmsProvider`, tre righe in `resolveSmsProvider`, le variabili in
 * `.env.example` e la riga in `13-environments.md`. Nient'altro cambia, e in
 * particolare non cambia niente della sicurezza dell'OTP, che non e delegata.
 */

/** Non spedisce, e lo dichiara. Il provider di sviluppo e degli ambienti muti. */
export class NoopSmsProvider implements SmsProvider {
  readonly id = "noop";

  async send(_message: SmsMessage) {
    /*
      **Non si registra niente, nemmeno il numero.** Un log «SMS non inviato a
      +39340...» in sviluppo diventa un log in staging, e da li un numero di
      cellulare finisce in un archivio di righe di testo che nessuno considera
      un archivio di dati personali. Chi sviluppa legge il codice dalla
      risposta di anteprima (`AUTH_ALLOW_TEST_CODES`), che e il canale
      previsto e che in produzione e spento.
    */
  }
}

let providerOverride: SmsProvider | null | undefined;

/**
 * Sostituisce il trasporto per la durata di un test.
 *
 * Esiste per la stessa ragione di `__setPrismaClientForTests`: una prova
 * comportamentale deve poter dire «questo numero ha ricevuto questo testo»
 * senza che nessun byte esca dalla macchina. `undefined` rimette la
 * risoluzione normale.
 */
export const __setSmsProviderForTests = (
  provider: SmsProvider | null | undefined,
) => {
  providerOverride = provider;
};

/**
 * Il trasporto configurato, oppure `null`.
 *
 * `SMS_PROVIDER` e il nome dell'operatore. Oggi l'unico valore che produce un
 * trasporto e `noop`, che non spedisce: un nome sconosciuto **non** ricade su
 * `noop` in silenzio, perche un'installazione che ha scritto `SMS_PROVIDER`
 * sbagliato deve accorgersene invece di credere di spedire.
 */
/**
 * Un nome sconosciuto si dice **una volta sola**, e senza il valore dentro.
 *
 * Senza questa riga la configurazione sbagliata era completamente muta
 * (HIGH-2): `resolveSmsProvider` rispondeva `null` e chi aveva scritto
 * `SMS_PROVIDER=twilio` credeva di aver acceso l'invio. Il messaggio non
 * riporta il valore letto dall'ambiente: una variabile non si ripete mai in
 * chiaro in un log.
 */
let nomeSconosciutoGiaSegnalato = false;

export const resolveSmsProvider = (
  environment: Record<string, string | undefined> = process.env,
): SmsProvider | null => {
  if (providerOverride !== undefined) return providerOverride;

  const esito = resolveSmsTransport(environment);
  if (esito.kind === "absent") return null;

  if (esito.kind === "unknown") {
    if (!nomeSconosciutoGiaSegnalato) {
      nomeSconosciutoGiaSegnalato = true;
      reportServerError(new Error(SMS_TRANSPORT_UNKNOWN_MESSAGE), {
        route: "lib/server/sms/sms-service",
        method: "resolveSmsProvider",
      });
    }
    return null;
  }

  /*
    L'elenco dei nomi vive in `src/lib/auth/sms-transport.ts` e non qui: era
    ricopiato a mano anche in `provider-policy.ts`, e le due copie decidevano
    cose diverse sullo stesso valore. Aggiungere un operatore vero significa
    aggiungere una riga la e un `case` qui.
  */
  if (esito.transport.name === "noop") return new NoopSmsProvider();

  return null;
};

export const isSmsDeliveryConfigured = (
  environment: Record<string, string | undefined> = process.env,
) => resolveSmsProvider(environment) !== null;

/**
 * Manda **un** SMS, e restituisce l'esito senza addolcirlo.
 *
 * Non solleva mai: un SMS che non parte non deve far fallire la registrazione
 * di un account, perche la challenge e gia scritta e il codice si puo
 * richiedere di nuovo. Chi chiama decide cosa dire all'utente guardando lo
 * `status`.
 */
export const sendSms = async (
  message: SmsMessage,
): Promise<SmsDeliveryResult> => {
  const provider = resolveSmsProvider();
  if (!provider) return { status: "skipped", reason: "not_configured" };

  try {
    await provider.send(message);
    return { status: "sent", provider: provider.id };
  } catch (error) {
    /*
      Il punto unico degli errori (CLAUDE.md §2): riduce a nome, prima riga e
      codice. Il messaggio composto — che contiene l'OTP — non arriva qui e non
      deve arrivarci: `SmsProvider.send` si impegna a sollevare senza il testo
      dentro.
    */
    reportServerError(error, { route: "lib/server/sms/sms-service", method: "send" });
    return { status: "failed", code: toSafeSmsErrorCode(error) };
  }
};

const toSafeSmsErrorCode = (error: unknown): SafeSmsErrorCode => {
  const code = String((error as { code?: unknown })?.code || "").toUpperCase();
  if (code === "SMS_PROVIDER_REJECTED") return "SMS_PROVIDER_REJECTED";
  return "SMS_TRANSPORT_FAILED";
};

export const getSmsErrorMessage = (code: SafeSmsErrorCode) => {
  if (code === "SMS_PROVIDER_NOT_CONFIGURED") {
    return "L'invio di SMS non è configurato su questa installazione.";
  }
  if (code === "SMS_PROVIDER_REJECTED") {
    return "L'operatore ha rifiutato l'invio verso questo numero.";
  }
  return "Invio SMS non riuscito.";
};
