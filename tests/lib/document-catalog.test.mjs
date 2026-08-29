import assert from "node:assert/strict";
import test from "node:test";

import {
  DISTRIBUTABLE_CATALOG,
  DOCUMENT_CATALOG,
  findCatalogEntry,
  isDistributable,
} from "../../src/lib/documents/catalog/index.ts";
import { validateTemplateDraft } from "../../src/lib/documents/template-model.ts";
import { ATTESTATION_TEMPLATE_ID } from "../../src/lib/documents/attestation-template.ts";

/**
 * Il catalogo, e la promessa che porta con se (ADR-0092).
 *
 * **Perche questi test esistono.** Un catalogo e un impegno redazionale: se
 * EasyGame distribuisce un modello, EasyGame risponde di cosa c'e scritto
 * dentro. Le tre cose che devono restare vere per sempre:
 *
 * 1. **niente si distribuisce senza un proprietario e una data di rilettura.**
 *    Un modello senza quelle due informazioni e un modello che nessuno
 *    controlla;
 * 2. **niente si distribuisce se non e pubblicabile.** Una voce che nomina un
 *    segnaposto fuori catalogo o fuori soggetto arriverebbe al club e non si
 *    potrebbe pubblicare: sarebbe un difetto consegnato;
 * 3. **niente di classe C esce.** Le quattro voci che citano norme o spostano
 *    responsabilita sono scritte e ferme, e devono restare ferme finche
 *    qualcuno che puo non le valida.
 */

test("il catalogo iniziale ha dieci voci, non settantasette", () => {
  assert.equal(DOCUMENT_CATALOG.length, 10);
  // Le chiavi sono uniche: e cio che dice se un club ha gia adottato una voce.
  const chiavi = DOCUMENT_CATALOG.map((entry) => entry.key);
  assert.equal(new Set(chiavi).size, chiavi.length);
});

test("si distribuiscono solo le voci di classe A e attive", () => {
  assert.equal(DISTRIBUTABLE_CATALOG.length, 6);

  for (const entry of DISTRIBUTABLE_CATALOG) {
    assert.equal(entry.catalogClass, "A", `${entry.key} non e di classe A`);
    assert.equal(entry.status, "active", `${entry.key} non e attiva`);
  }

  const ferme = DOCUMENT_CATALOG.filter((entry) => !isDistributable(entry));
  assert.equal(ferme.length, 4);
  for (const entry of ferme) {
    assert.equal(
      entry.status,
      "pending_review",
      `${entry.key} non e in attesa di revisione`,
    );
    assert.ok(
      entry.notes && entry.notes.length > 20,
      `${entry.key} non dice perche e ferma`,
    );
  }
});

test("nessuna voce di classe C viene distribuita", () => {
  const distribuiteC = DISTRIBUTABLE_CATALOG.filter(
    (entry) => entry.catalogClass === "C",
  );
  assert.deepEqual(
    distribuiteC.map((entry) => entry.key),
    [],
    "una voce legale o fiscale non validata non puo uscire",
  );
});

test("nessuna voce di classe B esiste: i moduli territoriali non si distribuiscono", () => {
  // E il fossato editoriale di Golee, e il §17 del planning dice che non lo
  // apriamo: trenta moduli territoriali sono una persona al telefono con
  // trenta aziende sanitarie, per sempre.
  const classeB = DOCUMENT_CATALOG.filter((entry) => entry.catalogClass === "B");
  assert.deepEqual(classeB.map((entry) => entry.key), []);
});

test("ogni voce dichiara chi risponde del testo e quando e stato riletto", () => {
  for (const entry of DOCUMENT_CATALOG) {
    assert.ok(
      entry.editorialOwner && entry.editorialOwner.length > 3,
      `${entry.key} non dice chi risponde del testo`,
    );
    assert.match(
      entry.lastReviewedAt,
      /^\d{4}-\d{2}-\d{2}$/,
      `${entry.key} non ha una data di rilettura leggibile`,
    );
  }
});

test("ogni voce distribuibile e pubblicabile cosi com'e", () => {
  for (const entry of DISTRIBUTABLE_CATALOG) {
    const esito = validateTemplateDraft({
      title: entry.title,
      content: entry.content,
      subjectKind: entry.subjectKind,
    });

    assert.equal(
      esito.ok,
      true,
      `${entry.key} non si potrebbe pubblicare: ${esito.issues
        .map((issue) => issue.message)
        .join(" · ")}`,
    );
  }
});

test("anche gli scheletri fermi sono scritti bene, o non servirebbero a chi deve validarli", () => {
  for (const entry of DOCUMENT_CATALOG.filter((voce) => !isDistributable(voce))) {
    const esito = validateTemplateDraft({
      title: entry.title,
      content: entry.content,
      subjectKind: entry.subjectKind,
    });
    assert.equal(
      esito.ok,
      true,
      `${entry.key}: ${esito.issues.map((issue) => issue.message).join(" · ")}`,
    );
    // E dichiarano di non essere validati, dentro il testo che verrebbe
    // stampato: chi lo apre lo deve leggere sul foglio, non nel codice.
    assert.match(
      entry.content,
      /da validare/i,
      `${entry.key} non dichiara di essere uno scheletro`,
    );
  }
});

test("l'attestazione della Wave 1 e la stessa, non una copia", () => {
  const voce = findCatalogEntry(ATTESTATION_TEMPLATE_ID);
  assert.ok(voce, "l'attestazione deve essere in catalogo");
  assert.equal(voce.catalogClass, "A");
  assert.equal(voce.status, "active");
  // Il contenuto arriva da `attestation-template.ts`: se qualcuno lo
  // riscrivesse qui, il club si troverebbe due attestazioni diverse con lo
  // stesso nome.
  assert.match(voce.content, /ATTESTAZIONE DI PAGAMENTO E FREQUENZA/);
});

test("le voci con gli importi sono dichiarate tali, e sono quelle che ci si aspetta", () => {
  const conImporti = DISTRIBUTABLE_CATALOG.filter((entry) => {
    const esito = validateTemplateDraft({
      title: entry.title,
      content: entry.content,
      subjectKind: entry.subjectKind,
    });
    return esito.sensitivity.includes("economic");
  }).map((entry) => entry.key);

  assert.deepEqual(conImporti.sort(), [
    "attestazione-bando-voucher",
    "attestazione-pagamento-frequenza",
    "avviso-versamento-quota",
  ]);

  // E l'attestazione di sola frequenza **non** ne ha: e la ragione per cui
  // esiste come modello a parte.
  const soloFrequenza = validateTemplateDraft({
    title: "x",
    content: findCatalogEntry("attestazione-frequenza").content,
    subjectKind: "athlete",
  });
  assert.deepEqual(soloFrequenza.sensitivity, []);
});

test("una chiave che non esiste non restituisce niente", () => {
  assert.equal(findCatalogEntry("modulo-asl-bergamo"), null);
  assert.equal(findCatalogEntry(""), null);
  assert.equal(findCatalogEntry(null), null);
});
