/**
 * Non il difetto della dashboard Web: li un 403 o un 500 su una singola
 * risorsa veniva inghiottito da `toApiList` e la schermata mostrava "nessun
 * elemento", indistinguibile da un elenco vuoto per davvero (vedi il report
 * di audit Identity & Access, sezione Trainer). Qui l'errore si classifica
 * **prima** di decidere cosa disegnare, cosi loading, vuoto-reale,
 * accesso-negato ed errore-di-rete restano quattro stati diversi — vedi
 * `StateMessage`.
 *
 * `Accesso negato` e la stringa che ogni rotta del dominio usa per un
 * diniego di permesso (CLAUDE.md §8: "un errore di autorizzazione deve
 * contenere la stringa `Accesso negato`"): riconoscerla qui non duplica la
 * regola di permesso — il server ha gia deciso — legge solo cio che ha gia
 * scritto.
 */
export type FetchErrorKind = "forbidden" | "network" | "error";

const NETWORK_HINTS = [
  "errore di connessione",
  "timeout",
  "network",
  "backend easygame non configurato",
  "temporaneamente non disponibile",
];

export const classifyFetchError = (error: unknown): FetchErrorKind => {
  const message = String(
    error instanceof Error ? error.message : error || "",
  ).toLowerCase();

  if (message.includes("accesso negato")) return "forbidden";
  if (NETWORK_HINTS.some((hint) => message.includes(hint))) return "network";
  return "error";
};

export const fetchErrorMessage = (error: unknown, fallback: string) =>
  (error instanceof Error && error.message) || fallback;
