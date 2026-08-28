import { apiRequest } from "./client";
import type {
  PaymentReminderOutcome,
  PaymentReminderPreview,
} from "@/lib/server/payment-reminders";

/**
 * Trasporto del sollecito degli insoluti. Sta qui e non nei componenti:
 * nessun `fetch` diretto a `/api` da un componente (CLAUDE.md, sezione 2).
 *
 * **Perche importa i tipi da `src/lib/server/`.** Sono `type` puri, cancellati
 * alla compilazione: nessun modulo server finisce nel bundle del browser, e in
 * cambio la forma della risposta e la stessa dichiarata dal dominio invece di
 * una copia che diverge al primo campo aggiunto.
 */

export type {
  PaymentReminderOutcome,
  PaymentReminderPreview,
} from "@/lib/server/payment-reminders";

const unwrap = <T>(envelope: { data: T; error: { message: string } | null }) => {
  if (envelope.error) {
    throw new Error(envelope.error.message);
  }
  return envelope.data;
};

/** Chi riceverebbe il sollecito, chi no e perche. Non manda niente. */
export const previewPaymentReminders = async (chargeIds: string[]) =>
  unwrap(
    await apiRequest<PaymentReminderPreview>("/api/v1/payment-reminders", {
      method: "POST",
      body: { charge_ids: chargeIds, preview: true },
    }),
  );

/** Esegue il sollecito e restituisce l'esito **per destinatario**. */
export const sendPaymentReminders = async (chargeIds: string[]) =>
  unwrap(
    await apiRequest<PaymentReminderOutcome>("/api/v1/payment-reminders", {
      method: "POST",
      body: { charge_ids: chargeIds },
    }),
  );
