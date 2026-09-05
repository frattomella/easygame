const splitCsv = (value?: string | null) =>
  String(value || "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);

export const PLATFORM_ADMIN_PRIVATE_PATH = "/private/easygame-platform-admin-0c7a";

export const getPlatformAdminEmails = () =>
  Array.from(
    new Set(
      splitCsv(process.env.NEXT_PUBLIC_EASYGAME_PLATFORM_ADMIN_EMAILS).concat(
        splitCsv(process.env.EASYGAME_PLATFORM_ADMIN_EMAILS),
      ),
    ),
  );

export const isPlatformAdminEmail = (email?: string | null) => {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  if (!normalizedEmail) {
    return false;
  }

  const allowedEmails = getPlatformAdminEmails();
  if (allowedEmails.length > 0) {
    return allowedEmails.includes(normalizedEmail);
  }

  return false;
};

/**
 * **Chi amministra la piattaforma, e da dove si sa.**
 *
 * ---
 *
 * ## Il difetto, e perche era il piu facile da sfruttare di tutti
 *
 * Il ruolo si leggeva da tre posti, e il **primo** era
 * `user_metadata.role` — una colonna JSON che l'utente stesso scrive da
 * `PATCH /api/v1/auth/user`, che accettava qualunque chiave. Da qualunque
 * account — un genitore, un atleta, uno appena registrato e senza club —
 * bastava:
 *
 *     PATCH /api/v1/auth/user   {"user_metadata":{"role":"platform_admin"}}
 *
 * e la richiesta successiva era gia amministratore della piattaforma: dati di
 * pagamento di ogni societa, piani e abbonamenti scrivibili, profilo fiscale e
 * conto Stripe di qualunque club — comprese due delle cinque rotte a cui
 * questa stessa Wave aveva appena aggiunto il controllo di ruolo, perche
 * l'amministratore di piattaforma le scavalca entrambe.
 *
 * E la seconda meta: con l'elenco di indirizzi **configurato**, l'ultima riga
 * concedeva comunque sul solo ruolo. L'elenco non era una condizione, era un
 * ramo alternativo.
 *
 * ## La regola, adesso
 *
 * | Quando | Cosa vale |
 * |---|---|
 * | l'elenco di indirizzi e configurato | **solo** l'indirizzo. E la condizione, non un ramo |
 * | l'elenco e vuoto (sviluppo) | la colonna `users.role`, che un utente non puo scrivere su se stesso |
 *
 * `user_metadata.role` **non vale mai**: e un dato che il suo soggetto scrive.
 * Un privilegio che si concede da se non e un privilegio.
 */
/**
 * **L'indirizzo vale come identita solo se e stato provato** (PP-05).
 *
 * Qui arrivano **due forme** della stessa persona, e non sono equivalenti:
 *
 * - la **riga del database**, che i chiamanti lato server hanno in mano. Porta
 *   `email_verified_at`, che e una colonna scritta solo dalla conferma di un
 *   OTP, dall'adozione OAuth o dal consumo di un token di reset — cioe da
 *   qualcosa che ha attraversato la casella. Porta **anche** `user_metadata`,
 *   che e una colonna JSON **libera, scritta dal suo stesso soggetto**;
 * - la **proiezione verso il client**, che `/auth/complete` e le due pagine
 *   `private/` ricevono. Non ha la colonna, e porta `user_metadata.emailVerified`
 *   che pero **non e** quello dell'archivio: `buildUserMetadata` lo ricalcola
 *   dalla colonna a ogni serializzazione, sovrascrivendo cio che c'era.
 *
 * **La prima forma decide con la colonna e con nient'altro.** La stesura
 * precedente accettava le due sorgenti in `OR`, e quell'`OR` riapriva per
 * intero il difetto che questa funzione era stata scritta per chiudere
 * (terzo round della revisione ostile, CRITICAL): un `PATCH /auth/user` con
 * `{"data":{"emailVerified":true}}` — che non cambia nessun fattore, quindi non
 * passa nemmeno dal cancello della password attuale — persisteva il valore in
 * `user_metadata`, e alla richiesta successiva un indirizzo dell'elenco **mai
 * verificato** valeva come amministratore di piattaforma.
 *
 * La distinzione fra le due forme non e una supposizione sulla loro forma: e
 * la presenza della colonna. Chi ce l'ha viene giudicato su quella; solo chi
 * non ce l'ha — cioe chi non puo averla, perche la colonna non attraversa la
 * serializzazione — ricade sulla proiezione, che a quel punto e stata scritta
 * dal server.
 */
const indirizzoProvato = (user: any) => {
  if (user && "email_verified_at" in user) {
    return Boolean(user.email_verified_at);
  }
  return Boolean(user?.user_metadata?.emailVerified);
};

export const isPlatformAdminUser = (user: any) => {
  const email = String(user?.email || "").trim().toLowerCase();

  if (getPlatformAdminEmails().length > 0) {
    /*
      **Un indirizzo non verificato non concede la piattaforma** (H-1 del
      secondo round della revisione ostile PP-05).

      Fino a PP-05 questa riga era sicura per una ragione che non stava qui:
      `finalizeVerifiedSession` sollevava «Email non verificata» e un indirizzo
      non provato **non produceva nessuna sessione**, quindi non poteva valere
      come identita da nessuna parte. ADR-0132 ha tolto quel cancello — con una
      buona ragione — e questa riga e rimasta a decidere sul solo indirizzo.

      L'elenco degli indirizzi vive in `NEXT_PUBLIC_EASYGAME_PLATFORM_ADMIN_EMAILS`,
      cioe e **pubblicato a ogni browser**. Chiunque registrasse un indirizzo di
      quell'elenco non ancora presente in `users` — o se lo intestasse da
      `PATCH /auth/user` — era amministratore di piattaforma alla richiesta
      successiva: dati di pagamento di ogni societa, piani, profilo fiscale,
      conto Stripe.

      La regola generale: quando si toglie un cancello, si cerca **chi si
      appoggiava a quel cancello**. Qui c'era un secondo punto,
      `parent-dashboard.ts`, che il proprio controllo lo faceva gia da se.
    */
    return isPlatformAdminEmail(email) && indirizzoProvato(user);
  }

  /*
    Senza elenco configurato resta la colonna del database, che nessuna rotta
    lascia scrivere all'interessato: `PROTECTED_USER_FIELDS` in
    `src/lib/server/resources.ts` la rifiuta, e l'amministrazione degli utenti
    vive sotto `/api/v1/admin`, che chiede di essere gia amministratori.
  */
  const role = String(user?.role || "").toLowerCase();
  return role === "platform_admin" || role === "admin";
};

export const getPostLoginPath = (user: any) =>
  isPlatformAdminUser(user) ? PLATFORM_ADMIN_PRIVATE_PATH : "/account";
