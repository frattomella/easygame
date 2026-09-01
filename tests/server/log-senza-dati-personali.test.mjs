import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

/**
 * **I log non devono contenere dati personali non necessari** (ADR-0019, terza
 * conseguenza).
 *
 * Era la conseguenza dell'ADR **non presidiata da niente**. `sanitizeMetadata`
 * protegge `audit_logs` e nient'altro; fuori di li chiunque poteva scrivere
 * `console.error("...", error)` e portarsi dietro, senza saperlo, l'oggetto che
 * si stava scrivendo.
 *
 * **Perche proprio quella forma.** Il messaggio di un errore di validazione
 * dell'ORM non e un riassunto: contiene l'argomento dell'invocazione. Su
 * `user.create` vuol dire `password_hash`; sulla rotta pubblica dei moduli vuol
 * dire `answers` e `subjects`, cioe il modulo compilato da un minore. Non e un
 * caso limite: e il modo normale in cui Prisma spiega un errore.
 *
 * Questo test guarda **solo il codice che gira sul server** — `src/app/api/**`
 * e `src/lib/server/**` — perche e li che l'errore dell'ORM nasce. I moduli che
 * girano nel browser hanno lo stesso difetto e un presidio diverso: la regola
 * ESLint `no-console` su pagine e componenti.
 *
 * **Il registro dei residui e chiuso.** I file elencati sotto appartengono ad
 * altre lane e sono dichiarati nel rapporto della 6I. Un file **nuovo** in
 * quell'elenco fa fallire questo test, che e esattamente cio che serve: il
 * debito che c'e si vede, quello che nasce no.
 */

const RADICI = ["src/app/api", "src/lib/server"];

/**
 * I file che oggi passano ancora l'errore intero. **Non si allunga**: si
 * accorcia. Ognuno appartiene a una lane che non e la 6I, e il rapporto della
 * lane li elenca con file e riga.
 */
const RESIDUI_DICHIARATI = new Set([
  "src/app/api/athlete-payments/[paymentId]/route.ts",
  "src/app/api/v1/accounting/accounts/route-context.ts",
  "src/app/api/v1/clubs/[id]/signature/route.ts",
  "src/lib/server/form-submissions.ts",
  "src/lib/server/prisma.ts",
  "src/lib/server/sport-work-route.ts",
]);

/** I file che la lane 6I ha corretto: qui la tolleranza e zero. */
const PERIMETRO_RIPULITO = [
  "src/app/api/v1/auth/",
  "src/app/api/public/forms/",
  "src/lib/server/maintenance.ts",
  "src/lib/server/observability.ts",
  "src/lib/server/data-subject.ts",
  "src/lib/server/audience.ts",
  "src/lib/server/consents.ts",
];

const elencaFile = (radice) => {
  const trovati = [];
  const scendi = (cartella) => {
    for (const voce of fs.readdirSync(cartella, { withFileTypes: true })) {
      const completo = path
        .join(cartella, voce.name)
        .split(path.sep)
        .join("/");
      if (voce.isDirectory()) scendi(completo);
      else if (/\.tsx?$/.test(completo)) trovati.push(completo);
    }
  };
  scendi(radice);
  return trovati;
};

/**
 * L'errore passato **intero**: `console.error("qualcosa", error)`.
 *
 * Si riconosce dall'ultimo argomento, che e il nome nudo della variabile
 * catturata. Un oggetto composto a mano — `{ message: error?.message }` — non
 * corrisponde, ed e la forma che il repository usa gia dove e stata scritta
 * bene.
 */
const PASSA_ERRORE_INTERO =
  /console\.(log|info|warn|error|debug|trace)\((?:[^()]*,)?\s*(error|err|e|ex|exception)\s*\)/;

/**
 * I commenti non sono codice.
 *
 * Non e pedanteria: **questo file esiste per far scrivere commenti che citano
 * la forma sbagliata**, e senza questo passaggio il presidio fallirebbe su
 * `observability.ts`, cioe sulla funzione che lo chiude.
 */
const senzaCommenti = (righe) => {
  let dentroBlocco = false;

  return righe.map((riga) => {
    let pulita = riga;

    if (dentroBlocco) {
      const fine = pulita.indexOf("*/");
      if (fine < 0) return "";
      pulita = pulita.slice(fine + 2);
      dentroBlocco = false;
    }

    for (;;) {
      const inizio = pulita.indexOf("/*");
      if (inizio < 0) break;
      const fine = pulita.indexOf("*/", inizio + 2);
      if (fine < 0) {
        dentroBlocco = true;
        pulita = pulita.slice(0, inizio);
        break;
      }
      pulita = pulita.slice(0, inizio) + pulita.slice(fine + 2);
    }

    const linea = pulita.indexOf("//");
    return linea >= 0 ? pulita.slice(0, linea) : pulita;
  });
};

const violazioni = () => {
  const trovate = [];

  for (const radice of RADICI) {
    for (const file of elencaFile(radice)) {
      const originali = fs.readFileSync(file, "utf8").split(/\r?\n/);
      senzaCommenti(originali).forEach((riga, indice) => {
        if (PASSA_ERRORE_INTERO.test(riga)) {
          trovate.push({
            file,
            riga: indice + 1,
            testo: originali[indice].trim(),
          });
        }
      });
    }
  }

  return trovate;
};

test("nessun log server passa un errore intero, fuori dai residui dichiarati", () => {
  const nuove = violazioni().filter(
    (violazione) => !RESIDUI_DICHIARATI.has(violazione.file),
  );

  assert.deepEqual(
    nuove.map((violazione) => `${violazione.file}:${violazione.riga}`),
    [],
    "un log nuovo passa l'errore intero: usa reportServerError, oppure " +
      "`{ message: error?.message, code: error?.code }`",
  );
});

test("il perimetro che la lane 6I ha ripulito resta pulito", () => {
  const dentro = violazioni().filter((violazione) =>
    PERIMETRO_RIPULITO.some((prefisso) => violazione.file.startsWith(prefisso)),
  );

  assert.deepEqual(dentro, []);
});

test("il registro dei residui non contiene file gia risolti", () => {
  const conViolazioni = new Set(violazioni().map((v) => v.file));
  const risolti = [...RESIDUI_DICHIARATI].filter(
    (file) => !conViolazioni.has(file),
  );

  assert.deepEqual(
    risolti,
    [],
    "questi file sono stati corretti: toglierli dal registro, cosi il debito " +
      "dichiarato resta uguale a quello vero",
  );
});

test("i punti corretti dalla 6I usano davvero il punto unico", () => {
  const attesi = [
    "src/app/api/v1/auth/register/route.ts",
    "src/app/api/v1/auth/login/route.ts",
    "src/app/api/v1/auth/password/forgot/route.ts",
    "src/app/api/v1/auth/verify/email/confirm/route.ts",
    "src/app/api/v1/auth/verify/phone/confirm/route.ts",
    "src/app/api/v1/auth/verify/phone/send/route.ts",
    "src/app/api/public/forms/[publicSlug]/route.ts",
  ];

  for (const file of attesi) {
    const testo = fs.readFileSync(file, "utf8");
    assert.ok(
      testo.includes("reportServerError("),
      `${file} non passa dal punto unico`,
    );
  }
});
