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
/**
 * **Il registro dei residui e vuoto, e va detto perche.**
 *
 * Tutti e sei sono stati convertiti: passano dal punto unico, che redige.
 * Resta l elenco — non l insieme dei nomi — perche il controllo che lo legge e
 * quello che impedisce di **riempirlo di nuovo** senza accorgersene.
 *
 * E dalla quarta stesura di questo file la difesa vera non e piu qui: e una
 * regola di lint (`no-console` sotto `src/lib/server` e `src/app/api`, con
 * deroga solo a `observability.ts`). Quattro revisioni hanno evaso quattro
 * stesure di espressioni regolari — un nome di variabile italiano, una
 * chiamata spezzata su piu righe, una variabile intermedia — e la lezione e
 * che una proprieta sulla **sintassi** si aggira sempre con altra sintassi.
 * Il lint non guarda la forma: guarda se la chiamata esiste.
 */
const RESIDUI_DICHIARATI = new Set([]);

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
/**
 * **La variabile catturata da un `catch` non arriva a un log.**
 *
 * Le stesure precedenti enumeravano: prima la variabile nuda, poi
 * `String(error)` e l'interpolazione, poi `error.message`. Tutte e tre erano
 * ancorate a un elenco di **nomi inglesi** — `error|err|e|ex|exception` — e
 * una revisione ha scritto `catch (problema) { console.error("…" +
 * problema?.message) }` dentro il perimetro a tolleranza zero, con sei gate
 * verdi. In un repository che scrive `colpevoli` e `perimetri`, un nome
 * italiano non e un artificio: e lo stile della casa.
 *
 * La proprieta si dice senza elenchi: **il nome che un `catch` lega non deve
 * comparire in un log**, qualunque sia. Lo si legge dal `catch` stesso.
 */
const APERTURA = String.raw`console\.(log|info|warn|error|debug|trace)\(`;

/**
 * I nomi legati da un `catch` in questo file, con la riga in cui comincia il
 * blocco: fuori da li quel nome non esiste, e cercarlo ovunque darebbe falsi
 * positivi su una variabile omonima.
 */
const nomiCatturati = (righe) => {
  const trovati = [];
  righe.forEach((riga, indice) => {
    const trovato = riga.match(/catch\s*\(\s*([A-Za-z_$][\w$]*)/);
    if (trovato) trovati.push({ nome: trovato[1], da: indice });
  });
  return trovati;
};

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
      const pulite = senzaCommenti(originali);
      const catturati = nomiCatturati(pulite);

      pulite.forEach((riga, indice) => {
        /*
          La finestra comincia dove comincia la chiamata: una `console.error`
          spezzata su piu righe e **una** chiamata, e segnalarne cinque
          direbbe cinque difetti dove ce n'e uno.
        */
        if (!new RegExp(APERTURA).test(riga.replace(/\s+/g, ""))) return;

        /*
          Le stringhe si tolgono prima di cercare: «Email verification resend
          error» contiene la parola `error`, e non e un riferimento alla
          variabile. E il primo falso positivo che questa regola ha prodotto,
          ed e giusto toglierlo: un presidio che insegna a rinominare i
          messaggi non presidia, disturba.
        */
        const finestra = pulite
          .slice(indice, indice + 8)
          .join(" ")
          .replace(/\s+/g, " ")
          .replace(/"[^"]*"|'[^']*'|`[^`]*`/g, '""');

        /*
          I nomi che a questa riga sono **in ambito**: quelli legati da un
          `catch` piu sopra. Si guardano gli ultimi cinquanta righe, che e
          largamente piu di qualunque blocco `catch` sensato.
        */
        const inAmbito = catturati.filter(
          (voce) => voce.da <= indice && indice - voce.da < 50,
        );

        /*
          Ai nomi legati da un `catch` si uniscono quelli **classici**, che una
          callback riceve senza passare da un `catch`: `pool.on("error", (error)
          => …)` non e un blocco catturato, e la regola sul `catch` da sola non
          lo vedrebbe. I due elenchi si sommano — uno generalizza i nomi, l altro
          copre le forme che un `catch` non produce.
        */
        const nomi = new Set([
          ...inAmbito.map((voce) => voce.nome),
          "error",
          "err",
          "e",
          "ex",
          "exception",
        ]);

        for (const nome of nomi) {
          /*
            **Cio che non deve uscire e il messaggio, non l'errore.**

            Leggere `error.code` — o confrontare con `instanceof` — porta nel
            log un valore di dominio, che e esattamente l'informazione per cui
            un log esiste. Vietarlo insegnerebbe a non scrivere log utili, e
            un presidio che disturba viene aggirato.

            Restano vietate le tre forme che portano il **testo**: la
            variabile nuda, `String(...)` e l'interpolazione, e
            `.message`/`.stack`.
          */
          const N = nome.replace(/\$/g, "\\$");
          const FORME = [
            /* .message e .stack */
            new RegExp(APERTURA + String.raw`[^;]*\b` + N + String.raw`\s*\??\s*\.\s*(message|stack)\b`),
            /* String(nome) */
            new RegExp(APERTURA + String.raw`[^;]*String\(\s*` + N + String.raw`\s*\)`),
            /* `${nome}` */
            new RegExp(APERTURA + String.raw`[^;]*\$\{\s*` + N + String.raw`\s*\}`),
            /* la variabile nuda come argomento */
            new RegExp(APERTURA + String.raw`(?:[^();]*,)?\s*` + N + String.raw`\s*[,)]`),
          ];

          if (!FORME.some((forma) => forma.test(finestra))) continue;

          trovate.push({
            file,
            riga: indice + 1,
            testo: originali[indice].trim(),
          });
          return;
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
    "un log nuovo porta l'errore intero nel registro: passa da " +
      "reportServerError, che redige. Non ricomporlo a mano con " +
      "`error?.message`: il messaggio di un errore Prisma contiene la query " +
      "e i suoi parametri, cioe il dato personale che si voleva togliere",
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
