import {
  normalizeAccessRole,
  parseCustomRoleValue,
  type CanonicalAccessRole,
} from "@/lib/access-roles";

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
  | "accounts"
  | "appointments"
  | "audit"
  | "communications"
  | "consents"
  | "data_subject"
  | "documents"
  | "events"
  | "health"
  | "members"
  | "seasons"
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
  /* ------------------------------------------------------- eventi -------- */
  /*
    Per l'allenatore queste chiavi sono concesse **ristrette al perimetro** —
    i propri gruppi operativi — e il perimetro lo applica `events.ts` riga per
    riga, non questa tabella. Qui si dice se il ruolo puo fare quella cosa;
    dove la possa fare e una domanda diversa, e mescolarle produrrebbe una
    matrice che nessuno riesce piu a leggere.

    Genitore e atleta **non compaiono**: il loro accesso a un evento nasce dal
    legame con l'atleta convocato, e il legame non e un ruolo.
  */
  {
    key: "events.read",
    domain: "events",
    label: "Vedere allenamenti, gare e il calendario del club",
    roles: [...GESTIONE, "trainer"],
    byLink: true,
  },
  {
    key: "events.manage",
    domain: "events",
    label: "Creare, modificare e annullare un evento",
    roles: [...GESTIONE, "trainer"],
  },
  {
    key: "events.convoke",
    domain: "events",
    label: "Convocare gli atleti a un evento",
    roles: [...GESTIONE, "trainer"],
  },
  {
    key: "events.attendance",
    domain: "events",
    label: "Registrare l'appello di un evento",
    roles: [...GESTIONE, "trainer"],
  },
  {
    key: "rsvp.read",
    domain: "events",
    label: "Vedere le risposte delle famiglie a un evento",
    roles: [...GESTIONE, "trainer"],
  },
  {
    key: "rsvp.answer",
    domain: "events",
    label: "Rispondere alla convocazione di un evento",
    /*
      **La riga che diceva il contrario di chi decide.** Qui c'era `GESTIONE`;
      la matrice che `answerRsvp` interroga davvero — quella delle
      comunicazioni — concede questa chiave a **genitore e atleta** e la nega
      alla segreteria. Due tabelle in disaccordo su sei ruoli su sette, e una
      schermata che avesse creduto a questa avrebbe mostrato alla segreteria un
      pulsante che il server rifiuta, e nascosto alla famiglia l'unica cosa che
      le e chiesto di fare.
      Chi risponde a una convocazione e chi e stato convocato. La segreteria non
      risponde al posto suo: se un giorno dovra farlo — la telefonata di una
      famiglia senza smartphone — sara una chiave nuova e dichiarata, non
      questa allargata di nascosto.
    */
    roles: ["parent", "athlete"],
    byLink: true,
  },

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

  /* ------------------------------- il fascicolo Club ↔ Parent (5D) ------- */
  /*
    Il workflow documentale esisteva gia per intero; cio che mancava e che
    richiesta e decisione fossero **righe** con un permesso proprio. Il
    genitore e l'atleta non compaiono fra i ruoli di `documents.submit_own` e
    `documents.read_dossier`: il loro accesso nasce dal **legame** con
    l'atleta, che non e un ruolo.
  */
  {
    key: "documents.request",
    domain: "documents",
    label: "Chiedere un documento a una famiglia o a un collaboratore",
    roles: GESTIONE,
  },
  {
    key: "documents.review",
    domain: "documents",
    label: "Accettare o rifiutare un documento consegnato",
    roles: GESTIONE,
  },
  {
    /*
      **Il nome dice «own» e il controllo non lo chiedeva.**

      `assertSubjectAccess` esce subito se il ruolo ha la chiave, per qualunque
      soggetto: con `trainer` in elenco, un allenatore poteva depositare un file
      nel fascicolo di **qualunque** atleta o collega del club. Poi non lo
      rileggeva — `documents.read_dossier` e solo della gestione — ma la riga e
      l'allegato erano stati scritti, e un documento falso nel fascicolo di un
      minore e un danno che non ha bisogno di essere riletto per essere fatto.

      La segreteria resta, e non e un'incoerenza: protocollare il certificato
      che una famiglia porta a mano **e** il suo lavoro, ed e la ragione per cui
      `source` distingue `club` da `parent`. L'allenatore non protocolla niente.

      Se un domani un allenatore dovra consegnare un **proprio** documento, la
      strada e il lavoro sportivo, che ha il suo dominio e le sue chiavi: non
      questa, allargata di nuovo.
    */
    key: "documents.submit_own",
    domain: "documents",
    label: "Consegnare un documento richiesto",
    roles: GESTIONE,
    byLink: true,
  },
  {
    key: "documents.read_dossier",
    domain: "documents",
    label: "Vedere il fascicolo documentale di una persona",
    roles: GESTIONE,
    byLink: true,
  },

  /* ---------------------------------------- gli appuntamenti (5E) -------- */
  /*
    `appointments.read` e la **coda di lavoro della segreteria**: tutti gli
    appuntamenti del club. `appointments.read_own` e piu stretto ed e cio che
    ha l'allenatore — i soli appuntamenti che gli sono stati assegnati — e cio
    che ha la famiglia per legame.
  */
  {
    key: "appointments.read",
    domain: "appointments",
    label: "Vedere tutti gli appuntamenti del club",
    roles: GESTIONE,
  },
  {
    key: "appointments.read_own",
    domain: "appointments",
    label: "Vedere gli appuntamenti che mi riguardano",
    roles: [...GESTIONE, "trainer"],
    byLink: true,
  },
  {
    key: "appointments.request",
    domain: "appointments",
    label: "Chiedere un appuntamento alla segreteria",
    roles: GESTIONE,
    byLink: true,
  },
  {
    key: "appointments.manage",
    domain: "appointments",
    label:
      "Confermare, rifiutare, riprogrammare o annullare un appuntamento, e configurare la disponibilita",
    roles: [...GESTIONE, "trainer"],
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
    /*
      **La chiave che il §12 elencava e che il catalogo non aveva.** C'era
      soltanto la sua opposta, `decide_for_others`, e la sonda di sicurezza
      della Wave 5 l'ha misurata mancante: la capacita esisteva — una famiglia
      accetta e revoca dalla propria area — ma **senza un nome**, e cio che non
      ha un nome non si puo elencare in una schermata ne concedere a un ruolo
      personalizzato.

      `roles` e vuoto **di proposito, e non e una dimenticanza**: questo
      permesso non si ottiene mai da un ruolo. Lo scope della famiglia porta
      `activeRole: null` perche ogni controllo di ruolo risponda «no», e
      l'unica strada resti il legame che `assertSubjectMayDecide` verifica —
      «una famiglia decide sul proprio atleta». Aggiungere qui `parent` non
      aprirebbe niente e mentirebbe sul come: direbbe che chiunque abbia il
      ruolo genitore puo decidere, mentre la verita e che puo decidere chi e
      legato a **quell'** atleta.
    */
    key: "consents.decide_own",
    domain: "consents",
    label: "Accettare o revocare un consenso per il proprio atleta",
    roles: [],
    byLink: true,
  },
  {
    key: "consents.records.read",
    domain: "consents",
    label: "Leggere lo stato dei consensi del club",
    roles: GESTIONE,
  },

  /* ------------------------------------------------- comunicazioni e bacheca --- */
  /*
    **Quattordici poteri che nessuna casella governava.**

    Questi domini hanno una **matrice privata** e chiamano gia
    `narrowDomainPermission` — ma quella funzione, davanti a una chiave che il
    catalogo non conosce, risponde «vale il ruolo base». Il ponte c'era e non
    reggeva nessun peso: un ruolo personalizzato con **una** chiave poteva
    inviare comunicazioni a tutte le famiglie, selezionare il pubblico «chi non
    ha pagato», pubblicare in bacheca, accendere automazioni, e stornare
    movimenti contabili.

    Il presidio della domanda inversa non le vedeva per costruzione: filtrava
    per **domini gia in catalogo**, quindi un dominio interamente assente era
    invisibile. Una revisione ostile lo ha dimostrato inventando quattro chiavi
    in domini orfani e ottenendo un verde.

    Le matrici restano dove sono — sono dei domini — e qui entra l'**elenco**,
    che e cio che l'editor disegna. E la stessa forma gia usata per
    `sport_work`.
  */
  {
    key: "communications.send",
    domain: "communications",
    label: "Creare e inviare una comunicazione alle famiglie",
    roles: DIREZIONE,
  },
  {
    key: "communications.read_recipients",
    domain: "communications",
    label: "Vedere l'elenco nominativo dei destinatari e degli esclusi",
    roles: DIREZIONE,
  },
  {
    key: "communications.audience_economic",
    domain: "communications",
    label: "Selezionare un pubblico in base alla posizione economica",
    roles: DIREZIONE,
  },
  {
    key: "automations.manage",
    domain: "communications",
    label: "Creare, modificare, accendere e spegnere un'automazione",
    roles: DIREZIONE,
  },
  {
    key: "board.publish",
    domain: "communications",
    label: "Pubblicare un avviso in bacheca",
    roles: DIREZIONE,
  },
  /*
    `board.read` **non** entra in catalogo, ed e una scelta.

    Il dominio la dichiara nel proprio vocabolario, ma nessuna guardia la
    interroga: le schermate della bacheca decidono con altri criteri, e la
    chiave compare solo nei commenti che raccontano una lane passata.

    Metterla qui darebbe all'editor una casella che non toglie niente — cioe
    esattamente il difetto che le quattordici righe qui sopra chiudono, con il
    segno invertito. Quando una guardia la chiedera, entrera.
  */

  /* ------------------------------------------------------------ contabilita --- */
  {
    key: "accounting.read",
    domain: "accounting",
    label: "Leggere la prima nota e i movimenti del club",
    roles: GESTIONE,
  },
  {
    key: "accounting.manage",
    domain: "accounting",
    label: "Registrare e modificare un movimento",
    roles: GESTIONE,
  },
  {
    key: "accounting.reconcile",
    domain: "accounting",
    label: "Riconciliare un movimento con un incasso",
    roles: GESTIONE,
  },
  {
    key: "accounting.reverse",
    domain: "accounting",
    label: "Stornare un movimento gia registrato",
    roles: DIREZIONE,
  },
  {
    key: "accounting.export",
    domain: "accounting",
    label: "Esportare la contabilita del club",
    roles: DIREZIONE,
  },
  {
    key: "accounting.accounts_read",
    domain: "accounting",
    label: "Vedere i conti correnti del club e i loro saldi",
    roles: DIREZIONE,
  },
  {
    key: "accounting.accounts_manage",
    domain: "accounting",
    label: "Aprire, modificare e chiudere un conto corrente",
    roles: DIREZIONE,
  },
  {
    key: "accounting.causes_manage",
    domain: "accounting",
    label: "Configurare le causali contabili del club",
    roles: DIREZIONE,
  },

  /* ---------------------------------------------------- stagioni sportive --- */
  /*
    La chiave esisteva gia in `src/lib/seasons/permissions.ts` e non era in
    catalogo: era quindi **fuori dall'editor**, e per `narrowDomainPermission`
    valeva la regola «fuori catalogo = vale il ruolo base». Un ruolo
    personalizzato non poteva vedersela togliere.

    Sta con `DIREZIONE` perche il modulo la fa gia dipendere da
    `canManageClubConfiguration`: entrare in catalogo non allarga il perimetro,
    lo rende **governabile**.
  */
  {
    key: "seasons.change",
    domain: "seasons",
    label: "Creare, attivare e archiviare una stagione sportiva",
    roles: DIREZIONE,
  },

  /* ------------------------------------------- dati personali di una persona --- */
  /*
    **Perche queste due chiavi nascono adesso, e non con il dominio.**

    L'export e la cancellazione del fascicolo di una persona erano protetti da
    `canManageClubConfiguration`, cioe dal **ruolo**. Con i ruoli
    personalizzati quella difesa e diventata insufficiente in un modo preciso:
    `normalizeAccessRole` di un gettone `custom:club_manager:...` risponde
    `club_manager`, quindi **ogni** ruolo personalizzato costruito su quella
    base portava la cancellazione irreversibile dei dati di una persona —
    spesso di un minore — e nessuna casella dell'editor poteva toglierla,
    perche la chiave non esisteva.

    Una revisione ostile lo ha detto meglio di come lo scriverei: era «l'unico
    atto che il testo dell'editor non nomina», e «non si puo togliere la
    spunta, perche non c'e una spunta».

    Sono chiavi di **direzione** (`DIREZIONE`), quindi `isDirectionPermission`
    e vera e un ruolo personalizzato che le porta lo puo assegnare **solo il
    proprietario**: la cancellazione dei dati di una persona non si delega di
    rimbalzo.
  */
  {
    key: "data_subject.export",
    domain: "data_subject",
    label: "Esportare tutti i dati di una persona",
    roles: DIREZIONE,
  },
  {
    key: "data_subject.erase",
    domain: "data_subject",
    label:
      "Cancellare o anonimizzare in modo irreversibile i dati di una persona",
    roles: DIREZIONE,
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

  /* ------------------------------ l'accesso EasyGame di una persona ------ */
  {
    /*
      **Consegnare un accesso non e leggere una scheda** (W6-25/26/27).

      La chiave nasce con la sua superficie — la sezione «Accesso EasyGame»
      della scheda atleta — e non prima: e la regola di W5-D01.

      `GESTIONE` e non `DIREZIONE`, e la ragione e che questo atto **non
      concede niente che chi lo compie non abbia gia**. Il ruolo dell'invito e
      fisso — `athlete` — e il perimetro e la scheda di **quell'** atleta, che
      segreteria e collaboratore leggono per intero tutti i giorni: non c'e
      nessuna scalata di privilegio da difendere. Chiuderla alla direzione
      avrebbe messo la consegna dell'accesso in un ufficio diverso da quello
      che tiene l'anagrafica, cioe l'avrebbe resa una cosa che non si fa.

      Il perimetro **vero** — un invito si manda a un atleta del proprio club —
      non lo dice questa riga: lo applica `assertActiveClub` riga per riga
      (ADR-0094). Qui si dice se il ruolo puo compiere l'atto, non dove.
    */
    key: "accounts.athlete.manage",
    domain: "accounts",
    label:
      "Invitare un atleta ad accedere a EasyGame, reinviare l'invito e revocargli l'accesso",
    roles: GESTIONE,
  },

  /* -------------------------------------------- il registro di audit ----- */
  {
    /*
      **Il registro esisteva e non lo leggeva nessuno** (WP-16).
      Centootto punti di scrittura, quattro indici gia adatti alla lettura, e
      zero rotte: `prisma.auditLog.findMany` non compariva in nessun handler.

      `DIREZIONE` e non `GESTIONE`, e il motivo e nel contenuto: il registro
      porta **tutti** gli atti del club insieme — chi ha stornato un incasso,
      chi ha cambiato l'anagrafica di un minore, chi ha provato a fare cosa e si
      e visto negare. E il piu trasversale dei dati societari, e il suo perimetro
      e lo stesso che gia protegge i conti correnti.

      Resta **concedibile** a un ruolo personalizzato basato su `club_manager`:
      e la chiave con cui un club costruisce un «controllo interno» che legge il
      registro e non tocca nient'altro. Concederla e pero un atto del
      proprietario, perche e una chiave di direzione (§10.4 del piano).
    */
    key: "audit.read",
    domain: "audit",
    label: "Consultare il registro degli accessi e delle operazioni del club",
    roles: DIREZIONE,
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
  const entry = BY_KEY.get(key);
  if (!entry) return false;

  /*
    **Il ruolo personalizzato risponde due volte, e la piu stretta vince**
    (Wave 6, lane 6G).

    Le quindici guardie di dominio chiedono tutte la stessa cosa —
    `roleHasPermission(scope.activeRole, chiave)` — e nessuna di loro sa, ne
    deve sapere, che il ruolo attivo possa essere personalizzato. Il
    restringimento sta quindi **qui**, nell'unico punto da cui passano tutte:

      1. il **tetto**: la chiave deve appartenere al ruolo base. Un ruolo
         personalizzato e un sottoinsieme, mai un soprainsieme (§10.1 del
         piano), e questa riga lo rende vero anche se una riga di
         `club_role_permissions` dicesse il contrario — un archivio si puo
         corrompere, questa condizione no;
      2. la **concessione**: la chiave dev'essere fra quelle assegnate.

    Un gettone senza chiavi — per esempio lo slug letto dall'archivio, che le
    chiavi non le porta — nega tutto. E il verso giusto in cui sbagliare: chi
    non ha risolto la riga non concede niente.
  */
  const personalizzato = parseCustomRoleValue(role);
  if (personalizzato) {
    if (!entry.roles.includes(personalizzato.baseRole)) return false;
    return personalizzato.permissions.includes(key);
  }

  const normalized = normalizeAccessRole(role);
  if (!normalized) return false;

  return entry.roles.includes(normalized);
};

/** Tutte le chiavi che un ruolo porta, per una schermata di configurazione. */
export const listPermissionsForRole = (role: string | null | undefined) => {
  const personalizzato = parseCustomRoleValue(role);
  if (personalizzato) {
    return ENTRIES.filter(
      (entry) =>
        entry.roles.includes(personalizzato.baseRole) &&
        personalizzato.permissions.includes(entry.key),
    );
  }

  const normalized = normalizeAccessRole(role);
  if (!normalized) return [] as PermissionEntry[];

  return ENTRIES.filter((entry) => entry.roles.includes(normalized));
};

/** Le chiavi di un dominio, per elencarle raggruppate. */
export const listPermissionsForDomain = (domain: PermissionDomain) =>
  ENTRIES.filter((entry) => entry.domain === domain);

/**
 * **Il restringimento applicato a una matrice privata di dominio.**
 *
 * ## Il difetto che chiude
 *
 * Il ruolo personalizzato viaggia dentro un gettone che porta le chiavi
 * concesse, e `roleHasPermission` lo legge: le quindici guardie che passano da
 * li ricevono la risposta ristretta senza saperlo.
 *
 * Ma **quattro domini non passano da li**. `sport-work`, `accounting`,
 * `communications` e `seasons` tengono una matrice per ruolo tutta loro — la
 * prima duplica il catalogo, la seconda ha chiavi che in catalogo **non ci sono
 * affatto**, la terza e l'autorita vera su `rsvp.answer` — e la interrogano
 * dopo aver **normalizzato** il ruolo, cioe dopo aver visto il ruolo **base**.
 *
 * Conseguenza: togliere `sport_work.pay` a un ruolo personalizzato non toglieva
 * niente. Cinque caselle che non fanno niente sono esattamente cio che il
 * mandato vieta — «ogni permission mostrata deve avere effetto reale» — e
 * nasconderle sarebbe stato il rimedio sbagliato: si sarebbe smesso di
 * mostrarle **e** di poterle togliere.
 *
 * ## Le tre risposte, e perche sono tre
 *
 * - `null` — **non e un ruolo personalizzato**. Chi chiama prosegue come prima,
 *   e nessun comportamento esistente cambia.
 * - `false` — il **tetto**: la chiave non appartiene al ruolo base. Un ruolo
 *   personalizzato e un sottoinsieme, mai un soprainsieme.
 * - la **concessione**, ma solo per le chiavi che l'editor sa davvero
 *   concedere. Una chiave che **non e in catalogo** — le `accounting.*` lo sono
 *   solo nel dominio — non compare in nessuna casella: restringerla su una
 *   concessione che nessuno ha mai potuto dare toglierebbe a un ruolo basato su
 *   `club_manager` la contabilita intera, e sarebbe una regressione muta.
 *
 * Quella terza riga e la parte che vale la pena rileggere: **si restringe cio
 * che qualcuno ha potuto scegliere, non cio che nessuno ha mai visto.**
 */
export const narrowDomainPermission = (
  role: string | null | undefined,
  key: string,
  baseHasKey: (base: CanonicalAccessRole) => boolean,
): boolean | null => {
  const personalizzato = parseCustomRoleValue(role);
  if (!personalizzato) return null;

  if (!baseHasKey(personalizzato.baseRole)) return false;

  // Fuori catalogo = non concedibile dall'editor = vale il ruolo base.
  if (!BY_KEY.has(key)) return true;

  return personalizzato.permissions.includes(key);
};
