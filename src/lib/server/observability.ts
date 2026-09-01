/**
 * **Il posto dove un errore del server si racconta.**
 *
 * ## Cosa c'era prima
 *
 * Nessun error tracker, nessuna dipendenza, e — cosa che pesa di piu — nessun
 * identificativo di richiesta: due righe di log prodotte dalla **stessa**
 * richiesta non erano correlabili. Chi indagava su un 500 aveva un messaggio e
 * un orario, e su un runtime che serve molte richieste insieme un orario non
 * distingue niente.
 *
 * ## Cosa fa questo modulo, e cosa deliberatamente non fa
 *
 * Fa **un punto solo**. Oggi scrive una riga strutturata e sanificata su
 * `console.error`; domani parla con un provider — Sentry, Datadog, qualunque
 * cosa si decida — cambiando **questa** funzione e non centosessantasei rotte.
 *
 * Non sceglie il provider, e non e una dimenticanza: ADR-0007 vieta di legarsi
 * a servizi proprietari senza una decisione, e scegliere un error tracker e una
 * decisione di prodotto e di contratto (dove finiscono i dati, per quanto,
 * sotto quale responsabile). Una lane non la prende. Cio che una lane puo fare
 * e costruire il punto di innesto, ed e questo.
 *
 * ## Perche la sanificazione non e un dettaglio
 *
 * ADR-0019: «i log non devono contenere dati personali non necessari». Il modo
 * piu comune in cui li contengono non e una `console.log` distratta: e
 * `console.error("...", error)` su un errore dell'ORM. Il messaggio di un
 * errore di validazione Prisma **contiene l'oggetto che si stava scrivendo** —
 * su `user.create` e `password_hash`, sulla rotta pubblica dei moduli e il
 * modulo compilato da un minore. Passare l'errore intero e quindi passare il
 * dato, anche quando chi scrive la riga sta solo cercando di capire cosa e
 * andato storto.
 *
 * Qui l'errore si riduce a **tre campi**: nome, messaggio ridotto alla prima
 * riga utile, codice. Il resto non esce.
 */

import { sanitizeMetadata } from "./audit";

/** L'intestazione con cui l'identificativo di richiesta viaggia. */
export const REQUEST_ID_HEADER = "x-request-id";

/**
 * Un identificativo accettabile: sedici e sessantaquattro caratteri di un
 * alfabeto ristretto.
 *
 * Il valore puo arrivare **dal client** — e giusto che sia cosi: un
 * identificativo generato dal browser lega la riga del server alla richiesta
 * che si sta guardando in rete — ma cio che arriva da fuori non si rimette in
 * un'intestazione senza guardarlo. Un valore con un `\r\n` dentro spezzerebbe
 * l'intestazione in due; un valore lungo un megabyte finirebbe in ogni riga di
 * log della richiesta.
 */
const REQUEST_ID_PATTERN = /^[A-Za-z0-9._-]{8,64}$/;

export const isValidRequestId = (value: unknown): boolean =>
  REQUEST_ID_PATTERN.test(String(value ?? "").trim());

/**
 * L'identificativo dichiarato dal chiamante, oppure `null`.
 *
 * Non ne genera uno: chi genera e `src/middleware.ts`, che sta davanti a tutto
 * e quindi e l'unico punto in cui il valore puo essere lo stesso per tutte le
 * righe della stessa richiesta. Una seconda generazione qui produrrebbe un
 * identificativo per riga, cioe il contrario di un identificativo.
 */
export const readRequestId = (
  source: Request | Headers | null | undefined,
): string | null => {
  if (!source) return null;
  const headers = source instanceof Headers ? source : source.headers;
  const raw = String(headers?.get?.(REQUEST_ID_HEADER) ?? "").trim();
  return isValidRequestId(raw) ? raw : null;
};

/** Genera un identificativo nuovo. Usato dal middleware e dai test. */
export const newRequestId = (): string => {
  const random = globalThis.crypto?.randomUUID?.();
  if (random) return random;
  /*
    Ripiego per i runtime senza `crypto.randomUUID`. Non e un identificativo
    crittografico e non deve esserlo: serve a distinguere due richieste in un
    file di log, non a proteggere niente.
  */
  return `req-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
};

const MAX_MESSAGE_LENGTH = 300;

/**
 * Impronte di un errore che nasce sotto il livello di dominio, e il cui
 * messaggio porta con se cio che si stava scrivendo.
 *
 * E lo stesso insieme di `api-errors.ts`, e non si condivide di proposito: li
 * decide **cosa esce verso il browser**, qui **cosa entra nei log**. Sono due
 * politiche che oggi coincidono e che possono legittimamente divergere — un
 * codice di errore del driver in un log e utile, nella risposta e una
 * descrizione del server a chi non deve averla.
 */
const ORM_MESSAGE_MARKERS = [
  "Invalid `prisma",
  "prisma.",
  "PrismaClient",
  "ConnectorError",
  "PostgresError",
];

/**
 * Il messaggio, ridotto a cio che si puo scrivere.
 *
 * Un errore Prisma e **multiriga**: la prima riga e l'intestazione
 * dell'invocazione — «Invalid `prisma.user.create()` invocation» — e le righe
 * successive sono l'argomento, cioe il dato. Si tiene la prima e si buttano le
 * altre. Per tutti gli altri errori si tiene la prima riga lo stesso, perche
 * la seconda riga di un messaggio e quasi sempre uno stack o un contesto, e
 * nessuno dei due si legge in un log a riga singola.
 */
export const sanitizeErrorMessage = (value: unknown): string => {
  const message = String(
    (value as any)?.message ?? (typeof value === "string" ? value : ""),
  ).trim();

  if (!message) return "";

  const firstLine = message.split(/\r?\n/, 1)[0].trim();

  const looksOrm = ORM_MESSAGE_MARKERS.some((marker) =>
    message.includes(marker),
  );

  /*
    Un errore dell'ORM su una sola riga porta comunque l'argomento con se
    (`Unique constraint failed on the fields: (...)` no, ma
    `Argument email: Got invalid value ...` si). Quando l'impronta c'e e la
    riga e lunga, si tronca corto: un log non e il posto in cui indovinare
    quale meta della riga contiene il dato.
  */
  const limit = looksOrm ? 160 : MAX_MESSAGE_LENGTH;

  return firstLine.length > limit
    ? `${firstLine.slice(0, limit)}…`
    : firstLine;
};

export type SanitizedError = {
  name: string;
  message: string;
  code: string | null;
};

/** L'errore ridotto ai tre campi che possono uscire. */
export const sanitizeError = (error: unknown): SanitizedError => ({
  name: String((error as any)?.name || "Error").slice(0, 80),
  message: sanitizeErrorMessage(error),
  code: (error as any)?.code ? String((error as any).code).slice(0, 40) : null,
});

export type ServerErrorContext = {
  /** Da `readRequestId`: e cio che lega questa riga alle altre. */
  requestId?: string | null;
  /** La rotta, come pattern e non come URL: `/api/v1/athletes/[id]`. */
  route?: string | null;
  method?: string | null;
  organizationId?: string | null;
  actorUserId?: string | null;
  /** Passa da `sanitizeMetadata`: le chiavi sensibili spariscono. */
  metadata?: Record<string, unknown> | null;
};

export type ServerErrorReport = ServerErrorContext & {
  error: SanitizedError;
};

/**
 * **L'unico punto in cui un errore del server viene raccontato.**
 *
 * Non solleva mai e non restituisce niente di cui il chiamante debba
 * occuparsi: restituisce l'identificativo di richiesta, perche la risposta
 * possa citarlo. «Riferimento errore: 3f2a…» in un messaggio di errore e la
 * differenza fra un'assistenza che trova la riga in due secondi e una che
 * chiede a una societa sportiva di riprodurre il problema.
 */
export const reportServerError = (
  error: unknown,
  context: ServerErrorContext = {},
): string | null => {
  const requestId = context.requestId
    ? String(context.requestId).trim()
    : null;

  const report: ServerErrorReport = {
    ...(requestId ? { requestId } : {}),
    ...(context.route ? { route: String(context.route) } : {}),
    ...(context.method ? { method: String(context.method) } : {}),
    ...(context.organizationId
      ? { organizationId: String(context.organizationId) }
      : {}),
    ...(context.actorUserId
      ? { actorUserId: String(context.actorUserId) }
      : {}),
    ...(context.metadata
      ? { metadata: sanitizeMetadata(context.metadata) }
      : {}),
    error: sanitizeError(error),
  };

  try {
    /*
      Una riga sola, e un prefisso stabile: e cio che rende cercabile un log
      che nessuno indicizza. Il giorno in cui c'e un provider, questa riga
      resta e accanto compare la chiamata.
    */
    console.error("[server-error]", JSON.stringify(report));
  } catch {
    /* Un log che fallisce non deve rompere la richiesta che stava spiegando. */
  }

  return requestId;
};
