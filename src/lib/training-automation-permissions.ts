import {
  canAccessClubResource,
  canManageClubConfiguration,
} from "@/lib/access-roles";
import { narrowDomainPermission } from "@/lib/permissions/catalog";

/**
 * **Chi puo generare gli allenamenti dal programma settimanale** (WP-19).
 *
 * ---
 *
 * ## Il difetto che questo modulo chiude
 *
 * Le rotte della generazione (`/api/v1/training-automation`,
 * `/api/v1/training-automation/schedule-impact`) chiedevano
 * `canManageClubConfigurationAsActor`, che e definito cosi
 * (`access-roles.ts`):
 *
 * ```ts
 * !isCustomRoleValue(role) && canManageClubConfiguration(role);
 * ```
 *
 * La prima meta rifiuta **ogni** ruolo personalizzato, qualunque casella
 * l'editor gli abbia dato. Un club che avesse costruito «Segreteria
 * allenamenti» a partire dal gestore non poteva premere "Genera ora", ne
 * "Genera fino a...", ne aggiornare in blocco gli allenamenti futuri dopo
 * una modifica al programma settimanale — e nessuna casella dell'editor
 * poteva rimediare, perche la chiave non esisteva in catalogo. La stessa
 * forma di difetto che ADR-0153 aveva gia trovato sulle stagioni, e che
 * `funding/permissions.ts` chiude gia sui contributi.
 *
 * ## Cosa cambia, e cosa no
 *
 * **Il perimetro dei ruoli canonici non cambia di una riga.** Proprietario e
 * gestore generano come prima; collaboratore, staff, allenatore, genitore e
 * atleta continuano a non generare. Cio che si aggiunge e un ruolo
 * personalizzato **costruito su quei due** e che porti
 * `training_automation.manage`.
 *
 * Un allenatore non riceve questa capacita solo perche puo gestire le
 * presenze: le due chiavi sono distinte (`events.manage` per l'appello,
 * `training_automation.manage` per la generazione), e nessun ruolo base
 * diverso da proprietario/gestore puo portare la seconda — `narrowDomainPermission`
 * rifiuta un ruolo personalizzato la cui base non ha gia la capacita.
 *
 * ## Perche la lettura/modifica del programma settimanale non e qui
 *
 * Il programma settimanale (`weekly_schedule`) e CRUD generico
 * (`canAccessClubResource`), senza una chiave di catalogo che lo governi —
 * un ruolo personalizzato costruito sul gestore lo legge e lo scrive gia
 * oggi, ed e cosi da prima di questo modulo. Cio che mancava era solo l'atto
 * che **genera eventi**: questa e l'unica cosa che questo modulo aggiunge.
 */

export type TrainingAutomationPermission = "training_automation.manage";

export const TRAINING_AUTOMATION_PERMISSIONS: readonly TrainingAutomationPermission[] =
  ["training_automation.manage"] as const;

export const TRAINING_AUTOMATION_PERMISSION_LABELS: Record<
  TrainingAutomationPermission,
  string
> = {
  "training_automation.manage":
    "generare gli allenamenti dal programma settimanale, anche fino a una data scelta, e aggiornarli in blocco",
};

/**
 * Vero quando il ruolo attivo puo generare/aggiornare in blocco gli
 * allenamenti dal programma settimanale.
 *
 * L'ordine conta, ed e quello di `hasFundingPermission`: prima la
 * restrizione — che risponde `null` su un ruolo canonico, e allora vale la
 * delega di sempre — poi la delega.
 */
export const hasTrainingAutomationPermission = (
  role: string | null | undefined,
  permission: TrainingAutomationPermission = "training_automation.manage",
) => {
  const ristretto = narrowDomainPermission(role, permission, (base) =>
    canManageClubConfiguration(base),
  );
  if (ristretto !== null) return ristretto;

  return canManageClubConfiguration(role);
};

/** Comodita per le rotte: il nome dice cosa si sta per fare. */
export const canManageTrainingAutomationAsActor = (
  role: string | null | undefined,
) => hasTrainingAutomationPermission(role, "training_automation.manage");

/**
 * Vero quando il ruolo attivo puo leggere/scrivere il programma settimanale.
 *
 * Delega a `weekly_schedule`, che e la porta che il CRUD generico interroga
 * da sempre: questa funzione la **nomina**, non la sposta.
 */
export const canReadWeeklyScheduleAsActor = (
  role: string | null | undefined,
) => canAccessClubResource(role, "weekly_schedule", "read");

/**
 * Solleva se il ruolo non puo generare. Il messaggio contiene «Accesso
 * negato» perche il route handler lo mappi su 403 (convenzione del
 * repository).
 */
export const assertTrainingAutomationPermission = (
  role: string | null | undefined,
  permission: TrainingAutomationPermission = "training_automation.manage",
) => {
  if (!hasTrainingAutomationPermission(role, permission)) {
    throw new Error(
      `Accesso negato: il ruolo attivo non puo ${TRAINING_AUTOMATION_PERMISSION_LABELS[permission]}`,
    );
  }
};
