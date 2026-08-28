import { NextResponse } from "next/server";
import {
  requireAuthenticatedUser,
  resolveOrganizationScopeForUser,
} from "@/lib/server/auth";
import {
  buildPaymentReminderPreview,
  sendPaymentReminders,
} from "@/lib/server/payment-reminders";
import { canManageClubConfiguration } from "@/lib/access-roles";
import { AUDIT_ACTIONS, recordAuditEvent } from "@/lib/server/audit";
import { publicErrorMessage } from "@/lib/server/api-errors";

/**
 * Il sollecito degli insoluti (W1-F, PP-4).
 *
 *   POST /api/v1/payment-reminders  { charge_ids, preview: true }  anteprima
 *   POST /api/v1/payment-reminders  { charge_ids }                 invio
 *
 * **Perche una rotta sola e non due.** Anteprima e invio partono dallo stesso
 * input — l'elenco delle rate selezionate — e devono vedere **la stessa
 * cosa**: due rotte sarebbero due porte sullo stesso calcolo, e la prima volta
 * che una delle due cambia la schermata mostrerebbe un elenco di destinatari
 * diverso da quello che riceve il messaggio. Il modulo di dominio ha gia due
 * funzioni distinte; qui il flag sceglie quale, e nient'altro.
 *
 * **Perche `POST` anche per l'anteprima.** Perche l'input e un elenco di
 * identificativi lungo quanto la selezione, e una `GET` lo porterebbe nella
 * query string — cioe negli access log e nella cronologia del browser. Non e
 * una lettura idempotente da mettere in cache: e una simulazione.
 *
 * **Chi puo sollecitare.** Il sollecito parla di denaro dovuto e raggiunge
 * persone reali fuori dal prodotto: richiede lo stesso perimetro che gia
 * protegge la registrazione di un incasso — proprietario e gestore del club
 * (`canManageClubConfiguration`).
 */

export const runtime = "nodejs";

const unauthorized = () =>
  NextResponse.json(
    { data: null, error: { message: "Accesso negato: sessione assente" } },
    { status: 401 },
  );

const failure = (error: any, fallback: string) => {
  const message = publicErrorMessage(error, fallback);
  const status = message.includes("Accesso negato") ? 403 : 400;
  return NextResponse.json({ data: null, error: { message } }, { status });
};

const readChargeIds = (body: any): string[] => {
  const raw = body?.charge_ids ?? body?.chargeIds;
  return Array.isArray(raw)
    ? raw.map((value: unknown) => String(value ?? "").trim()).filter(Boolean)
    : [];
};

export async function POST(request: Request) {
  try {
    const session = await requireAuthenticatedUser(request);
    if (!session) return unauthorized();

    const scope = await resolveOrganizationScopeForUser(
      session.db.user_id,
      request.headers.get("x-active-club-id"),
      request.headers.get("x-active-access-role"),
    );

    if (!canManageClubConfiguration(scope.activeRole)) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message:
              "Accesso negato: solo il proprietario o un gestore del club puo sollecitare i pagamenti",
          },
        },
        { status: 403 },
      );
    }

    const body = await request.json().catch(() => ({}));
    const chargeIds = readChargeIds(body);
    const organizationId =
      String(body?.organization_id ?? body?.organizationId ?? "").trim() || null;

    if (body?.preview === true) {
      const preview = await buildPaymentReminderPreview({
        organizationId,
        chargeIds,
        scope,
      });
      return NextResponse.json({ data: preview, error: null });
    }

    const outcome = await sendPaymentReminders({
      organizationId,
      chargeIds,
      scope,
    });

    await recordAuditEvent({
      action: AUDIT_ACTIONS.paymentRemindersSent,
      /*
        Un invio in cui nessun messaggio e partito non e un successo: il log
        deve poterlo distinguere senza leggere i metadati.
      */
      outcome: outcome.totals.sent > 0 ? "success" : "failure",
      actorUserId: session.db.user_id,
      actorEmail: session.db.user.email,
      actorRole: scope.activeRole,
      organizationId: outcome.organizationId,
      resource: "payments",
      metadata: {
        charges: chargeIds.length,
        athletes: outcome.positions.length,
        sent: outcome.totals.sent,
        skipped: outcome.totals.skipped,
        failed: outcome.totals.failed,
        emailConfigured: outcome.emailConfigured,
      },
    });

    return NextResponse.json({ data: outcome, error: null });
  } catch (error: any) {
    return failure(error, "Sollecito non riuscito");
  }
}
