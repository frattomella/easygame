/**
 * La riconciliazione di un bando: cosa e maturato, per chi, e **perche**.
 *
 * **A cosa serve, in concreto.** Il primo bando vero caricato su EasyGame non
 * si puo dichiarare affidabile perche i test sono verdi: i test provano che il
 * calcolo faccia quello che la configurazione dice, non che la configurazione
 * dica quello che il bando prevede. Quelle due cose divergono per un giorno di
 * calendario, per una soglia letta come «almeno» invece che «piu di», per un
 * periodo che l'ente conta dal lunedi e il club dal primo del mese. Chi
 * rendiconta deve poter mettere accanto, riga per riga, cio che EasyGame ha
 * calcolato e cio che l'ente si aspetta — e vedere dove non coincidono.
 *
 * **Perche una riga per periodo e non un totale.** Un totale che coincide non
 * dimostra niente: due errori di segno opposto lo fanno coincidere lo stesso.
 * La riga porta la misura grezza (quante ore, quante presenze), il requisito
 * con cui e stata confrontata, e cio che ne e uscito. Se il totale non torna,
 * si vede **quale periodo** non torna.
 *
 * **Perche c'e anche cio che non e maturato.** Un periodo non maturato e la
 * riga piu interessante di tutte, perche e quella su cui l'ente e il club
 * possono avere idee diverse. Escluderla dalla riconciliazione vorrebbe dire
 * far sparire proprio le domande.
 *
 * Modulo **puro**: riceve le righe gia lette, non conosce Prisma — il tracciato
 * CSV lo possiede `src/lib/csv.ts`, che e il solo posto in cui separatore,
 * quoting e neutralizzazione delle formule sono decisi.
 */

import { CSV_DELIMITER, CSV_EOL, csvEscape, csvValue } from "@/lib/csv";

const asText = (value: unknown) => String(value ?? "").trim();

const toNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const toIsoDate = (value: unknown) => {
  const date = value instanceof Date ? value : new Date(String(value || ""));
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
};

export type ReconciliationRow = {
  athleteId: string;
  athleteName: string;
  /** Il codice che l'ente ha assegnato all'atleta, quando ce n'e uno. */
  voucherCode: string;
  periodIndex: number;
  periodLabel: string;
  periodStart: string;
  periodEnd: string;
  /** La misura grezza: quante ore o quante presenze. */
  measuredValue: number;
  requirementMin: number;
  requirementUnit: string;
  requirementMet: boolean;
  /** Cosa il periodo varrebbe se maturasse per intero. */
  eligibleAmount: number;
  /** Cosa ha maturato davvero. */
  accruedAmount: number;
  /** La differenza fra le due: e la colonna su cui si discute con l'ente. */
  unaccruedAmount: number;
  status: string;
};

export type ReconciliationTotals = {
  athletes: number;
  periods: number;
  periodsMet: number;
  assignedAmount: number;
  eligibleAmount: number;
  accruedAmount: number;
  unaccruedAmount: number;
  reportedAmount: number;
};

export type FundingReconciliation = {
  rows: ReconciliationRow[];
  totals: ReconciliationTotals;
};

export type ReconciliationInput = {
  enrollments: Array<Record<string, any>>;
  accruals: Array<Record<string, any>>;
  /** I nomi degli atleti, per identificativo: la riga deve essere leggibile. */
  athleteNames: Record<string, string>;
};

export const buildFundingReconciliation = (
  input: ReconciliationInput,
): FundingReconciliation => {
  const enrollmentById = new Map(
    input.enrollments.map((enrollment) => [asText(enrollment.id), enrollment]),
  );

  const rows: ReconciliationRow[] = input.accruals
    .map((accrual) => {
      const enrollment = enrollmentById.get(asText(accrual.enrollment_id));
      if (!enrollment) return null;

      const athleteId = asText(enrollment.athlete_id);

      return {
        athleteId,
        athleteName: input.athleteNames[athleteId] || athleteId,
        voucherCode: asText(enrollment.voucher_code),
        periodIndex: toNumber(accrual.period_index),
        periodLabel: asText(accrual.period_label),
        periodStart: toIsoDate(accrual.period_start),
        periodEnd: toIsoDate(accrual.period_end),
        measuredValue: toNumber(accrual.measured_value),
        requirementMin: toNumber(accrual.requirement_min),
        requirementUnit: asText(accrual.requirement_unit),
        requirementMet: Boolean(accrual.requirement_met),
        eligibleAmount: toNumber(accrual.eligible_amount),
        accruedAmount: toNumber(accrual.accrued_amount),
        unaccruedAmount: toNumber(accrual.unaccrued_amount),
        status: asText(accrual.status) || "not_accrued",
      };
    })
    .filter((row): row is ReconciliationRow => row !== null)
    .sort(
      (left, right) =>
        left.athleteName.localeCompare(right.athleteName, "it", {
          sensitivity: "base",
        }) || left.periodIndex - right.periodIndex,
    );

  /*
    Gli importi si sommano in centesimi. Sommare in euro, su una tabella con
    un periodo per mese e un centinaio di atleti, produce differenze di
    qualche centesimo sul totale — e un totale che non torna di tre centesimi
    e peggio di uno che non torna di trenta euro: nessuno sa dove guardare.
  */
  const sumCents = (pick: (row: ReconciliationRow) => number) =>
    rows.reduce((total, row) => total + Math.round(pick(row) * 100), 0) / 100;

  return {
    rows,
    totals: {
      athletes: new Set(rows.map((row) => row.athleteId)).size,
      periods: rows.length,
      periodsMet: rows.filter((row) => row.requirementMet).length,
      assignedAmount:
        input.enrollments.reduce(
          (total, enrollment) =>
            total + Math.round(toNumber(enrollment.assigned_amount) * 100),
          0,
        ) / 100,
      eligibleAmount: sumCents((row) => row.eligibleAmount),
      accruedAmount: sumCents((row) => row.accruedAmount),
      unaccruedAmount: sumCents((row) => row.unaccruedAmount),
      reportedAmount:
        rows
          .filter(
            (row) => row.status === "reported" || row.status === "settled",
          )
          .reduce((total, row) => total + Math.round(row.accruedAmount * 100), 0) /
        100,
    },
  };
};

const CSV_COLUMNS: Array<[string, (row: ReconciliationRow) => unknown]> = [
  ["Atleta", (row) => row.athleteName],
  ["Codice voucher", (row) => row.voucherCode],
  ["Periodo", (row) => row.periodLabel],
  ["Dal", (row) => row.periodStart],
  ["Al", (row) => row.periodEnd],
  ["Misurato", (row) => row.measuredValue],
  ["Requisito", (row) => row.requirementMin],
  ["Unita", (row) => row.requirementUnit],
  ["Requisito raggiunto", (row) => (row.requirementMet ? "si" : "no")],
  ["Maturabile", (row) => row.eligibleAmount],
  ["Maturato", (row) => row.accruedAmount],
  ["Non maturato", (row) => row.unaccruedAmount],
  ["Stato", (row) => row.status],
];

/**
 * La stessa tabella, in un file che si apre con un foglio di calcolo.
 *
 * Il separatore e il punto e virgola e i decimali usano la virgola: e la
 * convenzione che Excel in italiano legge senza chiedere niente. Con la
 * virgola come separatore, un importo scritto `12,50` spaccherebbe la riga in
 * due colonne — e chi riconcilia lo scoprirebbe a meta lavoro.
 */
export const toReconciliationCsv = (
  reconciliation: FundingReconciliation,
): string => {
  /*
    **Il tracciato lo scrive il modulo che lo possiede.**

    Qui viveva una copia privata di `escape`, e `src/lib/csv.ts` esiste
    dichiaratamente per ritirarla: il pannello degli adempimenti era gia
    migrato, questo no. Le due differenze non erano di stile.

    Non proteggeva il **ritorno a capo**: il suo test era `/[";\n]/`, senza
    `\r`. Un nome incollato da Windows dentro un'anagrafica porta `\r\n`, e la
    riga si spezzava in due — una beneficiaria in piu, inventata, dentro una
    rendicontazione da consegnare a un ente pubblico.

    E non neutralizzava le **formule**: `=HYPERLINK(...)` scritto in un nome
    usciva come formula viva. Chi apre questo file e per definizione la persona
    che sta riconciliando con il finanziatore, e lo apre in Excel.

    `csvValue` fa entrambe le cose e converte i decimali in virgola, che e la
    ragione per cui la copia era nata.
  */
  const lines = [
    CSV_COLUMNS.map(([label]) => csvEscape(label)).join(CSV_DELIMITER),
  ];

  for (const row of reconciliation.rows) {
    lines.push(
      CSV_COLUMNS.map(([, pick]) => csvValue(pick(row))).join(CSV_DELIMITER),
    );
  }

  return lines.join(CSV_EOL);
};
