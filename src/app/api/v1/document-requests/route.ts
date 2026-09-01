import {
  createDocumentRequest,
  listDocumentRequests,
} from "@/lib/server/document-requests";
import { failure, ok, resolveDossierScope } from "./http";

/**
 * Le richieste di documento (Wave 5, lane 5D, §17).
 *
 *   GET  /api/v1/document-requests?subject_kind=athlete&subject_id=…&only_open=1
 *   POST /api/v1/document-requests
 *
 * **Lo stato che torna non e la colonna.** Ogni voce porta `state`, ricavato
 * dall'ultimo deposito: `missing`, `under_review`, `approved`, `rejected`, con
 * la scadenza e il ritardo gia calcolati. Chi legge non deve rifare il conto —
 * e soprattutto non deve rifarlo **in un modo diverso** dalla schermata
 * accanto.
 *
 * L'elenco **senza soggetto** e una lettura di club e la concede il ruolo: una
 * famiglia che lo chiedesse chiederebbe il fascicolo di tutti.
 */

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const organizationId = url.searchParams.get("organization_id");
    const resolved = await resolveDossierScope(request, organizationId);
    if (resolved.response) return resolved.response;

    const data = await listDocumentRequests(resolved.scope, {
      organizationId,
      subjectKind: url.searchParams.get("subject_kind"),
      subjectId: url.searchParams.get("subject_id"),
      documentKind: url.searchParams.get("document_kind"),
      onlyOpen: url.searchParams.get("only_open") === "1",
      includeCancelled: url.searchParams.get("include_cancelled") === "1",
    });

    return ok(data);
  } catch (error: any) {
    return failure(error, "Lettura delle richieste non riuscita");
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const organizationId = body?.organization_id || body?.organizationId || null;
    const resolved = await resolveDossierScope(request, organizationId);
    if (resolved.response) return resolved.response;

    const data = await createDocumentRequest(
      resolved.scope,
      {
        organizationId,
        subjectKind: body?.subject_kind ?? body?.subjectKind,
        subjectId: body?.subject_id ?? body?.subjectId,
        documentKind: body?.document_kind ?? body?.documentKind,
        title: body?.title,
        description: body?.description,
        required: body?.required,
        dueDate: body?.due_date ?? body?.dueDate ?? null,
        seasonId: body?.season_id ?? body?.seasonId ?? null,
      },
      request,
    );

    return ok(data, 201);
  } catch (error: any) {
    return failure(error, "Creazione della richiesta non riuscita");
  }
}
