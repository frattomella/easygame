import { NextResponse } from "next/server";
import {
  requireAuthenticatedUser,
  resolveOrganizationScopeForUser,
} from "@/lib/server/auth";
import { publicErrorMessage } from "@/lib/server/api-errors";
import type { SponsorScope } from "@/lib/server/sponsors";

/**
 * Le tre righe che ogni rotta degli sponsor ripeterebbe.
 *
 * Non e un route handler — Next tratta come rotta solo `route.ts` — e non
 * contiene logica di dominio: risolve la sessione, risolve lo scope, e mappa un
 * errore su uno stato HTTP con la convenzione del progetto (un messaggio che
 * contiene «Accesso negato» diventa 403, tutto il resto 400).
 *
 * **Perche `sponsorships` e non `sponsors`.** `/api/v1/:resource` e il CRUD
 * generico, e `sponsors` e una delle sue risorse: una cartella statica con quel
 * nome oscurerebbe la rotta dinamica e farebbe sparire un endpoint documentato.
 * E la stessa ragione — e la stessa soluzione — di `membership` accanto a
 * `members`. L'anagrafica dello sponsor resta al CRUD generico; il **contratto**
 * e l'**incasso** sono un'altra cosa, e il nome lo dice.
 */

export const unauthorized = () =>
  NextResponse.json(
    { data: null, error: { message: "Accesso negato: sessione assente" } },
    { status: 401 },
  );

export const failure = (error: any, fallback: string) => {
  const message = publicErrorMessage(error, fallback);
  const status = message.includes("Accesso negato")
    ? 403
    : /non trovat[oa]/i.test(message)
      ? 404
      : 400;

  return NextResponse.json({ data: null, error: { message } }, { status });
};

export const ok = (data: unknown) => NextResponse.json({ data, error: null });

export type ResolvedSponsorScope =
  | { scope: SponsorScope; response?: undefined }
  | { scope?: undefined; response: NextResponse };

/**
 * Il club con cui operare.
 *
 * L'`organization_id` proposto dal client non viene mai creduto: passa da
 * `resolveOrganizationScopeForUser`, che lo confronta con le membership e
 * **risolve il ruolo per quel club**. E la condizione perche il confine e il
 * permesso parlino dello stesso club — vedi
 * `src/lib/auth/active-club-boundary.ts`.
 */
export const resolveSponsorScope = async (
  request: Request,
  requestedOrganizationId?: string | null,
): Promise<ResolvedSponsorScope> => {
  const session = await requireAuthenticatedUser(request);
  if (!session) return { response: unauthorized() };

  const scope = await resolveOrganizationScopeForUser(
    session.db.user_id,
    requestedOrganizationId || request.headers.get("x-active-club-id"),
    request.headers.get("x-active-access-role"),
  );

  if (!scope.activeOrganizationId) {
    return {
      response: NextResponse.json(
        { data: null, error: { message: "Nessun club disponibile" } },
        { status: 403 },
      ),
    };
  }

  return { scope };
};
