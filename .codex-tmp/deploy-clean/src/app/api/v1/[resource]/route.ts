import { NextResponse } from "next/server";
import {
  RESOURCE_CONFIG,
  createResource,
  listResource,
} from "@/lib/server/resources";
import {
  requireAuthenticatedUser,
  resolveOrganizationScopeForUser,
} from "@/lib/server/auth";

type Context = {
  params: {
    resource: string;
  };
};

const ensureResource = (resource: string) => {
  if (!RESOURCE_CONFIG[resource]) {
    throw new Error(`Unknown resource: ${resource}`);
  }
};

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
      request.headers.get("x-active-club-id") ||
        url.searchParams.get("organization_id") ||
        url.searchParams.get("club_id"),
    );
    const data = await listResource(resource, url.searchParams, scope);

    return NextResponse.json({ data, error: null });
  } catch (error: any) {
    const status = String(error?.message || "").includes("Accesso negato")
      ? 403
      : 400;
    return NextResponse.json(
      {
        data: [],
        error: { message: error?.message || "Errore recupero risorsa" },
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
    const payload = body?.data ?? body;
    const scope = await resolveOrganizationScopeForUser(
      session.db.user_id,
      request.headers.get("x-active-club-id"),
    );

    const items = Array.isArray(payload) ? payload : [payload];
    const created = [];

    for (const item of items) {
      created.push(await createResource(resource, item || {}, mode, scope));
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
        error: { message: error?.message || "Errore creazione risorsa" },
      },
      { status },
    );
  }
}
