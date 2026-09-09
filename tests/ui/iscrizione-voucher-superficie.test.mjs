import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

/**
 * **La scheda «Iscrizione» dopo il redisegno** (N14), dal lato della superficie.
 *
 * ---
 *
 * ## Cosa questi test difendono
 *
 * Non l'estetica: la **raggiungibilita**. Il collaudo reale ha trovato tre
 * funzioni complete e senza porta, tutte e tre sulla stessa schermata:
 *
 * * la **copertura** di una rata esisteva dalla lane N7 e la passava soltanto
 *   l'area Movimenti — la scheda dell'atleta mostrava le rate lorde;
 * * l'**annullamento** di un'assegnazione esisteva dal primo giorno e si
 *   raggiungeva solo dalla scheda del programma;
 * * la **maturazione** di un periodo non si poteva decidere affatto su un bando
 *   a fonte EasyGame.
 *
 * E la forma che CLAUDE.md §11.8 chiama per nome, tre volte di fila. Questi
 * test la intercettano: un componente che sa fare una cosa e un chiamante che
 * non gliela chiede e codice irraggiungibile.
 *
 * ## E le quattro aree
 *
 * A riepilogo economico · B piano di pagamento · C voucher assegnato ·
 * D periodi del voucher. L'ordine e verificato altrove
 * (`tests/ui/enrollment-tab.test.mjs`); qui si verifica che ognuna abbia
 * davvero cio che deve avere.
 */

const leggi = (percorso) => readFileSync(percorso, "utf8").replace(/\r\n/g, "\n");

const TAB = "src/components/athletes/enrollment/AthleteEnrollmentTab.tsx";
const RIQUADRO = "src/components/funding/AthleteFundingSummary.tsx";
const PERIODI = "src/components/funding/FundingPeriodsTable.tsx";
const HOOK = "src/components/payments/use-athlete-payment-ledger.ts";

const senzaCommenti = (sorgente) =>
  sorgente
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

/* ------------------------------------------ A · il riepilogo economico */

test("A · i sette numeri ci sono tutti, e ognuno dice di chi e", () => {
  const source = senzaCommenti(leggi(TAB));

  for (const etichetta of [
    "Quota totale",
    "Copertura voucher prevista",
    "Voucher maturato",
    "Voucher liquidato",
    "A carico della famiglia",
    "Pagato dalla famiglia",
    "Residuo famiglia",
  ]) {
    assert.match(
      source,
      new RegExp(`label="${etichetta}"`),
      `«${etichetta}» manca dal riepilogo economico`,
    );
  }
});

test("A · il colore non e mai l'unica informazione", () => {
  /*
    Le tre voci dell'ente si distinguono da quelle della famiglia **a parole**:
    «promessa, non incassata», «credito verso l'ente», «versato dall'ente». Chi
    non distingue i colori legge la stessa cosa di chiunque altro.
  */
  const source = senzaCommenti(leggi(TAB));

  assert.match(source, /hint="promessa, non incassata"/);
  assert.match(source, /hint="credito verso l&apos;ente"|hint="credito verso l'ente"/);
  assert.match(source, /hint="versato dall&apos;ente"|hint="versato dall'ente"/);
});

test("A · i numeri li calcola il dominio, non la scheda", () => {
  const source = senzaCommenti(leggi(TAB));

  assert.match(source, /ledger\.planCoverage/);
  assert.equal(
    /summarizePlanCoverage\(/.test(source),
    false,
    "la scheda riceve il riepilogo, non lo compone",
  );
  assert.match(
    leggi(HOOK),
    /summarizePlanCoverage\(\{/,
    "e lo stato condiviso lo chiede al dominio",
  );
});

/* -------------------------------------------- B · il piano di pagamento */

test("B · la copertura si vede e si gestisce dalla scheda dell'atleta", () => {
  const source = senzaCommenti(leggi(TAB));

  assert.match(
    source,
    /coverageByInstallment=\{ledger\.coverageByInstallment\}/,
    "le rate mostrano quanto ne porta l'ente",
  );
  assert.match(
    source,
    /onManageCoverage=\{\(installment\) => setCoverageTarget\(installment\)\}/,
    "e c'e un modo di coprirle da qui",
  );
  assert.match(
    source,
    /<CoverageDialog/,
    "la finestra e montata: un pulsante senza finestra e un pulsante che non fa niente",
  );
});

test("B · la finestra della copertura e la stessa dell'area Movimenti", () => {
  const source = leggi(TAB);

  assert.match(source, /import \{ CoverageDialog \}/);
  assert.equal(
    /remainingCoverageCapacity|validateCoverageAllocation/.test(source),
    false,
    "nessuna seconda regola di capienza scritta nella scheda",
  );
});

test("B · online e allo sportello si paga la quota della famiglia", () => {
  const source = senzaCommenti(leggi(TAB));

  assert.match(
    source,
    /ledger\.selectOnlineLedger\(\s*ledger\.withFamilyShare\(installment\),?\s*\)/,
    "il checkout non deve accettare la parte che porta l'ente",
  );

  assert.match(
    leggi(HOOK),
    /setSelectedLedger\(ledger \? conQuotaFamiglia\(ledger\) : null\)/,
    "e nemmeno la finestra di registrazione manuale",
  );
});

test("B · lo scaduto annunciato e quello della famiglia", () => {
  const source = senzaCommenti(leggi(TAB));

  assert.match(source, /ledger\.familyTotals\.overdueCount/);
  assert.equal(
    /ledger\.totals\.overdueCount/.test(source),
    false,
    "su rate coperte il conteggio lordo allarma per un debito che non esiste",
  );
});

/* ------------------------------------------- C · il voucher assegnato */

test("C · l'annullamento dell'assegnazione si raggiunge dalla scheda atleta", () => {
  const source = senzaCommenti(leggi(RIQUADRO));

  assert.match(source, /Annulla assegnazione/);
  assert.match(source, /Revoca assegnazione/);
  assert.match(
    source,
    /method: "DELETE"/,
    "e il pulsante chiama davvero la rotta che toglie",
  );
  assert.match(
    source,
    /<RemovalDialog/,
    "con una finestra che dice cosa sta per succedere",
  );
});

test("C · l'etichetta la sceglie il dominio, non la schermata", () => {
  const source = senzaCommenti(leggi(RIQUADRO));

  assert.match(
    source,
    /overview\.removal\?\.outcome === "delete"/,
    "il testo del pulsante viene dal piano che il servizio applichera",
  );
  assert.equal(
    /settlementLines|reported.*settled.*coverage/s.test(
      source.replace(/removal/g, ""),
    ),
    false,
    "e la schermata non ricostruisce la regola in casa",
  );
});

test("C · il caso gia liquidato non offre un annullamento semplice", () => {
  const source = leggi(RIQUADRO);

  assert.match(source, /acknowledge_settled/, "serve un consenso esplicito");
  assert.match(
    source,
    /stornare la liquidazione/,
    "e la finestra spiega dove andare invece",
  );
  assert.match(
    source,
    /chiesto due volte/,
    "dicendo perche: lo stesso importo, alla famiglia e all'ente",
  );
});

test("C · quanto del voucher e davvero impegnato sulle rate si legge", () => {
  const source = senzaCommenti(leggi(RIQUADRO));

  assert.match(source, /label="Impegnato sulle rate"/);
  assert.match(
    source,
    /sumLiveCoverageForEnrollment\(coperture, enrollmentId\)/,
    "e lo calcola il dominio della copertura",
  );
});

test("C · i numeri arrivano da chi ospita, non da una seconda lettura", () => {
  assert.match(
    senzaCommenti(leggi(TAB)),
    /overviews=\{ledger\.fundingOverviews\}/,
    "due letture della stessa proiezione sono due verita",
  );
  assert.match(
    senzaCommenti(leggi(TAB)),
    /onChanged=\{\(\) => ledger\.reloadFunding\(\)\}/,
    "e una decisione sul voucher ridisegna anche il riepilogo",
  );
});

/* --------------------------------------------- D · i periodi del voucher */

test("D · le due decisioni manuali sono pulsanti, e sono visibili", () => {
  const source = senzaCommenti(leggi(PERIODI));

  assert.match(source, /Segna come maturato/);
  assert.match(source, /Segna come non maturato/);

  /*
    **Fuori dal pannello che si apre.** Le azioni sono il motivo per cui questo
    elenco esiste: una decisione che si raggiunge solo dopo aver aperto un
    accordion e una decisione che la segreteria non prende.
  */
  const pannello = source.indexOf('border-t border-slate-100 px-3 pb-3 pt-2');
  const azioni = source.indexOf("Segna come maturato");
  assert.ok(
    azioni > 0 && pannello > 0,
    "servono sia i pulsanti sia il pannello del dettaglio",
  );
  assert.ok(
    azioni < pannello,
    "i pulsanti stanno sulla riga chiusa, non dentro il dettaglio",
  );
});

test("D · su un periodo liquidato non compare nessun pulsante", () => {
  const source = senzaCommenti(leggi(PERIODI));

  assert.match(
    source,
    /canManage && onDecide && !settled \?/,
    "un pulsante che si accende per poi rifiutarsi e peggio di un pulsante che non c'e",
  );
});

test("D · la decisione porta al server lo stato che si stava guardando", () => {
  assert.match(
    senzaCommenti(leggi(RIQUADRO)),
    /expected_status: riga\.status/,
    "senza, due operatori si sovrascrivono in silenzio",
  );
});

test("D · «torna al calcolo» compare solo se una decisione c'e", () => {
  const source = senzaCommenti(leggi(PERIODI));

  assert.match(
    source,
    /riga\.manualDecision \? \(\s*<Button/,
    "altrimenti sarebbe un pulsante che non fa niente",
  );
});

test("D · ogni periodo mostra periodo, frequenza, requisito, stato e importo", () => {
  const source = senzaCommenti(leggi(PERIODI));

  assert.match(source, /label="Periodo"/);
  assert.match(source, /label="Frequenza EasyGame"/);
  assert.match(source, /label="Requisito"/);
  assert.match(source, /label="Importo previsto"/);
  assert.match(source, /label="Stato ufficiale"/);
});

/* ------------------------------------------------- niente `undefined` */

test("nessuna interpolazione grezza di un campo che puo non esserci", () => {
  /*
    **Il difetto N10/N11 in una riga.** Era
    `${accrual.measured_value} ${unita}` su un periodo che non ha una riga di
    maturato: la stringa usciva «undefined ore». La difesa non e un controllo in
    piu, e togliere alla schermata la possibilita di leggere quei campi da
    sola: le frasi le scrive il dominio.
  */
  const source = leggi(PERIODI);

  for (const campo of [
    "measured_value",
    "requirement_min",
    "requirement_unit",
  ]) {
    assert.equal(
      new RegExp(`\\$\\{[^}]*${campo}`).test(source),
      false,
      `\`${campo}\` interpolato a mano: e il difetto N10/N11 che ritorna`,
    );
  }

  assert.match(source, /describeFundingPeriodMeasure\(/);
  assert.match(source, /describeFundingPeriodRequirement\(/);
  assert.match(source, /describeFundingPeriodProgress\(/);
});

test("un bando senza soglia non ne annuncia una a zero", () => {
  assert.match(
    senzaCommenti(leggi(RIQUADRO)),
    /senza requisito di frequenza/,
    "«con almeno 0 ore» e un requisito inventato",
  );
});

/* ------------------------------------------------------- responsivita */

test("le tre superfici non restano a due colonne a 375 px", () => {
  const colpevoli = [];

  for (const file of [TAB, RIQUADRO, PERIODI]) {
    const righe = leggi(file)
      .split("\n")
      .filter((riga) => /(?<![a-z:])grid-cols-[2345]\b/.test(riga));

    if (righe.length) colpevoli.push(`${file}: ${righe[0].trim().slice(0, 70)}`);
  }

  assert.deepEqual(
    colpevoli,
    [],
    "usare grid-cols-1 sm:grid-cols-N, oppure righe in colonna",
  );
});

test("i periodi non diventano una tabella che scorre di lato", () => {
  const source = leggi(PERIODI);

  assert.equal(
    /<table|<thead|<tbody/.test(source),
    false,
    "otto colonne a 375 px non si leggono: e un elenco di schede",
  );
  assert.match(source, /<ul className="space-y-2">/);
});

test("le azioni per periodo restano raggiungibili senza hover", () => {
  const source = leggi(PERIODI);

  assert.equal(
    /(?<![a-z-])(group-)?hover:(flex|block|opacity-100)/.test(source),
    false,
    "su un telefono non esiste il passaggio del mouse",
  );
  assert.match(
    source,
    /className="flex-1 sm:flex-none"/,
    "e a 375 px i pulsanti occupano la riga invece di stringersi",
  );
});

test("i pulsanti della riga si impilano a 375 px", () => {
  /*
    Il collaudo a schermo li ha trovati affiancati e con l'etichetta spezzata su
    tre righe. A quella larghezza si impilano, e ognuno prende la riga intera;
    da `sm` in su tornano accanto, dove lo spazio c'e.
  */
  assert.match(
    leggi(PERIODI),
    /flex flex-col gap-2 border-t[^"]*sm:flex-row sm:flex-wrap/,
    "in colonna sotto sm, affiancati sopra",
  );
});
