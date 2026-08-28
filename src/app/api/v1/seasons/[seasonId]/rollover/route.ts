import { NextResponse } from "next/server";
import { AUDIT_ACTIONS } from "@/lib/server/audit";
import { runClubSeasonRollover } from "@/lib/server/seasons";
import {
  isSeasonRequestFailure,
  resolveSeasonRequestContext,
  seasonErrorResponse,
} from "../../season-request-context";

type Context = { params: { seasonId: string } };

/**
 * Riporto verso la stagione indicata nel percorso.
 *
 * Con `preview: true` non scrive nulla e restituisce lo stesso conteggio che
 * produrrebbe l'esecuzione: e la fonte del riepilogo mostrato prima della
 * conferma.
 */
export async function POST(request: Request, context: Context) {
  const requestContext = await resolveSeasonRequestContext(request);
  if (isSeasonRequestFailure(requestContext)) {
    return requestContext.response;
  }

  try {
    const body = await request.json().catch(() => ({}));
    const preview = Boolean(body?.preview);

    const result = await runClubSeasonRollover({
      organizationId: requestContext.organizationId,
      sourceSeasonId: String(body?.sourceSeasonId || "").trim(),
      targetSeasonId: context.params.seasonId,
      types: body?.types,
      athleteIds: body?.athleteIds,
      preview,
    });

    if (!preview) {
      await requestContext.audit({
        action: AUDIT_ACTIONS.seasonRollover,
        resource: "seasons",
        resourceId: result.targetSeasonId,
        metadata: {
          sourceSeasonId: result.sourceSeasonId,
          targetSeasonId: result.targetSeasonId,
          created: result.createdTotal,
          skipped: result.skippedTotal,
          entries: result.entries,
          athletesProposed: result.athletes.proposed,
          athletesConfirmed: result.athletes.confirmed,
          athletesNotConfirmed: result.athletes.notConfirmed,
          athleteMembershipsCreated: result.athletes.created,
        },
      });
    }

    return NextResponse.json({ data: result, error: null });
  } catch (error) {
    return seasonErrorResponse(error);
  }
}
