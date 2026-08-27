import { NextResponse } from "next/server";
import {
  requireAuthenticatedUser,
  resolveOrganizationScopeForUser,
} from "@/lib/server/auth";
import { isPlatformAdminUser } from "@/lib/platform-admin";
import { prisma } from "@/lib/server/prisma";
import {
  getClubPaymentAccount,
  resolveCheckoutReadiness,
  startConnectOnboarding,
} from "@/lib/server/connect-accounts";
import { resolveCommissionForClub } from "@/lib/server/platform-settings";
import { normalizePaymentSettings } from "@/lib/payments/payment-config-utils";
import { PaymentGatewayError } from "@/lib/payments/gateway";
import { AUDIT_ACTIONS, recordAuditEvent } from "@/lib/server/audit";

/**
 * Il **conto di incasso** visto dalla societa.
 *
 *   GET  /api/v1/payments/account?organization_id=…
 *   POST /api/v1/payments/account   `{ action: "onboarding_link", … }`
 *
 * **Cosa una societa puo sapere, e cosa puo fare.** Puo **vedere** lo stato del
 * proprio conto — attivo, in verifica, cosa manca — e la commissione che le
 * viene applicata: sono cose che la riguardano e nasconderle la manderebbe al
 * telefono. Puo **chiedere il link** di collegamento, perche i dati del
 * rappresentante legale li deve inserire il rappresentante legale, presso
 * Stripe, e non EasyGame per conto suo.
 *
 * **Cosa non puo fare, e il motivo per cui questa rotta esiste.** Non puo
 * scrivere l'identificativo dell'account, dichiararsi attiva, cambiare la
 * commissione ne accendersi il servizio. Fino al Blocco D poteva fare tutte e
 * quattro le cose da un campo di testo nella pagina Organizzazione: la
 * commissione era un numero suo, e il conto su cui finiva il denaro delle
 * famiglie pure. Vedi ADR-0050 e ADR-0051.
 *
 * Il link si chiede solo **dopo** che la piattaforma ha abilitato il servizio:
 * l'abilitazione e un atto commerciale, e non si concede da soli.
 */

export const runtime = "nodejs";

const unauthorized = () =>
  NextResponse.json(
    { data: null, error: { message: "Accesso negato: sessione assente" } },
    { status: 401 },
  );

const failure = (error: any, fallback: string) => {
  if (error instanceof PaymentGatewayError) {
    const status =
      error.code === "not_configured"
        ? 503
        : error.code === "merchant_not_ready"
          ? 409
          : 502;
    return NextResponse.json(
      { data: null, error: { message: error.message, code: error.code } },
      { status },
    );
  }

  const message = String(error?.message || fallback);
  const status = message.includes("Accesso negato")
    ? 403
    : message.includes("non trovato")
      ? 404
      : 400;

  return NextResponse.json({ data: null, error: { message } }, { status });
};

const resolveOrganization = async (
  request: Request,
  requested: string | null,
) => {
  const session = await requireAuthenticatedUser(request);
  if (!session) return { session: null, organizationId: "" };

  const scope = await resolveOrganizationScopeForUser(
    session.db.user_id,
    requested || request.headers.get("x-active-club-id"),
    request.headers.get("x-active-access-role"),
  );

  const organizationId = String(
    requested || scope.activeOrganizationId || "",
  ).trim();

  if (
    !isPlatformAdminUser(session.db.user) &&
    !scope.allowedOrganizationIds.includes(organizationId)
  ) {
    throw new Error("Accesso negato: il club non e fra quelli accessibili");
  }

  return { session, organizationId };
};

const readClubEnabled = async (organizationId: string) => {
  const club = await (prisma as any).club.findUnique({
    where: { id: organizationId },
    select: { settings: true },
  });

  const settings = normalizePaymentSettings(
    (club?.settings as any)?.paymentSettings,
  );

  return settings.enabled;
};

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const { session, organizationId } = await resolveOrganization(
      request,
      url.searchParams.get("organization_id"),
    );

    if (!session) return unauthorized();

    const clubEnabled = await readClubEnabled(organizationId);

    const [{ account, readiness }, commission] = await Promise.all([
      resolveCheckoutReadiness({
        organizationId,
        clubEnabled,
        isPlatformAdmin: isPlatformAdminUser(session.db.user),
      }),
      resolveCommissionForClub({ organizationId }),
    ]);

    return NextResponse.json({
      data: {
        organizationId,
        account: {
          /*
            Lo stato e i requisiti si mostrano; l'identificativo dell'account
            no. Alla segreteria non serve, e in elenco sarebbe rumore fra le
            cose che invece deve leggere.
          */
          state: account.state,
          /*
            **Chi** e l'intermediario, per nome (RC Fix 2, punto 16). La scheda
            diceva «il provider» e non lo nominava mai: una societa che sta per
            dare i propri dati bancari e a cui vengono chiesti documenti
            d'identita ha diritto di sapere a chi. Arriva dal record e non e
            scritto nella pagina, perche il registro dei provider prevede che
            un domani non sia Stripe.
          */
          provider: account.provider,
          chargesEnabled: account.chargesEnabled,
          payoutsEnabled: account.payoutsEnabled,
          requirements: account.requirements,
          onlinePaymentsEnabled: account.onlinePaymentsEnabled,
          connected: Boolean(account.externalAccountId),
          lastSyncedAt: account.lastSyncedAt,
        },
        readiness,
        clubEnabled,
        /* Sola lettura: la decide Cedi Soft, e la societa deve poterla vedere. */
        commission: {
          percent: commission.percent,
          fixedCents: commission.fixedCents,
          effectiveFrom: commission.effectiveFrom,
        },
      },
      error: null,
    });
  } catch (error) {
    return failure(error, "Errore nella lettura del conto di incasso");
  }
}

export async function POST(request: Request) {
  try {
    const raw = (await request.json().catch(() => ({}))) as Record<string, any>;
    const { session, organizationId } = await resolveOrganization(
      request,
      raw.organization_id || raw.organizationId || null,
    );

    if (!session) return unauthorized();

    if (String(raw.action || "") !== "onboarding_link") {
      return failure(new Error("Operazione non riconosciuta"), "");
    }

    const account = await getClubPaymentAccount(organizationId);

    /*
      L'abilitazione e un atto commerciale della piattaforma. Senza, la societa
      si troverebbe a completare un onboarding presso Stripe per un servizio
      che non le e stato venduto — e a chiedersi perche il pulsante non si
      accende comunque.
    */
    if (!account.onlinePaymentsEnabled) {
      return failure(
        new Error(
          "I pagamenti online non sono ancora attivi per questa societa: contatta EasyGame",
        ),
        "",
      );
    }

    const club = await (prisma as any).club.findUnique({
      where: { id: organizationId },
      select: { name: true, contact_email: true },
    });

    if (!club) return failure(new Error("Club non trovato"), "");

    const origin = new URL(request.url).origin;

    const result = await startConnectOnboarding({
      organizationId,
      clubName: club.name,
      email: club.contact_email || "",
      returnUrl: `${origin}/organization?connect=done`,
      refreshUrl: `${origin}/organization?connect=refresh`,
    });

    await recordAuditEvent({
      action: AUDIT_ACTIONS.paymentProviderConfigured,
      actorUserId: session.db.user_id,
      actorEmail: session.db.user.email,
      organizationId,
      resource: "club_payment_account",
      resourceId: organizationId,
      request,
      /* Il link non finisce nell'audit: e una credenziale temporanea. */
      metadata: { operation: "onboarding_link_requested" },
    });

    return NextResponse.json({
      data: { url: result.url, expiresAt: result.expiresAt },
      error: null,
    });
  } catch (error) {
    return failure(error, "Errore nell'apertura del collegamento");
  }
}
