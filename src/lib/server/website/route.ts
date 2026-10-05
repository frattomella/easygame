import { NextResponse } from "next/server";
import { isPlatformAdminSession, requireAuthenticatedUser, resolveOrganizationScopeForUser } from "../auth";
import { readRequestId, reportServerError } from "../observability";
import { isWebsiteConflict, type WebsiteScope } from "./access";

/**
 * **Il guscio comune delle rotte del sito**: sessione, scope, errori.
 *
 * Ogni rotta di `/api/v1/website/**` passa di qui e chiama un modulo di
 * `src/lib/server/website/`, che autorizza da se (`requireWebsiteAccess`):
 * questo file non decide permessi, traduce soltanto.
 *
 * - nessuna sessione → 401;
 * - un messaggio con «Accesso negato» → 403 (la convenzione del repository);
 * - un conflitto di versione → 409 con la versione attuale, cosi l'editor
 *   puo ricaricare, confrontare o riscrivere per scelta;
 * - tutto il resto → 400 con il messaggio del dominio, gia in italiano.
 */

export type WebsiteRouteContext = { scope: WebsiteScope; request: Request; userId: string; email: string | null };

export const websiteRoute = async <T>(
  request: Request,
  handler: (context: WebsiteRouteContext) => Promise<T>,
  options: { status?: number; fallbackMessage?: string } = {},
) => {
  try {
    const session = await requireAuthenticatedUser(request);
    if (!session) {
      return NextResponse.json({ data: null, error: { message: "Sessione non valida" } }, { status: 401 });
    }
    const base = await resolveOrganizationScopeForUser(
      session.db.user_id,
      request.headers.get("x-active-club-id"),
      request.headers.get("x-active-access-role"),
    );
    const scope: WebsiteScope = {
      ...base,
      isPlatformAdmin: isPlatformAdminSession(session),
      actorEmail: session.db.user.email,
    };
    const data = await handler({ scope, request, userId: session.db.user_id, email: session.db.user.email });
    return NextResponse.json({ data, error: null }, { status: options.status || 200 });
  } catch (error: any) {
    if (isWebsiteConflict(error)) {
      return NextResponse.json(
        { data: null, error: { message: error.message, code: "CONFLICT", currentVersion: error.currentVersion } },
        { status: 409 },
      );
    }
    const message = String(error?.message || "");
    if (message.includes("Accesso negato")) {
      return NextResponse.json({ data: null, error: { message } }, { status: 403 });
    }
    if (!message || error instanceof TypeError || error?.name === "PrismaClientKnownRequestError" || error?.name === "PrismaClientValidationError") {
      reportServerError(error, { requestId: readRequestId(request), route: new URL(request.url).pathname, method: request.method });
      return NextResponse.json(
        { data: null, error: { message: options.fallbackMessage || "Errore nell'operazione sul sito" } },
        { status: error?.name?.startsWith?.("Prisma") ? 400 : 500 },
      );
    }
    return NextResponse.json(
      { data: null, error: { message, ...(error?.issues ? { issues: error.issues } : {}), ...(error?.usages ? { usages: error.usages } : {}) } },
      { status: 400 },
    );
  }
};

/** Il corpo JSON, che accetta anche la forma `{ data: … }` del client. */
export const readJsonBody = async (request: Request): Promise<Record<string, any>> => {
  const body = await request.json().catch(() => ({}));
  if (body && typeof body === "object" && !Array.isArray(body)) {
    return body.data && typeof body.data === "object" && !Array.isArray(body.data) ? body.data : body;
  }
  return {};
};
