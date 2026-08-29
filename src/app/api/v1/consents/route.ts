import {
  createConsentDefinition,
  listConsentDefinitions,
} from "@/lib/server/consents";
import { failure, ok, resolveConsentScope } from "./http";

/**
 * I consensi del club (W3-C, G-17).
 *
 *   GET  /api/v1/consents?include_retired=1   le definizioni, con lo stato pubblicato
 *   POST /api/v1/consents                     una definizione nuova, in bozza
 *
 * **La creazione non pubblica.** Una definizione nasce bozza e diventa attiva
 * quando qualcuno ne pubblica il testo: e la ragione per cui esiste lo stato, e
 * senza quel passaggio si raccoglierebbero accettazioni che non citano niente.
 */

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const organizationId = url.searchParams.get("organization_id");
    const resolved = await resolveConsentScope(request, organizationId);
    if (resolved.response) return resolved.response;

    const data = await listConsentDefinitions(resolved.scope, {
      organizationId,
      includeRetired: url.searchParams.get("include_retired") === "1",
    });

    return ok(data);
  } catch (error: any) {
    return failure(error, "Lettura dei consensi non riuscita");
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const organizationId = body?.organization_id || body?.organizationId || null;
    const resolved = await resolveConsentScope(request, organizationId);
    if (resolved.response) return resolved.response;

    const data = await createConsentDefinition(resolved.scope, {
      organizationId,
      key: body?.key,
      title: body?.title,
      description: body?.description,
      required: body?.required,
    });

    return ok(data);
  } catch (error: any) {
    return failure(error, "Creazione del consenso non riuscita");
  }
}
