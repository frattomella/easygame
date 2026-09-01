import { normalizeAccessRole, type CanonicalAccessRole } from "@/lib/access-roles";

/**
 * Chi puo vedere e toccare i compensi.
 *
 * **Perche un insieme di permessi e non un ruolo nuovo.** CLAUDE.md vieta di
 * aggiungere un ottavo ruolo di accesso, e avrebbe ragione anche se non lo
 * vietasse: il problema qui non e «chi e questa persona» — i sette ruoli lo
 * dicono gia — ma «cosa puo fare sul dato economico piu riservato che il club
 * possiede». Sono due domande diverse, e mescolarle costringe a duplicare
 * l'intera gerarchia ogni volta che si aggiunge una capability.
 *
 * **Il default e negato.** Un rapporto di lavoro dice quanto guadagna una
 * persona: e un dato che, in un club, circola per pettegolezzo prima che per
 * necessita. Il perimetro economico coincide con quello che gia protegge
 * conti correnti, metodi di pagamento e configurazione societaria — cioe
 * **proprietario e club manager** — e non si allarga per comodita.
 *
 * `sport_work.read_own` **ha una superficie** (W6-32): «I miei compensi» nella
 * dashboard dell'allenatore, servita da `GET /api/v1/sport-work/me`. Per due
 * Wave e stata l'unica chiave del catalogo che nessuno interrogava — concessa,
 * configurabile, e senza un atto da proteggere.
 *
 * Continua a **non** significare che un allenatore possa elencare i rapporti
 * del club: gli endpoint di elenco chiedono `sport_work.read`, che non ha, e
 * la rotta dei propri compensi non accetta un `person_id`. E la differenza fra
 * «lo stesso elenco, piu corto» e «una domanda diversa».
 *
 * Le altre tre concessioni — `collaborator`, `staff`, `athlete` — restano
 * senza superficie: l'area atleta e le dashboard di staff e collaboratori
 * arrivano piu avanti nella Wave, e la rotta e gia scritta per servirle senza
 * modifiche, perche chiede la chiave e non il ruolo.
 */

export type SportWorkPermission =
  | "sport_work.manage"
  | "sport_work.read"
  | "sport_work.read_own"
  | "sport_work.pay"
  | "sport_work.fiscal";

export const SPORT_WORK_PERMISSIONS: readonly SportWorkPermission[] = [
  "sport_work.manage",
  "sport_work.read",
  "sport_work.read_own",
  "sport_work.pay",
  "sport_work.fiscal",
] as const;

export const SPORT_WORK_PERMISSION_LABELS: Record<SportWorkPermission, string> =
  {
    "sport_work.manage":
      "Creare e modificare rapporti, piani, premi, rimborsi e adempimenti",
    "sport_work.read": "Vedere i rapporti e i compensi di tutto il club",
    "sport_work.read_own": "Vedere i propri compensi",
    "sport_work.pay": "Registrare e stornare erogazioni",
    "sport_work.fiscal":
      "Vedere e preparare i dati contributivi e fiscali (F24, CU)",
  };

const FULL_ACCESS: readonly SportWorkPermission[] = [
  "sport_work.manage",
  "sport_work.read",
  "sport_work.read_own",
  "sport_work.pay",
  "sport_work.fiscal",
];

const OWN_ONLY: readonly SportWorkPermission[] = ["sport_work.read_own"];

/**
 * I permessi di un ruolo canonico.
 *
 * `collaborator` e `staff` sono ruoli dell'area gestionale ma **non**
 * dell'area amministrativa: in EasyGame non vedono gia conti correnti e
 * metodi di pagamento (`MANAGEMENT_ADMIN_ONLY_RESOURCES` in
 * `access-roles.ts`), e i compensi non sono meno sensibili di quelli.
 * Allargare loro il perimetro e una decisione di prodotto, da prendere
 * esplicitamente e non per omissione.
 */
const PERMISSIONS_BY_ROLE: Record<
  CanonicalAccessRole,
  readonly SportWorkPermission[]
> = {
  owner: FULL_ACCESS,
  club_manager: FULL_ACCESS,
  collaborator: OWN_ONLY,
  staff: OWN_ONLY,
  trainer: OWN_ONLY,
  parent: [],
  athlete: OWN_ONLY,
};

export const listSportWorkPermissions = (
  role: string | null | undefined,
): readonly SportWorkPermission[] => {
  const normalized = normalizeAccessRole(role);
  return normalized ? PERMISSIONS_BY_ROLE[normalized] : [];
};

export const hasSportWorkPermission = (
  role: string | null | undefined,
  permission: SportWorkPermission,
) => listSportWorkPermissions(role).includes(permission);

/**
 * Solleva se il ruolo non ha il permesso.
 *
 * Il messaggio contiene «Accesso negato» perche il route handler lo mappi su
 * 403: e la convenzione del repository, e non e negoziabile, perche un 400 su
 * un problema di permessi manda la segreteria a cercare un errore nei dati.
 */
export const assertSportWorkPermission = (
  role: string | null | undefined,
  permission: SportWorkPermission,
) => {
  if (!hasSportWorkPermission(role, permission)) {
    throw new Error(
      `Accesso negato: il ruolo attivo non puo ${SPORT_WORK_PERMISSION_LABELS[permission].toLowerCase()}`,
    );
  }
};

/** Vero se il ruolo puo vedere i dati economici di **altre** persone. */
export const canReadOthersCompensation = (role: string | null | undefined) =>
  hasSportWorkPermission(role, "sport_work.read");
