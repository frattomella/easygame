import { publishConsentVersion } from "@/lib/server/consents";
import { failure, ok, resolveConsentScope } from "../../http";

/**
 * Pubblica il testo di un consenso.
 *
 *   POST /api/v1/consents/:id/versions   { body_text, title? }
 *
 * **Non esiste un `PATCH` su una versione, e non deve esistere.** Correggere
 * l'informativa significa pubblicarne un'altra: i consensi gia raccolti
 * continuano a citare la loro, restano validi, e vengono segnalati come dati su
 * una versione precedente. E l'unica risposta possibile a «quale testo ha
 * accettato» che resti vera dopo la correzione.
 */

export const runtime = "nodejs";

type Context = { params: { id: string } };

export async function POST(request: Request, { params }: Context) {
  try {
    const body = await request.json().catch(() => ({}));
    const organizationId = body?.organization_id || body?.organizationId || null;
    const resolved = await resolveConsentScope(request, organizationId);
    if (resolved.response) return resolved.response;

    const data = await publishConsentVersion(resolved.scope, params.id, {
      organizationId,
      title: body?.title,
      bodyText: body?.body_text ?? body?.bodyText ?? "",
    });

    return ok(data);
  } catch (error: any) {
    return failure(error, "Pubblicazione del testo non riuscita");
  }
}
