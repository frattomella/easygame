import type { EGGradients } from "@/constants/theme";
import type { StatusPillVariant } from "@/components/signature/StatusPill";
import type { ParentAppointment } from "@/services/api";

/**
 * Appuntamenti di segreteria (Parent) — dominio puro. La faccia famiglia
 * (`toFamilyAppointment`, `src/lib/appointments/projection.ts`) non porta
 * un elenco di transizioni come quella del club: solo due mosse booleane,
 * `can_reschedule`/`can_cancel`. Qui non si inventa un terzo stato che il
 * contratto non ha.
 */

const OPEN_STATUSES = new Set<ParentAppointment["status"]>([
  "requested",
  "confirmed",
  "rescheduled",
]);

export function isOpenAppointment(
  status: ParentAppointment["status"],
): boolean {
  return OPEN_STATUSES.has(status);
}

export function splitParentAppointments(items: ParentAppointment[]): {
  open: ParentAppointment[];
  history: ParentAppointment[];
} {
  return {
    open: items.filter((item) => isOpenAppointment(item.status)),
    history: items.filter((item) => !isOpenAppointment(item.status)),
  };
}

export const APPOINTMENT_STATUS_VARIANT: Record<
  ParentAppointment["status"],
  StatusPillVariant
> = {
  requested: "warning",
  confirmed: "primary",
  rejected: "destructive",
  rescheduled: "default",
  cancelled_by_family: "destructive",
  cancelled_by_club: "destructive",
  completed: "success",
  no_show: "destructive",
};

export const APPOINTMENT_STATUS_STRIPE: Record<
  ParentAppointment["status"],
  keyof typeof EGGradients
> = {
  requested: "warning",
  confirmed: "action",
  rejected: "destructive",
  rescheduled: "neutral",
  cancelled_by_family: "neutral",
  cancelled_by_club: "neutral",
  completed: "success",
  no_show: "neutral",
};

/** Un motivo/tipo e una data valida (slot scelto o data+ora libere) — la condizione minima per abilitare l'invio, non una validazione che duplica il server. */
export function canSubmitAppointmentRequest(input: {
  reason: string;
  typeId: string;
  slotId: string;
  date: string;
  time: string;
}): boolean {
  const hasReason = Boolean(input.reason.trim() || input.typeId);
  const hasWhen = Boolean(
    input.slotId || (input.date.trim() && input.time.trim()),
  );
  return hasReason && hasWhen;
}
