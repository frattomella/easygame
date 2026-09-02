import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import {
  OPERATION_TYPE_SEEDS,
  OUTBOUND_OPERATION_TYPE_BY_TRANSACTION,
  OUTBOUND_OPERATION_TYPE_CODES,
  getOperationTypeSeed,
} from "../../src/lib/fiscal/operation-types.ts";
import { OUTBOUND_TRANSACTION_TYPES } from "../../src/lib/sport-work/model.ts";
import {
  projectSportWorkPayouts,
  projectFundingSettlements,
} from "../../src/lib/accounting/projection.ts";

/**
 * **W4-R7 — il denaro che esce acquista una causale.**
 *
 * ## Il difetto, e la sua misura
 *
 * Le due strade con cui il denaro esce da un club — il compenso del lavoro
 * sportivo e la liquidazione di un bando — uscivano dal registro **senza
 * causale**: la vista proiettava `NULL` e `'unspecified'` scritti nel SQL,
 * perché il percorso di scrittura un campo per dirlo non ce l'aveva.
 *
 * Su una stagione vera erano **7.000 euro su 7.210** del non classificato. Il
 * buco non era un residuo di data entry: era strutturale, e la Wave 4 lo ha
 * reso *misurabile* — il rendiconto dichiara la quota in denaro invece che in
 * righe — senza chiuderlo.
 *
 * ## La decisione, e perché non è «un campo facoltativo in più»
 *
 * Un campo facoltativo che nessuno compila sarebbe il buco di prima con un
 * nome nuovo. Qui la causale si **deduce** da `transaction_type`, che il
 * dominio conosce nel momento in cui scrive la riga, e resta sovrascrivibile.
 * Ciò che resta non classificato è allora una scelta vera.
 */

/* ------------------------------------------------- le quattro causali nuove */

/**
 * **Perche questa prova diceva «quattro» e adesso dice «tre».**
 *
 * L'aspettativa precedente era che le quattro causali nate con W4-R7 fossero
 * tutte in uscita. Tre lo sono. La quarta — `liquidazione_contributo` — e
 * un'**entrata**, e ne aveva ereditato il verso per contiguita nel seme, non
 * per un fatto: il fatto e che il bonifico di un ente **arriva** al club.
 *
 * Lo dicono tre punti indipendenti del prodotto, e nessuno dei tre era stato
 * consultato quando il verso e stato scritto:
 *
 * - lo schema, sulla colonna che la liquidazione porta accanto:
 *   `funding_settlements.financial_account_id` e «su quale conto e ARRIVATO il
 *   bonifico dell'ente»;
 * - `projectFundingSettlements`, che sul verso legge il segno dell'importo;
 * - la vista SQL gemella, con `CASE WHEN fs.amount < 0 THEN 'OUT' ELSE 'IN'`.
 *
 * La prova vecchia non coglieva il difetto: lo **codificava**. Chiedeva che il
 * seme e la costante dicessero la stessa cosa, e le due dicevano insieme la
 * cosa sbagliata — un test che verifica la coerenza di due copie non verifica
 * che siano vere. Adesso il verso del seme si confronta con il verso che il
 * registro **calcola** su una riga vera.
 */
test("il seme dichiara tre causali in uscita, dove prima non ce n'era nessuna", () => {
  const inUscita = OPERATION_TYPE_SEEDS.filter(
    (seed) => seed.directionHint === "OUT",
  );

  assert.deepEqual(
    inUscita.map((seed) => seed.code).sort(),
    [...OUTBOUND_OPERATION_TYPE_CODES].sort(),
  );
  assert.equal(
    inUscita.some((seed) => seed.code === "liquidazione_contributo"),
    false,
    "il bonifico dell'ente e un incasso: fra le uscite somma un'entrata dentro un capitolo di spesa",
  );

  for (const seed of inUscita) {
    assert.ok(seed.label.trim().length > 5, `${seed.code} senza etichetta`);
    assert.ok(
      seed.reportingBucket,
      `${seed.code} senza voce di rendiconto: il rendiconto per voce non avrebbe niente da raggruppare il primo giorno`,
    );
    /*
      Restano `unspecified` come le nove in entrata. L'ambito e una
      determinazione **fiscale**, e ADR-0093 tiene distinta la contabilita
      gestionale dal trattamento: seminarle gia classificate le farebbe
      sembrare configurate, e nessuno tornerebbe a guardarle.
    */
    assert.equal(seed.activityScope, "unspecified");
  }
});

/** Le nove del seme originario, quelle che questa lane non deve toccare. */
const SEME_ORIGINARIO = [
  "quota_associativa",
  "quota_iscrizione",
  "quota_attivita",
  "tesseramento",
  "corso_servizio",
  "vendita_abbigliamento",
  "sponsorizzazione",
  "contributo",
  "altra_operazione",
];

test("le nove causali del seme originario restano come sono", () => {
  /*
    Il presidio contro la modifica opportunistica: questa lane aggiunge, non
    riscrive. Una voce di rendiconto messa a posteriori su un catalogo gia
    configurato sarebbe scrivere una scelta al posto del club.

    **Il criterio e la provenienza, non il verso**, ed e la correzione: prima
    questo elenco si costruiva filtrando `directionHint === "IN"`, e quel
    filtro dava per scontato che nessuna causale nata nella Wave 6 potesse
    essere un'entrata. `liquidazione_contributo` lo e, e nasce oggi: un valore
    di partenza per la sua voce di rendiconto non sovrascrive niente.
  */
  for (const code of SEME_ORIGINARIO) {
    const seed = getOperationTypeSeed(code);
    assert.ok(seed, `${code} sparito dal seme`);
    assert.equal(
      seed.reportingBucket ?? null,
      null,
      `${code}: la voce di rendiconto e testo del club, e non si riempie a posteriori`,
    );
  }

  const neutre = OPERATION_TYPE_SEEDS.filter(
    (seed) => (seed.directionHint ?? null) === null,
  );
  assert.deepEqual(
    neutre.map((seed) => seed.code),
    ["altra_operazione"],
    "«altra operazione» e l'unica che calza in entrambi i versi",
  );
});

test("la liquidazione di un contributo e dichiarata in ENTRATA, con la sua voce", () => {
  const seme = getOperationTypeSeed("liquidazione_contributo");

  assert.equal(seme.directionHint, "IN");
  assert.equal(seme.activityScope, "unspecified");
  assert.ok(
    seme.reportingBucket,
    "nasce oggi: un valore di partenza non sovrascrive una scelta del club",
  );
  assert.equal(
    /liquidat/i.test(seme.reportingBucket),
    false,
    "la voce di rendiconto leggeva come un capitolo di spesa: il denaro qui entra",
  );
});

/* ------------------------------------------------- la deduzione dal dominio */

test("ogni causale dedotta esiste davvero nel catalogo", () => {
  for (const [tipo, code] of Object.entries(
    OUTBOUND_OPERATION_TYPE_BY_TRANSACTION,
  )) {
    const seme = getOperationTypeSeed(code);
    assert.ok(seme, `${tipo} deduce «${code}», che nel catalogo non c'e`);
    assert.equal(
      seme.directionHint,
      "OUT",
      `${tipo} deduce una causale che non e in uscita`,
    );
  }
});

test("i sottotipi di uscita sono coperti, tranne quello che non si deve dedurre", () => {
  const scoperti = OUTBOUND_TRANSACTION_TYPES.filter(
    (tipo) => !OUTBOUND_OPERATION_TYPE_BY_TRANSACTION[tipo],
  );

  /*
    `CONTRIBUTION_PAYMENT` — il versamento dei contributi — non e ne un
    compenso ne una prestazione: e un adempimento. Resta senza causale dedotta
    di proposito, e chi lo registra sceglie: dedurne una sbagliata sarebbe
    peggio che non dedurne nessuna.

    `OTHER` e per definizione cio che non si sa classificare.
  */
  assert.deepEqual([...scoperti].sort(), ["CONTRIBUTION_PAYMENT", "OTHER"]);
});

test("un premio e un compenso per il rendiconto, anche se non tocca le franchigie", () => {
  /*
    Le franchigie sono una regola **previdenziale**; la voce di bilancio e
    un'altra domanda. Confonderle avrebbe portato nel piano dei conti una
    distinzione che serve al motore e non a chi legge il bilancio.
  */
  assert.equal(
    OUTBOUND_OPERATION_TYPE_BY_TRANSACTION.BONUS_PAYMENT,
    "compenso_sportivo",
  );
  assert.equal(
    OUTBOUND_OPERATION_TYPE_BY_TRANSACTION.EXPENSE_REIMBURSEMENT,
    "rimborso_spese",
  );
  assert.equal(
    OUTBOUND_OPERATION_TYPE_BY_TRANSACTION.VAT_INVOICE_PAYMENT,
    "prestazione_professionale",
  );
});

/* ------------------------------------------------------- la proiezione */

const rigaCompenso = (extra = {}) => ({
  id: "sw-1",
  organization_id: "club-1",
  transaction_type: "COMPENSATION_PAYMENT",
  paid_at: "2026-03-10T00:00:00.000Z",
  gross_amount: 500,
  net_amount: 500,
  financial_account_id: "conto-1",
  person_id: "persona-1",
  _personName: "Mario Rossi",
  created_at: "2026-03-10T00:00:00.000Z",
  ...extra,
});

/**
 * Una liquidazione vera ha **importo positivo**: il vincolo di database lo
 * impone, e il registro ne ricava il verso. La fixture portava un importo
 * negativo — cioe la forma di uno storno — ed e uno dei modi in cui il verso
 * sbagliato del seme era passato inosservato.
 */
const rigaLiquidazione = (extra = {}) => ({
  id: "fs-1",
  organization_id: "club-1",
  settled_at: "2026-03-11T00:00:00.000Z",
  amount: 800,
  program_id: "bando-1",
  _programName: "Bando sport e periferie",
  financial_account_id: "conto-1",
  created_at: "2026-03-11T00:00:00.000Z",
  ...extra,
});

/** Lo storno: importo opposto, e la fotografia della riga che annulla. */
const rigaStorno = (extra = {}) =>
  rigaLiquidazione({
    id: "fs-1-storno",
    amount: -800,
    reversal_of_id: "fs-1",
    settled_at: "2026-04-02T00:00:00.000Z",
    created_at: "2026-04-02T00:00:00.000Z",
    ...extra,
  });

test("un compenso classificato esce dal registro con la sua causale", () => {
  const [riga] = projectSportWorkPayouts([
    rigaCompenso({
      operation_type_code: "compenso_sportivo",
      operation_type_label_snapshot: "Compenso sportivo",
      activity_scope_snapshot: "institutional",
    }),
  ]);

  assert.equal(riga.operationTypeCode, "compenso_sportivo");
  assert.equal(riga.operationTypeLabel, "Compenso sportivo");
  assert.equal(riga.activityScope, "institutional");
});

test("l'etichetta e quella CONGELATA, non quella corrente", () => {
  /*
    E la proprieta per cui le tre colonne esistono. La causale e configurazione
    mutabile: senza lo scatto, un club che la rinomina cambierebbe
    **retroattivamente** la natura di cio che ha gia registrato, e un rendiconto
    stampato a marzo direbbe una cosa diversa ristampato a maggio.
  */
  const [riga] = projectSportWorkPayouts([
    rigaCompenso({
      operation_type_code: "compenso_sportivo",
      operation_type_label_snapshot: "Compenso sportivo (2026)",
      // Cio che la causale dice ADESSO, dopo che qualcuno l'ha rinominata.
      _operationTypeLabel: "Compensi collaboratori",
      activity_scope_snapshot: "institutional",
      _activityScope: "commercial",
    }),
  ]);

  assert.equal(riga.operationTypeLabel, "Compenso sportivo (2026)");
  assert.equal(riga.activityScope, "institutional");
});

test("senza scatto si ricade su cio che la causale dice adesso, non su niente", () => {
  const [riga] = projectSportWorkPayouts([
    rigaCompenso({
      operation_type_code: "compenso_sportivo",
      _operationTypeLabel: "Compenso sportivo",
      _activityScope: "commercial",
    }),
  ]);

  assert.equal(riga.operationTypeLabel, "Compenso sportivo");
  assert.equal(riga.activityScope, "commercial");
});

test("una riga non classificata resta non classificata, e si vede", () => {
  /*
    E corretto che sia cosi: inventare una causale per un movimento che nessuno
    ha classificato vorrebbe dire scrivere una scelta contabile al posto del
    club. Il rendiconto la conta, ed e la misura che la Wave 4 ha costruito.
  */
  const [compenso] = projectSportWorkPayouts([rigaCompenso()]);
  assert.equal(compenso.operationTypeCode, null);
  assert.equal(compenso.activityScope, "unspecified");

  const [liquidazione] = projectFundingSettlements([rigaLiquidazione()]);
  assert.equal(liquidazione.operationTypeCode, null);
  assert.equal(liquidazione.activityScope, "unspecified");
});

test("anche la liquidazione di un bando porta la sua causale", () => {
  const [riga] = projectFundingSettlements([
    rigaLiquidazione({
      operation_type_code: "liquidazione_contributo",
      operation_type_label_snapshot: "Liquidazione di contributo o voucher",
      activity_scope_snapshot: "institutional",
    }),
  ]);

  assert.equal(riga.operationTypeCode, "liquidazione_contributo");
  assert.equal(riga.operationTypeLabel, "Liquidazione di contributo o voucher");
  assert.equal(riga.activityScope, "institutional");
});

/* ------------------- il verso del seme contro il verso che il registro calcola */

/**
 * **La prova che mancava.** Il seme dichiara un verso; il registro ne calcola
 * uno. Finche nessuno li ha messi a confronto, il seme ha potuto dire «uscita»
 * su una riga che il registro contava fra le entrate — e la guardia costruita
 * su quel verso rifiutava la classificazione corretta.
 */
test("una liquidazione entra in cassa, e il seme dice lo stesso", () => {
  const [riga] = projectFundingSettlements([rigaLiquidazione()]);

  assert.equal(riga.direction, "IN");
  assert.equal(
    getOperationTypeSeed("liquidazione_contributo").directionHint,
    riga.direction,
    "il verso del seme e quello che il registro calcola sulla stessa riga",
  );
});

/**
 * **Lo storno regge il verso opposto sulla stessa causale.**
 *
 * Un fatto di dominio puo produrre righe di segno opposto sulla stessa
 * tabella: la liquidazione entra, il suo storno esce. Non e una contraddizione
 * del verso suggerito, perche il verso appartiene al **fatto** e non alla
 * singola riga — e infatti lo storno non risolve niente: eredita la
 * fotografia, codice, etichetta e ambito congelati, della riga che annulla.
 *
 * E cio che permette alle due righe di elidersi sotto la **stessa** voce di
 * rendiconto. Una guardia agganciata al segno della riga avrebbe imposto due
 * causali diverse, e la voce non sarebbe piu tornata a zero.
 */
test("lo storno esce, con la stessa causale e la stessa fotografia", () => {
  const [liquidazione] = projectFundingSettlements([
    rigaLiquidazione({
      operation_type_code: "liquidazione_contributo",
      operation_type_label_snapshot: "Liquidazione di contributo o voucher",
      activity_scope_snapshot: "institutional",
    }),
  ]);

  const [storno] = projectFundingSettlements([
    rigaStorno({
      operation_type_code: "liquidazione_contributo",
      operation_type_label_snapshot: "Liquidazione di contributo o voucher",
      activity_scope_snapshot: "institutional",
      /* La causale rinominata dopo: lo storno non deve accorgersene. */
      _operationTypeLabel: "Contributi da enti pubblici",
      _activityScope: "commercial",
    }),
  ]);

  assert.equal(liquidazione.direction, "IN");
  assert.equal(storno.direction, "OUT");

  assert.equal(storno.operationTypeCode, liquidazione.operationTypeCode);
  assert.equal(storno.operationTypeLabel, liquidazione.operationTypeLabel);
  assert.equal(storno.activityScope, liquidazione.activityScope);
  assert.equal(storno.amountCents, liquidazione.amountCents);
});

/* ------------------------------------ il gemello SQL dice la stessa cosa */

test("la vista SQL legge le stesse colonne, nello stesso ordine di precedenza", () => {
  /*
    **Il difetto peggiore che questo dominio possa avere** sono due letture
    dello stesso denaro che non concordano: il registro mostrerebbe un totale e
    l'elenco un altro, senza che nessuno sappia quale credere.

    La proiezione TypeScript e la vista SQL sono gemelle, e questa prova le
    tiene allineate sulla cosa che conta: **prima lo scatto sulla riga**, poi
    cio che la causale dice adesso.
  */
  const migrazione = readFileSync(
    "prisma/migrations/20260901200000_wave6_causale_in_uscita/migration.sql",
    "utf8",
  );

  for (const alias of ["sw", "fs"]) {
    assert.ok(
      migrazione.includes(`${alias}.operation_type_code`),
      `il ramo ${alias} non proietta la causale`,
    );
    assert.ok(
      migrazione.includes(
        `COALESCE(NULLIF(btrim(${alias}.operation_type_label_snapshot), ''),`,
      ),
      `il ramo ${alias} non legge prima lo scatto dell'etichetta`,
    );
    assert.ok(
      migrazione.includes(
        `COALESCE(NULLIF(${alias}.activity_scope_snapshot, ''),`,
      ),
      `il ramo ${alias} non legge prima lo scatto dell'ambito`,
    );
  }

  /*
    E i due `NULL::text, NULL::text, 'unspecified'::text` che stavano al posto
    delle tre colonne devono essere spariti dai due rami in uscita.
  */
  const ramoSportWork = migrazione.slice(
    migrazione.indexOf("sw.financial_account_id::text"),
    migrazione.indexOf('FROM "sport_work_outbound_transactions" sw'),
  );
  assert.equal(
    ramoSportWork.includes("'unspecified'::text"),
    false,
    "il ramo del lavoro sportivo scriveva l'ambito nel SQL: era li il buco strutturale",
  );
});

test("la vista SQL ricava il verso della liquidazione dal segno, come la proiezione", () => {
  /*
    E il terzo dei tre punti che smentivano il verso del seme, ed e qui che si
    vede quanto fosse indipendente: la vista lo scrive in SQL, la proiezione in
    TypeScript, e nessuna delle due ha mai letto `direction_hint`.
  */
  const migrazione = readFileSync(
    "prisma/migrations/20260901200000_wave6_causale_in_uscita/migration.sql",
    "utf8",
  );

  assert.ok(
    migrazione.includes("CASE WHEN fs.amount < 0 THEN 'OUT' ELSE 'IN' END"),
    "il ramo delle liquidazioni non ricava piu il verso dal segno",
  );
});

test("la correzione del verso non riscrive cio che un club ha configurato", () => {
  /*
    `direction_hint` e `reporting_bucket` sono configurazione del club. La
    migrazione che corregge il seme sbagliato deve toccare **solo** la riga di
    sistema rimasta identica a quel seme: un club che l'avesse gia corretta, o
    che avesse dato alla voce un nome proprio, non deve vederselo riscrivere.
  */
  const correzione = readFileSync(
    "prisma/migrations/20260901210000_wave6_liquidazione_e_una_entrata/migration.sql",
    "utf8",
  );

  assert.ok(correzione.includes("'liquidazione_contributo'"));
  assert.ok(correzione.includes(`"is_system" = true`));
  assert.ok(correzione.includes(`"direction_hint" = 'OUT'`));
  assert.ok(
    correzione.includes("'Contributi liquidati'"),
    "senza il vincolo sulla voce vecchia la migrazione riscrive anche un nome scelto dal club",
  );
  assert.equal(
    /UPDATE\s+"?funding_settlements/i.test(correzione),
    false,
    "le fotografie gia scritte non si toccano: il verso lo ricava il registro dal segno",
  );
});

test("la migrazione e additiva: le righe esistenti restano non classificate", () => {
  const migrazione = readFileSync(
    "prisma/migrations/20260901200000_wave6_causale_in_uscita/migration.sql",
    "utf8",
  );

  assert.ok(migrazione.includes("ADD COLUMN IF NOT EXISTS"));
  assert.equal(
    /UPDATE\s+"?(sport_work_outbound_transactions|funding_settlements)"?\s+SET\s+"?operation_type_code/i.test(
      migrazione,
    ),
    false,
    "riempire a posteriori sarebbe scrivere una scelta contabile al posto del club",
  );
});
