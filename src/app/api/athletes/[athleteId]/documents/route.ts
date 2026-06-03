import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import {
  asArray,
  asRecord,
  firstText,
  getSharedDocumentsFromAthlete,
  normalizeSharedDocument,
  normalizeSharedDocumentStatus,
  normalizeSharedDocumentType,
  serializeSharedDocument,
  upsertSharedDocument,
  type SharedDocument,
} from "@/lib/shared-documents";
import {
  requireAuthenticatedUser,
  resolveOrganizationScopeForUser,
} from "@/lib/server/auth";
import { prisma } from "@/lib/server/prisma";

type Context = {
  params: {
    athleteId: string;
  };
};

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/heic",
  "image/heif",
]);

const jsonError = (message: string, status = 400) =>
  NextResponse.json({ data: null, error: { message } }, { status });

const sanitizePathPart = (value: string) =>
  value
    .trim()
    .replace(/[^\w.-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 120);

const estimateDataUrlBytes = (value: string) => {
  const base64 = value.includes(",") ? value.split(",").pop() || "" : value;
  return Buffer.byteLength(base64, "base64");
};

const validateUpload = ({
  fileName,
  mimeType,
  dataBase64,
}: {
  fileName: string;
  mimeType: string;
  dataBase64: string;
}) => {
  if (!fileName || !dataBase64) {
    return "File documento mancante";
  }

  if (mimeType && !ALLOWED_MIME_TYPES.has(mimeType.toLowerCase())) {
    return "Formato file non supportato. Usa PDF, JPG, PNG o HEIC.";
  }

  if (estimateDataUrlBytes(dataBase64) > MAX_UPLOAD_BYTES) {
    return "File troppo grande. Limite massimo 10MB.";
  }

  return "";
};

const loadAthleteForSession = async (
  request: Request,
  userId: string,
  athleteId: string,
  preferredOrganizationId?: string,
) => {
  const scope = await resolveOrganizationScopeForUser(
    userId,
    preferredOrganizationId || request.headers.get("x-active-club-id"),
  );

  if (scope.allowedOrganizationIds.length === 0) {
    return null;
  }

  return prisma.athlete.findFirst({
    where: {
      id: athleteId,
      organization_id: { in: scope.allowedOrganizationIds },
    },
    include: {
      organization: { select: { id: true, name: true } },
    },
  });
};

const getParentUserIds = (athlete: any) => {
  const data = asRecord(athlete?.data);
  const guardianIds = asArray(data.guardians)
    .flatMap((guardian) => [
      asRecord(guardian).linkedUserId,
      asRecord(guardian).linked_user_id,
      asRecord(guardian).userId,
      asRecord(guardian).user_id,
    ])
    .map((value) => firstText(value))
    .filter(Boolean);

  return Array.from(new Set([firstText(athlete?.user_id), ...guardianIds].filter(Boolean)));
};

const createParentNotifications = async ({
  athlete,
  title,
  message,
  documentId,
  type,
}: {
  athlete: any;
  title: string;
  message: string;
  documentId: string;
  type: string;
}) => {
  const parentUserIds = getParentUserIds(athlete);
  if (parentUserIds.length === 0) return;

  await prisma.notification.createMany({
    data: parentUserIds.map((userId) => ({
      organization_id: athlete.organization_id,
      user_id: userId,
      title,
      message,
      type,
      data: {
        athleteId: athlete.id,
        documentId,
        source: "shared_documents",
      },
    })),
  });
};

const saveSharedDocuments = async (
  athlete: any,
  documents: SharedDocument[],
) => {
  const currentData = asRecord(athlete.data);
  const serialized = documents.map(serializeSharedDocument);
  const updated = await prisma.athlete.update({
    where: { id: athlete.id },
    data: {
      data: {
        ...currentData,
        sharedDocuments: serialized,
        shared_documents: serialized,
      },
    },
  });

  return getSharedDocumentsFromAthlete(updated, { includeArchived: true });
};

export async function GET(request: Request, context: Context) {
  try {
    const session = await requireAuthenticatedUser(request);
    if (!session) return jsonError("Sessione non valida", 401);

    const athlete = await loadAthleteForSession(
      request,
      session.db.user_id,
      context.params.athleteId,
    );
    if (!athlete) return jsonError("Atleta non appartenente al club", 403);

    return NextResponse.json({
      data: getSharedDocumentsFromAthlete(athlete),
      error: null,
    });
  } catch (error: any) {
    return jsonError(error?.message || "Errore caricamento documenti", 500);
  }
}

export async function POST(request: Request, context: Context) {
  try {
    const session = await requireAuthenticatedUser(request);
    if (!session) return jsonError("Sessione non valida", 401);

    const body = await request.json().catch(() => ({}));
    const athlete = await loadAthleteForSession(
      request,
      session.db.user_id,
      context.params.athleteId,
      firstText(body?.organizationId, body?.organization_id),
    );
    if (!athlete) return jsonError("Atleta non appartenente al club", 403);

    const action = firstText(body?.action) || "upload";
    const nowIso = new Date().toISOString();
    const currentDocuments = getSharedDocumentsFromAthlete(athlete, {
      includeArchived: true,
    });

    if (action === "require") {
      const documentId = randomUUID();
      const document = normalizeSharedDocument(
        {
          id: documentId,
          organizationId: athlete.organization_id,
          athleteId: athlete.id,
          uploadedByUserId: session.db.user_id,
          uploadedByRole: "club",
          title: firstText(body?.title) || "Documento richiesto",
          description: firstText(body?.description),
          documentType: normalizeSharedDocumentType(body?.documentType),
          status: "required",
          required: true,
          dueDate: firstText(body?.dueDate, body?.due_date),
          visibleToParent: true,
          createdAt: nowIso,
          updatedAt: nowIso,
        },
        currentDocuments.length,
      );
      const saved = await saveSharedDocuments(athlete, [
        ...currentDocuments,
        document,
      ]);

      await createParentNotifications({
        athlete,
        title: "Documento richiesto",
        message: `Il club richiede: ${document.title}`,
        documentId,
        type: "document_required",
      });

      return NextResponse.json({ data: saved, error: null });
    }

    const fileName = firstText(body?.fileName, body?.file_name);
    const mimeType =
      firstText(body?.mimeType, body?.mime_type) || "application/octet-stream";
    const dataBase64 = firstText(body?.dataBase64, body?.data_base64);
    const uploadError = validateUpload({ fileName, mimeType, dataBase64 });
    if (uploadError) return jsonError(uploadError);

    const documentId = firstText(body?.documentId, body?.document_id) || randomUUID();
    const assetId = randomUUID();
    const path = `${athlete.organization_id}/${athlete.id}/${assetId}-${sanitizePathPart(fileName) || "documento"}`;
    const publicUrl = `/api/parent-dashboard/${athlete.id}/documents/${assetId}`;
    const asset = await prisma.asset.create({
      data: {
        id: assetId,
        bucket: "shared-documents",
        path,
        public_url: publicUrl,
        file_name: fileName,
        mime_type: mimeType,
        data_base64: dataBase64,
      },
    });

    const existing = currentDocuments.find((document) => document.id === documentId);
    const document = normalizeSharedDocument(
      {
        ...(existing || {}),
        id: documentId,
        organizationId: athlete.organization_id,
        athleteId: athlete.id,
        uploadedByUserId: session.db.user_id,
        uploadedByRole: "club",
        title: firstText(body?.title, existing?.title) || fileName,
        description: firstText(body?.description, existing?.description),
        documentType: normalizeSharedDocumentType(
          body?.documentType || existing?.documentType,
        ),
        fileUrl: publicUrl,
        fileName,
        mimeType,
        size: Number(body?.size) || estimateDataUrlBytes(dataBase64),
        status: normalizeSharedDocumentStatus(body?.status || "uploaded"),
        required: Boolean(body?.required ?? existing?.required ?? false),
        dueDate: firstText(body?.dueDate, body?.due_date, existing?.dueDate),
        visibleToParent: body?.visibleToParent ?? body?.visible_to_parent ?? true,
        assetId: asset.id,
        uploadedAt: nowIso,
        createdAt: existing?.createdAt || nowIso,
        updatedAt: nowIso,
      },
      currentDocuments.length,
    );
    const saved = await saveSharedDocuments(
      athlete,
      upsertSharedDocument(currentDocuments, document),
    );

    if (document.visibleToParent) {
      await createParentNotifications({
        athlete,
        title: "Nuovo documento disponibile",
        message: `Il club ha condiviso: ${document.title}`,
        documentId: document.id,
        type: "document_shared",
      });
    }

    return NextResponse.json({ data: saved, error: null });
  } catch (error: any) {
    return jsonError(error?.message || "Errore salvataggio documento", 500);
  }
}

export async function PATCH(request: Request, context: Context) {
  try {
    const session = await requireAuthenticatedUser(request);
    if (!session) return jsonError("Sessione non valida", 401);

    const body = await request.json().catch(() => ({}));
    const athlete = await loadAthleteForSession(
      request,
      session.db.user_id,
      context.params.athleteId,
      firstText(body?.organizationId, body?.organization_id),
    );
    if (!athlete) return jsonError("Atleta non appartenente al club", 403);

    const documentId = firstText(body?.documentId, body?.document_id);
    if (!documentId) return jsonError("Documento non indicato");

    const documents = getSharedDocumentsFromAthlete(athlete, {
      includeArchived: true,
    });
    const existing = documents.find((document) => document.id === documentId);
    if (!existing) return jsonError("Documento non trovato", 404);

    const action = firstText(body?.action) || "update";
    const nowIso = new Date().toISOString();
    let nextDocument: SharedDocument = {
      ...existing,
      updatedAt: nowIso,
    };

    if (action === "approve") {
      nextDocument = {
        ...nextDocument,
        status: "approved",
        rejectionReason: "",
      };
      await createParentNotifications({
        athlete,
        title: "Documento approvato",
        message: `Il documento "${existing.title}" e stato approvato.`,
        documentId,
        type: "document_approved",
      });
    } else if (action === "reject") {
      const reason = firstText(body?.rejectionReason, body?.rejection_reason);
      if (!reason) return jsonError("Motivo rifiuto obbligatorio");
      nextDocument = {
        ...nextDocument,
        status: "rejected",
        rejectionReason: reason,
      };
      await createParentNotifications({
        athlete,
        title: "Documento rifiutato",
        message: `Il documento "${existing.title}" e stato rifiutato: ${reason}`,
        documentId,
        type: "document_rejected",
      });
    } else if (action === "remind") {
      const lastReminderTime = existing.lastReminderAt
        ? new Date(existing.lastReminderAt).getTime()
        : 0;
      if (lastReminderTime && Date.now() - lastReminderTime < 6 * 60 * 60 * 1000) {
        return jsonError("Sollecito gia inviato nelle ultime 6 ore");
      }
      nextDocument = {
        ...nextDocument,
        lastReminderAt: nowIso,
      };
      await createParentNotifications({
        athlete,
        title: "Promemoria documento",
        message: `Ricordati di caricare: ${existing.title}`,
        documentId,
        type: "document_reminder",
      });
    } else {
      nextDocument = {
        ...nextDocument,
        title: firstText(body?.title, existing.title),
        description: firstText(body?.description, existing.description),
        documentType: normalizeSharedDocumentType(
          body?.documentType || existing.documentType,
        ),
        dueDate: firstText(body?.dueDate, body?.due_date, existing.dueDate),
        visibleToParent:
          body?.visibleToParent ?? body?.visible_to_parent ?? existing.visibleToParent,
      };
    }

    const saved = await saveSharedDocuments(
      athlete,
      upsertSharedDocument(documents, nextDocument),
    );
    return NextResponse.json({ data: saved, error: null });
  } catch (error: any) {
    return jsonError(error?.message || "Errore aggiornamento documento", 500);
  }
}

export async function DELETE(request: Request, context: Context) {
  try {
    const session = await requireAuthenticatedUser(request);
    if (!session) return jsonError("Sessione non valida", 401);

    const body = await request.json().catch(() => ({}));
    const athlete = await loadAthleteForSession(
      request,
      session.db.user_id,
      context.params.athleteId,
      firstText(body?.organizationId, body?.organization_id),
    );
    if (!athlete) return jsonError("Atleta non appartenente al club", 403);

    const documentId = firstText(body?.documentId, body?.document_id);
    if (!documentId) return jsonError("Documento non indicato");

    const documents = getSharedDocumentsFromAthlete(athlete, {
      includeArchived: true,
    });
    const existing = documents.find((document) => document.id === documentId);
    if (!existing) return jsonError("Documento non trovato", 404);

    const saved = await saveSharedDocuments(
      athlete,
      upsertSharedDocument(documents, {
        ...existing,
        archived: true,
        visibleToParent: false,
        updatedAt: new Date().toISOString(),
      }),
    );
    return NextResponse.json({ data: saved, error: null });
  } catch (error: any) {
    return jsonError(error?.message || "Errore archiviazione documento", 500);
  }
}

