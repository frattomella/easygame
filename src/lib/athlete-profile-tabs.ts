/**
 * Le sezioni della scheda atleta, come elenco.
 *
 * **Perche in `lib` e non nel componente** (WP-19, Blocco 8). L'elenco delle
 * sezioni e la struttura della pagina: e la prima cosa che si cerca quando si
 * deve capire dove sta una funzione, e finora era a riga 3.445 di ottomila.
 * Qui e leggibile in dieci secondi, e — non secondario — e verificabile: il
 * runner dei test non sa leggere i file `.tsx`, quindi ogni regola che deve
 * essere provata deve stare fuori dal componente che la usa.
 */

export const ATHLETE_PROFILE_TABS = [
  { value: "generale", label: "Generale" },
  { value: "contatti", label: "Contatti" },
  { value: "sanitari", label: "Dati Sanitari" },
  { value: "pagamenti", label: "Iscrizione" },
  { value: "abbigliamento", label: "Abbigliamento" },
  { value: "documenti", label: "Documenti" },
  { value: "analitiche", label: "Analitiche" },
  { value: "lavoro", label: "Lavoro e compensi" },
] as const;

export type AthleteProfileTabValue =
  (typeof ATHLETE_PROFILE_TABS)[number]["value"];

export const DEFAULT_ATHLETE_PROFILE_TAB: AthleteProfileTabValue = "generale";

/**
 * La sezione richiesta da `?tab=`, se e una di quelle che esistono.
 *
 * Un valore sconosciuto non apre una scheda vuota: riporta a «Generale». Un
 * indirizzo copiato da una versione precedente dell'applicazione deve
 * atterrare da qualche parte.
 */
export const resolveAthleteProfileTab = (
  requested?: string | null,
): AthleteProfileTabValue => {
  const normalized = String(requested || "")
    .trim()
    .toLowerCase();

  const match = ATHLETE_PROFILE_TABS.find((tab) => tab.value === normalized);
  return match ? match.value : DEFAULT_ATHLETE_PROFILE_TAB;
};

/* ────────────────────────────────────────────────────────────────────────── */
/*  Web V2 — le quattro aree della scheda (guideline 09 §9.8)                */
/* ────────────────────────────────────────────────────────────────────────── */

/**
 * Le otto schede della V1 sono diventate **quattro aree**: la striscia a nove
 * tab e vietata dal sistema (09 §9.8), e le vecchie schede sono sezioni dentro
 * le aree. L'elenco delle tab qui sopra resta perche i `?tab=` salvati nei
 * segnalibri e nelle email devono continuare ad atterrare da qualche parte.
 */
export const ATHLETE_RECORD_AREAS = [
  { value: "profilo", label: "Profilo" },
  { value: "attivita", label: "Attività sportiva" },
  { value: "amministrazione", label: "Amministrazione" },
  { value: "documenti", label: "Documenti e sanità" },
] as const;

export type AthleteRecordAreaValue =
  (typeof ATHLETE_RECORD_AREAS)[number]["value"];

export const DEFAULT_ATHLETE_RECORD_AREA: AthleteRecordAreaValue = "profilo";

/**
 * Gli ancoraggi delle sezioni: sono gli `id` dei blocchi in pagina, e servono
 * a due cose — atterrare da un `?tab=` vecchio, e saltare dalla striscia
 * degli avvisi al blocco che risolve il problema.
 */
export const ATHLETE_RECORD_SECTIONS = {
  anagrafica: "sezione-anagrafica",
  contatti: "sezione-contatti",
  famiglia: "sezione-famiglia",
  indirizzo: "sezione-indirizzo",
  datiPersonali: "dati-personali",
  categorie: "sezione-categorie",
  analitiche: "sezione-analitiche",
  abbigliamento: "sezione-abbigliamento",
  numeri: "sezione-numeri-maglia",
  kit: "sezione-kit",
  iscrizione: "sezione-iscrizione",
  tesseramenti: "sezione-tesseramenti",
  compensi: "sezione-compensi",
  certificati: "sezione-certificati",
  visite: "sezione-visite",
  attestati: "sezione-attestati",
  sanitaria: "sezione-anagrafica-sanitaria",
  identita: "sezione-documento-identita",
  allegatiIdentita: "sezione-allegati-identita",
  altriDocumenti: "sezione-altri-documenti",
  condivisi: "sezione-documenti-condivisi",
} as const;

export type AthleteRecordSectionId =
  (typeof ATHLETE_RECORD_SECTIONS)[keyof typeof ATHLETE_RECORD_SECTIONS];

export type AthleteRecordTarget = {
  area: AthleteRecordAreaValue;
  section: AthleteRecordSectionId | null;
};

/**
 * Dove e finita ogni scheda della V1. Una scheda → **una** area, e la prima
 * sezione che la rappresenta.
 */
export const ATHLETE_TAB_TO_AREA: Record<
  AthleteProfileTabValue,
  AthleteRecordTarget
> = {
  generale: { area: "profilo", section: ATHLETE_RECORD_SECTIONS.anagrafica },
  contatti: { area: "profilo", section: ATHLETE_RECORD_SECTIONS.contatti },
  sanitari: { area: "documenti", section: ATHLETE_RECORD_SECTIONS.certificati },
  pagamenti: {
    area: "amministrazione",
    section: ATHLETE_RECORD_SECTIONS.iscrizione,
  },
  abbigliamento: {
    area: "attivita",
    section: ATHLETE_RECORD_SECTIONS.abbigliamento,
  },
  documenti: { area: "documenti", section: ATHLETE_RECORD_SECTIONS.condivisi },
  analitiche: { area: "attivita", section: ATHLETE_RECORD_SECTIONS.analitiche },
  lavoro: { area: "amministrazione", section: ATHLETE_RECORD_SECTIONS.compensi },
};

const isRecordArea = (value: string): value is AthleteRecordAreaValue =>
  ATHLETE_RECORD_AREAS.some((area) => area.value === value);

/**
 * L'area (e la sezione) chiesta dall'indirizzo.
 *
 * Accetta sia il nome di un'area (`?tab=amministrazione`) sia una delle otto
 * schede della V1 (`?tab=pagamenti` → Amministrazione › Iscrizione). Un
 * valore sconosciuto ricade su «Profilo», come prima ricadeva su «Generale»:
 * un indirizzo vecchio deve atterrare da qualche parte, non su un errore.
 */
export const resolveAthleteRecordTarget = (
  requested?: string | null,
): AthleteRecordTarget => {
  const normalized = String(requested || "")
    .trim()
    .toLowerCase();

  if (isRecordArea(normalized)) {
    return { area: normalized, section: null };
  }

  const tab = ATHLETE_PROFILE_TABS.find((entry) => entry.value === normalized);
  if (tab) return ATHLETE_TAB_TO_AREA[tab.value];

  return { area: DEFAULT_ATHLETE_RECORD_AREA, section: null };
};
