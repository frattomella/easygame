import { NextResponse } from "next/server";
import {
  requireAuthenticatedUser,
  resolveOrganizationScopeForUser,
} from "@/lib/server/auth";
import { publicErrorMessage } from "@/lib/server/api-errors";
import { readRequestId, reportServerError } from "@/lib/server/observability";
import type { DataSubjectScope } from "@/lib/server/data-subject";

/**
 * Le righe che le tre rotte dei diritti dell'interessato ripeterebbero.
 *
 * Non e un route handler — Next tratta come rotta solo `route.ts` — e non
 * contiene logica di dominio: risolve la sessione, risolve lo scope, e mappa un
 * errore su uno stato HTTP con la convenzione del progetto (un messaggio che
 * contiene «Accesso negato» diventa 403, tutto il resto 400).
 *
 * A differenza delle sorelle, questa passa da `reportServerError`: sono le
 * rotte che toccano l'intero fascicolo di una persona, e un errore qui e
 * esattamente il caso in cui serve poter correlare due righe di log.
 */

export const unauthorized = () =>
  NextResponse.json(
    { data: null, error: { message: "Accesso negato: sessione assente" } },
    { status: 401 },
  );

export const failure = (request: Request, error: unknown, fallback: string) => {
  const message = publicErrorMessage(error, fallback);
  const status = message.includes("Accesso negato")
    ? 403
    : /non trovat[oa]/i.test(message)
      ? 404
      : 400;

  const requestId = readRequestId(request);

  /*
    Solo cio che non e una risposta di dominio: un 403 o un «persona non
    trovata» sono esiti previsti, e riempirebbero i log di righe che non
    raccontano nessun guasto.
  */
  if (status === 400) {
    reportServerError(error, {
      requestId,
      route: "/api/v1/data-subject",
      method: request.method,
    });
  }

  return NextResponse.json(
    { data: null, error: { message, ...(requestId ? { requestId } : {}) } },
    { status },
  );
};

export const ok = (data: unknown) => NextResponse.json({ data, error: null });

export type ResolvedDataSubjectScope =
  | { scope: DataSubjectScope; response?: undefined }
  | { scope?: undefined; response: NextResponse };

/**
 * Il club con cui operare.
 *
 * L'`organization_id` proposto dal client non viene mai creduto: passa da
 * `resolveOrganizationScopeForUser`, che lo confronta con le membership.
 */
export const resolveDataSubjectScope = async (
  request: Request,
  requestedOrganizationId?: string | null,
): Promise<ResolvedDataSubjectScope> => {
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
