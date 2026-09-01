import { NextResponse } from "next/server";
import {
  requireAuthenticatedUser,
  resolveOrganizationScopeForUser,
} from "@/lib/server/auth";
import type { ClubRolesScope } from "@/lib/server/club-roles";

/**
 * Il preambolo comune delle rotte dei ruoli personalizzati (Wave 6, lane 6G).
 *
 * Legge la sessione e risolve il club attivo. Il **permesso non si verifica
 * qui**, ed e voluto: lo verifica il dominio, che e anche l'unico posto in cui
 * il diniego lascia la propria riga di audit. Una guardia in due punti e una
 * guardia che prima o poi dice due cose diverse.
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

export const leggiCorpo = async (request: Request) =>
  request.json().catch(() => ({}) as Record<string, unknown>);

export type ContestoId = { params: { id: string } };

export const risolviScope = async (
  request: Request,
): Promise<{ scope: ClubRolesScope } | null> => {
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
