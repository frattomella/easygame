import { NextResponse } from "next/server";
import type { PaymentProviderKey } from "@/lib/payments/payment-types";

export const runtime = "nodejs";

const normalizeProvider = (value: unknown): PaymentProviderKey | null => {
  const provider = String(value || "").trim().toLowerCase();
  if (
    provider === "paypal" ||
    provider === "postepay" ||
    provider === "mastercard"
  ) {
    return provider;
  }

  return null;
};

const hasWebhookSecret = (provider: PaymentProviderKey) => {
  if (provider === "paypal") {
    return Boolean(process.env.PAYPAL_WEBHOOK_SECRET);
  }

  return Boolean(process.env.STRIPE_WEBHOOK_SECRET);
};

export async function POST(request: Request) {
  const url = new URL(request.url);
  const provider = normalizeProvider(
    url.searchParams.get("provider") ||
      request.headers.get("x-payment-provider"),
  );

  if (!provider) {
    return NextResponse.json(
      { received: false, error: { message: "Provider webhook non valido" } },
      { status: 400 },
    );
  }

  const payload = await request.text();
  const signature =
    request.headers.get("stripe-signature") ||
    request.headers.get("paypal-transmission-sig") ||
    "";

  if (!hasWebhookSecret(provider)) {
    return NextResponse.json({
      received: false,
      provider,
      payloadBytes: payload.length,
      message: "Webhook pagamenti non configurato: secret provider assente.",
    });
  }

  if (!signature) {
    return NextResponse.json(
      {
        received: false,
        provider,
        error: { message: "Firma webhook mancante" },
      },
      { status: 400 },
    );
  }

  // TODO: verificare firma provider prima di processare eventi reali.
  // TODO: gestire payment succeeded, payment failed, refund, chargeback.
  // TODO: gestire subscription updated per Plus ed Extra HUB.
  return NextResponse.json(
    {
      received: true,
      provider,
      payloadBytes: payload.length,
      message: "Webhook ricevuto ma non processato: integrazione reale da completare.",
    },
    { status: 202 },
  );
}
