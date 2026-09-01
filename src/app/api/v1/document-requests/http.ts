import { NextResponse } from "next/server";
import {
  requireAuthenticatedUser,
  resolveOrganizationScopeForUser,
} from "@/lib/server/auth";
import { publicErrorMessage } from "@/lib/server/api-errors";
import type { DocumentDossierScope } from "@/lib/server/document-requests";

/**
 * Le tre righe che ogni rotta del fascicolo ripeterebbe.
 *
 * Non e un route handler — Next tratta come rotta solo `route.ts` — e non
 * contiene logica di dominio: risolve la sessione, risolve lo scope, e mappa
 * l'errore su uno stato con la convenzione del progetto (un messaggio che
 * contiene «Accesso negato» diventa 403, «non trovato» 404, il resto 400).
 *
 * **Il ruolo arriva dallo scope, non dal corpo.**
 * `resolveOrganizationScopeForUser` lo ricava dalle membership del club
 * attivo: e cio che permette al servizio di applicare la matrice del §12 senza
 * che nessuna rotta debba ricordarsi di verificarla.
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

export const ok = (data: unknown, status = 200) =>
  NextResponse.json({ data, error: null }, { status });

export type ResolvedDossierScope =
  | { scope: DocumentDossierScope; response?: undefined }
  | { scope?: undefined; response: NextResponse };

/**
 * Il club con cui operare.
 *
 * L'`organization_id` proposto dal client non viene mai creduto: passa da
 * `resolveOrganizationScopeForUser`, che lo confronta con le membership. E poi
 * il servizio lo riverifica **riga per riga** con `assertActiveClub`, perche
 * appartenere a un club non e un permesso su una riga di un altro (ADR-0094).
 */
export const resolveDossierScope = async (
  request: Request,
  requestedOrganizationId?: string | null,
): Promise<ResolvedDossierScope> => {
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
