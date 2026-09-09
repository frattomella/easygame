import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * La scheda «Iscrizione» dopo il riordino (ADR-0056).
 *
 * **Cosa questi test difendono.** Non l'estetica: la **non ripetizione**. La
 * scheda mostrava i totali in tre punti — «Riepilogo Incasso», l'intestazione
 * di «Storico Pagamenti» e la griglia dentro la configurazione del piano — e
 * gli incassi in due elenchi diversi. Chi la apriva per sapere quanto restava
 * da incassare trovava tre numeri e doveva scegliere di quale fidarsi.
 *
 * La regressione che intercettano e concreta: qualcuno riaggiunge un totale
 * «per comodita» accanto alle rate, e da quel momento ce ne sono di nuovo due.
 */

const SRC = path.join(process.cwd(), "src");
const read = (relative) =>
  readFileSync(path.join(SRC, ...relative.split("/")), "utf8").replace(
    /\r\n/g,
    "\n",
  );

const TAB = "components/athletes/enrollment/AthleteEnrollmentTab.tsx";
const PAGE = "app/athletes/[id]/page.tsx";
const LEDGER_HOOK = "components/payments/use-athlete-payment-ledger.ts";
const LIST = "components/payments/InstallmentLedgerList.tsx";

const stripComments = (source) =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

/* ------------------------------------------------------ l'ordine imposto */

test("le sei sezioni compaiono nell'ordine stabilito", () => {
  const source = stripComments(read(TAB));

  const ordine = [
    "Nessun piano assegnato",
    "Prossima rata",
    'title="Piano di pagamento"',
    'title="Composizione della quota"',
    "Voucher e contributi",
    'title="Documenti e ricevute"',
  ];

  let cursore = -1;
  for (const marcatore of ordine) {
    const posizione = source.indexOf(marcatore, cursore + 1);
    assert.ok(
      posizione > cursore,
      `«${marcatore}» non compare dopo la sezione precedente`,
    );
    cursore = posizione;
  }
});

/* ------------------------------------------------- un riepilogo soltanto */

test("i totali dell'iscrizione compaiono una volta sola", () => {
  const source = stripComments(read(TAB));

  /*
    **I nomi sono cambiati con N14, la regola no.** Il riepilogo economico
    distingue adesso il residuo dell'iscrizione — che e quello della **famiglia**
    — da quello della prossima rata, e i due non si chiamano piu allo stesso
    modo. Cio che questo test difende resta: nessun totale compare due volte.
  */
  for (const [etichetta, attese] of [
    ["Quota totale", 1],
    ["Residuo famiglia", 1], // il riepilogo dell'iscrizione
    ["Residuo", 1], // e quello della prossima rata, che e un'altra cosa
    ["A carico della famiglia", 1],
    ["Pagato dalla famiglia", 1],
    ["Copertura voucher prevista", 1],
  ]) {
    const occorrenze =
      source.match(new RegExp(`label="${etichetta}"`, "g")) || [];
    assert.equal(
      occorrenze.length,
      attese,
      `«${etichetta}» compare ${occorrenze.length} volte invece di ${attese}`,
    );
  }
});

test("la scheda non monta piu il vecchio «Riepilogo Incasso» separato", () => {
  const page = read(PAGE);

  assert.equal(
    /<CardTitle>Riepilogo Incasso<\/CardTitle>/.test(page),
    false,
    "i totali stanno nel riepilogo dell'iscrizione, e solo li",
  );
});

test("lo «Storico Pagamenti» duplicato e stato rimosso", () => {
  const page = read(PAGE);

  assert.equal(
    /<CardTitle>Storico Pagamenti<\/CardTitle>/.test(page),
    false,
    "era una seconda tabella sugli stessi incassi, con i totali ripetuti nell'intestazione",
  );
  assert.equal(
    /Totale registrato: \{formatCurrency/.test(page),
    false,
    "e i suoi totali con lei",
  );
});

test("gli incassi hanno un elenco solo", () => {
  const source = stripComments(read(TAB));
  const occorrenze = source.match(/<InstallmentLedgerList/g) || [];

  assert.equal(occorrenze.length, 1, "due elenchi sono due verita");
});

/* ---------------------------------------------- una fonte sola per i numeri */

test("riepilogo, prossima rata e rate leggono lo stesso stato", () => {
  const source = read(TAB);

  assert.match(source, /useAthletePaymentLedger\(\{/);
  const usi = source.match(/useAthletePaymentLedger\(/g) || [];
  assert.equal(usi.length, 1, "un solo aggancio: non tre letture indipendenti");

  /*
    **I sette numeri li calcola il dominio** (N14). Prima erano tre e venivano
    da `ledger.totals`; adesso sono sette e vengono da `ledger.planCoverage`,
    che e `summarizePlanCoverage` — la stessa funzione che il resto del prodotto
    usa per comporre debito e copertura. La regola non cambia: la scheda **non**
    calcola, riceve.
  */
  assert.match(source, /ledger\.planCoverage/);
  assert.match(source, /economics\.dueAmount/);
  assert.match(source, /economics\.familyDueAmount/);
  assert.match(source, /economics\.familyPaidAmount/);
  assert.match(source, /economics\.familyResidualAmount/);
  assert.match(source, /ledger\.familyTotals/);
});

test("la scheda non ricalcola i totali per conto suo", () => {
  const source = stripComments(read(TAB));

  assert.equal(
    /summarizeLedgers\(/.test(source),
    false,
    "i totali arrivano gia calcolati dallo stato condiviso",
  );
  assert.equal(
    /reduce\(\s*\(/.test(source.replace(/\s+/g, " ")),
    false,
    "nessuna somma fatta in pagina",
  );
});

/* ------------------------------------------- lo stato non si imposta mai */

test("nessun campo permette di cambiare lo stato di una rata", () => {
  for (const file of [TAB, LIST]) {
    const source = read(file);

    assert.equal(
      /<SelectItem value="paid">/.test(source),
      false,
      `${file}: «Pagato» non e una scelta`,
    );
    assert.equal(
      /status[\s\S]{0,60}onValueChange/.test(source),
      false,
      `${file}: lo stato si ricava dagli incassi`,
    );
  }

  assert.match(
    read(TAB),
    /Lo stato di una rata si ricava dagli incassi registrati/,
    "e la scheda lo dice",
  );
});

test("la registrazione di un incasso passa dal flusso unico", () => {
  const source = read(TAB);

  assert.match(source, /<RegisterPaymentDialog/);
  assert.match(source, /onSubmit=\{ledger\.registerPayment\}/);
  assert.equal(
    /apiRequest\([\s\S]{0,80}payment-transactions/.test(source),
    false,
    "la scrittura sta nello stato condiviso, non nella scheda",
  );
});

/* ------------------------------------------------ progressive disclosure */

test("le sezioni di dettaglio si aprono, e dichiarano il proprio stato", () => {
  const source = read(TAB);

  assert.match(source, /aria-expanded=\{open\}/);
  /*
    **L'anomalia e quella della famiglia** (N14): una rata scaduta che un
    voucher copre per intero non e un'anomalia per chi paga, e aprire la sezione
    per quella significherebbe allarmare per un debito che non esiste.
  */
  assert.match(
    source,
    /defaultOpen=\{shouldExpandInstallments\(ledger\.familyTotals\)\}/,
    "le rate si aprono da sole quando c'e un'anomalia della famiglia",
  );
});

test("l'intestazione di una sezione chiusa dice gia quanto contiene", () => {
  const source = read(TAB);

  assert.match(source, /count=\{ledger\.ledgers\.length\}/);
  assert.match(source, /\$\{count\}|\{typeof count === "number"/);
});

/* ------------------------------------------- niente CTA senza destinazione */

test("con tutte le rate saldate non c'e nessun pulsante da premere", () => {
  const source = stripComments(read(TAB));

  assert.match(source, /Pagamenti completati/);
  assert.match(
    source,
    /ledger\.allowManagement && next \?/,
    "il pulsante del riepilogo esiste solo se c'e una rata su cui agire",
  );
});

/* ---------------------------------------------------------- responsivita */

test("la scheda non resta a due colonne a 375 px", () => {
  const offending = read(TAB)
    .split("\n")
    .filter((line) => /(?<![a-z:])grid-cols-[2345]\b/.test(line));

  assert.deepEqual(
    offending,
    [],
    "usare grid-cols-1 sm:grid-cols-N, oppure righe in colonna",
  );
});

test("gli importi si leggono incolonnati", () => {
  assert.match(
    read(TAB),
    /tabular-nums/,
    "cifre a larghezza fissa: una colonna di importi si confronta a colpo d'occhio",
  );
});

/* --------------------------------------------------- il confine dei domini */

test("i contributi restano fuori dai totali della famiglia", () => {
  const source = read(TAB);

  assert.match(source, /<AthleteFundingSummary/);

  /*
    **La frase e cambiata perche era diventata falsa** (N14).

    Diceva «Non entra nei totali qui sopra», ed era vero finche i totali in cima
    erano tre e parlavano solo della famiglia. Il riepilogo economico ne mostra
    adesso sette, e tre di quelli parlano dell'ente: la copertura **entra** nel
    riquadro, come voce propria. Lasciare la vecchia frase avrebbe difeso una
    promessa che la scheda non fa piu.

    Cio che deve restare scritto e la distinzione che conta, e vale in tutte e
    due le direzioni: una copertura non e un incasso, e un maturato non e una
    liquidazione.
  */
  assert.match(
    source,
    /non e un incasso/i,
    "la scheda dice che una copertura non e denaro entrato, invece di lasciarlo dedurre",
  );
  assert.match(
    source,
    /credito verso l&apos;ente, non\s*\n?\s*una liquidazione|non\s+una liquidazione/,
    "e che un maturato non e ancora denaro versato dall'ente",
  );

  /*
    E le due grandezze restano **etichettate per proprietario**: «Pagato dalla
    famiglia» accanto a «Voucher liquidato» e cio che impedisce di leggerle come
    due meta della stessa cassa.
  */
  assert.match(source, /label="Pagato dalla famiglia"/);
  assert.match(source, /label="Voucher liquidato"/);

  /*
    **La guardia si e spostata dal nome al fatto** (N7 / ADR-0158).

    Qui c'era `/accrued|voucher/i.test(read(LEDGER_HOOK)) === false`: il
    dominio dei pagamenti non doveva **nominare** i contributi. Era un
    surrogato — buono finche la composizione non esisteva — e ADR-0158 la
    introduce: la copertura di una rata si mostra accanto ai suoi incassi,
    quindi la schermata i due li nomina per forza.

    Cio che non deve succedere e piu preciso, ed e cio che si misura adesso: un
    importo di contributo **non entra nei totali della famiglia**. I totali si
    ricavano da `summarizeLedgers(ledgers)`, e `ledgers` si costruisce da rate e
    **movimenti**, senza coperture: nessun maturato puo raggiungerli.

    E una guardia piu forte del nome, non piu debole: il nome si aggirava
    chiamando `accrued` in un altro modo.
  */
  const hook = read(LEDGER_HOOK);

  assert.match(
    hook,
    /buildInstallmentLedgers\(\{\s*charges: Array\.isArray\(charges\) \? charges : \[\],\s*transactions,\s*\}\)/,
    "le rate si costruiscono da rate e movimenti: nessuna copertura fra gli argomenti",
  );
  assert.match(
    hook,
    /const totals = React\.useMemo\(\(\) => summarizeLedgers\(ledgers\), \[ledgers\]\);/,
    "i totali della famiglia vengono dalle rate, non dalla copertura",
  );

  /* E il dominio, sotto, continua a non sapere cosa sia un contributo. */
  const senzaCommenti = (testo) =>
    testo.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");

  assert.doesNotMatch(
    senzaCommenti(read("lib/payments/installment-ledger.ts")),
    /funding/i,
    "il registro delle rate non importa il dominio dei bandi (ADR-0037 §5)",
  );
});

test("la composizione non ripete pagato e residuo", () => {
  /*
    Non e solo una ripetizione: i due numeri vengono da due calcoli diversi —
    la composizione dal piano configurato, il riepilogo dalle rate reali — e su
    un atleta con voci fuori piano si contraddicono a schermo. Trovato
    aprendo la pagina, non da un test (ADR-0056).
  */
  assert.match(
    read(PAGE),
    /showSettlementTotals=\{false\}/,
    "la composizione spiega come nasce il totale, non quanto e stato incassato",
  );

  const breakdown = read("components/payments/EnrollmentPaymentBreakdown.tsx");
  assert.match(breakdown, /showSettlementTotals \? "Totale dovuto" : "Quota del piano"/);
});
