/**
 * L'ordine dei campi anagrafici di una persona fisica.
 *
 * ## Il difetto che questo modulo chiude (RC Fix 2, punto 1)
 *
 * Le nove anagrafiche di persona — atleta, allenatore, staff, socio, tutore,
 * in creazione e in modifica — chiedevano gli stessi sei dati in **sei ordini
 * diversi**. Il codice fiscale finiva a meta modulo nel nuovo socio (dopo
 * l'email), dopo le categorie nel nuovo atleta, dopo la formazione scolastica
 * nella scheda allenatore. Il luogo di nascita, dove c'era, stava a volte
 * prima del sesso e a volte dentro il campo del codice fiscale.
 *
 * Non era un problema estetico. Chi lavora in segreteria compila la stessa
 * sequenza di dati decine di volte al giorno leggendoli da un documento in
 * mano: l'ordine e memoria muscolare, e cambiarlo fra una scheda e l'altra
 * costa un errore ogni volta che la mano arriva prima dell'occhio.
 *
 * ## La regola
 *
 * Un ordine solo, dichiarato qui e non ripetuto in nessun modulo:
 *
 * 1. Nome
 * 2. Cognome
 * 3. Data di nascita
 * 4. Luogo di nascita
 * 5. Sesso
 * 6. Codice fiscale
 *
 * Non e un ordine arbitrario: e **l'ordine di derivazione**. Il codice fiscale
 * si calcola dai cinque campi che lo precedono, quindi sta in fondo — quando
 * lo si guarda, tutto cio che serve a calcolarlo e gia stato scritto. Il luogo
 * di nascita sta prima del sesso perche e l'ultimo dato che si legge dalla
 * riga del documento, e il sesso e l'unico dei sei che non si trascrive ma si
 * sceglie.
 *
 * ## Cosa questo modulo **non** decide
 *
 * Non decide quali degli altri campi un'anagrafica raccoglie, ne in che ordine.
 * Nazionalita, email, residenza, ruolo, categoria: vengono **dopo**, e il loro
 * ordine e affare della singola scheda. Questo modulo governa solo il blocco
 * di identita, che e l'unico uguale ovunque.
 *
 * ## Perche e un modulo puro e non solo un componente
 *
 * Perche l'ordine si possa **collaudare** senza montare React. Il componente
 * `PersonIdentityFields` legge questa lista per decidere cosa disegnare, e il
 * test verifica la lista: se qualcuno riordina i campi, il test cade prima
 * della revisione, non dopo il rilascio.
 */

/** I sei campi del blocco di identita, nell'unico ordine ammesso. */
export const PERSON_IDENTITY_FIELD_ORDER = [
  "firstName",
  "lastName",
  "birthDate",
  "birthPlace",
  "gender",
  "fiscalCode",
] as const;

export type PersonIdentityField =
  (typeof PERSON_IDENTITY_FIELD_ORDER)[number];

/** Etichette italiane, una sola volta per tutta l'applicazione. */
export const PERSON_IDENTITY_LABELS: Record<PersonIdentityField, string> = {
  firstName: "Nome",
  lastName: "Cognome",
  birthDate: "Data di nascita",
  birthPlace: "Luogo di nascita",
  gender: "Sesso",
  fiscalCode: "Codice fiscale",
};

/**
 * I valori del blocco.
 *
 * `birthPlaceCode` e il codice catastale del comune di nascita: non e un campo
 * che si compila, e cio che il luogo di nascita porta con se. Sta qui perche
 * il calcolo del codice fiscale lo richiede, e perche va salvato: senza, la
 * volta dopo che si riapre la scheda il calcolo non e piu possibile.
 */
export type PersonIdentityValue = {
  firstName?: string | null;
  lastName?: string | null;
  birthDate?: string | null;
  birthPlace?: string | null;
  birthPlaceCode?: string | null;
  gender?: string | null;
  fiscalCode?: string | null;
};

/**
 * Una modifica: sempre stringhe, mai `null`.
 *
 * I valori in arrivo dall'archivio possono essere nulli — un campo mai
 * compilato lo e — ma cio che **esce** da un campo di testo e una stringa,
 * eventualmente vuota. Tenerlo nel tipo evita che un `null` si propaghi nello
 * stato di un form che dichiara `string`.
 */
export type PersonIdentityPatch = Partial<
  Record<keyof PersonIdentityValue, string>
>;

/**
 * Posizione di un campo nell'ordine canonico, o `-1`.
 *
 * Serve ai collaudi che leggono un sorgente e verificano che i sei campi vi
 * compaiano nell'ordine giusto.
 */
export const personIdentityFieldIndex = (field: string): number =>
  PERSON_IDENTITY_FIELD_ORDER.indexOf(field as PersonIdentityField);


/**
 * Come si chiamano i sei campi in un'anagrafica che usa altri nomi.
 *
 * Non e un capriccio: le anagrafiche di allenatore, staff e socio scrivono
 * `name` e `surname` dove atleti e soci nuovi scrivono `firstName` e
 * `lastName`, e riallineare le chiavi in archivio significherebbe riscrivere
 * i payload di ogni club esistente per un guadagno che nessuno vedrebbe (vedi
 * 06 — Modello dati: `club_resource_items.payload` non ha schema).
 *
 * Si traduce all'ingresso e all'uscita del blocco condiviso, in un posto solo.
 */
export type PersonIdentityKeyMap = Partial<
  Record<keyof PersonIdentityValue, string>
>;

/** L'alias piu diffuso: `name` / `surname`. */
export const LEGACY_PERSON_NAME_KEYS: PersonIdentityKeyMap = {
  firstName: "name",
  lastName: "surname",
};

const IDENTITY_KEYS: (keyof PersonIdentityValue)[] = [
  "firstName",
  "lastName",
  "birthDate",
  "birthPlace",
  "birthPlaceCode",
  "gender",
  "fiscalCode",
];

/** I valori del blocco, letti da un record che usa altri nomi. */
export const readPersonIdentity = (
  record: Record<string, any> | null | undefined,
  keys: PersonIdentityKeyMap = {},
): PersonIdentityValue => {
  const source = record || {};
  const values: PersonIdentityValue = {};

  for (const field of IDENTITY_KEYS) {
    values[field] = source[keys[field] || field] ?? "";
  }

  return values;
};

/**
 * Una modifica del blocco, tradotta nei nomi del record.
 *
 * Si copiano **solo le chiavi presenti** nella modifica: un blocco che
 * riscrivesse tutti e sei i campi a ogni tasto premuto sovrascriverebbe con
 * una stringa vuota i dati che la scheda tiene altrove.
 */
export const writePersonIdentity = (
  patch: PersonIdentityPatch,
  keys: PersonIdentityKeyMap = {},
): Record<string, any> => {
  const written: Record<string, any> = {};

  for (const field of IDENTITY_KEYS) {
    if (patch[field] !== undefined) {
      written[keys[field] || field] = patch[field];
    }
  }

  return written;
};

/**
 * La data di nascita nella forma che un `<input type="date">` accetta.
 *
 * ## Il difetto che questa funzione chiude (RC Fix 2, punto 3)
 *
 * `athletes.birth_date` e una colonna `DateTime`: dall'API arriva come
 * `"2010-05-12T00:00:00.000Z"`. Un `<input type="date">` accetta **solo**
 * `YYYY-MM-DD` e con qualunque altra forma si disegna **vuoto**, senza dire
 * niente.
 *
 * L'effetto non era una casella vuota da riempire: era che dalla finestra di
 * modifica il codice fiscale **non si poteva calcolare**. Il calcolo legge la
 * stessa data, non la riconosce, e risponde «per calcolarlo servono ancora:
 * data di nascita» — mentre la scheda, due centimetri piu su, quella data la
 * mostrava. Chi guardava aveva torto a fidarsi dei propri occhi.
 *
 * ## Perche si taglia la stringa invece di costruire una `Date`
 *
 * `new Date("2010-05-12T00:00:00.000Z")` in un fuso a ovest di Greenwich e
 * l'**11** maggio alle 20:00, e `getFullYear/getMonth/getDate` locali
 * restituirebbero il giorno prima. Una data di nascita spostata di un giorno
 * cambia il codice fiscale, e nessuno se ne accorgerebbe guardando: sarebbe
 * un codice plausibile e sbagliato.
 *
 * Quando la stringa e gia una data ISO si prendono i primi dieci caratteri e
 * basta. La `Date` resta la via per gli altri formati, e li si usano i getter
 * **UTC** per la stessa ragione.
 */
export const toDateInputValue = (value?: unknown): string => {
  if (!value) return "";

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return "";
    // `2010-05-12` oppure `2010-05-12T00:00:00.000Z`: in entrambi i casi i
    // primi dieci caratteri sono gia la risposta.
    const iso = /^(\d{4}-\d{2}-\d{2})/.exec(trimmed);
    if (iso) return iso[1];
  }

  const parsed = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(parsed.getTime())) return "";

  return [
    String(parsed.getUTCFullYear()).padStart(4, "0"),
    String(parsed.getUTCMonth() + 1).padStart(2, "0"),
    String(parsed.getUTCDate()).padStart(2, "0"),
  ].join("-");
};
