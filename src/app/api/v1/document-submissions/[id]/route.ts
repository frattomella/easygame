import { decideDocumentSubmission } from "@/lib/server/document-requests";
import {
  failure,
  ok,
  resolveDossierScope,
} from "../../document-requests/http";

/**
 * La decisione su un documento consegnato (Wave 5, lane 5D).
 *
 *   POST /api/v1/document-submissions/:id
 *   { "decision": "approved" }
 *   { "decision": "rejected", "note": "il certificato e scaduto" }
 *
 * **`POST` e non `PATCH`**, e non e una svista: la decisione non modifica il
 * deposito, lo **conclude**. Un deposito deciso non si ri-decide — la tabella e
 * append-only — e un secondo esame e un secondo deposito. `PATCH` suggerirebbe
 * che si possa tornare indietro, e la prima cosa che qualcuno proverebbe a
 * fare sarebbe correggere un rifiuto invece di chiedere un altro file.
 *
 * Il motivo e obbligatorio **solo** sul rifiuto: e l'unica decisione che chiede
 * alla famiglia di rifare qualcosa, e senza il motivo ricaricherebbe lo stesso
 * file.
 *
 * `:id` accetta anche l'identificativo della **richiesta**: e cio che la
 * schermata ha in mano quando mostra una riga del fascicolo, e in quel caso si
 * decide sull'ultimo deposito.
 */

export const runtime = "nodejs";

type Context = { params: { id: string } };

export async function POST(request: Request, context: Context) {
  try {
    const body = await request.json().catch(() => ({}));
    const resolved = await resolveDossierScope(
      request,
      body?.organization_id || body?.organizationId || null,
    );
    if (resolved.response) return resolved.response;

    const data = await decideDocumentSubmission(
      resolved.scope,
      context.params.id,
      {
        decision: body?.decision ?? body?.action,
        note:
          body?.note ??
          body?.decision_note ??
          body?.rejectionReason ??
          body?.rejection_reason ??
          null,
      },
      request,
    );

    return ok(data);
  } catch (error: any) {
    return failure(error, "Decisione sul documento non riuscita");
  }
}
