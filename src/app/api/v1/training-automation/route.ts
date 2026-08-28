import { NextResponse, type NextRequest } from "next/server";
import {
  requireAuthenticatedUser,
  resolveOrganizationScopeForUser,
} from "@/lib/server/auth";
import { canManageClubConfiguration } from "@/lib/access-roles";
import { authorizeCronRequest } from "@/lib/server/cron-auth";
import {
  runDueTrainingAutomationForAllClubs,
  runTrainingAutomationForClub,
} from "@/lib/server/training-automation";

const buildUnauthorizedResponse = () =>
  NextResponse.json(
    {
      data: null,
      error: { message: "Non autorizzato" },
    },
    { status: 401 },
  );

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuthenticatedUser(request);
    if (!session) {
      return buildUnauthorizedResponse();
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
        {
          data: null,
          error: { message: "Nessun club attivo disponibile" },
        },
        { status: 400 },
      );
    }

    if (!canManageClubConfiguration(scope.activeRole)) {
      return NextResponse.json(
        {
          data: null,
          error: { message: "Ruolo non autorizzato alla configurazione" },
        },
        { status: 403 },
      );
    }

    const result = await runTrainingAutomationForClub(
      scope.activeOrganizationId,
      {
        force: Boolean(body?.force ?? true),
        weeklyScheduleOverride: body?.weeklySchedule,
        settingsOverride: body?.settings,
      },
    );

    return NextResponse.json({
      data: result,
      error: null,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        data: null,
        error: {
          message:
            error?.message ||
            "Errore durante la generazione automatica degli allenamenti",
        },
      },
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest) {
  const denied = authorizeCronRequest(
    request,
    "la generazione automatica degli allenamenti",
  );
  if (denied) return denied.response;

  try {
    const results = await runDueTrainingAutomationForAllClubs(new Date());

    return NextResponse.json({
      data: {
        processedClubs: results.length,
        results,
      },
      error: null,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        data: null,
        error: {
          message:
            error?.message ||
            "Errore durante l'esecuzione del cron allenamenti",
        },
      },
      { status: 500 },
    );
  }
}
