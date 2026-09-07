import { prisma } from "./prisma";
import {
  athleteIdsWithinAccessScope,
  buildAthleteAccessScopeConditions,
} from "./access-scope-query";
import { athleteIdsWithinTrainerPerimeter } from "./resources";
import { assertActiveClub } from "@/lib/auth/active-club-boundary";
import { normalizeAccessRole } from "@/lib/access-roles";
import { roleHasPermission } from "@/lib/permissions/catalog";
import {
  accessScopeAllows,
  accessScopeValues,
  normalizeAccessScopes,
  type AccessScopeEntry,
} from "@/lib/roles/access-scope";
import {
  AUDIT_ACTIONS,
  recordAuditEvent,
  recordPermissionDenied,
} from "./audit";
import {
  ATTENDANCE_STATUSES,
  assertEventHasRoom,
  assertEventTransition,
  findEventOverlaps,
  isWithinFieldAvailability,
  normalizeAttendanceStatus,
  normalizeConvocationStatus,
  normalizeEventKind,
  normalizeEventStatus,
  campiCongelatiToccati,
  toEventColumns,
  toEventLegacyShape,
  type EventKind,
} from "@/lib/events/model";

/**
 * **L'unica strada per creare, modificare o annullare un evento sportivo.**
 *
 * ---
 *
 * ## Perche esiste
 *
 * Allenamenti e gare vivevano in due colonne JSON del club, riscritte per
 * intero da chiunque avesse il permesso di scrivere il club. Da quel singolo
 * fatto discendevano sette conseguenze — nessuna chiave esterna, nessun
 * permesso per riga, nessun audit, nessun vincolo, due segretarie che si
 * sovrascrivono, la convocazione come chiave di dizionario, l'RSVP senza
 * un identificativo su cui appoggiarsi — e ADR-0098 le chiude tutte con lo
 * stesso mattone: **l'evento e una riga**.
 *
 * ## La proiezione, e perche non e una doppia scrittura
 *
 * Novantadue punti del codice leggono ancora `clubs.trainings` e
 * `clubs.matches` nella forma storica. Le due colonne restano, ma diventano una
 * **proiezione in sola lettura con un solo scrittore: questo modulo**. Nessuno
 * le scrive piu direttamente — `resources.ts` lo rifiuta — e spariscono a
 * scaglioni man mano che i lettori passano agli eventi.
 *
 * La differenza con la doppia scrittura di prima non e sottile: prima c'erano
 * due scrittori indipendenti e l'ultimo vinceva in silenzio. Adesso c'e una
 * fonte, e una copia che qualcuno mantiene.
 *
 * ## La procedura, per ogni funzione pubblica
 *
 * 1. il permesso, dal catalogo (`events.read` / `events.manage` / …);
 * 2. il confine, riga per riga, con `assertActiveClub` — mai il confronto con
 *    `allowedOrganizationIds` (ADR-0094);
 * 3. per l'allenatore, il **perimetro**: i propri gruppi e le proprie
 *    categorie. Un permesso concesso al ruolo non e un permesso su ogni riga;
 * 4. l'audit, con l'identificativo dell'evento — che prima non esisteva.
 */

const asText = (value: unknown) => String(value ?? "").trim();

const negato = (messaggio: string) => new Error(`Accesso negato: ${messaggio}`);

export type EventsScope = {
  userId?: string | null;
  activeOrganizationId?: string | null;
  activeRole?: string | null;
  allowedOrganizationIds?: string[];
  /**
   * Il perimetro di sede e categoria.
   *
   * Il dominio lo usava gia — `assertAccessScopeOnEvent` — leggendolo da uno
   * scope che il tipo non dichiarava. Dichiararlo serve a poterlo passare
   * anche alla guardia sulle **persone**, che e quella che mancava.
   */
  accessScopes?: readonly AccessScopeEntry[] | null;
};

type Attore = {
  userId?: string | null;
  email?: string | null;
};

/**
 * Il permesso di ruolo su un evento — e la riga che il rifiuto lascia.
 *
 * E `async` perche il diniego si **scrive** prima di essere lanciato
 * (`recordPermissionDenied`). Il prezzo e un `await` su ogni chiamata, e il
 * rischio di dimenticarlo — una guardia attesa a meta non ferma niente — lo
 * presidia `tests/server/guardie-attese.test.mjs`, che rilegge questo file.
 */
const assertEventsPermission = async (
  scope: EventsScope,
  permesso:
    | "events.read"
    | "events.manage"
    | "events.convoke"
    | "events.attendance"
    | "rsvp.read",
) => {
  if (!roleHasPermission(scope.activeRole, permesso)) {
    await recordPermissionDenied({
      scope,
      permission: permesso,
      resource: "club_events",
    });
    throw negato(`il ruolo attivo non puo ${permesso}`);
  }
};

const requireActiveOrganization = (scope: EventsScope) => {
  const organizationId = asText(scope.activeOrganizationId);
  if (!organizationId) {
    throw negato("nessun club attivo selezionato");
  }
  return organizationId;
};

/* ========================================================== letture ====== */

export type ListEventsFilters = {
  kind?: EventKind | "all";
  from?: Date | string | null;
  to?: Date | string | null;
  seasonId?: string | null;
  siteId?: string | null;
  categoryId?: string | null;
  groupId?: string | null;
  status?: string | null;
  includeCancelled?: boolean;
  take?: number;
};

export type TrainerEventPerimeter = {
  /** Le categorie **dichiarate** nella scheda, nella grafia in cui stanno li. */
  categoryIds: string[];
  /**
   * Le stesse categorie, allargate a **tutte** le loro grafie dal registro del
   * club (identificativo e nome). E l'insieme su cui si giudica, e si compone
   * dal registro proprio perche il client non ci possa mettere una grafia sua
   * (PP-03 §15.1).
   */
  categoryTokens: string[];
  groupIds: string[];
};

/**
 * **Il perimetro dell'allenatore: una domanda, una funzione, un proprietario.**
 *
 * ---
 *
 * ## La contraddizione che questa funzione chiude
 *
 * Il preambolo di questo file (punto 3) prometteva il perimetro riga per riga
 * su **ogni** funzione pubblica; il commento che stava qui diceva l'opposto —
 * «il gruppo resta un filtro e non un confine» — e la seconda frase vinceva,
 * perche era quella scritta nel codice: il perimetro lo applicava
 * `listClubEvents` e nessun'altra delle nove funzioni. Un allenatore che
 * conoscesse un `eventId` fuori dal proprio perimetro poteva farci appello e
 * convocazioni, perche la chiave di ruolo `events.convoke` ce l'ha (W6-22,
 * W6-23).
 *
 * **La regola e una sola, ed e questa**: in *lettura di elenco* il perimetro e
 * un **filtro** — un calendario piu corto non e un rifiuto — ma su ogni
 * **atto** (leggere una singola riga, creare, modificare, convocare, fare
 * l'appello, cancellare) e un **confine**. La ragione non e simmetria: un atto
 * fuori perimetro e un atto su atleti che non sono suoi, e la convocazione di
 * un ragazzo di un'altra squadra non e un errore di visualizzazione.
 *
 * ## Perche vive qui e non in quattro posti
 *
 * La stessa domanda — «cosa vede questo allenatore» — aveva **quattro**
 * risposte, e due divergevano: `assertTrainerCanSeeEvent` in `rsvp.ts` leggeva
 * solo `clubs.trainers`, questa leggeva anche `clubs.staff_members`. Un club
 * su tre registra i propri allenatori come staff: quelli passavano il filtro
 * degli eventi e venivano **respinti sull'RSVP dello stesso allenamento**
 * (W6-24). Adesso `rsvp.ts` e `trainer-area.ts` chiamano questa.
 */
/**
 * **Quale scheda del club e questa utenza.**
 *
 * Cerca in `clubs.trainers` **e** in `clubs.staff_members`, perche un club su
 * tre registra i propri allenatori come staff con ruolo «allenatore»:
 * cercarli in un posto solo vuol dice che meta degli allenatori non ha
 * perimetro e vede zero eventi — un silenzio che sembra «tutto a posto».
 *
 * Esportata perche il legame utenza ↔ scheda serve anche fuori dagli eventi:
 * il perimetro degli avvisi e «i miei compensi» chiedono la stessa cosa, e la
 * chiedono a questa (W6-24, W6-32).
 */
export const findClubTrainerProfile = (
  club: { trainers?: unknown; staff_members?: unknown } | null | undefined,
  userId: string,
  email?: string | null,
): Record<string, any> | null => {
  const pool = [
    ...(Array.isArray(club?.trainers) ? (club.trainers as any[]) : []),
    ...(Array.isArray(club?.staff_members) ? (club.staff_members as any[]) : []),
  ];

  const cercata = asText(email).toLowerCase();

  return (
    pool.find((entry) => {
      const source =
        entry?.data && typeof entry.data === "object" ? entry.data : {};
      const identita = [
        /*
          `entry.id` e la terza forma di legame, e mancava: un club che scrive
          la scheda dell'allenatore usando **l'identificativo dell'utenza** come
          id del profilo non veniva riconosciuto qui, mentre `rsvp.ts` lo
          riconosceva. Due proprietari, due risposte opposte sullo stesso
          ingresso.
        */
        entry?.id,
        entry?.linkedUserId,
        entry?.linked_user_id,
        entry?.userId,
        entry?.user_id,
        source?.linkedUserId,
        source?.userId,
      ].map(asText);
      const emails = [entry?.email, entry?.linkedUserEmail, source?.email].map(
        (value) => asText(value).toLowerCase(),
      );

      return (
        identita.includes(asText(userId)) ||
        (Boolean(cercata) && emails.includes(cercata))
      );
    }) || null
  );
};

export const readTrainerEventPerimeter = async (
  organizationId: string,
  userId: string,
): Promise<TrainerEventPerimeter | null> => {
  const club = await prisma.club.findUnique({
    where: { id: organizationId },
    select: { trainers: true, staff_members: true, categories: true },
  });
  if (!club) return null;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true },
  });

  const profilo = findClubTrainerProfile(club, userId, user?.email);

  /*
    **Un allenatore senza riga in `clubs.trainers` non legge tutto il club.**

    Qui si restituiva l'insieme vuoto, e il chiamante applica il filtro solo
    `if (categorie.size || gruppi.size)`: un utente con ruolo `trainer` ma
    senza profilo JSON — un ruolo assegnato e la scheda mai compilata, che
    capita — leggeva **l'intero calendario del club**. La funzione gemella di
    `resources.ts`, sulla stessa domanda, restituisce `[]` e nega tutto: due
    proprietari e due risposte opposte sullo stesso ingresso, che e la classe
    del difetto D-3.

    `null` dice «non lo so», e il chiamante lo tratta come «nessun evento».
    Un perimetro che fallisce **chiuso** manda una segretaria a completare una
    scheda; un perimetro che fallisce aperto non manda nessuno da nessuna
    parte, perche nessuno se ne accorge.
  */
  if (!profilo) return null;

  const source =
    profilo?.data && typeof profilo.data === "object" ? profilo.data : {};
  const raccogli = (value: unknown): string[] =>
    Array.isArray(value)
      ? value
          .map((entry) =>
            entry && typeof entry === "object"
              ? asText((entry as any).id ?? (entry as any).value)
              : asText(entry),
          )
          .filter(Boolean)
      : [];

  const dichiarate = Array.from(
    new Set([...raccogli(profilo?.categories), ...raccogli(source?.categories)]),
  );

  /*
    **Le grafie di una categoria le detta il registro del club, non il client**
    (PP-03 §15.1).

    Il perimetro di un allenatore, dentro `clubs.trainers`, puo portare
    l'**identificativo** della categoria oppure il suo **nome**: sono due
    grafie della stessa cosa, e la storia di questo prodotto contiene club di
    entrambe le forme. §11.2 aveva risolto la cosa dal lato sbagliato — teneva
    per buono il `category_name` che arrivava **con la richiesta** — e da li
    passava una contraffazione: bastava dichiarare come nome l'identificativo
    di una categoria propria per scrivere sotto la categoria di un altro.

    Le grafie si risolvono qui, una volta, contro `clubs.categories`, che e il
    registro: ogni voce del perimetro si allarga a identificativo **e** nome
    della categoria che le corrisponde. Il confronto lato evento puo cosi
    restare sugli **identificativi**, cioe su cio che sta in colonna, e il
    testo libero del client non entra piu nel giudizio.

    Una voce che nel registro non c'e resta se stessa: fallisce chiuso, che e
    il verso giusto per una categoria cancellata.
  */
  const registro = Array.isArray(club.categories)
    ? (club.categories as unknown[])
    : [];
  const voci = registro
    .filter((voce): voce is Record<string, unknown> => Boolean(voce) && typeof voce === "object")
    .map((voce) => ({
      id: asText(voce.id).toLowerCase(),
      nome: asText(voce.name ?? voce.label).toLowerCase(),
    }))
    .filter((voce) => voce.id || voce.nome);

  /*
    **L'identificativo vince, e una grafia ambigua non allarga niente.**

    Il quinto round ha misurato anche il caso storto: un club che chiama una
    categoria **con l'identificativo di un'altra**. Se una grafia del genere
    entrasse nell'insieme, il perimetro di chi allena la prima si allargherebbe
    alla seconda — la contraffazione rifatta dal registro invece che dalla
    richiesta, e la difesa varrebbe meno del difetto.

    Un nome vale come grafia solo se **non e** l'identificativo di un'altra
    categoria e **non appartiene a due** categorie. Altrimenti la voce del
    perimetro resta se stessa: fallisce chiuso, che davanti a un registro
    ambiguo e l'unica risposta onesta.
  */
  const identificativi = new Set(voci.map((voce) => voce.id).filter(Boolean));
  const quanteVolte = new Map<string, number>();
  for (const voce of voci) {
    if (!voce.nome) continue;
    quanteVolte.set(voce.nome, (quanteVolte.get(voce.nome) ?? 0) + 1);
  }
  const nomeUtile = (nome: string) =>
    Boolean(nome) && !identificativi.has(nome) && quanteVolte.get(nome) === 1;

  const grafieDiCategoria = new Map<string, string[]>();
  for (const voce of voci) {
    const grafie = [voce.id, nomeUtile(voce.nome) ? voce.nome : ""].filter(Boolean);
    if (!grafie.length) continue;
    for (const chiave of grafie) grafieDiCategoria.set(chiave, grafie);
  }

  return {
    categoryIds: dichiarate,
    categoryTokens: Array.from(
      new Set(
        dichiarate.flatMap((value) => {
          const chiave = value.toLowerCase();
          return grafieDiCategoria.get(chiave) ?? [chiave];
        }),
      ),
    ),
    groupIds: Array.from(
      new Set([
        ...raccogli(profilo?.groups),
        ...raccogli(profilo?.groupIds),
        ...raccogli(source?.groups),
        ...raccogli(source?.groupIds),
      ]),
    ),
  };
};

/**
 * La forma minima di un evento su cui si giudica il perimetro.
 *
 * E la riga, oppure — nella creazione — le **colonne candidate**: il perimetro
 * si verifica su cio che si sta per scrivere, non su cio che e stato scritto,
 * altrimenti un allenatore creerebbe l'allenamento della squadra di un altro e
 * lo scoprirebbe solo chi lo legge.
 */
export type TrainerPerimeterCandidate = {
  id?: string | null;
  category_id?: string | null;
  category_name?: string | null;
  /** Tutte le categorie dell'evento, non la sola primaria (PP-01 §A). */
  category_ids?: readonly string[] | null;
  group_ids?: unknown;
};

/**
 * **Il gruppo vince sulla categoria quando l'evento lo dichiara** (ADR-0055).
 *
 * Tre casi, in quest'ordine, ed e la regola che `trainerFollowsGroup` scrive
 * gia per l'RSVP:
 *
 * 1. l'evento dichiara gruppi **e** l'allenatore ne dichiara: decide
 *    l'intersezione dei gruppi. E il caso del club multi-sede, dove il mister
 *    dei `Pulcini · Scauri` non e quello dei `Pulcini · Santi Cosma`;
 * 2. uno dei due non dichiara gruppi: si ricade sulla **categoria**, che e il
 *    comportamento precedente — un club che non ha configurato le sedi non
 *    deve perdere l'accesso da un giorno all'altro;
 * 3. niente in comune: **falso**. Un evento senza categoria e senza gruppi non
 *    e «di tutti»: e di nessuno, e un perimetro che fallisce chiuso manda una
 *    segretaria a completare una scheda, mentre uno che fallisce aperto non
 *    manda nessuno da nessuna parte.
 */
/**
 * **Leggere e cambiare non sono la stessa domanda** (PP-03 §7).
 *
 * `"lettura"` e la regola di ADR-0111: basta **una** categoria dell'evento nel
 * perimetro. E giusta per il calendario e per gli atti che riguardano le
 * proprie persone — l'appello, la convocazione — perche quelle le vaglia un
 * secondo recinto, quello sugli atleti.
 *
 * `"scrittura"` pretende che l'evento sia **tutto** suo. La differenza si vede
 * solo sull'evento **condiviso**, ed e li che serve: una revisione ostile ha
 * misurato che l'allenatore della sola B, su un allenamento congiunto A+B,
 * poteva riscriverne le categorie a `["B"]` con un `200`. Dopo quel PATCH
 * l'allenatore di A — che su quell'evento aveva gia fatto l'appello — riceveva
 * `403` su `GET /events/:id` e non lo trovava piu in nessun elenco. Lo stesso
 * valeva per `DELETE` e per l'annullamento, e nella direzione opposta: si
 * poteva **aggiungere** all'evento una categoria di cui non si e allenatori,
 * purche fra le altre ce ne fosse una propria.
 *
 * Non e un difetto di ADR-0111: e la sua regola di lettura usata come guardia
 * di scrittura. Un evento condiviso lo modifica chi lo vede **per intero** —
 * la direzione, o un allenatore di tutte le sue categorie.
 */
export type TrainerPerimeterMode = "lettura" | "scrittura";

export const eventWithinTrainerPerimeter = (
  perimetro: TrainerEventPerimeter | null,
  evento: TrainerPerimeterCandidate,
  modo: TrainerPerimeterMode = "lettura",
) => {
  if (!perimetro) return false;

  const gruppiEvento = (
    Array.isArray(evento.group_ids) ? (evento.group_ids as unknown[]) : []
  )
    .map(asText)
    .filter(Boolean);

  /*
    **In lettura il gruppo decide; in scrittura i due assi stanno in AND**
    (PP-03 §15.2).

    Qui il ramo dei gruppi **usciva**: se l'evento dichiarava gruppi e
    l'allenatore ne aveva, le categorie non venivano guardate affatto, in
    nessuno dei due modi. Misurato dal quinto round: `POST /api/v1/events`
    con `{groupIds:["grp-proprio"], categoryId:"cat-altrui"}` rispondeva 200, e
    la riga nasceva sotto la categoria di un altro.

    In **lettura** la scorciatoia resta, ed e ADR-0055: un club multi-sede
    distingue i `Pulcini · Scauri` dai `Pulcini · Santi Cosma`, e il gruppo e
    la risposta piu precisa. In **scrittura** no: e la stessa regola dei due
    assi di ADR-0103 — in AND fra loro, in OR dentro se stessi — e un atto che
    cambia l'evento deve stare dentro **entrambi** i recinti che l'evento
    dichiara.
  */
  const gruppiInPerimetro = () => {
    if (!gruppiEvento.length) return null;

    /*
      **E un perimetro senza gruppi non e un perimetro su tutti i gruppi**
      (PP-03 §17.1).

      Qui la condizione era `!gruppiEvento.length || !perimetro.groupIds.length`:
      quando **il perimetro** non dichiarava gruppi, l'asse taceva e restavano
      le sole categorie. Il sesto round l'ha misurato, ed e la stessa asimmetria
      che §15.2 aveva chiuso dall'altro lato:

          Carlo   categorie {alfa}, gruppi {}      (nessun gruppo assegnato)
          Bruno   categorie {beta}, gruppi {beta}

          POST /api/v1/events            come Carlo
            {"groupIds":["grp-beta"], "categoryId":"cat-alfa"}   -> 200

      e la riga compare nel **calendario di Bruno**, con il `created_by` di
      Carlo. Aldo, che i gruppi ce li ha, riceve 403 per lo stesso identico
      atto (C-07): la difesa valeva solo contro chi era gia recintato su
      quell'asse, cioe contro tutti tranne chi non lo era affatto.

      E Bruno non se la toglie di mezzo: in scrittura le categorie stanno in
      AND, `cat-alfa` non e sua, quindi riceve 403 su modifica e annullamento.
      Un evento che entra nel suo calendario, che lui non ha scritto e non puo
      togliere — e `assertNoOverlap` gira su quella riga, quindi ci si occupa
      anche un campo.

      **Perche «zero righe = tutto il club» non si applica qui.** Quella e la
      regola di ADR-0103 per l'`access_scope`, dove una riga assente significa
      «non ristretto». Questo perimetro non e quello: nasce da
      `clubs.trainers[].data`, cioe da cio che l'allenatore ha **assegnato**, e
      un elenco vuoto li vuol dire «nessun gruppo», non «tutti». E la stessa
      lettura che `readTrainerEventPerimeter` fa gia sull'assenza di profilo,
      dove `null` significa «nessun evento» e non «tutto il club».

      In **lettura** non cambia niente: `null` fa ricadere sulle categorie, che
      e il modo in cui un allenatore senza gruppi legge il proprio calendario
      (ADR-0055). In **scrittura** l'asse che l'evento dichiara e che il
      perimetro non copre fallisce **chiuso**.
    */
    if (!perimetro.groupIds.length) {
      return modo === "scrittura" ? false : null;
    }

    const suoi = new Set(perimetro.groupIds);
    return modo === "scrittura"
      ? gruppiEvento.every((value) => suoi.has(value))
      : gruppiEvento.some((value) => suoi.has(value));
  };

  const esitoGruppi = gruppiInPerimetro();
  if (modo === "lettura" && esitoGruppi !== null) return esitoGruppi;
  if (esitoGruppi === false) return false;

  const categorie = new Set(
    (perimetro.categoryTokens ?? perimetro.categoryIds).map((value) =>
      value.toLowerCase(),
    ),
  );

  /*
    **Tutte le categorie dell'evento, non la sola primaria** (PP-01 §A).
    L'allenatore della seconda categoria di un allenamento multi-categoria era
    fuori perimetro sul proprio stesso allenamento: lo vedeva sparire dal
    calendario e non poteva farne l'appello.
  */
  const categorieEvento = Array.isArray(evento.category_ids)
    ? (evento.category_ids as unknown[])
    : [];

  /*
    **Il nome parla solo quando l'identificativo tace** (PP-03 §15.1).

    §11 aveva messo qui un livello di «grafie»: una categoria dell'evento e
    dentro il perimetro se **una qualunque** delle sue grafie ci sta,
    identificativo o nome, perche sono la stessa cosa detta in due modi. La
    forma era giusta e la **fonte** no: `category_name` arriva con la
    richiesta, cioe e testo che sceglie chi chiama.

    Misurato dal quinto round:

        POST /api/v1/events {"categoryId":"cat-B","categoryName":"cat-A", …}
          -> 200, riga scritta con category_id = "cat-B"

    Bastava dichiarare come **nome** l'identificativo di una categoria propria
    per scrivere sotto la categoria di un altro: l'evento finiva nel calendario
    di quella squadra, con il proprio `created_by`, e `assertNoOverlap` girava
    su quella riga. E §7.1 riaperta nel verso opposto — quella impediva di
    **portarsi via** l'evento altrui, questa permetteva di **metterne dentro**
    uno.

    Adesso le grafie del **perimetro** le compone il server dal registro del
    club (`readTrainerEventPerimeter`), e il confronto lato evento sta sugli
    **identificativi**, cioe su cio che va in colonna. Il nome resta come
    ripiego per il solo caso in cui l'identificativo manchi — un evento
    storico, di quando la colonna non c'era — e in quel caso non c'e nessun
    identificativo da contraddire.
  */
  const identificativoPrimario = asText(evento.category_id).toLowerCase();
  const primaria = identificativoPrimario
    ? [identificativoPrimario]
    : [asText(evento.category_name).toLowerCase()].filter(Boolean);

  const altre = categorieEvento
    .map((value) => asText(value).toLowerCase())
    .filter(Boolean)
    .filter((value) => !primaria.includes(value));

  const categorieDellEvento: string[][] = [
    ...(primaria.length ? [primaria] : []),
    ...altre.map((value) => [value]),
  ];

  const dentro = (grafie: readonly string[]) =>
    grafie.some((value) => categorie.has(value));

  /*
    Un evento senza nessuna categoria non e «di tutti»: e di nessuno, e `every`
    su un elenco vuoto risponderebbe **vero**. Il caso 3 dell'intestazione qui
    sopra deve restare chiuso — a meno che l'evento non dichiari **l'altro**
    asse e quello sia tutto dentro: un evento di soli gruppi, propri, non e
    l'evento di nessuno.
  */
  const esitoCategorie = categorieDellEvento.length
    ? modo === "scrittura"
      ? categorieDellEvento.every(dentro)
      : categorieDellEvento.some(dentro)
    : null;

  if (esitoCategorie === null) return esitoGruppi === true;
  return esitoCategorie;
};

/**
 * Il perimetro applicato a un **atto**, e la riga che il rifiuto lascia.
 *
 * E `async` per la stessa ragione di `assertEventsPermission`: il diniego si
 * **scrive** prima di essere lanciato. Vale quindi lo stesso pericolo — una
 * guardia attesa a meta non ferma niente — e lo stesso presidio,
 * `tests/server/guardie-attese.test.mjs`.
 *
 * Accetta **piu** candidati perche la creazione in blocco ne ha molti e il
 * perimetro va letto una volta sola: la generazione di un mese di allenamenti
 * non deve rileggere il club trenta volte. Basta un candidato fuori perche
 * l'intero atto sia rifiutato — un blocco accettato a meta lascerebbe
 * l'allenatore a indovinare quali righe sono nate.
 */
/**
 * **Il perimetro di un ruolo personalizzato, sull evento.**
 *
 * Wave 6 §11.3. E l altro perimetro, e non e quello dell allenatore: quello
 * viene dal **profilo** e vale per il ruolo `trainer`; questo viene dalla
 * riga dell assegnazione e vale per chiunque porti un ruolo di club con una
 * sede o una categoria dichiarata.
 *
 * Un perimetro vuoto — che e cio che hanno tutte le tessere di oggi — non
 * restringe niente. Chi ne dichiara uno non compie **atti** fuori da li: la
 * regola e la stessa che la lane 6C1 ha scritto per l allenatore, e per la
 * stessa ragione, perche un atto fuori perimetro e un atto su persone che
 * non sono nel proprio.
 */
const assertAccessScopeOnEvent = async (
  scope: EventsScope,
  /*
    Le righe arrivano da Prisma con `site_id` e `category_id`, e i candidati
    costruiti in memoria con `siteId` e `categoryId`. Si accettano entrambe
    le grafie invece di chiedere a sette punti di chiamata di convertire: un
    punto che si dimentica di farlo passerebbe **senza** perimetro, cioe
    fallirebbe aperto.
  */
  candidati: readonly Record<string, any>[],
  permesso: string,
  modo: TrainerPerimeterMode = "lettura",
) => {
  const perimetro = normalizeAccessScopes(
    (scope as { accessScopes?: readonly AccessScopeEntry[] | null })
      .accessScopes,
  );
  if (!perimetro.length) return;

  /*
    **Un evento multi-categoria si giudica su tutte le sue categorie**
    (PP-01 §A), e basta che **una** stia nel perimetro.

    E la stessa regola con cui l'elenco lo mostra — `hasSome` — e le due devono
    coincidere: un evento che compare nel calendario e su cui poi ogni atto
    viene rifiutato e la divergenza fra cio che si vede e cio che si puo, che in
    questo repository e gia stata un difetto piu volte.

    Il perimetro sugli **atleti** resta separato e piu stretto:
    `assertAtletiDentroIlPerimetro` giudica ogni persona convocata, quindi
    ammettere l'evento non ammette le persone fuori perimetro che ci stanno
    dentro.
  */
  const dentroIlPerimetro = (candidato: Record<string, any>) => {
    const sede = candidato?.siteId ?? candidato?.site_id ?? null;
    const elencate = Array.isArray(candidato?.category_ids)
      ? (candidato.category_ids as unknown[])
      : Array.isArray(candidato?.categoryIds)
        ? (candidato.categoryIds as unknown[])
        : [];
    const categorie = [
      candidato?.categoryId ?? candidato?.category_id ?? null,
      ...elencate,
    ].filter((valore) => asText(valore));

    if (!categorie.length) {
      return accessScopeAllows(perimetro, { siteId: sede, categoryId: null });
    }

    /*
      **In scrittura vale la stessa distinzione dell'altro recinto** (PP-03 §7):
      cambiare o cancellare un evento condiviso lo toglie anche a chi lo
      condivide, quindi lo fa chi lo vede per intero. In lettura basta una
      categoria, ed e la regola con cui l'elenco lo mostra.
    */
    const dentro = (categoria: unknown) =>
      accessScopeAllows(perimetro, {
        siteId: sede,
        categoryId: asText(categoria),
      });

    return modo === "scrittura"
      ? categorie.every(dentro)
      : categorie.some(dentro);
  };

  const fuori = candidati.filter((candidato) => !dentroIlPerimetro(candidato));
  if (!fuori.length) return;

  await recordPermissionDenied({
    scope,
    permission: permesso,
    resource: "club_events",
  });

  throw new Error(
    "Accesso negato: questo evento e fuori dal perimetro assegnato al tuo ruolo",
  );
};

const assertTrainerEventPerimeter = async (
  scope: EventsScope,
  candidati: readonly TrainerPerimeterCandidate[],
  permesso: string,
  modo: TrainerPerimeterMode = "lettura",
) => {
  if (normalizeAccessRole(scope.activeRole) !== "trainer") return;

  const organizationId = requireActiveOrganization(scope);
  const userId = asText(scope.userId);

  const perimetro = userId
    ? await readTrainerEventPerimeter(organizationId, userId)
    : null;

  const fuori = candidati.filter(
    (candidato) => !eventWithinTrainerPerimeter(perimetro, candidato, modo),
  );
  if (!fuori.length) return;

  await recordPermissionDenied({
    scope,
    permission: permesso,
    resource: "club_events",
    resourceId: asText(fuori[0]?.id) || null,
    metadata: {
      motivo: perimetro
        ? modo === "scrittura"
          ? "evento condiviso con una squadra fuori dal perimetro dell'allenatore"
          : "evento fuori dal perimetro dell'allenatore"
        : "nessun profilo allenatore in questo club",
      modo,
      fuoriPerimetro: fuori.length,
    },
  });

  if (!perimetro) {
    throw negato("non risulti fra gli allenatori di questo club");
  }

  /*
    **Il messaggio dice quale delle due cose e successa.** «Non e di una tua
    categoria» su un evento che l'allenatore ha davanti nel proprio calendario
    manderebbe a cercare un difetto che non c'e: l'evento e anche suo, ed e
    proprio per questo che non puo cambiarlo da solo.
  */
  const condiviso =
    modo === "scrittura" &&
    fuori.some((candidato) =>
      eventWithinTrainerPerimeter(perimetro, candidato, "lettura"),
    );

  throw negato(
    condiviso
      ? "questo evento e condiviso con una squadra che non e tua: modificarlo o cancellarlo lo toglierebbe anche a lei, e lo puo fare chi lo vede per intero"
      : "questo evento non e di una tua categoria ne di un tuo gruppo",
  );
};

export const listClubEvents = async (
  scope: EventsScope,
  filters: ListEventsFilters = {},
) => {
  await assertEventsPermission(scope, "events.read");
  const organizationId = requireActiveOrganization(scope);

  const where: Record<string, any> = { organization_id: organizationId };

  if (filters.kind && filters.kind !== "all") {
    where.kind = normalizeEventKind(filters.kind);
  }
  if (filters.seasonId) where.season_id = asText(filters.seasonId);
  if (filters.siteId) where.site_id = asText(filters.siteId);
  /*
    **La categoria chiesta puo essere la seconda** (PP-01 §A). Un allenamento
    di tre categorie ne dichiara una primaria e le altre due nella colonna
    `category_ids`: cercare solo la primaria non lo trovava, ed era il motivo
    per cui un allenamento multi-categoria spariva dal calendario di due delle
    tre squadre convocate.

    `category_id` resta nella disgiunzione per le righe precedenti alla
    migrazione, se ce ne fosse rimasta una senza travaso.
  */
  if (filters.categoryId) {
    const chiesta = asText(filters.categoryId);
    where.AND = [
      ...((where.AND as unknown[]) ?? []),
      {
        OR: [
          { category_id: chiesta },
          { category_ids: { has: chiesta } },
        ],
      },
    ];
  }

  /*
    Wave 6 §11.3. Il perimetro dell assegnazione si somma ai filtri, non li
    sostituisce: chi ha una sede dichiarata vede meno, mai di piu. E si
    applica **dentro il `where`** e non dopo, altrimenti il conteggio
    direbbe un numero e l elenco ne mostrerebbe un altro.
  */
  const perimetroDelRuolo = normalizeAccessScopes(
    (scope as { accessScopes?: readonly AccessScopeEntry[] | null })
      .accessScopes,
  );
  if (perimetroDelRuolo.length) {
    const sedi = accessScopeValues(perimetroDelRuolo, "site");
    const categorie = accessScopeValues(perimetroDelRuolo, "category");
    if (sedi.length) where.site_id = { in: sedi };
    if (categorie.length) {
      where.AND = [
        ...((where.AND as unknown[]) ?? []),
        {
          OR: [
            { category_id: { in: categorie } },
            { category_ids: { hasSome: categorie } },
          ],
        },
      ];
    }
  }
  if (filters.status) where.status = normalizeEventStatus(filters.status);
  else if (!filters.includeCancelled) where.status = { not: "archived" };

  if (filters.from || filters.to) {
    where.starts_at = {};
    if (filters.from) where.starts_at.gte = new Date(filters.from);
    if (filters.to) where.starts_at.lte = new Date(filters.to);
  }

  let rows = await prisma.clubEvent.findMany({
    where,
    orderBy: { starts_at: "asc" },
    take: filters.take && filters.take > 0 ? Math.min(filters.take, 2000) : 2000,
  });

  if (normalizeAccessRole(scope.activeRole) === "trainer" && scope.userId) {
    const perimetro = await readTrainerEventPerimeter(
      organizationId,
      scope.userId,
    );
    /*
      **Un perimetro vuoto non e «nessun perimetro».**

      Qui l'elenco resta un **filtro** — un calendario piu corto non e un
      rifiuto — ma il filtro non si spegne mai: un allenatore senza profilo, o
      con un profilo senza categorie ne gruppi, legge zero eventi e non
      l'intero calendario del club. Il giudizio riga per riga e lo stesso che
      la guardia applica agli atti: una funzione sola, cosi il calendario che
      l'allenatore vede e l'insieme degli eventi su cui puo agire.
    */
    if (!perimetro) return [];
    rows = rows.filter((row) => eventWithinTrainerPerimeter(perimetro, row));
  }

  if (filters.groupId) {
    const wanted = asText(filters.groupId);
    rows = rows.filter((row) =>
      (Array.isArray(row.group_ids) ? (row.group_ids as string[]) : []).includes(
        wanted,
      ),
    );
  }

  return rows;
};

/**
 * Un evento, cercato **sia** per identificativo di riga sia per quello storico.
 *
 * I due convivono per tutta la transizione: una notifica scritta il mese scorso
 * cita l'identificativo dell'array JSON, e deve continuare a trovare la riga.
 */
export const findClubEvent = async (
  organizationId: string,
  idOrLegacyId: string,
  kind?: EventKind,
) => {
  const wanted = asText(idOrLegacyId);
  if (!wanted) return null;

  const uuidLike =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      wanted,
    );

  if (uuidLike) {
    const byId = await prisma.clubEvent.findFirst({
      where: {
        id: wanted,
        organization_id: organizationId,
        ...(kind ? { kind } : {}),
      },
    });
    if (byId) return byId;
  }

  return prisma.clubEvent.findFirst({
    where: {
      organization_id: organizationId,
      legacy_id: wanted,
      ...(kind ? { kind } : {}),
    },
  });
};

export const readClubEvent = async (
  scope: EventsScope,
  idOrLegacyId: string,
  kind?: EventKind,
) => {
  await assertEventsPermission(scope, "events.read");
  const organizationId = requireActiveOrganization(scope);
  const row = await findClubEvent(organizationId, idOrLegacyId, kind);
  if (!row) return null;

  assertActiveClub(scope, row.organization_id, "l'evento");
  await assertTrainerEventPerimeter(scope, [row], "events.read");
  await assertAccessScopeOnEvent(scope, [row], "events.read");
  return row;
};

/* ================================================== la proiezione ======== */

/**
 * Riallinea `clubs.trainings` o `clubs.matches` alle righe.
 *
 * **Il verso e uno solo**: dalle righe alla colonna. La colonna non torna mai
 * indietro verso le righe — quello era il difetto D-1, dove la
 * rigenerazione dell'aggregato cancellava cio che non era mai passato dalle
 * righe.
 */
const projectEventsToClubColumn = async (
  organizationId: string,
  kind: EventKind,
) => {
  const rows = await prisma.clubEvent.findMany({
    where: { organization_id: organizationId, kind, status: { not: "archived" } },
    orderBy: { starts_at: "asc" },
  });

  const aggregato = rows.map((row) => toEventLegacyShape(row));

  await prisma.club.update({
    where: { id: organizationId },
    data: { [kind === "match" ? "matches" : "trainings"]: aggregato as any },
  });
};

/** Esposta per il collaudo e per i riallineamenti una tantum. */
export const reprojectClubEvents = async (organizationId: string) => {
  await projectEventsToClubColumn(organizationId, "training");
  await projectEventsToClubColumn(organizationId, "match");
};

/* ========================================================= scritture ===== */

/**
 * **Il campo aperto a quell'ora** (W5-11).
 *
 * La disponibilita per giorno della settimana era dichiarata dalle strutture e
 * non la leggeva nessuno: si poteva fissare un allenamento delle 23:00 su un
 * campo che chiude alle 20:00, e a scoprirlo era chi ci andava.
 */
const assertFieldIsOpen = async (
  organizationId: string,
  candidate: {
    structure_id: string | null;
    field_id: string | null;
    starts_at: Date;
    ends_at: Date | null;
  },
) => {
  if (!candidate.structure_id && !candidate.field_id) return;

  const club = await prisma.club.findUnique({
    where: { id: organizationId },
    select: { structures: true },
  });
  const strutture = Array.isArray(club?.structures) ? club.structures : [];

  const struttura = (strutture as any[]).find(
    (voce) => asText(voce?.id) === asText(candidate.structure_id),
  );
  if (!struttura) return;

  const campi = Array.isArray(struttura.fields) ? struttura.fields : [];
  const campo = candidate.field_id
    ? campi.find((voce: any) => asText(voce?.id) === asText(candidate.field_id))
    : campi[0];
  if (!campo) return;

  if (
    !isWithinFieldAvailability(
      campo.availability,
      candidate.starts_at,
      candidate.ends_at,
    )
  ) {
    throw new Error(
      `Il campo «${asText(campo.name) || "selezionato"}» non e disponibile in quel giorno e a quell'ora`,
    );
  }
};

const assertNoOverlap = async (
  organizationId: string,
  candidate: {
    id?: string;
    structure_id: string | null;
    field_id: string | null;
    site_id: string | null;
    starts_at: Date;
    ends_at: Date | null;
  },
  /** `true` quando chi salva ha gia visto l'avviso e ha confermato. */
  consentito = false,
) => {
  if (!candidate.structure_id && !candidate.field_id && !candidate.site_id) {
    return [];
  }

  const giorno = new Date(candidate.starts_at);
  const inizioGiorno = new Date(giorno);
  inizioGiorno.setUTCHours(0, 0, 0, 0);
  const fineGiorno = new Date(giorno);
  fineGiorno.setUTCHours(23, 59, 59, 999);

  const altri = await prisma.clubEvent.findMany({
    where: {
      organization_id: organizationId,
      starts_at: { gte: inizioGiorno, lte: fineGiorno },
      status: { not: "cancelled" },
      ...(candidate.id ? { id: { not: candidate.id } } : {}),
    },
    select: {
      id: true,
      structure_id: true,
      field_id: true,
      site_id: true,
      starts_at: true,
      ends_at: true,
      status: true,
      title: true,
    },
  });

  const conflitti = findEventOverlaps(candidate, altri);
  if (!conflitti.length) return [];

  const nomi = conflitti
    .map((conflitto) => altri.find((row) => row.id === conflitto.id))
    .map((row) => row?.title || "un altro evento");

  /*
    **La sovrapposizione e un avviso, non un muro** (PP-01 §C).

    Il campo occupato non e un fatto che il prodotto conosce meglio della
    segreteria: due squadre su meta campo, un'ora che finisce mentre l'altra
    comincia, un allenamento congiunto. Prima l'avviso lo dava il browser, la
    persona confermava, e **la conferma non usciva dal browser**: il server
    rifiutava lo stesso, e la pagina rispondeva «Errore durante l'aggiunta
    dell'allenamento» senza nemmeno riportare il motivo.

    Adesso la conferma viaggia — `allowOverlap` — e cio che resta bloccante e
    un'altra cosa: `assertFieldIsOpen`, cioe il campo **chiuso**. Quello non e
    un giudizio di opportunita, e un orario in cui la struttura non apre.
  */
  if (!consentito) {
    throw new Error(
      `Il campo e gia occupato in quell'orario da «${nomi[0]}»`,
    );
  }

  return nomi;
};

/**
 * **Cio che una storia congela** (PP-01 §B).
 *
 * La regola sta in `src/lib/events/model.ts` — `campiCongelatiToccati` — perche
 * e dominio puro e si prova senza database. Qui c'e solo il fatto che la rende
 * applicabile: **quante righe di partecipazione** l'evento ha gia.
 *
 * Zero righe, nessun congelamento: un allenamento concluso che nessuno ha
 * segnato si modifica per intero, e correggerne l'ora e una correzione, non una
 * riscrittura della storia.
 */
/**
 * **Un evento annullato o archiviato non riceve piu atti** (PP-03 §7).
 *
 * `assertEventTransition` esisteva, e viveva **solo** in `updateClubEvent`:
 * `saveEventAttendance` e `saveEventConvocations` lo stato dell'evento non lo
 * guardavano affatto. Dopo permesso, club e perimetro, scrivevano.
 *
 * Misurato da una revisione ostile: su un allenamento con
 * `status = "cancelled"` l'appello rispondeva **200** e in archivio restava
 * `present`. La presenza e la misura di `funding/attendance-measure.ts`: si
 * poteva gonfiare la rendicontazione dei contributi pubblici su allenamenti
 * che non hanno avuto luogo, e la riga in archivio diceva «presente» su un
 * evento annullato senza che nessun controllo se ne accorgesse. La
 * convocazione, dal canto suo, faceva partire l'invito alla famiglia per un
 * allenamento gia annullato.
 *
 * `completed` resta aperto, ed e deliberato: un allenamento concluso e
 * esattamente quello di cui si fa l'appello, e correggerlo il giorno dopo e la
 * cosa normale (ADR-0112 congela i campi che hanno lasciato una traccia, non
 * la traccia).
 */
const assertEventoAperto = (
  event: { status?: string | null },
  atto: string,
) => {
  const stato = normalizeEventStatus(event?.status);
  if (stato !== "cancelled" && stato !== "archived") return;

  throw new Error(
    `Un evento ${stato === "cancelled" ? "annullato" : "archiviato"} non si tocca piu: per ${atto} va prima riaperto`,
  );
};

const assertEventoNonConsolidato = (
  esistente: Record<string, any>,
  prossimo: Record<string, any>,
  partecipanti: number,
) => {
  if (partecipanti <= 0) return;

  /*
    **Annullare non e modificare.** Un evento con una storia si annulla e non si
    cancella (ADR-0098): se il congelamento valesse anche qui, l'unica strada
    che quella regola lascia aperta sarebbe chiusa da questa. Lo stesso vale al
    contrario, per riportarlo in programma.
  */
  if (prossimo?.status !== esistente?.status) return;

  const toccati = campiCongelatiToccati(esistente, prossimo);
  if (!toccati.length) return;

  throw new Error(
    `Questo evento ha gia una storia — ${partecipanti} fra convocazioni, ` +
      "presenze e risposte delle famiglie — e non si puo piu cambiarne " +
      `${toccati.join(", ")}. Titolo, note e allenatori restano modificabili; ` +
      "per spostarlo davvero, annullalo e creane uno nuovo.",
  );
};

/**
 * **La grafia che finisce in colonna la detta il registro** (PP-03 §17.2).
 *
 * §15.1 ha tolto il `category_name` del client dal **giudizio** di perimetro:
 * il confronto sta sugli identificativi, e il nome parla solo quando
 * l'identificativo tace. Restava che quel testo, pur non decidendo piu niente,
 * andava **in colonna** come arrivava. Misurato dal sesto round:
 *
 *     PATCH /api/v1/events/<proprio>  {"categoryId":"", "categoryName":"Under 15"}
 *       -> 200, e la riga resta category_id = "cat-alfa" con
 *          category_name = "Under 15", che e il nome della squadra di un altro
 *
 * Nessun perimetro attraversato — l'evento non entra nel calendario di
 * nessun altro, e la sonda lo misura — ma la riga adesso **mente**: ogni
 * schermata che stampa il nome invece dell'identificativo mostra l'evento come
 * se fosse dell'altra squadra, e le due colonne della stessa riga si
 * contraddicono. E la forma del difetto di causale gia chiusa altrove: due
 * campi che dicono la stessa cosa, e solo uno dei due controllato.
 *
 * Quando l'identificativo c'e ed e nel registro, il nome si **deriva**. Un
 * identificativo che il registro non conosce — una categoria cancellata, un
 * club che non ha mai riempito `clubs.categories` — lascia passare il nome
 * dichiarato: togliere l'etichetta a un evento storico sarebbe una perdita di
 * dato, non una difesa.
 */
const riconciliaGrafiaDellaCategoria = async <T extends { category_id?: string | null; category_name?: string | null }>(
  organizationId: string,
  colonne: T,
): Promise<T> => {
  const identificativo = asText(colonne.category_id);
  if (!identificativo) return colonne;

  const club = await prisma.club.findUnique({
    where: { id: organizationId },
    select: { categories: true },
  });
  const registro = Array.isArray(club?.categories)
    ? (club.categories as unknown[])
    : [];

  const voce = registro
    .filter((riga): riga is Record<string, unknown> => Boolean(riga) && typeof riga === "object")
    .find((riga) => asText(riga.id).toLowerCase() === identificativo.toLowerCase());
  if (!voce) return colonne;

  const nome = asText(voce.name ?? voce.label);
  if (!nome || nome === asText(colonne.category_name)) return colonne;

  return { ...colonne, category_name: nome };
};

export const createClubEvent = async (
  scope: EventsScope,
  kind: EventKind,
  input: unknown,
  attore: Attore = {},
  options: { allowOverlap?: boolean } = {},
) => {
  await assertEventsPermission(scope, "events.manage");
  const organizationId = requireActiveOrganization(scope);
  const colonne = toEventColumns(normalizeEventKind(kind), input);
  const consenteSovrapposizione = Boolean(
    options.allowOverlap ??
      (input && typeof input === "object"
        ? (input as any).allowOverlap
        : false),
  );

  /*
    Il caso legittimo resta legittimo: l'allenatore che crea l'allenamento del
    **proprio** gruppo passa di qui senza accorgersene. Cio che non passa piu e
    l'allenamento creato per la squadra di un altro — che nessuna delle nove
    funzioni fermava, e che `listClubEvents` avrebbe poi nascosto a chi l'ha
    creato, lasciandolo visibile a tutti gli altri.
  */
  await assertTrainerEventPerimeter(scope, [colonne], "events.manage", "scrittura");
  await assertAccessScopeOnEvent(scope, [colonne], "events.manage", "scrittura");

  await assertFieldIsOpen(organizationId, {
    structure_id: colonne.structure_id,
    field_id: colonne.field_id,
    starts_at: colonne.starts_at,
    ends_at: colonne.ends_at,
  });

  const sovrapposti = await assertNoOverlap(
    organizationId,
    {
      structure_id: colonne.structure_id,
      field_id: colonne.field_id,
      site_id: colonne.site_id,
      starts_at: colonne.starts_at,
      ends_at: colonne.ends_at,
    },
    consenteSovrapposizione,
  );

  /* La grafia in colonna la detta il registro, non la richiesta (§17.2). */
  const daScrivere = await riconciliaGrafiaDellaCategoria(organizationId, colonne);

  const row = await prisma.clubEvent.create({
    data: {
      organization_id: organizationId,
      ...daScrivere,
      group_ids: daScrivere.group_ids ?? undefined,
      trainer_ids: daScrivere.trainer_ids ?? undefined,
      payload: daScrivere.payload as any,
      created_by: attore.userId || null,
    },
  });

  await projectEventsToClubColumn(organizationId, row.kind as EventKind);

  await recordAuditEvent({
    action: AUDIT_ACTIONS.eventCreated,
    actorUserId: attore.userId || null,
    actorEmail: attore.email || null,
    actorRole: scope.activeRole || null,
    organizationId,
    resource: "club_events",
    resourceId: row.id,
    metadata: {
      kind: row.kind,
      startsAt: row.starts_at.toISOString(),
      /*
        **Uno scavalcamento lascia una traccia** (ADR-0113). La sovrapposizione
        e diventata un avviso, e un avviso che si puo scavalcare senza che
        rimanga scritto chi lo ha fatto e quando non e un avviso: e un controllo
        spento. Il campo compare **solo** quando qualcuno ha davvero
        scavalcato, cosi cercarlo nel registro trova esattamente quei casi.
      */
      ...(sovrapposti.length
        ? { sovrapposizioneConfermata: sovrapposti }
        : {}),
    },
  });

  return row;
};

/**
 * La modifica, con **controllo ottimistico**.
 *
 * Due segretarie che salvano insieme non si sovrascrivono piu: la seconda
 * fallisce invece di vincere. Prima l'operazione era «leggi l'array intero,
 * modificalo, riscrivilo», e la seconda scrittura faceva sparire la prima
 * senza un errore.
 */
export const updateClubEvent = async (
  scope: EventsScope,
  idOrLegacyId: string,
  input: unknown,
  attore: Attore = {},
  options: { expectedVersion?: number | null; allowOverlap?: boolean } = {},
) => {
  await assertEventsPermission(scope, "events.manage");
  const organizationId = requireActiveOrganization(scope);

  const existing = await findClubEvent(organizationId, idOrLegacyId);
  if (!existing) throw new Error("Evento non trovato");
  assertActiveClub(scope, existing.organization_id, "l'evento");

  const source = input && typeof input === "object" ? (input as any) : {};
  const consenteSovrapposizione = Boolean(
    options.allowOverlap ?? source.allowOverlap ?? false,
  );

  /*
    **La modifica parte dalla riga, non dal payload archiviato** (PP-01 §B).

    Il payload e l'archivio del dato **di partenza** (ADR-0098), non lo stato
    corrente. Ripartire da li e riderivarne le colonne significava riscrivere
    con un dato vecchio tutto cio che nel frattempo aveva cambiato **colonna** e
    non payload — e sono i fatti piu importanti dell'evento:

    - `saveEventConvocations` chiude la convocazione scrivendo `convocation_status`
      e non tocca il payload: modificare il titolo di una gara **riapriva** le
      convocazioni, senza un errore e senza che nessuno lo chiedesse;
    - lo stato `completed` vive anch'esso solo in colonna: modificare un
      allenamento concluso lo riportava «in programma»;
    - dalla migrazione di PP-01 §A anche le categorie oltre la primaria vivono
      in colonna.

    `toEventLegacyShape` e gia la traduzione fedele della riga nella forma che
    `toEventColumns` sa leggere — e conserva le chiavi del payload che nessuna
    colonna copre. Percio la base della fusione e quella, e la richiesta ci
    scrive sopra **solo cio che nomina**: che e cio che una PATCH significa.
  */
  const merged = {
    ...toEventLegacyShape(existing),
    id: existing.legacy_id ?? existing.id,
    ...source,
  };

  const colonne = toEventColumns(existing.kind as EventKind, merged);
  assertEventTransition(existing.status, colonne.status);

  const partecipanti = await prisma.clubEventParticipant.count({
    where: { organization_id: organizationId, event_id: existing.id },
  });
  assertEventoNonConsolidato(existing, colonne, partecipanti);

  /*
    **Si giudicano tutte e due le forme**: la riga com'e e la riga come
    diventerebbe. Controllare solo la prima lascerebbe spostare un proprio
    allenamento nel gruppo di un altro; controllare solo la seconda lascerebbe
    prendere l'allenamento di un altro e portarselo nel proprio.
  */
  await assertTrainerEventPerimeter(
    scope,
    [existing, colonne],
    "events.manage",
    "scrittura",
  );
  /*
    Stesso doppio giudizio per il perimetro del ruolo: la riga com e e la riga
    come diventerebbe. Era l unico atto che il presidio ha trovato scoperto,
    perche la chiamata sta su piu righe e la sostituzione meccanica non la
    vedeva — che e esattamente il tipo di buco per cui il presidio esiste.
  */
  await assertAccessScopeOnEvent(
    scope,
    [existing, colonne],
    "events.manage",
    "scrittura",
  );

  await assertFieldIsOpen(organizationId, {
    structure_id: colonne.structure_id,
    field_id: colonne.field_id,
    starts_at: colonne.starts_at,
    ends_at: colonne.ends_at,
  });

  const sovrapposti = await assertNoOverlap(
    organizationId,
    {
      id: existing.id,
      structure_id: colonne.structure_id,
      field_id: colonne.field_id,
      site_id: colonne.site_id,
      starts_at: colonne.starts_at,
      ends_at: colonne.ends_at,
    },
    consenteSovrapposizione,
  );

  const attesa =
    options.expectedVersion === undefined || options.expectedVersion === null
      ? existing.version
      : Number(options.expectedVersion);

  /* La grafia in colonna la detta il registro, non la richiesta (§17.2). */
  const daScrivere = await riconciliaGrafiaDellaCategoria(organizationId, colonne);

  const aggiornati = await prisma.clubEvent.updateMany({
    where: { id: existing.id, version: attesa },
    data: {
      ...daScrivere,
      legacy_id: existing.legacy_id,
      group_ids: daScrivere.group_ids ?? undefined,
      trainer_ids: daScrivere.trainer_ids ?? undefined,
      payload: daScrivere.payload as any,
      version: { increment: 1 },
    },
  });

  if (aggiornati.count === 0) {
    throw new Error(
      "L'evento e stato modificato da qualcun altro: ricarica la pagina e riprova",
    );
  }

  await projectEventsToClubColumn(organizationId, existing.kind as EventKind);

  await recordAuditEvent({
    action:
      colonne.status === "cancelled" && existing.status !== "cancelled"
        ? AUDIT_ACTIONS.eventCancelled
        : AUDIT_ACTIONS.eventUpdated,
    actorUserId: attore.userId || null,
    actorEmail: attore.email || null,
    actorRole: scope.activeRole || null,
    organizationId,
    resource: "club_events",
    resourceId: existing.id,
    metadata: {
      kind: existing.kind,
      statusFrom: existing.status,
      statusTo: colonne.status,
      /* Uno scavalcamento lascia una traccia anche in modifica (ADR-0113). */
      ...(sovrapposti.length
        ? { sovrapposizioneConfermata: sovrapposti }
        : {}),
    },
  });

  return prisma.clubEvent.findUnique({ where: { id: existing.id } });
};

/* ====================================================== convocazioni ===== */

export type ConvocationInput = {
  athleteId: string;
  status?: unknown;
  isExtraCategory?: boolean;
};

/**
 * La convocazione come **fatto**, non come chiave di dizionario.
 *
 * Prima viveva dentro il payload della gara in dieci grafie diverse, e a un
 * campo di dizionario non si puo dare un permesso, una notifica ne un audit.
 * Adesso e una colonna su una riga che dice chi, quando e per quale evento.
 *
 * **Non tocca ne la presenza ne la risposta della famiglia**: sono tre colonne
 * dello stesso fatto con tre scrittori distinti (ADR-0086, esteso da
 * ADR-0099). Una promessa non diventa mai una presenza.
 */
/**
 * **Il perimetro va guardato anche sulle persone, non solo sull'evento.**
 *
 * `assertAccessScopeOnEvent` confronta il perimetro con la sede e la
 * categoria **dell'evento**. Gli atleti che l'evento nomina non venivano
 * confrontati con niente.
 *
 * Misurato: un operatore recintato sulla sede Nord crea un evento nella
 * **propria** sede — che passa — e ci convoca un minore della sede Sud, poi
 * ne segna la presenza. Convocare scrive su quel minore e fa partire l'invito
 * alla sua famiglia; la presenza e il dato su cui si rendicontano i
 * contributi pubblici.
 *
 * E la stessa regola gia scritta per le appartenenze —
 * `assertMembershipWithinAccessScope`, «il perimetro non si allarga da
 * dentro» — mancante sul lato atleta della convocazione.
 */
/**
 * **Un atleta di questo club, e nessun altro.**
 *
 * E la guardia grossolana che mancava, e mancava per intero: le due porte che
 * scrivono `club_event_participants` verificavano **l'evento** — che
 * appartenesse al club attivo, che stesse nel perimetro dell'allenatore, che
 * il ruolo avesse il permesso — e non verificavano **gli atleti**.
 *
 * L'unica guardia sul lato atleta, `assertAtletiDentroIlPerimetro` qui sotto,
 * esce alla prima riga quando il ruolo attivo non dichiara un perimetro di
 * sede o categoria. Un `trainer` ordinario, un `owner`, la segreteria: nessuno
 * di loro ha righe di perimetro, quindi per **tutti** loro non veniva eseguito
 * nessun controllo sull'atleta. E `club_event_participants.athlete_id` non e
 * nemmeno una chiave esterna: e una colonna di testo libero.
 *
 * Misurato dalle porte vere, con un allenatore ordinario del club A:
 * convocare l'atleta del club B **riusciva**, e la riga entrava in archivio;
 * lo stesso per la presenza; e un identificativo che non nominava nessun
 * atleta entrava allo stesso modo.
 *
 * Non e un errore di visualizzazione, e una **scrittura cross-tenant**.
 * Convocare fa partire l'invito alla famiglia di quel minore; la presenza e il
 * dato su cui `funding.ts` rendiconta i contributi pubblici.
 *
 * **Rifiuta l'elenco intero, non filtra.** Una guardia che scartasse gli
 * estranei e scrivesse il resto direbbe «riuscito» a chi ha chiesto una cosa
 * diversa da quella che e stata fatta: e la stessa forma del 200 muto chiuso
 * altrove. Se un nome e fuori, non entra nessuno.
 *
 * **Che cosa NON e questa guardia.** Non e il perimetro di categoria: un
 * atleta del club convocato fuori dalla propria categoria e lecito, e
 * `isExtraCategory` esiste per dichiararlo. Non e lo stato del tesseramento:
 * un atleta non attivo resta un atleta di questo club. Qui si chiede una cosa
 * sola, ed e la piu grossa: **e di questo club?**
 */
const assertAtletiDelClub = async (
  scope: EventsScope,
  organizationId: string,
  athleteIds: readonly string[],
  permesso: string,
) => {
  const richiesti = Array.from(
    new Set(athleteIds.map((id) => asText(id)).filter(Boolean)),
  );
  if (!richiesti.length) return;

  const esistenti = await prisma.athlete.findMany({
    where: { organization_id: organizationId, id: { in: richiesti } },
    select: { id: true },
  });
  const ammessi = new Set(esistenti.map((riga) => riga.id));
  const fuori = richiesti.filter((id) => !ammessi.has(id));
  if (!fuori.length) return;

  await recordPermissionDenied({
    scope: {
      userId: scope.userId,
      activeRole: scope.activeRole,
      activeOrganizationId: organizationId,
    },
    permission: permesso,
    resource: "club_event_participants",
    resourceId: fuori[0],
    /*
      Si registra **quanti**, non quali: l'identificativo di un atleta di un
      altro club non e un dato di questo club, e l'audit di questo club non e
      il posto dove scriverlo. Il primo resta come riferimento dell'atto.
    */
    metadata: { fuori_dal_club: fuori.length },
  });

  throw new Error(
    "Accesso negato: uno degli atleti indicati non appartiene a questo club",
  );
};

const assertAtletiDentroIlPerimetro = async (
  scope: EventsScope,
  organizationId: string,
  athleteIds: readonly string[],
  permesso: string,
) => {
  const richiesti = Array.from(
    new Set(athleteIds.map((id) => asText(id)).filter(Boolean)),
  );
  if (!richiesti.length) return;

  const fuori: string[] = [];

  /*
    **Primo recinto: sede e categoria** (`club_access_scopes`). Vale per
    chiunque lo abbia, allenatore compreso.
  */
  if (buildAthleteAccessScopeConditions(scope)) {
    const ammessi = new Set(
      await athleteIdsWithinAccessScope(organizationId, scope),
    );
    fuori.push(...richiesti.filter((id) => !ammessi.has(id)));
  }

  /*
    **Secondo recinto: la scheda dell'allenatore.** Un allenatore ordinario non
    ha nessuna riga in `club_access_scopes`, quindi il primo recinto non lo
    tocca: guardare solo quello equivaleva a non recintarlo affatto. Il suo
    perimetro vive nelle categorie e nei gruppi della sua scheda, e la risposta
    la da `resources.ts`, che e lo stesso posto da cui esce il suo elenco
    atleti — non una seconda copia della regola.

    I due recinti si sommano: chi ha entrambi deve stare dentro entrambi.
  */
  const dentroLaScheda = await athleteIdsWithinTrainerPerimeter(
    organizationId,
    richiesti,
    scope as any,
  );
  if (dentroLaScheda) {
    const ammessi = new Set(dentroLaScheda);
    fuori.push(...richiesti.filter((id) => !ammessi.has(id)));
  }

  if (!fuori.length) return;

  await recordPermissionDenied({
    scope: {
      userId: scope.userId,
      activeRole: scope.activeRole,
      activeOrganizationId: organizationId,
    },
    permission: permesso,
    resource: "club_event_participants",
    resourceId: fuori[0],
    metadata: { fuori_dal_perimetro: fuori.length },
  });

  throw new Error(
    "Accesso negato: uno degli atleti indicati e fuori dal perimetro di sede o categoria del ruolo attivo",
  );
};

export const saveEventConvocations = async (
  scope: EventsScope,
  idOrLegacyId: string,
  entries: readonly ConvocationInput[],
  attore: Attore = {},
) => {
  await assertEventsPermission(scope, "events.convoke");
  const organizationId = requireActiveOrganization(scope);

  const event = await findClubEvent(organizationId, idOrLegacyId);
  if (!event) throw new Error("Evento non trovato");
  assertActiveClub(scope, event.organization_id, "l'evento");
  await assertTrainerEventPerimeter(scope, [event], "events.convoke");
  await assertAccessScopeOnEvent(scope, [event], "events.convoke");
  assertEventoAperto(event, "convocare");

  const normalizzate = entries
    .map((entry) => ({
      athleteId: asText(entry.athleteId),
      status: normalizeConvocationStatus(entry.status ?? "convocated"),
      isExtraCategory: Boolean(entry.isExtraCategory),
    }))
    .filter((entry) => entry.athleteId && entry.status);

  await assertAtletiDelClub(
    scope,
    organizationId,
    normalizzate.map((entry) => entry.athleteId),
    "events.convoke",
  );

  await assertAtletiDentroIlPerimetro(
    scope,
    organizationId,
    normalizzate.map((entry) => entry.athleteId),
    "events.convoke",
  );

  const convocati = normalizzate.filter(
    (entry) => entry.status === "convocated",
  );
  assertEventHasRoom(event.capacity, 0, convocati.length);

  /*
    **La ripulitura non puo uscire dal perimetro di chi la esegue.**

    `assertAtletiDentroIlPerimetro` guarda cio che l'elenco **nomina**. La
    ripulitura qui sotto agisce invece su cio che l'elenco **non** nomina, e
    quindi non passava da nessun vaglio. Su un allenamento congiunto A+B
    l'allenatore della sola B mandava un elenco **vuoto** — che non nomina
    nessuno, supera il vaglio senza toccarlo, e in SQL `notIn: []` non esclude
    niente — e la ripulitura cancellava la convocazione dei minori della
    categoria A. Una scrittura distruttiva su persone fuori perimetro, senza
    nemmeno bisogno di conoscerne l'identificativo.

    Si limita percio la ripulitura alle persone che chi agisce potrebbe
    convocare. Chi non ha recinto (`null`) continua a ripulire tutto l'evento,
    che e cio che la segreteria deve poter fare.
  */
  const partecipantiEsistenti = await prisma.clubEventParticipant.findMany({
    where: { organization_id: organizationId, event_id: event.id },
    select: { athlete_id: true },
  });
  const ripulibili = await insiemeAmmessoPerPerimetro(
    scope,
    organizationId,
    partecipantiEsistenti.map((riga) => asText(riga.athlete_id)),
  );

  const now = new Date();

  await prisma.$transaction(async (tx) => {
    /*
      Chi non compare piu nell'elenco torna **indeciso**, non «escluso»:
      togliere un nome da una lista non e la stessa cosa che dire a un ragazzo
      che non gioca, e lo stato deve saper distinguere le due cose.
    */
    await tx.clubEventParticipant.updateMany({
      where: {
        organization_id: organizationId,
        event_id: event.id,
        athlete_id: {
          notIn: normalizzate.map((entry) => entry.athleteId),
          ...(ripulibili ? { in: [...ripulibili] } : {}),
        },
      },
      data: { convocation_status: null, convocated_at: null, convocated_by: null },
    });

    for (const entry of normalizzate) {
      await tx.clubEventParticipant.upsert({
        where: {
          organization_id_event_id_athlete_id: {
            organization_id: organizationId,
            event_id: event.id,
            athlete_id: entry.athleteId,
          },
        },
        update: {
          convocation_status: entry.status,
          convocated_at: now,
          convocated_by: attore.userId || null,
          is_extra_category: entry.isExtraCategory,
        },
        create: {
          organization_id: organizationId,
          event_id: event.id,
          athlete_id: entry.athleteId,
          legacy_training_id: event.legacy_id,
          status: "pending",
          convocation_status: entry.status,
          convocated_at: now,
          convocated_by: attore.userId || null,
          is_extra_category: entry.isExtraCategory,
        },
      });
    }

    await tx.clubEvent.update({
      where: { id: event.id },
      data: { convocation_status: "completed", version: { increment: 1 } },
    });
  });

  await projectEventsToClubColumn(organizationId, event.kind as EventKind);

  await recordAuditEvent({
    action: AUDIT_ACTIONS.eventConvocationsSaved,
    actorUserId: attore.userId || null,
    actorEmail: attore.email || null,
    actorRole: scope.activeRole || null,
    organizationId,
    resource: "club_event_participants",
    resourceId: event.id,
    metadata: { convocati: convocati.length, totale: normalizzate.length },
  });

  return prisma.clubEventParticipant.findMany({
    where: { organization_id: organizationId, event_id: event.id },
    orderBy: { athlete_id: "asc" },
  });
};

/* ========================================================== presenze ===== */

export type AttendanceInput = {
  athleteId: string;
  status: string;
  notes?: string | null;
};

/**
 * L'appello.
 *
 * **Una sola scrittura, in un solo posto.** Prima
 * `saveTrainingAttendance` scriveva lo stesso fatto in tre posti — la tabella,
 * `clubs.trainings[].attendance` e `club_resource_items.payload.attendance` —
 * e le due schermate dell'allenatore rileggevano la **copia JSON** mentre la
 * rendicontazione dei contributi pubblici leggeva la **tabella**. Erano due
 * verita sullo stesso appello, e nessuno poteva accorgersene guardandone una.
 *
 * Non tocca ne la convocazione ne la risposta della famiglia.
 */
export const saveEventAttendance = async (
  scope: EventsScope,
  idOrLegacyId: string,
  entries: readonly AttendanceInput[],
  attore: Attore = {},
) => {
  await assertEventsPermission(scope, "events.attendance");
  const organizationId = requireActiveOrganization(scope);

  const event = await findClubEvent(organizationId, idOrLegacyId);
  if (!event) throw new Error("Evento non trovato");
  assertActiveClub(scope, event.organization_id, "l'evento");
  await assertTrainerEventPerimeter(scope, [event], "events.attendance");
  await assertAccessScopeOnEvent(scope, [event], "events.attendance");
  assertEventoAperto(event, "registrare le presenze");

  const normalizzate = entries
    .map((entry) => {
      const athleteId = asText(entry.athleteId);
      /*
        **Lo stato passa da un vocabolario, come la convocazione** (PP-03 §7).
        Prima era `asText(entry.status).toLowerCase() || "pending"`: qualunque
        testo. Un appello scritto in una grafia che
        `funding/attendance-measure.ts` non riconosce si salvava senza errore e
        **non contava** per i contributi pubblici.
      */
      const status = normalizeAttendanceStatus(entry.status);
      if (status === null) {
        throw new Error(
          `Stato di presenza non ammesso: «${asText(entry.status)}». Sono ammessi ${ATTENDANCE_STATUSES.join(", ")}`,
        );
      }
      return {
        athleteId,
        status,
        notes: asText(entry.notes) || null,
      };
    })
    .filter((entry) => entry.athleteId);

  await assertAtletiDelClub(
    scope,
    organizationId,
    normalizzate.map((entry) => entry.athleteId),
    "events.attendance",
  );

  await assertAtletiDentroIlPerimetro(
    scope,
    organizationId,
    normalizzate.map((entry) => entry.athleteId),
    "events.attendance",
  );

  await prisma.$transaction(async (tx) => {
    for (const entry of normalizzate) {
      await tx.clubEventParticipant.upsert({
        where: {
          organization_id_event_id_athlete_id: {
            organization_id: organizationId,
            event_id: event.id,
            athlete_id: entry.athleteId,
          },
        },
        update: { status: entry.status, notes: entry.notes },
        create: {
          organization_id: organizationId,
          event_id: event.id,
          athlete_id: entry.athleteId,
          legacy_training_id: event.legacy_id,
          status: entry.status,
          notes: entry.notes,
        },
      });
    }
  });

  await recordAuditEvent({
    action: AUDIT_ACTIONS.eventAttendanceRecorded,
    actorUserId: attore.userId || null,
    actorEmail: attore.email || null,
    actorRole: scope.activeRole || null,
    organizationId,
    resource: "club_event_participants",
    resourceId: event.id,
    metadata: { registrate: normalizzate.length },
  });

  return prisma.clubEventParticipant.findMany({
    where: { organization_id: organizationId, event_id: event.id },
    orderBy: { athlete_id: "asc" },
  });
};

/**
 * **Ammettere l'evento non ammette le persone dell'evento.**
 *
 * ADR-0111 fa passare un evento se **almeno una** delle sue categorie sta nel
 * perimetro di chi guarda, e la scelta e giusta: un evento che compare nel
 * calendario e su cui poi ogni atto viene rifiutato e la divergenza fra cio
 * che si vede e cio che si puo. Ma da quella scelta discende un caso che qui
 * non era coperto: su un allenamento **congiunto** A+B l'allenatore della sola
 * B e legittimamente ammesso all'evento, e riceveva l'elenco completo dei
 * partecipanti — cioe i minori della categoria A, che il suo stesso elenco
 * atleti non gli mostra.
 *
 * Il commento di `assertAccessScopeOnEvent` lo diceva gia — l'ammissione
 * dell'evento «non ammette le persone fuori dal perimetro» — ma solo le due
 * scritture lo applicavano. La lettura no, ed e la lettura che porta via il
 * dato.
 *
 * Le righe fuori perimetro si **tolgono**, non si rifiuta la chiamata:
 * rifiutare renderebbe illeggibile un evento che chi guarda ha tutto il
 * diritto di vedere, ed e la stessa scelta che `listClubEvents` fa gia con il
 * perimetro dell'allenatore — li un filtro, qui un filtro.
 */
export const listEventParticipants = async (
  scope: EventsScope,
  idOrLegacyId: string,
) => {
  await assertEventsPermission(scope, "events.read");
  const organizationId = requireActiveOrganization(scope);

  const event = await findClubEvent(organizationId, idOrLegacyId);
  if (!event) return [];
  assertActiveClub(scope, event.organization_id, "l'evento");
  await assertTrainerEventPerimeter(scope, [event], "events.read");
  await assertAccessScopeOnEvent(scope, [event], "events.read");

  const righe = await prisma.clubEventParticipant.findMany({
    where: { organization_id: organizationId, event_id: event.id },
    orderBy: { athlete_id: "asc" },
  });

  return filtraPartecipantiPerPerimetro(scope, organizationId, righe);
};

/**
 * Toglie dalle righe di partecipazione le persone fuori dal perimetro di chi
 * legge. I due recinti sono gli stessi di `assertAtletiDentroIlPerimetro`, e
 * per la stessa ragione: se una scrittura su quell'atleta viene rifiutata,
 * leggerne il nome nell'elenco non e un permesso in piu, e una perdita.
 */
const filtraPartecipantiPerPerimetro = async <T extends { athlete_id: string | null }>(
  scope: EventsScope,
  organizationId: string,
  righe: readonly T[],
): Promise<T[]> => {
  if (!righe.length) return [...righe];

  const identificativi = righe
    .map((riga) => asText(riga.athlete_id))
    .filter(Boolean);

  const ammessi = await insiemeAmmessoPerPerimetro(
    scope,
    organizationId,
    identificativi,
  );
  if (!ammessi) return [...righe];

  return righe.filter((riga) => ammessi.has(asText(riga.athlete_id)));
};

/**
 * Gli identificativi, fra quelli dati, che chi agisce puo toccare.
 *
 * `null` significa **nessun recinto**: chi legge non deve confonderlo con
 * «recinto vuoto», che e l'errore da cui nasceva il difetto originale.
 * I due recinti — sede/categoria e scheda dell'allenatore — si intersecano:
 * chi ne ha due deve stare dentro entrambi.
 */
const insiemeAmmessoPerPerimetro = async (
  scope: EventsScope,
  organizationId: string,
  athleteIds: readonly string[],
): Promise<Set<string> | null> => {
  const identificativi = Array.from(new Set(athleteIds.filter(Boolean)));
  if (!identificativi.length) return null;

  let ammessi: Set<string> | null = null;

  if (buildAthleteAccessScopeConditions(scope)) {
    ammessi = new Set(await athleteIdsWithinAccessScope(organizationId, scope));
  }

  const dentroLaScheda = await athleteIdsWithinTrainerPerimeter(
    organizationId,
    identificativi,
    scope as any,
  );
  if (dentroLaScheda) {
    const insieme = new Set(dentroLaScheda);
    ammessi = ammessi
      ? new Set([...ammessi].filter((id) => insieme.has(id)))
      : insieme;
  }

  return ammessi;
};

/**
 * **Cancellare un evento: solo se non ha una storia.**
 *
 * Un evento a cui qualcuno ha risposto, su cui e stato fatto l'appello o per
 * cui e stata salvata una convocazione **non si cancella**: si annulla, e la
 * storia resta leggibile. E la stessa regola con cui la Wave 4 ha difeso le
 * rate con storia economica — la distinzione non e fra i ruoli, e fra cio che
 * ha lasciato una traccia e cio che non ne ha lasciata.
 *
 * Serve alla rigenerazione del programma settimanale, che ripulisce cio che ha
 * generato e non ancora avuto luogo.
 */
export const deleteClubEvent = async (
  scope: EventsScope,
  idOrLegacyId: string,
  attore: Attore = {},
) => {
  await assertEventsPermission(scope, "events.manage");
  const organizationId = requireActiveOrganization(scope);

  const event = await findClubEvent(organizationId, idOrLegacyId);
  if (!event) throw new Error("Evento non trovato");
  assertActiveClub(scope, event.organization_id, "l'evento");
  await assertTrainerEventPerimeter(scope, [event], "events.manage", "scrittura");
  await assertAccessScopeOnEvent(scope, [event], "events.manage", "scrittura");

  const partecipanti = await prisma.clubEventParticipant.count({
    where: { organization_id: organizationId, event_id: event.id },
  });

  if (partecipanti > 0) {
    throw new Error(
      "Questo evento ha gia una storia — presenze, convocazioni o risposte delle famiglie: si annulla, non si cancella",
    );
  }

  await prisma.clubEvent.delete({ where: { id: event.id } });
  await projectEventsToClubColumn(organizationId, event.kind as EventKind);

  await recordAuditEvent({
    action: AUDIT_ACTIONS.eventCancelled,
    actorUserId: attore.userId || null,
    actorEmail: attore.email || null,
    actorRole: scope.activeRole || null,
    organizationId,
    resource: "club_events",
    resourceId: event.id,
    metadata: { kind: event.kind, cancellato: true },
  });

  return { id: event.id };
};

/**
 * La creazione in blocco, per la generazione dal programma settimanale.
 *
 * Una sola proiezione alla fine invece di una per evento: generare un mese di
 * allenamenti riscriveva la colonna del club trenta volte, ed era la ragione
 * per cui la generazione impiegava secondi.
 */
export const createClubEventsBatch = async (
  scope: EventsScope,
  kind: EventKind,
  inputs: readonly unknown[],
  attore: Attore = {},
) => {
  await assertEventsPermission(scope, "events.manage");
  const organizationId = requireActiveOrganization(scope);

  const righe = [] as any[];
  for (const input of inputs) {
    const colonne = toEventColumns(normalizeEventKind(kind), input);
    righe.push({
      organization_id: organizationId,
      ...colonne,
      group_ids: colonne.group_ids ?? undefined,
      trainer_ids: colonne.trainer_ids ?? undefined,
      payload: colonne.payload as any,
      created_by: attore.userId || null,
    });
  }

  if (!righe.length) return [];

  /*
    Il perimetro si legge **una volta** per l'intero blocco: e la ragione per
    cui la guardia accetta un elenco invece di un candidato solo. Generare un
    mese di allenamenti non deve rileggere trenta volte la scheda
    dell'allenatore.
  */
  await assertTrainerEventPerimeter(scope, righe, "events.manage", "scrittura");
  await assertAccessScopeOnEvent(scope, righe, "events.manage", "scrittura");

  /*
    `skipDuplicates` sulla chiave (club, tipo, identificativo storico): la
    generazione e **ripetibile**, e rilanciarla su un intervallo che si
    sovrappone non deve produrre doppioni. Prima la deduplicazione era una
    `Set` di chiavi costruita nel browser, e valeva finche nessun altro
    salvava nello stesso momento.
  */
  /*
    La grafia in colonna la detta il registro anche qui (§17.2): la creazione
    in blocco e la terza porta sulla stessa scrittura, e una correzione che
    coprisse le prime due lascerebbe aperta questa — che e esattamente la
    forma di difetto che questa lane ha gia trovato quattro volte.
  */
  const daScrivere = await Promise.all(
    righe.map((riga) => riconciliaGrafiaDellaCategoria(organizationId, riga)),
  );

  await prisma.clubEvent.createMany({ data: daScrivere, skipDuplicates: true });
  await projectEventsToClubColumn(organizationId, kind);

  await recordAuditEvent({
    action: AUDIT_ACTIONS.eventCreated,
    actorUserId: attore.userId || null,
    actorEmail: attore.email || null,
    actorRole: scope.activeRole || null,
    organizationId,
    resource: "club_events",
    resourceId: null,
    metadata: { kind, generati: righe.length },
  });

  return prisma.clubEvent.findMany({
    where: {
      organization_id: organizationId,
      kind,
      legacy_id: {
        in: righe
          .map((riga) => riga.legacy_id)
          .filter((value): value is string => Boolean(value)),
      },
    },
  });
};

export { toEventLegacyShape };
