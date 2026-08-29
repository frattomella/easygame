import assert from "node:assert/strict";
import test from "node:test";

import {
  ACTIVITY_SCOPES,
  SOURCE_DOMAINS,
  WRITABLE_SOURCE_DOMAINS,
  assertAccountingEntryInvariants,
  asProjectedLine,
  deriveAccountBalanceCents,
  fiscalYearOfEntry,
  fromCents,
  isCounterpartyKind,
  isFinancialAccountKind,
  normalizeActivityScope,
  normalizeDirection,
  oppositeDirection,
  toCents,
  toFiscalYearFilter,
} from "../../src/lib/accounting/model.ts";

/**
 * **Gli invarianti della prima nota, scritti prima del codice che li usa.**
 *
 * Fanno parte della barriera della Wave 4 e non di una lane: sono le regole che
 * ogni lane dara per acquisite, e scriverle dopo vorrebbe dire scoprire in
 * revisione che due lane le hanno intese diversamente.
 *
 * Il principio che governa tutto:
 *
 * > Un movimento di prima nota non e mai la fonte di un numero che un altro
 * > dominio possiede. E la sua proiezione datata e classificata.
 */

/* ==================================================== il verso e l'importo */

test("il verso e IN o OUT, e nient'altro", () => {
  for (const verso of ["TRANSFER", "in ", "entrata", "", null, undefined]) {
    assert.throws(
      () => assertAccountingEntryInvariants({ direction: verso }),
      /verso del movimento/i,
      `«${String(verso)}» non e un verso`,
    );
  }
});

test("cio che arriva da fuori si normalizza prima, non mentre si valida", () => {
  /*
    Un controllo che normalizza mentre valida lascia passare in tabella il
    valore grezzo, e poi un `WHERE direction = 'IN'` non lo trova.
  */
  assert.equal(normalizeDirection("in "), "IN");
  assert.equal(normalizeDirection("Entrata"), "IN");
  assert.equal(normalizeDirection("uscita"), "OUT");
  assert.equal(normalizeDirection("giroconto"), null);
});

test("il giroconto non e un terzo verso: sono due movimenti", () => {
  /*
    Il vecchio aggregatore aveva `direction: "transfer"`, e ogni consumatore
    doveva ricordarsi di escluderlo dai totali. Qui un giroconto e un'uscita e
    un'entrata tenute insieme da un gruppo.
  */
  assert.equal(oppositeDirection("IN"), "OUT");
  assert.equal(oppositeDirection("OUT"), "IN");
});

const movimentoValido = (overrides = {}) => ({
  direction: "OUT",
  amountCents: 15000,
  entryDate: "2026-09-15T00:00:00.000Z",
  sourceDomain: "MANUAL",
  financialAccountId: "conto-cassa",
  operationTypeCode: "affitto_impianto",
  description: "Affitto palestra settembre",
  ...overrides,
});

test("un movimento ben formato passa", () => {
  assert.doesNotThrow(() => assertAccountingEntryInvariants(movimentoValido()));
});

test("l'importo e sempre positivo: il segno lo dice il verso", () => {
  for (const importo of [0, -1, -15000]) {
    assert.throws(
      () => assertAccountingEntryInvariants(movimentoValido({ amountCents: importo })),
      /maggiore di zero|segno lo dice il verso/i,
    );
  }
});

test("l'importo e in centesimi interi: niente virgola mobile sul denaro", () => {
  assert.throws(
    () => assertAccountingEntryInvariants(movimentoValido({ amountCents: 150.5 })),
    /intero di centesimi/i,
  );
});

test("la conversione in centesimi non perde un centesimo per arrotondamento", () => {
  /* `12.34 * 100` vale 1233.9999999999998: un troncamento direbbe 1233. */
  assert.equal(toCents(12.34), 1234);
  /* 8.11 * 100 vale 810.9999999999999: un troncamento direbbe 810. */
  assert.equal(toCents(8.11), 811);
  assert.equal(toCents("12,50"), 1250, "la virgola italiana e un separatore decimale");
  assert.equal(fromCents(1234), 12.34);
});

/* ============================================================== la data */

test("un movimento senza data non e collocabile in nessun esercizio", () => {
  for (const data of [null, undefined, ""]) {
    assert.throws(
      () => assertAccountingEntryInvariants(movimentoValido({ entryDate: data })),
      /senza data/i,
    );
  }
});

test("una data non valida si rifiuta invece di produrre un anno assurdo", () => {
  assert.throws(
    () => assertAccountingEntryInvariants(movimentoValido({ entryDate: "non-una-data" })),
    /non valida/i,
  );
});

/* ======================================================= l'anno fiscale */

test("l'anno fiscale e l'anno solare UTC della data del fatto", () => {
  assert.equal(fiscalYearOfEntry("2026-09-15T00:00:00.000Z"), 2026);
  assert.equal(fiscalYearOfEntry("2027-01-08T00:00:00.000Z"), 2027);
});

test("l'anno fiscale non si digita: un valore diverso dalla data si rifiuta", () => {
  assert.throws(
    () =>
      assertAccountingEntryInvariants(
        movimentoValido({ entryDate: "2027-01-08T00:00:00.000Z", fiscalYear: 2026 }),
      ),
    /non si digita/i,
  );
});

test("stagione e anno fiscale sono due assi: gennaio 2027 e anno 2027", () => {
  /*
    Lo scenario del piano: stagione 2026/27, movimenti a settembre 2026 e
    gennaio 2027. Il riepilogo fiscale 2026 prende solo i primi; quello di
    stagione li prende entrambi. Sono due domande diverse.
  */
  assert.equal(fiscalYearOfEntry("2026-09-15T00:00:00.000Z"), 2026);
  assert.equal(fiscalYearOfEntry("2027-01-08T00:00:00.000Z"), 2027);
});

test("il filtro per anno non cade nella trappola di Number(null) === 0", () => {
  /*
    `searchParams.get()` restituisce `null` quando il parametro manca, e
    `Number(null)` e `0`, che e un intero. Un filtro scritto con
    `Number.isInteger(Number(x))` passa i test — che passano `undefined` — e in
    produzione filtra `fiscal_year = 0`, cioe risponde elenco vuoto a chiunque
    non chieda un anno. E il difetto che `toYearFilter` chiude nel lavoro
    sportivo, trovato a runtime con duemila test verdi.
  */
  assert.equal(toFiscalYearFilter(null), null, "null = nessun filtro, non l'anno zero");
  assert.equal(toFiscalYearFilter(undefined), null);
  assert.equal(toFiscalYearFilter(""), null);
  assert.equal(toFiscalYearFilter("   "), null);
  assert.equal(toFiscalYearFilter("non-un-anno"), null);
  assert.equal(toFiscalYearFilter(0), null, "l'anno zero non esiste");
  assert.equal(toFiscalYearFilter("2026"), 2026);
  assert.equal(toFiscalYearFilter(2026), 2026);
  assert.equal(toFiscalYearFilter("1999"), null, "fuori scala");
});

/* ========================================== l'origine e la proiezione */

test("il catalogo delle origini e chiuso", () => {
  assert.throws(
    () => assertAccountingEntryInvariants(movimentoValido({ sourceDomain: "QUALCOSA" })),
    /origine.*sconosciuta/i,
  );
});

test("solo tre origini si scrivono in tabella: le altre sono proiezioni", () => {
  assert.deepEqual(
    [...WRITABLE_SOURCE_DOMAINS].sort(),
    ["INTERNAL_TRANSFER", "MANUAL", "REVERSAL"],
  );
});

test("un incasso, un compenso o un contributo non si scrivono in prima nota", () => {
  /*
    E la regola che impedisce la seconda contabilita. Se una di queste righe
    finisse in tabella, lo stesso fatto sarebbe rappresentato due volte — una
    dal dominio proprietario, una dalla copia — e i totali lo conterebbero due
    volte.
  */
  for (const origine of SOURCE_DOMAINS.filter((d) => !WRITABLE_SOURCE_DOMAINS.has(d))) {
    assert.throws(
      () => assertAccountingEntryInvariants(movimentoValido({ sourceDomain: origine })),
      /appartiene al suo dominio|la prima nota lo proietta/i,
      `${origine} non deve essere scrivibile`,
    );
  }
});

test("una riga proiettata e sempre in sola lettura", () => {
  const proiettata = asProjectedLine({
    id: "incasso-1",
    canEdit: true,
    canDelete: true,
    canReverse: true,
    canReconcile: true,
  });

  assert.equal(proiettata.canEdit, false);
  assert.equal(proiettata.canDelete, false);
  assert.equal(
    proiettata.canReverse,
    false,
    "un compenso si storna dove i compensi si erogano",
  );
  assert.equal(proiettata.canReconcile, false);
});

/* ============================================ conto, causale, descrizione */

test("un movimento deve dire su quale conto il denaro si e mosso", () => {
  assert.throws(
    () => assertAccountingEntryInvariants(movimentoValido({ financialAccountId: "" })),
    /su quale conto/i,
  );
});

test("un movimento manuale senza causale si rifiuta, e dice perche", () => {
  assert.throws(
    () => assertAccountingEntryInvariants(movimentoValido({ operationTypeCode: "" })),
    /senza causale nasce gia sbagliato/i,
  );
});

test("uno storno non richiede una causale: eredita quella dell'originale", () => {
  assert.doesNotThrow(() =>
    assertAccountingEntryInvariants(
      movimentoValido({
        sourceDomain: "REVERSAL",
        reversalOfId: "movimento-1",
        operationTypeCode: "",
      }),
    ),
  );
});

test("un movimento senza descrizione non e leggibile da nessuno", () => {
  assert.throws(
    () => assertAccountingEntryInvariants(movimentoValido({ description: "   " })),
    /senza descrizione/i,
  );
});

/* =============================================== giroconto e storno */

test("un giroconto senza gruppo si rifiuta: le due gambe non si tengono", () => {
  assert.throws(
    () =>
      assertAccountingEntryInvariants(
        movimentoValido({ sourceDomain: "INTERNAL_TRANSFER", operationTypeCode: "" }),
      ),
    /due gambe|gruppo/i,
  );
});

test("solo un giroconto appartiene a un gruppo di trasferimento", () => {
  assert.throws(
    () => assertAccountingEntryInvariants(movimentoValido({ transferGroupId: "gruppo-1" })),
    /solo un giroconto/i,
  );
});

test("uno storno deve dire quale movimento sta compensando", () => {
  assert.throws(
    () =>
      assertAccountingEntryInvariants(
        movimentoValido({ sourceDomain: "REVERSAL", operationTypeCode: "" }),
      ),
    /quale movimento/i,
  );
});

test("solo uno storno cita un altro movimento", () => {
  assert.throws(
    () => assertAccountingEntryInvariants(movimentoValido({ reversalOfId: "movimento-1" })),
    /solo uno storno/i,
  );
});

/* ==================================================== il saldo derivato */

test("il saldo di un conto e la somma dei suoi movimenti", () => {
  const saldo = deriveAccountBalanceCents(0, [
    { direction: "IN", amountCents: 20000 },
    { direction: "IN", amountCents: 40000 },
    { direction: "OUT", amountCents: 15000 },
  ]);

  assert.equal(saldo, 45000);
});

test("il saldo di apertura e il punto di partenza, non una colonna mutabile", () => {
  assert.equal(
    deriveAccountBalanceCents(100000, [{ direction: "OUT", amountCents: 25000 }]),
    75000,
  );
});

test("una coppia originale/storno non muove il saldo", () => {
  const saldo = deriveAccountBalanceCents(0, [
    { direction: "IN", amountCents: 20000, reversedAt: "2026-09-20T00:00:00.000Z" },
    { direction: "OUT", amountCents: 20000, reversalOfId: "movimento-1" },
    { direction: "IN", amountCents: 5000 },
  ]);

  assert.equal(saldo, 5000, "restano visibili entrambe, e nessuna delle due conta");
});

test("un giroconto lascia invariata la liquidita totale", () => {
  const cassa = deriveAccountBalanceCents(80000, [
    { direction: "OUT", amountCents: 50000 },
  ]);
  const banca = deriveAccountBalanceCents(0, [{ direction: "IN", amountCents: 50000 }]);

  assert.equal(cassa, 30000);
  assert.equal(banca, 50000);
  assert.equal(cassa + banca, 80000, "500 euro spostati non sono 500 euro guadagnati");
});

/* ============================================== la classificazione */

test("non classificato e uno stato dichiarato, non un buco", () => {
  assert.equal(normalizeActivityScope(null), "unspecified");
  assert.equal(normalizeActivityScope(""), "unspecified");
  assert.equal(normalizeActivityScope("qualcosa"), "unspecified");
  assert.equal(normalizeActivityScope("Institutional"), "institutional");
  assert.equal(normalizeActivityScope("commercial"), "commercial");
  assert.deepEqual([...ACTIVITY_SCOPES], [
    "institutional",
    "commercial",
    "unspecified",
  ]);
});

/* ================================================= i cataloghi chiusi */

test("i tipi di conto sono tre, e il transito e uno di essi", () => {
  assert.equal(isFinancialAccountKind("CASH"), true);
  assert.equal(isFinancialAccountKind("bank"), true);
  assert.equal(isFinancialAccountKind("CLEARING"), true);
  assert.equal(isFinancialAccountKind("PAYPAL"), false);
});

test("la controparte ha un catalogo, non una stringa libera", () => {
  assert.equal(isCounterpartyKind("SPONSOR"), true);
  assert.equal(isCounterpartyKind("member"), true);
  assert.equal(isCounterpartyKind("chiunque"), false);
});
