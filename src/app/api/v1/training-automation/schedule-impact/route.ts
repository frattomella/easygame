import { NextResponse, type NextRequest } from "next/server";
import {
  requireAuthenticatedUser,
  resolveOrganizationScopeForUser,
} from "@/lib/server/auth";
import { canManageTrainingAutomationAsActor } from "@/lib/training-automation-permissions";
import {
  applyWeeklyScheduleSlotChanges,
  previewWeeklyScheduleImpact,
} from "@/lib/server/training-automation";

/**
 * **L'impatto di una modifica al programma settimanale sugli allenamenti
 * futuri gia generati** (WP-08).
 *
 * Una porta distinta da `POST /api/v1/training-automation`: quella genera,
 * questa **misura e, se richiesto, applica** una modifica a cio che e gia
 * stato generato. Stesso permesso (chi puo configurare il club), stessa
 * regola di attribuzione (la persona che chiama, mai un contesto di
 * sistema: qui non c'e un cron).
 */
export async function POST(request: NextRequest) {
  try {
    const session = await requireAuthenticatedUser(request);
    if (!session) {
      return NextResponse.json(
        { data: null, error: { message: "Non autorizzato" } },
        { status: 401 },
      );
    }

    const body = await request.json().catch(() => ({}));
    const scope = await resolveOrganizationScopeForUser(
      session.db.user_id,
      request.headers.get("x-active-club-id") ||
        body?.organizationId ||
        body?.clubId,
      request.headers.get("x-active-access-role"),
    );

    if (!scope.activeOrganizationId) {
      return NextResponse.json(
        { data: null, error: { message: "Nessun club attivo disponibile" } },
        { status: 400 },
      );
    }

    if (!canManageTrainingAutomationAsActor(scope.activeRole)) {
      return NextResponse.json(
        {
          data: null,
          error: { message: "Ruolo non autorizzato alla configurazione" },
        },
        { status: 403 },
      );
    }

    const previousSchedule = body?.previousSchedule ?? [];
    const nextSchedule = body?.nextSchedule ?? [];

    if (body?.apply) {
      const risultati = await applyWeeklyScheduleSlotChanges(
        scope,
        scope.activeOrganizationId,
        { userId: session.db.user_id, email: session.db.user?.email ?? null },
        { previousSchedule, nextSchedule },
      );

      return NextResponse.json({ data: { applied: risultati }, error: null });
    }

    const anteprima = await previewWeeklyScheduleImpact(
      scope.activeOrganizationId,
      { previousSchedule, nextSchedule },
    );

    return NextResponse.json({ data: { impact: anteprima }, error: null });
  } catch (error: any) {
    return NextResponse.json(
      {
        data: null,
        error: {
          message:
            error?.message ||
            "Errore durante il calcolo dell'impatto sul calendario",
        },
      },
      { status: 500 },
    );
  }
}
