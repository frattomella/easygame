import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import {
  canAccessPath,
  encodeCustomRoleToken,
  isCustomRoleValue,
} from "../../src/lib/access-roles.ts";
import { roleHasPermission } from "../../src/lib/permissions/catalog.ts";
import { hasAccountingPermission } from "../../src/lib/accounting/permissions.ts";
import { hasCommunicationPermission } from "../../src/lib/communications/permissions.ts";
import { hasSeasonPermission } from "../../src/lib/seasons/permissions.ts";
import { hasSportWorkPermission } from "../../src/lib/sport-work/permissions.ts";

/**
 * **Le difese che nessun gate copriva.**
 *
 * Una revisione ha fatto mutation testing su ventuno difese della Wave 6 e ha
 * misurato che **sette** non erano viste da nessun gate: si potevano invertire,
 * svuotare o disinnescare, e tutti e sei i comandi restavano verdi.
 *
 * Le tre qui sotto sono quelle senza un posto naturale dove stare — non
 * appartengono a un dominio, appartengono al **modello**. Le altre quattro sono
 * finite nelle sonde, dove si misurano a runtime.
 *
 * Il criterio di questo file: ogni prova deve fallire se la riga che difende
 * viene cambiata, e ognuna dice quale riga.
 */

const leggi = (percorso) => readFileSync(`src/${percorso}`, "utf8");

/* ===================================================================== */
/*  1. Il soffitto di `narrowDomainPermission`                           */
/* ===================================================================== */

test("un ruolo personalizzato non ottiene una chiave che la sua base non ha", () => {
  /*
    `narrowDomainPermission` e il **soffitto** del modello «soffitto ∧
    concessione» dichiarato in CLAUDE.md §2. La riga che lo regge —
    «se la base non ha la chiave, no» — poteva essere invertita **senza che
    nessun gate se ne accorgesse**: due file di test nominavano la funzione e
    nessuno dei due copriva quel ramo.

    Con la riga invertita, un ruolo di club costruito su `trainer` otteneva i
    permessi di contabilita, comunicazioni, lavoro sportivo e stagioni che la
    sua base non ha — cioe la scalata che tutto il modello esiste per impedire.
  */
  const daAllenatore = encodeCustomRoleToken("custom:trainer:preparatore", [
    "accounting.manage",
    "communications.send",
    "sport_work.pay",
    "seasons.change",
  ]);

  for (const chiave of [
    "accounting.manage",
    "communications.send",
    "sport_work.pay",
    "seasons.change",
  ]) {
    assert.equal(
      roleHasPermission(daAllenatore, chiave),
      false,
      `un ruolo su base «trainer» non puo ottenere «${chiave}»: la base non ce l'ha, e una concessione non alza il soffitto`,
    );
  }

  /* E cio che la base **ha** continua a passare, se e stato concesso. */
  const conEventi = encodeCustomRoleToken("custom:trainer:preparatore", [
    "events.attendance",
  ]);
  assert.equal(roleHasPermission(conEventi, "events.attendance"), true);
  assert.equal(roleHasPermission(conEventi, "events.manage"), false);
});

test("e i quattro domini con matrice propria applicano lo stesso soffitto", () => {
  /*
    `narrowDomainPermission` e il soffitto **dei domini che hanno una matrice
    propria** — contabilita, comunicazioni, stagioni, lavoro sportivo — ed e una
    riga diversa da quella di `roleHasPermission`. Una revisione l ha invertita
    e **nessun gate** se ne e accorto: due file la nominavano, e nessuno dei due
    esercitava il ramo «la base non ce l ha».

    Con la riga invertita, un ruolo di club su base `trainer` otteneva i
    permessi di tutti e quattro.
  */
  const daAllenatore = encodeCustomRoleToken("custom:trainer:preparatore", [
    "accounting.manage",
    "communications.send",
    "seasons.change",
    "sport_work.pay",
  ]);

  assert.equal(hasAccountingPermission(daAllenatore, "accounting.manage"), false);
  assert.equal(hasCommunicationPermission(daAllenatore, "communications.send"), false);
  assert.equal(hasSeasonPermission(daAllenatore, "seasons.change"), false);
  assert.equal(hasSportWorkPermission(daAllenatore, "sport_work.pay"), false);

  /*
    E il controspecchio, senza il quale una regola che nega tutto passerebbe
    per una difesa: un ruolo sulla base **giusta**, con la chiave concessa,
    passa; lo stesso ruolo senza quella chiave no.
  */
  const daGestore = encodeCustomRoleToken("custom:club_manager:amministrazione", [
    "accounting.manage",
  ]);
  assert.equal(hasAccountingPermission(daGestore, "accounting.manage"), true);
  assert.equal(hasAccountingPermission(daGestore, "accounting.reverse"), false);
});

/* ===================================================================== */
/*  2. Le guardie asincrone vanno attese                                 */
/* ===================================================================== */

test("nessuna guardia asincrona viene invocata senza `await`", () => {
  /*
    **Togliere una parola disinnesca una guardia in silenzio.**

    `guardPlatformOwnedClubSettings` e `async` e comunica il rifiuto con un
    `throw`. Chiamata senza `await`, continua a girare — e a scrivere
    l'audit — ma il `throw` diventa una promise rifiutata che nessuno guarda,
    e la scrittura prosegue. Una revisione lo ha misurato: **nessun gate** se
    ne accorgeva, mentre svuotare la stessa guardia in modo esplicito faceva
    cadere cinque test.

    **La prima stesura di questa regola aveva tre confini, e li ha trovati la
    revisione successiva.** Costruiva l'insieme delle guardie **file per
    file**, quindi una dichiarata in A e chiamata in B non era guardata da
    nessuno — misurato su `assertPersonalDataDisposed`, dichiarata in
    `data-subject.ts` e chiamata in `resources.ts`. Leggeva otto file
    **cablati**, e ne restavano fuori quattro che dichiarano guardie. E
    accettava tre **prefissi**, quindi rinominare in `ensure…` la rendeva
    cieca — e `ensureAccountBelongsToClub` esiste davvero.

    Adesso: si leggono **tutti** i sorgenti del server, l'insieme delle
    guardie e l'**unione** di quanto ognuno dichiara, e i prefissi sono
    quattro perche `ensure` e uno di essi. Nessuno dei tre confini resta.
  */
  const PREFISSI = String.raw`(?:assert|guard|applica|ensure)`;

  const sorgenti = (cartella) => {
    const trovati = [];
    for (const voce of readdirSync(cartella, { withFileTypes: true })) {
      const completo = path.join(cartella, voce.name);
      if (voce.isDirectory()) trovati.push(...sorgenti(completo));
      else if (/\.tsx?$/.test(voce.name)) trovati.push(completo);
    }
    return trovati;
  };

  const file = [
    ...sorgenti(path.resolve("src/lib/server")),
    ...sorgenti(path.resolve("src/app/api")),
  ];

  const testi = new Map(
    file.map((percorso) => [percorso, readFileSync(percorso, "utf8")]),
  );

  /*
    **Chi dichiara una guardia asincrona, e chi la importa.**

    Un insieme unico per tutti i file sarebbe troppo largo: `assertCanManage`
    esiste in tre moduli come funzione **sincrona**, e in un quarto no. Un
    insieme per file sarebbe troppo stretto, ed e il difetto che questa
    stesura corregge.

    La risposta e la terza: un nome vale come guardia asincrona in un file se
    quel file la **dichiara** cosi, oppure se la **importa** da un modulo che
    la dichiara cosi. E lo stesso criterio che usa il compilatore.
  */
  const dichiarateAsincrone = new Set();
  for (const testo of testi.values()) {
    for (const trovato of testo.matchAll(
      new RegExp(
        String.raw`(?:const|function)\s+(` + PREFISSI + String.raw`[A-Za-z0-9_]*)\s*(?::[^=]*)?=?\s*async\b`,
        "g",
      ),
    )) {
      dichiarateAsincrone.add(trovato[1]);
    }
  }

  const asincroneDi = (testo) => {
    const locali = new Set();

    for (const trovato of testo.matchAll(
      new RegExp(
        String.raw`(?:const|function)\s+(` + PREFISSI + String.raw`[A-Za-z0-9_]*)\s*(?::[^=]*)?=?\s*async\b`,
        "g",
      ),
    )) {
      locali.add(trovato[1]);
    }

    /* i nomi importati, che valgono se qualcuno li dichiara asincroni */
    for (const blocco of testo.matchAll(/import\s*\{([^}]*)\}\s*from/g)) {
      for (const pezzo of blocco[1].split(",")) {
        const nome = pezzo.replace(/\btype\b/, "").trim().split(/\s+as\s+/)[0].trim();
        if (nome && dichiarateAsincrone.has(nome)) locali.add(nome);
      }
    }

    return locali;
  };

  assert.ok(
    dichiarateAsincrone.size >= 10,
    `guardie asincrone trovate: ${dichiarateAsincrone.size}. Se sono cosi poche, la ricerca non sta piu funzionando`,
  );

  const colpevoli = [];

  for (const [percorso, testo] of testi) {
    const relativo = path.relative(path.resolve("src"), percorso).split(path.sep).join("/");
    const asincrone = asincroneDi(testo);
    if (!asincrone.size) continue;

    /*
      I commenti non sono codice, e questo file ne e pieno: un commento che
      **cita** una guardia — `(\`ensureAccountBelongsToClub(client, …)\`)` —
      non e una chiamata senza `await`.
    */
    const senzaCommenti = testo
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");

    senzaCommenti.split("\n").forEach((riga, indice) => {
      const chiamata = riga.match(
        new RegExp(String.raw`(^|[^.\w])(` + PREFISSI + String.raw`[A-Za-z0-9_]*)\s*\(`),
      );
      if (!chiamata) return;

      const nome = chiamata[2];
      if (!asincrone.has(nome)) return;
      if (new RegExp(`(const|function)\\s+${nome}\\b`).test(riga)) return;

      const prefisso = riga.slice(0, chiamata.index + chiamata[1].length);
      if (/\bawait\s*$/.test(prefisso)) return;
      if (/\breturn\s*$/.test(prefisso)) return;
      /* dentro un `Promise.all([...])` l'attesa e sull'insieme */
      if (/\b(Promise\.(all|allSettled|race)\s*\(\s*\[?|=>)\s*$/.test(prefisso)) return;

      colpevoli.push(`${relativo}:${indice + 1}: ${riga.trim().slice(0, 90)}`);
    });
  }

  assert.deepEqual(
    colpevoli,
    [],
    "guardie asincrone invocate senza `await`: il loro rifiuto diventa una " +
      "promise rifiutata che nessuno guarda, e la scrittura prosegue.\n" +
      colpevoli.join("\n"),
  );
});

/* ===================================================================== */
/*  3. La pagina che ridefinisce le deleghe non e delegabile             */
/* ===================================================================== */

test("un ruolo personalizzato non apre l'amministrazione degli accessi", () => {
  /*
    Il gemello lato server e coperto da `npm test` **e** da `wave6:roles`; la
    guardia di rotta non era coperta da niente, e il commit che l'ha aggiunta
    dichiarava le due «allineate». Una revisione l'ha tolta e tutti i gate
    sono rimasti verdi.

    La divergenza fra cio che il menu mostra e cio che il server concede non e
    un difetto di sicurezza — il server nega comunque — ma insegna a diffidare
    dei messaggi, e questa Wave esiste per smontare i comandi che non fanno
    cio che dicono.
  */
  const gettone = encodeCustomRoleToken("custom:club_manager:segreteria", [
    "documents.review",
  ]);

  assert.equal(isCustomRoleValue(gettone), true);
  assert.equal(canAccessPath(gettone, "/dashboard/access-management"), false);
  assert.equal(
    canAccessPath(gettone, "/dashboard/access-management/qualcosa"),
    false,
  );

  /* Lo slug nudo, senza chiavi, e la stessa cosa. */
  assert.equal(
    canAccessPath("custom:club_manager:segreteria", "/dashboard/access-management"),
    false,
  );

  /* E la direzione canonica ci entra, altrimenti la pagina non servirebbe. */
  assert.equal(canAccessPath("owner", "/dashboard/access-management"), true);
  assert.equal(
    canAccessPath("club_manager", "/dashboard/access-management"),
    true,
  );

  /*
    E le altre pagine riservate restano aperte a un ruolo personalizzato che
    ne ha le chiavi: il divieto e su **questa**, e la ragione e scritta accanto
    alla guardia — le altre hanno chiavi di catalogo con cui delegarle.
  */
  assert.equal(canAccessPath(gettone, "/settings"), true);
});
