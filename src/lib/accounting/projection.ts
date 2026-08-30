/**
 * **La proiezione**: come una riga di un dominio proprietario diventa una riga
 * di prima nota, senza smettere di appartenere al suo dominio.
 *
 * Modulo **puro**: riceve righe gia lette e gia filtrate per club, e restituisce
 * righe di prima nota. Nessun Prisma, nessuna rete. Le letture le fa
 * `src/lib/server/accounting.ts`, che sa di permessi e di scope.
 *
 * ---
 *
 * ## Perche proiettare invece di materializzare
 *
 * L'alternativa era una tabella che copiasse incassi, compensi e contributi in
 * righe di prima nota. E stata scartata, ed e la decisione piu importante della
 * Wave: sarebbe stata **una seconda contabilita**. Due fonti per lo stesso
 * numero, e nessun modo di tenerle allineate — con la certezza che, il giorno in
 * cui divergono, nessuno sa quale delle due creda.
 *
 * La proiezione non ha quel problema perche **non c'e niente da allineare**: il
 * numero e uno solo, e questa e la sua lettura datata e classificata. Ne ha un
 * secondo vantaggio che vale quanto il primo: l'idempotenza e strutturale. Non
 * si puo proiettare due volte cio che non si scrive.
 *
 * ## Cosa una riga proiettata puo dire, e cosa no
 *
 * Puo dire tutto cio che serve a leggerla: data, importo, verso, conto,
 * causale, controparte, documento, origine.
 *
 * **Non puo essere modificata da qui**, e non e una scelta di prudenza: un
 * compenso si storna dove i compensi si erogano, perche li ci sono i permessi
 * del dominio, i suoi invarianti e il suo audit. Ogni riga esce da
 * `asProjectedLine`, che lo garantisce.
 */

import {
  asProjectedLine,
  fiscalYearOfEntry,
  normalizeActivityScope,
  toCents,
  type AccountingLine,
  type ActivityScope,
  type CounterpartyKind,
} from "./model";

const testo = (value: unknown) => {
  const text = String(value ?? "").trim();
  return text || null;
};

const iso = (value: unknown): string | null => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

/**
 * Il guscio comune di ogni proiezione.
 *
 * Sta qui e non ripetuto in ogni proiettore perche i campi che **devono**
 * esserci — l'anno fiscale derivato dalla data, l'origine, i permessi negati —
 * sono esattamente quelli che una copia dimenticherebbe.
 */
const proietta = (input: {
  id: string;
  organizationId: string;
  entryDate: string;
  direction: AccountingLine["direction"];
  amountCents: number;
  sourceDomain: AccountingLine["sourceDomain"];
  sourceId: string | null;
  description: string;
  financialAccountId?: string | null;
  financialAccountName?: string | null;
  operationTypeCode?: string | null;
  operationTypeLabel?: string | null;
  activityScope?: ActivityScope;
  counterpartyKind?: CounterpartyKind | null;
  counterpartyId?: string | null;
  counterpartyLabel?: string | null;
  paymentMethod?: string | null;
  documentKind?: string | null;
  documentId?: string | null;
  documentNumber?: string | null;
  notes?: string | null;
  seasonId?: string | null;
  siteId?: string | null;
  createdAt?: string | null;
  /**
   * **Quando la riga sorgente e stata stornata.** (D-A)
   *
   * Era assente da questo guscio, e ogni proiezione scriveva `reversedAt:
   * null` in modo fisso. La conseguenza si vedeva a valle:
   * `isNeutralizedLine` esclude una riga se `reversedAt` e valorizzato
   * **oppure** se e uno storno — e su una proiezione il primo criterio non
   * scattava mai. Di ogni coppia originale/storno veniva quindi esclusa **una
   * gamba sola**, e restava dentro quella sbagliata: l'originale.
   *
   * Un incasso da 100 stornato contava 100 nel rendiconto, mentre il saldo del
   * conto — che legge il database e non la proiezione — diceva zero. Le due
   * schermate si contraddicevano.
   */
  reversedAt?: string | null;
  reversalOfId?: string | null;
}): AccountingLine =>
  asProjectedLine({
    id: input.id,
    organizationId: input.organizationId,
    entryDate: input.entryDate,
    fiscalYear: fiscalYearOfEntry(input.entryDate),
    seasonId: input.seasonId ?? null,
    direction: input.direction,
    amountCents: input.amountCents,
    currency: "EUR",
    financialAccountId: input.financialAccountId ?? null,
    financialAccountName: input.financialAccountName ?? null,
    operationTypeCode: input.operationTypeCode ?? null,
    operationTypeLabel: input.operationTypeLabel ?? null,
    activityScope: input.activityScope ?? "unspecified",
    description: input.description,
    notes: input.notes ?? null,
    paymentMethod: input.paymentMethod ?? null,
    counterpartyKind: input.counterpartyKind ?? null,
    counterpartyId: input.counterpartyId ?? null,
    counterpartyLabel: input.counterpartyLabel ?? null,
    sourceDomain: input.sourceDomain,
    sourceId: input.sourceId,
    documentKind: input.documentKind ?? null,
    documentId: input.documentId ?? null,
    documentNumber: input.documentNumber ?? null,
    siteId: input.siteId ?? null,
    reconciliationStatus: "unreconciled",
    valueDate: null,
    bankReference: null,
    transferGroupId: null,
    reversalOfId: input.reversalOfId ?? null,
    reversedAt: input.reversedAt ?? null,
    reversalReason: null,
    createdBy: null,
    createdAt: input.createdAt ?? null,
  }) as AccountingLine;

/* ========================================================================== */
/* Incassi delle famiglie                                                      */
/* ========================================================================== */

export type PaymentTransactionRow = {
  id: string;
  organization_id: string;
  paid_at: Date | string;
  amount: number | string;
  payment_method?: string | null;
  notes?: string | null;
  athlete_id?: string | null;
  financial_account_id?: string | null;
  operation_type_code?: string | null;
  /** L'ambito congelato all'incasso. La causale corrente non lo riscrive. */
  activity_scope_snapshot?: string | null;
  counterparty_kind?: string | null;
  counterparty_id?: string | null;
  counterparty_label?: string | null;
  reversed_at?: Date | string | null;
  reverses_transaction_id?: string | null;
  created_at?: Date | string | null;
  _athleteName?: string | null;
  _accountName?: string | null;
  _operationTypeLabel?: string | null;
  _activityScope?: string | null;
  _documentKind?: string | null;
  _documentId?: string | null;
  _documentNumber?: string | null;
};

/**
 * Un incasso diventa un'entrata; uno **storno** diventa un'uscita.
 *
 * **Perche lo storno resta visibile invece di sparire.** La regola del dominio
 * e che il denaro non si cancella: l'originale resta marcato e la riga opposta
 * gli sta accanto. Se la prima nota nascondesse la coppia, chi legge vedrebbe
 * un saldo corretto e una storia incomprensibile — e la prima nota esiste
 * proprio per raccontare la storia.
 *
 * I totali le escludono entrambe, e lo fa `deriveAccountBalanceCents`: qui si
 * proietta cio che e successo, non cio che conta.
 */
export const projectPaymentTransactions = (
  rows: readonly PaymentTransactionRow[],
): AccountingLine[] =>
  rows.flatMap((row) => {
    const paidAt = iso(row.paid_at);
    if (!paidAt) return [];

    const amountCents = toCents(Number(row.amount) || 0);
    if (amountCents === 0) return [];

    /*
      **Tre casi, non due.** (D-B)

      Il codice ne distingueva due — «ha `reverses_transaction_id`» oppure no —
      e un **rimborso** cadeva nel secondo. Un rimborso e una riga **negativa
      senza** riferimento allo storno: quel campo esclude la riga dai totali, ed
      e esattamente cio che un rimborso non deve fare, perche il denaro e uscito
      davvero. La scelta e giusta e sta nel dominio degli incassi.

      Ma qui `Math.abs` ne faceva un'entrata da +50: un rimborso di 50 euro
      **aumentava** l'incassato di 50 invece di ridurlo, sbagliando il netto di
      due volte l'importo. E il catalogo delle origini portava `REFUND` con il
      commento «non e uno storno: e denaro che torna indietro», e **nessun
      proiettore lo produceva**: la voce documentava il comportamento mancante.
    */
    const storno = Boolean(row.reverses_transaction_id);
    const rimborso = !storno && amountCents < 0;
    const importo = Math.abs(amountCents);

    /*
      **Il verso lo dice il segno, non il fatto di essere uno storno.** (D-E)

      Il ramo guardava solo `reverses_transaction_id`, e lo storno di un
      **rimborso** — che e una riga positiva, perche riporta dentro denaro
      uscito — usciva come uscita. Il registro raccontava sessanta euro usciti
      per trenta rientrati: i totali reggevano (entrambe le gambe sono
      neutralizzate) e la storia si leggeva al contrario, che e l'unica cosa
      che il registro esiste per fare.
    */
    const verso: AccountingLine["direction"] = amountCents < 0 ? "OUT" : "IN";

    const etichetta =
      testo(row.counterparty_label) || testo(row._athleteName) || "Incasso";

    const descrizione = storno
      ? amountCents >= 0
        ? `Storno rimborso - ${etichetta}`
        : `Storno incasso - ${etichetta}`
      : rimborso
        ? `Rimborso - ${etichetta}`
        : `Incasso - ${etichetta}`;

    return [
      proietta({
        id: `payment-transaction:${row.id}`,
        organizationId: row.organization_id,
        entryDate: paidAt,
        /*
          Il segno dell'importo di uno storno e gia negativo nel dominio. Qui
          non si somma, si mostra: la direzione dice cosa e successo, e
          l'importo resta positivo come ovunque nella prima nota.
        */
        direction: verso,
        amountCents: importo,
        sourceDomain: storno ? "REVERSAL" : rimborso ? "REFUND" : "ATHLETE_PAYMENT",
        sourceId: row.id,
        description: descrizione,
        reversedAt: iso(row.reversed_at),
        reversalOfId: testo(row.reverses_transaction_id),
        financialAccountId: testo(row.financial_account_id),
        financialAccountName: testo(row._accountName),
        operationTypeCode: testo(row.operation_type_code),
        operationTypeLabel: testo(row._operationTypeLabel),
        /*
          Prima si legge cio che e **congelato sulla riga**, e solo in mancanza
          si ricade su cio che la causale dice **adesso**. L'ordine e il punto:
          invertirlo farebbe cambiare natura al passato ogni volta che qualcuno
          corregge una classificazione.
        */
        activityScope: normalizeActivityScope(
          row.activity_scope_snapshot ?? row._activityScope,
        ),
        counterpartyKind:
          (testo(row.counterparty_kind)?.toUpperCase() as CounterpartyKind | null) ??
          (row.athlete_id ? "ATHLETE" : null),
        counterpartyId: testo(row.counterparty_id) || testo(row.athlete_id),
        counterpartyLabel: etichetta,
        paymentMethod: testo(row.payment_method),
        documentKind: testo(row._documentKind),
        documentId: testo(row._documentId),
        documentNumber: testo(row._documentNumber),
        notes: testo(row.notes),
        createdAt: iso(row.created_at),
      }),
    ];
  });

/* ========================================================================== */
/* Uscite del lavoro sportivo                                                  */
/* ========================================================================== */

export type SportWorkOutboundRow = {
  id: string;
  organization_id: string;
  transaction_type?: string | null;
  paid_at: Date | string;
  gross_amount: number | string;
  /** Quanto e uscito dal conto verso la persona. Congelato dal registro. */
  net_amount?: number | string | null;
  /** L'intero costo sostenuto dal club. **Non** e cassa: e netto piu F24. */
  club_cost?: number | string | null;
  payment_method?: string | null;
  reference?: string | null;
  financial_account_id?: string | null;
  bank_account_id?: string | null;
  person_id?: string | null;
  reversal_of_id?: string | null;
  reversed_at?: Date | string | null;
  created_at?: Date | string | null;
  _personName?: string | null;
  _accountName?: string | null;
};

const ETICHETTE_LAVORO_SPORTIVO: Record<string, string> = {
  COMPENSATION_PAYMENT: "Compenso",
  COMPENSATION_REVERSAL: "Storno compenso",
  BONUS_PAYMENT: "Premio",
  EXPENSE_REIMBURSEMENT: "Rimborso spese",
  VAT_INVOICE_PAYMENT: "Fattura professionista",
  CONTRIBUTION_PAYMENT: "Versamento contributi",
  EXTERNAL_PAYROLL_COST: "Costo esterno del personale",
  OTHER: "Uscita",
};

/**
 * Un'erogazione diventa un'uscita, **per quanto e uscito davvero dal conto**.
 *
 * ---
 *
 * **Una contraddizione del piano, e come e stata sciolta.**
 *
 * Il §37 chiede due cose che insieme non stanno in piedi:
 *
 * - scenario 16: la riga di prima nota di un compenso porta «**il costo del
 *   club** e non solo il netto»;
 * - scenario 19: «il versamento F24 dei contributi **compare** fra le uscite».
 *
 * Se valessero entrambe alla lettera, un compenso lordo da 1.000 con 240 di
 * contributi produrrebbe 1.240 di uscita **piu** 240 di F24: 1.480 usciti dal
 * conto per un costo di 1.240. I contributi sarebbero contati due volte, e il
 * saldo del conto — che questa Wave rende derivato — sarebbe sbagliato di
 * quella cifra a ogni compenso.
 *
 * **Il criterio che scioglie il nodo** e quello che governa tutta la Wave: la
 * prima nota registra **fatti finanziari**, cioe denaro che si muove. Dal conto
 * verso la persona esce il **netto**; dal conto verso l'erario esce l'F24. Sono
 * due movimenti, in due momenti diversi, verso due controparti diverse — ed e
 * il motivo per cui lo scenario 19 esiste.
 *
 * La somma dei due **e** il costo del club. Lo scenario 16 chiede che la prima
 * nota non fermi il conto al netto, e cosi non lo ferma: lo completa con la
 * riga che gli manca, invece di gonfiare la prima. Cosi anche lo scenario 18
 * torna — «il rendiconto mostra il costo del lavoro sportivo senza ricalcolare
 * nessun contributo: i numeri sono identici a quelli del registro».
 *
 * Qui **non si ricalcola niente**: `net_amount` e congelato sulla riga di
 * registro, come i contributi e le aliquote che l'hanno prodotto.
 *
 * Dove il netto non e valorizzato — le voci dell'agenda: premi, rimborsi,
 * fatture dei professionisti, che compensi non sono e franchigie non ne
 * consumano — vale il lordo, che li e l'intero esborso.
 */
export const projectSportWorkPayouts = (
  rows: readonly SportWorkOutboundRow[],
): AccountingLine[] =>
  rows.flatMap((row) => {
    const paidAt = iso(row.paid_at);
    if (!paidAt) return [];

    const tipo = String(row.transaction_type || "OTHER").toUpperCase();
    const storno = tipo === "COMPENSATION_REVERSAL" || Boolean(row.reversal_of_id);

    /*
      **Zero e una risposta, non un dato mancante.** (D-D)

      La ricaduta sul lordo era condizionata a `netto !== 0`, e su un compenso
      interamente trattenuto — netto zero, contributi pari al lordo — proiettava
      **il lordo** come uscita: denaro che dal conto non e mai uscito verso la
      persona. Il saldo, che somma `net_amount`, diceva zero: le due letture
      divergevano dell'intero lordo.

      `net_amount` e `Float @default(0)` e ogni percorso di scrittura lo
      valorizza — le voci d'agenda ci mettono l'importo stesso. Quindi il ramo
      `!== 0` non proteggeva niente che non fosse gia coperto, e apriva questo
      buco. Se il netto e zero, dal conto verso la persona non e uscito niente:
      la riga non c'e, e il denaro dei contributi lo racconta l'F24.
    */
    const netto = Number(row.net_amount);
    const lordo = Number(row.gross_amount) || 0;
    const base = Number.isFinite(netto) ? netto : lordo;
    const firmato = toCents(base);
    const amountCents = Math.abs(firmato);
    if (amountCents === 0) return [];

    /*
      **Il segno del netto decide il verso, e deve.** (D-F)

      Il verso si ricavava dal solo tipo di operazione, e l'importo si prendeva
      in valore assoluto. Il saldo del conto invece somma `net_amount` **con il
      suo segno** e lo tratta come uscita: su una riga con netto negativo — un
      rimborso spese corretto in negativo — le due letture divergevano del
      **doppio** dell'importo. Erano due formule diverse per lo stesso numero,
      ed e esattamente cio che questa Wave vieta.
    */
    const versoDalSegno: AccountingLine["direction"] | null =
      firmato < 0 ? "IN" : null;

    const persona = testo(row._personName) || "Persona";

    return [
      proietta({
        id: `sport-work:${row.id}`,
        organizationId: row.organization_id,
        entryDate: paidAt,
        direction: versoDalSegno ?? (storno ? "IN" : "OUT"),
        amountCents,
        sourceDomain: storno ? "REVERSAL" : "SPORT_WORK_PAYOUT",
        sourceId: row.id,
        reversedAt: iso(row.reversed_at),
        reversalOfId: testo(row.reversal_of_id),
        description: `${ETICHETTE_LAVORO_SPORTIVO[tipo] || ETICHETTE_LAVORO_SPORTIVO.OTHER} - ${persona}`,
        financialAccountId: testo(row.financial_account_id),
        financialAccountName: testo(row._accountName),
        counterpartyKind: "SPORT_WORK_PERSON",
        counterpartyId: testo(row.person_id),
        counterpartyLabel: persona,
        paymentMethod: testo(row.payment_method),
        notes: testo(row.reference),
        createdAt: iso(row.created_at),
      }),
    ];
  });

/* ========================================================================== */
/* Liquidazioni dei bandi                                                      */
/* ========================================================================== */

export type FundingSettlementRow = {
  id: string;
  organization_id: string;
  settled_at: Date | string;
  amount: number | string;
  reference?: string | null;
  method?: string | null;
  notes?: string | null;
  program_id?: string | null;
  financial_account_id?: string | null;
  reversal_of_id?: string | null;
  reversed_at?: Date | string | null;
  created_at?: Date | string | null;
  _programName?: string | null;
  _accountName?: string | null;
};

/**
 * Il bonifico dell'ente diventa un'entrata.
 *
 * **E la sola cosa del dominio bandi che entra in liquidita.** La
 * *maturazione* di un voucher fa nascere un credito verso l'ente e non e
 * denaro: metterla qui vorrebbe dire dichiarare incassato cio che il club sta
 * ancora aspettando. La distinzione e gia scritta in ADR-0037, e questa
 * proiezione la rispetta senza discuterla.
 *
 * Il buco che chiude: fino a oggi un bonifico dell'ente era **invisibile nel
 * saldo**. Il credito si chiudeva e il denaro non compariva da nessuna parte.
 */
export const projectFundingSettlements = (
  rows: readonly FundingSettlementRow[],
): AccountingLine[] =>
  rows.flatMap((row) => {
    const settledAt = iso(row.settled_at);
    if (!settledAt) return [];

    const firmato = toCents(Number(row.amount) || 0);
    const amountCents = Math.abs(firmato);
    if (amountCents === 0) return [];

    /*
      Il segno decide il verso anche qui, e il database lo pretende: un vincolo
      impone importo positivo a una liquidazione e negativo a uno storno. Le due
      condizioni coincidono sempre, e leggere il segno invece del riferimento
      allo storno tiene la regola una sola.
    */
    const storno = Boolean(row.reversal_of_id);
    const programma = testo(row._programName) || "Contributo";

    return [
      proietta({
        id: `funding-settlement:${row.id}`,
        organizationId: row.organization_id,
        entryDate: settledAt,
        direction: firmato < 0 ? "OUT" : "IN",
        amountCents,
        sourceDomain: storno ? "REVERSAL" : "FUNDING_SETTLEMENT",
        sourceId: row.id,
        reversedAt: iso(row.reversed_at),
        reversalOfId: testo(row.reversal_of_id),
        description: storno
          ? `Storno liquidazione - ${programma}`
          : `Liquidazione - ${programma}`,
        financialAccountId: testo(row.financial_account_id),
        financialAccountName: testo(row._accountName),
        counterpartyKind: "ENTITY",
        counterpartyId: testo(row.program_id),
        counterpartyLabel: programma,
        paymentMethod: testo(row.method),
        notes: testo(row.notes) || testo(row.reference),
        createdAt: iso(row.created_at),
      }),
    ];
  });

/* ========================================================================== */
/* La composizione                                                             */
/* ========================================================================== */

/**
 * Ordina le righe per data, dalla piu recente.
 *
 * Il confronto e su **timestamp**, non su stringa. Il vecchio aggregatore
 * ordinava con `localeCompare` su date ISO: funziona finche i formati
 * coincidono, e sbaglia in silenzio appena una riga porta un fuso o una
 * precisione diversa.
 */
export const sortAccountingLines = (lines: readonly AccountingLine[]) =>
  [...lines].sort((a, b) => {
    const ta = Date.parse(a.entryDate);
    const tb = Date.parse(b.entryDate);
    if (tb !== ta) return tb - ta;
    /* A parita di data, un ordine stabile: altrimenti la pagina 2 ripete righe della 1. */
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });

/**
 * Unisce righe proprie e righe proiettate in una prima nota sola.
 *
 * La deduplicazione e su `id`, che e **prefissato per dominio**
 * (`payment-transaction:`, `sport-work:`, ...): due domini non possono
 * collidere. Il vecchio aggregatore deduplicava due volte con due chiavi
 * diverse, e nessuna delle due era l'identita della riga.
 */
export const mergeAccountingLines = (
  ...groups: readonly (readonly AccountingLine[])[]
): AccountingLine[] => {
  const perId = new Map<string, AccountingLine>();
  for (const group of groups) {
    for (const line of group) {
      if (!perId.has(line.id)) perId.set(line.id, line);
    }
  }
  return sortAccountingLines([...perId.values()]);
};
