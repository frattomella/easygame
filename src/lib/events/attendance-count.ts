import { isPresentAttendance } from "@/lib/funding/attendance-measure";

/**
 * **Il contatore delle presenze di un evento, in un posto solo** (ADR-0198
 * §2 e §6).
 *
 * Tre domande hanno una risposta sola, e la danno queste funzioni:
 *
 * - **«L'appello e stato fatto?»** — si, se esiste **almeno una riga
 *   registrata** (`present` o `absent`), qualunque sia il numero dei
 *   presenti. Tredici convocati, tredici assenti, zero presenti e un appello
 *   **fatto**: la rilevazione c'e stata. `presentCount > 0` non e una prova
 *   dell'appello, e la Dashboard che la usava diceva «non registrato» sopra
 *   un registro compilato (pilota, 2026-09-18). Una riga `pending` nata da
 *   una risposta della famiglia non e un appello (ADR-0099).
 * - **Chi conta nel numeratore** — ogni persona **registrata presente**
 *   all'evento: la rosa, chi e stato aggiunto fuori categoria
 *   (`is_extra_category`), le persone in prova (`trial_attendances`). Il
 *   denominatore e la rosa attesa e non si allarga per far tornare la
 *   frazione: `15/13` e un dato vero.
 * - **La stessa persona una volta sola** — la chiave canonica di chi
 *   partecipa e `athlete:<id>`; una persona in prova e `trial:<id>` finche
 *   non e stata convertita, poi e l'atleta che e diventata. Due righe con la
 *   stessa chiave sono una persona, e se una delle due la dice presente, era
 *   presente.
 *
 * Modulo puro: riceve le righe, non le cerca.
 */

export type AttendanceRow = {
  /** La chiave canonica della persona (`participantKey`, `trialParticipantKey`). */
  key: string;
  status: string | null | undefined;
  /** `true` se la riga e di una persona aggiunta fuori dalla rosa della squadra. */
  extra?: boolean;
  /** `true` se la riga e di una persona in prova. */
  trial?: boolean;
};

export type AttendanceCounts = {
  /** Righe con un appello scritto (presente o assente), persone distinte. */
  recorded: number;
  /** Fra le registrate: le sole persone della rosa (ne fuori rosa ne in prova). */
  recordedRoster: number;
  present: number;
  absent: number;
  /** Fra i presenti: quanti fuori rosa e quante persone in prova. */
  presentExtra: number;
  presentTrial: number;
};

/* Le stesse grafie che il lettore dell'elenco riconosce (`isAttendanceEntryRecorded`): mai due insiemi. */
export const RECORDED_ATTENDANCE_STATUSES = new Set([
  "present", "presente", "yes", "true",
  "absent", "assente", "justified", "giustificato", "late", "ritardo", "delayed",
]);

export const participantKey = (athleteId: unknown) => `athlete:${String(athleteId ?? "").trim()}`;

export const trialParticipantKey = (trial: { trialId: unknown; athleteId?: unknown }) => {
  const athleteId = String(trial.athleteId ?? "").trim();
  return athleteId ? participantKey(athleteId) : `trial:${String(trial.trialId ?? "").trim()}`;
};

/** Vero se la riga porta un appello scritto: `present` o `absent`, mai `pending`. */
export const isRecordedAttendanceStatus = (status: unknown) =>
  RECORDED_ATTENDANCE_STATUSES.has(String(status ?? "").trim().toLowerCase());

export const emptyAttendanceCounts = (): AttendanceCounts => ({
  recorded: 0,
  recordedRoster: 0,
  present: 0,
  absent: 0,
  presentExtra: 0,
  presentTrial: 0,
});

export const countEventAttendance = (rows: readonly AttendanceRow[]): AttendanceCounts => {
  const perPersona = new Map<string, AttendanceRow>();
  for (const row of rows) {
    if (!isRecordedAttendanceStatus(row.status)) continue;
    const key = String(row.key || "").trim();
    if (!key || key === "athlete:" || key === "trial:") continue;
    const precedente = perPersona.get(key);
    /* Una persona, una riga: se una la dice presente, era presente. */
    if (!precedente || (!isPresentAttendance(precedente) && isPresentAttendance(row))) {
      perPersona.set(key, row);
    }
  }
  const counts = emptyAttendanceCounts();
  for (const row of perPersona.values()) {
    counts.recorded += 1;
    if (!row.extra && !row.trial) counts.recordedRoster += 1;
    if (isPresentAttendance(row)) {
      counts.present += 1;
      if (row.extra) counts.presentExtra += 1;
      if (row.trial) counts.presentTrial += 1;
    } else {
      counts.absent += 1;
    }
  }
  return counts;
};

export type AttendanceState = "recorded" | "none";

/** «Registrato» se esiste almeno una riga di appello; il numero dei presenti non c'entra. */
export const attendanceStateOf = (counts: Pick<AttendanceCounts, "recorded">): AttendanceState =>
  counts.recorded > 0 ? "recorded" : "none";
