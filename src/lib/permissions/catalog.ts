import { normalizeAccessRole, type CanonicalAccessRole } from "@/lib/access-roles";

/**
 * **Il catalogo unico delle chiavi di permesso.**
 *
 * ---
 *
 * ## Il difetto che chiude (W5-70)
 *
 * EasyGame aveva **tre generazioni di permessi** una accanto all'altra:
 *
 * 1. i domini nati con una matrice — `sport-work/permissions.ts`,
 *    `communications`, `accounting`, e da questa Wave `health/permissions.ts`:
 *    chiave, etichetta, ruolo per ruolo, default negato;
 * 2. una quindicina di **predicati booleani senza chiave** — `documents/`,
 *    `members/`, `attachment-permissions` — che compongono altri permessi ma
 *    non si possono ne elencare, ne mostrare, ne assegnare;
 * 3. un flag di **interfaccia** che nasceva acceso e viveva solo nel browser
 *    (`viewMedicalStatus`), chiuso in 5A.
 *
 * La differenza non e estetica. Una chiave si puo **elencare** — e quindi
 * mostrare in una schermata di configurazione — e si puo **assegnare** — e
 * quindi leggere da un motore di ruoli personalizzati. Un predicato booleano
 * senza chiave no: esiste solo per chi legge il codice.
 *
 * ## Perche il catalogo e qui e le matrici stanno nei domini
 *
 * CLAUDE.md §2: un dominio ha un punto di ingresso unico. La matrice del
 * lavoro sportivo la decide il lavoro sportivo; quella del dato sanitario, il
 * modulo sanitario. Qui vive **l'elenco**, cioe la cosa che serve a una
 * schermata di configurazione e a un motore di ruoli: quali chiavi esistono,
 * come si chiamano per un essere umano, e a quale dominio appartengono.
 *
 * L'assertion di caricamento e la stessa difesa di `RESOURCE_BOUNDARIES`: un
 * dominio che aggiunge una chiave e non la dichiara **non fa caricare il
 * modulo**. E la sola difesa che non chiede a nessuno di ricordarsi.
 *
 * ## Cosa questo modulo NON e
 *
 * Non e un motore di ruoli personalizzati, e non ne e l'inizio scritto di
 * sfuggita. Non c'e nessuna tabella, nessuna concessione per membership,
 * nessuna revoca. E la **forma** che un motore di ruoli potra leggere senza
 * essere riscritto — e il presidio che rende la Wave 6 un'aggiunta e non un
 * rifacimento.
 *
 * Modulo **puro** e client-safe: nessun Prisma, nessuna rete, nessun DOM.
 */

export type PermissionDomain =
  | "accounting"
  | "communications"
  | "consents"
  | "documents"
  | "events"
  | "health"
  | "members"
  | "sport_work";

export type PermissionEntry = {
  key: string;
  domain: PermissionDomain;
  label: string;
  /** I ruoli canonici che hanno la chiave **per ruolo**. */
  roles: readonly CanonicalAccessRole[];
  /**
   * Vero quando la chiave si ottiene anche — o soltanto — dal **legame**
   * (genitore-atleta, oppure assegnazione), e non dal ruolo. Nella matrice
   * della Wave 5 e il simbolo `⛓`.
   */
  byLink?: boolean;
};

const DIREZIONE: readonly CanonicalAccessRole[] = ["owner", "club_manager"];
const GESTIONE: readonly CanonicalAccessRole[] = [
  "owner",
  "club_manager",
  "collaborator",
  "staff",
];

/**
 * Le chiavi che la Wave 5 mette in catalogo.
 *
 * `sport_work.*`, `communications.*` e `accounting.*` hanno gia una matrice
 * propria e ben fatta: compaiono qui **come elenco**, e la loro autorita resta
 * il modulo di dominio. Le chiavi `documents.*`, `consents.*`, `members.*` e
 * `clinical.*` nascono qui come chiavi, ed erano predicati senza nome.
 */
const ENTRIES: readonly PermissionEntry[] = [
  /* ------------------------------------------------ documenti e modelli --- */
  {
    key: "documents.templates.manage",
    domain: "documents",
    label: "Creare, modificare, pubblicare e ritirare un modello di documento",
    roles: DIREZIONE,
  },
  {
    key: "documents.templates.read",
    domain: "documents",
    label: "Vedere l'elenco dei modelli e il loro contenuto",
    roles: GESTIONE,
  },
  {
    key: "documents.generate",
    domain: "documents",
    label: "Generare un documento da un modello",
    roles: GESTIONE,
  },
  {
    key: "documents.generated.read",
    domain: "documents",
    label: "Rileggere un documento gia generato",
    roles: GESTIONE,
  },
  {
    key: "documents.generated.advance",
    domain: "documents",
    label: "Caricare la copia firmata e portare avanti lo stato del documento",
    roles: GESTIONE,
  },

  /* -------------------------------------------------------- consensi ----- */
  {
    key: "consents.definitions.manage",
    domain: "consents",
    label: "Definire un consenso e pubblicarne le versioni",
    roles: DIREZIONE,
  },
  {
    key: "consents.decide_for_others",
    domain: "consents",
    label: "Registrare un'accettazione o una revoca per conto di qualcuno",
    roles: GESTIONE,
  },
  {
    key: "consents.records.read",
    domain: "consents",
    label: "Leggere lo stato dei consensi del club",
    roles: GESTIONE,
  },

  /* -------------------------------------------------------- libro soci --- */
  {
    key: "members.register.manage",
    domain: "members",
    label: "Registrare un'ammissione, una cessazione o una riammissione",
    roles: DIREZIONE,
  },
  {
    key: "members.register.read",
    domain: "members",
    label: "Leggere il libro soci e lo storico di un socio",
    roles: GESTIONE,
  },

  /* ------------------------------------------------------ dato sanitario - */
  {
    key: "clinical.status_read",
    domain: "health",
    label:
      "Vedere se il certificato medico e valido, in scadenza o scaduto",
    roles: [...GESTIONE, "trainer"],
    byLink: true,
  },
  {
    key: "clinical.read",
    domain: "health",
    label:
      "Vedere il contenuto clinico: allergie, patologie, farmaci, gruppo sanguigno e il file del certificato",
    roles: GESTIONE,
    byLink: true,
  },
  {
    key: "clinical.manage",
    domain: "health",
    label: "Registrare e modificare certificati e dati sanitari",
    roles: GESTIONE,
  },

  /* ------------------------------------------------- lavoro sportivo ----- */
  {
    key: "sport_work.manage",
    domain: "sport_work",
    label:
      "Creare e modificare rapporti, piani, premi, rimborsi e adempimenti",
    roles: DIREZIONE,
  },
  {
    key: "sport_work.read",
    domain: "sport_work",
    label: "Vedere i rapporti e i compensi di tutto il club",
    roles: DIREZIONE,
  },
  {
    key: "sport_work.read_own",
    domain: "sport_work",
    label: "Vedere i propri compensi",
    roles: [...GESTIONE, "trainer", "athlete"],
  },
  {
    key: "sport_work.pay",
    domain: "sport_work",
    label: "Registrare e stornare erogazioni",
    roles: DIREZIONE,
  },
  {
    key: "sport_work.fiscal",
    domain: "sport_work",
    label: "Vedere e preparare i dati contributivi e fiscali (F24, CU)",
    roles: DIREZIONE,
  },
];

const BY_KEY = new Map(ENTRIES.map((entry) => [entry.key, entry]));

/**
 * **Nessuna chiave duplicata, nessuna chiave senza etichetta.**
 *
 * Vive qui e non in un test perche un test si puo dimenticare di aggiornare:
 * questo modulo **non si carica** se il catalogo si contraddice.
 */
const assertCatalogoCoerente = () => {
  if (BY_KEY.size !== ENTRIES.length) {
    throw new Error(
      "Catalogo dei permessi con chiavi duplicate: ogni chiave compare una volta sola",
    );
  }

  const senzaEtichetta = ENTRIES.filter((entry) => !entry.label.trim());
  if (senzaEtichetta.length) {
    throw new Error(
      `Chiavi di permesso senza etichetta: ${senzaEtichetta
        .map((entry) => entry.key)
        .join(", ")}. Una chiave che nessuno sa leggere non e configurabile.`,
    );
  }
};
assertCatalogoCoerente();

export const PERMISSION_CATALOG: readonly PermissionEntry[] = ENTRIES;

export const listPermissionKeys = () => ENTRIES.map((entry) => entry.key);

export const getPermissionEntry = (key: string) => BY_KEY.get(key) || null;

export const getPermissionLabel = (key: string) =>
  BY_KEY.get(key)?.label || key;

/**
 * Vero se il **ruolo** porta la chiave.
 *
 * Non risponde al legame: una chiave `byLink` la concede la rotta che risolve
 * il legame, e questa funzione risponde `false` — che e il verso giusto in cui
 * sbagliare. I due permessi non sono lo stesso permesso.
 */
export const roleHasPermission = (
  role: string | null | undefined,
  key: string,
) => {
  const normalized = normalizeAccessRole(role);
  if (!normalized) return false;

  const entry = BY_KEY.get(key);
  if (!entry) return false;

  return entry.roles.includes(normalized);
};

/** Tutte le chiavi che un ruolo porta, per una schermata di configurazione. */
export const listPermissionsForRole = (role: string | null | undefined) => {
  const normalized = normalizeAccessRole(role);
  if (!normalized) return [] as PermissionEntry[];

  return ENTRIES.filter((entry) => entry.roles.includes(normalized));
};

/** Le chiavi di un dominio, per elencarle raggruppate. */
export const listPermissionsForDomain = (domain: PermissionDomain) =>
  ENTRIES.filter((entry) => entry.domain === domain);
