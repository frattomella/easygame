export type CanonicalAccessRole =
  | "owner"
  | "club_manager"
  | "collaborator"
  | "staff"
  | "trainer"
  | "parent"
  | "athlete";

export type AccessArea =
  | "account"
  | "management"
  | "trainer"
  | "parent"
  | "athlete"
  | "public";

export type ResourceAction = "read" | "create" | "update" | "delete";

const ROLE_ALIASES: Record<string, CanonicalAccessRole> = {
  owner: "owner",
  proprietario: "owner",
  proprietaria: "owner",
  club_creator: "owner",
  "club-creator": "owner",
  admin: "club_manager",
  administrator: "club_manager",
  amministratore: "club_manager",
  manager: "club_manager",
  club_manager: "club_manager",
  "club-manager": "club_manager",
  gestore: "club_manager",
  collaborator: "collaborator",
  collaboratore: "collaborator",
  collaboratrice: "collaborator",
  collaboratoree: "collaborator",
  member: "collaborator",
  membro: "collaborator",
  staff: "staff",
  segreteria: "staff",
  secretariat: "staff",
  secretary: "staff",
  trainer: "trainer",
  coach: "trainer",
  allenatore: "trainer",
  allenatrice: "trainer",
  parent: "parent",
  guardian: "parent",
  genitore: "parent",
  tutore: "parent",
  tutor: "parent",
  athlete: "athlete",
  atleta: "athlete",
  player: "athlete",
  giocatore: "athlete",
  giocatrice: "athlete",
};

const MANAGEMENT_ROLES = new Set<CanonicalAccessRole>([
  "owner",
  "club_manager",
  "collaborator",
  "staff",
]);

/* ===================================================================== */
/*  I ruoli personalizzati di club (Wave 6, lane 6G, blocker W6-1)        */
/* ===================================================================== */

/**
 * **Il prefisso, e perche il ruolo base sta dentro il nome.**
 *
 * `organization_users.role` e **testo libero**, e qualunque stringa che questa
 * tabella non riconosce diventa `""` in lettura, cioe accesso negato. Un ruolo
 * di club deve quindi (a) non poter collidere con un canonico e (b) restare
 * leggibile in archivio: da qui il prefisso `custom:` chiesto dal piano (§9.1).
 *
 * A quel prefisso questa implementazione aggiunge **il ruolo base**:
 *
 *     custom:collaborator:segreteria
 *
 * Non e un vezzo. Senza la base nel nome, la stringa non e **autodescrittiva**:
 * `normalizeAccessRole` — che e il funnel di ogni controllo di questo file, del
 * catalogo dei permessi, delle guardie di rotta e del browser — non avrebbe modo
 * di sapere che cosa quel ruolo sia, e risponderebbe `""`. Il giorno
 * dell'assegnazione, la persona perderebbe **ogni** accesso: la migrazione non
 * sarebbe additiva, sarebbe una porta che si chiude. Con la base dentro, ogni
 * controllo gia scritto continua a funzionare e risponde **al massimo** quanto
 * risponderebbe al ruolo base — mai di piu. Il «mai di piu» e l'invariante di
 * sicurezza di tutto il meccanismo (§10.1 del piano).
 *
 * `owner` **non** e una base ammessa: la proprieta non e un modello da clonare,
 * e la sua distinzione e strutturale (`clubs.creator_id`). `parent` e `athlete`
 * nemmeno: i loro permessi nascono dal **legame** con un atleta, e un ruolo che
 * li imitasse prometterebbe un accesso che nessuna rotta gli darebbe.
 */
export const CUSTOM_ROLE_PREFIX = "custom:";

export const CUSTOM_ROLE_BASE_ROLES: readonly CanonicalAccessRole[] = [
  "club_manager",
  "collaborator",
  "staff",
  "trainer",
];

const CUSTOM_ROLE_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const CUSTOM_ROLE_TOKEN_SEPARATOR = "#";

export type CustomRoleReference = {
  /** La parte stabile, quella che finisce in archivio. */
  slug: string;
  baseRole: CanonicalAccessRole;
  /** L'ultimo segmento dello slug: `segreteria`. */
  name: string;
  /**
   * Le chiavi di catalogo concesse, quando il gettone e stato **risolto** dal
   * server. Un valore letto dall'archivio non le porta: l'elenco e vuoto, e
   * l'elenco vuoto nega tutto — che e il verso giusto in cui sbagliare.
   */
  permissions: readonly string[];
};

/** Da «Segreteria e iscrizioni» a `segreteria-e-iscrizioni`. */
export const slugifyCustomRoleName = (name: string) =>
  String(name || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");

export const buildCustomRoleSlug = (
  baseRole: string | null | undefined,
  name: string,
) => {
  const base = CUSTOM_ROLE_BASE_ROLES.find(
    (ruolo) => ruolo === normalizeAccessRole(baseRole),
  );
  const coda = slugifyCustomRoleName(name);
  if (!base || !coda) return "";
  return `${CUSTOM_ROLE_PREFIX}${base}:${coda}`;
};

/**
 * Legge uno slug — o un gettone di sessione — e ne ricava base, nome e chiavi.
 *
 * Torna `null` per qualunque cosa non sia un ruolo personalizzato ben formato:
 * una base sconosciuta, una base non ammessa, uno slug con caratteri strani.
 * Il chiamante che riceve `null` ricade sul dizionario dei canonici, e se
 * nemmeno quello riconosce la stringa nega.
 */
export const parseCustomRoleValue = (
  value: string | null | undefined,
): CustomRoleReference | null => {
  const testo = String(value || "").trim().toLowerCase();
  if (!testo.startsWith(CUSTOM_ROLE_PREFIX)) return null;

  const [stabile, chiaviGrezze] = testo.split(CUSTOM_ROLE_TOKEN_SEPARATOR);
  const segmenti = stabile.slice(CUSTOM_ROLE_PREFIX.length).split(":");
  if (segmenti.length !== 2) return null;

  const [base, name] = segmenti;
  const baseRole = CUSTOM_ROLE_BASE_ROLES.find((ruolo) => ruolo === base);
  if (!baseRole) return null;
  if (!CUSTOM_ROLE_SLUG_PATTERN.test(name)) return null;

  return {
    slug: stabile,
    baseRole,
    name,
    permissions: String(chiaviGrezze || "")
      .split(",")
      .map((chiave) => chiave.trim())
      .filter(Boolean),
  };
};

export const isCustomRoleValue = (value: string | null | undefined) =>
  Boolean(parseCustomRoleValue(value));

/**
 * **Il gettone di sessione: effimero, e per questo puo portare le chiavi.**
 *
 * Lo costruisce `resolveOrganizationScopeForUser` a ogni richiesta e vive
 * quanto la richiesta. Non e mai una colonna: in `organization_users.role` sta
 * lo **slug** e basta, e le chiavi stanno nelle loro righe.
 *
 * Portarle nel ruolo attivo e cio che rende il restringimento **vero ovunque**
 * senza riscrivere le quindici guardie di dominio: tutte chiedono
 * `roleHasPermission(scope.activeRole, chiave)`, e passando di qui la domanda
 * riceve la risposta ristretta invece di quella del ruolo base.
 *
 * Il gettone finisce anche in `audit_logs.actor_role`, ed e un vantaggio, non
 * un effetto collaterale: la riga dice con **quali** chiavi l'atto e stato
 * compiuto, e non solo da quale etichetta di ruolo.
 */
export const encodeCustomRoleToken = (
  slug: string,
  permissions: readonly string[] = [],
) => {
  const riferimento = parseCustomRoleValue(slug);
  if (!riferimento) return "";
  const chiavi = Array.from(
    new Set(permissions.map((chiave) => String(chiave || "").trim()).filter(Boolean)),
  ).sort();
  return `${riferimento.slug}${CUSTOM_ROLE_TOKEN_SEPARATOR}${chiavi.join(",")}`;
};

/** Lo slug stabile di un gettone, per confrontarlo con l'archivio. */
export const stableCustomRoleSlug = (value: string | null | undefined) =>
  parseCustomRoleValue(value)?.slug || "";

const MANAGEMENT_PATH_PREFIXES = [
  /*
    Il registro di audit (WP-16). Sta fra i percorsi gestionali e **non** fra
    quelli riservati alla direzione, ed e una scelta: chi decide qui e la chiave
    `audit.read`, non il prefisso.

    Metterlo fra gli amministrativi lo avrebbe chiuso a ogni ruolo diverso da
    proprietario e gestore **prima** che la chiave potesse dire la sua, e un
    ruolo personalizzato a cui il club concede la lettura del registro avrebbe
    trovato una porta chiusa dal browser con la rotta che rispondeva 200. Due
    serrature che dicono cose diverse sono gia rotte prima che qualcuno trovi
    come aprirle.
  */
  "/audit",
  /* Il calendario unico: allenamenti e gare insieme (ADR-0098). */
  "/calendar",
  "/dashboard",
  "/athletes",
  "/categories",
  "/clothing",
  /*
    Le comunicazioni verso le famiglie stanno nell'area gestionale, e il
    prefisso amministrativo qui sotto le restringe a proprietario e gestore: e
    lo stesso perimetro che gia protegge il sollecito degli insoluti, perche
    mandare un messaggio a nome della societa non e meno impegnativo che
    chiedere dei soldi.
  */
  "/communications",
  /*
    Consensi. Sta fra i percorsi gestionali e **non** fra quelli riservati alla
    direzione: definire un consenso e configurazione societaria, ma registrare
    che una famiglia lo ha dato — o revocato — e un gesto che la segreteria fa
    tutti i giorni con un foglio in mano (§13 del documento 35). Il permesso
    fine lo applica `src/lib/documents/permissions.ts`.
  */
  "/consensi",
  "/hub",
  "/matches",
  "/medical",
  /*
    Modulistica resta **gestionale e non riservata alla direzione**, ed e una
    decisione presa due volte.

    La Wave 3 l'aveva chiusa a proprietario e gestore per riparare `W3-14`:
    collaboratore e staff potevano riscrivere i modelli societari e non
    potevano generare un documento. Ma il difetto vero erano le **rotte**, e
    quelle adesso sono chiuse dove serve — un modello lo scrive
    `canManageDocumentTemplates`, cioe la direzione — mentre chiudere anche la
    pagina rendeva irraggiungibili quattro righe della matrice del §13:
    vedere i modelli, generare cio che non porta dati delicati, la generazione
    massiva, rileggere i propri documenti.

    L'audit di fine Wave lo ha misurato: il collaboratore vedeva la voce nel
    menu, ci cliccava, e finiva sulla dashboard **senza una parola**. Un
    permesso che il server concede e che nessuna schermata sa esercitare non e
    un permesso: e una riga di documentazione.
  */
  /*
    **Due schermate di segreteria che si classificavano `public`.**

    `/appuntamenti` e `/documenti` nascono nella Wave 6, montano
    `AccessAreaGuard` e sono nei percorsi protetti del middleware: sembravano
    a posto da ogni lato che qualcuno guardasse. Ma la guardia chiede l'area a
    `getPathAccessArea`, che le trovava fuori da questo elenco e rispondeva
    `public` — e per `public` `canAccessPath` **ritorna sempre `true`**.

    Il risultato: un genitore o un atleta con una sessione valida apriva la
    struttura di due schermate della segreteria. I dati non uscivano — le rotte
    hanno le loro guardie — ma una guardia che dice sempre di si non e una
    guardia, ed e la meta del percorso in cui nessuno stava guardando.

    Il presidio che le sorvegliava verificava guscio e prefisso del middleware,
    non la **classificazione**: e per questo non lo ha visto. Adesso verifica
    anche quella.
  */
  "/appuntamenti",
  "/documenti",
  "/modulistica",
  "/movements",
  "/notifications",
  "/onboarding",
  "/organization",
  "/payments",
  "/permissions",
  "/procura",
  "/registration-management",
  "/reports",
  "/secretariat",
  "/settings",
  "/soci",
  "/sponsors",
  "/sport-work",
  "/staff",
  "/structures",
  "/trainers",
  "/training",
] as const;

const MANAGEMENT_ADMIN_ONLY_PATH_PREFIXES = [
  "/communications",
  "/create-club",
  "/dashboard/access-management",
  // La configurazione iniziale scrive dati societari: stesso perimetro di
  // /organization, quindi proprietario e club manager.
  "/onboarding",
  "/organization",
  "/permissions",
  "/settings",
  /*
    Lavoro sportivo: dice quanto guadagna una persona. Il perimetro coincide
    con quello che gia protegge conti correnti e configurazione societaria, e
    lo dichiara **anche qui** e non solo nei permessi del dominio: una guardia
    di rotta che non lo sapesse lascerebbe aprire la pagina a un collaboratore,
    che poi la troverebbe piena di errori 403 invece di una frase che spiega.
  */
  "/sport-work",
] as const;

const MANAGEMENT_ADMIN_ONLY_RESOURCES = new Set([
  "access_tokens",
  "bank_accounts",
  "clubs",
  /*
    L'altra meta di W3-14. Chiudere la **pagina** senza chiudere la **rotta**
    avrebbe spostato il difetto invece di risolverlo: il CRUD generico e
    raggiungibile senza passare da nessuna schermata, ed e da li che la sonda
    a runtime ha ottenuto i suoi `200` su creazione, modifica e cancellazione.

    Le due porte rispondevano anche diversamente in lettura —
    `GET /api/v1/document_templates` dava `200` a un collaboratore,
    `GET /api/v1/clubs?fields=…` dava `403` allo stesso — e due porte che
    rispondono diversamente sulla stessa cosa sono un difetto anche quando
    nessuna delle due e sbagliata da sola.
  */
  "document_templates",
  "organizations",
  "organization_users",
  "payment_methods",
  /*
    **Il lavoro sportivo, come risorsa e non solo come pagina.**

    `/sport-work` era gia fra i prefissi riservati qui sopra, e i permessi del
    dominio danno a collaboratore e segreteria il solo `sport_work.read_own`.
    Ma la risorsa non era dichiarata, e `canAccessClubResource` risponde `true`
    a segreteria e collaboratore per **qualunque** nome che non sia in questo
    elenco. Gli allegati ereditano il permesso da cio a cui sono attaccati, e
    per il lavoro sportivo ereditavano quindi un permesso che non esisteva:
    respinti da `/api/v1/sport-work/people`, gli stessi documenti — documento
    d'identita, autocertificazione, **coordinate bancarie** di ogni
    collaboratore — si ottenevano dalla rotta generica degli allegati chiedendo
    `owner_type=sport_work_person`, e si potevano riscrivere e cancellare.

    La pagina e la rotta lo sapevano; la matrice no. E la matrice e il posto in
    cui questa cosa va detta una volta per tutte le porte.
  */
  "sport_work",
  "users",
]);

/**
 * Le risorse la cui **cancellazione** e riservata a proprietario e gestore,
 * anche quando lettura e scrittura restano aperte alla segreteria.
 *
 * **Il difetto che chiude (D-1).** `payments` e il suo alias
 * `simplified_payments` non erano fra le risorse riservate, e non dovevano
 * esserlo: la segreteria le rate le vede e le registra tutti i giorni. Ma
 * `payment_transactions.payment_id -> payments.id` e `ON DELETE CASCADE`,
 * quindi `DELETE /api/v1/simplified_payments/:id` cancellava la rata **e a
 * cascata tutti i suoi incassi, storni e rimborsi** — da un ruolo che non ha
 * il permesso di registrarne uno.
 *
 * Chiudere l'intera risorsa avrebbe spostato il difetto invece di risolverlo:
 * avrebbe tolto alla segreteria il lavoro che le compete. La distinzione che
 * serve e fra i **verbi**, ed e la stessa che il lavoro sportivo fa gia fra
 * `sport_work.manage` e `sport_work.pay`: registrare non e distruggere.
 *
 * La guardia di dominio in `resources.ts` e l'altra meta, e non e ridondante:
 * questa dice **chi**, quella dice **cosa** — una rata con storia economica
 * non si cancella nemmeno per il proprietario.
 */
const MANAGEMENT_ADMIN_ONLY_DELETE_RESOURCES = new Set([
  "athlete_payments",
  "invoices",
  "payment_transactions",
  "payments",
  "receipts",
  "simplified_payments",
]);

/**
 * **Le risorse che segreteria e collaboratore possono davvero toccare.**
 *
 * Elenco esplicito, e non «tutto cio che non e riservato»: e la differenza fra
 * una matrice che ha deciso e una che non sa di non aver deciso (W5-71).
 *
 * Non coincide con `RESOURCE_CONFIG`: qui compaiono anche nomi di **dominio**
 * che il registro generico non serve — `forms` per i moduli online — perche
 * `canAccessClubResource` e la porta che gli allegati interrogano ereditando
 * il permesso da cio a cui sono attaccati
 * (`src/lib/server/attachment-permissions.ts`).
 *
 * Chi aggiunge una risorsa al registro e non la dichiara qui la trova
 * **chiusa** a segreteria e collaboratore, e `resources.ts` non si carica
 * affatto: la difesa e la stessa di `RESOURCE_BOUNDARIES`.
 */
const MANAGEMENT_OPEN_RESOURCES = new Set([
  "athlete_category_memberships",
  "athletes",
  "categories",
  "category_groups",
  "clothing_inventory",
  "clothing_kits",
  "clothing_products",
  "club_event_participants",
  "club_events",
  "club_resource_items",
  "club_sites",
  "dashboards",
  "discounts",
  "expected_expenses",
  "expected_income",
  /* Dominio proprio, senza risorsa generica: i moduli online (ADR-0039). */
  "forms",
  "invoices",
  "jersey_assignments",
  "jersey_groups",
  "kit_assignments",
  "medical_certificates",
  "members",
  "notifications",
  "opening_hours",
  "payment_plans",
  "payments",
  "procure",
  "receipts",
  "secretariat_notes",
  "simplified_athletes",
  "simplified_certificates",
  "simplified_notifications",
  "simplified_payments",
  "sponsor_payments",
  "sponsors",
  "staff_members",
  "trainer_payments",
  "trainers",
  "training_attendance",
  "transactions",
  "transfers",
  "weekly_schedule",
]);

/**
 * Vero se la matrice ha **deciso** su questo nome, in un verso o nell'altro.
 *
 * Serve alla guardia di caricamento di `resources.ts`: una risorsa che non
 * compare ne fra le riservate ne fra le aperte e una risorsa su cui nessuno ha
 * deciso niente, e prima di questa Wave sarebbe stata **aperta** in silenzio.
 */
export const isClubResourceDeclared = (resource: string) => {
  const normalized = String(resource || "")
    .trim()
    .toLowerCase();

  return (
    MANAGEMENT_OPEN_RESOURCES.has(normalized) ||
    MANAGEMENT_ADMIN_ONLY_RESOURCES.has(normalized)
  );
};

const TRAINER_READ_RESOURCES = new Set([
  "athlete_category_memberships",
  "athletes",
  "categories",
  "club_event_participants",
  "club_events",
  "club_resource_items",
  "medical_certificates",
  "notifications",
  "secretariat_notes",
  "simplified_athletes",
  "simplified_certificates",
  "simplified_notifications",
  "staff_members",
  "trainers",
  "training_attendance",
]);

const TRAINER_WRITE_RESOURCES = new Set([
  /*
    `club_events` non compare: un evento si scrive dal suo dominio
    (`src/lib/server/events.ts`), che applica la macchina a stati, il perimetro
    e il controllo ottimistico. Il registro generico lo serve in **lettura**.
  */
  "notifications",
  "simplified_notifications",
  "training_attendance",
]);

const matchesPathPrefix = (pathname: string, prefix: string) =>
  pathname === prefix || pathname.startsWith(`${prefix}/`);

/**
 * **Un ruolo personalizzato si normalizza sulla propria base.**
 *
 * E la riga che rende additivo tutto il meccanismo: ogni controllo gia scritto
 * — le guardie di rotta, la matrice per risorsa, il catalogo delle chiavi, il
 * browser — riceve il ruolo **base**, quindi risponde al massimo quanto
 * risponderebbe a quello. Il restringimento e la differenza, e la applica
 * `roleHasPermission` leggendo le chiavi dal gettone.
 *
 * Uno slug malformato, con una base non ammessa o di un'altra grafia non e
 * riconosciuto e vale `""`: default negato, come per qualunque altra stringa
 * che questa tabella non conosce.
 */
export const normalizeAccessRole = (
  role?: string | null,
): CanonicalAccessRole | "" => {
  const value = String(role || "")
    .trim()
    .toLowerCase();
  if (value.startsWith(CUSTOM_ROLE_PREFIX)) {
    return parseCustomRoleValue(value)?.baseRole || "";
  }
  return ROLE_ALIASES[value] || "";
};

export const isKnownAccessRole = (role?: string | null) =>
  Boolean(normalizeAccessRole(role));

export const getAccessRoleLabel = (role?: string | null) => {
  /*
    Un ruolo personalizzato ha il nome che il club gli ha dato, e va mostrato
    quello: scrivere «Collaboratore» a chi il club chiama «Segreteria» vorrebbe
    dire che la schermata e l'organigramma parlano di due persone diverse.
    Qui si ricostruisce dallo slug, che e sempre disponibile; il nome esteso e
    la descrizione stanno in `club_roles` e li mostra chi ha letto la riga.
  */
  const personalizzato = parseCustomRoleValue(role);
  if (personalizzato) {
    const leggibile = personalizzato.name.split("-").filter(Boolean).join(" ");
    return leggibile.charAt(0).toUpperCase() + leggibile.slice(1);
  }

  switch (normalizeAccessRole(role)) {
    case "owner":
      return "Proprietario";
    case "club_manager":
      return "Club manager";
    case "trainer":
      return "Allenatore";
    case "athlete":
      return "Atleta";
    case "parent":
      return "Genitore";
    case "staff":
      return "Staff";
    case "collaborator":
      return "Collaboratore";
    default:
      return "Accesso non riconosciuto";
  }
};

export const isOwnerAccessRole = (role?: string | null) =>
  normalizeAccessRole(role) === "owner";

export const isClubManagerAccessRole = (role?: string | null) =>
  normalizeAccessRole(role) === "club_manager";

export const isTrainerAccessRole = (role?: string | null) =>
  normalizeAccessRole(role) === "trainer";

export const isParentAccessRole = (role?: string | null) =>
  normalizeAccessRole(role) === "parent";

export const isAthleteAccessRole = (role?: string | null) =>
  normalizeAccessRole(role) === "athlete";

export const isManagementAccessRole = (role?: string | null) => {
  const normalizedRole = normalizeAccessRole(role);
  return normalizedRole ? MANAGEMENT_ROLES.has(normalizedRole) : false;
};

export const getAccessArea = (role?: string | null): AccessArea => {
  const normalizedRole = normalizeAccessRole(role);
  if (normalizedRole && MANAGEMENT_ROLES.has(normalizedRole)) {
    return "management";
  }
  if (normalizedRole === "trainer") return "trainer";
  if (normalizedRole === "parent") return "parent";
  if (normalizedRole === "athlete") return "athlete";
  return "account";
};

/**
 * **Un genitore ha i figli che ha, non il primo.**
 *
 * `linkedAthleteId` era un valore **singolo**, e chi lo calcolava restituiva il
 * primo figlio trovato. La home genitore disegnava correttamente il bottone di
 * ciascun figlio, e il clic sul secondo finiva contro la guardia e rimbalzava
 * sul primo: la famiglia con due figli tesserati vedeva sempre e solo uno.
 *
 * Il campo diventa un **elenco**, con un solo proprietario della domanda
 * (`getParentLinkedAthletes`). La forma singolare resta accettata perche una
 * sessione o una copia in `localStorage` scritta prima del rilascio non deve
 * far uscire nessuno dalla propria area: le due grafie confluiscono qui, in un
 * punto solo, e nessun chiamante deve sapere quale delle due sta usando.
 */
export const collectLinkedAthleteIds = (context: {
  linkedAthleteId?: string | null;
  linkedAthleteIds?: readonly (string | null | undefined)[] | null;
}) => {
  const collected = [
    ...(Array.isArray(context.linkedAthleteIds) ? context.linkedAthleteIds : []),
    context.linkedAthleteId,
  ]
    .map((value) => String(value || "").trim())
    .filter(Boolean);

  return Array.from(new Set(collected));
};

export const getAccessRedirectPath = (
  role?: string | null,
  context: {
    organizationId?: string | null;
    linkedAthleteId?: string | null;
    linkedAthleteIds?: readonly (string | null | undefined)[] | null;
  } = {},
) => {
  const normalizedRole = normalizeAccessRole(role);
  const organizationId = String(context.organizationId || "").trim();
  const linkedAthleteId = collectLinkedAthleteIds(context)[0] || "";

  if (normalizedRole && MANAGEMENT_ROLES.has(normalizedRole)) {
    return organizationId
      ? `/dashboard?clubId=${encodeURIComponent(organizationId)}`
      : "/account";
  }
  if (normalizedRole === "trainer") return "/trainer-dashboard";
  if (normalizedRole === "parent") {
    /*
      W6-12. **Con piu figli si sceglie, non si indovina.**

      Fin qui l'ingresso portava sempre al **primo** figlio, e per cambiarlo
      bisognava sapere che esistevano due chip sulla Home e due pulsanti sul
      Calendario: le altre undici pagine non avevano nessun selettore. Una
      famiglia con due figli si trovava dentro l'esperienza di uno dei due
      senza che nessuno glielo avesse chiesto, e le pagine che parlano di
      denaro e di salute non dicevano di chi stavano parlando piu di quanto
      lo dicesse il titolo.

      Con un figlio solo la scelta non esiste, e chiederla sarebbe un clic
      in piu tutti i giorni.
    */
    const figli = collectLinkedAthleteIds(context);
    if (figli.length > 1) return "/parent-view";
    return linkedAthleteId
      ? `/parent-view/${encodeURIComponent(linkedAthleteId)}`
      : "/account";
  }
  if (normalizedRole === "athlete") {
    /*
      W6-33. **L'atleta ha un'area, non una scheda gestionale.**

      Fin qui l'ingresso portava su `/athletes/<id>/profile`, che monta la
      **sidebar del club**: un atleta vedeva cliccabili Pagamenti, Movimenti,
      Impostazioni e altre trenta voci, ci cliccava, e rimbalzava sulla
      guardia senza una parola. Un menu che elenca cio che non si puo fare non
      e un menu: e un elenco di porte chiuse.

      L'area atleta non prende un identificativo nel percorso, e non e una
      dimenticanza: l'atleta e **se stesso**, la scheda si risolve dal legame
      `athletes.user_id`, e non esiste un parametro da cambiare per farla
      diventare la scheda di un altro. Il genitore ha `/parent-view/<figlio>`
      perche di figli puo averne piu d'uno; l'atleta no.
    */
    return linkedAthleteId ? "/athlete-dashboard" : "/account";
  }
  return "/account";
};

export const getPathAccessArea = (pathname?: string | null): AccessArea => {
  const path = String(pathname || "").trim() || "/";
  if (matchesPathPrefix(path, "/trainer-dashboard")) return "trainer";
  if (matchesPathPrefix(path, "/parent-view")) return "parent";
  if (matchesPathPrefix(path, "/athlete-dashboard")) return "athlete";
  if (/^\/athletes\/[^/]+\/profile(?:\/|$)/.test(path)) return "athlete";
  if (
    matchesPathPrefix(path, "/create-club") ||
    MANAGEMENT_PATH_PREFIXES.some((prefix) => matchesPathPrefix(path, prefix))
  ) {
    return "management";
  }
  if (
    matchesPathPrefix(path, "/account") ||
    matchesPathPrefix(path, "/profile") ||
    matchesPathPrefix(path, "/token-verification")
  ) {
    return "account";
  }
  return "public";
};

export const canAccessPath = (
  role: string | null | undefined,
  pathname: string,
  context: {
    linkedAthleteId?: string | null;
    linkedAthleteIds?: readonly (string | null | undefined)[] | null;
  } = {},
) => {
  const requiredArea = getPathAccessArea(pathname);
  const normalizedRole = normalizeAccessRole(role);

  if (requiredArea === "public" || requiredArea === "account") return true;
  if (!normalizedRole) return false;

  if (requiredArea === "management") {
    if (!MANAGEMENT_ROLES.has(normalizedRole)) return false;
    const adminOnly = MANAGEMENT_ADMIN_ONLY_PATH_PREFIXES.some((prefix) =>
      matchesPathPrefix(pathname, prefix),
    );
    return !adminOnly || ["owner", "club_manager"].includes(normalizedRole);
  }

  if (requiredArea === "trainer") return normalizedRole === "trainer";
  if (requiredArea === "parent") {
    if (normalizedRole !== "parent") return false;
    /*
      W6-12. La scelta del figlio e una schermata dell'area famiglia, e non
      parla di nessun figlio in particolare: e la pagina da cui si sceglie di
      quale parlare. Deve essere raggiungibile da un genitore che ne ha uno
      come da uno che ne ha quattro — altrimenti «cambia figlio» rimanderebbe
      su una porta chiusa.
    */
    if (pathname === "/parent-view" || pathname === "/parent-view/") {
      return true;
    }
    return collectLinkedAthleteIds(context).some((athleteId) =>
      matchesPathPrefix(pathname, `/parent-view/${athleteId}`),
    );
  }
  if (requiredArea === "athlete") {
    /*
      **L'area atleta e dell'atleta.**

      `/athlete-dashboard` non porta un identificativo nel percorso, quindi qui
      non c'e niente da confrontare con l'elenco dei legami: il confine vero
      resta sul server, dove `GET /api/v1/athlete-accounts/me` risolve la
      scheda da `athletes.user_id` e non da un parametro. Questa guardia
      governa solo quale percorso il browser puo aprire.

      **E non ci entra la gestione.** Sulla scheda `/athletes/<id>/profile` un
      ruolo gestionale passa — e la scheda di un atleta del suo club, che gia
      legge — ma qui non c'e nessun atleta da guardare: c'e la propria area, e
      per un dirigente sarebbe vuota. Aprirgliela vorrebbe dire prometterle un
      contenuto che non puo avere.
    */
    if (matchesPathPrefix(pathname, "/athlete-dashboard")) {
      return normalizedRole === "athlete";
    }
    if (MANAGEMENT_ROLES.has(normalizedRole)) return true;
    if (normalizedRole !== "athlete") return false;
    return collectLinkedAthleteIds(context).some((athleteId) =>
      matchesPathPrefix(pathname, `/athletes/${athleteId}/profile`),
    );
  }

  return false;
};

/**
 * Autorizzazione per le API generiche del club. Parent e atleta usano endpoint
 * dedicati e non possono enumerare le risorse amministrative del club.
 */
export const canAccessClubResource = (
  role: string | null | undefined,
  resource: string,
  action: ResourceAction,
) => {
  const normalizedRole = normalizeAccessRole(role);
  const normalizedResource = String(resource || "")
    .trim()
    .toLowerCase();

  if (normalizedRole === "owner" || normalizedRole === "club_manager") {
    return true;
  }

  if (normalizedRole === "collaborator" || normalizedRole === "staff") {
    /*
      **Non piu «tutto cio che non e vietato»** (W5-71, chiude W2-13).

      Fin qui questo ramo terminava con `return true`: segreteria e
      collaboratore potevano leggere e scrivere **qualunque nome** che non
      fosse nell'elenco riservato. Il difetto non e teorico — e lo stesso schema
      che ha aperto `sport_work` alla segreteria per undici mesi: il perimetro
      era dichiarato nella pagina e nel dominio, e non nella matrice, e la
      matrice rispondeva `true` a una risorsa di cui non sapeva niente.

      Una risorsa nuova adesso **deve dichiararsi**, come gia fa per il confine
      multi-tenant (ADR-0094). Chi la aggiunge e non la dichiara la trova
      chiusa, che e il verso giusto in cui sbagliare — e `resources.ts` non si
      carica affatto se una risorsa del registro non compare qui.
    */
    if (MANAGEMENT_ADMIN_ONLY_RESOURCES.has(normalizedResource)) return false;
    if (!MANAGEMENT_OPEN_RESOURCES.has(normalizedResource)) return false;
    if (
      action === "delete" &&
      MANAGEMENT_ADMIN_ONLY_DELETE_RESOURCES.has(normalizedResource)
    ) {
      return false;
    }
    return true;
  }

  if (normalizedRole === "trainer") {
    return action === "read"
      ? TRAINER_READ_RESOURCES.has(normalizedResource)
      : TRAINER_WRITE_RESOURCES.has(normalizedResource);
  }

  return false;
};

export const assertClubResourceAccess = (
  role: string | null | undefined,
  resource: string,
  action: ResourceAction,
) => {
  if (!canAccessClubResource(role, resource, action)) {
    throw new Error("Accesso negato per il ruolo attivo");
  }
};

export const canManageClubConfiguration = (role?: string | null) => {
  const normalizedRole = normalizeAccessRole(role);
  return normalizedRole === "owner" || normalizedRole === "club_manager";
};
