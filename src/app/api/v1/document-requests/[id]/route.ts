import {
  cancelDocumentRequest,
  getDocumentRequest,
  remindDocumentRequest,
} from "@/lib/server/document-requests";
import { failure, ok, resolveDossierScope } from "../http";

/**
 * Una richiesta di documento (Wave 5, lane 5D).
 *
 *   GET    /api/v1/document-requests/:id           la voce con il suo storico
 *   PATCH  /api/v1/document-requests/:id           `{ "action": "remind" }`
 *   DELETE /api/v1/document-requests/:id           la ritira, e non cancella
 *
 * **`PATCH` non modifica il testo della richiesta, e non e una dimenticanza.**
 * Cambiare titolo, tipo o scadenza di una domanda gia inviata vorrebbe dire
 * che la famiglia ha letto una cosa e ne risulta un'altra: si annulla e si
 * richiede. L'unica cosa che si aggiunge a una richiesta viva e un
 * **sollecito**, che e un fatto nuovo e non la riscrittura di uno vecchio.
 *
 * **`DELETE` non cancella niente**: porta la richiesta in `cancelled` e lascia
 * i depositi dove sono. Cancellare la riga porterebbe via anche la prova che
 * il documento era stato chiesto.
 */

export const runtime = "nodejs";

type Context = { params: { id: string } };

export async function GET(request: Request, context: Context) {
  try {
    const url = new URL(request.url);
    const resolved = await resolveDossierScope(
      request,
      url.searchParams.get("organization_id"),
    );
    if (resolved.response) return resolved.response;

    const data = await getDocumentRequest(resolved.scope, context.params.id);
    return ok(data);
  } catch (error: any) {
    return failure(error, "Lettura della richiesta non riuscita");
  }
}

export async function PATCH(request: Request, context: Context) {
  try {
    const body = await request.json().catch(() => ({}));
    const resolved = await resolveDossierScope(
      request,
      body?.organization_id || body?.organizationId || null,
    );
    if (resolved.response) return resolved.response;

    const action = String(body?.action || "remind").trim().toLowerCase();
    if (action !== "remind") {
      return failure(
        new Error(
          "Su una richiesta viva si puo solo sollecitare: per cambiarla, si annulla e si richiede",
        ),
        "Azione non ammessa",
      );
    }

    const data = await remindDocumentRequest(
      resolved.scope,
      context.params.id,
      request,
    );
    return ok(data);
  } catch (error: any) {
    return failure(error, "Sollecito non riuscito");
  }
}

export async function DELETE(request: Request, context: Context) {
  try {
    const body = await request.json().catch(() => ({}));
    const resolved = await resolveDossierScope(
      request,
      body?.organization_id || body?.organizationId || null,
    );
    if (resolved.response) return resolved.response;

    const data = await cancelDocumentRequest(
      resolved.scope,
      context.params.id,
      { reason: body?.reason ?? null },
      request,
    );
    return ok(data);
  } catch (error: any) {
    return failure(error, "Annullamento della richiesta non riuscito");
  }
}
