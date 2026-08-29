import {
  getConsentDefinition,
  updateConsentDefinition,
} from "@/lib/server/consents";
import { failure, ok, resolveConsentScope } from "../http";

/**
 * Una definizione di consenso.
 *
 *   GET   /api/v1/consents/:id   la definizione e le sue versioni
 *   PATCH /api/v1/consents/:id   titolo, descrizione, obbligatorieta, stato
 *
 * **La chiave non e modificabile**, e il servizio la ignora: un campo di modulo
 * e un modello di documento la citano per nome, e rinominarla spezzerebbe in
 * silenzio ogni riferimento gia scritto.
 */

export const runtime = "nodejs";

type Context = { params: { id: string } };

export async function GET(request: Request, { params }: Context) {
  try {
    const url = new URL(request.url);
    const organizationId = url.searchParams.get("organization_id");
    const resolved = await resolveConsentScope(request, organizationId);
    if (resolved.response) return resolved.response;

    const data = await getConsentDefinition(resolved.scope, params.id, {
      organizationId,
    });

    return ok(data);
  } catch (error: any) {
    return failure(error, "Lettura del consenso non riuscita");
  }
}

export async function PATCH(request: Request, { params }: Context) {
  try {
    const body = await request.json().catch(() => ({}));
    const organizationId = body?.organization_id || body?.organizationId || null;
    const resolved = await resolveConsentScope(request, organizationId);
    if (resolved.response) return resolved.response;

    const data = await updateConsentDefinition(resolved.scope, params.id, {
      organizationId,
      ...(body?.title === undefined ? {} : { title: body.title }),
      ...(body?.description === undefined
        ? {}
        : { description: body.description }),
      ...(body?.required === undefined ? {} : { required: body.required }),
      ...(body?.status === undefined ? {} : { status: body.status }),
    });

    return ok(data);
  } catch (error: any) {
    return failure(error, "Modifica del consenso non riuscita");
  }
}
