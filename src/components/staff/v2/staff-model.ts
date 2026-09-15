/**
 * Il modello di lettura di un membro dello staff per le pagine Web V2.
 *
 * Le tre pagine V1 (`/staff`, `/staff/new`, `/staff/[id]`) leggevano lo
 * stesso record JSON di `clubs.staff_members` con tre copie di
 * `getStaffDisplayName`/`getStaffIdentity` e tre modi di ricavare la data di
 * assunzione (`hire_date` **o** `hireDate`). Qui vive una sola lettura, senza
 * React, cosi la griglia, la scheda e il modulo dicono la stessa cosa.
 *
 * Modulo puro: niente `window`, niente fetch. Il reparto e il ruolo restano
 * in `src/lib/staff-directory.ts`; qui c'e solo cio che serve a **mostrare**.
 */

import { PERSON_STATUS, STATUS_UNKNOWN, type StatusSpec } from "@/lib/web/status";
import { daysUntil } from "@/lib/web/format";
import type { StaffDepartment } from "@/lib/staff-directory";

export type StaffMember = Record<string, any> & {
  id: string;
  name?: string;
  firstName?: string;
  surname?: string;
  lastName?: string;
  fullName?: string;
  email?: string;
  phone?: string;
  role?: string;
  department?: string;
  status?: string;
  hire_date?: string;
  hireDate?: string;
  avatar?: string | null;
};

/** Lo stato «In congedo» esiste solo per lo staff (`/staff/new`, V1). */
export const STAFF_ON_LEAVE_STATUS: StatusSpec = Object.freeze({
  label: "IN CONGEDO",
  weight: "outline",
  hue: "amber",
});

/** Le tre opzioni di stato che il modulo V1 offriva alla creazione. */
export const STAFF_STATUS_OPTIONS = [
  { value: "active", label: "Attivo" },
  { value: "inactive", label: "Inattivo" },
  { value: "on_leave", label: "In congedo" },
] as const;

export const STAFF_DOCUMENT_TYPES = [
  { value: "carta_identita", label: "Carta d'Identità" },
  { value: "patente", label: "Patente" },
  { value: "passaporto", label: "Passaporto" },
] as const;

export const staffDocumentTypeLabel = (value?: string | null) => {
  const raw = String(value || "").trim();
  if (!raw) return "";
  return STAFF_DOCUMENT_TYPES.find((t) => t.value === raw)?.label || raw;
};

/**
 * Nome, cognome e nome intero, con i ripieghi della V1 (`firstName` → `name`,
 * `surname` → `lastName`, `fullName` → composizione → `name`).
 */
export const getStaffIdentity = (member: Record<string, any> | null | undefined) => {
  const firstName = String(member?.firstName ?? member?.name ?? "").trim();
  const lastName = String(member?.surname ?? member?.lastName ?? "").trim();
  const fullName =
    String(member?.fullName ?? "").trim() ||
    [firstName, lastName].filter(Boolean).join(" ").trim() ||
    String(member?.name ?? "").trim();
  return { firstName, lastName, fullName: fullName || "Nome non disponibile" };
};

export const getStaffDisplayName = (member: Record<string, any> | null | undefined) =>
  getStaffIdentity(member).fullName;

/** La data di assunzione: la V1 la scriveva su due chiavi. */
export const staffHireDate = (member: Record<string, any> | null | undefined): string =>
  String(member?.hire_date || member?.hireDate || "").trim();

/** La pillola di stato della persona: attivo, disattivato, in congedo. */
export const staffStatusSpec = (status?: string | null): StatusSpec => {
  const key = String(status || "").trim().toLowerCase();
  if (!key) return STATUS_UNKNOWN;
  if (key === "active" || key === "attivo") return PERSON_STATUS.active;
  if (key === "inactive" || key === "inattivo" || key === "non attivo" || key === "disattivato") {
    return PERSON_STATUS.inactive;
  }
  if (key === "on_leave" || key === "in congedo" || key === "congedo") return STAFF_ON_LEAVE_STATUS;
  if (key === "suspended" || key === "sospeso") return PERSON_STATUS.suspended;
  return STATUS_UNKNOWN;
};

export const isStaffActive = (status?: string | null) =>
  String(status || "").trim().toLowerCase() === "active";

/** Il tono del chip di reparto dal colore salvato in `staff-directory`. */
export const departmentChipTone = (
  department?: Pick<StaffDepartment, "color"> | null,
): "neutral" | "blue" | "green" | "red" | "amber" | "navy" => {
  switch (department?.color) {
    case "blue":
      return "blue";
    case "green":
      return "green";
    case "red":
      return "red";
    case "yellow":
      return "amber";
    case "purple":
      return "navy";
    default:
      return "neutral";
  }
};

export type StaffAlert = {
  id: "document-expired" | "document-expiring" | "permit-expired" | "permit-expiring" | "no-contact";
  severity: "danger" | "warning";
  text: string;
};

/**
 * Gli avvisi della scheda, dai dati gia caricati: documento d'identita e
 * permesso di soggiorno scaduti o in scadenza (30 giorni), nessun recapito.
 * Una scheda in ordine non ha righe.
 */
export const computeStaffAlerts = (
  member: Record<string, any> | null | undefined,
  today: Date = new Date(),
): StaffAlert[] => {
  if (!member) return [];
  const alerts: StaffAlert[] = [];
  const docDays = daysUntil(member.documentExpiry, today);
  if (docDays !== null && docDays < 0) {
    alerts.push({ id: "document-expired", severity: "danger", text: "Documento di identità scaduto" });
  } else if (docDays !== null && docDays <= 30) {
    alerts.push({
      id: "document-expiring",
      severity: "warning",
      text: docDays === 0 ? "Documento di identità in scadenza oggi" : `Documento di identità in scadenza fra ${docDays} ${docDays === 1 ? "giorno" : "giorni"}`,
    });
  }
  const permitDays = daysUntil(member.residencePermitExpiry, today);
  if (permitDays !== null && permitDays < 0) {
    alerts.push({ id: "permit-expired", severity: "danger", text: "Permesso di soggiorno scaduto" });
  } else if (permitDays !== null && permitDays <= 30) {
    alerts.push({
      id: "permit-expiring",
      severity: "warning",
      text: permitDays === 0 ? "Permesso di soggiorno in scadenza oggi" : `Permesso di soggiorno in scadenza fra ${permitDays} ${permitDays === 1 ? "giorno" : "giorni"}`,
    });
  }
  if (!String(member.email || "").trim() && !String(member.phone || "").trim()) {
    alerts.push({ id: "no-contact", severity: "warning", text: "Nessun recapito: la persona non è raggiungibile dal club" });
  }
  return alerts;
};

/** Le aree della scheda V2 e le vecchie tab che vi confluiscono. */
export type StaffArea = "profilo" | "incarico" | "lavoro";

export const STAFF_AREAS: Array<{ value: StaffArea; label: string }> = [
  { value: "profilo", label: "Profilo" },
  { value: "incarico", label: "Incarico" },
  { value: "lavoro", label: "Lavoro e compensi" },
];

/**
 * `?tab=` della V1 → area della V2. Le quattro tab (`anagrafica`,
 * `societari`, `documenti`, `lavoro`) restano link validi.
 */
export const resolveStaffArea = (tab?: string | null): { area: StaffArea; section?: "documento" } => {
  switch (String(tab || "").trim().toLowerCase()) {
    case "societari":
    case "incarico":
      return { area: "incarico" };
    case "lavoro":
      return { area: "lavoro" };
    case "documenti":
      return { area: "profilo", section: "documento" };
    default:
      return { area: "profilo" };
  }
};
