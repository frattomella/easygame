import type { FamilyCheckoutState, ParentPayment } from "@/services/api";

/**
 * Pagamenti Parent — dominio puro. Specchio minimo delle regole pure del
 * Web (`src/lib/athlete-payment-utils.ts`, `src/lib/payments/family-checkout.ts`):
 * `statusKey` ha solo tre valori macchina (`paid`/`pending`/`cancelled`), le
 * sfumature (scaduto, parziale) si leggono dall'etichetta italiana `status`
 * che il server gia scrive — mai ricalcolate da un orologio locale (spec
 * `PaymentCard` v2.2, §C3: "must not derive 'overdue' from a client
 * clock").
 */

export type PaymentCardState =
  | "due"
  | "partially_paid"
  | "paid"
  | "overdue"
  | "cancelled";

/** Una rata e "pagabile" — specchio di `isPayableAthletePayment`: non pagata, non annullata, importo positivo, non esclusa dai totali. */
export function isPayableParentPayment(payment: ParentPayment): boolean {
  if (payment.statusKey === "paid" || payment.statusKey === "cancelled") {
    return false;
  }
  if (!(payment.amount > 0)) {
    return false;
  }
  if (payment.data && (payment.data as any).excludedFromTotals === true) {
    return false;
  }
  return true;
}

/** La prima rata pagabile, nell'ordine in cui il server le restituisce — specchio di `findFirstPayableAthletePayment`. */
export function findFirstPayableParentPayment(
  items: ParentPayment[],
): ParentPayment | null {
  return items.find(isPayableParentPayment) || null;
}

/**
 * Lo stato che `PaymentCard` disegna, dedotto da `statusKey` + l'etichetta
 * italiana gia scritta dal server (la sola fonte delle sfumature — mai una
 * data confrontata con "oggi" qui).
 */
export function resolvePaymentCardState(
  payment: ParentPayment,
): PaymentCardState {
  if (payment.statusKey === "cancelled") return "cancelled";
  if (payment.statusKey === "paid") return "paid";

  const label = payment.status.toLowerCase();
  if (label.includes("scadut")) return "overdue";
  if (payment.paidAmount > 0 && payment.paidAmount < payment.amount) {
    return "partially_paid";
  }
  return "due";
}

/**
 * `withPayableInstalment` lato Web: il canale di incasso del club puo
 * essere tecnicamente attivo ma non avere nulla da incassare in questo
 * momento — in quel caso il pulsante "Paga ora" si disabilita con un
 * motivo, non sparisce silenziosamente.
 */
export function resolveCheckoutAvailability(
  online: FamilyCheckoutState,
  hasPayablePayment: boolean,
): FamilyCheckoutState {
  if (online.available && !hasPayablePayment) {
    return {
      available: false,
      blocker: "nothing_due",
      message: "Nessuna rata da pagare al momento.",
    };
  }
  return online;
}

/**
 * Formato valuta fisso `it-IT` (spec `PaymentCard` v2.2): virgola
 * decimale, punto delle migliaia, simbolo finale dopo uno spazio
 * insecabile, sempre due decimali, mai abbreviato.
 */
export function formatParentCurrency(amount: number): string {
  const formatted = new Intl.NumberFormat("it-IT", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    useGrouping: true,
  }).format(amount);
  return `${formatted} €`;
}
