/**
 * **Il contratto di un trasporto SMS. Nient'altro.**
 *
 * Stessa forma di `src/lib/server/email/provider.ts`, e non per simmetria
 * estetica: il problema e lo stesso — un messaggio, un destinatario, un esito —
 * e due forme diverse per lo stesso problema sono due posti da guardare quando
 * una consegna non arriva.
 *
 * ## Cosa il provider non fa, e perche conta (ADR-0114)
 *
 * Il provider **non genera** il codice e **non lo verifica**. Riceve un testo
 * gia scritto e un numero gia in E.164, e prova a consegnarlo.
 *
 * E la differenza fra questo modulo e la Verify API che quasi tutti gli
 * operatori offrono. Una Verify API e comoda per mezz'ora e costa tre cose:
 *
 * 1. **una seconda implementazione dell'OTP.** Il tetto dei tentativi, la
 *    scadenza, il consumo monouso e la corsa fra invio e conferma sono gia
 *    risolti in `auth-workflows.ts`, con le scritture condizionate che B-H1 e
 *    B-H2 hanno pagato. Delegarli all'operatore significa avere due meccanismi
 *    con due comportamenti, e quello dell'operatore non e provabile da qui;
 * 2. **un vincolo di fornitore.** Cambiare operatore diventerebbe cambiare il
 *    modello di sicurezza, non la stringa di una chiamata HTTP — l'opposto di
 *    cio che chiede il vincolo Cedi Platform (CLAUDE.md §10);
 * 3. **una prova impossibile.** «Il codice scade in cinque minuti» diventa una
 *    promessa del fornitore invece di una proprieta misurabile contro il
 *    database.
 *
 * Quindi: l'OTP e di EasyGame, il trasporto e comprabile.
 */

export type SmsMessage = {
  /** Il destinatario, **gia normalizzato in E.164**. Il provider non normalizza. */
  to: string;
  /** Il testo, gia composto. Solo caratteri GSM-7 dove possibile. */
  text: string;
};

export interface SmsProvider {
  readonly id: string;
  /**
   * Consegna il messaggio, oppure solleva.
   *
   * Chi solleva deve sollevare un errore **senza il testo dentro**: il testo
   * contiene l'OTP, e un errore risalendo finisce in un log.
   */
  send(message: SmsMessage): Promise<void>;
}

export type SmsDeliveryResult =
  | { status: "sent"; provider: string }
  /**
   * Nessun trasporto configurato. **Non e un errore**: e lo stato normale di
   * un'installazione che non ha ancora comprato un operatore, e la challenge
   * resta valida — il codice si legge dall'anteprima di sviluppo, oppure
   * l'utente non riesce a verificare e lo dice la schermata. Ingoiarlo come
   * «inviato» sarebbe la bugia che fa perdere due ore a chi installa.
   */
  | { status: "skipped"; reason: "not_configured" }
  | { status: "failed"; code: SafeSmsErrorCode };

export type SafeSmsErrorCode =
  | "SMS_PROVIDER_NOT_CONFIGURED"
  | "SMS_PROVIDER_REJECTED"
  | "SMS_TRANSPORT_FAILED";
