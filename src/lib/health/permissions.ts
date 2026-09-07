import { normalizeAccessRole } from "@/lib/access-roles";
import { roleHasPermission } from "@/lib/permissions/catalog";

/**
 * **Chi vede lo stato di un certificato non vede per cio stesso il contenuto
 * clinico di un minore.**
 *
 * Il difetto (D-4, gap G-33) non era «manca un permesso»: era peggio, perche
 * sembrava esserci. `medical_certificates` e `simplified_certificates` stanno
 * in `TRAINER_READ_RESOURCES` accanto ad `athletes`, e il flag
 * `viewMedicalStatus` di `trainer-dashboard-permissions.ts` nasce **`true`** e
 * compare in diciannove punti, **tutti dentro `src/components/**`**: zero
 * occorrenze sotto `src/lib/server/**` e zero sotto `src/app/api/**`.
 * Nascondeva le schede — allergie, farmaci, gruppo sanguigno, BLSD — mentre il
 * dato usciva comunque da `GET /api/v1/athletes`.
 *
 * Viola ADR-0058 alla lettera: *«uno stato che si ricava non si scrive, e la
 * guardia sta in ogni strada che porta al campo»*. E cade sotto ADR-0019, che
 * dichiara privacy e audit bloccanti per la produzione: qui si tratta di dati
 * sanitari di minori.
 *
 * **Il taglio, e perche e quello giusto.**
 *
 * - **Lo stato** — valido, in scadenza, scaduto, mancante, con la data —
 *   risponde alla domanda operativa «questo atleta puo scendere in campo?».
 *   Serve all'allenatore, e gli resta.
 * - **Il contenuto** — allergie, patologie, farmaci, gruppo sanguigno, note
 *   mediche, il file del certificato — risponde a una domanda che l'allenatore
 *   non deve porsi per fare il proprio lavoro. Default **negato**.
 *
 * Il taglio non e inventato: e esattamente quello che l'interfaccia gia
 * distingue, con il badge di scadenza da una parte e le schede
 * allergie/farmaci/BLSD dall'altra. La differenza e che prima lo distingueva
 * **il browser**, e da adesso lo distingue il server.
 *
 * **Il legame vale piu del ruolo.** Un genitore e un atleta leggono il proprio
 * fascicolo per legame — `⛓` nella matrice della Wave 5 — e non passano da
 * questo modulo: le loro rotte risolvono il legame e sono l'unico gate. Qui si
 * decide cosa vede chi guarda il fascicolo **di qualcun altro**.
 */

export type HealthPermission =
  | "clinical.status_read"
  | "clinical.read"
  | "clinical.manage";

export const HEALTH_PERMISSIONS: readonly HealthPermission[] = [
  "clinical.status_read",
  "clinical.read",
  "clinical.manage",
] as const;

export const HEALTH_PERMISSION_LABELS: Record<HealthPermission, string> = {
  "clinical.status_read":
    "Vedere se il certificato medico e valido, in scadenza o scaduto",
  "clinical.read":
    "Vedere il contenuto clinico: allergie, patologie, farmaci, gruppo sanguigno e il file del certificato",
  "clinical.manage": "Registrare e modificare certificati e dati sanitari",
};

/**
 * **Perche collaborator e staff hanno il contenuto e trainer no.**
 *
 * Segreteria e collaboratori sono le persone che il certificato lo **ricevono,
 * lo protocollano e lo sollecitano**: senza il contenuto non possono fare il
 * lavoro per cui il club le paga. L'allenatore no: il suo lavoro finisce alla
 * domanda «puo giocare», e quella la risponde lo stato.
 *
 * Finche non esiste il meccanismo di concessione per singolo operatore
 * (Wave 6, con i ruoli personalizzati) non c'e un modo di restituire il
 * contenuto a un allenatore. E una scelta deliberata: **il default su un dato
 * sanitario di un minore e negato**, e un default sbagliato non si compensa
 * con una casella di spunta nel browser.
 *
 * **La matrice vive nel catalogo unico** (`src/lib/permissions/catalog.ts`,
 * W5-70): una chiave che nessuna schermata puo elencare non e configurabile, e
 * un motore di ruoli personalizzati non avrebbe niente da leggere. Questo
 * modulo resta il proprietario del **dominio** — cosa e stato e cosa e
 * contenuto — e non tiene una seconda copia della tabella dei ruoli.
 */
export const listHealthPermissions = (
  role: string | null | undefined,
): readonly HealthPermission[] => {
  /*
    **Il ruolo si passa intero, non normalizzato** (PP-03).

    Questa funzione chiedeva `roleHasPermission(normalizeAccessRole(role), …)`,
    e `normalizeAccessRole` di un gettone personalizzato
    (`custom:collaborator:segreteria#events.read`) restituisce `collaborator`:
    le chiavi concesse sparivano per strada, e l'elenco rispondeva per il ruolo
    **base**. Un ruolo personalizzato a cui il club **non** ha dato
    `clinical.read` se la vedeva elencare comunque.

    La sorella `hasHealthPermission`, tre righe piu in basso, il ruolo lo
    passava gia intero: due funzioni nello stesso file che rispondevano
    diversamente alla stessa domanda. `roleHasPermission` sa gia leggere il
    gettone e applica il tetto del ruolo base — normalizzare prima non
    aggiungeva una guardia, ne toglieva una.

    Nessun chiamante di produzione era esposto oggi: e una trappola disarmata
    prima che qualcuno ci passasse sopra.
  */
  if (!normalizeAccessRole(role)) return [];

  return HEALTH_PERMISSIONS.filter((permission) =>
    roleHasPermission(role, permission),
  );
};

export const hasHealthPermission = (
  role: string | null | undefined,
  permission: HealthPermission,
) => roleHasPermission(role, permission);

/**
 * Solleva se il ruolo non ha il permesso.
 *
 * Il messaggio contiene «Accesso negato» perche il route handler lo mappi su
 * 403: e la convenzione del repository, e non e negoziabile.
 */
export const assertHealthPermission = (
  role: string | null | undefined,
  permission: HealthPermission,
) => {
  if (!hasHealthPermission(role, permission)) {
    throw new Error(
      `Accesso negato: il ruolo attivo non puo ${HEALTH_PERMISSION_LABELS[permission].toLowerCase()}`,
    );
  }
};

/**
 * I campi di `athletes.data` che sono **contenuto clinico**, non stato.
 *
 * L'elenco e chiuso e sta qui, in un modulo puro, perche la proiezione lato
 * server e la schermata devono nascondere **le stesse cose**: quando erano due
 * elenchi, uno dei due e rimasto indietro per undici mesi.
 *
 * `medicalCertificateExpiry` e i suoi alias **non** sono in elenco: sono lo
 * stato, ed e cio che l'allenatore deve continuare a vedere.
 */
export const CLINICAL_ATHLETE_FIELDS: readonly string[] = [
  "allergies",
  "allergie",
  "bloodType",
  "blood_type",
  "bloodGroup",
  "blood_group",
  "chronicDiseases",
  "chronic_diseases",
  "patologie",
  "disabilities",
  "medications",
  "medicinali",
  "medicalNotes",
  "medical_notes",
  "noteMediche",
  "healthNotes",
  "health_notes",
  "blsd",
  "firstAid",
  "first_aid",
  "fireSafety",
  "fire_safety",
  "dietaryRestrictions",
  "dietary_restrictions",
  /*
    **I contenitori di file, e perche non erano qui.**

    L'elenco sopra era fatto di **campi**: allergie, patologie, farmaci. E una
    revisione ostile ha misurato che i **contenitori** passavano interi. Con un
    atleta seminato e uno scope da allenatore, la risposta di
    `GET /api/v1/athletes` conteneva:

        blsd:             (tolto)
        certificateFiles: { "blsd": "data:application/pdf;base64,..." }
        medicalVisits:    [{ "outcome": "soffio sistolico, da rivalutare", ... }]

    Il **flag** del BLSD veniva tolto e **il PDF del BLSD restava**. L'esito di
    una visita cardiologica di un minore usciva per intero, e con lui i
    documenti d'identita e i documenti condivisi con la famiglia — allegati in
    base64 dentro il JSON dell'anagrafica.

    La schermata dell'allenatore nascondeva «Visite Mediche» dietro
    `canSeeClinicalContent`, quindi a schermo non si vedeva: lo distingueva il
    **browser**, che e esattamente il difetto che l'intestazione di questo
    modulo dichiara chiuso.

    Le quattro raccolte le legge una sola schermata, la scheda atleta
    gestionale, e chi la apre ha `clinical.read`: toglierle qui non toglie
    niente a nessuno che ne avesse titolo.
  */
  "medicalVisits",
  "medical_visits",
  "visiteMediche",
  "visite_mediche",
  "certificateFiles",
  "certificate_files",
  "identityDocuments",
  "identity_documents",
  "documentiIdentita",
  "documenti_identita",
  "sharedDocuments",
  "shared_documents",
  "parentDocuments",
  "parent_documents",
  /*
    **E i tre che la prima correzione non aveva visto.**

    L'elenco era stato completato guardando i contenitori che *sembravano*
    sanitari. Una seconda revisione ostile ha fatto la cosa giusta: e andata a
    leggere **quali raccolte la scheda atleta persiste davvero**
    (`persistAthleteCollections`), e ne ha contate nove. Ne mancavano tre.

    La peggiore e `documents`, il contenitore **libero**: la finestra «Aggiungi
    Documento» offre «Certificato Medico» nella tendina dei tipi e scrive li,
    non in `certificateFiles`. Misurato su uno scope da allenatore, la risposta
    conteneva:

        documents: [{ type: "Certificato Medico",
                      notes: "idoneita con riserva: soffio sistolico",
                      fileUrl: "attachment:att-cert" }]

    Stessa porta della prima correzione, con un'altra chiave. E la ragione per
    cui il presidio ora costruisce la sua anagrafica di prova con **tutte e
    nove** le raccolte, ricavate da quella funzione: la prima passava perche la
    fixture ometteva proprio queste.
  */
  "documents",
  "registrations",
  "enrollmentDocuments",
  "enrollment_documents",
] as const;

const CLINICAL_ATHLETE_FIELD_SET = new Set(CLINICAL_ATHLETE_FIELDS);

/**
 * Toglie il contenuto clinico da un oggetto `data` di anagrafica.
 *
 * Non lo azzera e non lo maschera con una stringa: lo **toglie**. Un campo
 * presente e vuoto dice comunque che quel campo esiste, e un client scritto
 * male lo riscriverebbe a vuoto sul primo salvataggio.
 */
/**
 * **I contenitori di `athletes.data` che non sono clinici, dichiarati per nome**
 * (PP-03 §15.4).
 *
 * ADR-0126 ha invertito la regola dentro `medical_certificates.data`: su una
 * colonna JSON **libera** si dichiara cosa passa, perche un elenco di vietati e
 * una scommessa sui nomi che qualcuno usera. `athletes.data` e la stessa
 * colonna libera, ed era rimasta sui vietati.
 *
 * Il quinto round l'ha vinta come si vince sempre, con due nomi inventati:
 *
 *     data.schedaSanitaria.allergies      -> usciva intero
 *     data.anamnesi[].patologia           -> usciva intero
 *
 * su sette porte su sette (`/athletes`, `/athletes/:id`, `/simplified_athletes`,
 * `?view=summary`) verso un allenatore con il solo `clinical.status_read`. Il
 * taglio guardava i nomi di **primo livello**: un contenitore con un nome nuovo
 * passava, e con lui tutto quello che aveva dentro.
 *
 * **La riga che cambia e questa**: un valore **composto** — oggetto o elenco —
 * esce solo se il suo nome e qui. I campi semplici restano sull'elenco dei
 * vietati, perche li lo schema dell'anagrafica e enumerabile e la schermata ne
 * legge una ventina per nome; un contenitore no, e un contenitore e il posto in
 * cui il testo libero si nasconde.
 *
 * L'elenco non e stato immaginato: sono i contenitori che il prodotto **scrive
 * davvero** (`persistAthleteCollections` e i consumatori dell'anagrafica),
 * meno quelli che l'elenco dei vietati qui sopra toglie gia perche clinici o
 * documentali.
 *
 * Il prezzo e dichiarato, ed e lo stesso di ADR-0126: un contenitore non
 * clinico che il prodotto comincera a scrivere va **aggiunto qui**, e finche
 * non lo e sparisce per chi non ha `clinical.read`. Si nota un contenitore che
 * manca, non un referto che esce.
 */
export const NON_CLINICAL_ATHLETE_CONTAINERS: readonly string[] = [
  "guardians",
  "clothingSizes",
  "clothing_sizes",
  "categories",
  "categoryIds",
  "category_ids",
  "categoryNames",
  "category_names",
  "categoryMemberships",
  "category_memberships",
  /*
    I pagamenti non sono un dato sanitario e non passano di qui: toglierli
    adesso cambierebbe cosa vede la **famiglia** sul proprio figlio, che e
    l'altro chiamante di questa funzione. Che un allenatore non debba vedere la
    contabilita della famiglia e vero e resta scritto come debito: e una
    domanda del dominio pagamenti, non di questo modulo.
  */
  "payments",
] as const;

const NON_CLINICAL_ATHLETE_CONTAINER_SET = new Set(NON_CLINICAL_ATHLETE_CONTAINERS);

/**
 * **Cosa di `athletes.data` vede chi vede lo stato e non il contenuto**
 * (PP-03 §15.4).
 *
 * L'elenco dei vietati toglie i nomi noti; i nomi **inventati** li ha vinti il
 * quinto round scrivendo `diagnosi`, `referto`, `terapia`, `anamnesi`,
 * `noteDelMedico` — cinque parole italiane che nessun elenco di divieti avrebbe
 * previsto, e che uscivano intere da sette porte verso un allenatore.
 *
 * Per **questo** lettore — e solo per lui — la colonna si legge al contrario:
 * escono i campi dichiarati qui, e nient'altro. Non e una forma nuova, e la
 * stessa di `CAMPI_PERSONA_VISIBILI_ALL_ALLENATORE`, che decide da due Wave
 * cosa un allenatore vede della scheda di un **collega**: un'anagrafica altrui
 * si serve per elenco di ammessi, non per elenco di divieti.
 *
 * **Chi e questo lettore.** Chi ha `clinical.status_read` e non ha
 * `clinical.read`: oggi il ruolo `trainer` e i ruoli di club che ne derivano.
 * La famiglia — genitore e atleta — **non** ci rientra: non ha nessuna delle
 * due chiavi, legge la scheda del proprio figlio, e per lei non cambia niente.
 *
 * L'elenco non e immaginato: sono i campi che le schermate dell'area allenatore
 * leggono davvero da `data`, piu le grafie alternative con cui il prodotto ha
 * scritto gli stessi campi nel tempo. Il prezzo e dichiarato ed e lo stesso di
 * ADR-0126: un campo nuovo che serve all'allenatore va **aggiunto qui**, e
 * finche non lo e non si vede. Si nota un campo che manca, non un referto che
 * esce.
 *
 * Fuori dall'elenco resta di proposito `notes`: una nota in testo libero su un
 * minore e esattamente il posto in cui «allergia arachidi» e gia stata trovata
 * una volta (§6.1).
 */
export const ATHLETE_DATA_FIELDS_FOR_STATUS_READER: readonly string[] = [
  /* identita */
  "id",
  "name",
  "surname",
  "firstName",
  "first_name",
  "lastName",
  "last_name",
  "displayName",
  "avatar",
  "avatar_url",
  "avatarUrl",
  "gender",
  "birthDate",
  "birth_date",
  /* recapiti: chi allena deve poter chiamare una famiglia */
  "phone",
  "email",
  "emergencyPhone",
  "emergency_phone",
  /* squadra */
  "category",
  "categoryId",
  "category_id",
  "categoryName",
  "category_name",
  "jerseyNumber",
  "jersey_number",
  "status",
  /*
    Lo **stato** del certificato, che e cio che questo lettore ha titolo di
    vedere. Sono cinque grafie e non una per la ragione che questo repository
    conosce bene: la stessa informazione e stata scritta con nomi diversi in
    momenti diversi, e un elenco di ammessi che ne conosce una sola le fa
    sparire le altre. Il conto e stato fatto sul sorgente, non a memoria.
  */
  "medicalCertExpiry",
  "medical_cert_expiry",
  "medicalCertificateExpiry",
  "medical_certificate_expiry",
  "medicalCertStatus",
  "medical_cert_status",
  "certificateStatus",
  "certificate_status",
  /* tesseramento */
  "enrolled",
  "registered",
  "isRegistered",
  "enrollmentStatus",
  "membershipType",
] as const;

const ATHLETE_DATA_FIELDS_FOR_STATUS_READER_SET = new Set([
  ...ATHLETE_DATA_FIELDS_FOR_STATUS_READER,
  ...NON_CLINICAL_ATHLETE_CONTAINERS,
]);

/**
 * Vede lo **stato** e non il **contenuto**: e la frase di CLAUDE.md §2, scritta
 * come predicato. Oggi vale per `trainer` e per i ruoli di club che ne
 * derivano; la famiglia non ha nessuna delle due chiavi e non ci rientra.
 *
 * **Non e piu il predicato che decide la proiezione** — vedi
 * `readerReadsDeclaredAthleteFieldsOnly` qui sotto e PP-03 §16.1. Resta perche
 * dice una cosa vera e diversa: «questa persona vede lo stato», che e la
 * domanda a cui rispondono le schede sanitarie.
 */
export const readerSeesStatusOnly = (role: unknown) =>
  hasHealthPermission(role as any, "clinical.status_read") &&
  !hasHealthPermission(role as any, "clinical.read");

/**
 * **Chi legge `athletes.data` per elenco di ammessi** (PP-03 §16.1).
 *
 * §15.4 aveva scritto questo lettore come `readerSeesStatusOnly`, cioe «ha
 * `clinical.status_read` **e non** `clinical.read`». La congiunzione sembrava
 * innocua e apriva la porta al verso opposto: un ruolo di club derivato da
 * `trainer` a cui la societa **toglie** anche `clinical.status_read` non ha
 * nessuna delle due chiavi, quindi non era «questo lettore», quindi leggeva
 * `data` **intera** — piu di quanto legga l'allenatore canonico. Togliere una
 * casella dava piu dato: un privilegio invertito, ed e la stessa forma che
 * §15.1 e §15.2 hanno gia pagato — una regola giusta applicata a una fonte
 * sbagliata.
 *
 * La domanda giusta ha un solo termine: **hai titolo al contenuto clinico?**
 * Chi non ce l'ha legge per elenco di ammessi, che abbia o no la chiave dello
 * stato. Il predicato fallisce **chiuso** anche su un ruolo assente, nullo o
 * vuoto, che e il verso in cui una funzione di sicurezza deve sbagliare.
 *
 * La famiglia non ci rientra perche non arriva mai qui: `athletes` e
 * `simplified_athletes` non sono fra le risorse che un genitore o un atleta
 * possono chiedere al registro generico (`access-roles.ts`), e la scheda del
 * proprio figlio la servono `parent-dashboard` e `auth/athlete-profile`, che
 * chiamano questa funzione **senza ruolo**.
 */
export const readerReadsDeclaredAthleteFieldsOnly = (role: unknown) =>
  !hasHealthPermission(role as any, "clinical.read");

/**
 * **Cosa resta di un contenitore ammesso** (PP-03 §16.2).
 *
 * §15.4 ha ammesso i contenitori **per nome** e li ha lasciati passare
 * **interi**: dentro `guardians`, `clothingSizes`, `categories` e `payments`
 * qualunque chiave arrivava all'allenatore, e il round 6 ci ha scritto dentro
 * quattro referti. Un contenitore ammesso per nome era di nuovo il posto in cui
 * il testo libero si nasconde — cioe esattamente la ragione per cui i
 * contenitori erano stati messi su un elenco di ammessi.
 *
 * Per il lettore ristretto la stessa regola vale **un livello piu sotto**: di
 * una voce di contenitore escono i campi dichiarati qui, e solo se sono valori
 * **semplici**. Un valore composto dentro un contenitore non esce mai: e il
 * secondo posto in cui nascondere un referto, e nessuna schermata
 * dell'allenatore lo legge.
 *
 * L'elenco non e immaginato: e stato contato sui consumatori dell'area
 * allenatore (`trainer-athlete-profile-page.tsx`), piu le grafie alternative
 * con cui il prodotto ha scritto gli stessi campi. Il prezzo e lo stesso di
 * ADR-0126 e si nota subito: un campo che manca lascia un trattino in una
 * scheda, un referto che esce non lo vede nessuno.
 *
 * Un contenitore che qui non compare — `categoryIds`, `category_names` — e un
 * elenco di stringhe: non ha voci da vagliare e passa come e.
 */
export const ATHLETE_CONTAINER_FIELDS_FOR_RESTRICTED_READER: Record<
  string,
  readonly string[]
> = {
  guardians: [
    "id",
    "name",
    "nome",
    "firstName",
    "first_name",
    "surname",
    "cognome",
    "lastName",
    "last_name",
    "fullName",
    "displayName",
    "relationship",
    "relation",
    "parentela",
    "phone",
    "telefono",
    "mobile",
    "cellulare",
    "email",
    "isPrimary",
    "is_primary",
    "primary",
  ],
  clothingSizes: [
    "profile",
    "shirtSize",
    "shirt_size",
    "pantsSize",
    "pants_size",
    "shoeSize",
    "shoe_size",
    "jerseyNumber",
    "jersey_number",
  ],
  categories: [
    "id",
    "name",
    "categoryId",
    "category_id",
    "categoryName",
    "category_name",
    "groupId",
    "group_id",
    "groupName",
    "group_name",
    /*
      **La sede non e un dettaglio anagrafico: e il perimetro** (§16.2).

      `filterTrainerDashboardRecords` gira sulla riga **gia proiettata**, e per
      il ramo dei gruppi ricade su `record.category_memberships`, che
      `serializeRecord` compone da `data.categoryMemberships`. La prima stesura
      di questo elenco non aveva `site_id`, e l'effetto e stato immediato: il
      mister dei `Pulcini · Scauri` non vedeva **nessuno** dei propri atleti,
      perche la proiezione gli aveva tolto di mano il campo con cui il suo
      stesso recinto lo riconosce. Un test di `tests/auth/` l'ha fatto fallire
      nello stesso commit — fallisce **chiuso**, ed e il verso giusto in cui un
      elenco di ammessi sbaglia.
    */
    "siteId",
    "site_id",
    "siteName",
    "site_name",
    "athleteId",
    "athlete_id",
    "isPrimary",
    "is_primary",
    "primary",
    "seasonId",
    "season_id",
    "season",
  ],
  payments: [
    "id",
    "description",
    "type",
    "date",
    "status",
    "amount",
    "currency",
    "dueDate",
    "due_date",
    "seasonId",
    "season_id",
  ],
};

/* Le grafie alternative del contenitore condividono l'elenco della propria. */
ATHLETE_CONTAINER_FIELDS_FOR_RESTRICTED_READER.clothing_sizes =
  ATHLETE_CONTAINER_FIELDS_FOR_RESTRICTED_READER.clothingSizes;
ATHLETE_CONTAINER_FIELDS_FOR_RESTRICTED_READER.categoryMemberships =
  ATHLETE_CONTAINER_FIELDS_FOR_RESTRICTED_READER.categories;
ATHLETE_CONTAINER_FIELDS_FOR_RESTRICTED_READER.category_memberships =
  ATHLETE_CONTAINER_FIELDS_FOR_RESTRICTED_READER.categories;

const CONTAINER_FIELD_SETS = new Map<string, Set<string>>(
  Object.entries(ATHLETE_CONTAINER_FIELDS_FOR_RESTRICTED_READER).map(
    ([nome, campi]) => [nome, new Set(campi)],
  ),
);

const isSemplice = (valore: unknown) =>
  valore === null || (typeof valore !== "object" && typeof valore !== "function");

/**
 * Vaglia una **voce** di contenitore: un oggetto tiene i soli campi dichiarati
 * per quel contenitore, e solo se semplici. Un elemento che oggetto non e —
 * una stringa dentro `categoryIds` — passa com'e.
 */
const proiettaVoceDiContenitore = (nome: string, voce: unknown) => {
  if (voce === null || typeof voce !== "object" || Array.isArray(voce)) {
    return isSemplice(voce) ? voce : undefined;
  }

  const ammessi = CONTAINER_FIELD_SETS.get(nome);
  if (!ammessi) return undefined;

  const next: Record<string, unknown> = {};
  for (const [chiave, valore] of Object.entries(voce as Record<string, unknown>)) {
    if (!ammessi.has(chiave)) continue;
    if (CLINICAL_ATHLETE_FIELD_SET.has(chiave)) continue;
    if (!isSemplice(valore)) continue;
    next[chiave] = valore;
  }
  return next;
};

const proiettaContenitore = (nome: string, valore: unknown) => {
  if (Array.isArray(valore)) {
    return valore
      .map((voce) => proiettaVoceDiContenitore(nome, voce))
      .filter((voce) => voce !== undefined);
  }
  const proiettata = proiettaVoceDiContenitore(nome, valore);
  return proiettata === undefined ? {} : proiettata;
};

export const stripClinicalAthleteFields = (data: unknown, role?: unknown) => {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return data;
  }

  const source = data as Record<string, unknown>;
  let toccato = false;
  const next: Record<string, unknown> = {};

  const soloDichiarati =
    role !== undefined && readerReadsDeclaredAthleteFieldsOnly(role);

  for (const [chiave, valore] of Object.entries(source)) {
    if (soloDichiarati) {
      if (!ATHLETE_DATA_FIELDS_FOR_STATUS_READER_SET.has(chiave)) {
        toccato = true;
        continue;
      }
      /*
        Un campo dichiarato resta soggetto all'elenco dei vietati e alla regola
        dei contenitori: le due difese si sommano, non si sostituiscono.
      */
    }
    if (CLINICAL_ATHLETE_FIELD_SET.has(chiave)) {
      toccato = true;
      continue;
    }
    if (
      valore !== null &&
      typeof valore === "object" &&
      !NON_CLINICAL_ATHLETE_CONTAINER_SET.has(chiave)
    ) {
      toccato = true;
      continue;
    }
    if (
      soloDichiarati &&
      valore !== null &&
      typeof valore === "object" &&
      NON_CLINICAL_ATHLETE_CONTAINER_SET.has(chiave)
    ) {
      /*
        Il contenitore e ammesso per nome; il suo **contenuto** no, e per il
        lettore ristretto si vaglia un livello piu sotto (§16.2).
      */
      toccato = true;
      next[chiave] = proiettaContenitore(chiave, valore);
      continue;
    }
    next[chiave] = valore;
  }

  return toccato ? next : source;
};

/**
 * I campi di un certificato medico che sono **contenuto**, non stato.
 *
 * Restano fuori dall'elenco `expiry_date`, `issue_date`, `status` e
 * `athlete_id`: sono la risposta a «puo scendere in campo», che l'allenatore
 * deve avere.
 */
export const CLINICAL_CERTIFICATE_FIELDS: readonly string[] = [
  "attachment_id",
  "attachment_url",
  "certificate_url",
  "data_base64",
  "doctor",
  "doctor_name",
  "file_name",
  "file_url",
  "notes",
  "public_url",
  "result",
  "sport_type",
  /*
    **Le forme in camelCase, e perche mancavano.**

    L'elenco era scritto con i nomi delle **colonne**, che sono snake_case. Ma
    dentro `medical_certificates.data` scrive il dominio, e il dominio scrive
    in camelCase: `promoteMedicalCertificate` produce
    `{ source, submissionId, requestId, attachmentId }`.

    Un elenco che copre una sola grafia copre una sola meta del prodotto, ed e
    la stessa classe del filtro di stato che cercava solo minuscole.
  */
  "attachmentId",
  "attachmentUrl",
  "certificateUrl",
  "dataBase64",
  "doctorName",
  "fileName",
  "fileUrl",
  "publicUrl",
  "sportType",
  "submissionId",
  "requestId",
] as const;

const CLINICAL_CERTIFICATE_FIELD_SET = new Set(CLINICAL_CERTIFICATE_FIELDS);

export const stripClinicalCertificateFields = (
  record: Record<string, any>,
) => {
  const next: Record<string, any> = {};

  for (const [chiave, valore] of Object.entries(record)) {
    if (CLINICAL_CERTIFICATE_FIELD_SET.has(chiave)) {
      continue;
    }
    /*
      **Il primo livello ha colonne, `data` no.**

      Qui l'elenco di vietati regge: `medical_certificates` ha uno schema
      fisso, quindi enumerare le colonne di contenuto e enumerare un insieme
      chiuso. Dentro `data` la stessa forma non regge affatto, ed e il motivo
      per cui quel ramo e passato a un elenco di **ammessi**: vedi
      `onlyNonClinicalCertificateData` qui sotto.

      Due tappe precedenti dello stesso difetto, per memoria: il ramo `data`
      ha chiamato prima l'elenco dell'**anagrafica** (e `data.attachmentId`
      usciva — la chiave per bussare ai byte), poi entrambi gli elenchi, e
      nessuna delle due stesure copriva un nome che non fosse gia previsto.
    */
    next[chiave] =
      chiave === "data" ? onlyNonClinicalCertificateData(valore) : valore;
  }

  return next;
};

/**
 * Le sole chiavi che possono uscire da `medical_certificates.data` verso chi
 * **non** ha `clinical.read`.
 *
 * `source` dice da dove arriva la riga — un deposito documentale, un
 * caricamento manuale — ed e cio che il dominio scrive
 * (`promoteMedicalCertificate`, `document-requests.ts`). Non e un dato
 * sanitario e non lo diventa.
 */
export const NON_CLINICAL_CERTIFICATE_DATA_FIELDS: readonly string[] = [
  "source",
] as const;

const NON_CLINICAL_CERTIFICATE_DATA_FIELD_SET = new Set(
  NON_CLINICAL_CERTIFICATE_DATA_FIELDS,
);

/**
 * **Dentro `data` si dichiara cosa passa, non cosa si ferma.**
 *
 * Qui c'era un elenco di **vietati**, applicato due volte — quello del
 * certificato e quello dell'anagrafica — su una colonna JSON **libera**. Un
 * elenco di vietati su un contenitore libero non e una difesa: e una
 * scommessa sui nomi che qualcuno usera. E una revisione ostile l'ha vinta
 * senza sforzo, misurando la catena intera sulle rotte vere: il proprietario
 * scrive `data: { diagnosi, referto }` da `POST /api/v1/medical_certificates`,
 * e l'allenatore — che ha solo `clinical.status_read` — se li rilegge interi
 * dall'elenco e dalla riga. Passavano anche `patologia`, `terapia`,
 * `farmaci`, `anamnesi`, `esenzione`, `limitazioni`, `gruppoSanguigno`: ogni
 * nome italiano, e ogni nome che un club o un'importazione inventera domani.
 *
 * La regola del dominio e scritta in [CLAUDE.md §2](../../../CLAUDE.md):
 * **default negato sul contenuto**. Un elenco di vietati e il default
 * opposto, e su una colonna a schema fisso lo si poteva ancora sostenere
 * enumerando le colonne; dentro `data` no, perche `data` non ha colonne.
 *
 * Il prezzo di questa inversione e dichiarato: se il prodotto comincera a
 * scrivere in `data` un campo davvero non clinico che serve a chi legge lo
 * stato, quel campo va **aggiunto qui**, e finche non lo e sparisce. E il
 * verso giusto in cui sbagliare — si nota un campo che manca, non un referto
 * che esce.
 */
const onlyNonClinicalCertificateData = (valore: unknown) => {
  if (!valore || typeof valore !== "object" || Array.isArray(valore)) {
    /*
      Un `data` che non e un oggetto non si puo ispezionare campo per campo, e
      una stringa libera puo essere qualunque cosa: non passa.
    */
    return valore === null || valore === undefined ? valore : {};
  }

  const source = valore as Record<string, unknown>;
  const next: Record<string, unknown> = {};

  for (const [chiave, contenuto] of Object.entries(source)) {
    if (!NON_CLINICAL_CERTIFICATE_DATA_FIELD_SET.has(chiave)) continue;
    /*
      **Si dichiara la chiave e anche la sua forma** (PP-03 §15.4).

      L'inversione di ADR-0126 elencava i nomi ammessi e non diceva niente su
      cosa ci potesse stare dentro. `source` e una **provenienza** — «da un
      deposito documentale», «caricato a mano» — cioe una parola; e il quinto
      round ci ha messo dentro un oggetto e un elenco:

          data.source = { diagnosi: "…" }        usciva intero
          data.source = ["referto: …"]           usciva intero

      Un contenitore sotto un nome ammesso e l'elenco dei vietati che rientra
      dalla finestra: il nome e chiuso, il contenuto no. Passa quindi solo un
      valore **semplice**, che e cio che il dominio scrive
      (`promoteMedicalCertificate`, `document-requests.ts`).
    */
    const semplice =
      contenuto === null ||
      contenuto === undefined ||
      typeof contenuto === "string" ||
      typeof contenuto === "number" ||
      typeof contenuto === "boolean";
    if (!semplice) continue;
    next[chiave] = contenuto;
  }

  return next;
};


/**
 * I campi di un tutore che sono una **credenziale**, non un recapito.
 *
 * `athletes.data.guardians[]` porta il valore **in chiaro** del gettone con cui
 * un tutore si collega al proprio account. Non e un dato sanitario, quindi
 * nessuno dei tagli di questo modulo lo toccava — ed e uscito per mesi a
 * chiunque potesse leggere un atleta.
 *
 * Sta qui, accanto agli altri elenchi chiusi, per la stessa ragione per cui ci
 * stanno quelli: la proiezione lato server e la schermata devono nascondere
 * **le stesse cose**, e quando erano due elenchi uno dei due e rimasto indietro
 * per undici mesi.
 */
export const GUARDIAN_CREDENTIAL_FIELDS: readonly string[] = [
  "parentAccessTokenValue",
  "parent_access_token_value",
  "accessTokenValue",
  "access_token_value",
  "parentAccessCode",
  "parent_access_code",
] as const;

const GUARDIAN_CREDENTIAL_FIELD_SET = new Set(GUARDIAN_CREDENTIAL_FIELDS);

/**
 * Toglie le credenziali dai tutori dentro un oggetto `data` di anagrafica.
 *
 * Restituisce **lo stesso oggetto** quando non c'e niente da togliere: e la
 * condizione che rende il taglio gratuito sulla maggioranza delle righe, ed e
 * anche il modo in cui il chiamante sa se ha dovuto copiare.
 */
export const stripGuardianAccessTokens = (data: unknown) => {
  /*
    **Si cerca il campo, non il contenitore.**

    La prima stesura entrava in tre nomi cablati — `guardians`, `tutori`,
    `parents`. Una revisione ha trovato lo stesso gettone sotto `tutors`, che
    e il quarto nome che questo repository usa per la stessa cosa, e il taglio
    passava accanto senza vederlo.

    Enumerare le porte e stato il difetto ricorrente di tutta la Wave. Qui la
    regola e sul **campo**: un valore che si chiama `parentAccessTokenValue`
    e una credenziale ovunque si trovi, e non c'e nome di contenitore che lo
    renda innocuo.
  */
  let toccato = false;

  const scendi = (nodo: unknown): unknown => {
    if (Array.isArray(nodo)) {
      const mappato = nodo.map((voce) => scendi(voce));
      return mappato.some((voce, indice) => voce !== nodo[indice])
        ? mappato
        : nodo;
    }

    if (!nodo || typeof nodo !== "object") return nodo;

    const oggetto = nodo as Record<string, unknown>;
    const next: Record<string, unknown> = {};
    let cambiato = false;

    for (const [chiave, valore] of Object.entries(oggetto)) {
      if (GUARDIAN_CREDENTIAL_FIELD_SET.has(chiave)) {
        cambiato = true;
        toccato = true;
        continue;
      }
      const disceso = scendi(valore);
      if (disceso !== valore) cambiato = true;
      next[chiave] = disceso;
    }

    return cambiato ? next : nodo;
  };

  if (!data || typeof data !== "object" || Array.isArray(data)) return data;

  const ripulito = scendi(data);
  return toccato ? ripulito : data;
};

/**
 * **Il gemello del taglio: cio che non e stato letto non si cancella.**
 *
 * `stripGuardianAccessTokens` toglie il gettone a chi non deve vederlo. Ma
 * la colonna `data` si salva **intera**: la stessa scheda, riletta senza il
 * gettone e rimandata indietro, cancellava il codice con cui la famiglia
 * entra. Nessuno lo aveva chiesto, nessun errore compariva, e la famiglia
 * scopriva il danno al primo accesso.
 *
 * E lo stesso principio gia scritto per il dato clinico in `resources.ts`:
 * **un'assenza non e una cancellazione**. Qui pero la regola non puo stare
 * su un elenco di campi di primo livello, perche il gettone e annidato in un
 * elemento di un elenco: si cammina sui due alberi in parallelo, e si
 * accoppiano gli elementi per identita quando ce l'hanno.
 *
 * Restituisce **lo stesso oggetto** quando non c'e niente da ripristinare.
 */
/**
 * **Il gemello del taglio, rifatto: la prima stesura faceva piu danno del
 * difetto che chiudeva.**
 *
 * Il problema resta quello: `data` si salva **intera**, quindi la scheda
 * riletta senza il gettone e rimandata indietro cancellava il codice con cui
 * la famiglia entra. Un'assenza non e una cancellazione.
 *
 * La prima stesura pero accoppiava gli elementi dell'elenco **per posizione**
 * e **per email**, e considerava «assente» anche un valore vuoto. Una
 * revisione ostile ne ha ricavato tre difetti nuovi, tutti misurati:
 *
 *   * una **revoca** — che si scrive proprio con il valore vuoto — veniva
 *     annullata: lo stato diceva `revoked` e il gettone era tornato;
 *   * scrivendo un tutore con l'email di un altro se ne **ereditava** la
 *     credenziale; riordinando l'elenco, due tutori se le scambiavano;
 *   * duplicando l'`id`, entrambe le righe ricevevano lo stesso gettone.
 *
 * Le due regole nuove sono strette e dicono perche:
 *
 *   1. si ripristina **solo** una chiave **assente**, mai una vuota. Chi non
 *      vede la credenziale non la riceve affatto — il taglio toglie la
 *      chiave — quindi l'assenza e esattamente il caso del giro di andata e
 *      ritorno. Un valore vuoto e invece una scrittura deliberata, ed e il
 *      modo in cui si revoca;
 *   2. gli elementi di un elenco si accoppiano **solo per identita stabile**
 *      — `id` o `uuid` — e mai per posizione o per email. Chi scrive
 *      l'anagrafica sceglie quei campi: usarli per decidere dove atterra la
 *      credenziale di un altro e dare a chi scrive il potere di spostarla.
 *
 * Restituisce **lo stesso oggetto** quando non c'e niente da ripristinare.
 */
export const restoreGuardianAccessTokens = (
  previous: unknown,
  next: unknown,
  /*
    **Qui c'era un terzo parametro, e va detto perche non c'e piu.**

    Raccoglieva i valori che chi scrive aveva svuotato, per distinguere una
    revoca da una perdita. Ma questa funzione gira **solo per chi la
    credenziale non la vede**: chi arriva qui non ha mai letto il valore, e
    quindi non puo aver deciso di revocarlo. Quel `Set` classificava come
    revoca deliberata qualunque scrittura sul campo, e la guardia del
    chiamante la escludeva dal confronto: due codici azzerati e uno
    sostituito con un valore scelto, misurati, senza errore e senza traccia.

    Chi la credenziale la vede non passa di qui: la revoca resta sua.
  */
): unknown => {
  /*
    **L'identita di un tutore, e perche non basta l'`id`.**

    La stesura precedente accoppiava **solo** per `id`/`uuid`. Una revisione
    ha misurato il prezzo: quell'`id` lo assegna il **browser**
    (`athlete-guardians.ts`), quindi i tutori gia in archivio ne sono privi
    finche la scheda non viene risalvata una volta — e senza aggancio il
    gettone non veniva ripristinato. Con la guardia contro la perdita in
    piedi, la scheda di quei minori era **non salvabile**, per sempre, da
    segreteria e collaboratori.

    Si aggancia quindi in tre modi, dal piu stabile al piu debole: `id`, poi
    l'email di contatto, poi la **posizione**. Cio che si perde accettando i
    due deboli e la resistenza a chi riordina l'elenco apposta — e chi vuole
    far sparire un gettone puo comunque togliere il tutore, che e un atto
    legittimo. Cio che si guadagna e che la scheda si salva.
  */
  const identita = (voce: unknown) => {
    if (!voce || typeof voce !== "object" || Array.isArray(voce)) return null;
    const oggetto = voce as Record<string, unknown>;
    for (const chiave of ["id", "uuid", "email"]) {
      const valore = oggetto[chiave];
      if (typeof valore === "string" && valore.trim()) {
        return `${chiave}:${valore.trim().toLowerCase()}`;
      }
    }
    return null;
  };

  const cammina = (vecchio: unknown, nuovo: unknown): unknown => {
    if (Array.isArray(vecchio) && Array.isArray(nuovo)) {
      /*
        Solo identita stabili, e **una sola volta**: un id duplicato nel nuovo
        elenco non deve ricevere due volte la stessa credenziale.
      */
      const perIdentita = new Map<string, unknown>();
      for (const voce of vecchio) {
        const chiave = identita(voce);
        if (chiave && !perIdentita.has(chiave)) perIdentita.set(chiave, voce);
      }

      const usate = new Set<string>();
      let cambiato = false;
      const mappato = nuovo.map((voce, indice) => {
        const chiave = identita(voce);
        const controparte =
          chiave && !usate.has(chiave) && perIdentita.has(chiave)
            ? perIdentita.get(chiave)
            : /*
                Nessuna identita stabile: si accoppia per **posizione**, e
                solo quando anche la controparte non ne ha una — cosi un
                tutore con `id` non riceve mai il gettone di un altro.
              */
              !chiave && !identita(vecchio[indice])
              ? vecchio[indice]
              : null;

        if (!controparte) {
          /*
            Un tutore **nuovo** non ha una controparte, e quindi non ha un
            valore precedente da conservare. Cio che il client ha scritto sui
            campi credenziale non vale: si toglie, altrimenti chi non li vede
            potrebbe **forgiarne** uno — che e il difetto opposto a quello che
            questa funzione esiste per chiudere, e altrettanto grave.
          */
          const ripulita = stripGuardianAccessTokens(voce);
          if (ripulita !== voce) cambiato = true;
          return ripulita;
        }
        if (chiave) usate.add(chiave);

        const risultato = cammina(controparte, voce);
        if (risultato !== voce) cambiato = true;
        return risultato;
      });
      return cambiato ? mappato : nuovo;
    }

    if (
      !vecchio ||
      !nuovo ||
      typeof vecchio !== "object" ||
      typeof nuovo !== "object" ||
      Array.isArray(vecchio) ||
      Array.isArray(nuovo)
    ) {
      return nuovo;
    }

    const daVecchio = vecchio as Record<string, unknown>;
    const daNuovo = nuovo as Record<string, unknown>;
    const risultato: Record<string, unknown> = { ...daNuovo };
    let cambiato = false;

    /*
      **Per chi non vede una credenziale, quei campi sono in sola lettura.**

      Tre stesure, e vale la pena scriverle tutte perche la terza e la sola
      che non ha effetti collaterali.

      La prima ripristinava una chiave **assente o vuota**: annullava le
      revoche. La seconda ripristinava solo l'assente e faceva contare la
      presente come una perdita da **rifiutare**: bloccava il salvataggio
      dell'anagrafica sui dati storici, e negava alla segreteria di togliere
      un tutore. Accettare la presente, invece, lascia **forgiare** un codice
      di accesso a chi quel codice non l'ha mai visto.

      La terza risposta e piu semplice di tutte e tre: cio che chi scrive non
      puo vedere, non lo puo nemmeno cambiare. Il valore precedente vince
      sempre; se non c'e una controparte — un tutore nuovo — la chiave sparisce
      dall'oggetto, invece di portare cio che il client ha mandato.

      Nessuna di queste righe impedisce di **togliere un tutore**: quello e un
      atto legittimo, e con lui se ne va il suo codice.
    */
    for (const campo of GUARDIAN_CREDENTIAL_FIELDS) {
      const nelVecchio = Object.prototype.hasOwnProperty.call(daVecchio, campo);
      const nelNuovo = Object.prototype.hasOwnProperty.call(daNuovo, campo);
      if (!nelVecchio && !nelNuovo) continue;

      if (nelVecchio) {
        if (risultato[campo] === daVecchio[campo]) continue;
        risultato[campo] = daVecchio[campo];
        cambiato = true;
        continue;
      }

      /* Non c'era: cio che il client manda su questo campo non vale. */
      delete risultato[campo];
      cambiato = true;
    }

    for (const [chiave, valore] of Object.entries(daNuovo)) {
      if (GUARDIAN_CREDENTIAL_FIELD_SET.has(chiave)) continue;
      if (!Object.prototype.hasOwnProperty.call(daVecchio, chiave)) continue;
      const disceso = cammina(daVecchio[chiave], valore);
      if (disceso !== valore) {
        risultato[chiave] = disceso;
        cambiato = true;
      }
    }

    return cambiato ? risultato : nuovo;
  };

  return cammina(previous, next);
};

/**
 * Tutti i valori di credenziale presenti in un albero, per confrontarli.
 *
 * Serve a una domanda sola, e vale la pena scriverla per esteso: **chi non
 * vede una credenziale non la puo distruggere**, ne per omissione ne
 * cambiando la forma del contenitore. Il ripristino copre il caso normale —
 * stesso elenco, stessa identita — ma una scrittura che riordina, rinomina o
 * trasforma l'elenco in un oggetto gli passerebbe accanto, e il gettone
 * sparirebbe in silenzio: cioe esattamente il danno che si voleva impedire.
 *
 * Confrontare gli **insiemi di valori** e la proprieta, e non dipende da come
 * il contenitore e fatto.
 */
export const collectGuardianCredentialValues = (dato: unknown): Set<string> => {
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
      if (GUARDIAN_CREDENTIAL_FIELD_SET.has(chiave)) {
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
/**
 * I campi di una **persona del club** che sono credenziali o coordinate bancarie.
 *
 * `trainers` e `staff_members` sono risorse aperte alla gestione, e la loro
 * scheda porta il gettone di accesso in chiaro, il codice fiscale e **l'IBAN**.
 * La proiezione ridotta esisteva, ma valeva solo quando il ruolo attivo era
 * `trainer`: collaboratore, segreteria e ogni ruolo personalizzato — che
 * normalizza sulla propria base — leggevano la riga intera.
 *
 * `sport_work` e fra le risorse riservate alla direzione con la motivazione
 * esplicita «le coordinate bancarie di ogni collaboratore». Le stesse
 * coordinate, scritte sulla scheda della persona, uscivano dalla porta accanto.
 */
export const PERSON_CREDENTIAL_FIELDS: readonly string[] = [
  "accessTokenValue",
  "access_token_value",
  "accessCode",
  "access_code",
  "token",
  "parentAccessTokenValue",
  "parent_access_token_value",
  "iban",
  "IBAN",
  "bankAccount",
  "bank_account",
  "fiscalCode",
  "fiscal_code",
  "codiceFiscale",
] as const;

const PERSON_CREDENTIAL_FIELD_SET = new Set(PERSON_CREDENTIAL_FIELDS);

/**
 * Toglie credenziali e coordinate bancarie dalla scheda di una persona,
 * al primo livello e dentro `data`.
 *
 * Restituisce lo **stesso** oggetto quando non c'e niente da togliere: e cio
 * che rende il taglio gratuito sulla maggioranza delle righe.
 */
export const stripPersonCredentials = (record: Record<string, any>) => {
  if (!record || typeof record !== "object") return record;

  let toccato = false;
  const next: Record<string, any> = {};

  for (const [chiave, valore] of Object.entries(record)) {
    if (PERSON_CREDENTIAL_FIELD_SET.has(chiave)) {
      toccato = true;
      continue;
    }
    next[chiave] = valore;
  }

  /*
    **I due contenitori annidati, e perche servono entrambi.**

    Una risorsa di club esce con il proprio `payload` spalmato al primo livello
    **e** conservato sotto la chiave `payload`: togliere solo il primo livello
    lasciava l'IBAN e il gettone nella copia. Un'anagrafica di modello li porta
    invece dentro `data`.

    Sono due forme dello stesso contenitore, e un taglio che ne conosce una sola
    e un taglio che copre meta delle righe.
  */
  for (const contenitore of ["data", "payload"]) {
    const dentro = next[contenitore];
    if (!dentro || typeof dentro !== "object" || Array.isArray(dentro)) continue;

    const ripulito: Record<string, any> = {};
    let toccatoDentro = false;
    for (const [chiave, valore] of Object.entries(dentro)) {
      if (PERSON_CREDENTIAL_FIELD_SET.has(chiave)) {
        toccatoDentro = true;
        continue;
      }
      ripulito[chiave] = valore;
    }

    if (toccatoDentro) {
      next[contenitore] = ripulito;
      toccato = true;
    }
  }

  return toccato ? next : record;
};
