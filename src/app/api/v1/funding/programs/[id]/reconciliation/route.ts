import { NextResponse } from "next/server";
import { publicErrorMessage } from "@/lib/server/api-errors";
import {
  requireAuthenticatedUser,
  resolveOrganizationScopeForUser,
} from "@/lib/server/auth";
import { buildProgramReconciliation } from "@/lib/server/funding";
import { toReconciliationCsv } from "@/lib/funding/reconciliation";
import { AUDIT_ACTIONS, recordAuditEvent } from "@/lib/server/audit";

/**
 * La riconciliazione di un bando.
 *
 *   GET /api/v1/funding/programs/:id/reconciliation
 *   GET /api/v1/funding/programs/:id/reconciliation?format=csv
 *
 * **Perche serve, e perche e una lettura.** Il primo bando vero caricato su
 * EasyGame non si puo dichiarare affidabile perche i test sono verdi: quelli
 * provano che il calcolo faccia cio che la configurazione dice, non che la
 * configurazione dica cio che il bando prevede. Chi rendiconta deve poter
 * mettere accanto, riga per riga, il calcolo di EasyGame e le attese
 * dell'ente.
 *
 * Non ricalcola niente: il ricalcolo resta un'azione esplicita della
 * segreteria, perche legge tutte le presenze del club.
 *
 * **Perche anche in CSV.** Chi riconcilia il primo bando lavora accanto al
 * modulo dell'ente, e quel confronto si fa in un foglio di calcolo. Punto e
 * virgola e virgola decimale: e la forma che Excel in italiano apre senza
 * chiedere niente.
 */

export const runtime = "nodejs";

const failure = (error: any, fallback: string) => {
  /*
    **Il messaggio non esce grezzo.** Queste sette rotte costruivano la
    risposta da `error.message`, quindi un identificativo malformato faceva
    uscire il nome del modello, l operazione, lo SQLSTATE e le interiora del
    driver — l incidente I-03, che era stato chiuso altrove e non qui.
  */
  const message = publicErrorMessage(error, fallback);
  const status = message.includes("Accesso negato")
    ? 403
    : message.includes("non trovato")
      ? 404
      : 400;
  return NextResponse.json({ data: null, error: { message } }, { status });
};

export async function GET(
  request: Request,
  context: { params: { id: string } },
) {
  try {
    const session = await requireAuthenticatedUser(request);
    if (!session) {
      return NextResponse.json(
        { data: null, error: { message: "Accesso negato: sessione assente" } },
        { status: 401 },
      );
    }

    const url = new URL(request.url);
    const scope = await resolveOrganizationScopeForUser(
      session.db.user_id,
      url.searchParams.get("organization_id") ||
        request.headers.get("x-active-club-id"),
      request.headers.get("x-active-access-role"),
    );

    const result = await buildProgramReconciliation(context.params.id, scope);

    if (url.searchParams.get("format") === "csv") {
      const csv = toReconciliationCsv(result);
      const name = `riconciliazione-${result.program.name || "bando"}`
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");

      /*
        **Un export si traccia, anche se non scrive niente.**

        E la stessa ragione per cui l'export contabile e tracciato: non e una
        scrittura, ed e l'unica operazione che porta **tutto** fuori
        dall'applicazione dentro un file. Qui il contenuto e denaro pubblico
        attribuito a dei minori, riga per riga — cioe un'affermazione sulla
        situazione economica delle loro famiglie — e «chi ha portato fuori
        l'elenco dei voucher, quando» e una domanda che arriva dopo e a cui
        nessuna riga di nessuna tabella sapeva rispondere.
      */
      await recordAuditEvent({
        action: AUDIT_ACTIONS.accountingExported,
        actorUserId: session.db.user_id,
        actorEmail: session.db.user.email,
        actorRole: scope.activeRole,
        organizationId: scope.activeOrganizationId,
        resource: "funding_programs",
        resourceId: context.params.id,
        request,
        metadata: {
          format: "csv",
          programName: result.program.name,
          rows: result.rows.length,
          athletes: result.totals.athletes,
        },
      });

      return new NextResponse(csv, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${name}.csv"`,
          "Cache-Control": "private, no-store",
        },
      });
    }

    return NextResponse.json({
      data: {
        program: {
          id: result.program.id,
          name: result.program.name,
          funder: result.program.funder,
          status: result.program.status,
        },
        rows: result.rows,
        totals: result.totals,
      },
      error: null,
    });
  } catch (error) {
    return failure(error, "Errore nella riconciliazione del bando");
  }
}
