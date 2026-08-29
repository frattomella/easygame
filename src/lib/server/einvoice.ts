/**
 * La **fattura elettronica** lato server: si prepara, non si trasmette.
 *
 * **Cosa fa questo modulo, per intero.** Prende una fattura gia emessa,
 * costruisce il tracciato FatturaPA a partire dallo **snapshot** del documento
 * — non dall'anagrafica di oggi, che nel frattempo puo essere cambiata — lo
 * valida formalmente e lo conserva. Lo stato si ferma a `ready_to_send`.
 *
 * **Perche non si trasmette.** Perche non e stato scelto un intermediario
 * accreditato, e la trasmissione allo SdI non e una chiamata HTTP a un
 * indirizzo pubblico: richiede un canale accreditato, una firma e un
 * contratto. Il registro degli adapter e vuoto **per costruzione**, e
 * `canTransition` rifiuta ogni stato che presupponga un invio. Marcare
 * «trasmessa» una fattura che non e transitata dallo SdI farebbe credere a una
 * societa di aver adempiuto, e se ne accorgerebbe da una sanzione. Vedi
 * ADR-0053.
 *
 * **Cosa serve per accendere la trasmissione**, il giorno in cui si decide:
 * un file sotto `src/lib/fiscal/fatturapa/providers/`, una riga nel registro
 * degli adapter, e la configurazione in Platform Admin. Nient'altro in questo
 * modulo cambia.
 */

import { createHash } from "crypto";
import { prisma } from "./prisma";
import { getFiscalProfile } from "./fiscal-config";
import {
  readPlatformSetting,
  PLATFORM_SETTING_KEYS,
  type FiscalProviderSettings,
} from "./platform-settings";
import {
  buildEInvoiceXml,
  type EInvoiceLine,
  type EInvoiceRecipient,
} from "@/lib/fiscal/fatturapa/builder";
import { describeEInvoiceCapability } from "@/lib/fiscal/fatturapa/provider";
import {
  canTransition,
  type EInvoiceState,
} from "@/lib/fiscal/fatturapa/states";
import { readDocumentSnapshot } from "@/lib/documents/document-snapshot";
import { toPaymentAmount } from "@/lib/payments/installment-ledger";
import type { PaymentTransactionScope } from "./payment-transactions";

const asText = (value: unknown) => String(value ?? "").trim();

const invoiceClient = () => (prisma as any).invoice;
const transmissionClient = () => (prisma as any).eInvoiceTransmission;

const denied = (message: string) => new Error(`Accesso negato: ${message}`);

export type EInvoiceRecord = {
  invoiceId: string;
  organizationId: string;
  status: EInvoiceState;
  provider: string | null;
  fileName: string | null;
  payloadHash: string | null;
  validationErrors: Array<{ path: string; message: string }>;
  sdiIdentifier: string | null;
  transmittedAt: string | null;
  lastError: string | null;
};

const toRecord = (row: any, invoiceId: string, organizationId: string): EInvoiceRecord => ({
  invoiceId,
  organizationId,
  status: (asText(row?.status) || "draft") as EInvoiceState,
  provider: asText(row?.provider) || null,
  fileName: asText(row?.file_name) || null,
  payloadHash: asText(row?.payload_hash) || null,
  validationErrors: Array.isArray(row?.validation_errors)
    ? row.validation_errors
    : [],
  sdiIdentifier: asText(row?.sdi_identifier) || null,
  transmittedAt: row?.transmitted_at
    ? new Date(row.transmitted_at).toISOString()
    : null,
  lastError: asText(row?.last_error) || null,
});

/** Cosa EasyGame puo fare, adesso, con la fattura elettronica. */
export const getEInvoiceCapability = async () => {
  const settings = await readPlatformSetting<FiscalProviderSettings>(
    PLATFORM_SETTING_KEYS.fiscalProvider,
  );

  return {
    ...describeEInvoiceCapability({ providerKey: settings.providerKey }),
    environment: settings.environment,
  };
};

const loadInvoice = async (
  invoiceId: string,
  scope?: PaymentTransactionScope,
) => {
  const invoice = await invoiceClient().findUnique({
    where: { id: asText(invoiceId) },
  });

  if (!invoice) throw new Error("Fattura non trovata");

  if (
    scope &&
    !scope.allowedOrganizationIds.includes(String(invoice.organization_id))
  ) {
    throw denied("la fattura appartiene a un altro club");
  }

  return invoice;
};

/**
 * L'intestatario del tracciato, preso **dallo snapshot** del documento.
 *
 * **Perche non dall'anagrafica.** Perche il tracciato deve descrivere la
 * fattura che e stata emessa, non quella che si emetterebbe oggi. Se il
 * tutore ha cambiato indirizzo dopo l'emissione, l'XML con l'indirizzo nuovo
 * sarebbe un documento diverso da quello numerato e consegnato. Le colonne
 * sciolte restano il ripiego per le fatture emesse prima del Blocco D, che uno
 * snapshot non ce l'hanno.
 */
const recipientFromInvoice = (invoice: any): EInvoiceRecipient => {
  const snapshot = readDocumentSnapshot(invoice.snapshot);
  const source = snapshot?.recipient;

  return {
    name: asText(source?.name || invoice?.data?.recipientName),
    fiscalCode: asText(source?.fiscalCode || invoice.fiscal_code) || null,
    vatNumber: asText(source?.vatNumber || invoice.vat_number) || null,
    recipientCode:
      asText(source?.recipientCode || invoice.recipient_code) || null,
    pec: asText(source?.email) || null,
    address: asText(source?.address || invoice.address) || null,
    city: asText(source?.city || invoice.city) || null,
    postalCode: asText(source?.postalCode || invoice.postal_code) || null,
    province: asText(source?.province || invoice.province) || null,
    country: "IT",
    /*
      Una persona fisica senza partita IVA: il tracciato vuole nome e cognome
      separati, e non li si indovina da una stringa unica. Quando non si e
      certi si usa il blocco «denominazione», che e ammesso e non inventa.
    */
    isNaturalPerson: false,
  };
};

const linesFromInvoice = (invoice: any): EInvoiceLine[] => {
  const snapshot = readDocumentSnapshot(invoice.snapshot);
  const totalCents =
    snapshot?.amounts.totalCents ??
    Math.round(toPaymentAmount(invoice.amount) * 100);

  /*
    **La riga del tracciato porta l'imponibile, non il lordo.** Il costruttore
    somma le righe, ci aggiunge l'imposta calcolata dall'aliquota e ottiene
    `<ImportoTotaleDocumento>`: passargli il lordo su un documento al 22%
    dichiarerebbe un totale del 22% piu alto di quanto la famiglia ha pagato.
    L'imponibile e congelato sullo snapshot (W4-E); quando l'aliquota non e
    dichiarata resta `null`, e li lordo e imponibile coincidono perche non c'e
    imposta da aggiungere.
  */
  const lineCents = snapshot?.amounts.taxableAmountCents ?? totalCents;

  return [
    {
      description: asText(invoice.description) || "Quota sportiva",
      quantity: 1,
      unitPriceCents: lineCents,
      vatRate: snapshot?.amounts.vatRate ?? null,
      vatNature: snapshot?.amounts.vatNature ?? null,
    },
  ];
};

export type PrepareEInvoiceResult = {
  record: EInvoiceRecord;
  xml: string;
  /** Vero quando il tracciato non ha rilievi formali. */
  readyToSend: boolean;
  /** Cosa EasyGame puo fare adesso: oggi, non trasmettere. */
  capability: Awaited<ReturnType<typeof getEInvoiceCapability>>;
};

/**
 * Prepara il tracciato di una fattura.
 *
 * Idempotente nel senso che conta: rieseguirla su una fattura invariata
 * produce lo stesso XML e lo stesso `payload_hash`. Il numero non si consuma e
 * niente si duplica.
 */
export const prepareEInvoice = async (
  input: { invoiceId: string },
  scope?: PaymentTransactionScope,
): Promise<PrepareEInvoiceResult> => {
  const invoice = await loadInvoice(input.invoiceId, scope);
  const organizationId = String(invoice.organization_id);

  if (invoice.cancelled_at) {
    throw new Error(
      "Una fattura annullata non si trasmette: emetti il documento di rettifica",
    );
  }

  const [profile, capability, existing] = await Promise.all([
    getFiscalProfile(organizationId),
    getEInvoiceCapability(),
    transmissionClient().findUnique({ where: { invoice_id: invoice.id } }),
  ]);

  const currentState: EInvoiceState = (asText(existing?.status) ||
    "draft") as EInvoiceState;

  /*
    Una fattura gia trasmessa non si rigenera: il tracciato inviato e quello
    che lo SdI ha ricevuto, e riscriverlo qui farebbe divergere il nostro
    archivio dal loro. Oggi il caso non si presenta — non si trasmette — ma la
    regola vale da subito, perche il giorno in cui si trasmettera nessuno
    tornera a rileggerla.
  */
  const toGenerated = canTransition(currentState, "generated", {
    providerConfigured: capability.canTransmit,
  });

  if (currentState !== "draft" && currentState !== "generated" && !toGenerated.allowed) {
    throw new Error(toGenerated.allowed ? "" : toGenerated.reason);
  }

  /*
    Il progressivo del nome file segue la sequenza del documento, non un
    contatore proprio: due contatori si disallineano, e il nome file duplicato
    e uno degli scarti piu noiosi da diagnosticare.
  */
  const progressive = Math.max(1, Number(invoice.sequence) || 1);

  const built = buildEInvoiceXml({
    profile,
    document: {
      documentType: "TD01",
      number: asText(invoice.invoice_number),
      date: new Date(invoice.issue_date).toISOString().slice(0, 10),
      currency: "EUR",
      lines: linesFromInvoice(invoice),
      stampDutyCents:
        readDocumentSnapshot(invoice.snapshot)?.amounts.stampDutyCents || 0,
      notes: null,
    },
    recipient: recipientFromInvoice(invoice),
    progressive,
  });

  const payloadHash = createHash("sha256").update(built.xml, "utf8").digest("hex");

  /*
    `ready_to_send` e lo stato piu avanzato raggiungibile senza intermediario,
    e dichiara una cosa vera: il tracciato e completo. Non dichiara che sia
    stato inviato, e l'interfaccia lo dice a chiare lettere.
  */
  const nextStatus: EInvoiceState = built.formallyValid
    ? "ready_to_send"
    : "generated";

  const data = {
    organization_id: organizationId,
    provider: null,
    status: nextStatus,
    format: "FPR12",
    file_name: built.fileName,
    payload: built.xml,
    payload_hash: payloadHash,
    validation_errors: built.issues,
    last_error: null,
  };

  const row = await transmissionClient().upsert({
    where: { invoice_id: invoice.id },
    create: { invoice_id: invoice.id, ...data },
    update: data,
  });

  return {
    record: toRecord(row, String(invoice.id), organizationId),
    xml: built.xml,
    readyToSend: built.formallyValid,
    capability,
  };
};

/**
 * Lo stato della trasmissione di una fattura.
 *
 * Restituisce **anche** la capability, cosi l'interfaccia non deve chiederla a
 * parte per sapere se disegnare un pulsante attivo o una spiegazione.
 */
export const getEInvoiceStatus = async (
  input: { invoiceId: string },
  scope?: PaymentTransactionScope,
) => {
  const invoice = await loadInvoice(input.invoiceId, scope);
  const [row, capability] = await Promise.all([
    transmissionClient().findUnique({ where: { invoice_id: invoice.id } }),
    getEInvoiceCapability(),
  ]);

  return {
    record: toRecord(row, String(invoice.id), String(invoice.organization_id)),
    capability,
    invoice: {
      id: String(invoice.id),
      number: asText(invoice.invoice_number),
      isElectronic: Boolean(invoice.is_electronic),
      cancelledAt: invoice.cancelled_at
        ? new Date(invoice.cancelled_at).toISOString()
        : null,
    },
  };
};

/**
 * La trasmissione vera e propria.
 *
 * **Esiste per dire di no in un posto solo.** Senza questa funzione, ogni
 * chiamante avrebbe dovuto ricordarsi di controllare che un intermediario ci
 * fosse, e prima o poi uno se ne sarebbe dimenticato. Il giorno in cui un
 * intermediario verra scelto, il corpo di questa funzione e l'unico posto che
 * cambia.
 */
export const transmitEInvoice = async (
  input: { invoiceId: string },
  scope?: PaymentTransactionScope,
): Promise<never> => {
  await loadInvoice(input.invoiceId, scope);
  const capability = await getEInvoiceCapability();

  throw new Error(capability.message);
};
