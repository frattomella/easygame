/**
 * Profilo atleta (Parent) — dominio puro. Tutti i dati vengono gia dal
 * payload aggregato (`data.athlete`/`data.health`/`data.attendance`, gia
 * tipizzati in `services/api.ts`): nessuna chiamata in piu, nessuno stato
 * da ricalcolare lato server. Qui vive solo l'età, un valore puramente
 * derivato da una data — non una decisione di dominio.
 */

/** L'età compiuta da una data di nascita ISO, o `null` se la data manca o non e valida — mai un'età inventata. */
export function calculateAge(
  birthDate: string | null | undefined,
): number | null {
  if (!birthDate) return null;
  const parsed = new Date(birthDate);
  if (Number.isNaN(parsed.getTime())) return null;

  const today = new Date();
  let age = today.getFullYear() - parsed.getFullYear();
  const monthDiff = today.getMonth() - parsed.getMonth();
  if (
    monthDiff < 0 ||
    (monthDiff === 0 && today.getDate() < parsed.getDate())
  ) {
    age -= 1;
  }
  return age >= 0 ? age : null;
}

/** Etichetta di una visita medica libera (`athlete.data.medicalVisits[]`) — accetta le due forme storiche viste nel codice Web (`type`/`title`, `date`/`visitDate`). */
export function resolveMedicalVisitLabel(visit: {
  type?: string;
  title?: string;
}): string {
  return visit.type || visit.title || "Visita";
}

export function resolveMedicalVisitDate(visit: {
  date?: string;
  visitDate?: string;
}): string | undefined {
  return visit.date || visit.visitDate;
}
