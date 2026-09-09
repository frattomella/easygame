/**
 * **Di questa rata, quanto la porta un ente e quanto la famiglia** (ADR-0158).
 *
 * ---
 *
 * ## Perche esiste un modulo terzo
 *
 * ADR-0037 §5 vieta ai due domini di importarsi: `funding.ts` non conosce
 * `payment_transactions`, e `installment-ledger.ts` non sa cosa sia un
 * contributo. Quel divieto non e stato allentato — e la difesa che impedisce a
 * un maturato di diventare cassa — quindi la composizione dei due vive **qui**,
 * in un modulo che li legge entrambi e che **nessuno dei due importa**.
 *
 * Puro come i suoi due vicini: niente Prisma, niente React, niente rete. Il
 * server e la scheda atleta condividono percio una sola idea di «quanto deve
 * ancora la famiglia».
 *
 * ## Le sei grandezze
 *
 * | Grandezza | Significato |
 * |---|---|
 * | `dueAmount` | quanto vale la rata: il **debito**, e non cambia mai |
 * | `plannedCoverage` | quanto ci si aspetta dall'ente su questa rata |
 * | `accruedCoverage` | quanta di quella copertura l'atleta ha guadagnato |
 * | `settledCoverage` | quanta l'ente ha **versato** |
 * | `familyDueAmount` | quanto resta a carico della famiglia |
 * | `familyPaidAmount` | quanto la famiglia ha versato davvero |
 *
 * Le prime quattro parlano dell'**ente**, le ultime due della **famiglia**. Non
 * si sommano mai in un totale unico.
 *
 * ## Cio che questo modulo non fa, ed e il punto
 *
 * Non produce incassi. Una copertura non e denaro entrato: e una previsione.
 * Nessuna funzione qui restituisce qualcosa che un riquadro di cassa possa
 * sommare, e `familyPaidAmount` continua a venire **soltanto** dai movimenti.
 */

import {
  buildStatusLabels,
  isSettledTransaction,
  normalizePaymentTransactions,
  resolveLedgerState,
  toCents,
  type InstallmentLedger,
  type InstallmentLedgerState,
  type NormalizedPaymentTransaction,
} from "@/lib/payments/installment-ledger";

/** Una riga di `payment_coverage_allocations`, in qualunque grafia arrivi. */
export type CoverageAllocationInput = {
  id?: string | null;
  payment_id?: string | null;
  paymentId?: string | null;
  enrollment_id?: string | null;
  enrollmentId?: string | null;
  athlete_id?: string | null;
  athleteId?: string | null;
  amount?: unknown;
  reversed_at?: unknown;
  reversedAt?: unknown;
  reverses_allocation_id?: string | null;
  reversesAllocationId?: string | null;
};

export type NormalizedCoverageAllocation = {
  readonly id: string;
  readonly paymentId: string;
  readonly enrollmentId: string;
  readonly athleteId: string;
  readonly amount: number;
  readonly reversedAt: string | null;
  readonly reversesAllocationId: string | null;
};

const asText = (value: unknown) => String(value ?? "").trim();

const toAmount = (value: unknown) => {
  const numero = Number(value);
  return Number.isFinite(numero) ? numero : 0;
};

const toIsoOrNull = (value: unknown) => {
  if (!value) return null;
  const data = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(data.getTime()) ? null : data.toISOString();
};

export const normalizeCoverageAllocation = (
  row: CoverageAllocationInput,
): NormalizedCoverageAllocation => ({
  id: asText(row?.id),
  paymentId: asText(row?.payment_id ?? row?.paymentId),
  enrollmentId: asText(row?.enrollment_id ?? row?.enrollmentId),
  athleteId: asText(row?.athlete_id ?? row?.athleteId),
  amount: toAmount(row?.amount),
  reversedAt: toIsoOrNull(row?.reversed_at ?? row?.reversedAt),
  reversesAllocationId:
    asText(row?.reverses_allocation_id ?? row?.reversesAllocationId) || null,
});

export const normalizeCoverageAllocations = (
  rows: readonly CoverageAllocationInput[] = [],
): NormalizedCoverageAllocation[] =>
  (Array.isArray(rows) ? rows : []).map(normalizeCoverageAllocation);

/**
 * **Una copertura viva e una che nessuno ha stornato, e che non e uno storno.**
 *
 * Identica a `isSettledTransaction` per gli incassi, e di proposito: uno storno
 * neutralizza **tutte e due** le gambe. Contare la sola riga negativa
 * porterebbe la copertura sotto zero; contare la sola positiva renderebbe lo
 * storno inutile.
 */
export const isLiveCoverage = (allocation: NormalizedCoverageAllocation) =>
  !allocation.reversedAt && !allocation.reversesAllocationId;

export const sumLiveCoverage = (
  allocations: readonly NormalizedCoverageAllocation[] = [],
) =>
  (Array.isArray(allocations) ? allocations : [])
    .filter(isLiveCoverage)
    .reduce((totale, allocation) => totale + toCents(allocation.amount), 0) / 100;

/**
 * **Quanto di un'adesione e gia impegnato su delle rate.**
 *
 * E il tetto che conta davvero: senza, un voucher da 500 potrebbe coprire 5.000
 * di rate, e la quota a carico della famiglia si azzererebbe con una promessa
 * che l'ente non ha mai fatto.
 */
export const sumLiveCoverageForEnrollment = (
  allocations: readonly NormalizedCoverageAllocation[] = [],
  enrollmentId: string,
) =>
  sumLiveCoverage(
    (Array.isArray(allocations) ? allocations : []).filter(
      (allocation) => allocation.enrollmentId === asText(enrollmentId),
    ),
  );

/**
 * **Quanto di questa adesione e maturato, e quanto liquidato.**
 *
 * Sono i due numeri che il dominio dei bandi gia calcola: qui arrivano dal
 * chiamante, perche questo modulo non importa `funding.ts` (ADR-0037 §5).
 */
export type EnrollmentFundingState = {
  /** Σ dei periodi in stato `accrued` / `reported` / `settled`. */
  readonly accruedAmount: number;
  /** Σ delle righe di liquidazione: quanto l'ente ha **versato**. */
  readonly settledAmount: number;
};

export type InstallmentCoverage = {
  /** Il debito: non cambia mai, ed e la ragione per cui il piano resta la fonte. */
  readonly dueAmount: number;
  readonly plannedCoverage: number;
  /**
   * **La copertura che il debito sostiene davvero**: `plannedCoverage` limitata
   * al dovuto.
   *
   * Sono due numeri e non uno perche rispondono a due domande. La promessa dice
   * quanto l'ente si e impegnato a portare; questa dice quanto di quella
   * promessa **agisce** su questa rata. Divergono quando l'importo di una rata
   * viene corretto **verso il basso** dopo che la copertura era stata scritta:
   * una rata da 100 coperta per 100 e poi ridotta a 60 porta una promessa da
   * 100 e una copertura efficace da 60.
   *
   * Somma questa e non la promessa chi deve far quadrare
   * `dovuto = copertura + quota famiglia` (revisione ostile, F4): sommare la
   * promessa rompeva l'invariante che il riepilogo dichiara.
   */
  readonly appliedCoverage: number;
  readonly accruedCoverage: number;
  readonly settledCoverage: number;
  /** Debito meno copertura prevista: quanto la famiglia deve davvero. */
  readonly familyDueAmount: number;
  readonly familyPaidAmount: number;
  readonly familyResidualAmount: number;
  /**
   * Lo stato risponde alla domanda **della famiglia**: ha versato quanto le
   * toccava? Su una rata senza copertura e identico a prima, perche
   * `familyDueAmount` e `dueAmount` sono lo stesso numero.
   */
  readonly state: InstallmentLedgerState;
  readonly allocations: readonly NormalizedCoverageAllocation[];
};

/**
 * **Quanta della copertura promessa su questa rata e sostenuta da un maturato.**
 *
 * Il maturato di un'adesione e un numero **per atleta**, non per rata: l'ente
 * riconosce mensilita, non quote d'iscrizione. Ripartirlo sulle rate coperte
 * richiede una regola, e la regola e **proporzionale alla copertura promessa**.
 *
 * Perche proporzionale e non cronologica. Una ripartizione «prima le rate piu
 * vecchie» direbbe che la rata di ottobre e interamente maturata e quella di
 * marzo per niente, il che e vero per un ente che paga a mensilita ma **falso**
 * per il club, che quelle rate le ha emesse insieme. E soprattutto renderebbe
 * lo stato di una rata dipendente dall'**ordine** delle altre: correggere una
 * data di scadenza sposterebbe il maturato da una rata all'altra senza che
 * nessuno abbia toccato una presenza.
 *
 * Proporzionale e l'unica ripartizione che non introduce un ordine dove il
 * dominio non ne ha uno.
 */
const quotaSostenuta = (
  coperturaDiQuestaRata: number,
  coperturaTotaleDellAdesione: number,
  importoSostenuto: number,
) => {
  const totale = toCents(coperturaTotaleDellAdesione);
  if (totale <= 0) return 0;

  const questa = toCents(coperturaDiQuestaRata);
  const sostenuto = toCents(importoSostenuto);

  /*
    Il sostenuto puo superare la copertura promessa — un atleta puo maturare
    piu di quanto il club abbia allocato — e in quel caso la quota si ferma
    alla promessa: non si copre una rata piu di quanto si sia detto.
  */
  const quota = Math.min(questa, Math.round((questa * sostenuto) / totale));
  return Math.max(0, quota) / 100;
};

/**
 * **Il quadro di una rata, con la copertura accanto agli incassi.**
 *
 * `allocations` sono le righe di **questa** rata; `enrollmentCoverage` dice
 * quanto ciascuna adesione ha allocato **in tutto** (su tutte le rate), e
 * `enrollmentFunding` quanto ha maturato e liquidato. I due ultimi servono a
 * ripartire, e senza di loro la copertura resta soltanto «prevista».
 */
export const resolveInstallmentCoverage = ({
  dueAmount,
  transactions = [],
  allocations = [],
  enrollmentCoverage = {},
  enrollmentFunding = {},
}: {
  dueAmount: unknown;
  transactions?: readonly NormalizedPaymentTransaction[] | readonly any[];
  allocations?: readonly CoverageAllocationInput[];
  /** Copertura viva totale per adesione, su tutte le rate. */
  enrollmentCoverage?: Record<string, number>;
  enrollmentFunding?: Record<string, EnrollmentFundingState>;
}): InstallmentCoverage => {
  const dovuto = toAmount(dueAmount);
  const righe = normalizeCoverageAllocations(allocations);
  const vive = righe.filter(isLiveCoverage);

  const plannedCoverage = sumLiveCoverage(righe);

  let accruedCents = 0;
  let settledCents = 0;

  for (const allocation of vive) {
    const totaleAdesione =
      enrollmentCoverage[allocation.enrollmentId] ?? allocation.amount;
    const stato = enrollmentFunding[allocation.enrollmentId];
    if (!stato) continue;

    accruedCents += toCents(
      quotaSostenuta(allocation.amount, totaleAdesione, stato.accruedAmount),
    );
    settledCents += toCents(
      quotaSostenuta(allocation.amount, totaleAdesione, stato.settledAmount),
    );
  }

  /*
    La copertura prevista non supera mai il debito: e un invariante che il
    servizio fa valere in scrittura, e qui si difende comunque in lettura —
    una riga scritta prima della guardia, o da una mano, non deve poter
    produrre una quota famiglia **negativa**, cioe un rimborso che nessuno ha
    deliberato.
  */
  const copertaCents = Math.min(toCents(plannedCoverage), toCents(dovuto));
  const familyDueAmount = Math.max(0, toCents(dovuto) - copertaCents) / 100;
  const appliedCoverage = copertaCents / 100;

  const movimenti = normalizePaymentTransactions(transactions as any[]);
  const familyPaidAmount =
    movimenti
      .filter(isSettledTransaction)
      .reduce((totale, movimento) => totale + toCents(movimento.amount), 0) /
    100;

  return {
    dueAmount: dovuto,
    plannedCoverage,
    appliedCoverage,
    accruedCoverage: accruedCents / 100,
    settledCoverage: settledCents / 100,
    familyDueAmount,
    familyPaidAmount,
    familyResidualAmount:
      Math.max(0, toCents(familyDueAmount) - toCents(familyPaidAmount)) / 100,
    state: resolveLedgerState({
      dueAmount: familyDueAmount,
      paidAmount: familyPaidAmount,
    }),
    allocations: righe,
  };
};

/**
 * **La rata vista con gli occhi della famiglia** (N14).
 *
 * ---
 *
 * ## Perche non basta sostituire due importi
 *
 * La prima stesura riscriveva `dueAmount` e `residualAmount` e lasciava stare
 * il resto. Ma **stato, scadenza ed etichette di una rata non sono dati: sono
 * derivati** da quei due importi (ADR-0036), e lasciarli indietro produce una
 * riga che si contraddice da sola. Il collaudo a schermo l'ha letta cosi:
 *
 * ```
 * Rata 1 — 50,00 € / 50,00 € pagati · Residuo 0,00 €
 * [PARZIALMENTE PAGATA] [SCADUTA]
 * ```
 *
 * e in cima alla scheda «1 rata scaduta per 0,00 €». La famiglia aveva versato
 * tutta la sua quota: lo stato veniva ancora dai 200 lordi, di cui 150 li porta
 * l'ente.
 *
 * ## Cosa fa questa funzione
 *
 * Riduce la rata alla quota della famiglia e **ricalcola tutto cio che ne
 * dipende** con le funzioni che gia lo calcolano: `resolveLedgerState` per lo
 * stato, `buildStatusLabels` per le etichette. Non ne scrive di nuove.
 *
 * `overdue` e l'unica che si compone qui, ed e una congiunzione onesta: una
 * rata e in ritardo **per la famiglia** se lo era e se le resta ancora
 * qualcosa da versare. Una rata scaduta il cui residuo familiare e zero non e
 * un ritardo di nessuno.
 *
 * Su una rata senza copertura restituisce l'oggetto **identico**: e la
 * proprieta che rende questa funzione sicura da applicare a tutte le rate.
 */
export const withFamilyShare = (
  ledger: InstallmentLedger,
  coverage?: InstallmentCoverage | null,
): InstallmentLedger => {
  if (!coverage) return ledger;

  const familyDue = coverage.familyDueAmount;

  /*
    **Il versato lo porta il registro, non la copertura** (revisione ostile, F2).

    `coverage.familyPaidAmount` somma i **movimenti**, e c'e una classe di rate
    che non ne ha: quelle saldate prima del registro degli incassi, che lo
    dichiarano con `status = "paid"` e nessun movimento
    (`installment-ledger.ts`, «compatibilita con i dati esistenti»). Su una di
    quelle, coperta da un voucher, la copertura avrebbe detto «versato zero» —
    e la scheda avrebbe chiesto di nuovo alla famiglia una rata che risultava
    saldata due righe piu sotto.

    `ledger.paidAmount` conosce tutte e due le forme e non contiene **mai** un
    centesimo dell'ente: su una rata normale i due numeri coincidono, su una
    riga vecchia il registro ha ragione. Vince il registro.
  */
  const familyPaid = ledger.paidAmount;

  /*
    **Una quota di zero e una quota assolta.**

    `resolveLedgerState` chiama «in attesa» un dovuto di zero, ed e giusto per
    una rata lorda: un debito che non esiste non e un debito saldato, e nel
    registro degli incassi la distinzione conta. Qui la domanda e un'altra —
    «la famiglia ha versato quanto le toccava?» — e su una rata interamente
    coperta la risposta e si, banalmente. Lasciare «IN ATTESA» accanto a
    «Residuo 0,00» rimetterebbe in pagina la contraddizione che questa funzione
    esiste per togliere.
  */
  const state: InstallmentLedgerState =
    toCents(familyDue) <= 0
      ? "paid"
      : resolveLedgerState({ dueAmount: familyDue, paidAmount: familyPaid });
  const residuo =
    Math.max(0, toCents(familyDue) - toCents(familyPaid)) / 100;
  const overdue = ledger.overdue && residuo > 0;

  return {
    ...ledger,
    dueAmount: familyDue,
    paidAmount: familyPaid,
    residualAmount: residuo,
    state,
    overdue,
    statusLabels: buildStatusLabels(state, overdue),
    progress:
      toCents(familyDue) > 0
        ? Math.min(1, toCents(familyPaid) / toCents(familyDue))
        : 1,
  };
};

/**
 * **I sette numeri della scheda «Iscrizione»** (N14).
 *
 * ---
 *
 * ## Perche una funzione e non sette somme nella schermata
 *
 * Perche i sette numeri devono **quadrare fra loro**, e sette somme scritte
 * dentro un componente sono sette occasioni di sbagliarne una senza che nessun
 * test se ne accorga. L'invariante che li tiene insieme e uno solo:
 *
 * ```
 * quota totale = copertura prevista + a carico della famiglia
 * a carico della famiglia = pagato dalla famiglia + residuo
 * ```
 *
 * ## Le due contabilita restano due
 *
 * `plannedCoverage`, `accruedCoverage` e `settledCoverage` parlano dell'**ente**
 * e non entrano mai in `familyPaidAmount`. Un voucher maturato per 100 non
 * sposta di un centesimo cio che la famiglia ha versato, ed e la ragione per
 * cui questa funzione non restituisce un «totale incassato»: quel numero, qui,
 * non esiste.
 *
 * ## Le rate senza copertura contano lo stesso
 *
 * `coverageByInstallment` porta **solo** le rate coperte — e la forma che
 * `useAthletePaymentLedger` gia produce — quindi una rata assente non e una
 * rata da zero: e una rata interamente a carico della famiglia. Trattarla come
 * assente e cio che farebbe sparire dal riepilogo le rate non coperte.
 */
export type PlanCoverageSummary = {
  /** Il debito complessivo del piano: la quota totale. Non cambia mai. */
  readonly dueAmount: number;
  readonly plannedCoverage: number;
  readonly accruedCoverage: number;
  readonly settledCoverage: number;
  readonly familyDueAmount: number;
  readonly familyPaidAmount: number;
  readonly familyResidualAmount: number;
  /** Quante rate hanno almeno una copertura viva. */
  readonly coveredInstallmentCount: number;
};

export const summarizePlanCoverage = ({
  installments = [],
  coverageByInstallment = {},
}: {
  installments?: readonly {
    installmentId?: string | null;
    dueAmount?: unknown;
    paidAmount?: unknown;
  }[];
  coverageByInstallment?: Record<string, InstallmentCoverage>;
}): PlanCoverageSummary => {
  let dueCents = 0;
  let plannedCents = 0;
  let accruedCents = 0;
  let settledCents = 0;
  let familyDueCents = 0;
  let familyPaidCents = 0;
  let coveredInstallmentCount = 0;

  for (const rata of Array.isArray(installments) ? installments : []) {
    const copertura = coverageByInstallment[asText(rata?.installmentId)];

    /*
      **«Pagato» ha una definizione sola, e la porta la rata** (revisione
      ostile, F2). Prima le rate coperte usavano `copertura.familyPaidAmount` —
      che conta i soli movimenti — e quelle scoperte `rata.paidAmount`, che
      conosce anche le rate saldate prima del registro. Due definizioni sommate
      nella stessa colonna: la piu piccola vinceva sulle rate coperte, e la
      famiglia si vedeva chiedere di nuovo cio che aveva gia versato.
    */
    familyPaidCents += toCents(toAmount(rata?.paidAmount));

    if (!copertura) {
      const dovuto = toCents(toAmount(rata?.dueAmount));
      dueCents += dovuto;
      familyDueCents += dovuto;
      continue;
    }

    dueCents += toCents(copertura.dueAmount);
    /*
      **Si somma la copertura che agisce, non la promessa** (revisione ostile,
      F4): sommare `plannedCoverage` rompeva l'invariante che questo riepilogo
      dichiara — su una rata ridotta a 60 dopo una copertura da 100 usciva
      «quota 60, copertura 100, famiglia 0».
    */
    plannedCents += toCents(copertura.appliedCoverage);
    accruedCents += toCents(copertura.accruedCoverage);
    settledCents += toCents(copertura.settledCoverage);
    familyDueCents += toCents(copertura.familyDueAmount);
    if (copertura.appliedCoverage > 0) coveredInstallmentCount += 1;
  }

  return {
    dueAmount: dueCents / 100,
    plannedCoverage: plannedCents / 100,
    accruedCoverage: accruedCents / 100,
    settledCoverage: settledCents / 100,
    familyDueAmount: familyDueCents / 100,
    familyPaidAmount: familyPaidCents / 100,
    /*
      Il residuo non scende sotto zero: una famiglia che ha versato piu del
      dovuto ha un credito, e un credito e un fatto che si legge sulla rata —
      non un residuo negativo da sottrarre alle altre.
    */
    familyResidualAmount:
      Math.max(0, familyDueCents - familyPaidCents) / 100,
    coveredInstallmentCount,
  };
};

/**
 * **La capienza residua di una rata**: quanto si puo ancora coprire.
 *
 * Coprire piu del dovuto vorrebbe dire promettere alla famiglia un rimborso che
 * nessuno ha deliberato.
 */
export const remainingCoverageCapacity = (
  dueAmount: unknown,
  allocations: readonly CoverageAllocationInput[] = [],
) =>
  Math.max(
    0,
    toCents(toAmount(dueAmount)) -
      toCents(sumLiveCoverage(normalizeCoverageAllocations(allocations))),
  ) / 100;

/**
 * **La capienza residua di un'adesione**: quanto del voucher non e ancora
 * impegnato su nessuna rata.
 */
export const remainingEnrollmentCapacity = (
  assignedAmount: unknown,
  allocations: readonly CoverageAllocationInput[] = [],
  enrollmentId?: string,
) => {
  const righe = normalizeCoverageAllocations(allocations);
  const impegnato = enrollmentId
    ? sumLiveCoverageForEnrollment(righe, enrollmentId)
    : sumLiveCoverage(righe);

  return (
    Math.max(0, toCents(toAmount(assignedAmount)) - toCents(impegnato)) / 100
  );
};

/**
 * **Il vaglio di una copertura nuova**, prima di scriverla.
 *
 * Restituisce il messaggio del rifiuto, oppure `null`. La stessa funzione la
 * usano il servizio e la schermata: due idee di «quanto ci sta» divergono al
 * primo caso limite, e chi le scopre e la segreteria davanti a un errore che
 * non si aspettava.
 */
export const validateCoverageAllocation = ({
  amount,
  dueAmount,
  existingOnInstallment = [],
  assignedAmount,
  existingOnEnrollment = [],
  enrollmentId,
}: {
  amount: unknown;
  dueAmount: unknown;
  existingOnInstallment?: readonly CoverageAllocationInput[];
  assignedAmount: unknown;
  existingOnEnrollment?: readonly CoverageAllocationInput[];
  enrollmentId: string;
}): string | null => {
  const importo = toAmount(amount);

  if (!(importo > 0)) {
    return "L'importo della copertura deve essere maggiore di zero";
  }

  const capienzaRata = remainingCoverageCapacity(
    dueAmount,
    existingOnInstallment,
  );
  if (toCents(importo) > toCents(capienzaRata)) {
    return `La rata puo ancora essere coperta per ${capienzaRata.toFixed(2)} EUR: coprirne di piu vorrebbe dire promettere un rimborso alla famiglia`;
  }

  const capienzaVoucher = remainingEnrollmentCapacity(
    assignedAmount,
    existingOnEnrollment,
    enrollmentId,
  );
  if (toCents(importo) > toCents(capienzaVoucher)) {
    return `Del voucher restano ${capienzaVoucher.toFixed(2)} EUR non ancora impegnati: non si copre con denaro che l'ente non ha assegnato`;
  }

  return null;
};
