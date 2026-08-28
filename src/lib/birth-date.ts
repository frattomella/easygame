/**
 * Che cosa puo essere una data di nascita (RC FIX 3).
 *
 * ## Il difetto che questo modulo chiude
 *
 * L'anteprima dell'import rifiutava gia il 31 febbraio, il 29 febbraio di un
 * anno non bisestile e una nascita nel futuro. La stessa scheda salvata dalla
 * pagina Atleti — o da un modulo di iscrizione compilato da una famiglia —
 * non passava di li: arrivava alla rotta generica delle risorse, che si
 * limitava a `new Date(valore)`.
 *
 * E la contro-intuizione che rendeva il difetto invisibile: in JavaScript
 * `new Date("2026-02-31")` **non** e una data invalida, e il 3 marzo 2026.
 * `2026-04-31` diventa il 1 maggio, `2025-02-29` il 1 marzo. Il record veniva
 * accettato con una data diversa da quella scritta, senza un errore da
 * nessuna parte — e da quella data discendono l'eta, la categoria per anno di
 * nascita e il codice fiscale.
 *
 * ## La regola
 *
 * Una data di nascita si legge **come testo**, e le sue tre parti devono
 * ricomporre la stessa data del calendario. Poi deve stare nel passato e
 * dentro un intervallo credibile per una persona viva.
 *
 * Il modulo e puro — nessuna dipendenza da Prisma, da React o dalla rete —
 * cosi la stessa regola vale per l'anteprima dell'import, per la rotta delle
 * risorse e per chiunque la chieda in seguito, senza essere riscritta.
 */

/**
 * Sotto questo anno non e piu una data implausibile, e un errore di battitura
 * o una cella con dentro altro. E la stessa soglia che l'import applica da
 * sempre a un anno arrivato da solo.
 */
export const MIN_PLAUSIBLE_BIRTH_YEAR = 1900;

export type BirthDateRejection =
  /** Non si e riusciti a leggerci una data. */
  | "unrecognized"
  /** Si legge, ma quel giorno nel calendario non esiste. */
  | "impossible"
  /** Esiste, ma deve ancora arrivare. */
  | "future"
  /** Esiste ed e passata, ma troppo lontana per essere di una persona. */
  | "out-of-range";

export type BirthDateCheck =
  | { valid: true; iso: string }
  | { valid: false; reason: BirthDateRejection; message: string };

/**
 * Vero se `YYYY-MM-DD` e un giorno che esiste davvero.
 *
 * Il controllo e il viaggio di andata e ritorno: si costruisce la data e si
 * verifica che ne escano gli stessi tre numeri. E l'unico modo per accorgersi
 * del riporto silenzioso — 31 febbraio che diventa 3 marzo.
 */
export const isRealCalendarDate = (iso: string) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return false;

  const [, year, month, day] = match.map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
};

const pad = (value: string | number) => String(value).padStart(2, "0");

/**
 * Le tre parti della data, lette dal testo e non da `new Date`.
 *
 * `null` quando non c'e proprio una data; `""` quando una data si legge ma il
 * giorno non esiste — e la distinzione che permette di dire «non riconosciuta»
 * invece di «impossibile», due errori che chi compila corregge in modi
 * diversi.
 */
const isoDatePartOf = (value: unknown): string | null | "" => {
  if (value === null || value === undefined || value === "") return null;

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString().slice(0, 10);
  }

  const text = String(value).trim();
  if (!text) return null;

  // Un anno da solo vale il 1 gennaio: e cosi che lo legge gia l'import.
  if (/^\d{4}$/.test(text)) return `${text}-01-01`;

  const isoMatch = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s].*)?$/.exec(text);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    const iso = `${year}-${pad(month)}-${pad(day)}`;
    return isRealCalendarDate(iso) ? iso : "";
  }

  const slashMatch = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(text);
  if (slashMatch) {
    const [, day, month, year] = slashMatch;
    const iso = `${year}-${pad(month)}-${pad(day)}`;
    return isRealCalendarDate(iso) ? iso : "";
  }

  /*
    Restano i formati che solo il motore sa leggere — un timestamp, una data
    scritta per esteso. Li il riporto silenzioso non e un rischio: quelle
    grafie o si leggono per intero o non si leggono affatto.
  */
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
};

/**
 * La data che il valore rappresenta davvero, in `YYYY-MM-DD`, oppure `null`.
 *
 * `null` copre due casi che a valle si trattano allo stesso modo — non c'e
 * nessuna data, oppure il giorno scritto non esiste — e in entrambi non c'e
 * niente da salvare. Chi deve **dirlo a chi ha compilato** usa
 * `checkBirthDate`, che i due casi li distingue.
 *
 * Nota: non dice se la data e accettabile come nascita, solo se esiste. Il 1
 * gennaio 1700 e una data vera; una data di nascita, no.
 */
export const toBirthDateIso = (value: unknown): string | null => {
  const iso = isoDatePartOf(value);
  return iso ? iso : null;
};

/**
 * La data di nascita e accettabile?
 *
 * `today` esiste perche un test non puo dipendere dal giorno in cui viene
 * eseguito: senza, «non nel futuro» sarebbe una regola che cambia da sola.
 */
export const checkBirthDate = (
  value: unknown,
  options: { today?: Date | string } = {},
): BirthDateCheck => {
  const iso = isoDatePartOf(value);
  const written = String(value instanceof Date ? value.toISOString().slice(0, 10) : (value ?? "")).trim();

  if (iso === null) {
    return {
      valid: false,
      reason: "unrecognized",
      message: written
        ? `Data di nascita non riconosciuta (${written})`
        : "Data di nascita mancante",
    };
  }

  if (iso === "") {
    return {
      valid: false,
      reason: "impossible",
      message: `Data di nascita inesistente (${written})`,
    };
  }

  const todayIso =
    (options.today instanceof Date
      ? options.today.toISOString()
      : String(options.today || "")
    ).slice(0, 10) || new Date().toISOString().slice(0, 10);

  if (iso > todayIso) {
    return {
      valid: false,
      reason: "future",
      message: `Data di nascita nel futuro (${iso})`,
    };
  }

  if (Number(iso.slice(0, 4)) < MIN_PLAUSIBLE_BIRTH_YEAR) {
    return {
      valid: false,
      reason: "out-of-range",
      message: `Data di nascita non plausibile (${iso})`,
    };
  }

  return { valid: true, iso };
};

/**
 * La stessa regola, per chi deve interrompere una scrittura.
 *
 * Il messaggio e in italiano e dice cosa non va: la rotta generica lo
 * restituisce cosi com'e con un 400, che e quello che deve leggere chi ha
 * appena premuto «Salva».
 */
export const assertValidBirthDate = (
  value: unknown,
  options: { today?: Date | string } = {},
) => {
  const check = checkBirthDate(value, options);
  if (!check.valid) {
    throw new Error(check.message);
  }
  return check.iso;
};
