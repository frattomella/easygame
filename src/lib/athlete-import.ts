import { buildMembershipTargetIndex, type MembershipTargetIndex } from "@/lib/categories/placement";
import {
  buildAthleteImportPlan,
  parseBirthDate,
  splitFullName as splitFullNameShared,
  type AthleteImportField,
  type AthleteImportMapping,
  type CategoryDecision,
  type ExistingAthleteIdentity,
  type ParsedImportRow,
} from "@/lib/athletes/import/plan";

/**
 * Import anagrafiche atleti da file: **la lettura**.
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
 * Il foglio elettronico si legge **per intervallo usato**, riga per riga:
 * ogni riga porta il suo numero nel file, le righe vuote si contano e non
 * diventano candidate (`sheet_to_json` con `defval` le restituiva tutte:
 * un file da 113 atleti con 86 righe vuote in coda diventava 199 righe, e le
 * 86 vuote finivano fra gli scarti), le formule si leggono per il valore
 * memorizzato e si dichiarano, un testo che comincia come una formula resta
 * testo. Il contenuto del file e **input non fidato**: mai HTML, mai una
 * cella eseguita.
 *
 * La diagnosi riga per riga vive in `@/lib/athletes/import/plan`: un modello
 * solo per l'anteprima, il carico e i test (ADR-0195). Le funzioni
 * `normalizeImportedAthletes`, `summarizeImportPlan` e `toImportPayload`
 * restano come **vista compatibile** di quel piano per i collaudi che le
 * usano: non sono un secondo parser.
 */

export type { AthleteImportField, AthleteImportMapping, ExistingAthleteIdentity, ParsedImportRow };

export type AthleteImportFormat = "CSV" | "XLS" | "XLSX" | "XML";

/** Cosa si e trovato nel file, prima di ogni interpretazione: lo dice l'anteprima. */
export type AthleteImportFileDiagnostics = {
  sheetName: string;
  /** Righe fisiche dell'intervallo usato, intestazione compresa. */
  physicalRows: number;
  headerRow: number;
  emptyRows: number;
  candidateRows: number;
  hiddenRows: number[];
  formulaCells: number;
  formulaLikeCells: number;
  /** Righe oltre il tetto, non lette. */
  truncatedRows: number;
};

export interface ParsedAthleteImportFile {
  format: AthleteImportFormat;
  headers: string[];
  /** Le righe candidate, per intestazione: forma compatibile. */
  rows: Record<string, any>[];
  /** Le stesse righe con il numero di riga **del file** (ADR-0195). */
  sourceRows: ParsedImportRow[];
  diagnostics: AthleteImportFileDiagnostics;
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
  /** La sede della squadra riconosciuta («Pulcini · S. Cosma»), o vuota (ADR-0194 §17). */
  siteId: string;
  status: ImportRowStatus;
  /** Impediscono l'import della riga. */
  errors: string[];
  /** La riga si importa lo stesso, ma con un dato in meno o dedotto. */
  warnings: string[];
  raw: Record<string, any>;
}

/** Tetti di lettura: un file oltre questi limiti non e un export anagrafico. */
export const ATHLETE_IMPORT_LIMITS = {
  maxFileBytes: 10 * 1024 * 1024,
  maxRows: 5000,
  maxColumns: 64,
} as const;

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

const splitCsvRecordsKeepingEmpty = (text: string, delimiter: string) => {
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

  return records;
};

const splitCsvRecords = (text: string, delimiter: string) =>
  splitCsvRecordsKeepingEmpty(text, delimiter).filter((row) => row.some((cell) => cell.trim() !== ""));

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

/**
 * Come `parseCsvText`, con il numero di riga **del file** per ogni record
 * (l'intestazione e la riga 1) e le righe vuote contate invece che perse.
 */
export const parseCsvTextWithRows = (rawText: string) => {
  const text = rawText.replace(/^\uFEFF/, "");
  const delimiter = detectCsvDelimiter(text);
  const lines = text.split("\n");
  const records = splitCsvRecordsKeepingEmpty(text, delimiter);
  const nonEmpty = records.map((record, index) => ({ record, lineNumber: index + 1 })).filter(({ record }) => record.some((cell) => cell.trim() !== ""));
  if (!nonEmpty.length) {
    return { headers: [] as string[], sourceRows: [] as ParsedImportRow[], emptyRows: records.length, headerRow: 0, physicalRows: lines.length };
  }
  const [head, ...body] = nonEmpty;
  const headers = head.record.map((header, index) => header.trim() || `Colonna ${index + 1}`);
  const sourceRows = body.map(({ record, lineNumber }) => {
    const values: Record<string, string> = {};
    headers.forEach((header, index) => {
      values[header] = (record[index] ?? "").trim();
    });
    return { sourceRowNumber: lineNumber, values };
  });
  return { headers, sourceRows, emptyRows: records.length - nonEmpty.length, headerRow: head.lineNumber, physicalRows: records.length };
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

const ZIP_MAGIC = [0x50, 0x4b];
const OLE_MAGIC = [0xd0, 0xcf, 0x11, 0xe0];

const startsWithBytes = (bytes: Uint8Array, magic: number[]) => magic.every((value, index) => bytes[index] === value);

const cellText = (cell: any) => {
  if (!cell) return "";
  if (cell.t === "d" && cell.v instanceof Date) return cell.v.toISOString().slice(0, 10);
  if (cell.t === "e") return "";
  const formatted = typeof cell.w === "string" ? cell.w : "";
  const raw = cell.v === null || cell.v === undefined ? "" : String(cell.v);
  return (formatted || raw).trim();
};

/**
 * Il foglio, riga per riga dentro l'intervallo usato: l'intestazione e la
 * prima riga non vuota, ogni riga candidata porta il suo numero nel file,
 * le vuote si contano. Le celle si leggono come **testo** — il valore
 * formattato che Excel mostra — e una formula vale per il suo risultato
 * memorizzato, che si dichiara.
 */
const parseSpreadsheetFile = async (file: File) => {
  const { read, utils } = await import("xlsx");
  const arrayBuffer = await file.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer.slice(0, 8));
  if (!startsWithBytes(bytes, ZIP_MAGIC) && !startsWithBytes(bytes, OLE_MAGIC)) {
    throw new Error("Il file non e un foglio Excel: il contenuto non corrisponde all'estensione");
  }
  const workbook = read(arrayBuffer, { type: "array", raw: false, cellFormula: true, cellDates: false });
  return readWorkbook(workbook, utils);
};

export const readWorkbook = (workbook: any, utils: any) => {
  const vuoto = {
    headers: [] as string[],
    sourceRows: [] as ParsedImportRow[],
    diagnostics: { sheetName: "", physicalRows: 0, headerRow: 0, emptyRows: 0, candidateRows: 0, hiddenRows: [], formulaCells: 0, formulaLikeCells: 0, truncatedRows: 0 } as AthleteImportFileDiagnostics,
  };
  const sheetName = workbook.SheetNames?.[0];
  if (!sheetName) return vuoto;
  const worksheet = workbook.Sheets[sheetName];
  if (!worksheet?.["!ref"]) return { ...vuoto, diagnostics: { ...vuoto.diagnostics, sheetName } };

  const range = utils.decode_range(worksheet["!ref"]);
  const lastColumn = Math.min(range.e.c, range.s.c + ATHLETE_IMPORT_LIMITS.maxColumns - 1);
  const hiddenRows = ((worksheet["!rows"] || []) as any[])
    .map((row, index) => (row && row.hidden ? index + 1 : 0))
    .filter(Boolean);

  let formulaCells = 0;
  let formulaLikeCells = 0;
  const readRow = (r: number) => {
    const cells: string[] = [];
    const formulas: string[] = [];
    for (let c = range.s.c; c <= lastColumn; c += 1) {
      const address = utils.encode_cell({ r, c });
      const cell = worksheet[address];
      if (cell?.f) {
        formulaCells += 1;
        formulas.push(address);
      }
      const value = cellText(cell);
      if (/^[=+\-@]/.test(value)) formulaLikeCells += 1;
      cells.push(value);
    }
    return { cells, formulas, empty: cells.every((value) => value === "") };
  };

  let headerRow = 0;
  let headers: string[] = [];
  const sourceRows: ParsedImportRow[] = [];
  let emptyRows = 0;
  let truncatedRows = 0;
  for (let r = range.s.r; r <= range.e.r; r += 1) {
    const row = readRow(r);
    if (!headerRow) {
      if (row.empty) {
        emptyRows += 1;
        continue;
      }
      headerRow = r + 1;
      headers = row.cells.map((value, index) => value || `Colonna ${index + 1}`);
      continue;
    }
    if (row.empty) {
      emptyRows += 1;
      continue;
    }
    if (sourceRows.length >= ATHLETE_IMPORT_LIMITS.maxRows) {
      truncatedRows += 1;
      continue;
    }
    const values: Record<string, string> = {};
    headers.forEach((header, index) => {
      values[header] = row.cells[index] ?? "";
    });
    sourceRows.push({ sourceRowNumber: r + 1, values, ...(row.formulas.length ? { formulaCells: row.formulas } : {}) });
  }

  return {
    headers,
    sourceRows,
    diagnostics: {
      sheetName,
      physicalRows: range.e.r - range.s.r + 1,
      headerRow,
      emptyRows,
      candidateRows: sourceRows.length,
      hiddenRows,
      formulaCells,
      formulaLikeCells,
      truncatedRows,
    } as AthleteImportFileDiagnostics,
  };
};

const withDiagnostics = (
  format: AthleteImportFormat,
  headers: string[],
  sourceRows: ParsedImportRow[],
  diagnostics: Partial<AthleteImportFileDiagnostics>,
): ParsedAthleteImportFile => {
  const truncated = sourceRows.length > ATHLETE_IMPORT_LIMITS.maxRows ? sourceRows.length - ATHLETE_IMPORT_LIMITS.maxRows : 0;
  const kept = truncated ? sourceRows.slice(0, ATHLETE_IMPORT_LIMITS.maxRows) : sourceRows;
  const formulaLikeCells = kept.reduce(
    (count, row) => count + Object.values(row.values).filter((value) => /^[=+\-@]/.test(String(value))).length,
    0,
  );
  return {
    format,
    headers,
    rows: kept.map((row) => ({ ...row.values })),
    sourceRows: kept,
    diagnostics: {
      sheetName: "",
      physicalRows: kept.length + (diagnostics.emptyRows || 0) + (diagnostics.headerRow ? 1 : 0),
      headerRow: 1,
      emptyRows: 0,
      hiddenRows: [],
      formulaCells: 0,
      formulaLikeCells,
      truncatedRows: truncated,
      ...diagnostics,
      candidateRows: kept.length,
    },
  };
};

export const parseAthleteImportFile = async (
  file: File,
): Promise<ParsedAthleteImportFile> => {
  const extension = file.name.split(".").pop()?.toLowerCase() || "";
  if (file.size > ATHLETE_IMPORT_LIMITS.maxFileBytes) {
    throw new Error("Il file supera i 10 MB: un export anagrafico e molto piu piccolo");
  }

  if (extension === "csv") {
    const parsed = parseCsvTextWithRows(await file.text());
    return withDiagnostics("CSV", parsed.headers, parsed.sourceRows, { emptyRows: parsed.emptyRows, headerRow: parsed.headerRow, physicalRows: parsed.physicalRows });
  }

  if (extension === "xls" || extension === "xlsx") {
    const parsed = await parseSpreadsheetFile(file);
    return withDiagnostics(extension === "xls" ? "XLS" : "XLSX", parsed.headers, parsed.sourceRows, parsed.diagnostics);
  }

  if (extension === "xml") {
    const { headers, rows } = parseXmlText(await file.text());
    return withDiagnostics(
      "XML",
      headers,
      rows.map((values, index) => ({ sourceRowNumber: index + 1, values })),
      { headerRow: 0 },
    );
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

  /*
    **Prima le corrispondenze esatte, su tutti i campi insieme.** Campo per
    campo, «ANNO DI NASCITA» finiva sulla data di nascita — che la contiene
    («nascita», 50 punti) e viene valutata prima — invece che sull'anno di
    nascita, che la nomina per intero (100 punti): ogni riga del file vero
    riceveva l'avviso «solo l'anno» su una colonna che di anni e fatta.
  */
  const fields = Object.keys(HEADER_CANDIDATES) as AthleteImportField[];
  const candidates = fields
    .flatMap((field, fieldIndex) =>
      normalizedHeaders.map((header, headerIndex) => ({
        field,
        header: header.original,
        score: scoreHeader(header.normalized, HEADER_CANDIDATES[field]),
        fieldIndex,
        headerIndex,
      })),
    )
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score || left.fieldIndex - right.fieldIndex || left.headerIndex - right.headerIndex);

  for (const candidate of candidates) {
    if (mapping[candidate.field] || usedHeaders.has(candidate.header)) continue;
    mapping[candidate.field] = candidate.header;
    usedHeaders.add(candidate.header);
  }

  return mapping;
};

// --- normalizzazione e validazione -----------------------------------------

export const toIsoDate = (value: unknown) => parseBirthDate(value).iso;

export const splitFullName = splitFullNameShared;

/**
 * La vista compatibile del piano (ADR-0195): una riga per riga letta, con
 * `status` pronta/errore. **Non e un secondo parser**: e
 * `buildAthleteImportPlan` senza decisioni del club, in cui una categoria da
 * decidere, un duplicato da decidere e un errore sono tutti «non pronta».
 */
export const normalizeImportedAthletes = (
  rows: Record<string, any>[],
  mapping: AthleteImportMapping,
  categories: { id: string; name: string }[],
  options: {
    existingAthletes?: ExistingAthleteIdentity[];
    /** Oggi, in forma ISO. Iniettabile perche «nel futuro» sia verificabile. */
    today?: string;
    targets?: MembershipTargetIndex | null;
  } = {},
): NormalizedImportedAthleteRow[] => {
  const sourceRows: ParsedImportRow[] = rows.map((row, index) => ({
    sourceRowNumber: index + 1,
    values: Object.fromEntries(Object.entries(row || {}).map(([key, value]) => [key, value === null || value === undefined ? "" : String(value)])),
  }));
  /*
    Senza squadre in mano si lavora sui soli nomi del catalogo, come prima;
    un'etichetta che non nomina nessuna categoria si dice «verra creata» —
    la vista compatibile conserva la lettura di prima, la decisione vera la
    prende il club nel wizard.
  */
  const targets = options.targets || buildMembershipTargetIndex({ categories, groups: [], sites: [] });
  const prima = buildAthleteImportPlan({ rows: sourceRows, mapping, targets, existingAthletes: options.existingAthletes || [], today: options.today });
  const decisioni: Record<string, CategoryDecision> = {};
  for (const categoria of prima.categories) {
    if (categoria.decision) continue;
    if (!categoria.suggestion.targets.length) decisioni[categoria.key] = { kind: "create", name: categoria.label, siteId: "" };
  }
  const plan = buildAthleteImportPlan({
    rows: sourceRows,
    mapping,
    targets,
    existingAthletes: options.existingAthletes || [],
    today: options.today,
    decisions: { categories: decisioni },
  });
  return plan.rows.map((row, index) => {
    const target = row.categoryResolution.kind === "target" ? row.categoryResolution.target : null;
    const categoryId =
      target?.categoryId ||
      (row.categoryResolution.kind !== "none" && row.categoryResolution.kind !== "pending"
        ? categories.find((category) => category.name.toLowerCase() === row.normalized.categoryLabel.toLowerCase())?.id || null
        : null);
    const blocking = row.state === "error" || row.state === "duplicate_candidate";
    return {
      rowNumber: index + 1,
      firstName: row.normalized.firstName,
      lastName: row.normalized.lastName,
      birthDate: row.normalized.birthDate,
      gender: row.normalized.gender,
      fiscalCode: row.normalized.fiscalCode,
      email: row.normalized.email,
      phone: row.normalized.phone,
      categoryId,
      categoryLabel: target?.label || row.normalized.categoryLabel || "Da assegnare",
      siteId: target?.siteId || "",
      status: blocking ? "error" : "ready",
      errors: blocking ? row.issues.filter((issue) => issue.severity === "error" || issue.code === "duplicate_in_file" || issue.code === "duplicate_existing").map((issue) => issue.message) : [],
      warnings: row.issues.filter((issue) => issue.severity === "warning" && !(blocking && (issue.code === "duplicate_in_file" || issue.code === "duplicate_existing"))).map((issue) => issue.message),
      raw: rows[index],
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
  siteId: string;
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
      siteId: row.siteId,
    }));

export type AthleteImportOutcome = {
  imported: number;
  failed: { rowNumber: number; label: string; reason: string }[];
};
