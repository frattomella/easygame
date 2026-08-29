import { NextResponse } from "next/server";
import {
  requireAuthenticatedUser,
  resolveOrganizationScopeForUser,
} from "@/lib/server/auth";
import {
  assertAccountingPermission,
  type AccountingPermission,
} from "@/lib/accounting/permissions";
import { recordAuditEvent, AUDIT_ACTIONS } from "@/lib/server/audit";
import { isValidationError, validationErrorPayload } from "@/lib/validation";
import type { FinancialAccountScope } from "@/lib/server/financial-accounts";

/**
 * L'involucro delle rotte dei conti finanziari.
 *
 * **Perche un involucro e non il preambolo copiato in ogni rotta.** Le rotte
 * dei conti fanno tutte le stesse quattro cose prima del lavoro vero: leggere
 * la sessione, risolvere il club attivo, verificare il permesso, mappare gli
 * errori. E la stessa forma gia in uso nel lavoro sportivo
 * (`src/lib/server/sport-work-route.ts`), e per la stessa ragione: quando una
 * delle quattro cambia, deve cambiare in un posto solo.
 *
 * **Il permesso e un parametro obbligatorio.** Scrivere una rotta di questo
 * dominio richiede dichiarare cosa serve per usarla, e il valore viene da
 * `src/lib/accounting/permissions.ts` — mai da un `if` sul ruolo scritto qui.
 * Un controllo a mano dentro la rotta e il modo in cui la matrice della pagina
 * e quella dell'API smettono di coincidere (§30 del piano, lezione W3-14).
 *
 * **Il diniego si traccia.** Chi prova a leggere i saldi di un altro club, o a
 * leggerli senza averne il diritto, e un evento di sicurezza: e la stessa
 * scelta gia presa sul resto delle risorse economiche.
 */

export type AccountingRouteContext = {
  request: Request;
  url: URL;
  scope: FinancialAccountScope;
  params: Record<string, string>;
};

const unauthorized = () =>
  NextResponse.json(
    { data: null, error: { message: "Accesso negato: sessione assente" } },
    { status: 401 },
  );

/**
 * Vero se il messaggio viene dall'ORM o dal driver, e non dal dominio.
 *
 * Un identificativo malformato — un link vecchio, un copia-incolla monco —
 * arriva fino a `findUnique` e ne fa uscire il testo intero verso il client:
 * chi lo legge non impara niente di utile e impara come si chiamano le tabelle
 * dei conti correnti della societa.
 */
const isInfrastructureError = (message: string) =>
  /Invalid `prisma\.|ConnectorError|PostgresError|invalid input syntax for type uuid|\bat .*node_modules/i.test(
    message,
  );

export const accountingFailure = (error: any, fallback: string) => {
  if (isValidationError(error)) {
    return NextResponse.json(validationErrorPayload(error), { status: 400 });
  }

  const raw = String(error?.message || fallback);

  /*
    Un identificativo che non e un UUID non individua **nessun** conto: la
    risposta onesta e 404, la stessa che riceverebbe un UUID ben formato ma
    inesistente.
  */
  if (/invalid input syntax for type uuid/i.test(raw)) {
    return NextResponse.json(
      { data: null, error: { message: "Conto non trovato" } },
      { status: 404 },
    );
  }

  if (isInfrastructureError(raw)) {
    console.error("[accounting/accounts] errore non gestito:", error);
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

export const accountingRoute =
  (
    permission: AccountingPermission,
    handler: (context: AccountingRouteContext) => Promise<Response>,
    fallbackMessage = "Operazione sui conti non riuscita",
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
        assertAccountingPermission(scope.activeRole, permission);
      } catch (error: any) {
        await recordAuditEvent({
          action: AUDIT_ACTIONS.resourceAccessDenied,
          outcome: "denied",
          actorUserId: session.db.user_id,
          actorEmail: session.db.user.email,
          actorRole: scope.activeRole,
          organizationId: scope.activeOrganizationId,
          resource: "financial_accounts",
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
        params: routeContext?.params || {},
        scope: {
          userId: scope.userId,
          activeOrganizationId: scope.activeOrganizationId,
          activeRole: scope.activeRole,
          allowedOrganizationIds: scope.allowedOrganizationIds,
        },
      });
    } catch (error: any) {
      return accountingFailure(error, fallbackMessage);
    }
  };

export const ok = (data: unknown, status = 200) =>
  NextResponse.json({ data, error: null }, { status });

export const readBody = async (request: Request) =>
  request.json().catch(() => ({}) as Record<string, unknown>);
