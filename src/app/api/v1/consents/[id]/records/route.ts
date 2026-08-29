import {
  listConsentRecords,
  recordConsentDecision,
} from "@/lib/server/consents";
import { failure, ok, resolveConsentScope } from "../../http";

/**
 * Le decisioni su un consenso.
 *
 *   GET  /api/v1/consents/:id/records?subject_kind=&subject_id=&limit=
 *   POST /api/v1/consents/:id/records   { subject_kind, subject_id, status, … }
 *
 * **Il registro e append-only, e la rotta lo rispecchia**: non c'e `PATCH` e non
 * c'e `DELETE`. Revocare e un `POST` con `status: "revoked"`, che aggiunge una
 * riga — il consenso dato a settembre resta dimostrabile dopo la revoca di
 * gennaio, ed e esattamente cio che serve se qualcuno contesta una foto
 * pubblicata a ottobre.
 */

export const runtime = "nodejs";

type Context = { params: { id: string } };

export async function GET(request: Request, { params }: Context) {
  try {
    const url = new URL(request.url);
    const organizationId = url.searchParams.get("organization_id");
    const resolved = await resolveConsentScope(request, organizationId);
    if (resolved.response) return resolved.response;

    const limit = Number(url.searchParams.get("limit") || 0);

    const data = await listConsentRecords(resolved.scope, params.id, {
      organizationId,
      subjectKind: url.searchParams.get("subject_kind"),
      subjectId: url.searchParams.get("subject_id"),
      limit: Number.isFinite(limit) ? limit : 0,
    });

    return ok(data);
  } catch (error: any) {
    return failure(error, "Lettura delle decisioni non riuscita");
  }
}

export async function POST(request: Request, { params }: Context) {
  try {
    const body = await request.json().catch(() => ({}));
    const organizationId = body?.organization_id || body?.organizationId || null;
    const resolved = await resolveConsentScope(request, organizationId);
    if (resolved.response) return resolved.response;

    const data = await recordConsentDecision(resolved.scope, {
      organizationId,
      definitionId: params.id,
      versionId: body?.version_id ?? body?.versionId ?? null,
      subjectKind: body?.subject_kind ?? body?.subjectKind ?? "",
      subjectId: body?.subject_id ?? body?.subjectId ?? "",
      subjectLabel: body?.subject_label ?? body?.subjectLabel ?? null,
      status: body?.status ?? "",
      source: body?.source ?? null,
      evidenceKind: body?.evidence_kind ?? body?.evidenceKind ?? null,
      evidenceId: body?.evidence_id ?? body?.evidenceId ?? null,
      note: body?.note ?? null,
      decidedAt: body?.decided_at ?? body?.decidedAt ?? null,
    });

    return ok(data);
  } catch (error: any) {
    return failure(error, "Registrazione della decisione non riuscita");
  }
}
