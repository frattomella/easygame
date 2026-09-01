import {
  previewDataSubjectErasure,
  eraseDataSubject,
} from "@/lib/server/data-subject";
import { failure, ok, resolveDataSubjectScope } from "../http";

/**
 * **I diritti dell'interessato su una persona** (ADR-0019, Wave 6 §15.3).
 *
 *   GET    /api/v1/data-subject/<athleteId>   il riepilogo di cio che verrebbe
 *                                            distrutto, con il gettone di conferma
 *   DELETE /api/v1/data-subject/<athleteId>   la cancellazione, che quel gettone
 *                                            lo pretende
 *
 * **Perche la cancellazione e una `DELETE` con un corpo e non una `POST`.**
 * Perche e una cancellazione, e chi legge il registro delle API deve vederla
 * come tale. Il corpo porta la conferma — il gettone e, per un minore,
 * `acknowledge_minor` — e non i dati: un gettone in query string finirebbe nei
 * log di ogni intermediario.
 *
 * L'export sta nella rotta sorella `/export`: e una lettura, si scarica, e non
 * deve condividere un metodo con l'operazione che distrugge.
 */

export const runtime = "nodejs";

type Context = { params: { subjectId: string } };

export async function GET(request: Request, context: Context) {
  try {
    const url = new URL(request.url);
    const organizationId = url.searchParams.get("organization_id");
    const resolved = await resolveDataSubjectScope(request, organizationId);
    if (resolved.response) return resolved.response;

    const data = await previewDataSubjectErasure(resolved.scope, {
      organizationId,
      subjectKind: url.searchParams.get("subject_kind") || "athlete",
      subjectId: context.params.subjectId,
    });

    return ok(data);
  } catch (error: unknown) {
    return failure(request, error, "Lettura del fascicolo non riuscita");
  }
}

export async function DELETE(request: Request, context: Context) {
  try {
    const body = await request.json().catch(() => ({}) as any);
    const organizationId =
      body?.organization_id || body?.organizationId || null;
    const resolved = await resolveDataSubjectScope(request, organizationId);
    if (resolved.response) return resolved.response;

    const data = await eraseDataSubject(resolved.scope, {
      organizationId,
      subjectKind: body?.subject_kind || body?.subjectKind || "athlete",
      subjectId: context.params.subjectId,
      confirmationToken:
        body?.confirmation_token || body?.confirmationToken || "",
      acknowledgeMinor:
        body?.acknowledge_minor === true || body?.acknowledgeMinor === true,
      reason: body?.reason,
    });

    return ok(data);
  } catch (error: unknown) {
    return failure(request, error, "Cancellazione dei dati non riuscita");
  }
}
