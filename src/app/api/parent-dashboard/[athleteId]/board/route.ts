import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/server/auth";
import { canParentAccessAthlete } from "@/lib/server/parent-dashboard";
import { prisma } from "@/lib/server/prisma";
import {
  markAnnouncementRead,
  readAnnouncementsForUser,
} from "@/lib/server/announcements";

type Context = { params: { athleteId: string } };

/**
 * **La bacheca della famiglia.**
 *
 * Il motore delle comunicazioni e completo da due Wave — annunci con pubblico
 * risolto, registro delle consegne, deduplica (ADR-0084, ADR-0087) — e la
 * famiglia **non aveva una pagina** dove leggerli. `board.read` era un permesso
 * senza schermata, cioe una riga di documentazione: il §13 del piano lo elenca
 * fra le voci con «backend pronto, nessuna pagina».
 *
 * **Il pubblico l'ha gia risolto chi ha pubblicato**, e qui non si ricalcola:
 * `readAnnouncementsForUser` legge le **consegne** indirizzate a questo utente.
 * Rifare il calcolo del pubblico al momento della lettura vorrebbe dire che un
 * annuncio possa comparire o sparire dalla bacheca di qualcuno dopo che e stato
 * mandato, perche nel frattempo e cambiata una categoria.
 *
 * Quella funzione toglie gia i **criteri** e l'autore dalla risposta: al
 * destinatario serve l'avviso, non il modo in cui e stato scelto.
 *
 * Il gate e il **legame** con l'atleta: un tutore puo non avere nessuna
 * membership, e un permesso di ruolo lo terrebbe fuori dalla propria area.
 */

const errorStatus = (error: any) =>
  String(error?.message || "").includes("Accesso negato") ? 403 : 400;

const requireLinkedAthlete = async (userId: string, athleteId: string) => {
  if (!(await canParentAccessAthlete(userId, athleteId))) {
    throw new Error("Accesso negato: atleta non collegato a questo account");
  }

  const athlete = await prisma.athlete.findUnique({
    where: { id: athleteId },
    select: { organization_id: true },
  });
  if (!athlete) throw new Error("Atleta non trovato");

  return athlete.organization_id;
};

export async function GET(request: Request, context: Context) {
  try {
    const session = await requireAuthenticatedUser(request);
    if (!session) {
      return NextResponse.json(
        { data: [], error: { message: "Sessione non valida" } },
        { status: 401 },
      );
    }

    const organizationId = await requireLinkedAthlete(
      session.db.user_id,
      String(context.params.athleteId || "").trim(),
    );

    const annunci = await readAnnouncementsForUser({
      organizationId,
      userId: session.db.user_id,
    });

    return NextResponse.json({ data: annunci, error: null });
  } catch (error: any) {
    return NextResponse.json(
      {
        data: [],
        error: { message: error?.message || "Errore lettura bacheca" },
      },
      { status: errorStatus(error) },
    );
  }
}

/**
 * «L'ho letto».
 *
 * Serve al club per sapere se un avviso e arrivato davvero — la domanda che
 * arriva sempre dopo, quando una famiglia dice di non aver saputo niente — e la
 * scrive il destinatario, non chi ha pubblicato.
 */
export async function POST(request: Request, context: Context) {
  try {
    const session = await requireAuthenticatedUser(request);
    if (!session) {
      return NextResponse.json(
        { data: null, error: { message: "Sessione non valida" } },
        { status: 401 },
      );
    }

    const organizationId = await requireLinkedAthlete(
      session.db.user_id,
      String(context.params.athleteId || "").trim(),
    );

    const body = await request.json().catch(() => ({}));
    /*
      Si cita la **consegna**, non l'annuncio: e la consegna che sa a chi era
      indirizzato, e leggerla per conto di un altro destinatario non e
      esprimibile.
    */
    const deliveryId = String(
      body?.deliveryId || body?.delivery_id || "",
    ).trim();

    if (!deliveryId) {
      return NextResponse.json(
        { data: null, error: { message: "Consegna non indicata" } },
        { status: 400 },
      );
    }

    const esito = await markAnnouncementRead({
      organizationId,
      deliveryId,
      userId: session.db.user_id,
    });

    return NextResponse.json({ data: esito, error: null });
  } catch (error: any) {
    return NextResponse.json(
      {
        data: null,
        error: { message: error?.message || "Errore lettura annuncio" },
      },
      { status: errorStatus(error) },
    );
  }
}
