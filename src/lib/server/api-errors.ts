/**
 * Cosa di un errore puo uscire dal server, e cosa no.
 *
 * ## Il difetto che questo modulo chiude
 *
 * Eliminando una categoria, la rotta generica delle risorse rispondeva 400
 * con questo corpo:
 *
 *     Invalid `prisma.clubResourceItem.findMany()` invocation:
 *     ConnectorError(... PostgresError { code: "22P02",
 *     message: "invalid input syntax for type uuid: \"category-under-12-bw552a\"" ...
 *
 * Il messaggio del driver arrivava **intero** al browser: nome del modello
 * Prisma, nome dell'operazione, codice d'errore di Postgres. Non e un segreto
 * — ma non e nemmeno qualcosa che una societa sportiva debba leggere, e a chi
 * cerca una superficie d'attacco racconta con che cosa e fatto il server.
 *
 * ## La regola
 *
 * I messaggi di dominio passano: sono scritti in italiano, per chi legge, e
 * dicono cosa fare. In particolare **«Accesso negato» deve passare**, perche
 * le rotte ci mappano sopra il 403 ([CLAUDE.md §8](../../../CLAUDE.md)).
 *
 * I messaggi che vengono dal database o dall'ORM no: al loro posto una frase
 * sola, e il dettaglio resta nei log del server, dove serve davvero.
 */

/** Impronte di un errore che nasce sotto il livello di dominio. */
const INTERNAL_ERROR_MARKERS = [
  "prisma.",
  "PrismaClient",
  "Invalid `prisma",
  "ConnectorError",
  "PostgresError",
  "invalid input syntax",
  "QueryError",
  "database",
  "Database",
];

/**
 * Il messaggio da mettere nell'envelope della risposta.
 *
 * `fallback` e cio che si legge quando l'originale non puo uscire: va scritto
 * pensando a chi ha appena premuto un pulsante, non a chi legge uno stack.
 */
export const publicErrorMessage = (
  error: unknown,
  fallback = "Operazione non riuscita",
): string => {
  const message = String((error as any)?.message || "").trim();

  if (!message) return fallback;

  // Deve passare: e la stringa su cui le rotte decidono il 403.
  if (message.includes("Accesso negato")) return message;

  const looksInternal = INTERNAL_ERROR_MARKERS.some((marker) =>
    message.includes(marker),
  );

  return looksInternal ? fallback : message;
};
