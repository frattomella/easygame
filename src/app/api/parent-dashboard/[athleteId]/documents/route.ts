import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/server/prisma";
import { requireAuthenticatedUser } from "@/lib/server/auth";
import { getParentDashboardData } from "@/lib/server/parent-dashboard";

type Context = {
  params: {
    athleteId: string;
  };
};

const asRecord = (value: unknown): Record<string, any> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {};

const asArray = <T = any>(value: unknown): T[] =>
  Array.isArray(value) ? (value as T[]) : [];

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

    const assetId = randomUUID();
    const path = `${dashboard.club.id}/${dashboard.athlete.id}/${assetId}-${sanitizePathPart(fileName) || "documento"}`;
    const publicUrl = `/api/parent-dashboard/${dashboard.athlete.id}/documents/${assetId}`;
    const asset = await prisma.asset.create({
      data: {
        id: assetId,
        bucket: "parent-documents",
        path,
        public_url: publicUrl,
        file_name: fileName,
        mime_type: mimeType || "application/octet-stream",
        data_base64: dataBase64,
      },
    });

    const athlete = await prisma.athlete.findUnique({
      where: { id: dashboard.athlete.id },
      select: { data: true },
    });
    const currentData = asRecord(athlete?.data);
    const currentDocuments = [
      ...asArray(currentData.parentDocuments),
      ...asArray(currentData.parent_documents),
    ];
    const nowIso = new Date().toISOString();
    const documentRecord = {
      id: asset.id,
      templateId,
      template_id: templateId,
      title,
      fileName,
      file_name: fileName,
      mimeType: asset.mime_type,
      mime_type: asset.mime_type,
      status: "in_verifica",
      assetId: asset.id,
      asset_id: asset.id,
      uploadedAt: nowIso,
      uploaded_at: nowIso,
      source: "parent_dashboard",
    };

    await prisma.athlete.update({
      where: { id: dashboard.athlete.id },
      data: {
        data: {
          ...currentData,
          parentDocuments: [...currentDocuments, documentRecord],
        },
      },
    });

    return NextResponse.json({ data: documentRecord, error: null });
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
