import { cn } from "@/lib/utils";

/**
 * Il marchio Stripe, dove serve saperlo — e solo li.
 *
 * ## Perche esiste (RC Fix 2, punto 16)
 *
 * La scheda dei pagamenti online diceva «il provider» sette volte e non
 * nominava mai Stripe. Era una scelta deliberata — il registro dei provider
 * (`src/lib/payments/provider-registry.ts`) prevede che un domani ce ne sia
 * un altro — ma il risultato per chi guardava era una societa che non sapeva
 * a chi stesse per dare i propri dati bancari, e che si vedeva chiedere
 * documenti d'identita da un'azienda senza nome.
 *
 * Un intermediario di pagamento si dichiara. Non e branding: e la risposta
 * alla domanda «chi sta trattenendo il mio denaro».
 *
 * ## Dove **non** va messo
 *
 * Non su ogni rata, non su ogni movimento, non accanto a ogni importo. Nello
 * storico basta «Metodo: Stripe / Carta online»: il marchio serve dove si
 * decide di collegare un conto, non dove si legge un numero.
 *
 * ## Linee guida
 *
 * Il marchio non si modifica, non si ricolora e non si allunga: si scala.
 * Il viola e quello ufficiale (`#635BFF`) e vive in una sola costante, cosi
 * nessuno lo riscrive «quasi uguale» da un'altra parte.
 */

/** Il viola di Stripe. Una sola volta, qui. */
export const STRIPE_BRAND_COLOR = "#635BFF";

/**
 * Il logotipo Stripe.
 *
 * `role="img"` con un `aria-label`: senza, chi naviga a voce sente un blocco
 * grafico senza nome proprio dove sta il nome dell'intermediario.
 */
export function StripeWordmark({
  className,
  title = "Stripe",
}: {
  className?: string;
  title?: string;
}) {
  return (
    <svg
      viewBox="0 0 468 222.5"
      role="img"
      aria-label={title}
      className={cn("h-5 w-auto", className)}
      fill={STRIPE_BRAND_COLOR}
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M414 113.4c0-25.6-12.4-45.8-36.1-45.8-23.8 0-38.2 20.2-38.2 45.6 0 30.1 17 45.3 41.4 45.3 11.9 0 20.9-2.7 27.7-6.5v-20c-6.8 3.4-14.6 5.5-24.5 5.5-9.7 0-18.3-3.4-19.4-15.2h48.9c0-1.3.2-6.5.2-8.9zm-49.4-9.5c0-11.3 6.9-16 13.2-16 6.1 0 12.6 4.7 12.6 16h-25.8z" />
      <path d="M301.1 67.6c-9.8 0-16.1 4.6-19.6 7.8l-1.3-6.2h-22v116.6l25-5.3.1-28.3c3.6 2.6 8.9 6.3 17.7 6.3 17.9 0 34.2-14.4 34.2-46.1-.1-29-16.6-44.8-34.1-44.8zm-6 68.9c-5.9 0-9.4-2.1-11.8-4.7l-.1-37.1c2.6-2.9 6.2-4.9 11.9-4.9 9.1 0 15.4 10.2 15.4 23.3 0 13.4-6.2 23.4-15.4 23.4z" />
      <path d="M223.8 61.7l25.1-5.4V36l-25.1 5.3z" />
      <path d="M223.8 69.3h25.1v87.5h-25.1z" />
      <path d="M196.9 76.7l-1.6-7.4h-21.6v87.5h25V97.5c5.9-7.7 15.9-6.3 19-5.2v-23c-3.2-1.2-14.9-3.4-20.8 7.4z" />
      <path d="M146.9 47.6l-24.4 5.2-.1 80.1c0 14.8 11.1 25.7 25.9 25.7 8.2 0 14.2-1.5 17.5-3.3V135c-3.2 1.3-19 5.9-19-8.9V90.6h19V69.3h-19l.1-21.7z" />
      <path d="M79.3 94.7c0-3.9 3.2-5.4 8.5-5.4 7.6 0 17.2 2.3 24.8 6.4V72.2c-8.3-3.3-16.5-4.6-24.8-4.6C67.5 67.6 54 78.2 54 95.9c0 27.6 38 23.2 38 35.1 0 4.6-4 6.1-9.6 6.1-8.3 0-18.9-3.4-27.3-8v23.8c9.3 4 18.7 5.7 27.3 5.7 20.8 0 35.1-10.3 35.1-28.2-.1-29.8-38.2-24.5-38.2-35.7z" />
    </svg>
  );
}

/**
 * Marchio e stato del collegamento, in una riga.
 *
 * Le due cose stanno insieme perche insieme rispondono all'unica domanda che
 * qualcuno si pone aprendo questa scheda: **chi incassa, e funziona.**
 */
export function StripeBrandBadge({
  connected,
  className,
}: {
  connected: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-2.5 py-1.5",
        className,
      )}
    >
      <StripeWordmark className="h-4" />
      <span className="h-4 w-px bg-slate-200" aria-hidden />
      <span
        className={cn(
          "text-xs font-medium",
          connected ? "text-emerald-700" : "text-slate-500",
        )}
      >
        {connected ? "Collegato" : "Non collegato"}
      </span>
    </span>
  );
}
