import { listConsentStates } from "@/lib/server/consents";
import { failure, ok, resolveConsentScope } from "../http";

/**
 * La vista d'insieme: **chi manca e chi ha revocato**.
 *
 *   GET /api/v1/consents/states?subject_kind=&subject_id=
 *   GET /api/v1/consents/states?definition_id=
 *
 * Con un soggetto indicato risponde alla domanda della segreteria — «questa
 * famiglia cosa ha firmato?» — e include le definizioni **senza** nessuna
 * decisione, con stato `missing`: e quello l'elenco di cio che manca, e non
 * comparirebbe mai se si guardassero solo le righe scritte.
 *
 * Senza soggetto risponde alla domanda opposta — «chi ha revocato il consenso
 * immagini?» — raggruppando lo storico per (definizione, soggetto).
 *
 * **Il percorso e statico e sta prima di `[id]`**: Next risolve prima il
 * segmento fisso, quindi `states` non e mai scambiato per un identificativo.
 */

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const organizationId = url.searchParams.get("organization_id");
    const resolved = await resolveConsentScope(request, organizationId);
    if (resolved.response) return resolved.response;

    const data = await listConsentStates(resolved.scope, {
      organizationId,
      definitionId: url.searchParams.get("definition_id"),
      subjectKind: url.searchParams.get("subject_kind"),
      subjectId: url.searchParams.get("subject_id"),
      includeRetired: url.searchParams.get("include_retired") === "1",
    });

    return ok(data);
  } catch (error: any) {
    return failure(error, "Lettura dello stato dei consensi non riuscita");
  }
}
