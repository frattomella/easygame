import { prisma } from "./prisma";
import { createAccountingEntry } from "./accounting";
import {
  audit,
  ensureOrganizationAccess,
  getRelationshipById,
  getSportWorkPersonById,
  resolveOrganizationId,
  type SportWorkScope,
} from "./sport-work";
import { recordSupportingOutbound } from "./sport-work-ledger";
import { SPORT_WORK_AUDIT_ACTIONS } from "@/lib/sport-work/audit-actions";
import {
  canTransitionReimbursement,
  monthKeyOf,
  normalizeBonusTreatment,
  normalizeExpenseCategory,
  normalizeObligationKind,
  normalizeObligationStatus,
  normalizeReimbursementStatus,
  roundMoney,
  startOfDay,
  sumMoney,
  toDateOrNull,
  toMoney,
} from "@/lib/sport-work/model";
import {
  buildCuDataset,
  buildF24Dataset,
  deriveObligations,
} from "@/lib/sport-work/obligations";

/**
 * Premi, rimborsi, fatture dei professionisti e **l'agenda degli
 * adempimenti**, piu i cruscotti che li leggono.
 *
 * Tre domini distinti stanno in un file solo perche condividono una
 * proprieta: **nessuno di loro e un compenso**. Un premio ha un trattamento
 * fiscale proprio e non validato; un rimborso non e reddito; una fattura la
 * calcola chi la emette. Tenerli separati dai compensi e la ragione per cui
 * il progressivo verso le soglie resta vero.
 *
 * Le uscite che generano passano dal registro (`sport-work-ledger.ts`) — il
 * denaro esce, e Movimenti lo deve vedere — ma non toccano la posizione
 * annua.
 */

const asText = (value: unknown) => String(value ?? "").trim();

const bonusClient = () => (prisma as any).sportWorkBonus;
const reimbursementClient = () => (prisma as any).sportWorkExpenseReimbursement;
const vatInvoiceClient = () => (prisma as any).sportWorkVatInvoice;
const obligationClient = () => (prisma as any).sportWorkObligation;
const relationshipClient = () => (prisma as any).sportWorkRelationship;
const ledgerClient = () => (prisma as any).sportWorkOutboundTransaction;
const installmentClient = () => (prisma as any).sportWorkInstallment;
const personClient = () => (prisma as any).sportWorkPerson;
const declarationClient = () => (prisma as any).sportWorkExternalDeclaration;

/* ================================================================ premi */

export const listBonuses = async (
  filter: { organizationId?: string | null; personId?: string | null },
  scope?: SportWorkScope,
) => {
  const organizationId = resolveOrganizationId(scope, filter.organizationId);
  return bonusClient().findMany({
    where: {
      organization_id: organizationId,
      ...(asText(filter.personId) ? { person_id: asText(filter.personId) } : {}),
    },
    orderBy: [{ award_date: "desc" }],
  });
};

export const getBonusById = async (bonusId: string, scope?: SportWorkScope) => {
  const row = await bonusClient().findUnique({ where: { id: asText(bonusId) } });
  if (!row) throw new Error("Premio non trovato");
  ensureOrganizationAccess(scope, row.organization_id);
  return row;
};

/**
 * Registra un premio.
 *
 * `fiscalTreatment` si **chiede**, non si deduce: la distinzione fra un premio
 * ex art. 36 c. 6-quater e una parte variabile della retribuzione la fa il
 * contratto, non l'etichetta, e cambia il regime dell'intera somma. Il valore
 * predefinito e «da verificare», che e la verita finche qualcuno non guarda
 * il contratto.
 */
export const createBonus = async (
  input: {
    personId: unknown;
    relationshipId?: unknown;
    reason: unknown;
    competition?: unknown;
    amount: unknown;
    awardDate?: unknown;
    fiscalTreatment?: unknown;
    notes?: unknown;
  },
  scope?: SportWorkScope,
) => {
  const person = await getSportWorkPersonById(asText(input.personId), scope);
  const amount = toMoney(input.amount);
  const reason = asText(input.reason);

  if (!reason) throw new Error("Il premio deve dichiarare la sua causale");
  if (amount <= 0) throw new Error("L'importo del premio deve essere maggiore di zero");

  if (asText(input.relationshipId)) {
    await getRelationshipById(asText(input.relationshipId), scope);
  }

  const created = await bonusClient().create({
    data: {
      organization_id: person.organization_id,
      person_id: person.id,
      relationship_id: asText(input.relationshipId) || null,
      reason,
      competition: asText(input.competition) || null,
      amount,
      currency: "EUR",
      award_date: toDateOrNull(input.awardDate) || new Date(),
      fiscal_treatment: normalizeBonusTreatment(input.fiscalTreatment),
      status: "SCHEDULED",
      paid_amount: 0,
      notes: asText(input.notes) || null,
      created_by: scope?.userId || null,
    },
  });

  await audit(
    scope,
    SPORT_WORK_AUDIT_ACTIONS.bonusCreated,
    person.organization_id,
    "sport_work_bonuses",
    created.id,
    { personId: person.id, amount, fiscalTreatment: created.fiscal_treatment },
  );

  return created;
};

export const payBonus = async (
  bonusId: string,
  input: {
    paidAt?: unknown;
    paymentMethod?: unknown;
    reference?: unknown;
    idempotencyKey?: unknown;
  } = {},
  scope?: SportWorkScope,
) => {
  const bonus = await getBonusById(bonusId, scope);

  if (bonus.status === "PAID") {
    throw new Error("Questo premio risulta gia erogato");
  }
  if (bonus.status === "CANCELLED") {
    throw new Error("Un premio annullato non si eroga");
  }

  const outcome = await (prisma as any).$transaction(async (client: any) => {
    const locked = await client.sportWorkBonus.findUnique({
      where: { id: bonus.id },
    });
    if (!locked || locked.status === "PAID") {
      throw new Error("Questo premio risulta gia erogato");
    }

    const transaction = await recordSupportingOutbound(
      {
        transactionType: "BONUS_PAYMENT",
        personId: locked.person_id,
        relationshipId: locked.relationship_id,
        bonusId: locked.id,
        amount: locked.amount,
        paidAt: input.paidAt,
        paymentMethod: input.paymentMethod,
        reference: input.reference,
        idempotencyKey: input.idempotencyKey,
        notes: `Premio: ${locked.reason}`,
      },
      scope,
      client,
    );

    const updated = await client.sportWorkBonus.update({
      where: { id: locked.id },
      data: {
        status: "PAID",
        paid_amount: locked.amount,
        payment_date: transaction.paid_at,
      },
    });

    return { bonus: updated, transaction };
  });

  await audit(
    scope,
    SPORT_WORK_AUDIT_ACTIONS.bonusPaid,
    bonus.organization_id,
    "sport_work_bonuses",
    bonus.id,
    {
      amount: bonus.amount,
      fiscalTreatment: bonus.fiscal_treatment,
      transactionId: outcome.transaction.id,
    },
  );

  return outcome;
};

/* ========================================================== rimborsi */

export const listReimbursements = async (
  filter: {
    organizationId?: string | null;
    personId?: string | null;
    status?: string | null;
  },
  scope?: SportWorkScope,
) => {
  const organizationId = resolveOrganizationId(scope, filter.organizationId);
  return reimbursementClient().findMany({
    where: {
      organization_id: organizationId,
      ...(asText(filter.personId) ? { person_id: asText(filter.personId) } : {}),
      ...(asText(filter.status)
        ? { status: normalizeReimbursementStatus(filter.status) }
        : {}),
    },
    orderBy: [{ expense_date: "desc" }],
  });
};

export const getReimbursementById = async (
  reimbursementId: string,
  scope?: SportWorkScope,
) => {
  const row = await reimbursementClient().findUnique({
    where: { id: asText(reimbursementId) },
  });
  if (!row) throw new Error("Rimborso non trovato");
  ensureOrganizationAccess(scope, row.organization_id);
  return row;
};

export const createReimbursement = async (
  input: {
    personId: unknown;
    relationshipId?: unknown;
    category?: unknown;
    description: unknown;
    expenseDate?: unknown;
    amount: unknown;
    notes?: unknown;
  },
  scope?: SportWorkScope,
) => {
  const person = await getSportWorkPersonById(asText(input.personId), scope);
  const amount = toMoney(input.amount);
  const description = asText(input.description);

  if (!description) throw new Error("Il rimborso deve dichiarare la sua causale");
  if (amount <= 0) throw new Error("L'importo del rimborso deve essere maggiore di zero");

  if (asText(input.relationshipId)) {
    await getRelationshipById(asText(input.relationshipId), scope);
  }

  return reimbursementClient().create({
    data: {
      organization_id: person.organization_id,
      person_id: person.id,
      relationship_id: asText(input.relationshipId) || null,
      category: normalizeExpenseCategory(input.category),
      description,
      expense_date: toDateOrNull(input.expenseDate) || new Date(),
      amount,
      currency: "EUR",
      status: "DRAFT",
      paid_amount: 0,
      notes: asText(input.notes) || null,
      created_by: scope?.userId || null,
    },
  });
};

/**
 * Fa avanzare un rimborso lungo il suo ciclo. Le transizioni sono dichiarate
 * e non libere: approvare un rimborso gia liquidato non e un errore di
 * battitura, e un secondo pagamento.
 */
export const transitionReimbursement = async (
  reimbursementId: string,
  nextStatus: string,
  options: { reason?: unknown } = {},
  scope?: SportWorkScope,
) => {
  const existing = await getReimbursementById(reimbursementId, scope);
  const from = normalizeReimbursementStatus(existing.status);
  const to = normalizeReimbursementStatus(nextStatus);

  if (from === to) return existing;

  if (to === "PAID") {
    throw new Error(
      "Un rimborso si porta a liquidato registrandone il pagamento, non cambiandone lo stato",
    );
  }

  if (!canTransitionReimbursement(from, to)) {
    throw new Error(`Transizione non ammessa: da ${from} a ${to}`);
  }

  const updated = await reimbursementClient().update({
    where: { id: existing.id },
    data: {
      status: to,
      ...(to === "APPROVED"
        ? { approved_by: scope?.userId || null, approved_at: new Date() }
        : {}),
      ...(to === "REJECTED" ? { rejected_reason: asText(options.reason) || null } : {}),
    },
  });

  if (to === "APPROVED") {
    await audit(
      scope,
      SPORT_WORK_AUDIT_ACTIONS.reimbursementApproved,
      existing.organization_id,
      "sport_work_expense_reimbursements",
      existing.id,
      { amount: existing.amount, category: existing.category },
    );
  }

  return updated;
};

export const payReimbursement = async (
  reimbursementId: string,
  input: {
    paidAt?: unknown;
    paymentMethod?: unknown;
    reference?: unknown;
    idempotencyKey?: unknown;
  } = {},
  scope?: SportWorkScope,
) => {
  const reimbursement = await getReimbursementById(reimbursementId, scope);

  if (reimbursement.status !== "APPROVED") {
    throw new Error(
      "Si liquida solo un rimborso approvato: l'approvazione e il momento in cui qualcuno se ne assume la responsabilita",
    );
  }

  const outcome = await (prisma as any).$transaction(async (client: any) => {
    const locked = await client.sportWorkExpenseReimbursement.findUnique({
      where: { id: reimbursement.id },
    });
    if (!locked || locked.status !== "APPROVED") {
      throw new Error("Questo rimborso risulta gia liquidato");
    }

    const transaction = await recordSupportingOutbound(
      {
        transactionType: "EXPENSE_REIMBURSEMENT",
        personId: locked.person_id,
        relationshipId: locked.relationship_id,
        reimbursementId: locked.id,
        amount: locked.amount,
        paidAt: input.paidAt,
        paymentMethod: input.paymentMethod,
        reference: input.reference,
        idempotencyKey: input.idempotencyKey,
        notes: `Rimborso: ${locked.description}`,
      },
      scope,
      client,
    );

    const updated = await client.sportWorkExpenseReimbursement.update({
      where: { id: locked.id },
      data: { status: "PAID", paid_amount: locked.amount },
    });

    return { reimbursement: updated, transaction };
  });

  await audit(
    scope,
    SPORT_WORK_AUDIT_ACTIONS.reimbursementPaid,
    reimbursement.organization_id,
    "sport_work_expense_reimbursements",
    reimbursement.id,
    { amount: reimbursement.amount, transactionId: outcome.transaction.id },
  );

  return outcome;
};

/* =================================================== fatture P.IVA */

export const listVatInvoices = async (
  filter: { organizationId?: string | null; personId?: string | null },
  scope?: SportWorkScope,
) => {
  const organizationId = resolveOrganizationId(scope, filter.organizationId);
  return vatInvoiceClient().findMany({
    where: {
      organization_id: organizationId,
      ...(asText(filter.personId) ? { person_id: asText(filter.personId) } : {}),
    },
    orderBy: [{ document_date: "desc" }],
  });
};

export const getVatInvoiceById = async (
  invoiceId: string,
  scope?: SportWorkScope,
) => {
  const row = await vatInvoiceClient().findUnique({
    where: { id: asText(invoiceId) },
  });
  if (!row) throw new Error("Fattura non trovata");
  ensureOrganizationAccess(scope, row.organization_id);
  return row;
};

/**
 * Registra una fattura ricevuta da un professionista con partita IVA.
 *
 * Gli importi si **trascrivono dal documento**, non si calcolano: imponibile,
 * IVA ed eventuale ritenuta li ha determinati chi ha emesso la fattura, e
 * ricalcolarli qui significherebbe che EasyGame ha un'opinione su una
 * dichiarazione altrui.
 */
export const createVatInvoice = async (
  input: {
    relationshipId: unknown;
    documentNumber: unknown;
    documentDate: unknown;
    taxableAmount?: unknown;
    vatAmount?: unknown;
    withholdingAmount?: unknown;
    totalAmount: unknown;
    dueDate?: unknown;
    attachmentId?: unknown;
    notes?: unknown;
  },
  scope?: SportWorkScope,
) => {
  const relationship = await getRelationshipById(asText(input.relationshipId), scope);

  if (relationship.relationship_type !== "SELF_EMPLOYED_VAT") {
    throw new Error(
      "Una fattura si registra solo su un rapporto con partita IVA: su una co.co.co. il compenso passa dal piano",
    );
  }

  const documentNumber = asText(input.documentNumber);
  const documentDate = toDateOrNull(input.documentDate);
  const total = toMoney(input.totalAmount);

  if (!documentNumber) throw new Error("Il numero del documento e obbligatorio");
  if (!documentDate) throw new Error("La data del documento e obbligatoria");
  if (total <= 0) throw new Error("Il totale della fattura deve essere maggiore di zero");

  return vatInvoiceClient().create({
    data: {
      organization_id: relationship.organization_id,
      person_id: relationship.person_id,
      relationship_id: relationship.id,
      document_number: documentNumber,
      document_date: documentDate,
      taxable_amount: toMoney(input.taxableAmount),
      vat_amount: toMoney(input.vatAmount),
      withholding_amount: toMoney(input.withholdingAmount),
      total_amount: total,
      currency: "EUR",
      due_date: toDateOrNull(input.dueDate),
      status: "PENDING",
      paid_amount: 0,
      attachment_id: asText(input.attachmentId) || null,
      notes: asText(input.notes) || null,
      created_by: scope?.userId || null,
    },
  });
};

export const payVatInvoice = async (
  invoiceId: string,
  input: {
    amount?: unknown;
    paidAt?: unknown;
    paymentMethod?: unknown;
    reference?: unknown;
    idempotencyKey?: unknown;
  } = {},
  scope?: SportWorkScope,
) => {
  const invoice = await getVatInvoiceById(invoiceId, scope);

  if (invoice.status === "CANCELLED") {
    throw new Error("Una fattura annullata non si paga");
  }

  const outcome = await (prisma as any).$transaction(async (client: any) => {
    const locked = await client.sportWorkVatInvoice.findUnique({
      where: { id: invoice.id },
    });
    if (!locked) throw new Error("Fattura non trovata");

    const residual = roundMoney(
      Math.max(0, Number(locked.total_amount) - Number(locked.paid_amount || 0)),
    );
    if (residual <= 0) {
      throw new Error("Questa fattura risulta gia pagata");
    }

    const amount =
      input.amount === undefined || input.amount === null || asText(input.amount) === ""
        ? residual
        : toMoney(input.amount);

    if (amount <= 0) throw new Error("L'importo deve essere maggiore di zero");
    if (amount > residual) {
      throw new Error(
        `L'importo supera il residuo della fattura (${residual.toFixed(2)} euro)`,
      );
    }

    const transaction = await recordSupportingOutbound(
      {
        transactionType: "VAT_INVOICE_PAYMENT",
        personId: locked.person_id,
        relationshipId: locked.relationship_id,
        vatInvoiceId: locked.id,
        amount,
        paidAt: input.paidAt,
        paymentMethod: input.paymentMethod,
        reference: asText(input.reference) || locked.document_number,
        idempotencyKey: input.idempotencyKey,
        notes: `Fattura ${locked.document_number}`,
      },
      scope,
      client,
    );

    const paid = roundMoney(Number(locked.paid_amount || 0) + amount);
    const updated = await client.sportWorkVatInvoice.update({
      where: { id: locked.id },
      data: {
        paid_amount: paid,
        status: paid >= Number(locked.total_amount) ? "PAID" : "PARTIALLY_PAID",
      },
    });

    return { invoice: updated, transaction };
  });

  await audit(
    scope,
    SPORT_WORK_AUDIT_ACTIONS.vatInvoicePaid,
    invoice.organization_id,
    "sport_work_vat_invoices",
    invoice.id,
    {
      documentNumber: invoice.document_number,
      transactionId: outcome.transaction.id,
    },
  );

  return outcome;
};

/* ======================================================= adempimenti */

export const listObligations = async (
  filter: {
    organizationId?: string | null;
    status?: string | null;
    kind?: string | null;
    dueBefore?: string | null;
  },
  scope?: SportWorkScope,
) => {
  const organizationId = resolveOrganizationId(scope, filter.organizationId);
  const dueBefore = toDateOrNull(filter.dueBefore);

  const righe = await obligationClient().findMany({
    where: {
      organization_id: organizationId,
      ...(asText(filter.status)
        ? { status: normalizeObligationStatus(filter.status) }
        : {}),
      ...(asText(filter.kind)
        ? { kind: normalizeObligationKind(filter.kind) }
        : {}),
      ...(dueBefore ? { due_date: { lte: dueBefore } } : {}),
    },
    orderBy: [{ due_date: "asc" }],
  });

  return marcaVersamentiStornati(organizationId, righe);
};

/**
 * **Un adempimento assolto il cui versamento e stato stornato lo dichiara.**
 *
 * ---
 *
 * Da quando l'idempotenza della prima nota vale sulle righe **vive**, la
 * correzione di un F24 sbagliato e possibile — si storna e si registra di
 * nuovo. Ma fra i due gesti esiste uno stato che una sonda di concorrenza ha
 * fotografato e che nessuna schermata sapeva raccontare: l'adempimento
 * `COMPLETED`, **zero** righe vive in prima nota, e il saldo che pareggia a
 * zero. I contributi sono usciti dal conto del club, l'agenda dice che
 * l'obbligo e assolto, e il registro non porta piu niente.
 *
 * Lo stato **non e sbagliato**: e la meta di una correzione, e dura quanto
 * serve a registrare l'importo giusto. Cio che era sbagliato e che non si
 * vedesse. `paymentReversed` lo dichiara, e la schermata puo dirlo invece di
 * mostrare una spunta verde su un buco.
 *
 * Non si cambia lo **stato** dell'adempimento, e non e prudenza: lo stato dice
 * cosa ha fatto la segreteria, e la segreteria l'adempimento lo ha assolto.
 * Riportarlo indietro riscriverebbe il suo gesto per raccontare un fatto di un
 * altro dominio.
 */
const marcaVersamentiStornati = async (
  organizationId: string,
  righe: readonly any[],
) => {
  const conVersamento = righe.filter(
    (riga) =>
      riga?.status === "COMPLETED" &&
      ADEMPIMENTI_CHE_PAGANO.has(String(riga.kind || "").toUpperCase()),
  );
  if (!conVersamento.length) return righe;

  const chiavi = conVersamento.map(
    (riga) => `sport_work_obligation:${riga.reference_key}`,
  );

  const vive = await (prisma as any).accountingEntry.findMany({
    where: {
      organization_id: organizationId,
      source_domain: "MANUAL",
      source_event_key: { in: chiavi },
      reversed_at: null,
    },
    select: { source_event_key: true },
  });

  const registrate = new Set(vive.map((riga: any) => riga.source_event_key));

  return righe.map((riga) => {
    if (!conVersamento.includes(riga)) return riga;
    const chiave = `sport_work_obligation:${riga.reference_key}`;
    return {
      ...riga,
      /*
        Vero solo quando l'adempimento **comporta** un versamento, e in prima
        nota non ne resta nessuno vivo. Un adempimento che non paga niente non
        porta questa bandiera, e non ha senso che la porti.
      */
      paymentReversed: !registrate.has(chiave),
    };
  });
};

/**
 * Riallinea l'agenda del club con cio che rapporti ed erogazioni richiedono.
 *
 * **Idempotente per costruzione.** Ogni adempimento derivato porta una
 * `reference_key` deterministica: la seconda esecuzione trova la riga e
 * aggiorna scadenza e descrizione invece di crearne una seconda. Senza questa
 * proprieta lo scheduler notturno produrrebbe, dopo una settimana, sette
 * promemoria identici per la stessa scadenza — e chi li riceve smette di
 * leggerli.
 *
 * Un adempimento gia assolto **non torna dovuto**: qualcuno lo ha fatto, e
 * riaprirlo perche il calcolo lo riderivano sarebbe cancellare quel fatto.
 */
export const syncObligations = async (
  organizationId: string,
  scope?: SportWorkScope,
  now = new Date(),
) => {
  ensureOrganizationAccess(scope, organizationId);

  const [relationships, payouts, declarations, people] = await Promise.all([
    relationshipClient().findMany({ where: { organization_id: organizationId } }),
    ledgerClient().findMany({ where: { organization_id: organizationId } }),
    declarationClient().findMany({ where: { organization_id: organizationId } }),
    personClient().findMany({ where: { organization_id: organizationId } }),
  ]);

  const nameById = new Map<string, string>(
    people.map((person: any) => [
      person.id,
      `${person.first_name} ${person.last_name}`.trim(),
    ]),
  );

  const derived = deriveObligations({
    relationships: relationships.map((row: any) => ({
      ...row,
      person_name: nameById.get(row.person_id) || null,
    })),
    payouts,
    declarations,
    now,
  });

  let created = 0;
  let updated = 0;

  for (const obligation of derived) {
    const existing = await obligationClient().findFirst({
      where: {
        organization_id: organizationId,
        reference_key: obligation.referenceKey,
      },
    });

    if (!existing) {
      await obligationClient().create({
        data: {
          organization_id: organizationId,
          kind: obligation.kind,
          reference_key: obligation.referenceKey,
          person_id: obligation.personId,
          relationship_id: obligation.relationshipId,
          title: obligation.title,
          description: obligation.description,
          due_date: new Date(obligation.dueDate),
          status: "DUE",
          amount: obligation.amount,
          period: obligation.period,
          source: "derived",
        },
      });
      created += 1;
      continue;
    }

    if (existing.status === "COMPLETED" || existing.status === "NOT_DUE") {
      continue;
    }

    const dueChanged =
      new Date(existing.due_date).toISOString().slice(0, 10) !== obligation.dueDate;
    const amountChanged =
      roundMoney(Number(existing.amount) || 0) !==
      roundMoney(Number(obligation.amount) || 0);

    if (dueChanged || amountChanged || existing.description !== obligation.description) {
      await obligationClient().update({
        where: { id: existing.id },
        data: {
          due_date: new Date(obligation.dueDate),
          amount: obligation.amount,
          title: obligation.title,
          description: obligation.description,
        },
      });
      updated += 1;
    }
  }

  /*
    Gli adempimenti derivati che non hanno piu ragione di esistere — la
    dichiarazione e arrivata, l'erogazione e stata stornata — passano a
    `NOT_DUE`. Non si cancellano: sono stati dovuti, e la loro storia serve a
    spiegare perche a un certo punto lo erano.
  */
  const derivedKeys = new Set(derived.map((row) => row.referenceKey));
  const stale = await obligationClient().findMany({
    where: {
      organization_id: organizationId,
      source: "derived",
      status: "DUE",
    },
  });

  let closed = 0;
  for (const row of stale) {
    if (derivedKeys.has(row.reference_key)) continue;
    await obligationClient().update({
      where: { id: row.id },
      data: { status: "NOT_DUE" },
    });
    closed += 1;
  }

  await audit(
    scope,
    SPORT_WORK_AUDIT_ACTIONS.obligationsSynced,
    organizationId,
    "sport_work_obligations",
    null,
    { created, updated, closed, derived: derived.length },
  );

  return { created, updated, closed, total: derived.length };
};

/**
 * I tipi di adempimento che **fanno uscire denaro dal club**.
 *
 * Sono gli unici per cui assolvere significa anche pagare qualcosa. Gli altri
 * — un contratto in scadenza, una CU da preparare — sono scadenze di
 * documenti, e non muovono un euro.
 */
const ADEMPIMENTI_CHE_PAGANO = new Set(["CONTRIBUTION", "F24"]);

/**
 * **Il versamento dei contributi lascia una riga di registro.**
 *
 * **Il buco che chiude.** Un adempimento assolto aggiornava solo il proprio
 * stato: il denaro dei contributi usciva dal club **senza lasciare traccia in
 * nessun registro**. Il costo del lavoro sportivo in prima nota risultava
 * quindi sistematicamente inferiore al vero, esattamente della parte
 * contributiva — che su un compenso non e una briciola.
 *
 * **Perche non una riga del registro delle uscite del lavoro sportivo.**
 * Perche quel registro e per persona: `person_id` e obbligatorio, e ogni riga
 * consuma o compensa le franchigie annue di **qualcuno**. Un F24 e pagato
 * all'erario, non a un lavoratore, e attribuirlo a una persona qualsiasi
 * falserebbe il suo progressivo — cioe il numero piu delicato di tutto il
 * dominio. I tipi `CONTRIBUTION_PAYMENT` ed `EXTERNAL_PAYROLL_COST` esistono
 * dichiarati in quel registro e nessun codice li produce: e questa la ragione.
 *
 * Il versamento e un **fatto di cassa** come l'affitto della palestra, e vive
 * dove vivono i fatti di cassa: in prima nota.
 *
 * **L'idempotenza.** `reference_key` e gia unica per club sull'adempimento, e
 * diventa la chiave dell'evento finanziario. Due clic sul pulsante «assolto»,
 * o due richieste simultanee, producono **una** riga: la seconda si infrange
 * sull'indice unico parziale, non su un controllo scritto come «leggi, poi
 * scrivi».
 *
 * **Cosa succede se non si dice conto e causale.** L'adempimento si chiude lo
 * stesso — non si blocca il lavoro della segreteria per un dato che puo
 * arrivare dopo — ma la risposta **lo dichiara**: `financialEntry` resta nullo
 * e `financialEntrySkipped` spiega perche. Un versamento silenziosamente non
 * registrato e un buco che nessuno vede, ed e il difetto che stiamo chiudendo.
 */
/**
 * **Idempotente non vuol dire silenzioso.**
 *
 * L'idempotenza dell'F24 impedisce che il denaro esca due volte, ed e giusta.
 * Ma la seconda chiamata restituiva la riga esistente **senza guardarne
 * l'importo**, e senza dire niente: l'audit lo ha provato in sequenza, senza
 * bisogno di nessuna corsa. Un adempimento assolto per 1.000, riassolto per
 * 9.999 perche la segreteria si era accorta dell'errore, lasciava nei libri
 * **1.000** e restituiva successo.
 *
 * E la stessa famiglia del buco che questa funzione esiste per chiudere: un
 * versamento silenziosamente **non** registrato e un versamento silenziosamente
 * registrato **per l'importo sbagliato** sono lo stesso difetto — un numero
 * che nessuno vede sbagliare.
 *
 * **Perche non si aggiorna la riga e basta.** Perche l'importo di un F24
 * cumulativo cambia quando cambiano i compensi del mese, e riscrivere in
 * silenzio un movimento gia registrato — magari gia riconciliato con
 * l'estratto conto — significherebbe far cambiare il passato senza un autore.
 * Qui si **dichiara la differenza**, e chi la legge decide: stornare il
 * movimento e registrarne uno nuovo e un gesto con un nome e una traccia.
 */
const confrontaImporto = (esistente: any, richiesto: number) => {
  const scritto = Number(esistente?.amount_cents) || 0;
  const atteso = Math.round(Number(richiesto) * 100);

  if (scritto === atteso) return { entry: esistente, skipped: null };

  return {
    entry: esistente,
    skipped:
      `Il versamento era gia registrato per ${(scritto / 100).toFixed(2)} EUR, e l'adempimento ora ne dichiara ` +
      `${(atteso / 100).toFixed(2)} EUR. La riga di prima nota **non** e stata modificata: ` +
      "per correggerla si storna il movimento e se ne registra uno nuovo, cosi la differenza resta leggibile.",
  };
};

const registraVersamento = async (
  obligation: any,
  payment: {
    financialAccountId?: unknown;
    operationTypeCode?: unknown;
    amount?: unknown;
    paidAt?: unknown;
    paymentMethod?: unknown;
    reference?: unknown;
  } | undefined,
  scope: SportWorkScope | undefined,
) => {
  if (!ADEMPIMENTI_CHE_PAGANO.has(String(obligation.kind || "").toUpperCase())) {
    return { entry: null, skipped: null };
  }

  const accountId = asText(payment?.financialAccountId);
  const code = asText(payment?.operationTypeCode);

  if (!accountId || !code) {
    return {
      entry: null,
      skipped:
        "Il versamento non e stato registrato in prima nota: mancano il conto e la causale. " +
        "Finche non vengono indicati, l'uscita dei contributi non compare fra le uscite del club.",
    };
  }

  const importo = payment?.amount ?? obligation.amount;
  if (importo === null || importo === undefined || Number(importo) <= 0) {
    return {
      entry: null,
      skipped:
        "Il versamento non e stato registrato in prima nota: l'adempimento non porta un importo.",
    };
  }

  const chiave = `sport_work_obligation:${obligation.reference_key}`;

  /*
    **`reversed_at: null`, e senza questo la correzione era impossibile.**

    Il messaggio di `confrontaImporto` dice a chi sbaglia l'importo: «storna il
    movimento e registrane uno nuovo». Ma la riga stornata conservava il suo
    `source_event_key`, e questo controllo la ritrovava: da quel momento
    l'adempimento non si assolveva piu, e l'importo corretto non entrava mai.
    La procedura consigliata era resa impossibile dal controllo che la
    consigliava.

    Una riga stornata non rappresenta piu niente — la coppia originale/storno
    somma zero, e il fatto e tornato non registrato. L'idempotenza vale fra le
    righe **vive**, e l'indice unico parziale lo dice adesso allo stesso modo
    (migrazione `20260830120000_wave4_idempotenza_viva`).
  */
  const gia = await (prisma as any).accountingEntry.findFirst({
    where: {
      organization_id: obligation.organization_id,
      source_domain: "MANUAL",
      source_event_key: chiave,
      reversed_at: null,
    },
  });
  if (gia) return confrontaImporto(gia, importo);

  try {
    const entry = await createAccountingEntry(
      {
        organizationId: obligation.organization_id,
        entryDate: payment?.paidAt || new Date(),
        direction: "OUT",
        amount: importo,
        financialAccountId: accountId,
        operationTypeCode: code,
        description: `Versamento - ${obligation.title}`,
        paymentMethod: asText(payment?.paymentMethod) || "F24",
        counterpartyKind: "ENTITY",
        counterpartyLabel: "Erario / Enti previdenziali",
        notes: asText(payment?.reference) || null,
      },
      {
        userId: scope?.userId,
        activeOrganizationId: obligation.organization_id,
        activeRole: (scope as any)?.activeRole,
        allowedOrganizationIds: scope?.allowedOrganizationIds || [
          obligation.organization_id,
        ],
      },
      { sourceEventKey: chiave },
    );
    return { entry, skipped: null };
  } catch (error: any) {
    /*
      Due richieste simultanee: la seconda si infrange sull'indice unico
      parziale. Non e un errore da propagare — l'adempimento **e** assolto e il
      versamento **e** registrato, da chi e arrivato primo.
    */
    if (String(error?.message || "").includes("Unique constraint")) {
      const esistente = await (prisma as any).accountingEntry.findFirst({
        where: {
          organization_id: obligation.organization_id,
          source_domain: "MANUAL",
          source_event_key: chiave,
          /* Vive, come sopra: l'indice unico che ci ha appena fermati e parziale. */
          reversed_at: null,
        },
      });
      if (esistente) return confrontaImporto(esistente, importo);
    }
    throw error;
  }
};

export const completeObligation = async (
  obligationId: string,
  input: {
    evidenceAttachmentId?: unknown;
    notes?: unknown;
    /**
     * Il versamento, quando l'adempimento ne comporta uno. Vedi
     * `registraVersamento`: senza conto e causale l'adempimento si chiude
     * comunque, e la risposta dice che il denaro non e stato registrato.
     */
    payment?: {
      financialAccountId?: unknown;
      operationTypeCode?: unknown;
      amount?: unknown;
      paidAt?: unknown;
      paymentMethod?: unknown;
      reference?: unknown;
    };
  } = {},
  scope?: SportWorkScope,
) => {
  const row = await obligationClient().findUnique({
    where: { id: asText(obligationId) },
  });
  if (!row) throw new Error("Adempimento non trovato");
  ensureOrganizationAccess(scope, row.organization_id);

  if (row.status === "COMPLETED") {
    /*
      Gia assolto, ma il versamento puo non essere ancora stato registrato:
      chiudere due volte non deve impedire di aggiungere il movimento che
      mancava.
    */
    const recupero = await registraVersamento(row, input.payment, scope);
    return {
      ...row,
      financialEntry: recupero.entry,
      financialEntrySkipped: recupero.skipped,
    };
  }

  const updated = await obligationClient().update({
    where: { id: row.id },
    data: {
      status: "COMPLETED",
      completed_by: scope?.userId || null,
      completed_at: new Date(),
      evidence_attachment_id: asText(input.evidenceAttachmentId) || null,
      notes: asText(input.notes) || row.notes,
    },
  });

  await audit(
    scope,
    SPORT_WORK_AUDIT_ACTIONS.obligationCompleted,
    row.organization_id,
    "sport_work_obligations",
    row.id,
    { kind: row.kind, referenceKey: row.reference_key, period: row.period },
  );

  const versamento = await registraVersamento(updated, input.payment, scope);

  return {
    ...updated,
    /** La riga di prima nota del versamento, quando e stata registrata. */
    financialEntry: versamento.entry,
    /** Il motivo per cui non lo e stata. Nullo quando il denaro ha lasciato una riga. */
    financialEntrySkipped: versamento.skipped,
  };
};

export const createManualObligation = async (
  input: {
    organizationId?: string | null;
    kind: unknown;
    title: unknown;
    description?: unknown;
    dueDate: unknown;
    personId?: unknown;
    relationshipId?: unknown;
    amount?: unknown;
    period?: unknown;
  },
  scope?: SportWorkScope,
) => {
  const organizationId = resolveOrganizationId(scope, input.organizationId);
  const dueDate = toDateOrNull(input.dueDate);
  const title = asText(input.title);

  if (!dueDate) throw new Error("La scadenza dell'adempimento e obbligatoria");
  if (!title) throw new Error("L'adempimento deve avere un titolo");

  if (asText(input.personId)) {
    await getSportWorkPersonById(asText(input.personId), scope);
  }

  const kind = normalizeObligationKind(input.kind);

  return obligationClient().create({
    data: {
      organization_id: organizationId,
      kind,
      reference_key: `manual:${kind}:${dueDate.toISOString().slice(0, 10)}:${title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .slice(0, 40)}`,
      person_id: asText(input.personId) || null,
      relationship_id: asText(input.relationshipId) || null,
      title,
      description: asText(input.description) || null,
      due_date: dueDate,
      status: "DUE",
      amount:
        input.amount === undefined || input.amount === null ? null : toMoney(input.amount),
      period: asText(input.period) || null,
      source: "manual",
    },
  });
};

/* ========================================================= cruscotto */

export type SportWorkDashboard = {
  organizationId: string;
  month: string;
  year: number;
  scheduledThisMonth: number;
  accruedThisMonth: number;
  paidThisMonth: number;
  clubCostThisMonth: number;
  toPayTotal: number;
  overdueTotal: number;
  overdueCount: number;
  activeRelationships: number;
  expiringContracts: number;
  missingDeclarations: number;
  upcomingObligations: number;
  overdueObligations: number;
  paidThisYear: number;
  employeeContributionThisYear: number;
  employerContributionThisYear: number;
  peopleOverSocialThreshold: number;
  peopleOverFiscalThreshold: number;
};

/**
 * I numeri del cruscotto «Lavoro sportivo».
 *
 * **Programmato, maturato e pagato restano tre colonne.** Un cruscotto che
 * mostrasse un numero solo costringerebbe chi legge a indovinare quale dei
 * tre sta guardando, ed e esattamente l'ambiguita che questo dominio esiste
 * per chiudere.
 */
export const getSportWorkDashboard = async (
  organizationId: string,
  scope?: SportWorkScope,
  now = new Date(),
): Promise<SportWorkDashboard> => {
  ensureOrganizationAccess(scope, organizationId);

  const today = startOfDay(now);
  const year = today.getUTCFullYear();
  const month = monthKeyOf(today);
  const monthStart = new Date(Date.UTC(year, today.getUTCMonth(), 1));
  const monthEnd = new Date(Date.UTC(year, today.getUTCMonth() + 1, 0));

  const [installments, payouts, relationships, obligations, positions] =
    await Promise.all([
      installmentClient().findMany({ where: { organization_id: organizationId } }),
      ledgerClient().findMany({ where: { organization_id: organizationId } }),
      relationshipClient().findMany({ where: { organization_id: organizationId } }),
      obligationClient().findMany({
        where: { organization_id: organizationId, status: "DUE" },
      }),
      (prisma as any).sportWorkYearPosition.findMany({
        where: { organization_id: organizationId, year },
      }),
    ]);

  const inMonth = (value: any) => {
    const date = toDateOrNull(value);
    if (!date) return false;
    return (
      date.getTime() >= monthStart.getTime() &&
      date.getTime() <= new Date(monthEnd.getTime() + 86399999).getTime()
    );
  };

  const liveInstallments = installments.filter(
    (row: any) => String(row.status) !== "CANCELLED",
  );

  const livePayouts = payouts.filter(
    (row: any) =>
      row.transaction_type === "COMPENSATION_PAYMENT" && !row.reversed_at,
  );

  const overdue = liveInstallments.filter((row: any) => {
    const due = toDateOrNull(row.due_date);
    return (
      due !== null &&
      startOfDay(due).getTime() < today.getTime() &&
      Number(row.remaining_amount) > 0
    );
  });

  return {
    organizationId,
    month,
    year,
    scheduledThisMonth: sumMoney(
      liveInstallments
        .filter((row: any) => inMonth(row.due_date))
        .map((row: any) => Number(row.gross_amount) || 0),
    ),
    accruedThisMonth: sumMoney(
      liveInstallments
        .filter((row: any) => inMonth(row.accrual_period_end))
        .map((row: any) => Number(row.accrued_amount) || 0),
    ),
    paidThisMonth: sumMoney(
      livePayouts
        .filter((row: any) => inMonth(row.paid_at))
        .map((row: any) => Number(row.gross_amount) || 0),
    ),
    clubCostThisMonth: sumMoney(
      livePayouts
        .filter((row: any) => inMonth(row.paid_at))
        .map((row: any) => Number(row.club_cost) || 0),
    ),
    toPayTotal: sumMoney(
      liveInstallments.map((row: any) => Number(row.remaining_amount) || 0),
    ),
    overdueTotal: sumMoney(
      overdue.map((row: any) => Number(row.remaining_amount) || 0),
    ),
    overdueCount: overdue.length,
    activeRelationships: relationships.filter(
      (row: any) => row.status === "ACTIVE",
    ).length,
    expiringContracts: obligations.filter(
      (row: any) => row.kind === "CONTRACT_EXPIRY",
    ).length,
    missingDeclarations: obligations.filter(
      (row: any) => row.kind === "SELF_DECLARATION",
    ).length,
    upcomingObligations: obligations.filter((row: any) => {
      const due = toDateOrNull(row.due_date);
      return due !== null && startOfDay(due).getTime() >= today.getTime();
    }).length,
    overdueObligations: obligations.filter((row: any) => {
      const due = toDateOrNull(row.due_date);
      return due !== null && startOfDay(due).getTime() < today.getTime();
    }).length,
    paidThisYear: sumMoney(
      livePayouts
        .filter((row: any) => Number(row.fiscal_year) === year)
        .map((row: any) => Number(row.gross_amount) || 0),
    ),
    employeeContributionThisYear: sumMoney(
      positions.map((row: any) => Number(row.employee_contribution) || 0),
    ),
    employerContributionThisYear: sumMoney(
      positions.map((row: any) => Number(row.employer_contribution) || 0),
    ),
    peopleOverSocialThreshold: positions.filter(
      (row: any) => Number(row.social_taxable) > 0,
    ).length,
    peopleOverFiscalThreshold: positions.filter(
      (row: any) => Number(row.fiscal_taxable) > 0,
    ).length,
  };
};

/* ========================================================== dataset */

export const getF24Dataset = async (
  organizationId: string,
  fiscalYear: number,
  scope?: SportWorkScope,
) => {
  ensureOrganizationAccess(scope, organizationId);
  const payouts = await ledgerClient().findMany({
    where: { organization_id: organizationId, fiscal_year: Number(fiscalYear) },
  });
  return buildF24Dataset(payouts);
};

export const getCuDataset = async (
  organizationId: string,
  fiscalYear: number,
  scope?: SportWorkScope,
) => {
  ensureOrganizationAccess(scope, organizationId);

  const [people, payouts, declarations] = await Promise.all([
    personClient().findMany({ where: { organization_id: organizationId } }),
    ledgerClient().findMany({
      where: { organization_id: organizationId, fiscal_year: Number(fiscalYear) },
    }),
    declarationClient().findMany({
      where: {
        organization_id: organizationId,
        fiscal_year: Number(fiscalYear),
        status: "ACTIVE",
      },
    }),
  ]);

  return buildCuDataset({
    year: Number(fiscalYear),
    people: people.map((person: any) => ({
      id: person.id,
      name: `${person.first_name} ${person.last_name}`.trim(),
      fiscal_code: person.fiscal_code,
    })),
    payouts,
    declarations,
  });
};
