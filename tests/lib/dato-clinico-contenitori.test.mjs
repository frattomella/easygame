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
  Un'anagrafica con la forma reale: i nomi vengono da `src/app/athletes/[id]/
  page.tsx`, che e l'unica schermata che scrive queste raccolte, e i valori
  dalla misura della revisione.
*/
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

  // i contenitori, che passavano interi
  medicalVisits: [
    {
      title: "Visita cardiologica",
      outcome: "soffio sistolico, da rivalutare",
      fileUrl: "data:application/pdf;base64,JVBERi0xLjQK",
    },
  ],
  certificateFiles: {
    blsd: "data:application/pdf;base64,JVBERi0xLjQK",
  },
  identityDocuments: [
    { fileUrl: "data:image/jpeg;base64,/9j/4AAQSkZJRg==" },
  ],
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
