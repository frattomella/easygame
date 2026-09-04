import { NextResponse } from "next/server";
import {
  requireAuthenticatedUser,
  resolveOrganizationScopeForUser,
} from "@/lib/server/auth";
import {
  readAppointmentsConfig,
  saveAppointmentsConfig,
} from "@/lib/server/appointments";
import { publicErrorMessage } from "@/lib/server/api-errors";

/**
 * **Come riceve questo club** (PP-02 §K).
 *
 *   GET /api/v1/appointments/config
 *   PUT /api/v1/appointments/config
 *
 * Due cose che la configurazione della disponibilita non sapeva dire: **se** le
 * famiglie possono chiedere un appuntamento, e **per cosa**. La prima esisteva
 * solo come `active` sulla singola fascia — che e un'altra domanda; la seconda
 * non esisteva affatto, e il motivo arrivava come testo libero.
 *
 * **La lettura non chiede permessi** ed e voluto: la famiglia deve poter sapere
 * quali motivi puo scegliere, e questa risposta e esattamente quell'elenco.
 * Non porta niente che un membro del club non possa gia vedere — nomi di
 * motivi, sedi, durate — e i tipi non prenotabili escono comunque, perche la
 * schermata del club li deve amministrare; e la **scrittura** a essere
 * ristretta a chi amministra, dallo stesso gate della disponibilita.
 */

export const runtime = "nodejs";

const scopeFrom = async (request: Request, userId: string) => {
  const url = new URL(request.url);
  return resolveOrganizationScopeForUser(
    userId,
    url.searchParams.get("organization_id") ||
      url.searchParams.get("club_id") ||
      request.headers.get("x-active-club-id"),
    request.headers.get("x-active-access-role"),
  );
};

const errorStatus = (message: string) =>
  message.includes("Accesso negato")
    ? 403
    : /non trovat[oa]/i.test(message)
      ? 404
      : 400;

export async function GET(request: Request) {
  try {
    const session = await requireAuthenticatedUser(request);
    if (!session) {
      return NextResponse.json(
        { data: null, error: { message: "Sessione non valida" } },
        { status: 401 },
      );
    }

    const scope = await scopeFrom(request, session.db.user_id);
    const organizationId = String(scope.activeOrganizationId || "").trim();
    if (!organizationId) {
      return NextResponse.json(
        { data: null, error: { message: "Accesso negato: nessun club attivo" } },
        { status: 403 },
      );
    }

    const data = await readAppointmentsConfig(organizationId);
    return NextResponse.json({ data, error: null });
  } catch (error: any) {
    const message = publicErrorMessage(
      error,
      "Errore lettura della configurazione appuntamenti",
    );
    return NextResponse.json(
      { data: null, error: { message } },
      { status: errorStatus(message) },
    );
  }
}

export async function PUT(request: Request) {
  try {
    const session = await requireAuthenticatedUser(request);
    if (!session) {
      return NextResponse.json(
        { data: null, error: { message: "Sessione non valida" } },
        { status: 401 },
      );
    }

    const scope = await scopeFrom(request, session.db.user_id);
    const body = await request.json().catch(() => ({}));
    const data = await saveAppointmentsConfig(scope, body?.data ?? body, {
      userId: session.db.user_id,
    });

    return NextResponse.json({ data, error: null });
  } catch (error: any) {
    const message = publicErrorMessage(
      error,
      "Errore salvataggio della configurazione appuntamenti",
    );
    return NextResponse.json(
      { data: null, error: { message } },
      { status: errorStatus(message) },
    );
  }
}
