import { formatClothingSizes } from "./clothing-sizes";
import { csvFileName, downloadCsv, toCsv } from "./csv";
import { describeSelection, type SelectionScope } from "./list-selection";
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
/**
 * `name` sta **per ultimo**, e non e un dettaglio d'ordine.
 *
 * Sugli atleti `name` e il nome di battesimo e `surname` il cognome. Su
 * allenatori e soci `name` e il nome **intero**, in due ordini diversi:
 * «Anna Rossi Uat» sull'uno, «Della Valle Uat Chiara» sull'altro. Leggendolo
 * per primo la colonna «Nome» del PDF riceveva il nome intero e la colonna
 * «Cognome» l'ultima parola — cioe «Uat» al posto di «Rossi Uat».
 */
const FIRST_NAME_KEYS = ["firstName", "first_name", "name"];
const FULL_NAME_KEYS = ["fullName", "full_name", "name"];

const lastNameOf = (person: Record<string, any>) => {
  const explicit = pick(person, LAST_NAME_KEYS);
  if (explicit) return explicit;

  // Ripiego sui record che hanno solo il nome intero: l'ultima parola.
  const full = pick(person, FULL_NAME_KEYS);
  const parts = full.split(/\s+/).filter(Boolean);
  return parts.length > 1 ? parts[parts.length - 1] : "";
};

/**
 * Toglie il cognome da un valore che potrebbe essere il nome intero.
 *
 * Il cognome sta in testa o in coda a seconda di come l'elenco compone
 * l'etichetta, e puo essere di piu parole: si confronta il cognome per
 * intero, non si contano gli spazi.
 */
const withoutLastName = (value: string, lastName: string) => {
  if (!value || !lastName || value === lastName) return value;

  const lower = value.toLowerCase();
  const last = lastName.toLowerCase();

  if (lower.startsWith(`${last} `)) return value.slice(lastName.length).trim();
  if (lower.endsWith(` ${last}`)) {
    return value.slice(0, value.length - lastName.length).trim();
  }

  return value;
};

const firstNameOf = (person: Record<string, any>) => {
  const last = lastNameOf(person);

  const explicit = withoutLastName(pick(person, FIRST_NAME_KEYS), last);
  if (explicit && explicit !== last) return explicit;

  const full = pick(person, FULL_NAME_KEYS);
  const stripped = withoutLastName(full, last);
  if (stripped && stripped !== last) return stripped;

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
  /*
    I soci portano anche il **libro** (Wave 4, §19): lo stato derivato dagli
    eventi, la data di ammissione, e la cessazione con il suo motivo. Non sono
    campi dell'anagrafica — arrivano dal registro — e senza di loro un elenco
    stampato non direbbe ne da quando ne perche una persona e uscita, che e
    l'unica cosa che a un elenco di soci viene chiesta.
  */
  members: [
    { key: "type", label: "Tipo socio" },
    { key: "membershipNumber", label: "N. tessera" },
    { key: "membershipDate", label: "Data iscrizione", toggleKey: "membershipDate" },
    { key: "membershipStatus", label: "Stato nel libro", toggleKey: "status" },
    { key: "admissionDate", label: "Data ammissione" },
    { key: "cessationDate", label: "Data cessazione" },
    { key: "cessationReason", label: "Motivo cessazione" },
    { key: "status", label: "Stato scheda", toggleKey: "status" },
  ],
};

const ENTITY_TITLES: Record<PersonEntity, string> = {
  trainers: "Elenco Allenatori",
  staff: "Elenco Staff",
  members: "Elenco Soci",
};

/** Singolare e plurale: un PDF che dice «1 allenatori» si e scritto da solo. */
const ENTITY_NOUNS: Record<PersonEntity, { one: string; many: string }> = {
  trainers: { one: "allenatore", many: "allenatori" },
  staff: { one: "membro dello staff", many: "membri dello staff" },
  members: { one: "socio", many: "soci" },
};

/** L'intestazione del riquadro con il conteggio, in cima al PDF. */
const ENTITY_COUNT_LABELS: Record<PersonEntity, string> = {
  trainers: "Allenatori esportati",
  staff: "Membri dello staff esportati",
  members: "Soci esportati",
};

/**
 * Cosa dice il PDF di se stesso, in una riga.
 *
 * **Sta qui e non nelle pagine.** Le tre schermate scrivevano tre volte la
 * stessa frase a mano, e tre volte con il plurale fisso: «1 allenatori
 * selezionati» accanto a una barra che diceva correttamente «1 allenatore
 * selezionato». Nei Soci il ramo del risultato filtrato mancava del tutto e
 * un export filtrato si dichiarava «in elenco».
 */
export const personExportScopeLabel = (
  entity: PersonEntity,
  scope: SelectionScope,
  count: number,
) => {
  const nouns = ENTITY_NOUNS[entity];

  if (scope === "selected") return describeSelection(count, nouns);

  const noun = count === 1 ? nouns.one : nouns.many;
  return scope === "filtered"
    ? `${count} ${noun} nel risultato filtrato`
    : `${count} ${noun} in elenco`;
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
    /*
      Lo stato del libro non passa da `formatStatus`: quelle etichette
      traducono il flag dell'anagrafica («active» → «Attivo»), mentre qui la
      frase arriva gia scritta dalla derivazione — ed e la stessa che la
      schermata mostra, apposta.
    */
    case "membershipStatus":
      return pick(person, ["membershipStatus", "membership_status"]);
    case "admissionDate":
      return formatDate(pick(person, ["admissionDate", "admission_date"]));
    case "cessationDate":
      return formatDate(pick(person, ["cessationDate", "cessation_date"]));
    case "cessationReason":
      return pick(person, ["cessationReason", "cessation_reason"]);
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
  scope,
}: {
  entity: PersonEntity;
  people: Record<string, any>[];
  clubName: string;
  visibleColumns?: Record<string, boolean> | null;
  /** L'ambito su cui la pagina ha risolto le righe, non la frase da stampare. */
  scope: SelectionScope;
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
    scopeLabel: personExportScopeLabel(entity, scope, people.length),
    countLabel: ENTITY_COUNT_LABELS[entity],
  });

  return success ? { ok: true, count: people.length } : { ok: false, reason: "popup" };
};

/**
 * Lo **stesso** elenco, in un file che si apre con un foglio di calcolo.
 *
 * Non e un secondo export: colonne (`personExportColumns`) e valori
 * (`personExportValue`) sono quelli del PDF, e a parita di colonne visibili i
 * due file dicono esattamente la stessa cosa. Cambia solo il tracciato, che
 * appartiene a `src/lib/csv.ts`.
 *
 * `clubName` e `scope` sono accettati per simmetria con il PDF ma non entrano
 * nel file: una riga di intestazione «12 allenatori selezionati» sopra i nomi
 * delle colonne renderebbe il CSV illeggibile a un foglio di calcolo, che si
 * aspetta le intestazioni alla prima riga. L'ambito lo ha gia scelto chi
 * esporta, e il contenuto del file lo dimostra.
 */
export const exportPeopleCsv = ({
  entity,
  people,
  visibleColumns,
}: {
  entity: PersonEntity;
  people: Record<string, any>[];
  clubName?: string;
  visibleColumns?: Record<string, boolean> | null;
  scope?: SelectionScope;
}): PersonExportResult => {
  if (!people.length) {
    return { ok: false, reason: "empty" };
  }

  const columns = personExportColumns(entity, visibleColumns);

  const rows = people.map((person) =>
    Object.fromEntries(
      columns.map((column) => [column.key, personExportValue(person, column.key)]),
    ),
  );

  downloadCsv(csvFileName(ENTITY_TITLES[entity]), toCsv(columns, rows));

  return { ok: true, count: people.length };
};
