import {
  deleteFormTemplate,
  duplicateFormTemplate,
  getFormTemplate,
  publishFormTemplate,
  regenerateFormTemplateSlug,
  setFormTemplatePublicAccess,
  setFormTemplateStatus,
  updateFormTemplateDraft,
} from "@/lib/server/forms";
import { failure, ok, resolveFormsScope } from "../http";

/**
 * Un modulo.
 *
 *   GET    /api/v1/forms/:id     bozza, versione pubblicata, conteggi
 *   PATCH  /api/v1/forms/:id     `action` dice cosa fare
 *   DELETE /api/v1/forms/:id     cancella, oppure archivia se ha risposte
 *
 * **Perche `PATCH` con una `action` e non sei endpoint.** Salvare la bozza,
 * pubblicare, togliere dalla pubblicazione, archiviare, duplicare e rigenerare
 * il link sono la stessa risorsa in sei stati. Sei percorsi vorrebbero dire
 * sei volte la stessa risoluzione di sessione e di scope, e la stessa
 * possibilita di dimenticarne una.
 */

export const runtime = "nodejs";

type Context = { params: { id: string } };

export async function GET(request: Request, context: Context) {
  try {
    const resolved = await resolveFormsScope(request);
    if (resolved.response) return resolved.response;

    return ok(await getFormTemplate(resolved.scope, context.params.id));
  } catch (error: any) {
    return failure(error, "Errore nella lettura del modulo");
  }
}

export async function PATCH(request: Request, context: Context) {
  try {
    const body = await request.json().catch(() => ({}));
    const resolved = await resolveFormsScope(request);
    if (resolved.response) return resolved.response;

    const scope = resolved.scope;
    const id = context.params.id;
    const action = String(body?.action || "save_draft");

    switch (action) {
      case "save_draft":
        return ok(await updateFormTemplateDraft(scope, id, body?.schema));

      case "publish":
        return ok(await publishFormTemplate(scope, id));

      case "unpublish":
        return ok(await setFormTemplateStatus(scope, id, "draft"));

      case "archive":
        return ok(await setFormTemplateStatus(scope, id, "archived"));

      case "restore":
        return ok(await setFormTemplateStatus(scope, id, "draft"));

      case "duplicate":
        return ok(await duplicateFormTemplate(scope, id));

      case "regenerate_slug":
        return ok(await regenerateFormTemplateSlug(scope, id));

      case "set_public_access":
        return ok(
          await setFormTemplatePublicAccess(
            scope,
            id,
            Boolean(body?.enabled),
          ),
        );

      default:
        return failure(
          new Error(`Operazione sconosciuta: ${action}`),
          "Operazione sconosciuta",
        );
    }
  } catch (error: any) {
    return failure(error, "Errore nell'aggiornamento del modulo");
  }
}

export async function DELETE(request: Request, context: Context) {
  try {
    const resolved = await resolveFormsScope(request);
    if (resolved.response) return resolved.response;

    return ok(await deleteFormTemplate(resolved.scope, context.params.id));
  } catch (error: any) {
    return failure(error, "Errore nella cancellazione del modulo");
  }
}
