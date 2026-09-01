import { NextResponse } from "next/server";
import {
  requireAuthenticatedUser,
  resolveOrganizationScopeForUser,
} from "@/lib/server/auth";
import { listFreeAppointmentSlots } from "@/lib/server/appointments";

/**
 * **Gli slot liberi in un intervallo.**
 *
 * Un segmento statico accanto a `[id]`: Next.js risolve prima il segmento
 * fisso, quindi `availability` non viene mai scambiato per l'identificativo di
 * un appuntamento.
 *
 * La risposta dice anche **da dove** viene ogni slot: `slot` quando la regola e
 * configurata, `opening_hours` quando si e ricaduti sull'orario di segreteria.
 * La differenza non e cosmetica — nel secondo caso nessuno ha dichiarato quanto
 * dura un colloquio, e chi disegna la schermata deve poterlo dire.
 */

const errorStatus = (error: any) =>
  String(error?.message || "").includes("Accesso negato") ? 403 : 400;

export async function GET(request: Request) {
  try {
    const session = await requireAuthenticatedUser(request);
    if (!session) {
      return NextResponse.json(
        { data: [], error: { message: "Sessione non valida" } },
        { status: 401 },
      );
    }

    const url = new URL(request.url);
    const scope = await resolveOrganizationScopeForUser(
      session.db.user_id,
      url.searchParams.get("organization_id") ||
        url.searchParams.get("club_id") ||
        request.headers.get("x-active-club-id"),
      request.headers.get("x-active-access-role"),
    );

    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    if (!from || !to) {
      return NextResponse.json(
        {
          data: [],
          error: { message: "Intervallo obbligatorio: indica «from» e «to»" },
        },
        { status: 400 },
      );
    }

    const liberi = await listFreeAppointmentSlots(scope, {
      from,
      to,
      siteId: url.searchParams.get("site_id"),
      assignedToUserId: url.searchParams.get("assigned_to"),
      timezone: url.searchParams.get("timezone"),
      now: new Date(),
    });

    return NextResponse.json({
      data: liberi.map((slot) => ({
        ...slot,
        startsAt: slot.startsAt.toISOString(),
        endsAt: slot.endsAt.toISOString(),
      })),
      error: null,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        data: [],
        error: { message: error?.message || "Errore lettura disponibilita" },
      },
      { status: errorStatus(error) },
    );
  }
}
