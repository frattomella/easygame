import { prisma } from "./prisma";
import {
  audit,
  ensureOrganizationAccess,
  getRelationshipById,
  getSportWorkPersonById,
  recomputeYearPosition,
  type SportWorkScope,
} from "./sport-work";
import { SPORT_WORK_AUDIT_ACTIONS } from "@/lib/sport-work/audit-actions";
import {
  affectsAnnualPosition,
  deriveInstallmentStatus,
  fiscalYearOfPayment,
  installmentRemaining,
  normalizeBonusTreatment,
  normalizeExpenseCategory,
  normalizeRelationshipStatus,
  normalizeRelationshipType,
  normalizeSocialCoverage,
  relationshipAllowsPayout,
  toYearFilter,
  roundMoney,
  toDateOrNull,
  toMoney,
  type OutboundTransactionType,
} from "@/lib/sport-work/model";
import {
  buildPayoutFiscalSnapshot,
  computeCompensationPayout,
  netAmountLabel,
  type PayoutComputation,
} from "@/lib/sport-work/engine";
import { computeAnnualPosition, toEngineSnapshot } from "@/lib/sport-work/position";

/**
 * Il **registro in uscita**: l'unico punto in cui EasyGame fa uscire denaro
 * verso una persona che lavora per il club.
 *
 * Modulo separato da `sport-work.ts` per la stessa ragione per cui
 * `payment-transactions.ts` e separato da `resources.ts`: quando una sola
 * funzione al mondo scrive il denaro, la si puo leggere tutta e dire con
 * certezza cosa fa. Sparso in cinque file, non si puo.
 *
 * Cinque cose accadono qui e non possono accadere altrove.
 *
 * 1. **Niente si cancella.** Correggere significa stornare: nasce una riga di
 *    segno opposto, l'originale resta e viene marcata. Il database lo fa
 *    rispettare con un CHECK sul segno e un indice unico sullo storno.
 * 2. **Le scritture stanno in una transazione.** Registrare l'uscita,
 *    aggiornare la scadenza e ricalcolare la posizione annua sono
 *    un'operazione sola: a meta strada esisterebbe denaro uscito che non ha
 *    spostato nessun saldo.
 * 3. **La capienza si verifica dentro la transazione, dopo il blocco della
 *    riga.** Il difetto e gia stato visto sugli incassi: tre clic in sei
 *    millesimi di secondo, tre letture della stessa rata ancora vuota, tre
 *    scritture. Qui il blocco e sulla **persona** prima che sulla scadenza,
 *    perche la franchigia annua e per persona: due erogazioni su due rate
 *    diverse della stessa persona devono mettersi in fila, o consumano
 *    entrambe la stessa franchigia residua.
 * 4. **Il calcolo si congela.** Regole, soglie, aliquote e progressivi
 *    finiscono sulla riga. Una modifica normativa futura non riscrive la
 *    storia.
 * 5. **Erogare senza autocertificazione lascia una traccia con un nome.**
 *    Non e vietato — bloccare costringerebbe a pagare fuori dal gestionale,
 *    che e peggio — ma chi lo fa se ne assume la responsabilita per iscritto.
 */

const asText = (value: unknown) => String(value ?? "").trim();

const ledgerClient = () => (prisma as any).sportWorkOutboundTransaction;
const installmentClient = () => (prisma as any).sportWorkInstallment;

/**
 * Blocca cio su cui l'operazione sta per decidere, **sempre nello stesso
 * ordine**: prima la persona, poi la scadenza.
 *
 * L'ordine e fisso perche due ordini diversi sulle stesse due righe sono un
 * abbraccio mortale che si presenta solo sotto carico — cioe il giorno in cui
 * la segreteria liquida venti compensi di fila.
 */
export const lockPersonAndInstallment = async (
  client: any,
  personId: string,
  installmentId?: string | null,
) => {
  await client.$queryRaw`SELECT id FROM sport_work_people WHERE id = ${personId}::uuid FOR UPDATE`;
  if (installmentId) {
    await client.$queryRaw`SELECT id FROM sport_work_compensation_installments WHERE id = ${installmentId}::uuid FOR UPDATE`;
  }
};

/* ---------------------------------------------------------- lettura */

export type ListOutboundFilter = {
  organizationId?: string | null;
  personId?: string | null;
  relationshipId?: string | null;
  installmentId?: string | null;
  fiscalYear?: number | string | null;
  transactionType?: string | null;
};

export const listOutboundTransactions = async (
  filter: ListOutboundFilter,
  scope?: SportWorkScope,
) => {
  const organizationId =
    asText(filter.organizationId) || scope?.activeOrganizationId || "";
  ensureOrganizationAccess(scope, organizationId);

  const year = toYearFilter(filter.fiscalYear);

  return ledgerClient().findMany({
    where: {
      organization_id: organizationId,
      ...(asText(filter.personId) ? { person_id: asText(filter.personId) } : {}),
      ...(asText(filter.relationshipId)
        ? { relationship_id: asText(filter.relationshipId) }
        : {}),
      ...(asText(filter.installmentId)
        ? { installment_id: asText(filter.installmentId) }
        : {}),
      ...(year === null ? {} : { fiscal_year: year }),
      ...(asText(filter.transactionType)
        ? { transaction_type: asText(filter.transactionType).toUpperCase() }
        : {}),
    },
    orderBy: [{ paid_at: "asc" }, { created_at: "asc" }],
  });
};

export const getOutboundTransactionById = async (
  transactionId: string,
  scope?: SportWorkScope,
) => {
  const row = await ledgerClient().findUnique({
    where: { id: asText(transactionId) },
  });
  if (!row) throw new Error("Movimento non trovato");
  ensureOrganizationAccess(scope, row.organization_id);
  return row;
};

/* ------------------------------------------------------- la proposta */

export type PayoutProposal = {
  installmentId: string | null;
  relationshipId: string;
  personId: string;
  personName: string;
  relationshipType: string;
  installmentLabel: string | null;
  installmentGross: number | null;
  installmentPaid: number | null;
  /** Il residuo della scadenza: l'importo che l'interfaccia propone. */
  suggestedAmount: number;
  paidAt: string;
  computation: PayoutComputation;
  netLabel: string;
  /** Vero se serve una conferma esplicita prima di procedere. */
  requiresAcknowledgement: boolean;
  acknowledgementReasons: string[];
};

const loadPositionSnapshot = async (
  client: any,
  organizationId: string,
  personId: string,
  year: number,
) => {
  const payouts = await client.sportWorkOutboundTransaction.findMany({
    where: {
      organization_id: organizationId,
      person_id: personId,
      fiscal_year: year,
    },
  });
  const declaration = await client.sportWorkExternalDeclaration.findFirst({
    where: {
      organization_id: organizationId,
      person_id: personId,
      fiscal_year: year,
      status: "ACTIVE",
    },
    orderBy: [{ declaration_date: "desc" }],
  });

  return toEngineSnapshot(
    computeAnnualPosition({ year, payouts, declaration }),
  );
};

/**
 * La proposta di erogazione: cosa uscirebbe, quanto resterebbe al lavoratore,
 * quanto costerebbe al club, **e perche**.
 *
 * Non scrive niente. E la meta «proponi e spiega» del motore fiscale: la
 * decisione la prende una persona, guardando la motivazione.
 */
export const prepareCompensationPayout = async (
  input: {
    installmentId?: unknown;
    relationshipId?: unknown;
    amount?: unknown;
    paidAt?: unknown;
  },
  scope?: SportWorkScope,
): Promise<PayoutProposal> => {
  const installmentId = asText(input.installmentId);
  let installment: any = null;
  let relationshipId = asText(input.relationshipId);

  if (installmentId) {
    installment = await installmentClient().findUnique({
      where: { id: installmentId },
    });
    if (!installment) throw new Error("Scadenza non trovata");
    ensureOrganizationAccess(scope, installment.organization_id);
    relationshipId = installment.relationship_id;
  }

  if (!relationshipId) {
    throw new Error("Serve una scadenza o un rapporto per proporre un'erogazione");
  }

  const relationship = await getRelationshipById(relationshipId, scope);
  const person = await getSportWorkPersonById(relationship.person_id, scope);

  const paidAt = toDateOrNull(input.paidAt) || new Date();
  const year = fiscalYearOfPayment(paidAt);

  const residual = installment
    ? installmentRemaining(
        Number(installment.gross_amount) || 0,
        Number(installment.paid_amount) || 0,
      )
    : 0;

  const amount =
    input.amount === undefined || input.amount === null || asText(input.amount) === ""
      ? residual
      : toMoney(input.amount);

  if (amount <= 0) {
    throw new Error(
      installment
        ? "La scadenza non ha residuo da erogare"
        : "Indicare un importo da erogare",
    );
  }

  const positionSnapshot = await loadPositionSnapshot(
    prisma,
    relationship.organization_id,
    person.id,
    year,
  );

  const computation = computeCompensationPayout({
    grossAmount: amount,
    paidAt,
    relationshipType: normalizeRelationshipType(relationship.relationship_type),
    socialCoverage: normalizeSocialCoverage(person.social_coverage),
    position: positionSnapshot,
  });

  const acknowledgementReasons = computation.warnings
    .filter((warning) => warning.severity === "hard")
    .map((warning) => warning.message);

  return {
    installmentId: installment?.id ?? null,
    relationshipId: relationship.id,
    personId: person.id,
    personName: `${person.first_name} ${person.last_name}`.trim(),
    relationshipType: relationship.relationship_type,
    installmentLabel: installment?.label ?? null,
    installmentGross: installment ? Number(installment.gross_amount) : null,
    installmentPaid: installment ? Number(installment.paid_amount) : null,
    suggestedAmount: amount,
    paidAt: paidAt.toISOString(),
    computation,
    netLabel: netAmountLabel(computation),
    requiresAcknowledgement: acknowledgementReasons.length > 0,
    acknowledgementReasons,
  };
};

/* ------------------------------------------------------ registrazione */

export type RecordPayoutInput = {
  installmentId?: unknown;
  relationshipId?: unknown;
  amount?: unknown;
  paidAt?: unknown;
  paymentMethod?: unknown;
  reference?: unknown;
  bankAccountId?: unknown;
  notes?: unknown;
  /**
   * Consente di erogare piu del residuo della scadenza. Lo decide chi chiama,
   * non un default: sopra il residuo si sta pagando qualcosa che il piano non
   * prevede, e va detto.
   */
  allowOverpayment?: boolean;
  /**
   * Vero se chi eroga ha visto gli avvisi duri e ha scelto di procedere.
   * Senza, un'erogazione con autocertificazione mancante viene rifiutata.
   */
  acknowledgeWarnings?: boolean;
  /** La chiave del gesto: due invii dello stesso clic portano la stessa. */
  idempotencyKey?: unknown;
};

export type RecordPayoutResult = {
  transaction: any;
  installment: any | null;
  position: Awaited<ReturnType<typeof recomputeYearPosition>>;
  computation: PayoutComputation;
  /** Vero se questa richiesta era la ripetizione di un gesto gia registrato. */
  duplicate: boolean;
};

/**
 * Vero se l'errore e la violazione **di quel** vincolo unico.
 *
 * **Perche i nomi da cercare sono due.** Con un indice ordinario Prisma
 * riporta in `meta.target` i nomi delle colonne; con un **indice parziale** —
 * come `sport_work_outbound_gesto_unico`, che vale solo dove la chiave del
 * gesto esiste — riporta il nome dell'indice. Cercare solo le colonne faceva
 * cadere il riconoscimento proprio nel caso che l'indice esiste per servire:
 * il secondo invio dello stesso clic riceveva un errore 400 invece del
 * movimento gia registrato.
 *
 * Il difetto e stato trovato dal collaudo a runtime, non dai test: il doppio
 * di Prisma produce sempre i nomi delle colonne, perche non conosce gli
 * indici parziali.
 */
const isUniqueViolation = (error: any, ...names: string[]) => {
  if (error?.code !== "P2002") return false;
  if (names.length === 0) return true;

  const target: string[] = Array.isArray(error?.meta?.target)
    ? error.meta.target.map((entry: unknown) => String(entry))
    : [String(error?.meta?.target ?? "")];
  const message = String(error?.message || "");

  return names.some(
    (name) =>
      target.some((entry) => entry.includes(name) || name.includes(entry)) ||
      message.includes(name),
  );
};

/**
 * Registra un'erogazione di compenso e riallinea scadenza e posizione annua.
 */
export const recordCompensationPayout = async (
  input: RecordPayoutInput,
  scope?: SportWorkScope,
): Promise<RecordPayoutResult> => {
  const installmentId = asText(input.installmentId) || null;
  let relationshipId = asText(input.relationshipId) || null;

  let installmentPreview: any = null;
  if (installmentId) {
    installmentPreview = await installmentClient().findUnique({
      where: { id: installmentId },
    });
    if (!installmentPreview) throw new Error("Scadenza non trovata");
    ensureOrganizationAccess(scope, installmentPreview.organization_id);
    relationshipId = installmentPreview.relationship_id;
  }

  if (!relationshipId) {
    throw new Error("Serve una scadenza o un rapporto per registrare un'erogazione");
  }

  const relationship = await getRelationshipById(relationshipId, scope);
  const person = await getSportWorkPersonById(relationship.person_id, scope);
  const organizationId = relationship.organization_id;

  const status = normalizeRelationshipStatus(relationship.status);
  if (!relationshipAllowsPayout(status)) {
    throw new Error(
      status === "DRAFT"
        ? "Un rapporto in bozza non puo ricevere erogazioni: prima va attivato"
        : `Un rapporto in stato ${status} non puo ricevere erogazioni`,
    );
  }

  const paidAt = toDateOrNull(input.paidAt) || new Date();
  const year = fiscalYearOfPayment(paidAt);
  const idempotencyKey = asText(input.idempotencyKey) || null;

  if (idempotencyKey) {
    const already = await ledgerClient().findFirst({
      where: {
        organization_id: organizationId,
        idempotency_key: idempotencyKey,
      },
    });
    if (already) {
      return {
        transaction: already,
        installment: installmentId
          ? await installmentClient().findUnique({ where: { id: installmentId } })
          : null,
        position: await recomputeYearPosition(person.id, year, scope),
        computation: (already.fiscal_snapshot as any)?.computation ?? null,
        duplicate: true,
      };
    }
  }

  let computation!: PayoutComputation;
  let created: any;
  let updatedInstallment: any = null;

  try {
    const outcome = await (prisma as any).$transaction(async (client: any) => {
      await lockPersonAndInstallment(client, person.id, installmentId);

      let amount: number;
      let locked: any = null;

      if (installmentId) {
        locked = await client.sportWorkInstallment.findUnique({
          where: { id: installmentId },
        });
        if (!locked) throw new Error("Scadenza non trovata");
        ensureOrganizationAccess(scope, locked.organization_id);

        if (locked.cancelled) {
          throw new Error("Una scadenza annullata non si eroga");
        }

        const residual = installmentRemaining(
          Number(locked.gross_amount) || 0,
          Number(locked.paid_amount) || 0,
        );

        amount =
          input.amount === undefined ||
          input.amount === null ||
          asText(input.amount) === ""
            ? residual
            : toMoney(input.amount);

        if (amount <= 0) {
          throw new Error("L'importo da erogare deve essere maggiore di zero");
        }

        if (amount > residual && !input.allowOverpayment) {
          throw new Error(
            `L'importo supera il residuo della scadenza (${residual.toFixed(2)} euro)`,
          );
        }
      } else {
        amount = toMoney(input.amount);
        if (amount <= 0) {
          throw new Error("L'importo da erogare deve essere maggiore di zero");
        }
      }

      const positionSnapshot = await loadPositionSnapshot(
        client,
        organizationId,
        person.id,
        year,
      );

      computation = computeCompensationPayout({
        grossAmount: amount,
        paidAt,
        relationshipType: normalizeRelationshipType(relationship.relationship_type),
        socialCoverage: normalizeSocialCoverage(person.social_coverage),
        position: positionSnapshot,
      });

      const hardWarnings = computation.warnings.filter(
        (warning) => warning.severity === "hard",
      );

      if (hardWarnings.length > 0 && !input.acknowledgeWarnings) {
        throw new Error(
          `Erogazione non registrata: ${hardWarnings
            .map((warning) => warning.message)
            .join(" ")} Confermare esplicitamente per procedere.`,
        );
      }

      const snapshot = buildPayoutFiscalSnapshot(
        computation,
        positionSnapshot,
        new Date(),
      );

      const row = await client.sportWorkOutboundTransaction.create({
        data: {
          organization_id: organizationId,
          transaction_type: "COMPENSATION_PAYMENT" as OutboundTransactionType,
          person_id: person.id,
          relationship_id: relationship.id,
          installment_id: installmentId,
          paid_at: paidAt,
          fiscal_year: year,
          gross_amount: amount,
          currency: relationship.currency || "EUR",
          payment_method: asText(input.paymentMethod) || null,
          reference: asText(input.reference) || null,
          bank_account_id: asText(input.bankAccountId) || null,
          rules_version: computation.rulesVersion,
          social_rate: computation.socialRate,
          reduction_factor: computation.reductionFactor,
          taxable_social: computation.taxableSocialGross,
          social_franchise_used: computation.socialFranchiseUsed,
          employee_contribution: computation.employeeContribution,
          employer_contribution: computation.employerContribution,
          taxable_fiscal: computation.taxableFiscal,
          fiscal_franchise_used: computation.fiscalFranchiseUsed,
          withholding_amount: null,
          net_amount: computation.netSocial,
          club_cost: computation.clubCost,
          f24_causale: computation.snapshot.f24Causale,
          fiscal_treatment: computation.fiscalTreatment,
          definitive: computation.definitive,
          fiscal_snapshot: snapshot as never,
          idempotency_key: idempotencyKey,
          notes: asText(input.notes) || null,
          created_by: scope?.userId || null,
        },
      });

      let installmentAfter: any = null;
      if (installmentId && locked) {
        const paid = roundMoney((Number(locked.paid_amount) || 0) + amount);
        installmentAfter = await client.sportWorkInstallment.update({
          where: { id: installmentId },
          data: {
            paid_amount: paid,
            remaining_amount: installmentRemaining(
              Number(locked.gross_amount) || 0,
              paid,
            ),
            status: deriveInstallmentStatus({
              cancelled: Boolean(locked.cancelled),
              grossAmount: Number(locked.gross_amount) || 0,
              accruedAmount: Number(locked.accrued_amount) || 0,
              paidAmount: paid,
              dueDate: locked.due_date,
            }),
          },
        });
      }

      const position = await recomputeYearPosition(person.id, year, scope, client);

      return { row, installmentAfter, position };
    });

    created = outcome.row;
    updatedInstallment = outcome.installmentAfter;

    await audit(
      scope,
      SPORT_WORK_AUDIT_ACTIONS.compensationPaid,
      organizationId,
      "sport_work_outbound_transactions",
      created.id,
      {
        personId: person.id,
        relationshipId: relationship.id,
        installmentId,
        grossAmount: created.gross_amount,
        employeeContribution: created.employee_contribution,
        employerContribution: created.employer_contribution,
        clubCost: created.club_cost,
        fiscalYear: year,
        rulesVersion: created.rules_version,
        fiscalTreatment: created.fiscal_treatment,
        definitive: created.definitive,
      },
    );

    /*
      L'evento che vale piu di tutti gli altri. Non e un log tecnico: e la
      prova di chi ha deciso di erogare sapendo che il calcolo contributivo
      poteva essere incompleto, e quando.
    */
    if (
      computation.warnings.some(
        (warning) => warning.code === "MISSING_SELF_DECLARATION",
      )
    ) {
      await audit(
        scope,
        SPORT_WORK_AUDIT_ACTIONS.paymentWithoutCurrentDeclaration,
        organizationId,
        "sport_work_outbound_transactions",
        created.id,
        {
          personId: person.id,
          personName: `${person.first_name} ${person.last_name}`.trim(),
          relationshipId: relationship.id,
          fiscalYear: year,
          grossAmount: created.gross_amount,
          acknowledgedBy: scope?.userId || null,
        },
      );
    }

    return {
      transaction: created,
      installment: updatedInstallment,
      position: outcome.position,
      computation,
      duplicate: false,
    };
  } catch (error: any) {
    if (
      idempotencyKey &&
      isUniqueViolation(error, "idempotency_key", "sport_work_outbound_gesto_unico")
    ) {
      const existing = await ledgerClient().findFirst({
        where: {
          organization_id: organizationId,
          idempotency_key: idempotencyKey,
        },
      });
      if (existing) {
        return {
          transaction: existing,
          installment: installmentId
            ? await installmentClient().findUnique({ where: { id: installmentId } })
            : null,
          position: await recomputeYearPosition(person.id, year, scope),
          computation,
          duplicate: true,
        };
      }
    }
    throw error;
  }
};

/* --------------------------------------------------------- storno */

/**
 * Storna un'erogazione: nasce una riga di segno opposto, l'originale resta.
 *
 * **Perche non si cancella.** Perche la riga originale e la risposta alla
 * domanda «cosa e successo», e la risposta non e «niente». Chi guarda un
 * registro mesi dopo deve poter vedere che un'erogazione c'e stata e che e
 * stata annullata, con il motivo: cancellarla lascerebbe una scadenza che
 * torna scoperta senza che nulla spieghi perche.
 */
export const reverseCompensationPayout = async (
  transactionId: string,
  options: { reason?: unknown; idempotencyKey?: unknown } = {},
  scope?: SportWorkScope,
) => {
  const original = await getOutboundTransactionById(transactionId, scope);

  if (original.transaction_type === "COMPENSATION_REVERSAL") {
    throw new Error("Uno storno non si storna: si registra una nuova erogazione");
  }
  if (original.reversed_at) {
    throw new Error("Questa erogazione e gia stata stornata");
  }

  const reason = asText(options.reason);
  if (!reason) {
    throw new Error("Lo storno richiede un motivo");
  }

  const organizationId = original.organization_id;
  const year = Number(original.fiscal_year);

  const outcome = await (prisma as any).$transaction(async (client: any) => {
    await lockPersonAndInstallment(
      client,
      original.person_id,
      original.installment_id,
    );

    const locked = await client.sportWorkOutboundTransaction.findUnique({
      where: { id: original.id },
    });
    if (!locked) throw new Error("Movimento non trovato");
    if (locked.reversed_at) {
      throw new Error("Questa erogazione e gia stata stornata");
    }

    const reversal = await client.sportWorkOutboundTransaction.create({
      data: {
        organization_id: organizationId,
        transaction_type: "COMPENSATION_REVERSAL" as OutboundTransactionType,
        person_id: locked.person_id,
        relationship_id: locked.relationship_id,
        installment_id: locked.installment_id,
        paid_at: new Date(),
        fiscal_year: year,
        gross_amount: -Math.abs(Number(locked.gross_amount) || 0),
        currency: locked.currency,
        payment_method: locked.payment_method,
        reference: locked.reference,
        rules_version: locked.rules_version,
        social_rate: locked.social_rate,
        reduction_factor: locked.reduction_factor,
        taxable_social: -Math.abs(Number(locked.taxable_social) || 0),
        social_franchise_used: -Math.abs(Number(locked.social_franchise_used) || 0),
        employee_contribution: -Math.abs(Number(locked.employee_contribution) || 0),
        employer_contribution: -Math.abs(Number(locked.employer_contribution) || 0),
        taxable_fiscal: -Math.abs(Number(locked.taxable_fiscal) || 0),
        fiscal_franchise_used: -Math.abs(Number(locked.fiscal_franchise_used) || 0),
        net_amount: -Math.abs(Number(locked.net_amount) || 0),
        club_cost: -Math.abs(Number(locked.club_cost) || 0),
        f24_causale: locked.f24_causale,
        fiscal_treatment: locked.fiscal_treatment,
        definitive: locked.definitive,
        fiscal_snapshot: locked.fiscal_snapshot,
        reversal_of_id: locked.id,
        reversal_reason: reason,
        idempotency_key: asText(options.idempotencyKey) || null,
        created_by: scope?.userId || null,
      },
    });

    await client.sportWorkOutboundTransaction.update({
      where: { id: locked.id },
      data: { reversed_at: new Date(), reversal_reason: reason },
    });

    let installmentAfter: any = null;
    if (locked.installment_id) {
      const installment = await client.sportWorkInstallment.findUnique({
        where: { id: locked.installment_id },
      });
      if (installment) {
        const paid = roundMoney(
          Math.max(
            0,
            (Number(installment.paid_amount) || 0) -
              Math.abs(Number(locked.gross_amount) || 0),
          ),
        );
        installmentAfter = await client.sportWorkInstallment.update({
          where: { id: installment.id },
          data: {
            paid_amount: paid,
            remaining_amount: installmentRemaining(
              Number(installment.gross_amount) || 0,
              paid,
            ),
            status: deriveInstallmentStatus({
              cancelled: Boolean(installment.cancelled),
              grossAmount: Number(installment.gross_amount) || 0,
              accruedAmount: Number(installment.accrued_amount) || 0,
              paidAmount: paid,
              dueDate: installment.due_date,
            }),
          },
        });
      }
    }

    const position = await recomputeYearPosition(
      locked.person_id,
      year,
      scope,
      client,
    );

    return { reversal, installmentAfter, position };
  });

  await audit(
    scope,
    SPORT_WORK_AUDIT_ACTIONS.compensationReversed,
    organizationId,
    "sport_work_outbound_transactions",
    outcome.reversal.id,
    {
      reversalOf: original.id,
      personId: original.person_id,
      grossAmount: original.gross_amount,
      reason,
    },
  );

  return outcome;
};

/* ------------------------------------------ premi, rimborsi, fatture */

/**
 * Un'uscita che **non e un compenso**: premio, rimborso spese, fattura P.IVA,
 * costo di paghe esterne, versamento contributivo.
 *
 * Passa dallo stesso registro perche il denaro esce comunque e Movimenti deve
 * vederlo, ma **non tocca la posizione annua**: sommarlo al progressivo verso
 * le soglie dichiarerebbe superamenti che non ci sono.
 */
export const recordSupportingOutbound = async (
  input: {
    transactionType: OutboundTransactionType;
    personId: unknown;
    relationshipId?: unknown;
    bonusId?: unknown;
    reimbursementId?: unknown;
    vatInvoiceId?: unknown;
    amount: unknown;
    paidAt?: unknown;
    paymentMethod?: unknown;
    reference?: unknown;
    bankAccountId?: unknown;
    notes?: unknown;
    idempotencyKey?: unknown;
  },
  scope?: SportWorkScope,
  client: any = prisma,
) => {
  const person = await getSportWorkPersonById(asText(input.personId), scope);
  const amount = toMoney(input.amount);

  if (amount <= 0) {
    throw new Error("L'importo da erogare deve essere maggiore di zero");
  }
  if (affectsAnnualPosition(input.transactionType)) {
    throw new Error(
      "Un compenso non si registra da qui: passa da recordCompensationPayout, che calcola i contributi",
    );
  }

  const paidAt = toDateOrNull(input.paidAt) || new Date();

  return client.sportWorkOutboundTransaction.create({
    data: {
      organization_id: person.organization_id,
      transaction_type: input.transactionType,
      person_id: person.id,
      relationship_id: asText(input.relationshipId) || null,
      bonus_id: asText(input.bonusId) || null,
      reimbursement_id: asText(input.reimbursementId) || null,
      vat_invoice_id: asText(input.vatInvoiceId) || null,
      paid_at: paidAt,
      fiscal_year: fiscalYearOfPayment(paidAt),
      gross_amount: amount,
      currency: "EUR",
      payment_method: asText(input.paymentMethod) || null,
      reference: asText(input.reference) || null,
      bank_account_id: asText(input.bankAccountId) || null,
      rules_version: null,
      net_amount: amount,
      club_cost: amount,
      fiscal_treatment: "OUT_OF_SCOPE",
      definitive: true,
      idempotency_key: asText(input.idempotencyKey) || null,
      notes: asText(input.notes) || null,
      created_by: scope?.userId || null,
    },
  });
};

export { normalizeBonusTreatment, normalizeExpenseCategory };
