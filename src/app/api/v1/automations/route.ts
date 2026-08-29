import { NextResponse } from "next/server";
import {
  requireAuthenticatedUser,
  resolveOrganizationScopeForUser,
} from "@/lib/server/auth";
import {
  listAutomationRulesForClub,
  saveAutomationRule,
} from "@/lib/server/automations";
import { publicErrorMessage } from "@/lib/server/api-errors";

/**
 * La configurazione delle automazioni (W2-A, G-03/G-04).
 *
 *   GET   /api/v1/automations   le quattro regole del club, con l'anteprima
 *   POST  /api/v1/automations   salva una regola (o tutte)
 *   PATCH /api/v1/automations   identico a POST: e un aggiornamento parziale
 *
 * **Perche `POST` e `PATCH` fanno la stessa cosa.** Le regole sono quattro e
 * chiuse: non se ne creano e non se ne cancellano, si accendono e si
 * spengono. Un client che chiama `PATCH` per aggiornarne una e un client che
 * dice la verita, e rifiutarlo per far usare `POST` sarebbe una pedanteria che
 * non protegge nulla.
 *
 * **Chi puo.** `automations.manage` lo verifica il dominio, che e anche il
 * solo posto in cui la matrice dei permessi viene consultata: qui non si
 * duplica.
 */

export const runtime = "nodejs";

const unauthorized = () =>
  NextResponse.json(
    { data: null, error: { message: "Accesso negato: sessione assente" } },
    { status: 401 },
  );

const failure = (error: any, fallback: string) => {
  const message = publicErrorMessage(error, fallback);
  const status = message.includes("Accesso negato") ? 403 : 400;
  return NextResponse.json({ data: null, error: { message } }, { status });
};

const withScope = async (request: Request) => {
  const session = await requireAuthenticatedUser(request);
  if (!session) return null;

  const scope = await resolveOrganizationScopeForUser(
    session.db.user_id,
    request.headers.get("x-active-club-id"),
    request.headers.get("x-active-access-role"),
  );

  return { session, scope };
};

export async function GET(request: Request) {
  try {
    const context = await withScope(request);
    if (!context) return unauthorized();

    const data = await listAutomationRulesForClub({
      scope: context.scope,
      actorRole: context.scope.activeRole,
    });

    return NextResponse.json({ data, error: null });
  } catch (error: any) {
    return failure(error, "Lettura delle automazioni non riuscita");
  }
}

const save = async (request: Request) => {
  try {
    const context = await withScope(request);
    if (!context) return unauthorized();

    const body = await request.json().catch(() => ({}));

    /*
      Una regola sola o tutte e quattro: la schermata salva una riga per volta,
      ma un ripristino dei valori predefiniti le tocca tutte, e due giri di
      rete per un gesto solo lascerebbero il club a meta configurazione se il
      secondo fallisse.
    */
    const wanted = Array.isArray(body?.rules)
      ? body.rules
      : [body?.rule ?? body];

    const saved = [];
    for (const rule of wanted) {
      saved.push(
        await saveAutomationRule({
          organizationId: String(context.scope.activeOrganizationId || ""),
          rule,
          scope: context.scope,
          actorUserId: context.session.db.user_id,
          actorEmail: context.session.db.user.email,
          actorRole: context.scope.activeRole,
        }),
      );
    }

    return NextResponse.json({ data: { rules: saved }, error: null });
  } catch (error: any) {
    return failure(error, "Salvataggio dell'automazione non riuscito");
  }
};

export const POST = save;
export const PATCH = save;
