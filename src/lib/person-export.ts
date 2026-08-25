import { formatClothingSizes } from "./clothing-sizes";
import { normalizeMemberType } from "./member-types";
import { printPeoplePdf, type PeoplePdfColumn } from "./people-pdf-export";

/**
 * Export delle anagrafiche di persona.
 *
 * L'esportazione esisteva **solo** per gli atleti. La tentazione era
 * scriverne una per gli allenatori, una per lo staff e una per i soci: tre
 * implementazioni, tre insiemi di colonne, tre modi di formattare una data
 * (Blocco 7, punto 13).
 *
 * `printPeoplePdf` non ha mai saputo niente degli atleti — prende colonne e
 * righe. Qui c'e solo la parte che cambia: quali colonne ha ciascuna entita e
 * come si legge un valore da un record che non ha schema.
 *
 * **Le colonne rispettano quelle visibili in elenco**, dove la pagina le
 * configura: chi ha nascosto una colonna non se la ritrova nel PDF.
 */

export type PersonEntity = "trainers" | "staff" | "members";

export type PersonExportColumn = PeoplePdfColumn & {
  /** Chiave del filtro «colonne visibili» della pagina, quando esiste. */
  toggleKey?: string;
};

/** Prima chiave valorizzata: i record di persona non hanno uno schema. */
const pick = (record: Record<string, any>, keys: string[]): string => {
  for (const key of keys) {
    const value = record?.[key];
    if (value !== null && value !== undefined && String(value).trim()) {
      return String(value).trim();
    }
  }
  return "";
};

const formatDate = (value?: string | null) => {
  const raw = String(value || "").trim();
  if (!raw) return "";

  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;

  return date.toLocaleDateString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
};

const STATUS_LABELS: Record<string, string> = {
  active: "Attivo",
  attivo: "Attivo",
  inactive: "Non attivo",
  suspended: "Sospeso",
};

const formatStatus = (value?: string | null) => {
  const raw = String(value || "").trim();
  if (!raw) return "";
  return STATUS_LABELS[raw.toLowerCase()] || raw;
};

const LAST_NAME_KEYS = ["surname", "lastName", "last_name"];
const FIRST_NAME_KEYS = ["name", "firstName", "first_name"];
const FULL_NAME_KEYS = ["fullName", "full_name", "name"];

const lastNameOf = (person: Record<string, any>) => {
  const explicit = pick(person, LAST_NAME_KEYS);
  if (explicit) return explicit;

  // Ripiego sui record che hanno solo il nome intero: l'ultima parola.
  const full = pick(person, FULL_NAME_KEYS);
  const parts = full.split(/\s+/).filter(Boolean);
  return parts.length > 1 ? parts[parts.length - 1] : "";
};

const firstNameOf = (person: Record<string, any>) => {
  const explicit = pick(person, FIRST_NAME_KEYS);
  const last = pick(person, LAST_NAME_KEYS);
  if (explicit && explicit !== last) return explicit;

  const full = pick(person, FULL_NAME_KEYS);
  const parts = full.split(/\s+/).filter(Boolean);
  return parts.length > 1 ? parts.slice(0, -1).join(" ") : full;
};

/** Colonne comuni a tutte le anagrafiche di persona. */
const SHARED_COLUMNS: PersonExportColumn[] = [
  { key: "lastName", label: "Cognome", toggleKey: "name" },
  { key: "firstName", label: "Nome", toggleKey: "name" },
  { key: "email", label: "Email", toggleKey: "email" },
  { key: "phone", label: "Telefono", toggleKey: "phone" },
  { key: "fiscalCode", label: "Codice fiscale" },
  { key: "clothingSizes", label: "Taglie" },
];

const ENTITY_COLUMNS: Record<PersonEntity, PersonExportColumn[]> = {
  trainers: [
    { key: "categories", label: "Categorie" },
    { key: "startDate", label: "Data di inizio" },
    { key: "membershipNumber", label: "N. tessera" },
    { key: "status", label: "Stato", toggleKey: "status" },
  ],
  staff: [
    { key: "role", label: "Ruolo", toggleKey: "role" },
    { key: "department", label: "Reparto", toggleKey: "department" },
    { key: "hireDate", label: "Data assunzione", toggleKey: "hireDate" },
    { key: "status", label: "Stato", toggleKey: "status" },
  ],
  members: [
    { key: "type", label: "Tipo socio" },
    { key: "membershipNumber", label: "N. tessera" },
    { key: "membershipDate", label: "Data iscrizione", toggleKey: "membershipDate" },
    { key: "status", label: "Stato", toggleKey: "status" },
  ],
};

const ENTITY_TITLES: Record<PersonEntity, string> = {
  trainers: "Elenco Allenatori",
  staff: "Elenco Staff",
  members: "Elenco Soci",
};

const ENTITY_NOUNS: Record<PersonEntity, string> = {
  trainers: "allenatori",
  staff: "membri dello staff",
  members: "soci",
};

/**
 * Le colonne dell'export, filtrate da quelle visibili in elenco.
 *
 * Una colonna senza `toggleKey` e sempre presente: sono i dati che in tabella
 * non ci stanno (codice fiscale, taglie) ma che in un PDF servono.
 */
export const personExportColumns = (
  entity: PersonEntity,
  visibleColumns?: Record<string, boolean> | null,
): PeoplePdfColumn[] =>
  [...SHARED_COLUMNS, ...ENTITY_COLUMNS[entity]]
    .filter(
      (column) =>
        !column.toggleKey ||
        !visibleColumns ||
        visibleColumns[column.toggleKey] !== false,
    )
    .map(({ key, label }) => ({ key, label }));

/** Il valore di una colonna per una persona. */
export const personExportValue = (
  person: Record<string, any>,
  key: string,
): string => {
  switch (key) {
    case "lastName":
      return lastNameOf(person);
    case "firstName":
      return firstNameOf(person);
    case "email":
      return pick(person, ["email"]);
    case "phone":
      return pick(person, ["phone", "mobile", "telefono"]);
    case "fiscalCode":
      return pick(person, ["fiscalCode", "fiscal_code", "codiceFiscale"]);
    case "clothingSizes":
      return formatClothingSizes(person?.clothingSizes);
    case "role":
      return pick(person, ["role", "ruolo"]);
    case "department":
      return pick(person, ["department", "reparto"]);
    case "type":
      return normalizeMemberType(pick(person, ["type"]));
    case "membershipNumber":
      return pick(person, ["membershipNumber", "membership_number", "tessera"]);
    case "membershipDate":
      return formatDate(
        pick(person, ["membershipDate", "registrationDate", "membership_date"]),
      );
    case "hireDate":
      return formatDate(pick(person, ["hireDate", "hire_date", "startDate"]));
    case "startDate":
      return formatDate(pick(person, ["startDate", "hireDate", "hire_date"]));
    case "status":
      return formatStatus(pick(person, ["status"]));
    case "categories": {
      const categories = person?.categories;
      if (!Array.isArray(categories)) return "";
      return categories
        .map((category: any) =>
          typeof category === "string" ? category : category?.name || "",
        )
        .filter(Boolean)
        .join(", ");
    }
    default:
      return "";
  }
};

export type PersonExportResult =
  | { ok: true; count: number }
  | { ok: false; reason: "empty" | "popup" };

/**
 * Genera il PDF di un elenco di persone.
 *
 * Torna la ragione del fallimento invece di un booleano: «nessuno da
 * esportare» e «il browser ha bloccato la finestra» sono due messaggi diversi
 * per chi guarda.
 */
export const exportPeoplePdf = ({
  entity,
  people,
  clubName,
  visibleColumns,
  scopeLabel,
}: {
  entity: PersonEntity;
  people: Record<string, any>[];
  clubName: string;
  visibleColumns?: Record<string, boolean> | null;
  scopeLabel?: string;
}): PersonExportResult => {
  if (!people.length) {
    return { ok: false, reason: "empty" };
  }

  const columns = personExportColumns(entity, visibleColumns);

  const success = printPeoplePdf({
    clubName: clubName || "EasyGame",
    title: ENTITY_TITLES[entity],
    columns,
    rows: people.map((person, index) => ({
      id: String(person?.id || index),
      values: Object.fromEntries(
        columns.map((column) => [
          column.key,
          personExportValue(person, column.key),
        ]),
      ),
    })),
    scopeLabel:
      scopeLabel || `${people.length} ${ENTITY_NOUNS[entity]} in elenco`,
  });

  return success ? { ok: true, count: people.length } : { ok: false, reason: "popup" };
};
