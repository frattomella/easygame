import {
  monthKeyOf,
  roundMoney,
  startOfDay,
  sumMoney,
  toDateOrNull,
  toIsoDate,
  type ObligationKind,
  type RelationshipStatus,
  type RelationshipType,
} from "./model";
import { tryRulesFor } from "./rules";

/**
 * L'**agenda degli adempimenti**: cosa il club deve fare, entro quando, e per
 * quale rapporto.
 *
 * Modulo puro: deriva le scadenze da rapporti, erogazioni e dichiarazioni.
 * Non le scrive, non le invia, e soprattutto **non le assolve**: EasyGame
 * produce l'input dell'adempimento, non l'adempimento (analisi 28, cap. 8.2).
 *
 * **La chiave di idempotenza e il cuore del modulo.** Ogni adempimento
 * derivato porta una `referenceKey` deterministica — `f24:2026-09`,
 * `rasd:<rapporto>`, `cu:<persona>:2026`. Rieseguire la derivazione ogni
 * notte non crea una seconda riga per la stessa scadenza, e quindi non
 * produce una seconda notifica per la stessa cosa. Un promemoria duplicato
 * e il modo piu rapido per far disattivare le notifiche.
 */

export type DerivedObligation = {
  kind: ObligationKind;
  referenceKey: string;
  dueDate: string;
  title: string;
  description: string;
  personId: string | null;
  relationshipId: string | null;
  amount: number | null;
  /** `YYYY-MM` o `YYYY`, quando l'adempimento e periodico. */
  period: string | null;
  source: "derived";
};

export type ObligationRelationship = {
  id: string;
  person_id: string;
  person_name?: string | null;
  relationship_type: RelationshipType | string;
  status: RelationshipStatus | string;
  start_date: Date | string | null;
  end_date: Date | string | null;
  rasd_status?: string | null;
};

export type ObligationPayout = {
  id: string;
  person_id: string;
  relationship_id: string | null;
  transaction_type: string;
  paid_at: Date | string;
  fiscal_year: number;
  gross_amount: number;
  employee_contribution?: number | null;
  employer_contribution?: number | null;
  reversed_at?: Date | string | null;
};

export type ObligationDeclaration = {
  person_id: string;
  fiscal_year: number;
  status?: string | null;
};

/** Il 30 del mese successivo a una data: termine della comunicazione al RASD. */
const thirtiethOfNextMonth = (date: Date) => {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;
  const targetYear = month === 11 ? year + 1 : year;
  const targetMonth = month === 11 ? 0 : month;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  return new Date(Date.UTC(targetYear, targetMonth, Math.min(30, lastDay)));
};

/** Il giorno `day` del mese successivo a `YYYY-MM`. */
const dayOfMonthAfter = (monthKey: string, day: number) => {
  const [year, month] = monthKey.split("-").map(Number);
  const targetYear = month === 12 ? year + 1 : year;
  const targetMonth = month === 12 ? 1 : month + 1;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth, 0)).getUTCDate();
  return new Date(
    Date.UTC(targetYear, targetMonth - 1, Math.min(day, lastDay)),
  );
};

const isLivePayout = (row: ObligationPayout) =>
  !row.reversed_at && row.transaction_type === "COMPENSATION_PAYMENT";

/** Giorni di preavviso su un contratto in scadenza. */
export const CONTRACT_EXPIRY_NOTICE_DAYS = 30;

/**
 * Termine di preparazione della Certificazione Unica: **16 marzo** dell'anno
 * successivo.
 *
 * Il termine e di prassi consolidata (DPR 322/1998 art. 4 e provvedimenti
 * annuali). EasyGame lo usa solo per collocare un promemoria: non prepara e
 * non trasmette la CU.
 */
const cuDueDate = (year: number) => new Date(Date.UTC(year + 1, 2, 16));

/**
 * Deriva l'agenda degli adempimenti. **Idempotente**: due esecuzioni sugli
 * stessi dati producono le stesse `referenceKey`.
 */
export const deriveObligations = (input: {
  relationships: ObligationRelationship[];
  payouts: ObligationPayout[];
  declarations: ObligationDeclaration[];
  now?: Date;
}): DerivedObligation[] => {
  const now = startOfDay(input.now ?? new Date());
  const out: DerivedObligation[] = [];

  const nameOf = (relationship: ObligationRelationship) =>
    String(relationship.person_name || "").trim() || "la persona";

  /* ------------------------------------------ comunicazione al RASD */

  for (const relationship of input.relationships) {
    if (relationship.relationship_type !== "SPORT_COCOCO") continue;
    if (relationship.status === "DRAFT") continue;

    const start = toDateOrNull(relationship.start_date);
    if (!start) continue;

    out.push({
      kind: "RASD_COMMUNICATION",
      referenceKey: `rasd:${relationship.id}`,
      dueDate: toIsoDate(thirtiethOfNextMonth(startOfDay(start))),
      title: "Comunicazione di instaurazione al RASD",
      description: `Rapporto di ${nameOf(relationship)} iniziato il ${toIsoDate(startOfDay(start))}. Il termine e il 30 del mese successivo. EasyGame prepara i dati; la comunicazione la trasmette una persona sul portale.`,
      personId: relationship.person_id,
      relationshipId: relationship.id,
      amount: null,
      period: null,
      source: "derived",
    });
  }

  /* -------------------------------------------- contratto in scadenza */

  for (const relationship of input.relationships) {
    if (relationship.status !== "ACTIVE" && relationship.status !== "SUSPENDED") {
      continue;
    }
    const end = toDateOrNull(relationship.end_date);
    if (!end) continue;

    const daysToEnd = Math.round(
      (startOfDay(end).getTime() - now.getTime()) / 86400000,
    );
    if (daysToEnd > CONTRACT_EXPIRY_NOTICE_DAYS) continue;

    out.push({
      kind: "CONTRACT_EXPIRY",
      referenceKey: `contract:${relationship.id}`,
      dueDate: toIsoDate(startOfDay(end)),
      title:
        daysToEnd < 0 ? "Contratto scaduto: rinnovo o cessazione" : "Contratto in scadenza",
      description: `Il rapporto di ${nameOf(relationship)} ${daysToEnd < 0 ? "e scaduto il" : "scade il"} ${toIsoDate(startOfDay(end))}. Va rinnovato oppure chiuso con la comunicazione di cessazione.`,
      personId: relationship.person_id,
      relationshipId: relationship.id,
      amount: null,
      period: null,
      source: "derived",
    });
  }

  /* --------------------------------- contributi e F24 del mese */

  const byMonth = new Map<
    string,
    { employee: number; employer: number; count: number }
  >();

  for (const payout of input.payouts) {
    if (!isLivePayout(payout)) continue;
    const employee = Number(payout.employee_contribution) || 0;
    const employer = Number(payout.employer_contribution) || 0;
    if (employee <= 0 && employer <= 0) continue;

    const key = monthKeyOf(payout.paid_at);
    const entry = byMonth.get(key) || { employee: 0, employer: 0, count: 0 };
    entry.employee = roundMoney(entry.employee + employee);
    entry.employer = roundMoney(entry.employer + employer);
    entry.count += 1;
    byMonth.set(key, entry);
  }

  for (const [monthKey, totals] of byMonth) {
    const year = Number(monthKey.slice(0, 4));
    const rules = tryRulesFor(year);
    const day = rules?.contributionPaymentDay.value ?? 16;
    const total = roundMoney(totals.employee + totals.employer);

    out.push({
      kind: "F24",
      referenceKey: `f24:${monthKey}`,
      dueDate: toIsoDate(dayOfMonthAfter(monthKey, day)),
      title: `Versamento contributi ${monthKey}`,
      description: `${totals.count} erogazioni nel mese. Quota lavoratore ${totals.employee.toFixed(2)}, quota club ${totals.employer.toFixed(2)}. EasyGame calcola gli importi e le causali; non compila e non invia l'F24.`,
      personId: null,
      relationshipId: null,
      amount: total,
      period: monthKey,
      source: "derived",
    });
  }

  /* ------------------------------------ autocertificazione mancante */

  const declaredKeys = new Set(
    input.declarations
      .filter((row) => String(row.status || "ACTIVE") === "ACTIVE")
      .map((row) => `${row.person_id}:${row.fiscal_year}`),
  );

  const yearsByPerson = new Map<string, Set<number>>();

  for (const relationship of input.relationships) {
    if (relationship.relationship_type !== "SPORT_COCOCO") continue;
    if (relationship.status === "DRAFT" || relationship.status === "TERMINATED") {
      continue;
    }
    const start = toDateOrNull(relationship.start_date);
    const end = toDateOrNull(relationship.end_date);
    const firstYear = start ? start.getUTCFullYear() : now.getUTCFullYear();
    const lastYear = end ? end.getUTCFullYear() : now.getUTCFullYear();

    for (let year = firstYear; year <= lastYear; year += 1) {
      if (year > now.getUTCFullYear()) continue;
      const set = yearsByPerson.get(relationship.person_id) || new Set<number>();
      set.add(year);
      yearsByPerson.set(relationship.person_id, set);
    }
  }

  for (const [personId, years] of yearsByPerson) {
    for (const year of years) {
      if (declaredKeys.has(`${personId}:${year}`)) continue;
      const relationship = input.relationships.find(
        (row) => row.person_id === personId,
      );
      out.push({
        kind: "SELF_DECLARATION",
        referenceKey: `selfdecl:${personId}:${year}`,
        dueDate: toIsoDate(new Date(Date.UTC(year, 0, 31))),
        title: `Autocertificazione compensi esterni ${year}`,
        description: `Manca l'autocertificazione dei compensi percepiti da altri committenti per il ${year}. Senza, il progressivo verso le soglie e solo quello che il club conosce.`,
        personId,
        relationshipId: relationship?.id ?? null,
        amount: null,
        period: String(year),
        source: "derived",
      });
    }
  }

  /* ------------------------------------------ Certificazione Unica */

  const cuByPersonYear = new Map<string, { personId: string; year: number; gross: number }>();

  for (const payout of input.payouts) {
    if (!isLivePayout(payout)) continue;
    const key = `${payout.person_id}:${payout.fiscal_year}`;
    const entry = cuByPersonYear.get(key) || {
      personId: payout.person_id,
      year: Number(payout.fiscal_year),
      gross: 0,
    };
    entry.gross = roundMoney(entry.gross + (Number(payout.gross_amount) || 0));
    cuByPersonYear.set(key, entry);
  }

  for (const entry of cuByPersonYear.values()) {
    out.push({
      kind: "CU_PREPARATION",
      referenceKey: `cu:${entry.personId}:${entry.year}`,
      dueDate: toIsoDate(cuDueDate(entry.year)),
      title: `Certificazione Unica ${entry.year}`,
      description: `Compensi erogati nell'anno: ${entry.gross.toFixed(2)} euro. EasyGame aggrega il dataset; la CU la predispone e la trasmette il consulente.`,
      personId: entry.personId,
      relationshipId: null,
      amount: entry.gross,
      period: String(entry.year),
      source: "derived",
    });
  }

  return out.sort((left, right) => left.dueDate.localeCompare(right.dueDate));
};

/* ------------------------------------------------------ F24 dataset */

export type F24Row = {
  period: string;
  causale: string;
  employeeContribution: number;
  employerContribution: number;
  total: number;
  dueDate: string;
  payoutCount: number;
  rulesVersion: string;
};

/**
 * I dati strutturati dell'F24 di un mese, per causale.
 *
 * **Non e un F24 e non lo diventa.** E la tabella che una segreteria copia o
 * esporta e consegna al consulente. EasyGame non e un intermediario fiscale
 * e la schermata lo dice.
 */
export const buildF24Dataset = (
  payouts: Array<
    ObligationPayout & {
      f24_causale?: string | null;
      rules_version?: string | null;
    }
  >,
): F24Row[] => {
  const grouped = new Map<string, F24Row>();

  for (const payout of payouts) {
    if (!isLivePayout(payout)) continue;
    const employee = Number(payout.employee_contribution) || 0;
    const employer = Number(payout.employer_contribution) || 0;
    if (employee <= 0 && employer <= 0) continue;

    const period = monthKeyOf(payout.paid_at);
    const causale = String(payout.f24_causale || "").trim() || "N/D";
    const key = `${period}:${causale}`;
    const rules = tryRulesFor(Number(period.slice(0, 4)));
    const row =
      grouped.get(key) ||
      ({
        period,
        causale,
        employeeContribution: 0,
        employerContribution: 0,
        total: 0,
        dueDate: toIsoDate(
          dayOfMonthAfter(period, rules?.contributionPaymentDay.value ?? 16),
        ),
        payoutCount: 0,
        rulesVersion: String(payout.rules_version || period.slice(0, 4)),
      } satisfies F24Row);

    row.employeeContribution = roundMoney(row.employeeContribution + employee);
    row.employerContribution = roundMoney(row.employerContribution + employer);
    row.total = roundMoney(row.employeeContribution + row.employerContribution);
    row.payoutCount += 1;
    grouped.set(key, row);
  }

  return Array.from(grouped.values()).sort(
    (left, right) =>
      left.period.localeCompare(right.period) ||
      left.causale.localeCompare(right.causale),
  );
};

/* ------------------------------------------------------- CU dataset */

export type CuRow = {
  personId: string;
  personName: string;
  fiscalCode: string | null;
  year: number;
  grossPaid: number;
  employeeContribution: number;
  employerContribution: number;
  taxableFiscal: number;
  externalDeclared: number;
  progressive: number;
  payoutCount: number;
  /** Vero se qualcosa manca per considerare il dato completo. */
  needsAttention: boolean;
  attentionReason: string | null;
};

/**
 * Il dataset annuale utile alla **CU**, per persona.
 *
 * Aggrega, non certifica. Nessuna trasmissione all'Agenzia delle Entrate e
 * nessun file telematico: quella e la riga che il modulo non attraversa.
 */
export const buildCuDataset = (input: {
  year: number;
  people: Array<{ id: string; name: string; fiscal_code?: string | null }>;
  payouts: Array<
    ObligationPayout & {
      taxable_fiscal?: number | null;
    }
  >;
  declarations: Array<{
    person_id: string;
    fiscal_year: number;
    external_amount: number;
    status?: string | null;
  }>;
}): CuRow[] => {
  const rows: CuRow[] = [];

  for (const person of input.people) {
    const payouts = input.payouts.filter(
      (payout) =>
        payout.person_id === person.id &&
        Number(payout.fiscal_year) === input.year &&
        isLivePayout(payout),
    );
    if (payouts.length === 0) continue;

    const declaration = input.declarations.find(
      (row) =>
        row.person_id === person.id &&
        Number(row.fiscal_year) === input.year &&
        String(row.status || "ACTIVE") === "ACTIVE",
    );

    const grossPaid = sumMoney(payouts.map((row) => Number(row.gross_amount) || 0));
    const externalDeclared = declaration
      ? roundMoney(Number(declaration.external_amount) || 0)
      : 0;
    const taxableFiscal = sumMoney(
      payouts.map((row) => Number(row.taxable_fiscal) || 0),
    );

    rows.push({
      personId: person.id,
      personName: person.name,
      fiscalCode: person.fiscal_code ?? null,
      year: input.year,
      grossPaid,
      employeeContribution: sumMoney(
        payouts.map((row) => Number(row.employee_contribution) || 0),
      ),
      employerContribution: sumMoney(
        payouts.map((row) => Number(row.employer_contribution) || 0),
      ),
      taxableFiscal,
      externalDeclared,
      progressive: roundMoney(grossPaid + externalDeclared),
      payoutCount: payouts.length,
      needsAttention: !declaration || taxableFiscal > 0,
      attentionReason: !declaration
        ? "Nessuna autocertificazione per l'anno: il progressivo e parziale."
        : taxableFiscal > 0
          ? "Soglia fiscale superata: la ritenuta non e stata determinata da EasyGame."
          : null,
    });
  }

  return rows.sort((left, right) => left.personName.localeCompare(right.personName));
};
