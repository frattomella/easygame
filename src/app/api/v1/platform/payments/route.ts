import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/server/auth";
import { isPlatformAdminUser } from "@/lib/platform-admin";
import { AUDIT_ACTIONS, recordAuditEvent } from "@/lib/server/audit";
import {
  isValidationError,
  parseInput,
  validationErrorPayload,
} from "@/lib/validation";
import { platformPaymentsWriteSchema } from "@/lib/validation/schemas";
import { prisma } from "@/lib/server/prisma";
import {
  PLATFORM_SETTING_KEYS,
  clearClubCommissionOverride,
  listCommissionHistory,
  readPlatformSetting,
  resolveCommissionForClub,
  saveCommissionRule,
  writePlatformSetting,
  type FiscalProviderSettings,
  type StripeBillingSettings,
  type StripeConnectSettings,
} from "@/lib/server/platform-settings";
import {
  listClubPaymentAccounts,
  setClubOnlinePaymentsEnabled,
  startConnectOnboarding,
  syncClubPaymentAccount,
} from "@/lib/server/connect-accounts";
import { listPlatformBillingAccounts } from "@/lib/server/platform-billing";
import { isPlatformBillingConfigured } from "@/lib/payments/billing/stripe-billing";
import { getPaymentGateway } from "@/lib/payments/gateway";
import { describeEInvoiceCapability } from "@/lib/fiscal/fatturapa/provider";
import { resolveCommission } from "@/lib/payments/commission";
import { loadCommissionRules } from "@/lib/server/platform-settings";
import { PaymentGatewayError } from "@/lib/payments/gateway";

/**
 * Il centro di controllo commerciale della piattaforma.
 *
 *   GET  /api/v1/platform/payments    lo stato di tutto, in una lettura
 *   POST /api/v1/platform/payments    i sei atti commerciali
 *
 * **Perche una rotta sola.** Perche e una schermata sola, e chi la usa compie
 * atti che si tengono: cambiare una commissione e poi aprire un collegamento
 * per lo stesso club. Sei rotte avrebbero voluto dire sei controlli di ruolo
 * da tenere allineati, e la storia di questo repository dice che uno dei sei
 * sarebbe rimasto indietro.
 *
 * **Perche `isPlatformAdmin` non e un parametro.** Si ricava dalla sessione.
 * Se arrivasse dal corpo, chiunque potrebbe dichiararsi amministratore e
 * abbassarsi la commissione — che e esattamente il difetto che il Blocco D ha
 * trovato aperto dall'altra parte.
 *
 * **Cosa NON restituisce.** Le chiavi segrete di Stripe, che non stanno nel
 * database e non passano di qui. La lettura dice se un ambiente e configurato,
 * non con cosa.
 */

export const runtime = "nodejs";

const unauthorized = () =>
  NextResponse.json(
    { data: null, error: { message: "Accesso negato: sessione assente" } },
    { status: 401 },
  );

const forbidden = () =>
  NextResponse.json(
    {
      data: null,
      error: {
        message:
          "Accesso negato: solo chi amministra la piattaforma governa le condizioni commerciali",
      },
    },
    { status: 403 },
  );

const failure = (error: any, fallback: string) => {
  if (isValidationError(error)) {
    return NextResponse.json(validationErrorPayload(error), { status: 400 });
  }

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

const requirePlatform = async (request: Request) => {
  const session = await requireAuthenticatedUser(request);
  if (!session) return { session: null, response: unauthorized() };
  if (!isPlatformAdminUser(session.db.user)) {
    return { session: null, response: forbidden() };
  }
  return { session, response: null };
};

export async function GET(request: Request) {
  const { session, response } = await requirePlatform(request);
  if (!session) return response;

  try {
    const [connectSettings, billingSettings, fiscalSettings, clubs, rules] =
      await Promise.all([
        readPlatformSetting<StripeConnectSettings>(
          PLATFORM_SETTING_KEYS.stripeConnect,
        ),
        readPlatformSetting<StripeBillingSettings>(
          PLATFORM_SETTING_KEYS.stripeBilling,
        ),
        readPlatformSetting<FiscalProviderSettings>(
          PLATFORM_SETTING_KEYS.fiscalProvider,
        ),
        (prisma as any).club.findMany({
          select: { id: true, name: true, city: true },
          orderBy: { name: "asc" },
        }),
        loadCommissionRules(null),
      ]);

    const ids = clubs.map((club: any) => String(club.id));

    /*
      Due letture per **tutti** i club, non due per club: la console elenca
      l'intero parco clienti, e una query per riga sarebbe un N+1 che cresce
      con le vendite.
    */
    const [accounts, billing, overrides, events] = await Promise.all([
      listClubPaymentAccounts(ids),
      listPlatformBillingAccounts(ids),
      (prisma as any).platformCommissionRule.findMany({
        where: { organization_id: { in: ids } },
        orderBy: { effective_from: "desc" },
      }),
      /*
        Gli ultimi eventi, per rispondere alla domanda che si fa davvero
        davanti a questa schermata: «l'ultimo evento quando e arrivato, e con
        che esito». Nessun corpo, nessun segreto: solo tipo, esito e ora.
      */
      (prisma as any).paymentWebhookEvent.findMany({
        orderBy: { received_at: "desc" },
        take: 20,
        select: {
          id: true,
          provider: true,
          flow: true,
          event_type: true,
          status: true,
          error: true,
          organization_id: true,
          received_at: true,
        },
      }),
    ]);

    const standard = resolveCommission({ rules, organizationId: null });
    const overridesByClub = new Map<string, any[]>();
    for (const rule of overrides) {
      const key = String(rule.organization_id);
      overridesByClub.set(key, [...(overridesByClub.get(key) || []), rule]);
    }

    const gateway = getPaymentGateway("stripe");

    return NextResponse.json({
      data: {
        stripe: {
          /* Se le credenziali ci sono. Non dice quali, e non dice che siano valide. */
          connectConfigured: Boolean(gateway?.isConfigured()),
          billingConfigured: isPlatformBillingConfigured(),
          connect: connectSettings,
          billing: billingSettings,
        },
        fiscal: {
          ...fiscalSettings,
          capability: describeEInvoiceCapability({
            providerKey: fiscalSettings.providerKey,
          }),
        },
        commission: {
          standard,
          history: await listCommissionHistory({ limit: 20 }),
        },
        clubs: clubs.map((club: any) => {
          const id = String(club.id);
          const clubRules = overridesByClub.get(id) || [];

          return {
            id,
            name: club.name,
            city: club.city,
            account: accounts.get(id),
            billing: billing.get(id),
            commission: resolveCommission({
              rules: [
                ...rules,
                ...clubRules.map((rule: any) => ({
                  id: String(rule.id),
                  organizationId: id,
                  percent: Number(rule.percent),
                  fixedCents: Number(rule.fixed_cents || 0),
                  effectiveFrom: rule.effective_from,
                  note: rule.note,
                })),
              ],
              organizationId: id,
            }),
          };
        }),
        events: events.map((event: any) => ({
          id: String(event.id),
          provider: event.provider,
          flow: event.flow,
          type: event.event_type,
          status: event.status,
          error: event.error,
          organizationId: event.organization_id,
          receivedAt: new Date(event.received_at).toISOString(),
        })),
      },
      error: null,
    });
  } catch (error) {
    return failure(error, "Errore nella lettura della configurazione pagamenti");
  }
}

export async function POST(request: Request) {
  const { session, response } = await requirePlatform(request);
  if (!session) return response;

  try {
    const body = parseInput(
      platformPaymentsWriteSchema,
      await request.json().catch(() => ({})),
    );

    const audit = (
      resource: string,
      resourceId: string,
      metadata: Record<string, unknown>,
      organizationId: string | null = null,
    ) =>
      recordAuditEvent({
        action: AUDIT_ACTIONS.paymentProviderConfigured,
        actorUserId: session.db.user_id,
        actorEmail: session.db.user.email,
        actorRole: "platform_admin",
        organizationId,
        resource,
        resourceId,
        request,
        metadata,
      });

    if (body.operation === "commission") {
      const rule = await saveCommissionRule({
        organizationId: body.organization_id || null,
        percent: body.percent,
        fixedCents: body.fixed_cents,
        effectiveFrom: body.effective_from,
        note: body.note,
        actorUserId: session.db.user_id,
      });

      /*
        Una modifica commerciale si traccia sempre, anche quando riguarda il
        listino generale e non un club: e la domanda «da quando paghiamo
        l'1,5%?», e la risposta non puo essere «guarda la riga corrente».
      */
      await audit(
        "platform_commission",
        String(rule.id),
        {
          percent: body.percent,
          fixedCents: body.fixed_cents || 0,
          effectiveFrom: rule.effective_from,
          scope: body.organization_id ? "club" : "standard",
        },
        body.organization_id || null,
      );

      return NextResponse.json({
        data: {
          rule: {
            id: String(rule.id),
            percent: Number(rule.percent),
            fixedCents: Number(rule.fixed_cents),
            effectiveFrom: new Date(rule.effective_from).toISOString(),
          },
        },
        error: null,
      });
    }

    if (body.operation === "commission_reset") {
      const rule = await clearClubCommissionOverride({
        organizationId: body.organization_id,
        actorUserId: session.db.user_id,
      });

      await audit(
        "platform_commission",
        String(rule.id),
        { scope: "club", reset: true },
        body.organization_id,
      );

      return NextResponse.json({
        data: {
          commission: await resolveCommissionForClub({
            organizationId: body.organization_id,
          }),
        },
        error: null,
      });
    }

    if (body.operation === "connect_onboarding") {
      const club = await (prisma as any).club.findUnique({
        where: { id: body.organization_id },
        select: { name: true, contact_email: true },
      });

      if (!club) throw new Error("Club non trovato");

      const result = await startConnectOnboarding({
        organizationId: body.organization_id,
        clubName: club.name,
        email: club.contact_email || "",
        returnUrl: body.return_url,
        refreshUrl: body.refresh_url,
      });

      await audit(
        "club_payment_account",
        body.organization_id,
        {
          /*
            L'identificativo dell'account non e un segreto e serve a
            riconciliare sul cruscotto Stripe. Il **link** invece non finisce
            nell'audit: e a tutti gli effetti una credenziale temporanea.
          */
          externalAccountId: result.account.externalAccountId,
          accountType: result.account.accountType,
        },
        body.organization_id,
      );

      return NextResponse.json({
        data: { account: result.account, url: result.url, expiresAt: result.expiresAt },
        error: null,
      });
    }

    if (body.operation === "connect_sync") {
      const account = await syncClubPaymentAccount(body.organization_id);
      return NextResponse.json({ data: { account }, error: null });
    }

    if (body.operation === "connect_toggle") {
      const account = await setClubOnlinePaymentsEnabled({
        organizationId: body.organization_id,
        enabled: body.enabled,
      });

      await audit(
        "club_payment_account",
        body.organization_id,
        { onlinePaymentsEnabled: body.enabled },
        body.organization_id,
      );

      return NextResponse.json({ data: { account }, error: null });
    }

    /* operation === "settings" */
    const written: Record<string, unknown> = {};

    if (body.connect) {
      written.connect = await writePlatformSetting(
        PLATFORM_SETTING_KEYS.stripeConnect,
        body.connect,
        session.db.user_id,
      );
    }

    if (body.billing) {
      written.billing = await writePlatformSetting(
        PLATFORM_SETTING_KEYS.stripeBilling,
        body.billing,
        session.db.user_id,
      );
    }

    if (body.fiscal) {
      written.fiscal = await writePlatformSetting(
        PLATFORM_SETTING_KEYS.fiscalProvider,
        body.fiscal,
        session.db.user_id,
      );
    }

    await audit("platform_settings", "stripe", {
      keys: Object.keys(written),
    });

    return NextResponse.json({ data: written, error: null });
  } catch (error) {
    return failure(error, "Errore nel salvataggio della configurazione");
  }
}
