import { randomUUID } from "crypto";
import { createClubNotifications } from "@/lib/server/club-notifications";
import { isManagementAccessRole } from "@/lib/access-roles";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/server/prisma";
import { requireAuthenticatedUser } from "@/lib/server/auth";
import { getParentDashboardData } from "@/lib/server/parent-dashboard";
import {
  getSharedDocumentsFromAthlete,
  normalizeSharedDocument,
  normalizeSharedDocumentType,
  serializeSharedDocument,
  upsertSharedDocument,
} from "@/lib/shared-documents";

type Context = {
  params: {
    athleteId: string;
  };
};

const asRecord = (value: unknown): Record<string, any> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {};

const firstText = (...values: unknown[]) => {
  for (const value of values) {
    const text = String(value || "").trim();
    if (text) return text;
  }

  return "";
};

const sanitizePathPart = (value: string) =>
  value
    .trim()
    .replace(/[^\w.-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 120);

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/heic",
  "image/heif",
]);

const estimateDataUrlBytes = (value: string) => {
  const base64 = value.includes(",") ? value.split(",").pop() || "" : value;
  return Buffer.byteLength(base64, "base64");
};

export async function POST(request: Request, context: Context) {
  try {
    const session = await requireAuthenticatedUser(request);
    if (!session) {
      return NextResponse.json(
        {
          data: null,
          error: { message: "Sessione non valida" },
        },
        { status: 401 },
      );
    }

    const dashboard = await getParentDashboardData(
      session.db.user_id,
      context.params.athleteId,
    );

    if (!dashboard) {
      return NextResponse.json(
        {
          data: null,
          error: { message: "Atleta non collegato a questo account" },
        },
        { status: 403 },
      );
    }

    const body = await request.json().catch(() => ({}));
    const fileName = firstText(body?.fileName, body?.file_name);
    const mimeType = firstText(body?.mimeType, body?.mime_type);
    const dataBase64 = firstText(body?.dataBase64, body?.data_base64);
    const templateId = firstText(body?.templateId, body?.template_id);
    const title = firstText(body?.title, body?.name) || "Documento";

    if (!fileName || !dataBase64) {
      return NextResponse.json(
        {
          data: null,
          error: { message: "File documento mancante" },
        },
        { status: 400 },
      );
    }

    if (mimeType && !ALLOWED_MIME_TYPES.has(mimeType.toLowerCase())) {
      return NextResponse.json(
        {
          data: null,
          error: { message: "Formato file non supportato. Usa PDF, JPG, PNG o HEIC." },
        },
        { status: 400 },
      );
    }

    if (estimateDataUrlBytes(dataBase64) > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        {
          data: null,
          error: { message: "File troppo grande. Limite massimo 10MB." },
        },
        { status: 400 },
      );
    }

    const assetId = randomUUID();
    const path = `${dashboard.club.id}/${dashboard.athlete.id}/${assetId}-${sanitizePathPart(fileName) || "documento"}`;
    const publicUrl = `/api/parent-dashboard/${dashboard.athlete.id}/documents/${assetId}`;
    const asset = await prisma.asset.create({
      data: {
        id: assetId,
        bucket: "shared-documents",
        path,
        public_url: publicUrl,
        file_name: fileName,
        mime_type: mimeType || "application/octet-stream",
        data_base64: dataBase64,
      },
    });

    const athlete = await prisma.athlete.findUnique({
      where: { id: dashboard.athlete.id },
      select: { id: true, organization_id: true, data: true },
    });
    const currentData = asRecord(athlete?.data);
    const currentDocuments = getSharedDocumentsFromAthlete({
      id: athlete?.id || dashboard.athlete.id,
      organization_id: athlete?.organization_id || dashboard.club.id,
      data: currentData,
    }, { includeArchived: true });
    const nowIso = new Date().toISOString();
    const requestedDocumentId = firstText(body?.documentId, body?.document_id);
    const existingDocument = currentDocuments.find(
      (document) =>
        (requestedDocumentId && document.id === requestedDocumentId) ||
        (templateId && document.id === templateId) ||
        (templateId && document.data?.templateId === templateId),
    );
    const documentRecord = normalizeSharedDocument({
      ...(existingDocument || {}),
      id: existingDocument?.id || requestedDocumentId || asset.id,
      organizationId: dashboard.club.id,
      athleteId: dashboard.athlete.id,
      parentUserId: session.db.user_id,
      uploadedByUserId: session.db.user_id,
      uploadedByRole: "parent",
      templateId,
      template_id: templateId,
      title,
      documentType: normalizeSharedDocumentType(
        body?.documentType || body?.document_type || existingDocument?.documentType,
      ),
      fileName,
      file_name: fileName,
      mimeType: asset.mime_type,
      mime_type: asset.mime_type,
      size: Number(body?.size) || estimateDataUrlBytes(dataBase64),
      status: "under_review",
      required: Boolean(existingDocument?.required ?? templateId),
      visibleToParent: true,
      assetId: asset.id,
      asset_id: asset.id,
      fileUrl: publicUrl,
      uploadedAt: nowIso,
      uploaded_at: nowIso,
      source: "parent_dashboard",
      createdAt: existingDocument?.createdAt || nowIso,
      updatedAt: nowIso,
      data: {
        ...(existingDocument?.data || {}),
        templateId,
      },
    }, currentDocuments.length);
    const nextDocuments = upsertSharedDocument(currentDocuments, documentRecord);

    await prisma.athlete.update({
      where: { id: dashboard.athlete.id },
      data: {
        data: {
          ...currentData,
          sharedDocuments: nextDocuments.map(serializeSharedDocument),
          shared_documents: nextDocuments.map(serializeSharedDocument),
        },
      },
    });

    /*
      **Stessa correzione della richiesta di appuntamento.**

      `user_id: null` significa «di tutti» per l'area genitore, e qui il
      messaggio nomina il minore e porta il **titolo scritto dalla famiglia**
      — testo libero, di lunghezza non controllata, che finiva nella bacheca
      di ogni altra famiglia del club.

      Il caricamento di un documento lo esamina l'area gestionale: segreteria compresa, allenatori e altre famiglie no.
    */
    await createClubNotifications({
      clubId: dashboard.club.id,
      title: "Documento parent caricato",
      message: `${dashboard.athlete.name} ha caricato: ${documentRecord.title}`,
      type: "document_uploaded",
      data: {
        athleteId: dashboard.athlete.id,
        documentId: documentRecord.id,
        source: "shared_documents",
      },
      audience: (role) => isManagementAccessRole(role),
    });

    return NextResponse.json({
      data: serializeSharedDocument(documentRecord),
      error: null,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        data: null,
        error: {
          message: error?.message || "Errore caricamento documento",
        },
      },
      { status: 500 },
    );
  }
}
