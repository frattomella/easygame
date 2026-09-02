import { NextResponse } from "next/server";
import {
  requireAuthenticatedUser,
  resolveOrganizationScopeForUser,
} from "@/lib/server/auth";
import { describeDocumentDecision } from "@/lib/server/fiscal-documents";
import { canManageClubConfigurationAsActor } from "@/lib/access-roles";
import { hasAccountingPermission } from "@/lib/accounting/permissions";
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

    /*
      **emettere il documento di un incasso: la chiave che il club ha spuntato deve contare.**

      La lettura della prima nota chiedeva gia `accounting.read`; la
      scrittura chiedeva soltanto il ruolo, che di un gettone personalizzato
      e la **base**. Misurato: lo stesso ruolo a cui il club aveva tolto la
      contabilita non poteva vedere il libro cassa e poteva scriverci dentro.

      Adesso passa la direzione canonica **oppure** chi porta la chiave. Le
      due condizioni non si sommano per comodita: la prima e il perimetro di
      chi amministra il club, la seconda e la delega che il club ha deciso.
    */
    if (
      !canManageClubConfigurationAsActor(scope.activeRole) &&
      !hasAccountingPermission(scope.activeRole, "accounting.manage")
    ) {
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
