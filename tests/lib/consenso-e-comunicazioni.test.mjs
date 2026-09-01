import assert from "node:assert/strict";
import test, { before } from "node:test";

/**
 * **La regola di prodotto del §15.1, in codice.**
 *
 * Il piano della Wave 6 la scrive in una tabella: solo la classe «marketing e
 * generica» e governata dal consenso; sicurezza, amministrativa necessaria,
 * pagamento, sanitaria e sportiva passano. Un documento non e un presidio: se
 * quella tabella e la mappa che il codice applica divergono, il primo a
 * scoprirlo e un club che smette di poter sollecitare una rata.
 *
 * Qui si prova soprattutto cio che **deve passare**. Un test che verificasse
 * solo «il messaggio promozionale chiede il consenso» passerebbe anche su una
 * regola che li blocca tutti.
 */

let catalogo;
let destinatari;

before(async () => {
  catalogo = await import("../../src/lib/consents/catalog.ts");
  destinatari = await import("../../src/lib/audience/recipients.ts");
});

test("solo marketing e media sono governati dal consenso", () => {
  assert.deepEqual(catalogo.GOVERNED_COMMUNICATION_KINDS.slice().sort(), [
    "club_broadcast",
    "club_digest",
    "media_publication",
  ]);
});

test("la comunicazione massiva e il digest chiedono il consenso «marketing»", () => {
  assert.equal(
    catalogo.consentKeyForCommunication("club_broadcast"),
    "marketing",
  );
  assert.equal(catalogo.consentKeyForCommunication("club_digest"), "marketing");
});

test("sicurezza, amministrativa, pagamento, sanitaria e sportiva passano", () => {
  const devonoPassare = [
    "auth_email_verification",
    "auth_phone_verification",
    "auth_password_reset",
    "auth_access_credentials",
    "form_submission_outcome",
    "document_request",
    "document_request_reminder",
    "document_expiry",
    "appointment_decision",
    "enrollment_outcome",
    "payment_reminder",
    "payment_overdue",
    "payment_link",
    "medical_certificate_reminder",
    "event_convocation",
    "event_rsvp_invite",
    "board_announcement",
  ];

  for (const kind of devonoPassare) {
    assert.equal(
      catalogo.consentKeyForCommunication(kind),
      null,
      `${kind} non deve dipendere da un consenso`,
    );
  }
});

test("un percorso non censito passa, invece di bloccarsi in silenzio", () => {
  assert.equal(catalogo.consentKeyForCommunication("qualcosa_di_nuovo"), null);
  assert.equal(catalogo.communicationClassOf("qualcosa_di_nuovo"), null);
});

test("ogni percorso censito ha una classe fra quelle dichiarate", () => {
  for (const [kind, klass] of Object.entries(
    catalogo.COMMUNICATION_KIND_CLASSES,
  )) {
    assert.ok(
      catalogo.COMMUNICATION_CLASSES.includes(klass),
      `${kind} dichiara la classe sconosciuta ${klass}`,
    );
  }
});

test("le chiavi predefinite hanno un'etichetta e sono valide per il dominio", async () => {
  const modello = await import("../../src/lib/consents/model.ts");

  assert.ok(catalogo.STANDARD_CONSENT_DEFINITIONS.length >= 3);

  for (const definizione of catalogo.STANDARD_CONSENT_DEFINITIONS) {
    assert.ok(
      modello.isValidConsentKey(definizione.key),
      `${definizione.key} non passerebbe la validazione del dominio`,
    );
    assert.ok(definizione.title.trim().length > 0);
    assert.ok(catalogo.isStandardConsentKey(definizione.key));
  }
});

/* -------------------------------------------- il motivo di esclusione */

test("«consenso revocato» e un motivo dell'enum chiusa, con etichetta", () => {
  assert.equal(
    destinatari.AUDIENCE_EXCLUSION_LABELS.consent_revoked,
    "Consenso revocato o negato per questo tipo di messaggio",
  );
});

test("chi ha revocato esce dal pubblico con il motivo, non in silenzio", () => {
  const insieme = destinatari.buildAudienceSet({
    subjects: [
      {
        athleteId: "a1",
        athleteName: "Rossi Mario",
        contacts: [
          { guardianId: "g1", guardianName: "Maria", email: "a1@example.com", userId: null },
        ],
      },
      {
        athleteId: "a2",
        athleteName: "Verdi Luca",
        consentRevoked: true,
        contacts: [
          { guardianId: "g2", guardianName: "Paolo", email: "a2@example.com", userId: null },
        ],
      },
    ],
  });

  assert.deepEqual(
    insieme.recipients.map((row) => row.email),
    ["a1@example.com"],
  );
  assert.deepEqual(
    insieme.exclusions.map((row) => [row.athleteId, row.reason]),
    [["a2", "consent_revoked"]],
  );
  /* Un atleta escluso per revoca e un soggetto **non raggiunto**. */
  assert.equal(insieme.counts.unreachableSubjects, 1);
});

test("la revoca vince sui contatti: non si dice anche «nessun indirizzo»", () => {
  const insieme = destinatari.buildAudienceSet({
    subjects: [
      {
        athleteId: "a3",
        athleteName: "Neri Anna",
        consentRevoked: true,
        contacts: [],
      },
    ],
  });

  assert.deepEqual(
    insieme.exclusions.map((row) => row.reason),
    ["consent_revoked"],
  );
});

test("un'anagrafica archiviata resta «non attiva», anche se ha revocato", () => {
  const insieme = destinatari.buildAudienceSet({
    subjects: [
      {
        athleteId: "a4",
        athleteName: "Bianchi Ugo",
        active: false,
        consentRevoked: true,
        contacts: [],
      },
    ],
  });

  assert.deepEqual(
    insieme.exclusions.map((row) => row.reason),
    ["not_active"],
  );
});
