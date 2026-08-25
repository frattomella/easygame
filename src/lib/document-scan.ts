export type DocumentScanResult = {
  rawText: string;
  documentType?: string;
  documentNumber?: string;
  name?: string;
  surname?: string;
  birthDate?: string;
  birthPlace?: string;
  documentIssue?: string;
  documentExpiry?: string;
  fiscalCode?: string;
  nationality?: string;
};

const DATE_PATTERN = /\b(\d{2})[\/.\-](\d{2})[\/.\-](\d{2,4})\b/g;

const normalizeWhitespace = (value: string) =>
  value
    .replace(/\r/g, "")
    .replace(/[|]/g, "I")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[^\S\n]+/g, " ")
    .trim();

const normalizeLines = (value: string) =>
  normalizeWhitespace(value)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

const toUpperLines = (lines: string[]) => lines.map((line) => line.toUpperCase());

const titleCase = (value?: string) =>
  String(value || "")
    .toLowerCase()
    .split(" ")
    .filter(Boolean)
    .map((part) =>
      part
        .split("'")
        .map((token) =>
          token ? token.charAt(0).toUpperCase() + token.slice(1) : token,
        )
        .join("'"),
    )
    .join(" ")
    .trim();

const normalizeDateValue = (value?: string) => {
  if (!value) {
    return "";
  }

  const match = value.match(/\b(\d{2})[\/.\-](\d{2})[\/.\-](\d{2,4})\b/);
  if (!match) {
    return "";
  }

  const [, day, month, yearRaw] = match;
  const year =
    yearRaw.length === 2
      ? Number(yearRaw) > 40
        ? `19${yearRaw}`
        : `20${yearRaw}`
      : yearRaw;

  return `${year}-${month}-${day}`;
};

const sanitizeDocumentNumber = (value?: string) => {
  if (!value) {
    return "";
  }

  const cleaned = value
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .trim();

  if (cleaned.length < 5) {
    return "";
  }

  return cleaned;
};

/**
 * L'etichetta deve cominciare una parola.
 *
 * Senza questo controllo `NOME` combaciava dentro `COGNOME`: su una carta
 * d'identita vera, dove la riga e `COGNOME/SURNAME`, il **nome** veniva letto
 * come «Surname» e finiva proposto all'operatore (Blocco 7). Il cognome
 * invece si leggeva bene, perche `COGNOME` una parola la comincia davvero.
 */
const startsWord = (line: string, position: number) =>
  position === 0 || !/[A-Z]/.test(line[position - 1]);

/**
 * Le parole che su un documento sono **etichette**, non valori.
 *
 * Servono a chiudere definitivamente il difetto che il Blocco 7 aveva chiuso
 * solo a meta. La correzione di allora rendeva `COGNOME/SURNAME` leggibile,
 * ma bastava che l'OCR restituisse la stessa riga in una delle sue altre
 * forme reali perche tornasse a proporre un'etichetta come valore:
 *
 *   `COGNOME / SURNAME`   → cognome letto: «Surname»
 *   `NOME/GIVEN NAMES`    → nome letto: «S»
 *
 * Il secondo e il piu insidioso, perche non sembra un errore: e il resto di
 * `GIVEN NAME` dopo che l'etichetta e stata tolta.
 *
 * Con un elenco di parole-etichetta il problema smette di essere un caso
 * particolare: dopo un'etichetta si continuano a consumare tutte le parole
 * che sono a loro volta etichette, in qualunque lingua e con qualunque
 * separatore, e quello che resta e il valore.
 */
const LABEL_WORDS = new Set([
  "APELLIDO",
  "APELLIDOS",
  "BIRTH",
  "CITTADINANZA",
  "COGNOME",
  "COGNOMI",
  "DATA",
  "DATE",
  "DI",
  "E",
  "FAMILY",
  "FIRST",
  "GIVEN",
  "LAST",
  "LUOGO",
  "NAME",
  "NAMES",
  "NASCITA",
  "NATIONALITY",
  "NAZIONALITA",
  "NOM",
  "NOMBRE",
  "NOME",
  "NOMI",
  "OF",
  "PLACE",
  "PRENOM",
  "PRENOMS",
  "SURNAME",
]);

/** Separatori che un documento mette fra due etichette della stessa riga. */
const LABEL_SEPARATOR = /^[\s:\-/.]+/;

/**
 * Consuma le etichette che seguono quella gia riconosciuta.
 *
 * `COGNOME / SURNAME ROSSI` → `ROSSI`; `NOME/GIVEN NAMES` → stringa vuota,
 * e allora si guarda la riga dopo, che e dove il valore sta davvero.
 */
const stripTrailingLabels = (value: string): string => {
  let rest = value;

  for (;;) {
    const withoutSeparator = rest.replace(LABEL_SEPARATOR, "");
    const match = /^([A-Za-zÀ-ÿ]+)/.exec(withoutSeparator);

    if (!match || !LABEL_WORDS.has(match[1].toUpperCase())) {
      return withoutSeparator.trim();
    }

    rest = withoutSeparator.slice(match[1].length);
  }
};

const extractValueNearLabels = (lines: string[], labels: string[]) => {
  const upperLines = toUpperLines(lines);
  const normalizedLabels = labels.map((label) => label.toUpperCase());

  for (let index = 0; index < upperLines.length; index += 1) {
    const upperLine = upperLines[index];
    const originalLine = lines[index];

    for (const label of normalizedLabels) {
      let position = upperLine.indexOf(label);
      while (position !== -1 && !startsWord(upperLine, position)) {
        position = upperLine.indexOf(label, position + 1);
      }

      if (position === -1) {
        continue;
      }

      const afterLabel = stripTrailingLabels(
        originalLine.slice(position + label.length),
      );

      if (afterLabel) {
        return afterLabel;
      }

      const nextLine = lines[index + 1]?.trim();
      if (nextLine) {
        return nextLine;
      }
    }
  }

  return "";
};

const extractDateNearLabels = (lines: string[], labels: string[]) => {
  const directValue = extractValueNearLabels(lines, labels);
  return normalizeDateValue(directValue);
};

const detectDocumentType = (text: string) => {
  const upper = text.toUpperCase();

  if (upper.includes("CARTA D'IDENTITA") || upper.includes("CARTA DI IDENTITA")) {
    return "Carta d'identita";
  }

  if (upper.includes("PATENTE DI GUIDA") || upper.includes("PATENTE")) {
    return "Patente";
  }

  if (upper.includes("PASSAPORTO")) {
    return "Passaporto";
  }

  if (upper.includes("PERMESSO DI SOGGIORNO")) {
    return "Permesso di soggiorno";
  }

  return "";
};

const extractFiscalCode = (text: string) => {
  const match = text
    .toUpperCase()
    .match(/\b[A-Z]{6}[0-9]{2}[A-Z][0-9]{2}[A-Z][0-9]{3}[A-Z]\b/);

  return match?.[0] || "";
};

const extractDocumentNumber = (lines: string[], text: string) => {
  const labeledValue = sanitizeDocumentNumber(
    extractValueNearLabels(lines, [
      "NUMERO DOCUMENTO",
      "N. DOCUMENTO",
      "N DOCUMENTO",
      "DOCUMENT NUMBER",
      "NO. DOCUMENT",
      "NUMERO",
    ]),
  );

  if (labeledValue) {
    return labeledValue;
  }

  const upperText = text.toUpperCase();
  const candidates = upperText.match(/\b[A-Z0-9]{6,12}\b/g) || [];
  const ignored = new Set(["REPUBBLICA", "ITALIANA", "IDENTITA", "DOCUMENTO"]);

  return (
    candidates.find((candidate) => {
      if (ignored.has(candidate)) {
        return false;
      }

      return /[A-Z]/.test(candidate) && /[0-9]/.test(candidate);
    }) || ""
  );
};

/**
 * La zona a lettura ottica, in fondo a ogni documento di viaggio.
 *
 * **Perche vale la pena leggerla.** Il resto del documento e grafica: font
 * diversi, sfondi di sicurezza, etichette in due lingue, e l'OCR ci sbaglia.
 * La MRZ e stata progettata per essere letta da una macchina — caratteri
 * monospaziati, un solo alfabeto, posizioni fisse. Quando c'e, e la fonte piu
 * attendibile che il documento offre, ed e proprio quella che finora
 * EasyGame ignorava.
 *
 * Si legge **solo il nome**, non le date: sulle date la MRZ usa `YYMMDD`
 * senza secolo, e un errore di un carattere sposta una data di nascita di
 * dieci anni senza che nulla sembri sbagliato. Le date continuano ad
 * arrivare dalle etichette, dove un errore si vede.
 *
 * Formati coperti: TD1 (carta d'identita, 3 righe da 30) e TD3 (passaporto,
 * 2 righe da 44). In entrambi la riga dei nomi e
 * `COGNOME<<NOME<SECONDO<NOME`.
 */
const MRZ_NAME_LINE = /^[A-Z0-9<]{28,50}$/;

const parseMrzNames = (
  lines: string[],
): { surname: string; name: string } | null => {
  for (const line of toUpperLines(lines)) {
    const candidate = line.replace(/\s+/g, "");
    if (!MRZ_NAME_LINE.test(candidate) || !candidate.includes("<<")) {
      continue;
    }

    // Sul TD3 la riga comincia con il tipo di documento: `P<ITA` prima del
    // cognome. Si toglie, altrimenti il cognome sarebbe `P ITAROSSI`.
    const withoutPrefix = candidate.replace(/^[A-Z]{1,2}<[A-Z]{3}/, "");
    const [surnamePart, ...givenParts] = withoutPrefix.split("<<");

    const toWords = (value: string) =>
      value
        .split("<")
        .map((token) => token.trim())
        .filter(Boolean)
        .join(" ")
        .trim();

    const surname = toWords(surnamePart);
    const name = toWords(givenParts.join(" "));

    // Un cognome di una lettera o un nome vuoto vogliono dire che la riga non
    // era una MRZ: meglio non proporre niente che proporre un frammento.
    if (surname.length >= 2 && name.length >= 2) {
      return { surname: titleCase(surname), name: titleCase(name) };
    }
  }

  return null;
};

const extractFreeDateCandidates = (text: string) =>
  Array.from(text.matchAll(DATE_PATTERN))
    .map((match) => normalizeDateValue(match[0]))
    .filter(Boolean);

export const parseScannedDocument = (rawText: string): DocumentScanResult => {
  const lines = normalizeLines(rawText);
  const mergedText = lines.join("\n");
  const upperText = mergedText.toUpperCase();

  /*
    La MRZ vince sulle etichette quando c'e: e la parte del documento fatta
    apposta per essere letta da una macchina, mentre il fronte e grafica.
  */
  const mrz = parseMrzNames(lines);

  const surname =
    mrz?.surname ||
    titleCase(
      extractValueNearLabels(lines, [
        "COGNOME",
        "SURNAME",
        "FAMILY NAME",
        "NOM",
        "APELLIDOS",
      ]),
    );
  const name =
    mrz?.name ||
    titleCase(
      extractValueNearLabels(lines, [
        "NOME",
        "GIVEN NAMES",
        "GIVEN NAME",
        "FIRST NAME",
        "PRENOMS",
        "PRENOM",
        "NOMBRE",
      ]),
    );
  const birthPlace = titleCase(
    extractValueNearLabels(lines, [
      "LUOGO DI NASCITA",
      "NATO A",
      "NATA A",
      "PLACE OF BIRTH",
    ]),
  );
  const nationality = titleCase(
    extractValueNearLabels(lines, ["CITTADINANZA", "NAZIONALITA", "NATIONALITY"]),
  );

  const birthDate =
    extractDateNearLabels(lines, [
      "DATA DI NASCITA",
      "NATO IL",
      "NATA IL",
      "DATE OF BIRTH",
    ]) || extractFreeDateCandidates(mergedText)[0] || "";

  const issueDate = extractDateNearLabels(lines, [
    "RILASCIATO IL",
    "DATA DI RILASCIO",
    "DATE OF ISSUE",
    "EMISSIONE",
  ]);

  const documentExpiry = extractDateNearLabels(lines, [
    "SCADENZA",
    "VALIDA FINO AL",
    "VALID UNTIL",
    "EXPIRY",
    "EXPIRATION",
  ]);

  return {
    rawText: mergedText,
    documentType: detectDocumentType(upperText) || undefined,
    documentNumber: extractDocumentNumber(lines, mergedText) || undefined,
    name: name || undefined,
    surname: surname || undefined,
    birthDate: birthDate || undefined,
    birthPlace: birthPlace || undefined,
    documentIssue: issueDate || undefined,
    documentExpiry: documentExpiry || undefined,
    fiscalCode: extractFiscalCode(upperText) || undefined,
    nationality: nationality || undefined,
  };
};
