import { exportDataSubject } from "@/lib/server/data-subject";
import { failure, ok, resolveDataSubjectScope } from "../../http";

/**
 * **Portare via i propri dati.**
 *
 *   GET /api/v1/data-subject/<athleteId>/export
 *
 * Restituisce un oggetto solo, con una sezione per tabella, e **nessun byte**:
 * gli allegati compaiono come metadati, e i file si scaricano dalla loro rotta
 * — che e l'unica che sa applicare i permessi sul contenuto clinico.
 *
 * La lettura e tracciata (`data_subject.exported`): portare fuori l'intero
 * fascicolo di una persona e un atto, anche quando non scrive niente.
 */

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: { subjectId: string } },
) {
  try {
    const url = new URL(request.url);
    const organizationId = url.searchParams.get("organization_id");
    const resolved = await resolveDataSubjectScope(request, organizationId);
    if (resolved.response) return resolved.response;

    const data = await exportDataSubject(resolved.scope, {
      organizationId,
      subjectKind: url.searchParams.get("subject_kind") || "athlete",
      subjectId: context.params.subjectId,
    });

    return ok(data);
  } catch (error: unknown) {
    return failure(request, error, "Export dei dati non riuscito");
  }
}
