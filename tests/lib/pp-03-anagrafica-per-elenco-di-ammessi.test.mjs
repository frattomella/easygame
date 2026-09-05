import assert from "node:assert/strict";
import test, { before } from "node:test";

/**
 * **`athletes.data` era rimasta sull'elenco dei vietati** (PP-03 §15.4).
 *
 * ADR-0125 ha invertito la regola dentro `medical_certificates.data`: su una
 * colonna JSON **libera** si dichiara cosa passa, perche un elenco di vietati e
 * una scommessa sui nomi che qualcuno usera. `athletes.data` e la stessa
 * colonna libera, ed era rimasta dall'altra parte.
 *
 * Il quinto round di revisione ostile l'ha vinta due volte, e da sette porte:
 *
 * - con dei **contenitori** dal nome nuovo — `data.schedaSanitaria.allergies`,
 *   `data.anamnesi[].patologia` — che uscivano interi;
 * - con dei **campi semplici** dal nome italiano — `diagnosi`, `referto`,
 *   `terapia`, `anamnesi`, `noteDelMedico` — che nessun elenco di divieti
 *   avrebbe previsto.
 *
 * E, sul certificato, con la forma: `data.source` era un nome ammesso senza una
 * forma dichiarata, quindi `source: { diagnosi: … }` passava intero. Il nome era
 * chiuso, il contenuto no.
 *
 * Le prove non elencano i nomi noti — sarebbe verificare l'elenco, cioe la cosa
 * che si e smesso di usare. Usano **nomi inventati qui**, che e l'unico modo di
 * misurare un default.
 */

let permessi;

before(async () => {
  permessi = await import("../../src/lib/health/permissions.ts");
});

/* ------------------------------------------- i contenitori, per chiunque -- */

test("PP-03 §15.4 · un contenitore dal nome inventato non esce da `athletes.data`", () => {
  const data = {
    name: "Marco",
    /* Due nomi decisi adesso: un elenco che li conoscesse non proverebbe niente. */
    fascicoloDiSquadra: { allergie: "PAROLA-CLINICA-INVENTATA" },
    valutazioniPeriodiche: [{ esito: "ALTRA-PAROLA-CLINICA" }],
  };

  const uscito = permessi.stripClinicalAthleteFields(data);
  const testo = JSON.stringify(uscito);

  assert.ok(!testo.includes("PAROLA-CLINICA-INVENTATA"));
  assert.ok(!testo.includes("ALTRA-PAROLA-CLINICA"));
  assert.equal(uscito.name, "Marco", "i campi semplici noti restano");
});

test("PP-03 §15.4 · i contenitori dichiarati non clinici restano", () => {
  /*
    Il verso opposto, e conta quanto l'altro: chi allena deve poter chiamare una
    famiglia, ed e la ragione per cui `guardians` non e clinico.
  */
  const data = {
    guardians: [{ first_name: "Anna", phone: "333" }],
    clothingSizes: { shirt: "M" },
  };

  const uscito = permessi.stripClinicalAthleteFields(data);

  assert.deepEqual(uscito.guardians, data.guardians);
  assert.deepEqual(uscito.clothingSizes, data.clothingSizes);
});

/* --------------------------- i campi semplici, per chi vede solo lo stato -- */

test("PP-03 §15.4 · chi vede lo stato e non il contenuto legge per elenco di ammessi", () => {
  const data = {
    name: "Marco",
    surname: "Rossi",
    medicalCertExpiry: "2027-01-31",
    /* Cinque parole italiane, come quelle che il round ha usato davvero. */
    diagnosi: "PAROLA-UNO",
    referto: "PAROLA-DUE",
    terapia: "PAROLA-TRE",
    noteDelMedico: "PAROLA-QUATTRO",
    campoInventatoDaUnClub: "PAROLA-CINQUE",
  };

  const perAllenatore = permessi.stripClinicalAthleteFields(data, "trainer");
  const testo = JSON.stringify(perAllenatore);

  for (const parola of ["UNO", "DUE", "TRE", "QUATTRO", "CINQUE"]) {
    assert.ok(
      !testo.includes(`PAROLA-${parola}`),
      `PAROLA-${parola} e uscita: l'elenco di ammessi non e applicato`,
    );
  }

  assert.equal(perAllenatore.name, "Marco");
  assert.equal(
    perAllenatore.medicalCertExpiry,
    "2027-01-31",
    "lo stato del certificato resta: e cio che questo lettore ha titolo di vedere",
  );
});

test("PP-03 §15.4 · la famiglia non ci rientra, e la sua scheda non cambia", () => {
  /*
    Il rischio della correzione, misurato. Genitore e atleta non hanno nessuna
    delle due chiavi sanitarie: leggono la scheda del **proprio** figlio, e per
    loro il taglio resta quello di prima — i nomi vietati e i contenitori non
    dichiarati, non l'elenco di ammessi.
  */
  const data = { name: "Marco", campoDelClub: "VALORE-DEL-CLUB" };

  for (const ruolo of ["parent", "athlete", undefined]) {
    const uscito = permessi.stripClinicalAthleteFields(data, ruolo);
    assert.equal(
      uscito.campoDelClub,
      "VALORE-DEL-CLUB",
      `il ruolo ${String(ruolo)} non legge per elenco di ammessi`,
    );
  }
});

test("PP-03 §15.4 · il predicato dice esattamente «lo stato si, il contenuto no»", () => {
  assert.equal(permessi.readerSeesStatusOnly("trainer"), true);
  for (const ruolo of ["owner", "club_manager", "secretary", "collaborator"]) {
    assert.equal(
      permessi.readerSeesStatusOnly(ruolo),
      false,
      `${ruolo} ha \`clinical.read\`: legge il contenuto, quindi non e questo lettore`,
    );
  }
  for (const ruolo of ["parent", "athlete"]) {
    assert.equal(
      permessi.readerSeesStatusOnly(ruolo),
      false,
      `${ruolo} non ha nessuna delle due chiavi: non e questo lettore`,
    );
  }
});

/* ------------------------------------- la forma di cio che passa, non solo il nome */

test("PP-03 §15.4 · dentro `medical_certificates.data` si dichiara anche la forma", () => {
  /*
    `source` e una **provenienza**, cioe una parola. Il round ci ha messo dentro
    un oggetto e un elenco, e uscivano interi: un contenitore sotto un nome
    ammesso e l'elenco dei vietati che rientra dalla finestra.
  */
  const conOggetto = permessi.stripClinicalCertificateFields({
    id: "cert-1",
    status: "valid",
    expiry_date: "2027-01-31",
    data: { source: { diagnosi: "PAROLA-ANNIDATA" } },
  });
  assert.ok(!JSON.stringify(conOggetto).includes("PAROLA-ANNIDATA"));

  const conElenco = permessi.stripClinicalCertificateFields({
    id: "cert-2",
    status: "valid",
    data: { source: ["PAROLA-IN-ELENCO"] },
  });
  assert.ok(!JSON.stringify(conElenco).includes("PAROLA-IN-ELENCO"));

  const legittimo = permessi.stripClinicalCertificateFields({
    id: "cert-3",
    status: "valid",
    expiry_date: "2027-01-31",
    data: { source: "document_request" },
  });
  assert.equal(
    legittimo.data.source,
    "document_request",
    "la provenienza vera resta: dice da dove arriva la riga, non cosa dice il medico",
  );
  assert.equal(
    legittimo.expiry_date,
    "2027-01-31",
    "e lo stato resta, che e il punto di tutto il modulo",
  );
});
