import { NextResponse } from "next/server";
import {
  requireAuthenticatedUser,
  resolveOrganizationScopeForUser,
} from "@/lib/server/auth";
import type { AthleteAccountsScope } from "@/lib/server/athlete-accounts";

/**
 * Il preambolo comune delle rotte dell'accesso atleta.
 *
 * Sono cinque rotte che fanno tutte le stesse due cose prima del lavoro vero:
 * leggere la sessione e risolvere il club attivo. Il permesso **non** si
 * verifica qui, ed e voluto: lo verifica il dominio, che e anche l'unico posto
 * in cui il diniego lascia la propria riga di audit. Una guardia in due punti
 * e una guardia che prima o poi dice due cose diverse.
 *
 * Il file e colocato dentro `src/app/api` di proposito: e il modo in cui
 * `tests/auth/api-authorization.test.mjs` continua a **vedere** la guardia
 * seguendo l'import relativo della rotta.
 */

export const nonAutenticato = () =>
  NextResponse.json(
    { data: null, error: { message: "Accesso negato: sessione assente" } },
    { status: 401 },
  );

export const ok = (data: unknown, status = 200) =>
  NextResponse.json({ data, error: null }, { status });

/**
 * Lo stato di un errore di dominio.
 *
 * `Accesso negato` mappa il 403 — e la convenzione del repository, e la
 * rispettano il permesso e il confine multi-tenant — «non trovato» il 404, e
 * tutto il resto e una richiesta che non si puo soddisfare.
 */
export const errore = (error: any, fallback: string) => {
  const messaggio = String(error?.message || fallback);
  const status = messaggio.includes("Accesso negato")
    ? 403
    : /non trovat[ao]/i.test(messaggio)
      ? 404
      : 400;

  return NextResponse.json(
    { data: null, error: { message: messaggio } },
    { status },
  );
};

export type ContestoAtleta = { params: { athleteId: string } };

/**
 * Sessione e club attivo, oppure `null` se non c'e sessione.
 *
 * Il club dichiarato dal client passa comunque da
 * `resolveOrganizationScopeForUser`, che accetta solo un club a cui l'utente
 * appartiene; il confine sulla **riga** lo applica poi il dominio con
 * `assertActiveClub` (ADR-0094).
 */
export const risolviScope = async (
  request: Request,
): Promise<{ scope: AthleteAccountsScope } | null> => {
  const session = await requireAuthenticatedUser(request);
  if (!session) return null;

  const url = new URL(request.url);
  const scope = await resolveOrganizationScopeForUser(
    session.db.user_id,
    url.searchParams.get("organization_id") ||
      url.searchParams.get("club_id") ||
      request.headers.get("x-active-club-id"),
    request.headers.get("x-active-access-role"),
  );

  return {
    scope: {
      userId: scope.userId,
      activeOrganizationId: scope.activeOrganizationId,
      activeRole: scope.activeRole,
      allowedOrganizationIds: scope.allowedOrganizationIds,
      actorEmail: session.db.user.email,
    },
  };
};

export const leggiCorpo = async (request: Request) =>
  request.json().catch(() => ({}) as Record<string, unknown>);
