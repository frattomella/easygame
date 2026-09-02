import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  accessScopeAllows,
  accessScopeValues,
  normalizeAccessScopes,
} from "../../src/lib/roles/access-scope.ts";

/**
 * **W6 §11.3 — lo scope diventa un confine.**
 *
 * ## Cosa c'era prima, e perché non bastava
 *
 * Prima della Wave 6 la sede **non era un confine di sicurezza**, e la
 * documentazione lo diceva a chiare lettere in due punti
 * ([03](../../docs/knowledge-base/03-architecture-overview.md),
 * [09](../../docs/knowledge-base/09-api-conventions.md)). Il motivo è
 * strutturale: `site_id` arriva come **parametro della richiesta**, quindi chi
 * non lo passa vede tutto. Un filtro che si toglie togliendo un pezzo di
 * indirizzo non è un confine, è una comodità.
 *
 * La lane 6G ha costruito `club_access_scopes`: le righe si creano, si
 * revocano e si audita. Ma nessuno le leggeva, e un perimetro che non
 * restringe è una configurazione che non configura — la stessa promessa vuota
 * che questa Wave ha smontato quattordici volte.
 *
 * ## Le due proprietà che contano
 *
 * **Vuoto significa tutto il club.** È ciò che hanno tutte le tessere che
 * esistono oggi, ed è la scelta che rende il perimetro *additivo*: nessun club
 * si sveglia con qualcuno che vede meno di ieri.
 *
 * **Su un atto è un confine, non un filtro.** Un elenco più corto non è un
 * rifiuto; convocare un atleta che non è nel proprio perimetro sì. È la stessa
 * regola che la lane 6C1 ha scritto per l'allenatore, e per la stessa ragione.
 */

const SRC = path.join(process.cwd(), "src");
const leggi = (relativo) =>
  readFileSync(path.join(SRC, ...relativo.split("/")), "utf8");

const sede = (value) => ({ kind: "site", value });
const categoria = (value) => ({ kind: "category", value });

/* ------------------------------------------------------------- il dominio */

test("un perimetro vuoto non restringe niente", () => {
  for (const vuoto of [null, undefined, []]) {
    assert.equal(
      accessScopeAllows(vuoto, { siteId: "sede-nord", categoryId: "u15" }),
      true,
    );
    assert.equal(accessScopeAllows(vuoto, {}), true);
  }
});

test("una sede dichiarata esclude le altre", () => {
  const perimetro = [sede("nord")];

  assert.equal(accessScopeAllows(perimetro, { siteId: "nord" }), true);
  assert.equal(accessScopeAllows(perimetro, { siteId: "sud" }), false);
});

test("i due assi si sommano: servono entrambi", () => {
  /*
    «Sede Nord **e** Under 15» non e «Sede Nord **o** Under 15». Un ruolo che
    dichiara due assi li vuole entrambi: e cosi che si descrive un
    responsabile di un settore in una sede.
  */
  const perimetro = [sede("nord"), categoria("u15")];

  assert.equal(
    accessScopeAllows(perimetro, { siteId: "nord", categoryId: "u15" }),
    true,
  );
  assert.equal(
    accessScopeAllows(perimetro, { siteId: "nord", categoryId: "u17" }),
    false,
  );
  assert.equal(
    accessScopeAllows(perimetro, { siteId: "sud", categoryId: "u15" }),
    false,
  );
});

test("una riga senza sede non passa un perimetro di sede", () => {
  /*
    Nel **dominio** una riga muta non passa: e il verso giusto in cui sbagliare
    su un evento, che una sede ce l'ha sempre.

    L'elenco degli atleti fa deliberatamente il contrario, e il perche sta in
    `resources.ts`: «sede vuota» su un atleta significa «non dichiarata», non
    «di un'altra sede», e nasconderlo lascerebbe scoperte proprio le schede che
    qualcuno deve completare (ADR-0038).
  */
  assert.equal(accessScopeAllows([sede("nord")], {}), false);
  assert.equal(accessScopeAllows([sede("nord")], { siteId: "" }), false);
});

test("il perimetro si normalizza: niente vuoti, niente duplicati", () => {
  const normalizzato = normalizeAccessScopes([
    sede("nord"),
    sede("nord"),
    sede("  "),
    { kind: "inventato", value: "x" },
    categoria("u15"),
  ]);

  assert.deepEqual(accessScopeValues(normalizzato, "site"), ["nord"]);
  assert.deepEqual(accessScopeValues(normalizzato, "category"), ["u15"]);
});

/* ---------------------------------------------------- e dove viene applicato */

test("§11.3 · il perimetro arriva fino allo scope della richiesta", () => {
  const auth = leggi("lib/server/auth.ts");

  assert.ok(
    auth.includes("accessScopes: AccessScopeEntry[];"),
    "senza il campo sullo scope nessuna guardia puo leggerlo",
  );
  assert.ok(
    auth.includes("prisma.clubAccessScope.findMany"),
    "e qualcuno deve leggerlo dall archivio, non dal client",
  );
  /*
    **Qui c'era un'asserzione che affermava il difetto.**

    Pretendeva la condizione `selectedMembership?.customSlug && …`, cioe che il
    perimetro si leggesse **solo** per le tessere con un ruolo personalizzato.
    La motivazione scritta accanto — «le altre non ne hanno» — era falsa: la
    schermata di gestione accessi offre le caselle Sedi e Categorie anche per i
    ruoli canonici, e `assignClubRole` le scrive.

    Quindi il presidio non mancava: **codificava**. Un proprietario assegnava
    «Collaboratore, solo sede Nord», vedeva la pastiglia, l'audit registrava la
    riga, e la persona vedeva tutto il club — con questo file verde.

    La prova che conta ora e comportamentale e sta in
    `scripts/wave-6-roles-probe.mjs` (U-27 su un **ruolo canonico**): qui resta
    la sola invariante di forma, cioe che il perimetro venga letto
    dall'archivio per la tessera scelta, senza dire **quali** tessere.
  */
  assert.equal(
    auth.includes("selectedMembership?.customSlug && selectedMembership.id"),
    false,
    "il perimetro non si legge solo per i ruoli personalizzati: la schermata lo scrive anche per i canonici",
  );
});

test("§11.3 · l'elenco degli atleti lo applica dentro il `where`", () => {
  const resources = leggi("lib/server/resources.ts");

  assert.ok(
    resources.includes("const buildAccessScopeFilter = ("),
    "il perimetro deve diventare una condizione della query",
  );
  assert.ok(
    resources.includes("where.AND = [...(where.AND || []), ...perimetro];"),
    "si somma con AND: chi cerca per nome deve vedere meno, non di piu",
  );

  /*
    Dentro il `where` e non dopo: un filtro applicato in memoria darebbe un
    conteggio che non corrisponde all'elenco, e la pagina direbbe «212 atleti»
    mostrandone trenta.
  */
  const posizioneFiltro = resources.indexOf("const perimetro = buildAccessScopeFilter");
  const posizioneCount = resources.indexOf("delegate.count(", posizioneFiltro);
  assert.ok(
    posizioneFiltro > 0 && posizioneCount > posizioneFiltro,
    "il perimetro deve entrare nel `where` prima del conteggio",
  );
});

test("§11.3 · sugli eventi vale su ogni atto, non solo sull'elenco", () => {
  const events = leggi("lib/server/events.ts");

  assert.ok(
    events.includes("const assertAccessScopeOnEvent = async ("),
    "serve una guardia, non solo un filtro di elenco",
  );

  /*
    Il presidio che chiude la classe: tante guardie di perimetro del ruolo
    quante ne ha l'allenatore. Se domani nascesse una decima funzione con il
    perimetro dell'allenatore e senza questo, il conteggio lo direbbe.
  */
  const attiAllenatore = (
    events.match(/await assertTrainerEventPerimeter\(/g) || []
  ).length;
  const attiRuolo = (events.match(/await assertAccessScopeOnEvent\(/g) || [])
    .length;

  assert.equal(
    attiRuolo,
    attiAllenatore,
    `${attiAllenatore} atti proteggono il perimetro dell'allenatore e ${attiRuolo} quello del ruolo: un atto scoperto e un atto su persone che non sono nel proprio perimetro`,
  );

  assert.ok(
    events.includes("candidato?.siteId ?? candidato?.site_id"),
    "le righe di Prisma e i candidati costruiti in memoria hanno due grafie: un punto che si dimentica di convertire fallirebbe **aperto**",
  );
});

test("§11.3 · il diniego lo dice, e lascia traccia", () => {
  const events = leggi("lib/server/events.ts");
  const inizio = events.indexOf("const assertAccessScopeOnEvent = async (");
  const corpo = events.slice(inizio, inizio + 1800);

  assert.ok(
    corpo.includes("recordPermissionDenied"),
    "un rifiuto senza traccia non permette a un club di capire perche un suo collaboratore non riesce a fare una cosa",
  );
  assert.ok(
    corpo.includes("Accesso negato"),
    "la stringa e la convenzione con cui il route handler mappa il 403",
  );
});

/* ============================================================================
   L'audit ostile: il perimetro era un filtro di elenco, e si aggirava con l'id
   ========================================================================== */

test("il perimetro gira su tutti gli atti, non solo sull'elenco", () => {
  /*
    Due revisioni indipendenti hanno trovato la stessa cosa: `buildAccessScopeFilter`
    aveva **un solo** chiamante, dentro `listResourcePage`. La lettura per
    identificativo, la modifica e la cancellazione non lo vedevano mai.

    Un filtro di elenco si aggira chiedendo la riga per id — che e proprio come
    si aggira un filtro di elenco — e con un ruolo base di gestione non si
    trattava solo di leggere: `athletes` e in scrittura per collaboratore e
    staff, quindi un ruolo perimetrato su una sede **modificava e cancellava**
    qualunque atleta del club.

    La prova non conta le chiamate a caso: enumera gli **atti** del registro e
    pretende che ognuno passi dalla verifica. Un atto nuovo che dimentichi la
    riga fallisce qui.
  */
  const sorgente = leggi("lib/server/resources.ts");

  const atti = [
    "export const listResourcePage",
    "export const getResourceById",
    "export const updateResource",
    "export const deleteResource",
  ];

  const scoperti = [];
  for (const atto of atti) {
    const inizio = sorgente.indexOf(atto);
    assert.ok(inizio > 0, `${atto} non trovato`);
    const fine = sorgente.indexOf("\nexport const ", inizio + atto.length);
    const corpo = sorgente.slice(inizio, fine > 0 ? fine : sorgente.length);
    const guarda =
      corpo.includes("buildAccessScopeFilter(") ||
      corpo.includes("assertRecordWithinAccessScope(");
    if (!guarda) scoperti.push(atto);
  }

  assert.deepEqual(
    scoperti,
    [],
    `atti senza verifica di perimetro: ${scoperti.join(", ")}. Un perimetro che vale solo sull'elenco si aggira passando l'identificativo`,
  );
});

test("il SQL del perimetro dice quello che dice la regola pura", () => {
  /*
    La regola pura e fail-closed e lo scrive: «una riga che non porta il valore
    dell'asse ristretto **non passa**: un dato senza sede non e "di tutte le
    sedi", e un dato di cui non si sa dire dove sia».

    Il filtro SQL aveva un secondo ramo che faceva passare gli atleti **senza
    sede**, ereditato da ADR-0038 — dove la sede vuota vuol dire «non
    dichiarata». Giusto per un filtro di visualizzazione, sbagliato per un
    confine: due proprietari, due risposte opposte, e a decidere era la piu
    larga.
  */
  /*
    La forma Prisma del perimetro ha adesso **un proprietario solo**. Averla in
    due file e gia costato una divergenza — la copia dentro il registro
    generico lasciava passare gli atleti senza sede — e la seconda copia stava
    per nascere quando il fascicolo documentale ne ha avuto bisogno.
  */
  const proprietario = leggi("lib/server/access-scope-query.ts");
  const registro = leggi("lib/server/resources.ts");

  assert.equal(
    proprietario.includes("none: { site_id: { not: null } }"),
    false,
    "il ramo che faceva passare gli atleti senza sede contraddiceva access-scope.ts",
  );
  assert.match(
    registro,
    /buildAthleteAccessScopeConditions/,
    "il registro generico deve chiedere il perimetro al modulo che lo possiede, non riscriverlo",
  );
  /*
    Il registro generico ha ancora un filtro di **visualizzazione** per
    `?site_id=`, che e un'altra cosa e resta permissivo per ADR-0038: cercare
    la forma Prisma in generale prenderebbe anche quello. Cio che non deve
    esistere due volte e il **vocabolario del perimetro**: chi lo costruisce
    chiama `accessScopeValues`, e nel registro non deve piu comparire.
  */
  assert.equal(
    registro.includes("accessScopeValues("),
    false,
    "il perimetro non si ricostruisce nel registro: si chiede al modulo che lo possiede",
  );
  assert.ok(
    proprietario.includes("accessScopeValues("),
    "e il modulo che lo possiede deve essere quello che lo costruisce",
  );

  // e la regola pura resta quella che il SQL imita
  assert.equal(
    accessScopeAllows([sede("nord")], { siteId: null }),
    false,
    "una riga senza sede non sta dentro un perimetro di sede",
  );
  assert.equal(
    accessScopeAllows([sede("nord")], { siteId: "nord" }),
    true,
  );
});

test("il diniego di perimetro parla la lingua che il route handler mappa su 403", () => {
  const sorgente = leggi("lib/server/resources.ts");
  const inizio = sorgente.indexOf("const assertRecordWithinAccessScope");
  assert.ok(inizio > 0, "la verifica sulla riga singola non esiste");
  const corpo = sorgente.slice(inizio, inizio + 1400);

  assert.match(
    corpo,
    /Accesso negato/,
    "senza quella stringa il route handler generico risponde 500 invece di 403",
  );
  assert.match(
    corpo,
    /count\(/,
    "la verifica deve rifare la stessa interrogazione dell'elenco, non giudicare con una seconda regola in TypeScript",
  );
});

test("il perimetro arriva al fascicolo documentale, dove c'e il nome di un minore", () => {
  /*
    **Dove il perimetro era sconfitto proprio sul dato che recintava.**

    `accessScopes` compariva in tre file su tutto il repository: chi lo produce,
    il registro generico e gli eventi. La coda documentale del club non lo
    guardava, e una revisione ostile ha misurato la conseguenza: una segreteria
    perimetrata su **una sede** leggeva la coda di **tutto** il club, e ogni
    riga porta `subjectName`, cioe nome e cognome di un minore.

    Il perimetro non era quindi soltanto incompleto — era **sconfitto** per il
    dato che era stato configurato per recintare, e la pagina della gestione
    accessi lo prometteva senza riserve.

    Il fascicolo non conosce sedi ne categorie: conosce un `subject_id`. Per
    questo il perimetro ci arriva come **elenco di atleti**, chiesto al modulo
    che lo possiede.
  */
  const fascicolo = leggi("lib/server/document-requests.ts");

  assert.match(
    fascicolo,
    /accessScopes\?: readonly AccessScopeEntry\[\] \| null;/,
    "lo scope del fascicolo deve poter portare il perimetro",
  );
  assert.match(
    fascicolo,
    /athleteIdsWithinAccessScope\(/,
    "il fascicolo deve chiedere il perimetro al modulo che lo possiede",
  );

  /*
    La distinzione che conta: `null` significa «nessun perimetro», elenco vuoto
    significa «nessun atleta». Confonderli farebbe vedere tutto il club a chi
    non deve vedere niente, ed e l'errore piu facile da commettere qui.
  */
  assert.match(
    fascicolo,
    /if \(dentroIlPerimetro\) \{/,
    "il controllo deve distinguere «nessun perimetro» da «perimetro vuoto»",
  );
});

test("chiedere un fascicolo fuori perimetro e un diniego, non un elenco vuoto", () => {
  /*
    Un elenco piu corto non e un rifiuto. Chiedere **quel** fascicolo, con il
    suo identificativo, e un atto: e la stessa regola che la lane 6C1 ha
    scritto per l'allenatore.
  */
  const fascicolo = leggi("lib/server/document-requests.ts");
  const inizio = fascicolo.indexOf("export const getDocumentDossier");
  const corpo = fascicolo.slice(inizio, inizio + 3200);

  assert.match(
    corpo,
    /fuori dal perimetro di sede o categoria/,
    "il diniego deve dire perche, e passare da `denied`, che antepone «Accesso negato»",
  );
});
