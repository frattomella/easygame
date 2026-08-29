import { NextResponse } from "next/server";
import {
  requireAuthenticatedUser,
  resolveOrganizationScopeForUser,
} from "@/lib/server/auth";
import { publicErrorMessage } from "@/lib/server/api-errors";
import type { MemberAccessScope } from "@/lib/server/members";

/**
 * Le tre righe che ogni rotta del libro soci ripeterebbe.
 *
 * Non e un route handler — Next tratta come rotta solo `route.ts` — e non
 * contiene logica di dominio: risolve la sessione, risolve lo scope, e mappa un
 * errore su uno stato HTTP con la convenzione del progetto (un messaggio che
 * contiene «Accesso negato» diventa 403, tutto il resto 400).
 *
 * **Perche `membership` e non `members`.** `/api/v1/:resource` e il CRUD
 * generico, e `members` e una delle sue risorse: una cartella statica con
 * quel nome oscurerebbe la rotta dinamica e farebbe sparire un endpoint
 * documentato. Il libro soci e comunque una cosa diversa dall'anagrafica, e
 * il nome lo dice.
 *
 * **Il ruolo arriva dallo scope, non dal corpo.** `resolveOrganizationScopeForUser`
 * lo ricava dalle membership: e cio che permette al servizio di applicare i
 * permessi senza che nessuna rotta debba ricordarsi di verificarli.
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

export type ResolvedMembershipScope =
  | { scope: MemberAccessScope; response?: undefined }
  | { scope?: undefined; response: NextResponse };

/**
 * Il club con cui operare.
 *
 * L'`organization_id` proposto dal client non viene mai creduto: passa da
 * `resolveOrganizationScopeForUser`, che lo confronta con le membership.
 */
export const resolveMembershipScope = async (
  request: Request,
  requestedOrganizationId?: string | null,
): Promise<ResolvedMembershipScope> => {
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
