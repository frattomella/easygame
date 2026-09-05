/**
 * **Un corpo, una regola, tre verbi** (AC-3 della RCA, KB 44 §4).
 *
 * ---
 *
 * ## Il difetto che chiude
 *
 * La rotta generica leggeva il corpo della richiesta in **due** modi, a due
 * file di distanza:
 *
 * - `[resource]/route.ts` (`POST` e `upsert`) aveva `resolveCreatePayload`,
 *   con una euristica scritta apposta per **non** confondere l'involucro con
 *   il contenuto: si scarta `body.data` solo quando il corpo *e* un involucro,
 *   cioe quando porta anche `mode`/`meta` oppure non porta altro;
 * - `[resource]/[id]/route.ts` (`PATCH`) aveva `body?.data ?? body`, che
 *   scarta **sempre**.
 *
 * `athletes` ha una colonna che si chiama `data`. Un `PATCH` con il corpo non
 * incartato — `{ first_name, data }`, cioe esattamente la forma che il `POST`
 * della **stessa** rotta accetta — veniva letto come se `data` fosse
 * l'involucro: il resto del corpo cadeva, e la risposta era **200 senza avere
 * scritto quello che il chiamante aveva chiesto**. Oggi nessun client e
 * colpito perche incartano tutti; un salvataggio che *toglie* un tutore
 * sarebbe diventato un no-op silenzioso, e la forma ha gia ingannato il
 * revisore che l'ha trovata.
 *
 * ## La regola
 *
 * Non e «il PATCH adotta l'euristica del POST»: e che la lettura del corpo
 * smette di essere una decisione presa per verbo. Una funzione sola, chiamata
 * dai tre verbi, e il test di totalita che chiede a **ogni** risorsa e a
 * **ogni** verbo di dare lo stesso verdetto sullo stesso corpo.
 *
 * Due elenchi in due file che devono restare d'accordo divergeranno: e una
 * questione di tempo, non di attenzione (KB 44, §3 «Causa B»).
 */

/** Le sole chiavi che possono comparire in un **involucro**. */
const CHIAVI_INVOLUCRO = ["data", "mode", "meta"];

const eOggetto = (body: unknown): body is Record<string, unknown> =>
  Boolean(body) && typeof body === "object" && !Array.isArray(body);

/**
 * **Il corpo e un involucro, o e gia il contenuto?**
 *
 * Un involucro porta `data` e, oltre a quello, solo roba da involucro: o una
 * chiave di servizio dichiarata (`mode`, `meta`), o niente. Un corpo che
 * accanto a `data` porta un campo del dominio — `first_name`, `status` — non
 * e un involucro: e una scheda che ha una colonna chiamata `data`.
 */
export const isWrappedResourceBody = (body: unknown): boolean => {
  if (!eOggetto(body)) return false;
  if (!Object.prototype.hasOwnProperty.call(body, "data")) return false;

  const chiavi = Object.keys(body);
  return (
    Object.prototype.hasOwnProperty.call(body, "mode") ||
    Object.prototype.hasOwnProperty.call(body, "meta") ||
    chiavi.every((chiave) => CHIAVI_INVOLUCRO.includes(chiave))
  );
};

/**
 * Il contenuto da scrivere, qualunque sia il verbo che ha portato il corpo.
 *
 * Non e un `body.data ?? body`: quella forma non sa distinguere l'involucro
 * dalla scheda, e su `athletes` sbagliava.
 */
export const resolveResourcePayload = (body: unknown): unknown => {
  if (!eOggetto(body)) return body;
  return isWrappedResourceBody(body) ? (body as Record<string, unknown>).data : body;
};

/**
 * **Una richiesta di scrittura che non chiede di scrivere niente e un
 * errore, non un 200.**
 *
 * Il reperto R-3 non era solo «il corpo si legge in due modi»: era che la
 * lettura sbagliata **usciva con 200**. Chi ha chiamato crede di aver salvato.
 * Se dopo la risoluzione non resta un oggetto con almeno un campo, la rotta
 * lo dice — e lo dice con 400, non con un silenzio che somiglia a un successo.
 */
export const assertWritableResourcePayload = (
  payload: unknown,
  resource: string,
): Record<string, unknown> => {
  if (!eOggetto(payload) || Object.keys(payload).length === 0) {
    throw new Error(
      `Corpo della richiesta non valido: ${resource} non ha ricevuto nessun campo da scrivere`,
    );
  }
  return payload;
};
