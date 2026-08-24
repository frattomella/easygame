import { NextResponse } from "next/server";
import {
  requireAuthenticatedUser,
  resolveOrganizationScopeForUser,
} from "@/lib/server/auth";
import { canManageClubConfiguration } from "@/lib/access-roles";
import {
  AUDIT_ACTIONS,
  recordAuditEvent,
  type AuditEventInput,
} from "@/lib/server/audit";

/**
 * Contesto condiviso dalle rotte `/api/v1/seasons/**`.
 *
 * Non e un file di rotta: App Router instrada solo `route.ts`. Sta qui e non
 * in `src/lib/server/seasons.ts` perche quel modulo e dominio puro e non deve
 * conoscere `Request` (ADR-0007).
 */

export type SeasonRequestContext = {
  organizationId: string;
  role: string | null;
  userId: string;
  email: string | null;
  audit: (
    event: Omit<AuditEventInput, "organizationId" | "actorUserId" | "actorEmail" | "actorRole" | "request">,
  ) => Promise<boolean>;
};

export type SeasonRequestFailure = { response: NextResponse };

const failure = (message: string, status: number): SeasonRequestFailure => ({
  response: NextResponse.json({ data: null, error: { message } }, { status }),
});

export const isSeasonRequestFailure = (
  value: SeasonRequestContext | SeasonRequestFailure,
): value is SeasonRequestFailure =>
  Object.prototype.hasOwnProperty.call(value, "response");

/**
 * Le stagioni sono configurazione di club: le governano solo `owner` e
 * `club_manager`. Un allenatore ne subisce il perimetro, non lo decide.
 */
export const resolveSeasonRequestContext = async (
  request: Request,
): Promise<SeasonRequestContext | SeasonRequestFailure> => {
  const session = await requireAuthenticatedUser(request);
  if (!session) {
    return failure("Sessione non valida", 401);
  }

  const url = new URL(request.url);
  const scope = await resolveOrganizationScopeForUser(
    session.db.user_id,
    request.headers.get("x-active-club-id") ||
      url.searchParams.get("organization_id") ||
      url.searchParams.get("club_id"),
    request.headers.get("x-active-access-role"),
  );

  if (!scope.activeOrganizationId) {
    return failure("Nessun club attivo disponibile", 400);
  }

  if (!canManageClubConfiguration(scope.activeRole)) {
    await recordAuditEvent({
      action: AUDIT_ACTIONS.resourceAccessDenied,
      outcome: "denied",
      actorUserId: session.db.user_id,
      actorEmail: session.db.user.email,
      actorRole: scope.activeRole,
      organizationId: scope.activeOrganizationId,
      resource: "seasons",
      request,
      metadata: { attemptedAction: request.method },
    });
    return failure("Accesso negato: la gestione delle stagioni e riservata alla direzione del club", 403);
  }

  return {
    organizationId: scope.activeOrganizationId,
    role: scope.activeRole,
    userId: session.db.user_id,
    email: session.db.user.email,
    audit: (event) =>
      recordAuditEvent({
        ...event,
        actorUserId: session.db.user_id,
        actorEmail: session.db.user.email,
        actorRole: scope.activeRole,
        organizationId: scope.activeOrganizationId,
        request,
      }),
  };
};

export const seasonErrorResponse = (error: any, fallbackStatus = 400) => {
  const message = String(error?.message || "Errore sulla stagione");
  const status = message.includes("Accesso negato") ? 403 : fallbackStatus;

  return NextResponse.json({ data: null, error: { message } }, { status });
};
