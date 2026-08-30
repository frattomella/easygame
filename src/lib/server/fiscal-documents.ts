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
import { assertActiveClub } from "@/lib/auth/active-club-boundary";
import { allocateDocumentNumber, peekDocumentNumber } from "./document-numbering";
import {
  documentYearOf,
  formatDocumentNumber,
  type DocumentNumberKind,
} from "@/lib/documents/numbering";
import {
  resolveFiscalRecipient,
  type FiscalCounterparty,
} from "@/lib/documents/fiscal-recipient";
import { findSponsorCounterparty } from "./sponsors";
import { buildDocumentSnapshot } from "@/lib/documents/document-snapshot";
/*
  La regola dell'immodificabilita vive nel modulo puro degli snapshot e si
  riesporta da qui, che resta il punto di ingresso documentato del dominio: il
  chiamante che mancava e il CRUD generico, e `resources.ts` non puo importare
  questo file senza chiudere un anello con `sponsors.ts`.
*/
export { assertDocumentMutable } from "@/lib/documents/document-snapshot";
import { toPaymentAmount } from "@/lib/payments/installment-ledger";
import {
  getFiscalProfile,
  getOperationType,
  resolveDefaultSeries,
} from "./fiscal-config";
import { decideDocument, resolveStampDuty } from "@/lib/fiscal/engine";
import { splitVatFromTotal } from "@/lib/fiscal/vat";
import {
  DEFAULT_OPERATION_TYPE_BY_ORIGIN,
  freezeClassification,
  type NormalizedOperationType,
  type OperationTypeSource,
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
  /**
   * L'intestatario quando **non** e un atleta: uno sponsor, e domani un socio.
   *
   * Estensione minima di W4-H. Prima di questa riga l'intestatario era sempre
   * risolto dall'atleta, e la sponsorizzazione — l'unica entrata del catalogo
   * che una fattura la **richiede** — era l'unica che non poteva averla.
   */
  counterparty: FiscalCounterparty | null;
  operationType: NormalizedOperationType | null;
  /**
   * **Chi ha detto che l'operazione e quella.**
   *
   * Prima non esisteva, e la conseguenza era il §5.2 del piano: il codice
   * ricadeva su `DEFAULT_OPERATION_TYPE_BY_ORIGIN` e da quel punto in poi
   * nessuno, ne il motore ne il documento, poteva piu distinguere una scelta
   * da un ripiego.
   */
  operationTypeSource: OperationTypeSource;
  profile: Awaited<ReturnType<typeof getFiscalProfile>>;
};

/**
 * L'intestatario del documento, dalla forma giusta delle due.
 *
 * La controparte, quando c'e, **vince sull'atleta**: un incasso che dichiara
 * uno sponsor lo dichiara perche il documento e suo, e cadere sull'atleta
 * intesterebbe a una famiglia una fattura di sponsorizzazione.
 */
const recipientOf = (context: IssueContext) =>
  context.counterparty
    ? resolveFiscalRecipient({ counterparty: context.counterparty })
    : resolveFiscalRecipient(context.athlete);

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
    L'intestatario non-atleta, quando l'incasso ne dichiara uno.

    Il club arriva **dalla riga dell'incasso**, mai dal client: uno sponsor si
    cerca solo dentro il club a cui l'incasso appartiene, e uno sponsor
    cancellato non impedisce di ristampare — per quello c'e lo snapshot.
  */
  const counterpartyKind = asText(transaction.counterparty_kind).toUpperCase();
  const counterparty =
    counterpartyKind === "SPONSOR" || counterpartyKind === "SUPPLIER"
      ? await findSponsorCounterparty(
          organizationId,
          asText(transaction.counterparty_id),
        )
      : null;

  /*
    Il tipo di operazione: quello chiesto adesso, altrimenti quello registrato
    sull'incasso, altrimenti quello che il dominio propone.

    **La terza opzione non e piu indistinguibile dalle prime due.** Prima
    questa catena produceva una stringa e basta, e da li in poi «quota
    attivita» arrivava sul documento con la stessa faccia che avrebbe avuto se
    qualcuno l'avesse scelta — mentre `operation_type_code` era nullo su ogni
    incasso reale (§5.2). La provenienza viaggia accanto al codice: la proposta
    resta, perche serve a scegliere il documento giusto, ma non si presenta
    come una dichiarazione.
  */
  const declaredCode =
    asText(operationTypeCode) || asText(transaction.operation_type_code);

  const proposedCode = counterparty
    ? DEFAULT_OPERATION_TYPE_BY_ORIGIN.sponsor
    : DEFAULT_OPERATION_TYPE_BY_ORIGIN.athlete;

  const operationType = await getOperationType({
    organizationId,
    code: declaredCode || proposedCode,
  });

  /*
    Una causale dichiarata che il club non ha in catalogo non e una
    dichiarazione valida: `getOperationType` restituisce `null`, e chiamarla
    «dichiarata» direbbe che qualcuno ha classificato un incasso con un codice
    che non esiste.
  */
  const operationTypeSource: OperationTypeSource = !operationType
    ? "absent"
    : declaredCode
      ? "declared"
      : "proposed";

  return {
    organizationId,
    organizationName: asText(club?.name),
    transaction,
    charge,
    athlete,
    counterparty,
    operationType,
    operationTypeSource,
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
  const recipient = recipientOf(context);

  const decision = decideDocument({
    profile: context.profile,
    operationType: context.operationType,
    operationTypeSource: context.operationTypeSource,
    recipient,
  });

  const amountCents = Math.round(
    toPaymentAmount(context.transaction.amount) * 100,
  );

  /*
    Il bollo si **spiega** qui e non si scopre dopo: `undetermined` non e un
    errore, e la domanda a cui manca la risposta perche l'aliquota della
    causale non e dichiarata (ADR-0073).
  */
  const stampDuty = resolveStampDuty({
    profile: context.profile,
    amountCents,
    vatRate: context.operationType?.vatRate ?? null,
  });

  return {
    decision,
    recipient,
    operationType: context.operationType,
    operationTypeSource: context.operationTypeSource,
    classification: decision.classification,
    amounts: {
      totalCents: amountCents,
      stampDuty,
      ...splitVatFromTotal({
        totalCents: amountCents,
        vatRate: context.operationType?.vatRate ?? null,
      }),
    },
    /*
      **Il numero che verra assegnato, letto senza consumarlo.**

      `peekDocumentNumber` esisteva e non aveva chiamanti. Serve qui: chi emette
      deve poter vedere prima quale numero sta per uscire — e chi tiene il
      registro puo accorgersi di un salto **prima** che il documento sia
      emesso, non dopo. La lettura non incrementa: e la stessa sequenza che
      `allocateDocumentNumber` incrementera, quindi i due numeri sono coerenti
      salvo un'emissione concorrente, che e il solo caso in cui devono
      divergere.
    */
    nextNumbers: await nextNumbersFor(context),
  };
};

/**
 * Il prossimo numero di ricevuta e di fattura, per serie ed esercizio.
 *
 * Non alloca niente: `peekDocumentNumber` legge il contatore, e il `+1` qui e
 * cio che la prossima allocazione produrra. Se nel frattempo qualcun altro
 * emette, il numero mostrato sara stato quello di un altro documento — ed e la
 * ragione per cui questa e una **anteprima** e non una prenotazione.
 */
const nextNumbersFor = async (context: IssueContext) => {
  const issueDate = context.transaction.paid_at || new Date();
  const year = documentYearOf(issueDate);

  const kinds: DocumentNumberKind[] = ["receipt", "invoice"];

  const entries = await Promise.all(
    kinds.map(async (kind) => {
      const series = await resolveDefaultSeries({
        organizationId: context.organizationId,
        kind,
      });
      const last = await peekDocumentNumber({
        organizationId: context.organizationId,
        kind,
        series,
        year,
      });

      return [
        kind,
        {
          series,
          year,
          sequence: last + 1,
          number: formatDocumentNumber(kind, year, last + 1, series),
        },
      ] as const;
    }),
  );

  return Object.fromEntries(entries) as Record<
    "receipt" | "invoice",
    { series: string; year: number; sequence: number; number: string }
  >;
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

/**
 * L'aliquota che il documento puo dichiarare.
 *
 * **Solo quella di una causale dichiarata.** L'aliquota di una causale che
 * EasyGame ha soltanto proposto non e un'aliquota che qualcuno ha scelto, e
 * scriverla sullo snapshot — che e la fonte autorevole della ristampa e del
 * tracciato — significherebbe far dire al documento una cosa che nessuno ha
 * detto.
 */
const declaredVatRateOf = (context: IssueContext) =>
  context.operationTypeSource === "declared"
    ? (context.operationType?.vatRate ?? null)
    : null;

const buildSnapshotFor = (
  context: IssueContext,
  input: { issueDate: Date; description: string; totalCents: number },
) => {
  const recipient = recipientOf(context);
  const vatRate = declaredVatRateOf(context);

  /*
    **Il difetto latente del bollo, chiuso qui.** Il chiamante passava
    `vatApplied: Boolean(operationType?.vatRate)`, e `Boolean(0)` e falso:
    un'operazione dichiarata **ad aliquota zero** — che e una dichiarazione
    fiscale precisa, diversa da «non dichiarata» — finiva nello stesso ramo di
    un'operazione non classificata. Con `vatRate` i tre stati restano tre.
  */
  const stamp = resolveStampDuty({
    profile: context.profile,
    amountCents: input.totalCents,
    vatRate,
  });

  const vat = splitVatFromTotal({ totalCents: input.totalCents, vatRate });

  return buildDocumentSnapshot({
    profile: context.profile,
    organizationName: context.organizationName,
    recipient,
    issuedAt: input.issueDate,
    description: input.description,
    totalCents: input.totalCents,
    stampDutyCents: stamp.applies ? stamp.amountCents : 0,
    vatRate,
    vatNature:
      context.operationTypeSource === "declared"
        ? (context.operationType?.vatNature ?? null)
        : null,
    taxableAmountCents: vat.taxableAmountCents,
    vatAmountCents: vat.vatAmountCents,
    operationTypeCode: context.operationType?.code || null,
    operationTypeLabel: context.operationType?.label || null,
    /*
      La classificazione si congela **adesso**: la causale e configurazione
      mutabile, e un documento consegnato non cambia natura perche sei mesi
      dopo qualcuno ha corretto una voce del catalogo (§8 e §15 del piano).
    */
    classification: freezeClassification(
      context.operationType,
      context.operationTypeSource,
    ),
    transactionIds: [String(context.transaction.id)],
    installmentId: context.transaction.payment_id || null,
  });
};

/**
 * Le colonne interrogabili dell'imponibile e dell'imposta.
 *
 * Sono una **copia** dello snapshot, come gia `vat_number` e `method`: lo
 * snapshot resta la fonte autorevole, queste servono a chi filtra e somma senza
 * aprire un JSON. Restano nulle quando l'aliquota non e dichiarata, che e cio
 * che le rende leggibili come «da guardare» invece che come zero.
 */
const vatColumnsFor = (context: IssueContext, totalCents: number) => {
  const vat = splitVatFromTotal({
    totalCents,
    vatRate: declaredVatRateOf(context),
  });

  return {
    taxable_amount_cents: vat.taxableAmountCents,
    vat_amount_cents: vat.vatAmountCents,
  };
};

/**
 * Il codice di operazione da scrivere **sulla riga** del documento.
 *
 * `null` quando la causale era soltanto proposta. E la riga che chiude il
 * §5.2: scrivere il codice proposto renderebbe il documento indistinguibile da
 * uno classificato, e la colonna tornerebbe a raccontare che ogni incasso e una
 * quota di attivita — che e esattamente cio che raccontava prima.
 */
const declaredOperationTypeCodeOf = (context: IssueContext) =>
  context.operationTypeSource === "declared"
    ? context.operationType?.code || null
    : null;

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

  /*
    **Un documento gia emesso, e non uno qualunque che citi questo incasso.**

    Il controllo era «esiste una riga con questo `transaction_id`?», e una
    revisione ostile ne ha fatto un dirottamento: una riga `receipts` creata dal
    registro generico — senza numero, senza snapshot, con l'importo e la
    causale scritti dall'attaccante — veniva restituita **al posto** della
    ricevuta vera, e poiche il collegamento era unico quell'incasso non poteva
    piu essere documentato. Mai.

    La creazione dal registro generico e chiusa (`resources.ts`); questo
    controllo resta stretto comunque, perche una difesa sola prima o poi si
    dimentica: si riconosce come «gia emessa» solo una riga che porta un
    **numero**, che nasce dalla sequenza e non si digita.

    E si ignorano gli **annullati**: un documento ritirato ha smesso di
    rappresentare quell'incasso, e restituirlo dichiarando successo consegnava
    alla famiglia un foglio che non vale piu.
  */
  const existing = await receiptClient().findFirst({
    where: {
      organization_id: context.organizationId,
      transaction_id: context.transaction.id,
      cancelled_at: null,
      NOT: { receipt_number: null },
    },
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

  /**
   * **Una riga viva ma senza numero: il posto occupato da un documento che
   * non esiste.**
   *
   * `receipts_transaction_unico` e unico fra le ricevute **vive** di un
   * incasso, e il controllo di idempotenza qui sopra ignora — giustamente —
   * quelle senza numero, perche una ricevuta senza numero non e stata emessa.
   * Le due regole insieme lasciavano uno stato senza uscita: una riga viva e
   * non numerata — che esiste nei dati piu vecchi, e che una scrittura
   * fallita a meta puo ancora produrre — non veniva riconosciuta, e la
   * `INSERT` che seguiva si infrangeva sull'indice.
   *
   * E si infrangeva **dopo** l'allocazione del numero: ogni clic ne bruciava
   * uno, la sequenza avanzava sul nulla, e l'incasso restava per sempre non
   * documentabile.
   *
   * Quella riga non e un documento: e un posto vuoto. Si riempie, invece di
   * tentare di mettergliene un secondo accanto.
   */
  const orfana = await receiptClient().findFirst({
    where: {
      organization_id: context.organizationId,
      transaction_id: context.transaction.id,
      cancelled_at: null,
      receipt_number: null,
    },
  });

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

  const colonne = {
      organization_id: context.organizationId,
      athlete_id: context.transaction.athlete_id,
      payment_id: context.transaction.payment_id,
      transaction_id: context.transaction.id,
      receipt_number: allocation.number,
      series: allocation.series,
      sequence: allocation.sequence,
      document_year: allocation.year,
      operation_type_code: declaredOperationTypeCodeOf(context),
      snapshot,
      issued_by: scope?.userId || null,
      issue_date: issueDate,
      amount,
      ...vatColumnsFor(context, Math.round(amount * 100)),
      description,
      status: "issued",
      method: context.transaction.payment_method,
      data: {
        source: "payment_transaction",
        transactionId: context.transaction.id,
        issuedBy: scope?.userId || null,
      },
      /*
        Le colonne che l'emissione non possiede si azzerano: la riga orfana
        viene dai dati vecchi o da una scrittura interrotta a meta, e cio che
        portava non e cio che il documento emesso adesso dichiara.
      */
      file_url: null,
      invoice_id: null,
      cancelled_at: null,
      cancelled_by: null,
      cancellation_reason: null,
      cancels_document_id: null,
  };

  if (orfana) {
    /*
      **Riempire una riga non e crearla, e l'indice non protegge piu.**

      Con la `INSERT` il perdente di una corsa si infrangeva rumorosamente su
      `receipts_transaction_unico`. Scrivendo invece **dentro** la riga
      orfana, due emissioni simultanee riuscivano tutte e due: la seconda
      sovrascriveva la prima, e il primo chiamante riceveva un documento
      completo — numero, fotografia, importo — che **nessuna riga porta**. La
      segreteria lo stampava, e nel registro non c'era.

      La condizione `receipt_number: null` nella `where` rimette la corsa dove
      stava: vince chi arriva primo, e chi perde non scrive niente e riceve il
      documento del vincitore invece di uno inesistente. Il numero che ha
      allocato resta bruciato, come per ogni tentativo fallito (ADR-0044).
    */
    const preso = await receiptClient().updateMany({
      where: { id: orfana.id, receipt_number: null, cancelled_at: null },
      data: colonne,
    });

    if (preso.count === 0) {
      const vinta = await receiptClient().findFirst({
        where: {
          organization_id: context.organizationId,
          transaction_id: context.transaction.id,
          cancelled_at: null,
          NOT: { receipt_number: null },
        },
      });
      if (vinta) return vinta;
      throw new Error(
        "Il documento di questo incasso e stato emesso da un'altra richiesta nello stesso istante: ricarica la pagina.",
      );
    }

    return receiptClient().findUnique({ where: { id: orfana.id } });
  }

  return creaDocumentoVivo(
    () => receiptClient().create({ data: colonne }),
    () =>
      receiptClient().findFirst({
        where: {
          organization_id: context.organizationId,
          transaction_id: context.transaction.id,
          cancelled_at: null,
          NOT: { receipt_number: null },
        },
      }),
  );
};

/**
 * **Chi perde una corsa riceve il documento del vincitore, non un 500 nudo.**
 *
 * L indice unico parziale arbitra correttamente due emissioni simultanee: una
 * scrive, l altra si infrange. Ma il perdente riceveva l errore grezzo di
 * Prisma — un vincolo violato, tradotto in «Operazione non riuscita» — mentre
 * cio che e successo e che il documento **c e**, e lo ha fatto qualcun altro
 * un istante prima. E la stessa cosa che l idempotenza avrebbe restituito se
 * la seconda richiesta fosse arrivata un millisecondo dopo.
 */
const creaDocumentoVivo = async (crea: () => Promise<any>, rileggi: () => Promise<any>) => {
  try {
    return await crea();
  } catch (error: any) {
    if (String(error?.code) !== "P2002") throw error;
    const vinto = await rileggi();
    if (vinto) return vinto;
    throw error;
  }
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

  const recipient = recipientOf(context);
  const decision = decideDocument({
    profile: context.profile,
    operationType: context.operationType,
    operationTypeSource: context.operationTypeSource,
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

  /*
    **Qui la simmetria con la ricevuta finisce, e lo dice lo schema.**

    Sulla ricevuta si filtra anche sul numero, perche `receipts.receipt_number`
    e nullabile e una riga senza numero e un posto vuoto e non un documento.
    `invoices.invoice_number` e invece `NOT NULL`: una fattura senza numero
    **non puo esistere**, e chiederlo a Prisma non e una guardia in piu — e un
    errore. `Argument \`invoice_number\` must not be null`, e ogni emissione
    di fattura cadeva.

    Il filtro era stato aggiunto per rendere questo lato uguale all'altro. I
    due lati sono diversi perche le due colonne lo sono, e la simmetria
    apparente costava l'intera funzione.
  */
  const existing = await invoiceClient().findFirst({
    where: {
      organization_id: context.organizationId,
      transaction_id: context.transaction.id,
      cancelled_at: null,
      /*
        **Non basta che una riga ci sia: dev'essere nata dalla sequenza.**

        Sul lato ricevuta questo filtro e il numero, che li puo mancare. Qui
        `invoice_number` e `NOT NULL` — e per un momento e sembrato che
        bastasse. Non basta: `NOT NULL` dice che una stringa c'e, non che
        quella stringa l'ha assegnata `allocateDocumentNumber`. Una bozza con
        numero digitato, o una riga importata, veniva riconosciuta come «gia
        emessa» e restituita **dichiarando successo**: la famiglia riceveva un
        documento con l'importo sbagliato e senza fotografia, e quell'incasso
        non poteva piu essere fatturato davvero.

        `sequence` la scrive solo la sequenza. E questa la prova.
      */
      NOT: { sequence: null },
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

  /*
    **E per la stessa ragione qui non c'e nessuna riga orfana da riempire.**

    Il caso che il lato ricevuta deve gestire — una riga viva e senza numero,
    che occupa il posto senza essere un documento — su `invoices` non esiste:
    la colonna e `NOT NULL`. Cercarla era la seconda meta dello stesso errore.
  */

  const allocation = await allocateDocumentNumber({
    organizationId: context.organizationId,
    kind: "invoice",
    series,
    year: documentYearOf(issueDate),
  });

  const amount = toPaymentAmount(context.transaction.amount);
  /*
    La descrizione predefinita segue l'intestatario, non l'abitudine: «Quota
    sportiva» su una fattura a uno sponsor sarebbe una riga sbagliata su un
    documento fiscale, che e la cosa che i documenti non perdonano.
  */
  const description =
    asText(input.description) ||
    (context.counterparty
      ? asText(context.operationType?.label) || "Sponsorizzazione"
      : `Quota ${context.charge?.description || "sportiva"}`.trim());

  const snapshot = buildSnapshotFor(context, {
    issueDate: new Date(issueDate),
    description,
    totalCents: Math.round(amount * 100),
  });
  snapshot.issuedByUserId = scope?.userId || null;

  const colonne = {
      organization_id: context.organizationId,
      athlete_id: context.transaction.athlete_id,
      payment_id: context.transaction.payment_id,
      transaction_id: context.transaction.id,
      invoice_number: allocation.number,
      series: allocation.series,
      sequence: allocation.sequence,
      document_year: allocation.year,
      operation_type_code: declaredOperationTypeCodeOf(context),
      snapshot,
      issued_by: scope?.userId || null,
      issue_date: issueDate,
      amount,
      ...vatColumnsFor(context, Math.round(amount * 100)),
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
      /* Come per la ricevuta: cio che l'emissione non dichiara non resta. */
      notes: null,
      cancelled_at: null,
      cancelled_by: null,
      cancellation_reason: null,
      cancels_document_id: null,
  };

  return creaDocumentoVivo(
    () => invoiceClient().create({ data: colonne }),
    () =>
      invoiceClient().findFirst({
        where: {
          organization_id: context.organizationId,
          transaction_id: context.transaction.id,
          cancelled_at: null,
          /*
            **La stessa prova che chiede il controllo di idempotenza.**

            Senza, la lettura di recupero restituiva **proprio la riga che il
            controllo aveva scartato**: una bozza col numero digitato occupa
            l'indice unico, quindi la `INSERT` si infrange di sicuro e il
            recupero consegna la bozza dichiarando successo — con l'importo
            sbagliato e senza fotografia. La guardia aggiunta sopra non
            riduceva il difetto: lo rendeva **certo**, e in piu bruciava un
            numero della sequenza a ogni tentativo.
          */
          NOT: { sequence: null },
        },
      }),
  );
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

  /*
    Il confine e il club **attivo**. Annullare un documento fiscale numerato e
    una scrittura definitiva, e la rotta che la chiama non aveva nemmeno un
    controllo di ruolo: il solo elenco dei club dell utente non e un confine.
    Vedi `src/lib/auth/active-club-boundary.ts`.
  */
  if (scope) assertActiveClub(scope, document.organization_id, "il documento");

  if (document.cancelled_at) {
    throw new Error("Questo documento e gia stato annullato");
  }

  /*
    **Una bozza non si annulla: si cancella.**

    Annullare risponde a «questo documento e uscito e non vale piu», e porta
    con se un numero che non torna disponibile. Una bozza non e uscita da
    nessuna parte, e annullarla la rendeva immutabile **e** non cancellabile —
    cioe la trasformava in una riga che nessuno puo piu ne correggere ne
    togliere, per un gesto che non voleva dire quello.
  */
  if (String(document.status ?? "").trim().toLowerCase() === "draft") {
    throw new Error(
      "Una bozza non si annulla: si cancella. L'annullamento e per un documento gia uscito, e il suo numero non torna disponibile.",
    );
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

