import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";

/**
 * La scheda **Previsti**, e cio che non deve tornare con lei (W4-B1).
 *
 * Riscrivendo `/movements` sopra il registro contabile, la lane precedente ha
 * tolto la scheda «Previsti» — e con lei l'unica interfaccia di
 * `expected_income` e `expected_expenses`. I dati sono rimasti intatti nel
 * database; la schermata no. Rimetterla e un rimedio, non un ritorno: la
 * versione di prima si reggeva sull'aggregatore nel browser che la Wave ha
 * rimosso, e scriveva riscrivendo l'intera colonna JSON dal browser.
 *
 * Questi test non dicono se un numero e giusto: difendono le tre cose che si
 * perdono senza accorgersene — la separazione fra previsione e cassa,
 * l'aggregatore che rientra da una porta laterale, e la scrittura che torna nel
 * browser.
 */

const read = (relative) =>
  fs.readFileSync(path.join(process.cwd(), relative), "utf8");

/**
 * Il file **senza i commenti**: qui i moduli spiegano i difetti che chiudono, e
 * quindi nominano `addClubData`, `confirm()` e l'aggregatore. E la ricerca del
 * **codice** che deve essere pulita, non quella della documentazione.
 */
const readCode = (relative) =>
  read(relative)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .split(/\r?\n/)
    .filter((line) => !line.trimStart().startsWith("//"))
    .join("\n");

const PAGE = "src/app/movements/page.tsx";
const SCHEDA = "src/components/accounting/ExpectedEntries.tsx";
const SERVIZIO = "src/lib/server/expected-entries.ts";
const ROTTA = "src/app/api/v1/accounting/expected/route.ts";
const ROTTA_ID = "src/app/api/v1/accounting/expected/[id]/route.ts";
const RIEPILOGO = "src/components/accounting/AccountingSummary.tsx";

/* ========================================================================== */
/* La superficie torna                                                         */
/* ========================================================================== */

test("la scheda «Previsti» esiste di nuovo, e monta il suo componente", () => {
  const page = read(PAGE);

  assert.match(
    page,
    /<TabsTrigger value="previsti">Previsti<\/TabsTrigger>/,
    "senza la scheda `expected_income` e `expected_expenses` non hanno nessuna interfaccia",
  );
  assert.match(page, /<ExpectedEntries clubId=\{activeClubId\} \/>/);
  assert.match(
    page,
    /from "@\/components\/accounting\/ExpectedEntries"/,
    "la scheda vive in un componente proprio: la logica di dominio non torna in page.tsx",
  );
});

test("l'elenco mostra entrate e uscite previste con i loro totali", () => {
  const scheda = read(SCHEDA);

  for (const etichetta of [
    "Entrate previste",
    "Uscite previste",
    "Differenza prevista",
  ]) {
    assert.ok(
      scheda.includes(etichetta),
      `manca il totale «${etichetta}»: senza i totali la scheda e un elenco e basta`,
    );
  }

  assert.match(
    scheda,
    /expectedIncomeCents/,
    "i totali arrivano gia sommati dal servizio, come per la prima nota",
  );
  assert.match(
    scheda,
    /Nuova previsione/,
    "creare una previsione e meta della funzione che era stata tolta",
  );
  assert.match(
    scheda,
    /Togliere questa previsione\?/,
    "e togliere una previsione e l'altra meta",
  );
});

/* ========================================================================== */
/* Una previsione non e cassa                                                  */
/* ========================================================================== */

test("la parola «previst-» compare ovunque la scheda nomini i suoi numeri", () => {
  for (const file of [PAGE, SCHEDA, SERVIZIO, ROTTA]) {
    assert.match(
      read(file),
      /previst/i,
      `${file}: un impegno futuro non etichettato come tale e il numero che nessuno sa piu leggere`,
    );
  }

  const scheda = read(SCHEDA);
  assert.match(
    scheda,
    /non sono denaro/i,
    "la scheda dichiara la grandezza che mostra, non la lascia dedurre",
  );
  assert.match(
    scheda,
    /Situazione previsionale/,
    "il riquadro dei totali si intitola con la sua grandezza, come le due fasce del riepilogo",
  );
});

test("la previsione non sta nella fascia finanziaria", () => {
  /*
    Le due fasce del riepilogo sono la separazione fra grandezze. Una
    previsione non e ne l'una ne l'altra — non e cassa e non e un credito
    maturato — e ricomparirci dentro sarebbe «Entrate» con sotto «Previste»,
    cioe il difetto appena tolto.
  */
  assert.match(read(RIEPILOGO), /Situazione finanziaria/);

  /*
    Senza commenti: il modulo **racconta** il difetto che ha tolto — «Entrate»
    con sotto «Previste» — e cercare quella parola nel testo integrale
    fallirebbe sulla documentazione passando su una riga di codice infilata
    sotto.
  */
  const riepilogo = readCode(RIEPILOGO);

  assert.equal(
    /previst/i.test(riepilogo),
    false,
    "nessuna previsione deve comparire nel riepilogo della prima nota",
  );
  assert.equal(
    /ExpectedEntries|accounting\/expected/.test(riepilogo),
    false,
    "il riepilogo non legge le previsioni: non sono un suo numero",
  );
});

test("la scheda dei previsti non mostra nessun saldo e nessun totale di cassa", () => {
  const scheda = readCode(SCHEDA);

  for (const proibito of [
    "accountBalances",
    "balanceCents",
    "report.cash",
    "collectedCents",
    "paidCents",
    "Liquidita totale",
  ]) {
    assert.equal(
      scheda.includes(proibito),
      false,
      `${proibito} non appartiene a una scheda di previsioni: affiancare un saldo a un'attesa e il difetto D-2`,
    );
  }
});

test("il servizio non porta le previsioni in prima nota", () => {
  const servizio = readCode(SERVIZIO);

  assert.equal(
    /accounting_entries|accountingEntry|createAccountingEntry|@\/lib\/accounting\/model/.test(
      servizio,
    ),
    false,
    "`accounting_entries` ospita solo fatti avvenuti: un impegno futuro non lo e",
  );
  assert.match(
    servizio,
    /expected_income/,
    "le previsioni restano nelle due colonne che le contengono da sempre",
  );
  assert.match(servizio, /expected_expenses/);
});

/* ========================================================================== */
/* L'aggregatore non rientra                                                   */
/* ========================================================================== */

test("nessuna delle superfici nuove riapre l'aggregatore rimosso", () => {
  for (const file of [PAGE, SCHEDA, SERVIZIO, ROTTA, ROTTA_ID]) {
    const source = readCode(file);

    assert.equal(
      source.includes("club-financial-summary"),
      false,
      `${file}: l'aggregatore nel browser normalizzava ventidue sorgenti, e due erano morte`,
    );
    assert.equal(
      /loadClubFinancialSources|aggregateClubPayments|summarizeClubMovements/.test(
        source,
      ),
      false,
      `${file}: quell'aggregatore e stato rimosso apposta`,
    );
    assert.equal(
      /supplier_payments|["'`]suppliers["'`]/.test(source),
      false,
      `${file}: \`suppliers\` e \`supplier_payments\` tornavano vuote a ogni apertura`,
    );
  }
});

/* ========================================================================== */
/* La scrittura non torna dal browser                                          */
/* ========================================================================== */

test("la scheda non scrive piu la colonna JSON dal browser", () => {
  const scheda = readCode(SCHEDA);

  for (const proibito of [
    "addClubData",
    "deleteClubDataItem",
    "getClubData",
    "updateClubData",
    "simplified-db",
    "@/lib/supabase",
  ]) {
    assert.equal(
      scheda.includes(proibito),
      false,
      `${proibito}: leggere la colonna intera, aggiungere in memoria e risalvarla dal browser e il difetto che questa lane chiude`,
    );
  }

  assert.match(
    scheda,
    /apiRequest\(\s*"\/api\/v1\/accounting\/expected"/,
    "la lettura passa dalla rotta, non dalla colonna",
  );
  assert.match(
    scheda,
    /method: "POST"/,
    "la creazione passa dalla rotta, e la scrittura e del server",
  );
});

test("la scrittura del server passa dal meccanismo dei soci, non da una riscrittura", () => {
  const servizio = readCode(SERVIZIO);

  assert.match(
    servizio,
    /appendClubResourceItem/,
    "una riga in `club_resource_items` sotto lock, non la colonna intera",
  );
  assert.match(servizio, /removeClubResourceItem/);
  assert.equal(
    /replaceClubResourceCollection/.test(servizio),
    false,
    "riscrivere la collezione e esattamente cio che due segreterie in contemporanea perdono",
  );

  const risorse = read("src/lib/server/resources.ts");
  assert.match(
    risorse,
    /export const removeClubResourceItem[\s\S]{0,900}FOR UPDATE/,
    "la cancellazione di un elemento mette in fila le richieste come la creazione",
  );
});

test("nessuna superficie nuova chiama `fetch` diretto su /api", () => {
  for (const file of [PAGE, SCHEDA]) {
    assert.equal(
      /fetch\(\s*[`"']\/api/.test(readCode(file)),
      false,
      `${file}: il trasporto HTTP client e \`src/lib/api/client.ts\``,
    );
  }
});

test("la scheda non importa niente da src/lib/server", () => {
  assert.equal(
    /from "@\/lib\/server\//.test(readCode(SCHEDA)),
    false,
    "un componente client che importa il servizio trascina Prisma nel bundle",
  );
});

/* ========================================================================== */
/* Permessi                                                                    */
/* ========================================================================== */

test("le rotte dichiarano i permessi, e vengono dalla matrice condivisa", () => {
  const rotta = read(ROTTA);
  const rottaId = read(ROTTA_ID);

  assert.match(rotta, /accountingRoute\(\s*"accounting\.read"/);
  assert.match(
    rotta,
    /"accounting\.manage"/,
    "registrare una previsione e lavoro di segreteria, come registrare un movimento",
  );
  assert.match(rottaId, /"accounting\.manage"/);

  for (const file of [ROTTA, ROTTA_ID]) {
    assert.equal(
      /activeRole ===|role ===|normalizeAccessRole/.test(readCode(file)),
      false,
      `${file}: una condizione sul ruolo scritta nella rotta e il modo in cui la matrice della pagina e quella dell'API divergono`,
    );
  }
});

test("un diniego del servizio porta la stringa che il route handler mappa su 403", () => {
  const servizio = read(SERVIZIO);

  assert.match(
    servizio,
    /Accesso negato/,
    "e la convenzione del repository: senza quella stringa un 403 diventa un 400",
  );
  assert.match(
    servizio,
    /assertAccountingPermission/,
    "i permessi contabili stanno in un modulo solo",
  );
});

test("la scheda non conosce il ruolo di chi guarda", () => {
  const scheda = readCode(SCHEDA);

  assert.match(
    scheda,
    /data\?\.canManage/,
    "il permesso viaggia con le righe, come per l'elenco dei movimenti",
  );
  assert.equal(
    /useAuth|activeRole|userRole|hasAccountingPermission|normalizeAccessRole|canManageClubConfiguration/.test(
      scheda,
    ),
    false,
    "ricalcolare il permesso nel browser e la lezione W3-14",
  );
});

/* ========================================================================== */
/* La cancellazione, e cio che resta vietato                                   */
/* ========================================================================== */

test("il `DELETE` esiste sulle previsioni e resta assente sulla prima nota", () => {
  assert.match(
    read(ROTTA_ID),
    /export const DELETE = accountingRoute/,
    "un promemoria sbagliato si toglie: stornarlo vorrebbe dire scrivere una previsione negativa",
  );

  const page = readCode(PAGE);
  assert.equal(
    /method:\s*["'`]DELETE["'`]/.test(page),
    false,
    "la pagina della prima nota non cancella niente: il denaro si storna",
  );

  /*
    E nessuna rotta della prima nota ne acquista uno per contagio: un movimento
    e un fatto avvenuto, e si storna.
  */
  const rotteMovimenti = fs
    .readdirSync(path.join(process.cwd(), "src/app/api/v1/accounting/entries"), {
      recursive: true,
    })
    .filter((nome) => String(nome).endsWith("route.ts"));

  for (const nome of rotteMovimenti) {
    assert.equal(
      /export const DELETE/.test(
        read(path.join("src/app/api/v1/accounting/entries", String(nome))),
      ),
      false,
      `${nome}: sui movimenti il DELETE non deve nascere`,
    );
  }
});

test("la conferma di rimozione e un dialogo, non un `confirm()` del browser", () => {
  const scheda = readCode(SCHEDA);

  assert.equal(
    /confirm\(/.test(scheda),
    false,
    "un movimento di 10.000 EUR spariva con un `confirm()`: quella strada resta chiusa",
  );
  assert.match(
    scheda,
    /RemoveExpectedDialog/,
    "il dialogo dice cosa si sta per togliere, e quanto vale",
  );
});

/* ========================================================================== */
/* Responsivita                                                                */
/* ========================================================================== */

test("a 375 px l'elenco dei previsti e a schede, e la tabella scorre da sola", () => {
  const scheda = read(SCHEDA);

  assert.match(
    scheda,
    /md:hidden/,
    "sotto md una scheda per previsione: sei colonne restano illeggibili anche scorrendo",
  );
  assert.match(
    scheda,
    /hidden overflow-x-auto[^"]*md:block/,
    "la tabella scorre nel proprio contenitore, non nel documento",
  );
});

test("nessuna griglia della scheda previsti resta a due colonne a 375 px", () => {
  const offending = read(SCHEDA)
    .split(/\r?\n/)
    .filter((line) => /(?<![a-z:])grid-cols-[23]\b/.test(line))
    .filter((line) => !line.includes("TabsList"));

  assert.deepEqual(
    offending,
    [],
    "usare grid-cols-1 sm:grid-cols-2: a 375 px due colonne non ci stanno",
  );
});

/* ========================================================================== */
/* Il registro delle API                                                       */
/* ========================================================================== */

test("le tre rotte nuove sono dichiarate nel registro e nella sua documentazione", () => {
  const registro = read("src/lib/api/registry.ts");
  const documentazione = read("docs/api-registry.md");

  for (const nome of [
    "accounting.expected.read",
    "accounting.expected.create",
    "accounting.expected.delete",
  ]) {
    assert.ok(
      registro.includes(nome),
      `${nome}: una rotta che non e nel registro non esiste per chi legge il registro`,
    );
  }

  assert.match(documentazione, /\/api\/v1\/accounting\/expected/);
});
