import assert from "node:assert/strict";
import test, { before, beforeEach } from "node:test";

import { createFakePrisma } from "../helpers/fake-prisma.mjs";

/**
 * Il motore documentale, a runtime (W3-A).
 *
 * Tre cose vanno **dimostrate**, non affermate, e sono esattamente le tre che
 * il §5 del planning chiama invarianti:
 *
 * 1. **un documento gia rilasciato non cambia mai.** Correggere il modello,
 *    ripubblicarlo, ritirarlo: il foglio consegnato a marzo resta quello,
 *    identico, e continua a citare la sua versione;
 * 2. **l'isolamento multi-tenant.** Un documento generato porta il codice
 *    fiscale di una persona e quanto ha versato. Ogni operazione viene provata
 *    dal club sbagliato e deve fallire con «Accesso negato», che e la stringa
 *    da cui il route handler ricava il 403;
 * 3. **il permesso guarda cosa il documento dice**, non come si chiama: e la
 *    sensibilita della **versione** a decidere chi puo generare e chi puo
 *    rileggere.
 */

const CLUB_A = "aaaaaaaa-0000-4000-8000-000000000001";
const CLUB_B = "bbbbbbbb-0000-4000-8000-000000000002";

const USER_DIREZIONE = "11111111-0000-4000-8000-00000000000a";
const USER_SEGRETERIA = "22222222-0000-4000-8000-00000000000b";

const scopeDirezione = () => ({
  userId: USER_DIREZIONE,
  activeOrganizationId: CLUB_A,
  allowedOrganizationIds: [CLUB_A],
  role: "owner",
});

const scopeSegreteria = () => ({
  userId: USER_SEGRETERIA,
  activeOrganizationId: CLUB_A,
  allowedOrganizationIds: [CLUB_A],
  role: "collaborator",
});

const scopeAltroClub = () => ({
  userId: "33333333-0000-4000-8000-00000000000c",
  activeOrganizationId: CLUB_B,
  allowedOrganizationIds: [CLUB_B],
  role: "owner",
});

let service;
let setPrismaClientForTests;
let fake;

before(async () => {
  service = await import("../../src/lib/server/document-templates.ts");
  ({ __setPrismaClientForTests: setPrismaClientForTests } = await import(
    "../../src/lib/server/prisma.ts"
  ));
});

beforeEach(() => {
  fake = createFakePrisma({
    club: [
      { id: CLUB_A, name: "ASD Alfa" },
      { id: CLUB_B, name: "ASD Beta" },
    ],
  });
  setPrismaClientForTests(fake.client);
  teachCompositeVersionLookup();
});

/*
  Il doppio di Prisma non implementa le chiavi composte
  (`template_id_version`, `generated_documents_batch_subject`). Servirle qui
  fa provare al test il codice vero, invece di un percorso alternativo.
*/
const teachCompositeVersionLookup = () => {
  const versions = fake.client.documentTemplateVersion;
  const originalFind = versions.findUnique;
  versions.findUnique = async (args = {}) => {
    const composite = args.where?.template_id_version;
    if (!composite) return originalFind(args);
    return (
      fake
        .rows("documentTemplateVersion")
        .find(
          (row) =>
            row.template_id === composite.template_id &&
            Number(row.version) === Number(composite.version),
        ) || null
    );
  };

  const generated = fake.client.generatedDocument;
  const originalUpsert = generated.upsert;
  generated.upsert = async (args = {}) => {
    const composite = args.where?.generated_documents_batch_subject;
    if (!composite) return originalUpsert(args);
    const existing = fake
      .rows("generatedDocument")
      .find(
        (row) =>
          row.organization_id === composite.organization_id &&
          row.batch_id === composite.batch_id &&
          row.template_id === composite.template_id &&
          row.subject_kind === composite.subject_kind &&
          row.subject_id === composite.subject_id,
      );
    if (existing) return existing;
    return generated.create({ data: args.create });
  };
};

const nuovoModello = async (
  scope = scopeDirezione(),
  content = "<p>{{club.name}} — {{athlete.first_name}}</p>",
) =>
  service.createDocumentTemplate(scope, {
    title: "Dichiarazione di iscrizione",
    description: "Per la scuola",
    subjectKind: "athlete",
    content,
  });

const generaDocumento = async (
  scope,
  { template, version, subjectId = "atleta-1", batchId = null },
) =>
  service.recordGeneratedDocument(scope, {
    templateId: template.id,
    versionId: version.id,
    subjectKind: "athlete",
    subjectId,
    subjectLabel: "Mario Rossi",
    valuesSnapshot: { "club.name": "ASD Alfa", "athlete.first_name": "Mario" },
    contentHtml: "<p>ASD Alfa — Mario</p>",
    batchId,
  });

/* ------------------------------------------------------------ versionamento */

test("pubblicare crea la versione 1, e la bozza resta modificabile", async () => {
  const scope = scopeDirezione();
  const creato = await nuovoModello(scope);

  assert.equal(creato.status, "draft");
  assert.equal(creato.publishedVersion, 0);
  assert.equal(creato.versions.length, 0);

  const pubblicato = await service.publishDocumentTemplate(scope, creato.id);

  assert.equal(pubblicato.status, "active");
  assert.equal(pubblicato.publishedVersion, 1);
  assert.equal(pubblicato.versions.length, 1);
  assert.equal(pubblicato.hasUnpublishedChanges, false);
  assert.deepEqual(pubblicato.sensitivity, []);
});

test("ripubblicare senza modifiche non crea una versione nuova", async () => {
  const scope = scopeDirezione();
  const creato = await nuovoModello(scope);
  await service.publishDocumentTemplate(scope, creato.id);
  const seconda = await service.publishDocumentTemplate(scope, creato.id);

  // «La sedicesima versione» deve significare che il testo e cambiato quindici
  // volte, non che qualcuno ha premuto salva quindici volte.
  assert.equal(seconda.publishedVersion, 1);
  assert.equal(seconda.versions.length, 1);
});

test("un documento gia generato non cambia quando il modello cambia", async () => {
  const scope = scopeDirezione();
  const creato = await nuovoModello(scope);
  const v1 = await service.publishDocumentTemplate(scope, creato.id);

  const documento = await generaDocumento(scope, {
    template: v1,
    version: v1.versions[0],
  });

  // Il modello cambia, e viene ripubblicato.
  await service.updateDocumentTemplateDraft(scope, creato.id, {
    content: "<p>{{club.name}} — TESTO NUOVO — {{athlete.last_name}}</p>",
  });
  const v2 = await service.publishDocumentTemplate(scope, creato.id);

  assert.equal(v2.publishedVersion, 2);

  const riletto = await service.getGeneratedDocument(scope, documento.id);

  /*
    Cita ancora la **sua** versione. Il numero mostrato (`riletto.version`)
    arriva da una relazione che il doppio di Prisma non risolve: la prova che
    conta e l'identificativo, ed e quello che il database garantisce con
    `ON DELETE RESTRICT`.
  */
  assert.equal(riletto.versionId, v1.versions[0].id);
  assert.notEqual(riletto.versionId, v2.versions[0].id);
  // …e dice ancora quello che diceva.
  assert.equal(riletto.contentHtml, "<p>ASD Alfa — Mario</p>");
  assert.ok(!riletto.contentHtml.includes("TESTO NUOVO"));
});

test("un modello con documenti generati si ritira, non si cancella", async () => {
  const scope = scopeDirezione();
  const creato = await nuovoModello(scope);
  const pubblicato = await service.publishDocumentTemplate(scope, creato.id);
  await generaDocumento(scope, {
    template: pubblicato,
    version: pubblicato.versions[0],
  });

  await assert.rejects(
    () => service.deleteDocumentTemplate(scope, creato.id),
    /si ritira, non si cancella/i,
  );

  const ritirato = await service.setDocumentTemplateStatus(
    scope,
    creato.id,
    "retired",
  );
  assert.equal(ritirato.status, "retired");

  // E un modello ritirato non produce documenti nuovi.
  await assert.rejects(
    () => service.loadPublishableVersion(scope, creato.id),
    /ritirato/i,
  );
});

test("un modello mai usato si cancella", async () => {
  const scope = scopeDirezione();
  const creato = await nuovoModello(scope);
  const esito = await service.deleteDocumentTemplate(scope, creato.id);
  assert.equal(esito.id, creato.id);
});

test("un modello che nomina un segnaposto fuori catalogo non si pubblica", async () => {
  const scope = scopeDirezione();
  // `fiscalCode` e la chiave che il vecchio «generatore IA» scriveva.
  const creato = await nuovoModello(scope, "<p>{{fiscalCode}}</p>");

  await assert.rejects(
    () => service.publishDocumentTemplate(scope, creato.id),
    (error) => {
      assert.match(error.message, /fiscalCode/);
      assert.ok(Array.isArray(error.issues) && error.issues.length > 0);
      return true;
    },
  );
});

test("un modello non pubblicato non genera niente", async () => {
  const scope = scopeDirezione();
  const creato = await nuovoModello(scope);

  await assert.rejects(
    () => service.loadPublishableVersion(scope, creato.id),
    /mai stato pubblicato/i,
  );
});

/* ----------------------------------------------------------------- il lotto */

test("dentro un lotto lo stesso soggetto produce un documento solo", async () => {
  const scope = scopeDirezione();
  const creato = await nuovoModello(scope);
  const pubblicato = await service.publishDocumentTemplate(scope, creato.id);
  const version = pubblicato.versions[0];

  const primo = await generaDocumento(scope, {
    template: pubblicato,
    version,
    subjectId: "atleta-1",
    batchId: "lotto-settembre",
  });
  const secondo = await generaDocumento(scope, {
    template: pubblicato,
    version,
    subjectId: "atleta-1",
    batchId: "lotto-settembre",
  });

  // E cio che rende un nuovo tentativo capace di rigenerare **solo** i falliti.
  assert.equal(secondo.id, primo.id);
  assert.equal(fake.rows("generatedDocument").length, 1);
});

test("fuori da un lotto, due richieste sono due documenti", async () => {
  const scope = scopeDirezione();
  const creato = await nuovoModello(scope);
  const pubblicato = await service.publishDocumentTemplate(scope, creato.id);
  const version = pubblicato.versions[0];

  const primo = await generaDocumento(scope, { template: pubblicato, version });
  const secondo = await generaDocumento(scope, {
    template: pubblicato,
    version,
  });

  // Due attestazioni chieste due volte sono due documenti.
  assert.notEqual(secondo.id, primo.id);
  assert.equal(fake.rows("generatedDocument").length, 2);
});

/* -------------------------------------------------------------- multi-tenant */

test("nessuna operazione attraversa il confine fra due club", async () => {
  const scope = scopeDirezione();
  const altro = scopeAltroClub();

  const creato = await nuovoModello(scope);
  const pubblicato = await service.publishDocumentTemplate(scope, creato.id);
  const documento = await generaDocumento(scope, {
    template: pubblicato,
    version: pubblicato.versions[0],
  });

  await assert.rejects(
    () => service.getDocumentTemplate(altro, creato.id),
    /Accesso negato/,
  );
  await assert.rejects(
    () => service.updateDocumentTemplateDraft(altro, creato.id, { title: "X" }),
    /Accesso negato/,
  );
  await assert.rejects(
    () => service.publishDocumentTemplate(altro, creato.id),
    /Accesso negato/,
  );
  await assert.rejects(
    () => service.deleteDocumentTemplate(altro, creato.id),
    /Accesso negato/,
  );
  await assert.rejects(
    () => service.getGeneratedDocument(altro, documento.id),
    /Accesso negato/,
  );
  await assert.rejects(
    () =>
      service.advanceGeneratedDocument(altro, documento.id, {
        status: "issued",
      }),
    /Accesso negato/,
  );

  // E la versione di un club non si puo citare da un altro.
  await assert.rejects(
    () =>
      service.recordGeneratedDocument(altro, {
        templateId: creato.id,
        versionId: pubblicato.versions[0].id,
        subjectKind: "athlete",
        subjectId: "atleta-x",
        valuesSnapshot: {},
        contentHtml: "<p>rubato</p>",
      }),
    /Accesso negato/,
  );
});

test("un modello inesistente e uno di un altro club danno la stessa risposta", async () => {
  const scope = scopeDirezione();
  const creato = await nuovoModello(scope);

  const inesistente = await service
    .getDocumentTemplate(scope, "44444444-0000-4000-8000-00000000000d")
    .catch((error) => error.message);
  const altrui = await service
    .getDocumentTemplate(scopeAltroClub(), creato.id)
    .catch((error) => error.message);

  // Distinguerli direbbe a chi prova identificativi a caso quali esistono.
  assert.match(inesistente, /Accesso negato/);
  assert.match(altrui, /Accesso negato/);
});

/* ----------------------------------------------------------------- permessi */

test("un modello con importi non lo genera la segreteria", async () => {
  const direzione = scopeDirezione();
  const creato = await nuovoModello(
    direzione,
    "<p>{{athlete.first_name}} ha versato {{payment.total_paid}}</p>",
  );
  const pubblicato = await service.publishDocumentTemplate(
    direzione,
    creato.id,
  );

  assert.deepEqual(pubblicato.sensitivity, ["economic"]);

  // La direzione si.
  const ok = await service.loadPublishableVersion(direzione, creato.id);
  assert.ok(ok.version);

  // La segreteria no, e le viene detto perche.
  await assert.rejects(
    () => service.loadPublishableVersion(scopeSegreteria(), creato.id),
    /Accesso negato.*importi/i,
  );
});

test("chi non poteva generarlo rilegge solo cio che ha generato", async () => {
  const direzione = scopeDirezione();
  const segreteria = scopeSegreteria();

  const creato = await nuovoModello(
    direzione,
    "<p>{{athlete.first_name}} — {{payment.remaining}}</p>",
  );
  const pubblicato = await service.publishDocumentTemplate(
    direzione,
    creato.id,
  );

  const dellaDirezione = await generaDocumento(direzione, {
    template: pubblicato,
    version: pubblicato.versions[0],
  });

  await assert.rejects(
    () => service.getGeneratedDocument(segreteria, dellaDirezione.id),
    /Accesso negato/,
  );

  // E non compare nemmeno nell'elenco.
  const elenco = await service.listGeneratedDocuments(segreteria, {});
  assert.equal(elenco.length, 0);

  const elencoDirezione = await service.listGeneratedDocuments(direzione, {});
  assert.equal(elencoDirezione.length, 1);
});

/* -------------------------------------------------------- stato del documento */

test("«firmato» pretende la copia firmata", async () => {
  const scope = scopeDirezione();
  const creato = await nuovoModello(scope);
  const pubblicato = await service.publishDocumentTemplate(scope, creato.id);
  const documento = await generaDocumento(scope, {
    template: pubblicato,
    version: pubblicato.versions[0],
  });

  const inAttesa = await service.advanceGeneratedDocument(
    scope,
    documento.id,
    { status: "awaiting_signature" },
  );
  assert.equal(inAttesa.status, "awaiting_signature");

  await assert.rejects(
    () =>
      service.advanceGeneratedDocument(scope, documento.id, {
        status: "signed",
      }),
    /copia firmata/i,
  );

  // Un identificativo inventato non basta: «firmato» significa che una copia
  // e rientrata davvero, e senza questo controllo sarebbe di nuovo una spunta.
  await assert.rejects(
    () =>
      service.advanceGeneratedDocument(scope, documento.id, {
        status: "signed",
        signedAttachmentId: "99999999-0000-4000-8000-00000000000f",
      }),
    /Accesso negato/,
  );

  // E nemmeno una copia che sta in un altro club.
  fake.rows("attachment").push({
    id: "66666666-0000-4000-8000-00000000000f",
    organization_id: CLUB_B,
    owner_type: "athlete",
    owner_id: "atleta-1",
  });
  await assert.rejects(
    () =>
      service.advanceGeneratedDocument(scope, documento.id, {
        status: "signed",
        signedAttachmentId: "66666666-0000-4000-8000-00000000000f",
      }),
    /Accesso negato/,
  );

  fake.rows("attachment").push({
    id: "55555555-0000-4000-8000-00000000000e",
    organization_id: CLUB_A,
    owner_type: "athlete",
    owner_id: "atleta-1",
  });

  const firmato = await service.advanceGeneratedDocument(scope, documento.id, {
    status: "signed",
    signedAttachmentId: "55555555-0000-4000-8000-00000000000e",
  });
  assert.equal(firmato.status, "signed");
  assert.ok(firmato.signedAt);
});

test("chi non puo leggere un documento non ne cambia lo stato", async () => {
  const direzione = scopeDirezione();
  const segreteria = scopeSegreteria();

  const creato = await nuovoModello(
    direzione,
    "<p>{{athlete.first_name}} — {{payment.remaining}}</p>",
  );
  const pubblicato = await service.publishDocumentTemplate(
    direzione,
    creato.id,
  );
  const documento = await generaDocumento(direzione, {
    template: pubblicato,
    version: pubblicato.versions[0],
  });

  /*
    Prima bastava appartenere ai ruoli di segreteria: chi non poteva aprire il
    documento poteva comunque archiviarlo, e la risposta gli restituiva il nome
    del soggetto e le classi sensibili.
  */
  await assert.rejects(
    () =>
      service.advanceGeneratedDocument(segreteria, documento.id, {
        status: "archived",
      }),
    /Accesso negato/,
  );
});

test("uno stato che non esiste, e una transizione che non si puo fare", async () => {
  const scope = scopeDirezione();
  const creato = await nuovoModello(scope);
  const pubblicato = await service.publishDocumentTemplate(scope, creato.id);
  const documento = await generaDocumento(scope, {
    template: pubblicato,
    version: pubblicato.versions[0],
  });

  await assert.rejects(
    () =>
      service.advanceGeneratedDocument(scope, documento.id, {
        status: "consegnato-a-mano",
      }),
    /Stato non ammesso/i,
  );

  await service.advanceGeneratedDocument(scope, documento.id, {
    status: "archived",
  });
  await assert.rejects(
    () =>
      service.advanceGeneratedDocument(scope, documento.id, {
        status: "issued",
      }),
    /non puo diventare/i,
  );
});

/* ------------------------------------------------------------------ letture */

test("l'elenco dei modelli non porta con se il contenuto delle versioni", async () => {
  const scope = scopeDirezione();
  const creato = await nuovoModello(scope);
  await service.publishDocumentTemplate(scope, creato.id);

  const elenco = await service.listDocumentTemplates(scope, {});
  assert.equal(elenco.length, 1);
  assert.equal(elenco[0].publishedVersion, 1);
  assert.equal(elenco[0].generatedCount, 0);
  // Il riepilogo dice cosa il modello chiedera, non il modello.
  assert.ok(Array.isArray(elenco[0].placeholderKeys));
  assert.equal("draftContent" in elenco[0], false);
});

test("i modelli ritirati non compaiono, a meno di chiederli", async () => {
  const scope = scopeDirezione();
  const creato = await nuovoModello(scope);
  await service.publishDocumentTemplate(scope, creato.id);
  await service.setDocumentTemplateStatus(scope, creato.id, "retired");

  assert.equal((await service.listDocumentTemplates(scope, {})).length, 0);
  assert.equal(
    (await service.listDocumentTemplates(scope, { includeRetired: true }))
      .length,
    1,
  );
});

/* ============================ le regressioni dell'audit di fine Wave ==== */

test("il ruolo di un club non vale sui documenti di un altro", async () => {
  /*
    Il difetto piu grave trovato dall'audit. `ensureOrganizationAccess`
    confrontava con **tutti** i club accessibili, mentre `role` e il ruolo del
    club **attivo**: bastava crearsi una societa, diventarne proprietario, e
    tenerla come club attivo per riprendere sui modelli di un'altra i permessi
    che §13 aveva tolto.
  */
  const direzione = scopeDirezione();
  const creato = await nuovoModello(direzione);
  const pubblicato = await service.publishDocumentTemplate(
    direzione,
    creato.id,
  );
  const documento = await generaDocumento(direzione, {
    template: pubblicato,
    version: pubblicato.versions[0],
  });

  // Un collaboratore del club A che ha **anche** il club B, e lo tiene attivo
  // come proprietario.
  const doppioClub = {
    userId: USER_SEGRETERIA,
    activeOrganizationId: CLUB_B,
    allowedOrganizationIds: [CLUB_A, CLUB_B],
    role: "owner",
  };

  for (const [nome, azione] of [
    ["leggere il modello", () => service.getDocumentTemplate(doppioClub, creato.id)],
    [
      "riscrivere la bozza",
      () =>
        service.updateDocumentTemplateDraft(doppioClub, creato.id, {
          content: "<p>SABOTATO</p>",
        }),
    ],
    ["pubblicare", () => service.publishDocumentTemplate(doppioClub, creato.id)],
    ["cancellare", () => service.deleteDocumentTemplate(doppioClub, creato.id)],
    [
      "leggere il documento",
      () => service.getGeneratedDocument(doppioClub, documento.id),
    ],
    [
      "cambiarne lo stato",
      () =>
        service.advanceGeneratedDocument(doppioClub, documento.id, {
          status: "archived",
        }),
    ],
  ]) {
    await assert.rejects(azione, /Accesso negato/, `${nome} deve fallire`);
  }

  // E la bozza non e stata toccata.
  const riletto = await service.getDocumentTemplate(direzione, creato.id);
  assert.ok(!riletto.draftContent.includes("SABOTATO"));
});

test("un identificativo inesistente e uno altrui dicono la stessa cosa", async () => {
  const direzione = scopeDirezione();
  const creato = await nuovoModello(direzione);

  const altroClub = {
    userId: USER_SEGRETERIA,
    activeOrganizationId: CLUB_B,
    allowedOrganizationIds: [CLUB_A, CLUB_B],
    role: "owner",
  };

  const inesistente = await service
    .getDocumentTemplate(direzione, "44444444-0000-4000-8000-00000000000d")
    .catch((error) => error.message);
  const altrui = await service
    .getDocumentTemplate(altroClub, creato.id)
    .catch((error) => error.message);

  assert.equal(inesistente, altrui);
});

test("cambiare solo il soggetto crea una versione, e la schermata lo sa", async () => {
  const scope = scopeDirezione();
  // Un modello che nomina il solo club: valido per qualunque soggetto.
  const creato = await service.createDocumentTemplate(scope, {
    title: "Delibera",
    subjectKind: "person",
    content: "<p>{{club.name}} — {{current_date}}</p>",
  });
  const v1 = await service.publishDocumentTemplate(scope, creato.id);
  assert.equal(v1.publishedVersion, 1);

  const conSoggettoNuovo = await service.updateDocumentTemplateDraft(
    scope,
    creato.id,
    { subjectKind: "athlete" },
  );

  /*
    Prima il confronto guardava solo titolo e contenuto: la riga diceva
    «atleta», la versione pubblicata «persona», la schermata abilitava la
    generazione e il server la rifiutava — senza che «ci sono modifiche non
    pubblicate» comparisse mai.
  */
  assert.equal(conSoggettoNuovo.hasUnpublishedChanges, true);

  const v2 = await service.publishDocumentTemplate(scope, creato.id);
  assert.equal(v2.publishedVersion, 2);
  assert.equal(v2.versions[0].version, 2);
});
