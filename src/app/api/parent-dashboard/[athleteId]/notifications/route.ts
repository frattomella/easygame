import { NextResponse } from "next/server";

import { requireAuthenticatedUser } from "@/lib/server/auth";
import { prisma } from "@/lib/server/prisma";
import { canParentAccessAthlete } from "@/lib/server/parent-dashboard";
import { publicErrorMessage } from "@/lib/server/api-errors";

type Context = { params: { athleteId: string } };

/**
 * **Segna letta una notifica della famiglia.**
 *
 * W6-20. L'area famiglia elencava le notifiche e non aveva **nessun modo** di
 * segnarne una letta: la campanella restava accesa per sempre, e da quel
 * momento il numero smetteva di voler dire qualcosa. Una notifica che non si
 * puo chiudere e rumore, e il rumore insegna a ignorare anche cio che conta.
 *
 * Serve una rotta dedicata e non il CRUD generico perche un genitore **non**
 * passa da `canAccessClubResource`: la sua area ha porte proprie, e questa e
 * una di quelle. Il gate e il legame con l'atleta, come per il resto dell'area.
 *
 * Si aggiorna **solo** cio che e indirizzato a chi chiede: `user_id` deve
 * essere il suo. Le notifiche di club — quelle con `user_id` nullo, che tutti
 * vedono — non si segnano lette da una persona sola, perche «letta» sarebbe
 * una proprieta di tutti e la scriverebbe uno.
 */
export const runtime = "nodejs";

export async function PATCH(request: Request, context: Context) {
  try {
    const session = await requireAuthenticatedUser(request);
    if (!session) {
      return NextResponse.json(
        { data: null, error: { message: "Accesso negato: sessione assente" } },
        { status: 401 },
      );
    }

    const athleteId = String(context.params.athleteId || "").trim();
    if (!(await canParentAccessAthlete(session.db.user_id, athleteId))) {
      return NextResponse.json(
        {
          data: null,
          error: { message: "Accesso negato: atleta non collegato" },
        },
        { status: 403 },
      );
    }

    /*
      **Il confine e il club di questo figlio, non «tutte le mie notifiche».**

      Il legame dice che questo genitore puo parlare di questo atleta; non
      dice di quale **club** stiamo parlando. Senza questa lettura, un
      genitore con figli in due societa che preme «segna tutte come lette»
      dalla schermata di uno chiuderebbe anche quelle dell'altro — e le
      notifiche di un club che nessuno ha letto sono esattamente cio che
      quel club conta di aver detto.

      Lo ha trovato `tests/auth/api-authorization.test.mjs`, che pretende uno
      scope esplicito da ogni rotta che tocca il database.
    */
    const atleta = await prisma.athlete.findUnique({
      where: { id: athleteId },
      select: { organization_id: true },
    });
    if (!atleta) {
      return NextResponse.json(
        { data: null, error: { message: "Atleta non trovato" } },
        { status: 404 },
      );
    }

    const body = await request.json().catch(() => ({}));
    const id = String(body?.id || "").trim();
    const tutte = body?.all === true;

    if (!id && !tutte) {
      return NextResponse.json(
        { data: null, error: { message: "Nessuna notifica indicata" } },
        { status: 400 },
      );
    }

    const esito = await prisma.notification.updateMany({
      where: {
        organization_id: atleta.organization_id,
        user_id: session.db.user_id,
        read: false,
        ...(id ? { id } : {}),
      },
      data: { read: true },
    });

    return NextResponse.json({
      data: { updated: esito.count },
      error: null,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        data: null,
        error: {
          message: publicErrorMessage(error, "Errore aggiornamento notifiche"),
        },
      },
      { status: 500 },
    );
  }
}
