import { normalizeAccessRole, type CanonicalAccessRole } from "@/lib/access-roles";

/**
 * Chi puo cambiare la stagione attiva di un club (AU-7).
 *
 * **Perche un permesso dedicato e non un ruolo nuovo.** Cambiare stagione
 * riscrive il perimetro di **tutto** cio che il club vede: quali categorie
 * esistono, quali squadre, quali quote, quali allenamenti. Fino alla Wave 1
 * l'operazione era indistinguibile da «modificare la configurazione del club»,
 * cioe da cambiare il numero di telefono in anagrafica. Non e la stessa cosa, e
 * il modello dei permessi deve poterlo dire.
 *
 * **Il perimetro non cambia oggi.** Chi poteva cambiare stagione ieri —
 * proprietario e gestore — puo cambiarla anche adesso: `canManageClubConfiguration`
 * risponde `true` esattamente per quei due ruoli, e questo modulo li ricopia.
 * Il permesso serve a rendere la decisione **esplicita e spostabile**, non a
 * togliere accesso a qualcuno. Il giorno in cui un club chiedera che il gestore
 * non possa aprire la stagione da solo, si cambiera una riga qui invece di
 * cercare tutte le rotte che chiamano una funzione generica.
 *
 * **Un permesso solo.** Leggere l'elenco delle stagioni e cambiarle hanno oggi
 * lo stesso perimetro, e inventare un `seasons.read` con la stessa matrice
 * aggiungerebbe una chiave senza aggiungere una decisione. Se un giorno la
 * lettura dovra allargarsi, sara quel giorno a giustificarla.
 *
 * Il modello e quello gia collaudato dei permessi di dominio del lavoro
 * sportivo (`src/lib/sport-work/permissions.ts`): default negato, nessun ruolo
 * nuovo, diniego tracciato.
 */

export type SeasonPermission = "seasons.change";

export const SEASON_PERMISSIONS: readonly SeasonPermission[] = [
  "seasons.change",
] as const;

export const SEASON_PERMISSION_LABELS: Record<SeasonPermission, string> = {
  "seasons.change":
    "Creare, attivare, archiviare una stagione e riportarne i dati",
};

const FULL_ACCESS: readonly SeasonPermission[] = ["seasons.change"];

/**
 * `collaborator` e `staff` appartengono all'area gestionale ma non a quella
 * amministrativa: `/organization` e gia fuori dal loro perimetro
 * (`MANAGEMENT_ADMIN_ONLY_PATH_PREFIXES` in `access-roles.ts`). Allargare qui
 * sarebbe una decisione di prodotto, non una conseguenza di questa Wave.
 */
const PERMISSIONS_BY_ROLE: Record<
  CanonicalAccessRole,
  readonly SeasonPermission[]
> = {
  owner: FULL_ACCESS,
  club_manager: FULL_ACCESS,
  collaborator: [],
  staff: [],
  trainer: [],
  parent: [],
  athlete: [],
};

export const listSeasonPermissions = (
  role: string | null | undefined,
): readonly SeasonPermission[] => {
  const normalized = normalizeAccessRole(role);
  return normalized ? PERMISSIONS_BY_ROLE[normalized] : [];
};

export const hasSeasonPermission = (
  role: string | null | undefined,
  permission: SeasonPermission,
) => listSeasonPermissions(role).includes(permission);

/**
 * Solleva se il ruolo non ha il permesso. Il messaggio contiene «Accesso
 * negato» perche il route handler lo mappi su 403: e la convenzione del
 * repository.
 */
export const assertSeasonPermission = (
  role: string | null | undefined,
  permission: SeasonPermission,
) => {
  if (!hasSeasonPermission(role, permission)) {
    throw new Error(
      `Accesso negato: il ruolo attivo non puo ${SEASON_PERMISSION_LABELS[permission].toLowerCase()}`,
    );
  }
};
