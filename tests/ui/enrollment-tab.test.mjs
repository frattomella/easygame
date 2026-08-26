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
    'title="Rate"',
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

  for (const [etichetta, attese] of [
    ["Quota totale", 1],
    ["Residuo", 2], // riepilogo dell'iscrizione, piu quello della prossima rata
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

  assert.match(source, /ledger\.totals\.dueAmount/);
  assert.match(source, /ledger\.totals\.paidAmount/);
  assert.match(source, /ledger\.totals\.residualAmount/);
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
  assert.match(
    source,
    /defaultOpen=\{shouldExpandInstallments\(ledger\.totals\)\}/,
    "le rate si aprono da sole quando c'e un'anomalia",
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
  assert.match(source, /Non entra nei totali qui sopra/);
  assert.equal(
    /accrued|voucher/i.test(read(LEDGER_HOOK)),
    false,
    "lo stato dei pagamenti non conosce i contributi",
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
