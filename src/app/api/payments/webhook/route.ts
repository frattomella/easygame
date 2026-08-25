import { NextResponse } from "next/server";
import {
  handleCediPayWebhookEvent,
  type WebhookOutcome,
} from "@/lib/server/cedipay";
import {
  CediPayError,
  getCediPayProvider,
  isCediPayProviderKey,
} from "@/lib/payments/cedipay";

/**
 * L'endpoint che ascolta il provider di pagamento.
 *
 *   POST /api/payments/webhook?provider=stripe
 *
 * **E l'unica superficie di EasyGame che puo far comparire denaro.** Non ha
 * sessione, non ha ruolo, e chiunque puo mandarci una richiesta. Tre cose,
 * nell'ordine, sono cio che la rende difendibile:
 *
 * 1. **il corpo si legge grezzo.** La firma copre i byte esatti: se il corpo
 *    viene interpretato e riserializzato prima della verifica, la verifica
 *    fallisce sempre — e chi la sistema e tentato di toglierla;
 * 2. **la firma si verifica prima di guardare dentro.** Cio che sta nel
 *    corpo non e informazione finche non e firmato: e testo che qualcuno ha
 *    mandato;
 * 3. **l'evento si deduplica.** Stripe riprova per tre giorni finche non
 *    riceve un 2xx, e un rinvio manuale e a un clic di distanza. Senza
 *    memoria, la seconda consegna incassa una seconda volta.
 *
 * **Perche un errore non spiega niente.** Le risposte negative dicono che
 * l'evento non e stato accettato e non quale controllo non ha superato:
 * spiegarlo a chi ha mandato la richiesta e spiegarlo a chi sta provando.
 * Il motivo sta nei log dell'applicazione.
 *
 * **Perche un errore interno risponde 500 e non 200.** Un 2xx dice al
 * provider «ricevuto, non riprovare». Se l'incasso non e stato registrato per
 * un problema nostro, quel messaggio e falso e l'incasso si perde: meglio un
 * 500, che fa ritentare.
 */

export const runtime = "nodejs";

const rejected = (status: number) =>
  NextResponse.json(
    { received: false, error: { message: "Evento non accettato" } },
    { status },
  );

const readWebhookSecret = (provider: string) => {
  if (provider === "stripe") {
    return String(process.env.STRIPE_WEBHOOK_SECRET || "").trim();
  }
  if (provider === "paypal") {
    return String(process.env.PAYPAL_WEBHOOK_SECRET || "").trim();
  }
  return "";
};

export async function POST(request: Request) {
  const url = new URL(request.url);
  const providerKey =
    url.searchParams.get("provider") ||
    request.headers.get("x-payment-provider") ||
    "stripe";

  if (!isCediPayProviderKey(providerKey)) {
    return rejected(400);
  }

  const provider = getCediPayProvider(providerKey);
  const secret = readWebhookSecret(providerKey);

  /*
    Senza adapter o senza segreto non si puo verificare niente, quindi non si
    puo credere a niente. Il 503 dice al provider che il problema e qui e che
    vale la pena riprovare: un 200 gli direbbe che l'evento e stato preso in
    carico, e l'evento andrebbe perso.
  */
  if (!provider || !secret) {
    return NextResponse.json(
      {
        received: false,
        error: { message: "Ricezione pagamenti non configurata" },
      },
      { status: 503 },
    );
  }

  /* Grezzo, e prima di qualunque altra cosa. Vedi il punto 1 in testa. */
  const rawBody = await request.text();
  const signature =
    request.headers.get("stripe-signature") ||
    request.headers.get("paypal-transmission-sig") ||
    "";

  let outcome: WebhookOutcome;

  try {
    const event = provider.parseWebhook({ rawBody, signature, secret });
    outcome = await handleCediPayWebhookEvent(event);
  } catch (error: any) {
    if (error instanceof CediPayError && error.code === "invalid_signature") {
      console.warn("[payments/webhook] firma rifiutata", {
        provider: providerKey,
        reason: error.message,
      });
      return rejected(400);
    }

    /*
      Nel log finiscono il provider e il messaggio, mai il corpo: contiene
      l'email di chi paga, l'importo e i riferimenti dell'account connesso.
    */
    console.error("[payments/webhook] evento non elaborato", {
      provider: providerKey,
      message: String(error?.message || error),
    });

    return NextResponse.json(
      { received: false, error: { message: "Evento non elaborato" } },
      { status: 500 },
    );
  }

  return NextResponse.json({
    received: true,
    provider: providerKey,
    duplicate: outcome.duplicate,
    status: outcome.status,
    message: outcome.message,
  });
}
