import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

import {
  CLINICAL_ATHLETE_FIELDS,
  stripClinicalAthleteFields,
} from "../../src/lib/health/permissions.ts";

/**
 * Il taglio del dato clinico toglieva i **campi** e lasciava i **contenitori**.
 *
 * Una revisione ostile della Wave 6 lo ha misurato a runtime: con uno scope da
 * allenatore, la risposta di `GET /api/v1/athletes` conteneva
 *
 *     blsd:             (tolto)
 *     certificateFiles: { "blsd": "data:application/pdf;base64,..." }
 *     medicalVisits:    [{ "outcome": "soffio sistolico, da rivalutare" }]
 *
 * Il **flag** del BLSD veniva tolto e **il PDF del BLSD restava**. Con lui
 * l'esito di una visita cardiologica di un minore, i documenti d'identita e i
 * documenti condivisi con la famiglia — tutti allegati in base64 dentro il
 * JSON dell'anagrafica.
 *
 * La schermata dell'allenatore nascondeva quelle sezioni dietro un controllo
 * lato browser, quindi a schermo non si vedevano: e esattamente il difetto che
 * `src/lib/health/permissions.ts` dichiara chiuso nella propria intestazione —
 * «prima lo distingueva il browser, da adesso lo distingue il server».
 *
 * **Cosa presidia questo file, e cosa no.** Non l'elenco: un elenco si
 * verifica da solo e non dice niente. Presidia la **proprieta**: dopo il
 * taglio, in cio che resta non deve sopravvivere nessun file incorporato e
 * nessun esito clinico. Cosi un contenitore nuovo che nasca domani con un
 * altro nome fallisce qui, invece di uscire.
 */

/*
  **L'anagrafica di prova ha tutte e nove le raccolte, e non e un dettaglio.**

  La prima stesura ne aveva cinque, scelte perche *sembravano* sanitarie, e per
  questo passava mentre il difetto era ancora aperto: mancava proprio
  `documents`, il contenitore **libero** in cui la finestra «Aggiungi
  Documento» scrive quando qualcuno sceglie «Certificato Medico» dalla tendina.

  Le nove sono quelle che `persistAthleteCollections` salva davvero
  (`src/app/athletes/[id]/page.tsx`): il presidio le enumera da li, e il
  controllo qui sotto pretende che l'elenco resti allineato — cosi una raccolta
  nuova non puo nascere senza che qualcuno decida se e clinica.
*/
const RACCOLTE_DELLA_SCHEDA = [
  "guardians",
  "registrations",
  "medicalVisits",
  "identityDocuments",
  "enrollmentDocuments",
  "documents",
  "payments",
  "certificateFiles",
  "clothingSizes",
];

const anagraficaReale = () => ({
  firstName: "Giulia",
  lastName: "Rossi",
  category: "Under 14",
  jerseyNumber: "7",
  phone: "+39 333 1234567",
  email: "famiglia@esempio.it",
  medicalCertExpiry: "2027-03-01",

  // contenuto clinico "di campo"
  allergies: "arachidi",
  medicalNotes: "controllo semestrale",
  bloodType: "A+",
  blsd: true,

  // le nove raccolte, con dentro cio che ci finisce davvero
  guardians: [{ name: "Maria", email: "maria@famiglia.it", phone: "333" }],
  registrations: [
    { season: "2026/27", fileUrl: "data:application/pdf;base64,JVBERi0xLjQK" },
  ],
  medicalVisits: [
    {
      title: "Visita cardiologica",
      outcome: "soffio sistolico, da rivalutare",
      fileUrl: "data:application/pdf;base64,JVBERi0xLjQK",
    },
  ],
  identityDocuments: [{ fileUrl: "data:image/jpeg;base64,/9j/4AAQSkZJRg==" }],
  enrollmentDocuments: [
    { name: "Modulo iscrizione", fileUrl: "attachment:att-iscr" },
  ],
  documents: [
    {
      type: "Certificato Medico",
      notes: "idoneita con riserva: soffio sistolico",
      fileUrl: "attachment:att-cert",
    },
  ],
  payments: [{ amount: 120, method: "bonifico" }],
  certificateFiles: { blsd: "data:application/pdf;base64,JVBERi0xLjQK" },
  clothingSizes: { maglia: "M" },

  // depositi condivisi con la famiglia, con l'identificativo dell'allegato
  sharedDocuments: [
    {
      assetId: "asset-1",
      documentType: "medical_certificate",
      fileName: "certificato.pdf",
    },
  ],
});

/* ---------------------------------------------------- la proprieta, non l'elenco */

const attraversa = (valore, visita) => {
  if (typeof valore === "string") {
    visita(valore);
    return;
  }
  if (Array.isArray(valore)) {
    valore.forEach((voce) => attraversa(voce, visita));
    return;
  }
  if (valore && typeof valore === "object") {
    Object.values(valore).forEach((voce) => attraversa(voce, visita));
  }
};

test("dopo il taglio non sopravvive nessun file incorporato", () => {
  const tagliato = stripClinicalAthleteFields(anagraficaReale());

  const incorporati = [];
  attraversa(tagliato, (testo) => {
    if (testo.startsWith("data:")) incorporati.push(testo.slice(0, 40));
  });

  assert.deepEqual(
    incorporati,
    [],
    "un allegato in base64 e uscito dal taglio: e il PDF di un certificato o di un documento d'identita di un minore",
  );
});

test("dopo il taglio non sopravvive nessun esito clinico", () => {
  const tagliato = stripClinicalAthleteFields(anagraficaReale());
  const serializzato = JSON.stringify(tagliato);

  for (const frase of ["soffio sistolico", "arachidi", "controllo semestrale"]) {
    assert.equal(
      serializzato.includes(frase),
      false,
      `«${frase}» e sopravvissuta al taglio`,
    );
  }
});

test("il taglio toglie il flag e il file che lo documenta, non uno solo dei due", () => {
  const tagliato = stripClinicalAthleteFields(anagraficaReale());

  assert.equal(tagliato.blsd, undefined, "il flag deve sparire");
  assert.equal(
    tagliato.certificateFiles,
    undefined,
    "e con lui il file che lo documenta: toglierne uno solo era il difetto",
  );
});

test("cio che serve per allenare resta", () => {
  const tagliato = stripClinicalAthleteFields(anagraficaReale());

  /*
    Il taglio non deve rendere inutile l'anagrafica: chi allena deve sapere chi
    e la persona, in che categoria gioca e **se puo scendere in campo**. La
    data di scadenza del certificato e stato, non contenuto, e resta.
  */
  assert.equal(tagliato.firstName, "Giulia");
  assert.equal(tagliato.category, "Under 14");
  assert.equal(tagliato.jerseyNumber, "7");
  assert.equal(
    tagliato.medicalCertExpiry,
    "2027-03-01",
    "la scadenza e la risposta a «puo giocare», e non e contenuto clinico",
  );
});

test("l'oggetto originale non viene modificato in luogo", () => {
  const originale = anagraficaReale();
  stripClinicalAthleteFields(originale);

  assert.equal(
    originale.allergies,
    "arachidi",
    "il taglio produce una copia: mutare la riga letta la cambierebbe anche per chi ha il permesso",
  );
});

test("un'anagrafica senza niente di clinico torna identica, senza copie inutili", () => {
  const pulita = { firstName: "Marco", category: "Under 12" };
  assert.equal(
    stripClinicalAthleteFields(pulita),
    pulita,
    "nessun campo tolto, nessuna copia: e la condizione che rende il taglio gratuito sulla maggioranza delle righe",
  );
});

/* ------------------------------------------- le due porte sullo stesso documento */

test("il ramo storico della rotta dei byte chiede il permesso come il ramo nuovo", async () => {
  /*
    La rotta che consegna i byte di un documento ha due rami: il fascicolo e
    l'archivio storico. Il primo chiedeva `clinical.read` prima di consegnare
    un certificato medico, il secondo no — due porte sullo stesso certificato
    di un minore, una chiusa e una aperta.

    Non era teorico: `sharedDocuments` passava il taglio, quindi l'elenco degli
    atleti serviva all'allenatore l'`assetId` e il `documentType` da mettere in
    questa rotta. Le due meta si chiudono insieme, e questo controllo tiene la
    seconda: chiuderne una sola lascerebbe la difesa appesa a cio che un'altra
    funzione decide di proiettare.
  */
  const sorgente = await readFile(
    "src/app/api/athletes/[athleteId]/documents/[documentId]/file/route.ts",
    "utf8",
  );

  const gate = /isMedicalCertificateDocumentKind\([\s\S]{0,80}?\)\s*&&\s*!hasHealthPermission\(\s*scope\.activeRole,\s*"clinical\.read"/g;
  const quanti = (sorgente.match(gate) || []).length;

  assert.equal(
    quanti,
    2,
    `i rami che consegnano byte sono due e i controlli sul dato clinico sono ${quanti}: ogni ramo deve avere il suo`,
  );
});

/* -------------------------------------------- l'elenco resta leggibile a un umano */

test("i contenitori che portavano i file sono dichiarati nell'elenco", () => {
  /*
    Le prove sopra reggono anche se l'elenco cambia forma. Questa serve a chi
    legge: dice che i quattro contenitori sono li **di proposito**, cosi
    nessuno li toglie credendoli finiti dentro per errore.
  */
  for (const contenitore of [
    "medicalVisits",
    "certificateFiles",
    "identityDocuments",
    "sharedDocuments",
  ]) {
    assert.ok(
      CLINICAL_ATHLETE_FIELDS.includes(contenitore),
      `«${contenitore}» porta allegati in base64 e deve restare nell'elenco`,
    );
  }
});

test("l'elenco copre le raccolte che la scheda atleta salva davvero", () => {
  /*
    **Perche questa prova esiste.**

    La prima correzione aveva aggiunto quattro contenitori scelti perche
    sembravano sanitari, e ne erano rimasti tre. Il modo di non sbagliare piu e
    partire da **chi scrive**: `persistAthleteCollections` salva nove raccolte,
    e per ognuna qualcuno deve aver deciso se e clinica o no.

    Le tre che restano fuori sono dichiarate qui con il motivo, non dimenticate.
  */
  const NON_CLINICHE = new Map([
    [
      "guardians",
      "recapiti dei tutori: e dato personale, non clinico, e chi allena deve poter chiamare una famiglia. Il permesso che lo governa e `viewAthleteContacts` (debito W6-28)",
    ],
    [
      "payments",
      "denaro, non salute: lo governa il permesso sui pagamenti, non `clinical.read`",
    ],
    [
      "clothingSizes",
      "taglie del vestiario: servono a consegnare una maglia",
    ],
  ]);

  const scoperte = RACCOLTE_DELLA_SCHEDA.filter(
    (raccolta) =>
      !CLINICAL_ATHLETE_FIELDS.includes(raccolta) && !NON_CLINICHE.has(raccolta),
  );

  assert.deepEqual(
    scoperte,
    [],
    `raccolte che la scheda salva e che nessuno ha classificato: ${scoperte.join(", ")}. ` +
      "Mettile fra i campi clinici, oppure dichiarale in NON_CLINICHE con il motivo",
  );
});

test("il contenitore libero e la sua trappola: «Certificato Medico» scritto in «documents»", () => {
  /*
    Il caso esatto che la seconda revisione ha eseguito. La finestra «Aggiungi
    Documento» offre «Certificato Medico» nella tendina dei tipi e scrive nel
    contenitore libero, non in `certificateFiles`: un elenco costruito
    guardando i nomi dei campi non poteva vederlo.
  */
  const tagliato = stripClinicalAthleteFields(anagraficaReale());

  assert.equal(
    tagliato.documents,
    undefined,
    "il contenitore libero porta certificati medici: non sopravvive al taglio",
  );
  assert.equal(
    JSON.stringify(tagliato).includes("att-cert"),
    false,
    "e nemmeno l'identificativo dell'allegato, che e la chiave per bussare ai byte",
  );
});

test("la categoria dell'allegato segue il tipo dichiarato, o il gate non si accende", async () => {
  /*
    L'altra meta dello stesso difetto. Il controllo che protegge i byte giudica
    la **categoria** con cui il file e stato depositato: finche la scheda
    scriveva la costante `"documento"` anche per un certificato, quel controllo
    non si accendeva mai.
  */
  const { normalizeDocumentKind, isMedicalCertificateDocumentKind } =
    await import("../../src/lib/documents/request-model.ts");
  const sorgente = await readFile("src/app/athletes/[id]/page.tsx", "utf8");

  assert.ok(
    isMedicalCertificateDocumentKind(normalizeDocumentKind("Certificato Medico")),
    "il tipo della tendina deve tradursi in una categoria che il gate riconosce",
  );
  assert.match(
    sorgente,
    new RegExp(String.raw`normalizeDocumentKind\(newDocument\.type\)`),
    "la scheda deve derivare la categoria dal tipo dichiarato, non usare una costante",
  );
});

test("la regola contro lo svuotamento e scritta dove qualcuno la cerchera", async () => {
  /*
    **Questo controllo non prova la regola: la nomina.** E una distinzione che
    questa Wave ha pagato due volte, e vale la pena scriverla qui.

    La prima stesura di questo presidio era un `assert.match` sul sorgente e
    dichiarava, nel messaggio di commit, che «la prova sul dato la fa
    scripts/wave-6-uat.mjs». Non era vero: quella prova non esisteva, e una
    revisione ostile ha neutralizzato la regola ottenendo 32 test verdi e due
    sonde su due verdi.

    La prova sul dato adesso esiste davvero, e sta in
    `scripts/wave-6-security-probe.mjs` (U-41): semina un contenuto clinico,
    salva con un ruolo che ha `clinical.manage` e **non** `clinical.read`, e
    conta cosa e rimasto. E la sonda che ha trovato l'errore piu insidioso di
    questa correzione — l'ordine dello spread, che faceva vincere il vuoto
    appena scartato.

    Cio che resta qui e cio che un controllo sul sorgente sa fare davvero:
    tenere ferma la **forma** della regola per chi legge il file, e dire dove
    sta la prova.
  */
  const sorgente = await readFile("src/lib/server/resources.ts", "utf8");

  assert.match(
    sorgente,
    /Un campo clinico non si cancella scrivendo senza averlo letto/,
    "la regola deve essere scritta dove qualcuno la cerchera",
  );
  assert.match(
    sorgente,
    /normalized.data = { ...nuovo, ...conservati }/,
    "cio che si conserva deve vincere sullo spread di cio che arriva, o il vuoto lo sovrascrive",
  );

  const sonda = await readFile("scripts/wave-6-security-probe.mjs", "utf8");
  assert.match(
    sonda,
    /U-41 chi non puo leggere il clinico non lo cancella salvando/,
    "la prova sul dato deve esistere davvero: dichiararla e non scriverla e come non averla",
  );
});
