import { prisma } from "./prisma";
import { customRoleReachesResource } from "@/lib/permissions/catalog";
import {
  assertMembershipWithinAccessScope,
  athleteWithinAccessScope,
  buildAthleteAccessScopeConditions,
  buildMembershipAccessScopeConditions,
} from "./access-scope-query";
import {
  assertActiveClub,
  belongsToActiveClub,
} from "@/lib/auth/active-club-boundary";
import {
  isClubResourceDeclared,
  isCustomRoleValue,
  canAccessClubResource,
  isManagementAdminOnlyResource,
  normalizeAccessRole,
} from "@/lib/access-roles";
import { assertMayGrantRole } from "@/lib/roles/custom-role";
import {
  athleteMatchesGroup,
  buildCategoryGroups,
  buildSiteIndex,
  normalizeClubSites,
  type CategoryGroup,
} from "@/lib/club-sites";
import {
  assertHealthPermission,
  CLINICAL_ATHLETE_FIELDS,
  hasHealthPermission,
  stripClinicalAthleteFields,
  stripClinicalCertificateFields,
  collectGuardianCredentialValues,
  restoreGuardianAccessTokens,
  stripGuardianAccessTokens,
  stripPersonCredentials,
} from "@/lib/health/permissions";
import { Prisma } from "@prisma/client";
import { hashPassword } from "./auth";
import {
  getPasswordPolicyMessage,
  validatePassword,
} from "../auth/password-policy";
import {
  assertAnagraficaIsValid,
  normalizeAnagraficaText,
} from "./anagrafica";
import {
  buildClubCategoryOptions,
  resolveCategoryId,
  resolveCategoryLabel,
} from "../category-utils";
import {
  filterCollectionBySeason,
  isSeasonScopedDataType,
  normalizeClubSeasons,
} from "../club-seasons";
import { toBirthDateIso } from "../birth-date";
import { withPlatformOwnedSettings } from "../entitlements/ownership";
import { hasSeasonPermission } from "@/lib/seasons/permissions";
import { assertPersonalDataDisposed } from "./data-subject";
import type { AccessScopeEntry } from "@/lib/roles/access-scope";
import {
  athleteStatusQueryValues,
  normalizeAthleteStatus,
  parseAthleteStatus,
} from "../athletes/status";
import {
  AUDIT_ACTIONS,
  recordAuditEvent,
  recordPermissionDenied,
} from "./audit";
/*
  W4-E, modifica minima a un file non suo: due regole del dominio dei documenti
  fiscali mancavano di un chiamante proprio qui. Le funzioni vivono nel modulo
  **puro** degli snapshot e non in `fiscal-documents.ts`, perche quello importa
  `sponsors.ts` che importa questo file: chiamarle da li chiuderebbe un anello
  fra tre moduli server per una logica che non tocca il database.
*/
import {
  assertDocumentMutable,
  clientAssignedDocumentNumberField,
} from "@/lib/documents/document-snapshot";

type ResourceConfig = {
  kind: "model" | "club_resource";
  delegate?: string;
  resource_type?: string;
  description: string;
  mobile_ready: boolean;
};

const CLUB_RESOURCE_TYPES = [
  "access_tokens",
  "appointments",
  "bank_accounts",
  "categories",
  "category_groups",
  "clothing_inventory",
  "clothing_kits",
  "clothing_products",
  "club_sites",
  "discounts",
  "document_templates",
  "expected_expenses",
  "expected_income",
  "jersey_assignments",
  "jersey_groups",
  "kit_assignments",
  "members",
  "opening_hours",
  "payment_plans",
  "procure",
  "secretariat_notes",
  "sponsor_payments",
  "sponsors",
  "staff_members",
  "trainers",
  "transactions",
  "transfers",
  "weekly_schedule",
];

/**
 * I campi JSON del club, **compresi i due che sono diventati una proiezione**.
 *
 * `trainings` e `matches` sono usciti da `CLUB_RESOURCE_TYPES` — non hanno piu
 * una rotta generica, e nessuno li scrive dal registro (ADR-0098) — ma restano
 * campi del club: novantadue punti del codice li leggono ancora, e la
 * proiezione di `src/lib/server/events.ts` li tiene allineati alle righe.
 * Toglierli anche da qui li renderebbe illeggibili con `?fields=`, che e una
 * cosa diversa dal renderli non scrivibili.
 */
const CLUB_JSON_FIELDS = Array.from(
  new Set([
    ...CLUB_RESOURCE_TYPES.filter((resource) => resource !== "access_tokens"),
    "structures",
    "members",
    "dashboard_data",
    "trainings",
    "matches",
  ]),
);

/**
 * **Le due proiezioni non si scrivono da fuori.**
 *
 * Sono la copia in forma storica delle righe di `club_events`, e hanno un solo
 * scrittore: `src/lib/server/events.ts`. Un `PATCH /api/v1/clubs` che portasse
 * l'array intero — la strada da cui una sonda di concorrenza ha gia fatto
 * sparire un socio — riscriverebbe la copia lasciando le righe dov'erano, e
 * alla prima proiezione successiva la modifica sparirebbe senza un errore.
 */
const CLUB_PROJECTED_FIELDS = new Set(["trainings", "matches"]);

const MODEL_RESOURCES: Record<string, ResourceConfig> = {
  users: {
    kind: "model",
    delegate: "user",
    description: "Anagrafica utenti applicativi",
    mobile_ready: true,
  },
  clubs: {
    kind: "model",
    delegate: "club",
    description: "Club e anagrafica societaria",
    mobile_ready: true,
  },
  organizations: {
    kind: "model",
    delegate: "club",
    description: "Alias organizzazioni per compatibilita client",
    mobile_ready: true,
  },
  dashboards: {
    kind: "model",
    delegate: "dashboard",
    description: "Dashboard configurabili del club",
    mobile_ready: true,
  },
  organization_users: {
    kind: "model",
    delegate: "organizationUser",
    description: "Associazione utenti-organizzazione con ruolo",
    mobile_ready: true,
  },
  club_resource_items: {
    kind: "model",
    delegate: "clubResourceItem",
    description: "Risorse normalizzate del club",
    mobile_ready: true,
  },
  athletes: {
    kind: "model",
    delegate: "athlete",
    description: "Atleti",
    mobile_ready: true,
  },
  athlete_category_memberships: {
    kind: "model",
    delegate: "athleteCategoryMembership",
    description: "Appartenenze atleta-categoria",
    mobile_ready: true,
  },
  simplified_athletes: {
    kind: "model",
    delegate: "athlete",
    description: "Alias compatibilita atleti semplificati",
    mobile_ready: true,
  },
  medical_certificates: {
    kind: "model",
    delegate: "medicalCertificate",
    description: "Certificati medici",
    mobile_ready: true,
  },
  simplified_certificates: {
    kind: "model",
    delegate: "medicalCertificate",
    description: "Alias compatibilita certificati",
    mobile_ready: true,
  },
  payments: {
    kind: "model",
    delegate: "athletePayment",
    description: "Pagamenti quote atleti",
    mobile_ready: true,
  },
  simplified_payments: {
    kind: "model",
    delegate: "athletePayment",
    description: "Alias compatibilita pagamenti atleti",
    mobile_ready: true,
  },
  payment_methods: {
    kind: "model",
    delegate: "paymentMethod",
    description: "Metodi di pagamento configurati per il club",
    mobile_ready: true,
  },
  invoices: {
    kind: "model",
    delegate: "invoice",
    description: "Fatture emesse",
    mobile_ready: true,
  },
  receipts: {
    kind: "model",
    delegate: "receipt",
    description: "Ricevute collegate ai pagamenti",
    mobile_ready: true,
  },
  trainer_payments: {
    kind: "model",
    delegate: "trainerPayment",
    description: "Pagamenti allenatori",
    mobile_ready: true,
  },
  notifications: {
    kind: "model",
    delegate: "notification",
    description: "Notifiche utenti e club",
    mobile_ready: true,
  },
  simplified_notifications: {
    kind: "model",
    delegate: "notification",
    description: "Alias compatibilita notifiche",
    mobile_ready: true,
  },
  /*
    **Il nome storico resta, il delegato cambia** (ADR-0099).

    La tabella `training_attendance` e diventata `club_event_participants`: non
    e una seconda tabella, e la stessa portata dall'allenamento all'evento. Il
    nome della risorsa resta perche il mobile e le due schermate che la
    interrogano non devono cambiare contratto nello stesso commit in cui cambia
    il modello — e la regola di CLAUDE.md §6 sul cambio di contratto API.
  */
  training_attendance: {
    kind: "model",
    delegate: "clubEventParticipant",
    description: "Partecipazione a un evento: convocazione, risposta, presenza",
    mobile_ready: true,
  },
  club_event_participants: {
    kind: "model",
    delegate: "clubEventParticipant",
    description: "Partecipazione a un evento: convocazione, risposta, presenza",
    mobile_ready: false,
  },
  club_events: {
    kind: "model",
    delegate: "clubEvent",
    description: "Eventi sportivi: allenamenti e gare",
    mobile_ready: false,
  },
  assets: {
    kind: "model",
    delegate: "asset",
    description: "Asset caricati applicazione",
    mobile_ready: true,
  },
};

export const RESOURCE_CONFIG: Record<string, ResourceConfig> = {
  ...MODEL_RESOURCES,
  ...Object.fromEntries(
    CLUB_RESOURCE_TYPES.map((resource) => [
      resource,
      {
        kind: "club_resource",
        resource_type: resource,
        description: `Risorsa club: ${resource}`,
        mobile_ready: true,
      } satisfies ResourceConfig,
    ]),
  ),
};

type ResourceAccessScope = {
  userId: string;
  activeOrganizationId: string | null;
  allowedOrganizationIds: string[];
  /*
    **Il ruolo nel club attivo** (ADR-0094). Il tipo non lo dichiarava, quindi
    qui dentro non esisteva: le rotte lo risolvevano e lo passavano, e questo
    modulo non poteva leggerlo nemmeno volendo. Il confine dice su quale club;
    il ruolo dice cosa ci si puo fare, e i due controlli sono entrambi
    obbligatori.
  */
  activeRole?: string | null;
  /**
   * Il perimetro dell assegnazione: sede, categoria, o niente (Wave 6 §11.3).
   *
   * Vuoto = tutto il club, ed e cio che hanno tutte le tessere che esistono
   * oggi. Chi ne dichiara uno non vede fuori da li, e la differenza con il
   * parametro `site_id` e che quello arriva **dal chiamante**: un filtro
   * che si toglie togliendo un pezzo di indirizzo non e un confine.
   */
  accessScopes?: readonly AccessScopeEntry[] | null;
};

/**
 * **Le risorse di modello che sono legate a un club, e quelle che non lo sono.**
 *
 * ---
 *
 * ## Il difetto che questa riga chiude, ed era il piu grave del prodotto
 *
 * Questo insieme decide se una risorsa di modello viene filtrata per club.
 * `users` non c'era, e non per una svista di scoping: **non ha un club**, quindi
 * non c'era niente da filtrare. Il risultato pero era che
 * `GET /api/v1/users` non applicava **nessun** `where`, e
 * `resolveRecordOrganizationId` restituiva `null`, e `ensureOrganizationAccess`
 * con `null` esce senza negare.
 *
 * L'unico controllo rimasto era il ruolo — e chiunque puo registrarsi creando
 * un club e diventarne proprietario. Una revisione ostile ha letto l'anagrafica
 * di **tutti** gli utenti della piattaforma, ha riscritto la password di un
 * amministratore e lo ha cancellato, portandosi via in cascata i club che aveva
 * creato.
 *
 * `assets` era la stessa cosa: nessun club, nessun filtro, e dentro ci sono i
 * documenti di identita e i certificati medici delle famiglie, con il contenuto
 * in `data_base64`.
 *
 * ## La forma della correzione
 *
 * Un insieme non basta: la sua **assenza** era il difetto, e un secondo insieme
 * dimenticato produrrebbe lo stesso buco. Ogni risorsa di modello dichiara
 * quindi il suo confine, e `assertOgniRisorsaDichiaraIlConfine` — chiamata
 * all'avvio del modulo — rifiuta di caricarsi se una ne resta senza.
 *
 * Tre confini, e nessun altro:
 *
 * | Confine | Cosa significa |
 * |---|---|
 * | `club` | la riga porta un `organization_id`, e si filtra per club |
 * | `persona` | la riga e di **chi la chiede**, e si filtra per `userId` |
 * | `chiuso` | non passa dal registro generico: ha rotte proprie |
 */
const RESOURCE_BOUNDARIES: Record<string, "club" | "persona" | "chiuso"> = {
  /* Il club stesso: ha un ramo suo, piu sotto. */
  clubs: "club",
  organizations: "club",

  dashboards: "club",
  organization_users: "club",
  club_resource_items: "club",
  athletes: "club",
  athlete_category_memberships: "club",
  simplified_athletes: "club",
  medical_certificates: "club",
  simplified_certificates: "club",
  payment_methods: "club",
  payments: "club",
  simplified_payments: "club",
  invoices: "club",
  receipts: "club",
  trainer_payments: "club",
  notifications: "club",
  simplified_notifications: "club",
  training_attendance: "club",
  club_event_participants: "club",

  /**
   * **Gli eventi non si scrivono dal registro generico** (ADR-0098).
   *
   * Un evento ha una macchina a stati, un controllo ottimistico, un controllo
   * di sovrapposizione sul campo e una capienza: quattro cose che il CRUD
   * generico non sa e non deve sapere. Il registro serve la **lettura** — la
   * pagina calendario e le liste passano di qui — e ogni scrittura passa da
   * `src/lib/server/events.ts`, che e l'unica strada.
   */
  club_events: "club",

  /**
   * **L'utente vede se stesso, e nessun altro.**
   *
   * Un utente non appartiene a un club: appartiene a se stesso, e puo stare in
   * piu societa. Filtrarlo per club non avrebbe senso; non filtrarlo affatto e
   * cio che ha aperto la porta. La sua anagrafica si legge e si corregge dal
   * proprio profilo, e l'amministrazione degli utenti ha le sue rotte sotto
   * `/api/v1/admin`, che chiedono di essere amministratori della piattaforma.
   */
  users: "persona",

  /**
   * **Gli allegati non passano di qui.**
   *
   * `assets` non ha un `organization_id`: il club sta dentro `path`, e
   * dedurlo da una stringa per autorizzare un documento di identita sarebbe un
   * confine costruito su una convenzione di denominazione. Le quattro rotte che
   * servono gli allegati — documenti dell'atleta, cruscotto del genitore,
   * allegati dei moduli — verificano ognuna il suo, e nessuna passa dal
   * registro generico. Nessun client chiedeva `/api/v1/assets`: la porta era
   * aperta e non serviva a niente.
   */
  assets: "chiuso",

  /**
   * **Gli appuntamenti non passano di qui, e la ragione e una perdita di dati.**
   *
   * `appointments` e un campo JSON del club, e `syncClubAggregateField` lo
   * **rigenera da zero** a partire da `club_resource_items` a ogni creazione,
   * modifica o cancellazione fatta dal registro generico. Le richieste delle
   * famiglie nascono altrove — `POST /api/parent-dashboard/:id/appointments`
   * scrive `clubs.appointments` e non tocca mai `club_resource_items` —
   * quindi la **prima** operazione della segreteria su `/api/v1/appointments`
   * le avrebbe cancellate tutte: nessun errore, nessun audit, nessuna traccia.
   *
   * Nessun client chiedeva questa rotta: la porta era aperta e non serviva a
   * niente, salvo distruggere le richieste in attesa. La segreteria continua a
   * passare da `PATCH /api/v1/clubs`, che rilegge l'array intero prima di
   * riscriverlo — il verso sicuro della sincronizzazione.
   *
   * E una chiusura **provvisoria** (D-1): la correzione stabile e far nascere
   * l'appuntamento come riga propria, con un proprietario di dominio.
   */
  appointments: "chiuso",
};

/**
 * Nessuna risorsa di modello senza un confine dichiarato.
 *
 * Vive qui, e non in un test, perche un test si puo dimenticare di aggiornare;
 * questo modulo **non si carica** se qualcuno aggiunge una risorsa e non dice a
 * cosa appartiene. E la sola difesa che non richiede a nessuno di ricordarsi.
 */
const assertOgniRisorsaDichiaraIlConfine = () => {
  const senzaConfine = Object.keys(MODEL_RESOURCES).filter(
    (resource) => !RESOURCE_BOUNDARIES[resource],
  );
  if (senzaConfine.length) {
    throw new Error(
      `Risorse di modello senza confine dichiarato: ${senzaConfine.join(", ")}. ` +
        "Dichiararlo in RESOURCE_BOUNDARIES: «club», «persona» o «chiuso».",
    );
  }
};
assertOgniRisorsaDichiaraIlConfine();

/**
 * **Nessuna risorsa senza una riga nella matrice dei permessi** (W5-71).
 *
 * Il gemello della guardia qui sopra, sull'altra domanda. Il confine dice *a
 * chi appartiene* una riga; la matrice dice *chi puo toccarla*. Fino a questa
 * Wave la seconda rispondeva `true` a segreteria e collaboratore per qualunque
 * nome non esplicitamente riservato: una risorsa nuova nasceva **aperta**, e
 * nessuno se ne accorgeva finche non lo trovava un audit.
 *
 * La guardia sta qui e non in `access-roles.ts` perche e questo modulo a
 * conoscere l'elenco delle risorse; e non sta in un test perche un test si puo
 * dimenticare di aggiornare.
 */
const assertOgniRisorsaDichiaraIPermessi = () => {
  const senzaMatrice = Object.keys(RESOURCE_CONFIG).filter(
    (resource) => !isClosedResource(resource) && !isClubResourceDeclared(resource),
  );

  if (senzaMatrice.length) {
    throw new Error(
      `Risorse senza una riga nella matrice dei permessi: ${senzaMatrice.join(", ")}. ` +
        "Dichiararle in MANAGEMENT_OPEN_RESOURCES o in MANAGEMENT_ADMIN_ONLY_RESOURCES " +
        "(src/lib/access-roles.ts): una risorsa su cui nessuno ha deciso nasceva aperta.",
    );
  }
};

/** Le risorse che il registro generico non serve affatto. */
export const isClosedResource = (resource: string) =>
  RESOURCE_BOUNDARIES[resource] === "chiuso";

/**
 * **La chiusura vale nel modulo, non solo nella rotta.**
 *
 * Il controllo viveva unicamente in `ensureResource`, dentro i due route
 * handler generici. Una rotta e una porta fra tante: qualunque altro modulo
 * server che chiamasse `createResource("appointments", …)` — o un handler
 * nuovo scritto fra sei mesi — avrebbe riaperto la strada che cancella le
 * richieste delle famiglie, e nessun test lo avrebbe visto.
 *
 * La regola sta dove sta il dato (ADR-0058): la guardia e in ogni strada che
 * porta al campo.
 */
const assertResourceIsOpen = (resource: string) => {
  if (!isClosedResource(resource)) return;

  throw new Error(
    `Accesso negato: ${resource} non passa dal registro generico, ma dalle rotte del suo dominio`,
  );
};

assertOgniRisorsaDichiaraIPermessi();

/* ------------------------------------------------------ il dato sanitario */

/**
 * Le due chiavi cliniche che erano **dichiarate e mai chieste**.
 *
 * La sonda di sicurezza della Wave 5 le ha misurate: `clinical.manage` non era
 * chiamata da nessun modulo server — si poteva registrare un certificato senza
 * passare da quella chiave — e `clinical.status_read` da nessuno tranne una
 * schermata, che la usava per **descriversi**, non per difendersi.
 *
 * **Oggi non tolgono niente a nessuno, ed e il punto.** I ruoli che hanno
 * `clinical.manage` sono esattamente quelli che gia scrivevano un certificato
 * dal registro generico: la guardia non cambia chi passa, cambia **da dove**.
 * Il giorno dei ruoli personalizzati (Wave 6) un club potra togliere il dato
 * sanitario a un collaboratore, e quella scelta avra un posto in cui essere
 * applicata; senza queste due righe, la chiave sarebbe rimasta una casella che
 * si spunta senza che cambi niente — che e peggio di non averla.
 *
 * **Perche l'atleta e a condizione.** Scrivere la scheda di un atleta non e un
 * atto clinico: lo diventa se e solo se il carico tocca uno dei campi che
 * `CLINICAL_ATHLETE_FIELDS` dichiara contenuto sanitario. Chiedere la chiave su
 * ogni scrittura di anagrafica vorrebbe dire che chi non puo vedere le allergie
 * non puo piu correggere un cognome.
 */
const RISORSE_CLINICHE = new Set([
  "medical_certificates",
  "simplified_certificates",
]);

const RISORSE_CON_SCHEDA_ATLETA = new Set(["athletes", "simplified_athletes"]);

/**
 * Vero se il valore e «niente»: assente, nullo, testo vuoto, elenco vuoto,
 * oggetto senza chiavi.
 *
 * Serve a distinguere **due cose che sembrano uguali e non lo sono**: chi
 * cancella un contenuto clinico, e chi rimanda un contenitore che non ha mai
 * potuto vedere. La schermata normalizza cio che manca in `[]` e `{}`, quindi
 * l'assenza non arriva mai fino al server: arriva un vuoto.
 */
const eVuoto = (valore: unknown) => {
  if (valore === undefined || valore === null) return true;
  if (typeof valore === "string") return valore.trim() === "";
  if (Array.isArray(valore)) return valore.length === 0;
  if (typeof valore === "object") return Object.keys(valore as object).length === 0;
  return false;
};

const toccaCampiClinici = (input: unknown): boolean => {
  if (!input || typeof input !== "object") return false;
  const record = input as Record<string, any>;

  /*
    **Un contenitore vuoto non e un atto clinico.**

    Prima bastava che la **chiave** fosse presente. Ma la schermata rimanda
    sempre tutte e nove le raccolte, e quelle che chi salva non ha potuto
    leggere arrivano come `[]` o `{}`: ogni salvataggio risultava quindi un
    atto clinico, e un ruolo a cui era stata tolta la sola `clinical.manage`
    non poteva piu **correggere un cognome**. Misurato: la scheda diventava non
    modificabile in nessun campo.

    E l'esatto contrario di cio che il commento di `RISORSE_CON_SCHEDA_ATLETA`
    dichiara — «chi non puo vedere le allergie non puo piu correggere un
    cognome» — prodotto dalla correzione che voleva evitarlo.

    Cio che conta e se si sta **scrivendo** qualcosa di clinico. Un vuoto non
    scrive: la regola qui sotto, accanto, si occupa di non farlo nemmeno
    cancellare.
  */
  const dentro = (oggetto: unknown) =>
    Boolean(oggetto) &&
    typeof oggetto === "object" &&
    CLINICAL_ATHLETE_FIELDS.some(
      (campo) =>
        Object.prototype.hasOwnProperty.call(oggetto as object, campo) &&
        !eVuoto((oggetto as Record<string, unknown>)[campo]),
    );

  return dentro(record) || dentro(record.data);
};

const assertClinicalPermission = async (
  scope: ResourceAccessScope,
  permission: "clinical.manage" | "clinical.status_read",
  resource: string,
) => {
  if (hasHealthPermission(scope.activeRole, permission)) return;

  /*
    Il diniego lascia una riga prima di essere lanciato. Non puo farlo
    `assertHealthPermission`, che vive in un modulo puro e deve restarci: qui
    si chiede, si scrive, e poi si lascia lanciare a lui — cosi il messaggio
    resta uno solo.
  */
  await recordPermissionDenied({
    scope: {
      userId: scope.userId,
      activeRole: scope.activeRole,
      activeOrganizationId: scope.activeOrganizationId,
    },
    permission,
    resource,
  });

  assertHealthPermission(scope.activeRole, permission);
};

const assertClinicalWrite = async (
  resource: string,
  scope: ResourceAccessScope | undefined,
  input?: unknown,
) => {
  if (!scope) return;

  const clinico =
    RISORSE_CLINICHE.has(resource) ||
    (RISORSE_CON_SCHEDA_ATLETA.has(resource) && toccaCampiClinici(input));

  if (!clinico) return;

  await assertClinicalPermission(scope, "clinical.manage", resource);
};

const assertClinicalRead = async (
  resource: string,
  scope: ResourceAccessScope | undefined,
) => {
  if (!scope || !RISORSE_CLINICHE.has(resource)) return;

  await assertClinicalPermission(scope, "clinical.status_read", resource);
};

/** Le risorse in cui una riga appartiene a **chi la chiede**. */
const isPersonalResource = (resource: string) =>
  RESOURCE_BOUNDARIES[resource] === "persona";

const isOrganizationScopedResource = (resource: string) =>
  RESOURCE_CONFIG[resource]?.kind === "club_resource" ||
  (RESOURCE_BOUNDARIES[resource] === "club" &&
    resource !== "clubs" &&
    resource !== "organizations");

/**
 * Il confine del CRUD generico, ed e il **club attivo**.
 *
 * **Perche qui pesava piu che altrove.** Le rotte generiche verificano il
 * permesso con `assertClubResourceAccess(scope.activeRole, ...)` — il ruolo
 * nel club **attivo** — mentre questo confine guardava l'elenco di tutti i club
 * dell'utente. Chi possiede una societa e in un'altra e soltanto genitore
 * poteva mandare `x-active-club-id: <la propria>` con l'`organization_id`
 * dell'altra e scrivere qualunque risorsa generica con il ruolo sbagliato: e
 * il motore che serve una cinquantina di risorse, quindi era la superficie piu
 * ampia dell'intera classe di difetto.
 *
 * Vedi `src/lib/auth/active-club-boundary.ts` per la storia completa.
 */
const ensureOrganizationAccess = (
  scope: ResourceAccessScope | undefined,
  organizationId: string | null | undefined,
) => {
  if (!scope || !organizationId) {
    return;
  }

  /*
    **Lo scope contraffatto passava proprio di qui.**

    La Wave 5 ha scoperto che uno scope con `activeOrganizationId` di un club e
    `allowedOrganizationIds` di un altro superava ogni controllo, e ha scritto
    `assertScopeIsCoherent` per fermarlo. Quella guardia vive **dentro**
    `assertActiveClub`, e questa funzione chiamava invece `belongsToActiveClub`
    da sola — che di proposito **non** guarda l'elenco dei club consentiti.

    Conseguenza: la difesa copriva i domini che chiamano `assertActiveClub` —
    eventi, appuntamenti, documenti — e lasciava scoperto il registro generico,
    cioe la superficie **piu ampia** dell'intera classe: una cinquantina di
    risorse. Un elenco di atleti usciva con lo scope contraffatto mentre gli
    eventi lo respingevano.

    Lo ha trovato `scripts/wave-6-security-probe.mjs`, non un test: la sonda
    costruisce lo scope a mano, che e esattamente cio che un test unitario
    passandogli uno scope coerente non fa mai.
  */
  assertActiveClub(scope, organizationId, "la risorsa del club");
};

const resolveScopedOrganizationId = (
  scope: ResourceAccessScope | undefined,
  requestedOrganizationId?: string | null,
) => {
  if (!scope) {
    return requestedOrganizationId || null;
  }

  /*
    **Il club attivo va verificato quanto quello chiesto.**

    Prima si controllava soltanto il ramo in cui il client dichiara un club, e
    l'altro — quello che percorre la quasi totalita delle chiamate — restituiva
    `scope.activeOrganizationId` cosi com'era. Ma un club attivo che **non e
    fra quelli dell'account** e la contraffazione stessa: e il caso che la
    Wave 5 ha chiuso nei domini con `assertScopeIsCoherent` e che qui, sul
    registro che serve una cinquantina di risorse, non veniva guardato.

    Adesso i due rami si ricongiungono prima della guardia, che quindi gira
    sempre.
  */
  const risolto = requestedOrganizationId || scope.activeOrganizationId;

  if (!risolto) {
    throw new Error("Nessun club attivo selezionato");
  }

  ensureOrganizationAccess(scope, risolto);
  return risolto;
};

const resolveRecordOrganizationId = (
  resource: string,
  record: Record<string, any> | null | undefined,
) => {
  if (!record) {
    return null;
  }

  if (resource === "clubs" || resource === "organizations") {
    return record.id || null;
  }

  if (isOrganizationScopedResource(resource)) {
    return record.organization_id || record.club_id || null;
  }

  return null;
};

const assertRecordAccess = (
  resource: string,
  record: Record<string, any> | null | undefined,
  scope?: ResourceAccessScope,
) => {
  if (!scope || !record) {
    return;
  }

  /*
    **Una riga personale e di chi la chiede, e di nessun altro.**

    Prima questo ramo non esisteva, e non per distrazione: `users` non ha un
    club, quindi `resolveRecordOrganizationId` restituiva `null` e
    `ensureOrganizationAccess` con `null` esce **senza negare**. Il confine
    mancava del tutto, e l'unico controllo era il ruolo — che chiunque puo
    ottenere registrandosi con un club proprio.

    Una revisione ostile ha letto l'anagrafica di tutti gli utenti della
    piattaforma, riscritto la password di un amministratore e cancellato il suo
    account, portandosi via in cascata i club che aveva creato.
  */
  if (isPersonalResource(resource)) {
    const proprietario = String(record.id ?? "").trim();
    if (!proprietario || proprietario !== String(scope.userId ?? "").trim()) {
      throw new Error("Accesso negato alla risorsa del club");
    }
    return;
  }

  const suoClub = resolveRecordOrganizationId(resource, record);

  /*
    **Una riga di club senza club non e di nessuno, e non e di chi la chiede.**

    `ensureOrganizationAccess` esce senza negare quando il club e `null`, ed e
    giusto nel suo altro mestiere — guardare un club **richiesto**, dove
    `null` vuol dire «non ne hai chiesto uno». Qui `null` vuol dire un'altra
    cosa: che questa riga non dichiara a chi appartiene.

    E la stessa forma del difetto di `users`, una colonna piu stretta:
    `Notification.organization_id` e nullabile, quindi
    `GET/PATCH/DELETE /api/v1/notifications/&lt;id&gt;` raggiungeva una notifica
    senza club da qualunque club. `assertOgniRisorsaDichiaraIlConfine`
    verifica che l'etichetta ci sia, non che lo schema la sappia sostenere.
  */
  if (!suoClub) {
    throw new Error("Accesso negato alla risorsa del club");
  }

  ensureOrganizationAccess(scope, suoClub);
};

export const API_REGISTRY = [
  {
    name: "auth.login",
    method: "POST",
    path: "/api/v1/auth/login",
    description: "Login utente e apertura sessione web/mobile",
  },
  {
    name: "auth.register",
    method: "POST",
    path: "/api/v1/auth/register",
    description: "Registrazione utente con eventuale creazione club",
  },
  {
    name: "auth.logout",
    method: "POST",
    path: "/api/v1/auth/logout",
    description: "Chiusura sessione",
  },
  {
    name: "auth.session",
    method: "GET",
    path: "/api/v1/auth/session",
    description: "Recupero sessione corrente",
  },
  {
    name: "auth.user",
    method: "GET|PATCH",
    path: "/api/v1/auth/user",
    description: "Profilo utente autenticato",
  },
  {
    name: "auth.memberships",
    method: "GET",
    path: "/api/v1/auth/memberships",
    description: "Elenco club dell'account con ruoli e proprieta",
  },
  {
    name: "auth.memberships.activate",
    method: "POST",
    path: "/api/v1/auth/memberships/activate",
    description: "Imposta il club attivo dell'account",
  },
  {
    name: "auth.access.redeem",
    method: "POST",
    path: "/api/v1/auth/access/redeem",
    description: "Collega l'account a un club tramite token condiviso",
  },
  ...Object.entries(RESOURCE_CONFIG).flatMap(([resource, config]) => [
    {
      name: `${resource}.list`,
      method: "GET",
      path: `/api/v1/${resource}`,
      description: config.description,
    },
    {
      name: `${resource}.create`,
      method: "POST",
      path: `/api/v1/${resource}`,
      description: `Creazione ${resource}`,
    },
    {
      name: `${resource}.detail`,
      method: "GET",
      path: `/api/v1/${resource}/:id`,
      description: `Dettaglio ${resource}`,
    },
    {
      name: `${resource}.update`,
      method: "PATCH",
      path: `/api/v1/${resource}/:id`,
      description: `Aggiornamento ${resource}`,
    },
    {
      name: `${resource}.delete`,
      method: "DELETE",
      path: `/api/v1/${resource}/:id`,
      description: `Eliminazione ${resource}`,
    },
  ]),
];

const MODEL_DATE_FIELDS: Record<string, string[]> = {
  athletes: ["birth_date", "created_at", "updated_at"],
  athlete_category_memberships: ["created_at", "updated_at"],
  simplified_athletes: ["birth_date", "created_at", "updated_at"],
  medical_certificates: [
    "issue_date",
    "expiry_date",
    "created_at",
    "updated_at",
  ],
  simplified_certificates: [
    "issue_date",
    "expiry_date",
    "created_at",
    "updated_at",
  ],
  payments: ["due_date", "paid_at", "created_at", "updated_at"],
  simplified_payments: ["due_date", "paid_at", "created_at", "updated_at"],
  invoices: ["issue_date", "created_at", "updated_at"],
  receipts: ["issue_date", "created_at", "updated_at"],
  trainer_payments: ["date", "created_at", "updated_at"],
  notifications: ["created_at", "updated_at"],
  training_attendance: ["created_at", "updated_at"],
  club_event_participants: ["created_at", "updated_at", "convocated_at", "rsvp_at"],
  club_events: [
    "starts_at",
    "ends_at",
    "rsvp_deadline",
    "created_at",
    "updated_at",
  ],
  clubs: ["created_at", "updated_at"],
  organizations: ["created_at", "updated_at"],
  dashboards: ["created_at", "updated_at"],
  organization_users: ["created_at", "updated_at"],
  users: ["created_at", "updated_at"],
  assets: ["created_at", "updated_at"],
};

const stripUndefined = (value: Record<string, any>) =>
  Object.fromEntries(
    Object.entries(value).filter(([, fieldValue]) => fieldValue !== undefined),
  );

const toDateOrUndefined = (value: any) => {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  if (value instanceof Date) {
    return value;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return undefined;
  }

  return parsed;
};

const slugify = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

const UUID_PATTERN =
  /^(?:urn:uuid:)?[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const normalizeUuid = (value: any) => {
  if (typeof value !== "string") {
    return undefined;
  }

  return value.trim().replace(/^urn:uuid:/i, "");
};

const isUuid = (value: any) =>
  typeof value === "string" && UUID_PATTERN.test(value.trim());

/**
 * Nome, cognome e nome completo di una persona che vive in una collezione JSON
 * del club: soci, allenatori, staff.
 *
 * **Esportata perche il documento generato la usa** (Wave 3). Ne era nata una
 * copia dentro il risolutore dei segnaposto, e le due divergevano proprio dove
 * conta: questa neutralizza la stringa letterale `"undefined undefined"` — una
 * forma storica reale del dato, altrimenti non ci sarebbe una guardia dedicata
 * — la copia no. Il risultato era un attestato, con la firma del presidente
 * sopra, intestato a «undefined undefined»: cioe esattamente cio che
 * `DOCUMENT_ENGINE_INVARIANTS` promette che non succeda.
 *
 * Accetta anche le grafie italiane (`nome`, `cognome`) perche le collezioni
 * degli allenatori e dello staff sono state scritte da schermate diverse in
 * anni diversi.
 */
export const buildMemberIdentity = (member: Record<string, any>) => {
  const sanitizeText = (value: any) => {
    const trimmed = String(value ?? "").trim();
    return trimmed.toLowerCase() === "undefined undefined" ? "" : trimmed;
  };
  const rawFirstName = String(
    member?.firstName ?? member?.first_name ?? member?.nome ?? "",
  ).trim();
  const rawLastName = String(
    member?.lastName ??
      member?.last_name ??
      member?.surname ??
      member?.cognome ??
      "",
  ).trim();
  const explicitFullName = sanitizeText(member?.fullName ?? member?.full_name);
  const fallbackName = sanitizeText(member?.name);
  const fullName =
    explicitFullName ||
    [rawFirstName, rawLastName].filter(Boolean).join(" ").trim() ||
    fallbackName;
  const firstName =
    rawFirstName || (fullName ? fullName.split(/\s+/)[0] || "" : "");
  const lastName =
    rawLastName ||
    (fullName ? fullName.split(/\s+/).slice(1).join(" ").trim() : "");

  return {
    firstName,
    lastName,
    fullName,
  };
};

const isAccessOnlyMember = (member: Record<string, any>) => {
  const identity = buildMemberIdentity(member);

  return Boolean(member?.user_id) && !identity.fullName;
};

const normalizeClubMembers = (members: any) => {
  if (!Array.isArray(members)) {
    return members;
  }

  return members
    .filter(
      (member) =>
        member &&
        typeof member === "object" &&
        !isAccessOnlyMember(member as Record<string, any>),
    )
    .map((member) => {
      const identity = buildMemberIdentity(member as Record<string, any>);

      return stripUndefined({
        ...member,
        firstName: identity.firstName || undefined,
        lastName: identity.lastName || undefined,
        surname: identity.lastName || undefined,
        fullName: identity.fullName || undefined,
        name: identity.fullName || undefined,
      });
    });
};

const parseJsonIfString = (value: any) => {
  if (typeof value !== "string") {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
};

const getClubResourceLogicalId = (
  record: Record<string, any> | null | undefined,
) => {
  const payloadId = record?.payload?.id;
  if (typeof payloadId !== "string") {
    return null;
  }

  const trimmed = payloadId.trim();
  if (!trimmed || isUuid(trimmed)) {
    return null;
  }

  return trimmed;
};

const withCompatibilityAliases = (
  resource: string,
  record: Record<string, any>,
) => {
  const next = clone(record);

  if (next.organization_id && !next.club_id) {
    next.club_id = next.organization_id;
  }

  if ((resource === "clubs" || resource === "organizations") && next.id) {
    next.organization_id = next.id;
  }

  /*
    **Il nome storico della chiave, per chi non e ancora passato all'evento.**

    `training_attendance.training_id` e diventato
    `club_event_participants.event_id`, e l'identificativo storico vive in
    `legacy_training_id`. Le schermate che incrociano le presenze con la
    collezione JSON confrontano ancora quello: l'alias glielo restituisce
    finche la proiezione esiste.
  */
  if (
    resource === "training_attendance" ||
    resource === "club_event_participants"
  ) {
    if (!next.training_id) {
      next.training_id = next.legacy_training_id ?? next.event_id ?? null;
    }
  }

  if (
    (resource === "athletes" || resource === "simplified_athletes") &&
    next.first_name &&
    next.last_name
  ) {
    next.name = `${next.first_name} ${next.last_name}`.trim();
    if (!next.avatar && next.avatar_url) {
      next.avatar = next.avatar_url;
    }
  }

  if (
    (resource === "payments" || resource === "simplified_payments") &&
    next.athlete &&
    !next.athlete_name
  ) {
    next.athlete_name =
      `${next.athlete.first_name || ""} ${next.athlete.last_name || ""}`.trim();
  }

  if (
    resource === "medical_certificates" ||
    resource === "simplified_certificates"
  ) {
    if (!next.document_url && next.file_url) {
      next.document_url = next.file_url;
    }

    if (!next.certificateType && next.type) {
      next.certificateType = next.type;
    }
  }

  return next;
};

/**
 * I campi di un utente che il registro generico non scrive **mai**.
 *
 * `role` e quella che decide chi amministra la piattaforma quando non c'e un
 * elenco di indirizzi configurato; `app_metadata` e `is_platform_admin` sono le
 * altre due che il controllo ha letto o potrebbe leggere. Un privilegio che si
 * concede da se non e un privilegio.
 */
const PROTECTED_USER_FIELDS = ["role", "app_metadata", "is_platform_admin"] as const;

const serializeUser = (record: Record<string, any>) => {
  const next = clone(record);
  delete next.password_hash;

  next.club_access = Array.isArray(next.club_access)
    ? next.club_access.map((item: any) => ({
        ...item,
        club_id: item.organization_id,
      }))
    : [];

  return next;
};

const serializeClubResourceItem = (record: Record<string, any>) =>
  withCompatibilityAliases(record.resource_type, {
    id: record.id,
    organization_id: record.organization_id,
    club_id: record.organization_id,
    name: record.name,
    status: record.status,
    date: record.date,
    created_at: record.created_at,
    updated_at: record.updated_at,
    ...(typeof record.payload === "object" && record.payload
      ? record.payload
      : {}),
  });

/**
 * **Le colonne del club che escono comunque, e quelle che non escono mai.**
 *
 * `payment_pin` e stato tolto dalle colonne **proiettabili** — quelle che un
 * client puo chiedere con `?fields=` — e una prova lo presidia. Ma una lettura
 * **senza** `?fields=` non passa da quella lista: restituisce la riga intera, e
 * `withCompatibilityAliases` e una copia senza filtro. Il segreto usciva
 * comunque, e la prova passava.
 *
 * Un segreto non si difende con un elenco di cio che si puo chiedere: si
 * difende con un elenco di cio che non esce, applicato all'uscita.
 */
const CLUB_FIELDS_MAI_ESPOSTI = ["payment_pin"] as const;

/**
 * Le colonne che identificano un club, e nient'altro.
 *
 * Sono cio che serve a **sceglierlo**: il selettore di societa mostra un nome e
 * un logo. Tutto il resto — IBAN, conti, prima nota storica, sponsor, soci —
 * vive dentro il club, e si legge solo dal club attivo.
 */
const CLUB_CAMPI_DI_IDENTITA = new Set([
  "id",
  "slug",
  "name",
  "business_name",
  "logo_url",
  "city",
  "province",
  "created_at",
  "updated_at",
  "creator_id",
]);

const serializeRecord = (
  resource: string,
  record: Record<string, any>,
  scope?: ResourceAccessScope,
) => {
  if (!record) {
    return null;
  }

  if (resource === "users") {
    return serializeUser(record);
  }

  if (RESOURCE_CONFIG[resource]?.kind === "club_resource") {
    const serializzato = serializeClubResourceItem(record);

    /*
      L'anagrafica di un collega non e il dato dell'allenatore: la riduzione
      vive **qui** e non in fondo alla funzione, perche le risorse di club
      escono per questa strada e non arrivano mai in fondo.
    */
    if (
      scope &&
      normalizeAccessRole(scope.activeRole) === "trainer" &&
      RISORSE_CON_ANAGRAFICA_PERSONALE.has(resource)
    ) {
      return proiettaPersonaPerAllenatore(serializzato);
    }

    /*
      **E la riduzione valeva solo per l'allenatore.**

      La riga sopra copre il ruolo `trainer`; collaboratore, segreteria e ogni
      ruolo personalizzato — che normalizza sulla propria base — leggevano la
      scheda intera, con il gettone di accesso in chiaro, il codice fiscale e
      **l'IBAN**.

      Il taglio sta qui e non in fondo alla funzione per la stessa ragione
      scritta sopra: le risorse di club escono per questa strada e in fondo non
      ci arrivano mai. Ed e la ragione per cui il primo taglio delle credenziali
      — scritto in fondo, per gli atleti — non toccava queste schede.
    */
    if (
      scope &&
      RISORSE_CON_ANAGRAFICA_PERSONALE.has(resource) &&
      !vedeICredenzialiDiAccesso(scope.activeRole)
    ) {
      return stripPersonCredentials(serializzato);
    }

    return serializzato;
  }

  if (resource === "clubs" || resource === "organizations") {
    const pulito = { ...record };
    for (const campo of CLUB_FIELDS_MAI_ESPOSTI) delete pulito[campo];

    /*
      Il club **non attivo** esce ridotto alla sua identita. Senza scope — le
      letture interne del server — non si riduce niente: chi chiama da dentro
      ha gia il suo confine.
    */
    const attivo = String(scope?.activeOrganizationId ?? "").trim();
    if (scope && attivo && String(record.id ?? "").trim() !== attivo) {
      return withCompatibilityAliases(
        resource,
        Object.fromEntries(
          Object.entries(pulito).filter(([campo]) =>
            CLUB_CAMPI_DI_IDENTITA.has(campo),
          ),
        ),
      );
    }

    return withCompatibilityAliases(resource, pulito);
  }

  return withCompatibilityAliases(
    resource,
    proiettaSenzaDatoClinico(resource, record, scope),
  );
};

/**
 * **Il dato clinico esce dalla proiezione di chi non lo ha** (D-4).
 *
 * Era mascherato solo dal browser: il flag `viewMedicalStatus` compariva in
 * diciannove componenti e in **zero** moduli server, mentre allergie, farmaci,
 * gruppo sanguigno e il file del certificato uscivano comunque da
 * `GET /api/v1/athletes` e da `GET /api/v1/medical_certificates`.
 *
 * Senza `scope` non si toglie niente: sono le letture interne del server, che
 * hanno gia il loro confine e che devono poter promuovere un certificato o
 * calcolare una scadenza. La guardia e per **chi chiede da fuori**.
 */
/**
 * **L'anagrafica di un collega non e il dato dell'allenatore.**
 *
 * `trainers` e `staff_members` stanno in `TRAINER_READ_RESOURCES` perche la
 * dashboard deve sapere **chi allena cosa**: i nomi, le categorie, il legame
 * con un account. Ma la risorsa e una collezione JSON del club, e usciva per
 * intero — **codice fiscale, indirizzo, telefono** di ogni collega, a chiunque
 * abbia il ruolo allenatore in quel club.
 *
 * Il difetto ha la stessa forma di D-4: una schermata che mostra solo cio che
 * serve, e una risposta che porta tutto. Qui la difesa e un **elenco di cio che
 * puo uscire**, non di cio che va tolto: un campo nuovo sulla scheda di un
 * collaboratore nasce cosi **invisibile** all'allenatore, che e il verso giusto
 * in cui sbagliare.
 */
const CAMPI_PERSONA_VISIBILI_ALL_ALLENATORE = new Set([
  "id",
  "organization_id",
  "club_id",
  "name",
  "first_name",
  "last_name",
  "firstName",
  "lastName",
  "fullName",
  "email",
  "role",
  "status",
  "categories",
  "category",
  "categoryId",
  "category_id",
  "categoryName",
  "category_name",
  "groups",
  "groupIds",
  "group_ids",
  "linkedUserId",
  "linked_user_id",
  "userId",
  "user_id",
  "linkedUserIds",
  "linked_user_ids",
  "linkedUserEmail",
  "linked_user_email",
  "linkedAt",
  "linked_at",
  "created_at",
  "updated_at",
]);

const RISORSE_CON_ANAGRAFICA_PERSONALE = new Set([
  "trainers",
  "staff_members",
]);

const proiettaPersonaPerAllenatore = (record: Record<string, any>) => {
  const ridotto: Record<string, any> = {};

  for (const [chiave, valore] of Object.entries(record)) {
    if (CAMPI_PERSONA_VISIBILI_ALL_ALLENATORE.has(chiave)) {
      ridotto[chiave] = valore;
    }
  }

  /*
    Il payload della risorsa di club porta la scheda per intero: si riduce con
    lo stesso elenco, invece di lasciarlo passare perche sta un livello piu
    sotto. E il modo in cui una proiezione perde: guardando solo il primo
    livello.
  */
  if (record.data && typeof record.data === "object") {
    const dati: Record<string, any> = {};
    for (const [chiave, valore] of Object.entries(record.data)) {
      if (CAMPI_PERSONA_VISIBILI_ALL_ALLENATORE.has(chiave)) {
        dati[chiave] = valore;
      }
    }
    ridotto.data = dati;
  }

  return ridotto;
};

const RISORSE_CON_DATO_CLINICO = new Set([
  "athletes",
  "simplified_athletes",
  "medical_certificates",
  "simplified_certificates",
]);

/**
 * Chi puo vedere il **gettone** di accesso di una famiglia dentro l'anagrafica.
 *
 * Non e la matrice per risorsa da sola, e la ragione e misurata: la matrice
 * passa da `normalizeAccessRole`, che di un gettone
 * `custom:club_manager:<slug>` risponde `club_manager` — quindi un ruolo
 * personalizzato con **una chiave sola** vedeva la credenziale come il gestore
 * pieno. E il residuo W6-D17, e su una credenziale non lo si puo accettare.
 *
 * Si pretende quindi un ruolo **canonico** di direzione. Un ruolo
 * personalizzato, anche completo, legge i gettoni dalla loro rotta
 * (`/api/v1/access_tokens`), che e il proprietario del dato e sa dire di no
 * per conto proprio: qui non ne ha bisogno, e fallire chiuso costa una
 * schermata in meno e non una credenziale in piu.
 */
const vedeICredenzialiDiAccesso = (role: string | null | undefined) =>
  !isCustomRoleValue(role) &&
  canAccessClubResource(role, "access_tokens", "read");

const proiettaSenzaDatoClinico = (
  resource: string,
  record: Record<string, any>,
  scope?: ResourceAccessScope,
) => {
  if (
    scope &&
    normalizeAccessRole(scope.activeRole) === "trainer" &&
    RISORSE_CON_ANAGRAFICA_PERSONALE.has(resource)
  ) {
    return proiettaPersonaPerAllenatore(record);
  }

  /*
    **La credenziale della famiglia usciva a chiunque leggesse un atleta.**

    `athletes.data.guardians[]` porta `parentAccessTokenValue`: il valore **in
    chiaro** del gettone con cui un tutore si collega. Non e clinico, quindi
    nessuno dei tagli qui sotto lo toccava, e la proiezione ridotta vale solo
    per `trainers`/`staff_members`, non per gli atleti.

    Misurato sul database di sviluppo: con uno scope da **allenatore**, da
    **collaboratore** e da ruolo personalizzato con una chiave, il gettone di
    ogni famiglia usciva. E `POST /api/v1/auth/access/redeem` lega chi lo
    presenta come tutore — quindi chi lo raccoglie ottiene **per legame** il
    fascicolo clinico completo, cioe esattamente cio che il taglio gli nega.
    Una difesa aggirata non da un buco, ma dalla porta accanto.

    `access_tokens` e fra le risorse riservate alla direzione **proprio per
    questo**, e `athletes.data` lo aggirava. La regola qui e la stessa: il
    gettone lo vede chi puo vedere i gettoni. Gli altri campi del tutore —
    nome, indirizzo, telefono — restano: chi allena deve poter chiamare una
    famiglia, ed e quella la ragione per cui `guardians` non e clinico.
  */
  /*
    **La stessa regola per le persone del club, e valeva solo per l'allenatore.**

    `trainers` e `staff_members` portano il gettone di accesso in chiaro, il
    codice fiscale e **l'IBAN**. La proiezione ridotta esisteva, ma solo per il
    ruolo `trainer`: collaboratore, segreteria e ogni ruolo personalizzato — che
    normalizza sulla propria base — leggevano la riga intera.

    `sport_work` e riservata alla direzione con la motivazione «le coordinate
    bancarie di ogni collaboratore». Le stesse coordinate uscivano dalla porta
    accanto.
  */
  if (
    scope &&
    RISORSE_CON_ANAGRAFICA_PERSONALE.has(resource) &&
    !vedeICredenzialiDiAccesso(scope.activeRole)
  ) {
    record = stripPersonCredentials(record);
  }

  if (
    scope &&
    (resource === "athletes" || resource === "simplified_athletes") &&
    !vedeICredenzialiDiAccesso(scope.activeRole)
  ) {
    const senzaGettoni = stripGuardianAccessTokens(record.data);
    if (senzaGettoni !== record.data) {
      record = { ...record, data: senzaGettoni };
    }
  }

  if (!scope || !RISORSE_CON_DATO_CLINICO.has(resource)) {
    return record;
  }

  if (hasHealthPermission(scope.activeRole, "clinical.read")) {
    return record;
  }

  if (resource === "athletes" || resource === "simplified_athletes") {
    const data = stripClinicalAthleteFields(record.data);
    return data === record.data ? record : { ...record, data };
  }

  return stripClinicalCertificateFields(record);
};

/**
 * Le date che devono ricomporre lo stesso giorno che qualcuno ha scritto.
 *
 * `new Date` non e un giudice: `new Date("2026-02-31")` non fallisce, restituisce
 * il **3 marzo**. Su una data di nascita quel riporto silenzioso e un dato
 * falso che nessuno vede passare, e da li discendono eta, categoria per anno
 * di nascita e codice fiscale. Qui si legge la data come testo; se il giorno
 * non esiste il valore resta **come e stato scritto**, perche a rifiutarlo con
 * un messaggio di dominio sia `assertAnagraficaIsValid`, che e il proprietario
 * della validazione anagrafica e sa quando una scheda gia in archivio va
 * lasciata correggere (RC FIX 3).
 */
const CALENDAR_DATE_FIELDS = new Set(["birth_date"]);

const normalizeDates = (resource: string, input: Record<string, any>) => {
  const dateFields = MODEL_DATE_FIELDS[resource] || [];
  const next = { ...input };

  for (const field of dateFields) {
    if (CALENDAR_DATE_FIELDS.has(field)) {
      const iso = toBirthDateIso(next[field]);
      if (iso) {
        next[field] = new Date(`${iso}T00:00:00.000Z`);
      } else if (next[field] === "") {
        next[field] = null;
      }
      continue;
    }

    const parsed = toDateOrUndefined(next[field]);
    if (parsed) {
      next[field] = parsed;
    } else if (next[field] === "") {
      next[field] = null;
    }
  }

  return next;
};

const normalizeCommonAliases = (input: Record<string, any>) => {
  const next = { ...input };

  if (next.club_id && !next.organization_id) {
    next.organization_id = next.club_id;
  }

  delete next.club_id;
  delete next.organizations;
  delete next.athletes;
  delete next.categories;
  delete next.trainers;
  /*
    Questi non sono la difesa — lo e `togliRelazioni`, che chiede l'elenco
    allo schema. Restano perche sono **alias**: nomi che il client manda al
    posto di una colonna, e che vanno tolti prima delle normalizzazioni che
    seguono, non solo prima della scrittura.
  */
  delete next.organization;
  delete next.athlete;
  /*
    Questi tre restano anche qui, e non solo per il percorso di modello:
    `normalizeClubResourceInput` chiama questa funzione e **non** passa da
    `togliRelazioni`, quindi senza queste righe finivano dentro `payload`.
  */
  delete next.payment;
  delete next.invoice;
  delete next.receipt;

  return next;
};

const normalizeAthletePaymentInput = (input: Record<string, any>) => {
  const next = { ...input };
  const metadata = parseJsonIfString(next.data);
  next.data = metadata;

  if (!next.athlete_id && next.athleteId) {
    next.athlete_id = next.athleteId;
  }

  if (!next.organization_id && (next.organizationId || next.clubId)) {
    next.organization_id = next.organizationId || next.clubId;
  }

  if (!next.due_date && next.dueDate) {
    next.due_date = next.dueDate;
  }

  if (!next.paid_at && next.paidAt) {
    next.paid_at = next.paidAt;
  }

  if (!next.description) {
    next.description =
      firstNonEmpty(metadata?.description, next.type, metadata?.type) ||
      "Pagamento atleta";
  }

  delete next.athleteId;
  delete next.organizationId;
  delete next.clubId;
  delete next.dueDate;
  delete next.paidAt;

  return next;
};

const firstNonEmpty = (...values: unknown[]) => {
  for (const value of values) {
    const text = String(value || "").trim();
    if (text) {
      return text;
    }
  }

  return "";
};

const normalizeModelInput = async (
  resource: string,
  input: Record<string, any>,
) => {
  const preservedClubJsonFields =
    resource === "clubs" || resource === "organizations"
      ? Object.fromEntries(
          CLUB_JSON_FIELDS.filter((field) => input[field] !== undefined).map(
            (field) => [field, input[field]],
          ),
        )
      : {};

  let next = {
    ...normalizeCommonAliases(input),
    ...preservedClubJsonFields,
  };

  /*
    **`birthDate` e un alias di colonna, e vale solo dove ci sono colonne.**

    Da quando il corpo viene filtrato sullo schema, la chiave in camelCase
    verrebbe tolta **in silenzio** — e con lei la validazione della data di
    nascita, che la cerca ancora: una data impossibile passerebbe senza errore
    e senza essere scritta. Prima almeno Prisma rifiutava, suggerendo il nome
    giusto.

    Sta qui e non in `normalizeCommonAliases` perche quella funzione la
    chiamano anche le risorse di **club**, dove non esiste nessuna colonna
    `birth_date` e la chiave finisce dentro un `payload` JSON: li rinominarla
    cambierebbe il dato di sponsor e staff senza che nessuno lo abbia chiesto.
  */
  if (next.birthDate !== undefined && next.birth_date === undefined) {
    next.birth_date = next.birthDate;
  }
  delete next.birthDate;

  if (resource === "payments" || resource === "simplified_payments") {
    next = normalizeAthletePaymentInput(next);
  }

  /*
    **Il contratto del mobile non cambia nello stesso commit in cui cambia il
    modello** (CLAUDE.md §6).

    `training_attendance` accettava `training_id`, una stringa. Adesso la
    chiave e `event_id`, una chiave esterna vera. Chi manda ancora la vecchia
    forma la vede tradotta qui, una volta sola: e la stessa cosa che fa
    `findClubEvent`, e non c'e una seconda strada che la interpreti.
  */
  if (
    (resource === "training_attendance" ||
      resource === "club_event_participants") &&
    !next.event_id
  ) {
    const legacyId = String(next.training_id || next.trainingId || "").trim();
    const organizationId = String(next.organization_id || "").trim();
    delete next.training_id;
    delete next.trainingId;

    if (legacyId && organizationId) {
      const evento = await prisma.clubEvent.findFirst({
        where: { organization_id: organizationId, legacy_id: legacyId },
        select: { id: true, legacy_id: true },
      });
      if (!evento) {
        throw new Error(
          `Evento non trovato: la presenza cita «${legacyId}», che non esiste in questo club`,
        );
      }
      next.event_id = evento.id;
      next.legacy_training_id = evento.legacy_id;
    }
  }

  next = normalizeDates(resource, next);
  next.settings = parseJsonIfString(next.settings);
  if (next.settings_patch !== undefined) {
    next.settings_patch = parseJsonIfString(next.settings_patch);
  }
  next.user_metadata = parseJsonIfString(next.user_metadata);
  next.data = parseJsonIfString(next.data);
  next.config = parseJsonIfString(next.config);

  if (resource === "clubs" || resource === "organizations") {
    for (const campo of CLUB_PROJECTED_FIELDS) {
      if (next[campo] !== undefined) {
        throw new Error(
          `Accesso negato: ${campo} e una proiezione degli eventi e si scrive da /api/v1/events, non dal club`,
        );
      }
    }

    for (const field of CLUB_JSON_FIELDS) {
      next[field] = parseJsonIfString(next[field]);
    }

    next.members = normalizeClubMembers(next.members);
  }

  if (resource === "users") {
    delete next.club_access;

    /*
      **Cio che un utente non scrive su se stesso.**

      Da quando `users` e una risorsa **personale** — una riga si legge e si
      corregge solo se e la propria — il registro generico non e piu una porta
      verso gli altri. Resta pero una porta verso il proprio privilegio: la
      colonna `role` e quella che `isPlatformAdminUser` legge quando non c'e un
      elenco di indirizzi configurato, e `PATCH /api/v1/users/<me>` la
      scriveva come una colonna qualunque.

      Il ruolo di piattaforma lo assegna chi gia lo ha, dalle rotte sotto
      `/api/v1/admin`. `user_metadata.role` non conta piu niente, e qui si
      toglie comunque: due difese per lo stesso privilegio, perche una sola
      prima o poi si dimentica.
    */
    for (const campo of PROTECTED_USER_FIELDS) delete next[campo];

    if (
      next.user_metadata &&
      typeof next.user_metadata === "object" &&
      !Array.isArray(next.user_metadata)
    ) {
      for (const campo of PROTECTED_USER_FIELDS) {
        delete (next.user_metadata as Record<string, any>)[campo];
      }
    }

    if (next.password) {
      const password = String(next.password);
      const passwordPolicy = validatePassword(password, next.email);
      if (!passwordPolicy.valid) {
        throw new Error(getPasswordPolicyMessage(passwordPolicy));
      }
      next.password_hash = await hashPassword(password);
      delete next.password;
    }

    next.user_metadata =
      typeof next.user_metadata === "object" && next.user_metadata
        ? next.user_metadata
        : {};
  }

  if (resource === "clubs" || resource === "organizations") {
    if (!next.slug && next.name) {
      next.slug = `${slugify(String(next.name))}-${Date.now().toString().slice(-6)}`;
    }
  }

  if (
    (resource === "athletes" || resource === "simplified_athletes") &&
    !next.category_name &&
    next.data?.category
  ) {
    next.category_name = next.data.category;
  }

  /*
    W6-03. Lo stato di un atleta passa dal vocabolario **prima** di toccare la
    colonna. E l'unica difesa che vale contro il difetto che l'ha aperto: una
    schermata che manda il nome di un'azione invece di uno stato non fa
    sparire l'atleta dall'elenco del suo club, perche quel nome qui diventa
    uno dei quattro valori che i filtri conoscono.
  */
  if (
    (resource === "athletes" || resource === "simplified_athletes") &&
    next.status !== undefined &&
    next.status !== null
  ) {
    next.status = normalizeAthleteStatus(next.status);
    if (next.data && typeof next.data === "object" && "status" in next.data) {
      next.data = { ...next.data, status: next.status };
    }
  }

  if (
    resource === "medical_certificates" ||
    resource === "simplified_certificates"
  ) {
    if (!next.organization_id && next.club_id) {
      next.organization_id = next.club_id;
    }

    if (!next.athlete_id && next.athleteId) {
      next.athlete_id = next.athleteId;
    }

    if (!next.type && next.certificateType) {
      next.type = next.certificateType;
    }

    if (!next.type && next.notes) {
      next.type = next.notes;
    }

    if (!next.file_url && next.fileUrl) {
      next.file_url = next.fileUrl;
    }

    if (!next.file_url && next.document_url) {
      next.file_url = next.document_url;
    }

    delete next.athleteId;
    delete next.certificateType;
    delete next.fileUrl;
    delete next.document_url;
  }

  return stripUndefined(togliRelazioni(resource, next));
};

/**
 * **Le relazioni non si scrivono dal registro generico.**
 *
 * Il corpo di una richiesta finiva in `delegate.create({ data })` dopo essere
 * passato da un **elenco di negazione**: `delete next.invoice`,
 * `delete next.receipt`, e altri sei nomi scritti a mano. Un elenco di
 * negazione dice cio che non passa, quindi tutto il resto passa — e quando lo
 * schema cambia, l'elenco resta indietro in silenzio.
 *
 * E successo. Togliendo l'unicita da `Invoice.payment_id` — perche una rata
 * saldata in due incassi ha due fatture — la relazione inversa e diventata
 * `invoices` al plurale, e l'elenco continuava a negare `invoice` al
 * singolare, che da quel momento non esisteva piu. Bastava allora
 *
 *     POST /api/v1/payments
 *     {"organization_id":"<mio>","invoices":{"create":{"organization_id":"<altrui>", ...}}}
 *
 * perche Prisma eseguisse una **scrittura annidata**: la riga figlia porta il
 * club che il chiamante ha scritto, e `resolveScopedOrganizationId` vincola
 * solo quello di primo livello. Una fattura nasceva nel club di un altro,
 * scavalcando `guardFiscalDocumentIntegrity` — cioe la guardia che esiste
 * perche un documento fiscale si emetta dal suo incasso e non dal registro
 * generico: senza numero della sequenza, senza fotografia, senza
 * classificazione.
 *
 * La correzione non e aggiungere `invoices` all'elenco. E smettere di tenere
 * un elenco: le relazioni di un modello le dichiara lo schema, e Prisma le
 * espone. Un modello nuovo, o un nome che cambia, non ha piu bisogno che
 * qualcuno se ne ricordi.
 */
const RELAZIONI_PER_MODELLO = new Map<string, Set<string>>(
  (Prisma as any).dmmf.datamodel.models.map((modello: any) => [
    modello.name,
    new Set(
      modello.fields
        .filter((campo: any) => campo.kind === "object")
        .map((campo: any) => campo.name as string),
    ),
  ]),
);

/** Da `athletePayment` a `AthletePayment`: il delegato e il modello in minuscolo. */
const modelloDelDelegato = (delegate: string) =>
  delegate ? delegate.charAt(0).toUpperCase() + delegate.slice(1) : "";

/**
 * Le colonne **scalari** di un modello, con il tipo che lo schema dichiara.
 * Serve a distinguere «valore» da «operatore»: vedi `togliRelazioni`.
 */
const SCALARI_PER_MODELLO = new Map<string, Set<string>>(
  (Prisma as any).dmmf.datamodel.models.map((modello: any) => [
    modello.name,
    new Set(
      modello.fields
        .filter((campo: any) => campo.kind !== "object")
        .map((campo: any) => campo.name as string),
    ),
  ]),
);

/**
 * **Le chiavi che questo modulo consuma da se**, e che percio non sono
 * spazzatura anche se non sono colonne.
 *
 * `settings_patch` non e una colonna: e l istruzione «fondi queste chiavi
 * dentro `settings`, senza rileggere le altre», e viene tolta da
 * `applyClubSettingsPatch` **dopo** la normalizzazione. Toglierla prima
 * significava buttare via la scrittura invece di eseguirla.
 */
const CHIAVI_CONSUMATE_DA_QUESTO_MODULO = new Set(["settings_patch"]);

/** Le colonne `Json`, dove un oggetto e il dato e non un'istruzione. */
const JSON_COLUMNS_PER_MODELLO = new Map<string, Set<string>>(
  (Prisma as any).dmmf.datamodel.models.map((modello: any) => [
    modello.name,
    new Set(
      modello.fields
        .filter((campo: any) => campo.kind === "scalar" && campo.type === "Json")
        .map((campo: any) => campo.name as string),
    ),
  ]),
);

/**
 * **Le chiavi che non sono colonne, e i valori che non sono valori.**
 *
 * Togliere le relazioni non basta, ed e la lezione che questa correzione ha
 * dovuto imparare due volte.
 *
 * *Il primo caso, che ha rotto la creazione di un club.* Una chiave che non e
 * ne una relazione ne una colonna — `memberships`, che questo modulo consuma
 * da se — arrivava intatta a `delegate.create({ data })`, e Prisma rifiutava
 * l'argomento sconosciuto. Non e una svista di una chiave: **tutto** cio che
 * lo schema non conosce va tolto, perche il corpo lo scrive chi chiama.
 *
 * *Il secondo, che era una porta aperta.* Prisma legge un **oggetto** su una
 * colonna scalare come un operatore di aggiornamento. Le guardie di questo
 * file leggono `normalized.<campo>` aspettandosi un valore semplice:
 *
 *     PATCH /api/v1/payments/<id>   {"status":{"set":"paid"}}
 *
 * `guardLedgerOwnedPaymentState` calcolava `String({...})` — cioe
 * `"[object Object]"` — non lo riconosceva fra gli stati che sorveglia, e
 * usciva **senza riscrivere niente**; poi `delegate.update` applicava
 * l'operatore. Una rata risultava saldata senza che un euro fosse entrato, che
 * e l'invariante che quella guardia esiste per difendere. Con
 * `{"amount":{"increment":5000}}` cambiava anche l'importo.
 *
 * Un operatore non e un valore che una rotta CRUD debba accettare: qui si
 * scrivono dati, e le operazioni le fa il dominio.
 */
/**
 * **Ogni risorsa di modello deve riconoscere il proprio modello.**
 *
 * `togliRelazioni` e la sola cosa che impedisce a un corpo di richiesta di
 * arrivare a Prisma cosi com'e. Se un delegato non si risolve in un modello
 * dichiarato, quella guardia si spegnerebbe **proprio sulla risorsa che non ha
 * previsto** — ed e la forma di difetto che questo file ha gia incontrato due
 * volte: un elenco che resta indietro in silenzio.
 *
 * Sta nel codice e non in un test per la stessa ragione di
 * `assertOgniRisorsaDichiaraIlConfine`: un test si puo dimenticare di
 * aggiornare, e il difetto che chiude e precisamente una dimenticanza.
 */
const assertOgniRisorsaConosceIlSuoModello = () => {
  const senzaModello = Object.entries(RESOURCE_CONFIG)
    .filter(([, config]) => (config as any)?.kind === "model")
    .map(([resource, config]) => [
      resource,
      modelloDelDelegato(String((config as any)?.delegate || "")),
    ])
    .filter(([, modello]) => !SCALARI_PER_MODELLO.has(modello as string))
    .map(([resource, modello]) => `${resource} -> ${modello || "(nessun delegato)"}`);

  if (senzaModello.length) {
    throw new Error(
      "Queste risorse di modello non si risolvono in un modello dichiarato, " +
        "e le loro scritture non sarebbero filtrate: " +
        senzaModello.join(", "),
    );
  }
};

assertOgniRisorsaConosceIlSuoModello();

const togliRelazioni = (resource: string, input: Record<string, any>) => {
  const config = RESOURCE_CONFIG[resource];
  const modello = modelloDelDelegato(String(config?.delegate || ""));
  const relazioni = RELAZIONI_PER_MODELLO.get(modello);
  const scalari = SCALARI_PER_MODELLO.get(modello);
  /*
    Un modello che non si riconosce **non** disattiva il filtro: sarebbe una
    guardia che si spegne da sola sul caso che non ha previsto. Che ogni
    risorsa si riconosca lo garantisce
    `assertOgniRisorsaConosceIlSuoModello`, che impedisce a questo file di
    caricarsi — la stessa forma di `assertOgniRisorsaDichiaraIlConfine`.
  */
  if (!relazioni || !scalari) {
    throw new Error(
      `Il modello della risorsa «${resource}» non e riconosciuto: nessuna scrittura passa di qui`,
    );
  }

  const next = { ...input };
  for (const nome of Object.keys(next)) {
    if (CHIAVI_CONSUMATE_DA_QUESTO_MODULO.has(nome)) continue;
    if (relazioni.has(nome) || !scalari.has(nome)) {
      delete next[nome];
      continue;
    }

    /*
      Un valore che e un oggetto semplice — non una data, non un array — su una
      colonna scalare e un operatore. `Json` fa eccezione: li l'oggetto **e**
      il valore, e Prisma non ci legge nessun operatore.
    */
    const valore = next[nome];
    if (
      valore !== null &&
      typeof valore === "object" &&
      !(valore instanceof Date) &&
      !Array.isArray(valore) &&
      !JSON_COLUMNS_PER_MODELLO.get(modello)?.has(nome)
    ) {
      /*
        Non «Accesso negato»: quella stringa e il marcatore con cui il route
        handler generico ricava un 403 (CLAUDE.md §8), e questo non e un
        problema di autorizzazione — e un corpo scritto male, che merita un
        400 e un messaggio che dica cosa correggere.
      */
      throw new Error(
        `Il campo «${nome}» attende un valore, non un'operazione`,
      );
    }
  }
  return next;
};

/**
 * **Una tessera non si firma da soli.**
 *
 * `organization_users` non e una tabella qualunque: e cio che decide, per
 * ogni richiesta successiva, quali club un utente puo dichiarare attivi e con
 * che ruolo. Scriverci una riga non aggiunge un dato — aggiunge un
 * **permesso**, e lo aggiunge a monte di ogni confine che questa Wave ha
 * costruito.
 *
 * Il difetto che questa funzione chiude aveva esattamente questa forma. La
 * riga modificata era quella dell'attaccante — quindi `assertRecordAccess`
 * passava, correttamente: e davvero sua — ma il corpo della richiesta portava
 * un `club_access` che nominava **un club qualsiasi** con ruolo `owner`, e
 * nessuno lo leggeva. Da li in poi l'attaccante era owner di quel club per
 * davvero: `resolveOrganizationScopeForUser` gli risolveva `activeRole =
 * "owner"`, e `belongsToActiveClub` gli dava ragione, perche a quel punto
 * **aveva ragione**. Il confine multi-tenant non veniva aggirato: veniva
 * spostato.
 *
 * ## Le tre sole ragioni per cui una tessera puo nascere
 *
 * 1. **Chi ha creato il club.** E il solo caso in cui una tessera nasce senza
 *    che nessuno l'abbia gia: la registrazione con club proprio.
 * 2. **La tessera c'e gia con quel ruolo.** Riscriverla non concede niente —
 *    e cio che serve ai flussi che rimandano l'elenco intero per cambiare
 *    `is_primary`.
 * 3. **Un amministratore del club attivo** che ne tessera un altro. Qui il
 *    club dev'essere quello **attivo**, non uno qualsiasi fra quelli
 *    dell'utente: il ruolo con cui si giudica e `activeRole` (ADR-0094).
 *
 * Tutto il resto e negato. In particolare lo e la pagina di verifica del
 * token, che si tesserava da sola dopo aver chiesto a `validateUserToken` un
 * parere che quella funzione non da: legge la **lunghezza** della stringa e
 * risponde `valid: true`. Non era un invito redento, era un invito
 * dichiarato dal browser; negarlo non toglie una funzione, toglie una porta.
 *
 * ---
 *
 * ## Il tetto (Wave 6, lane 6G, §10.4)
 *
 * Fin qui questa funzione verificava che il concedente amministrasse il club e
 * **non confrontava il ruolo concesso con quello posseduto**: un `club_manager`
 * poteva creare una tessera `role: "owner"`. Il commento che lo accettava
 * diceva «piccola oggi, perche owner e club_manager hanno gli stessi diritti, e
 * una scalata il giorno in cui non li avranno piu».
 *
 * **Quel giorno e questa Wave**: `isOwnerAccessRole` ha smesso di essere una
 * funzione senza chiamanti, e sette atti sono adesso soltanto del proprietario.
 * Il confronto lo fa `assertMayGrantRole`, che e la stessa regola usata dalla
 * schermata degli accessi: nessuno concede un ruolo che non possiede, e `owner`
 * lo concede solo un `owner`.
 *
 * ## E i ruoli personalizzati non passano di qui
 *
 * Una tessera personalizzata ha **due colonne** — lo slug in `role` e il
 * riferimento in `custom_role_id` — e questa porta ne scrive una sola. Una riga
 * con lo slug e senza il riferimento darebbe alla persona il ruolo **base senza
 * restringimento**: cioe piu di quanto il club ha concesso. La strada e una
 * sola, ed e `src/lib/server/club-roles.ts`.
 */
const assertConcessioneDiAccessoLecita = async (
  organization_id: string,
  user_id: string,
  role: string,
  scope?: ResourceAccessScope,
) => {
  /*
    Senza sessione siamo in un percorso interno (registrazione, seed, script):
    li il confine lo garantisce il chiamante, che non prende niente dalla rete.
  */
  if (!scope) {
    return;
  }

  const chiamante = String(scope.userId ?? "").trim();
  const bersaglio = String(user_id ?? "").trim();

  if (isCustomRoleValue(role)) {
    await recordPermissionDenied({
      scope: {
        userId: scope.userId,
        activeRole: scope.activeRole,
        activeOrganizationId: scope.activeOrganizationId,
      },
      permission: "club_roles.assign",
      resource: "organization_users",
      metadata: {
        role: String(role),
        target_user_id: bersaglio,
        reason: "custom_role_from_generic_route",
      },
    });
    throw new Error(
      "Accesso negato: un ruolo personalizzato si assegna dalla gestione accessi, non dalla rotta generica",
    );
  }

  if (chiamante && bersaglio === chiamante) {
    const club = await prisma.club.findUnique({
      where: { id: organization_id },
      select: { creator_id: true },
    });
    if (club?.creator_id && String(club.creator_id) === chiamante) {
      return;
    }
  }

  const gia = await prisma.organizationUser.findFirst({
    where: { organization_id, user_id: bersaglio, role },
    select: { id: true },
  });
  if (gia) {
    return;
  }

  /*
    Un amministratore del club **attivo** tessera qualcun altro. Non se stesso:
    una tessera che ci si concede da soli non e un'amministrazione.

    E non tessera **oltre se stesso**: `assertMayGrantRole` confronta il ruolo
    concesso con quello posseduto, e nega `owner` a chi owner non e. Era il buco
    che il commento di qui sopra dichiarava accettabile, e non lo e piu.
  */
  /*
    **La coerenza dello scope si guarda anche qui.**

    `belongsToActiveClub` di proposito **non** guarda l'elenco dei club
    consentiti: e `assertActiveClub` a farlo, e questa condizione chiamava la
    prima da sola. Restava scoperta proprio la concessione di una tessera di
    club, cioe l'atto che decide chi entra — nello stesso file in cui il
    difetto gemello e stato appena chiuso sul registro generico.

    Si tiene la forma a **ricaduta** invece di sollevare: uno scope incoerente
    non prende questo ramo e finisce sul rifiuto in fondo alla funzione, che e
    il comportamento gia previsto per chi non amministra il club attivo.
  */
  let nelClubAttivo = false;
  try {
    assertActiveClub(scope, organization_id, "la tessera di club");
    nelClubAttivo = true;
  } catch {
    nelClubAttivo = false;
  }

  if (nelClubAttivo && bersaglio !== chiamante) {
    try {
      assertMayGrantRole(scope.activeRole, { role: String(role) });
      return;
    } catch (errore) {
      await recordPermissionDenied({
        scope: {
          userId: scope.userId,
          activeRole: scope.activeRole,
          activeOrganizationId: scope.activeOrganizationId,
        },
        permission: "club_roles.assign",
        resource: "organization_users",
        metadata: {
          role: String(role),
          target_user_id: bersaglio,
          reason: String((errore as Error)?.message || ""),
        },
      });
      throw errore;
    }
  }

  throw new Error(
    "Accesso negato: l'accesso a un club non si concede da soli",
  );
};

const syncUserClubAccess = async (
  user_id: string,
  club_access: any,
  scope?: ResourceAccessScope,
) => {
  if (!Array.isArray(club_access)) {
    return;
  }

  for (const access of club_access) {
    const organization_id = access?.club_id || access?.organization_id;
    if (!organization_id) {
      continue;
    }

    const role = access?.role || "member";
    await assertConcessioneDiAccessoLecita(
      String(organization_id),
      user_id,
      String(role),
      scope,
    );
    const existingAccess = await prisma.organizationUser.findFirst({
      where: {
        organization_id,
        user_id,
        role,
      },
    });

    if (existingAccess) {
      await prisma.organizationUser.update({
        where: { id: existingAccess.id },
        data: {
          is_primary: Boolean(access?.is_primary ?? access?.isPrimary),
        },
      });
    } else {
      await prisma.organizationUser.create({
        data: {
          organization_id,
          user_id,
          role,
          is_primary: Boolean(access?.is_primary ?? access?.isPrimary),
        },
      });
    }
  }
};

/**
 * **Due cose diverse sotto lo stesso nome.**
 *
 * `members` in `clubs` e la collezione dei **soci** — un'anagrafica, con
 * codice fiscale e numero di tessera — ed e chiusa alla riscrittura di massa
 * perche una sonda di concorrenza le ha fatto perdere un socio appena ammesso.
 *
 * `input.members` in questa funzione era invece l'elenco delle **tessere di
 * accesso**: `user_id`, `role`, `is_primary`, cioe `organization_users`.
 *
 * Le due si incontravano nella creazione di un club: `buildClubPayload` manda
 * la tessera del fondatore sotto `members`, `syncClubMembers` la scriveva, e
 * subito dopo il ciclo sulle collezioni la rileggeva come **libro soci** e
 * rifiutava la richiesta. `POST /api/v1/clubs` rispondeva quindi «Accesso
 * negato» **dopo** aver scritto il club e la tessera: la schermata diceva
 * «Errore creazione club» e il club esisteva.
 *
 * Un nome per cosa: `memberships` sono le tessere, `members` sono i soci.
 *
 * E sono sorvegliate come le altre. Era l'unico scrittore di
 * `organization_users` rimasto senza guardia — non sfruttabile, perche tutti
 * e tre i chiamanti sono preceduti da `assertRecordAccess` o dalla creazione
 * del club, ma la tabella non deve avere uno scrittore sorvegliato e uno no.
 */
const syncClubMembers = async (
  organization_id: string,
  members: any,
  scope?: ResourceAccessScope,
) => {
  if (!Array.isArray(members)) {
    return;
  }

  for (const member of members) {
    if (!member?.user_id) {
      continue;
    }

    const role = member?.role || "member";
    await assertConcessioneDiAccessoLecita(
      organization_id,
      String(member.user_id),
      String(role),
      scope,
    );
    const existingAccess = await prisma.organizationUser.findFirst({
      where: {
        organization_id,
        user_id: member.user_id,
        role,
      },
    });

    if (existingAccess) {
      await prisma.organizationUser.update({
        where: { id: existingAccess.id },
        data: {
          is_primary: Boolean(member?.is_primary ?? member?.isPrimary),
        },
      });
    } else {
      await prisma.organizationUser.create({
        data: {
          organization_id,
          user_id: member.user_id,
          role,
          is_primary: Boolean(member?.is_primary ?? member?.isPrimary),
        },
      });
    }
  }
};

const ensureClubDashboard = async (
  organization_id: string,
  creator_id?: string | null,
  dashboard_data?: any,
) => {
  if (!dashboard_data) {
    return;
  }

  const existing = await prisma.dashboard.findFirst({
    where: {
      organization_id,
    },
  });

  if (existing) {
    return;
  }

  await prisma.dashboard.create({
    data: {
      organization_id,
      creator_id: creator_id || null,
      slug: `dashboard-${Date.now().toString().slice(-8)}`,
      settings:
        typeof dashboard_data?.settings === "string"
          ? JSON.parse(dashboard_data.settings)
          : dashboard_data?.settings || {},
    },
  });
};

const syncClubAggregateField = async (
  organization_id: string,
  resource_type: string,
) => {
  if (!CLUB_JSON_FIELDS.includes(resource_type)) {
    return;
  }

  const items = await prisma.clubResourceItem.findMany({
    where: {
      organization_id,
      resource_type,
    },
    orderBy: {
      created_at: "asc",
    },
  });

  const aggregate = items.map((item) => serializeClubResourceItem(item));
  await prisma.club.update({
    where: { id: organization_id },
    data: {
      [resource_type]: aggregate,
    },
  });
};

const newResourceItemId = () =>
  typeof globalThis.crypto?.randomUUID === "function"
    ? globalThis.crypto.randomUUID()
    : `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 14)}`;

/**
 * Riallinea `club_resource_items` a un campo JSON del club.
 *
 * Tre proprieta che prima mancavano (WP-10, WP-31):
 *
 * 1. **transazionale**: cancellazione, reinserimento e aggregato stanno nella
 *    stessa transazione. Un errore a meta non lascia piu il club senza
 *    categorie e l'aggregato disallineato;
 * 2. **identita preservata**: un elemento gia presente mantiene la sua riga
 *    (stesso `id`, stesso `created_at`), invece di riceverne una nuova a ogni
 *    salvataggio;
 * 3. **una sola scrittura di massa**: `createMany` al posto di una `create`
 *    per elemento. Salvare una categoria non costa piu N round trip.
 */
/**
 * Il cuore della sincronizzazione, **dentro** una transazione gia aperta.
 *
 * E separato dal wrapper perche un'operazione sola puo dover riscrivere piu
 * collezioni insieme: assegnare un kit tocca magazzino, assegnazioni e numeri
 * di maglia, e sono tre scritture che devono riuscire o fallire insieme. Con
 * una transazione per collezione, un errore a meta lascerebbe il magazzino
 * scalato e l'assegnazione mai registrata.
 */
const applyClubResourceSync = async (
  tx: Prisma.TransactionClient,
  organization_id: string,
  resource_type: string,
  items: any,
) => {
  const normalizedItems =
    resource_type === "members" ? normalizeClubMembers(items) : items;

  if (!Array.isArray(normalizedItems)) {
    return;
  }

  /*
    **Il lock che le tre gemelle avevano e questa no.**

    `appendClubResourceItem`, `updateClubResourceItem` e
    `removeClubResourceItem` prendono tutte il `FOR UPDATE` sul club prima di
    toccare la collezione. Questa — che la riscrive **intera**, cancellando e
    ricreando — non lo prendeva: la mutua esclusione che il lock deve garantire
    semplicemente non esisteva contro questo percorso.

    Una sonda di concorrenza ha lanciato due riscritture della stessa
    collezione, quindici volte: **quindici** hanno prodotto righe duplicate in
    `club_resource_items`, e **quindici** hanno lasciato la tabella e
    l'aggregato JSON a dire due cose diverse. Il database non poteva accorgersene
    — su `club_resource_items` non c'e nessun indice unico oltre alla chiave
    primaria — quindi la divergenza restava silenziosa.

    Prendere il lock qui chiude anche il disallineamento d'ordine che la stessa
    sonda ha visto come deadlock fra questo percorso e il salvataggio di un
    contratto sponsor: adesso tutti e quattro prendono lo stesso lock per primo.
  */
  await tx.$queryRaw`SELECT id FROM clubs WHERE id = ${organization_id}::uuid FOR UPDATE`;

  const existingItems = await tx.clubResourceItem.findMany({
    where: { organization_id, resource_type },
    orderBy: { created_at: "asc" },
  });

  const existingByKey = new Map<string, (typeof existingItems)[number]>();
  for (const existing of existingItems) {
    existingByKey.set(existing.id, existing);
    const logicalId = getClubResourceLogicalId(existing);
    if (logicalId) {
      existingByKey.set(logicalId, existing);
    }
  }

  const now = new Date();
  const rows = normalizedItems.map((item) => {
    const requestedId = String(item?.id || "").trim();
    const existing = requestedId ? existingByKey.get(requestedId) : undefined;

    return {
      id:
        existing?.id ||
        (isUuid(item?.id) ? normalizeUuid(item.id) : newResourceItemId()),
      organization_id,
      resource_type,
      name: item?.name || item?.title || null,
      status: item?.status || null,
      date: toDateOrUndefined(item?.date) || null,
      payload: item,
      created_at: existing?.created_at || now,
      updated_at: now,
    };
  });

  // L'aggregato riflette l'ordine con cui il client ha inviato gli elementi:
  // rileggerli ordinati per `created_at` sarebbe ambiguo, perche un inserimento
  // di massa condivide lo stesso istante.
  const aggregate = rows.map((row) => serializeClubResourceItem(row));

  await tx.clubResourceItem.deleteMany({
    where: { organization_id, resource_type },
  });

  if (rows.length > 0) {
    await tx.clubResourceItem.createMany({ data: rows });
  }

  if (CLUB_JSON_FIELDS.includes(resource_type)) {
    await tx.club.update({
      where: { id: organization_id },
      data: { [resource_type]: aggregate },
    });
  }
};

const syncClubResourceItemsFromField = async (
  organization_id: string,
  resource_type: string,
  items: any,
) => {
  if (!Array.isArray(resource_type === "members" ? normalizeClubMembers(items) : items)) {
    return;
  }

  await prisma.$transaction((tx) =>
    applyClubResourceSync(tx, organization_id, resource_type, items),
  );
};

const assertKnownClubResourceType = (resource_type: string) => {
  if (!CLUB_RESOURCE_TYPES.includes(resource_type)) {
    throw new Error(`Risorsa di club sconosciuta: ${resource_type}`);
  }
};

/**
 * Legge una collezione di club **senza** filtro di stagione.
 *
 * Il riporto (WP-35) ha bisogno di vedere tutte le stagioni insieme: quella di
 * origine per copiarne la configurazione e quella di destinazione per sapere
 * cosa c'e gia. Passa da qui e non da Prisma diretto perche `resources.ts` e
 * il proprietario dell'accesso ai dati di club.
 */
export const readClubResourceCollection = async (
  organization_id: string,
  resource_type: string,
) => {
  assertKnownClubResourceType(resource_type);

  const items = await prisma.clubResourceItem.findMany({
    where: { organization_id, resource_type },
    orderBy: { created_at: "asc" },
  });

  return items.map((item) => serializeClubResourceItem(item));
};

/**
 * Aggiunge **un** elemento a una collezione di club, dentro una transazione
 * gia aperta.
 *
 * **Il difetto che chiude** (Wave 4, §19). Creare un socio era una lettura, un
 * append e una riscrittura dell'intera colonna JSON **fatta dal browser**: due
 * segreterie che creavano un socio nello stesso minuto, la seconda scrittura
 * cancellava la prima. Nessun errore, nessuna traccia — un socio che sparisce.
 *
 * Qui non si riscrive la collezione: si inserisce **una riga** in
 * `club_resource_items` e si ricalcola l'aggregato JSON leggendo la tabella,
 * che e la fonte. Il `FOR UPDATE` sul club mette in fila le richieste
 * simultanee — lo stesso rimedio, e lo stesso modo di scriverlo, di
 * `applyClubSettingsPatch` e del registro incassi.
 *
 * Prende il client della transazione e non ne apre una propria perche chi
 * aggiunge un elemento sta quasi sempre facendo anche altro: l'ammissione di un
 * socio scrive la sua anagrafica **e** il suo primo evento di libro, e le due
 * cose devono riuscire o fallire insieme.
 */
export const appendClubResourceItem = async (
  tx: Prisma.TransactionClient,
  organization_id: string,
  resource_type: string,
  item: Record<string, any>,
) => {
  assertKnownClubResourceType(resource_type);

  if (!item || typeof item !== "object" || Array.isArray(item)) {
    throw new Error(`Elemento non valido per ${resource_type}`);
  }

  await tx.$queryRaw`SELECT id FROM clubs WHERE id = ${organization_id}::uuid FOR UPDATE`;

  const now = new Date();
  /*
    Il tipo e dichiarato: lo spread di un `Record<string, any>` perde l'indice
    e il risultato sarebbe `{ id: string }`, cioe un oggetto senza nessuno dei
    campi del socio.
  */
  const payload: Record<string, any> = {
    ...item,
    id: String(item.id || "").trim() || newResourceItemId(),
  };

  await tx.clubResourceItem.create({
    data: {
      id: isUuid(payload.id) ? normalizeUuid(payload.id) : newResourceItemId(),
      organization_id,
      resource_type,
      name: payload?.name || payload?.title || null,
      status: payload?.status || null,
      date: toDateOrUndefined(payload?.date) || null,
      payload,
      created_at: now,
      updated_at: now,
    },
  });

  if (CLUB_JSON_FIELDS.includes(resource_type)) {
    const rows = await tx.clubResourceItem.findMany({
      where: { organization_id, resource_type },
      orderBy: { created_at: "asc" },
    });

    await tx.club.update({
      where: { id: organization_id },
      data: { [resource_type]: rows.map((row) => serializeClubResourceItem(row)) },
    });
  }

  return payload;
};

/**
 * Modifica **un** elemento di una collezione di club, dentro una transazione
 * gia aperta.
 *
 * E la terza gemella di `appendClubResourceItem` e `removeClubResourceItem`, e
 * mancava: senza di lei l'unico modo di correggere un socio era rileggere la
 * colonna JSON intera dal browser, cambiare un elemento dell'array e
 * risalvarla. Una sonda di concorrenza ha mostrato cosa succede quando quella
 * riscrittura incrocia un'ammissione: **un socio compare nel libro e non in
 * anagrafica**, perche la copia arrivata dal browser non lo conteneva.
 *
 * Il `FOR UPDATE` mette in fila le richieste, ma da solo non basterebbe — e la
 * lezione gia scritta in `applyClubSettingsPatch`: una copia vecchia resta
 * vecchia anche se aspetta il proprio turno. Cio che risolve e **scrivere una
 * riga sola**: chi corregge un socio dichiara quel socio, e non l'elenco.
 *
 * **Il confine di club sta nella ricerca.** Le righe si cercano gia filtrate
 * per `organization_id`: un identificativo di un altro club non trova niente,
 * e la funzione restituisce `null` senza dire che quella riga esiste altrove.
 *
 * **L'identificativo non si cambia.** E la chiave con cui il libro soci, gli
 * incassi e i documenti citano l'elemento: riscriverlo li lascerebbe a citare
 * qualcosa che non esiste piu.
 */
export const updateClubResourceItem = async (
  tx: Prisma.TransactionClient,
  organization_id: string,
  resource_type: string,
  id: string,
  updates: Record<string, any>,
) => {
  assertKnownClubResourceType(resource_type);

  const wanted = String(id || "").trim();
  if (!wanted) {
    throw new Error(`Elemento non indicato per ${resource_type}`);
  }
  if (!updates || typeof updates !== "object" || Array.isArray(updates)) {
    throw new Error(`Modifica non valida per ${resource_type}`);
  }

  await tx.$queryRaw`SELECT id FROM clubs WHERE id = ${organization_id}::uuid FOR UPDATE`;

  const rows = await tx.clubResourceItem.findMany({
    where: { organization_id, resource_type },
    orderBy: { created_at: "asc" },
  });

  const target = rows.find(
    (row) =>
      String(row.id) === wanted ||
      String((row.payload as any)?.id || "") === wanted,
  );

  if (!target) {
    return null;
  }

  const corrente: Record<string, any> =
    target.payload && typeof target.payload === "object" && !Array.isArray(target.payload)
      ? (target.payload as Record<string, any>)
      : {};

  const payload: Record<string, any> = {
    ...corrente,
    ...updates,
    id: corrente.id ?? String(target.id),
  };

  const aggiornata = await tx.clubResourceItem.update({
    where: { id: target.id },
    data: {
      name: payload?.name || payload?.title || null,
      status: payload?.status || null,
      date: toDateOrUndefined(payload?.date) || null,
      payload,
      updated_at: new Date(),
    },
  });

  if (CLUB_JSON_FIELDS.includes(resource_type)) {
    /*
      L'aggregato si ricompone dalle righe **gia lette**, con quella corretta al
      posto suo: e la stessa fonte, e risparmia una seconda lettura dentro il
      lock.
    */
    await tx.club.update({
      where: { id: organization_id },
      data: {
        [resource_type]: rows.map((row) =>
          serializeClubResourceItem(row.id === target.id ? aggiornata : row),
        ),
      },
    });
  }

  return serializeClubResourceItem(aggiornata);
};

/**
 * Toglie **un** elemento da una collezione di club, dentro una transazione gia
 * aperta.
 *
 * E la gemella di `appendClubResourceItem` e chiude lo stesso difetto dall'altro
 * lato: cancellare una voce leggendo la colonna JSON intera, togliendo un
 * elemento dall'array e risalvandolo **dal browser** cancellava anche tutto cio
 * che qualcun altro aveva scritto nel frattempo. Qui si cancella **una riga** di
 * `club_resource_items` e si ricalcola l'aggregato dalla tabella, sotto lo
 * stesso `FOR UPDATE` sul club.
 *
 * **Il confine di club sta nella ricerca, non nella cancellazione.** Le righe si
 * cercano gia filtrate per `organization_id`: un identificativo di un altro club
 * non trova niente, e la funzione restituisce `null` senza dire che quella riga
 * esiste altrove.
 *
 * Accetta sia l'identificativo della riga sia quello scritto nel payload perche
 * le collezioni storiche portano il proprio `id` dentro il JSON, e la
 * serializzazione lo lascia vincere su quello della riga.
 */
export const removeClubResourceItem = async (
  tx: Prisma.TransactionClient,
  organization_id: string,
  resource_type: string,
  id: string,
) => {
  assertKnownClubResourceType(resource_type);

  const wanted = String(id || "").trim();
  if (!wanted) {
    throw new Error(`Elemento non indicato per ${resource_type}`);
  }

  await tx.$queryRaw`SELECT id FROM clubs WHERE id = ${organization_id}::uuid FOR UPDATE`;

  const rows = await tx.clubResourceItem.findMany({
    where: { organization_id, resource_type },
    orderBy: { created_at: "asc" },
  });

  const target = rows.find(
    (row) =>
      String(row.id) === wanted ||
      String((row.payload as any)?.id || "") === wanted,
  );

  if (!target) {
    return null;
  }

  await tx.clubResourceItem.delete({ where: { id: target.id } });

  if (CLUB_JSON_FIELDS.includes(resource_type)) {
    /*
      L'aggregato si ricompone dalle righe **gia lette**, meno quella tolta: e
      la stessa fonte, e risparmia una seconda lettura dentro il lock.
    */
    await tx.club.update({
      where: { id: organization_id },
      data: {
        [resource_type]: rows
          .filter((row) => row.id !== target.id)
          .map((row) => serializeClubResourceItem(row)),
      },
    });
  }

  return serializeClubResourceItem(target);
};

/**
 * Riscrive una collezione di club mantenendo allineati `club_resource_items` e
 * il campo JSON aggregato. Gli elementi gia esistenti conservano riga e
 * `created_at`: senza, un riporto rigenererebbe l'identita di tutte le
 * stagioni, non solo di quella nuova.
 */
export const replaceClubResourceCollection = async (
  organization_id: string,
  resource_type: string,
  items: any[],
) => {
  assertKnownClubResourceType(resource_type);

  if (!Array.isArray(items)) {
    throw new Error(`Collezione non valida per ${resource_type}`);
  }

  await syncClubResourceItemsFromField(organization_id, resource_type, items);
  return items;
};

/**
 * Riscrive **piu** collezioni di club in una transazione sola.
 *
 * Serve alle operazioni che per loro natura ne toccano diverse insieme:
 * assegnare un kit a un atleta scala il magazzino, aggiunge l'assegnazione e
 * puo assegnare un numero di maglia. Chiamare tre volte
 * `replaceClubResourceCollection` sarebbe corretto sul singolo campo e
 * sbagliato sull'operazione, perche un errore sulla seconda lascerebbe la
 * prima gia scritta: magazzino scalato per un kit che nessuno risulta avere.
 *
 * Ogni collezione mantiene la stessa garanzia della versione singola —
 * `club_resource_items` e il campo JSON aggregato restano allineati.
 */
export const replaceClubResourceCollections = async (
  organization_id: string,
  collections: Array<{ resource_type: string; items: any[] }>,
) => {
  for (const collection of collections) {
    assertKnownClubResourceType(collection.resource_type);

    if (!Array.isArray(collection.items)) {
      throw new Error(`Collezione non valida per ${collection.resource_type}`);
    }
  }

  await prisma.$transaction(async (tx) => {
    for (const collection of collections) {
      await applyClubResourceSync(
        tx,
        organization_id,
        collection.resource_type,
        collection.items,
      );
    }
  });

  return collections;
};

/**
 * **Anche una risorsa di club scrive tre colonne vere.**
 *
 * `club_resource_items` tiene quasi tutto dentro `payload`, che e `Json` e
 * dove un oggetto **e** il dato. Ma `name`, `status` e `date` sono colonne
 * scalari, e finiscono in un `delegate.update` cosi come arrivano: un
 * `{"name":{"set":"..."}}` veniva percio eseguito come **operazione**.
 *
 * Non rompeva nessun invariante — sono etichette, non denaro — ma la regola
 * scritta per il registro generico («qui si scrivono dati, e le operazioni le
 * fa il dominio») valeva su ventuno risorse e non sulle altre trenta, e niente
 * lo diceva.
 */
const assertColonneScalariDiClub = (input: Record<string, any>) => {
  /*
    `title` non e una colonna, ma `normalizeClubResourceInput` lo usa come
    ripiego per `name`: un operatore li dentro arrivava a Prisma e tornava
    come 500 con la forma della query e l'identificativo del club nel
    messaggio, invece del 400 che merita.
  */
  for (const nome of ["name", "title", "status", "date", "organization_id", "id"]) {
    const valore = input[nome];
    if (
      valore !== null &&
      valore !== undefined &&
      typeof valore === "object" &&
      !(valore instanceof Date) &&
      !Array.isArray(valore)
    ) {
      throw new Error(
        `Il campo «${nome}» attende un valore, non un'operazione`,
      );
    }
  }
};

const normalizeClubResourceInput = (
  resource: string,
  input: Record<string, any>,
) => {
  assertColonneScalariDiClub(input);
  const next = normalizeCommonAliases(input);
  const {
    id,
    organization_id,
    created_at,
    updated_at,
    name,
    status,
    date,
    resource_type: _ignoredResourceType,
    ...payload
  } = next;
  const normalizedPayload =
    resource === "members"
      ? normalizeClubMembers([
          !isUuid(id) && typeof id === "string" && id.trim()
            ? { id: id.trim(), ...payload }
            : payload,
        ])?.[0] || payload
      : !isUuid(id) && typeof id === "string" && id.trim()
        ? { id: id.trim(), ...payload }
        : payload;

  return stripUndefined({
    id: isUuid(id) ? normalizeUuid(id) : undefined,
    organization_id,
    resource_type: resource,
    name: name || normalizedPayload.name || normalizedPayload.title || null,
    status: status || normalizedPayload.status || null,
    date: toDateOrUndefined(date || normalizedPayload.date) || null,
    payload: normalizedPayload,
    created_at: toDateOrUndefined(created_at),
    updated_at: toDateOrUndefined(updated_at),
  });
};

/**
 * **Un gettone d'accesso e una concessione differita, e vale il soffitto di chi
 * lo conia.**
 *
 * Misurato: `POST /api/v1/organization_users {role:"owner"}` nega con «l'accesso
 * a un club non si concede da soli», e poi lo stesso gestore coniava un gettone
 * con `payload.role: "owner"`, lo riscattava da una seconda utenza, e otteneva
 * il ruolo di vertice del club. Il divieto che conta non e «chi conia»: e «chi si
 * concede cosa», e sul conio non c'era.
 *
 * La firma del coniatore resta sulla riga perche il riscatto avviene **dopo**,
 * quando quella sessione non c'e piu: e la stessa forma con cui si congelano
 * etichetta e ambito di una causale contabile (ADR-0106). Il client non la
 * scrive — se ci prova viene tolta — altrimenti la firma direbbe solo cio che
 * chi la usa vuole che dica.
 */
const guardaIlConioDiUnGettone = async (
  resource: string,
  data: Record<string, any>,
  scope?: ResourceAccessScope,
) => {
  if (resource !== "access_tokens") return;

  const payload =
    data.payload && typeof data.payload === "object" ? data.payload : null;
  if (!payload) return;

  delete payload.minted_by_role;
  delete payload.minted_by_user_id;
  delete payload.mintedByRole;
  delete payload.mintedByUserId;

  if (!scope) return;

  const concesso = String(payload.role || "").trim();

  if (concesso) {
    try {
      assertMayGrantRole(scope.activeRole, { role: concesso });
    } catch (errore) {
      await recordPermissionDenied({
        scope: {
          userId: scope.userId,
          activeRole: scope.activeRole,
          activeOrganizationId: scope.activeOrganizationId,
        },
        permission: "club_roles.assign",
        resource: "access_tokens",
        metadata: {
          role: concesso,
          reason: String((errore as Error)?.message || ""),
        },
      });
      throw errore;
    }
  }

  payload.minted_by_role = scope.activeRole || null;
  payload.minted_by_user_id = scope.userId || null;
};

const findClubResourceRecord = async (
  resource: string,
  identifier: string,
  scope?: ResourceAccessScope,
) => {
  const trimmedIdentifier = String(identifier || "").trim();
  if (!trimmedIdentifier) {
    return null;
  }

  const directId = isUuid(trimmedIdentifier)
    ? normalizeUuid(trimmedIdentifier)
    : undefined;
  /*
    **Il club attivo, o niente.**

    Qui c'erano altri due rami: uno su `allowedOrganizationIds` — la forma
    testuale che ADR-0094 vieta — e uno completamente **senza** filtro di club.
    Nessuno dei due era raggiungibile (`resolveOrganizationScopeForUser` non
    produce mai quello stato) e `assertRecordAccess` li avrebbe comunque
    intercettati a valle. Ma un ramo irraggiungibile e un ramo che qualcuno un
    giorno rende raggiungibile senza sapere cosa gli sta aprendo, e questa Wave
    ha gia visto la forma `in: allowedOrganizationIds` far leggere l'IBAN di
    un'altra societa.

    Uno scope senza club attivo non cerca: esce con `null`, e non con una
    clausola inventata — un valore fittizio su una colonna `uuid` non
    restituisce zero righe, fa fallire la query con l'errore del driver, che e
    proprio cio che `api-errors.ts` esiste per non far uscire.

    Il ramo senza filtro resta per il solo caso **senza scope**: sono le
    chiamate interne del server, che non hanno una sessione e non stanno
    autorizzando nessuno.
  */
  if (scope && !scope.activeOrganizationId) return null;

  const organizationFilter = scope?.activeOrganizationId
    ? { organization_id: scope.activeOrganizationId }
    : {};

  return prisma.clubResourceItem.findFirst({
    where: {
      resource_type: resource,
      ...organizationFilter,
      OR: [
        ...(directId ? [{ id: directId }] : []),
        {
          payload: {
            path: ["id"],
            equals: trimmedIdentifier,
          },
        },
      ],
    },
  });
};

/**
 * I filtri di una lista, ricavati dalla query string.
 *
 * Esportata perche il caso dell'id logico si collauda qui e non montando una
 * rotta: e una funzione pura che decide un `where`.
 */
/**
 * I tipi di riga in `club_resource_items` che hanno un **proprietario di
 * dominio** e non passano da questo registro generico.
 *
 * **Perche un elenco e non una convenzione.** La Wave 2 ha messo annunci della
 * bacheca e regole di automazione in `club_resource_items` — la tabella e la
 * loro, e non serviva altro — ma **senza** aggiungerli a `CLUB_RESOURCE_TYPES`,
 * cioe senza aprire loro il CRUD generico. Il difetto e che leggere
 * `club_resource_items` **e comunque possibile**: e una risorsa di modello, e
 * sta fra quelle che un allenatore puo leggere (`TRAINER_READ_RESOURCES`).
 *
 * Il risultato, verificato a runtime prima di questa riga: un allenatore
 * chiamava `GET /api/v1/club_resource_items?resource_type=announcements` e
 * leggeva le **bozze** degli annunci e i modelli di messaggio delle
 * automazioni, scavalcando sia il pubblico della bacheca sia
 * `automations.manage`, che non ha.
 *
 * Chi vuole questi dati passa dalle loro rotte, dove il permesso e il pubblico
 * vengono applicati.
 */
export const DOMAIN_OWNED_RESOURCE_ITEM_TYPES = [
  "announcements",
  "automation_rules",
  /*
    **La terza porta della prima nota, che la Wave 4 credeva chiusa.**

    Il commento in `src/lib/accounting/permissions.ts` la descriveva **al
    passato** — «il CRUD generico su `transactions` e `transfers` *rispondeva*
    200 e permetteva di cancellare» — e l'audit ha dimostrato che era ancora
    aperta, e a **staff e collaboratori**.

    Perche conta: quelle righe non sono denaro inerte. `projectLegacyClubMovements`
    le proietta **nella prima nota**, e cancellarne una faceva sparire una riga
    dal registro senza storno, senza autore e senza una traccia con l'id del
    movimento. Cioe annullava D-3, che e l'invariante centrale di questa Wave:
    il denaro non si cancella.

    Il registro nuovo chiede `accounting.manage` per scrivere e
    `accounting.reverse` per stornare, e un `DELETE` non ce l'ha affatto. La
    porta accanto lo concedeva a chi non ha nessuno dei due.
  */
  "transactions",
  "transfers",
  /*
    Le previsioni hanno un proprietario dalla Wave 4
    (`src/lib/server/expected-entries.ts`), che scrive **una riga** sotto un
    lock invece di riscrivere l'intera collezione dal browser. La vecchia porta
    resterebbe l'unico modo di perdere una previsione scritta da qualcun altro
    nello stesso minuto.
  */
  "expected_income",
  "expected_expenses",
  /*
    **I soci, dalla Wave 4 in poi.**

    L'anagrafica del socio e la meta visibile del **libro soci**, che e
    append-only e deve poter dimostrare chi era socio a una data. Riscriverla in
    blocco dal browser — leggi la colonna, cambia un elemento, risalva l'array —
    e il modo in cui una sonda di concorrenza ha ottenuto lo stato che nessuna
    schermata puo spiegare: **un socio presente nel libro e assente
    dall'anagrafica**, perche la copia partita dal browser non lo conteneva
    ancora.

    Un registro che cita una persona che l'anagrafica non conosce piu non
    dimostra piu niente. Adesso i soci si scrivono uno alla volta, dalle rotte
    di `/api/v1/membership`, e ognuna tocca una riga di `club_resource_items`
    sotto il `FOR UPDATE` del club.
  */
  "members",
] as const;

/**
 * Le notifiche si leggono **per destinatario**, non per club.
 *
 * **Il difetto che questa funzione chiude, e perche era il piu grave.** La
 * Wave 2 aveva indirizzato le notifiche economiche di societa a chi puo vedere
 * quel dato, togliendo il `user_id: null` che il prodotto interpreta come «di
 * tutti». Ma `notifications` e una risorsa di modello, sta fra quelle che un
 * **allenatore** puo elencare (`TRAINER_READ_RESOURCES`), e il registro
 * generico non ha mai filtrato per destinatario: `GET /api/v1/notifications`
 * restituiva a chiunque le notifiche indirizzate a qualcun altro, riepilogo
 * delle famiglie in arretrato compreso. Il permesso era stato spostato dal
 * canale al criterio, e la porta accanto era rimasta aperta.
 *
 * La regola e quella che **tutte** le schermate applicano gia da sole — la
 * propria piu quelle di club — solo che adesso la applica il server, che e il
 * posto in cui una regola di visibilita conta.
 */
const RECIPIENT_SCOPED_RESOURCES = new Set([
  "notifications",
  "simplified_notifications",
]);

/**
 * **Il destinatario di una notifica non lo sceglie chi scrive.**
 *
 * `applyRecipientScope` qui sotto chiude la **lettura**; questa chiude la
 * scrittura, che era rimasta aperta del tutto. `notifications` sta fra le
 * risorse che un allenatore puo creare (`TRAINER_WRITE_RESOURCES`), il CRUD
 * generico forza `organization_id` al club attivo — e non guardava `user_id`.
 *
 * Ne uscivano due cose, entrambe da un ruolo che non ha `communications.send`:
 *
 * - `{"user_id": null}` — che il prodotto legge come «di tutti» — recapitava
 *   testo arbitrario a **ogni** account del club, proprietario, segreteria,
 *   genitori e atleti compresi: lo stesso pubblico del motore delle audience,
 *   senza il motore, senza registro delle consegne e senza una riga di audit;
 * - `{"user_id": "<uuid di chiunque>"}` — la rotta chiama poi
 *   `sendNotificationEmails`, che risolve l'utente **senza filtro di club**:
 *   una email vera, dal server del club, verso un account di un'altra societa.
 *
 * La regola: si scrive a una persona, e quella persona deve stare nel club in
 * cui si sta scrivendo. Le notifiche «di societa» non passano di qui — le
 * scrive `club-notifications.ts`, che le indirizza una per destinatario.
 */
const guardNotificationRecipient = async (
  resource: string,
  data: Record<string, any>,
  scope?: ResourceAccessScope,
) => {
  if (!RECIPIENT_SCOPED_RESOURCES.has(resource)) return;

  /*
    **Una chiave assente e un destinatario assente.**

    Qui c'era `if (!("user_id" in data)) return;`, e bastava **omettere** la
    chiave per scavalcare tutta la guardia: `user_id` non lo inietta nessuno a
    monte — `normalizeModelInput` forza solo le colonne JSON, `stripUndefined`
    toglie le chiavi assenti — e la colonna e nullable, quindi Prisma scriveva
    `NULL`. Cioe esattamente la riga «di tutti» che questa guardia esiste per
    impedire, ottenuta togliendo un campo invece che scrivendoci dentro.

    Rifiutare `{"user_id": null}` e lasciar passare `{}` non e una guardia: e
    un dosso. Sulla **modifica** l'assenza va invece rispettata — un `PATCH`
    che non nomina il destinatario non deve ridichiararlo — e infatti li e chi
    chiama a decidere se interpellarci.
  */
  const destinatario = String(data.user_id ?? "").trim();

  if (!destinatario) {
    throw new Error(
      "Accesso negato: una notifica si indirizza a una persona. " +
        "Le notifiche di societa non si scrivono da questa rotta.",
    );
  }

  const clubId = String(
    data.organization_id || scope?.activeOrganizationId || "",
  ).trim();

  if (!clubId) {
    throw new Error("Accesso negato: club non risolto per la notifica");
  }

  const [membership, club] = await Promise.all([
    prisma.organizationUser.findFirst({
      where: { organization_id: clubId, user_id: destinatario },
      select: { id: true },
    }),
    /*
      Il proprietario di un club puo esistere solo in `clubs.creator_id`: la
      creazione valorizza quella colonna **senza** scrivere una riga di
      appartenenza, e `resolveOrganizationScopeForUser` lo riconosce da li.
    */
    prisma.club.findUnique({
      where: { id: clubId },
      select: { creator_id: true },
    }),
  ]);

  if (membership) return;
  if (String(club?.creator_id || "").trim() === destinatario) return;

  throw new Error(
    "Accesso negato: il destinatario di una notifica deve appartenere al club",
  );
};

/**
 * **Una riga figlia non si aggancia al padre di un altro club.**
 *
 * `createResource` forza `organization_id` al club della sessione, e questo
 * chiude la meta piu ovvia: la riga nasce nel club giusto. Ma non guardava
 * **a chi si attacca**. Su `athlete_category_memberships` bastava mandare
 * l'identificativo di un atleta di un altro club: la riga finiva nel club di
 * chi scrive e pendeva dall'atleta di qualcun altro.
 *
 * Le conseguenze non sono teoriche. Il club proprietario rilegge quelle
 * appartenenze attraverso relazioni che non filtrano per club, e un
 * `site_id` iniettato li dentro fa **sparire un suo atleta** da ogni elenco
 * per sede: non corrisponde a nessuna delle sue sedi, e non e piu «senza
 * sede».
 *
 * E la stessa forma del conto di un altro club, che nella contabilita e stata
 * chiusa con una chiave esterna composta. Qui la chiave composta non c'e — e
 * aggiungerla e una migrazione su una tabella grande — quindi la chiude
 * l'applicazione, e lo dice.
 */
const PADRE_DA_VERIFICARE: Record<string, { campo: string; modello: string }> = {
  athlete_category_memberships: { campo: "athlete_id", modello: "athlete" },
};

const guardParentBelongsToClub = async (
  resource: string,
  data: Record<string, any>,
  scope?: ResourceAccessScope,
) => {
  const regola = PADRE_DA_VERIFICARE[resource];
  if (!regola) return;

  const padreId = String(data[regola.campo] ?? "").trim();
  if (!padreId) return;

  const clubId = String(
    data.organization_id || scope?.activeOrganizationId || "",
  ).trim();
  if (!clubId) throw new Error("Accesso negato: club non risolto");

  const padre = await (prisma as any)[regola.modello].findUnique({
    where: { id: padreId },
    select: { organization_id: true },
  });

  if (!padre) {
    throw new Error("Accesso negato: la riga a cui si collega non esiste");
  }

  if (String(padre.organization_id) !== clubId) {
    throw new Error(
      "Accesso negato: non si puo collegare una riga a un elemento di un altro club",
    );
  }
};

const applyRecipientScope = (
  resource: string,
  where: Record<string, any>,
  scope?: ResourceAccessScope,
) => {
  if (!RECIPIENT_SCOPED_RESOURCES.has(resource) || !scope?.userId) return;

  /*
    Un `user_id` chiesto esplicitamente resta, ma solo se e il proprio: chi
    domanda le notifiche di un altro non deve ottenerle scrivendo il suo
    identificativo nella query string.
  */
  if (typeof where.user_id === "string" && where.user_id !== scope.userId) {
    throw new Error(
      "Accesso negato: le notifiche si leggono per il proprio destinatario",
    );
  }

  delete where.user_id;
  where.AND = [
    ...(where.AND || []),
    { OR: [{ user_id: scope.userId }, { user_id: null }] },
  ];
};

/**
 * Solleva se qualcuno prova a scrivere una riga di un dominio che ha gia il suo
 * proprietario, passando dal registro generico.
 *
 * **Perche la lettura non bastava.** La prima versione della guardia copriva
 * l'elenco e il dettaglio, e lasciava scoperti creazione, modifica e
 * cancellazione — che sono i tre verbi che contano di piu, e che
 * `canAccessClubResource` concede a collaboratori e segreteria su
 * `club_resource_items`. Un collaboratore poteva quindi creare un annuncio
 * senza `board.publish`, **accendere un'automazione** e riscriverne il testo
 * senza `automations.manage`, e cancellare entrambi. E il `PATCH` restituiva
 * il record, cioe era anche la scorciatoia di lettura che il dettaglio negava.
 */
/**
 * **Una risorsa riservata alla direzione non si raggiunge dal registro
 * generico.**
 *
 * `access_tokens`, `bank_accounts`, `document_templates` e `payment_methods`
 * hanno una rotta propria, protetta dalla matrice come riservata alla
 * direzione. Ma le loro righe **sono** `club_resource_items`, che e aperta alla
 * gestione: la protezione era sul **cartello**, non sulla porta.
 *
 * Misurato: un collaboratore che riceve «Accesso negato» da
 * `POST /api/v1/access_tokens` scriveva la stessa riga con
 * `POST /api/v1/club_resource_items` e `resource_type: "access_tokens"`, con
 * dentro `payload.role: "owner"`. Riscattato quel gettone, si tesserava
 * **proprietario** — saltando `assertMayGrantRole` e
 * `assertConcessioneDiAccessoLecita` — e senza lasciare una riga di audit.
 * Dalla stessa porta uscivano in lettura i gettoni in chiaro di ogni famiglia,
 * e gli IBAN dei conti correnti.
 *
 * La regola e **derivata**, non elencata: si chiede alla matrice chi e
 * riservato. Una risorsa che domani entra fra le riservate e coperta senza che
 * nessuno debba ricordarsene — che e la ragione per cui l'elenco scritto a mano
 * di sopra ha dovuto essere corretto quattro volte.
 */
/**
 * **Un ruolo ristretto e ristretto anche sul registro generico.**
 *
 * Le rotte di dominio chiedono `roleHasPermission`, che applica soffitto e
 * concessione. Il registro generico chiedeva solo il **ruolo base**, perche
 * `canAccessClubResource` passa da `normalizeAccessRole`. Misurato: un ruolo
 * di club con **zero chiavi** — il piu ristretto che un proprietario possa
 * creare — leggeva l'anagrafica di un minore, le note di segreteria e i
 * compensi degli allenatori, e scriveva sconti. Su quarantatre risorse la
 * restrizione che il club credeva di aver messo non esisteva.
 *
 * `RESOURCE_PERMISSION_KEYS` dichiara, risorsa per risorsa, quale chiave la
 * governa — o che nessuna lo fa, con il motivo scritto. La guardia sta qui e
 * non in `access-roles.ts` perche quel modulo e puro e non conosce il
 * catalogo: importarlo creerebbe un ciclo, e il registro generico e comunque
 * l'unica superficie che ha questo problema.
 */
const assertRuoloRistrettoRaggiungeLaRisorsa = (
  resource: string,
  scope?: ResourceAccessScope,
) => {
  if (!scope) return;
  if (!isCustomRoleValue(scope.activeRole)) return;
  if (customRoleReachesResource(scope.activeRole, resource)) return;

  throw new Error(
    `Accesso negato: al ruolo attivo non e stata concessa la chiave che governa «${resource}»`,
  );
};

const assertNotAdminOnlyFromGenericRoute = (
  resource: string,
  value: unknown,
) => {
  if (resource !== "club_resource_items") return;

  const tipo = String(value || "").trim();
  if (!tipo || !isManagementAdminOnlyResource(tipo)) return;

  throw new Error(
    `Accesso negato: ${tipo} e riservata alla direzione e si legge e si scrive dalla sua rotta, non dal registro generico`,
  );
};

const assertNotDomainOwnedResourceItem = (
  resource: string,
  value: unknown,
) => {
  assertNotAdminOnlyFromGenericRoute(resource, value);

  /*
    **Due modi di arrivare alla stessa riga, e la guardia deve coprirli
    entrambi.**

    `club_resource_items` e la risorsa di modello, e il tipo arriva nel
    payload; ma ogni voce di `CLUB_RESOURCE_TYPES` ha **anche** una rotta
    propria — `/api/v1/transactions` — dove il tipo **e** il nome della
    risorsa. La prima versione della guardia guardava solo la prima porta, e
    l'audit e entrato dalla seconda.
  */
  const tipo = resource === "club_resource_items" ? value : resource;
  if (!isDomainOwnedResourceItemType(tipo)) return;

  throw new Error(
    `Accesso negato: ${String(tipo).trim()} si scrive dalla sua rotta, non dal registro generico`,
  );
};

/**
 * **I modelli che hanno un proprietario di dominio.**
 *
 * Il registro generico li **legge** — la pagina calendario e le liste passano
 * di qui, ed e giusto — e non li scrive: un evento ha una macchina a stati, un
 * controllo ottimistico, un controllo di sovrapposizione sul campo e una
 * capienza, e nessuna di quelle quattro cose puo vivere in un CRUD che serve
 * cinquanta risorse.
 *
 * E la stessa distinzione fra i **verbi** gia fatta per le rate: leggere non e
 * scrivere, e scrivere non e distruggere.
 */
const DOMAIN_OWNED_MODEL_RESOURCES = new Set([
  "club_events",
  "club_event_participants",
]);

const assertNotDomainOwnedModel = (resource: string) => {
  if (!DOMAIN_OWNED_MODEL_RESOURCES.has(resource)) return;

  throw new Error(
    `Accesso negato: ${resource} si scrive dal suo dominio (src/lib/server/events.ts), non dal registro generico`,
  );
};

const isDomainOwnedResourceItemType = (value: unknown) =>
  (DOMAIN_OWNED_RESOURCE_ITEM_TYPES as readonly string[]).includes(
    String(value || "").trim(),
  );

export const buildWhereFromSearchParams = (
  resource: string,
  searchParams: URLSearchParams,
  /**
   * Serve per togliere dal risultato le risorse riservate alla direzione:
   * la guardia giudicava la **domanda**, e chi non chiedeva niente le riceveva
   * tutte. Facoltativo perche gli altri chiamanti non ne hanno bisogno, e in
   * quel caso non si toglie niente: la guardia esplicita resta.
   */
  scope?: ResourceAccessScope,
) => {
  /*
    Chi filtra ancora per `training_id` cerca l'identificativo **storico**
    dell'evento, che vive in `legacy_training_id`. La traduzione sta qui, una
    volta sola, e non in ognuna delle schermate che non e ancora passata
    all'evento.
  */
  if (
    (resource === "training_attendance" ||
      resource === "club_event_participants") &&
    searchParams.has("training_id")
  ) {
    const tradotti = new URLSearchParams(searchParams);
    const valore = tradotti.get("training_id") || "";
    tradotti.delete("training_id");
    tradotti.set("legacy_training_id", valore);
    searchParams = tradotti;
  }
  const where: Record<string, any> = {};
  const passthrough = [
    "id",
    "email",
    "user_id",
    "organization_id",
    "athlete_id",
    "payment_id",
    "invoice_id",
    "bucket",
    "path",
    "status",
    "type",
    "role",
    "resource_type",
  ];

  for (const key of passthrough) {
    const raw = searchParams.get(key);
    if (raw) {
      where[key] = raw;
    }
  }

  /*
    W6-01/W6-03. Lo stato di un atleta e una colonna `text` senza vincolo, e
    l'archivio contiene le righe scritte prima che esistesse un vocabolario:
    maiuscole, italiano, e il valore `activate` che una vecchia azione di
    massa ci ha messo dentro.

    Cercare solo il valore canonico non troverebbe quelle righe, e un atleta
    invisibile nel proprio club e il difetto peggiore di questa pagina. Si
    cercano tutte le grafie che valgono per quello stato: costa un `IN`, e
    chiude la classe invece di una sua istanza. La migrazione dei dati
    corregge cio che c'e; questo protegge da cio che arrivera.
  */
  if (resource === "simplified_athletes" || resource === "athletes") {
    const statoChiesto = parseAthleteStatus(where.status);
    if (statoChiesto) {
      /*
        `mode: "insensitive"` non e un di piu: senza, l'elenco delle grafie
        resta un elenco di **minuscole**, e Postgres confronta `text` lettera
        per lettera. Un atleta scritto `Attivo` o `ATTIVO` non compariva in
        nessun filtro — cioe esattamente il difetto che questo `IN` doveva
        chiudere, sopravvissuto dentro la propria correzione.

        Misurato sul database di sviluppo: le stesse due grafie danno 0 righe
        con il confronto sensibile e 224 con quello insensibile.
      */
      where.status = {
        in: [...athleteStatusQueryValues(statoChiesto)],
        mode: "insensitive",
      };
    } else if (typeof where.status === "string") {
      delete where.status;
    }
  }

  const club_id = searchParams.get("club_id");
  if (club_id && !where.organization_id) {
    where.organization_id = club_id;
  }

  /*
    Il registro generico non consegna le righe di un dominio che ha gia il suo
    proprietario. Chiederle esplicitamente e «Accesso negato» invece di un
    elenco vuoto: un elenco vuoto direbbe «non ce ne sono», che e falso, e chi
    integra continuerebbe a chiamare la rotta sbagliata.
  */
  if (resource === "club_resource_items") {
    assertNotAdminOnlyFromGenericRoute(resource, where.resource_type);
    if (isDomainOwnedResourceItemType(where.resource_type)) {
      throw new Error(
        `Accesso negato: ${where.resource_type} si legge dalla sua rotta, non dal registro generico`,
      );
    }
    /*
      **La guardia scattava solo se il client nominava il tipo.**

      `assertNotAdminOnlyFromGenericRoute` giudica `where.resource_type`:
      chiedere `?resource_type=access_tokens` e «Accesso negato», e chiedere
      **niente** restituiva tutto — gettoni d'accesso delle famiglie in
      chiaro, conti correnti, modelli di documento. Misurato: sei ruoli su
      otto, allenatore compreso, ricevevano il codice con cui una famiglia
      entra, e da li la tessera `parent` e il fascicolo clinico del minore.

      La difesa era sulla **domanda** invece che sulla **risposta**. Adesso i
      tipi riservati escono dal `where` sempre, per chi non li puo vedere: chi
      li chiede per nome trova il diniego di prima, chi non li chiede non li
      trova nel mazzo.
    */
    const riservate = CLUB_RESOURCE_TYPES.filter((tipo) =>
      isManagementAdminOnlyResource(tipo),
    ).filter(
      (tipo) => !canAccessClubResource(scope?.activeRole, tipo, "read"),
    );

    where.resource_type = {
      ...(where.resource_type ? { equals: where.resource_type } : {}),
      notIn: [...DOMAIN_OWNED_RESOURCE_ITEM_TYPES, ...riservate],
    };
  }

  if (RESOURCE_CONFIG[resource]?.kind === "club_resource") {
    where.resource_type = resource;

    /*
      `id` su una risorsa di club puo essere due cose: l'UUID della riga, o
      l'**id logico** dentro il payload — `category-under-12-bw552a`, quello
      che l'applicazione usa dappertutto.

      `club_resource_items.id` e una colonna `uuid`. Confrontarla con un id
      logico non «non trova niente»: fa fallire la query con
      `invalid input syntax for type uuid`, e quell'errore usciva dal 400
      della rotta. Il difetto si vedeva alla fine di un gesto normale —
      eliminare una categoria, che filtra per id **e** per club e quindi passa
      di qui invece che dalla rotta del singolo elemento — e rendeva
      **nessuna** categoria eliminabile, perche nessun id logico e un UUID.

      `findClubResourceRecord` accetta gia entrambe le forme da sempre: qui si
      fa la stessa cosa, per la lista.
    */
    if (where.id && !isUuid(where.id)) {
      where.payload = { path: ["id"], equals: String(where.id) };
      delete where.id;
    }
  }

  Object.assign(where, buildAthleteMembershipFilters(resource, searchParams));

  return where;
};

/**
 * **Il perimetro di un ruolo personalizzato, applicato all elenco.**
 *
 * Wave 6 §11.3. Il perimetro sede/categoria si scriveva, si leggeva e non
 * restringeva niente: era una configurazione che non configurava. Qui
 * diventa un `where`, e la differenza con il parametro `site_id` conta —
 * quello arriva dal chiamante e chi non lo passa vede tutto, questo arriva
 * dalla riga dell assegnazione e non si toglie.
 *
 * Un atleta **senza sede dichiarata** resta visibile a chi ha un perimetro di
 * sede, come gia fa il filtro di comodo: «sede vuota» significa «non
 * dichiarata», non «di un altra sede», e nasconderlo lascerebbe scoperte
 * proprio le schede che qualcuno deve completare (ADR-0038).
 */
/**
 * Il perimetro, chiesto al modulo che lo possiede.
 *
 * La forma Prisma stava qui, ed era l'unica copia finche non e servita anche
 * alla coda documentale. Un audit ostile aveva appena misurato cosa costa
 * averne due: questa lasciava passare gli atleti **senza sede**, contro la
 * regola pura, e a decidere era la piu larga. Adesso c'e un proprietario
 * solo — `access-scope-query.ts` — e questa funzione e il suo innesto sul
 * registro generico.
 *
 * Resta la restrizione alle sole risorse **atleta**: il registro serve una
 * cinquantina di risorse e il perimetro sa parlare di sedi e categorie, che
 * appartengono a una persona. Le altre risorse non sono «senza perimetro per
 * dimenticanza»: sono fuori da cio che questi due assi sanno dire, ed e
 * scritto in [16] con il conto dei domini scoperti.
 */
/**
 * **La tabella che *definisce* il perimetro era servita senza perimetro.**
 *
 * Il filtro copriva le due risorse dell'anagrafica e nient'altro. Ma
 * `athlete_category_memberships` **e** il perimetro:
 * `buildAthleteAccessScopeConditions` interroga proprio quella tabella per
 * decidere chi passa. Servirla intera a chi e recintato gli dava la mappa
 * completa `atleta -> sede/categoria` del club, cioe l'elenco esatto degli
 * identificativi che ogni altra porta accetta.
 *
 * Qui il perimetro si applica sulla riga stessa — la sede e la categoria sono
 * sue colonne — e non passando dall'atleta: e la stessa regola che
 * `assertMembershipWithinAccessScope` applica gia in scrittura.
 */
const buildAccessScopeFilter = (
  resource: string,
  scope?: ResourceAccessScope,
) => {
  if (resource === "athletes" || resource === "simplified_athletes") {
    return buildAthleteAccessScopeConditions(scope);
  }

  if (resource === "athlete_category_memberships") {
    return buildMembershipAccessScopeConditions(scope);
  }

  return null;
};

/**
 * **Il perimetro vale anche quando si passa l'identificativo.**
 *
 * `buildAccessScopeFilter` girava solo dentro `listResourcePage`: era un
 * filtro di elenco, e un filtro di elenco si aggira chiedendo la riga per id —
 * che e esattamente il modo in cui si aggira un filtro di elenco. Un ruolo
 * perimetrato sulla sede Nord leggeva, e con un ruolo base di gestione anche
 * **modificava e cancellava**, qualunque atleta del club.
 *
 * La verifica non riscrive la regola: rifa **la stessa interrogazione**
 * dell'elenco stringendola all'unica riga in questione. Un secondo giudizio in
 * TypeScript avrebbe avuto la sorte del ramo qui sopra — due proprietari che
 * divergono — e in piu la riga letta per id non porta con se le appartenenze,
 * quindi non ci sarebbe niente su cui giudicare.
 *
 * Costa una interrogazione in piu **solo** a chi ha un perimetro dichiarato,
 * che oggi e una minoranza delle sessioni.
 */
const assertRecordWithinAccessScope = async (
  resource: string,
  record: Record<string, any> | null | undefined,
  scope?: ResourceAccessScope,
) => {
  if (!record?.id) return;

  const perimetro = buildAccessScopeFilter(resource, scope);
  if (!perimetro) return;

  const dentro = await getDelegate(resource).count({
    where: { id: record.id, AND: perimetro },
  });

  if (dentro === 0) {
    throw new Error(
      "Accesso negato: questa riga e fuori dal perimetro di sede o categoria dell'accesso",
    );
  }
};

/**
 * Categoria e sede di un atleta, filtrate **dal database**.
 *
 * **Perche non basta `where.category_id`.** Un atleta si allena con piu
 * gruppi: la categoria non e una colonna sola, e una riga di
 * `athlete_category_memberships` per ogni appartenenza. La colonna
 * `athletes.category_id` esiste ancora ed e la categoria principale del dato
 * precedente alle appartenenze multiple: cercarla da sola perderebbe gli
 * atleti la cui appartenenza a quella categoria e secondaria, cercare solo le
 * appartenenze perderebbe l'archivio storico. Si guardano entrambe.
 *
 * **Perche la sede vuota resta visibile.** Sede vuota vuol dire «non
 * dichiarata», non «nessuna» ([ADR-0038](../../../docs/knowledge-base/18-decision-log.md)):
 * un club che attiva le sedi non deve veder sparire dagli elenchi gli atleti
 * iscritti prima. E la stessa regola che `recordMatchesSite` applica nella
 * pagina, scritta qui perche adesso il taglio lo fa il database.
 */
const buildAthleteMembershipFilters = (
  resource: string,
  searchParams: URLSearchParams,
) => {
  if (resource !== "athletes" && resource !== "simplified_athletes") return {};

  const conditions: Record<string, any>[] = [];

  const categoryId = String(searchParams.get("category_id") || "").trim();
  if (categoryId) {
    conditions.push({
      OR: [
        { category_id: categoryId },
        { category_memberships: { some: { category_id: categoryId } } },
      ],
    });
  }

  const siteId = String(searchParams.get("site_id") || "").trim();
  if (siteId) {
    conditions.push({
      OR: [
        { category_memberships: { some: { site_id: siteId } } },
        { category_memberships: { none: { site_id: { not: null } } } },
      ],
    });
  }

  return conditions.length ? { AND: conditions } : {};
};

/**
 * Campi su cui `?q=` cerca, per risorsa (WP-12).
 *
 * E un elenco esplicito per risorsa e non «tutte le colonne di testo»: una
 * ricerca che guarda anche il codice di accesso o le note interne restituisce
 * risultati che chi cerca non sa spiegarsi, e su Postgres costa una scansione
 * in piu per colonna.
 *
 * Una risorsa che non e in elenco ignora `?q=`: meglio una ricerca che non
 * filtra che una che filtra su un campo a caso.
 */
const SEARCHABLE_FIELDS: Record<string, string[]> = {
  athletes: ["first_name", "last_name", "access_code", "jersey_number"],
  simplified_athletes: ["first_name", "last_name", "access_code", "jersey_number"],
  users: ["email", "first_name", "last_name"],
  clubs: ["name", "slug"],
  organizations: ["name", "slug"],
  invoices: ["invoice_number"],
  receipts: ["receipt_number"],
};

/** Le risorse di club hanno il nome estratto in colonna: si cerca li. */
const CLUB_RESOURCE_SEARCHABLE_FIELDS = ["name"];

/**
 * Colonne su cui si puo ordinare, per risorsa.
 *
 * Anche questo e un elenco chiuso: `orderBy` arriva dalla query string, e
 * passarlo a Prisma senza filtrarlo vuol dire lasciare che il client scelga
 * su cosa il database deve lavorare.
 */
const SORTABLE_FIELDS: Record<string, string[]> = {
  athletes: ["last_name", "first_name", "birth_date", "status", "created_at", "updated_at"],
  simplified_athletes: ["last_name", "first_name", "birth_date", "status", "created_at", "updated_at"],
  users: ["email", "last_name", "created_at"],
  clubs: ["name", "created_at"],
  organizations: ["name", "created_at"],
};

const CLUB_RESOURCE_SORTABLE_FIELDS = ["name", "date", "status", "created_at"];

/** Oltre questo una «pagina» non e piu una pagina. */
const MAX_PAGE_SIZE = 200;

const searchableFieldsFor = (resource: string) =>
  RESOURCE_CONFIG[resource]?.kind === "club_resource"
    ? CLUB_RESOURCE_SEARCHABLE_FIELDS
    : SEARCHABLE_FIELDS[resource] || [];

const sortableFieldsFor = (resource: string) =>
  RESOURCE_CONFIG[resource]?.kind === "club_resource"
    ? CLUB_RESOURCE_SORTABLE_FIELDS
    : SORTABLE_FIELDS[resource] || [];

/**
 * Il `where` della ricerca testuale.
 *
 * `contains` con `insensitive`: chi cerca «rossi» deve trovare «Rossi». Non
 * e una ricerca full-text e non pretende di esserlo — per un archivio di
 * qualche migliaio di anagrafiche una `ILIKE` con indice sull'organizzazione
 * e la cosa giusta, e non richiede di installare niente.
 */
const buildSearchFilter = (resource: string, query: string) => {
  const fields = searchableFieldsFor(resource);
  /*
    La chiave di ricerca si normalizza a **NFC**, come i nomi salvati.

    `ò` si scrive in due modi — un carattere solo, oppure `o` piu accento
    combinante — identici a schermo e diversi per `ILIKE`. Le anagrafiche sono
    normalizzate in scrittura (`normalizeAnagraficaText`), ma meta del difetto
    stava dall'altra parte: una chiave in forma decomposta — ed e la forma che
    arriva incollando da un Finder, da un foglio esportato su macOS o da certi
    metodi di inserimento — non trova un nome in forma composta. Normalizzare
    le due estremita allo stesso modo e cio che rende vera la frase «Niccolo
    con l'accento si trova scrivendolo con l'accento».

    Non e una trasformazione distruttiva: NFC e la forma canonica, e su un
    testo gia composto non cambia un byte.
  */
  const trimmed = query.normalize("NFC").trim();
  if (!fields.length || !trimmed) return null;

  /*
    «Mario Rossi» va cercato come due termini: cognome e nome stanno in due
    colonne diverse, e una `contains` sulla frase intera non trova mai
    niente. Ogni termine deve comparire in almeno un campo.
  */
  const terms = trimmed.split(/\s+/).filter(Boolean).slice(0, 5);

  return {
    AND: terms.map((term) => ({
      OR: fields.map((field) => ({
        [field]: { contains: term, mode: "insensitive" },
      })),
    })),
  };
};

/** Ordinamento richiesto, se e uno di quelli ammessi. */
const buildOrderBy = (resource: string, searchParams: URLSearchParams) => {
  const requested = String(searchParams.get("order_by") || "").trim();
  const direction =
    String(searchParams.get("order") || "asc").trim().toLowerCase() === "desc"
      ? "desc"
      : "asc";

  if (requested && sortableFieldsFor(resource).includes(requested)) {
    return { [requested]: direction };
  }

  return RESOURCE_CONFIG[resource]?.kind === "club_resource"
    ? { created_at: "asc" as const }
    : undefined;
};

export type ListPagination = {
  limit: number;
  offset: number;
};

/**
 * La pagina richiesta, oppure `null` per «tutto».
 *
 * **Il default resta «tutto»** e non e una svista. Ogni pagina della Web App
 * legge oggi liste intere, e un default paginato le troncherebbe in silenzio:
 * una lista di 200 atleti che ne mostra 50 senza dirlo e peggio di una lista
 * lenta. La paginazione si chiede.
 */
const resolvePagination = (
  searchParams: URLSearchParams,
): ListPagination | null => {
  const rawLimit = Number(searchParams.get("limit"));
  if (!Number.isFinite(rawLimit) || rawLimit <= 0) return null;

  const limit = Math.min(Math.floor(rawLimit), MAX_PAGE_SIZE);

  const rawPage = Number(searchParams.get("page"));
  const rawOffset = Number(searchParams.get("offset"));

  const offset =
    Number.isFinite(rawPage) && rawPage > 1
      ? (Math.floor(rawPage) - 1) * limit
      : Number.isFinite(rawOffset) && rawOffset > 0
        ? Math.floor(rawOffset)
        : 0;

  return { limit, offset };
};

const getDelegate = (resource: string) => {
  const config = RESOURCE_CONFIG[resource];
  if (!config) {
    throw new Error(`Unsupported resource: ${resource}`);
  }

  if (config.kind === "club_resource") {
    return (prisma as any).clubResourceItem;
  }

  return (prisma as any)[config.delegate as string];
};

const getModelInclude = (resource: string) => {
  if (resource === "users") {
    return {
      club_access: true,
    };
  }

  return undefined;
};

/**
 * Contesto di richiesta che non fa parte dello scope di autorizzazione.
 *
 * Oggi contiene la sola stagione attiva (`x-active-season-id`). Non e un
 * confine di sicurezza: il confine resta `organization_id`.
 */
export type ResourceRequestOptions = {
  activeSeasonId?: string | null;
  /**
   * Chi sta scrivendo amministra la piattaforma.
   *
   * Si ricava **sempre dalla sessione** nel route handler, mai dal corpo
   * della richiesta: serve a decidere se il piano e i servizi di un club
   * possono essere scritti, e un valore che arriva dal client renderebbe la
   * guardia una formalita.
   */
  isPlatformAdmin?: boolean;
};

const isSeasonScopedResource = (resource: string) =>
  RESOURCE_CONFIG[resource]?.kind === "club_resource" &&
  isSeasonScopedDataType(resource);

const loadClubSeasonState = async (organizationId: string | null) => {
  if (!organizationId) {
    return null;
  }

  const club = await prisma.club.findUnique({
    where: { id: organizationId },
    select: { settings: true },
  });

  if (!club) {
    return null;
  }

  return normalizeClubSeasons(
    club.settings && typeof club.settings === "object" ? club.settings : {},
  );
};

/**
 * Stagione da applicare alla richiesta, se e una stagione che il club ha
 * davvero. Un id stale (stagione eliminata, club cambiato) non filtra nulla:
 * meglio mostrare tutto che una lista vuota inspiegabile.
 */
const resolveRequestSeason = async (
  resource: string,
  organizationId: string | null | undefined,
  options: ResourceRequestOptions | undefined,
) => {
  const requested = String(options?.activeSeasonId || "").trim();
  if (!requested || !isSeasonScopedResource(resource)) {
    return null;
  }

  const seasonState = await loadClubSeasonState(organizationId || null);

  if (!seasonState?.seasons.some((season) => season.id === requested)) {
    return null;
  }

  /*
    Un club che non ha ancora salvato nessuna stagione ne riceve **una in
    lettura**, sintetizzata per non lasciare l'interfaccia senza perimetro.
    Non e un dato del club: marcarci sopra i record li lega a una stagione che
    scompare nel momento in cui il club ne crea una vera, e allora i record non
    appartengono piu a niente. Finche non c'e una stagione salvata non si filtra
    e non si marca.
  */
  if (seasonState.isFallback) {
    return null;
  }

  return {
    activeSeasonId: requested,
    legacySeasonId: seasonState.legacySeasonId,
    knownSeasonIds: seasonState.seasons.map((season) => season.id),
  };
};

/**
 * Stampa la stagione attiva su una risorsa club che ne e soggetta.
 *
 * Senza questo, una categoria creata mentre e attiva la stagione 2026/2027
 * resterebbe senza `seasonId` e finirebbe nella stagione baseline.
 * Una stagione gia presente sul payload non viene mai sovrascritta.
 *
 * `existingSeasonId` rende la stagione **immutabile in aggiornamento**: un
 * record nato in una stagione ci resta. Spostarlo non e un'operazione che il
 * prodotto offre, e concederla al CRUD generico significherebbe che una PATCH
 * con un `seasonId` sbagliato riscrive la storia di un'annata chiusa. Chi vuole
 * lo stesso elemento in due stagioni usa il riporto, che ne crea uno nuovo.
 */
const applySeasonStamp = async (
  resource: string,
  payload: Record<string, any>,
  organizationId: string | null | undefined,
  options: ResourceRequestOptions | undefined,
  existingSeasonId?: string | null,
) => {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return payload;
  }

  const preservedSeasonId = String(existingSeasonId || "").trim();
  if (preservedSeasonId) {
    return payload.seasonId === preservedSeasonId
      ? payload
      : { ...payload, seasonId: preservedSeasonId };
  }

  if (String(payload.seasonId || "").trim()) {
    return payload;
  }

  const season = await resolveRequestSeason(resource, organizationId, options);
  if (!season) {
    return payload;
  }

  return { ...payload, seasonId: season.activeSeasonId };
};

const CLUB_RESOURCES = new Set(["clubs", "organizations"]);

/**
 * Colonne sempre presenti in una lettura proiettata del club.
 *
 * `id` serve a indirizzare la scrittura successiva, `slug` e `name` alle
 * intestazioni, `settings` a risolvere la stagione attiva. Costano poco e
 * evitano che una proiezione dimentichi un campo di servizio.
 */
const CLUB_PROJECTION_MANDATORY_FIELDS = ["id", "slug", "name", "settings"];

/**
 * Colonne del club che una proiezione puo chiedere.
 *
 * Elenco esplicito invece dell'enum generato da Prisma: un campo sconosciuto
 * viene ignorato e la lettura degrada alle sole colonne obbligatorie, invece
 * di far fallire la query con un nome di colonna arbitrario dal client.
 */
const CLUB_PROJECTABLE_FIELDS = new Set([
  ...CLUB_JSON_FIELDS,
  ...CLUB_PROJECTION_MANDATORY_FIELDS,
  "logo_url",
  "creator_id",
  "contact_email",
  "contact_phone",
  "city",
  "province",
  /*
    L'anagrafica scalare del club.

    Mancava, e la conseguenza non era un campo in meno a schermo: chi legge il
    profilo con `?fields=` per poi riscriverne una sezione — l'avvio guidato,
    e da RC Fix 1 l'autosave della scheda Club — si ritrovava indirizzo, CAP,
    regione, paese, dati fiscali e IBAN **vuoti**, e li riscriveva a `null`.
    Una proiezione che tace un campo che il chiamante ha chiesto non e una
    proiezione: e una perdita di dati.
  */
  "address",
  "postal_code",
  "region",
  "country",
  "business_name",
  "vat_number",
  "fiscal_code",
  "pec",
  "sdi_code",
  "tax_regime",
  "bank_name",
  "iban",
  "legal_address",
  "legal_city",
  "legal_postal_code",
  "legal_region",
  "legal_province",
  "legal_country",
  "representative_name",
  "representative_surname",
  "representative_fiscal_code",
  "created_at",
  "updated_at",
]);

/**
 * Proiezione di colonne richiesta con `?fields=a,b,c`, onorata **solo** per
 * `clubs` e `organizations`.
 *
 * La riga di un club porta 35 colonne JSON: leggerla intera per modificarne
 * una sola significava trasferire centinaia di KB a ogni salvataggio, autosave
 * compresi (WP-31). E opt-in: senza il parametro la risposta e completa, quindi
 * nessun chiamante esistente perde campi.
 */
export const resolveClubProjection = (
  resource: string,
  searchParams: URLSearchParams,
) => {
  if (!CLUB_RESOURCES.has(resource)) {
    return undefined;
  }

  const requested = String(searchParams.get("fields") || "")
    .split(",")
    .map((field) => field.trim())
    .filter(Boolean);

  if (requested.length === 0) {
    return undefined;
  }

  const selected = new Set(
    [...CLUB_PROJECTION_MANDATORY_FIELDS, ...requested].filter((field) =>
      CLUB_PROJECTABLE_FIELDS.has(field),
    ),
  );

  return Object.fromEntries([...selected].map((field) => [field, true]));
};

/**
 * Applica la stessa proiezione alla **risposta** di una scrittura sul club.
 *
 * Senza questo, ogni PATCH restituiva la riga intera: su un autosave e il
 * trasferimento piu costoso dell'intera operazione, e il client non ne usa
 * nulla (WP-31).
 */
export const projectClubResponse = (
  resource: string,
  record: Record<string, any> | null,
  searchParams: URLSearchParams,
) => {
  const projection = resolveClubProjection(resource, searchParams);
  if (!projection || !record) {
    return record;
  }

  return Object.fromEntries(
    Object.entries(record).filter(([key]) => key in projection),
  );
};

const ATHLETE_RESOURCES = new Set(["athletes", "simplified_athletes"]);

/**
 * Chiavi di `athletes.data` che contengono collezioni di allegati.
 *
 * Gli allegati sono salvati come data URL base64 dentro il JSON dell'atleta:
 * una lista di 200 atleti trasferirebbe decine di MB per mostrare nome,
 * categoria e scadenza certificato. `view=summary` le omette; il dettaglio
 * atleta continua a ricevere il `data` completo (WP-31).
 */
const ATHLETE_SUMMARY_OMITTED_DATA_KEYS = new Set([
  "certificateFiles",
  "documents",
  "enrollmentDocuments",
  "guardians",
  "identityDocuments",
  "medicalVisits",
  "paymentHistory",
  "payments",
  "registrationDocuments",
  "registrations",
]);

/** Oltre questa soglia un data URL non e piu un valore, e un file. */
const SUMMARY_INLINE_FILE_MIN_LENGTH = 1024;

/**
 * Le chiavi che contengono la foto dell'atleta.
 *
 * Non vengono tolte come gli altri allegati: vengono **sostituite con un
 * URL**, perche la lista la foto la mostra davvero (vedi `toAvatarUrl`).
 */
const SUMMARY_AVATAR_KEYS = new Set(["avatar", "avatar_url"]);

const isInlineFileValue = (key: string, value: unknown) =>
  typeof value === "string" &&
  value.length >= SUMMARY_INLINE_FILE_MIN_LENGTH &&
  value.startsWith("data:") &&
  !SUMMARY_AVATAR_KEYS.has(key);

/**
 * La foto di un atleta, come indirizzo invece che come contenuto.
 *
 * **Il numero che ha reso necessaria questa funzione** (Blocco 8, punto E).
 * Portati gli allegati fuori dai record, la lista di 200 atleti e stata
 * rimisurata: 23,7 MB, praticamente identica a prima. `view=summary` toglieva
 * tutti gli allegati tranne l'avatar — 90 kB di base64 a testa, 18 MB per
 * club, dentro il JSON che il browser deve scaricare **tutto** prima di
 * disegnare la prima riga.
 *
 * Sostituendolo con `/api/v1/athletes/:id/avatar` la stessa lista scende a
 * poche centinaia di kB, e le foto arrivano in parallelo, in cache, e solo
 * per le righe che si guardano davvero.
 *
 * Un URL gia corto (una foto caricata altrove, o un riferimento ad allegato)
 * resta com'e: non c'e niente da guadagnare a sostituirlo.
 */
const toAvatarUrl = (recordId: string, value: unknown) => {
  const raw = String(value || "");
  if (!raw.startsWith("data:")) return value;
  if (!recordId) return value;

  return `/api/v1/athletes/${encodeURIComponent(recordId)}/avatar`;
};

const toAthleteSummaryRecord = (record: Record<string, any>) => {
  const recordId = String(record?.id || "");
  const avatarUrl = toAvatarUrl(recordId, record?.avatar_url);

  const data = record?.data;
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return { ...record, avatar_url: avatarUrl };
  }

  const summaryData: Record<string, any> = {};
  for (const [key, value] of Object.entries(data)) {
    if (ATHLETE_SUMMARY_OMITTED_DATA_KEYS.has(key)) {
      continue;
    }

    if (SUMMARY_AVATAR_KEYS.has(key)) {
      summaryData[key] = toAvatarUrl(recordId, value);
      continue;
    }

    if (isInlineFileValue(key, value)) {
      continue;
    }

    summaryData[key] = value;
  }

  return { ...record, avatar_url: avatarUrl, data: summaryData };
};

/**
 * Proiezione leggera richiesta con `?view=summary`.
 *
 * Non e una cache: e la stessa lettura, senza i campi che la lista non usa.
 * Un valore sconosciuto di `view` non filtra nulla.
 */
const applyListView = (
  resource: string,
  records: Record<string, any>[],
  searchParams: URLSearchParams,
) => {
  if (searchParams.get("view") !== "summary") {
    return records;
  }

  if (!ATHLETE_RESOURCES.has(resource)) {
    return records;
  }

  return records.map((record) => toAthleteSummaryRecord(record));
};

/**
 * Le risorse che l'allenatore legge **ristrette al proprio perimetro**.
 *
 * L'elenco nominava ancora `trainings` e `matches`, che dalla lane 5C **non
 * sono piu risorse**: l'evento e una riga, e le due colonne del club sono una
 * proiezione che il registro generico non serve piu. Restavano quindi due nomi
 * che non corrispondevano a niente, e le due risorse nuove non c'erano.
 *
 * L'audit indipendente ha misurato la conseguenza: `GET
 * /api/v1/club_event_participants?club_id=X` restituiva a **qualunque**
 * allenatore ogni convocazione, ogni presenza e ogni `rsvp_note` di tutte le
 * squadre del club — e la nota dell'RSVP e il testo libero con cui un genitore
 * spiega perche il figlio non ci sara.
 *
 * Il calendario resta filtrato per categoria e non per gruppo, perche il
 * calendario di una squadra non e il dato di nessuno (W5-69). La
 * **partecipazione** invece lo e, e segue il perimetro dell'evento a cui
 * appartiene.
 */
const TRAINER_DASHBOARD_FILTERED_RESOURCES = new Set([
  "athletes",
  "simplified_athletes",
  "club_events",
  "club_event_participants",
]);

const toArrayValue = (value: unknown): any[] =>
  Array.isArray(value) ? value : [];

const normalizeTrainerToken = (value: unknown) =>
  String(value || "")
    .trim()
    .toLowerCase();

const toObjectPayload = (value: any) =>
  value?.data && typeof value.data === "object"
    ? value.data
    : value?.payload && typeof value.payload === "object"
      ? value.payload
      : {};

const flattenTokenInput = (value: unknown): unknown[] => {
  if (Array.isArray(value)) {
    return value.flatMap((entry) => flattenTokenInput(entry));
  }

  if (typeof value === "string" && value.includes(",")) {
    return value
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  return [value];
};

const buildCategoryTokenSet = (
  source: unknown,
  categories: Array<{ id?: string; name?: string }>,
) => {
  const tokens = new Set<string>();

  for (const entry of flattenTokenInput(source)) {
    const raw =
      entry && typeof entry === "object"
        ? String(
            (entry as any).id ||
              (entry as any).name ||
              (entry as any).category ||
              (entry as any).categoryId ||
              (entry as any).category_id ||
              "",
          ).trim()
        : String(entry || "").trim();

    if (!raw) {
      continue;
    }

    tokens.add(normalizeTrainerToken(raw));

    const resolvedId = resolveCategoryId(raw, categories);
    if (resolvedId) {
      tokens.add(normalizeTrainerToken(resolvedId));
    }

    const resolvedLabel = resolveCategoryLabel(raw, categories);
    if (resolvedLabel) {
      tokens.add(normalizeTrainerToken(resolvedLabel));
    }
  }

  return tokens;
};

const extractRecordCategoryTokens = (
  record: Record<string, any>,
  categories: Array<{ id?: string; name?: string }>,
) => {
  const source = toObjectPayload(record);

  /*
    **Le appartenenze contano quanto il campo libero.** La categoria di un
    atleta puo vivere in `category_memberships` — la tabella vera, ADR-0038 —
    e non nel campo di comodita: leggendo solo il secondo, un atleta iscritto
    correttamente restava invisibile al proprio allenatore.
  */
  const appartenenze = [
    record.category_memberships,
    record.categoryMemberships,
    source.category_memberships,
    source.categoryMemberships,
  ]
    .flatMap((entry) => toArrayValue(entry))
    .flatMap((entry) => {
      const membership =
        entry && typeof entry === "object" ? (entry as Record<string, any>) : {};
      return [
        membership.category_id,
        membership.categoryId,
        membership.category_name,
        membership.categoryName,
      ];
    });

  return buildCategoryTokenSet(
    [
      record.category,
      record.category_id,
      record.categoryId,
      record.category_name,
      record.categoryName,
      record.categories,
      source.category,
      source.category_id,
      source.categoryId,
      source.category_name,
      source.categoryName,
      source.categories,
      ...appartenenze,
    ],
    categories,
  );
};

const hasTokenIntersection = (left: Set<string>, right: Set<string>) =>
  Array.from(left).some((token) => right.has(token));

const isTrainerLikeProfile = (profile: any) => {
  const source = toObjectPayload(profile);
  const role = normalizeTrainerToken(profile?.role || source?.role);
  return ["trainer", "allenatore", "coach"].includes(role);
};

const isProfileLinkedToUser = (
  profile: any,
  userId: string,
  userEmail?: string | null,
) => {
  const source = toObjectPayload(profile);
  const linkedCandidates = [
    profile?.linkedUserId,
    profile?.linked_user_id,
    profile?.userId,
    profile?.user_id,
    source?.linkedUserId,
    source?.linked_user_id,
    source?.userId,
    source?.user_id,
  ];
  const linkedListCandidates = [
    profile?.linkedUserIds,
    profile?.linked_user_ids,
    source?.linkedUserIds,
    source?.linked_user_ids,
  ].flatMap((entry) => flattenTokenInput(entry));
  const emailCandidates = [
    profile?.linkedUserEmail,
    profile?.linked_user_email,
    profile?.email,
    source?.linkedUserEmail,
    source?.linked_user_email,
    source?.email,
  ];
  const normalizedUserId = normalizeTrainerToken(userId);
  const normalizedUserEmail = normalizeTrainerToken(userEmail);

  return (
    linkedCandidates
      .concat(linkedListCandidates)
      .some(
        (candidate) => normalizeTrainerToken(candidate) === normalizedUserId,
      ) ||
    (Boolean(normalizedUserEmail) &&
      emailCandidates.some(
        (candidate) => normalizeTrainerToken(candidate) === normalizedUserEmail,
      ))
  );
};

const buildTrainerTokenSet = (profile: any) => {
  const source = toObjectPayload(profile);
  const tokens = [
    profile?.id,
    profile?.name,
    profile?.fullName,
    profile?.email,
    source?.id,
    source?.name,
    source?.fullName,
    source?.email,
    [source?.name, source?.surname].filter(Boolean).join(" "),
    [profile?.name, profile?.surname].filter(Boolean).join(" "),
  ];

  return new Set(
    tokens.map((entry) => normalizeTrainerToken(entry)).filter(Boolean),
  );
};

const extractRecordTrainerTokens = (record: Record<string, any>) => {
  const source = toObjectPayload(record);
  return new Set(
    [
      record.trainerId,
      record.trainer_id,
      record.trainerIds,
      record.trainer_ids,
      record.trainers,
      record.coach,
      record.coachName,
      source.trainerId,
      source.trainer_id,
      source.trainerIds,
      source.trainer_ids,
      source.trainers,
      source.coach,
      source.coachName,
    ]
      .flatMap((entry) => flattenTokenInput(entry))
      .map((entry) =>
        entry && typeof entry === "object"
          ? normalizeTrainerToken(
              (entry as any).id || (entry as any).name || (entry as any).email,
            )
          : normalizeTrainerToken(entry),
      )
      .filter(Boolean),
  );
};

const resolveTrainerDashboardFilterContext = async (
  organizationId: string,
  userId: string,
) => {
  const [club, user] = await Promise.all([
    prisma.club.findUnique({
      where: { id: organizationId },
      select: {
        categories: true,
        category_groups: true,
        club_sites: true,
        trainers: true,
        staff_members: true,
      },
    }),
    prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    }),
  ]);

  if (!club) {
    return null;
  }

  const trainerPool = [
    ...toArrayValue(club.trainers),
    ...toArrayValue(club.staff_members).filter(isTrainerLikeProfile),
  ];
  const categoryOptions = buildClubCategoryOptions({
    clubCategories: club.categories,
    resourceCategories: trainerPool.flatMap((profile) => {
      const source = toObjectPayload(profile);
      return [profile?.categories, source?.categories];
    }),
  });
  const trainerProfile =
    trainerPool.find((profile) =>
      isProfileLinkedToUser(profile, userId, user?.email),
    ) || null;

  const siteIndex = buildSiteIndex(normalizeClubSites(club.club_sites));
  const clubGroups = buildCategoryGroups({
    categories: categoryOptions,
    sites: normalizeClubSites(club.club_sites),
    groups: club.category_groups,
  });

  if (!trainerProfile) {
    return {
      categoryOptions,
      assignedCategoryTokens: new Set<string>(),
      trainerTokens: new Set<string>(),
      assignedGroups: [] as CategoryGroup[],
      siteIndex,
    };
  }

  const source = toObjectPayload(trainerProfile);
  const assignedCategoryTokens = buildCategoryTokenSet(
    [
      trainerProfile.categories,
      trainerProfile.category,
      trainerProfile.categoryId,
      trainerProfile.category_id,
      trainerProfile.categoryName,
      trainerProfile.category_name,
      source.categories,
      source.category,
      source.categoryId,
      source.category_id,
      source.categoryName,
      source.category_name,
    ],
    categoryOptions,
  );

  /*
    **Il gruppo operativo diventa un confine dove il dato e personale** (W5-69).

    Il gruppo — categoria **piu** sede — era usato da un solo posto, l'RSVP.
    Ovunque altro il perimetro dell'allenatore era la sola categoria, e in un
    club multi-sede questo significa che il mister dei `Pulcini · Scauri`
    leggeva l'anagrafica dei `Pulcini · Santi Cosma`: stessa fascia, altra
    squadra, altre famiglie.

    Resta un **filtro** dove il dato non e personale — gli allenamenti e le
    gare sono il calendario del club — e diventa un **confine** dove lo e: gli
    atleti. Se l'allenatore non ha nessun gruppo dichiarato si ricade sulla
    categoria, che e cio che il prodotto faceva prima: un club che non ha
    configurato le sedi non deve perdere l'accesso da un giorno all'altro.
  */
  const assignedGroupIds = new Set(
    [
      trainerProfile.groups,
      trainerProfile.groupIds,
      trainerProfile.group_ids,
      source.groups,
      source.groupIds,
      source.group_ids,
    ]
      .flatMap((entry) => flattenTokenInput(entry))
      .map((entry) =>
        entry && typeof entry === "object"
          ? String((entry as any).id || "").trim()
          : String(entry || "").trim(),
      )
      .filter(Boolean),
  );

  return {
    categoryOptions,
    assignedCategoryTokens,
    trainerTokens: buildTrainerTokenSet(trainerProfile),
    assignedGroups: assignedGroupIds.size
      ? clubGroups.filter((group) => assignedGroupIds.has(group.id))
      : [],
    siteIndex,
  };
};

/**
 * **Un filtro che si accende su un parametro di chi chiama non e un confine.**
 *
 * Il perimetro dell'allenatore — le sue categorie, i suoi atleti — si attivava
 * solo se la query string portava `trainer_dashboard=1`. Cioe lo decideva il
 * client. E nella stessa `Promise.all` il contesto della dashboard chiedeva
 * anche `GET /api/v1/simplified_athletes?club_id=…` **senza** quel parametro:
 * `simplified_athletes` sta in `TRAINER_READ_RESOURCES`, quindi la risposta
 * conteneva l'anagrafica completa di **tutti** gli atleti del club. Il filtro
 * applicato dopo, nel browser, era cosmetico: il dato era gia uscito.
 *
 * Adesso il filtro e **implicito sul ruolo**: chi entra come allenatore vede il
 * proprio perimetro, e non c'e nessun parametro da omettere per uscirne. Il
 * parametro storico resta accettato e non serve piu a niente (D-5).
 */
const filterTrainerDashboardRecords = async (
  resource: string,
  records: Record<string, any>[],
  searchParams: URLSearchParams,
  scope?: ResourceAccessScope,
) => {
  if (
    normalizeAccessRole(scope?.activeRole) !== "trainer" ||
    !scope?.userId ||
    !scope.activeOrganizationId ||
    !TRAINER_DASHBOARD_FILTERED_RESOURCES.has(resource)
  ) {
    return records;
  }

  const context = await resolveTrainerDashboardFilterContext(
    scope.activeOrganizationId,
    scope.userId,
  );

  if (!context) {
    return [];
  }

  /*
    Sugli **atleti** — il dato personale — il gruppo operativo e il confine, e
    la categoria e solo la ricaduta di chi non ha gruppi dichiarati (W5-69).
    Su allenamenti e gare resta la categoria, perche il calendario di una
    squadra non e il dato di nessuno.
  */
  const perGruppo =
    context.assignedGroups.length > 0 &&
    (resource === "athletes" || resource === "simplified_athletes");

  /*
    **Il gruppo di un atleta sta nelle sue appartenenze, e la lista non le
    carica.**

    `getAthleteGroupIds` legge `category_memberships`, che e una tabella a se
    (ADR-0038): la lettura generica degli atleti non la include, quindi il
    confronto rispondeva «nessun gruppo» per **tutti** e l'allenatore vedeva
    zero atleti. Un confine che fallisce chiuso e meglio di uno che fallisce
    aperto, ma resta una superficie rotta — e il collaudo a runtime lo ha visto
    dove i test con il doppio di Prisma non potevano.

    Si caricano le appartenenze delle righe in mano, con **una** query.
  */
  /*
    **La partecipazione non porta la categoria: la porta il suo evento.**

    Una riga di `club_event_participants` ha `event_id` e nient'altro con cui
    giudicarla, quindi il perimetro si applica all'evento e ricade sulla riga.
    Una query sola per l'intera pagina: risolverlo riga per riga
    trasformerebbe l'appello di una giornata in centinaia di letture.
  */
  if (resource === "club_event_participants") {
    const eventiId = Array.from(
      new Set(
        records
          .map((record) => String(record?.event_id || "").trim())
          .filter(Boolean),
      ),
    );

    if (!eventiId.length) return records;

    const eventi = await prisma.clubEvent.findMany({
      where: {
        organization_id: scope!.activeOrganizationId as string,
        id: { in: eventiId },
      },
    });

    const ammessi = new Set(
      eventi
        .filter((evento: Record<string, any>) =>
          hasTokenIntersection(
            extractRecordCategoryTokens(evento, context.categoryOptions),
            context.assignedCategoryTokens,
          ),
        )
        .map((evento: { id: string }) => String(evento.id)),
    );

    return records.filter((record) =>
      ammessi.has(String(record?.event_id || "")),
    );
  }

  let appartenenzePerAtleta = new Map<string, any[]>();
  if (perGruppo) {
    const atletiId = records
      .map((record) => String(record?.id || "").trim())
      .filter(Boolean);

    if (atletiId.length) {
      const righe = await prisma.athleteCategoryMembership.findMany({
        where: {
          organization_id: scope!.activeOrganizationId as string,
          athlete_id: { in: atletiId },
        },
      });
      for (const riga of righe) {
        const chiave = String(riga.athlete_id);
        appartenenzePerAtleta.set(chiave, [
          ...(appartenenzePerAtleta.get(chiave) || []),
          riga,
        ]);
      }
    }
  }

  return records.filter((record) => {
    if (perGruppo) {
      const conAppartenenze = {
        ...record,
        category_memberships:
          appartenenzePerAtleta.get(String(record?.id || "")) ||
          record.category_memberships ||
          [],
      };
      return context.assignedGroups.some((group) =>
        athleteMatchesGroup(conAppartenenze, group, context.siteIndex),
      );
    }

    const matchesCategory = hasTokenIntersection(
      extractRecordCategoryTokens(record, context.categoryOptions),
      context.assignedCategoryTokens,
    );

    if (matchesCategory) {
      return true;
    }

    if (resource === "club_events") {
      return hasTokenIntersection(
        extractRecordTrainerTokens(record),
        context.trainerTokens,
      );
    }

    return false;
  });
};

export type ListResourceResult = {
  records: Record<string, any>[];
  /**
   * Presente **solo** quando la pagina e stata chiesta. Chi non la chiede
   * riceve tutto, come prima, e non deve interpretare niente di nuovo.
   */
  meta: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  } | null;
};

/**
 * Lettura di una lista, con paginazione, ricerca e ordinamento opzionali.
 *
 * **Perche il filtro non puo stare tutto nel database** (WP-12). Due filtri di
 * questa applicazione vivono fuori dalle colonne: la **stagione**, che sta
 * dentro il payload JSON e si applica confrontando la stagione attiva con
 * quella del record, e il **perimetro dell'allenatore**, che dipende dalle
 * categorie a lui assegnate. Entrambi si applicano dopo la query.
 *
 * Di conseguenza la paginazione e onesta solo quando nessuno dei due e
 * attivo. Quando lo sono, si legge tutto e si impagina in memoria — e il
 * `total` resta quello vero, cioe quello dopo i filtri, non quello del
 * database. Un conteggio che non corrisponde a cio che si vede e un difetto
 * peggiore di una query in piu.
 */
export const listResourcePage = async (
  resource: string,
  searchParams: URLSearchParams,
  scope?: ResourceAccessScope,
  options?: ResourceRequestOptions,
): Promise<ListResourceResult> => {
  assertResourceIsOpen(resource);
  assertRuoloRistrettoRaggiungeLaRisorsa(resource, scope);
  await assertClinicalRead(resource, scope);
  const delegate = getDelegate(resource);
  const config = RESOURCE_CONFIG[resource];
  const where = buildWhereFromSearchParams(resource, searchParams, scope);

  /*
    Il perimetro si somma con `AND`, non sostituisce: un ruolo di sede che
    cerca per nome deve vedere meno, non di piu.
  */
  const perimetro = buildAccessScopeFilter(resource, scope);
  if (perimetro) {
    where.AND = [...(where.AND || []), ...perimetro];
  }

  const searchFilter = buildSearchFilter(
    resource,
    searchParams.get("q") || searchParams.get("search") || "",
  );
  if (searchFilter) {
    /*
      `AND` si somma, non si sostituisce. Un `Object.assign` qui cancellava i
      filtri per categoria e sede appena l'operatore scriveva qualcosa nella
      casella di ricerca: la lista si allargava invece di stringersi, che e il
      contrario di cio che chi cerca si aspetta.
    */
    where.AND = [...(where.AND || []), ...searchFilter.AND];
  }

  /*
    **L'elenco di una risorsa personale mostra una riga sola: la propria.**

    `GET /api/v1/users` non applicava nessun `where`, e restituiva l'anagrafica
    di **ogni utente della piattaforma** a chiunque avesse un ruolo di gestione
    in un club qualunque — cioe a chiunque, perche il ruolo lo si ottiene
    registrandosi con una societa propria.
  */
  if (isPersonalResource(resource) && scope) {
    const proprio = String(scope.userId ?? "").trim();
    if (!proprio) return { records: [], meta: null };
    where.id = proprio;
  }

  if (resource === "clubs" || resource === "organizations") {
    if (scope) {
      if (!scope.allowedOrganizationIds.length) {
        return { records: [], meta: null };
      }

      /*
        **L'eccezione, e quanto e stata stretta.**

        Qui la risorsa **e** il club, e chiederne uno a cui si appartiene non e
        uno sconfinamento: il selettore di societa deve poter leggere quella su
        cui sta per spostarsi. Ma «leggere» significava **la riga intera**, e
        una revisione ostile ha misurato cosa ci sta dentro: IBAN, conti
        correnti con i loro saldi, la prima nota storica, gli sponsor, i soci
        con il codice fiscale. Un genitore in una societa poteva leggerli
        tenendo attiva la propria, dove e proprietario.

        L'eccezione era tre ordini di grandezza piu larga della ragione che la
        giustificava. Adesso e larga quanto la ragione: del club **non attivo**
        escono le sole colonne che servono a sceglierlo, e tutto il resto sta
        dietro il confine del club attivo come ogni altra cosa che vive dentro
        un club.
      */
      if (typeof where.id === "string") {
        if (!scope.allowedOrganizationIds.includes(where.id)) {
          throw new Error("Accesso negato alla risorsa del club");
        }
      } else {
        where.id = { in: scope.allowedOrganizationIds };
      }
    }
  } else if (isOrganizationScopedResource(resource)) {
    where.organization_id = resolveScopedOrganizationId(
      scope,
      where.organization_id || where.club_id,
    );
    delete where.club_id;
  }

  applyRecipientScope(resource, where, scope);

  // La stagione si risolve in parallelo alla lettura principale: e una lettura
  // indipendente e in serie aggiungerebbe un round trip a ogni lista.
  const clubProjection = resolveClubProjection(resource, searchParams);

  const pagination = resolvePagination(searchParams);
  const orderBy = buildOrderBy(resource, searchParams);

  /*
    La stagione decide se la pagina si puo chiedere al database. Va risolta
    prima, non in parallelo: sapere che c'e un filtro applicato dopo la query
    cambia la query stessa.
  */
  const season = await resolveRequestSeason(
    resource,
    where.organization_id || scope?.activeOrganizationId,
    options,
  );

  const hasPostQueryFilters =
    Boolean(season) ||
    Boolean(searchParams.get("trainer_scope") || searchParams.get("trainer_id"));

  const canPaginateInDatabase = Boolean(pagination) && !hasPostQueryFilters;

  const findManyArgs: Record<string, any> = {
    where,
    ...(clubProjection
      ? { select: clubProjection }
      : { include: getModelInclude(resource) }),
    ...(orderBy ? { orderBy } : {}),
  };

  if (canPaginateInDatabase && pagination) {
    findManyArgs.take = pagination.limit;
    findManyArgs.skip = pagination.offset;
  }

  const [records, databaseTotal] = await Promise.all([
    delegate.findMany(findManyArgs),
    canPaginateInDatabase ? delegate.count({ where }) : Promise.resolve(null),
  ]);

  const serializedRecords = records
    .map((record: Record<string, any>) => serializeRecord(resource, record, scope))
    .filter(Boolean) as Record<string, any>[];

  const seasonScopedRecords = season
    ? filterCollectionBySeason(resource, serializedRecords, season.activeSeasonId, {
        legacySeasonId: season.legacySeasonId,
        knownSeasonIds: season.knownSeasonIds,
      })
    : serializedRecords;

  const trainerScopedRecords = await filterTrainerDashboardRecords(
    resource,
    seasonScopedRecords,
    searchParams,
    scope,
  );

  const viewed = applyListView(resource, trainerScopedRecords, searchParams);

  if (!pagination) {
    return { records: viewed, meta: null };
  }

  if (canPaginateInDatabase) {
    const total = Number(databaseTotal || 0);
    return {
      records: viewed,
      meta: {
        total,
        limit: pagination.limit,
        offset: pagination.offset,
        hasMore: pagination.offset + viewed.length < total,
      },
    };
  }

  /*
    Filtri applicati dopo la query: la pagina si ritaglia qui. Costa una
    lettura intera, ma il `total` e quello vero — e un conteggio che non
    corrisponde a cio che si vede e il modo piu rapido di far perdere fiducia
    in un elenco.
  */
  const total = viewed.length;
  const page = viewed.slice(
    pagination.offset,
    pagination.offset + pagination.limit,
  );

  return {
    records: page,
    meta: {
      total,
      limit: pagination.limit,
      offset: pagination.offset,
      hasMore: pagination.offset + page.length < total,
    },
  };
};

/**
 * La lettura di sempre: l'array e basta.
 *
 * Resta la forma usata da tutto cio che non chiede una pagina, perche
 * cambiare la firma di `listResource` avrebbe voluto dire toccare ogni
 * chiamante per un valore che a quasi tutti non serve.
 */
export const listResource = async (
  resource: string,
  searchParams: URLSearchParams,
  scope?: ResourceAccessScope,
  options?: ResourceRequestOptions,
) => {
  const { records } = await listResourcePage(
    resource,
    searchParams,
    scope,
    options,
  );
  return records;
};

export const getResourceById = async (
  resource: string,
  id: string,
  scope?: ResourceAccessScope,
) => {
  assertResourceIsOpen(resource);
  assertRuoloRistrettoRaggiungeLaRisorsa(resource, scope);
  await assertClinicalRead(resource, scope);
  const delegate = getDelegate(resource);
  const config = RESOURCE_CONFIG[resource];

  let record: Record<string, any> | null = null;

  if (config.kind === "club_resource") {
    record = await findClubResourceRecord(resource, id, scope);
  } else {
    record = await delegate.findUnique({
      where: { id },
      include: getModelInclude(resource),
    });
  }

  assertRecordAccess(resource, record || null, scope);
  await assertRecordWithinAccessScope(resource, record, scope);

  /*
    Anche la lettura per identificativo: senza questa riga il filtro
    dell'elenco si aggirerebbe passando l'id, che e proprio come si aggira un
    filtro di elenco. Vedi `DOMAIN_OWNED_RESOURCE_ITEM_TYPES`.
  */
  assertNotAdminOnlyFromGenericRoute(resource, record?.resource_type);

  if (
    resource === "club_resource_items" &&
    isDomainOwnedResourceItemType(record?.resource_type)
  ) {
    throw new Error(
      `Accesso negato: ${record?.resource_type} si legge dalla sua rotta, non dal registro generico`,
    );
  }

  return record ? serializeRecord(resource, record, scope) : null;
};

const resolveUpsertWhere = (resource: string, input: Record<string, any>) => {
  if (input.id) {
    return { id: input.id };
  }

  if (resource === "users" && input.email) {
    return { email: input.email };
  }

  /*
    Il numero di un documento e univoco **dentro un club**, non fra tutti
    (ADR-0044): la chiave e la coppia. Con la sola colonna, un upsert non
    troverebbe piu una chiave univoca — e, prima che il vincolo cambiasse,
    avrebbe potuto aggiornare la fattura di un'altra societa che per caso
    portava lo stesso numero.
  */
  if (resource === "invoices" && input.invoice_number && input.organization_id) {
    return {
      organization_id_invoice_number: {
        organization_id: input.organization_id,
        invoice_number: input.invoice_number,
      },
    };
  }

  if (resource === "receipts" && input.receipt_number && input.organization_id) {
    return {
      organization_id_receipt_number: {
        organization_id: input.organization_id,
        receipt_number: input.receipt_number,
      },
    };
  }

  if (resource === "clubs" || resource === "organizations") {
    if (input.slug) {
      return { slug: input.slug };
    }
  }

  if (resource === "assets" && input.bucket && input.path) {
    return {
      bucket_path: {
        bucket: input.bucket,
        path: input.path,
      },
    };
  }

  return null;
};

export const createResource = async (
  resource: string,
  input: Record<string, any>,
  mode: "create" | "upsert" = "create",
  scope?: ResourceAccessScope,
  options?: ResourceRequestOptions,
) => {
  const delegate = getDelegate(resource);
  const config = RESOURCE_CONFIG[resource];

  assertResourceIsOpen(resource);
  assertRuoloRistrettoRaggiungeLaRisorsa(resource, scope);
  assertNotDomainOwnedModel(resource);
  assertNotDomainOwnedResourceItem(resource, input?.resource_type);
  await assertClinicalWrite(resource, scope, input);

  if (config.kind === "club_resource") {
    const data = normalizeClubResourceInput(resource, input);
    await guardaIlConioDiUnGettone(resource, data, scope);
    data.organization_id = resolveScopedOrganizationId(
      scope,
      data.organization_id || data.club_id,
    );
    const logicalId = String(input?.id || "").trim();

    if (mode === "upsert" && logicalId) {
      const existing = await findClubResourceRecord(resource, logicalId, scope);

      if (existing) {
        assertRecordAccess(resource, existing, scope);
        assertAnagraficaIsValid(resource, data, existing);
        normalizeAnagraficaText(resource, data);
        const preservedLogicalId =
          (!isUuid(input?.id) &&
            typeof input?.id === "string" &&
            input.id.trim()) ||
          getClubResourceLogicalId(existing);
        const existingPayload =
          typeof existing.payload === "object" && existing.payload
            ? clone(existing.payload)
            : {};
        const nextPayload =
          typeof data.payload === "object" && data.payload
            ? {
                ...existingPayload,
                ...clone(data.payload),
              }
            : existingPayload;

        if (preservedLogicalId && !nextPayload.id) {
          nextPayload.id = preservedLogicalId;
        }

        // La stagione si stampa **dopo** la fusione con il payload esistente:
        // modificare una categoria mentre e attiva un'altra stagione non deve
        // spostarla di stagione.
        const stampedPayload = await applySeasonStamp(
          resource,
          nextPayload,
          data.organization_id || existing.organization_id,
          options,
        );

        const record = await delegate.update({
          where: { id: existing.id },
          data: {
            organization_id: data.organization_id || existing.organization_id,
            resource_type: resource,
            name: data.name ?? existing.name ?? nextPayload.name ?? null,
            status:
              data.status ?? existing.status ?? nextPayload.status ?? null,
            date:
              data.date ??
              existing.date ??
              toDateOrUndefined(nextPayload.date) ??
              null,
            payload: stampedPayload,
          },
        });

        if (data.organization_id || existing.organization_id) {
          await syncClubAggregateField(
            data.organization_id || existing.organization_id,
            resource,
          );
        }

        return serializeRecord(resource, record, scope);
      }
    }

    assertAnagraficaIsValid(resource, data);
    normalizeAnagraficaText(resource, data);

    data.payload = await applySeasonStamp(
      resource,
      data.payload,
      data.organization_id,
      options,
    );

    const record = await delegate.create({
      data,
    });

    if (data.organization_id) {
      await syncClubAggregateField(data.organization_id, resource);
    }
    return serializeRecord(resource, record, scope);
  }

  const normalized = await normalizeModelInput(resource, input);

  /*
    Alla creazione non c'e niente con cui fondersi e non c'e nessuno con cui
    correre: la modifica parziale vale come valore iniziale.
  */
  const createSettingsPatch = takeClubSettingsPatch(resource, normalized);
  if (createSettingsPatch) {
    normalized.settings = {
      ...(parseJsonIfString(normalized.settings) || {}),
      ...createSettingsPatch,
    };
  }

  assertAnagraficaIsValid(resource, normalized);
  normalizeAnagraficaText(resource, normalized);

  if (resource === "clubs" || resource === "organizations") {
    /*
      **Il fondatore di un club e chi lo sta creando.**

      `creator_id` arrivava dal corpo e non veniva confrontato con la sessione.
      Ma `resolveOrganizationScopeForUser` ricava da quella colonna sia
      l'appartenenza sia il ruolo `owner`: si poteva quindi creare un club —
      con il nome e la configurazione scelti da chi attacca — e **intestarlo a
      un altro**, che se ne trovava uno nuovo fra i propri, attivo e con ruolo
      di proprietario.

      E la stessa forma della tessera che si firma da sola, un passo prima:
      li si concedeva l'accesso a un club esistente, qui se ne fabbrica uno.
    */
    if (scope?.userId) {
      const dichiarato = String(normalized.creator_id || "").trim();
      if (dichiarato && dichiarato !== String(scope.userId)) {
        throw new Error(
          "Accesso negato: un club si crea per se, non a nome di un altro",
        );
      }

      /*
        **Solo quando il club nasce davvero.**

        In modo `upsert` questo stesso oggetto e anche la meta `update`: la
        riga qui sotto scriveva quindi `creator_id` **sopra un club
        esistente**, senza che il chiamante lo avesse nemmeno nominato. Un
        gestore che rimandava il proprio club con `mode: "upsert"` se lo
        intestava, e il proprietario legittimo — che di norma non ha una riga
        in `organization_users` — si ritrovava **fuori dal proprio club**.

        Era peggio del difetto che la tornata prima aveva chiuso: li bisognava
        dichiarare `creator_id`, qui lo scriveva il codice per conto
        dell'attaccante.
      */
      normalized.creator_id = scope.userId;
    }

    /*
      Anche la creazione passa dalla guardia: un club che nasce con
      `settings.subscription.plan = "plus"` si sarebbe concesso il piano
      all'iscrizione, che e il modo piu semplice di aggirare un controllo
      messo solo sulla modifica. In `upsert` il record puo gia esistere, e in
      quel caso il confronto va fatto con cio che c'e.
    */
    const existingClub = normalized.id
      ? await delegate.findUnique({ where: { id: String(normalized.id) } })
      : null;
    await guardPlatformOwnedClubSettings(
      resource,
      normalized,
      existingClub?.settings,
      scope,
      options,
      normalized.id || null,
    );
  } else if (isOrganizationScopedResource(resource)) {
    normalized.organization_id = resolveScopedOrganizationId(
      scope,
      normalized.organization_id || normalized.club_id,
    );
  }

  /*
    Anche la creazione passa dalla guardia: una rata che nasce gia `paid`
    sarebbe il modo piu semplice di aggirare un controllo messo solo sulla
    modifica. In `upsert` la riga puo gia esistere, e allora il confronto va
    fatto con cio che c'e.
  */
  await guardNotificationRecipient(resource, normalized, scope);
  await guardParentBelongsToClub(resource, normalized, scope);
  /*
    **Il perimetro non si allarga da dentro.**

    Le righe di `athlete_category_memberships` **definiscono** il perimetro di
    sede, e la stessa tabella e aperta in scrittura alla gestione. Un ruolo
    perimetrato sulla sede Nord creava un'appartenenza per un atleta della sede
    Sud, con la **propria** sede dentro, e da quel momento ogni porta chiusa gli
    si apriva a buon diritto: il confine non veniva aggirato, veniva spostato.

    Due condizioni, e servono entrambe: la riga deve stare dentro il proprio
    perimetro (`assertMembershipWithinAccessScope`), e l'atleta a cui si
    attacca deve essere gia dentro (`athleteWithinAccessScope`) — altrimenti
    basterebbe scrivere la riga giusta sull'atleta sbagliato.
  */
  if (scope && resource === "athlete_category_memberships") {
    assertMembershipWithinAccessScope(scope, normalized);

    const atleta = String(normalized.athlete_id ?? "").trim();
    const club = String(
      normalized.organization_id ?? scope.activeOrganizationId ?? "",
    ).trim();

    if (atleta && club) {
      const dentro = await athleteWithinAccessScope(club, atleta, scope);
      if (!dentro) {
        throw new Error(
          "Accesso negato: questo atleta e fuori dal perimetro di sede o categoria dell'accesso",
        );
      }
    }
  }


  const existingCharge =
    (resource === "payments" || resource === "simplified_payments") && normalized.id
      ? await delegate.findUnique({ where: { id: String(normalized.id) } })
      : null;
  await guardLedgerOwnedPaymentState(
    resource,
    normalized,
    existingCharge,
    scope,
    normalized.id || null,
  );

  /*
    Anche la creazione: un documento che **nasce** con un numero digitato e il
    modo piu diretto di aggirare la sequenza, e in `upsert` la riga puo gia
    esistere — allora il confronto va fatto con cio che c'e.
  */
  const existingDocument =
    (resource === "invoices" || resource === "receipts") && normalized.id
      ? await delegate.findUnique({ where: { id: String(normalized.id) } })
      : null;
  guardFiscalDocumentIntegrity(resource, normalized, existingDocument);

  if (
    mode === "upsert" &&
    resource === "organization_users" &&
    normalized.organization_id &&
    normalized.user_id
  ) {
    const role = normalized.role || "member";
    const accessData: Prisma.OrganizationUserUncheckedCreateInput = {
      id: normalized.id || undefined,
      organization_id: String(normalized.organization_id),
      user_id: String(normalized.user_id),
      role: String(role),
      is_primary: Boolean(normalized.is_primary),
    };
    /*
      La stessa concessione, dalla porta principale: `POST
      /api/v1/organization_users` in `upsert` scriveva la tessera senza che
      `assertRecordAccess` la vedesse mai, perche il ramo esce prima.
    */
    await assertConcessioneDiAccessoLecita(
      String(normalized.organization_id),
      String(normalized.user_id),
      String(role),
      scope,
    );
    const existingAccess = await prisma.organizationUser.findFirst({
      where: {
        organization_id: normalized.organization_id,
        user_id: normalized.user_id,
        role,
      },
    });

    const record = existingAccess
      ? await prisma.organizationUser.update({
          where: { id: existingAccess.id },
          data: accessData,
        })
      : await prisma.organizationUser.create({
          data: accessData,
        });

    return serializeRecord(resource, record, scope);
  }

  /*
    **Un `upsert` che trova la riga la sta modificando.**

    `assertRecordAccess` era chiamata in `getResourceById`, `updateResource`
    e `deleteResource` — cioe su tutte le porte tranne una. `createResource`
    non la eseguiva **mai**, e in modo `upsert` non crea affatto: aggiorna
    per chiave, e la chiave la sceglie chi chiama.

    Su `users` la chiave e l'email (`resolveUpsertWhere`), e
    `normalizeModelInput` trasforma diligentemente `password` in
    `password_hash`. Bastava quindi

        POST /api/v1/users  {"mode":"upsert","data":{"email":"&lt;vittima&gt;","password":"..."}}

    da un account appena registrato per riscrivere la password di chiunque —
    compreso un indirizzo in `EASYGAME_PLATFORM_ADMIN_EMAILS`. Il divieto di
    scrivere `users.role` restava intatto e del tutto inutile: non serviva
    diventare amministratore, bastava entrare nel suo account.

    La riga esistente si legge **prima**, e si giudica con lo stesso metro di
    ogni altra porta.
  */
  if (mode === "upsert") {
    const where = resolveUpsertWhere(resource, normalized);
    if (where) {
      if (scope) {
        const esistente = await delegate.findUnique({ where });
        if (esistente) {
          assertRecordAccess(resource, esistente, scope);
          /*
            **La quarta porta del perimetro, e l'unica che era rimasta.**

            `assertRecordWithinAccessScope` era su lettura per id, modifica e
            cancellazione. Non qui — e questo ramo **non crea**: aggiorna per
            chiave, e la chiave la sceglie chi chiama. Misurato sul database
            vero, con lo stesso atleta fuori perimetro e lo stesso scope:

                update  -> negato
                delete  -> negato
                upsert  -> **passato**, riga scritta

            E la stessa forma che il commento di `buildAccessScopeFilter`
            dichiara chiusa — «un filtro di elenco si aggira chiedendo la riga
            per identificativo» — sulla porta che quel commento non aveva
            visitato. Anche la sonda U-39 esercitava tre porte su quattro.
          */
          await assertRecordWithinAccessScope(resource, esistente, scope);
          /*
            **E le stesse guardie della modifica**, perche questo ramo modifica.
          */
          await applicaGuardieDiModifica(
            resource,
            normalized,
            esistente,
            scope,
          );
        } else if (isPersonalResource(resource)) {
          /*
            Una risorsa personale che **non** esiste ancora: crearla per conto
            di un altro significherebbe fabbricare l'identita di qualcuno. La
            registrazione passa da `auth/register`, che non ha scope.
          */
          throw new Error("Accesso negato alla risorsa del club");
        }
      }

      /*
        **La meta che crea e la meta che modifica non sono lo stesso oggetto.**

        `creator_id` va scritto quando il club **nasce** e mai quando esiste
        gia: la riga qui sotto lo scriveva su entrambe le meta, e un
        `upsert` su un club esistente lo intestava a chi lo mandava.
        Toglierlo dall'oggetto intero era pero l'errore opposto — la colonna e
        `NOT NULL`, e la creazione per `upsert` moriva con «Argument
        `creator` is missing».

        Due oggetti, quindi: quello che crea porta il fondatore, quello che
        modifica no.
      */
      /*
        **Cio che dice quando e da chi una riga e nata non si riscrive.**

        `creator_id` era il caso trovato; `created_at` e lo stesso in un'altra
        forma, e vale per **ogni** risorsa che un `upsert` puo raggiungere: un
        client poteva spostare la data di creazione di un club, di un utente o
        di un documento fiscale a una data qualsiasi, semplicemente
        rimandandola. Una data di nascita che si riscrive non e una data di
        nascita.
      */
      const daNonRiscrivere = [
        "created_at",
        ...(resource === "clubs" || resource === "organizations"
          ? ["creator_id"]
          : []),
      ];
      const perModifica = { ...normalized };
      for (const campo of daNonRiscrivere) delete perModifica[campo];

      const record = await delegate.upsert({
        where,
        update: perModifica,
        create: normalized,
        include: getModelInclude(resource),
      });

      if (resource === "users") {
        await syncUserClubAccess(record.id, input.club_access, scope);
      }

      if (resource === "clubs" || resource === "organizations") {
        await syncClubMembers(record.id, input.memberships, scope);
        await ensureClubDashboard(
          record.id,
          normalized.creator_id,
          input.dashboard_data,
        );
        for (const field of CLUB_RESOURCE_TYPES) {
          if (input[field] !== undefined) {
            /*
              **La terza porta di una collezione con un proprietario.**

              Le prime due — la risorsa di modello `club_resource_items` e la rotta
              per nome `/api/v1/<tipo>` — le chiude
              `assertNotDomainOwnedResourceItem`. Questa e la piu difficile da
              vedere, perche non nomina la collezione: e un `PUT /api/v1/clubs` che
              porta il campo JSON aggregato, e riscrive **l intera** collezione con
              la copia che il browser aveva letto un istante — o dieci minuti —
              prima.

              E la porta da cui una sonda di concorrenza ha fatto sparire un socio
              appena ammesso: la scrittura andava a buon fine, nessun errore, e il
              libro restava a citare una persona che l anagrafica non conosceva piu.
            */
            assertNotDomainOwnedResourceItem(field, field);
            await syncClubResourceItemsFromField(
              record.id,
              field,
              input[field],
            );
          }
        }
      }

      return serializeRecord(resource, record, scope);
    }
  }

  /*
    **La quarta porta di `organization_users`.** La guardia era su tre
    scrittori su quattro: il ramo `upsert` dedicato, e i due che sincronizzano
    le tessere. Questo — `create` semplice — non la eseguiva. Il tetto non
    cambia, perche la risorsa e riservata a chi amministra il club; ma una
    tabella che decide i permessi non deve avere uno scrittore fuori dal
    controllo, e la sua documentazione diceva che non ne aveva.
  */
  if (resource === "organization_users" && normalized.organization_id && normalized.user_id) {
    await assertConcessioneDiAccessoLecita(
      String(normalized.organization_id),
      String(normalized.user_id),
      String(normalized.role || "member"),
      scope,
    );
  }

  /*
    E la creazione vera: una riga personale nasce solo per chi la chiede.
  */
  if (scope && isPersonalResource(resource)) {
    const nascente = String(normalized.id ?? "").trim();
    if (!nascente || nascente !== String(scope.userId ?? "").trim()) {
      throw new Error("Accesso negato alla risorsa del club");
    }
  }

  const record = await delegate.create({
    data: normalized,
    include: getModelInclude(resource),
  });

  if (resource === "users") {
    await syncUserClubAccess(record.id, input.club_access, scope);
  }

  if (resource === "clubs" || resource === "organizations") {
    await syncClubMembers(record.id, input.memberships, scope);
    await ensureClubDashboard(
      record.id,
      normalized.creator_id,
      input.dashboard_data,
    );
    for (const field of CLUB_RESOURCE_TYPES) {
      if (input[field] !== undefined) {
        /*
          **La terza porta di una collezione con un proprietario.**

          Le prime due — la risorsa di modello `club_resource_items` e la rotta
          per nome `/api/v1/<tipo>` — le chiude
          `assertNotDomainOwnedResourceItem`. Questa e la piu difficile da
          vedere, perche non nomina la collezione: e un `PUT /api/v1/clubs` che
          porta il campo JSON aggregato, e riscrive **l intera** collezione con
          la copia che il browser aveva letto un istante — o dieci minuti —
          prima.

          E la porta da cui una sonda di concorrenza ha fatto sparire un socio
          appena ammesso: la scrittura andava a buon fine, nessun errore, e il
          libro restava a citare una persona che l anagrafica non conosceva piu.
        */
        assertNotDomainOwnedResourceItem(field, field);
        await syncClubResourceItemsFromField(record.id, field, input[field]);
      }
    }
  }

  return serializeRecord(resource, record, scope);
};

/**
 * Rimette al loro posto i campi di `clubs.settings` che appartengono alla
 * piattaforma: piano, stato dell'abbonamento, servizi aggiuntivi ed eccezioni.
 *
 * **Perche qui e non nella pagina.** Nascondere i campi nell'interfaccia non
 * protegge niente: la pagina Organizzazione rimanda l'intero blocco delle
 * impostazioni a `PATCH /api/v1/clubs/:id`, e la stessa richiesta la puo
 * rifare a mano chiunque sappia aprire la console del browser. La regola sta
 * dove il dato viene scritto.
 *
 * **Perche ignora invece di rifiutare.** Il salvataggio di un recapito manda
 * anche il piano, perche manda tutto. Rispondere «Accesso negato» renderebbe
 * la pagina inutilizzabile per un campo che nessuno stava cercando di
 * cambiare. Un tentativo vero — un valore **diverso** da quello che c'e —
 * viene ignorato e registrato nell'audit come diniego.
 */
const guardPlatformOwnedClubSettings = async (
  resource: string,
  normalized: Record<string, any>,
  existingSettings: unknown,
  scope: ResourceAccessScope | undefined,
  options: ResourceRequestOptions | undefined,
  organizationId: string | null | undefined,
) => {
  if (resource !== "clubs" && resource !== "organizations") return;
  if (normalized.settings === undefined) return;

  /*
    **La stagione attiva ha una chiave, e la porta generica la scavalcava.**

    Le stagioni vivono in `clubs.settings.seasons` e `settings.activeSeasonId`,
    e `PATCH /api/v1/clubs/:id` le scrive. La guardia qui sotto protegge cio che
    e **della piattaforma** — abbonamento, servizi, diritti — non cio che e
    riservato alla direzione del club.

    Misurato: un ruolo a cui era stata tolta la casella `seasons.change`
    cambiava comunque `activeSeasonId` di qui. E il modulo delle stagioni scrive
    che cambiare stagione «riscrive il perimetro di **tutto** cio che il club
    vede»: una casella che non impedisce l'atto che nomina e la promessa vuota
    che questa Wave esiste per smontare.
  */
  const settingsNuovi =
    normalized.settings && typeof normalized.settings === "object"
      ? (normalized.settings as Record<string, any>)
      : {};
  const settingsVecchi =
    existingSettings && typeof existingSettings === "object"
      ? (existingSettings as Record<string, any>)
      : {};

  const toccaLaStagione = ["seasons", "activeSeasonId", "activeSeason"].some(
    (campo) =>
      Object.prototype.hasOwnProperty.call(settingsNuovi, campo) &&
      JSON.stringify(settingsNuovi[campo] ?? null) !==
        JSON.stringify(settingsVecchi[campo] ?? null),
  );

  if (toccaLaStagione && scope && !hasSeasonPermission(scope.activeRole, "seasons.change")) {
    await recordPermissionDenied({
      scope: {
        userId: scope.userId,
        activeRole: scope.activeRole,
        activeOrganizationId: scope.activeOrganizationId,
      },
      permission: "seasons.change",
      resource: "clubs",
      resourceId: String(organizationId || ""),
      metadata: { reason: "season_change_from_generic_route" },
    });
    throw new Error(
      "Accesso negato: la stagione attiva la cambia chi ne ha il permesso, e questa strada non lo chiedeva",
    );
  }

  const guard = withPlatformOwnedSettings(existingSettings, normalized.settings, {
    isPlatformAdmin: Boolean(options?.isPlatformAdmin),
  });

  normalized.settings = guard.settings;

  if (!guard.rejectedKeys.length) return;

  await recordAuditEvent({
    action: AUDIT_ACTIONS.resourceAccessDenied,
    outcome: "denied",
    actorUserId: scope?.userId,
    organizationId: organizationId || scope?.activeOrganizationId || null,
    resource: "club_plan",
    resourceId: organizationId || "",
    /*
      `rejectedFields` e non `rejectedKeys`: il sanitizzatore dell'audit
      oscura ogni chiave che contenga il segmento «key», e il valore finiva
      «[rimosso]». Restava la traccia del tentativo e spariva **quale** campo
      qualcuno avesse provato a cambiarsi — cioe la sola cosa per cui quella
      riga di audit esiste.
    */
    metadata: { rejectedFields: guard.rejectedKeys },
  });
};

/**
 * Una modifica **parziale** di `clubs.settings`, applicata a quello che c'e
 * nel momento in cui si scrive.
 *
 * ## Il difetto che chiude
 *
 * `settings` e una colonna JSON unica: per cambiarne una chiave il client la
 * rileggeva e la riscriveva **intera**. Chi salvava la scheda Contatti
 * rimandava indietro anche i Pagamenti, nella copia letta un istante — o dieci
 * minuti — prima. Se nel frattempo qualcun altro aveva salvato i Pagamenti,
 * quella scrittura spariva: nessun errore, nessuna traccia, solo un dato che
 * torna com'era. Riprodotto in `tests/server/club-settings-concurrency.test.mjs`.
 *
 * ## Perche una toppa e non un blocco
 *
 * Mettere le scritture in fila non basterebbe: la copia vecchia arriva dal
 * **client**, e resta vecchia anche se la sua scrittura aspetta il proprio
 * turno. L'unico modo perche due sezioni diverse non si cancellino e che
 * ognuna dichiari **solo le proprie chiavi** e che sia il server a fonderle
 * con il valore corrente. `settings` intero resta accettato e continua a
 * sostituire: chi lo manda sta dichiarando tutto, e ci sono percorsi che
 * devono poter togliere una chiave.
 *
 * ## Perche dentro una transazione con lock
 *
 * Fusione a parte, restano due richieste che leggono e riscrivono la stessa
 * riga: la finestra e di millisecondi invece che di minuti, ma esiste. Il
 * `FOR UPDATE` e lo stesso rimedio, e lo stesso modo di scriverlo, gia usato
 * dal registro incassi (`lockInstallmentAndTransaction`).
 */
const applyClubSettingsPatch = async (
  resource: string,
  id: string,
  patch: Record<string, any>,
  scope: ResourceAccessScope | undefined,
  options: ResourceRequestOptions | undefined,
) => {
  await prisma.$transaction(async (tx: any) => {
    await tx.$queryRaw`SELECT id FROM clubs WHERE id = ${id}::uuid FOR UPDATE`;

    const current = await tx.club.findUnique({ where: { id } });
    if (!current) return;

    const currentSettings = parseJsonIfString(current.settings) || {};
    const staged: Record<string, any> = {
      settings: { ...currentSettings, ...patch },
    };

    // Una modifica parziale non e una scorciatoia per il piano: il guardiano
    // del piano deve vedere anche questa strada.
    await guardPlatformOwnedClubSettings(
      resource,
      staged,
      currentSettings,
      scope,
      options,
      current.id,
    );

    await tx.club.update({
      where: { id: current.id },
      data: { settings: staged.settings },
    });
  });
};

/**
 * Stacca la modifica parziale dal resto del payload.
 *
 * `settings_patch` non e una colonna: se restasse nell'oggetto, Prisma
 * rifiuterebbe l'intera scrittura.
 */
const takeClubSettingsPatch = (
  resource: string,
  normalized: Record<string, any>,
): Record<string, any> | null => {
  const patch = normalized.settings_patch;
  delete normalized.settings_patch;

  if (resource !== "clubs" && resource !== "organizations") return null;
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) return null;

  return patch as Record<string, any>;
};

/**
 * Lo stato di una rata non si scrive dal client, nemmeno dal CRUD generico.
 *
 * **Il difetto che chiude.** `POST /api/v1/payment-transactions` era gia il
 * solo modo di far diventare pagata una rata (ADR-0036), ma la risorsa
 * generica scriveva ancora `payments.status` come qualunque altra colonna:
 * un `PATCH /api/v1/payments/:id {"status":"paid"}` marcava saldata una
 * rata senza che fosse entrato un euro. E il campo che meta applicazione
 * legge — riepiloghi, Movimenti, report, area genitore — quindi la rata
 * risultava pagata ovunque, mentre `data.ledger` accanto continuava a dire
 * «parziale, residuo 30». Il record si contraddiceva da solo.
 *
 * **Perche `cancelled` resta scrivibile.** Annullare una rata non e dire
 * che e stata incassata: e dire che quel debito non esiste piu. Lo fa la
 * sostituzione del piano di pagamento, ed e la stessa distinzione che
 * `recomputeChargeFromLedger` gia rispetta quando si rifiuta di
 * sovrascrivere una rata annullata.
 *
 * **Perche ignora invece di rifiutare.** Come per il piano del club: chi
 * salva una rata rimanda indietro il record intero, `status` compreso.
 * Rispondere «Accesso negato» a un salvataggio che non stava cambiando lo
 * stato romperebbe le schermate. Un valore **diverso** da quello che c'e
 * viene ignorato e registrato nell'audit come diniego.
 */
const LEDGER_OWNED_PAYMENT_STATES = new Set(["pending", "partially_paid", "paid"]);

const guardLedgerOwnedPaymentState = async (
  resource: string,
  normalized: Record<string, any>,
  existing: Record<string, any> | null | undefined,
  scope: ResourceAccessScope | undefined,
  paymentId: string | null | undefined,
) => {
  if (resource !== "payments" && resource !== "simplified_payments") return;
  if (normalized.status === undefined || normalized.status === null) return;

  const requested = String(normalized.status).trim().toLowerCase();
  if (!LEDGER_OWNED_PAYMENT_STATES.has(requested)) return;

  const current = existing?.status ? String(existing.status).trim().toLowerCase() : null;

  if (current === null) {
    // Una rata nasce scoperta: il registro non ha ancora nulla da dire.
    normalized.status = "pending";
    if (requested === "pending") return;
  } else {
    normalized.status = existing?.status;
    if (requested === current) return;
  }

  await recordAuditEvent({
    action: AUDIT_ACTIONS.resourceAccessDenied,
    outcome: "denied",
    actorUserId: scope?.userId,
    organizationId:
      normalized.organization_id || existing?.organization_id || scope?.activeOrganizationId || null,
    resource: "payment_state",
    resourceId: paymentId || "",
    metadata: { rejectedFields: ["status"], requestedState: requested, keptState: current },
  });
};

/**
 * **I documenti fiscali non si scrivono come una riga qualunque.** (W4-E)
 *
 * Due regole del dominio esistevano gia scritte e **non avevano un chiamante**
 * proprio su questa porta, che e la piu aperta di tutte:
 *
 * 1. *il numero lo assegna la sequenza, non il client.* `POST /api/v1/invoices`
 *    accettava `invoice_number` come una colonna qualunque: si poteva digitare
 *    un numero, e — con il vincolo di unicita per club — **occupare** quello
 *    che `document_number_sequences` avrebbe assegnato al documento successivo.
 *    Un documento fiscale si emette dal suo incasso, dove il numero si alloca
 *    dentro una transazione;
 * 2. *un documento emesso non si modifica.* `assertDocumentMutable` esisteva dal
 *    Blocco D e nessuno la chiamava, mentre da qui si poteva riscrivere importo,
 *    data, intestatario e snapshot di una fattura gia consegnata.
 *
 * **Perche rifiuta invece di ignorare**, al contrario della guardia sullo stato
 * di una rata: li il valore rimandato indietro dai form era il caso normale e
 * ignorarlo non toglieva niente a nessuno. Qui chi sta cambiando il numero o
 * l'importo di un documento emesso sta facendo una cosa che non deve riuscire,
 * e proseguire in silenzio gli lascerebbe credere di averla fatta. Rimandare
 * indietro **lo stesso** valore non e una modifica e non viene rifiutato.
 */
const guardFiscalDocumentIntegrity = (
  resource: string,
  normalized: Record<string, any>,
  existing: Record<string, any> | null | undefined,
) => {
  if (resource !== "invoices" && resource !== "receipts") return;

  const numberField = clientAssignedDocumentNumberField(resource, normalized);
  if (numberField) {
    const requested = String(normalized[numberField] ?? "").trim();
    const current = String(existing?.[numberField] ?? "").trim();

    if (requested !== current) {
      throw new Error(
        "Il numero di un documento non si digita: lo assegna la numerazione del club. " +
          "Un documento si emette dal suo incasso, e il numero nasce li.",
      );
    }
  }

  /*
    **Un documento fiscale non nasce dal registro generico.**

    Nasce da un incasso, e lo emette `fiscal-documents.ts`: li si risolve
    l'intestatario, si congela lo snapshot, si chiede il numero alla sequenza
    e si scrive lo stato. Il registro generico non fa nessuna di quelle cose, e
    lasciarglielo creare produceva un documento **senza numero e senza
    snapshot** che il dominio poi scambiava per uno gia emesso.

    Una revisione ostile lo ha usato cosi: un collaboratore — che una ricevuta
    non potrebbe emetterla, perche la rotta di emissione chiede
    `canManageClubConfiguration` — creava una riga `receipts` con il
    `transaction_id` di un incasso **vero**. Il controllo di idempotenza
    dell'emissione trovava quella riga e restituiva **quella**, senza numero,
    con importo un centesimo e la causale che l'attaccante aveva scritto. E
    poiche `transaction_id` e unico, quell'incasso non poteva **piu** essere
    documentato: mai.

    La modifica resta possibile — un allegato rigenerato, un riferimento — e
    la difende `assertDocumentMutable`. La creazione no.
  */
  if (!existing) {
    throw new Error(
      "Accesso negato: un documento fiscale si emette dal suo incasso, non dal registro generico. " +
        "Da li nascono il numero, lo snapshot e la classificazione, che qui non si possono produrre.",
    );
  }

  assertDocumentMutable(existing, normalized);
};

/**
 * **Le guardie di una modifica, in un posto solo.**
 *
 * Vivevano dentro `updateResource`, e `createResource` in modo `upsert` non le
 * incontrava mai — pur essendo, quel ramo, una **modifica**: aggiorna per
 * chiave, e la chiave la sceglie chi chiama. Misurato su `ab68e98`:
 *
 *     PATCH  /api/v1/athletes/<id> {user_id}   -> 403
 *     upsert /api/v1/athletes      {id, user_id} -> 200, legame scritto
 *
 * e da li `GET /api/v1/athlete-accounts/me` consegnava a un'utenza **senza
 * nessuna tessera nel club** l'area completa di un minore, dato sanitario
 * compreso, senza invito e senza una riga di audit. Lo stesso ramo cancellava
 * i contenitori clinici che il `PATCH` conserva.
 *
 * Non e la prima volta che questa coppia si divide — il perimetro di sede era
 * gia stato aggiunto qui una revisione fa. La lezione e che i due rami devono
 * chiamare **la stessa funzione**, non avere ciascuno la propria copia: due
 * copie divergono, e la seconda diverge in silenzio.
 *
 * Modifica `normalized` in luogo dove la regola e una **conservazione**.
 */
const applicaGuardieDiModifica = async (
  resource: string,
  normalized: Record<string, any>,
  existing: Record<string, any> | null | undefined,
  scope?: ResourceAccessScope,
) => {
    /*
      **`athletes.user_id` non si scrive dal registro generico.**

      CLAUDE.md §2 e ADR-0104 dichiarano `athlete-accounts.ts` «l'unica strada
      che scrive `athletes.user_id`», e la chiave `accounts.athlete.manage`
      esiste per governarla. Ma `athletes` e aperta in scrittura alla gestione e
      nessuna proiezione toglieva quel campo dall'ingresso.

      Misurato con uno `staff` canonico: un `PATCH` che porta `user_id` collega
      la scheda di un minore a un'utenza qualunque, e
      `GET /api/v1/athlete-accounts/me` — che non chiede ne ruolo ne tessera,
      perche risolve la scheda **da quel campo** — consegna a quell'utenza l'area
      atleta completa. Serve anche a **staccare** un atleta legittimo dal proprio
      account, senza audit e senza revoca.
    */
    /*
      **Un legame con una famiglia non si crea scrivendo l'anagrafica.**

      `guardians[].linkedUserId` decide chi e famiglia di quel minore, e
      `canParentAccessAthlete` lo legge per aprire il cruscotto: nome,
      recapiti, **allergie, visite mediche, farmaci**. Chiunque potesse
      scrivere l'anagrafica se lo scriveva addosso — misurato con un ruolo
      personalizzato **senza** `clinical.read` — e leggeva dalla porta accanto
      cio che la chiave gli negava. Nell'audit restava un `anagrafica.updated`:
      la famiglia vera non aveva modo di vederlo ne di toglierlo.

      Il legame nasce **riscattando un gettone**, che e un atto tracciato e
      revocabile. Qui si nega che l'insieme dei legami **cresca**: toglierne
      uno resta possibile — e cosi si scollega — e un salvataggio ordinario
      che rimanda indietro gli stessi legami non cambia niente e passa.
    */
    if (
      scope &&
      (resource === "athletes" || resource === "simplified_athletes") &&
      normalized.data &&
      existing?.data
    ) {
      const legami = (dato: unknown): Set<string> => {
        const trovati = new Set<string>();
        const scendi = (nodo: unknown) => {
          if (Array.isArray(nodo)) {
            for (const voce of nodo) scendi(voce);
            return;
          }
          if (!nodo || typeof nodo !== "object") return;
          for (const [chiave, valore] of Object.entries(
            nodo as Record<string, unknown>,
          )) {
            if (chiave === "linkedUserId" || chiave === "linked_user_id") {
              const testo = typeof valore === "string" ? valore.trim() : "";
              if (testo) trovati.add(testo);
              continue;
            }
            scendi(valore);
          }
        };
        scendi(dato);
        return trovati;
      };

      const prima = legami(existing.data);
      const dopo = legami(normalized.data);
      const nuovi = [...dopo].filter((id) => !prima.has(id));

      if (nuovi.length) {
        await recordPermissionDenied({
          scope: {
            userId: scope.userId,
            activeRole: scope.activeRole,
            activeOrganizationId: scope.activeOrganizationId,
          },
          permission: "accounts.athlete.manage",
          resource: "athletes",
          resourceId: String((existing as any)?.id || ""),
          metadata: {
            nuovi_legami: nuovi.length,
            reason: "guardian_link_from_generic_route",
          },
        });
        throw new Error(
          "Accesso negato: il legame fra un tutore e un'utenza nasce dal riscatto del suo codice di accesso, non scrivendo l'anagrafica",
        );
      }
    }

    if (
      scope &&
      (resource === "athletes" || resource === "simplified_athletes") &&
      "user_id" in normalized &&
      String(normalized.user_id ?? "").trim() !==
        String((existing as any)?.user_id ?? "").trim()
    ) {
      await recordPermissionDenied({
        scope: {
          userId: scope.userId,
          activeRole: scope.activeRole,
          activeOrganizationId: scope.activeOrganizationId,
        },
        permission: "accounts.athlete.manage",
        resource: "athletes",
        metadata: {
          athlete_id: String((existing as any)?.id || ""),
          reason: "athlete_user_link_from_generic_route",
        },
      });
      throw new Error(
        "Accesso negato: il legame fra un atleta e un'utenza si crea e si revoca dalla gestione dell'accesso EasyGame, non dal registro generico",
      );
    }

    /*
      **La tessera non cambia intestatario da qui, ed e il buco che la prima
      correzione ha lasciato aperto.**

      La guardia di sotto controlla `role` e `custom_role_id`, cioe le due
      colonne che nominano un **ruolo**. Ma la colonna che nomina la **persona**
      non era controllata da niente, ed e scalare: sopravviveva alla rimozione
      delle relazioni e arrivava intatta alla `update`.

      Una revisione ostile lo ha eseguito: una «Segreteria» basata su
      `club_manager` con una chiave sola manda un `PATCH` sulla tessera del
      **proprietario** con il solo campo `{"user_id": "<se stessa>"}`, e da quel
      momento e lei a portare la tessera `owner`. Nessuna delle guardie esistenti
      la vedeva: la riga e del suo club, la risorsa non e `athletes`, il ruolo
      non e nominato.

      Spostare una tessera da una persona a un'altra non e una modifica: e una
      **revoca piu una concessione**, e le fa `club-roles.ts`, che sa negarle su
      se stessi e lascia le due righe di audit. Qui si nega e basta — la stessa
      scelta gia presa per `clubs.creator_id`, che per la stessa ragione non si
      cambia dal registro generico.
    */
    /*
      **Il club d'ingresso di un'altra persona non lo si sceglie per lei.**

      `is_primary` decide su quale club si apre l'applicazione. Cambiarlo
      sulla tessera di qualcun altro non concede nessun permesso — ed e per
      questo che nessuna guardia lo guardava — ma sposta la scrivania di una
      persona senza che lei lo sappia, e in un prodotto multi-club e un modo
      efficace di farle credere che qualcosa sia sparito.

      Il proprio si cambia dalla rotta che attiva una tessera, che verifica
      che sia la propria.
    */
    if (
      scope &&
      resource === "organization_users" &&
      "is_primary" in normalized &&
      String((existing as any)?.user_id ?? "").trim() !==
        String(scope.userId ?? "").trim()
    ) {
      throw new Error(
        "Accesso negato: il club d'ingresso lo sceglie la persona a cui la tessera appartiene",
      );
    }

    if (
      scope &&
      resource === "organization_users" &&
      "user_id" in normalized &&
      String(normalized.user_id ?? "").trim() !==
        String((existing as any)?.user_id ?? "").trim()
    ) {
      await recordPermissionDenied({
        scope: {
          userId: scope.userId,
          activeRole: scope.activeRole,
          activeOrganizationId: scope.activeOrganizationId,
        },
        permission: "club_roles.assign",
        resource: "organization_users",
        metadata: {
          target_user_id: String((existing as any)?.user_id || ""),
          requested_user_id: String(normalized.user_id || ""),
          reason: "membership_transfer_from_generic_route",
        },
      });
      throw new Error(
        "Accesso negato: una tessera non cambia intestatario. Revocala e concedila dalla gestione accessi, che lascia le due righe di audit",
      );
    }

    /*
      **`custom_role_id` non si scrive affatto dal registro generico.**

      ADR-0102: lo slug e il riferimento al ruolo di club si scrivono
      **insieme e solo** da `club-roles.ts`, perche una riga con uno e senza
      l'altro da il ruolo base **senza** restringimento. La rotta generica
      rifiutava gia lo slug; il riferimento no.

      E la guardia sotto non lo vedeva, per un motivo sottile: passa il
      **ruolo invariato** ad `assertConcessioneDiAccessoLecita`, che esce
      sulla scorciatoia «la tessera c'e gia con quel ruolo, riscriverla non
      concede niente». Vera per `role`; falsa per `custom_role_id`, che da
      solo cambia l'effetto della tessera.

      Misurato: un `PATCH` con il solo `{custom_role_id}` sulla tessera di un
      **proprietario** la rendeva incoerente, `risolviTessere` la scartava, e
      la vittima usciva dal club. Con un 200, e senza la riga di revoca che
      il `DELETE` accanto lascia — cioe il modo di togliere di mezzo in
      silenzio chiunque potesse fermare l'attaccante.
    */
    if (
      scope &&
      resource === "organization_users" &&
      "custom_role_id" in normalized
    ) {
      await recordPermissionDenied({
        scope: {
          userId: scope.userId,
          activeRole: scope.activeRole,
          activeOrganizationId: scope.activeOrganizationId,
        },
        permission: "club_roles.assign",
        resource: "organization_users",
        metadata: {
          target_user_id: String((existing as any)?.user_id || ""),
          reason: "custom_role_id_from_generic_route",
        },
      });
      throw new Error(
        "Accesso negato: il ruolo personalizzato di una tessera si scrive dalla gestione accessi, che scrive insieme lo slug e il riferimento",
      );
    }

    if (
      resource === "organization_users" &&
      ("role" in normalized || "custom_role_id" in normalized)
    ) {
      await assertConcessioneDiAccessoLecita(
        String(
          normalized.organization_id || existing?.organization_id || "",
        ).trim(),
        String(normalized.user_id || existing?.user_id || "").trim(),
        String(normalized.role ?? existing?.role ?? "").trim(),
        scope,
      );
    }

    /*
      **Un campo clinico non si cancella scrivendo senza averlo letto.**

      La colonna `data` si scrive intera, quindi il salvataggio della scheda
      atleta e sempre una **sostituzione**. Chi non ha `clinical.read` riceve
      l'anagrafica **senza** i campi clinici — e la difesa che questa Wave ha
      appena rafforzato — e la rimanda cosi: il primo salvataggio azzerava visite
      mediche, documenti d'identita e i file degli attestati.

      Il difetto non nasce dalla schermata: nasce dall'aver reso una lettura
      parziale indistinguibile da una cancellazione. La regola giusta e che
      **un'assenza non e una cancellazione**: cio che non e stato ricevuto resta
      com'era.

      C'e un secondo effetto, e va detto perche e quello che rende la regola
      necessaria e non solo prudente: senza, ogni salvataggio della scheda
      porterebbe con se le chiavi dei contenitori clinici, e
      `toccaCampiClinici` chiederebbe il permesso sanitario **a ogni correzione
      di un cognome** — cioe esattamente cio che il commento di
      `RISORSE_CON_SCHEDA_ATLETA` dichiara di voler evitare.
    */
    if (RISORSE_CON_SCHEDA_ATLETA.has(resource) && normalized.data && existing?.data) {
      const precedente = existing.data as Record<string, any>;
      const nuovo = normalized.data as Record<string, any>;
      const conservati: Record<string, any> = {};

      /*
        **Chi non puo leggere un contenuto clinico non lo puo nemmeno svuotare.**

        La prima stesura conservava solo le chiavi **assenti**, e non e bastato:
        la schermata normalizza cio che manca in `[]` e `{}`, quindi il vuoto
        arriva al posto dell'assenza e la fusione non scattava. Misurato
        end-to-end con un ruolo che ha `clinical.manage` e non `clinical.read`:
        visite mediche, documenti d'identita, file dei certificati e contenitore
        libero di un minore **azzerati da un salvataggio ordinario**.

        La regola completa distingue le due cose che sembrano uguali: un vuoto da
        chi **puo** vedere quel contenuto e una cancellazione, e si rispetta; un
        vuoto da chi **non puo** vederlo e il segno di una lettura parziale, e non
        cancella niente.
      */
      const puoVedereIlClinico = hasHealthPermission(
        scope?.activeRole,
        "clinical.read",
      );

      for (const campo of CLINICAL_ATHLETE_FIELDS) {
        const eraPieno =
          Object.prototype.hasOwnProperty.call(precedente, campo) &&
          !eVuoto(precedente[campo]);
        const arrivaVuoto =
          !Object.prototype.hasOwnProperty.call(nuovo, campo) ||
          eVuoto(nuovo[campo]);

        if (eraPieno && arrivaVuoto && !puoVedereIlClinico) {
          conservati[campo] = precedente[campo];
          continue;
        }

        if (
          Object.prototype.hasOwnProperty.call(precedente, campo) &&
          !Object.prototype.hasOwnProperty.call(nuovo, campo)
        ) {
          conservati[campo] = precedente[campo];
        }
      }

      /*
        **L'ordine dello spread e la meta della regola, e la prima stesura lo
        aveva al contrario.**

        Con `{ ...conservati, ...nuovo }` cio che arriva vince sempre — ed e
        giusto per una chiave **assente**, che in `nuovo` non c'e, e sbagliato
        per una chiave **vuota**, che c'e e sovrascrive proprio il valore appena
        conservato. La sonda lo ha misurato: visite e certificati tornavano a
        zero con la regola in funzione.

        Cio che entra in `conservati` ci entra **solo** se chi scrive non poteva
        vedere quel campo: farlo vincere non calpesta nessuna modifica
        volontaria, perche una modifica volontaria di chi vede il campo non passa
        mai di qui.
      */
      if (Object.keys(conservati).length) {
        normalized.data = { ...nuovo, ...conservati };
      }

      /*
        **La stessa regola vale per il codice con cui entra la famiglia.**

        `data.guardians[].parentAccessTokenValue` viene tolto in lettura a
        chiunque non abbia una direzione canonica. La scheda letta cosi e
        rimandata indietro cancellava il codice: la famiglia non entrava piu, e
        nessuno aveva chiesto di revocarlo.

        Il difetto e identico a quello clinico qui sopra — un'assenza scambiata
        per una cancellazione — ma non poteva essere risolto dallo stesso ciclo,
        perche quello guarda le chiavi di primo livello e il gettone e dentro un
        elemento di un elenco.
      */
      if (!vedeICredenzialiDiAccesso(scope?.activeRole)) {
        const revocate = new Set<string>();
        normalized.data = restoreGuardianAccessTokens(
          existing.data,
          normalized.data,
          revocate,
        );

        /*
          **E cio che il ripristino non ha saputo riagganciare non si perde in
          silenzio.**

          Il ripristino accoppia i tutori per identita stabile — `id` o `uuid`.
          Una scrittura che riordina un elenco senza id, o che ne cambia la
          forma, gli passa accanto: il gettone sparirebbe senza un errore, che
          e esattamente il danno che questa regola esiste per impedire, ed e
          stato misurato da una revisione.

          Si confrontano gli **insiemi di valori**, che e una proprieta e non
          dipende da come il contenitore e fatto: se chi non puo vedere una
          credenziale ne fa sparire una, la scrittura fallisce e dice perche.
          Chi la vede continua a revocarla: quel ramo non passa di qui.
        */
        const prima = collectGuardianCredentialValues(existing.data);
        const dopo = collectGuardianCredentialValues(normalized.data);
        const perse = [...prima].filter(
          (valore) => !dopo.has(valore) && !revocate.has(valore),
        );

        if (perse.length) {
          throw new Error(
            "Accesso negato: questo salvataggio farebbe sparire il codice di accesso di una famiglia, e il ruolo attivo non puo vederlo. Si revoca dalla scheda di chi lo possiede",
          );
        }
      }
    }
};
export const updateResource = async (
  resource: string,
  id: string,
  input: Record<string, any>,
  scope?: ResourceAccessScope,
  options?: ResourceRequestOptions,
) => {
  const delegate = getDelegate(resource);
  const config = RESOURCE_CONFIG[resource];

  assertResourceIsOpen(resource);
  assertRuoloRistrettoRaggiungeLaRisorsa(resource, scope);
  assertNotDomainOwnedModel(resource);
  assertNotDomainOwnedResourceItem(resource, input?.resource_type);
  await assertClinicalWrite(resource, scope, input);

  if (config.kind === "club_resource") {
    const existing = await findClubResourceRecord(resource, id, scope);
    if (!existing) {
      throw new Error("Risorsa del club non trovata");
    }
    assertRecordAccess(resource, existing, scope);

    const normalized = normalizeClubResourceInput(resource, {
      ...input,
      id: existing.id,
    });
    await guardaIlConioDiUnGettone(resource, normalized, scope);
    const inputLogicalId =
      !isUuid(input?.id) && typeof input?.id === "string" && input.id.trim()
        ? input.id.trim()
        : null;
    const existingLogicalId = getClubResourceLogicalId(existing);
    const existingPayload =
      typeof existing.payload === "object" && existing.payload
        ? clone(existing.payload)
        : {};
    const nextPayload =
      typeof normalized.payload === "object" && normalized.payload
        ? {
            ...existingPayload,
            ...clone(normalized.payload),
          }
        : existingPayload;
    assertAnagraficaIsValid(resource, { payload: nextPayload }, existing);
    normalizeAnagraficaText(resource, { payload: nextPayload });

    const logicalIdToPreserve = inputLogicalId || existingLogicalId;

    if (logicalIdToPreserve && !nextPayload.id) {
      nextPayload.id = logicalIdToPreserve;
    }

    const stampedPayload = await applySeasonStamp(
      resource,
      nextPayload,
      existing.organization_id,
      options,
      String((existingPayload as any)?.seasonId || "").trim() || null,
    );

    normalized.organization_id = resolveScopedOrganizationId(
      scope,
      normalized.organization_id || existing?.organization_id,
    );
    const record = await delegate.update({
      where: { id: existing.id },
      data: {
        organization_id: normalized.organization_id,
        name: normalized.name ?? existing.name ?? nextPayload.name ?? null,
        status:
          normalized.status ?? existing.status ?? nextPayload.status ?? null,
        date:
          normalized.date ??
          existing.date ??
          toDateOrUndefined(nextPayload.date) ??
          null,
        payload: stampedPayload,
      },
    });

    if (normalized.organization_id) {
      await syncClubAggregateField(normalized.organization_id, resource);
    }

    return serializeRecord(resource, record, scope);
  }

  const normalized = await normalizeModelInput(resource, input);

  /*
    **Il fondatore di un club non si cambia da qui, e nemmeno in modifica.**

    La creazione lo controlla; la modifica no, e `creator_id` e una colonna
    scalare, quindi arrivava intatta a `delegate.update`. Con una sola
    richiesta un gestore poteva **regalare il club a chiunque** — perche
    `resolveOrganizationScopeForUser` ricava da quella colonna sia
    l'appartenenza sia il ruolo `owner` — e nello stesso gesto **spodestare
    se stesso**, restando con `activeRole` nullo. Il nuovo proprietario non
    compare in nessuna schermata delle tessere, perche di riga in
    `organization_users` non ne nasce nessuna.

    Non e una modifica che il registro generico debba sapere fare. Se un club
    dovra cambiare intestazione, sara un atto con il suo percorso e la sua
    traccia.
  */
  if (
    scope &&
    (resource === "clubs" || resource === "organizations") &&
    normalized.creator_id !== undefined
  ) {
    delete normalized.creator_id;
  }

  const existing = await delegate.findUnique({
    where: { id },
    include: getModelInclude(resource),
  });
  assertRecordAccess(resource, existing, scope);
  await assertRecordWithinAccessScope(resource, existing, scope);

  /*
    Anche la modifica: spostare una notifica gia scritta su un altro
    destinatario e la stessa cosa che scriverla li, e passerebbe da qui invece
    che dalla creazione. Il perimetro e lo stesso — una persona, e di questo
    club — e si controlla solo se il `PATCH` tocca davvero il destinatario:
    una modifica che non lo nomina non deve dover ridichiarare il club.
  */
  /*
    Anche il padre si riverifica in modifica: un `PATCH` che ripunta
    `athlete_id` su un atleta di un altro club e la stessa cosa che crearla li,
    e passerebbe da qui invece che dalla creazione. La guardia sul destinatario
    di una notifica era gia su entrambi i verbi; questa no.
  */
  await guardParentBelongsToClub(
    resource,
    {
      ...normalized,
      organization_id:
        normalized.organization_id || existing?.organization_id || null,
    },
    scope,
  );
  /*
    **Il perimetro non si allarga da dentro.**

    Le righe di `athlete_category_memberships` **definiscono** il perimetro di
    sede, e la stessa tabella e aperta in scrittura alla gestione. Un ruolo
    perimetrato sulla sede Nord creava un'appartenenza per un atleta della sede
    Sud, con la **propria** sede dentro, e da quel momento ogni porta chiusa gli
    si apriva a buon diritto: il confine non veniva aggirato, veniva spostato.

    Due condizioni, e servono entrambe: la riga deve stare dentro il proprio
    perimetro (`assertMembershipWithinAccessScope`), e l'atleta a cui si
    attacca deve essere gia dentro (`athleteWithinAccessScope`) — altrimenti
    basterebbe scrivere la riga giusta sull'atleta sbagliato.
  */
  if (scope && resource === "athlete_category_memberships") {
    assertMembershipWithinAccessScope(scope, normalized);

    const atleta = String(normalized.athlete_id ?? "").trim();
    const club = String(
      normalized.organization_id ?? scope.activeOrganizationId ?? "",
    ).trim();

    if (atleta && club) {
      const dentro = await athleteWithinAccessScope(club, atleta, scope);
      if (!dentro) {
        throw new Error(
          "Accesso negato: questo atleta e fuori dal perimetro di sede o categoria dell'accesso",
        );
      }
    }
  }


  if ("user_id" in normalized) {
    await guardNotificationRecipient(
      resource,
      {
        user_id: normalized.user_id,
        organization_id:
          normalized.organization_id || existing?.organization_id || null,
      },
      scope,
    );
  }

  /*
    **La quarta porta era questa, ed era quella che serviva per farlo su se
    stessi.**

    La Wave 5 ha messo `assertConcessioneDiAccessoLecita` su tre scrittori di
    `organization_users`: il ramo `upsert`, la creazione semplice e la
    sincronizzazione. Non sulla **modifica** — e `role` e `custom_role_id` sono
    colonne scalari, quindi sopravvivevano a `togliRelazioni` e arrivavano
    intatte a `delegate.update`.

    `PATCH /api/v1/organization_users/<la propria tessera>` con
    `{"role":"owner","custom_role_id":null}` promuoveva chi lo chiedeva a
    proprietario pieno. `assignClubRole` vieta esplicitamente di assegnarsi un
    ruolo da soli: questa rotta lo permetteva, ed e proprio il caso che l'altra
    vieta.

    La guardia e la stessa delle altre tre porte — una regola, quattro
    ingressi — e gira **solo** quando il `PATCH` tocca davvero il ruolo o il
    ruolo personalizzato: cambiare `is_primary` non deve dover ridichiarare
    niente.
  */
  /*
    Il tipo lo dice la **riga**, non chi chiede: `club_resource_items` e una
    risorsa di **modello**, quindi passa di qui e non dal ramo delle risorse di
    club, e un `PATCH` che cambia solo il payload non porterebbe nessun
    `resource_type` da controllare.
  */
  assertNotDomainOwnedResourceItem(resource, existing?.resource_type);

  /*
    La modifica parziale delle impostazioni si applica per conto suo, con il
    lock, prima del resto: e l'unica parte della scrittura in cui due richieste
    concorrenti possono cancellarsi a vicenda. Le altre colonne sono valori
    singoli, dove l'ultima scrittura che vince e il comportamento atteso.
  */
  const settingsPatch = takeClubSettingsPatch(resource, normalized);
  if (settingsPatch && existing) {
    await applyClubSettingsPatch(
      resource,
      String(existing.id),
      settingsPatch,
      scope,
      options,
    );
  }

  assertAnagraficaIsValid(resource, normalized, existing);
  normalizeAnagraficaText(resource, normalized);
  await guardPlatformOwnedClubSettings(
    resource,
    normalized,
    existing?.settings,
    scope,
    options,
    existing?.id || id,
  );
  await guardLedgerOwnedPaymentState(resource, normalized, existing, scope, id);
  guardFiscalDocumentIntegrity(resource, normalized, existing);

  if (isOrganizationScopedResource(resource)) {
    normalized.organization_id = resolveScopedOrganizationId(
      scope,
      normalized.organization_id || existing?.organization_id,
    );
  }

  await applicaGuardieDiModifica(resource, normalized, existing, scope);

  const record = await delegate.update({
    where: { id },
    data: normalized,
    include: getModelInclude(resource),
  });

  if (resource === "users") {
    await syncUserClubAccess(record.id, input.club_access, scope);
  }

  if (resource === "clubs" || resource === "organizations") {
    await syncClubMembers(record.id, input.memberships, scope);
    await ensureClubDashboard(
      record.id,
      normalized.creator_id,
      input.dashboard_data,
    );
    for (const field of CLUB_RESOURCE_TYPES) {
      if (input[field] !== undefined) {
        /*
          **La terza porta di una collezione con un proprietario.**

          Le prime due — la risorsa di modello `club_resource_items` e la rotta
          per nome `/api/v1/<tipo>` — le chiude
          `assertNotDomainOwnedResourceItem`. Questa e la piu difficile da
          vedere, perche non nomina la collezione: e un `PUT /api/v1/clubs` che
          porta il campo JSON aggregato, e riscrive **l intera** collezione con
          la copia che il browser aveva letto un istante — o dieci minuti —
          prima.

          E la porta da cui una sonda di concorrenza ha fatto sparire un socio
          appena ammesso: la scrittura andava a buon fine, nessun errore, e il
          libro restava a citare una persona che l anagrafica non conosceva piu.
        */
        assertNotDomainOwnedResourceItem(field, field);
        await syncClubResourceItemsFromField(record.id, field, input[field]);
      }
    }
  }

  return serializeRecord(resource, record, scope);
};

/**
 * **Una rata con storia economica non si cancella.** (D-1)
 *
 * La regola del dominio e scritta da tempo — *«un incasso non si cancella: si
 * storna»* — e tre vincoli di database la difendono sulla tabella degli
 * incassi. Ma la rata a monte era cancellabile, e il vincolo che collega le
 * due tabelle e `ON DELETE CASCADE`: cancellare il debito portava via con se
 * **tutti i movimenti di denaro che lo avevano saldato**, storni e rimborsi
 * compresi, senza lasciare traccia di cosa fosse sparito.
 *
 * Il rimedio non e un soft-delete nuovo: e riconoscere che una rata toccata
 * dal denaro **non e piu una riga di piano**, e un fatto contabile. Se va
 * annullata, si annulla — `status = "cancelled"` resta scrivibile, ed e la
 * strada che la sostituzione del piano di pagamento usa gia. Se un incasso e
 * sbagliato, si storna nel suo dominio.
 *
 * Una rata **mai incassata e senza documenti** resta cancellabile: correggere
 * un piano compilato male non e cancellare denaro, ed e un'operazione che la
 * segreteria fa legittimamente.
 *
 * Il conteggio guarda **tutti** gli incassi, storni inclusi: una rata incassata
 * e poi stornata ha saldo zero e una storia che deve restare leggibile.
 */
/**
 * **Cancellare un atleta non cancella l'attribuzione di denaro pubblico.**
 *
 * Il difetto che chiude, e la forma che lo rendeva invisibile: le guardie di
 * questo file sono scritte sul **nome della risorsa** che si cancella, mentre
 * Postgres distrugge per **raggiungibilita**. `athletes` non e fra le risorse
 * riservate — la segreteria cancella un atleta tutti i giorni, ed e giusto —
 * ma la catena `athletes -> funding_accruals -> funding_settlement_lines`
 * arrivava fino al denaro di un ente pubblico.
 *
 * La testata della liquidazione sopravvive con l'importo intero erogato; le
 * righe che lo giustificano sparivano. Il totale «liquidato» restava, senza
 * piu nessuno a cui attribuirlo, e la riconciliazione da consegnare al
 * finanziatore perdeva beneficiari in silenzio.
 *
 * E la stessa regola di `assertPaymentHasNoEconomicHistory`, applicata al
 * livello che la raggiunge: un atleta **senza** liquidazioni resta
 * cancellabile, perche correggere un'anagrafica sbagliata non e cancellare
 * denaro. Il vincolo `RESTRICT` sul database e l'altra meta: questa frase
 * spiega, quello vale anche per chi non passa dall'applicazione.
 */
const assertAthleteHasNoSettledFunding = async (
  resource: string,
  athleteId: string,
) => {
  if (resource !== "athletes" && resource !== "simplified_athletes") return;
  if (!athleteId) return;

  /*
    **Questa guardia rifiutava ogni cancellazione, sempre.**

    Interrogava `accrual.athlete_id`, e `FundingAccrual` **non ha** quella
    colonna: ha `enrollment_id`, ed e `FundingEnrollment` a portare
    l'atleta. Prisma rispondeva con un errore di validazione, non con un
    conteggio — quindi nessun atleta era cancellabile, da nessun ruolo, da
    nessuna delle due rotte, nemmeno uno senza un solo contributo.

    E i tre test che la presidiavano **passavano**, perche il doppio di Prisma
    riceveva righe scritte a mano nella forma `{ accrual: { athlete_id } }`:
    il presidio modellava l'assunzione sbagliata del codice invece dello
    schema. Due implementazioni d'accordo fra loro non sono una verifica se
    condividono la stessa assunzione.
  */
  const righeLiquidate = await (prisma as any).fundingSettlementLine.count({
    where: { accrual: { enrollment: { athlete_id: athleteId } } },
  });

  if (righeLiquidate > 0) {
    throw new Error(
      "Questo atleta ha contributi gia liquidati da un ente e non si cancella: " +
        "le righe che attribuiscono quel denaro sparirebbero, e la liquidazione " +
        "resterebbe un totale senza beneficiari. Revoca l'iscrizione al bando, " +
        "che conserva lo storico.",
    );
  }
};

/**
 * **Un club con una storia fiscale non si cancella da una rotta CRUD.**
 *
 * `clubs` e una risorsa di modello, quindi `DELETE /api/v1/clubs/<il proprio>`
 * e raggiungibile da proprietario e gestore — e sotto quella riga la
 * cancellazione a catena del database tocca **cinquantaquattro tabelle**:
 * fatture, ricevute, incassi, movimenti, conti, liquidazioni dei bandi, le
 * sequenze di numerazione e ogni allegato.
 *
 * Il prodotto rifiuta `DELETE /api/v1/invoices/<emessa>` dicendo che «un buco
 * nella numerazione non e spiegabile», e poi le cancellava tutte insieme un
 * livello piu su. Le due porte non possono rispondere diversamente sulla
 * stessa cosa.
 *
 * Un club **senza** documenti fiscali emessi resta cancellabile: chiudere una
 * prova o un club creato per sbaglio e un'operazione legittima, e finche non
 * e stato emesso niente non c'e nessun registro da spiegare.
 */
const assertClubHasNoFiscalHistory = async (
  resource: string,
  clubId: string,
) => {
  if (resource !== "clubs" && resource !== "organizations") return;
  if (!clubId) return;

  const [fatture, ricevute] = await Promise.all([
    (prisma as any).invoice.count({ where: { organization_id: clubId } }),
    (prisma as any).receipt.count({ where: { organization_id: clubId } }),
  ]);

  if (fatture > 0 || ricevute > 0) {
    throw new Error(
      `Questo club ha emesso documenti fiscali (${fatture} fatture, ${ricevute} ricevute) e non si cancella: ` +
        "cancellarlo distruggerebbe registri che una societa e tenuta a conservare, " +
        "insieme a incassi, movimenti e allegati. Archivia il club invece di cancellarlo.",
    );
  }
};

const assertPaymentHasNoEconomicHistory = async (
  resource: string,
  paymentId: string,
) => {
  if (resource !== "payments" && resource !== "simplified_payments") return;
  if (!paymentId) return;

  const [incassi, ricevute, fatture] = await Promise.all([
    (prisma as any).paymentTransaction.count({ where: { payment_id: paymentId } }),
    (prisma as any).receipt.count({ where: { payment_id: paymentId } }),
    (prisma as any).invoice.count({ where: { payment_id: paymentId } }),
  ]);

  if (incassi > 0) {
    throw new Error(
      "Questa rata ha una storia economica: e stata toccata dal denaro e non si cancella. " +
        "Per correggere un incasso si storna; per chiudere il debito si annulla la rata.",
    );
  }

  if (ricevute > 0 || fatture > 0) {
    throw new Error(
      "Questa rata ha un documento fiscale collegato e non si cancella. " +
        "Un documento emesso si annulla nel suo dominio, non sparisce con la rata.",
    );
  }
};

/**
 * **Un documento fiscale emesso non si cancella.** (H-5)
 *
 * `deleteResource` non aveva nessuna guardia fiscale: `DELETE
 * /api/v1/invoices/<id>` su una fattura **emessa** rimuoveva la riga, e con
 * essa — `EInvoiceTransmission.invoice_id` e `onDelete: Cascade` — anche il
 * tracciato preparato.
 *
 * **Perche e peggio di una cancellazione qualsiasi.** La sequenza di
 * numerazione **non arretra**: dopo la cancellazione resta un buco che nessuno
 * puo spiegare. Un buco spiegabile — un documento annullato, che resta e dice
 * di esserlo — e la cosa che un verificatore si aspetta di trovare; un numero
 * mancante senza nessuna riga che lo giustifichi e il contrario di cio che il
 * dominio dichiara di garantire.
 *
 * Un documento **bozza** resta cancellabile: non e uscito da nessuna parte, e
 * non ha ancora consumato un numero.
 *
 * E la stessa regola di `assertPaymentHasNoEconomicHistory`, un piano piu in
 * la: cio che qualcuno ha in mano non sparisce.
 */
const assertDocumentNotIssued = async (resource: string, record: any) => {
  if (resource !== "invoices" && resource !== "receipts") return;
  if (!record) return;

  const stato = String(record.status ?? "").trim();
  if (stato !== "issued" && stato !== "cancelled") return;

  const numero = String(record.invoice_number ?? record.receipt_number ?? "").trim();
  throw new Error(
    `Un documento emesso non si cancella${numero ? ` (${numero})` : ""}: il numero non si libera, e un buco nella numerazione non e spiegabile. ` +
      "Annullalo, cosi resta e dice di essere annullato.",
  );
};

export const deleteResource = async (
  resource: string,
  id: string,
  scope?: ResourceAccessScope,
) => {
  assertResourceIsOpen(resource);
  assertRuoloRistrettoRaggiungeLaRisorsa(resource, scope);
  assertNotDomainOwnedModel(resource);
  await assertClinicalWrite(resource, scope);
  const delegate = getDelegate(resource);
  const config = RESOURCE_CONFIG[resource];

  if (config.kind === "club_resource") {
    /*
      **La guardia di dominio viene prima della lettura.**

      Quando e il **nome della risorsa** a dire che il dominio ha un
      proprietario — `/api/v1/transactions` — non serve leggere la riga per
      saperlo, e leggerla prima significherebbe rispondere «non trovata» a chi
      indovina un identificativo e «Accesso negato» a chi lo azzecca: cioe dire
      a un estraneo quali righe esistono.
    */
    assertNotDomainOwnedResourceItem(resource, resource);

    const existing = await findClubResourceRecord(resource, id, scope);
    if (!existing) {
      throw new Error("Risorsa del club non trovata");
    }
    assertRecordAccess(resource, existing, scope);
    /*
      Il tipo lo dice la **riga**, non chi chiede: una cancellazione non porta
      un corpo, quindi la guardia si applica dopo aver letto cosa si sta per
      cancellare.
    */
    assertNotDomainOwnedResourceItem(resource, existing?.resource_type);
    const record = await delegate.delete({
      where: { id: existing.id },
    });

    if (existing?.organization_id) {
      await syncClubAggregateField(existing.organization_id, resource);
    }
    return serializeRecord(resource, record, scope);
  }

  const existing = await delegate.findUnique({
    where: { id },
    include: getModelInclude(resource),
  });
  assertRecordAccess(resource, existing, scope);
  await assertRecordWithinAccessScope(resource, existing, scope);

  /*
    **Due porte sulla stessa revoca, e questa non aveva la serratura.**

    `revokeClubAccess` riserva al proprietario la revoca di una tessera
    `owner` e protegge il fondatore. La cancellazione dal registro generico
    non aveva ne l'una ne l'altra: un gestore — canonico o personalizzato —
    cancellava la tessera di un proprietario con
    `DELETE /api/v1/organization_users/<id>`.

    Qui si nega e basta, senza duplicare le regole dell'altra porta: le
    tessere di club si tolgono da dove le si concede, che e anche l'unico
    posto che lascia la riga di audit giusta.
  */
  /*
    La prima stesura bloccava solo le tessere che **normalizzano** su `owner`.
    Una tessera con uno slug personalizzato non normalizza su `owner` e si
    cancellava quindi dal registro generico, saltando `revokeClubAccess` — che
    protegge il fondatore, vieta la revoca su se stessi e lascia la riga di
    audit. Le tessere di club si tolgono da dove le si concede: qui si nega per
    **tutte**, e la riga di audit la scrive l'altra porta.
  */
  if (scope && resource === "organization_users") {
    await recordPermissionDenied({
      scope: {
        userId: scope.userId,
        activeRole: scope.activeRole,
        activeOrganizationId: scope.activeOrganizationId,
      },
      permission: "club_roles.assign",
      resource: "organization_users",
      metadata: {
        target_user_id: String((existing as any)?.user_id || ""),
        target_role: String((existing as any)?.role || ""),
        reason: "membership_from_generic_route",
      },
    });
    throw new Error(
      "Accesso negato: una tessera di club si revoca dalla gestione accessi, non dalla rotta generica",
    );
  }

  /*
    Il tipo lo dice la **riga**, non chi chiede: `club_resource_items` e una
    risorsa di **modello**, quindi passa di qui e non dal ramo delle risorse di
    club, e un `PATCH` che cambia solo il payload non porterebbe nessun
    `resource_type` da controllare.
  */
  assertNotDomainOwnedResourceItem(resource, existing?.resource_type);
  /*
    Prima il confine del club, poi la regola del denaro: chiedere «questa rata
    ha incassi?» su una riga di un altro club sarebbe gia una risposta di
    troppo.
  */
  await assertPaymentHasNoEconomicHistory(resource, existing?.id);
  await assertDocumentNotIssued(resource, existing);
  await assertAthleteHasNoSettledFunding(resource, existing?.id);
  /*
    ADR-0019. Le guardie qui sopra sono tutte **fiscali**: proteggono il denaro
    e i documenti emessi. Nessuna proteggeva la **persona**, e cancellare un
    atleta distruggeva in cascata i suoi certificati medici lasciando invece
    vivi allegati, consensi e compilazioni — righe con i dati di un minore che
    nessun indice legava piu a niente, quindi irrintracciabili.

    Questa guardia non vieta la cancellazione: pretende che i dati personali
    siano stati **smaltiti** prima, con il percorso che li attraversa tutti
    (src/lib/server/data-subject.ts).
  */
  await assertPersonalDataDisposed(
    resource,
    existing?.id,
    existing?.organization_id,
  );
  await assertClubHasNoFiscalHistory(resource, existing?.id);

  const record = await delegate.delete({
    where: { id },
    include: getModelInclude(resource),
  });

  return serializeRecord(resource, record, scope);
};
