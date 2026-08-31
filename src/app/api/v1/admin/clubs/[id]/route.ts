import { NextResponse } from "next/server";
import { prisma } from "@/lib/server/prisma";
import { requirePlatformAdmin } from "@/lib/server/auth";
import { AUDIT_ACTIONS, recordAuditEvent } from "@/lib/server/audit";
import { publicErrorMessage } from "@/lib/server/api-errors";

type Context = {
  params: {
    id: string;
  };
};

/**
 * Cancellazione di un club dalla console di piattaforma.
 *
 * ---
 *
 * ## Cosa fa davvero questa riga
 *
 * `prisma.club.delete` non cancella un club: fa partire una cancellazione a
 * catena che nel database tocca **cinquantaquattro tabelle**. Fra queste:
 * fatture, ricevute, incassi, movimenti di prima nota, conti finanziari,
 * liquidazioni dei bandi, le sequenze di numerazione dei documenti, ogni
 * rapporto e compenso del lavoro sportivo, e tutti gli allegati con i loro
 * byte.
 *
 * ## I due difetti che questo file chiude
 *
 * **Non lasciava traccia.** Era l'operazione piu distruttiva del prodotto e
 * l'unica senza una riga di audit: dopo, non restava niente da cui capire chi
 * l'avesse fatta, quando, e su cosa. Le cancellazioni di gran lunga meno gravi
 * — un socio, una rata — sono tracciate tutte.
 *
 * **E aggirava le guardie fiscali.** Il prodotto rifiuta
 * `DELETE /api/v1/invoices/<emessa>` spiegando che «un buco nella numerazione
 * non e spiegabile», e da qui le cancellava tutte insieme. Due porte non
 * possono rispondere diversamente sulla stessa cosa: quelle guardie sono
 * scritte sul **nome della risorsa**, e il database distrugge per
 * **raggiungibilita**.
 *
 * ## Perche il rifiuto si puo forzare, e perche va bene
 *
 * Un amministratore di piattaforma e l'ultima istanza: esistono ragioni
 * legittime per rimuovere davvero un club, e negarlo in assoluto sposterebbe
 * il lavoro su una query a mano, cioe fuori da ogni traccia. Ma non deve poter
 * succedere **per sbaglio**: serve `?force=true` scritto apposta, e la riga di
 * audit registra quanti documenti fiscali sono stati distrutti.
 */
export async function DELETE(request: Request, context: Context) {
  const session = await requirePlatformAdmin(request);
  if (!session) {
    return NextResponse.json(
      {
        data: null,
        error: { message: "Accesso riservato all'amministratore piattaforma" },
      },
      { status: 403 },
    );
  }

  const clubId = String(context.params.id || "").trim();

  try {
    const club = await prisma.club.findUnique({
      where: { id: clubId },
      select: { id: true, name: true },
    });

    if (!club) {
      return NextResponse.json(
        { data: null, error: { message: "Club non trovato" } },
        { status: 404 },
      );
    }

    const [fatture, ricevute] = await Promise.all([
      prisma.invoice.count({ where: { organization_id: clubId } }),
      prisma.receipt.count({ where: { organization_id: clubId } }),
    ]);

    const forzato =
      new URL(request.url).searchParams.get("force") === "true";
    const haStoriaFiscale = fatture > 0 || ricevute > 0;

    if (haStoriaFiscale && !forzato) {
      await recordAuditEvent({
        action: AUDIT_ACTIONS.resourceAccessDenied,
        outcome: "denied",
        actorUserId: session.db.user_id,
        actorEmail: session.db.user.email,
        actorRole: "platform_admin",
        organizationId: clubId,
        resource: "clubs",
        resourceId: clubId,
        request,
        metadata: { reason: "fiscal_history", fatture, ricevute },
      });

      return NextResponse.json(
        {
          data: null,
          error: {
            message:
              `Questo club ha emesso documenti fiscali (${fatture} fatture, ${ricevute} ricevute). ` +
              "Cancellarlo distrugge registri che una societa e tenuta a conservare, " +
              "insieme a incassi, movimenti e allegati. Se e davvero cio che vuoi, " +
              "ripeti la richiesta con «force=true»: resta scritto nell'audit.",
          },
        },
        { status: 409 },
      );
    }

    const deletedClub = await prisma.club.delete({
      where: { id: clubId },
      select: { id: true, name: true },
    });

    /*
      L'audit si scrive **dopo**: prima non si sa se la cancellazione riesce, e
      una riga che dichiara un fatto mai avvenuto e peggio di nessuna riga.
      `organizationId` resta valorizzato anche se il club non esiste piu —
      `audit_logs` non ha chiave esterna, apposta.
    */
    await recordAuditEvent({
      action: AUDIT_ACTIONS.resourceDeleted,
      actorUserId: session.db.user_id,
      actorEmail: session.db.user.email,
      actorRole: "platform_admin",
      organizationId: clubId,
      resource: "clubs",
      resourceId: clubId,
      request,
      metadata: {
        clubName: club.name,
        forced: forzato,
        destroyedInvoices: fatture,
        destroyedReceipts: ricevute,
      },
    });

    return NextResponse.json({ data: deletedClub, error: null });
  } catch (error: any) {
    return NextResponse.json(
      {
        data: null,
        error: {
          message: publicErrorMessage(error, "Errore eliminazione club"),
        },
      },
      { status: 400 },
    );
  }
}
