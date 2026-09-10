import type { StatusPillVariant } from "@/components/signature/StatusPill";
import type { ParentStructure, ParentStructureBooking } from "@/services/api";

/**
 * Strutture (Parent) — dominio puro. Nessun annullamento: ne il dominio lo
 * offre (`POST` e l'unico verbo sotto `.../structures`), ne il Web lo
 * permette. Le fasce orarie e i prezzi arrivano gia filtrati dal server
 * (`serializeParentStructure`): solo campi prenotabili e visibili, solo
 * tariffe con prezzo positivo.
 */

export const BOOKING_STATUS_VARIANT: Record<
  ParentStructureBooking["status"],
  StatusPillVariant
> = {
  pending: "warning",
  confirmed: "success",
  cancelled: "default",
};

export const BOOKING_STATUS_LABEL: Record<
  ParentStructureBooking["status"],
  string
> = {
  pending: "Richiesta inviata",
  confirmed: "Confermata",
  cancelled: "Annullata",
};

/** Solo i campi che la famiglia puo davvero prenotare — il server li ha gia filtrati, questa e solo una difesa in piu contro un payload incompleto. */
export function bookableFields(structure: ParentStructure) {
  return structure.fields.filter(
    (field) => field.isBookable && field.isVisible,
  );
}

/** Il prezzo piu basso disponibile per un campo, se ne ha — per l'anteprima "da X €", mai un prezzo inventato quando la lista e vuota. */
export function lowestFieldPrice(
  field: ParentStructure["fields"][number],
): number | null {
  if (field.pricing.length === 0) return null;
  return Math.min(...field.pricing.map((tariff) => tariff.price));
}

/** Calcola l'orario di fine da un inizio ISO e una durata in minuti — usato per costruire la richiesta di prenotazione, mai per validarla (il server resta l'unico a farlo). */
export function computeBookingEnd(
  startIso: string,
  durationMinutes: number,
): string {
  const start = new Date(startIso);
  return new Date(start.getTime() + durationMinutes * 60000).toISOString();
}
