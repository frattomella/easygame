import assert from "node:assert/strict";
import test from "node:test";

import {
  describeMedicalCertificateForFamily,
  formatMedicalCertificateDate,
  getMedicalCertificateFamilyState,
} from "../../src/lib/medical-certificates.ts";

/**
 * **PP-02 §F — il certificato, come lo legge una famiglia.**
 *
 * Tre difetti distinti, e ognuno ha una prova qui.
 *
 * 1. **Lo stato senza la data.** Il riquadro della Home diceva «Certificato
 *    valido» e basta. Una famiglia che lo guarda non si chiede «va bene?» ma
 *    «fino a quando?», e la risposta viveva in un'altra card, trenta
 *    centimetri piu in basso.
 *
 * 2. **Il certificato consegnato senza scadenza si leggeva «mancante».**
 *    L'unico dato guardato era la data: senza data lo stato era `missing`,
 *    cioe la stessa parola con cui si dice a una famiglia che il certificato
 *    non lo ha mai portato. Sono due cose che si rimediano in modo diverso —
 *    caricarlo, oppure chiedere alla segreteria di completarlo.
 *
 * 3. **La data si spostava di un giorno.** `expiry_date` e una data senza ora,
 *    in archivio la mezzanotte UTC. Resa con il fuso del lettore, in un fuso
 *    positivo retrocede: un certificato che scade il primo giugno si leggeva
 *    «Scade il 31/05». E la famiglia di AUD-02, e su un certificato medico un
 *    giorno di differenza e la differenza fra poter giocare e no.
 */

const RIFERIMENTO = new Date("2026-09-04T12:00:00.000Z");

/* ------------------------------------------------------------- lo stato */

test("con una scadenza lontana il certificato e valido", () => {
  assert.equal(
    getMedicalCertificateFamilyState(
      { count: 1, expiryDate: "2027-06-01T00:00:00.000Z" },
      RIFERIMENTO,
    ),
    "valid",
  );
});

test("dentro il mese di preavviso e in scadenza", () => {
  assert.equal(
    getMedicalCertificateFamilyState(
      { count: 1, expiryDate: "2026-09-20T00:00:00.000Z" },
      RIFERIMENTO,
    ),
    "expiring",
  );
});

test("dopo la scadenza e scaduto", () => {
  assert.equal(
    getMedicalCertificateFamilyState(
      { count: 1, expiryDate: "2026-01-03T00:00:00.000Z" },
      RIFERIMENTO,
    ),
    "expired",
  );
});

test("senza nessun certificato e mancante", () => {
  assert.equal(
    getMedicalCertificateFamilyState({ count: 0, expiryDate: null }, RIFERIMENTO),
    "missing",
  );
});

test("un certificato consegnato senza scadenza non e un certificato mancante", () => {
  assert.equal(
    getMedicalCertificateFamilyState({ count: 1, expiryDate: null }, RIFERIMENTO),
    "undated",
  );
});

/* -------------------------------------------------------------- la riga */

test("le tre forme con la data sono quelle chieste, alla lettera", () => {
  assert.equal(
    describeMedicalCertificateForFamily("valid", "2027-06-01T00:00:00.000Z")
      .summary,
    "Valido — Scade il 01/06/2027",
  );
  assert.equal(
    describeMedicalCertificateForFamily("expiring", "2026-09-20T00:00:00.000Z")
      .summary,
    "In scadenza — Scade il 20/09/2026",
  );
  assert.equal(
    describeMedicalCertificateForFamily("expired", "2026-01-03T00:00:00.000Z")
      .summary,
    "Scaduto — Scaduto il 03/01/2026",
  );
});

test("senza data si dice che la data non c'e, e non si inventa uno stato", () => {
  const mancante = describeMedicalCertificateForFamily("missing", null);
  const senzaData = describeMedicalCertificateForFamily("undated", null);

  assert.equal(mancante.summary, "Data di scadenza non disponibile");
  assert.equal(senzaData.summary, "Data di scadenza non disponibile");
  /*
    La riga e la stessa, l'etichetta no: e li che le due situazioni si
    distinguono, ed e quello che il riquadro mostra accanto.
  */
  assert.equal(mancante.label, "Mancante");
  assert.equal(senzaData.label, "Consegnato");
});

/* --------------------------------------------------------------- il fuso */

test("la data si legge nel fuso in cui e stata scritta", () => {
  /*
    Il primo giugno alla mezzanotte UTC. Reso con il fuso del lettore, in
    Europa/Roma d'estate (UTC+2) diventerebbe il 31 maggio.
  */
  assert.equal(
    formatMedicalCertificateDate("2027-06-01T00:00:00.000Z"),
    "01/06/2027",
  );
  assert.equal(
    formatMedicalCertificateDate(new Date("2026-01-01T00:00:00.000Z")),
    "01/01/2026",
  );
});

test("una data assente non diventa una stringa storta", () => {
  assert.equal(formatMedicalCertificateDate(null), "");
  assert.equal(formatMedicalCertificateDate(""), "");
  assert.equal(formatMedicalCertificateDate("non-una-data"), "");
});
