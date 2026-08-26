import { NextResponse } from "next/server";
import {
  parsePlatformBillingWebhook,
  PLATFORM_BILLING_EVENT_TYPES,
} from "@/lib/payments/billing/stripe-billing";
import { handlePlatformBillingEvent } from "@/lib/server/platform-billing";
import { PaymentGatewayError } from "@/lib/payments/gateway";

/**
 * L'endpoint che ascolta il flusso **Cedi Soft -> Club**.
 *
 *   POST /api/billing/webhook
 *
 * **Perche non e lo stesso endpoint degli incassi.** Perche sono due account
 * Stripe con **due segreti di firma diversi**. Un endpoint solo avrebbe dovuto
 * provare entrambi i segreti su ogni richiesta: e quando una firma si verifica
 * con «uno dei due segreti», non si sa piu quale flusso ha parlato — e un
 * abbonamento di piattaforma trattato come un incasso di club e un errore
 * contabile che nessuno cercherebbe li. Vedi ADR-0051.
 *
 * Il resto vale identico all'altro endpoint, e per le stesse ragioni: corpo
 * grezzo, firma prima di guardare dentro, deduplica sull'identificativo
 * dell'evento, nessun motivo nella risposta negativa, 500 su errore nostro
 * perche il provider riprovi.
 */

export const runtime = "nodejs";

const rejected = (status: number) =>
  NextResponse.json(
    { received: false, error: { message: "Evento non accettato" } },
    { status },
  );

/**
 * Il segreto del flusso di piattaforma.
 *
 * **Variabile distinta da quella degli incassi.** Riusare `STRIPE_WEBHOOK_SECRET`
 * per entrambi renderebbe impossibile ruotarne uno solo, e trasformerebbe una
 * rotazione di routine in una finestra in cui il flusso sbagliato smette di
 * funzionare.
 */
const readSecret = () =>
  String(process.env.STRIPE_BILLING_WEBHOOK_SECRET || "").trim();

export async function POST(request: Request) {
  const secret = readSecret();

  if (!secret) {
    /*
      Il 503 dice al provider che il problema e qui e che vale la pena
      riprovare. Un 200 gli direbbe che l'evento e stato preso in carico, e
      l'evento andrebbe perso.
    */
    return NextResponse.json(
      {
        received: false,
        error: { message: "Ricezione billing non configurata" },
      },
      { status: 503 },
    );
  }

  /* Grezzo, e prima di qualunque altra cosa: la firma copre i byte esatti. */
  const rawBody = await request.text();
  const signature = request.headers.get("stripe-signature") || "";

  try {
    const event = parsePlatformBillingWebhook({ rawBody, signature, secret });

    /*
      Sottoscrivere solo cio che serve non basta: la sottoscrizione la
      configura una persona, e una persona puo selezionare mezza pagina di
      caselle. Qui gli eventi che non riguardano un abbonamento vengono
      accettati e ignorati, senza riempire la tabella e senza far riprovare
      Stripe.
    */
    if (
      !(PLATFORM_BILLING_EVENT_TYPES as readonly string[]).includes(event.type)
    ) {
      return NextResponse.json({
        received: true,
        ignored: true,
        message: "Tipo di evento non gestito da questo endpoint",
      });
    }

    const outcome = await handlePlatformBillingEvent(event);

    return NextResponse.json({
      received: true,
      duplicate: outcome.duplicate,
      status: outcome.status,
      message: outcome.message,
    });
  } catch (error: any) {
    if (
      error instanceof PaymentGatewayError &&
      error.code === "invalid_signature"
    ) {
      /*
        Nel log il motivo, nella risposta no: spiegare a chi ha mandato la
        richiesta quale controllo non ha superato e spiegarlo a chi sta
        provando.
      */
      console.warn("[billing/webhook] firma rifiutata", {
        reason: error.message,
      });
      return rejected(400);
    }

    console.error("[billing/webhook] evento non elaborato", {
      message: String(error?.message || error),
    });

    return NextResponse.json(
      { received: false, error: { message: "Evento non elaborato" } },
      { status: 500 },
    );
  }
}
