/**
 * **Chi risponde a «quali atleti appartengono a questa categoria?»**
 *
 *     node scripts/censimento-eleggibilita.mjs
 *
 * ---
 *
 * ## Perche esiste
 *
 * La domanda aveva **due** risposte canoniche e cinque copie private, e tutte
 * sbagliavano allo stesso modo: mettevano l'identificativo di una categoria e
 * la sua etichetta nello stesso insieme, e intersecavano. Correggerne una
 * lasciava le altre; ogni correzione ne creava una versione nuova.
 *
 * E la stessa forma per cui esiste `scripts/pp-02-censimento.mjs`, e la
 * risposta e la stessa: le regole di un dominio stanno in una primitiva, non
 * in ogni consumatore (ADR-0153), e a farlo valere e un censimento derivato
 * **dall'albero** — non un elenco scritto a mano che invecchia in silenzio.
 *
 * ## Le tre proprieta
 *
 * * **E1** — nessuno, fuori dal modulo canonico, ricostruisce in casa il
 *   confronto «identificativi ed etichette nello stesso insieme»;
 * * **E2** — ogni percorso che decide un'**eleggibilita** e classificato, e
 *   nessuno di piu: un consumatore nuovo va nominato qui prima di essere
 *   scritto;
 * * **E3** — chi e dichiarato canonico **importa** davvero la primitiva. Non
 *   che ne nomini il nome in un commento: che la importi.
 */

import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const MODULO_CANONICO = "src/lib/categories/identity.ts";

/**
 * I marcatori che dicono «questo file decide un'eleggibilita per categoria».
 *
 * Larghi di proposito: un falso positivo costa una riga di classificazione, un
 * falso negativo costa una squadra che si vede l'organico di un'altra.
 */
const MARCATORI = [
  /athleteMatchesCategory|athleteMatchesAnyCategory/,
  /recordMatchesCategory|recordMatchesAnyCategory/,
  /sameCategory|sameAnyCategory|categoryIdentity/,
  /*
    **La funzione vecchia e un marcatore quanto le nuove.**

    Una revisione indipendente ha trovato un consumatore vivo che il censimento
    non vedeva — la bacheca dell allenatore — perche chiamava
    `extractCategoryTokens`, cioe la borsa che mette insieme identificativi ed
    etichette, e nessuno dei marcatori la nominava. Un censimento che cerca
    solo i nomi nuovi trova chi ha gia migrato, non chi deve ancora.
  */
  /extractCategoryTokens/,
  /resolveTargetCategory|athleteBelongsToCategory/,
];

/**
 * **La classificazione.** Non e la fonte dell'elenco — quello lo deriva
 * l'albero — ma la fonte del **giudizio**: che cosa decide quel percorso, se
 * riceve il catalogo del club, e se e tenuto a passare dalla primitiva.
 *
 * `catalogo: true` significa che quel percorso **deve** poter distinguere due
 * categorie omonime, cioe che il catalogo lo riceve davvero. `false` significa
 * che non ce l'ha e non puo averlo: li il ripiego per nome e l'unica risposta
 * possibile, ed e dichiarato invece che subito.
 */
const TABELLA = {
  [MODULO_CANONICO]: {
    decide: "la regola: due riferimenti nominano la stessa categoria?",
    catalogo: true,
    canonico: false /* e lui la primitiva: non importa se stesso */,
  },

  /* ---------------- i due nomi storici, che ora delegano ---------------- */
  "src/lib/category-utils.ts": {
    decide: "questo atleta e di questa categoria (nome storico)",
    catalogo: true,
    canonico: true,
  },
  "src/lib/trainer-dashboard-helpers.ts": {
    decide: "questo record e di questa categoria (nome storico)",
    catalogo: true,
    canonico: true,
  },

  /* ---------------- chi decide chi entra in un elenco ---------------- */
  "src/lib/server/rsvp.ts": {
    decide: "chi e atteso a un evento, e quindi chi puo rispondere",
    catalogo: true,
    canonico: true,
  },
  "src/lib/server/parent-dashboard.ts": {
    decide: "quali eventi riguardano questo figlio",
    catalogo: true,
    canonico: true,
  },
  "src/app/training/page.tsx": {
    decide: "chi compare nell'appello",
    catalogo: true,
    canonico: true,
  },
  "src/app/matches/page.tsx": {
    decide: "chi e convocabile",
    catalogo: true,
    canonico: false /* passa dai nomi storici, che delegano */,
  },
  "src/lib/category-athlete-stats.ts": {
    decide: "l'organico di una categoria nei report",
    catalogo: true,
    canonico: true,
  },
  "src/lib/trainer-operational-alerts.ts": {
    decide: "gli avvisi operativi della squadra",
    catalogo: true,
    canonico: false,
  },
  "src/lib/club-report-utils.ts": {
    decide: "i report per categoria",
    catalogo: true,
    canonico: false,
  },

  "src/app/categories/page.tsx": {
    decide: "l'organico mostrato sulla scheda di una categoria",
    catalogo: true,
    canonico: false,
  },
  /*
    **Il perimetro dell'allenatore lo decide anche il server**, e il
    censimento non lo vedeva.

    `filterRecordsForTrainer` risponde alla stessa domanda della bacheca —
    «questo atleta e di una squadra di questo allenatore?» — ed e la
    risposta che **conta**, perche e quella che decide che cosa esce dalla
    rete. Il browser rifa il conto sopra, e le due risposte devono dire la
    stessa cosa: quando non lo dicevano, il server ne mandava ventinove e la
    bacheca ne mostrava tre.

    Non passa dalla primitiva: ha la propria catena di token
    (`extractRecordCategoryTokens`), che legge appartenenze, colonne e
    payload di ogni risorsa e non dei soli atleti. E il candidato piu grosso
    alla prossima consolidazione, e finche non lo e va **dichiarato**.
  */
  "src/lib/server/resources.ts": {
    decide: "che cosa esce dalla rete per un allenatore",
    catalogo: true,
    canonico: false,
  },
  "src/components/trainer/trainer-dashboard-context.tsx": {
    decide: "gli atleti assegnati a questo allenatore",
    catalogo: true,
    canonico: true,
  },
  "src/components/trainer/trainer-trainings-dashboard-page.tsx": {
    decide: "gli allenamenti della squadra di questo allenatore",
    catalogo: true,
    canonico: false,
  },
  "src/components/trainer/trainer-matches-dashboard-page.tsx": {
    decide: "le gare della squadra di questo allenatore",
    catalogo: true,
    canonico: false,
  },
  "src/components/trainer/trainer-weekly-schedule-panel.tsx": {
    decide: "il calendario settimanale della squadra",
    catalogo: true,
    canonico: false,
  },

  "src/lib/server/training-automation.ts": {
    decide: "quanti attesi a un allenamento generato",
    catalogo: true,
    canonico: false,
  },

  /* ---------------- chi non ha il catalogo, e lo dichiara ---------------- */
  "src/lib/simplified-db.ts": {
    decide: "filtri lato browser (in riduzione, WP-07)",
    catalogo: false,
    canonico: false,
  },
  "src/lib/clothing-inventory-utils.ts": {
    decide: "la taglia prevista per una categoria",
    catalogo: false,
    canonico: false,
  },
  "src/app/medical/page.tsx": {
    decide: "il filtro per categoria della schermata sanitaria",
    catalogo: true,
    canonico: false,
  },
  "src/components/dashboard/UpcomingTrainings.tsx": {
    decide: "il riquadro dei prossimi allenamenti",
    catalogo: true,
    canonico: false,
  },
  "src/components/trainer/trainer-categories-dashboard-page.tsx": {
    decide: "l'organico mostrato all'allenatore",
    catalogo: true,
    canonico: false,
  },
};

/* ------------------------------------------------------------- l'albero */

/*
  `--others` accanto a `--cached`: un consumatore nuovo va censito **prima**
  di essere committato, non dopo. Senza, il censimento direbbe verde sul file
  che si sta scrivendo proprio adesso — che e l'unico momento in cui serve.
*/
const tracciati = execFileSync(
  "git",
  [
    "ls-files",
    "--cached",
    "--others",
    "--exclude-standard",
    "--",
    "src",
  ],
  { encoding: "utf8" },
)
  .split("\n")
  .map((riga) => riga.trim().replace(/\\/g, "/"))
  .filter((riga) => /\.(ts|tsx)$/.test(riga));

const trovati = [];
for (const percorso of tracciati) {
  /*
    Un file **cancellato e non ancora messo in scena** e ancora nell'indice, e
    aprirlo faceva morire il censimento con un `ENOENT` al posto di un verbale.
    Un percorso che non c'e non decide niente: si salta.
  */
  let testo;
  try {
    testo = readFileSync(percorso, "utf8");
  } catch (errore) {
    if (errore?.code === "ENOENT") continue;
    throw errore;
  }
  if (MARCATORI.some((regex) => regex.test(testo))) trovati.push(percorso);
}

/* ------------------------------------------------------------- le prove */

const esiti = [];
const prova = (titolo, atteso, trovato, nota = "") => {
  const ok = JSON.stringify(atteso) === JSON.stringify(trovato);
  esiti.push({ titolo, ok });
  console.log(
    `  ${ok ? "PASS" : "FAIL"}  ${titolo.padEnd(64)} ${JSON.stringify(trovato)}` +
      (ok ? "" : `   atteso ${JSON.stringify(atteso)}`),
  );
  if (!ok && nota) console.log(`        nota: ${nota}`);
};

console.log("\n  Censimento dell'eleggibilita per categoria (D-INT-2)");
console.log("  ----------------------------------------------------\n");

console.log(`  percorsi che decidono un'eleggibilita : ${trovati.length}`);
console.log(`  classificati                          : ${Object.keys(TABELLA).length}\n`);

/* E2 — l'elenco e la tabella coincidono, nei due versi */
prova(
  "E2 ogni percorso che decide e classificato",
  [],
  trovati.filter((percorso) => !TABELLA[percorso]),
  "un consumatore nuovo: va classificato qui prima di essere scritto",
);

prova(
  "E2b e ogni percorso classificato decide ancora",
  [],
  Object.keys(TABELLA).filter((percorso) => !trovati.includes(percorso)),
  "una riga che non corrisponde piu a niente e una tabella che invecchia",
);

/* E3 — chi e canonico importa la primitiva, non la nomina */
const esporta = new Set(
  Array.from(
    readFileSync(MODULO_CANONICO, "utf8").matchAll(
      /export const (\w+)|export type (\w+)/g,
    ),
  )
    .map((m) => m[1] || m[2])
    .filter(Boolean),
);

const canoniciSenzaImport = Object.entries(TABELLA)
  .filter(([, voce]) => voce.canonico)
  .filter(([percorso]) => {
    const testo = readFileSync(percorso, "utf8");
    const importa = /from "@\/lib\/categories\/identity"/.test(testo);
    if (!importa) return true;

    /* E non basta importare: il nome importato deve esistere davvero. */
    const nomi = Array.from(
      testo.matchAll(/import \{([^}]+)\} from "@\/lib\/categories\/identity"/g),
    )
      .flatMap((m) => m[1].split(","))
      .map((n) => n.replace(/\btype\b/, "").trim())
      .filter(Boolean);

    return !nomi.some((nome) => esporta.has(nome));
  })
  .map(([percorso]) => percorso);

prova(
  "E3 chi e dichiarato canonico importa una primitiva che esiste",
  [],
  canoniciSenzaImport,
  "nominarla in un commento non e importarla",
);

/* E1 — nessuno ripiega la regola in casa */
const SOSPETTO =
  /tokens\.add\([^)]*resolveCategoryLabel|categoryReferences\.some\(|\.includes\(reference\)/;

/*
  **E1 misura il codice, non il racconto.**

  La prima stesura applicava il vaglio al file intero, e trovava due volte
  `parent-dashboard.ts`: in due **commenti** che descrivono il difetto appena
  tolto. Un censimento che diventa rosso perche qualcuno ha spiegato cosa non
  si fa piu insegna a non spiegarlo — che e il verso opposto di cio che questo
  repository chiede a chi corregge.

  I commenti si tolgono prima di guardare. E la stessa lezione di C3 del
  censimento dei tutori: «nominarla in un commento non e importarla», qui letta
  dall'altro lato.
*/
const senzaCommenti = (testo) =>
  testo
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^\s*\/\/.*$/gm, " ");

const ripieghi = trovati
  .filter((percorso) => percorso !== MODULO_CANONICO)
  .filter((percorso) => SOSPETTO.test(senzaCommenti(readFileSync(percorso, "utf8"))));

prova(
  "E1 nessuno ricostruisce il confronto in casa",
  [],
  ripieghi,
  "identificativi ed etichette nello stesso insieme: e la fusione di P0-4",
);

/* ------------------------------------------------------------- il conto */

const rosse = esiti.filter((riga) => !riga.ok);
console.log("");
console.log(`  Esito: ${esiti.length - rosse.length}/${esiti.length}`);
if (rosse.length) process.exitCode = 1;
