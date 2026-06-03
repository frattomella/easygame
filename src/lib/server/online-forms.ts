import { randomUUID } from "crypto";
import { Prisma } from "@prisma/client";
import {
  buildUniquePublicSlug,
  createBaseEnrollmentOnlineForm,
  createEmptyOnlineForm,
  firstText,
  getDocumentTemplatesFromClub,
  getOnlineFormById,
  getOnlineFormSubmissionsFromClub,
  mergeOnlineFormBundleIntoDocumentTemplates,
  normalizeOnlineForm,
  normalizeOnlineFormSubmission,
  serializeOnlineForm,
  serializeOnlineFormSubmission,
  splitOnlineFormBundle,
  type OnlineForm,
  type OnlineFormBundle,
  type OnlineFormSubmission,
  type OnlineFormSubmissionStatus,
} from "@/lib/online-forms";
import { prisma } from "@/lib/server/prisma";

type ClubFormRow = {
  id: string;
  name: string;
  logo_url?: string | null;
  contact_email?: string | null;
  creator_id?: string | null;
  document_templates?: Prisma.JsonValue | null;
};

export type PublicOnlineFormMatch = {
  club: ClubFormRow;
  form: OnlineForm;
};

const toJsonValue = (value: unknown) => value as Prisma.InputJsonValue;

export const loadOnlineFormBundle = async (
  organizationId: string,
): Promise<OnlineFormBundle> => {
  const club = await prisma.club.findUnique({
    where: { id: organizationId },
    select: { document_templates: true },
  });

  return splitOnlineFormBundle(club?.document_templates, organizationId);
};

export const loadDocumentTemplateItems = async (organizationId: string) => {
  const club = await prisma.club.findUnique({
    where: { id: organizationId },
    select: { document_templates: true },
  });

  return Array.isArray(club?.document_templates)
    ? club.document_templates
    : [];
};

const saveDocumentTemplateItems = async (
  organizationId: string,
  items: unknown[],
) => {
  await prisma.club.update({
    where: { id: organizationId },
    data: {
      document_templates: toJsonValue(items),
    },
  });
};

export const saveOnlineFormBundle = async (
  organizationId: string,
  bundle: OnlineFormBundle,
) => {
  const currentItems = await loadDocumentTemplateItems(organizationId);
  const nextItems = mergeOnlineFormBundleIntoDocumentTemplates(currentItems, {
    forms: bundle.forms.map((form) => serializeOnlineForm(form)),
    submissions: bundle.submissions.map((submission) =>
      serializeOnlineFormSubmission(submission),
    ),
  });

  await saveDocumentTemplateItems(organizationId, nextItems);
  return splitOnlineFormBundle(nextItems, organizationId);
};

export const createOnlineForm = async (
  organizationId: string,
  kind: "blank" | "base_enrollment" = "blank",
) => {
  const bundle = await loadOnlineFormBundle(organizationId);
  const form =
    kind === "base_enrollment"
      ? createBaseEnrollmentOnlineForm(organizationId, bundle.forms)
      : createEmptyOnlineForm(organizationId, bundle.forms);

  const saved = await saveOnlineFormBundle(organizationId, {
    ...bundle,
    forms: [...bundle.forms, form],
  });

  return {
    bundle: saved,
    form: saved.forms.find((candidate) => candidate.id === form.id) || form,
  };
};

export const upsertOnlineForm = async (
  organizationId: string,
  rawForm: unknown,
) => {
  const bundle = await loadOnlineFormBundle(organizationId);
  const nowIso = new Date().toISOString();
  const form = normalizeOnlineForm(rawForm, organizationId);
  const existing = getOnlineFormById(
    bundle.forms,
    form.id,
    organizationId,
  );
  const nextPublicSlug = buildUniquePublicSlug(
    form.title,
    bundle.forms,
    form.id,
  );
  const nextForm: OnlineForm = {
    ...(existing || {}),
    ...form,
    organizationId,
    organization_id: organizationId,
    publicSlug: firstText(form.publicSlug) || nextPublicSlug,
    public_slug: firstText(form.publicSlug) || nextPublicSlug,
    createdAt: existing?.createdAt || form.createdAt || nowIso,
    created_at: existing?.createdAt || form.createdAt || nowIso,
    updatedAt: nowIso,
    updated_at: nowIso,
  };
  const forms = existing
    ? bundle.forms.map((candidate) =>
        candidate.id === nextForm.id ? nextForm : candidate,
      )
    : [...bundle.forms, nextForm];
  const saved = await saveOnlineFormBundle(organizationId, {
    ...bundle,
    forms,
  });

  return {
    bundle: saved,
    form:
      saved.forms.find((candidate) => candidate.id === nextForm.id) || nextForm,
  };
};

export const updateOnlineFormStatus = async (
  organizationId: string,
  formId: string,
  status: OnlineForm["status"],
) => {
  const bundle = await loadOnlineFormBundle(organizationId);
  const nowIso = new Date().toISOString();
  const forms = bundle.forms.map((form) =>
    form.id === formId
      ? {
          ...form,
          status,
          updatedAt: nowIso,
          updated_at: nowIso,
        }
      : form,
  );
  const saved = await saveOnlineFormBundle(organizationId, {
    ...bundle,
    forms,
  });

  return {
    bundle: saved,
    form: saved.forms.find((form) => form.id === formId) || null,
  };
};

export const duplicateOnlineForm = async (
  organizationId: string,
  formId: string,
) => {
  const bundle = await loadOnlineFormBundle(organizationId);
  const source = bundle.forms.find((form) => form.id === formId);
  if (!source) {
    throw new Error("Modulo non trovato");
  }

  const nowIso = new Date().toISOString();
  const id = randomUUID();
  const duplicated: OnlineForm = {
    ...source,
    id,
    title: `${source.title} - copia`,
    status: "draft",
    publicSlug: buildUniquePublicSlug(`${source.title} copia`, bundle.forms, id),
    public_slug: buildUniquePublicSlug(`${source.title} copia`, bundle.forms, id),
    createdAt: nowIso,
    created_at: nowIso,
    updatedAt: nowIso,
    updated_at: nowIso,
    fields: source.fields.map((field) => ({
      ...field,
      id: randomUUID(),
    })),
  };
  const saved = await saveOnlineFormBundle(organizationId, {
    ...bundle,
    forms: [...bundle.forms, duplicated],
  });

  return {
    bundle: saved,
    form: saved.forms.find((form) => form.id === duplicated.id) || duplicated,
  };
};

export const updateOnlineFormSubmissionStatus = async (
  organizationId: string,
  submissionId: string,
  status: OnlineFormSubmissionStatus,
) => {
  const bundle = await loadOnlineFormBundle(organizationId);
  const submissions = bundle.submissions.map((submission) =>
    submission.id === submissionId
      ? {
          ...submission,
          status,
        }
      : submission,
  );
  const saved = await saveOnlineFormBundle(organizationId, {
    ...bundle,
    submissions,
  });

  return {
    bundle: saved,
    submission:
      saved.submissions.find((submission) => submission.id === submissionId) ||
      null,
  };
};

export const appendOnlineFormSubmission = async (
  organizationId: string,
  submission: OnlineFormSubmission,
) => {
  const bundle = await loadOnlineFormBundle(organizationId);
  const saved = await saveOnlineFormBundle(organizationId, {
    ...bundle,
    submissions: [
      ...bundle.submissions,
      normalizeOnlineFormSubmission(submission, organizationId),
    ],
  });

  return {
    bundle: saved,
    submission:
      saved.submissions.find((candidate) => candidate.id === submission.id) ||
      submission,
  };
};

export const findPublicOnlineFormBySlug = async (
  publicSlug: string,
): Promise<PublicOnlineFormMatch | null> => {
  const pattern = JSON.stringify([
    {
      type: "online_form",
      publicSlug,
    },
  ]);

  const rows = await prisma.$queryRaw<ClubFormRow[]>`
    SELECT id, name, logo_url, contact_email, creator_id, document_templates
    FROM clubs
    WHERE document_templates @> ${pattern}::jsonb
    LIMIT 1
  `;

  const row = rows[0];
  if (!row) return null;

  const form =
    splitOnlineFormBundle(row.document_templates, row.id).forms.find(
      (candidate) => candidate.publicSlug === publicSlug,
    ) || null;

  if (!form) return null;

  return {
    club: row,
    form,
  };
};

export const savePublicOnlineFormSubmission = async ({
  form,
  submission,
}: {
  form: OnlineForm;
  submission: OnlineFormSubmission;
}) => {
  return appendOnlineFormSubmission(form.organizationId, submission);
};

export const getSubmissionsForForm = async (
  organizationId: string,
  formId: string,
) => {
  const items = await loadDocumentTemplateItems(organizationId);
  return getOnlineFormSubmissionsFromClub(items, organizationId, formId);
};

export const getDocumentTemplatesOnly = async (organizationId: string) => {
  const items = await loadDocumentTemplateItems(organizationId);
  return getDocumentTemplatesFromClub(items);
};
