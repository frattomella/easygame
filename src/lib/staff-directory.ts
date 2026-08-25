/**
 * Reparti e ruoli dello staff: modello unico.
 *
 * **Il difetto che questo modulo chiude** (Blocco 7, punto 3). I reparti
 * avevano due fonti che non si parlavano:
 *
 * - `clubs.settings.staffDepartments`, l'archivio vero, scritto **solo** dalla
 *   dialog «Gestione reparti» dell'elenco staff;
 * - i reparti *dedotti* dai membri, che l'elenco staff fondeva a video.
 *
 * Un reparto creato con «Altro» durante la creazione di un membro finiva solo
 * sul membro. L'elenco staff lo mostrava lo stesso — perche lo deduceva — e
 * sembrava quindi salvato; ma il form di creazione e quello di modifica
 * leggevano solo `settings.staffDepartments`, dove non c'era. Da qui
 * «compare nell'archivio ma non nelle select successive».
 *
 * La fonte ora e una sola: `settings.staffDepartments`. La deduzione dai
 * membri resta, ma come **recupero** dei reparti orfani gia in archivio, non
 * come secondo canale di creazione: chi salva un membro con un reparto nuovo
 * lo persiste (vedi `src/lib/api/staff-departments.ts`).
 */

import { stripDiacritics } from "./italian-registry";

export type StaffDepartment = {
  id: string;
  name: string;
  description?: string;
  color?: string;
};

/** I colori disponibili per una targhetta di reparto. */
export const STAFF_DEPARTMENT_COLORS = [
  { name: "blue", swatch: "bg-blue-500" },
  { name: "green", swatch: "bg-green-500" },
  { name: "red", swatch: "bg-red-500" },
  { name: "yellow", swatch: "bg-yellow-500" },
  { name: "purple", swatch: "bg-purple-500" },
] as const;

const DEPARTMENT_BADGE_CLASSES: Record<string, string> = {
  blue: "border-blue-200 bg-blue-50 text-blue-700",
  green: "border-green-200 bg-green-50 text-green-700",
  red: "border-red-200 bg-red-50 text-red-700",
  yellow: "border-yellow-200 bg-yellow-50 text-yellow-700",
  purple: "border-purple-200 bg-purple-50 text-purple-700",
};

const NEUTRAL_BADGE = "border-slate-200 bg-slate-50 text-slate-700";

export const getDepartmentBadgeClassName = (
  department?: { color?: string } | null,
) =>
  (department?.color && DEPARTMENT_BADGE_CLASSES[department.color]) ||
  NEUTRAL_BADGE;

export const DEFAULT_DEPARTMENT_COLOR = "blue";

/**
 * Ruoli predefiniti dello staff.
 *
 * `Dirigente`, `Presidente` e `Vicepresidente` aggiunti nel Blocco 7: sono le
 * cariche che ogni ASD ha davvero e che finora si scrivevano a mano tramite
 * «Altro», ciascuna con la propria ortografia.
 *
 * L'elenco non e chiuso: «Altro» resta e chi lo usa scrive il ruolo che vuole.
 */
export const STAFF_ROLES = [
  "Presidente",
  "Vicepresidente",
  "Dirigente",
  "Segretario/a",
  "Amministratore",
  "Responsabile Tecnico",
  "Medico Sportivo",
  "Fisioterapista",
  "Preparatore Atletico",
  "Team Manager",
  "Addetto Stampa",
  "Responsabile Marketing",
  "Magazziniere",
  "Custode",
] as const;

/** Valore della voce «Altro» nelle select: non e un ruolo, e un comando. */
export const CUSTOM_OPTION_VALUE = "__custom__";

export const normalizeDepartmentName = (value?: string | null) =>
  String(value || "").trim();

const slugify = (value: string) =>
  stripDiacritics(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

/**
 * L'id di un reparto e derivato dal nome.
 *
 * Serve a rendere idempotente la creazione: due schermate che salvano lo
 * stesso reparto nello stesso istante producono lo stesso id, invece di due
 * righe con `dept-${Date.now()}` diversi e lo stesso nome.
 */
export const makeDepartmentId = (name: string) =>
  `dept-${slugify(name) || "senza-nome"}`;

export const makeDepartmentFromName = (
  name: string,
  color = DEFAULT_DEPARTMENT_COLOR,
): StaffDepartment => ({
  id: makeDepartmentId(name),
  name: normalizeDepartmentName(name),
  color,
});

const byName = (left: { name: string }, right: { name: string }) =>
  left.name.localeCompare(right.name, "it", { sensitivity: "base" });

/** I reparti salvati, letti da `clubs.settings`. Mai `undefined`. */
export const readStaffDepartments = (
  settings?: Record<string, any> | null,
): StaffDepartment[] => {
  const raw = settings?.staffDepartments;
  if (!Array.isArray(raw)) return [];

  return raw
    .map((entry) => ({
      ...entry,
      id: String(entry?.id || makeDepartmentId(String(entry?.name || ""))),
      name: normalizeDepartmentName(entry?.name),
    }))
    .filter((department) => department.name)
    .sort(byName);
};

/**
 * Reparti salvati piu quelli che compaiono solo sui membri.
 *
 * Non e un secondo canale di creazione: e il recupero dei reparti orfani
 * lasciati in archivio dal difetto che questo modulo chiude. Un reparto
 * dedotto e indistinguibile da uno salvato per chi guarda, e appena qualcuno
 * risalva quel membro diventa salvato davvero.
 */
export const mergeStaffDepartments = (
  saved: StaffDepartment[],
  members: Array<{ department?: string | null }> = [],
): StaffDepartment[] => {
  const byKey = new Map<string, StaffDepartment>();

  for (const department of saved) {
    const name = normalizeDepartmentName(department.name);
    if (name) byKey.set(name.toLowerCase(), { ...department, name });
  }

  for (const member of members) {
    const name = normalizeDepartmentName(member?.department);
    if (name && !byKey.has(name.toLowerCase())) {
      byKey.set(name.toLowerCase(), makeDepartmentFromName(name));
    }
  }

  return Array.from(byKey.values()).sort(byName);
};

/** Inserisce o sostituisce un reparto, confrontando per nome. */
export const upsertStaffDepartment = (
  departments: StaffDepartment[],
  department: StaffDepartment,
): StaffDepartment[] => {
  const name = normalizeDepartmentName(department.name);
  if (!name) return departments;

  const next = departments.filter(
    (item) =>
      item.id !== department.id &&
      normalizeDepartmentName(item.name).toLowerCase() !== name.toLowerCase(),
  );

  return [...next, { ...department, name }].sort(byName);
};

export const removeStaffDepartment = (
  departments: StaffDepartment[],
  departmentId: string,
): StaffDepartment[] =>
  departments.filter((department) => department.id !== departmentId);

export const findStaffDepartment = (
  departments: StaffDepartment[],
  name?: string | null,
): StaffDepartment | null => {
  const key = normalizeDepartmentName(name).toLowerCase();
  if (!key) return null;
  return (
    departments.find(
      (department) =>
        normalizeDepartmentName(department.name).toLowerCase() === key,
    ) || null
  );
};

/**
 * I ruoli da mostrare in una select: i predefiniti piu quelli davvero usati.
 *
 * Un ruolo scritto a mano su un membro esistente deve ricomparire nella
 * tendina, altrimenti riaprire quella scheda e salvarla lo cancellerebbe.
 */
export const collectStaffRoles = (
  members: Array<{ role?: string | null }> = [],
): string[] => {
  const seen = new Map<string, string>();

  for (const role of STAFF_ROLES) seen.set(role.toLowerCase(), role);

  for (const member of members) {
    const role = String(member?.role || "").trim();
    if (role && !seen.has(role.toLowerCase())) {
      seen.set(role.toLowerCase(), role);
    }
  }

  return Array.from(seen.values());
};

/** Quanti membri per reparto, chiave in minuscolo. */
export const countStaffByDepartment = (
  members: Array<{ department?: string | null }> = [],
): Record<string, number> => {
  const counts: Record<string, number> = {};

  for (const member of members) {
    const key = normalizeDepartmentName(member?.department).toLowerCase();
    if (key) counts[key] = (counts[key] || 0) + 1;
  }

  return counts;
};
