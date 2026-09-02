import { NextResponse } from "next/server";
import {
  requireAuthenticatedUser,
  resolveOrganizationScopeForUser,
} from "@/lib/server/auth";
import { hasSeasonPermission } from "@/lib/seasons/permissions";
import type { AccessScopeEntry } from "@/lib/roles/access-scope";
import { isValidationError, validationErrorPayload } from "@/lib/validation";
import { publicErrorMessage } from "@/lib/server/api-errors";
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
  /**
   * Il perimetro di sede e categoria dell'attore.
   *
   * Sta nel contesto e non solo dentro la rotta che lo usa perche il roster
   * non e l'unica risposta di questo dominio che nomina degli atleti, ed e
   * meglio che chi ne scrive una seconda lo trovi gia in mano.
   */
  accessScopes: AccessScopeEntry[];
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
 *
 * Il controllo passa dal permesso di dominio `seasons.change`
 * (`src/lib/seasons/permissions.ts`) e non piu da `canManageClubConfiguration`:
 * il perimetro e lo stesso, ma cambiare la stagione attiva e un'operazione a se
 * e va scritta come tale (AU-7). Il diniego finisce in `audit_logs` con il nome
 * del permesso, cosi chi legge la traccia sa **cosa** e stato negato.
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

  if (!hasSeasonPermission(scope.activeRole, "seasons.change")) {
    await recordAuditEvent({
      action: AUDIT_ACTIONS.resourceAccessDenied,
      outcome: "denied",
      actorUserId: session.db.user_id,
      actorEmail: session.db.user.email,
      actorRole: scope.activeRole,
      organizationId: scope.activeOrganizationId,
      resource: "seasons",
      request,
      metadata: {
        permission: "seasons.change",
        attemptedAction: request.method,
        path: url.pathname,
      },
    });
    return failure("Accesso negato: la gestione delle stagioni e riservata alla direzione del club", 403);
  }

  return {
    organizationId: scope.activeOrganizationId,
    role: scope.activeRole,
    userId: session.db.user_id,
    email: session.db.user.email,
    accessScopes: scope.accessScopes,
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
  if (isValidationError(error)) {
    return NextResponse.json(validationErrorPayload(error), { status: 400 });
  }

  /*
    Due riporti che partono insieme sulla stessa stagione: il secondo scrive la
    stessa collezione e sbatte contro l'unicita di `club_resource_items`. Il
    dato resta corretto — nessun duplicato, e il collaudo lo verifica — ma chi
    ha premuto due volte si vedeva rispondere «Errore sulla stagione» e non
    aveva modo di sapere che poteva semplicemente riprovare. Il 409 e la
    risposta giusta a una corsa persa, non un 400.
  */
  if (String(error?.code || "") === "P2002") {
    return NextResponse.json(
      {
        data: null,
        error: {
          message:
            "Un altro riporto e in corso su questa stagione: riprova fra qualche istante",
        },
      },
      { status: 409 },
    );
  }

  /*
    Il messaggio del driver non esce da qui: `createClubSeason` legge e scrive
    `clubs.settings`, e un errore del database tornava indietro con il nome
    del modello Prisma e il codice Postgres dentro l'envelope. «Accesso
    negato» continua a passare, perche e la stringa su cui la riga qui sotto
    decide il 403.
  */
  const message = publicErrorMessage(error, "Errore sulla stagione");
  const status = message.includes("Accesso negato") ? 403 : fallbackStatus;

  return NextResponse.json({ data: null, error: { message } }, { status });
};
