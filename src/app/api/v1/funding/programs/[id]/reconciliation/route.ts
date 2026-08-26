import { NextResponse } from "next/server";
import {
  requireAuthenticatedUser,
  resolveOrganizationScopeForUser,
} from "@/lib/server/auth";
import { buildProgramReconciliation } from "@/lib/server/funding";
import { toReconciliationCsv } from "@/lib/funding/reconciliation";

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
  const message = String(error?.message || fallback);
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
