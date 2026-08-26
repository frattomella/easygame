/**
 * I **documenti fiscali**: ricevute e fatture. **Unico proprietario.**
 *
 * **Perche esce da `payment-transactions.ts`.** Perche un pagamento e un
 * documento sono due domini, e tenerli nello stesso file li faceva sembrare la
 * stessa cosa. Il registro incassi risponde a «quanto e arrivato»; questo
 * modulo risponde a «cosa si e emesso, per cosa, a chi». Un incasso puo non
 * produrre nessun documento, e un documento puo coprire piu incassi: sono
 * cardinalita diverse, e le cardinalita diverse non stanno in un file solo.
 *
 * **Le quattro regole che questo modulo rende vere.**
 *
 * 1. **Un incasso non diventa una fattura.** Il documento si sceglie, e la
 *    scelta la propone il motore fiscale a partire da profilo, tipo di
 *    operazione e configurazione (ADR-0052). Il valore predefinito e il piu
 *    conservativo.
 * 2. **Un documento emesso porta con se la sua fotografia.** Nome, indirizzo,
 *    codice fiscale e importi vengono congelati all'emissione. Se domani
 *    l'atleta trasloca, il documento gia consegnato non cambia.
 * 3. **Un documento emesso non si modifica.** Si annulla, o si rettifica con
 *    un documento nuovo che cita il precedente. Il numero non si riusa.
 * 4. **La numerazione appartiene a un club, a una serie e a un esercizio**
 *    (ADR-0044, estesa alle serie qui).
 */

import { prisma } from "./prisma";
import { allocateDocumentNumber } from "./document-numbering";
import {
  documentYearOf,
  type DocumentNumberKind,
} from "@/lib/documents/numbering";
import { resolveFiscalRecipient } from "@/lib/documents/fiscal-recipient";
import {
  buildDocumentSnapshot,
  immutableFieldsTouchedBy,
} from "@/lib/documents/document-snapshot";
import { toPaymentAmount } from "@/lib/payments/installment-ledger";
import {
  getFiscalProfile,
  getOperationType,
  resolveDefaultSeries,
} from "./fiscal-config";
import { decideDocument, resolveStampDuty } from "@/lib/fiscal/engine";
import {
  DEFAULT_OPERATION_TYPE_BY_ORIGIN,
  type NormalizedOperationType,
} from "@/lib/fiscal/operation-types";
import type { PaymentTransactionScope } from "./payment-transactions";
import { getPaymentTransactionById } from "./payment-transactions";

const asText = (value: unknown) => String(value ?? "").trim();

const receiptClient = () => (prisma as any).receipt;
const invoiceClient = () => (prisma as any).invoice;
const chargeClient = () => (prisma as any).athletePayment;

const denied = (message: string) => new Error(`Accesso negato: ${message}`);

/* --------------------------------------------------- il contesto fiscale */

type IssueContext = {
  organizationId: string;
  organizationName: string;
  transaction: Record<string, any>;
  charge: Record<string, any> | null;
  athlete: Record<string, any> | null;
  operationType: NormalizedOperationType | null;
  profile: Awaited<ReturnType<typeof getFiscalProfile>>;
};

/**
 * Tutto cio che serve per decidere ed emettere, caricato una volta.
 *
 * **Cinque letture, non una per campo.** Emettere un documento tocca cinque
 * tabelle e ognuna serve interamente: caricarle a domanda produrrebbe un
 * numero di query che cresce con quel che si mostra, che e il difetto che il
 * Blocco Finale C ha passato mesi a togliere dalle liste.
 */
const loadIssueContext = async (
  transactionId: string,
  scope: PaymentTransactionScope | undefined,
  operationTypeCode?: unknown,
): Promise<IssueContext> => {
  const transaction = await getPaymentTransactionById(transactionId, scope);
  const organizationId = String(transaction.organization_id);

  const [club, charge, athlete, profile] = await Promise.all([
    (prisma as any).club.findUnique({
      where: { id: organizationId },
      select: { name: true },
    }),
    transaction.payment_id
      ? chargeClient().findUnique({ where: { id: transaction.payment_id } })
      : Promise.resolve(null),
    transaction.athlete_id
      ? (prisma as any).athlete.findFirst({
          where: { id: transaction.athlete_id, organization_id: organizationId },
        })
      : Promise.resolve(null),
    getFiscalProfile(organizationId),
  ]);

  /*
    Il tipo di operazione: quello chiesto adesso, altrimenti quello registrato
    sull'incasso, altrimenti quello che il dominio propone. La terza opzione e
    una proposta e non una dichiarazione: `decideDocument` lo sa, e infatti
    marca la decisione come «da configurare».
  */
  const code =
    asText(operationTypeCode) ||
    asText(transaction.operation_type_code) ||
    DEFAULT_OPERATION_TYPE_BY_ORIGIN.athlete;

  const operationType = await getOperationType({ organizationId, code });

  return {
    organizationId,
    organizationName: asText(club?.name),
    transaction,
    charge,
    athlete,
    operationType,
    profile,
  };
};

/**
 * Cosa EasyGame propone di emettere per un incasso, e perche.
 *
 * Si legge **prima** di emettere: e cio che l'interfaccia mostra accanto ai
 * due pulsanti, cosi chi emette sceglie sapendo, invece di scoprire il motivo
 * da un errore.
 */
export const describeDocumentDecision = async (
  input: { transactionId: string; operationTypeCode?: unknown },
  scope?: PaymentTransactionScope,
) => {
  const context = await loadIssueContext(
    input.transactionId,
    scope,
    input.operationTypeCode,
  );
  const recipient = resolveFiscalRecipient(context.athlete);

  return {
    decision: decideDocument({
      profile: context.profile,
      operationType: context.operationType,
      recipient,
    }),
    recipient,
    operationType: context.operationType,
  };
};

/* ------------------------------------------------------------ emissione */

const assertIssuable = (transaction: Record<string, any>) => {
  if (transaction.reversed_at || transaction.reverses_transaction_id) {
    throw new Error(
      "Un incasso stornato non produce un documento: registra di nuovo l'incasso",
    );
  }

  if (toPaymentAmount(transaction.amount) <= 0) {
    /*
      Un rimborso e un movimento negativo. Il documento che gli corrisponde e
      una nota di credito, che si emette dal documento originale e non
      dall'incasso: emetterne una ricevuta produrrebbe un documento con importo
      negativo, che non e una ricevuta.
    */
    throw new Error(
      "Un rimborso non produce una ricevuta: si rettifica il documento originale",
    );
  }
};

const buildSnapshotFor = (
  context: IssueContext,
  input: { issueDate: Date; description: string; totalCents: number },
) => {
  const recipient = resolveFiscalRecipient(context.athlete);
  const stamp = resolveStampDuty({
    profile: context.profile,
    amountCents: input.totalCents,
    vatApplied: Boolean(context.operationType?.vatRate),
  });

  return buildDocumentSnapshot({
    profile: context.profile,
    organizationName: context.organizationName,
    recipient,
    issuedAt: input.issueDate,
    description: input.description,
    totalCents: input.totalCents,
    stampDutyCents: stamp.applies ? stamp.amountCents : 0,
    vatRate: context.operationType?.vatRate ?? null,
    vatNature: context.operationType?.vatNature ?? null,
    operationTypeCode: context.operationType?.code || null,
    operationTypeLabel: context.operationType?.label || null,
    transactionIds: [String(context.transaction.id)],
    installmentId: context.transaction.payment_id || null,
  });
};

export type IssueDocumentInput = {
  transactionId: string;
  description?: unknown;
  /** La serie. Assente = quella predefinita del club. */
  series?: unknown;
  operationTypeCode?: unknown;
};

/**
 * Emette la **ricevuta** di un incasso.
 *
 * **Per incasso e non per rata.** Una ricevuta attesta che del denaro e
 * arrivato: se il livello fosse la rata, una rata pagata in tre volte
 * produrrebbe una ricevuta sola e le altre due somme resterebbero senza
 * documento (ADR-0036).
 *
 * **Idempotente.** Chiederla due volte restituisce quella gia emessa invece di
 * consumare un numero: il vincolo di unicita su `transaction_id` lo garantisce
 * anche sotto concorrenza, il controllo qui evita il giro inutile.
 */
export const issueReceiptForTransaction = async (
  input: IssueDocumentInput,
  scope?: PaymentTransactionScope,
) => {
  const context = await loadIssueContext(
    input.transactionId,
    scope,
    input.operationTypeCode,
  );

  assertIssuable(context.transaction);

  const existing = await receiptClient().findUnique({
    where: { transaction_id: context.transaction.id },
  });

  if (existing) return existing;

  const issueDate = context.transaction.paid_at || new Date();
  const description =
    asText(input.description) ||
    `Ricevuta ${context.charge?.description || "incasso"}`.trim();

  const series =
    asText(input.series) ||
    (await resolveDefaultSeries({
      organizationId: context.organizationId,
      kind: "receipt",
    }));

  const allocation = await allocateDocumentNumber({
    organizationId: context.organizationId,
    kind: "receipt",
    series,
    year: documentYearOf(issueDate),
  });

  const amount = toPaymentAmount(context.transaction.amount);
  const snapshot = buildSnapshotFor(context, {
    issueDate: new Date(issueDate),
    description,
    totalCents: Math.round(amount * 100),
  });
  snapshot.issuedByUserId = scope?.userId || null;

  return receiptClient().create({
    data: {
      organization_id: context.organizationId,
      athlete_id: context.transaction.athlete_id,
      payment_id: context.transaction.payment_id,
      transaction_id: context.transaction.id,
      receipt_number: allocation.number,
      series: allocation.series,
      sequence: allocation.sequence,
      document_year: allocation.year,
      operation_type_code: context.operationType?.code || null,
      snapshot,
      issued_by: scope?.userId || null,
      issue_date: issueDate,
      amount,
      description,
      status: "issued",
      method: context.transaction.payment_method,
      data: {
        source: "payment_transaction",
        transactionId: context.transaction.id,
        issuedBy: scope?.userId || null,
      },
    },
  });
};

/**
 * Emette la **fattura** di un incasso.
 *
 * **Perche non basta un campo sulla ricevuta.** Una ricevuta attesta che del
 * denaro e arrivato; una fattura e un documento fiscale con un intestatario,
 * una posizione fiscale e una numerazione propria. I due registri sono
 * distinti e non si mescolano (ADR-0047).
 *
 * **Cosa impedisce l'emissione.** Il motore fiscale, non un elenco di campi
 * scritto qui: e li che stanno la classificazione dell'operazione e i dati
 * mancanti, ed e li che il messaggio sa dire se manca qualcosa all'emittente o
 * all'intestatario.
 */
export const issueInvoiceForTransaction = async (
  input: IssueDocumentInput,
  scope?: PaymentTransactionScope,
) => {
  const context = await loadIssueContext(
    input.transactionId,
    scope,
    input.operationTypeCode,
  );

  assertIssuable(context.transaction);

  const recipient = resolveFiscalRecipient(context.athlete);
  const decision = decideDocument({
    profile: context.profile,
    operationType: context.operationType,
    recipient,
  });

  if (!decision.allowed.includes("invoice")) {
    throw new Error(
      `Questa operazione non prevede una fattura: ${decision.reason}`,
    );
  }

  if (decision.blockers.length) {
    throw new Error(
      `Per emettere una fattura mancano: ${decision.blockers.join(", ")}. Completa i dati, oppure emetti una ricevuta.`,
    );
  }

  const existing = await invoiceClient().findFirst({
    where: {
      organization_id: context.organizationId,
      transaction_id: context.transaction.id,
    },
  });

  if (existing) return existing;

  const issueDate = context.transaction.paid_at || new Date();
  const series =
    asText(input.series) ||
    (await resolveDefaultSeries({
      organizationId: context.organizationId,
      kind: "invoice",
    }));

  const allocation = await allocateDocumentNumber({
    organizationId: context.organizationId,
    kind: "invoice",
    series,
    year: documentYearOf(issueDate),
  });

  const amount = toPaymentAmount(context.transaction.amount);
  const description =
    asText(input.description) ||
    `Quota ${context.charge?.description || "sportiva"}`.trim();

  const snapshot = buildSnapshotFor(context, {
    issueDate: new Date(issueDate),
    description,
    totalCents: Math.round(amount * 100),
  });
  snapshot.issuedByUserId = scope?.userId || null;

  return invoiceClient().create({
    data: {
      organization_id: context.organizationId,
      athlete_id: context.transaction.athlete_id,
      payment_id: context.transaction.payment_id,
      transaction_id: context.transaction.id,
      invoice_number: allocation.number,
      series: allocation.series,
      sequence: allocation.sequence,
      document_year: allocation.year,
      operation_type_code: context.operationType?.code || null,
      snapshot,
      issued_by: scope?.userId || null,
      issue_date: issueDate,
      amount,
      description,
      payment_method: context.transaction.payment_method,
      status: "issued",
      /*
        `is_electronic` resta falso. EasyGame produce il documento e prepara il
        tracciato; la trasmissione allo SdI richiede un intermediario
        accreditato che non esiste in questo repository. Dichiararlo
        elettronico senza un canale significherebbe far credere a una societa
        di aver adempiuto (ADR-0053).
      */
      is_electronic: false,
      recipient_code: recipient.recipientCode || null,
      vat_number: recipient.vatNumber || null,
      fiscal_code: recipient.fiscalCode || null,
      address: recipient.address || null,
      city: recipient.city || null,
      postal_code: recipient.postalCode || null,
      province: recipient.province || null,
      country: recipient.country || null,
      data: {
        source: "payment_transaction",
        transactionId: context.transaction.id,
        recipientName: recipient.name,
        recipientSource: recipient.source,
        issuedBy: scope?.userId || null,
      },
    },
  });
};

/* -------------------------------------------------- annullamento e rettifica */

export type CancelDocumentInput = {
  kind: DocumentNumberKind;
  documentId: string;
  reason: unknown;
};

/**
 * Annulla un documento emesso.
 *
 * **Non lo cancella e non ne libera il numero.** Un buco nella numerazione e
 * leggibile e spiegabile; lo stesso numero su due documenti no (ADR-0044). Il
 * documento resta, marcato, con il motivo e con chi l'ha annullato — che e
 * esattamente cio che serve a chi lo ritrovera fra due anni.
 */
export const cancelDocument = async (
  input: CancelDocumentInput,
  scope?: PaymentTransactionScope,
) => {
  const client = input.kind === "invoice" ? invoiceClient() : receiptClient();
  const documentId = asText(input.documentId);
  const reason = asText(input.reason);

  if (!reason) {
    throw new Error("Un annullamento senza motivo non si puo ricostruire dopo");
  }

  const document = await client.findUnique({ where: { id: documentId } });
  if (!document) throw new Error("Documento non trovato");

  if (scope && !scope.allowedOrganizationIds.includes(document.organization_id)) {
    throw denied("il documento appartiene a un altro club");
  }

  if (document.cancelled_at) {
    throw new Error("Questo documento e gia stato annullato");
  }

  return client.update({
    where: { id: documentId },
    data: {
      status: "cancelled",
      cancelled_at: new Date(),
      cancelled_by: scope?.userId || null,
      cancellation_reason: reason,
    },
  });
};

/**
 * Rifiuta una modifica che tocchi i dati fiscalmente rilevanti di un documento
 * emesso.
 *
 * **Perche una funzione e non un controllo dentro il CRUD.** Perche un
 * documento si aggiorna da piu punti — il CRUD generico, la rigenerazione del
 * PDF, l'annullamento — e la regola deve valere per tutti e tre. Il messaggio
 * dice **quale** campo: «documento non modificabile» manda al telefono, «il
 * numero e la data di un documento emesso non si cambiano» no.
 */
export const assertDocumentMutable = (
  current: Record<string, any>,
  updates: Record<string, any>,
) => {
  const isIssued =
    asText(current?.status) === "issued" || asText(current?.status) === "cancelled";
  if (!isIssued) return;

  const touched = immutableFieldsTouchedBy(updates, current);
  if (!touched.length) return;

  throw new Error(
    `Un documento emesso non si modifica: ${touched.join(", ")} appartengono al documento consegnato. Annullalo ed emetti una rettifica.`,
  );
};
