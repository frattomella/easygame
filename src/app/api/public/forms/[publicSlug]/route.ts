import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import {
  asArray,
  firstText,
  isFileField,
  isOnlineFormClosed,
  isReadOnlyField,
  isRecord,
  validateOnlineFormAnswers,
  type OnlineFormSubmission,
  type OnlineFormSubmissionFile,
} from "@/lib/online-forms";
import {
  findPublicOnlineFormBySlug,
  savePublicOnlineFormSubmission,
} from "@/lib/server/online-forms";
import { getSessionFromRequest } from "@/lib/server/auth";
import { prisma } from "@/lib/server/prisma";

type Context = {
  params: {
    publicSlug: string;
  };
};

const DEFAULT_MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const DEFAULT_ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/heic",
  "image/heif",
]);

const jsonError = (message: string, status = 400, data: any = null) =>
  NextResponse.json({ data, error: { message } }, { status });

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

const matchesAcceptedType = ({
  acceptedTypes,
  fileName,
  mimeType,
}: {
  acceptedTypes: string[];
  fileName: string;
  mimeType: string;
}) => {
  if (!acceptedTypes.length) {
    return DEFAULT_ALLOWED_MIME_TYPES.has(mimeType.toLowerCase());
  }

  const normalizedName = fileName.toLowerCase();
  const normalizedMime = mimeType.toLowerCase();

  return acceptedTypes.some((acceptedType) => {
    const accepted = acceptedType.toLowerCase().trim();
    if (!accepted) return false;
    if (accepted.endsWith("/*")) {
      return normalizedMime.startsWith(accepted.slice(0, -1));
    }
    if (accepted.startsWith(".")) {
      return normalizedName.endsWith(accepted);
    }
    return normalizedMime === accepted;
  });
};

const getField = (fields: any[], fieldId: string) =>
  fields.find((field) => field.id === fieldId) || null;

const createClubNotifications = async ({
  organizationId,
  formId,
  formTitle,
  submissionId,
  respondentName,
}: {
  organizationId: string;
  formId: string;
  formTitle: string;
  submissionId: string;
  respondentName?: string;
}) => {
  const club = await prisma.club.findUnique({
    where: { id: organizationId },
    select: {
      creator_id: true,
      organization_users: { select: { user_id: true } },
    },
  });
  if (!club) return;

  const recipientIds = Array.from(
    new Set(
      [
        club.creator_id,
        ...club.organization_users.map((membership) => membership.user_id),
      ].filter(Boolean),
    ),
  );
  if (recipientIds.length === 0) return;

  await prisma.notification.createMany({
    data: recipientIds.map((userId) => ({
      organization_id: organizationId,
      user_id: userId,
      title: "Nuova risposta modulo",
      message: `${formTitle}${respondentName ? ` - ${respondentName}` : ""}`,
      type: "online_form_submission",
      data: {
        formId,
        submissionId,
        source: "online_forms",
      },
    })),
  });
};

export async function GET(request: Request, context: Context) {
  try {
    const match = await findPublicOnlineFormBySlug(context.params.publicSlug);
    if (!match) return jsonError("Modulo non trovato", 404);

    const { form, club } = match;
    if (form.status !== "published") {
      return jsonError("Modulo non disponibile", 403, {
        form: {
          title: form.title,
          status: form.status,
        },
      });
    }

    if (isOnlineFormClosed(form)) {
      return jsonError("Modulo chiuso", 403, {
        form: {
          title: form.title,
          status: form.status,
        },
      });
    }

    if (form.requiresAuth) {
      const session = await getSessionFromRequest(request);
      if (!session) {
        return jsonError("Login richiesto per compilare questo modulo", 401, {
          requiresAuth: true,
        });
      }
    }

    return NextResponse.json({
      data: {
        form,
        club: {
          id: club.id,
          name: club.name,
          logoUrl: club.logo_url || "",
          contactEmail: club.contact_email || "",
        },
      },
      error: null,
    });
  } catch (error: any) {
    return jsonError(error?.message || "Errore caricamento modulo", 500);
  }
}

export async function POST(request: Request, context: Context) {
  try {
    const match = await findPublicOnlineFormBySlug(context.params.publicSlug);
    if (!match) return jsonError("Modulo non trovato", 404);

    const { form } = match;
    if (form.status !== "published") {
      return jsonError("Modulo non disponibile", 403);
    }
    if (isOnlineFormClosed(form)) {
      return jsonError("Modulo chiuso", 403);
    }

    const session = await getSessionFromRequest(request);
    if (form.requiresAuth && !session) {
      return jsonError("Login richiesto per compilare questo modulo", 401);
    }

    const body = await request.json().catch(() => ({}));
    const rawAnswers = isRecord(body?.answers) ? body.answers : {};
    const uploadedFiles = asArray(body?.files);
    const submissionId = randomUUID();
    const savedFiles: OnlineFormSubmissionFile[] = [];
    const answers = { ...rawAnswers };

    for (const rawFile of uploadedFiles) {
      const fileRecord = isRecord(rawFile) ? rawFile : {};
      const fieldId = firstText(fileRecord.fieldId, fileRecord.field_id);
      const field = getField(form.fields, fieldId);
      if (!field || !isFileField(field.type)) {
        continue;
      }

      const fileName =
        firstText(fileRecord.fileName, fileRecord.file_name) ||
        `${field.label}.png`;
      const mimeType =
        firstText(fileRecord.mimeType, fileRecord.mime_type) || "image/png";
      const dataBase64 = firstText(
        fileRecord.dataBase64,
        fileRecord.data_base64,
      );

      if (!dataBase64) {
        if (field.required) return jsonError(`File mancante: ${field.label}`);
        continue;
      }

      const maxBytes =
        Number(field.validation?.maxFileSizeMb || 0) > 0
          ? Number(field.validation?.maxFileSizeMb) * 1024 * 1024
          : DEFAULT_MAX_UPLOAD_BYTES;
      if (estimateDataUrlBytes(dataBase64) > maxBytes) {
        return jsonError(`File troppo grande: ${field.label}`);
      }

      const acceptedTypes = Array.isArray(field.validation?.acceptedFileTypes)
        ? field.validation?.acceptedFileTypes || []
        : [];
      if (
        field.type !== "signature" &&
        !matchesAcceptedType({ acceptedTypes, fileName, mimeType })
      ) {
        return jsonError(`Formato file non supportato: ${field.label}`);
      }

      const assetId = randomUUID();
      const path = `${form.organizationId}/${form.id}/${submissionId}/${assetId}-${sanitizePathPart(fileName) || "file"}`;
      const publicUrl = `/api/forms/assets/${assetId}`;
      const asset = await prisma.asset.create({
        data: {
          id: assetId,
          bucket: "online-form-submissions",
          path,
          public_url: publicUrl,
          file_name: fileName,
          mime_type: mimeType,
          data_base64: dataBase64,
        },
      });

      const savedFile = {
        fieldId,
        fieldLabel: field.label,
        fileName,
        fileUrl: publicUrl,
        assetId: asset.id,
        mimeType,
        size: estimateDataUrlBytes(dataBase64),
      };
      savedFiles.push(savedFile);
      answers[fieldId] = publicUrl;
    }

    const requiredValidation = validateOnlineFormAnswers(
      form,
      answers,
      savedFiles,
    );
    if (!requiredValidation.valid) {
      return jsonError("Compila tutti i campi obbligatori", 422, {
        errors: requiredValidation.errors,
      });
    }

    if (form.settings.collectEmail && !firstText(body?.respondentEmail)) {
      return jsonError("Email obbligatoria", 422, {
        errors: { respondentEmail: "Email obbligatoria" },
      });
    }

    const nowIso = new Date().toISOString();
    const submission: OnlineFormSubmission = {
      id: submissionId,
      type: "online_form_submission",
      organizationId: form.organizationId,
      organization_id: form.organizationId,
      formId: form.id,
      form_id: form.id,
      athleteId: "",
      athlete_id: "",
      parentUserId: session?.db.user_id || "",
      parent_user_id: session?.db.user_id || "",
      respondentName: firstText(body?.respondentName, body?.respondent_name),
      respondent_name: firstText(body?.respondentName, body?.respondent_name),
      respondentEmail: firstText(body?.respondentEmail, body?.respondent_email),
      respondent_email: firstText(
        body?.respondentEmail,
        body?.respondent_email,
      ),
      answers: Object.fromEntries(
        Object.entries(answers).filter(([fieldId]) => {
          const field = form.fields.find((candidate) => candidate.id === fieldId);
          return field ? !isReadOnlyField(field.type) : true;
        }),
      ),
      files: savedFiles,
      submittedAt: nowIso,
      submitted_at: nowIso,
      status: "submitted",
    };

    await savePublicOnlineFormSubmission({ form, submission });

    if (form.settings.notifyClubOnSubmit) {
      await createClubNotifications({
        organizationId: form.organizationId,
        formId: form.id,
        formTitle: form.title,
        submissionId,
        respondentName: submission.respondentName,
      });
    }

    return NextResponse.json({
      data: {
        submissionId,
        successMessage:
          form.settings.successMessage ||
          "Risposta inviata correttamente. Grazie!",
      },
      error: null,
    });
  } catch (error: any) {
    return jsonError(error?.message || "Errore invio risposta", 500);
  }
}
