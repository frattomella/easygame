import { NextResponse } from "next/server";
import {
  SEASON_GLOBAL_DATA_TYPES,
  SEASON_NEVER_COPIED_DATA_TYPES,
  SEASON_ROLLOVER_TYPES,
} from "@/lib/club-seasons";
import { AUDIT_ACTIONS } from "@/lib/server/audit";
import { createClubSeason, summarizeSeasonContents } from "@/lib/server/seasons";
import {
  isSeasonRequestFailure,
  resolveSeasonRequestContext,
  seasonErrorResponse,
} from "./season-request-context";

/** Stagioni del club attivo, con quante voci riportabili contiene ciascuna. */
export async function GET(request: Request) {
  const context = await resolveSeasonRequestContext(request);
  if (isSeasonRequestFailure(context)) {
    return context.response;
  }

  try {
    const state = await summarizeSeasonContents(context.organizationId);

    return NextResponse.json({
      data: {
        ...state,
        rolloverTypes: SEASON_ROLLOVER_TYPES,
        globalTypes: SEASON_GLOBAL_DATA_TYPES,
        neverCopiedTypes: SEASON_NEVER_COPIED_DATA_TYPES,
      },
      error: null,
    });
  } catch (error) {
    return seasonErrorResponse(error);
  }
}

/** Crea una stagione, con l'eventuale riporto dalla stagione scelta. */
export async function POST(request: Request) {
  const context = await resolveSeasonRequestContext(request);
  if (isSeasonRequestFailure(context)) {
    return context.response;
  }

  try {
    const body = await request.json().catch(() => ({}));

    const result = await createClubSeason({
      organizationId: context.organizationId,
      input: {
        label: body?.label,
        startDate: body?.startDate,
        endDate: body?.endDate,
      },
      activate: Boolean(body?.activate),
      rollover: body?.rollover || null,
    });

    await context.audit({
      action: AUDIT_ACTIONS.seasonCreated,
      resource: "seasons",
      resourceId: result.season.id,
      metadata: {
        label: result.season.label,
        startDate: result.season.startDate,
        endDate: result.season.endDate,
        status: result.season.status,
        activated: Boolean(body?.activate),
      },
    });

    if (result.rollover) {
      await context.audit({
        action: AUDIT_ACTIONS.seasonRollover,
        resource: "seasons",
        resourceId: result.season.id,
        metadata: {
          sourceSeasonId: result.rollover.sourceSeasonId,
          targetSeasonId: result.rollover.targetSeasonId,
          created: result.rollover.createdTotal,
          skipped: result.rollover.skippedTotal,
          entries: result.rollover.entries,
        },
      });
    }

    if (body?.activate) {
      await context.audit({
        action: AUDIT_ACTIONS.seasonActivated,
        resource: "seasons",
        resourceId: result.season.id,
        metadata: { label: result.season.label },
      });
    }

    return NextResponse.json({ data: result, error: null });
  } catch (error) {
    return seasonErrorResponse(error);
  }
}
