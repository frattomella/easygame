export type AuthRateLimitPolicy = {
  /**
   * Il nome del contatore. Le prime quattro voci sono di autenticazione; le
   * due dei moduli pubblici usano lo stesso meccanismo perche il problema e
   * lo stesso — un endpoint raggiungibile senza sessione — e un secondo
   * sistema di conteggio sarebbe una seconda implementazione della stessa
   * cosa.
   */
  scope:
    | "login"
    | "register"
    | "otp_send"
    | "otp_confirm"
    | "public_form_view"
    | "public_form_submit"
    | "payment_link_view"
    | "payment_link_checkout"
    | "enrollment_status"
    | "access_token_redeem"
    /** Cambio di un fattore su un account gia autenticato (PP-05). */
    | "credential_change";
  limit: number;
  windowMs: number;
};

export type AuthRateLimitResult = {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfterSeconds: number;
};

export const AUTH_RATE_LIMITS = {
  loginIdentity: { scope: "login", limit: 10, windowMs: 15 * 60_000 },
  loginIp: { scope: "login", limit: 30, windowMs: 15 * 60_000 },
  registerIdentity: { scope: "register", limit: 3, windowMs: 60 * 60_000 },
  registerIp: { scope: "register", limit: 10, windowMs: 60 * 60_000 },
  otpSend: { scope: "otp_send", limit: 3, windowMs: 10 * 60_000 },
  otpConfirm: { scope: "otp_confirm", limit: 5, windowMs: 15 * 60_000 },
  /*
    **Tre assi, e non uno solo (PP-05).**

    Il contatore degli OTP contava una chiave sola, `canale:utente:indirizzoIP`.
    Chi cambia rete cambia chiave: con una manciata di indirizzi in uscita si
    facevano partire tutti gli SMS che si volevano **verso il numero di un
    altro**, e ogni invio invalidava il codice che la vittima aveva appena
    ricevuto. Costava soldi al club e rendeva l'account inverificabile.

    Da qui in avanti gli assi sono tre e si contano tutti:

    - **per account** — ferma chi martella un identificativo che ha scoperto,
      da qualunque rete;
    - **per destinatario** (numero in E.164, oppure indirizzo email), sempre
      come **impronta** e mai in chiaro: e l'asse che ferma il pompaggio di SMS
      verso un numero, anche quando l'attaccante si crea account nuovi;
    - **per indirizzo IP** — ferma chi prova tanti account diversi.

    Cinque invii all'ora coprono chi non riceve l'SMS e riprova con calma;
    venti per indirizzo coprono una rete condivisa. Il cooldown di
    `otp-policy.ts` e una cosa diversa e vive accanto a questi: dice «non
    adesso», non «non piu».
  */
  otpSendAccount: { scope: "otp_send", limit: 5, windowMs: 60 * 60_000 },
  otpSendTarget: { scope: "otp_send", limit: 5, windowMs: 60 * 60_000 },
  otpSendIp: { scope: "otp_send", limit: 20, windowMs: 60 * 60_000 },
  /*
    Sulla conferma il tetto vero e quello della challenge — cinque tentativi e
    poi e carta straccia, in una scrittura condizionata sola. Questi due
    contatori servono a cio che quel tetto non copre: chi si fa emettere
    challenge nuove per avere tentativi nuovi. Per account restano cinque in un
    quarto d'ora; per indirizzo trenta, che copre una rete condivisa e non
    copre nessuna enumerazione.
  */
  otpConfirmIp: { scope: "otp_confirm", limit: 30, windowMs: 15 * 60_000 },
  /*
    **Cambiare un fattore ha un tetto** (MEDIUM-7 della revisione ostile
    PP-05A).

    `PATCH /api/v1/auth/user` chiede la password attuale per cambiare email,
    cellulare o password — ed e la difesa introdotta proprio contro la sessione
    rubata. Ma non contava i tentativi: la revisione ne ha misurati **25 di
    fila senza mai un 429**, e nessun evento di audit. Chi aveva la sessione
    poteva indovinare la password con calma, cioe rendere permanente un accesso
    temporaneo — esattamente cio che quella richiesta doveva impedire.

    Dieci in un quarto d'ora per account: e la stessa larghezza del login, e
    non c'e ragione perche una porta secondaria sia piu larga di quella
    principale.
  */
  credentialChangeAccount: {
    scope: "credential_change",
    limit: 10,
    windowMs: 15 * 60_000,
  },
  credentialChangeIp: {
    scope: "credential_change",
    limit: 30,
    windowMs: 15 * 60_000,
  },
  /*
    Aprire un modulo pubblico e gratuito ma non illimitato: sessanta aperture
    in un quarto d'ora da uno stesso indirizzo bastano a una famiglia che
    ricarica, e non bastano a enumerare gli slug.
  */
  publicFormView: { scope: "public_form_view", limit: 60, windowMs: 15 * 60_000 },
  /*
    Inviare invece costa: crea righe e allegati. Dieci invii all'ora dallo
    stesso indirizzo coprono una famiglia con tre figli che sbaglia due volte,
    e fermano chi riempie la coda della segreteria.
  */
  publicFormSubmit: { scope: "public_form_submit", limit: 10, windowMs: 60 * 60_000 },
  /*
    Il link di pagamento (W2-B). Due contatori per gesto, e non uno: quello
    **per token** ferma chi martella un link che ha ricevuto o indovinato,
    quello **per indirizzo** ferma chi ne prova tanti diversi. Con un contatore
    solo per indirizzo, chi cambia rete continuerebbe indisturbato sullo stesso
    token; con uno solo per token, ogni tentativo su un token nuovo ripartirebbe
    da zero — che e esattamente la forma di un tentativo a forza bruta.

    Trenta aperture in un quarto d'ora sullo stesso link bastano a una famiglia
    che ricarica e che torna dal pagamento; sessanta per indirizzo coprono una
    rete condivisa senza lasciare spazio all'enumerazione.
  */
  paymentLinkViewToken: {
    scope: "payment_link_view",
    limit: 30,
    windowMs: 15 * 60_000,
  },
  paymentLinkViewIp: {
    scope: "payment_link_view",
    limit: 60,
    windowMs: 15 * 60_000,
  },
  /*
    Aprire un checkout costa: e una chiamata al PSP e una sessione di pagamento
    creata. Dieci all'ora sullo stesso link coprono una famiglia che sbaglia
    carta piu volte, e non reggono nessun abuso.
  */
  paymentLinkCheckoutToken: {
    scope: "payment_link_checkout",
    limit: 10,
    windowMs: 60 * 60_000,
  },
  /*
    **Il riscatto di un gettone d'accesso** (Wave 6, closeout).

    Un gettone e un codice corto, scritto a mano da chi lo riceve, e chi lo
    riscatta ottiene una **tessera nel club** con il ruolo che il gettone
    porta scritto dentro. Non c'era nessun contatore: un'utenza qualunque
    poteva provarne quanti ne voleva, e un colpo a segno vale una tessera.

    Due contatori come per il link di pagamento, e per la stessa ragione:
    quello per **utenza** ferma chi prova in sequenza da un account solo,
    quello per **indirizzo** ferma chi si crea account nuovi. Dieci
    tentativi all'ora coprono chi trascrive male un codice tre volte, e non
    reggono nessuna enumerazione.
  */
  accessTokenRedeemUser: {
    scope: "access_token_redeem",
    limit: 10,
    windowMs: 60 * 60_000,
  },
  accessTokenRedeemIp: {
    scope: "access_token_redeem",
    limit: 30,
    windowMs: 60 * 60_000,
  },
  paymentLinkCheckoutIp: {
    scope: "payment_link_checkout",
    limit: 20,
    windowMs: 60 * 60_000,
  },
  /*
    La ricevuta di un'iscrizione (Wave 5, lane 5G). Due contatori come per il
    link di pagamento, e per la stessa ragione: con il solo contatore per
    indirizzo chi cambia rete continuerebbe a martellare lo stesso riferimento,
    con il solo contatore per riferimento ogni tentativo su uno nuovo
    ripartirebbe da zero — che e la forma esatta di un attacco a forza bruta.

    Il conteggio per riferimento usa l'**impronta**, mai il riferimento in
    chiaro: i contatori non devono diventare un posto in piu da cui leggere una
    credenziale funzionante.

    Piu larghi di quelli del pagamento perche il gesto e piu innocuo — si
    ricarica una pagina di stato in attesa di una risposta — e non c'e nessun
    denaro dietro.
  */
  enrollmentStatusReference: {
    scope: "enrollment_status",
    limit: 60,
    windowMs: 15 * 60_000,
  },
  enrollmentStatusIp: {
    scope: "enrollment_status",
    limit: 120,
    windowMs: 15 * 60_000,
  },
} as const satisfies Record<string, AuthRateLimitPolicy>;

export const buildRateLimitResult = (
  count: number,
  policy: AuthRateLimitPolicy,
  expiresAt: Date,
  now = new Date(),
): AuthRateLimitResult => ({
  allowed: count <= policy.limit,
  limit: policy.limit,
  remaining: Math.max(policy.limit - count, 0),
  retryAfterSeconds: Math.max(
    Math.ceil((expiresAt.getTime() - now.getTime()) / 1000),
    1,
  ),
});
