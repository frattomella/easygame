import {
  canManageClubConfiguration,
  normalizeAccessRole,
  type CanonicalAccessRole,
} from "@/lib/access-roles";
import { narrowDomainPermission } from "@/lib/permissions/catalog";

/**
 * I permessi del dominio **comunicazioni** (Wave 2).
 *
 * **Perche un modulo solo per sei lane.** Comunicazione massiva, automazioni,
 * bacheca e RSVP sono superfici diverse dello stesso fatto: il gestionale che
 * parla con le famiglie. Se ogni lane si fosse scritta la propria matrice, la
 * Wave avrebbe lasciato quattro copie della stessa decisione, e la prima volta
 * che qualcuna si allarga le altre restano indietro **in silenzio**. E
 * l'errore che l'audit di fine Wave 1 ha trovato in `seasons/permissions.ts`,
 * e che questo modulo non ripete.
 *
 * **Il perimetro si delega, non si ricopia.** Chi puo mandare un messaggio a
 * nome della societa e chi gia poteva sollecitare gli insoluti in Wave 1, cioe
 * `canManageClubConfiguration`. Il permesso serve a rendere la decisione
 * **esplicita e spostabile**, non a togliere o dare accesso a qualcuno oggi.
 *
 * **Default negato.** Un ruolo che non compare nella matrice non ha nessun
 * permesso: e la stessa regola di `sport-work/permissions.ts`.
 */

export type CommunicationPermission =
  | "communications.send"
  | "communications.read_recipients"
  | "communications.audience_economic"
  | "automations.manage"
  | "board.publish"
  | "board.read"
  | "rsvp.read"
  | "rsvp.answer";

export const COMMUNICATION_PERMISSIONS: readonly CommunicationPermission[] = [
  "communications.send",
  "communications.read_recipients",
  "communications.audience_economic",
  "automations.manage",
  "board.publish",
  "board.read",
  "rsvp.read",
  "rsvp.answer",
] as const;

export const COMMUNICATION_PERMISSION_LABELS: Record<
  CommunicationPermission,
  string
> = {
  "communications.send": "Creare e inviare una comunicazione alle famiglie",
  "communications.read_recipients":
    "Vedere l'elenco nominativo dei destinatari e degli esclusi",
  "communications.audience_economic":
    "Selezionare un pubblico in base alla posizione economica",
  "automations.manage": "Creare, modificare, accendere e spegnere un'automazione",
  "board.publish": "Pubblicare un avviso in bacheca",
  "board.read": "Leggere gli avvisi della bacheca destinati a se",
  "rsvp.read": "Leggere le risposte di partecipazione",
  "rsvp.answer": "Rispondere all'invito per il proprio atleta",
};

/**
 * **Il permesso che merita una riga di spiegazione.**
 *
 * `communications.audience_economic` non protegge una pagina: protegge un
 * **criterio**. «Manda a chi non ha pagato» non mostra nessun importo a
 * schermo, eppure produce l'elenco delle famiglie in arretrato — che e un dato
 * economico a tutti gli effetti, e che un allenatore non deve poter ottenere
 * passando dal motore del pubblico invece che dalla pagina dei movimenti.
 *
 * Separarlo da `communications.send` serve al giorno in cui una segreteria
 * potra mandare comunicazioni senza poter vedere chi e in arretrato: oggi i
 * due permessi hanno lo stesso perimetro, domani potrebbero non averlo.
 */

const MANAGEMENT_FULL: readonly CommunicationPermission[] = [
  "communications.send",
  "communications.read_recipients",
  "communications.audience_economic",
  "automations.manage",
  "board.publish",
  "board.read",
  "rsvp.read",
];

/**
 * `collaborator` e `staff` leggono la bacheca e le risposte, ma **non mandano**
 * e **non configurano**: mandare un messaggio a nome della societa ha lo stesso
 * perimetro che gia protegge il sollecito degli insoluti (Wave 1, W1-F).
 * Allargarlo e una decisione di prodotto, da prendere esplicitamente.
 */
const PERMISSIONS_BY_ROLE: Record<
  CanonicalAccessRole,
  readonly CommunicationPermission[]
> = {
  owner: MANAGEMENT_FULL,
  club_manager: MANAGEMENT_FULL,
  collaborator: ["board.read", "rsvp.read"],
  staff: ["board.read", "rsvp.read"],
  /*
    L'allenatore legge le risposte perche e la ragione per cui l'RSVP esiste:
    sapere chi non ha risposto per poter chiamare qualcun altro. Il perimetro
    per gruppo operativo lo applica il chiamante, non questa matrice — qui si
    dice **se** puo leggere, non **quali**.
  */
  trainer: ["board.read", "rsvp.read"],
  parent: ["board.read", "rsvp.answer"],
  athlete: ["board.read", "rsvp.answer"],
};

export const listCommunicationPermissions = (
  role: string | null | undefined,
): readonly CommunicationPermission[] => {
  const normalized = normalizeAccessRole(role);
  if (!normalized) return [];

  /*
    Il perimetro gestionale si **chiede** invece di ricopiarlo: se un giorno
    `canManageClubConfiguration` si allargasse, questa matrice si allarga con
    lui invece di restare indietro. La riga sotto e l'unico punto in cui i due
    modelli si toccano.
  */
  if (canManageClubConfiguration(normalized)) return MANAGEMENT_FULL;

  return PERMISSIONS_BY_ROLE[normalized];
};

export const hasCommunicationPermission = (
  role: string | null | undefined,
  permission: CommunicationPermission,
) => {
  /*
    Wave 6, lane 6G. Matrice **privata**: le guardie di questo dominio non
    passano da `roleHasPermission`, e l elenco qui sopra **normalizza** il
    ruolo — cioe vede il ruolo base. Senza questa riga il restringimento di
    un ruolo personalizzato non arriverebbe fin qui, e una casella tolta
    nella schermata non toglierebbe niente.
  */
  const ristretto = narrowDomainPermission(role, permission, (base) =>
    PERMISSIONS_BY_ROLE[base].includes(permission),
  );
  if (ristretto !== null) return ristretto;

  return listCommunicationPermissions(role).includes(permission);
};

/**
 * Solleva se il ruolo non ha il permesso.
 *
 * Il messaggio contiene «Accesso negato» perche il route handler lo mappi su
 * 403: e la convenzione del repository (CLAUDE.md §8) e non e negoziabile.
 */
export const assertCommunicationPermission = (
  role: string | null | undefined,
  permission: CommunicationPermission,
) => {
  if (!hasCommunicationPermission(role, permission)) {
    throw new Error(
      `Accesso negato: il ruolo attivo non puo ${COMMUNICATION_PERMISSION_LABELS[
        permission
      ].toLowerCase()}`,
    );
  }
};
