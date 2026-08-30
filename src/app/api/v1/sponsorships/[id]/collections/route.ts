import { recordSponsorCollection } from "@/lib/server/sponsors";
import { failure, ok, resolveSponsorScope } from "../../http";

/**
 * L'incasso di uno sponsor, **registrato nel registro degli incassi**.
 *
 *   POST /api/v1/sponsorships/:id/collections
 *   { amount, paid_at, payment_method, financial_account_id, operation_type_code, notes }
 *
 * ---
 *
 * ## L'anello che mancava, e cosa costava
 *
 * La schermata degli sponsor scriveva l'incasso nella vecchia collezione JSON
 * `sponsor_payments`, dal browser. Il denaro di uno sponsor **non arrivava in
 * prima nota**: il §12 del piano chiede che un contratto da 5.000 con 2.000
 * incassati produca 2.000 di entrata nel registro, e ne produceva zero. Il
 * residuo dello sponsor era giusto, il rendiconto del club no.
 *
 * `prepareSponsorCollection` costruiva gia l'incasso pronto e si fermava prima
 * della scrittura, «per la dipendenza verso W4-C». La dipendenza e chiusa da
 * tempo: qui la catena si chiude.
 *
 * ## Cosa scrive
 *
 * Una riga di `payment_transactions` con la controparte dichiarata — lo sponsor,
 * con la sua etichetta **congelata adesso** — il conto, la causale e la
 * classificazione. Da li la legge il registro, che la proietta come qualunque
 * altro incasso, e i saldi dei conti, che la sommano.
 *
 * ## Cosa non scrive
 *
 * La collezione JSON. Le due fonti restano disgiunte per costruzione, e per
 * questo `listSponsorCollections` puo unirle senza contare due volte lo stesso
 * euro: lo storico dei club che incassavano da li resta leggibile, e da oggi
 * non cresce piu.
 */

export const runtime = "nodejs";

type Context = { params: { id: string } };

export async function POST(request: Request, context: Context) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, any>;
    const organizationId = body?.organization_id || body?.organizationId || null;
    const resolved = await resolveSponsorScope(request, organizationId);
    if (resolved.response) return resolved.response;

    const esito = await recordSponsorCollection(
      {
        sponsorId: context.params.id,
        organizationId,
        amount: body?.amount,
        paidAt: body?.paid_at ?? body?.paidAt ?? null,
        paymentMethod: body?.payment_method ?? body?.paymentMethod ?? null,
        notes: body?.notes ?? null,
        operationTypeCode:
          body?.operation_type_code ?? body?.operationTypeCode ?? null,
        financialAccountId:
          body?.financial_account_id ?? body?.financialAccountId ?? null,
        externalReference:
          body?.external_reference ?? body?.externalReference ?? null,
      },
      resolved.scope,
    );

    return ok(esito);
  } catch (error: any) {
    return failure(error, "Registrazione dell'incasso non riuscita");
  }
}
