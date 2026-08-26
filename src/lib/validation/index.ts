/**
 * Validazione degli input, **in un posto solo**.
 *
 * **Il difetto che chiude** ([D14](../../../docs/knowledge-base/16-technical-debt.md),
 * F1-05, WP-05). Ogni route handler coercizzava a mano:
 * `String(body?.email || "").trim().toLowerCase()`, `Number(body?.amount)`,
 * `Boolean(body?.enabled)`. Tre conseguenze:
 *
 * 1. **regole diverse per lo stesso campo.** Un'email lunga 400 caratteri
 *    passava in un endpoint e falliva nell'altro, e nessuno dei due lo
 *    dichiarava;
 * 2. **messaggi diversi per lo stesso errore.** «Email obbligatoria», «Email e
 *    password sono obbligatori», «Dati non validi»: chi legge non capisce se
 *    ha sbagliato un campo o due;
 * 3. **niente da leggere per capire cosa un endpoint accetta.** La forma del
 *    corpo esisteva solo dentro il codice che la smontava.
 *
 * **Perche `zod` e non un validatore nuovo.** E gia una dipendenza del
 * progetto ed e gia usato per la configurazione SMTP e IMAP. Aggiungerne un
 * secondo sarebbe l'errore numero 1 di CLAUDE.md.
 *
 * **Perche i messaggi sono in italiano dentro lo schema.** Chi li legge e una
 * segreteria, non un programmatore. Un `Expected string, received number`
 * tradotto a valle si traduce male; scritto nel punto in cui la regola vive,
 * dice cosa fare.
 *
 * **Il codice `VALIDATION_ERROR` viaggia nell'envelope**, non nel messaggio:
 * un client puo distinguere «hai sbagliato il corpo» da «non hai il permesso»
 * senza leggere del testo italiano.
 */

import { z } from "zod";

export { z };

/**
 * Errore di validazione.
 *
 * Non estende gli errori di dominio: un input malformato e un 400, non un
 * 403, e la mappatura per sottostringa che usa il resto del progetto
 * («Accesso negato» -> 403) non deve poterlo confondere con altro.
 */
export class ValidationError extends Error {
  readonly code = "VALIDATION_ERROR";
  readonly status = 400;
  readonly issues: Array<{ path: string; message: string }>;

  constructor(issues: Array<{ path: string; message: string }>) {
    /*
      Il messaggio e la prima regola violata, con il nome del campo davanti.
      Elencarle tutte in una riga produce testi che nessuno legge; la lista
      completa resta in `issues` per chi la vuole mostrare campo per campo.
    */
    const first = issues[0];
    super(
      first
        ? first.path
          ? `${first.path}: ${first.message}`
          : first.message
        : "Dati non validi",
    );
    this.name = "ValidationError";
    this.issues = issues;
  }
}

export const isValidationError = (error: unknown): error is ValidationError =>
  error instanceof ValidationError ||
  (typeof error === "object" &&
    error !== null &&
    (error as any).code === "VALIDATION_ERROR");

/**
 * Valida un corpo e restituisce il valore tipato, oppure lancia.
 *
 * Si usa cosi:
 *
 *     const input = parseInput(loginInputSchema, await request.json());
 *
 * e il route handler mappa `ValidationError` su 400 con `validationFailure`.
 */
export const parseInput = <Schema extends z.ZodTypeAny>(
  schema: Schema,
  value: unknown,
): z.infer<Schema> => {
  const result = schema.safeParse(value);

  if (!result.success) {
    throw new ValidationError(
      result.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    );
  }

  return result.data;
};

/* ------------------------------------------------------- i mattoni */

/**
 * Le regole condivise.
 *
 * Sono qui e non copiate in ogni schema perche «quanto puo essere lunga
 * un'email» e una decisione sola: 320 caratteri e il massimo di RFC 5321, e
 * se un giorno cambia deve cambiare in un punto.
 */
export const fields = {
  email: () =>
    z
      .string({ required_error: "Email obbligatoria" })
      .trim()
      .toLowerCase()
      .min(1, "Email obbligatoria")
      .max(320, "Email troppo lunga")
      .email("Email non valida"),

  /**
   * La password **non** si valida qui per forza o lunghezza minima.
   *
   * La politica vive in `src/lib/auth/password-policy.ts` ed e l'unica a
   * conoscerla; duplicarne qui una versione approssimata farebbe divergere i
   * due controlli al primo cambiamento. Qui si difende solo il server: un
   * corpo che non e una stringa, o che e lungo un megabyte.
   */
  password: () =>
    z
      .string({ required_error: "Password obbligatoria" })
      .min(1, "Password obbligatoria")
      .max(1024, "Password troppo lunga"),

  uuid: (label = "Identificativo") =>
    z.string().trim().uuid(`${label} non valido`),

  /**
   * Un identificativo che **non** e per forza un UUID.
   *
   * Le risorse di club hanno anche identificativi logici (`cat-2016`,
   * `gruppo-roma`): pretendere un UUID qui rifiuterebbe dati veri.
   */
  id: (label = "Identificativo") =>
    z
      .string({ required_error: `${label} obbligatorio` })
      .trim()
      .min(1, `${label} obbligatorio`)
      .max(200, `${label} troppo lungo`),

  text: (label: string, max = 200) =>
    z
      .string({ required_error: `${label} obbligatorio` })
      .trim()
      .min(1, `${label} obbligatorio`)
      .max(max, `${label} troppo lungo`),

  optionalText: (max = 2000) =>
    z.string().trim().max(max, "Testo troppo lungo").optional().default(""),

  /**
   * Un importo in **euro**, come lo digita chi incassa.
   *
   * Positivo e finito: un incasso da zero non e un incasso, e uno negativo e
   * uno storno — che ha una sua operazione apposta e non si ottiene mettendo
   * il meno davanti.
   */
  amount: (label = "Importo") =>
    z.coerce
      .number({ invalid_type_error: `${label} non valido` })
      .finite(`${label} non valido`)
      .positive(`${label} deve essere maggiore di zero`)
      .max(1_000_000, `${label} troppo grande`),

  /** Una data in forma ISO o `YYYY-MM-DD`. Vuota vuol dire «oggi», non «mai». */
  isoDate: (label = "Data") =>
    z
      .string()
      .trim()
      .refine(
        (value) => !value || !Number.isNaN(Date.parse(value)),
        `${label} non valida`,
      ),
};

/* --------------------------------------------- la risposta HTTP */

/**
 * La risposta a un input malformato.
 *
 * Sta qui e non in ogni route handler perche l'envelope e una convenzione del
 * progetto ([09](../../../docs/knowledge-base/09-api-conventions.md)) e una
 * convenzione ripetuta in trenta punti smette di essere una convenzione.
 */
export const validationErrorPayload = (error: unknown) => {
  const validation = isValidationError(error)
    ? (error as ValidationError)
    : null;

  return {
    data: null,
    error: {
      message: validation?.message || "Dati non validi",
      code: "VALIDATION_ERROR",
      issues: validation?.issues || [],
    },
  };
};
