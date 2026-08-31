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
 * Cancellazione di un account dalla console di piattaforma.
 *
 * ---
 *
 * ## Cosa cancellava davvero
 *
 * `clubs.creator_id` e `ON DELETE CASCADE`: cancellare una persona cancellava
 * **ogni club che aveva creato**, e sotto ciascuno la catena del database
 * arriva a cinquantaquattro tabelle — fatture, ricevute, incassi, movimenti,
 * conti, liquidazioni dei bandi, allegati. La normale uscita di una persona
 * poteva quindi portarsi via la contabilita di una societa intera, senza una
 * riga di audit e senza che nessuno lo avesse chiesto.
 *
 * Un account e la **persona**; un club e la societa. Non sono la stessa cosa e
 * non si cancellano insieme: prima si passa il club a qualcun altro, o lo si
 * cancella deliberatamente da `/api/v1/admin/clubs/:id`, che sa cosa distrugge
 * e lo scrive.
 *
 * ## E le notifiche, che la cancellazione pubblicava
 *
 * `notifications.user_id` era `ON DELETE SET NULL`, e in quel modello `NULL`
 * significa «di societa» — che l'area genitore legge come «di tutti».
 * Cancellare un account trasformava ogni sua notifica privata in una notifica
 * per **tutte le famiglie del club**: nome del genitore, telefono, nome del
 * minore, importi scoperti. Una richiesta di cancellazione pubblicava i dati
 * invece di toglierli. Adesso il vincolo e `CASCADE`: una notifica indirizzata
 * a chi non c'e piu se ne va con lui
 * (`20260831140000_wave4_cancellazioni_che_non_distruggono`).
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

  const userId = String(context.params.id || "").trim();

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true },
    });

    if (!user) {
      return NextResponse.json(
        { data: null, error: { message: "Account non trovato" } },
        { status: 404 },
      );
    }

    const clubPosseduti = await prisma.club.findMany({
      where: { creator_id: userId },
      select: { id: true, name: true },
    });

    if (clubPosseduti.length > 0) {
      await recordAuditEvent({
        action: AUDIT_ACTIONS.resourceAccessDenied,
        outcome: "denied",
        actorUserId: session.db.user_id,
        actorEmail: session.db.user.email,
        actorRole: "platform_admin",
        organizationId: null,
        resource: "users",
        resourceId: userId,
        request,
        metadata: {
          reason: "owns_clubs",
          clubs: clubPosseduti.map((club) => club.name),
        },
      });

      return NextResponse.json(
        {
          data: null,
          error: {
            message:
              `Questo account e il proprietario di ${clubPosseduti.length} club ` +
              `(${clubPosseduti.map((club) => club.name).join(", ")}) e non si cancella: ` +
              "la cancellazione si porterebbe dietro quelle societa intere — contabilita, " +
              "documenti fiscali e allegati. Passa prima i club a un altro proprietario, " +
              "oppure cancellali deliberatamente uno per uno.",
          },
        },
        { status: 409 },
      );
    }

    const deletedUser = await prisma.user.delete({
      where: { id: userId },
      select: { id: true, email: true },
    });

    await recordAuditEvent({
      action: AUDIT_ACTIONS.resourceDeleted,
      actorUserId: session.db.user_id,
      actorEmail: session.db.user.email,
      actorRole: "platform_admin",
      organizationId: null,
      resource: "users",
      resourceId: userId,
      request,
      /*
        L'indirizzo si registra: e il solo modo di rispondere mesi dopo a «chi
        e stato cancellato, e da chi». `audit_logs` non ha chiave esterna
        proprio perche deve sopravvivere alla riga che descrive.
      */
      metadata: { email: user.email },
    });

    return NextResponse.json({ data: deletedUser, error: null });
  } catch (error: any) {
    return NextResponse.json(
      {
        data: null,
        error: {
          message: publicErrorMessage(error, "Errore eliminazione account"),
        },
      },
      { status: 400 },
    );
  }
}
