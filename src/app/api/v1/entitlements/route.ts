import { NextResponse } from "next/server";
import {
  requireAuthenticatedUser,
  resolveOrganizationScopeForUser,
} from "@/lib/server/auth";
import {
  loadClubEntitlements,
  setClubEntitlementOverride,
  setClubExtraService,
  setClubPlan,
} from "@/lib/server/entitlements";
import { isPlatformAdminUser } from "@/lib/platform-admin";
import { AUDIT_ACTIONS, recordAuditEvent } from "@/lib/server/audit";
import { ENTITLEMENTS } from "@/lib/entitlements";
import {
  isValidationError,
  parseInput,
  validationErrorPayload,
} from "@/lib/validation";
import { entitlementWriteSchema } from "@/lib/validation/schemas";

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
  if (isValidationError(error)) {
    return NextResponse.json(validationErrorPayload(error), { status: 400 });
  }

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

    const raw = await request.json().catch(() => ({}));
    const rawRecord =
      raw && typeof raw === "object" && !Array.isArray(raw)
        ? (raw as Record<string, unknown>)
        : {};

    /*
      Tre scritture diverse sulla stessa rotta, distinte da `operation`:
      l'eccezione su una funzione (il comportamento storico, e il valore
      predefinito), il piano, e un servizio aggiuntivo. Sono tre cose che
      cambiano insieme quando Cedi vende o sospende qualcosa, e tenerle su tre
      rotte avrebbe voluto dire tre controlli di ruolo da tenere allineati.

      Uno schema discriminato invece di tre letture a mano: cosi «piano» puo
      valere solo `free` o `plus`, e uno stato inventato viene rifiutato qui
      con scritto perche, invece di essere normalizzato in silenzio in un
      valore che nessuno ha chiesto.
    */
    const body = parseInput(entitlementWriteSchema, {
      ...rawRecord,
      organization_id:
        (rawRecord.organization_id as string) ??
        (rawRecord.organizationId as string),
    });
    const organizationId = body.organization_id;

    if (body.operation === "plan") {
      const subscription = await setClubPlan({
        organizationId,
        plan: body.plan,
        status: body.status,
        renewalDate: body.renewal_date,
      });

      await recordAuditEvent({
        action: AUDIT_ACTIONS.clubPlanChanged,
        actorUserId: session.db.user_id,
        actorEmail: session.db.user.email,
        actorRole: "platform_admin",
        organizationId,
        resource: "club_plan",
        resourceId: organizationId,
        request,
        metadata: {
          plan: subscription.plan,
          status: subscription.status,
          renewalDate: (subscription as any).renewalDate || null,
        },
      });

      return NextResponse.json({ data: { subscription }, error: null });
    }

    if (body.operation === "service") {
      const services = await setClubExtraService({
        organizationId,
        key: body.key,
        enabled: body.value,
      });

      await recordAuditEvent({
        action: AUDIT_ACTIONS.clubServiceChanged,
        actorUserId: session.db.user_id,
        actorEmail: session.db.user.email,
        actorRole: "platform_admin",
        organizationId,
        resource: "club_service",
        resourceId: body.key,
        request,
        metadata: { key: body.key, enabled: body.value },
      });

      return NextResponse.json({ data: { services }, error: null });
    }

    const overrides = await setClubEntitlementOverride({
      organizationId,
      key: body.key,
      /*
        `null` toglie l'eccezione e riporta la funzione alla regola del
        listino. E diverso da `false`, che la vieta anche a chi il listino la
        comprende: senza la distinzione, «rimetti com'era» sarebbe
        irraggiungibile.
      */
      value: body.value,
    });

    await recordAuditEvent({
      action: AUDIT_ACTIONS.clubEntitlementOverridden,
      actorUserId: session.db.user_id,
      actorEmail: session.db.user.email,
      actorRole: "platform_admin",
      organizationId,
      resource: "entitlements",
      resourceId: body.key,
      request,
      metadata: { key: body.key, value: body.value },
    });

    return NextResponse.json({ data: { overrides }, error: null });
  } catch (error) {
    return failure(error, "Errore nel salvataggio dei servizi del club");
  }
}
