import {
  getMembershipRecord,
  recordMembershipEvent,
} from "@/lib/server/members";
import { failure, ok, resolveMembershipScope } from "../http";

/**
 * Gli eventi del libro soci.
 *
 *   GET  /api/v1/membership/events?member_id=&at=
 *   POST /api/v1/membership/events   { member_id, event_type, effective_date, … }
 *
 * **Il registro e append-only, e la rotta lo rispecchia**: non c'e `PATCH` e
 * non c'e `DELETE`. Una dimissione e un `POST` che aggiunge una riga —
 * l'ammissione di tre anni fa resta dimostrabile, ed e cio che serve il giorno
 * in cui si deve dire chi era socio quando quella quota e stata incassata.
 *
 * Il `GET` restituisce anche lo **stato derivato** accanto allo storico: e la
 * stessa derivazione che usa il servizio, cosi la schermata non ne scrive una
 * seconda.
 */

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const organizationId = url.searchParams.get("organization_id");
    const resolved = await resolveMembershipScope(request, organizationId);
    if (resolved.response) return resolved.response;

    const data = await getMembershipRecord(
      resolved.scope,
      url.searchParams.get("member_id") || "",
      { organizationId, atDate: url.searchParams.get("at") },
    );

    return ok(data);
  } catch (error: any) {
    return failure(error, "Lettura del registro non riuscita");
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const organizationId = body?.organization_id || body?.organizationId || null;
    const resolved = await resolveMembershipScope(request, organizationId);
    if (resolved.response) return resolved.response;

    const data = await recordMembershipEvent(resolved.scope, {
      organizationId,
      memberId: body?.member_id ?? body?.memberId ?? "",
      eventType: body?.event_type ?? body?.eventType ?? "",
      effectiveDate: body?.effective_date ?? body?.effectiveDate ?? null,
      resolutionReference:
        body?.resolution_reference ?? body?.resolutionReference ?? null,
      resolutionDate: body?.resolution_date ?? body?.resolutionDate ?? null,
      reason: body?.reason ?? null,
      notes: body?.notes ?? null,
      /*
        Passato apposta: il servizio lo **rifiuta** con una frase leggibile.
        Ignorarlo qui farebbe credere a chi lo manda di aver assegnato un
        numero, che e il difetto che questa Wave chiude.
      */
      membershipNumber:
        body?.membership_number ?? body?.membershipNumber ?? null,
    });

    return ok(data);
  } catch (error: any) {
    return failure(error, "Registrazione dell'evento non riuscita");
  }
}
