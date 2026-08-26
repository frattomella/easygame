import { NextResponse } from "next/server";
import {
  requireAuthenticatedUser,
  resolveOrganizationScopeForUser,
} from "@/lib/server/auth";
import {
  loadClubEntitlements,
  setClubEntitlementOverride,
} from "@/lib/server/entitlements";
import { isPlatformAdminUser } from "@/lib/platform-admin";
import { AUDIT_ACTIONS, recordAuditEvent } from "@/lib/server/audit";
import { ENTITLEMENTS } from "@/lib/entitlements";

/**
 * Cosa questo club puo usare.
 *
 *   GET  /api/v1/entitlements?organization_id=…    l'esito, funzione per funzione
 *   POST /api/v1/entitlements                      un'eccezione, solo da Cedi
 *
 * **Perche una rotta e non un campo dentro il club.** La risposta non e un
 * dato salvato: e un calcolo su piano, servizi attivi ed eccezioni. Metterla
 * in un campo vorrebbe dire tenerla allineata a mano ogni volta che una delle
 * tre cose cambia — e sarebbe disallineata la prima volta che qualcuno se ne
 * dimentica.
 *
 * **Perche `isPlatformAdmin` non e un parametro.** Si ricava dalla sessione.
 * Se arrivasse dal client, chiunque potrebbe dichiararsi amministratore e
 * ottenere la risposta che gli fa comodo.
 *
 * La scrittura di un'eccezione e riservata a chi amministra la piattaforma:
 * e una decisione di Cedi verso un cliente, non una preferenza del club.
 */

export const runtime = "nodejs";

const unauthorized = () =>
  NextResponse.json(
    { data: null, error: { message: "Accesso negato: sessione assente" } },
    { status: 401 },
  );

const failure = (error: any, fallback: string) => {
  const message = String(error?.message || fallback);
  const status = message.includes("Accesso negato")
    ? 403
    : message.includes("non trovato")
      ? 404
      : 400;
  return NextResponse.json({ data: null, error: { message } }, { status });
};

export async function GET(request: Request) {
  try {
    const session = await requireAuthenticatedUser(request);
    if (!session) return unauthorized();

    const url = new URL(request.url);
    const requested =
      url.searchParams.get("organization_id") ||
      request.headers.get("x-active-club-id");

    const scope = await resolveOrganizationScopeForUser(
      session.db.user_id,
      requested,
      request.headers.get("x-active-access-role"),
    );

    const organizationId = String(
      requested || scope.activeOrganizationId || "",
    ).trim();

    const isPlatformAdmin = isPlatformAdminUser(session.db.user);

    /*
      Un amministratore di piattaforma legge qualunque club: e cio che gli
      permette di assistere. Chiunque altro legge solo i club a cui ha
      accesso, e la risposta lo dice con «Accesso negato» perche il route
      handler la mappi su 403.
    */
    if (
      !isPlatformAdmin &&
      !scope.allowedOrganizationIds.includes(organizationId)
    ) {
      return failure(
        new Error("Accesso negato: il club non e fra quelli accessibili"),
        "",
      );
    }

    const result = await loadClubEntitlements({
      organizationId,
      isPlatformAdmin,
    });

    return NextResponse.json({
      data: {
        organizationId: result.organizationId,
        plan: result.entitlements.plan,
        effectivePlan: result.entitlements.effectivePlan,
        subscriptionStatus: result.entitlements.subscriptionStatus,
        isPlatformAdmin: result.entitlements.isPlatformAdmin,
        activeExtras: result.activeExtras,
        features: result.entitlements.all().map((verdict) => ({
          ...verdict,
          label: ENTITLEMENTS[verdict.key]?.label || verdict.key,
          area: ENTITLEMENTS[verdict.key]?.area || null,
        })),
      },
      error: null,
    });
  } catch (error) {
    return failure(error, "Errore nella lettura dei servizi attivi");
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireAuthenticatedUser(request);
    if (!session) return unauthorized();

    if (!isPlatformAdminUser(session.db.user)) {
      return failure(
        new Error(
          "Accesso negato: solo chi amministra la piattaforma puo cambiare i servizi di un club",
        ),
        "",
      );
    }

    const body = await request.json().catch(() => ({}));
    const organizationId = String(
      body?.organization_id || body?.organizationId || "",
    ).trim();

    const overrides = await setClubEntitlementOverride({
      organizationId,
      key: String(body?.key || ""),
      /*
        `null` toglie l'eccezione e riporta la funzione alla regola del
        listino. E diverso da `false`, che la vieta anche a chi il listino la
        comprende: senza la distinzione, «rimetti com'era» sarebbe
        irraggiungibile.
      */
      value: body?.value === null ? null : Boolean(body?.value),
    });

    await recordAuditEvent({
      action: AUDIT_ACTIONS.resourceUpdated,
      actorUserId: session.db.user_id,
      actorEmail: session.db.user.email,
      actorRole: "platform_admin",
      organizationId,
      resource: "entitlements",
      resourceId: String(body?.key || ""),
      request,
      metadata: { key: body?.key, value: body?.value },
    });

    return NextResponse.json({ data: { overrides }, error: null });
  } catch (error) {
    return failure(error, "Errore nel salvataggio dei servizi del club");
  }
}
