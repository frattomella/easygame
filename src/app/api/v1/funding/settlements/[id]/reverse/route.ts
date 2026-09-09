import { NextResponse } from "next/server";
import { publicErrorMessage } from "@/lib/server/api-errors";
import {
  requireAuthenticatedUser,
  resolveOrganizationScopeForUser,
} from "@/lib/server/auth";
import { reverseFundingSettlement } from "@/lib/server/funding";
import { assertFundingSettlementPermission } from "@/lib/funding/settlement-permissions";

/**
 * Lo **storno** di una liquidazione dell'ente.
 *
 *   POST /api/v1/funding/settlements/:id/reverse
 *
 * **Perche non esisteva, e perche serviva.** Il dominio dei bandi era l'unico
 * dei cinque a non avere alcun rimedio a un errore: non un `update`, non un
 * `delete`, non una rotta. Una liquidazione digitata con uno zero di troppo
 * restava — e non restava ferma, **propagava**: il periodo passava a
 * `settled`, e da li non si riscriveva piu, non si confermava piu, e
 * l'iscrizione non si cancellava piu.
 *
 * **Perche uno storno e non una cancellazione.** Perche il denaro non si
 * cancella, in nessuno dei cinque domini. Nasce una riga opposta che cita
 * l'originale, l'originale resta e porta il motivo, e chi legge vede tutte e
 * due. Un indice unico parziale vieta il doppio storno.
 *
 * **Il permesso.** Lo stesso che registra una liquidazione — proprietario o
 * gestore — e non di meno: correggere denaro gia registrato non e un'operazione
 * di segreteria. E la stessa separazione che la contabilita fa fra
 * `accounting.manage` e `accounting.reverse`.
 */

export const runtime = "nodejs";

type Context = { params: { id: string } };

export async function POST(request: Request, context: Context) {
  try {
    const session = await requireAuthenticatedUser(request);
    if (!session) {
      return NextResponse.json(
        { data: null, error: { message: "Accesso negato: sessione assente" } },
        { status: 401 },
      );
    }

    const scope = await resolveOrganizationScopeForUser(
      session.db.user_id,
      request.headers.get("x-active-club-id"),
      request.headers.get("x-active-access-role"),
    );

    /* Lo storno di un movimento chiede `accounting.reverse`, che sta nel
       perimetro amministrativo e non in quello della segreteria (N15). */
    assertFundingSettlementPermission(scope.activeRole, "reverse");

    const body = await request.json().catch(() => ({}));

    /*
      La traccia di audit la scrive il **servizio**, non questa rotta: e il
      modello del lavoro sportivo, e vale piu di quello usato qui accanto —
      chiamare la funzione da uno script lascia comunque il segno.
    */
    const reversal = await reverseFundingSettlement(
      { settlementId: context.params.id, reason: body?.reason },
      scope,
    );

    return NextResponse.json({ data: reversal, error: null });
  } catch (error: any) {
    const message = publicErrorMessage(
      error,
      "Errore nello storno della liquidazione",
    );
    const status = message.includes("Accesso negato")
      ? 403
      /* N15. Due generi, una regola: «non trovato» e «non trovata». */
      : /non trovat[oa]/.test(message)
        ? 404
        : 400;
    return NextResponse.json({ data: null, error: { message } }, { status });
  }
}
