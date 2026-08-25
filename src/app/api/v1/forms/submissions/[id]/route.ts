import {
  decideFormSubmission,
  reviewFormSubmission,
} from "@/lib/server/form-submissions";
import { AUDIT_ACTIONS, recordAuditEvent } from "@/lib/server/audit";
import { failure, ok, resolveFormsScope } from "../../http";

/**
 * Una compilazione: cosa cambierebbe, e la decisione.
 *
 *   GET  /api/v1/forms/submissions/:id   proposta di modifica e duplicati
 *   POST /api/v1/forms/submissions/:id   `preview` | `approve` | `reject`
 *
 * `preview` esiste perche la segreteria puo cambiare idea su **quale** atleta
 * collegare prima di approvare: si ricalcola la proposta con i soggetti
 * scelti, senza scrivere niente.
 *
 * L'approvazione modifica l'anagrafica di un club a partire da un modulo
 * compilato da chiunque avesse il link: e esattamente il tipo di operazione
 * che l'audit log esiste per tracciare.
 */

export const runtime = "nodejs";

type Context = { params: { id: string } };

export async function GET(request: Request, context: Context) {
  try {
    const resolved = await resolveFormsScope(request);
    if (resolved.response) return resolved.response;

    return ok(await reviewFormSubmission(resolved.scope, context.params.id));
  } catch (error: any) {
    return failure(error, "Errore nella lettura della compilazione");
  }
}

export async function POST(request: Request, context: Context) {
  try {
    const body = await request.json().catch(() => ({}));
    const resolved = await resolveFormsScope(request);
    if (resolved.response) return resolved.response;

    const scope = resolved.scope;
    const id = context.params.id;
    const action = String(body?.action || "preview");

    if (action === "preview") {
      return ok(await reviewFormSubmission(scope, id, body?.subjects));
    }

    if (action !== "approve" && action !== "reject") {
      return failure(
        new Error(`Operazione sconosciuta: ${action}`),
        "Operazione sconosciuta",
      );
    }

    const outcome = await decideFormSubmission(scope, id, {
      decision: action,
      note: body?.note,
      subjects: body?.subjects,
    });

    await recordAuditEvent({
      action:
        action === "approve"
          ? AUDIT_ACTIONS.formSubmissionApproved
          : AUDIT_ACTIONS.formSubmissionRejected,
      actorUserId: scope.userId,
      organizationId: scope.activeOrganizationId,
      resource: "form_submissions",
      resourceId: id,
      request,
      metadata: {
        templateId: outcome.submission.templateId,
        version: outcome.submission.version,
        applied: outcome.applied.length,
      },
    });

    return ok(outcome);
  } catch (error: any) {
    return failure(error, "Errore nella revisione della compilazione");
  }
}
