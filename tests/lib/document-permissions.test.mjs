import assert from "node:assert/strict";
import test from "node:test";

import {
  canAdvanceGeneratedDocument,
  canGenerateDocumentWithSensitivity,
  canManageDocumentTemplates,
  canReadDocumentTemplates,
  canReadGeneratedDocument,
  explainGenerationDenial,
} from "../../src/lib/documents/permissions.ts";
/*
  W5-D01. I tre predicati sui consensi vivevano in `documents/permissions.ts` e
  si riducevano tutti e tre a `documents.templates.read`: una chiave del dominio
  *documenti* decideva tre atti sui *consensi*. Adesso hanno il loro dominio, e
  le prove restano qui perche provano ancora la stessa matrice.
*/
import {
  canManageConsentDefinitions,
  canReadConsentRecords,
  canRecordConsentDecision,
} from "../../src/lib/consents/permissions.ts";
import { canAccessPath, canAccessClubResource } from "../../src/lib/access-roles.ts";

/**
 * La matrice dei permessi documentali, provata riga per riga.
 *
 * **Il difetto che questi test presidiano (W3-14).** Prima della Wave 3, e
 * misurato a runtime con `scripts/wave-3-permissions-probe.mjs`: collaboratore
 * e staff rispondevano `200` a creare, modificare e cancellare un modello
 * attraverso il CRUD generico, e `403` a generarne un documento. Potevano
 * riscrivere il testo che la societa firma, e non potevano stamparne una
 * copia.
 *
 * Le due porte da chiudere erano due, ed e la ragione per cui qui si prova
 * **anche** `access-roles`: chiudere la pagina senza chiudere la rotta avrebbe
 * spostato il difetto invece di risolverlo.
 */

const RUOLI = ["owner", "club_manager", "collaborator", "staff", "trainer"];

test("i modelli li scrive la direzione del club, e nessun altro", () => {
  assert.equal(canManageDocumentTemplates("owner"), true);
  assert.equal(canManageDocumentTemplates("club_manager"), true);
  assert.equal(canManageDocumentTemplates("collaborator"), false);
  assert.equal(canManageDocumentTemplates("staff"), false);
  assert.equal(canManageDocumentTemplates("trainer"), false);
  assert.equal(canManageDocumentTemplates(null), false);
});

test("i modelli li legge chi lavora in segreteria, non l'allenatore", () => {
  assert.equal(canReadDocumentTemplates("collaborator"), true);
  assert.equal(canReadDocumentTemplates("staff"), true);
  assert.equal(canReadDocumentTemplates("trainer"), false);
  assert.equal(canReadDocumentTemplates("parent"), false);
});

test("la pagina Modulistica e la rotta dicono la stessa cosa", () => {
  /*
    La pagina **si apre** anche alla segreteria, ed e la correzione dell'audit
    di fine Wave. Chiuderla a proprietario e gestore rendeva irraggiungibili
    quattro righe della matrice del §13 — vedere i modelli, generare cio che
    non porta dati delicati, la generazione massiva, rileggere i propri
    documenti — e faceva vedere al collaboratore una voce di menu che lo
    rimbalzava senza una parola.

    Il difetto vero di `W3-14` erano le **rotte**, ed e li che resta chiuso:
    un modello lo scrive la direzione, e nessun ruolo lo tocca dal CRUD
    generico.
  */
  assert.equal(canAccessPath("owner", "/modulistica"), true);
  assert.equal(canAccessPath("club_manager", "/modulistica"), true);
  assert.equal(canAccessPath("collaborator", "/modulistica"), true);
  assert.equal(canAccessPath("staff", "/modulistica"), true);
  assert.equal(canAccessPath("trainer", "/modulistica"), false);
  assert.equal(canAccessPath("parent", "/modulistica"), false);

  // La rotta del CRUD generico, che e da dove la sonda otteneva i suoi 200.
  for (const azione of ["create", "update", "delete"]) {
    assert.equal(
      canAccessClubResource("collaborator", "document_templates", azione),
      false,
      `collaboratore non deve poter ${azione} un modello`,
    );
    assert.equal(
      canAccessClubResource("staff", "document_templates", azione),
      false,
      `staff non deve poter ${azione} un modello`,
    );
  }
  assert.equal(
    canAccessClubResource("owner", "document_templates", "update"),
    true,
  );
  assert.equal(
    canAccessClubResource("trainer", "document_templates", "read"),
    false,
  );
});

test("un documento senza dati delicati lo genera anche la segreteria", () => {
  for (const ruolo of ["owner", "club_manager", "collaborator", "staff"]) {
    assert.equal(
      canGenerateDocumentWithSensitivity(ruolo, []),
      true,
      `${ruolo} deve poter generare un documento senza dati delicati`,
    );
  }
  assert.equal(canGenerateDocumentWithSensitivity("trainer", []), false);
  assert.equal(canGenerateDocumentWithSensitivity("parent", []), false);
});

test("un documento con importi lo genera solo la direzione", () => {
  assert.equal(
    canGenerateDocumentWithSensitivity("owner", ["economic"]),
    true,
  );
  assert.equal(
    canGenerateDocumentWithSensitivity("club_manager", ["economic"]),
    true,
  );
  assert.equal(
    canGenerateDocumentWithSensitivity("collaborator", ["economic"]),
    false,
  );
  assert.equal(
    canGenerateDocumentWithSensitivity("staff", ["economic"]),
    false,
  );
});

test("un documento con dati sanitari lo genera solo la direzione", () => {
  assert.equal(canGenerateDocumentWithSensitivity("owner", ["health"]), true);
  assert.equal(
    canGenerateDocumentWithSensitivity("collaborator", ["health"]),
    false,
  );
});

test("un compenso pretende il permesso del lavoro sportivo, non basta la direzione", () => {
  // `club_manager` ha `sport_work.read`; un collaboratore no, e nemmeno con
  // il permesso di configurazione lo otterrebbe.
  assert.equal(
    canGenerateDocumentWithSensitivity("club_manager", ["compensation"]),
    true,
  );
  assert.equal(
    canGenerateDocumentWithSensitivity("collaborator", ["compensation"]),
    false,
  );
  assert.equal(
    canGenerateDocumentWithSensitivity("trainer", ["compensation"]),
    false,
  );
});

test("il diniego dice perche, e il permesso non dice niente", () => {
  assert.equal(explainGenerationDenial("owner", ["economic"]), null);
  assert.equal(explainGenerationDenial("collaborator", []), null);

  const importi = explainGenerationDenial("collaborator", ["economic"]);
  assert.match(importi, /Accesso negato/);
  assert.match(importi, /importi/i);

  const sanitari = explainGenerationDenial("staff", ["health"]);
  assert.match(sanitari, /Accesso negato/);
  assert.match(sanitari, /sanitari/i);

  const allenatore = explainGenerationDenial("trainer", []);
  assert.match(allenatore, /Accesso negato/);
});

test("chi non poteva generarlo rilegge solo cio che ha generato", () => {
  const conImporti = {
    sensitivity: ["economic"],
    generated_by: "utente-direzione",
  };
  const senzaImporti = {
    sensitivity: [],
    generated_by: "utente-segreteria",
  };

  // La direzione rilegge tutto.
  assert.equal(
    canReadGeneratedDocument("owner", conImporti, "chiunque"),
    true,
  );

  // Il collaboratore non rilegge un documento con importi che non ha prodotto…
  assert.equal(
    canReadGeneratedDocument("collaborator", conImporti, "utente-segreteria"),
    false,
  );
  // …nemmeno se lo avesse prodotto lui un tempo? No: se lo ha prodotto lui, si.
  assert.equal(
    canReadGeneratedDocument(
      "collaborator",
      { sensitivity: ["economic"], generated_by: "utente-segreteria" },
      "utente-segreteria",
    ),
    true,
  );
  // Un documento senza dati delicati lo rilegge chiunque in segreteria.
  assert.equal(
    canReadGeneratedDocument("staff", senzaImporti, "un-altro"),
    true,
  );
  // L'allenatore no, mai.
  assert.equal(
    canReadGeneratedDocument("trainer", senzaImporti, "utente-segreteria"),
    false,
  );
  // Un autore vuoto non apre nessuna porta.
  assert.equal(
    canReadGeneratedDocument(
      "collaborator",
      { sensitivity: ["economic"], generated_by: null },
      null,
    ),
    false,
  );
});

test("i consensi: la definizione e configurazione, la decisione e un gesto", () => {
  assert.equal(canManageConsentDefinitions("owner"), true);
  assert.equal(canManageConsentDefinitions("collaborator"), false);

  assert.equal(canRecordConsentDecision("collaborator"), true);
  assert.equal(canRecordConsentDecision("staff"), true);
  assert.equal(canRecordConsentDecision("trainer"), false);

  assert.equal(canReadConsentRecords("staff"), true);
  assert.equal(canReadConsentRecords("trainer"), false);
});

test("portare avanti lo stato di un documento e un gesto di segreteria", () => {
  assert.equal(canAdvanceGeneratedDocument("collaborator"), true);
  assert.equal(canAdvanceGeneratedDocument("trainer"), false);
});

test("nessun ruolo fuori elenco entra per sbaglio", () => {
  for (const ruolo of [...RUOLI, "parent", "athlete", "", null, undefined]) {
    const generabile = canGenerateDocumentWithSensitivity(ruolo, []);
    const atteso = ["owner", "club_manager", "collaborator", "staff"].includes(
      ruolo,
    );
    assert.equal(generabile, atteso, `ruolo ${ruolo}`);
  }
});
