import { NextResponse } from "next/server";
import {
  requireAuthenticatedUser,
  resolveOrganizationScopeForUser,
} from "@/lib/server/auth";
import type { ProfileAccountLinksScope } from "@/lib/server/profile-account-links";

/**
 * Il preambolo comune delle rotte di scollegamento profilo↔account.
 *
 * Stessa forma di `src/app/api/v1/athlete-accounts/shared.ts`: la sessione e
 * il club attivo si risolvono qui, il permesso lo verifica il dominio
 * (`profile-account-links.ts`), che e anche l'unico posto in cui il diniego
 * lascia la propria riga di audit.
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

export type ContestoAllenatore = { params: { trainerId: string } };

export const risolviScope = async (
  request: Request,
): Promise<{ scope: ProfileAccountLinksScope } | null> => {
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
      accessScopes: scope.accessScopes,
      actorEmail: session.db.user.email,
    },
  };
};
