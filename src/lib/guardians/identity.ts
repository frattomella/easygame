/**
 * **L'identita di un tutore: le grafie, in un posto solo.**
 *
 * ---
 *
 * ## Il difetto che questo file chiude
 *
 * «Quali identificativi porta questa riga?» era scritta a mano in quattro
 * letture, e ognuna ne leggeva un sottoinsieme diverso:
 *
 * | Lettura | Grafie lette |
 * |---|---|
 * | il vaglio dell'accesso | quattro |
 * | i solleciti | quattro |
 * | i promemoria del certificato | due, poi quattro |
 * | le notifiche documentali | due, poi quattro |
 *
 * Misurato su una riga `{ userId, email }`: accesso si, solleciti si,
 * promemoria si, notifiche documentali **no**. La stessa persona, la stessa
 * domanda, due risposte — la forma che ADR-0129 §3 vieta, sopravvissuta in una
 * riga alla correzione che dichiarava di averla chiusa.
 *
 * L'elenco delle grafie sta percio **qui**. Aggiungerne una domani la aggiunge
 * a tutti insieme, che e l'unico modo perche non divergano di nuovo.
 */

import { asGuardianRecord, type GuardianLike } from "./exclusion";

/** La forma normale di un identificativo: minuscolo, senza spazi ai bordi. */
export const normalizeGuardianIdentity = (valore: unknown): string =>
  String(valore ?? "").trim().toLowerCase();

/**
 * Le grafie dell'**utenza collegata**. Le prime due sono della voce, le altre
 * due della riga e delle compilazioni.
 */
const CHIAVI_UTENZA = [
  "linkedUserId",
  "linked_user_id",
  "userId",
  "user_id",
] as const;

/**
 * Le grafie dell'**indirizzo**.
 *
 * `email` e il recapito — resta dopo una revoca, perche al club serve per
 * scrivere a quella persona — mentre `linkedUserEmail` e il legame, e con la
 * revoca cade. Qui si raccolgono tutte e due: chi deve distinguerle guarda i
 * marchi, non la chiave.
 */
const CHIAVI_INDIRIZZO = [
  "email",
  "linkedUserEmail",
  "linked_user_email",
] as const;

/** Le grafie di cio che **nomina la riga**: il suo identificativo e la chiave storica. */
const CHIAVI_MANIGLIA = ["id", "rowId", "legacyId", "legacy_id"] as const;

/** Le grafie della chiave d'identita su cui la riga e unica dentro l'atleta. */
const CHIAVI_CHIAVE = ["identityKey", "identity_key"] as const;

const raccogli = (v: GuardianLike, chiavi: readonly string[]): string[] => {
  const fuori: string[] = [];
  for (const chiave of chiavi) {
    const pulito = normalizeGuardianIdentity(v[chiave]);
    if (pulito && !fuori.includes(pulito)) fuori.push(pulito);
  }
  return fuori;
};

export type GuardianIdentity = {
  /** Le utenze che la riga dichiara, in tutte le grafie. */
  userIds: string[];
  /** Gli indirizzi che la riga porta, in tutte le grafie. */
  emails: string[];
  /** Cio che nomina la riga: identificativo e chiave storica. */
  handles: string[];
  /** La chiave d'identita, quando la forma la porta. */
  keys: string[];
  /** Tutto insieme: l'insieme su cui si confronta un registro di identita. */
  all: string[];
};

/**
 * **Chi e questa riga**, in tutte le grafie e in forma normale.
 *
 * Non decide niente: raccoglie. Chi decide un accesso lo fa sulle **righe**
 * (`findGuardianLinks`); chi decide un invio confronta questi valori con i
 * registri derivati.
 */
export const resolveGuardianIdentity = (voce: unknown): GuardianIdentity => {
  const v = asGuardianRecord(voce);

  const userIds = raccogli(v, CHIAVI_UTENZA);
  const emails = raccogli(v, CHIAVI_INDIRIZZO);
  const handles = raccogli(v, CHIAVI_MANIGLIA);
  const keys = raccogli(v, CHIAVI_CHIAVE);

  const all: string[] = [];
  for (const valore of [...userIds, ...emails, ...handles, ...keys]) {
    if (!all.includes(valore)) all.push(valore);
  }

  return { userIds, emails, handles, keys, all };
};

/**
 * **Questa maniglia nomina questa riga?**
 *
 * ---
 *
 * ## La regola, e perche ha una funzione sola
 *
 * «Cio che la revoca chiude deve contenere cio che il riscatto collega.» Il
 * gettone di un invito porta un `guardian_id`, e ne esistono **tre** forme:
 * l'identificativo della riga, la chiave che quella riga aveva nel blob
 * (`legacy_id`), e la sua chiave d'identita — l'indirizzo o l'utenza.
 *
 * Le due porte se lo chiedevano con due predicati diversi: chi **risolve** per
 * riscattare guardava tutte e tre le forme, chi **chiude** per revocare solo
 * due. Un invito coniato sull'indirizzo era percio riscattabile e non
 * chiudibile: la revoca lo lasciava `active`, la scheda non lo mostrava — e
 * quindi non c'era schermata da cui toglierlo — e chi lo aveva in tasca
 * rientrava con `revoked_at` azzerato e l'utenza riscritta.
 *
 * Il difetto non stava in nessuna delle due porte: stava nell'esistere di due
 * predicati. Adesso e uno, e allargarlo li allarga insieme.
 */
export const guardianRowNamedBy = (
  riga: unknown,
  maniglia: unknown,
): boolean => {
  const cercata = String(maniglia ?? "").trim();
  if (!cercata) return false;

  const r = asGuardianRecord(riga);
  const normale = normalizeGuardianIdentity(cercata);

  return (
    cercata === String(r.id ?? "") ||
    cercata === String(r.legacy_id ?? "") ||
    (Boolean(r.identity_key) && normale === normalizeGuardianIdentity(r.identity_key))
  );
};

/**
 * **Un registro di identita**, nella forma in cui i lettori lo interrogano.
 *
 * `revokedGuardianIdentities` e `contactOnlyIdentities` sono elenchi derivati
 * dall'autorita a ogni scrittura (49 §H). Non sono un secondo archivio e
 * nessuna decisione di accesso li guarda: servono ai canali di invio, dove il
 * caso ordinario di ADR-0127 — due genitori, **un solo indirizzo di famiglia**
 * — rende il marchio di riga insufficiente da solo.
 */
export const readGuardianIdentityRegistry = (
  valore: unknown,
): ReadonlySet<string> => {
  const elenco = Array.isArray(valore) ? valore : [];
  return new Set(elenco.map(normalizeGuardianIdentity).filter(Boolean));
};

const primoTesto = (voce: unknown, chiavi: readonly string[]): string => {
  const v = asGuardianRecord(voce);
  for (const chiave of chiavi) {
    const scritto = String(v[chiave] ?? "").trim();
    if (scritto) return scritto;
  }
  return "";
};

/**
 * **L'utenza da usare**, nella grafia in cui e scritta.
 *
 * `resolveGuardianIdentity` normalizza per **confrontare**; qui si restituisce
 * il valore com'e, perche finisce in una chiave esterna e non in un insieme.
 *
 * `escludi` toglie dalla scelta le utenze che un registro dichiara revocate:
 * una riga che ne porti due — una chiusa e una viva — sopravvive per la viva,
 * e restituire la prima delle due significherebbe mandare l'avviso proprio a
 * chi e stato escluso.
 */
export const guardianUserIdText = (
  voce: unknown,
  escludi?: ReadonlySet<string>,
): string => {
  const v = asGuardianRecord(voce);
  for (const chiave of CHIAVI_UTENZA) {
    const scritto = String(v[chiave] ?? "").trim();
    if (!scritto) continue;
    if (escludi?.has(normalizeGuardianIdentity(scritto))) continue;
    return scritto;
  }
  return "";
};

/** **L'indirizzo da usare**, nella grafia in cui e scritto. Vedi sopra. */
export const guardianEmailText = (voce: unknown): string =>
  primoTesto(voce, CHIAVI_INDIRIZZO);
