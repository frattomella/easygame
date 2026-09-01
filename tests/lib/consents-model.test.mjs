import assert from "node:assert/strict";
import test from "node:test";

import {
  CONSENT_DEFINITION_STATUSES,
  CONSENT_INVARIANTS,
  CONSENT_SOURCES,
  CONSENT_STATUSES,
  CONSENT_SUBJECT_KINDS,
  MAX_CONSENT_KEY_LENGTH,
  canApplyConsentDecision,
  canTransitionConsentDefinition,
  consentSubjectKey,
  deriveConsentState,
  explainConsentDecisionDenial,
  explainConsentKeyDenial,
  isValidConsentKey,
  nextConsentVersion,
  sortConsentRecords,
  validateConsentDefinitionDraft,
  validateConsentVersionDraft,
} from "../../src/lib/consents/model.ts";

/**
 * Il dominio dei consensi, provato senza database.
 *
 * Le tre proprieta che vanno dimostrate e non affermate:
 *
 * 1. **lo stato si deriva.** Non e una colonna: e l'ultima decisione per
 *    (definizione, soggetto). Se la derivazione sbaglia, sbaglia ovunque —
 *    nella schermata, nel servizio e in qualunque lane che la importi;
 * 2. **l'ordine e deterministico.** Due decisioni con lo stesso istante
 *    capitano davvero, e senza uno spareggio stabile «questa persona ha
 *    revocato» diventerebbe una risposta che cambia da una query all'altra;
 * 3. **una revoca non cancella.** Dopo la revoca l'accettazione di settembre
 *    deve restare nello storico, o non e piu dimostrabile.
 */

const record = (overrides) => ({
  id: "r1",
  definitionId: "def-1",
  subjectKind: "athlete",
  subjectId: "atleta-1",
  versionId: "v1",
  version: 1,
  status: "accepted",
  decidedAt: "2026-09-01T10:00:00.000Z",
  createdAt: "2026-09-01T10:00:00.000Z",
  ...overrides,
});

test("il vocabolario e chiuso, e dice cose diverse con parole diverse", () => {
  assert.deepEqual([...CONSENT_STATUSES], ["accepted", "rejected", "revoked"]);
  /*
    `subject` e la quinta, e nasce con la Wave 5: fino a li ogni decisione la
    registrava la segreteria, e nel registro tutte si assomigliavano. «L'ha
    spuntata il tutore nella propria area, autenticato» ha un valore probatorio
    diverso da «gliel'ha spuntata qualcun altro», e chi legge il registro un
    anno dopo deve poterlo distinguere senza aprire l'evidenza.
  */
  assert.deepEqual(
    [...CONSENT_SOURCES],
    ["public_form", "internal_form", "manual", "import", "subject"],
  );
  assert.deepEqual(
    [...CONSENT_SUBJECT_KINDS],
    ["athlete", "person", "member", "guardian"],
  );
  assert.deepEqual(
    [...CONSENT_DEFINITION_STATUSES],
    ["draft", "active", "retired"],
  );
});

test("una definizione si ritira e si riattiva, ma non si pubblica saltando la bozza", () => {
  assert.equal(canTransitionConsentDefinition("draft", "active"), true);
  assert.equal(canTransitionConsentDefinition("active", "retired"), true);
  // Si riattiva: un consenso sospeso per una stagione non deve costare una
  // definizione nuova, che spezzerebbe in due lo storico della stessa persona.
  assert.equal(canTransitionConsentDefinition("retired", "active"), true);
  // Una bozza non si ritira: non e mai stata in uso.
  assert.equal(canTransitionConsentDefinition("draft", "retired"), false);
  assert.equal(canTransitionConsentDefinition("active", "sconosciuto"), false);
});

test("non si revoca un consenso che non risulta dato", () => {
  assert.equal(canApplyConsentDecision(null, "accepted"), true);
  assert.equal(canApplyConsentDecision(null, "rejected"), true);
  assert.equal(canApplyConsentDecision(null, "revoked"), false);
  assert.equal(
    explainConsentDecisionDenial(null, "revoked"),
    "Non risulta nessun consenso da revocare per questo soggetto",
  );

  assert.equal(canApplyConsentDecision("accepted", "revoked"), true);
  // Dopo una revoca si torna a dire di si: e cio che accade a ogni versione
  // nuova dell'informativa.
  assert.equal(canApplyConsentDecision("revoked", "accepted"), true);
  assert.equal(canApplyConsentDecision("revoked", "revoked"), false);
  // Ritirare un consenso dato e una revoca, non un rifiuto: chiamarlo rifiuto
  // perderebbe la differenza fra «non ha mai acconsentito» e «ha cambiato idea».
  assert.equal(canApplyConsentDecision("accepted", "rejected"), false);
  assert.match(
    String(explainConsentDecisionDenial("accepted", "rejected")),
    /revoca/i,
  );
  assert.equal(explainConsentDecisionDenial("accepted", "revoked"), null);
});

test("la chiave e minuscola, breve e senza spazi", () => {
  assert.equal(isValidConsentKey("privacy"), true);
  assert.equal(isValidConsentKey("consenso_immagini-2026"), true);
  assert.equal(isValidConsentKey("Privacy"), true, "si normalizza, non si rifiuta");
  assert.equal(isValidConsentKey("consenso immagini"), false);
  assert.equal(isValidConsentKey("privacy!"), false);
  assert.equal(isValidConsentKey(""), false);
  assert.equal(isValidConsentKey("x".repeat(MAX_CONSENT_KEY_LENGTH)), true);
  assert.equal(isValidConsentKey("x".repeat(MAX_CONSENT_KEY_LENGTH + 1)), false);

  assert.match(String(explainConsentKeyDenial("")), /chiave/i);
  assert.match(
    String(explainConsentKeyDenial("x".repeat(41))),
    /40 caratteri/,
  );
  assert.equal(explainConsentKeyDenial("images"), null);
});

test("una bozza senza titolo o senza testo non si pubblica, e dice quale dei due manca", () => {
  const senzaTitolo = validateConsentDefinitionDraft({
    key: "privacy",
    title: "  ",
  });
  assert.equal(senzaTitolo.ok, false);
  assert.deepEqual(
    senzaTitolo.issues.map((issue) => issue.field),
    ["title"],
  );

  assert.equal(
    validateConsentDefinitionDraft({ key: "privacy", title: "Informativa" }).ok,
    true,
  );

  const senzaTesto = validateConsentVersionDraft({ bodyText: "   " });
  assert.equal(senzaTesto.ok, false);
  assert.deepEqual(
    senzaTesto.issues.map((issue) => issue.field),
    ["body"],
  );
});

test("le versioni partono da 1, perche «versione 0» non si dice a una persona", () => {
  assert.equal(nextConsentVersion(0), 1);
  assert.equal(nextConsentVersion(null), 1);
  assert.equal(nextConsentVersion(undefined), 1);
  assert.equal(nextConsentVersion(3), 4);
});

test("senza nessuna decisione lo stato e «manca», non «rifiutato»", () => {
  const stato = deriveConsentState([]);
  assert.equal(stato.status, "missing");
  assert.equal(stato.recordId, null);
  assert.equal(stato.decidedAt, null);
  assert.equal(stato.historyCount, 0);
  assert.equal(stato.onOutdatedVersion, false);

  assert.equal(deriveConsentState(null).status, "missing");
  assert.equal(deriveConsentState(undefined).status, "missing");
});

test("accettazione, revoca, riaccettazione: tre righe, e lo stato e l'ultima", () => {
  const storico = [
    record({
      id: "r1",
      status: "accepted",
      decidedAt: "2026-09-01T10:00:00.000Z",
    }),
    record({
      id: "r2",
      status: "revoked",
      decidedAt: "2027-01-15T09:00:00.000Z",
    }),
    record({
      id: "r3",
      status: "accepted",
      decidedAt: "2027-03-02T08:30:00.000Z",
    }),
  ];

  const stato = deriveConsentState(storico, { publishedVersion: 1 });
  assert.equal(stato.status, "accepted");
  assert.equal(stato.recordId, "r3");
  assert.equal(stato.versionId, "v1");
  assert.equal(stato.decidedAt, "2027-03-02T08:30:00.000Z");

  /*
    **La revoca non ha cancellato niente.** E il punto per cui il dominio
    esiste: se qualcuno contesta una foto pubblicata a ottobre, la domanda non
    e «vale adesso» ma «valeva quel giorno», e a quella un archivio che
    cancella non sa rispondere.
  */
  assert.equal(stato.historyCount, 3);
  assert.equal(
    sortConsentRecords(storico).map((riga) => riga.id).join(","),
    "r1,r2,r3",
  );

  // L'ordine di arrivo non conta: conta la data della decisione.
  const rimescolato = [storico[2], storico[0], storico[1]];
  assert.equal(deriveConsentState(rimescolato).recordId, "r3");
});

test("a parita di istante lo spareggio e deterministico, non l'ordine di arrivo", () => {
  const istante = "2026-09-01T10:00:00.000Z";

  const storico = [
    record({
      id: "b",
      status: "revoked",
      decidedAt: istante,
      createdAt: "2026-09-01T10:00:02.000Z",
    }),
    record({
      id: "a",
      status: "accepted",
      decidedAt: istante,
      createdAt: "2026-09-01T10:00:01.000Z",
    }),
  ];

  // `created_at` spareggia per primo: vince la revoca, che e stata scritta dopo.
  assert.equal(deriveConsentState(storico).status, "revoked");
  assert.equal(deriveConsentState([...storico].reverse()).status, "revoked");

  // Quando anche `created_at` coincide, spareggia l'id: non significa niente,
  // ma e stabile — ed e la stabilita che serve.
  const pariMerito = [
    record({ id: "zz", status: "revoked", decidedAt: istante, createdAt: istante }),
    record({ id: "aa", status: "accepted", decidedAt: istante, createdAt: istante }),
  ];
  assert.equal(deriveConsentState(pariMerito).recordId, "zz");
  assert.equal(deriveConsentState([...pariMerito].reverse()).recordId, "zz");
});

test("una versione nuova non invalida i consensi vecchi: li segnala", () => {
  const storico = [
    record({ id: "r1", status: "accepted", versionId: "v1", version: 1 }),
  ];

  // Finche V1 e la versione pubblicata, non c'e niente da segnalare.
  assert.equal(
    deriveConsentState(storico, { publishedVersion: 1 }).onOutdatedVersion,
    false,
  );

  // Pubblicata V2, il consenso resta **accettato** — non decade — ed e
  // dichiarato come dato su un testo precedente: e il club a decidere se
  // richiederlo.
  const dopoV2 = deriveConsentState(storico, { publishedVersion: 2 });
  assert.equal(dopoV2.status, "accepted");
  assert.equal(dopoV2.versionId, "v1");
  assert.equal(dopoV2.version, 1);
  assert.equal(dopoV2.onOutdatedVersion, true);

  // Riaccettato su V2, la segnalazione sparisce.
  const riaccettato = deriveConsentState(
    [
      ...storico,
      record({
        id: "r2",
        status: "accepted",
        versionId: "v2",
        version: 2,
        decidedAt: "2027-01-01T00:00:00.000Z",
      }),
    ],
    { publishedVersion: 2 },
  );
  assert.equal(riaccettato.onOutdatedVersion, false);
  assert.equal(riaccettato.versionId, "v2");

  /*
    Di una **revoca** non interessa su quale testo e stata registrata: la
    segnalazione «versione superata» direbbe al club di richiedere un consenso
    a chi lo ha appena ritirato.
  */
  const revocatoSuV1 = deriveConsentState(
    [
      ...storico,
      record({
        id: "r2",
        status: "revoked",
        versionId: "v1",
        version: 1,
        decidedAt: "2027-01-01T00:00:00.000Z",
      }),
    ],
    { publishedVersion: 2 },
  );
  assert.equal(revocatoSuV1.status, "revoked");
  assert.equal(revocatoSuV1.onOutdatedVersion, false);
});

test("una riga con uno stato illeggibile non decide per le altre", () => {
  const storico = [
    record({ id: "r1", status: "accepted" }),
    record({
      id: "r2",
      status: "boh",
      decidedAt: "2027-01-01T00:00:00.000Z",
    }),
  ];

  const stato = deriveConsentState(storico);
  assert.equal(stato.status, "accepted");
  assert.equal(stato.historyCount, 1);
});

test("la chiave di raggruppamento del soggetto si scrive in un posto solo", () => {
  assert.equal(consentSubjectKey("Athlete", " atleta-1 "), "athlete:atleta-1");
  assert.notEqual(
    consentSubjectKey("athlete", "1"),
    consentSubjectKey("member", "1"),
  );
});

test("le invarianti del dominio sono dichiarate in codice, non solo nel documento", () => {
  assert.ok(CONSENT_INVARIANTS.length >= 6);
  assert.ok(
    CONSENT_INVARIANTS.some((riga) => /revoca non cancella/i.test(riga)),
  );
  assert.ok(
    CONSENT_INVARIANTS.some((riga) => /non e una colonna/i.test(riga)),
  );
});
