import { NextResponse } from "next/server";
import {
  RESOURCE_CONFIG,
  createResource,
  listResourcePage,
  isClosedResource,
} from "@/lib/server/resources";
import {
  requireAuthenticatedUser,
  resolveOrganizationScopeForUser,
} from "@/lib/server/auth";
import { publicErrorMessage } from "@/lib/server/api-errors";
import { assertClubResourceAccess } from "@/lib/access-roles";
import { isPlatformAdminUser } from "@/lib/platform-admin";
import { sendNotificationEmails } from "@/lib/server/email/email-service";
import {
  AUDIT_ACTIONS,
  AUDITED_ANAGRAFICA_RESOURCES,
  isAuditedResource,
  recordAuditEvent,
} from "@/lib/server/audit";

type Context = {
  params: {
    resource: string;
  };
};

const ensureResource = (resource: string) => {
  if (!RESOURCE_CONFIG[resource]) {
    throw new Error(`Unknown resource: ${resource}`);
  }
  /*
    **Una risorsa chiusa non passa di qui**, e la porta si chiude prima della
    sessione: `assets` non ha un `organization_id` — il club sta dentro `path` —
    e dedurlo da una convenzione di denominazione per autorizzare un documento
    di identita sarebbe un confine costruito su un nome di file. Le quattro
    rotte che servono gli allegati verificano ognuna il suo.
  */
  if (isClosedResource(resource)) {
    throw new Error(
      `Accesso negato: ${resource} non si legge dal registro generico, ma dalle rotte del suo dominio`,
    );
  }
};

function resolveCreatePayload(body: any) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return body;
  }

  const keys = Object.keys(body);
  const looksLikeWrappedPayload =
    Object.prototype.hasOwnProperty.call(body, "data") &&
    (Object.prototype.hasOwnProperty.call(body, "mode") ||
      Object.prototype.hasOwnProperty.call(body, "meta") ||
      keys.every((key) => ["data", "mode", "meta"].includes(key)));

  return looksLikeWrappedPayload ? body.data : body;
}

export async function GET(request: Request, context: Context) {
  try {
    const { resource } = context.params;
    ensureResource(resource);
    const session = await requireAuthenticatedUser(request);
    if (!session) {
      return NextResponse.json(
        {
          data: [],
          error: { message: "Sessione non valida" },
        },
        { status: 401 },
      );
    }

    const url = new URL(request.url);
    const scope = await resolveOrganizationScopeForUser(
      session.db.user_id,
      url.searchParams.get("organization_id") ||
        url.searchParams.get("club_id") ||
        request.headers.get("x-active-club-id"),
      request.headers.get("x-active-access-role"),
    );
    try {
      assertClubResourceAccess(scope.activeRole, resource, "read");
    } catch (denied) {
      await recordAuditEvent({
        action: AUDIT_ACTIONS.resourceAccessDenied,
        outcome: "denied",
        actorUserId: session.db.user_id,
        actorEmail: session.db.user.email,
        actorRole: scope.activeRole,
        organizationId: scope.activeOrganizationId,
        resource,
        request,
        metadata: { attemptedAction: "read" },
      });
      throw denied;
    }
    const { records, meta } = await listResourcePage(
      resource,
      url.searchParams,
      scope,
      { activeSeasonId: request.headers.get("x-active-season-id") },
    );

    /*
      `meta` compare **solo** quando la pagina e stata chiesta (WP-12). Chi
      legge una lista intera riceve la stessa risposta di sempre: aggiungere
      un campo a tutte le risposte avrebbe obbligato ogni chiamante a
      ignorarlo, e prima o poi qualcuno non lo avrebbe ignorato.
    */
    return NextResponse.json(
      meta ? { data: records, meta, error: null } : { data: records, error: null },
    );
  } catch (error: any) {
    const status = String(error?.message || "").includes("Accesso negato")
      ? 403
      : 400;
    return NextResponse.json(
      {
        data: [],
        error: { message: publicErrorMessage(error, "Errore recupero risorsa") },
      },
      { status },
    );
  }
}

export async function POST(request: Request, context: Context) {
  try {
    const { resource } = context.params;
    ensureResource(resource);
    const session = await requireAuthenticatedUser(request);
    if (!session) {
      return NextResponse.json(
        {
          data: null,
          error: { message: "Sessione non valida" },
        },
        { status: 401 },
      );
    }

    const body = await request.json();
    const mode = body?.mode === "upsert" ? "upsert" : "create";
    const payload = resolveCreatePayload(body);
    const scope = await resolveOrganizationScopeForUser(
      session.db.user_id,
      request.headers.get("x-active-club-id"),
      request.headers.get("x-active-access-role"),
    );
    try {
      assertClubResourceAccess(scope.activeRole, resource, "create");
    } catch (denied) {
      await recordAuditEvent({
        action: AUDIT_ACTIONS.resourceAccessDenied,
        outcome: "denied",
        actorUserId: session.db.user_id,
        actorEmail: session.db.user.email,
        actorRole: scope.activeRole,
        organizationId: scope.activeOrganizationId,
        resource,
        request,
        metadata: { attemptedAction: "create" },
      });
      throw denied;
    }

    const items = Array.isArray(payload) ? payload : [payload];
    const created = [];

    for (const item of items) {
      created.push(
        await createResource(resource, item || {}, mode, scope, {
          activeSeasonId: request.headers.get("x-active-season-id"),
          isPlatformAdmin: isPlatformAdminUser(session.db.user),
        }),
      );
    }

    if (isAuditedResource(resource)) {
      for (const item of created) {
        await recordAuditEvent({
          /*
            Anche una persona **nata** in anagrafica genera
            `anagrafica.updated`: chi la cerca vuole la storia di quella
            persona, e il primo evento di quella storia e la sua creazione
            (R-07).
          */
          action: AUDITED_ANAGRAFICA_RESOURCES.has(resource)
            ? AUDIT_ACTIONS.anagraficaUpdated
            : AUDIT_ACTIONS.resourceCreated,
          actorUserId: session.db.user_id,
          actorEmail: session.db.user.email,
          actorRole: scope.activeRole,
          organizationId: scope.activeOrganizationId,
          resource,
          resourceId: (item as any)?.id || null,
          request,
        });
      }
    }

    if (["notifications", "simplified_notifications"].includes(resource)) {
      await sendNotificationEmails(
        created.map((item: any) => String(item?.user_id || "")).filter(Boolean),
      );
    }

    return NextResponse.json({
      data: Array.isArray(payload) ? created : created[0] || null,
      error: null,
    });
  } catch (error: any) {
    const status = String(error?.message || "").includes("Accesso negato")
      ? 403
      : 400;
    return NextResponse.json(
      {
        data: null,
        error: { message: publicErrorMessage(error, "Errore creazione risorsa") },
      },
      { status },
    );
  }
}
