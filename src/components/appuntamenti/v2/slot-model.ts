import type { AppointmentSlotRow } from "@/lib/api/appointments-client";
import { PERSON_STATUS, type StatusSpec } from "@/lib/web/status";

/**
 * Il modello puro della disponibilita V2: le stesse forme della V1
 * (`AppointmentSlotRow`, il modulo a undici campi, gli operatori con un
 * account) e le funzioni che la pagina teneva in linea. Nessuna scrittura.
 */

/** Il club su cui si sta lavorando viaggia nell'intestazione, come ovunque. */
export const intestazioniClub = (organizationId?: string | null): Record<string, string> =>
  organizationId ? { "x-active-club-id": String(organizationId) } : {};

export const GIORNI: ReadonlyArray<{ valore: number; nome: string }> = [
  { valore: 0, nome: "Domenica" },
  { valore: 1, nome: "Lunedi" },
  { valore: 2, nome: "Martedi" },
  { valore: 3, nome: "Mercoledi" },
  { valore: 4, nome: "Giovedi" },
  { valore: 5, nome: "Venerdi" },
  { valore: 6, nome: "Sabato" },
];

export const nomeGiorno = (weekday: number | null | undefined) => GIORNI.find((giorno) => giorno.valore === weekday)?.nome || "Giorno non indicato";

export const soloData = (value: unknown) => String(value ?? "").slice(0, 10);

export type Operatore = { userId: string; nome: string };

/**
 * Gli operatori a cui una fascia si puo assegnare: le persone dello staff e
 * gli allenatori **che hanno un account**. `appointment_slots.assigned_to_user_id`
 * e un identificativo di utente e `assertPerimetro` lo confronta con quello
 * della sessione: una persona senza account non aprirebbe mai l'appuntamento
 * che le e stato assegnato.
 */
export const estraiOperatori = (righe: unknown): Operatore[] => {
  if (!Array.isArray(righe)) return [];
  const trovati = new Map<string, string>();
  for (const riga of righe as any[]) {
    if (!riga || typeof riga !== "object") continue;
    const dati = riga.data && typeof riga.data === "object" ? (riga.data as any) : {};
    const userId = String(riga.linkedUserId || riga.linked_user_id || riga.userId || riga.user_id || dati.linkedUserId || dati.userId || "").trim();
    if (!userId) continue;
    const nome = String(riga.fullName || [riga.name, riga.surname || riga.lastName].filter(Boolean).join(" ") || riga.email || "").trim() || "Operatore senza nome";
    if (!trovati.has(userId)) trovati.set(userId, nome);
  }
  return Array.from(trovati.entries())
    .map(([userId, nome]) => ({ userId, nome }))
    .sort((sinistra, destra) => sinistra.nome.localeCompare(destra.nome, "it"));
};

export type Sede = { id: string; name: string };

export const nomeSede = (sedi: Sede[], siteId: string | null) => {
  if (!siteId) return "Tutte le sedi";
  return sedi.find((sede) => sede.id === siteId)?.name || "Sede rimossa";
};

export const nomeOperatore = (operatori: Operatore[], userId: string | null) => {
  if (!userId) return "Segreteria";
  return operatori.find((operatore) => operatore.userId === userId)?.nome || "Operatore non piu in organico";
};

/* ── Il modulo della fascia (undici campi, come la V1) ───────────────────── */
export type SlotAmbito = "weekly" | "date";

export type SlotFormValues = {
  id: string | null;
  ambito: SlotAmbito;
  weekday: string;
  specificDate: string;
  startTime: string;
  endTime: string;
  durationMinutes: string;
  siteId: string;
  assignedToUserId: string;
  validFrom: string;
  validUntil: string;
  active: boolean;
  notes: string;
};

export const emptySlotForm = (): SlotFormValues => ({
  id: null,
  ambito: "weekly",
  weekday: "1",
  specificDate: "",
  startTime: "09:00",
  endTime: "12:00",
  durationMinutes: "30",
  siteId: "",
  assignedToUserId: "",
  validFrom: "",
  validUntil: "",
  active: true,
  notes: "",
});

export const slotFormFrom = (slot: AppointmentSlotRow): SlotFormValues => ({
  id: slot.id,
  ambito: slot.specific_date ? "date" : "weekly",
  weekday: slot.weekday === null ? "1" : String(slot.weekday),
  specificDate: soloData(slot.specific_date),
  startTime: slot.start_time || "09:00",
  endTime: slot.end_time || "12:00",
  durationMinutes: String(slot.duration_minutes || 30),
  siteId: slot.site_id || "",
  assignedToUserId: slot.assigned_to_user_id || "",
  validFrom: soloData(slot.valid_from),
  validUntil: soloData(slot.valid_until),
  active: slot.active !== false,
  notes: slot.notes || "",
});

export const validateSlotForm = (values: SlotFormValues): Partial<Record<keyof SlotFormValues, string>> => {
  const errors: Partial<Record<keyof SlotFormValues, string>> = {};
  if (values.ambito === "date" && !values.specificDate) errors.specificDate = "Indica la data della fascia";
  if (!values.startTime) errors.startTime = "Indica l'orario di inizio";
  if (!values.endTime) errors.endTime = "Indica l'orario di fine";
  if (values.startTime && values.endTime && values.endTime <= values.startTime) errors.endTime = "L'orario di fine deve seguire quello di inizio";
  return errors;
};

/* ── Stato di una fascia ─────────────────────────────────────────────────── */
const spec = (label: string, weight: StatusSpec["weight"], hue: StatusSpec["hue"]): StatusSpec => Object.freeze({ label, weight, hue });

/**
 * Le parole di una fascia nella forma di `src/lib/web/status.ts`. Il sistema
 * non le ha: «ATTIVA» e «DISATTIVATA» sono al femminile (`PERSON_STATUS` dice
 * «ATTIVO»/«DISATTIVATO») e «CHIUSURA» e la data disattivata, che il dominio
 * legge come «quel giorno non si riceve». Locali finche il lead non le
 * promuove (rapporto §3).
 */
export const SLOT_STATUS = Object.freeze({
  active: spec("ATTIVA", "solid", "green"),
  inactive: spec("DISATTIVATA", "quiet", "neutral"),
  closure: spec("CHIUSURA", "urgent", "red"),
});

export type SlotStatusKey = keyof typeof SLOT_STATUS;

export const slotStatusKey = (slot: AppointmentSlotRow): SlotStatusKey => {
  if (slot.active !== false) return "active";
  return slot.specific_date ? "closure" : "inactive";
};

export const slotStatusSpec = (slot: AppointmentSlotRow): StatusSpec => SLOT_STATUS[slotStatusKey(slot)] || PERSON_STATUS.draft;

export const isSlotActive = (slot: AppointmentSlotRow) => slot.active !== false;

/** Settimanali prima (per giorno), poi le date, poi l'orario di inizio (V1). */
export const slotSortKey = (slot: AppointmentSlotRow) => `${slot.specific_date ? "1" : "0"}${String(slot.weekday ?? 9)}${soloData(slot.specific_date)}${slot.start_time}`;

export const slotDayLabel = (slot: AppointmentSlotRow) => (slot.specific_date ? soloData(slot.specific_date) : nomeGiorno(slot.weekday));

/** `Ogni settimana` / `Una data sola` — il tipo della regola. */
export const slotKindLabel = (slot: AppointmentSlotRow) => (slot.specific_date ? "Una data sola" : "Ogni settimana");
