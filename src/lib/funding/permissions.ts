import {
  canAccessClubResource,
  canManageClubConfiguration,
} from "@/lib/access-roles";
import { narrowDomainPermission } from "@/lib/permissions/catalog";

/**
 * **Chi decide di un contributo pubblico** (N12, N13).
 *
 * ---
 *
 * ## Il difetto che questo modulo chiude
 *
 * Le rotte dei bandi chiedevano `canManageClubConfigurationAsActor`, che e
 * definito cosi (`access-roles.ts`):
 *
 * ```ts
 * !isCustomRoleValue(role) && canManageClubConfiguration(role)
 * ```
 *
 * La prima meta rifiuta **ogni** ruolo personalizzato, qualunque casella
 * l'editor gli abbia dato. Un club che aveva costruito «Segreteria contributi»
 * a partire dal gestore non poteva iscrivere un atleta a un bando, ricalcolare
 * un maturato o revocare un voucher — e non c'era niente da spuntare, perche
 * la chiave non esisteva in catalogo. Due assenze che si tenevano in piedi a
 * vicenda, la stessa forma che ADR-0153 aveva gia trovato sulle stagioni.
 *
 * ## Cosa cambia, e cosa no
 *
 * **Il perimetro dei ruoli canonici non cambia di una riga.** Proprietario e
 * gestore scrivono come prima; collaboratore, staff, allenatore, genitore e
 * atleta continuano a non scrivere. Cio che si aggiunge e un ruolo
 * personalizzato **costruito su quei due** e che porti `funding.manage`.
 *
 * ## Perche la lettura resta dov'e
 *
 * Perche una chiave nuova nasce **spenta**, e una chiave spenta su una lettura
 * significa togliere accesso a chi oggi ce l'ha. I bandi si leggono da sempre
 * con `payments` → `accounting.read`, e quel gettone i ruoli personalizzati di
 * segreteria ce l'hanno gia. Inventare `funding.read` sarebbe una migrazione
 * silenziosa dei permessi di ogni club: la lettura non e il problema che questa
 * lane ha trovato, e non e il momento di spostarla.
 */

export type FundingPermission = "funding.manage";

export const FUNDING_PERMISSIONS: readonly FundingPermission[] = [
  "funding.manage",
] as const;

export const FUNDING_PERMISSION_LABELS: Record<FundingPermission, string> = {
  "funding.manage":
    "iscrivere a un contributo, decidere la maturazione di un periodo o revocare un voucher",
};

/**
 * Vero quando il ruolo attivo puo **scrivere** nel dominio dei contributi.
 *
 * L'ordine conta, ed e quello di `hasSeasonPermission`: prima la restrizione —
 * che risponde `null` su un ruolo canonico, e allora vale la delega di sempre —
 * poi la delega. Invertirlo renderebbe la casella dell'editor decorativa, che e
 * il difetto che CLAUDE.md §2 nomina per esteso.
 */
export const hasFundingPermission = (
  role: string | null | undefined,
  permission: FundingPermission = "funding.manage",
) => {
  const ristretto = narrowDomainPermission(role, permission, (base) =>
    canManageClubConfiguration(base),
  );
  if (ristretto !== null) return ristretto;

  return canManageClubConfiguration(role);
};

/** Comodita per le rotte: il nome dice cosa si sta per fare. */
export const canManageFundingAsActor = (role: string | null | undefined) =>
  hasFundingPermission(role, "funding.manage");

/**
 * Vero quando il ruolo attivo puo **leggere** i contributi di una famiglia.
 *
 * Delega a `payments`, che e la porta che `funding.ts` interroga da sempre:
 * questo modulo la **nomina**, non la sposta. Esiste perche una schermata deve
 * poter accendere o spegnere un riquadro senza ricostruire in casa la regola
 * del server — e perche il giorno in cui la lettura si stacchera, si cambiera
 * questa riga invece di cercare tutte le rotte.
 */
export const canReadFundingAsActor = (role: string | null | undefined) =>
  canAccessClubResource(role, "payments", "read");

/**
 * Solleva se il ruolo non puo scrivere. Il messaggio contiene «Accesso negato»
 * perche il route handler lo mappi su 403: e la convenzione del repository.
 */
export const assertFundingPermission = (
  role: string | null | undefined,
  permission: FundingPermission = "funding.manage",
) => {
  if (!hasFundingPermission(role, permission)) {
    throw new Error(
      `Accesso negato: il ruolo attivo non puo ${FUNDING_PERMISSION_LABELS[permission]}`,
    );
  }
};
