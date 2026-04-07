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

const extractValueNearLabels = (lines: string[], labels: string[]) => {
  const upperLines = toUpperLines(lines);
  const normalizedLabels = labels.map((label) => label.toUpperCase());

  for (let index = 0; index < upperLines.length; index += 1) {
    const upperLine = upperLines[index];
    const originalLine = lines[index];

    for (const label of normalizedLabels) {
      const position = upperLine.indexOf(label);
      if (position === -1) {
        continue;
      }

      const afterLabel = originalLine
        .slice(position + label.length)
        .replace(/^[:\s\-/.]+/, "")
        .trim();

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

const extractFreeDateCandidates = (text: string) =>
  Array.from(text.matchAll(DATE_PATTERN))
    .map((match) => normalizeDateValue(match[0]))
    .filter(Boolean);

export const parseScannedDocument = (rawText: string): DocumentScanResult => {
  const lines = normalizeLines(rawText);
  const mergedText = lines.join("\n");
  const upperText = mergedText.toUpperCase();

  const surname = titleCase(
    extractValueNearLabels(lines, ["COGNOME/SURNAME", "COGNOME", "SURNAME"]),
  );
  const name = titleCase(
    extractValueNearLabels(lines, ["NOME/GIVEN NAME", "NOME", "GIVEN NAME"]),
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
