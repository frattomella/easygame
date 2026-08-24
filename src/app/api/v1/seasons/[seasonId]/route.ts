import { NextResponse } from "next/server";
import { AUDIT_ACTIONS } from "@/lib/server/audit";
import { setClubSeasonStatus } from "@/lib/server/seasons";
import {
  isSeasonRequestFailure,
  resolveSeasonRequestContext,
  seasonErrorResponse,
} from "../season-request-context";

type Context = { params: { seasonId: string } };

/** Attivazione o archiviazione di una stagione. */
export async function PATCH(request: Request, context: Context) {
  const requestContext = await resolveSeasonRequestContext(request);
  if (isSeasonRequestFailure(requestContext)) {
    return requestContext.response;
  }

  try {
    const body = await request.json().catch(() => ({}));
    const action = String(body?.action || "").trim();

    if (action !== "activate" && action !== "archive") {
      throw new Error(
        "Azione non riconosciuta: usa activate oppure archive",
      );
    }

    const result = await setClubSeasonStatus({
      organizationId: requestContext.organizationId,
      seasonId: context.params.seasonId,
      action,
    });

    await requestContext.audit({
      action:
        action === "activate"
          ? AUDIT_ACTIONS.seasonActivated
          : AUDIT_ACTIONS.seasonArchived,
      resource: "seasons",
      resourceId: result.season.id,
      metadata: {
        label: result.season.label,
        status: result.season.status,
        activeSeasonId: result.state.activeSeasonId,
      },
    });

    return NextResponse.json({ data: result, error: null });
  } catch (error) {
    return seasonErrorResponse(error);
  }
}
