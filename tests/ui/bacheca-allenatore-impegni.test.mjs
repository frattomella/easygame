import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";

/**
 * **La bacheca dell'allenatore dice anche che cosa viene dopo oggi** (P0-7,
 * `D-INT-11`).
 *
 * La home rispondeva a una domanda sola — «che cosa succede **oggi**» — con
 * due riquadri sul giorno corrente e l'agenda gare della settimana. Cio che un
 * allenatore chiede aprendo la bacheca il martedi, «quando torno in campo e
 * con chi», non c'era.
 *
 * E non perche mancasse il codice: il riquadro dei prossimi impegni era
 * **scritto**, viveva dentro un `div` con la classe `hidden` e leggeva un
 * `nextMatches` inizializzato a elenco vuoto. Due modi indipendenti di non
 * mostrarlo mai, sullo stesso blocco. E la forma di difetto che CLAUDE.md
 * §11.8 descrive: non manca il codice, manca la strada che ci arriva — ed e
 * la ragione per cui questo test guarda la **superficie** e non la funzione.
 */

const HOME = path.join(
  process.cwd(),
  "src/components/trainer/trainer-dashboard-home-v2-page.tsx",
);
const sorgente = fs.readFileSync(HOME, "utf8");

/** Il corpo senza commenti: cio che il browser esegue davvero. */
const senzaCommenti = sorgente
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");

test("i prossimi impegni sono una superficie, non un blocco nascosto", () => {
  assert.match(
    senzaCommenti,
    /data-testid="prossimi-impegni"/,
    "il riquadro deve esistere e avere un nome per il collaudo",
  );
  assert.match(
    senzaCommenti,
    /title="Prossimi impegni"/,
    "e un titolo che dice che cosa contiene",
  );

  assert.ok(
    !/className="hidden"/.test(senzaCommenti),
    "il blocco nascosto non deve tornare: era il difetto",
  );
  assert.ok(
    !/const nextMatches: any\[\] = \[\]/.test(senzaCommenti),
    "ne l'elenco vuoto che lo alimentava",
  );
});

test("allenamenti e gare stanno nello stesso elenco, in ordine di orario", () => {
  /*
    La settimana di un allenatore e una sola. Due elenchi separati lo
    costringono a fondere le date a mente, ed e la cosa che un telefono in
    palestra rende piu difficile.
  */
  assert.match(
    senzaCommenti,
    /const prossimiImpegni = \[\s*\.\.\.impegniTrainings\.map[\s\S]{0,200}\.\.\.impegniMatches\.map/,
    "i due calendari entrano nello stesso elenco",
  );

  /*
    **E gli annullati non ci entrano** (P0-3, `D-AUD-20`).

    Il contesto chiede il calendario con `include_cancelled=1`, perche la
    pastiglia «Annullato» e il ripristino vivono sulla riga annullata. Da
    quella deroga discendeva che un allenamento annullato compariva fra i
    prossimi impegni **indistinguibile** da uno in programma: la pastiglia di
    questo riquadro e la stringa fissa «Allenamento». Un allenatore legge
    «quando torno in campo» e ci trova una seduta che non ci sara.
  */
  assert.match(
    senzaCommenti,
    /const impegniTrainings = visibleTrainings\.filter\(\s*\(training: any\) => !isCancelledEvent\(training\),\s*\);/,
    "gli allenamenti annullati escono dagli impegni",
  );
  assert.match(
    senzaCommenti,
    /const impegniMatches = visibleMatches\.filter\(\s*\(match: any\) => !isCancelledEvent\(match\),\s*\);/,
    "e cosi le gare annullate",
  );
  assert.match(
    senzaCommenti,
    /const todayTrainings = impegniTrainings/,
    "e nemmeno nei conteggi di oggi: «Allenamenti di oggi: 3» con due annullati e un numero falso",
  );
  assert.match(senzaCommenti, /const todayMatches = impegniMatches/);
  assert.match(
    senzaCommenti,
    /compareTrainerRecordsByStart\(sinistra\.record, destra\.record\)/,
    "ordinati per orario, non per tipo",
  );
});

test("oggi resta nei suoi riquadri e non si ripete", () => {
  /*
    Ripetere le righe di oggi qui farebbe scorrere due volte le stesse cose su
    un telefono, e la seconda copia avrebbe azioni diverse dalla prima.
  */
  const blocco = senzaCommenti.slice(
    senzaCommenti.indexOf("const prossimiImpegni"),
    senzaCommenti.indexOf("const matchOfTheDay"),
  );

  assert.match(
    blocco,
    /record\.startsAt > now/,
    "solo cio che deve ancora succedere",
  );
  assert.match(
    blocco,
    /!isSameTrainerDay\(record\.startsAt, now\)/,
    "e non oggi, che ha gia i suoi due riquadri",
  );
});

test("ogni impegno porta l'azione che gli appartiene", () => {
  /*
    Una gara si apre sulle convocazioni, un allenamento sul proprio giorno: un
    pulsante solo per tutti e due porterebbe l'allenatore nel posto sbagliato
    meta delle volte.
  */
  assert.match(
    senzaCommenti,
    /\/trainer-dashboard\/matches\?focus=\$\{impegno\.id\}/,
    "la gara porta alle convocazioni",
  );
  assert.match(
    senzaCommenti,
    /\/trainer-dashboard\/trainings\?focus=\$\{impegno\.id\}/,
    "l'allenamento al proprio giorno",
  );
  assert.match(
    senzaCommenti,
    /className="w-full sm:w-auto"/,
    "e a 375 px il comando occupa la riga invece di stringersi",
  );
});

test("le caselle che decidono presenze e convocazioni hanno un nome", () => {
  /*
    Il nome dell'atleta e **accanto** alla casella, non dentro: chi legge con
    lo schermo sentiva sedici volte «casella di controllo» e nessun nome, su
    due schermate che decidono la presenza di un minore e chi va in campo.
  */
  /* Redesign: il registro presenze e il cassetto V2 condiviso (`AttendanceDrawer`); la casella dice «Presente: nome». */
  const registro = fs.readFileSync(path.join(process.cwd(), "src/components/training/v2/AttendanceDrawer.tsx"), "utf8");
  const casella = fs.readFileSync(path.join(process.cwd(), "src/components/training/v2/MarkControl.tsx"), "utf8");
  assert.ok(casella.includes("aria-label={`${label}: ${name}`}") && casella.includes('label = "Presente"'), "MarkControl: la casella deve dire di chi e");
  assert.ok(registro.includes("<MarkControl"), "AttendanceDrawer monta la casella condivisa");
  assert.ok(registro.includes("aria-label={`${athlete.name}: ${markLabel(mark)}. Cambia stato`}"), "e la riga annuncia lo stato che cambia");
  for (const [file, etichetta] of [
    ["src/components/trainer/MatchConvocations.tsx", "Convoca: "],
  ]) {
    const contenuto = fs.readFileSync(path.join(process.cwd(), file), "utf8");
    assert.ok(
      contenuto.includes(`aria-label={\`${etichetta}\${athlete.name}\`}`),
      `${file}: la casella deve dire di chi e`,
    );
  }
});
