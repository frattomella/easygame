import { prisma } from "./prisma";
import type { FrozenSettlement } from "@/lib/payments/commission";
import { isCounterpartyKind } from "@/lib/accounting/model";
import {
  isSettledTransaction,
  normalizePaymentTransaction,
  normalizePaymentTransactionSource,
  normalizePaymentTransactions,
  resolveInstallmentLedger,
  sortTransactionsChronologically,
  sumSettledTransactions,
  toPaymentAmount,
  validatePaymentTransactionInput,
  type NormalizedPaymentTransaction,
  type PaymentTransactionSource,
} from "@/lib/payments/installment-ledger";

/**
 * Il servizio degli incassi: **l'unico** punto in cui EasyGame registra o
 * storna un movimento di denaro di un atleta (Workstream A, ADR-0036).
 *
 * Tre cose accadono qui e non possono accadere altrove.
 *
 * 1. **La rata non si tocca a mano.** Chi registra un incasso dichiara
 *    importo, metodo e data; `status`, `paid_at` e `method` della rata li
 *    riscrive questo modulo, ricalcolandoli dal registro. E la ragione per cui
 *    lo stato non puo piu contraddire gli importi.
 * 2. **Le due scritture stanno in una transazione.** Inserire l'incasso e
 *    aggiornare la rata sono un'operazione sola: a meta strada esisterebbe un
 *    incasso che non ha spostato nessun saldo.
 * 3. **Niente si cancella.** Correggere vuol dire stornare e registrare di
 *    nuovo. Restano visibili l'originale, lo storno e il motivo.
 *
 * Il confine di sicurezza e `organization_id`, come per ogni risorsa di club:
 * un incasso di un altro club non si legge, non si crea e non si storna, e il
 * messaggio contiene «Accesso negato» perche il route handler lo mappi su 403.
 *
 * **Cosa NON sta piu qui: i documenti.** Ricevute e fatture sono passate a
 * `fiscal-documents.ts` nel Blocco D. Un pagamento e un documento sono due
 * domini con cardinalita diverse — un incasso puo non produrre documenti, un
 * documento puo coprire piu incassi — e tenerli nello stesso file li faceva
 * sembrare la stessa cosa, che e precisamente l'errore che il motore fiscale
 * esiste per impedire (ADR-0052).
 *
 * **Storno e rimborso non sono la stessa operazione.** Lo storno dice «questo
 * incasso non e mai avvenuto» ed esclude dai totali entrambe le righe; il
 * rimborso dice «il denaro e tornato indietro» ed e un movimento che conta.
 * Vedi `reversePaymentTransaction` e `recordRefundTransaction`.
 */

export type PaymentTransactionScope = {
  userId: string;
  activeOrganizationId: string | null;
  allowedOrganizationIds: string[];
};

const denied = (message: string) => new Error(`Accesso negato: ${message}`);

const asText = (value: unknown) => String(value ?? "").trim();

const asRecord = (value: unknown): Record<string, any> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {};

const ensureOrganizationAccess = (
  scope: PaymentTransactionScope | undefined,
  organizationId: string | null | undefined,
) => {
  if (!scope) return;
  if (!organizationId) {
    throw denied("incasso senza club");
  }
  if (!scope.allowedOrganizationIds.includes(organizationId)) {
    throw denied("l'incasso appartiene a un altro club");
  }
};

const resolveOrganizationId = (
  scope: PaymentTransactionScope | undefined,
  requested?: string | null,
) => {
  const wanted = asText(requested);

  if (!scope) {
    if (!wanted) throw new Error("Nessun club indicato per l'incasso");
    return wanted;
  }

  if (wanted) {
    ensureOrganizationAccess(scope, wanted);
    return wanted;
  }

  if (scope.activeOrganizationId) return scope.activeOrganizationId;

  throw new Error("Nessun club attivo selezionato");
};

const toDateOrNull = (value: unknown) => {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  const raw = asText(value);
  if (!raw) return null;

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const transactionClient = () => (prisma as any).paymentTransaction;
const chargeClient = () => (prisma as any).athletePayment;

/**
 * Blocca cio su cui l'operazione sta per decidere, **sempre nello stesso
 * ordine**: prima la rata, poi l'incasso.
 *
 * Tutte e tre le operazioni che muovono denaro ricalcolano lo stato della
 * **rata** dal registro. Se ognuna bloccasse solo la riga che le interessa —
 * l'incasso per lo storno, la rata per un nuovo incasso — due operazioni
 * diverse sulla stessa rata non si vedrebbero, e i due ricalcoli finali
 * scriverebbero uno sopra l'altro: lo stato salvato tornerebbe a
 * contraddire i suoi importi, che e il difetto che tutto questo esiste per
 * chiudere.
 *
 * L'ordine e fisso perche due ordini diversi sulle stesse due righe sono un
 * abbraccio mortale che si presenta solo sotto carico, cioe il giorno delle
 * iscrizioni.
 *
 * **Esportata perche le tre operazioni non sono le uniche a decidere sullo
 * stato economico di una rata.** Cambiare l'importo di una rata cambia il
 * residuo, quindi cambia lo stato: chi lo fa deve mettersi nella stessa fila,
 * o il suo ricalcolo — girato su una lettura presa prima — riscrive sopra
 * quello di un incasso appena registrato. Vedi
 * `PATCH /api/athlete-payments/:id`.
 */
export const lockInstallmentAndTransaction = async (
  client: any,
  paymentId: string | null,
  transactionId?: string | null,
) => {
  if (paymentId) {
    await client.$queryRaw`SELECT id FROM payments WHERE id = ${paymentId}::uuid FOR UPDATE`;
  }
  if (transactionId) {
    await client.$queryRaw`SELECT id FROM payment_transactions WHERE id = ${transactionId}::uuid FOR UPDATE`;
  }
};

/* --------------------------------------------------------------- lettura */

export type ListPaymentTransactionsFilter = {
  organizationId?: string | null;
  athleteId?: string | null;
  paymentId?: string | null;
};

/**
 * Gli incassi di un club, di un atleta o di una singola rata.
 *
 * Ordine **crescente**: e un estratto conto, e un estratto conto si legge
 * dall'inizio. Le superfici che mostrano una cronologia trasversale lo
 * riordinano a modo loro.
 */
export const listPaymentTransactions = async (
  filter: ListPaymentTransactionsFilter,
  scope?: PaymentTransactionScope,
): Promise<NormalizedPaymentTransaction[]> => {
  const organizationId = resolveOrganizationId(scope, filter.organizationId);
  const athleteId = asText(filter.athleteId);
  const paymentId = asText(filter.paymentId);

  const rows = await transactionClient().findMany({
    where: {
      organization_id: organizationId,
      ...(athleteId ? { athlete_id: athleteId } : {}),
      ...(paymentId ? { payment_id: paymentId } : {}),
    },
    orderBy: [{ paid_at: "asc" }, { created_at: "asc" }],
  });

  /*
    L'ordine si riafferma qui e non si eredita dalla query: la stessa lista
    passa anche da percorsi che non sono un `findMany`, e due cronologie
    ordinate in modo diverso sono peggio di una cronologia non ordinata.
  */
  return sortTransactionsChronologically(normalizePaymentTransactions(rows));
};

export const getPaymentTransactionById = async (
  transactionId: string,
  scope?: PaymentTransactionScope,
) => {
  const row = await transactionClient().findUnique({
    where: { id: asText(transactionId) },
  });

  if (!row) {
    throw new Error("Incasso non trovato");
  }

  ensureOrganizationAccess(scope, row.organization_id);
  return row;
};

/**
 * La rata, letta e basta.
 *
 * **Perche una lettura e non `recomputeChargeFromLedger`.** Perche quella
 * scrive, e chi chiama questa vuole solo restituire alla schermata la riga
 * com'e adesso — dopo un'operazione che la rata non l'ha toccata, come una
 * richiesta di rimborso in attesa della conferma del provider. Una lettura che
 * scrive su un percorso di sola lettura e la cosa che `getClubPaymentAccount`
 * evita per la stessa ragione.
 */
export const getChargeById = async (
  paymentId: string,
  scope?: PaymentTransactionScope,
) => {
  const id = asText(paymentId);
  if (!id) return null;

  const row = await chargeClient().findUnique({ where: { id } });
  if (!row) return null;

  ensureOrganizationAccess(scope, row.organization_id);
  return row;
};

/* ------------------------------------------------- stato derivato di una rata */

/**
 * Riscrive `status`, `paid_at` e `method` di una rata a partire dai suoi
 * incassi.
 *
 * I tre campi restano nella tabella perche mezza applicazione — riepiloghi,
 * report, area Movimenti, app mobile — li legge; ma da qui in avanti sono una
 * **copia** del registro, non una dichiarazione dell'operatore. `data.ledger`
 * porta con se anche incassato e residuo, cosi chi legge la riga senza
 * caricare i movimenti vede numeri coerenti.
 */
export const recomputeChargeFromLedger = async (
  client: any,
  chargeId: string,
) => {
  const charge = await client.athletePayment.findUnique({
    where: { id: chargeId },
  });

  if (!charge) return null;

  const rows = await client.paymentTransaction.findMany({
    where: { payment_id: chargeId },
    orderBy: [{ paid_at: "asc" }, { created_at: "asc" }],
  });

  const transactions = normalizePaymentTransactions(rows);
  const ledger = resolveInstallmentLedger({ charge, transactions });
  const settled = transactions.filter(isSettledTransaction);
  const lastSettled = settled[settled.length - 1] || null;

  /*
    Una rata annullata resta annullata: il registro dice quanto e stato
    incassato, non se il debito esista ancora. Sovrascrivere `cancelled` qui
    resusciterebbe rate che qualcuno ha tolto di mezzo di proposito.
  */
  const currentData = asRecord(charge.data);
  if (currentData.excludedFromTotals === true) {
    return charge;
  }

  const status =
    ledger.state === "paid"
      ? "paid"
      : ledger.state === "partial"
        ? "partially_paid"
        : "pending";

  return client.athletePayment.update({
    where: { id: chargeId },
    data: {
      status,
      paid_at:
        ledger.state === "paid" && lastSettled?.paidAt
          ? new Date(lastSettled.paidAt)
          : null,
      method: lastSettled?.paymentMethod || charge.method || null,
      data: {
        ...currentData,
        ledger: {
          dueAmount: ledger.dueAmount,
          paidAmount: ledger.paidAmount,
          residualAmount: ledger.residualAmount,
          state: ledger.state,
          transactionCount: settled.length,
          updatedAt: new Date().toISOString(),
        },
      },
    },
  });
};

/**
 * Lo stato di una rata dopo un'operazione: la rata riscritta e i suoi incassi.
 *
 * Le schermate lo usano per aggiornarsi senza rileggere l'intera scheda: un
 * incasso registrato deve spostare rata, riepilogo e residuo nello stesso
 * istante, senza che nessuno prema «aggiorna».
 */
export type PaymentTransactionResult = {
  transaction: NormalizedPaymentTransaction;
  charge: Record<string, any> | null;
  transactions: NormalizedPaymentTransaction[];
};

/* -------------------------------------------------------------- scrittura */

export type CreatePaymentTransactionInput = {
  organizationId?: string | null;
  athleteId?: string | null;
  /** La rata da saldare. Un incasso senza rata e ammesso: e un acconto libero. */
  paymentId?: string | null;
  amount: unknown;
  paidAt?: unknown;
  paymentMethod: unknown;
  notes?: unknown;
  source?: unknown;
  externalReference?: unknown;
  /** Consente di incassare piu del residuo: lo decide chi chiama, non il default. */
  allowOverpayment?: boolean;
  /**
   * Vero **solo** per un incasso confermato da un evento firmato dal
   * provider (`src/lib/server/payment-gateway.ts`).
   *
   * Non e un parametro dell'API: nessuna rotta HTTP lo imposta, e le rotte
   * costruiscono il loro input campo per campo proprio perche un corpo di
   * richiesta non possa portarlo. Senza questo confine, chiunque potesse
   * chiamare la rotta degli incassi potrebbe dichiarare «pagato online» un
   * denaro che nessuno ha versato.
   */
  confirmedByProvider?: boolean;
  /**
   * I numeri **congelati** di un incasso online: lordo, commissione della
   * piattaforma, netto, e la regola che li ha prodotti.
   *
   * Assenti su un incasso manuale, che commissioni non ne ha. Non si
   * ricalcolano mai: vedi `src/lib/payments/commission.ts` e ADR-0050.
   */
  settlement?: FrozenSettlement | null;
  /** L'account connesso su cui il denaro e entrato. */
  externalAccountId?: unknown;
  /** PaymentIntent o Charge: con cui si riconcilia sul cruscotto del PSP. */
  externalPaymentId?: unknown;
  /** L'evento che ha prodotto questa riga. */
  externalEventId?: unknown;
  /** Il tipo di operazione, quando chi registra lo dichiara. */
  operationTypeCode?: unknown;
  /**
   * **Su quale conto e entrato il denaro.**
   *
   * Prima non esisteva, e la conseguenza si vedeva: un incasso registrato dalla
   * scheda atleta o dal webhook non toccava nessun saldo, e «quanto c'e in
   * cassa» restava una cifra mutata a mano dal browser. Facoltativo, perche gli
   * incassi gia registrati non ce l'hanno e nessuno puo inventarglielo.
   */
  financialAccountId?: unknown;
  /**
   * **La controparte, quando non e l'atleta.**
   *
   * Un socio che versa la quota associativa, uno sponsor che paga una tranche:
   * sono incassi come gli altri e passano da questo registro, che finora sapeva
   * parlare solo di atleti. `athleteId` resta dov'e.
   *
   * L'etichetta viaggia **congelata**, cioe il nome letto nel momento
   * dell'incasso: se domani la scheda dello sponsor viene rinominata o
   * cancellata, la riga deve poter ancora dire a chi si riferiva. E la stessa
   * scelta dello snapshot di un documento fiscale.
   */
  counterpartyKind?: unknown;
  counterpartyId?: unknown;
  counterpartyLabel?: unknown;
};

/**
 * I campi della controparte, nella forma in cui vanno scritti sulla riga.
 *
 * Il tipo passa da `isCounterpartyKind`: una stringa arbitraria in quella
 * colonna renderebbe impossibile raggruppare per controparte, ed e il difetto
 * che il catalogo chiuso esiste per evitare.
 */
const counterpartyColumns = (input: {
  counterpartyKind?: unknown;
  counterpartyId?: unknown;
  counterpartyLabel?: unknown;
}) => {
  const kind = asText(input.counterpartyKind).toUpperCase();
  if (!kind) return {};
  if (!isCounterpartyKind(kind)) {
    throw new Error(`Tipo di controparte sconosciuto: ${kind}`);
  }

  return {
    counterparty_kind: kind,
    counterparty_id: asText(input.counterpartyId) || null,
    counterparty_label: asText(input.counterpartyLabel) || null,
  };
};

/** I campi di riconciliazione, nella forma in cui vanno scritti sulla riga. */
const settlementColumns = (settlement?: FrozenSettlement | null) => {
  if (!settlement) return {};

  return {
    currency: settlement.currency,
    gross_amount_cents: settlement.grossAmountCents,
    platform_fee_cents: settlement.platformFeeCents,
    provider_fee_cents: settlement.providerFeeCents,
    net_amount_cents: settlement.netAmountCents,
    applied_fee_percent: settlement.appliedFeePercent,
    applied_fee_fixed_cents: settlement.appliedFeeFixedCents,
    commission_rule_id: settlement.commissionRuleId,
  };
};

/**
 * Registra un incasso e riallinea la rata.
 *
 * L'importo predefinito lo sceglie l'interfaccia (il residuo); qui si valida
 * quello che arriva davvero, perche un client non e una garanzia.
 */
export const createPaymentTransaction = async (
  input: CreatePaymentTransactionInput,
  scope?: PaymentTransactionScope,
): Promise<PaymentTransactionResult> => {
  const paymentId = asText(input.paymentId) || null;

  let charge: any = null;
  if (paymentId) {
    charge = await chargeClient().findUnique({ where: { id: paymentId } });
    if (!charge) {
      throw new Error("Rata non trovata");
    }
    ensureOrganizationAccess(scope, charge.organization_id);
  }

  const organizationId = charge
    ? charge.organization_id
    : resolveOrganizationId(scope, input.organizationId);

  if (charge) {
    ensureOrganizationAccess(scope, organizationId);
  }

  const amount = toPaymentAmount(input.amount);
  const paymentMethod = asText(input.paymentMethod);
  const paidAt = toDateOrNull(input.paidAt) || new Date();

  /*
    Controllo di forma, qui: importo positivo e metodo indicato non dipendono
    da cosa c'e in archivio, e sbagliarli non merita di aprire una
    transazione. La **capienza** della rata invece si verifica piu sotto,
    dentro la transazione e dopo il blocco della riga: leggere gli incassi
    qui e scrivere dopo lascia una finestra in cui due richieste vedono
    entrambe la rata vuota.
  */
  const shapeError = validatePaymentTransactionInput({
    amount,
    paymentMethod,
    ledger: null,
    allowOverpayment: true,
  });

  if (shapeError) {
    throw new Error(shapeError);
  }

  const athleteId =
    asText(input.athleteId) || asText(charge?.athlete_id) || null;
  const source: PaymentTransactionSource = normalizePaymentTransactionSource(
    input.source,
  );

  if (source !== "MANUAL" && !input.confirmedByProvider) {
    /*
      Un incasso dichiarato «online» da chi chiama e denaro che nessuno ha
      visto arrivare. L'unico modo per registrarne uno e passare da
      `handleGatewayWebhookEvent`, che agisce su un evento la cui firma e
      stata verificata (ADR-0045) — e che e l'unico punto del codice a
      impostare `confirmedByProvider`.
    */
    throw new Error(
      "Solo gli incassi manuali sono registrabili da qui: un incasso online lo conferma il provider",
    );
  }

  const created = await (prisma as any).$transaction(async (client: any) => {
    if (paymentId) {
      /*
        La capienza della rata si verifica **qui**, e non prima di aprire la
        transazione.

        Il difetto che questa riga chiude si e visto premendo tre volte
        «Registra pagamento» in sei millesimi di secondo: tre richieste hanno
        letto la stessa rata ancora vuota, hanno concluso tutte e tre che
        c'era capienza, e hanno scritto **tre** incassi da 50 su una rata da
        130 — 150 euro incassati su 130 dovuti, da un solo gesto.

        Il blocco di riga sulla rata mette in fila chi scrive sulla stessa
        rata: la seconda richiesta legge il registro dopo che la prima ha
        scritto, e vede il residuo vero. Rate diverse non si ostacolano —
        il blocco e sulla riga, non sulla tabella.
      */
      await lockInstallmentAndTransaction(client, paymentId);

      /*
        Anche la **rata** si rilegge qui dentro, non solo il registro.

        Il residuo e una sottrazione fra due numeri: quanto e dovuto e quanto
        e stato incassato. Rileggere solo il secondo lascia aperta meta della
        finestra — la segreteria che porta la rata da 130 a 100 mentre
        l'incasso e in volo, e il piano di pagamento che la sostituisce — e il
        controllo di capienza direbbe di si a 130 su una rata che nel
        frattempo ne vale 100. La lettura fatta prima della transazione resta
        buona per la sola cosa per cui e stata fatta: sapere che la rata
        esiste, e di chi e.
      */
      const lockedCharge = await client.athletePayment.findUnique({
        where: { id: paymentId },
      });

      if (!lockedCharge) {
        throw new Error("Rata non trovata");
      }

      ensureOrganizationAccess(scope, lockedCharge.organization_id);

      const current = normalizePaymentTransactions(
        await client.paymentTransaction.findMany({
          where: { payment_id: paymentId },
        }),
      );

      const capacityError = validatePaymentTransactionInput({
        amount,
        paymentMethod,
        ledger: resolveInstallmentLedger({
          charge: lockedCharge,
          transactions: current,
        }),
        allowOverpayment: Boolean(input.allowOverpayment),
      });

      if (capacityError) {
        throw new Error(capacityError);
      }
    }

    const row = await client.paymentTransaction.create({
      data: {
        organization_id: organizationId,
        athlete_id: athleteId,
        payment_id: paymentId,
        amount,
        paid_at: paidAt,
        payment_method: paymentMethod,
        notes: asText(input.notes) || null,
        source,
        external_reference: asText(input.externalReference) || null,
        created_by: scope?.userId || null,
        external_account_id: asText(input.externalAccountId) || null,
        external_payment_id: asText(input.externalPaymentId) || null,
        external_event_id: asText(input.externalEventId) || null,
        operation_type_code: asText(input.operationTypeCode) || null,
        financial_account_id: asText(input.financialAccountId) || null,
        ...counterpartyColumns(input),
        ...settlementColumns(input.settlement),
        data: {},
      },
    });

    const updatedCharge = paymentId
      ? await recomputeChargeFromLedger(client, paymentId)
      : null;

    const transactions = paymentId
      ? normalizePaymentTransactions(
          await client.paymentTransaction.findMany({
            where: { payment_id: paymentId },
            orderBy: [{ paid_at: "asc" }, { created_at: "asc" }],
          }),
        )
      : [];

    return { row, updatedCharge, transactions };
  });

  return {
    transaction: normalizePaymentTransaction(
      created.row,
    ) as NormalizedPaymentTransaction,
    charge: created.updatedCharge,
    transactions: created.transactions,
  };
};

export type ReversePaymentTransactionInput = {
  transactionId: string;
  reason?: unknown;
};

/**
 * Storna un incasso.
 *
 * Non lo cancella: marca l'originale con `reversed_at` e crea il movimento di
 * segno opposto che lo compensa. Lo storico continua a raccontare cosa e
 * successo — quanto era stato incassato, quando, da chi e perche e stato
 * annullato — e i totali tornano indietro senza che nessuna riga scompaia.
 *
 * Per **correggere** un incasso sbagliato si storna e si registra di nuovo:
 * modificare l'importo di un movimento gia registrato riscriverebbe la storia.
 */
export const reversePaymentTransaction = async (
  input: ReversePaymentTransactionInput,
  scope?: PaymentTransactionScope,
): Promise<PaymentTransactionResult> => {
  const original = await getPaymentTransactionById(input.transactionId, scope);

  if (original.reversed_at) {
    throw new Error("Questo incasso e gia stato stornato");
  }

  if (original.reverses_transaction_id) {
    throw new Error("Uno storno non si storna: registra un nuovo incasso");
  }

  const reason = asText(input.reason) || "Storno registrato dalla segreteria";
  const now = new Date();
  const paymentId = original.payment_id || null;

  const result = await (prisma as any).$transaction(async (client: any) => {
    /*
      «E gia stato stornato?» va richiesto **dopo** aver bloccato la riga.
      Letto prima di aprire la transazione, due storni simultanei dello stesso
      incasso vedono entrambi `reversed_at` vuoto e scrivono entrambi il
      movimento di compensazione: la rata torna indietro due volte e il
      registro va sotto zero.
    */
    await lockInstallmentAndTransaction(client, paymentId, original.id);

    const fresh = await client.paymentTransaction.findUnique({
      where: { id: original.id },
    });

    if (fresh?.reversed_at) {
      throw new Error("Questo incasso e gia stato stornato");
    }

    await client.paymentTransaction.update({
      where: { id: original.id },
      data: {
        reversed_at: now,
        reversed_by: scope?.userId || null,
        reversal_reason: reason,
      },
    });

    const row = await client.paymentTransaction.create({
      data: {
        organization_id: original.organization_id,
        athlete_id: original.athlete_id,
        payment_id: paymentId,
        amount: -toPaymentAmount(original.amount),
        paid_at: now,
        payment_method: original.payment_method,
        notes: reason,
        source: normalizePaymentTransactionSource(original.source),
        external_reference: original.external_reference,
        created_by: scope?.userId || null,
        reverses_transaction_id: original.id,
        /*
          **Lo storno eredita il conto e la controparte dell'originale.**

          Il conto, perche il denaro torna indietro da dove era entrato:
          scriverlo altrove — o non scriverlo — lascerebbe il saldo di quel
          conto piu alto del vero, che e l'errore che lo storno esisteva per
          correggere.

          La controparte, perche un credito si legge per controparte: uno
          storno che la perde sbaglia proprio il numero che serve leggere.
          E la stessa cosa che questa riga fa gia con `athlete_id`.
        */
        financial_account_id: original.financial_account_id || null,
        counterparty_kind: original.counterparty_kind || null,
        counterparty_id: original.counterparty_id || null,
        counterparty_label: original.counterparty_label || null,
        operation_type_code: original.operation_type_code || null,
        data: {},
      },
    });

    const updatedCharge = paymentId
      ? await recomputeChargeFromLedger(client, paymentId)
      : null;

    const transactions = paymentId
      ? normalizePaymentTransactions(
          await client.paymentTransaction.findMany({
            where: { payment_id: paymentId },
            orderBy: [{ paid_at: "asc" }, { created_at: "asc" }],
          }),
        )
      : [];

    return { row, updatedCharge, transactions };
  });

  return {
    transaction: normalizePaymentTransaction(
      result.row,
    ) as NormalizedPaymentTransaction,
    charge: result.updatedCharge,
    transactions: result.transactions,
  };
};

/* --------------------------------------------------------------- rimborsi */

/**
 * I rimborsi gia scritti **su questo incasso**.
 *
 * Il legame naturale e `external_payment_id` — il PaymentIntent, lo stesso con
 * cui il webhook ha trovato l'incasso originale. Scritto pero come
 * `external_payment_id: original.external_payment_id || undefined`, un valore
 * nullo diventava **nessun filtro**: Prisma ignora `undefined`, e la somma
 * passava da «quanto e stato rimborsato su questo incasso» a «quanto e stato
 * rimborsato in tutto il club». Un rimborso vecchio su un altro atleta
 * sarebbe bastato a far rifiutare un rimborso legittimo, con un messaggio che
 * accusa il movimento sbagliato.
 *
 * Senza PaymentIntent resta il legame che il rimborso si porta dietro in
 * `data`: e quello che rende la domanda sempre rispondibile, anche su un
 * incasso che un identificativo del provider non ce l'ha.
 */
const refundsOfTransaction = (original: any) => ({
  organization_id: original.organization_id,
  amount: { lt: 0 },
  ...(original.external_payment_id
    ? { external_payment_id: original.external_payment_id }
    : {
        data: {
          path: ["refundOfTransactionId"],
          equals: String(original.id),
        },
      }),
});

export type RecordRefundInput = {
  /** L'incasso rimborsato. */
  transactionId: string;
  amountCents: number;
  /** L'identificativo del rimborso presso il provider: la chiave di deduplica. */
  externalRefundId: string;
  externalEventId?: unknown;
  paidAt?: unknown;
  reason?: unknown;
  settlement?: FrozenSettlement | null;
  /**
   * Vero **solo** per un rimborso confermato da un evento firmato. Come per
   * gli incassi, nessuna rotta HTTP lo imposta.
   */
  confirmedByProvider?: boolean;
};

/**
 * Registra un **rimborso**.
 *
 * **Perche non e uno storno, e perche la differenza conta.** Uno storno dice
 * «questo incasso non e mai avvenuto»: e la correzione di un errore di
 * registrazione, e infatti toglie dai totali **sia** l'incasso **sia** il
 * movimento che lo compensa — netto zero, come se non fosse successo nulla. Un
 * rimborso dice l'opposto: l'incasso e avvenuto davvero, e poi del denaro e
 * tornato indietro. Sono due fatti, e restano due movimenti che **contano
 * entrambi**.
 *
 * E anche l'unico modo di rappresentare un rimborso **parziale**. Con la
 * meccanica dello storno, restituire 30 € su 130 avrebbe dovuto annullare
 * l'incasso intero e registrarne uno nuovo da 100: la rata sarebbe risultata
 * pagata 100 e la famiglia non avrebbe piu trovato traccia dei 130 che aveva
 * versato.
 *
 *     Rata 130 → incasso +130 → PAGATA
 *     rimborso 30 → movimento −30 → incassato 100, residuo 30, PARZIALE
 *
 * **Perche e idempotente sull'identificativo del rimborso.** Stripe consegna
 * lo stesso evento piu volte, e la deduplica degli eventi copre il caso
 * normale; questo controllo copre quello che resta — due eventi *diversi* che
 * riguardano lo stesso rimborso, che e cosa che succede fra `charge.refunded`
 * e `charge.refund.updated`.
 */
export const recordRefundTransaction = async (
  input: RecordRefundInput,
  scope?: PaymentTransactionScope,
): Promise<PaymentTransactionResult & { duplicate: boolean }> => {
  const original = await getPaymentTransactionById(input.transactionId, scope);

  if (!input.confirmedByProvider) {
    throw new Error(
      "Un rimborso lo conferma il provider: da qui si registra uno storno, non un rimborso",
    );
  }

  const externalRefundId = asText(input.externalRefundId);
  if (!externalRefundId) {
    throw new Error("Rimborso senza identificativo del provider");
  }

  const existing = await transactionClient().findFirst({
    where: {
      organization_id: original.organization_id,
      external_reference: externalRefundId,
    },
  });

  if (existing) {
    const transactions = original.payment_id
      ? await listPaymentTransactions(
          {
            /*
              Il club arriva dall'incasso originale e non dallo scope: questa
              funzione la chiama il webhook, che uno scope non ce l'ha. Senza,
              la rilettura falliva con «nessun club indicato» **solo sul
              secondo evento** dello stesso rimborso — cioe nel caso che questa
              deduplica esiste per gestire.
            */
            organizationId: String(original.organization_id),
            paymentId: original.payment_id,
          },
          scope,
        )
      : [];

    return {
      duplicate: true,
      transaction: normalizePaymentTransaction(
        existing,
      ) as NormalizedPaymentTransaction,
      charge: null,
      transactions,
    };
  }

  const refundedCents = Math.max(0, Math.round(Number(input.amountCents) || 0));
  const originalCents = Math.round(toPaymentAmount(original.amount) * 100);

  if (refundedCents <= 0) {
    throw new Error("L'importo del rimborso deve essere maggiore di zero");
  }

  /*
    Un rimborso non puo superare l'incasso, e non puo superare quel che ne
    resta dopo i rimborsi gia registrati. Il provider non lo consentirebbe, ma
    la difesa sta qui perche il registro deve restare coerente anche se
    l'evento arriva malformato o fuori ordine.
  */
  const alreadyRefunded = await transactionClient().findMany({
    where: refundsOfTransaction(original),
  });

  const alreadyRefundedCents = alreadyRefunded.reduce(
    (total: number, row: any) =>
      total + Math.abs(Math.round(toPaymentAmount(row.amount) * 100)),
    0,
  );

  if (refundedCents + alreadyRefundedCents > originalCents) {
    throw new Error(
      "Il rimborso supera quanto era stato incassato su questo movimento",
    );
  }

  const paymentId = original.payment_id || null;
  const paidAt = toDateOrNull(input.paidAt) || new Date();
  const reason = asText(input.reason) || "Rimborso registrato dal provider";

  const result = await (prisma as any).$transaction(async (client: any) => {
    /*
      La deduplica e la capienza del rimborso sono state calcolate su una
      lettura fatta prima di aprire la transazione. Stripe consegna lo stesso
      rimborso piu volte, e due consegne simultanee vedrebbero entrambe «non
      l'ho ancora registrato»: due movimenti negativi per un solo rimborso.
      Il blocco sulla riga dell'incasso originale mette in fila chi rimborsa
      lo stesso incasso, e la verifica si rifa qui dentro.
    */
    await lockInstallmentAndTransaction(client, paymentId, original.id);

    const alreadyWritten = await client.paymentTransaction.findFirst({
      where: {
        organization_id: original.organization_id,
        external_reference: externalRefundId,
      },
    });

    if (alreadyWritten) {
      return { duplicate: alreadyWritten, row: null, updatedCharge: null, transactions: [] };
    }

    const refundedSoFar = await client.paymentTransaction.findMany({
      where: refundsOfTransaction(original),
    });

    const refundedSoFarCents = refundedSoFar.reduce(
      (total: number, row: any) =>
        total + Math.abs(Math.round(toPaymentAmount(row.amount) * 100)),
      0,
    );

    if (refundedCents + refundedSoFarCents > originalCents) {
      throw new Error(
        "Il rimborso supera quanto era stato incassato su questo movimento",
      );
    }

    const row = await client.paymentTransaction.create({
      data: {
        organization_id: original.organization_id,
        athlete_id: original.athlete_id,
        payment_id: paymentId,
        /*
          Negativo, e **senza** `reverses_transaction_id`: quel campo esclude la
          riga dai totali, ed e esattamente cio che un rimborso non deve fare.
          Il legame con l'incasso originale sta in `data` e nel PaymentIntent
          condiviso.
        */
        amount: -(refundedCents / 100),
        paid_at: paidAt,
        payment_method: original.payment_method,
        notes: reason,
        source: normalizePaymentTransactionSource(original.source),
        external_reference: externalRefundId,
        external_account_id: original.external_account_id,
        external_payment_id: original.external_payment_id,
        external_event_id: asText(input.externalEventId) || null,
        operation_type_code: original.operation_type_code,
        /* Il denaro torna indietro dallo stesso conto, alla stessa controparte. */
        financial_account_id: original.financial_account_id || null,
        counterparty_kind: original.counterparty_kind || null,
        counterparty_id: original.counterparty_id || null,
        counterparty_label: original.counterparty_label || null,
        created_by: null,
        ...settlementColumns(input.settlement),
        data: {
          kind: "refund",
          refundOfTransactionId: original.id,
          externalRefundId,
        },
      },
    });

    const updatedCharge = paymentId
      ? await recomputeChargeFromLedger(client, paymentId)
      : null;

    const transactions = paymentId
      ? normalizePaymentTransactions(
          await client.paymentTransaction.findMany({
            where: { payment_id: paymentId },
            orderBy: [{ paid_at: "asc" }, { created_at: "asc" }],
          }),
        )
      : [];

    return { duplicate: null, row, updatedCharge, transactions };
  });

  /*
    Il rimborso era gia stato scritto da una consegna gemella arrivata nel
    frattempo: si risponde come per la deduplica vista prima della
    transazione, con la stessa forma.
  */
  if (result.duplicate) {
    return {
      duplicate: true,
      transaction: normalizePaymentTransaction(
        result.duplicate,
      ) as NormalizedPaymentTransaction,
      charge: null,
      transactions: paymentId
        ? await listPaymentTransactions(
            {
              organizationId: String(original.organization_id),
              paymentId,
            },
            scope,
          )
        : [],
    };
  }

  return {
    duplicate: false,
    transaction: normalizePaymentTransaction(
      result.row,
    ) as NormalizedPaymentTransaction,
    charge: result.updatedCharge,
    transactions: result.transactions,
  };
};

export type MarkRefundRequestedInput = {
  transactionId: string;
  /** L'identificativo che il provider ha assegnato al rimborso. */
  externalRefundId: string;
  amountCents: number;
  reason?: unknown;
  /** Le note della segreteria: restano in EasyGame, non viaggiano al provider. */
  notes?: unknown;
  requestedBy?: string | null;
  requestedAt?: unknown;
};

/**
 * Annota che un rimborso e stato **chiesto** al provider e non e ancora
 * confermato.
 *
 * **Perche un'annotazione e non un movimento.** Perche un movimento nel
 * registro dice che il denaro si e mosso, e qui non lo sappiamo ancora: la
 * risposta HTTP di Stripe puo essere `pending`, e su alcuni metodi di pagamento
 * ci resta per giorni. Scrivere subito il movimento vorrebbe dire raccontare
 * alla famiglia che i soldi sono tornati mentre sono ancora in viaggio, e
 * doverlo disdire se il rimborso fallisce. Il registro definitivo lo scrive il
 * webhook, esattamente come per gli incassi.
 *
 * **Perche l'annotazione non va poi cancellata.** Perche sparisce da sola:
 * `pendingRefundRequests` la considera in volo finche il movimento con lo
 * stesso identificativo non compare nel registro. Nessuno stato da tenere
 * allineato a mano, e nessun secondo sistema di storico dei rimborsi — la
 * fonte resta Payments V2.
 *
 * L'annotazione vive su `data.refundRequests` dell'**incasso originale**: e li
 * che l'interfaccia la cerca quando deve dire «rimborso in elaborazione» e
 * impedire una seconda richiesta.
 */
export const markRefundRequested = async (
  input: MarkRefundRequestedInput,
  scope?: PaymentTransactionScope,
): Promise<NormalizedPaymentTransaction> => {
  const original = await getPaymentTransactionById(input.transactionId, scope);

  const externalRefundId = asText(input.externalRefundId);
  if (!externalRefundId) {
    throw new Error("Rimborso senza identificativo del provider");
  }

  const currentData = asRecord(original.data);
  const requests = Array.isArray(currentData.refundRequests)
    ? currentData.refundRequests
    : [];

  /*
    Lo stesso identificativo non si annota due volte: e cio che succede quando
    l'idempotenza di Stripe restituisce il rimborso gia creato a una seconda
    richiesta identica. Un'annotazione doppia farebbe contare due volte
    l'importo in volo, e il rimborsabile scenderebbe del doppio.
  */
  const gia = requests.some(
    (entry: any) => asText(entry?.externalRefundId) === externalRefundId,
  );

  const row = gia
    ? original
    : await transactionClient().update({
        where: { id: original.id },
        data: {
          data: {
            ...currentData,
            refundRequests: [
              ...requests,
              {
                externalRefundId,
                amountCents: Math.max(
                  0,
                  Math.round(Number(input.amountCents) || 0),
                ),
                reason: asText(input.reason) || null,
                notes: asText(input.notes) || null,
                requestedBy: asText(input.requestedBy) || null,
                requestedAt: (
                  toDateOrNull(input.requestedAt) || new Date()
                ).toISOString(),
              },
            ],
          },
        },
      });

  return normalizePaymentTransaction(row) as NormalizedPaymentTransaction;
};

/**
 * L'incasso a cui un rimborso si riferisce, cercato per identificativo del
 * pagamento presso il provider.
 *
 * Serve al webhook: un evento di rimborso cita il PaymentIntent, non la riga
 * di EasyGame. La ricerca e **ristretta al club** dell'account connesso che ha
 * generato l'evento, perche un identificativo di pagamento arriva dall'esterno
 * e non e un lasciapassare per il registro di un'altra societa.
 */
export const findTransactionByExternalPaymentId = async (input: {
  organizationId: string;
  externalPaymentId: string;
}) => {
  const organizationId = asText(input.organizationId);
  const externalPaymentId = asText(input.externalPaymentId);
  if (!organizationId || !externalPaymentId) return null;

  return transactionClient().findFirst({
    where: {
      organization_id: organizationId,
      external_payment_id: externalPaymentId,
      /* Solo l'incasso, non i rimborsi che ne discendono. */
      amount: { gt: 0 },
    },
    orderBy: { created_at: "asc" },
  });
};

/**
 * Tutti i movimenti che riguardano **lo stesso pagamento presso il provider**:
 * l'incasso, i suoi rimborsi, il suo eventuale storno.
 *
 * **Perche si cerca per pagamento del provider e non per rata.** Perche e
 * l'insieme su cui si decide un rimborso, e una rata puo averne piu di uno: 130
 * € pagati con due incassi da 50 e 80 sono due pagamenti Stripe distinti, e il
 * rimborsabile dell'uno non e il rimborsabile dell'altra. Vedi
 * `src/lib/payments/refunds.ts`.
 *
 * Funziona anche su un acconto senza rata, che per `payment_id` non si
 * troverebbe.
 */
export const listTransactionsByExternalPaymentId = async (input: {
  organizationId: string;
  externalPaymentId: string;
}): Promise<NormalizedPaymentTransaction[]> => {
  const organizationId = asText(input.organizationId);
  const externalPaymentId = asText(input.externalPaymentId);
  if (!organizationId || !externalPaymentId) return [];

  return sortTransactionsChronologically(
    normalizePaymentTransactions(
      await transactionClient().findMany({
        where: {
          organization_id: organizationId,
          external_payment_id: externalPaymentId,
        },
        orderBy: [{ paid_at: "asc" }, { created_at: "asc" }],
      }),
    ),
  );
};

/** Il totale incassato su una rata, letto dal registro. */
export const getSettledAmountForCharge = async (
  input: { paymentId: string; organizationId?: string | null },
  scope?: PaymentTransactionScope,
) => {
  /*
    Il club si passa esplicitamente perche questa funzione la chiama anche chi
    **uno scope non ce l'ha**: l'apertura di un checkout risolve il club dalle
    impostazioni della societa, non da una sessione utente. Senza, la lettura
    falliva con «nessun club indicato» — lo stesso inciampo gia documentato in
    `recordRefundTransaction`.
  */
  const transactions = await listPaymentTransactions(
    {
      paymentId: input.paymentId,
      organizationId: input.organizationId ?? undefined,
    },
    scope,
  );
  return sumSettledTransactions(transactions);
};
