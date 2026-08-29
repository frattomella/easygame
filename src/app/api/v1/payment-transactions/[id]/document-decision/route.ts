import { NextResponse } from "next/server";
import {
  requireAuthenticatedUser,
  resolveOrganizationScopeForUser,
} from "@/lib/server/auth";
import { describeDocumentDecision } from "@/lib/server/fiscal-documents";
import { canManageClubConfiguration } from "@/lib/access-roles";
import { publicErrorMessage } from "@/lib/server/api-errors";

/**
 * **Cosa EasyGame propone di emettere per questo incasso, e perche.**
 *
 *   GET /api/v1/payment-transactions/:id/document-decision[?operation_type_code=…]
 *
 * **Perche esiste.** `describeDocumentDecision` era scritta dal Blocco D e
 * **non aveva chiamanti**: la spiegazione che l'operatore doveva leggere
 * *prima* di premere il pulsante arrivava, quando arrivava, sotto forma di
 * errore *dopo* — «per emettere una fattura mancano: intestatario: CAP». Chi
 * emette un documento fiscale deve poter sapere in anticipo quale documento
 * uscira, con quale numero, con quale classificazione e cosa manca.
 *
 * **Perche e una lettura e non un'anteprima che prenota.** Il numero si legge
 * con `peekDocumentNumber`, che non incrementa: guardare non deve consumare un
 * numero. Se nel frattempo qualcun altro emette, il numero mostrato sara stato
 * il suo — ed e il motivo per cui questa risposta si chiama anteprima.
 *
 * **Chi puo leggerla.** Lo stesso ruolo che puo emettere: la risposta contiene
 * i dati fiscali dell'intestatario e la posizione del club, che non sono cose
 * da mostrare a chi non emette.
 */

export const runtime = "nodejs";

type Context = { params: { id: string } };

const unauthorized = () =>
  NextResponse.json(
    { data: null, error: { message: "Accesso negato: sessione assente" } },
    { status: 401 },
  );

export async function GET(request: Request, context: Context) {
  try {
    const session = await requireAuthenticatedUser(request);
    if (!session) return unauthorized();

    const url = new URL(request.url);
    const scope = await resolveOrganizationScopeForUser(
      session.db.user_id,
      request.headers.get("x-active-club-id"),
      request.headers.get("x-active-access-role"),
    );

    if (!canManageClubConfiguration(scope.activeRole)) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message:
              "Accesso negato: solo il proprietario o un gestore del club puo emettere un documento",
          },
        },
        { status: 403 },
      );
    }

    const decision = await describeDocumentDecision(
      {
        transactionId: context.params.id,
        /*
          La causale chiesta adesso: serve a rispondere «e se lo classificassi
          cosi?» senza scrivere niente. Vale come dichiarazione **solo** per
          questa anteprima; sulla riga ci arriva quando il documento si emette.
        */
        operationTypeCode: url.searchParams.get("operation_type_code"),
      },
      scope,
    );

    return NextResponse.json({ data: decision, error: null });
  } catch (error: any) {
    const message = publicErrorMessage(
      error,
      "Lettura della proposta documentale non riuscita",
    );
    const status = message.includes("Accesso negato")
      ? 403
      : message.includes("non trovato")
        ? 404
        : 400;

    return NextResponse.json({ data: null, error: { message } }, { status });
  }
}
