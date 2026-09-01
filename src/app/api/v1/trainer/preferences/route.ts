import { NextResponse } from "next/server";
import {
  requireAuthenticatedUser,
  resolveOrganizationScopeForUser,
} from "@/lib/server/auth";
import { prisma } from "@/lib/server/prisma";
import { isTrainerAccessRole } from "@/lib/access-roles";
import { resolveTrainerDashboardPermissions } from "@/lib/trainer-dashboard-permissions";
import { getMatchConvocationDeadlineDays } from "@/lib/trainer-operational-alerts";
import { hasHealthPermission } from "@/lib/health/permissions";

/**
 * **Cio che la dashboard allenatore deve sapere del club, da una porta che il
 * suo ruolo puo aprire.**
 *
 * Il contesto della dashboard eseguiva otto letture che finivano tutte su
 * `GET /api/v1/clubs?fields=…`. `clubs` sta in `MANAGEMENT_ADMIN_ONLY_RESOURCES`
 * e **non** sta in `TRAINER_READ_RESOURCES`: rispondevano tutte **403**.
 *
 * Il guaio non era il 403 in se — era che `getClubSettings` lo **inghiottiva** e
 * restituiva `{}`. Da li:
 *
 * - `resolveTrainerDashboardPermissions({})` ricadeva sui default, quindi **la
 *   configurazione dei permessi che il club imposta in `/permissions` non
 *   raggiungeva mai la sessione di un allenatore**;
 * - la scadenza delle convocazioni ricadeva sul valore di fabbrica;
 * - il pannello «Programmazione» era **sempre vuoto**, perche il programma
 *   settimanale e le strutture arrivavano per la stessa strada;
 * - ogni caricamento della dashboard scriveva circa sette righe di audit
 *   `resource.access_denied` su un club che funzionava normalmente, rendendo il
 *   registro di sicurezza troppo rumoroso per vedere un attacco vero.
 *
 * Qui esce **solo** cio che serve a disegnare la dashboard dell'allenatore, e
 * niente altro del club: nessun dato societario, nessun dato economico,
 * nessuna configurazione di pagamento. E la stessa regola che vale per le altre
 * rotte d'area — si dichiara cosa esce, non cosa non esce.
 */
export async function GET(request: Request) {
  try {
    const session = await requireAuthenticatedUser(request);
    if (!session) {
      return NextResponse.json(
        { data: null, error: { message: "Sessione non valida" } },
        { status: 401 },
      );
    }

    const scope = await resolveOrganizationScopeForUser(
      session.db.user_id,
      request.headers.get("x-active-club-id") ||
        request.headers.get("x-organization-id"),
      request.headers.get("x-active-access-role"),
    );

    if (!scope.activeOrganizationId || !isTrainerAccessRole(scope.activeRole)) {
      return NextResponse.json(
        {
          data: null,
          error: { message: "Accesso negato: area allenatore" },
        },
        { status: 403 },
      );
    }

    const club = await prisma.club.findUnique({
      where: { id: scope.activeOrganizationId },
      select: {
        id: true,
        settings: true,
        weekly_schedule: true,
        structures: true,
        opening_hours: true,
      },
    });

    if (!club) {
      return NextResponse.json(
        { data: null, error: { message: "Club non trovato" } },
        { status: 404 },
      );
    }

    const settings =
      club.settings && typeof club.settings === "object" ? club.settings : {};

    return NextResponse.json({
      data: {
        organization_id: club.id,
        permissions: resolveTrainerDashboardPermissions(settings),
        /*
          **Il taglio sul dato clinico lo dichiara il server** (D-4).

          La schermata deve nascondere esattamente cio che la proiezione
          toglie: quando erano due decisioni separate, quella del browser ha
          continuato a mostrare schede che il server non riempiva piu — o
          peggio, come prima, a nasconderne di piene.
        */
        clinical: {
          statusRead: hasHealthPermission(
            scope.activeRole,
            "clinical.status_read",
          ),
          read: hasHealthPermission(scope.activeRole, "clinical.read"),
        },
        matchConvocationDeadlineDays: getMatchConvocationDeadlineDays(settings),
        weeklySchedule: Array.isArray(club.weekly_schedule)
          ? club.weekly_schedule
          : [],
        structures: Array.isArray(club.structures) ? club.structures : [],
        openingHours: Array.isArray(club.opening_hours)
          ? club.opening_hours
          : [],
      },
      error: null,
    });
  } catch (error: any) {
    const negato = String(error?.message || "").includes("Accesso negato");
    return NextResponse.json(
      {
        data: null,
        error: {
          message: error?.message || "Errore lettura preferenze allenatore",
        },
      },
      { status: negato ? 403 : 400 },
    );
  }
}
