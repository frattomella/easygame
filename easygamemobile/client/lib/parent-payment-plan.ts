import type { FamilyFiscalDocument, ParentPayment } from "@/services/api";
import {
  isPayableParentPayment,
  resolvePaymentCardState,
} from "@/lib/parent-payments";

const readData = (payment: ParentPayment): Record<string, unknown> =>
  payment.data && typeof payment.data === "object"
    ? (payment.data as Record<string, unknown>)
    : {};

const text = (value: unknown) => String(value ?? "").trim();

/**
 * L'identita del piano di una rata, com'e nel payload reale di
 * `GET /api/parent-dashboard/[athleteId]`: le rate generate da un piano di
 * iscrizione portano `data.planId` / `data.planName` ("Quota annuale
 * pro-rata") e `data.installmentLabel` ("Pagamento unico", "Rata di
 * marzo"). `type` e il **metodo** ("Bonifico"), non il piano: e solo
 * l'ultimo ripiego per le righe del vecchio JSON dell'atleta che non hanno
 * altro.
 */
export function resolvePaymentPlanIdentity(payment: ParentPayment): {
  key: string;
  name: string;
  instalmentLabel: string;
} {
  const data = readData(payment);
  const planName = text(data.planName);
  const planId = text(data.planId ?? data.enrollmentPlanId);
  const key = (planId || planName || text(payment.type)).toLowerCase();
  return {
    key,
    name: planName || text(payment.type) || "Quota",
    instalmentLabel:
      text(data.installmentLabel) || text(payment.description) || "Rata",
  };
}

/**
 * Il "piano rate" del dettaglio pagamento (prototipo `instalments`): le
 * rate che appartengono allo stesso piano della rata aperta
 * (`resolvePaymentPlanIdentity`). Ordinate per scadenza, la rata aperta
 * compresa.
 */
export function resolvePaymentPlanInstalments(
  items: ParentPayment[],
  current: ParentPayment,
): ParentPayment[] {
  const planKey = resolvePaymentPlanIdentity(current).key;
  const siblings = planKey
    ? items.filter((item) => resolvePaymentPlanIdentity(item).key === planKey)
    : [current];
  const withCurrent = siblings.some((item) => item.id === current.id)
    ? siblings
    : [...siblings, current];
  return [...withCurrent].sort((a, b) =>
    String(a.dueDate || a.date || "").localeCompare(
      String(b.dueDate || b.date || ""),
    ),
  );
}

/** Quanto resta da versare su una rata pagabile (zero per una saldata o annullata). */
export function resolveRemainingAmount(payment: ParentPayment): number {
  if (!isPayableParentPayment(payment)) return 0;
  return Math.max(0, payment.amount - (payment.paidAmount || 0));
}

/**
 * "Scaduto da N giorni" — solo per una rata che il **server** ha gia
 * etichettato scaduta (`resolvePaymentCardState` legge l'etichetta, mai
 * l'orologio locale per decidere lo stato); qui il conteggio dei giorni e
 * un'informazione di lettura, non una decisione.
 */
export function describeDueDate(
  payment: ParentPayment,
  now: Date = new Date(),
): { label: string; urgent: boolean } {
  const state = resolvePaymentCardState(payment);
  if (state === "paid") {
    return {
      label: payment.paidAt
        ? `Pagata il ${formatShortDate(payment.paidAt)}`
        : "Saldata",
      urgent: false,
    };
  }
  if (state === "cancelled") {
    return { label: "Annullata", urgent: false };
  }
  if (!payment.dueDate) {
    return { label: "Nessuna scadenza", urgent: false };
  }
  if (state === "overdue") {
    const due = new Date(`${payment.dueDate}T00:00:00`);
    const days = Math.max(
      0,
      Math.floor((now.getTime() - due.getTime()) / 86400000),
    );
    return {
      label:
        days > 0
          ? `Scaduta da ${days} ${days === 1 ? "giorno" : "giorni"}`
          : "Scaduta oggi",
      urgent: true,
    };
  }
  return {
    label: `Scade il ${formatShortDate(payment.dueDate)}`,
    urgent: false,
  };
}

const formatShortDate = (iso: string) => {
  const parsed = new Date(iso.length <= 10 ? `${iso}T00:00:00` : iso);
  if (Number.isNaN(parsed.getTime())) return iso;
  return parsed.toLocaleDateString("it-IT", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
};

/** I documenti fiscali che riguardano una rata: stesso importo e descrizione, o stesso riferimento — il payload non porta un legame diretto. */
export function findFiscalDocumentsForPayment(
  payment: ParentPayment,
  documents: FamilyFiscalDocument[],
): {
  receipt: FamilyFiscalDocument | null;
  invoice: FamilyFiscalDocument | null;
} {
  const matches = (document: FamilyFiscalDocument) => {
    if (payment.reference && document.number === payment.reference) return true;
    const sameAmount = Math.abs(document.amount - payment.amount) < 0.005;
    // Il server intitola la ricevuta "Ricevuta <descrizione della rata>":
    // basta che la descrizione della rata sia contenuta in quella del documento.
    const paymentText = String(payment.description || "")
      .trim()
      .toLowerCase();
    const documentText = String(document.description || "")
      .trim()
      .toLowerCase();
    const sameText = Boolean(paymentText) && documentText.includes(paymentText);
    return sameAmount && sameText;
  };
  return {
    receipt:
      documents.find((doc) => doc.kind === "receipt" && matches(doc)) || null,
    invoice:
      documents.find((doc) => doc.kind === "invoice" && matches(doc)) || null,
  };
}
