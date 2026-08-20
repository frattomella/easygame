import { NextResponse } from "next/server";
import {
  requireAuthenticatedUser,
  resolveOrganizationScopeForUser,
} from "@/lib/server/auth";
import { prisma } from "@/lib/server/prisma";
import { calculatePlatformFee } from "@/lib/payments/platform-fees";
import {
  getAvailableRegistrationPaymentMethods,
  normalizePaymentSettings,
} from "@/lib/payments/payment-config-utils";
import { getPaymentProviderDefinition } from "@/lib/payments/provider-registry";
import type { PaymentProviderKey } from "@/lib/payments/payment-types";

export const runtime = "nodejs";

type CheckoutRequestBody = {
  clubId?: string;
  paymentId?: string;
  amountCents?: number;
  description?: string;
  provider?: PaymentProviderKey;
  payer?: {
    id?: string;
    type?: string;
    name?: string;
    email?: string;
  };
  successUrl?: string;
  cancelUrl?: string;
};

const asRecord = (value: unknown): Record<string, any> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {};

const jsonError = (
  message: string,
  status = 400,
  details: Record<string, unknown> = {},
) => NextResponse.json({ data: null, error: { message, ...details } }, { status });

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

const hasRequiredProviderEnv = (provider: PaymentProviderKey) => {
  if (provider === "paypal") {
    return Boolean(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET);
  }

  return Boolean(process.env.STRIPE_SECRET_KEY);
};

export async function POST(request: Request) {
  try {
    const session = await requireAuthenticatedUser(request);
    if (!session) {
      return jsonError("Sessione non valida", 401);
    }

    const body = (await request.json().catch(() => ({}))) as CheckoutRequestBody;
    const clubId = String(body.clubId || "").trim();
    const provider = normalizeProvider(body.provider);
    const amountCents = Math.round(Number(body.amountCents || 0));

    if (!clubId) {
      return jsonError("Club non disponibile");
    }

    if (!provider) {
      return jsonError("Provider pagamento non valido");
    }

    if (!Number.isFinite(amountCents) || amountCents <= 0) {
      return jsonError("Importo pagamento non valido");
    }

    if (!String(body.successUrl || "").trim() || !String(body.cancelUrl || "").trim()) {
      return jsonError("URL successo/annullo obbligatori");
    }

    const scope = await resolveOrganizationScopeForUser(
      session.db.user_id,
      request.headers.get("x-active-club-id") || clubId,
    );
    if (!scope.allowedOrganizationIds.includes(clubId)) {
      return jsonError("Accesso negato al club", 403);
    }

    const club = await prisma.club.findUnique({
      where: { id: clubId },
      select: { settings: true },
    });
    if (!club) {
      return jsonError("Club non trovato", 404);
    }

    const settings = normalizePaymentSettings(
      asRecord(club.settings).paymentSettings,
    );
    const providerConfig = settings.providers[provider];
    const availableMethods = getAvailableRegistrationPaymentMethods(settings);
    const isAvailable = availableMethods.some(
      (method) => method.provider === provider,
    );

    if (!settings.enabled || !isAvailable) {
      return jsonError(
        "Provider non abilitato o non configurato per le iscrizioni",
        400,
        {
          provider,
          status: providerConfig?.status || "not_configured",
        },
      );
    }

    const fee = calculatePlatformFee({
      amountCents,
      percent: settings.platformFeePercent,
      fixedCents: settings.platformFeeFixedCents,
    });
    const definition = getPaymentProviderDefinition(provider);
    const metadata = {
      clubId,
      paymentId: body.paymentId || null,
      provider,
      description: String(body.description || "").trim(),
      payer: body.payer || null,
      currency: settings.currency,
      platformFeePercent: settings.platformFeePercent,
      platformFeeFixedCents: settings.platformFeeFixedCents || 0,
      grossAmountCents: fee.grossAmountCents,
      platformFeeAmountCents: fee.platformFeeCents,
      netAmountCents: fee.clubNetAmountCents,
    };

    if (!definition.isImplemented || !hasRequiredProviderEnv(provider)) {
      return NextResponse.json(
        {
          data: {
            checkoutUrl: null,
            provider,
            metadata,
          },
          error: {
            message:
              "Provider non ancora configurato per il checkout online.",
          },
        },
        { status: 501 },
      );
    }

    // TODO: creare una Checkout Session reale lato server quando il PSP e configurato.
    return NextResponse.json(
      {
        data: {
          checkoutUrl: null,
          provider,
          metadata,
        },
        error: {
          message: "Checkout reale non ancora implementato per questo provider.",
        },
      },
      { status: 501 },
    );
  } catch (error: any) {
    console.error("[payments/create-checkout-session]", error);
    return jsonError(
      error?.message || "Errore nella creazione della sessione checkout",
      500,
    );
  }
}
