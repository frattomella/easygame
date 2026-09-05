import assert from "node:assert/strict";
import test from "node:test";

import {
  NON_CLINICAL_CERTIFICATE_DATA_FIELDS,
  stripClinicalCertificateFields,
} from "../../src/lib/health/permissions.ts";

/**
 * **Dentro `medical_certificates.data` si dichiara cosa passa, non cosa si
 * ferma** (PP-03 §9.2).
 *
 * Il taglio del contenuto clinico era un elenco di **vietati** applicato a una
 * colonna JSON **libera**. Su uno schema fisso quell'elenco si puo chiudere —
 * le colonne si contano; dentro `data` no, perche `data` non ha colonne. Una
 * revisione ostile ha misurato sulle rotte vere che bastava scrivere il campo
 * con un nome italiano — `diagnosi`, `referto`, `terapia` — perche il
 * contenuto uscisse a chi ha soltanto `clinical.status_read`.
 *
 * La prova che conta e la **prima**: un nome inventato qui, adesso, deve
 * sparire. Un test che elencasse i nomi noti verificherebbe l'elenco, cioe
 * proprio la cosa che si e smesso di usare.
 */

const certificato = (data) => ({
  id: "cert-1",
  athlete_id: "atleta-1",
  status: "valid",
  expiry_date: "2027-06-30",
  data,
});

test("PP-03 §9.2 · un campo che nessun elenco prevede non esce", () => {
  const tagliato = stripClinicalCertificateFields(
    certificato({
      campoInventatoOggi: "SEGRETO",
      "un nome con gli spazi": "SEGRETO",
      diagnosi: "SEGRETO",
      referto: "SEGRETO",
      terapia: "SEGRETO",
      farmaci: "SEGRETO",
      anamnesi: "SEGRETO",
      gruppoSanguigno: "SEGRETO",
    }),
  );

  assert.ok(
    !JSON.stringify(tagliato).includes("SEGRETO"),
    "su una colonna libera un elenco di vietati e una scommessa sui nomi che qualcuno usera",
  );
});

test("PP-03 §9.2 · lo stato e la scadenza restano: sono la domanda operativa", () => {
  const tagliato = stripClinicalCertificateFields(
    certificato({ diagnosi: "SEGRETO" }),
  );

  assert.equal(tagliato.status, "valid");
  assert.equal(tagliato.expiry_date, "2027-06-30");
  assert.equal(
    tagliato.athlete_id,
    "atleta-1",
    "senza l'atleta lo stato non si attacca a nessuno",
  );
});

test("PP-03 §9.2 · le chiavi dichiarate non cliniche passano", () => {
  const tagliato = stripClinicalCertificateFields(
    certificato({ source: "upload", diagnosi: "SEGRETO" }),
  );

  assert.deepEqual(
    tagliato.data,
    { source: "upload" },
    "`source` dice da dove arriva la riga, non cosa dice il medico",
  );

  assert.deepEqual(
    [...NON_CLINICAL_CERTIFICATE_DATA_FIELDS],
    ["source"],
    "l'elenco degli ammessi si allarga con una decisione, non per inerzia: se cresce, va spiegato nel verbale",
  );
});

test("PP-03 §9.2 · un `data` che non e un oggetto non passa", () => {
  /*
    Una stringa libera puo essere qualunque cosa, e non si puo ispezionare
    campo per campo: il default negato vale anche sulla forma.
  */
  assert.deepEqual(
    stripClinicalCertificateFields(certificato("diagnosi: sospetta aritmia"))
      .data,
    {},
  );

  assert.deepEqual(
    stripClinicalCertificateFields(certificato(["referto"])).data,
    {},
  );

  /*
    `null` e `undefined` restano se stessi: non c'e niente da togliere, e
    trasformarli in `{}` direbbe al client che un oggetto c'e.
  */
  assert.equal(stripClinicalCertificateFields(certificato(null)).data, null);
});

test("PP-03 §9.2 · le colonne di contenuto restano tolte", () => {
  const tagliato = stripClinicalCertificateFields({
    ...certificato({ source: "upload" }),
    notes: "SEGRETO",
    doctor: "SEGRETO",
    file_url: "SEGRETO",
    attachment_id: "SEGRETO",
  });

  assert.ok(
    !JSON.stringify(tagliato).includes("SEGRETO"),
    "il primo livello ha uno schema fisso e li l'elenco di vietati regge: non va perso correggendo il secondo",
  );
});
