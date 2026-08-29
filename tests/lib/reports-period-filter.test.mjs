import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";

import { calculatePaymentReport } from "../../src/lib/club-report-utils.ts";

/**
 * **Il filtro Periodo di `/reports` tocca anche il report pagamenti.**
 *
 * Il difetto, misurato dalla ricognizione della Wave 4 (§28): le dipendenze del
 * `useMemo` che calcola il report pagamenti non includevano il periodo, e la
 * funzione non lo riceveva. Selezionare «Ultimo mese» cambiava allenamenti,
 * presenze e gare e lasciava i quattro numeri finanziari sull'intero storico —
 * **senza dirlo**.
 *
 * E la forma peggiore di un filtro sbagliato: non sbaglia un numero, ne sbaglia
 * tre su sette e lascia credere che tutti e sette guardino lo stesso periodo.
 *
 * Due test lo chiudono da due lati:
 *
 * 1. la funzione **sa** filtrare per periodo, e i totali cambiano;
 * 2. la pagina **glielo passa**, e il `useMemo` dipende dal periodo. Il secondo
 *    e una lettura del sorgente perche il difetto stava li, non nella funzione:
 *    una funzione corretta chiamata senza il suo argomento produce esattamente
 *    lo stesso silenzio di prima.
 */

const CLUB = "club-periodo";

const giorniFa = (giorni) => {
  const data = new Date();
  data.setHours(12, 0, 0, 0);
  data.setDate(data.getDate() - giorni);
  return data.toISOString();
};

/**
 * Una rata gia incassata, nella forma normalizzata di `/movements`.
 *
 * `direction: "income"` e `source: "athlete"` sono quello che
 * `isAthletePaymentMovement` cerca: un movimento che non li ha non e un
 * pagamento di un atleta e non entra nel report, periodo o non periodo.
 */
const incassoAtleta = ({ id, amount, collected, date, dueDate }) => ({
  id,
  source: "athlete",
  direction: "income",
  description: `Quota ${id}`,
  amount,
  collectedAmount: collected,
  cashEvidence: "ledger",
  status: collected >= amount ? "paid" : "pending",
  date,
  dueDate,
  organizationId: CLUB,
  raw: { id, organization_id: CLUB, amount, status: "pending" },
});

const scenario = () => [
  incassoAtleta({
    id: "recente",
    amount: 100,
    collected: 100,
    date: giorniFa(5),
    dueDate: giorniFa(5),
  }),
  incassoAtleta({
    id: "vecchio",
    amount: 250,
    collected: 250,
    date: giorniFa(200),
    dueDate: giorniFa(200),
  }),
];

test("senza periodo il report pagamenti guarda l'intero storico", () => {
  const report = calculatePaymentReport(scenario());

  assert.equal(report.totalPaid, 350);
  assert.equal(report.paidCount, 2);
});

test("«ultimo mese» toglie davvero i movimenti piu vecchi dai numeri finanziari", () => {
  const report = calculatePaymentReport(scenario(), "last30");

  assert.equal(
    report.totalPaid,
    100,
    "il movimento di 200 giorni fa non appartiene all'ultimo mese",
  );
  assert.equal(report.paidCount, 1);
  assert.equal(report.totalDue, 100);
});

test("«ultimi 3 mesi» e una finestra diversa da «ultimo mese»", () => {
  const righe = [
    ...scenario(),
    incassoAtleta({
      id: "due-mesi",
      amount: 60,
      collected: 60,
      date: giorniFa(60),
      dueDate: giorniFa(60),
    }),
  ];

  assert.equal(calculatePaymentReport(righe, "last30").totalPaid, 100);
  assert.equal(calculatePaymentReport(righe, "last90").totalPaid, 160);
  assert.equal(calculatePaymentReport(righe, "all").totalPaid, 410);
});

test("il periodo non altera la ripartizione fra residuo e scaduto dentro la finestra", () => {
  const righe = [
    incassoAtleta({
      id: "parziale-recente",
      amount: 100,
      collected: 40,
      date: giorniFa(3),
      dueDate: giorniFa(1),
    }),
  ];

  const report = calculatePaymentReport(righe, "last30");
  assert.equal(report.totalPaid, 40);
  assert.equal(report.totalOverdue, 60);
  assert.equal(report.overdueCount, 1);
  assert.equal(report.partialCount, 1);
});

/*
  Il difetto vero stava nella chiamata, non nella funzione. Questo test legge
  la pagina: se qualcuno rimuove il periodo dall'argomento o dalle dipendenze
  del `useMemo`, il numero torna a mentire in silenzio e qui diventa rosso.
*/
test("la pagina passa il periodo al report pagamenti, e il useMemo ne dipende", () => {
  const sorgente = readFileSync(
    path.resolve(process.cwd(), "src/app/reports/page.tsx"),
    "utf8",
  );

  const chiamata = sorgente.match(
    /calculatePaymentReport\(([^)]*)\)/,
  );
  assert.ok(chiamata, "la pagina non chiama piu calculatePaymentReport");
  assert.match(
    chiamata[1],
    /\bperiod\b/,
    "il report pagamenti viene calcolato senza il periodo selezionato",
  );

  const memo = sorgente.slice(
    sorgente.indexOf("const paymentReport"),
    sorgente.indexOf("const athleteCount"),
  );
  assert.match(
    memo,
    /\[\s*period\s*,/,
    "le dipendenze del useMemo non includono il periodo: il numero non si ricalcola",
  );
});
