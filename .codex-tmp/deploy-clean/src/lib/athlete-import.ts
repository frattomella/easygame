"use client";

import { findCategoryForBirthDate, resolveCategoryId } from "@/lib/category-utils";

export type AthleteImportField =
  | "firstName"
  | "lastName"
  | "fullName"
  | "birthDate"
  | "birthYear"
  | "category";

export type AthleteImportMapping = Partial<Record<AthleteImportField, string>>;

export interface ParsedAthleteImportFile {
  format: string;
  headers: string[];
  rows: Record<string, any>[];
}

export interface NormalizedImportedAthleteRow {
  rowNumber: number;
  firstName: string;
  lastName: string;
  birthDate: string;
  categoryId: string | null;
  categoryLabel: string;
  warnings: string[];
  raw: Record<string, any>;
}

const HEADER_CANDIDATES: Record<AthleteImportField, string[]> = {
  firstName: ["nome", "firstname", "first_name", "givenname", "given_name"],
  lastName: ["cognome", "lastname", "last_name", "surname", "familyname"],
  fullName: ["nominativo", "nomecognome", "nomesocio", "athlete", "full_name", "fullname"],
  birthDate: [
    "datanascita",
    "data_di_nascita",
    "birthdate",
    "birth_date",
    "dob",
    "dateofbirth",
  ],
  birthYear: ["annonascita", "anno_di_nascita", "birthyear", "birth_year", "yearofbirth"],
  category: ["categoria", "category", "gruppo", "squadra", "team"],
};

const normalizeHeader = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "");

const excelSerialToDate = (value: number) => {
  const epoch = new Date(Date.UTC(1899, 11, 30));
  const result = new Date(epoch.getTime() + value * 86400000);
  return result.toISOString().slice(0, 10);
};

const toIsoDate = (value: unknown) => {
  if (value === null || value === undefined || value === "") {
    return "";
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    if (value > 20000) {
      return excelSerialToDate(value);
    }

    if (value >= 1900 && value <= 2100) {
      return `${value}-01-01`;
    }
  }

  const text = String(value).trim();
  if (!text) {
    return "";
  }

  if (/^\d{4}$/.test(text)) {
    return `${text}-01-01`;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return text;
  }

  const slashMatch = text.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/);
  if (slashMatch) {
    const [, day, month, year] = slashMatch;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }

  return "";
};

const splitFullName = (value: unknown) => {
  const parts = String(value || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length === 0) {
    return { firstName: "", lastName: "" };
  }

  if (parts.length === 1) {
    return { firstName: parts[0], lastName: "" };
  }

  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(" "),
  };
};

const scoreHeader = (header: string, candidates: string[]) => {
  if (candidates.includes(header)) {
    return 100;
  }

  return candidates.some((candidate) => header.includes(candidate)) ? 50 : 0;
};

const parseGenericXmlRows = (text: string) => {
  const parser = new DOMParser();
  const xml = parser.parseFromString(text, "application/xml");

  if (xml.querySelector("parsererror")) {
    throw new Error("Il file XML non e' leggibile");
  }

  const elements = Array.from(xml.getElementsByTagName("*"));
  const groupedByTag = new Map<string, Element[]>();

  elements.forEach((element) => {
    const childElements = Array.from(element.children);
    if (!childElements.length) {
      return;
    }

    const key = element.tagName;
    const current = groupedByTag.get(key) || [];
    current.push(element);
    groupedByTag.set(key, current);
  });

  const candidateGroup = Array.from(groupedByTag.values())
    .filter((group) => group.length > 1)
    .sort((left, right) => right.length - left.length)[0];

  if (!candidateGroup) {
    return [];
  }

  return candidateGroup.map((element) => {
    const row: Record<string, string> = {};

    Array.from(element.children).forEach((child) => {
      row[child.tagName] = child.textContent?.trim() || "";
    });

    return row;
  });
};

const parseSpreadsheetFile = async (file: File) => {
  const { read, utils } = await import("xlsx");
  const arrayBuffer = await file.arrayBuffer();
  const workbook = read(arrayBuffer, { type: "array", raw: false });
  const firstSheetName = workbook.SheetNames[0];

  if (!firstSheetName) {
    return { headers: [], rows: [] };
  }

  const worksheet = workbook.Sheets[firstSheetName];
  const rows = utils.sheet_to_json<Record<string, any>>(worksheet, {
    defval: "",
  });
  const headers = rows.length
    ? Array.from(
        rows.reduce((accumulator, row) => {
          Object.keys(row).forEach((header) => accumulator.add(header));
          return accumulator;
        }, new Set<string>()),
      )
    : [];

  return { headers, rows };
};

export const parseAthleteImportFile = async (
  file: File,
): Promise<ParsedAthleteImportFile> => {
  const extension = file.name.split(".").pop()?.toLowerCase() || "";

  if (["csv", "xls", "xlsx"].includes(extension)) {
    const { headers, rows } = await parseSpreadsheetFile(file);
    return { format: extension.toUpperCase(), headers, rows };
  }

  if (extension === "xml") {
    try {
      const { headers, rows } = await parseSpreadsheetFile(file);
      if (rows.length) {
        return { format: "XML", headers, rows };
      }
    } catch (error) {
      // Fallback to generic XML parser below.
    }

    const text = await file.text();
    const rows = parseGenericXmlRows(text);
    const headers = rows.length
      ? Array.from(
          rows.reduce((accumulator, row) => {
            Object.keys(row).forEach((header) => accumulator.add(header));
            return accumulator;
          }, new Set<string>()),
        )
      : [];

    return { format: "XML", headers, rows };
  }

  throw new Error("Formato file non supportato");
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

export const normalizeImportedAthletes = (
  rows: Record<string, any>[],
  mapping: AthleteImportMapping,
  categories: { id: string; name: string }[],
): NormalizedImportedAthleteRow[] =>
  rows.map((row, index) => {
    const warnings: string[] = [];
    const fullNameValue = mapping.fullName ? row[mapping.fullName] : "";
    const splitName = splitFullName(fullNameValue);
    const firstName = String(
      (mapping.firstName ? row[mapping.firstName] : "") || splitName.firstName,
    ).trim();
    const lastName = String(
      (mapping.lastName ? row[mapping.lastName] : "") || splitName.lastName,
    ).trim();
    const birthDate = toIsoDate(
      mapping.birthDate
        ? row[mapping.birthDate]
        : mapping.birthYear
          ? row[mapping.birthYear]
          : "",
    );

    if (!firstName) {
      warnings.push("Nome non rilevato");
    }

    if (!lastName) {
      warnings.push("Cognome non rilevato");
    }

    if (!birthDate) {
      warnings.push("Data di nascita non rilevata");
    }

    const rawCategory = mapping.category ? row[mapping.category] : "";
    const categoryId = rawCategory
      ? resolveCategoryId(rawCategory, categories)
      : findCategoryForBirthDate(birthDate, categories as any)?.id || null;
    const categoryLabel =
      categories.find((category) => category.id === categoryId)?.name ||
      (rawCategory ? String(rawCategory).trim() : "") ||
      "Collegamento automatico";

    return {
      rowNumber: index + 1,
      firstName,
      lastName,
      birthDate,
      categoryId,
      categoryLabel,
      warnings,
      raw: row,
    };
  });
