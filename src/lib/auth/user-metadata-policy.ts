/**
 * **Le chiavi che il soggetto di un dato non scrive su se stesso, in un posto
 * solo.**
 *
 * ## Perche questo file esiste
 *
 * `user_metadata` e una colonna JSON libera, e va bene che lo sia: e il posto
 * dove una persona tiene le sue preferenze. Ma due rotte scrivono quella
 * colonna — `PATCH /api/v1/auth/user` e il registro generico su
 * `PATCH /api/v1/users/<la propria riga>` — e ognuna teneva **il proprio
 * elenco** di chiavi proibite.
 *
 * Il terzo round della revisione ostile ha corretto **una** delle due, e ha
 * lasciato scritto nel commento: «due difese per lo stesso privilegio, perche
 * una sola prima o poi si dimentica». Il quinto round ha misurato che le due
 * difese non erano due copie della stessa cosa — erano due elenchi diversi,
 * uno di sette nomi e uno di tre, e nessuno li confrontava:
 *
 *     auth/user  = [app_metadata, emailVerified, isClubCreator,
 *                   is_platform_admin, phoneVerificationRequired,
 *                   phoneVerified, role]
 *     resources  = [app_metadata, is_platform_admin, role]
 *
 * Due difese contro lo stesso privilegio si tengono uguali **solo se sono la
 * stessa riga**. Duplicarle non raddoppia la protezione: raddoppia i posti in
 * cui dimenticarsi di aggiornarla, e ne lascia scoperto uno senza che nessuno
 * se ne accorga.
 *
 * ## Cosa c'e dentro, e perche
 *
 * Due famiglie, entrambe con la stessa ragione — **il loro valore non e un
 * dato della persona, e una conclusione del server**:
 *
 * - i **privilegi** (`role`, `app_metadata`, `is_platform_admin`): un
 *   privilegio che si concede da se non e un privilegio;
 * - le **proiezioni calcolate** (`emailVerified`, `phoneVerified`,
 *   `phoneVerificationRequired`, `isClubCreator`): `buildUserMetadata` le
 *   ricalcola dalle colonne a ogni serializzazione. Persisterle non cambia cio
 *   che il browser legge — viene sovrascritto — e cambia **solo** cio che
 *   leggono i chiamanti lato server. Una scrittura senza effetto visibile e con
 *   un effetto invisibile e la forma peggiore che possa avere.
 *
 * L'elenco cresce quando un lettore impara a leggere una chiave nuova, e la
 * regola per aggiungerne una e questa: **se il server la calcola, il client non
 * la scrive.** Non si aggiunge un nome perche qualcuno ha trovato come
 * sfruttarlo.
 *
 * Modulo puro: nessun Prisma, nessuna rete, nessun import di `server/`.
 */
export const PROTECTED_USER_METADATA_KEYS = [
  "role",
  "app_metadata",
  "is_platform_admin",
  "emailVerified",
  "phoneVerified",
  "phoneVerificationRequired",
  "isClubCreator",
] as const;

export type ProtectedUserMetadataKey =
  (typeof PROTECTED_USER_METADATA_KEYS)[number];

const proibite = new Set<string>(PROTECTED_USER_METADATA_KEYS);

/** Se questa chiave la decide il server e non chi la manda. */
export const isProtectedUserMetadataKey = (chiave: string) =>
  proibite.has(chiave);

/**
 * Le preferenze vere di una persona, senza cio che il server calcola.
 *
 * Non solleva e non segnala: una chiave calcolata mandata insieme alle
 * preferenze e quasi sempre un client che rimanda indietro l'oggetto che ha
 * appena ricevuto, non un attacco. Si toglie e si prosegue.
 */
export const stripProtectedUserMetadata = (
  metadata: Record<string, unknown> | null | undefined,
): Record<string, unknown> => {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(metadata).filter(([chiave]) => !proibite.has(chiave)),
  );
};
