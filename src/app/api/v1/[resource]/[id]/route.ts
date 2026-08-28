import { NextResponse } from "next/server";
import {
  RESOURCE_CONFIG,
  deleteResource,
  getResourceById,
  projectClubResponse,
  updateResource,
} from "@/lib/server/resources";
import {
  requireAuthenticatedUser,
  resolveOrganizationScopeForUser,
} from "@/lib/server/auth";
import { publicErrorMessage } from "@/lib/server/api-errors";
import { assertClubResourceAccess } from "@/lib/access-roles";
import { isPlatformAdminUser } from "@/lib/platform-admin";
import {
  AUDIT_ACTIONS,
  AUDITED_ANAGRAFICA_RESOURCES,
  isAuditedResource,
  recordAuditEvent,
} from "@/lib/server/audit";

/**
 * Traccia le scritture sulle risorse sensibili (dati economici, fiscali e di
 * accesso) e **tutti** i dinieghi, su qualunque risorsa. Vedi ADR-0019.
 */
const auditResourceWrite = async (
  action: string,
  request: Request,
  session: any,
  scope: any,
  resource: string,
  id: string,
  outcome: "success" | "denied" = "success",
) => {
  if (outcome === "success" && !isAuditedResource(resource)) return;

  await recordAuditEvent({
    /*
      Un'anagrafica di persona genera `anagrafica.updated`, non
      `resource.updated`: la domanda a cui il log deve rispondere e «chi ha
      cambiato i dati di questa persona», e cercarla fra tutte le scritture di
      risorsa non la trova (R-07, ADR-0019).
    */
    action:
      outcome === "success" && AUDITED_ANAGRAFICA_RESOURCES.has(resource)
        ? AUDIT_ACTIONS.anagraficaUpdated
        : action,
    outcome,
    actorUserId: session?.db?.user_id,
    actorEmail: session?.db?.user?.email,
    actorRole: scope?.activeRole,
    organizationId: scope?.activeOrganizationId,
    resource,
    resourceId: id,
    request,
  });
};

type Context = {
  params: {
    resource: string;
    id: string;
  };
};

const ensureResource = (resource: string) => {
  if (!RESOURCE_CONFIG[resource]) {
    throw new Error(`Unknown resource: ${resource}`);
  }
};

export async function GET(request: Request, context: Context) {
  try {
    const { resource, id } = context.params;
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
    const scope = await resolveOrganizationScopeForUser(
      session.db.user_id,
      request.headers.get("x-active-club-id"),
      request.headers.get("x-active-access-role"),
    );
    assertClubResourceAccess(scope.activeRole, resource, "read");

    const data = await getResourceById(resource, id, scope);
    return NextResponse.json({
      data,
      error: null,
    });
  } catch (error: any) {
    const status = String(error?.message || "").includes("Accesso negato")
      ? 403
      : 400;
    return NextResponse.json(
      {
        data: null,
        error: { message: publicErrorMessage(error, "Errore dettaglio risorsa") },
      },
      { status },
    );
  }
}

export async function PATCH(request: Request, context: Context) {
  try {
    const { resource, id } = context.params;
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
    const scope = await resolveOrganizationScopeForUser(
      session.db.user_id,
      request.headers.get("x-active-club-id"),
      request.headers.get("x-active-access-role"),
    );
    try {
      assertClubResourceAccess(scope.activeRole, resource, "update");
    } catch (denied) {
      await auditResourceWrite(
        AUDIT_ACTIONS.resourceAccessDenied,
        request,
        session,
        scope,
        resource,
        id,
        "denied",
      );
      throw denied;
    }

    const body = await request.json();
    const payload = body?.data ?? body;
    const updated = await updateResource(resource, id, payload || {}, scope, {
      activeSeasonId: request.headers.get("x-active-season-id"),
      /*
        Si ricava dalla sessione, mai dal corpo: e cio che decide se il piano
        e i servizi del club sono scrivibili (D37).
      */
      isPlatformAdmin: isPlatformAdminUser(session.db.user),
    });
    // Con `?fields=` la risposta porta le stesse colonne della lettura, invece
    // della riga intera del club (WP-31).
    const data = projectClubResponse(
      resource,
      updated,
      new URL(request.url).searchParams,
    );
    await auditResourceWrite(
      AUDIT_ACTIONS.resourceUpdated,
      request,
      session,
      scope,
      resource,
      id,
    );

    return NextResponse.json({
      data,
      error: null,
    });
  } catch (error: any) {
    const status = String(error?.message || "").includes("Accesso negato")
      ? 403
      : 400;
    return NextResponse.json(
      {
        data: null,
        error: { message: publicErrorMessage(error, "Errore aggiornamento risorsa") },
      },
      { status },
    );
  }
}

export async function DELETE(request: Request, context: Context) {
  try {
    const { resource, id } = context.params;
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
    const scope = await resolveOrganizationScopeForUser(
      session.db.user_id,
      request.headers.get("x-active-club-id"),
      request.headers.get("x-active-access-role"),
    );
    try {
      assertClubResourceAccess(scope.activeRole, resource, "delete");
    } catch (denied) {
      await auditResourceWrite(
        AUDIT_ACTIONS.resourceAccessDenied,
        request,
        session,
        scope,
        resource,
        id,
        "denied",
      );
      throw denied;
    }

    const data = await deleteResource(resource, id, scope);
    await auditResourceWrite(
      AUDIT_ACTIONS.resourceDeleted,
      request,
      session,
      scope,
      resource,
      id,
    );
    return NextResponse.json({
      data,
      error: null,
    });
  } catch (error: any) {
    const status = String(error?.message || "").includes("Accesso negato")
      ? 403
      : 400;
    return NextResponse.json(
      {
        data: null,
        error: { message: publicErrorMessage(error, "Errore eliminazione risorsa") },
      },
      { status },
    );
  }
}
