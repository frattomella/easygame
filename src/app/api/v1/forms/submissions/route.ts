import {
  FormSubmissionError,
  listFormSubmissions,
  submitInternalForm,
} from "@/lib/server/form-submissions";
import { readSubmissionPayload } from "@/lib/server/form-request";
import { failure, ok, resolveFormsScope } from "../http";

/**
 * Le compilazioni.
 *
 *   GET  /api/v1/forms/submissions?status=pending&template_id=…  la coda
 *   POST /api/v1/forms/submissions                                compila
 *
 * `POST` e la compilazione fatta dalla segreteria — dalla scheda di un atleta,
 * con i soggetti gia scelti. Finisce nella stessa coda di una compilazione
 * pubblica: anche qui, prima di scrivere in anagrafica, si vede cosa
 * cambierebbe.
 */

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const organizationId = url.searchParams.get("organization_id");
    const resolved = await resolveFormsScope(request, organizationId);
    if (resolved.response) return resolved.response;

    const result = await listFormSubmissions(resolved.scope, {
      organizationId,
      templateId: url.searchParams.get("template_id"),
      status: url.searchParams.get("status"),
      limit: Number(url.searchParams.get("limit")) || undefined,
      offset: Number(url.searchParams.get("offset")) || undefined,
    });

    return ok(result);
  } catch (error: any) {
    return failure(error, "Errore nella lettura delle compilazioni");
  }
}

export async function POST(request: Request) {
  try {
    const resolved = await resolveFormsScope(request);
    if (resolved.response) return resolved.response;

    const payload = await readSubmissionPayload(request);
    if (!payload.templateId) {
      return failure(new Error("Modulo non indicato"), "Modulo non indicato");
    }

    const result = await submitInternalForm(resolved.scope, {
      templateId: payload.templateId,
      answers: payload.answers,
      files: payload.files,
      respondentName: payload.respondentName,
      respondentEmail: payload.respondentEmail,
      subjects: payload.subjects,
    });

    return ok(result);
  } catch (error: any) {
    if (error instanceof FormSubmissionError) {
      return Response.json(
        {
          data: { errors: error.fieldErrors },
          error: { message: error.message },
        },
        { status: error.status },
      );
    }
    return failure(error, "Errore nell'invio della compilazione");
  }
}
