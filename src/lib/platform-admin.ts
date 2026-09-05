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
 * Accetta le due forme in cui una persona arriva qui: la riga del database
 * (`email_verified_at`) e la sua proiezione verso il client
 * (`user_metadata.emailVerified`, scritta da `buildUserMetadata`). Non e una
 * comodita: `/auth/complete` e le due pagine `private/` chiamano
 * `isPlatformAdminUser` con la forma serializzata, e pretendere solo la prima
 * le farebbe rispondere «no» a un amministratore vero.
 */
const indirizzoProvato = (user: any) =>
  Boolean(user?.email_verified_at) ||
  Boolean(user?.user_metadata?.emailVerified);

export const isPlatformAdminUser = (user: any) => {
  const email = String(user?.email || "").trim().toLowerCase();

  if (getPlatformAdminEmails().length > 0) {
    /*
      **Un indirizzo non verificato non concede la piattaforma** (H-1 del
      secondo round della revisione ostile PP-05).

      Fino a PP-05 questa riga era sicura per una ragione che non stava qui:
      `finalizeVerifiedSession` sollevava «Email non verificata» e un indirizzo
      non provato **non produceva nessuna sessione**, quindi non poteva valere
      come identita da nessuna parte. ADR-0115 ha tolto quel cancello — con una
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
