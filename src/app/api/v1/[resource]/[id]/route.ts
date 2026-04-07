import { NextResponse } from "next/server";
import {
  RESOURCE_CONFIG,
  deleteResource,
  getResourceById,
  updateResource,
} from "@/lib/server/resources";
import {
  requireAuthenticatedUser,
  resolveOrganizationScopeForUser,
} from "@/lib/server/auth";

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
    );

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
        error: { message: error?.message || "Errore dettaglio risorsa" },
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
    );

    const body = await request.json();
    const payload = body?.data ?? body;
    const data = await updateResource(resource, id, payload || {}, scope);

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
        error: { message: error?.message || "Errore aggiornamento risorsa" },
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
    );

    const data = await deleteResource(resource, id, scope);
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
        error: { message: error?.message || "Errore eliminazione risorsa" },
      },
      { status },
    );
  }
}
