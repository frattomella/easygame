/**
 * Anagrafica italiana: province, CAP e codice fiscale.
 *
 * Modulo puro e senza dipendenze: lo usano sia i form del club sia quelli
 * dell'atleta, ed e verificabile dal runner dei test senza un browser.
 *
 * **Cosa contiene e cosa no.** Le 107 province con la relativa regione sono un
 * insieme chiuso e stabile: stanno qui. L'elenco degli 8.000 comuni italiani
 * con CAP e codice catastale **non** ci sta, e inventarlo produrrebbe codici
 * fiscali sbagliati — l'errore peggiore possibile in una segreteria sportiva.
 * Per questo il codice catastale (Belfiore) e un dato che l'utente fornisce o
 * che si ricava da un codice fiscale gia noto, mai indovinato.
 */

export type ItalianProvince = {
  /** Sigla automobilistica, due lettere maiuscole. */
  code: string;
  name: string;
  region: string;
};

export const ITALIAN_PROVINCES: ItalianProvince[] = [
  { code: "AG", name: "Agrigento", region: "Sicilia" },
  { code: "AL", name: "Alessandria", region: "Piemonte" },
  { code: "AN", name: "Ancona", region: "Marche" },
  { code: "AO", name: "Aosta", region: "Valle d'Aosta" },
  { code: "AP", name: "Ascoli Piceno", region: "Marche" },
  { code: "AQ", name: "L'Aquila", region: "Abruzzo" },
  { code: "AR", name: "Arezzo", region: "Toscana" },
  { code: "AT", name: "Asti", region: "Piemonte" },
  { code: "AV", name: "Avellino", region: "Campania" },
  { code: "BA", name: "Bari", region: "Puglia" },
  { code: "BG", name: "Bergamo", region: "Lombardia" },
  { code: "BI", name: "Biella", region: "Piemonte" },
  { code: "BL", name: "Belluno", region: "Veneto" },
  { code: "BN", name: "Benevento", region: "Campania" },
  { code: "BO", name: "Bologna", region: "Emilia-Romagna" },
  { code: "BR", name: "Brindisi", region: "Puglia" },
  { code: "BS", name: "Brescia", region: "Lombardia" },
  { code: "BT", name: "Barletta-Andria-Trani", region: "Puglia" },
  { code: "BZ", name: "Bolzano", region: "Trentino-Alto Adige" },
  { code: "CA", name: "Cagliari", region: "Sardegna" },
  { code: "CB", name: "Campobasso", region: "Molise" },
  { code: "CE", name: "Caserta", region: "Campania" },
  { code: "CH", name: "Chieti", region: "Abruzzo" },
  { code: "CL", name: "Caltanissetta", region: "Sicilia" },
  { code: "CN", name: "Cuneo", region: "Piemonte" },
  { code: "CO", name: "Como", region: "Lombardia" },
  { code: "CR", name: "Cremona", region: "Lombardia" },
  { code: "CS", name: "Cosenza", region: "Calabria" },
  { code: "CT", name: "Catania", region: "Sicilia" },
  { code: "CZ", name: "Catanzaro", region: "Calabria" },
  { code: "EN", name: "Enna", region: "Sicilia" },
  { code: "FC", name: "Forlì-Cesena", region: "Emilia-Romagna" },
  { code: "FE", name: "Ferrara", region: "Emilia-Romagna" },
  { code: "FG", name: "Foggia", region: "Puglia" },
  { code: "FI", name: "Firenze", region: "Toscana" },
  { code: "FM", name: "Fermo", region: "Marche" },
  { code: "FR", name: "Frosinone", region: "Lazio" },
  { code: "GE", name: "Genova", region: "Liguria" },
  { code: "GO", name: "Gorizia", region: "Friuli-Venezia Giulia" },
  { code: "GR", name: "Grosseto", region: "Toscana" },
  { code: "IM", name: "Imperia", region: "Liguria" },
  { code: "IS", name: "Isernia", region: "Molise" },
  { code: "KR", name: "Crotone", region: "Calabria" },
  { code: "LC", name: "Lecco", region: "Lombardia" },
  { code: "LE", name: "Lecce", region: "Puglia" },
  { code: "LI", name: "Livorno", region: "Toscana" },
  { code: "LO", name: "Lodi", region: "Lombardia" },
  { code: "LT", name: "Latina", region: "Lazio" },
  { code: "LU", name: "Lucca", region: "Toscana" },
  { code: "MB", name: "Monza e della Brianza", region: "Lombardia" },
  { code: "MC", name: "Macerata", region: "Marche" },
  { code: "ME", name: "Messina", region: "Sicilia" },
  { code: "MI", name: "Milano", region: "Lombardia" },
  { code: "MN", name: "Mantova", region: "Lombardia" },
  { code: "MO", name: "Modena", region: "Emilia-Romagna" },
  { code: "MS", name: "Massa-Carrara", region: "Toscana" },
  { code: "MT", name: "Matera", region: "Basilicata" },
  { code: "NA", name: "Napoli", region: "Campania" },
  { code: "NO", name: "Novara", region: "Piemonte" },
  { code: "NU", name: "Nuoro", region: "Sardegna" },
  { code: "OR", name: "Oristano", region: "Sardegna" },
  { code: "PA", name: "Palermo", region: "Sicilia" },
  { code: "PC", name: "Piacenza", region: "Emilia-Romagna" },
  { code: "PD", name: "Padova", region: "Veneto" },
  { code: "PE", name: "Pescara", region: "Abruzzo" },
  { code: "PG", name: "Perugia", region: "Umbria" },
  { code: "PI", name: "Pisa", region: "Toscana" },
  { code: "PN", name: "Pordenone", region: "Friuli-Venezia Giulia" },
  { code: "PO", name: "Prato", region: "Toscana" },
  { code: "PR", name: "Parma", region: "Emilia-Romagna" },
  { code: "PT", name: "Pistoia", region: "Toscana" },
  { code: "PU", name: "Pesaro e Urbino", region: "Marche" },
  { code: "PV", name: "Pavia", region: "Lombardia" },
  { code: "PZ", name: "Potenza", region: "Basilicata" },
  { code: "RA", name: "Ravenna", region: "Emilia-Romagna" },
  { code: "RC", name: "Reggio Calabria", region: "Calabria" },
  { code: "RE", name: "Reggio Emilia", region: "Emilia-Romagna" },
  { code: "RG", name: "Ragusa", region: "Sicilia" },
  { code: "RI", name: "Rieti", region: "Lazio" },
  { code: "RM", name: "Roma", region: "Lazio" },
  { code: "RN", name: "Rimini", region: "Emilia-Romagna" },
  { code: "RO", name: "Rovigo", region: "Veneto" },
  { code: "SA", name: "Salerno", region: "Campania" },
  { code: "SI", name: "Siena", region: "Toscana" },
  { code: "SO", name: "Sondrio", region: "Lombardia" },
  { code: "SP", name: "La Spezia", region: "Liguria" },
  { code: "SR", name: "Siracusa", region: "Sicilia" },
  { code: "SS", name: "Sassari", region: "Sardegna" },
  { code: "SU", name: "Sud Sardegna", region: "Sardegna" },
  { code: "SV", name: "Savona", region: "Liguria" },
  { code: "TA", name: "Taranto", region: "Puglia" },
  { code: "TE", name: "Teramo", region: "Abruzzo" },
  { code: "TN", name: "Trento", region: "Trentino-Alto Adige" },
  { code: "TO", name: "Torino", region: "Piemonte" },
  { code: "TP", name: "Trapani", region: "Sicilia" },
  { code: "TR", name: "Terni", region: "Umbria" },
  { code: "TS", name: "Trieste", region: "Friuli-Venezia Giulia" },
  { code: "TV", name: "Treviso", region: "Veneto" },
  { code: "UD", name: "Udine", region: "Friuli-Venezia Giulia" },
  { code: "VA", name: "Varese", region: "Lombardia" },
  { code: "VB", name: "Verbano-Cusio-Ossola", region: "Piemonte" },
  { code: "VC", name: "Vercelli", region: "Piemonte" },
  { code: "VE", name: "Venezia", region: "Veneto" },
  { code: "VI", name: "Vicenza", region: "Veneto" },
  { code: "VR", name: "Verona", region: "Veneto" },
  { code: "VT", name: "Viterbo", region: "Lazio" },
  { code: "VV", name: "Vibo Valentia", region: "Calabria" },
];

export const ITALIAN_REGIONS = Array.from(
  new Set(ITALIAN_PROVINCES.map((province) => province.region)),
).sort((left, right) => left.localeCompare(right, "it"));

/** Senza segni diacritici. Lo riusa `comuni-model.ts`: una definizione sola. */
export const stripDiacritics = (value: string) =>
  value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

const normalizeName = (value: string) =>
  stripDiacritics(String(value || ""))
    .toLowerCase()
    .replace(/[^a-z]+/g, "");

const PROVINCE_BY_CODE = new Map(
  ITALIAN_PROVINCES.map((province) => [province.code, province]),
);

const PROVINCE_BY_NAME = new Map(
  ITALIAN_PROVINCES.map((province) => [normalizeName(province.name), province]),
);

/** Sigla in maiuscolo se riconosciuta, stringa vuota altrimenti. */
export const normalizeProvinceCode = (value?: string | null) => {
  const candidate = String(value || "")
    .trim()
    .toUpperCase();
  return PROVINCE_BY_CODE.has(candidate) ? candidate : "";
};

/**
 * Accetta indifferentemente la sigla (`MI`) o il nome (`Milano`, `milano`).
 * Nei dati esistenti convivono entrambe le forme.
 */
export const findProvince = (value?: string | null): ItalianProvince | null => {
  const raw = String(value || "").trim();
  if (!raw) return null;

  const byCode = PROVINCE_BY_CODE.get(raw.toUpperCase());
  if (byCode) return byCode;

  return PROVINCE_BY_NAME.get(normalizeName(raw)) || null;
};

export const getRegionForProvince = (value?: string | null) =>
  findProvince(value)?.region || "";

export const isValidPostalCode = (value?: string | null) =>
  /^\d{5}$/.test(String(value || "").trim());

export type AddressFields = {
  postalCode?: string | null;
  city?: string | null;
  province?: string | null;
  region?: string | null;
  country?: string | null;
};

export type FieldIssue = { field: string; message: string };

/**
 * Proposta di completamento: solo valori valorizzati, mai `null`. Chi la
 * applica fa uno spread sullo stato del form e non deve poter azzerare un
 * campo per sbaglio.
 */
export type AddressSuggestion = {
  postalCode?: string;
  city?: string;
  province?: string;
  region?: string;
  country?: string;
};

const isItaly = (country?: string | null) => {
  const normalized = normalizeName(country || "italia");
  return !normalized || normalized === "italia" || normalized === "italy";
};

/**
 * Validazione dell'indirizzo, usata identica dal client e dal server.
 *
 * Fuori dall'Italia il CAP non ha cinque cifre e la sigla di provincia non
 * esiste: i controlli si applicano solo quando il paese e l'Italia.
 */
export const validateAddressFields = (fields: AddressFields): FieldIssue[] => {
  const issues: FieldIssue[] = [];
  const postalCode = String(fields.postalCode || "").trim();
  const city = String(fields.city || "").trim();
  const province = String(fields.province || "").trim();
  const region = String(fields.region || "").trim();

  if (!isItaly(fields.country)) {
    return issues;
  }

  if (postalCode && !isValidPostalCode(postalCode)) {
    issues.push({
      field: "postalCode",
      message: "Il CAP deve essere di cinque cifre",
    });
  }

  if (province && !findProvince(province)) {
    issues.push({
      field: "province",
      message: "Provincia non riconosciuta: usa la sigla, ad esempio MI",
    });
  }

  if (postalCode && !city) {
    issues.push({
      field: "city",
      message: "Indica il comune insieme al CAP",
    });
  }

  const resolvedProvince = findProvince(province);
  if (resolvedProvince && region) {
    if (normalizeName(region) !== normalizeName(resolvedProvince.region)) {
      issues.push({
        field: "region",
        message: `${resolvedProvince.name} appartiene a ${resolvedProvince.region}`,
      });
    }
  }

  return issues;
};

/**
 * Completamento assistito: propone solo cio che manca.
 *
 * Non sovrascrive mai un valore gia inserito — chi compila puo avere ragione
 * anche quando la tabella non lo prevede.
 */
export const suggestAddressCompletion = (
  fields: AddressFields,
): AddressSuggestion => {
  const suggestion: AddressSuggestion = {};

  if (!isItaly(fields.country)) {
    return suggestion;
  }

  const province = findProvince(fields.province);
  if (province) {
    if (String(fields.province || "").trim() !== province.code) {
      suggestion.province = province.code;
    }
    if (!String(fields.region || "").trim()) {
      suggestion.region = province.region;
    }
  }

  if (!String(fields.country || "").trim()) {
    suggestion.country = "Italia";
  }

  return suggestion;
};

// --- codice fiscale ---------------------------------------------------------

const MONTH_LETTERS = "ABCDEHLMPRST";

const ODD_VALUES: Record<string, number> = {
  "0": 1,
  "1": 0,
  "2": 5,
  "3": 7,
  "4": 9,
  "5": 13,
  "6": 15,
  "7": 17,
  "8": 19,
  "9": 21,
  A: 1,
  B: 0,
  C: 5,
  D: 7,
  E: 9,
  F: 13,
  G: 15,
  H: 17,
  I: 19,
  J: 21,
  K: 2,
  L: 4,
  M: 18,
  N: 20,
  O: 11,
  P: 3,
  Q: 6,
  R: 8,
  S: 12,
  T: 14,
  U: 16,
  V: 10,
  W: 22,
  X: 25,
  Y: 24,
  Z: 23,
};

const evenValue = (character: string) =>
  /\d/.test(character)
    ? Number(character)
    : character.charCodeAt(0) - "A".charCodeAt(0);

const toLetters = (value?: string | null) =>
  stripDiacritics(String(value || ""))
    .toUpperCase()
    .replace(/[^A-Z]/g, "");

const splitLetters = (value: string) => ({
  consonants: value.replace(/[AEIOU]/g, ""),
  vowels: value.replace(/[^AEIOU]/g, ""),
});

const surnameCode = (surname: string) => {
  const letters = toLetters(surname);
  const { consonants, vowels } = splitLetters(letters);
  return `${consonants}${vowels}XXX`.slice(0, 3);
};

const nameCode = (name: string) => {
  const letters = toLetters(name);
  const { consonants, vowels } = splitLetters(letters);
  // Con quattro o piu consonanti si saltano la seconda: e la regola che
  // distingue MRA (Mario) da MRC (Marco).
  if (consonants.length >= 4) {
    return `${consonants[0]}${consonants[2]}${consonants[3]}`;
  }
  return `${consonants}${vowels}XXX`.slice(0, 3);
};

export const isValidBelfioreCode = (value?: string | null) =>
  /^[A-Z]\d{3}$/.test(
    String(value || "")
      .trim()
      .toUpperCase(),
  );

export const computeCodiceFiscaleCheckCharacter = (partial: string) => {
  const value = String(partial || "")
    .trim()
    .toUpperCase();
  if (value.length !== 15) return "";

  let sum = 0;
  for (let index = 0; index < 15; index += 1) {
    const character = value[index];
    // Le posizioni sono contate da 1: gli indici pari sono posizioni dispari.
    sum += index % 2 === 0 ? (ODD_VALUES[character] ?? 0) : evenValue(character);
  }

  return String.fromCharCode("A".charCodeAt(0) + (sum % 26));
};

export type CodiceFiscaleInput = {
  firstName?: string | null;
  lastName?: string | null;
  /** ISO `YYYY-MM-DD`. */
  birthDate?: string | null;
  gender?: string | null;
  /** Codice catastale (Belfiore) del comune o dello stato di nascita. */
  belfioreCode?: string | null;
};

export type CodiceFiscaleResult =
  | { ok: true; value: string }
  | { ok: false; missing: string[] };

const normalizeGender = (value?: string | null) => {
  const letter = String(value || "")
    .trim()
    .charAt(0)
    .toUpperCase();
  if (letter === "M") return "M";
  if (letter === "F") return "F";
  return "";
};

/**
 * Calcola il codice fiscale quando ci sono tutti gli elementi, altrimenti dice
 * quali mancano. Non restituisce mai un codice parziale: un codice fiscale
 * incompleto e peggio di un campo vuoto.
 */
export const computeCodiceFiscale = (
  input: CodiceFiscaleInput,
): CodiceFiscaleResult => {
  const missing: string[] = [];

  const lastName = toLetters(input.lastName);
  const firstName = toLetters(input.firstName);
  const gender = normalizeGender(input.gender);
  const belfiore = String(input.belfioreCode || "")
    .trim()
    .toUpperCase();
  const birthDate = String(input.birthDate || "").trim();
  const dateMatch = birthDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (!lastName) missing.push("cognome");
  if (!firstName) missing.push("nome");
  if (!dateMatch) missing.push("data di nascita");
  if (!gender) missing.push("sesso");
  if (!isValidBelfioreCode(belfiore)) missing.push("codice catastale");

  if (missing.length || !dateMatch) {
    return { ok: false, missing };
  }

  const [, year, month, day] = dateMatch;
  const monthIndex = Number(month) - 1;
  if (monthIndex < 0 || monthIndex > 11) {
    return { ok: false, missing: ["data di nascita"] };
  }

  const dayNumber = Number(day) + (gender === "F" ? 40 : 0);
  const partial = [
    surnameCode(lastName),
    nameCode(firstName),
    year.slice(2),
    MONTH_LETTERS[monthIndex],
    String(dayNumber).padStart(2, "0"),
    belfiore,
  ].join("");

  return { ok: true, value: partial + computeCodiceFiscaleCheckCharacter(partial) };
};

export const isWellFormedCodiceFiscale = (value?: string | null) => {
  const candidate = String(value || "")
    .trim()
    .toUpperCase();
  if (!/^[A-Z]{6}\d{2}[A-Z]\d{2}[A-Z]\d{3}[A-Z]$/.test(candidate)) {
    return false;
  }
  return (
    computeCodiceFiscaleCheckCharacter(candidate.slice(0, 15)) ===
    candidate.slice(15)
  );
};

/**
 * Il codice catastale gia contenuto in un codice fiscale valido.
 *
 * E il solo modo onesto di conoscere il comune di nascita senza una tabella
 * dei comuni: se l'anagrafica ha gia un codice fiscale, il comune e li dentro.
 */
export const extractBelfioreCode = (codiceFiscale?: string | null) => {
  const candidate = String(codiceFiscale || "")
    .trim()
    .toUpperCase();
  return isWellFormedCodiceFiscale(candidate) ? candidate.slice(11, 15) : "";
};

export type CodiceFiscaleCheck = {
  status: "empty" | "valid" | "malformed" | "mismatch";
  message: string;
  expected?: string;
};

/**
 * Confronta il codice fiscale inserito a mano con quello calcolabile dagli
 * altri campi. Segnala, non corregge: la fonte resta l'utente.
 */
export const checkCodiceFiscale = (
  value: string | null | undefined,
  input: CodiceFiscaleInput,
): CodiceFiscaleCheck => {
  const candidate = String(value || "")
    .trim()
    .toUpperCase();

  if (!candidate) {
    return { status: "empty", message: "" };
  }

  if (!isWellFormedCodiceFiscale(candidate)) {
    return {
      status: "malformed",
      message: "Codice fiscale non valido: controlla le 16 cifre di controllo",
    };
  }

  const computed = computeCodiceFiscale({
    ...input,
    belfioreCode: input.belfioreCode || candidate.slice(11, 15),
  });

  if (computed.ok && computed.value !== candidate) {
    return {
      status: "mismatch",
      message: `Il codice non corrisponde ai dati anagrafici: atteso ${computed.value}`,
      expected: computed.value,
    };
  }

  return { status: "valid", message: "Codice fiscale valido" };
};
