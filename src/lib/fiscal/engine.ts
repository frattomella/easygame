/**
 * Il **motore fiscale**: quale documento propone EasyGame, e perche.
 *
 * **Cosa fa, in una riga.** Prende tre cose — il profilo fiscale del soggetto,
 * il tipo di operazione, la configurazione — e restituisce *una proposta* con
 * la sua motivazione. Non emette niente e non decide niente in via definitiva:
 * chi emette resta una persona, e la proposta e li per farle risparmiare la
 * domanda, non per sostituirla.
 *
 * **La regola piu importante di tutto il Blocco D sta qui.** Un incasso **non
 * diventa** una fattura. Se questo motore trasformasse ogni movimento di
 * denaro in un adempimento, produrrebbe fatture che nessuno doveva emettere —
 * per la maggioranza delle ASD, tutte — e lo farebbe con l'aria della
 * competenza. Il valore predefinito e quindi il piu conservativo: ricevuta, o
 * nessun documento.
 *
 * **Cosa questo motore non fara mai.** Dedurre un'aliquota, un'esenzione o una
 * natura IVA da una sigla. Se la configurazione non le dichiara, la proposta
 * dice che non sono dichiarate, e chi emette lo vede. Un software che
 * *indovina* una natura IVA e un software che fa sbagliare qualcuno con
 * sicurezza. Vedi ADR-0052.
 *
 * Modulo **puro**.
 */

import {
  DOCUMENT_ROUTE_LABELS,
  type DocumentRoute,
  type NormalizedOperationType,
} from "./operation-types";
import {
  missingForInvoicing,
  type FiscalProfile,
} from "./fiscal-profile";

export type FiscalRecipientSummary = {
  name: string;
  fiscalCode?: string | null;
  vatNumber?: string | null;
  recipientCode?: string | null;
  address?: string | null;
  city?: string | null;
  postalCode?: string | null;
  province?: string | null;
  country?: string | null;
};

export type FiscalDecision = {
  /** Cosa si propone di emettere. */
  route: DocumentRoute;
  /** I documenti che l'interfaccia deve offrire, in ordine di proposta. */
  allowed: Array<"receipt" | "invoice">;
  /** Quale offrire come predefinito. `null` quando non se ne propone nessuno. */
  suggested: "receipt" | "invoice" | null;
  /** Perche, in italiano. Compare accanto al pulsante. */
  reason: string;
  /**
   * Cio che manca per emettere la **fattura**.
   *
   * Riguarda solo la fattura perche solo la fattura ha requisiti: una ricevuta
   * si emette con i dati che ci sono — rifiutarsi vorrebbe dire non
   * documentare un incasso che e avvenuto. Vuoto quando `allowed` non
   * comprende la fattura.
   */
  blockers: string[];
  /**
   * Vero quando la configurazione non dice abbastanza e la proposta e
   * conservativa per difetto. L'interfaccia lo segnala: e un invito a
   * configurare, non un errore.
   */
  needsConfiguration: boolean;
};

const asText = (value: unknown) => String(value ?? "").trim();

/**
 * Cosa manca all'**intestatario** perche una fattura sia emettibile.
 *
 * Separata da quella dell'emittente perche le due mancanze le risolvono
 * persone diverse: l'una la segreteria sulla propria anagrafica, l'altra
 * chiedendo i dati alla famiglia o allo sponsor.
 */
const missingRecipientFields = (recipient: FiscalRecipientSummary): string[] => {
  const missing: string[] = [];

  if (!asText(recipient?.name)) missing.push("intestatario");
  if (!asText(recipient?.fiscalCode) && !asText(recipient?.vatNumber)) {
    missing.push("codice fiscale o partita IVA dell'intestatario");
  }
  if (!asText(recipient?.address)) missing.push("indirizzo dell'intestatario");
  if (!asText(recipient?.city)) missing.push("comune dell'intestatario");
  if (!asText(recipient?.postalCode)) missing.push("CAP dell'intestatario");

  return missing;
};

/**
 * La proposta documentale per un incasso.
 *
 * `operationType` puo essere `null`: succede quando si registra un incasso
 * senza classificarlo, che e ammesso perche costringere una segreteria a
 * classificare prima di incassare significherebbe rallentare il momento in cui
 * arriva il denaro. In quel caso la proposta e ricevuta, e si dichiara che
 * manca la classificazione.
 */
export const decideDocument = (input: {
  profile: FiscalProfile;
  operationType: NormalizedOperationType | null;
  recipient?: FiscalRecipientSummary | null;
}): FiscalDecision => {
  const recipient = input.recipient || { name: "" };
  const issuerMissing = missingForInvoicing(input.profile);

  /**
   * Cosa impedisce **la fattura**, da qualunque delle due parti.
   *
   * Si calcola una volta sola e vale per tutte le diramazioni: un requisito
   * controllato in un ramo e dimenticato nell'altro e esattamente il modo in
   * cui una fattura senza codice fiscale finisce emessa.
   */
  const invoiceBlockers = [
    ...issuerMissing.map((entry) => `emittente: ${entry}`),
    ...missingRecipientFields(recipient).map(
      (entry) => `intestatario: ${entry}`,
    ),
  ];

  /*
    Operazione non classificata. Si **propone** la ricevuta — che e il
    documento che non afferma nulla di piu di quel che si sa — ma non si vieta
    la fattura: EasyGame non sa cosa sia quell'incasso, e da «non lo so» non
    segue «non si puo». Chi emette sa, e resta libero di scegliere; il segnale
    `needsConfiguration` invita a classificare, che e il modo per non doverlo
    piu decidere ogni volta.
  */
  if (!input.operationType) {
    return {
      route: "invoice_or_receipt",
      allowed: ["receipt", "invoice"],
      suggested: "receipt",
      reason:
        "L'operazione non e classificata: si propone una ricevuta, che attesta l'incasso senza affermare nulla di fiscale.",
      blockers: invoiceBlockers,
      needsConfiguration: true,
    };
  }

  const operation = input.operationType;

  if (operation.documentRoute === "none") {
    return {
      route: "none",
      allowed: [],
      suggested: null,
      reason: `«${operation.label}» e configurata per non produrre documenti fiscali.`,
      blockers: [],
      needsConfiguration: false,
    };
  }

  /*
    La classificazione dice che qui ci vuole una fattura. Se manca qualcosa non
    si ripiega in silenzio sulla ricevuta: sarebbero due documenti diversi, e
    ripiegare senza dirlo trasformerebbe un dato mancante in un adempimento
    omesso di cui nessuno si accorge.
  */
  if (operation.documentRoute === "invoice") {
    return {
      route: "invoice",
      allowed: ["invoice"],
      suggested: invoiceBlockers.length ? null : "invoice",
      reason: invoiceBlockers.length
        ? `«${operation.label}» richiede una fattura, ma non tutti i dati necessari sono disponibili.`
        : `«${operation.label}» e un'operazione verso un altro soggetto economico: richiede una fattura.`,
      blockers: invoiceBlockers,
      needsConfiguration: operation.activityScope === "unspecified",
    };
  }

  if (operation.documentRoute === "invoice_or_receipt") {
    return {
      route: "invoice_or_receipt",
      /*
        La ricevuta e prima nell'ordine e come proposta. Non e una gerarchia
        fiscale: e che fra i due il documento che non afferma nulla di piu di
        quel che si sa e la ricevuta, e in caso di dubbio si sceglie quello.
      */
      allowed: ["receipt", "invoice"],
      suggested: "receipt",
      reason: invoiceBlockers.length
        ? `«${operation.label}» ammette entrambi; per la fattura mancano dei dati.`
        : `«${operation.label}» ammette sia la fattura sia la ricevuta: sceglie chi emette.`,
      blockers: invoiceBlockers,
      needsConfiguration:
        operation.vatRate === null && operation.activityScope === "commercial",
    };
  }

  return {
    route: "receipt",
    allowed: ["receipt"],
    suggested: "receipt",
    reason: `«${operation.label}» e configurata per produrre una ricevuta.`,
    blockers: [],
    needsConfiguration: false,
  };
};

export const describeDocumentRoute = (route: DocumentRoute) =>
  DOCUMENT_ROUTE_LABELS[route];

/* ------------------------------------------------------------- il bollo */

/**
 * Se un documento deve portare l'imposta di bollo, secondo la configurazione
 * del club.
 *
 * **Perche la soglia e configurazione e non una costante.** L'importo e la
 * soglia dell'imposta di bollo cambiano per legge, e una costante dentro il
 * codice significherebbe un rilascio del software per una modifica normativa.
 * Il giorno in cui cambiano, si cambia un numero nel profilo fiscale.
 */
export const resolveStampDuty = (input: {
  profile: FiscalProfile;
  amountCents: number;
  /** Vero se l'operazione e imponibile IVA: il bollo non si applica. */
  vatApplied?: boolean;
}) => {
  const settings = input.profile.stampDuty;
  const amountCents = Math.max(0, Math.round(Number(input.amountCents) || 0));

  if (!settings.enabled || input.vatApplied) {
    return { applies: false, amountCents: 0, chargedTo: settings.chargedTo };
  }

  const applies = amountCents > settings.thresholdCents;

  return {
    applies,
    amountCents: applies ? settings.amountCents : 0,
    chargedTo: settings.chargedTo,
  };
};
