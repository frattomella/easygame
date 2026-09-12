import { NextResponse, type NextRequest } from "next/server";
import {
  requireAuthenticatedUser,
  resolveOrganizationScopeForUser,
} from "@/lib/server/auth";
import { canManageTrainingAutomationAsActor } from "@/lib/training-automation-permissions";
import { authorizeCronRequest } from "@/lib/server/cron-auth";
import {
  MAX_MANUAL_GENERATION_DAYS_AHEAD,
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

    if (!canManageTrainingAutomationAsActor(scope.activeRole)) {
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
        /*
          **Qui dietro c'e una persona, e si porta con se.**

          Il pulsante «Genera allenamenti» e il cron chiamano la stessa
          funzione. Senza questa riga la generazione girava con l'autorita
          di sistema anche quando a premerla era un essere umano: l'audit
          diceva SISTEMA a un'ora in cui nessun cron era passato, e il
          perimetro di sede e categoria del chiamante spariva — un club
          manager ristretto a una categoria poteva generarne un'altra
          mandando un `weeklySchedule` che la nominasse.
        */
        caller: {
          scope,
          actor: { userId: session.db.user_id, email: session.db.user?.email ?? null },
        },
        force: Boolean(body?.force ?? true),
        weeklyScheduleOverride: body?.weeklySchedule,
        settingsOverride: body?.settings,
        /*
          **"Genera fino a..." e l'anteprima** (WP-03, WP-17): la stessa
          rotta, con una data assoluta al posto della finestra relativa e,
          quando richiesto, senza scrivere niente. Nessun secondo endpoint.
        */
        untilDate: body?.untilDate ?? null,
        preview: Boolean(body?.preview),
      },
    );

    if (result.reason === "until_out_of_range") {
      return NextResponse.json(
        {
          data: null,
          error: {
            message: `La data richiesta e fuori dall'intervallo consentito (fino a ${MAX_MANUAL_GENERATION_DAYS_AHEAD} giorni da oggi)`,
          },
        },
        { status: 400 },
      );
    }

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
