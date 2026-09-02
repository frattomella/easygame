import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

/**
 * L'export dell'interessato portava fuori il fascicolo clinico completo.
 *
 * L'unico controllo era `canManageClubConfiguration`, che guarda il **ruolo**
 * e non consulta nessuna chiave. Con i ruoli personalizzati della Wave 6 la
 * conseguenza si vede: uno slug `custom:club_manager:...` si normalizza su
 * `club_manager`, quindi un ruolo a cui il club ha **tolto** `clinical.read`
 * esportava comunque allergie, patologie, farmaci, gruppo sanguigno e le note
 * mediche — cioe tutto cio che `src/lib/health/permissions.ts` dichiara a
 * default negato.
 *
 * Il docstring della rotta diceva «nessun byte … i file si scaricano dalla
 * loro rotta, che e l'unica che sa applicare i permessi sul contenuto
 * clinico». Vero per i **byte**, falso per i **campi**.
 *
 * Insieme al taglio c'era una seconda cosa, piu piccola e della stessa
 * famiglia: `assertCanDispose` usciva **senza negare** quando lo scope era
 * assente. Una guardia che, non sapendo, lascia fare — e questa protegge
 * l'export **e** la cancellazione di una persona.
 */

const sorgente = () => readFile("src/lib/server/data-subject.ts", "utf8");

test("uno scope assente nega, non passa", async () => {
  const testo = await sorgente();
  const inizio = testo.indexOf("const assertCanDispose");
  assert.ok(inizio > 0, "assertCanDispose non trovata");
  const corpo = testo.slice(inizio, inizio + 1800);

  assert.equal(
    /if \(!scope\) return;/.test(corpo),
    false,
    "senza scope si passava: e la forma «non so, quindi lascio fare»",
  );
  assert.match(
    corpo,
    /if \(!scope\) \{[\s\S]{0,200}Accesso negato/,
    "senza scope deve negare, e il messaggio deve portare «Accesso negato» perche la rotta lo mappi su 403",
  );
});

test("il contenuto clinico esce solo a chi ha la chiave", async () => {
  const testo = await sorgente();

  assert.match(
    testo,
    /hasHealthPermission\(\s*scope\?\.activeRole,\s*"clinical\.read",?\s*\)/,
    "l'export deve chiedere la chiave del dominio sanitario, non fidarsi del ruolo",
  );
  assert.match(
    testo,
    /stripClinicalCertificateFields\(/,
    "i certificati devono passare dal taglio del dominio, non uscire interi",
  );
  assert.match(
    testo,
    /stripClinicalAthleteFields\(athlete\?\.data\)/,
    "anche la riga dell'atleta porta contenuto clinico dentro `data`",
  );
});

test("le sezioni esportate sono quelle proiettate, non quelle grezze", async () => {
  const testo = await sorgente();

  assert.match(
    testo,
    /athletes: \[atletaProiettato\]/,
    "la sezione atleti deve prendere la riga proiettata",
  );
  assert.match(
    testo,
    /medical_certificates: certificatiProiettati/,
    "la sezione certificati deve prendere le righe proiettate",
  );
  assert.equal(
    /medical_certificates: certificati,/.test(testo),
    false,
    "la variabile grezza non deve piu comparire nella risposta",
  );
});

test("l'omissione si dichiara: un export che tace cosa non contiene viene creduto completo", async () => {
  const testo = await sorgente();

  assert.match(
    testo,
    /clinicalContentOmitted: boolean;/,
    "il tipo dell'export deve portare la dichiarazione",
  );
  assert.match(
    testo,
    /clinicalContentOmitted: !puoLeggereIlClinico/,
    "e il valore deve dire la verita su cio che e stato tolto",
  );
});

test("il dominio sanitario resta il proprietario del taglio", async () => {
  /*
    Non una seconda lista di campi scritta qui: `data-subject.ts` importa le
    funzioni del dominio. Quando la Wave 6 ha scoperto che il taglio lasciava
    passare i contenitori di file, la correzione e stata **una sola** e vale
    anche per questo export.
  */
  const testo = await sorgente();
  assert.match(
    testo,
    /from "@\/lib\/health\/permissions"/,
    "il taglio si importa dal dominio, non si riscrive",
  );
});
