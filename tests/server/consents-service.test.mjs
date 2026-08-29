import assert from "node:assert/strict";
import test, { before, beforeEach } from "node:test";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * Il dominio dei consensi, a runtime (W3-C, G-17).
 *
 * Quattro cose vanno dimostrate, non affermate:
 *
 * 1. **l'append-only.** Una revoca aggiunge una riga e non ne toglie nessuna:
 *    il consenso dato a settembre resta dimostrabile dopo la revoca di
 *    gennaio, ed e esattamente cio che serve se qualcuno contesta una foto
 *    pubblicata a ottobre;
 * 2. **il versionamento.** Pubblicare V2 non invalida i consensi raccolti su
 *    V1: li lascia validi e li **segnala**. E il club a decidere se
 *    richiederli;
 * 3. **l'isolamento multi-tenant.** Un consenso e uno stato di una persona,
 *    spesso minorenne. Ogni operazione viene provata dal club sbagliato e deve
 *    fallire con «Accesso negato», che e la stringa da cui il route handler
 *    ricava il 403. Vale anche per la **versione citata**: citare il testo di
 *    un altro club scriverebbe una decisione su qualcosa che il soggetto non
 *    ha mai visto;
 * 4. **la matrice del §13.** Definire un consenso e configurazione societaria;
 *    registrare una decisione e un gesto di segreteria. Sono due permessi
 *    diversi, e i cinque ruoli li provano tutti.
 */

const CLUB_A = "aaaaaaaa-0000-4000-8000-000000000001";
const CLUB_B = "bbbbbbbb-0000-4000-8000-000000000002";

const UTENTE_A = "11111111-0000-4000-8000-00000000000a";
const UTENTE_B = "22222222-0000-4000-8000-00000000000b";

const ATLETA = "cccccccc-0000-4000-8000-00000000000c";

const scopeA = (role = "owner") => ({
  userId: UTENTE_A,
  activeOrganizationId: CLUB_A,
  activeRole: role,
  allowedOrganizationIds: [CLUB_A],
});

const scopeB = (role = "owner") => ({
  userId: UTENTE_B,
  activeOrganizationId: CLUB_B,
  activeRole: role,
  allowedOrganizationIds: [CLUB_B],
});

let consents;
let setPrismaClientForTests;
let fake;

before(async () => {
  consents = await import("../../src/lib/server/consents.ts");
  ({ __setPrismaClientForTests: setPrismaClientForTests } = await import(
    "../../src/lib/server/prisma.ts"
  ));
});

const seed = () => ({
  club: [
    { id: CLUB_A, name: "ASD Alfa" },
    { id: CLUB_B, name: "ASD Beta" },
  ],
});

beforeEach(() => {
  fake = createFakePrisma(seed());
  setPrismaClientForTests(fake.client);
});

/** Una definizione attiva, con il suo testo pubblicato. */
const definizioneAttiva = async (scope = scopeA(), key = "images") => {
  const definizione = await consents.createConsentDefinition(scope, {
    key,
    title: "Consenso immagini",
    description: "Foto e video dell'attivita sportiva",
    required: true,
  });

  const versione = await consents.publishConsentVersion(
    scope,
    definizione.id,
    { bodyText: "Autorizzo la pubblicazione di foto e video." },
  );

  // Riletta dopo la pubblicazione: e quella la definizione «attiva».
  return {
    definizione: await consents.getConsentDefinition(scope, definizione.id),
    versione,
  };
};

const decidi = (scope, definitionId, status, extra = {}) =>
  consents.recordConsentDecision(scope, {
    definitionId,
    subjectKind: "athlete",
    subjectId: ATLETA,
    subjectLabel: "Rossi Mario",
    status,
    source: "manual",
    ...extra,
  });

/* ------------------------------------------------------ ciclo di vita */

test("una definizione nasce bozza, e la pubblicazione del testo la attiva", async () => {
  const definizione = await consents.createConsentDefinition(scopeA(), {
    key: "Privacy",
    title: "Informativa privacy",
  });

  assert.equal(definizione.key, "privacy", "la chiave si normalizza");
  assert.equal(definizione.status, "draft");
  assert.equal(definizione.publishedVersion, 0);

  // Una bozza non raccoglie decisioni: si acconsentirebbe a un testo che il
  // club non ha ancora deciso.
  await assert.rejects(
    () => decidi(scopeA(), definizione.id, "accepted"),
    /non e attivo/i,
  );

  const versione = await consents.publishConsentVersion(
    scopeA(),
    definizione.id,
    { bodyText: "Testo dell'informativa." },
  );

  assert.equal(versione.version, 1);

  const riletta = await consents.getConsentDefinition(scopeA(), definizione.id);
  assert.equal(riletta.status, "active");
  assert.equal(riletta.publishedVersion, 1);
  assert.equal(riletta.publishedVersionId, versione.id);
});

test("la chiave e unica per club, e il messaggio dice cosa fare", async () => {
  await consents.createConsentDefinition(scopeA(), {
    key: "privacy",
    title: "Informativa",
  });

  await assert.rejects(
    () =>
      consents.createConsentDefinition(scopeA(), {
        key: "privacy",
        title: "Informativa bis",
      }),
    /Esiste gia un consenso con la chiave/,
  );

  // Lo stesso nome in un altro club non e un conflitto: i cataloghi sono due.
  const altrove = await consents.createConsentDefinition(scopeB(), {
    key: "privacy",
    title: "Informativa",
  });
  assert.equal(altrove.organizationId, CLUB_B);
});

/* --------------------------------------------------------- append-only */

test("accettazione, revoca, riaccettazione: tre righe, e la revoca non cancella", async () => {
  const { definizione } = await definizioneAttiva();

  await decidi(scopeA(), definizione.id, "accepted", {
    decidedAt: "2026-09-01T10:00:00.000Z",
  });
  await decidi(scopeA(), definizione.id, "revoked", {
    decidedAt: "2027-01-15T09:00:00.000Z",
    note: "Richiesta della famiglia",
  });
  const terza = await decidi(scopeA(), definizione.id, "accepted", {
    decidedAt: "2027-03-02T08:30:00.000Z",
  });

  // Tre righe in archivio: nessuna e stata sostituita.
  assert.equal(fake.rows("consentRecord").length, 3);
  assert.equal(
    fake.calls.some((chiamata) => chiamata.delegate === "consentRecord" && chiamata.method === "delete"),
    false,
    "il registro dei consensi non cancella niente",
  );
  assert.equal(
    fake.calls.some(
      (chiamata) =>
        chiamata.delegate === "consentRecord" &&
        ["update", "updateMany", "deleteMany"].includes(chiamata.method),
    ),
    false,
    "una decisione non si modifica: se ne aggiunge un'altra",
  );

  assert.equal(terza.state.status, "accepted");
  assert.equal(terza.state.historyCount, 3);

  const stato = await consents.getConsentStateForSubject(scopeA(), {
    definitionId: definizione.id,
    subjectKind: "athlete",
    subjectId: ATLETA,
  });
  assert.equal(stato.status, "accepted");
  assert.equal(stato.historyCount, 3);

  const storico = await consents.listConsentRecords(scopeA(), definizione.id);
  assert.deepEqual(
    storico.map((riga) => riga.status),
    ["accepted", "revoked", "accepted"].reverse(),
    "lo storico si legge dal piu recente",
  );
  assert.equal(storico.find((riga) => riga.status === "revoked").note, "Richiesta della famiglia");
});

test("non si revoca un consenso che non risulta dato", async () => {
  const { definizione } = await definizioneAttiva();

  await assert.rejects(
    () => decidi(scopeA(), definizione.id, "revoked"),
    /Non risulta nessun consenso da revocare/,
  );

  await decidi(scopeA(), definizione.id, "accepted", {
    decidedAt: "2026-09-01T10:00:00.000Z",
  });
  await decidi(scopeA(), definizione.id, "revoked", {
    decidedAt: "2026-10-01T10:00:00.000Z",
  });

  // Due revoche di fila sono un errore di chi registra, non un fatto.
  await assert.rejects(
    () =>
      decidi(scopeA(), definizione.id, "revoked", {
        decidedAt: "2026-11-01T10:00:00.000Z",
      }),
    /gia revocato/i,
  );
});

test("l'evidenza e un puntatore, e mezzo puntatore non si registra", async () => {
  const { definizione } = await definizioneAttiva();

  await assert.rejects(
    () =>
      decidi(scopeA(), definizione.id, "accepted", {
        evidenceKind: "form_submission",
      }),
    /evidenza richiede sia il tipo sia l'identificativo/i,
  );

  const esito = await decidi(scopeA(), definizione.id, "accepted", {
    source: "public_form",
    evidenceKind: "form_submission",
    evidenceId: "dddddddd-0000-4000-8000-00000000000d",
  });

  assert.equal(esito.record.source, "public_form");
  assert.equal(esito.record.evidenceKind, "form_submission");
});

/* ------------------------------------------------------- versionamento */

test("pubblicare V2 non invalida i record su V1: li segnala", async () => {
  const { definizione, versione } = await definizioneAttiva();

  await decidi(scopeA(), definizione.id, "accepted", {
    decidedAt: "2026-09-01T10:00:00.000Z",
  });

  const primoStato = await consents.getConsentStateForSubject(scopeA(), {
    definitionId: definizione.id,
    subjectKind: "athlete",
    subjectId: ATLETA,
  });
  assert.equal(primoStato.onOutdatedVersion, false);

  const v2 = await consents.publishConsentVersion(scopeA(), definizione.id, {
    bodyText: "Testo corretto, con il riferimento al regolamento nuovo.",
  });

  assert.equal(v2.version, 2);
  assert.notEqual(v2.id, versione.id);

  // La versione vecchia esiste ancora, intatta: e l'unica risposta possibile a
  // «quale testo ha accettato».
  const righeVersione = fake.rows("consentVersion");
  assert.equal(righeVersione.length, 2);
  assert.equal(
    righeVersione.find((riga) => riga.version === 1).body_text,
    "Autorizzo la pubblicazione di foto e video.",
  );
  assert.equal(
    fake.calls.some(
      (chiamata) =>
        chiamata.delegate === "consentVersion" &&
        ["update", "updateMany", "delete", "deleteMany"].includes(chiamata.method),
    ),
    false,
    "una versione pubblicata non si aggiorna mai",
  );

  const dopo = await consents.getConsentStateForSubject(scopeA(), {
    definitionId: definizione.id,
    subjectKind: "athlete",
    subjectId: ATLETA,
  });

  assert.equal(dopo.status, "accepted", "il consenso resta valido");
  assert.equal(dopo.version, 1);
  assert.equal(dopo.onOutdatedVersion, true, "ma e dato su un testo superato");

  // Riaccettato sul testo nuovo, la segnalazione sparisce.
  await decidi(scopeA(), definizione.id, "accepted", {
    decidedAt: "2027-01-10T10:00:00.000Z",
  });
  const riaccettato = await consents.getConsentStateForSubject(scopeA(), {
    definitionId: definizione.id,
    subjectKind: "athlete",
    subjectId: ATLETA,
  });
  assert.equal(riaccettato.version, 2);
  assert.equal(riaccettato.onOutdatedVersion, false);
});

/* ------------------------------------------------------- multi-tenant */

test("una decisione su una definizione di un altro club risponde «Accesso negato»", async () => {
  const { definizione } = await definizioneAttiva(scopeA());

  await assert.rejects(
    () => decidi(scopeB(), definizione.id, "accepted"),
    /Accesso negato/,
  );

  // Nemmeno dichiarando il club altrui nel corpo: l'`organization_id` del
  // client non viene mai creduto.
  await assert.rejects(
    () =>
      consents.recordConsentDecision(scopeB(), {
        organizationId: CLUB_A,
        definitionId: definizione.id,
        subjectKind: "athlete",
        subjectId: ATLETA,
        status: "accepted",
      }),
    /Accesso negato/,
  );

  await assert.rejects(
    () => consents.getConsentDefinition(scopeB(), definizione.id),
    /Accesso negato/,
  );
  await assert.rejects(
    () =>
      consents.updateConsentDefinition(scopeB(), definizione.id, {
        title: "Preso",
      }),
    /Accesso negato/,
  );
  await assert.rejects(
    () =>
      consents.publishConsentVersion(scopeB(), definizione.id, {
        bodyText: "Testo scritto dal club sbagliato",
      }),
    /Accesso negato/,
  );
  await assert.rejects(
    () => consents.listConsentRecords(scopeB(), definizione.id),
    /Accesso negato/,
  );
  await assert.rejects(
    () =>
      consents.getConsentStateForSubject(scopeB(), {
        definitionId: definizione.id,
        subjectKind: "athlete",
        subjectId: ATLETA,
      }),
    /Accesso negato/,
  );
  await assert.rejects(
    () => consents.listConsentStates(scopeB(), { definitionId: definizione.id }),
    /Accesso negato/,
  );

  assert.equal(fake.rows("consentRecord").length, 0);
});

test("non si cita il testo di un altro club", async () => {
  const { definizione } = await definizioneAttiva(scopeA(), "images");
  const altrui = await definizioneAttiva(scopeB(), "images");

  await assert.rejects(
    () =>
      decidi(scopeA(), definizione.id, "accepted", {
        versionId: altrui.versione.id,
      }),
    /Accesso negato/,
  );

  assert.equal(fake.rows("consentRecord").length, 0);
});

test("gli elenchi non escono dal club", async () => {
  await definizioneAttiva(scopeA(), "images");
  await definizioneAttiva(scopeB(), "privacy");

  const daA = await consents.listConsentDefinitions(scopeA());
  assert.deepEqual(
    daA.map((riga) => riga.key),
    ["images"],
  );
  assert.equal(
    daA.every((riga) => riga.organizationId === CLUB_A),
    true,
  );

  const daB = await consents.listConsentDefinitions(scopeB());
  assert.deepEqual(
    daB.map((riga) => riga.key),
    ["privacy"],
  );

  await assert.rejects(
    () => consents.listConsentDefinitions(scopeB(), { organizationId: CLUB_A }),
    /Accesso negato/,
  );
});

/* ------------------------------------------------------------ soggetti */

test("un soggetto fuori elenco non entra nel registro", async () => {
  const { definizione } = await definizioneAttiva();

  await assert.rejects(
    () =>
      consents.recordConsentDecision(scopeA(), {
        definitionId: definizione.id,
        subjectKind: "sponsor",
        subjectId: ATLETA,
        status: "accepted",
      }),
    /Soggetto sconosciuto/,
  );

  await assert.rejects(
    () =>
      consents.recordConsentDecision(scopeA(), {
        definitionId: definizione.id,
        subjectKind: "athlete",
        subjectId: "  ",
        status: "accepted",
      }),
    /Manca il soggetto/,
  );

  await assert.rejects(
    () =>
      consents.recordConsentDecision(scopeA(), {
        definitionId: definizione.id,
        subjectKind: "athlete",
        subjectId: ATLETA,
        status: "forse",
      }),
    /Decisione sconosciuta/,
  );

  // Il consenso di un atleta e quello del suo tutore sono due stati diversi.
  await decidi(scopeA(), definizione.id, "accepted");
  const tutore = await consents.getConsentStateForSubject(scopeA(), {
    definitionId: definizione.id,
    subjectKind: "guardian",
    subjectId: ATLETA,
  });
  assert.equal(tutore.status, "missing");

  assert.equal(fake.rows("consentRecord").length, 1);
});

test("la vista d'insieme dice chi manca e chi ha revocato", async () => {
  const immagini = await definizioneAttiva(scopeA(), "images");
  const privacy = await definizioneAttiva(scopeA(), "privacy");

  await decidi(scopeA(), immagini.definizione.id, "accepted", {
    decidedAt: "2026-09-01T10:00:00.000Z",
  });
  await decidi(scopeA(), immagini.definizione.id, "revoked", {
    decidedAt: "2027-01-01T10:00:00.000Z",
  });

  // Con un soggetto: una riga per **ogni** consenso, anche dove non c'e niente.
  const perSoggetto = await consents.listConsentStates(scopeA(), {
    subjectKind: "athlete",
    subjectId: ATLETA,
  });

  assert.equal(perSoggetto.length, 2);
  const perChiave = Object.fromEntries(
    perSoggetto.map((riga) => [riga.definitionKey, riga.status]),
  );
  assert.equal(perChiave.images, "revoked");
  assert.equal(
    perChiave.privacy,
    "missing",
    "cio che manca non comparirebbe mai guardando solo le righe scritte",
  );
  assert.equal(
    perSoggetto.find((riga) => riga.definitionKey === "privacy").required,
    true,
  );

  // Senza soggetto: solo cio che e stato deciso, raggruppato.
  const complessivo = await consents.listConsentStates(scopeA(), {});
  assert.equal(complessivo.length, 1);
  assert.equal(complessivo[0].definitionId, immagini.definizione.id);
  assert.equal(complessivo[0].status, "revoked");
  assert.equal(complessivo[0].subjectId, ATLETA);
  assert.equal(complessivo[0].subjectLabel, "Rossi Mario");

  assert.equal(privacy.definizione.status, "active");
});

/* ------------------------------------------------------------- ritiro */

test("una definizione non si cancella: si ritira, e sparisce dagli elenchi ma non dallo storico", async () => {
  const { definizione } = await definizioneAttiva();
  await decidi(scopeA(), definizione.id, "accepted");

  const ritirata = await consents.setConsentDefinitionStatus(
    scopeA(),
    definizione.id,
    "retired",
  );
  assert.equal(ritirata.status, "retired");

  const elenco = await consents.listConsentDefinitions(scopeA());
  assert.equal(elenco.length, 0, "non si propone piu");

  const conRitirate = await consents.listConsentDefinitions(scopeA(), {
    includeRetired: true,
  });
  assert.equal(conRitirate.length, 1);

  // Continua a spiegare i consensi gia raccolti.
  const stato = await consents.getConsentStateForSubject(scopeA(), {
    definitionId: definizione.id,
    subjectKind: "athlete",
    subjectId: ATLETA,
  });
  assert.equal(stato.status, "accepted");

  // Una bozza non si ritira: non e mai stata in uso.
  const bozza = await consents.createConsentDefinition(scopeA(), {
    key: "travel",
    title: "Trasferte",
  });
  await assert.rejects(
    () => consents.setConsentDefinitionStatus(scopeA(), bozza.id, "retired"),
    /non puo diventare/,
  );
});

/* ------------------------------------------------------------ permessi */

test("i cinque ruoli: definire e configurazione, registrare e segreteria", async () => {
  const { definizione } = await definizioneAttiva(scopeA("owner"));

  const possonoDefinire = ["owner", "club_manager"];
  const nonPossonoDefinire = ["collaborator", "staff", "trainer"];

  for (const ruolo of possonoDefinire) {
    const creata = await consents.createConsentDefinition(scopeA(ruolo), {
      key: `privacy-${ruolo}`,
      title: "Informativa",
    });
    assert.equal(creata.status, "draft", `${ruolo} deve poter definire`);
  }

  for (const ruolo of nonPossonoDefinire) {
    await assert.rejects(
      () =>
        consents.createConsentDefinition(scopeA(ruolo), {
          key: `altro-${ruolo}`,
          title: "Informativa",
        }),
      /Accesso negato/,
      `${ruolo} non deve poter definire un consenso`,
    );
    await assert.rejects(
      () =>
        consents.publishConsentVersion(scopeA(ruolo), definizione.id, {
          bodyText: "Testo riscritto",
        }),
      /Accesso negato/,
      `${ruolo} non deve poter pubblicare un testo`,
    );
  }

  /*
    Registrare una decisione e un gesto operativo: la segreteria lo fa tutti i
    giorni con un foglio in mano. L'allenatore no — i consensi non passano dal
    campo.
  */
  for (const ruolo of ["owner", "club_manager", "collaborator", "staff"]) {
    const esito = await consents.recordConsentDecision(scopeA(ruolo), {
      definitionId: definizione.id,
      subjectKind: "athlete",
      subjectId: `atleta-${ruolo}`,
      status: "accepted",
    });
    assert.equal(esito.state.status, "accepted", `${ruolo} deve poter registrare`);
    assert.equal(
      await consents
        .listConsentDefinitions(scopeA(ruolo))
        .then((righe) => righe.length > 0),
      true,
      `${ruolo} deve poter leggere l'elenco`,
    );
  }

  await assert.rejects(
    () =>
      consents.recordConsentDecision(scopeA("trainer"), {
        definitionId: definizione.id,
        subjectKind: "athlete",
        subjectId: ATLETA,
        status: "accepted",
      }),
    /Accesso negato/,
  );
  await assert.rejects(
    () => consents.listConsentDefinitions(scopeA("trainer")),
    /Accesso negato/,
  );
  await assert.rejects(
    () => consents.listConsentStates(scopeA("trainer"), {}),
    /Accesso negato/,
  );
  await assert.rejects(
    () => consents.listConsentDefinitions(scopeA("parent")),
    /Accesso negato/,
  );
});

/* --------------------------------------------------------------- audit */

test("pubblicazione e revoca lasciano una traccia, e la revoca ha la sua", async () => {
  const { definizione } = await definizioneAttiva();

  await decidi(scopeA(), definizione.id, "accepted", {
    decidedAt: "2026-09-01T10:00:00.000Z",
  });
  await decidi(scopeA(), definizione.id, "revoked", {
    decidedAt: "2027-01-01T10:00:00.000Z",
  });

  const azioni = fake.rows("auditLog").map((riga) => riga.action);

  assert.ok(azioni.includes("consent.definition.changed"));
  assert.ok(azioni.includes("consent.version.published"));
  assert.ok(azioni.includes("consent.decision.recorded"));
  assert.ok(
    azioni.includes("consent.revoked"),
    "la revoca e la riga che si va a cercare: non si confonde con le altre",
  );

  const revoca = fake
    .rows("auditLog")
    .find((riga) => riga.action === "consent.revoked");
  assert.equal(revoca.organization_id, CLUB_A);
  assert.equal(revoca.metadata.chiave, "images");
  assert.equal(revoca.metadata.decisione, "revoked");
});
