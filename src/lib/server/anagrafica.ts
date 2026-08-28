import {
  findProvince,
  isValidPostalCode,
  isWellFormedCodiceFiscale,
} from "../italian-registry";
import { capitalizeName } from "../text-capitalization";
import { checkBirthDate, toBirthDateIso } from "../birth-date";

/**
 * Validazione anagrafica lato server.
 *
 * Il client valida per aiutare chi compila; il server valida perche le API
 * sono raggiungibili anche senza passare dal client. Le regole sono le stesse
 * — vengono dallo stesso modulo puro `lib/italian-registry.ts` — cosi non
 * possono divergere.
 *
 * **Un solo compromesso, deliberato:** su un aggiornamento un campo che non
 * cambia non viene ri-validato. Altrimenti l'introduzione di questa regola
 * renderebbe non modificabile ogni anagrafica gia in archivio con un CAP o un
 * codice fiscale sbagliato — bloccando la correzione di tutto il resto della
 * scheda proprio a chi ha piu bisogno di correggerla.
 */

export class AnagraficaValidationError extends Error {
  readonly field: string;

  constructor(field: string, message: string) {
    super(message);
    this.field = field;
    this.name = "AnagraficaValidationError";
  }
}

const asText = (value: unknown) =>
  value === null || value === undefined ? "" : String(value).trim();

const isItalianCountry = (value: unknown) => {
  const normalized = asText(value).toLowerCase();
  return !normalized || normalized === "italia" || normalized === "italy";
};

type Check = {
  field: string;
  label: string;
  value: unknown;
  previous: unknown;
  kind: "postalCode" | "province" | "personalFiscalCode" | "entityFiscalCode";
};

const runCheck = (check: Check) => {
  const value = asText(check.value);
  if (!value) return;
  // Dato invariato: se era gia in archivio, non e questa scrittura a
  // introdurlo e bloccarla impedirebbe di correggere il resto della scheda.
  if (value === asText(check.previous)) return;

  if (check.kind === "postalCode" && !isValidPostalCode(value)) {
    throw new AnagraficaValidationError(
      check.field,
      `${check.label}: il CAP deve essere di cinque cifre`,
    );
  }

  if (check.kind === "province" && !findProvince(value)) {
    throw new AnagraficaValidationError(
      check.field,
      `${check.label}: provincia non riconosciuta, usa la sigla (per esempio MI)`,
    );
  }

  if (check.kind === "personalFiscalCode" && !isWellFormedCodiceFiscale(value)) {
    throw new AnagraficaValidationError(
      check.field,
      `${check.label}: codice fiscale non valido`,
    );
  }

  if (check.kind === "entityFiscalCode") {
    // Una ASD ha quasi sempre un codice fiscale numerico di 11 cifre; le
    // societa con persona fisica di riferimento usano il codice a 16.
    const numeric = /^\d{11}$/.test(value);
    if (!numeric && !isWellFormedCodiceFiscale(value)) {
      throw new AnagraficaValidationError(
        check.field,
        `${check.label}: deve essere di 11 cifre oppure un codice fiscale di 16 caratteri`,
      );
    }
  }
};

const asRecord = (value: unknown): Record<string, any> =>
  typeof value === "object" && value ? (value as Record<string, any>) : {};

const validateClubAnagrafica = (
  input: Record<string, any>,
  existing: Record<string, any> | null,
) => {
  const previous = existing || {};
  const checks: Check[] = [];

  if (isItalianCountry(input.country ?? previous.country)) {
    checks.push(
      {
        field: "postal_code",
        label: "Sede operativa",
        value: input.postal_code,
        previous: previous.postal_code,
        kind: "postalCode",
      },
      {
        field: "province",
        label: "Sede operativa",
        value: input.province,
        previous: previous.province,
        kind: "province",
      },
    );
  }

  if (isItalianCountry(input.legal_country ?? previous.legal_country)) {
    checks.push(
      {
        field: "legal_postal_code",
        label: "Sede legale",
        value: input.legal_postal_code,
        previous: previous.legal_postal_code,
        kind: "postalCode",
      },
      {
        field: "legal_province",
        label: "Sede legale",
        value: input.legal_province,
        previous: previous.legal_province,
        kind: "province",
      },
    );
  }

  checks.push(
    {
      field: "fiscal_code",
      label: "Codice fiscale del club",
      value: input.fiscal_code,
      previous: previous.fiscal_code,
      kind: "entityFiscalCode",
    },
    {
      field: "representative_fiscal_code",
      label: "Legale rappresentante",
      value: input.representative_fiscal_code,
      previous: previous.representative_fiscal_code,
      kind: "personalFiscalCode",
    },
  );

  checks.forEach(runCheck);
};

/**
 * La data di nascita, sul confine dell'API.
 *
 * L'anteprima dell'import rifiutava gia il 31 febbraio e una nascita nel
 * futuro; la stessa scheda salvata dalla pagina Atleti, o da un modulo di
 * iscrizione, non passava di li. La regola vive ora in `lib/birth-date.ts` ed
 * e la stessa per tutti e due i percorsi (RC FIX 3).
 *
 * Vale anche qui l'indulgenza del modulo: se la scheda porta **gia** quella
 * data, non e questa scrittura a introdurla e rifiutarla impedirebbe di
 * correggere il resto. Una data inesistente in archivio non puo esserci — il
 * tipo `date` di Postgres non la accetta — quindi l'indulgenza copre solo le
 * date implausibili o nel futuro entrate prima di questo controllo.
 */
const validateAthleteBirthDate = (
  input: Record<string, any>,
  existing: Record<string, any> | null,
) => {
  const written = input.birth_date !== undefined ? input.birth_date : input.birthDate;
  if (written === undefined || written === null || asText(written) === "") return;

  const stored = toBirthDateIso(existing?.birth_date ?? existing?.birthDate);
  if (stored && stored === toBirthDateIso(written)) return;

  const check = checkBirthDate(written);
  if (!check.valid) {
    throw new AnagraficaValidationError(
      "birth_date",
      `Atleta: ${check.message.charAt(0).toLowerCase()}${check.message.slice(1)}`,
    );
  }
};

const validateAthleteAnagrafica = (
  input: Record<string, any>,
  existing: Record<string, any> | null,
) => {
  validateAthleteBirthDate(input, existing);

  const data = asRecord(input.data);
  if (!Object.keys(data).length) return;

  const previousData = asRecord(existing?.data);

  if (isItalianCountry(data.country ?? previousData.country)) {
    runCheck({
      field: "postalCode",
      label: "Residenza",
      value: data.postalCode,
      previous: previousData.postalCode,
      kind: "postalCode",
    });
    runCheck({
      field: "province",
      label: "Residenza",
      value: data.province,
      previous: previousData.province,
      kind: "province",
    });
  }

  runCheck({
    field: "fiscalCode",
    label: "Atleta",
    value: data.fiscalCode,
    previous: previousData.fiscalCode,
    kind: "personalFiscalCode",
  });
};

/**
 * Anagrafiche di persona che vivono in `club_resource_items`.
 *
 * Allenatori, staff e soci sono persone come gli atleti: hanno un codice
 * fiscale, una residenza e una provincia, e fino al Blocco 7 nessuno li
 * validava. Il codice fiscale del club veniva controllato, quello di un socio
 * no — una disparita senza ragione, non una scelta.
 *
 * Le chiavi del payload non hanno schema (vedi 06 — Modello dati): si accetta
 * ogni forma con cui i form le hanno scritte nel tempo, invece di imporne una
 * nuova e invalidare l'archivio esistente.
 */
const PERSON_RESOURCE_TYPES = new Set(["trainers", "staff_members", "members"]);

const PERSON_LABELS: Record<string, string> = {
  trainers: "Allenatore",
  staff_members: "Staff",
  members: "Socio",
};

/** Prima chiave valorizzata: i form storici non usano tutti lo stesso nome. */
const pick = (record: Record<string, any>, keys: string[]) => {
  for (const key of keys) {
    const value = record?.[key];
    if (value !== null && value !== undefined && String(value).trim()) {
      return value;
    }
  }
  return "";
};

const FISCAL_CODE_KEYS = ["fiscalCode", "fiscal_code", "codiceFiscale"];
const POSTAL_CODE_KEYS = ["postalCode", "postal_code", "cap", "zipCode"];
const PROVINCE_KEYS = ["province", "provincia"];
const COUNTRY_KEYS = ["country", "paese", "nazione"];

const validatePersonResource = (
  resource: string,
  input: Record<string, any>,
  existing: Record<string, any> | null,
) => {
  const payload = asRecord(input.payload);
  if (!Object.keys(payload).length) return;

  const previous = asRecord(existing?.payload);
  const label = PERSON_LABELS[resource] || "Anagrafica";

  runCheck({
    field: "fiscalCode",
    label,
    value: pick(payload, FISCAL_CODE_KEYS),
    previous: pick(previous, FISCAL_CODE_KEYS),
    kind: "personalFiscalCode",
  });

  const country = pick(payload, COUNTRY_KEYS) || pick(previous, COUNTRY_KEYS);
  if (!isItalianCountry(country)) return;

  runCheck({
    field: "postalCode",
    label: `${label} — residenza`,
    value: pick(payload, POSTAL_CODE_KEYS),
    previous: pick(previous, POSTAL_CODE_KEYS),
    kind: "postalCode",
  });
  runCheck({
    field: "province",
    label: `${label} — residenza`,
    value: pick(payload, PROVINCE_KEYS),
    previous: pick(previous, PROVINCE_KEYS),
    kind: "province",
  });
};

/**
 * Punto di ingresso unico: chiamato da `resources.ts` su creazione e
 * aggiornamento. Su creazione `existing` e `null` e tutto viene validato.
 */
export const assertAnagraficaIsValid = (
  resource: string,
  input: Record<string, any>,
  existing: Record<string, any> | null = null,
) => {
  if (resource === "clubs" || resource === "organizations") {
    validateClubAnagrafica(input, existing);
    return;
  }

  if (resource === "athletes" || resource === "simplified_athletes") {
    validateAthleteAnagrafica(input, existing);
    return;
  }

  if (PERSON_RESOURCE_TYPES.has(resource)) {
    validatePersonResource(resource, input, existing);
  }
};

/* -------------------------------------------------- maiuscola iniziale (RC Fix 2, punto 2) */

/**
 * La maiuscola iniziale sui nomi, **anche lato server**.
 *
 * ## Il difetto
 *
 * La regola condivisa (`src/lib/text-capitalization.ts`) viveva solo nei
 * campi di testo: `CapitalizedInput` la applica all'uscita dal campo, e
 * finisce li. Tutto cio che scrive un'anagrafica **senza passare da un campo
 * di testo** la aggirava:
 *
 * - l'import atleti da file, che e il modo in cui un club carica i primi
 *   duecento nomi. Un foglio Excel scritto `mario rossi` restava
 *   `mario rossi`, e l'elenco ordinato alfabeticamente mescolava i nomi
 *   importati con quelli digitati;
 * - qualunque chiamata alle API fatta da fuori dal browser.
 *
 * Il risultato e che la stessa persona si scriveva in due modi a seconda di
 * come era entrata — cioe esattamente il problema che la regola doveva
 * chiudere.
 *
 * ## Cosa questa funzione tocca, e cosa no
 *
 * **Solo campi semantici di persona o di luogo**, elencati uno per uno:
 * nome, cognome, nome per esteso, luogo di nascita, comune, indirizzo — piu
 * gli stessi campi dentro ogni genitore/tutore. Mai email, password, codice
 * fiscale, IBAN, numeri di tessera, codici o note: sono identificatori o
 * testo libero, e la regola e per le parole di una lingua.
 *
 * **Non impone niente a chi ha gia deciso.** `capitalizeName` lascia stare un
 * valore che contiene gia una maiuscola: `MARIO ROSSI` resta com'e (e come
 * sta scritto sul documento), `McDonald` resta `McDonald`. Interviene solo
 * sul tutto-minuscolo, che e il modo in cui un dato entra quando nessuno ha
 * deciso come scriverlo.
 */
const PERSON_TEXT_KEYS = [
  "firstName",
  "first_name",
  "lastName",
  "last_name",
  "name",
  "surname",
  "fullName",
  "full_name",
  "birthPlace",
  "birth_place",
  "city",
  "address",
];

/** Applica la regola alle sole chiavi elencate, dove esistono e sono testo. */
/**
 * La stessa lettera scritta in un modo solo.
 *
 * `ò` si puo rappresentare in due modi: un carattere solo (NFC) oppure `o`
 * seguito dall'accento combinante (NFD). A schermo sono identici, per il
 * database sono due stringhe diverse — e per `ILIKE` pure.
 *
 * Il difetto che questa riga chiude e stato visto cercando: un'atleta salvata
 * come `Niccolò` in forma decomposta **non si trovava** digitando «Niccolò»,
 * mentre si trovava digitando «Niccolo» — cioe il contrario di quello che
 * chiunque si aspetta. La stessa differenza fa contare a `length()` un
 * carattere in piu di quelli che si vedono.
 *
 * La forma decomposta non arriva da chi digita: arriva dai file. Gli export
 * fatti su macOS la usano, ed e cosi che e entrata anche qui, da un import.
 * Si normalizza in scrittura, nell'unico punto da cui passano tutte e cinque
 * le scritture di anagrafica.
 *
 * **E l'altra meta sta nella lettura.** Normalizzare solo cio che si scrive
 * sposta il difetto invece di chiuderlo: una chiave di ricerca in forma
 * decomposta non trova un nome in forma composta. La chiave si normalizza
 * allo stesso modo in `buildSearchFilter` (`src/lib/server/resources.ts`) e
 * nel filtro dell'elenco Atleti, che e quello che usano i club sotto la
 * soglia di paginazione.
 */
const toCanonicalUnicode = (value: string) => value.normalize("NFC");

const capitalizeKeys = (record: Record<string, any>, keys: string[]) => {
  if (!record || typeof record !== "object") return;

  for (const key of keys) {
    const value = record[key];
    if (typeof value !== "string" || !value.trim()) continue;
    record[key] = capitalizeName(toCanonicalUnicode(value));
  }
};

const normalizeAthleteText = (input: Record<string, any>) => {
  capitalizeKeys(input, ["first_name", "last_name"]);

  const data = input.data;
  if (!data || typeof data !== "object") return;

  capitalizeKeys(data, PERSON_TEXT_KEYS);

  /*
    Il genitore e una persona come l'atleta: senza questo, l'unica anagrafica
    con la maiuscola sbagliata sarebbe quella di chi paga la quota.
  */
  if (Array.isArray(data.guardians)) {
    for (const guardian of data.guardians) {
      capitalizeKeys(guardian, PERSON_TEXT_KEYS);
    }
  }
};

/**
 * Normalizza i nomi di un'anagrafica **in luogo**, prima della scrittura.
 *
 * Punto di ingresso unico: chiamato da `resources.ts` accanto alla
 * validazione, cosi non esiste una scrittura che passi dall'una e non
 * dall'altra.
 */
export const normalizeAnagraficaText = (
  resource: string,
  input: Record<string, any>,
) => {
  if (!input || typeof input !== "object") return;

  if (resource === "athletes" || resource === "simplified_athletes") {
    normalizeAthleteText(input);
    return;
  }

  if (PERSON_RESOURCE_TYPES.has(resource)) {
    capitalizeKeys(asRecord(input.payload), PERSON_TEXT_KEYS);
  }
};
