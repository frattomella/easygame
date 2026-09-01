import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/server/auth";
import { canParentAccessAthlete } from "@/lib/server/parent-dashboard";
import { prisma } from "@/lib/server/prisma";
import {
  buildPaymentLinkPath,
  issuePaymentLink,
  resolvePaymentLinkOrigin,
} from "@/lib/server/payment-links";
import { publicErrorMessage } from "@/lib/server/api-errors";

type Context = { params: { athleteId: string } };

/**
 * **«Paga ora» dall'area della famiglia.**
 *
 * Il pulsante c'era ed era **disabilitato**, con la scritta «disponibile
 * prossimamente»: l'unico modo per pagare online era il link pubblico che la
 * segreteria doveva emettere e mandare a mano. Il checkout esisteva gia per
 * intero (G-06, W2-B) — dominio, entitlement, token opaco, ritorno, webhook —
 * e la famiglia non aveva una porta per entrarci con la **propria identita**.
 *
 * **Nessun secondo checkout.** Questa rotta non incassa: emette il link che gia
 * si emetteva, e restituisce l'indirizzo. Costruire qui una seconda strada
 * verso il provider vorrebbe dire due posti in cui si crea un movimento di
 * denaro, che e esattamente cio che CLAUDE.md §2 vieta sugli incassi.
 *
 * **Il gate e il legame, non il ruolo.** Emettere un link e una comunicazione,
 * e chiede `communications.send`: un genitore non ce l'ha, e non deve averlo —
 * non deve poter emettere un link per la rata di un'altra famiglia. Qui il
 * permesso e piu stretto, non piu largo: si emette **solo** per una rata del
 * proprio figlio, e la rata viene riletta dal database per verificarlo. Chi
 * chiama non sceglie il club: lo dice la rata.
 */

export const runtime = "nodejs";

const errorStatus = (message: string) =>
  message.includes("Accesso negato") ? 403 : 400;

export async function POST(request: Request, context: Context) {
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

    const body = await request.json().catch(() => ({}));
    const paymentId = String(body?.payment_id || body?.paymentId || "").trim();
    if (!paymentId) {
      return NextResponse.json(
        { data: null, error: { message: "Nessuna rata indicata" } },
        { status: 400 },
      );
    }

    /*
      La rata si rilegge dal database e deve essere **di quel figlio**: senza
      questo controllo un identificativo indovinato permetterebbe di aprire il
      checkout di un'altra famiglia dello stesso club.
    */
    const rata = await prisma.athletePayment.findUnique({
      where: { id: paymentId },
      select: { id: true, organization_id: true, athlete_id: true },
    });

    if (!rata || String(rata.athlete_id || "") !== athleteId) {
      return NextResponse.json(
        { data: null, error: { message: "Rata non trovata" } },
        { status: 404 },
      );
    }

    const esito = await issuePaymentLink({
      organizationId: rata.organization_id,
      paymentId: rata.id,
      actorUserId: session.db.user_id,
      request,
    });

    if (esito.outcome === "entitlement_missing") {
      /*
        Il club non incassa online. Non e un errore di chi ha premuto: e una
        configurazione che manca, e la famiglia deve leggerlo cosi invece di
        vedere un errore tecnico.
      */
      return NextResponse.json(
        {
          data: null,
          error: { message: esito.message, code: "entitlement_missing" },
        },
        { status: 409 },
      );
    }

    const origin = resolvePaymentLinkOrigin(request);

    return NextResponse.json({
      data: {
        url: `${origin}${esito.path || buildPaymentLinkPath(esito.token)}`,
        expiresAt: esito.expiresAt,
      },
      error: null,
    });
  } catch (error: any) {
    const message = publicErrorMessage(error, "Errore apertura del pagamento");
    return NextResponse.json(
      { data: null, error: { message } },
      { status: errorStatus(message) },
    );
  }
}
