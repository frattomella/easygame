import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

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
    **Togliere una parola disinnescava una guardia in silenzio.**

    `guardPlatformOwnedClubSettings` e `async` e comunica il rifiuto con un
    `throw`. Chiamata senza `await`, continua a girare — e a scrivere l'audit —
    ma il `throw` diventa una promise rifiutata che nessuno guarda, e la
    scrittura prosegue. Una revisione lo ha misurato: **nessun gate** se ne
    accorgeva, mentre svuotare la stessa guardia in modo esplicito faceva
    cadere cinque test.

    I presidi guardavano *cosa* fa la guardia, non *se il chiamante la aspetta*.
    Questo guarda la seconda cosa, ed e una proprieta: vale per ogni guardia
    che esiste oggi e per ogni guardia che nascera.
  */
  const FILE = [
    "lib/server/resources.ts",
    "lib/server/document-requests.ts",
    "lib/server/events.ts",
    "lib/server/club-roles.ts",
    "lib/server/data-subject.ts",
    "lib/server/attachments.ts",
    "lib/server/athlete-accounts.ts",
    "lib/server/appointments.ts",
  ];

  const colpevoli = [];

  for (const percorso of FILE) {
    const sorgente = leggi(percorso);

    /* Le guardie asincrone dichiarate in questo file. */
    const asincrone = new Set(
      [
        ...sorgente.matchAll(
          /(?:const|function)\s+((?:assert|guard|applica)[A-Za-z0-9_]*)\s*(?::[^=]*)?=?\s*async\b/g,
        ),
      ].map((m) => m[1]),
    );

    if (!asincrone.size) continue;

    const righe = sorgente.split("\n");
    righe.forEach((riga, indice) => {
      const chiamata = riga.match(
        /(^|[^.\w])((?:assert|guard|applica)[A-Za-z0-9_]*)\s*\(/,
      );
      if (!chiamata) return;

      const nome = chiamata[2];
      if (!asincrone.has(nome)) return;

      /* La dichiarazione non e una chiamata. */
      if (new RegExp(`(const|function)\\s+${nome}\\b`).test(riga)) return;

      const prefisso = riga.slice(0, chiamata.index + chiamata[1].length);
      if (/\bawait\s*$/.test(prefisso)) return;
      if (/\breturn\s*$/.test(prefisso)) return;

      colpevoli.push(`${percorso}:${indice + 1}: ${riga.trim().slice(0, 90)}`);
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
