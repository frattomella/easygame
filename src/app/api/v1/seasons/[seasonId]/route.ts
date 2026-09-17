import { NextResponse } from "next/server";
import { AUDIT_ACTIONS } from "@/lib/server/audit";
import { setClubSeasonStatus } from "@/lib/server/seasons";
import {
  deleteClubSeason,
  summarizeSeasonDeleteImpact,
} from "@/lib/server/season-delete";
import { hasSeasonPermission } from "@/lib/seasons/permissions";
import { recordPermissionDenied } from "@/lib/server/audit";
import { publicErrorMessage } from "@/lib/server/api-errors";
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

/**
 * L'impatto dell'eliminazione: cosa la stagione contiene, cosa si cancella,
 * cosa la blocca (ADR-0197 §31–§32). E cio che la finestra mostra prima di
 * chiedere di scrivere il nome.
 */
export async function GET(request: Request, context: Context) {
  const requestContext = await resolveSeasonRequestContext(request);
  if (isSeasonRequestFailure(requestContext)) {
    return requestContext.response;
  }

  try {
    const impact = await summarizeSeasonDeleteImpact({
      organizationId: requestContext.organizationId,
      seasonId: context.params.seasonId,
    });
    return NextResponse.json({ data: impact, error: null });
  } catch (error) {
    return seasonErrorResponse(error);
  }
}

/**
 * Eliminazione definitiva di una stagione **vuota** (ADR-0197 §30–§36).
 *
 * Il corpo porta `confirmation`, che deve essere esattamente
 * «ELIMINA <nome>». La richiesta si audita **prima** dell'esito
 * (`season.delete.requested`), l'esito dopo (`season.deleted`, o il diniego):
 * una richiesta rifiutata per storia o per conferma sbagliata lascia
 * comunque traccia di chi l'ha fatta.
 */
export async function DELETE(request: Request, context: Context) {
  const requestContext = await resolveSeasonRequestContext(request);
  if (isSeasonRequestFailure(requestContext)) {
    return requestContext.response;
  }

  if (!hasSeasonPermission(requestContext.role, "seasons.delete")) {
    await recordPermissionDenied({
      scope: {
        userId: requestContext.userId,
        activeRole: requestContext.role,
        activeOrganizationId: requestContext.organizationId,
      },
      permission: "seasons.delete",
      resource: "seasons",
      resourceId: context.params.seasonId,
      metadata: { reason: "season_delete" },
    });
    return NextResponse.json(
      { data: null, error: { message: "Accesso negato: il ruolo attivo non puo eliminare una stagione" } },
      { status: 403 },
    );
  }

  const body = await request.json().catch(() => ({}));
  const confirmation = String(body?.confirmation || "").trim();
  const seasonId = context.params.seasonId;

  try {
    const result = await deleteClubSeason({
      organizationId: requestContext.organizationId,
      seasonId,
      confirmation,
    });

    /* La richiesta e l'esito: due righe, una volta ciascuna (revisione E6). */
    await requestContext.audit({
      action: AUDIT_ACTIONS.seasonDeleteRequested,
      resource: "seasons",
      resourceId: seasonId,
      metadata: { confirmation: true },
    });
    await requestContext.audit({
      action: AUDIT_ACTIONS.seasonDeleted,
      resource: "seasons",
      resourceId: result.season.id,
      metadata: {
        label: result.season.label,
        startDate: result.season.startDate,
        endDate: result.season.endDate,
        confirmation: true,
        removed: result.removed,
        detachedTrainerAssignments: result.detachedTrainerAssignments,
        impact: Object.fromEntries(result.impact.entries.map((entry) => [entry.key, entry.count])),
      },
    });

    return NextResponse.json({ data: result, error: null });
  } catch (error: any) {
    /* Una richiesta rifiutata lascia una riga sola, con il motivo pubblico (mai il messaggio del driver). */
    await requestContext.audit({
      action: AUDIT_ACTIONS.seasonDeleteRequested,
      outcome: "denied",
      resource: "seasons",
      resourceId: seasonId,
      metadata: { confirmation: Boolean(confirmation), reason: publicErrorMessage(error, "Eliminazione rifiutata").slice(0, 200) },
    });
    return seasonErrorResponse(error);
  }
}
