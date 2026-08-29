import assert from "node:assert/strict";
import test from "node:test";

import {
  DOCUMENT_ENGINE_INVARIANTS,
  GENERATED_DOCUMENT_STATUSES,
  MAX_TEMPLATE_CONTENT_CHARS,
  TEMPLATE_STATUSES,
  canTransitionGeneratedDocument,
  canTransitionTemplate,
  nextTemplateVersion,
  requiresSignedAttachment,
  validateTemplateDraft,
} from "../../src/lib/documents/template-model.ts";
import {
  DOCUMENT_TEMPLATE_TOKENS,
  ECONOMIC_PLACEHOLDER_KEYS,
  collectPlaceholderSensitivities,
  getPlaceholderSensitivity,
  getPlaceholderSubject,
  isEconomicPlaceholderKey,
  listPlaceholderTokensForSubject,
} from "../../src/lib/documents/placeholders.ts";

/**
 * Le invarianti del motore documentale, provate senza database.
 *
 * **Perche stanno nella barriera e non in una lane.** «Un documento gia
 * rilasciato non cambia mai» non e una proprieta di chi scrive il codice del
 * Template Core: e una proprieta che ogni lane deve rispettare. Se vive in un
 * modulo puro con i suoi test, nessuna schermata puo reinterpretarla.
 */

test("gli stati di un modello sono tre, e ritirare non e cancellare", () => {
  assert.deepEqual([...TEMPLATE_STATUSES], ["draft", "active", "retired"]);

  assert.equal(canTransitionTemplate("draft", "active"), true);
  assert.equal(canTransitionTemplate("active", "retired"), true);
  // Si riattiva: la richiesta di visita medica serve a settembre, non a
  // febbraio, e riaccenderla non deve costare una copia.
  assert.equal(canTransitionTemplate("retired", "active"), true);
  // Una bozza non si ritira: non e mai stata in uso.
  assert.equal(canTransitionTemplate("draft", "retired"), false);
  assert.equal(canTransitionTemplate("draft", "sconosciuto"), false);
});

test("un documento generato non torna indietro fino a «appena generato»", () => {
  assert.equal(GENERATED_DOCUMENT_STATUSES.length, 6);

  assert.equal(
    canTransitionGeneratedDocument("generated", "awaiting_signature"),
    true,
  );
  assert.equal(
    canTransitionGeneratedDocument("awaiting_signature", "signed"),
    true,
  );
  // Rientra la copia sbagliata: si torna in attesa, non alla generazione.
  assert.equal(
    canTransitionGeneratedDocument("signed", "awaiting_signature"),
    true,
  );
  assert.equal(canTransitionGeneratedDocument("signed", "generated"), false);
  // Archiviato e terminale.
  assert.equal(canTransitionGeneratedDocument("archived", "issued"), false);
});

test("«firmato» pretende l'allegato, altrimenti e una spunta", () => {
  assert.equal(requiresSignedAttachment("signed"), true);
  assert.equal(requiresSignedAttachment("awaiting_signature"), false);
  assert.equal(requiresSignedAttachment("issued"), false);
});

test("le versioni partono da 1 e crescono di uno", () => {
  assert.equal(nextTemplateVersion(0), 1);
  assert.equal(nextTemplateVersion(null), 1);
  assert.equal(nextTemplateVersion(undefined), 1);
  assert.equal(nextTemplateVersion(3), 4);
  assert.equal(nextTemplateVersion("7"), 8);
});

test("un segnaposto fuori catalogo impedisce la pubblicazione, e dice quale", () => {
  const esito = validateTemplateDraft({
    title: "Attestazione",
    subjectKind: "athlete",
    // `fiscalCode` e proprio la chiave che il «generatore IA» di /modulistica
    // scriveva: fuori catalogo, quindi bianca per sempre.
    content: "<p>{{athlete.first_name}} — {{fiscalCode}}</p>",
  });

  assert.equal(esito.ok, false);
  const fuoriCatalogo = esito.issues.find((issue) => issue.key === "fiscalCode");
  assert.ok(fuoriCatalogo, "la chiave fuori catalogo deve essere dichiarata");
  assert.match(fuoriCatalogo.message, /non e un segnaposto/i);
});

test("un segnaposto fuori soggetto viene dichiarato, non lasciato bianco", () => {
  const esito = validateTemplateDraft({
    title: "Contratto",
    subjectKind: "athlete",
    content: "<p>{{athlete.first_name}} e {{trainer.first_name}}</p>",
  });

  assert.equal(esito.ok, false);
  const fuoriSoggetto = esito.issues.find(
    (issue) => issue.key === "trainer.first_name",
  );
  assert.ok(fuoriSoggetto, "una chiave senza soggetto deve essere dichiarata");
  assert.match(fuoriSoggetto.message, /parla di person/i);
});

test("una bozza valida passa, e dice cosa chiedera e quanto e delicata", () => {
  const esito = validateTemplateDraft({
    title: "Attestazione di pagamento",
    subjectKind: "athlete",
    content:
      "<p>{{club.name}} — {{athlete.first_name}} — {{payment.total_paid}} — {{current_date}}</p>",
  });

  assert.equal(esito.ok, true, JSON.stringify(esito.issues));
  assert.deepEqual(esito.sensitivity, ["economic"]);
  assert.ok(esito.placeholderKeys.includes("payment.total_paid"));
  assert.ok(esito.placeholderKeys.includes("club.name"));
});

test("un modello senza soggetto, senza titolo o troppo grande non si pubblica", () => {
  const senzaTitolo = validateTemplateDraft({
    title: "   ",
    subjectKind: "athlete",
    content: "<p>x</p>",
  });
  assert.equal(senzaTitolo.ok, false);
  assert.ok(senzaTitolo.issues.some((issue) => issue.field === "title"));

  const senzaSoggetto = validateTemplateDraft({
    title: "Modello",
    subjectKind: "sponsor",
    content: "<p>x</p>",
  });
  assert.equal(senzaSoggetto.ok, false);
  assert.ok(senzaSoggetto.issues.some((issue) => issue.field === "subject"));

  const troppoGrande = validateTemplateDraft({
    title: "Modello",
    subjectKind: "club",
    content: "x".repeat(MAX_TEMPLATE_CONTENT_CHARS + 1),
  });
  assert.equal(troppoGrande.ok, false);
  assert.ok(
    troppoGrande.issues.some((issue) =>
      /caratteri/i.test(issue.message),
    ),
  );
});

test("il soggetto filtra cio che l'editor puo proporre", () => {
  const perAtleta = listPlaceholderTokensForSubject("athlete").map(
    (token) => token.value,
  );
  const perClub = listPlaceholderTokensForSubject("club").map(
    (token) => token.value,
  );

  // Il club c'e sempre, per qualunque soggetto.
  assert.ok(perAtleta.includes("{{club.name}}"));
  assert.ok(perClub.includes("{{club.name}}"));
  // La data corrente non dipende da nessun soggetto.
  assert.ok(perClub.includes("{{current_date}}"));
  // Gli importi dell'atleta non si propongono a un modello del club.
  assert.ok(perAtleta.includes("{{payment.total_paid}}"));
  assert.ok(!perClub.includes("{{payment.total_paid}}"));
});

test("la sensibilita e una proprieta della chiave, e l'elenco economico e derivato", () => {
  // Le sei chiavi economiche di Wave 2, invariate: se qualcuno ne aggiunge una
  // al catalogo senza pensarci, questo test lo mette davanti alla decisione.
  assert.deepEqual([...ECONOMIC_PLACEHOLDER_KEYS].sort(), [
    "installment.overdue_count",
    "installment.residual_amount",
    "payment.link",
    "payment.remaining",
    "payment.total_due",
    "payment.total_paid",
  ]);

  assert.equal(isEconomicPlaceholderKey("payment.remaining"), true);
  // «Quando», non «quanto»: la scadenza non e un dato economico.
  assert.equal(isEconomicPlaceholderKey("installment.due_date"), false);

  assert.equal(getPlaceholderSensitivity("payment.total_paid"), "economic");
  assert.equal(
    getPlaceholderSensitivity("medical_certificate.status"),
    "health",
  );
  assert.equal(getPlaceholderSensitivity("club.name"), "plain");
  assert.equal(getPlaceholderSubject("athlete.first_name"), "athlete");
  assert.equal(getPlaceholderSubject("club.name"), "club");

  assert.deepEqual(
    collectPlaceholderSensitivities([
      "club.name",
      "payment.remaining",
      "medical_certificate.status",
    ]),
    ["economic", "health"],
  );
  assert.deepEqual(collectPlaceholderSensitivities(["club.name"]), []);
});

test("nessuna chiave del catalogo resta senza contratto", () => {
  // Il predefinito `club` esiste per non far esplodere niente, ma una chiave
  // che ci ricade **per dimenticanza** verrebbe proposta in ogni modello e
  // resterebbe bianca: e esattamente il debito DOC-04 che rientrerebbe dalla
  // finestra. Solo il nome del club e i suoi dati possono essere `club`.
  const senzaContratto = DOCUMENT_TEMPLATE_TOKENS.filter(
    (token) => token.subject === undefined,
  ).map((token) => token.value);

  assert.deepEqual(
    senzaContratto,
    [],
    `queste chiavi non dichiarano un soggetto: ${senzaContratto.join(", ")}`,
  );

  // E ogni chiave dichiara anche chi produce il suo dato: serve a sapere, fra
  // un anno, dove andare a guardare quando un numero non torna.
  const senzaProprietario = DOCUMENT_TEMPLATE_TOKENS.filter(
    (token) => !token.owner,
  ).map((token) => token.value);
  assert.deepEqual(senzaProprietario, []);
});

test("sponsor, fornitori ed eventi non sono soggetti di nessun documento", () => {
  for (const soggetto of ["club", "athlete", "person", "member"]) {
    const proposte = listPlaceholderTokensForSubject(soggetto).map(
      (token) => token.value,
    );
    assert.ok(
      !proposte.includes("{{sponsor.name}}"),
      `lo sponsor non va proposto a un modello «${soggetto}»`,
    );
    assert.ok(!proposte.includes("{{event.title}}"));
    assert.ok(!proposte.includes("{{supplier.name}}"));
  }

  const esito = validateTemplateDraft({
    title: "Lettera allo sponsor",
    subjectKind: "club",
    content: "<p>{{sponsor.name}}</p>",
  });
  assert.equal(esito.ok, false);
  assert.ok(esito.issues.some((issue) => issue.key === "sponsor.name"));
});

test("le invarianti del motore sono scritte, non sottintese", () => {
  assert.ok(DOCUMENT_ENGINE_INVARIANTS.length >= 10);
  assert.ok(
    DOCUMENT_ENGINE_INVARIANTS.some((riga) =>
      /non e un allegato/i.test(riga),
    ),
  );
  assert.ok(
    DOCUMENT_ENGINE_INVARIANTS.some((riga) => /revoca/i.test(riga)),
  );
});
