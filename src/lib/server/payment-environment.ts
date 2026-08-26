/**
 * L'**ambiente di pagamento** di questo deployment, e il filtro che ne
 * discende.
 *
 * **Perche e un modulo di `server/` e non del dominio.** La regola — quale
 * evento appartiene a quale mondo — e pura e sta in
 * [`live-mode.ts`](../payments/live-mode.ts), dove si prova con stringhe e
 * booleani. Qui c'e la sola parte che non puo essere pura: **leggere le
 * variabili d'ambiente**. Tenerle separate serve a poter collaudare la regola
 * senza un ambiente, che e la ragione per cui la regola esiste.
 *
 * **Perche la chiave vince su `PAYMENT_MODE`.** La chiave segreta e cio che
 * regola le chiamate **in uscita**: se le due dichiarazioni divergono, e la
 * variabile a essere rimasta indietro, e credere alla variabile vorrebbe dire
 * accettare eventi di un mondo mentre si parla con l'altro. `PAYMENT_MODE`
 * resta il ripiego per quando la chiave non e riconoscibile.
 *
 * Lo usano **entrambi** i flussi di ADR-0051 — gli incassi delle famiglie e gli
 * abbonamenti di piattaforma — perche condividono la chiave segreta e quindi
 * l'ambiente, pur non condividendo il segreto di firma.
 */

import {
  checkEventEnvironment,
  resolveExpectedEnvironment,
  type EnvironmentVerdict,
  type PaymentEnvironment,
} from "@/lib/payments/live-mode";

export type { EnvironmentVerdict, PaymentEnvironment };

/**
 * L'ambiente che questo deployment si aspetta di sentire.
 *
 * Non e memorizzato: le variabili si possono cambiare senza ricostruire, e un
 * valore congelato al primo caricamento sopravviverebbe alla rotazione di una
 * chiave.
 */
export const readExpectedPaymentEnvironment = (): PaymentEnvironment =>
  resolveExpectedEnvironment({
    secretKey: process.env.STRIPE_SECRET_KEY,
    declaredMode: process.env.PAYMENT_MODE,
  });

/**
 * Se un evento appena verificato appartiene a questo ambiente.
 *
 * Si chiama **prima** di deduplicare e prima di qualunque scrittura. L'ordine
 * non e un dettaglio di stile: se un evento dell'ambiente sbagliato occupasse
 * una riga nella memoria degli eventi gia visti, il rinvio dello **stesso
 * identificativo** nell'ambiente giusto risulterebbe un duplicato e verrebbe
 * scartato senza registrare l'incasso.
 */
export const checkWebhookEnvironment = (
  liveMode: unknown,
): EnvironmentVerdict =>
  checkEventEnvironment({
    liveMode,
    expected: readExpectedPaymentEnvironment(),
  });
