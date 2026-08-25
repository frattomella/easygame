import { NextResponse } from "next/server";
import {
  requireAuthenticatedUser,
  resolveOrganizationScopeForUser,
} from "@/lib/server/auth";
import type { FormsAccessScope } from "@/lib/server/forms";

/**
 * Le tre righe che ogni route dei moduli ripeterebbe.
 *
 * Non e un route handler — Next tratta come route solo `route.ts` — e non
 * contiene logica di dominio: risolve la sessione, risolve lo scope, e mappa
 * un errore su uno stato HTTP con la convenzione del progetto (un messaggio
 * che contiene «Accesso negato» diventa 403, tutto il resto 400).
 */

export const unauthorized = () =>
  NextResponse.json(
    { data: null, error: { message: "Sessione non valida" } },
    { status: 401 },
  );

export const failure = (error: any, fallback: string) => {
  const message = String(error?.message || fallback);
  const status = message.includes("Accesso negato")
    ? 403
    : /non trovat[oa]/i.test(message)
      ? 404
      : 400;

  return NextResponse.json({ data: null, error: { message } }, { status });
};

export const ok = (data: unknown) =>
  NextResponse.json({ data, error: null });

export type ResolvedScope =
  | { scope: FormsAccessScope; response?: undefined }
  | { scope?: undefined; response: NextResponse };

/**
 * Il club con cui operare.
 *
 * L'`organization_id` proposto dal client non viene mai creduto: passa da
 * `resolveOrganizationScopeForUser`, che lo confronta con le membership.
 */
export const resolveFormsScope = async (
  request: Request,
  requestedOrganizationId?: string | null,
): Promise<ResolvedScope> => {
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
