import { NextResponse } from "next/server";
import {
  requireAuthenticatedUser,
  resolveOrganizationScopeForUser,
} from "@/lib/server/auth";
import { findTrialHomonyms } from "@/lib/server/trial-athletes";

/**
 * **Gli omonimi di chi si sta registrando in prova** (ADR-0198 §5): persone
 * in prova e schede atleta del club, di ogni stagione. Una schermata interna
 * — chi puo registrare una prova (`trials.manage`) — che **mostra** e non
 * fonde. Le schede atleta compaiono solo per chi le puo leggere; nessuna
 * rotta pubblica passa di qui (ADR-0191).
 */
export const runtime = "nodejs";

const errorStatus = (error: any) =>
  String(error?.message || "").includes("Accesso negato") ? 403 : 400;

export async function GET(request: Request) {
  try {
    const session = await requireAuthenticatedUser(request);
    if (!session) {
      return NextResponse.json({ data: null, error: { message: "Sessione non valida" } }, { status: 401 });
    }
    const scope = await resolveOrganizationScopeForUser(
      session.db.user_id,
      request.headers.get("x-active-club-id"),
      request.headers.get("x-active-access-role"),
    );
    const url = new URL(request.url);
    const risultato = await findTrialHomonyms(scope, {
      firstName: url.searchParams.get("firstName"),
      lastName: url.searchParams.get("lastName"),
      birthDate: url.searchParams.get("birthDate"),
    });
    return NextResponse.json({ data: risultato, error: null });
  } catch (error: any) {
    return NextResponse.json(
      { data: null, error: { message: error?.message || "Errore ricerca omonimi" } },
      { status: errorStatus(error) },
    );
  }
}
