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
      /*
        I documenti che mancano si chiedono **approvando**, non respingendo: e
        il punto in cui l'iscrizione e il fascicolo si saldano (Wave 5, lane
        5G). Prima l'unica risposta a «manca il certificato medico» era il
        rifiuto, che costa alla famiglia una compilazione da rifare e alla
        segreteria una seconda pratica identica da riesaminare.
      */
      documentRequests: body?.document_requests ?? body?.documentRequests,
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
        /*
          **Cosa e stato applicato — il tipo, non il nome di chi.**

          Qui viveva un numero, e le stringhe — «Genitore sostituito», l'unico
          posto in cui si dice che una riga viva e stata tolta — morivano nel
          corpo della risposta HTTP: `form-submissions.ts` non registra niente
          e `applied` non finisce sulla compilazione.

          Scriverle **intere** ha pero aperto un indice nuovo: l'etichetta porta
          «Nome Cognome» o un indirizzo, quindi il registro finiva per
          conservare il nome di un minore e quello di un terzo, in una tabella
          che `data-subject.ts` non dichiara e che si conserva a tempo
          indeterminato quando la retention non e configurata.

          Le due esigenze si tengono insieme tenendo solo la **parte davanti ai
          due punti**: «Genitore sostituito», «Consenso aggiornato». Dice cosa e
          successo, che e cio che un registro serve a dire, e non dice a chi —
          che e cio che un registro non deve conservare.
        */
        applied: outcome.applied.map((voce) =>
          String(voce).split(":")[0].trim(),
        ),
        appliedCount: outcome.applied.length,
      },
    });

    return ok(outcome);
  } catch (error: any) {
    return failure(error, "Errore nella revisione della compilazione");
  }
}
