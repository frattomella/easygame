import { buildCompileContext } from "@/lib/server/form-submissions";
import { failure, ok, resolveFormsScope } from "../../http";

/**
 * Cosa serve per compilare un modulo dalla scheda di una persona.
 *
 *   GET /api/v1/forms/:id/compile?subjects=[{"subject":"athlete","recordId":…}]
 *
 * Restituisce la versione pubblicata, le risposte gia note e le scelte
 * ancora da fare — quale tutore, quando l'atleta ne ha piu di uno.
 *
 * **Perche non basta `GET /api/v1/forms/:id`.** Quello restituisce il modulo;
 * questo restituisce il modulo **per quella persona**. La precompilazione
 * legge colonne e campi JSON dell'anagrafica: calcolarla nel browser
 * vorrebbe dire mandargli il record intero, cioe piu dati di quelli che il
 * modulo chiede.
 */

export const runtime = "nodejs";

type Context = { params: { id: string } };

export async function GET(request: Request, context: Context) {
  try {
    const resolved = await resolveFormsScope(request);
    if (resolved.response) return resolved.response;

    const url = new URL(request.url);
    const raw = url.searchParams.get("subjects");

    let subjects: unknown = [];
    if (raw) {
      try {
        subjects = JSON.parse(raw);
      } catch {
        return failure(
          new Error("Soggetti non leggibili"),
          "Soggetti non leggibili",
        );
      }
    }

    return ok(
      await buildCompileContext(resolved.scope, {
        templateId: context.params.id,
        subjects,
      }),
    );
  } catch (error: any) {
    return failure(error, "Errore nella preparazione del modulo");
  }
}
