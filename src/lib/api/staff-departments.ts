import { patchClubSettings } from "@/lib/club-profile";
import {
  findStaffDepartment,
  makeDepartmentFromName,
  mergeStaffDepartments,
  normalizeDepartmentName,
  readStaffDepartments,
  removeStaffDepartment,
  upsertStaffDepartment,
  type StaffDepartment,
} from "@/lib/staff-directory";

/**
 * Lettura e scrittura dei reparti staff.
 *
 * **Perche passa da `patchClubSettings`.** Le schermate staff scrivevano
 * `settings: { ...clubSettings, staffDepartments }` usando lo snapshot di
 * `settings` letto **al montaggio della pagina**. Una colonna JSON unica piu
 * uno snapshot vecchio significa che salvare un reparto riscriveva anche
 * `seasons`, `activeSeasonId`, `paymentSettings` e `onboarding` com'erano dieci
 * minuti prima: bastava che qualcuno cambiasse stagione nel frattempo perche
 * il salvataggio di un reparto la riportasse indietro.
 *
 * `patchClubSettings` rilegge la colonna prima di riscriverla (WP-40, 06 —
 * Modello dati): e l'unico modo corretto di toccare una chiave di `settings`.
 */

export type { StaffDepartment };

/** I reparti salvati piu quelli orfani trovati sui membri. */
export const resolveStaffDepartments = (
  settings?: Record<string, any> | null,
  members: Array<{ department?: string | null }> = [],
): StaffDepartment[] =>
  mergeStaffDepartments(readStaffDepartments(settings), members);

export const saveStaffDepartments = async (
  clubId: string,
  departments: StaffDepartment[],
) => {
  await patchClubSettings(clubId, (settings) => ({
    ...settings,
    staffDepartments: departments,
  }));

  return departments;
};

/**
 * Garantisce che un reparto esista in archivio.
 *
 * E la funzione che chiude il difetto: **ogni** salvataggio di un membro con
 * un reparto la chiama, cosi un reparto nato da «Altro» in un form di
 * creazione e persistito subito e comparira nella select successiva, dopo un
 * refresh, e nella dialog di gestione — invece di esistere solo come stringa
 * su quel membro.
 *
 * E idempotente: se il reparto c'e gia non scrive nulla, e l'id e derivato dal
 * nome, quindi due salvataggi simultanei non producono due righe gemelle.
 */
export const ensureStaffDepartment = async (
  clubId: string,
  name?: string | null,
): Promise<StaffDepartment | null> => {
  const normalized = normalizeDepartmentName(name);
  if (!clubId || !normalized) return null;

  const department = makeDepartmentFromName(normalized);
  let created: StaffDepartment | null = null;

  await patchClubSettings(clubId, (settings) => {
    const current = readStaffDepartments(settings);
    if (findStaffDepartment(current, normalized)) {
      // Gia presente: si riscrive l'elenco identico. Una PATCH in piu costa
      // meno di due fonti che divergono di nuovo.
      return settings;
    }

    created = department;
    return {
      ...settings,
      staffDepartments: upsertStaffDepartment(current, department),
    };
  });

  return created;
};

export const deleteStaffDepartment = async (
  clubId: string,
  departmentId: string,
) => {
  let next: StaffDepartment[] = [];

  await patchClubSettings(clubId, (settings) => {
    next = removeStaffDepartment(readStaffDepartments(settings), departmentId);
    return { ...settings, staffDepartments: next };
  });

  return next;
};
