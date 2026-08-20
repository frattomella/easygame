import {
  buildAthletesById,
  firstClubEntityText,
  getClubEntityCategory,
  getClubEntityEmail,
  getClubEntityLabel,
  getClubEntityPhone,
  getClubEntityReference,
  getPaymentAthleteId,
  parseClubEntityData,
  resolveAthleteForPayment,
} from "@/lib/club-entity-directory";
import {
  getClubAthletes,
  getClubData,
  getClubStructures,
} from "@/lib/simplified-db";
import { supabase } from "@/lib/supabase";
import {
  isPaymentExcludedFromTotals,
  normalizePaymentAccountingStatus,
} from "@/lib/payments/payment-status-utils";

export type ClubMovementSource =
  | "athlete"
  | "procura"
  | "trainer"
  | "sponsor"
  | "member"
  | "staff"
  | "supplier"
  | "structure"
  | "transfer"
  | "invoice"
  | "receipt"
  | "manual"
  | "other";

export type ClubMovementDirection = "income" | "expense" | "transfer";

export type NormalizedClubMovement = {
  id: string;
  source: ClubMovementSource;
  direction: ClubMovementDirection;
  description: string;
  amount: number;
  status: "paid" | "pending" | "overdue" | "cancelled" | string;
  date?: string;
  dueDate?: string;
  paidAt?: string;
  subjectName?: string;
  subjectEmail?: string;
  subjectPhone?: string;
  subjectCategory?: string;
  category?: string;
  method?: string;
  reference?: string;
  bankAccountId?: string;
  bankAccountName?: string;
  originEntityType?:
    | "athlete"
    | "procura"
    | "trainer"
    | "staff"
    | "member"
    | "sponsor"
    | "supplier"
    | "structure"
    | "club"
    | "external"
    | "other";
  originEntityId?: string;
  originEntityName?: string;
  paymentId?: string;
  invoiceId?: string;
  receiptId?: string;
  invoiceNumber?: string;
  receiptNumber?: string;
  invoiceDate?: string;
  receiptDate?: string;
  sourceTable?: string;
  sourcePath?: string;
  linkedEntity?: {
    id?: string;
    type?: string;
    name?: string;
    email?: string;
    phone?: string;
    category?: string;
    reference?: string;
  };
  canEdit?: boolean;
  canDelete?: boolean;
  canInvoice?: boolean;
  canReceipt?: boolean;
  raw?: unknown;
};

export type ClubFinancialSources = {
  transactions?: any[];
  expectedIncome?: any[];
  expectedExpenses?: any[];
  transfers?: any[];
  payments?: any[];
  simplifiedPayments?: any[];
  trainerPayments?: any[];
  sponsorPayments?: any[];
  supplierPayments?: any[];
  athletes?: any[];
  procure?: any[];
  sponsors?: any[];
  members?: any[];
  staffMembers?: any[];
  trainers?: any[];
  suppliers?: any[];
  structures?: any[];
  invoices?: any[];
  receipts?: any[];
  bankAccounts?: any[];
  paymentMethods?: any[];
};

export type ClubFinancialSummary = {
  totalIncome: number;
  totalExpense: number;
  balance: number;
  totalPendingIncome: number;
  totalPendingExpense: number;
  paidCount: number;
  pendingCount: number;
};

const asArray = (value: unknown): any[] => (Array.isArray(value) ? value : []);

const toNumber = (value: unknown) => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  const parsed = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
};

const normalizeStatus = (value: unknown) => {
  const status = String(value || "").trim().toLowerCase();
  if (
    ["paid", "completed", "complete", "saldato", "pagato", "issued"].includes(
      status,
    )
  ) {
    return "paid";
  }
  if (
    ["cancelled", "canceled", "voided", "deleted", "annullato", "annullata"].includes(
      status,
    )
  ) {
    return "cancelled";
  }
  if (["overdue", "scaduto", "scaduta"].includes(status)) {
    return "overdue";
  }
  return status || "pending";
};

const firstString = (...values: unknown[]) => {
  for (const value of values) {
    const normalized = String(value || "").trim();
    if (normalized) {
      return normalized;
    }
  }
  return "";
};

const parseDataObject = (item: any) => {
  if (!item?.data) {
    return {};
  }

  if (typeof item.data === "object") {
    return item.data;
  }

  try {
    return JSON.parse(item.data);
  } catch {
    return {};
  }
};

const entityEmail = (item: any) => {
  const data = parseDataObject(item);
  return firstString(
    item?.email,
    item?.subjectEmail,
    item?.athlete_email,
    item?.trainer_email,
    item?.member_email,
    item?.staff_email,
    item?.sponsor_email,
    item?.supplier_email,
    item?.procura_email,
    item?.parent_email,
    item?.parentEmail,
    data?.email,
    data?.parentEmail,
    data?.parent_email,
  );
};

const entityPhone = (item: any) => {
  const data = parseDataObject(item);
  return firstString(
    item?.phone,
    item?.subjectPhone,
    item?.athlete_phone,
    item?.trainer_phone,
    item?.member_phone,
    item?.staff_phone,
    item?.sponsor_phone,
    item?.supplier_phone,
    item?.procura_phone,
    item?.parent_phone,
    item?.parentPhone,
    data?.phone,
    data?.parentPhone,
    data?.parent_phone,
  );
};

const buildId = (
  prefix: ClubMovementSource | "expected",
  item: any,
  index: number,
) =>
  firstString(
    item?.id,
    item?.payment_id,
    item?.paymentId,
    item?.reference,
    `${prefix}-${index}`,
  );

const inferDirection = (
  item: any,
  fallback: ClubMovementDirection,
): ClubMovementDirection => {
  const type = String(item?.type || item?.direction || "").toLowerCase();
  if (["expense", "uscita", "out"].includes(type)) {
    return "expense";
  }
  if (["income", "entrata", "in"].includes(type)) {
    return "income";
  }
  if (["transfer", "giroconto"].includes(type)) {
    return "transfer";
  }
  return fallback;
};

const paymentIdFor = (item: any) =>
  firstString(item?.paymentId, item?.payment_id, item?.id);

const invoiceNumberFor = (invoice: any) =>
  firstString(invoice?.invoice_number, invoice?.invoiceNumber, invoice?.number);

const receiptNumberFor = (receipt: any) =>
  firstString(receipt?.receipt_number, receipt?.receiptNumber, receipt?.number);

const bankAccountIdFor = (item: any) =>
  firstString(
    item?.bankAccountId,
    item?.bank_account_id,
    item?.accountId,
    item?.account_id,
  );

const movementKey = (movement: NormalizedClubMovement) => {
  const raw = (movement.raw || {}) as any;
  const rawData = parseClubEntityData(raw);
  const stablePaymentId = firstClubEntityText(
    raw?.id,
    raw?.payment_id,
    raw?.paymentId,
    movement.paymentId,
  );

  if (movement.source === "athlete") {
    return [
      "athlete",
      stablePaymentId ||
        firstClubEntityText(
          movement.originEntityId,
          raw?.athlete_id,
          raw?.athleteId,
          rawData?.athlete_id,
          rawData?.athleteId,
          movement.subjectName,
        ),
      movement.amount,
      movement.dueDate || movement.date || movement.paidAt || "",
      movement.description || "",
    ].join("|");
  }

  return [
    movement.source,
    stablePaymentId || movement.id,
    movement.amount,
    movement.paidAt || movement.date || movement.dueDate || "",
  ].join("|");
};

const paymentSubject = (item: any, fallback?: string) => {
  const data = parseDataObject(item);
  return firstString(
    item?.subjectName,
    item?.athlete_name,
    item?.trainer_name,
    item?.member_name,
    item?.staff_name,
    item?.sponsor_name,
    item?.supplier_name,
    item?.procura_name,
    item?.structure_name,
    item?.name,
    data?.athlete_name,
    data?.trainer_name,
    data?.member_name,
    data?.staff_name,
    data?.sponsor_name,
    data?.supplier_name,
    data?.procura_name,
    data?.subjectName,
    fallback,
  );
};

const originTypeForSource = (
  source: ClubMovementSource,
): NormalizedClubMovement["originEntityType"] => {
  if (
    [
      "athlete",
      "procura",
      "trainer",
      "staff",
      "member",
      "sponsor",
      "supplier",
      "structure",
    ].includes(source)
  ) {
    return source as NormalizedClubMovement["originEntityType"];
  }

  if (source === "manual" || source === "transfer") {
    return "club";
  }

  return "other";
};

const sourceLabel = (source: ClubMovementSource) => {
  const labels: Record<ClubMovementSource, string> = {
    athlete: "Atleta",
    procura: "Procura",
    trainer: "Allenatore",
    sponsor: "Sponsor",
    member: "Socio",
    staff: "Staff",
    supplier: "Fornitore",
    structure: "Struttura",
    transfer: "Giroconto",
    invoice: "Fattura",
    receipt: "Ricevuta",
    manual: "Manuale",
    other: "Altro",
  };

  return labels[source] || "Altro";
};

const sourceDefaultDirection = (
  source: ClubMovementSource,
): ClubMovementDirection => {
  if (source === "transfer") {
    return "transfer";
  }

  return ["trainer", "staff", "supplier", "structure"].includes(source)
    ? "expense"
    : "income";
};

const makePaymentContext = (sources: ClubFinancialSources) => {
  const invoiceByPaymentId = new Map<string, any>();
  const receiptByPaymentId = new Map<string, any>();

  asArray(sources.invoices).forEach((invoice) => {
    const paymentId = firstString(invoice?.payment_id, invoice?.paymentId);
    if (paymentId) {
      invoiceByPaymentId.set(paymentId, invoice);
    }
  });

  asArray(sources.receipts).forEach((receipt) => {
    const paymentId = firstString(receipt?.payment_id, receipt?.paymentId);
    if (paymentId) {
      receiptByPaymentId.set(paymentId, receipt);
    }
  });

  const bankAccountById = new Map<string, any>();
  asArray(sources.bankAccounts).forEach((account) => {
    const accountId = firstString(account?.id);
    if (accountId) {
      bankAccountById.set(accountId, account);
    }
  });

  const athletesById = buildAthletesById(asArray(sources.athletes));

  return { invoiceByPaymentId, receiptByPaymentId, bankAccountById, athletesById };
};

const attachDocumentsAndAccount = (
  movement: NormalizedClubMovement,
  context: ReturnType<typeof makePaymentContext>,
): NormalizedClubMovement => {
  const paymentId =
    movement.paymentId || paymentIdFor((movement.raw || {}) as any) || undefined;
  const linkedInvoice = paymentId
    ? context.invoiceByPaymentId.get(String(paymentId))
    : null;
  const linkedReceipt = paymentId
    ? context.receiptByPaymentId.get(String(paymentId))
    : null;
  const account = movement.bankAccountId
    ? context.bankAccountById.get(String(movement.bankAccountId))
    : null;

  return {
    ...movement,
    paymentId,
    bankAccountName:
      movement.bankAccountName ||
      firstString(account?.name, account?.bank_name) ||
      undefined,
    invoiceId:
      movement.invoiceId || firstString(linkedInvoice?.id) || undefined,
    invoiceNumber:
      movement.invoiceNumber || invoiceNumberFor(linkedInvoice) || undefined,
    invoiceDate:
      movement.invoiceDate ||
      firstString(linkedInvoice?.issue_date, linkedInvoice?.date) ||
      undefined,
    receiptId:
      movement.receiptId || firstString(linkedReceipt?.id) || undefined,
    receiptNumber:
      movement.receiptNumber || receiptNumberFor(linkedReceipt) || undefined,
    receiptDate:
      movement.receiptDate ||
      firstString(linkedReceipt?.issue_date, linkedReceipt?.date) ||
      undefined,
  };
};

const compactLinkedEntity = (athlete: any, payment: any) => {
  if (!athlete && !getPaymentAthleteId(payment)) return undefined;

  const id = firstClubEntityText(getPaymentAthleteId(payment), athlete?.id);
  const name = athlete
    ? getClubEntityLabel(athlete, "athlete")
    : firstClubEntityText(payment?.subjectName, payment?.athlete_name);
  const email = firstClubEntityText(
    getClubEntityEmail(athlete),
    entityEmail(payment),
  );
  const phone = firstClubEntityText(
    getClubEntityPhone(athlete),
    entityPhone(payment),
  );
  const category = firstClubEntityText(
    getClubEntityCategory(athlete),
    payment?.subjectCategory,
  );
  const reference = firstClubEntityText(
    getClubEntityReference(athlete),
    payment?.reference,
    payment?.code,
  );

  return {
    id: id || undefined,
    type: "athlete",
    name: name || (id ? "Atleta non trovato" : undefined),
    email: email || undefined,
    phone: phone || undefined,
    category: category || undefined,
    reference: reference || undefined,
  };
};

const enrichAthleteMovement = (
  movement: NormalizedClubMovement,
  item: any,
  context: ReturnType<typeof makePaymentContext>,
): NormalizedClubMovement => {
  const athlete = resolveAthleteForPayment(item, context.athletesById);
  const athleteId = firstClubEntityText(
    getPaymentAthleteId(item),
    movement.originEntityId,
    athlete?.id,
  );
  const athleteName = athlete
    ? getClubEntityLabel(athlete, "athlete")
    : firstClubEntityText(
        movement.originEntityName,
        movement.subjectName,
        item?.athlete_name,
        item?.subjectName,
      );
  const subjectName = athleteName || (athleteId ? "Atleta non trovato" : undefined);
  const subjectEmail = firstClubEntityText(
    getClubEntityEmail(athlete),
    entityEmail(item),
    movement.subjectEmail,
  );
  const subjectPhone = firstClubEntityText(
    getClubEntityPhone(athlete),
    entityPhone(item),
    movement.subjectPhone,
  );
  const subjectCategory = firstClubEntityText(
    getClubEntityCategory(athlete),
    item?.subjectCategory,
    movement.subjectCategory,
  );
  const athleteReference = firstClubEntityText(
    getClubEntityReference(athlete),
    movement.reference,
    item?.reference,
    item?.code,
  );
  const linkedEntity = compactLinkedEntity(athlete, item);

  return {
    ...movement,
    source: "athlete",
    originEntityType: "athlete",
    originEntityId: athleteId || movement.originEntityId,
    originEntityName: subjectName || movement.originEntityName,
    subjectName: subjectName || movement.subjectName,
    subjectEmail: subjectEmail || movement.subjectEmail,
    subjectPhone: subjectPhone || movement.subjectPhone,
    subjectCategory: subjectCategory || movement.subjectCategory,
    reference: firstClubEntityText(
      athleteReference,
      subjectName,
      movement.reference,
    ) || undefined,
    category: firstClubEntityText(movement.category, subjectCategory) || undefined,
    linkedEntity,
    raw: {
      ...(item || {}),
      athlete: athlete
        ? {
            id: athlete.id,
            name: getClubEntityLabel(athlete, "athlete"),
            email: getClubEntityEmail(athlete) || undefined,
            phone: getClubEntityPhone(athlete) || undefined,
            category: getClubEntityCategory(athlete) || undefined,
            reference: getClubEntityReference(athlete) || undefined,
          }
        : undefined,
    },
  };
};

const normalizePayment = (
  item: any,
  source: ClubMovementSource,
  index: number,
  context: ReturnType<typeof makePaymentContext>,
  fallbackSubject?: string,
): NormalizedClubMovement | null => {
  const amount = toNumber(
    item?.amount ?? item?.value ?? item?.total ?? item?.price,
  );
  if (amount <= 0) {
    return null;
  }

  const data = parseDataObject(item);
  const status = isPaymentExcludedFromTotals(item)
    ? "cancelled"
    : normalizePaymentAccountingStatus({
        ...item,
        status: item?.status || item?.paymentStatus || data?.status || item?._defaultStatus,
      });
  const paymentId = paymentIdFor(item) || undefined;
  const direction = inferDirection(item, sourceDefaultDirection(source));
  const subjectName = paymentSubject(item, fallbackSubject);
  const originEntityId = firstString(
    item?._originEntityId,
    item?.originEntityId,
    item?.athlete_id,
    item?.athleteId,
    item?.trainer_id,
    item?.trainerId,
    item?.member_id,
    item?.memberId,
    item?.staff_id,
    item?.staffId,
    item?.sponsor_id,
    item?.sponsorId,
    item?.supplier_id,
    item?.supplierId,
    item?.procura_id,
    item?.procuraId,
    item?.personId,
    item?.structure_id,
    item?.structureId,
    data?.athlete_id,
    data?.athleteId,
  );

  const movement = attachDocumentsAndAccount(
    {
      id: buildId(source, item, index),
      source,
      direction,
      description: firstString(
        item?.description,
        item?.title,
        item?.reason,
        source === "procura" ? "Pagamento procura" : "",
        source === "structure" ? "Fitto struttura" : "Pagamento",
      ),
      amount,
      status,
      date:
        firstString(item?.date, item?.created_at, item?.createdAt) ||
        undefined,
      dueDate:
        firstString(item?.due_date, item?.dueDate, item?.deadline) ||
        undefined,
      paidAt:
        firstString(item?.paid_at, item?.paidAt, item?.payment_date) ||
        undefined,
      subjectName: subjectName || undefined,
      subjectEmail: entityEmail(item) || undefined,
      subjectPhone: entityPhone(item) || undefined,
      subjectCategory: firstString(item?.subjectCategory, data?.subjectCategory) || undefined,
      category:
        firstString(
          item?.category,
          item?.category_name,
          item?.payment_type,
          item?.type,
          source === "structure" ? "Fitto struttura" : "",
        ) || undefined,
      method:
        firstString(
          item?.method,
          item?.paymentMethod,
          item?.payment_method,
          data?.method,
        ) || undefined,
      reference:
        firstString(item?.reference, item?.code, item?.number, data?.reference) ||
        undefined,
      bankAccountId: bankAccountIdFor(item) || undefined,
      bankAccountName:
        firstString(item?.bankAccountName, item?.bank_account_name) ||
        undefined,
      originEntityType: originTypeForSource(source),
      originEntityId: originEntityId || undefined,
      originEntityName:
        firstString(item?._originEntityName, subjectName) || undefined,
      paymentId,
      sourceTable: firstString(item?._sourceTable) || `${source}_payments`,
      sourcePath:
        firstString(item?._sourcePath, item?._sourceTable) ||
        `${source}_payments.${paymentId || index}`,
      canEdit: false,
      canDelete: false,
      canInvoice: direction === "income" && Boolean(paymentId),
      canReceipt: direction === "income" && status === "paid" && Boolean(paymentId),
      raw: item,
    },
    context,
  );

  return source === "athlete"
    ? enrichAthleteMovement(movement, item, context)
    : movement;
};

const normalizeManualTransaction = (
  item: any,
  index: number,
  context: ReturnType<typeof makePaymentContext>,
): NormalizedClubMovement | null => {
  const amount = toNumber(item?.amount);
  if (amount <= 0) {
    return null;
  }
  const data = parseClubEntityData(item);
  const rawSource = firstString(item?.source, data?.source).toLowerCase();
  const rawOriginType = firstString(
    item?.originEntityType,
    data?.originEntityType,
  ).toLowerCase();
  const isAthleteMovement =
    rawSource === "manual_athlete_payment" || rawOriginType === "athlete";
  const source: ClubMovementSource = isAthleteMovement ? "athlete" : "manual";

  const movement = attachDocumentsAndAccount(
    {
      id: buildId(source, item, index),
      source,
      direction: inferDirection(item, "income"),
      description: firstString(
        item?.description,
        item?.title,
        item?.reference,
        "Movimento",
      ),
      amount,
      status: normalizeStatus(item?.status || "paid"),
      date: firstString(item?.date, item?.created_at) || undefined,
      subjectName:
        firstString(item?.subjectName, item?.originEntityName, item?.reference) ||
        undefined,
      subjectEmail: entityEmail(item) || undefined,
      subjectPhone: entityPhone(item) || undefined,
      subjectCategory:
        firstString(item?.subjectCategory, data?.subjectCategory) || undefined,
      category: firstString(item?.category, item?.type) || undefined,
      method: firstString(item?.paymentMethod, item?.method) || undefined,
      reference: firstString(item?.reference) || undefined,
      bankAccountId: bankAccountIdFor(item) || undefined,
      bankAccountName:
        firstString(item?.bankAccountName, item?.bank_account_name) ||
        undefined,
      originEntityType: isAthleteMovement ? "athlete" : "club",
      originEntityId:
        firstString(item?.originEntityId, item?.athlete_id, item?.athleteId) ||
        undefined,
      originEntityName:
        firstString(item?.originEntityName, item?.subjectName, item?.reference) ||
        undefined,
      sourceTable: "transactions",
      sourcePath: `transactions.${buildId(source, item, index)}`,
      canEdit: true,
      canDelete: true,
      raw: item,
    },
    context,
  );

  return isAthleteMovement
    ? enrichAthleteMovement(movement, item, context)
    : movement;
};

const normalizeExpected = (
  item: any,
  direction: "income" | "expense",
  index: number,
  context: ReturnType<typeof makePaymentContext>,
): NormalizedClubMovement | null => {
  const amount = toNumber(item?.amount);
  if (amount <= 0) {
    return null;
  }
  const data = parseClubEntityData(item);
  const originEntityType = firstString(
    item?.originEntityType,
    data?.originEntityType,
  ) as NormalizedClubMovement["originEntityType"];
  const isAthleteMovement = originEntityType === "athlete";

  const movement = attachDocumentsAndAccount(
    {
      id: buildId("expected", item, index),
      source: isAthleteMovement ? "athlete" : "manual",
      direction,
      description: firstString(item?.description, item?.title, "Previsto"),
      amount,
      status: normalizeStatus(item?.status || "pending"),
      date: firstString(item?.date, item?.created_at) || undefined,
      dueDate: firstString(item?.dueDate, item?.due_date, item?.date) || undefined,
      subjectName:
        firstString(item?.subjectName, item?.originEntityName, item?.reference) ||
        undefined,
      subjectEmail: entityEmail(item) || undefined,
      subjectPhone: entityPhone(item) || undefined,
      subjectCategory:
        firstString(item?.subjectCategory, data?.subjectCategory) || undefined,
      category: firstString(
        item?.category,
        item?.subjectCategory,
        direction === "income" ? "Entrata prevista" : "Uscita prevista",
      ),
      method: firstString(item?.paymentMethod, item?.method) || undefined,
      reference: firstString(item?.reference) || undefined,
      bankAccountId: bankAccountIdFor(item) || undefined,
      bankAccountName:
        firstString(item?.bankAccountName, item?.bank_account_name) ||
        undefined,
      originEntityType: originEntityType || "club",
      originEntityId:
        firstString(item?.originEntityId, item?.athlete_id, item?.athleteId) ||
        undefined,
      originEntityName:
        firstString(item?.originEntityName, item?.subjectName, item?.reference) ||
        undefined,
      sourceTable: direction === "income" ? "expected_income" : "expected_expenses",
      sourcePath: `${direction === "income" ? "expected_income" : "expected_expenses"}.${buildId("expected", item, index)}`,
      canEdit: true,
      canDelete: true,
      raw: item,
    },
    context,
  );

  return isAthleteMovement
    ? enrichAthleteMovement(movement, item, context)
    : movement;
};

const normalizeTransfer = (
  item: any,
  index: number,
  context: ReturnType<typeof makePaymentContext>,
): NormalizedClubMovement | null => {
  const amount = toNumber(item?.amount);
  if (amount <= 0) {
    return null;
  }

  const fromAccountId = firstString(item?.fromAccount, item?.fromAccountId);
  const toAccountId = firstString(item?.toAccount, item?.toAccountId);
  const fromAccount = fromAccountId
    ? context.bankAccountById.get(fromAccountId)
    : null;
  const toAccount = toAccountId ? context.bankAccountById.get(toAccountId) : null;
  const fromName = firstString(fromAccount?.name, item?.fromAccountName);
  const toName = firstString(toAccount?.name, item?.toAccountName);
  const transferReference = fromName && toName ? `${fromName} -> ${toName}` : "";

  return {
    id: buildId("transfer", item, index),
    source: "transfer",
    direction: "transfer",
    description: firstString(item?.description, "Giroconto"),
    amount,
    status: normalizeStatus(item?.status || "completed"),
    date: firstString(item?.date, item?.created_at) || undefined,
    subjectName: firstString(transferReference, "Giroconto"),
    category: "Giroconto",
    method: "Giroconto",
    reference:
      firstString(item?.reference, transferReference) ||
      undefined,
    bankAccountId: fromAccountId || undefined,
    bankAccountName:
      firstString(transferReference, fromName) ||
      undefined,
    originEntityType: "club",
    sourceTable: "transfers",
    sourcePath: `transfers.${buildId("transfer", item, index)}`,
    canEdit: false,
    canDelete: true,
    raw: item,
  };
};

const normalizeDocumentMovement = (
  item: any,
  source: "invoice" | "receipt",
  index: number,
  context: ReturnType<typeof makePaymentContext>,
): NormalizedClubMovement | null => {
  if (firstString(item?.payment_id, item?.paymentId)) {
    return null;
  }

  const amount = toNumber(item?.amount);
  if (amount <= 0) {
    return null;
  }

  const isReceipt = source === "receipt";
  const number = isReceipt ? receiptNumberFor(item) : invoiceNumberFor(item);
  const date = firstString(item?.issue_date, item?.date, item?.created_at);

  return attachDocumentsAndAccount(
    {
      id: buildId(source, item, index),
      source,
      direction: "income",
      description: firstString(
        item?.description,
        isReceipt ? "Ricevuta non collegata" : "Fattura non collegata",
      ),
      amount,
      status: normalizeStatus(item?.status || (isReceipt ? "paid" : "pending")),
      date: date || undefined,
      subjectName: paymentSubject(item) || undefined,
      category: isReceipt ? "Ricevuta" : "Fattura",
      method:
        firstString(item?.method, item?.payment_method, item?.paymentMethod) ||
        undefined,
      reference: number || undefined,
      bankAccountId: bankAccountIdFor(item) || undefined,
      originEntityType: item?.athlete_id ? "athlete" : "other",
      originEntityId: firstString(item?.athlete_id, item?.athleteId) || undefined,
      invoiceId: !isReceipt ? firstString(item?.id) || undefined : undefined,
      receiptId: isReceipt ? firstString(item?.id) || undefined : undefined,
      invoiceNumber: !isReceipt ? number || undefined : undefined,
      receiptNumber: isReceipt ? number || undefined : undefined,
      invoiceDate: !isReceipt ? date || undefined : undefined,
      receiptDate: isReceipt ? date || undefined : undefined,
      sourceTable: isReceipt ? "receipts" : "invoices",
      sourcePath: `${isReceipt ? "receipts" : "invoices"}.${buildId(source, item, index)}`,
      canEdit: false,
      canDelete: false,
      canInvoice: false,
      canReceipt: false,
      raw: item,
    },
    context,
  );
};

const collectNestedPayments = (
  records: any[],
  source: ClubMovementSource,
  paymentKeys: string[],
) =>
  records.flatMap((record, recordIndex) => {
    const subjectName = paymentSubject(record);
    const subjectEmail = entityEmail(record);
    return paymentKeys.flatMap((key) =>
      asArray(record?.[key]).map((payment, paymentIndex) => ({
        ...payment,
        id: firstString(
          payment?.id,
          `${source}-${record?.id || recordIndex}-${paymentIndex}`,
        ),
        subjectName,
        subjectEmail,
        _originEntityId: firstString(record?.id),
        _originEntityName: subjectName,
        _originEntityEmail: subjectEmail,
        _sourceTable: `${source}.${key}`,
      })),
    );
  });

const collectProcuraPayments = (procure: any[]) =>
  procure.flatMap((procura, procuraIndex) => {
    const procuraName = firstString(procura?.name, `Procura ${procuraIndex + 1}`);
    const subjectEmail = entityEmail(procura);

    return asArray(procura?.payments).map((payment, paymentIndex) => {
      const paymentId = firstString(
        payment?.id,
        `procura-${procura?.id || procuraIndex}-${paymentIndex}`,
      );

      return {
        ...payment,
        id: paymentId,
        subjectName: firstString(payment?.personName, procuraName),
        subjectEmail,
        procura_id: firstString(procura?.id),
        procura_name: procuraName,
        _originEntityId: firstString(procura?.id),
        _originEntityName: procuraName,
        _originEntityEmail: subjectEmail,
        _sourceTable: "procure.payments",
        _sourcePath: `procure.${procura?.id || procuraIndex}.payments.${paymentId}`,
        _defaultStatus: "paid",
      };
    });
  });

const collectStructurePayments = (structures: any[]) =>
  structures.flatMap((structure, structureIndex) => {
    const structureName = firstString(structure?.name, `Struttura ${structureIndex + 1}`);
    const subjectEmail = entityEmail(structure) || firstString(structure?.contactEmail);

    return asArray(structure?.payments).map((payment, paymentIndex) => ({
      ...payment,
      id: firstString(
        payment?.id,
        `structure-${structure?.id || structureIndex}-${paymentIndex}`,
      ),
      subjectName: structureName,
      subjectEmail,
      structure_id: firstString(structure?.id),
      structure_name: structureName,
      _originEntityId: firstString(structure?.id),
      _originEntityName: structureName,
      _originEntityEmail: subjectEmail,
      _sourceTable: "structures.payments",
    }));
  });

export const aggregateClubPayments = (
  sources: ClubFinancialSources,
): NormalizedClubMovement[] => {
  const context = makePaymentContext(sources);
  const movements = [
    ...asArray(sources.transactions)
      .map((item, index) => normalizeManualTransaction(item, index, context))
      .filter(Boolean),
    ...asArray(sources.expectedIncome)
      .map((item, index) => normalizeExpected(item, "income", index, context))
      .filter(Boolean),
    ...asArray(sources.expectedExpenses)
      .map((item, index) => normalizeExpected(item, "expense", index, context))
      .filter(Boolean),
    ...asArray(sources.transfers)
      .map((item, index) => normalizeTransfer(item, index, context))
      .filter(Boolean),
    ...asArray(sources.payments)
      .map((item, index) =>
        normalizePayment(
          { ...item, _sourceTable: item?._sourceTable || "payments" },
          "athlete",
          index,
          context,
        ),
      )
      .filter(Boolean),
    ...asArray(sources.simplifiedPayments)
      .map((item, index) =>
        normalizePayment(
          { ...item, _sourceTable: item?._sourceTable || "simplified_payments" },
          "athlete",
          index,
          context,
        ),
      )
      .filter(Boolean),
    ...asArray(sources.trainerPayments)
      .map((item, index) =>
        normalizePayment(
          { ...item, _sourceTable: item?._sourceTable || "trainer_payments" },
          "trainer",
          index,
          context,
        ),
      )
      .filter(Boolean),
    ...asArray(sources.sponsorPayments)
      .map((item, index) =>
        normalizePayment(
          { ...item, _sourceTable: item?._sourceTable || "sponsor_payments" },
          "sponsor",
          index,
          context,
        ),
      )
      .filter(Boolean),
    ...asArray(sources.supplierPayments)
      .map((item, index) =>
        normalizePayment(
          { ...item, _sourceTable: item?._sourceTable || "supplier_payments" },
          "supplier",
          index,
          context,
        ),
      )
      .filter(Boolean),
    ...collectProcuraPayments(asArray(sources.procure))
      .map((item, index) => normalizePayment(item, "procura", index, context))
      .filter(Boolean),
    ...collectNestedPayments(asArray(sources.sponsors), "sponsor", [
      "payments",
      "sponsor_payments",
    ])
      .map((item, index) => normalizePayment(item, "sponsor", index, context))
      .filter(Boolean),
    ...collectNestedPayments(asArray(sources.members), "member", [
      "payments",
      "member_payments",
    ])
      .map((item, index) => normalizePayment(item, "member", index, context))
      .filter(Boolean),
    ...collectNestedPayments(asArray(sources.staffMembers), "staff", [
      "payments",
      "staff_payments",
    ])
      .map((item, index) => normalizePayment(item, "staff", index, context))
      .filter(Boolean),
    ...collectNestedPayments(asArray(sources.trainers), "trainer", [
      "payments",
      "trainer_payments",
    ])
      .map((item, index) => normalizePayment(item, "trainer", index, context))
      .filter(Boolean),
    ...collectNestedPayments(asArray(sources.suppliers), "supplier", [
      "payments",
      "supplier_payments",
    ])
      .map((item, index) => normalizePayment(item, "supplier", index, context))
      .filter(Boolean),
    ...collectStructurePayments(asArray(sources.structures))
      .map((item, index) => normalizePayment(item, "structure", index, context))
      .filter(Boolean),
    ...asArray(sources.invoices)
      .map((item, index) =>
        normalizeDocumentMovement(item, "invoice", index, context),
      )
      .filter(Boolean),
    ...asArray(sources.receipts)
      .map((item, index) =>
        normalizeDocumentMovement(item, "receipt", index, context),
      )
      .filter(Boolean),
  ] as NormalizedClubMovement[];

  const uniqueMovements = new Map<string, NormalizedClubMovement>();
  movements.forEach((movement) => {
    const key = movementKey(movement);
    if (!uniqueMovements.has(key)) {
      uniqueMovements.set(key, movement);
    }
  });

  return Array.from(uniqueMovements.values()).sort((left, right) => {
    const leftDate = left.paidAt || left.date || left.dueDate || "";
    const rightDate = right.paidAt || right.date || right.dueDate || "";
    return rightDate.localeCompare(leftDate);
  });
};

export const summarizeClubMovements = (
  movements: NormalizedClubMovement[],
): ClubFinancialSummary => {
  return movements.reduce(
    (summary, movement) => {
      const isPaid = normalizeStatus(movement.status) === "paid";
      const isCancelled = normalizeStatus(movement.status) === "cancelled";

      if (isCancelled || movement.direction === "transfer") {
        return summary;
      }

      if (isPaid) {
        if (movement.direction === "income") {
          summary.totalIncome += movement.amount;
        } else {
          summary.totalExpense += movement.amount;
        }
        summary.paidCount += 1;
      } else {
        if (movement.direction === "income") {
          summary.totalPendingIncome += movement.amount;
        } else {
          summary.totalPendingExpense += movement.amount;
        }
        summary.pendingCount += 1;
      }

      summary.balance = summary.totalIncome - summary.totalExpense;
      return summary;
    },
    {
      totalIncome: 0,
      totalExpense: 0,
      balance: 0,
      totalPendingIncome: 0,
      totalPendingExpense: 0,
      paidCount: 0,
      pendingCount: 0,
    },
  );
};

const safeTableRows = async (table: string, clubId: string) => {
  try {
    const { data, error } = await supabase
      .from(table)
      .select("*")
      .eq("organization_id", clubId);

    if (error) {
      return [];
    }

    return data || [];
  } catch {
    return [];
  }
};

const loadStructures = async (clubId: string) => {
  try {
    return await getClubStructures(clubId);
  } catch {
    return getClubData(clubId, "structures").catch(() => []);
  }
};

const mergeRowsByStableId = (...lists: any[][]) => {
  const rows = new Map<string, any>();
  lists.flat().forEach((item, index) => {
    if (!item || typeof item !== "object") {
      return;
    }

    const key = firstString(
      item.id,
      item.payment_id,
      item.paymentId,
      `${item.source || "row"}-${item.subjectId || item.athlete_id || ""}-${item.amount || ""}-${item.due_date || item.date || ""}-${item.description || ""}`,
      `row-${index}`,
    );
    if (!rows.has(key)) {
      rows.set(key, item);
    }
  });

  return Array.from(rows.values());
};

const loadFinancialRows = async (clubId: string, resource: string) => {
  const [clubRows, tableRows] = await Promise.all([
    getClubData(clubId, resource).catch(() => []),
    safeTableRows(resource, clubId),
  ]);

  return mergeRowsByStableId(clubRows, tableRows);
};

export const loadClubFinancialSources = async (
  clubId: string,
): Promise<ClubFinancialSources> => {
  const [
    transactions,
    expectedIncome,
    expectedExpenses,
    transfers,
    sponsorPayments,
    supplierPayments,
    sponsors,
    members,
    staffMembers,
    trainers,
    suppliers,
    procure,
    structures,
    bankAccounts,
    payments,
    simplifiedPayments,
    trainerPayments,
    invoices,
    receipts,
    paymentMethods,
    athletes,
  ] = await Promise.all([
    getClubData(clubId, "transactions").catch(() => []),
    getClubData(clubId, "expected_income").catch(() => []),
    getClubData(clubId, "expected_expenses").catch(() => []),
    getClubData(clubId, "transfers").catch(() => []),
    getClubData(clubId, "sponsor_payments").catch(() => []),
    getClubData(clubId, "supplier_payments").catch(() => []),
    getClubData(clubId, "sponsors").catch(() => []),
    getClubData(clubId, "members").catch(() => []),
    getClubData(clubId, "staff_members").catch(() => []),
    getClubData(clubId, "trainers").catch(() => []),
    getClubData(clubId, "suppliers").catch(() => []),
    getClubData(clubId, "procure").catch(() => []),
    loadStructures(clubId),
    getClubData(clubId, "bank_accounts").catch(() => []),
    loadFinancialRows(clubId, "payments"),
    loadFinancialRows(clubId, "simplified_payments"),
    loadFinancialRows(clubId, "trainer_payments"),
    safeTableRows("invoices", clubId),
    safeTableRows("receipts", clubId),
    safeTableRows("payment_methods", clubId),
    getClubAthletes(clubId).catch(() => getClubData(clubId, "athletes").catch(() => [])),
  ]);

  return {
    transactions,
    expectedIncome,
    expectedExpenses,
    transfers,
    sponsorPayments,
    supplierPayments,
    sponsors,
    members,
    staffMembers,
    trainers,
    suppliers,
    procure,
    structures,
    bankAccounts,
    payments,
    simplifiedPayments,
    trainerPayments,
    invoices,
    receipts,
    paymentMethods,
    athletes,
  };
};

export const getMovementSourceLabel = sourceLabel;
