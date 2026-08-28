import { findCategoryForBirthDate, resolveCategoryId } from "@/lib/category-utils";
import { isWellFormedCodiceFiscale } from "@/lib/italian-registry";
import {
  MIN_PLAUSIBLE_BIRTH_YEAR,
  isRealCalendarDate,
} from "@/lib/birth-date";

/**
 * Import anagrafiche atleti da file.
 *
 * Il modulo e **puro**: nessun accesso al DOM, nessuna chiamata di rete. I
 * parser di CSV e XML sono scritti qui invece di appoggiarsi al browser per
 * due ragioni concrete:
 *
 * - la versione precedente leggeva il CSV con SheetJS, che indovina il
 *   separatore: un export gestionale italiano con `;` finiva in una sola
 *   colonna e l'import "riusciva" importando righe vuote;
 * - l'XML veniva letto con `DOMParser`, che esiste solo nel browser: nessuna
 *   parte di quel percorso era verificabile dal runner dei test, ed e infatti
 *   il pezzo che si e rotto senza che nessuno se ne accorgesse.
 *
 * Ora entrambi i formati sono coperti da test (`tests/lib/athlete-import.test.mjs`).
 */

export type AthleteImportField =
  | "firstName"
  | "lastName"
  | "fullName"
  | "birthDate"
  | "birthYear"
  | "category"
  | "gender"
  | "fiscalCode"
  | "email"
  | "phone";

export type AthleteImportMapping = Partial<Record<AthleteImportField, string>>;

export type AthleteImportFormat = "CSV" | "XLS" | "XLSX" | "XML";

export interface ParsedAthleteImportFile {
  format: AthleteImportFormat;
  headers: string[];
  rows: Record<string, any>[];
}

export type ImportRowStatus = "ready" | "error";

export interface NormalizedImportedAthleteRow {
  rowNumber: number;
  firstName: string;
  lastName: string;
  birthDate: string;
  gender: string;
  fiscalCode: string;
  email: string;
  phone: string;
  categoryId: string | null;
  categoryLabel: string;
  status: ImportRowStatus;
  /** Impediscono l'import della riga. */
  errors: string[];
  /** La riga si importa lo stesso, ma con un dato in meno o dedotto. */
  warnings: string[];
  raw: Record<string, any>;
}

export interface AthleteImportSummary {
  total: number;
  importable: number;
  discarded: number;
  withWarnings: number;
}

const normalizeHeader = (value: string) =>
  String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "");

/**
 * Sinonimi delle intestazioni, gia normalizzati.
 *
 * La normalizzazione si applica **anche ai candidati**: prima erano scritti
 * con underscore e spazi (`data_di_nascita`) e venivano confrontati con
 * un'intestazione da cui gli underscore erano appena stati tolti, quindi non
 * combaciavano mai. Effetto pratico: "Data di nascita" — l'intestazione piu
 * comune di tutte — non veniva riconosciuta e ogni riga risultava senza data.
 */
const HEADER_CANDIDATES: Record<AthleteImportField, string[]> = Object.
  fromEntries(
    Object.entries({
      firstName: ["nome", "first name", "firstname", "given name"],
      lastName: ["cognome", "last name", "lastname", "surname", "family name"],
      fullName: [
        "nominativo",
        "nome e cognome",
        "cognome e nome",
        "nome socio",
        "athlete",
        "full name",
      ],
      birthDate: [
        "data nascita",
        "data di nascita",
        /*
          «Nascita», «Nato il», «Nata il»: intestazioni comuni quanto «Data di
          nascita» negli export dei gestionali italiani. Senza, la colonna non
          veniva riconosciuta, ogni riga risultava senza data e l'intero file
          finiva fra gli scarti (RC Fix 1, punto 3).
        */
        "nascita",
        "nato il",
        "nata il",
        "birth date",
        "birthdate",
        "dob",
        "date of birth",
      ],
      birthYear: [
        "anno nascita",
        "anno di nascita",
        "birth year",
        "year of birth",
      ],
      category: ["categoria", "category", "gruppo", "squadra", "team"],
      gender: ["sesso", "genere", "gender", "sex"],
      fiscalCode: [
        "codice fiscale",
        "cod fiscale",
        "cf",
        "fiscal code",
        "tax code",
      ],
      email: ["email", "e-mail", "mail", "posta elettronica"],
      phone: ["telefono", "cellulare", "phone", "mobile", "tel"],
    }).map(([field, candidates]) => [
      field,
      candidates.map((candidate) => normalizeHeader(candidate)),
    ]),
  ) as Record<AthleteImportField, string[]>;

// --- parser CSV -------------------------------------------------------------

const CSV_DELIMITERS = [";", ",", "\t", "|"];

/**
 * Separatore piu probabile: quello che produce lo stesso numero di colonne,
 * maggiore di uno, sulle prime righe. Il conteggio ignora i separatori dentro
 * ai campi tra virgolette.
 */
export const detectCsvDelimiter = (text: string) => {
  const sample = text.split(/\r?\n/).filter((line) => line.trim()).slice(0, 5);
  if (!sample.length) return ",";

  let best = ",";
  let bestScore = -1;

  for (const delimiter of CSV_DELIMITERS) {
    const counts = sample.map((line) => {
      let count = 0;
      let quoted = false;
      for (let index = 0; index < line.length; index += 1) {
        const character = line[index];
        if (character === '"') {
          quoted = !quoted;
        } else if (!quoted && character === delimiter) {
          count += 1;
        }
      }
      return count;
    });

    const first = counts[0];
    if (!first) continue;
    const consistent = counts.every((count) => count === first);
    const score = first * (consistent ? 10 : 1);
    if (score > bestScore) {
      bestScore = score;
      best = delimiter;
    }
  }

  return best;
};

const splitCsvRecords = (text: string, delimiter: string) => {
  const records: string[][] = [];
  let field = "";
  let record: string[] = [];
  let quoted = false;

  const pushField = () => {
    record.push(field);
    field = "";
  };
  const pushRecord = () => {
    pushField();
    records.push(record);
    record = [];
  };

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];

    if (quoted) {
      if (character === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        field += character;
      }
      continue;
    }

    if (character === '"') {
      quoted = true;
      continue;
    }
    if (character === delimiter) {
      pushField();
      continue;
    }
    if (character === "\r") {
      continue;
    }
    if (character === "\n") {
      pushRecord();
      continue;
    }
    field += character;
  }

  if (field.length || record.length) {
    pushRecord();
  }

  return records.filter((row) => row.some((cell) => cell.trim() !== ""));
};

export const parseCsvText = (rawText: string) => {
  const text = rawText.replace(/^\uFEFF/, "");
  const delimiter = detectCsvDelimiter(text);
  const records = splitCsvRecords(text, delimiter);

  if (!records.length) {
    return { headers: [] as string[], rows: [] as Record<string, string>[] };
  }

  const headers = records[0].map((header, index) => {
    const label = header.trim();
    return label || `Colonna ${index + 1}`;
  });

  const rows = records.slice(1).map((record) => {
    const row: Record<string, string> = {};
    headers.forEach((header, index) => {
      row[header] = (record[index] ?? "").trim();
    });
    return row;
  });

  return { headers, rows };
};

// --- parser XML -------------------------------------------------------------

type XmlNode = {
  tag: string;
  attributes: Record<string, string>;
  children: XmlNode[];
  text: string;
};

const decodeXmlEntities = (value: string) =>
  value
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, code) =>
      String.fromCharCode(parseInt(code, 16)),
    )
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");

const parseXmlAttributes = (source: string) => {
  const attributes: Record<string, string> = {};
  const pattern = /([\w:.-]+)\s*=\s*("([^"]*)"|'([^']*)')/g;
  let match = pattern.exec(source);
  while (match) {
    attributes[match[1]] = decodeXmlEntities(match[3] ?? match[4] ?? "");
    match = pattern.exec(source);
  }
  return attributes;
};

/**
 * Parser XML minimo, sufficiente per un export anagrafico: elementi,
 * attributi, testo, CDATA, commenti e prologo. Non gestisce namespace,
 * DTD o entita personalizzate — nessun gestionale le usa in un export.
 */
export const parseXmlDocument = (rawText: string): XmlNode => {
  const text = rawText
    .replace(/^\uFEFF/, "")
    .replace(/<\?[\s\S]*?\?>/g, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<!DOCTYPE[^>]*>/gi, "")
    // Le sezioni CDATA diventano testo normale prima della scansione dei tag:
    // il loro contenuto puo contenere '>' e manderebbe fuori strada il
    // riconoscimento degli elementi.
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, (_, content) =>
      String(content)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;"),
    );

  const root: XmlNode = {
    tag: "#document",
    attributes: {},
    children: [],
    text: "",
  };
  const stack: XmlNode[] = [root];
  const tagPattern = /<([^>]+)>/g;
  let lastIndex = 0;
  let match = tagPattern.exec(text);

  while (match) {
    const between = text.slice(lastIndex, match.index);
    if (between.trim()) {
      const current = stack[stack.length - 1];
      current.text += decodeXmlEntities(between);
    }

    const raw = match[1].trim();
    lastIndex = tagPattern.lastIndex;

    if (raw.startsWith("/")) {
      if (stack.length > 1) stack.pop();
    } else {
      const selfClosing = raw.endsWith("/");
      const body = selfClosing ? raw.slice(0, -1).trim() : raw;
      const tag = body.split(/\s/)[0];
      const node: XmlNode = {
        tag,
        attributes: parseXmlAttributes(body.slice(tag.length)),
        children: [],
        text: "",
      };
      stack[stack.length - 1].children.push(node);
      if (!selfClosing) stack.push(node);
    }

    match = tagPattern.exec(text);
  }

  if (!root.children.length && text.trim()) {
    throw new Error("Il file XML non e leggibile");
  }

  return root;
};

const collectXmlElements = (node: XmlNode, output: XmlNode[] = []) => {
  node.children.forEach((child) => {
    output.push(child);
    collectXmlElements(child, output);
  });
  return output;
};

const isLeaf = (node: XmlNode) => node.children.length === 0;

const xmlNodeToRow = (node: XmlNode) => {
  const row: Record<string, string> = { ...node.attributes };
  node.children.forEach((child) => {
    if (isLeaf(child)) {
      row[child.tag] = child.text.trim();
    }
  });
  return row;
};

/**
 * Righe di un XML anagrafico: il gruppo piu numeroso di elementi fratelli con
 * lo stesso nome i cui figli sono tutti foglie (o che portano solo attributi).
 */
export const parseXmlText = (rawText: string) => {
  const document = parseXmlDocument(rawText);
  const elements = collectXmlElements(document);

  const candidates = elements.filter((element) => {
    const hasLeafChildren =
      element.children.length > 0 && element.children.every(isLeaf);
    const hasOnlyAttributes =
      element.children.length === 0 && Object.keys(element.attributes).length > 0;
    return hasLeafChildren || hasOnlyAttributes;
  });

  const grouped = new Map<string, XmlNode[]>();
  candidates.forEach((element) => {
    const group = grouped.get(element.tag) || [];
    group.push(element);
    grouped.set(element.tag, group);
  });

  const best = Array.from(grouped.values()).sort(
    (left, right) => right.length - left.length,
  )[0];

  if (!best) {
    return { headers: [] as string[], rows: [] as Record<string, string>[] };
  }

  const rows = best.map(xmlNodeToRow);
  const headers: string[] = [];
  rows.forEach((row) => {
    Object.keys(row).forEach((key) => {
      if (!headers.includes(key)) headers.push(key);
    });
  });

  return { headers, rows };
};

// --- lettura del file -------------------------------------------------------

const parseSpreadsheetFile = async (file: File) => {
  const { read, utils } = await import("xlsx");
  const arrayBuffer = await file.arrayBuffer();
  const workbook = read(arrayBuffer, { type: "array", raw: false });
  const firstSheetName = workbook.SheetNames[0];

  if (!firstSheetName) {
    return { headers: [] as string[], rows: [] as Record<string, any>[] };
  }

  const worksheet = workbook.Sheets[firstSheetName];
  const rows = utils.sheet_to_json<Record<string, any>>(worksheet, {
    defval: "",
  });
  const headers: string[] = [];
  rows.forEach((row) => {
    Object.keys(row).forEach((header) => {
      if (!headers.includes(header)) headers.push(header);
    });
  });

  return { headers, rows };
};

export const parseAthleteImportFile = async (
  file: File,
): Promise<ParsedAthleteImportFile> => {
  const extension = file.name.split(".").pop()?.toLowerCase() || "";

  if (extension === "csv") {
    const { headers, rows } = parseCsvText(await file.text());
    return { format: "CSV", headers, rows };
  }

  if (extension === "xls" || extension === "xlsx") {
    const { headers, rows } = await parseSpreadsheetFile(file);
    return {
      format: extension === "xls" ? "XLS" : "XLSX",
      headers,
      rows,
    };
  }

  if (extension === "xml") {
    const { headers, rows } = parseXmlText(await file.text());
    return { format: "XML", headers, rows };
  }

  throw new Error("Formato file non supportato: usa CSV, XLS, XLSX o XML");
};

// --- mappatura --------------------------------------------------------------

const scoreHeader = (header: string, candidates: string[]) => {
  if (candidates.includes(header)) return 100;
  return candidates.some((candidate) => header.includes(candidate)) ? 50 : 0;
};

export const guessAthleteImportMapping = (
  headers: string[],
): AthleteImportMapping => {
  const normalizedHeaders = headers.map((header) => ({
    original: header,
    normalized: normalizeHeader(header),
  }));

  const usedHeaders = new Set<string>();
  const mapping: AthleteImportMapping = {};

  (Object.keys(HEADER_CANDIDATES) as AthleteImportField[]).forEach((field) => {
    const bestMatch = normalizedHeaders
      .map((header) => ({
        header: header.original,
        score: scoreHeader(header.normalized, HEADER_CANDIDATES[field]),
      }))
      .filter((item) => item.score > 0 && !usedHeaders.has(item.header))
      .sort((left, right) => right.score - left.score)[0];

    if (bestMatch) {
      mapping[field] = bestMatch.header;
      usedHeaders.add(bestMatch.header);
    }
  });

  return mapping;
};

// --- normalizzazione e validazione -----------------------------------------

const excelSerialToDate = (value: number) => {
  const epoch = Date.UTC(1899, 11, 30);
  return new Date(epoch + value * 86400000).toISOString().slice(0, 10);
};

export const toIsoDate = (value: unknown) => {
  if (value === null || value === undefined || value === "") return "";

  if (typeof value === "number" && Number.isFinite(value)) {
    if (value > 20000) return excelSerialToDate(value);
    if (value >= 1900 && value <= 2100) return `${value}-01-01`;
  }

  const text = String(value).trim();
  if (!text) return "";

  if (/^\d{4}$/.test(text)) return `${text}-01-01`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return isRealCalendarDate(text) ? text : "";

  const slashMatch = text.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (slashMatch) {
    const [, day, month, year] = slashMatch;
    const iso = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
    return isRealCalendarDate(iso) ? iso : "";
  }

  // Solo formati espliciti: `new Date("12/03/2010")` interpreterebbe la data
  // all'americana e sposterebbe silenziosamente giorno e mese.
  return "";
};

const splitFullName = (value: unknown) => {
  const parts = String(value || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length === 0) return { firstName: "", lastName: "" };
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };

  // Negli export italiani il nominativo e quasi sempre "Cognome Nome":
  // l'ultima parola e il nome, il resto il cognome.
  return {
    firstName: parts[parts.length - 1],
    lastName: parts.slice(0, -1).join(" "),
  };
};

const normalizeGenderValue = (value: unknown) => {
  const text = String(value || "")
    .trim()
    .toUpperCase();
  if (!text) return "";
  if (["M", "MASCHIO", "MALE", "MASCHILE", "U", "1"].includes(text)) return "M";
  if (["F", "FEMMINA", "FEMALE", "FEMMINILE", "2"].includes(text)) return "F";
  return "";
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const identityKey = (row: { firstName: string; lastName: string; birthDate: string }) =>
  `${row.lastName}|${row.firstName}|${row.birthDate}`
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();

export type ExistingAthleteIdentity = {
  firstName?: string | null;
  lastName?: string | null;
  birthDate?: string | null;
};

/** Vero se il testo e un anno secco: `2016`, non `12/05/2016`. */
const isBareYear = (value: unknown) => /^\d{4}$/.test(String(value ?? "").trim());

export const normalizeImportedAthletes = (
  rows: Record<string, any>[],
  mapping: AthleteImportMapping,
  categories: { id: string; name: string }[],
  options: {
    existingAthletes?: ExistingAthleteIdentity[];
    /** Oggi, in forma ISO. Iniettabile perche «nel futuro» sia verificabile. */
    today?: string;
  } = {},
): NormalizedImportedAthleteRow[] => {
  const todayIso =
    String(options.today || "").slice(0, 10) ||
    new Date().toISOString().slice(0, 10);
  const existingKeys = new Set(
    (options.existingAthletes || []).map((athlete) =>
      identityKey({
        firstName: String(athlete.firstName || ""),
        lastName: String(athlete.lastName || ""),
        birthDate: String(athlete.birthDate || "").slice(0, 10),
      }),
    ),
  );
  const seenInFile = new Set<string>();

  return rows.map((row, index) => {
    const errors: string[] = [];
    const warnings: string[] = [];

    const fullNameValue = mapping.fullName ? row[mapping.fullName] : "";
    const splitName = splitFullName(fullNameValue);
    const firstName = String(
      (mapping.firstName ? row[mapping.firstName] : "") || splitName.firstName,
    ).trim();
    const lastName = String(
      (mapping.lastName ? row[mapping.lastName] : "") || splitName.lastName,
    ).trim();

    const rawBirth = mapping.birthDate
      ? row[mapping.birthDate]
      : mapping.birthYear
        ? row[mapping.birthYear]
        : "";
    const birthDate = toIsoDate(rawBirth);

    const gender = normalizeGenderValue(
      mapping.gender ? row[mapping.gender] : "",
    );
    const fiscalCode = String(mapping.fiscalCode ? row[mapping.fiscalCode] : "")
      .trim()
      .toUpperCase();
    const email = String(mapping.email ? row[mapping.email] : "").trim();
    const phone = String(mapping.phone ? row[mapping.phone] : "").trim();

    if (!firstName) errors.push("Nome mancante");
    if (!lastName) errors.push("Cognome mancante");
    if (!birthDate) {
      errors.push(
        String(rawBirth || "").trim()
          ? `Data di nascita non riconosciuta (${String(rawBirth).trim()})`
          : "Data di nascita mancante",
      );
    } else if (birthDate > todayIso) {
      /*
        Una data di nascita nel futuro non e un dato discutibile: e impossibile.
        Passava come «Pronta», e nasceva un atleta del 2030 — con l'eta, la
        categoria per anno di nascita e il codice fiscale calcolati su di essa.
      */
      errors.push(`Data di nascita nel futuro (${birthDate})`);
    } else if (Number(birthDate.slice(0, 4)) < MIN_PLAUSIBLE_BIRTH_YEAR) {
      errors.push(`Data di nascita non plausibile (${birthDate})`);
    } else if (isBareYear(rawBirth) && mapping.birthDate) {
      /*
        Nella colonna «Anno di nascita» un anno secco e il dato atteso e non si
        dice niente. Nella colonna **data** e un'informazione parziale che
        diventa il 1 gennaio: la riga si importa lo stesso — meglio un atleta
        con una data approssimata che nessun atleta — ma va detto, perche da
        quella data discendono il codice fiscale e la categoria.
      */
      warnings.push(
        `Solo l'anno (${String(rawBirth).trim()}): data impostata al 1 gennaio`,
      );
    }
    if (fiscalCode && !isWellFormedCodiceFiscale(fiscalCode)) {
      errors.push("Codice fiscale non valido");
    }
    if (email && !EMAIL_PATTERN.test(email)) {
      errors.push("Email non valida");
    }

    const rawCategory = mapping.category ? row[mapping.category] : "";
    // `resolveCategoryId` restituisce il valore grezzo quando non trova nulla:
    // qui servirebbe a poco, perche produrrebbe un id che nel club non esiste
    // e l'anteprima direbbe "collegata" per una categoria da creare.
    const resolvedCategoryId = rawCategory
      ? resolveCategoryId(rawCategory, categories)
      : null;
    const categoryId = rawCategory
      ? categories.some((category) => category.id === resolvedCategoryId)
        ? resolvedCategoryId
        : null
      : findCategoryForBirthDate(birthDate, categories as any)?.id || null;
    const categoryLabel =
      categories.find((category) => category.id === categoryId)?.name ||
      (rawCategory ? String(rawCategory).trim() : "") ||
      "";

    if (!categoryId && !categoryLabel) {
      warnings.push("Nessuna categoria: verra assegnata dopo l'import");
    } else if (!categoryId) {
      warnings.push(`La categoria "${categoryLabel}" verra creata`);
    }
    if (mapping.gender && !gender) {
      warnings.push("Sesso non riconosciuto");
    }

    if (!errors.length) {
      const key = identityKey({ firstName, lastName, birthDate });
      if (existingKeys.has(key)) {
        errors.push("Atleta gia presente nel club");
      } else if (seenInFile.has(key)) {
        errors.push("Riga duplicata nel file");
      } else {
        seenInFile.add(key);
      }
    }

    return {
      rowNumber: index + 1,
      firstName,
      lastName,
      birthDate,
      gender,
      fiscalCode,
      email,
      phone,
      categoryId,
      categoryLabel: categoryLabel || "Da assegnare",
      status: errors.length ? "error" : "ready",
      errors,
      warnings,
      raw: row,
    };
  });
};

export const summarizeImportPlan = (
  rows: NormalizedImportedAthleteRow[],
): AthleteImportSummary => ({
  total: rows.length,
  importable: rows.filter((row) => row.status === "ready").length,
  discarded: rows.filter((row) => row.status === "error").length,
  withWarnings: rows.filter(
    (row) => row.status === "ready" && row.warnings.length > 0,
  ).length,
});

/** Righe effettivamente scrivibili, nella forma attesa dal chiamante. */
export type AthleteImportPayload = {
  rowNumber: number;
  firstName: string;
  lastName: string;
  birthDate: string;
  gender: string;
  fiscalCode: string;
  email: string;
  phone: string;
  categoryId: string | null;
  categoryLabel: string;
};

export const toImportPayload = (
  rows: NormalizedImportedAthleteRow[],
): AthleteImportPayload[] =>
  rows
    .filter((row) => row.status === "ready")
    .map((row) => ({
      rowNumber: row.rowNumber,
      firstName: row.firstName,
      lastName: row.lastName,
      birthDate: row.birthDate,
      gender: row.gender,
      fiscalCode: row.fiscalCode,
      email: row.email,
      phone: row.phone,
      categoryId: row.categoryId,
      categoryLabel: row.categoryLabel === "Da assegnare" ? "" : row.categoryLabel,
    }));

export type AthleteImportOutcome = {
  imported: number;
  failed: { rowNumber: number; label: string; reason: string }[];
};
