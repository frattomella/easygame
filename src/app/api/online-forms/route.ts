import { NextResponse } from "next/server";
import {
  duplicateOnlineForm,
  createOnlineForm,
  loadOnlineFormBundle,
  updateOnlineFormStatus,
  updateOnlineFormSubmissionStatus,
  upsertOnlineForm,
} from "@/lib/server/online-forms";
import {
  firstText,
  type OnlineFormSubmissionStatus,
  type OnlineFormStatus,
} from "@/lib/online-forms";
import {
  requireAuthenticatedUser,
  resolveOrganizationScopeForUser,
} from "@/lib/server/auth";

const jsonError = (message: string, status = 400) =>
  NextResponse.json({ data: null, error: { message } }, { status });

const resolveOrganizationId = async (request: Request, body?: any) => {
  const session = await requireAuthenticatedUser(request);
  if (!session) {
    return { error: jsonError("Sessione non valida", 401) };
  }

  const url = new URL(request.url);
  const requestedOrganizationId = firstText(
    body?.organizationId,
    body?.organization_id,
    url.searchParams.get("organizationId"),
    url.searchParams.get("clubId"),
    request.headers.get("x-active-club-id"),
  );
  const scope = await resolveOrganizationScopeForUser(
    session.db.user_id,
    requestedOrganizationId,
  );

  if (!scope.activeOrganizationId) {
    return { error: jsonError("Nessun club disponibile", 403) };
  }

  if (
    requestedOrganizationId &&
    !scope.allowedOrganizationIds.includes(requestedOrganizationId)
  ) {
    return { error: jsonError("Accesso negato al club", 403) };
  }

  return {
    session,
    organizationId: requestedOrganizationId || scope.activeOrganizationId,
  };
};

export async function GET(request: Request) {
  try {
    const resolved = await resolveOrganizationId(request);
    if (resolved.error) return resolved.error;

    const bundle = await loadOnlineFormBundle(resolved.organizationId);
    return NextResponse.json({ data: bundle, error: null });
  } catch (error: any) {
    return jsonError(error?.message || "Errore caricamento moduli", 500);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const resolved = await resolveOrganizationId(request, body);
    if (resolved.error) return resolved.error;

    const action = firstText(body?.action) || "create";
    if (action === "create_base_enrollment") {
      const result = await createOnlineForm(
        resolved.organizationId,
        "base_enrollment",
      );
      return NextResponse.json({ data: result, error: null });
    }

    if (action === "duplicate") {
      const formId = firstText(body?.formId, body?.form_id);
      if (!formId) return jsonError("Modulo non indicato");
      const result = await duplicateOnlineForm(resolved.organizationId, formId);
      return NextResponse.json({ data: result, error: null });
    }

    if (body?.form) {
      const result = await upsertOnlineForm(resolved.organizationId, body.form);
      return NextResponse.json({ data: result, error: null });
    }

    const result = await createOnlineForm(resolved.organizationId, "blank");
    return NextResponse.json({ data: result, error: null });
  } catch (error: any) {
    return jsonError(error?.message || "Errore creazione modulo", 500);
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const resolved = await resolveOrganizationId(request, body);
    if (resolved.error) return resolved.error;

    if (body?.kind === "submission") {
      const submissionId = firstText(body?.submissionId, body?.submission_id);
      const status = firstText(body?.status) as OnlineFormSubmissionStatus;
      if (!submissionId) return jsonError("Risposta non indicata");
      if (!["submitted", "reviewed", "approved", "rejected"].includes(status)) {
        return jsonError("Stato risposta non valido");
      }

      const result = await updateOnlineFormSubmissionStatus(
        resolved.organizationId,
        submissionId,
        status,
      );
      return NextResponse.json({ data: result, error: null });
    }

    const action = firstText(body?.action);
    const formId = firstText(body?.formId, body?.form_id, body?.form?.id);
    if (!formId && !body?.form) return jsonError("Modulo non indicato");

    if (action === "publish" || action === "unpublish" || action === "archive") {
      const status: OnlineFormStatus =
        action === "publish"
          ? "published"
          : action === "archive"
            ? "archived"
            : "draft";
      const result = await updateOnlineFormStatus(
        resolved.organizationId,
        formId,
        status,
      );
      return NextResponse.json({ data: result, error: null });
    }

    if (action === "duplicate") {
      const result = await duplicateOnlineForm(resolved.organizationId, formId);
      return NextResponse.json({ data: result, error: null });
    }

    const result = await upsertOnlineForm(resolved.organizationId, body.form);
    return NextResponse.json({ data: result, error: null });
  } catch (error: any) {
    return jsonError(error?.message || "Errore aggiornamento modulo", 500);
  }
}
