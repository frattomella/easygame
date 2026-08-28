import { NextResponse, type NextRequest } from "next/server";
import { authorizeCronRequest } from "@/lib/server/cron-auth";
import { ok, sportWorkRoute } from "@/lib/server/sport-work-route";
import {
  runSportWorkSchedulerForAllClubs,
  runSportWorkSchedulerForClub,
} from "@/lib/server/sport-work-scheduler";

/**
 * Il giro notturno del lavoro sportivo.
 *
 *   POST /api/v1/sport-work/scheduler   — a mano, sul club attivo
 *   GET  /api/v1/sport-work/scheduler   — da cron, su tutti i club
 *
 * Il giro porta a scaduti i contratti finiti, ricalcola il maturato, riallinea
 * l'agenda e notifica cio che scade presto.
 *
 * **Le due porte esistono entrambe di proposito.** Il `POST` serve a chi vuole
 * vedere subito l'effetto di una modifica senza aspettare la notte, e passa
 * dai permessi come ogni altra rotta del dominio. Il `GET` e quello che invoca
 * Vercel Cron, non ha un attore e per questo si autentica con `CRON_SECRET` —
 * la stessa convenzione gia usata dall'automazione degli allenamenti.
 *
 * **In produzione senza `CRON_SECRET` la porta del cron non si apre**: un job
 * che riscrive stati e manda notifiche, esposto senza autenticazione, e un
 * modo per far arrivare messaggi ai club di qualcun altro.
 */
export const runtime = "nodejs";

export const POST = sportWorkRoute(
  "sport_work.manage",
  async ({ scope }) =>
    ok(
      await runSportWorkSchedulerForClub(
        String(scope.activeOrganizationId || ""),
        { scope },
      ),
    ),
  "Esecuzione del giro non riuscita",
);

export async function GET(request: NextRequest) {
  const denied = authorizeCronRequest(
    request,
    "il giro notturno del lavoro sportivo",
  );
  if (denied) return denied.response;

  try {
    const results = await runSportWorkSchedulerForAllClubs(new Date());

    return NextResponse.json({
      data: {
        processedClubs: results.length,
        failed: results.filter((row) => row.ok === false).length,
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
            error?.message || "Errore durante il giro notturno del lavoro sportivo",
        },
      },
      { status: 500 },
    );
  }
}
