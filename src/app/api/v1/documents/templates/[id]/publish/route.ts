import { NextResponse } from "next/server";

import {
  requireAuthenticatedUser,
  resolveOrganizationScopeForUser,
} from "@/lib/server/auth";
import { canManageDocumentTemplates } from "@/lib/documents/permissions";
import { publishDocumentTemplate } from "@/lib/server/document-templates";
import { AUDIT_ACTIONS, recordAuditEvent } from "@/lib/server/audit";
import { publicErrorMessage } from "@/lib/server/api-errors";

/**
 * Pubblica un modello: l'atto che congela la bozza in una versione.
 *
 *   POST /api/v1/documents/templates/:id/publish
 *
 * **Perche una rotta a se e non un campo dentro `PATCH`.** Pubblicare non e
 * salvare: crea una riga immutabile che i documenti citeranno per sempre. Una
 * cosa che non si puo disfare non deve poter succedere per sbaglio dentro una
 * richiesta che l'editor manda a ogni salvataggio.
 *
 * Se la bozza non e pubblicabile, la risposta dice **quale** segnaposto e il
 * perche: mai silenzio, mai un campo che resta bianco per sempre senza che
 * nessuno lo sappia.
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

    if (!canManageDocumentTemplates(scope.activeRole)) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message:
              "Accesso negato: un modello lo pubblica la direzione del club",
          },
        },
        { status: 403 },
      );
    }

    const data = await publishDocumentTemplate(
      {
        userId: session.db.user_id,
        activeOrganizationId: scope.activeOrganizationId,
        allowedOrganizationIds: scope.allowedOrganizationIds,
        role: scope.activeRole,
      },
      context.params.id,
    );

    await recordAuditEvent({
      action: AUDIT_ACTIONS.documentTemplatePublished,
      actorUserId: session.db.user_id,
      actorEmail: session.db.user.email,
      actorRole: scope.activeRole,
      organizationId: data.organizationId,
      resource: "document_templates",
      resourceId: data.id,
      metadata: {
        version: data.publishedVersion,
        sensitivity: data.sensitivity,
      },
    });

    return NextResponse.json({ data, error: null });
  } catch (error: any) {
    const message = publicErrorMessage(error, "Impossibile pubblicare");
    return NextResponse.json(
      {
        data: null,
        error: { message, ...(error?.issues ? { issues: error.issues } : {}) },
      },
      { status: message.includes("Accesso negato") ? 403 : 400 },
    );
  }
}
