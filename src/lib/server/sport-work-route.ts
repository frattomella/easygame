import { NextResponse } from "next/server";
import {
  requireAuthenticatedUser,
  resolveOrganizationScopeForUser,
} from "./auth";
import {
  assertSportWorkPermission,
  type SportWorkPermission,
} from "@/lib/sport-work/permissions";
import { recordAuditEvent, AUDIT_ACTIONS } from "./audit";
import {
  isValidationError,
  validationErrorPayload,
} from "@/lib/validation";
import type { SportWorkScope } from "./sport-work";

/**
 * L'involucro comune delle rotte del lavoro sportivo.
 *
 * **Perche un involucro e non venti copie dello stesso preambolo.** Le rotte
 * di questo dominio sono una ventina e fanno tutte le stesse quattro cose
 * prima di arrivare al lavoro vero: leggere la sessione, risolvere il club
 * attivo, verificare il permesso economico, mappare gli errori. Copiare
 * quel preambolo venti volte significa che il giorno in cui una delle quattro
 * cambia, diciannove rotte restano indietro — e la diciannovesima e quella
 * che perde il confine.
 *
 * Il permesso e un **parametro obbligatorio**: non esiste una rotta di questo
 * dominio senza. Scriverla richiede dichiarare cosa serve per usarla.
 *
 * **Il diniego si traccia.** Un tentativo di leggere i compensi di un altro
 * club, o di erogare senza averne il diritto, e un evento di sicurezza: e la
 * stessa scelta gia presa sul resto delle risorse economiche.
 */

export type SportWorkRouteContext = {
  request: Request;
  url: URL;
  scope: SportWorkScope;
  session: NonNullable<Awaited<ReturnType<typeof requireAuthenticatedUser>>>;
  params: Record<string, string>;
};

const unauthorized = () =>
  NextResponse.json(
    { data: null, error: { message: "Accesso negato: sessione assente" } },
    { status: 401 },
  );

/**
 * Vero se il messaggio viene dall'ORM o dal driver, non dal dominio.
 *
 * Prisma compone messaggi lunghi che citano il **nome del modello**, la query
 * e il codice d'errore di Postgres. Un identificativo malformato — che e il
 * caso ordinario, non un attacco: un link vecchio, un copia-incolla monco —
 * arriva fino a `findUnique` e ne fa uscire il testo intero verso il client.
 *
 * Chi legge quel messaggio non impara nulla di utile e impara qualcosa che non
 * gli spetta: come si chiamano le tabelle di un dominio che tratta i compensi.
 */
const isInfrastructureError = (message: string) =>
  /Invalid `prisma\.|ConnectorError|PostgresError|invalid input syntax for type uuid|\bat .*node_modules/i.test(
    message,
  );

export const sportWorkFailure = (error: any, fallback: string) => {
  if (isValidationError(error)) {
    return NextResponse.json(validationErrorPayload(error), { status: 400 });
  }

  const raw = String(error?.message || fallback);

  /*
   * Un identificativo che non e un UUID non individua **nessun** record: la
   * risposta onesta e 404, la stessa che riceverebbe un UUID ben formato ma
   * inesistente. Distinguere i due casi direbbe a chi prova che quella forma
   * di identificativo esiste, e non serve a chi ha solo sbagliato link.
   */
  if (/invalid input syntax for type uuid/i.test(raw)) {
    return NextResponse.json(
      { data: null, error: { message: "Risorsa non trovata" } },
      { status: 404 },
    );
  }

  if (isInfrastructureError(raw)) {
    console.error("[sport-work] errore non gestito:", error);
    return NextResponse.json(
      { data: null, error: { message: fallback } },
      { status: 400 },
    );
  }

  const status = raw.includes("Accesso negato")
    ? 403
    : /non trovat[ao]/i.test(raw)
      ? 404
      : 400;

  return NextResponse.json({ data: null, error: { message: raw } }, { status });
};

export const sportWorkRoute =
  (
    permission: SportWorkPermission,
    handler: (context: SportWorkRouteContext) => Promise<Response>,
    fallbackMessage = "Operazione sul lavoro sportivo non riuscita",
  ) =>
  async (request: Request, routeContext?: { params?: Record<string, string> }) => {
    try {
      const session = await requireAuthenticatedUser(request);
      if (!session) return unauthorized();

      const url = new URL(request.url);
      const scope = await resolveOrganizationScopeForUser(
        session.db.user_id,
        url.searchParams.get("organization_id") ||
          request.headers.get("x-active-club-id"),
        request.headers.get("x-active-access-role"),
      );

      try {
        assertSportWorkPermission(scope.activeRole, permission);
      } catch (error: any) {
        await recordAuditEvent({
          action: AUDIT_ACTIONS.resourceAccessDenied,
          outcome: "denied",
          actorUserId: session.db.user_id,
          actorEmail: session.db.user.email,
          actorRole: scope.activeRole,
          organizationId: scope.activeOrganizationId,
          resource: "sport_work",
          resourceId: routeContext?.params?.id || null,
          request,
          metadata: { permission, path: url.pathname, method: request.method },
        });
        return NextResponse.json(
          { data: null, error: { message: String(error?.message) } },
          { status: 403 },
        );
      }

      return await handler({
        request,
        url,
        session,
        params: routeContext?.params || {},
        scope: {
          userId: scope.userId,
          activeOrganizationId: scope.activeOrganizationId,
          activeRole: scope.activeRole,
          actorEmail: session.db.user.email,
          allowedOrganizationIds: scope.allowedOrganizationIds,
          request,
        },
      });
    } catch (error: any) {
      return sportWorkFailure(error, fallbackMessage);
    }
  };

export const ok = (data: unknown, status = 200) =>
  NextResponse.json({ data, error: null }, { status });

export const readBody = async (request: Request) =>
  request.json().catch(() => ({}) as Record<string, unknown>);
