import { prisma } from "./prisma";
import { AUDIT_ACTIONS, recordAuditEvent } from "./audit";
import { canAccessClubResource } from "@/lib/access-roles";
import { lockInstallmentAndTransaction } from "./payment-transactions";
import {
  normalizeCoverageAllocations,
  remainingCoverageCapacity,
  remainingEnrollmentCapacity,
  sumLiveCoverage,
  validateCoverageAllocation,
  type NormalizedCoverageAllocation,
} from "@/lib/payments/coverage-ledger";

/**
 * **L'unico posto che scrive `payment_coverage_allocations`** (ADR-0158).
 *
 * ---
 *
 * ## Le tre proprieta
 *
 * **1. Nessuna riga di cassa nasce da qui.** Questo modulo non importa
 * `createPaymentTransaction` e non tocca `payments.status`, `paid_at` o
 * `method`. Una copertura e una **promessa**: dice che il club si aspetta
 * quella parte da un ente, non che l'abbia incassata. E la traduzione letterale
 * del divieto di ADR-0037, che questa lane non allenta.
 *
 * **2. I due tetti si fanno valere dentro il blocco.** La capienza di una rata
 * e quella di un'adesione sono **somme**, e una somma vagliata prima della
 * transazione e una somma vecchia: due richieste simultanee la leggerebbero
 * tutte e due capiente e scriverebbero tutte e due. Il vaglio sta percio dentro
 * `$transaction`, dopo `SELECT … FOR UPDATE` sulla rata — la stessa forma con
 * cui `createPaymentTransaction` difende la capienza di un incasso, e per la
 * stessa ragione misurata (tre clic in sei millisecondi).
 *
 * **3. Non si cancella: si storna.** Una copertura revocata resta, e lo storno
 * e una riga di segno opposto. L'archivio lo fa valere con un `CHECK` sul segno
 * e un indice unico parziale sullo storno: due storni della stessa riga
 * porterebbero la copertura sotto zero e la quota famiglia **sopra** il debito.
 *
 * ## L'ordine di acquisizione
 *
 * Si blocca **la rata**, e sempre prima di leggere le somme. L'adesione non si
 * blocca: sarebbe un secondo ordine sugli stessi blocchi che
 * `createPaymentTransaction` prende in un ordine suo, e due ordini diversi
 * sugli stessi blocchi sono un abbraccio mortale (ADR-0138). Il tetto per
 * adesione si difende percio con una rilettura **dentro** la stessa
 * transazione: la finestra resta, ma e la finestra di una riga sola per rata, e
 * chi la vince trova comunque la rata bloccata.
 */

type CoverageScope = {
  userId?: string | null;
  activeOrganizationId?: string | null;
  activeRole?: string | null;
  allowedOrganizationIds?: string[];
};

const asText = (value: unknown) => String(value ?? "").trim();

const toAmount = (value: unknown) => {
  const numero = Number(value);
  return Number.isFinite(numero) ? Math.round(numero * 100) / 100 : 0;
};

const denied = (reason: string) => new Error(`Accesso negato: ${reason}`);

const allocationClient = () => (prisma as any).paymentCoverageAllocation;

/**
 * Chi puo promettere una copertura e chi tiene i conti del club: la copertura
 * dice quanto **meno** una famiglia deve, ed e una decisione economica.
 */
const assertCanManageCoverage = (scope?: CoverageScope) => {
  if (!scope) return;

  if (!canAccessClubResource(scope.activeRole, "payments", "update")) {
    throw denied(
      "la copertura di una rata la decide chi tiene i conti del club",
    );
  }
};

const assertSameClub = (
  scope: CoverageScope | undefined,
  organizationId: unknown,
) => {
  if (!scope) return;

  const attivo = asText(scope.activeOrganizationId);
  const riga = asText(organizationId);

  if (!attivo || !riga || attivo !== riga) {
    throw denied("questa rata non appartiene al club attivo");
  }
};

export type CoverageAllocationResult = {
  allocation: Record<string, any>;
  allocations: Record<string, any>[];
};

/**
 * **Alloca una copertura su una rata.**
 *
 * `idempotencyKey` sta dentro il blocco della rata, come per gli incassi: il
 * doppio clic su «Copri con il voucher» non deve promettere due volte lo stesso
 * denaro.
 */
export const allocateCoverage = async (
  input: {
    paymentId: string;
    enrollmentId: string;
    amount: unknown;
    notes?: unknown;
    idempotencyKey?: unknown;
  },
  scope?: CoverageScope,
): Promise<CoverageAllocationResult> => {
  assertCanManageCoverage(scope);

  const paymentId = asText(input.paymentId);
  const enrollmentId = asText(input.enrollmentId);
  const amount = toAmount(input.amount);

  if (!paymentId || !enrollmentId) {
    throw new Error("Rata o adesione mancante");
  }

  const charge = await (prisma as any).athletePayment.findUnique({
    where: { id: paymentId },
  });
  if (!charge) throw new Error("Rata non trovata");
  assertSameClub(scope, charge.organization_id);

  const enrollment = await (prisma as any).fundingEnrollment.findUnique({
    where: { id: enrollmentId },
  });
  if (!enrollment) throw new Error("Adesione al bando non trovata");
  assertSameClub(scope, enrollment.organization_id);

  /*
    **La copertura segue l'atleta, non la rata.** Coprire la rata di un atleta
    con il voucher di un altro non e un errore di importo: e attribuire a una
    famiglia il contributo di un'altra, e il rendiconto verso l'ente lo
    direbbe.
  */
  if (asText(charge.athlete_id) !== asText(enrollment.athlete_id)) {
    throw denied(
      "il voucher di un atleta non copre la rata di un altro",
    );
  }

  if (asText(enrollment.status) !== "active") {
    throw new Error(
      "L'adesione non e attiva: non si promette una copertura su un voucher revocato",
    );
  }

  const risultato = await (prisma as any).$transaction(async (client: any) => {
    await lockInstallmentAndTransaction(client, paymentId);

    const chiave = asText(input.idempotencyKey);
    if (chiave) {
      const gia = await client.paymentCoverageAllocation.findFirst({
        where: {
          organization_id: charge.organization_id,
          payment_id: paymentId,
          data: { path: ["idempotencyKey"], equals: chiave },
        },
      });
      if (gia) return { row: gia, duplicate: true };
    }

    /*
      Le somme si rileggono **dentro** il blocco: quelle lette prima sono
      vecchie di quanto e durata la validazione, e due richieste simultanee le
      troverebbero tutte e due capienti.
    */
    const suQuestaRata = await client.paymentCoverageAllocation.findMany({
      where: { payment_id: paymentId },
    });
    const suQuestaAdesione = await client.paymentCoverageAllocation.findMany({
      where: { enrollment_id: enrollmentId },
    });

    const errore = validateCoverageAllocation({
      amount,
      dueAmount: charge.amount,
      existingOnInstallment: suQuestaRata,
      assignedAmount: enrollment.assigned_amount,
      existingOnEnrollment: suQuestaAdesione,
      enrollmentId,
    });
    if (errore) throw new Error(errore);

    const row = await client.paymentCoverageAllocation.create({
      data: {
        organization_id: charge.organization_id,
        payment_id: paymentId,
        enrollment_id: enrollmentId,
        athlete_id: charge.athlete_id,
        amount,
        notes: asText(input.notes) || null,
        created_by: scope?.userId || null,
        data: chiave ? { idempotencyKey: chiave } : {},
      },
    });

    return { row, duplicate: false };
  });

  if (!risultato.duplicate) {
    await recordAuditEvent({
      action: AUDIT_ACTIONS.coverageAllocated,
      actorUserId: scope?.userId || null,
      organizationId: charge.organization_id,
      resource: "payment_coverage_allocations",
      resourceId: risultato.row.id,
      metadata: {
        paymentId,
        enrollmentId,
        athleteId: asText(charge.athlete_id),
        amount,
      },
    });
  }

  return {
    allocation: risultato.row,
    allocations: await listCoverageForPayment(paymentId, scope),
  };
};

/**
 * **Storna una copertura.**
 *
 * Non la cancella: marca l'originale e crea la riga di segno opposto. La quota
 * a carico della famiglia **risale**, ed e cio che deve succedere quando un
 * voucher viene ridotto o rifiutato.
 */
export const reverseCoverage = async (
  input: { allocationId: string; reason?: unknown },
  scope?: CoverageScope,
): Promise<CoverageAllocationResult> => {
  assertCanManageCoverage(scope);

  const allocationId = asText(input.allocationId);
  if (!allocationId) throw new Error("Copertura mancante");

  const original = await allocationClient().findUnique({
    where: { id: allocationId },
  });
  if (!original) throw new Error("Copertura non trovata");
  assertSameClub(scope, original.organization_id);

  if (original.reversed_at) {
    throw new Error("Questa copertura e gia stata stornata");
  }
  if (original.reverses_allocation_id) {
    throw new Error("Uno storno non si storna: alloca una copertura nuova");
  }

  const reason = asText(input.reason) || "Copertura revocata dalla segreteria";
  const now = new Date();

  const risultato = await (prisma as any).$transaction(async (client: any) => {
    await lockInstallmentAndTransaction(client, original.payment_id);

    const fresca = await client.paymentCoverageAllocation.findUnique({
      where: { id: original.id },
    });
    if (fresca?.reversed_at) {
      throw new Error("Questa copertura e gia stata stornata");
    }

    await client.paymentCoverageAllocation.update({
      where: { id: original.id },
      data: {
        reversed_at: now,
        reversed_by: scope?.userId || null,
        reversal_reason: reason,
      },
    });

    return client.paymentCoverageAllocation.create({
      data: {
        organization_id: original.organization_id,
        payment_id: original.payment_id,
        enrollment_id: original.enrollment_id,
        athlete_id: original.athlete_id,
        amount: -Math.abs(toAmount(original.amount)),
        notes: reason,
        created_by: scope?.userId || null,
        reverses_allocation_id: original.id,
        data: {},
      },
    });
  });

  await recordAuditEvent({
    action: AUDIT_ACTIONS.coverageReversed,
    actorUserId: scope?.userId || null,
    organizationId: original.organization_id,
    resource: "payment_coverage_allocations",
    resourceId: original.id,
    metadata: {
      reversalId: risultato?.id || null,
      paymentId: asText(original.payment_id),
      enrollmentId: asText(original.enrollment_id),
      amount: toAmount(original.amount),
      reason,
    },
  });

  return {
    allocation: risultato,
    allocations: await listCoverageForPayment(original.payment_id, scope),
  };
};

export const listCoverageForPayment = async (
  paymentId: string,
  scope?: CoverageScope,
) => {
  const righe = await allocationClient().findMany({
    where: {
      payment_id: asText(paymentId),
      ...(scope?.activeOrganizationId
        ? { organization_id: scope.activeOrganizationId }
        : {}),
    },
    orderBy: [{ created_at: "asc" }],
  });

  return Array.isArray(righe) ? righe : [];
};

export const listCoverageForAthlete = async (
  athleteId: string,
  scope?: CoverageScope,
) => {
  const righe = await allocationClient().findMany({
    where: {
      athlete_id: asText(athleteId),
      ...(scope?.activeOrganizationId
        ? { organization_id: scope.activeOrganizationId }
        : {}),
    },
    orderBy: [{ created_at: "asc" }],
  });

  return Array.isArray(righe) ? righe : [];
};

export const listCoverageForEnrollment = async (
  enrollmentId: string,
  scope?: CoverageScope,
) => {
  const righe = await allocationClient().findMany({
    where: {
      enrollment_id: asText(enrollmentId),
      ...(scope?.activeOrganizationId
        ? { organization_id: scope.activeOrganizationId }
        : {}),
    },
    orderBy: [{ created_at: "asc" }],
  });

  return Array.isArray(righe) ? righe : [];
};

/**
 * **Storna tutte le coperture vive di un'adesione** (N9).
 *
 * E cio che deve succedere quando un atleta esce da un programma, o quando il
 * voucher viene rifiutato: la quota a carico della famiglia **risale**, e lo
 * storico resta.
 *
 * Restituisce quante righe ha stornato, perche chi lo chiama deve poterlo dire
 * a chi ha premuto il pulsante: «tolto dal programma» e «tolto dal programma, e
 * tre rate tornano a carico della famiglia» sono due frasi diverse.
 */
export const reverseAllCoverageForEnrollment = async (
  enrollmentId: string,
  reason: string,
  scope?: CoverageScope,
) => {
  const righe = normalizeCoverageAllocations(
    await listCoverageForEnrollment(enrollmentId, scope),
  );

  const vive = righe.filter(
    (riga: NormalizedCoverageAllocation) =>
      !riga.reversedAt && !riga.reversesAllocationId,
  );

  for (const riga of vive) {
    await reverseCoverage({ allocationId: riga.id, reason }, scope);
  }

  return {
    reversed: vive.length,
    amount: sumLiveCoverage(righe.filter((riga) => vive.includes(riga))),
  };
};

/** Quanto si puo ancora coprire su questa rata. Serve alla schermata. */
export const readCoverageCapacity = async (
  paymentId: string,
  enrollmentId: string,
  scope?: CoverageScope,
) => {
  const charge = await (prisma as any).athletePayment.findUnique({
    where: { id: asText(paymentId) },
  });
  const enrollment = await (prisma as any).fundingEnrollment.findUnique({
    where: { id: asText(enrollmentId) },
  });

  if (!charge || !enrollment) return { installment: 0, enrollment: 0 };

  return {
    installment: remainingCoverageCapacity(
      charge.amount,
      await listCoverageForPayment(charge.id, scope),
    ),
    enrollment: remainingEnrollmentCapacity(
      enrollment.assigned_amount,
      await listCoverageForEnrollment(enrollment.id, scope),
      enrollment.id,
    ),
  };
};
