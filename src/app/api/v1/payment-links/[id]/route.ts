import { NextResponse } from "next/server";
import {
  requireAuthenticatedUser,
  resolveOrganizationScopeForUser,
} from "@/lib/server/auth";
import { assertCommunicationPermission } from "@/lib/communications/permissions";
import { revokePaymentLink } from "@/lib/server/payment-links";
import { publicErrorMessage } from "@/lib/server/api-errors";

/**
 * La revoca di un link di pagamento (G-06, W2-B).
 *
 *   DELETE /api/v1/payment-links/:id
 *
 * **`DELETE` che non cancella.** Il verbo dice cosa smette di funzionare, non
 * cosa sparisce dall'archivio: la riga resta, perche e insieme la prova di
 * aver emesso il link e il registro delle sue aperture. Cancellarla
 * perderebbe entrambe.
 *
 * **Stesso perimetro dell'emissione.** Chi puo emettere puo spegnere: un link
 * che si emette e non si revoca sarebbe una porta senza chiave.
 *
 * **Revocare due volte non e un errore.** La seconda chiamata risponde con la
 * data della prima: e il caso normale del doppio clic, non un conflitto.
 */

export const runtime = "nodejs";

type Context = { params: { id: string } };

const unauthorized = () =>
  NextResponse.json(
    { data: null, error: { message: "Accesso negato: sessione assente" } },
    { status: 401 },
  );

export async function DELETE(request: Request, context: Context) {
  try {
    const session = await requireAuthenticatedUser(request);
    if (!session) return unauthorized();

    const scope = await resolveOrganizationScopeForUser(
      session.db.user_id,
      request.headers.get("x-active-club-id"),
      request.headers.get("x-active-access-role"),
    );

    assertCommunicationPermission(scope.activeRole, "communications.send");

    const result = await revokePaymentLink({
      organizationId: null,
      linkId: context.params.id,
      scope,
      actorUserId: session.db.user_id,
      request,
    });

    return NextResponse.json({ data: result, error: null });
  } catch (error: any) {
    const message = publicErrorMessage(
      error,
      "Revoca del link di pagamento non riuscita",
    );
    return NextResponse.json(
      { data: null, error: { message } },
      { status: message.includes("Accesso negato") ? 403 : 400 },
    );
  }
}
