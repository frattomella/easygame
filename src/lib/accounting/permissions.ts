import { normalizeAccessRole, type CanonicalAccessRole } from "@/lib/access-roles";

/**
 * Chi puo fare cosa in contabilita. **Una volta sola.**
 *
 * **Perche sta nella barriera.** La Wave 2 ha imparato che quattro copie della
 * stessa matrice restano indietro in silenzio: la si scrive prima di aprire le
 * lane, e le lane la importano. La Wave 3 ha imparato la seconda meta della
 * lezione (W3-14): **la matrice della pagina e quella della rotta devono essere
 * la stessa**, altrimenti una porta risponde `403` e l'altra `200`.
 *
 * **Il difetto che questa matrice chiude.** Oggi `/movements` non e riservata a
 * proprietario e gestore: passano anche staff e collaboratore. Ma la pagina non
 * usa le rotte dei movimenti — legge via `clubs`, che **e** admin-only, e
 * `getClubData` inghiotte il 403 restituendo un array vuoto. Risultato
 * osservabile: un collaboratore apre la prima nota, la pagina si carica senza
 * errori e **mostra tutto a zero**; ogni salvataggio fallisce con un messaggio
 * generico. E la terza porta — il CRUD generico su `transactions` e `transfers`
 * — rispondeva `200` e permetteva di cancellare.
 *
 * **Nessun ruolo nuovo.** Il brief lo vieta e ha ragione: il prodotto ha gia
 * quattro ruoli gestionali e nessuna evidenza che un club li usi tutti.
 * Aggiungere un tesoriere prima che qualcuno lo chieda e la strada che ha
 * prodotto le trentaquattro automazioni di Golee. Cio che serve si ottiene con
 * i permessi granulari, e in particolare con **una** separazione:
 *
 * > **Registrare non e stornare.** Chi tiene la cassa registra; chi corregge un
 * > errore di denaro e la direzione.
 *
 * E la stessa separazione che il lavoro sportivo fa gia fra `sport_work.manage`
 * e `sport_work.pay`, e non e formale: uno storno riscrive un fatto contabile
 * gia registrato, e deve avere un nome sopra.
 *
 * Modulo **puro** e client-safe: nessun Prisma, nessuna rete, nessun DOM. Lo
 * importano sia le rotte sia le schermate, perche un pulsante che si vede e poi
 * risponde 403 e un difetto quanto una porta aperta.
 */

export type AccountingPermission =
  | "accounting.read"
  | "accounting.manage"
  | "accounting.reconcile"
  | "accounting.reverse"
  | "accounting.export"
  | "accounting.accounts_read"
  | "accounting.accounts_manage"
  | "accounting.causes_manage";

export const ACCOUNTING_PERMISSIONS: readonly AccountingPermission[] = [
  "accounting.read",
  "accounting.manage",
  "accounting.reconcile",
  "accounting.reverse",
  "accounting.export",
  "accounting.accounts_read",
  "accounting.accounts_manage",
  "accounting.causes_manage",
] as const;

export const ACCOUNTING_PERMISSION_LABELS: Record<AccountingPermission, string> = {
  "accounting.read": "Vedere la prima nota e il riepilogo gestionale",
  "accounting.manage": "Registrare movimenti e giroconti",
  "accounting.reconcile": "Spuntare i movimenti contro l'estratto conto",
  "accounting.reverse": "Stornare un movimento gia registrato",
  "accounting.export": "Esportare la contabilita per il commercialista",
  "accounting.accounts_read": "Vedere i conti finanziari e i loro saldi",
  "accounting.accounts_manage": "Creare, rinominare e archiviare un conto finanziario",
  "accounting.causes_manage": "Configurare le causali e la loro classificazione",
};

/**
 * Il perimetro amministrativo: proprietario e gestore.
 *
 * Tutto cio che sta qui e gia riservato altrove nel prodotto — conti correnti,
 * metodi di pagamento, configurazione societaria, compensi — e la contabilita
 * non e meno sensibile di quelli.
 */
const AMMINISTRAZIONE: readonly AccountingPermission[] = [
  "accounting.read",
  "accounting.manage",
  "accounting.reconcile",
  "accounting.reverse",
  "accounting.export",
  "accounting.accounts_read",
  /*
    **Perche un permesso distinto da `accounts_read`**, anche se oggi entrambi
    finiscono nello stesso perimetro.

    Non e simmetria per gusto: fu la lane W4-A a chiederlo, avendo dovuto usare
    il permesso di **lettura** come gate di una **scrittura** perche l'altro non
    esisteva. Funzionava — stessi ruoli — e diceva la cosa sbagliata a chi
    legge il codice, che e il modo in cui un permesso finisce allargato per
    distrazione il giorno in cui la lettura viene concessa a qualcuno in piu.

    Il giorno in cui una segreteria dovra vedere i saldi senza poter creare
    conti, questa riga esiste gia e la matrice cambia in un punto solo.
  */
  "accounting.accounts_manage",
  "accounting.causes_manage",
];

/**
 * Il perimetro della segreteria.
 *
 * **Cosa ha**: vede la prima nota, registra un movimento, spunta l'estratto
 * conto. E il lavoro di tutti i giorni di chi tiene la cassa, e negarglielo
 * significa che lo fara qualcun altro con le sue credenziali.
 *
 * **Cosa non ha**, e perche:
 * - lo **storno**, per la separazione scritta in testa al modulo;
 * - i **saldi dei conti**, che stanno nello stesso perimetro degli estremi
 *   bancari, gia riservato oggi;
 * - l'**export contabile**, che e una fotografia completa dei conti del club e
 *   lascia l'applicazione in un file;
 * - le **causali**, perche cambiarne la classificazione cambia la natura
 *   fiscale di cio che si registrera dopo. E configurazione, non operativita.
 */
const SEGRETERIA: readonly AccountingPermission[] = [
  "accounting.read",
  "accounting.manage",
  "accounting.reconcile",
];

const PERMESSI_PER_RUOLO: Record<
  CanonicalAccessRole,
  readonly AccountingPermission[]
> = {
  owner: AMMINISTRAZIONE,
  club_manager: AMMINISTRAZIONE,
  collaborator: SEGRETERIA,
  staff: SEGRETERIA,
  /*
    L'allenatore non vede la contabilita, e la voce di menu non deve nemmeno
    comparire: una pagina che nega e piu onesta di una assente solo per chi
    aveva ragione di aspettarsela.
  */
  trainer: [],
  parent: [],
  athlete: [],
};

export const listAccountingPermissions = (
  role: string | null | undefined,
): readonly AccountingPermission[] => {
  const normalized = normalizeAccessRole(role);
  return normalized ? PERMESSI_PER_RUOLO[normalized] : [];
};

export const hasAccountingPermission = (
  role: string | null | undefined,
  permission: AccountingPermission,
) => listAccountingPermissions(role).includes(permission);

/**
 * Solleva se il ruolo non ha il permesso.
 *
 * Il messaggio contiene «Accesso negato» perche il route handler lo mappi su
 * 403 — e la convenzione del repository — e **dice quale azione ha negato**,
 * perche il difetto che la Wave 3 ha misurato non era solo il 403: era il 403
 * senza motivo, che manda la segreteria a cercare un errore nei dati.
 */
export const assertAccountingPermission = (
  role: string | null | undefined,
  permission: AccountingPermission,
) => {
  if (!hasAccountingPermission(role, permission)) {
    throw new Error(
      `Accesso negato: il ruolo attivo non puo ${ACCOUNTING_PERMISSION_LABELS[
        permission
      ].toLowerCase()}`,
    );
  }
};

/** Vero se il ruolo puo aprire la prima nota. Governa anche la voce di menu. */
export const canOpenAccounting = (role: string | null | undefined) =>
  hasAccountingPermission(role, "accounting.read");
