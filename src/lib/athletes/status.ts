/**
 * **Lo stato di un atleta ha un vocabolario, e vive qui.**
 *
 * Prima della Wave 6 non viveva da nessuna parte. `athletes.status` e una
 * colonna `text` senza vincolo, i confronti erano `===` sparsi in tre file, e
 * la stessa pagina stampava **quattro etichette diverse per tre valori**:
 * `inactive` era «In Prestito» sulla riga, «Disattivati» sul filtro, «Atleti in
 * Prestito» nell'intestazione e «disattivato» nello stato vuoto.
 *
 * Da quel fatto solo discendevano due difetti veri:
 *
 * - il cliente vedeva quattro stati e ne esistevano tre, quindi due filtri
 *   diversi mostravano necessariamente lo stesso insieme;
 * - un'azione di massa scriveva in archivio `"activate"` — che non e uno stato —
 *   e quegli atleti sparivano da **ogni** filtro, «Attivi» compreso, perche
 *   nessun confronto poteva riconoscerli.
 *
 * ## Le due regole
 *
 * 1. **In lettura si normalizza, non si rifiuta.** Un valore che nessuno
 *    riconosce diventa `active`, cioe il default della colonna. Un atleta non
 *    puo sparire dall'elenco del suo club perche qualcuno ha scritto una
 *    stringa sbagliata: sparire e il difetto, non la protezione.
 * 2. **In scrittura si normalizza prima di toccare il database.** E la ragione
 *    per cui `"activate"` non puo tornare.
 *
 * Il modulo e **puro**: nessun import di Prisma, nessun `src/lib/server`. Lo
 * usano il browser e il server con lo stesso significato, che e esattamente
 * cio che mancava.
 */

/** I quattro stati che un atleta puo avere. Elenco chiuso. */
export type AthleteStatus = "active" | "suspended" | "loan" | "inactive";

/** Uno stato, oppure «tutti»: e cio che un filtro puo valere. */
export type AthleteStatusFilter = AthleteStatus | "all";

export const ATHLETE_STATUSES: readonly AthleteStatus[] = [
  "active",
  "suspended",
  "loan",
  "inactive",
];

export const ATHLETE_STATUS_FILTERS: readonly AthleteStatusFilter[] = [
  ...ATHLETE_STATUSES,
  "all",
];

/** Lo stato di un atleta appena creato, e il ripiego di ogni normalizzazione. */
export const DEFAULT_ATHLETE_STATUS: AthleteStatus = "active";

/** Come si chiama lo stato di **un** atleta. «Attivo», non «Attivi». */
export const ATHLETE_STATUS_LABELS: Record<AthleteStatus, string> = {
  active: "Attivo",
  suspended: "Sospeso",
  loan: "In prestito",
  inactive: "Disattivato",
};

/** Come si chiama un **insieme** di atleti in quello stato. Filtri e schede. */
export const ATHLETE_STATUS_PLURAL_LABELS: Record<AthleteStatus, string> = {
  active: "Attivi",
  suspended: "Sospesi",
  loan: "In prestito",
  inactive: "Disattivati",
};

/** L'intestazione di un elenco filtrato. */
export const ATHLETE_STATUS_HEADINGS: Record<AthleteStatusFilter, string> = {
  active: "Atleti attivi",
  suspended: "Atleti sospesi",
  loan: "Atleti in prestito",
  inactive: "Atleti disattivati",
  all: "Tutti gli atleti",
};

/**
 * Il tono con cui lo stato si disegna. Sta qui e non nei componenti perche i
 * quattro stati devono avere lo stesso colore ovunque compaiano: elenco,
 * scheda, dialogo di categoria, esportazione.
 */
export const ATHLETE_STATUS_TONE: Record<
  AthleteStatus,
  "success" | "warning" | "info" | "muted"
> = {
  active: "success",
  suspended: "warning",
  loan: "info",
  inactive: "muted",
};

/**
 * Le grafie che valgono come uno stato canonico.
 *
 * Comprende: l'inglese minuscolo che il database usa, l'italiano che qualche
 * schermata ha scritto negli anni, e i **valori sbagliati che sono davvero in
 * archivio** — `activate`, che era il nome di un'azione finito in una colonna
 * di stato. Riconoscerli qui e cio che li fa ricomparire nell'elenco.
 */
const ALIASES: Record<string, AthleteStatus> = {
  active: "active",
  activate: "active", // il difetto W6-03: nome di azione scritto come stato
  attivo: "active",
  attiva: "active",
  attivi: "active",
  enabled: "active",
  abilitato: "active",

  suspended: "suspended",
  suspend: "suspended",
  sospeso: "suspended",
  sospesa: "suspended",
  sospesi: "suspended",

  loan: "loan",
  "on_loan": "loan",
  "on-loan": "loan",
  prestito: "loan",
  "in_prestito": "loan",
  "in-prestito": "loan",
  "in prestito": "loan",

  inactive: "inactive",
  deactivate: "inactive", // gemello di `activate`, per la stessa ragione
  deactivated: "inactive",
  disabled: "inactive",
  inattivo: "inactive",
  inattiva: "inactive",
  disattivato: "inactive",
  disattivata: "inactive",
  disattivati: "inactive",
};

const chiave = (raw: unknown): string =>
  String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

/** `true` solo per uno dei quattro valori canonici. */
export const isAthleteStatus = (value: unknown): value is AthleteStatus =>
  ATHLETE_STATUSES.includes(chiave(value) as AthleteStatus);

/**
 * Porta qualunque cosa a uno dei quattro stati.
 *
 * Non fallisce mai, e il ripiego e `active`: vedi la regola 1 in testa al file.
 */
export const normalizeAthleteStatus = (raw: unknown): AthleteStatus =>
  ALIASES[chiave(raw)] ?? DEFAULT_ATHLETE_STATUS;

/**
 * Come sopra, ma dice **se** ha riconosciuto qualcosa.
 *
 * Serve a chi deve distinguere «non e stato indicato uno stato» da «e stato
 * indicato uno stato che non esiste»: la prima cosa e legittima in un `PATCH`
 * parziale, la seconda e un errore del chiamante.
 */
export const parseAthleteStatus = (raw: unknown): AthleteStatus | null =>
  ALIASES[chiave(raw)] ?? null;

/** Il filtro di un elenco. Ripiego: `all`, che non nasconde niente. */
export const normalizeAthleteStatusFilter = (
  raw: unknown,
): AthleteStatusFilter => {
  const k = chiave(raw);
  if (k === "all" || k === "tutti" || k === "") return "all";
  return ALIASES[k] ?? "all";
};

/**
 * Tutte le grafie che una query deve accettare per trovare uno stato.
 *
 * Il database contiene le righe scritte prima di questo modulo. La migrazione
 * `wave6_stato_atleta` corregge quelle che conosciamo, ma un filtro che
 * cercasse **solo** il valore canonico continuerebbe a non trovare cio che una
 * versione futura, o un import, scrivessero in un'altra grafia. Cercarle tutte
 * costa un `IN` e chiude la classe di difetto invece di una sua istanza.
 */
export const athleteStatusQueryValues = (
  status: AthleteStatus,
): readonly string[] =>
  Object.keys(ALIASES).filter((alias) => ALIASES[alias] === status);

/**
 * Le transizioni che un'azione di massa puo chiedere.
 *
 * Esiste perche il difetto W6-03 nasceva dall'aver usato il nome dell'azione
 * come valore di stato. Qui i due vocabolari sono separati e la traduzione e
 * esplicita.
 */
export const ATHLETE_BULK_STATUS_ACTIONS = {
  activate: "active",
  suspend: "suspended",
  loan: "loan",
  deactivate: "inactive",
} as const satisfies Record<string, AthleteStatus>;

export type AthleteBulkStatusAction = keyof typeof ATHLETE_BULK_STATUS_ACTIONS;
