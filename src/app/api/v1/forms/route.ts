import { createFormTemplate, listFormTemplates } from "@/lib/server/forms";
import { failure, ok, resolveFormsScope } from "./http";

/**
 * I moduli di un club.
 *
 *   GET  /api/v1/forms?organization_id=&include_archived=1   elenco
 *   POST /api/v1/forms                                       nuovo modulo
 *
 * Il corpo di `POST` dice al massimo da quale modello partire. Titolo, campi
 * e link pubblico li decide il server: uno slug proposto dal client sarebbe
 * uno slug indovinabile.
 */

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const organizationId = url.searchParams.get("organization_id");
    const resolved = await resolveFormsScope(request, organizationId);
    if (resolved.response) return resolved.response;

    const templates = await listFormTemplates(resolved.scope, {
      organizationId,
      includeArchived: url.searchParams.get("include_archived") === "1",
    });

    return ok(templates);
  } catch (error: any) {
    return failure(error, "Errore nella lettura dei moduli");
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const organizationId = body?.organization_id || body?.organizationId || null;
    const resolved = await resolveFormsScope(request, organizationId);
    if (resolved.response) return resolved.response;

    const template = await createFormTemplate(resolved.scope, {
      organizationId,
      starter: body?.starter,
    });

    return ok(template);
  } catch (error: any) {
    return failure(error, "Errore nella creazione del modulo");
  }
}
