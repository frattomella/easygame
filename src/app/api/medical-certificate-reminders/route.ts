import { NextResponse } from "next/server";
import {
  requireAuthenticatedUser,
  resolveOrganizationScopeForUser,
} from "@/lib/server/auth";
import { prisma } from "@/lib/server/prisma";

const REMINDER_TYPE = "medical_certificate_reminder";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i;

const jsonError = (message: string, status = 400) =>
  NextResponse.json({ data: null, error: { message } }, { status });

const isRecord = (value: unknown): value is Record<string, any> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const asRecord = (value: unknown): Record<string, any> =>
  isRecord(value) ? value : {};

const asArray = <T = any>(value: unknown): T[] =>
  Array.isArray(value) ? (value as T[]) : [];

const firstText = (...values: unknown[]) => {
  for (const value of values) {
    const text = String(value || "").trim();
    if (text) return text;
  }

  return "";
};

const normalizeEmail = (value: unknown) =>
  String(value || "")
    .trim()
    .toLowerCase();

const getGuardianRows = (athlete: any) => {
  const data = asRecord(athlete?.data);
  const guardians = asArray(data.guardians).map((guardian) => {
    const record = asRecord(guardian);
    return {
      linkedUserId: firstText(
        record.linkedUserId,
        record.linked_user_id,
        record.userId,
        record.user_id,
      ),
      linkedUserEmail: firstText(
        record.linkedUserEmail,
        record.linked_user_email,
        record.email,
      ),
    };
  });

  const legacyParents = [data.parent1, data.parent2]
    .filter(Boolean)
    .map((guardian) => {
      const record = asRecord(guardian);
      return {
        linkedUserId: firstText(
          record.linkedUserId,
          record.linked_user_id,
          record.userId,
          record.user_id,
        ),
        linkedUserEmail: firstText(
          record.linkedUserEmail,
          record.linked_user_email,
          record.email,
        ),
      };
    });

  return guardians.length > 0 ? guardians : legacyParents;
};

const getReminderKey = (notification: { data?: any }) => {
  const data = asRecord(notification.data);
  return firstText(data.key, data.reminderKey);
};

const getParentRecipientIds = async (athlete: any) => {
  const guardianRows = getGuardianRows(athlete);
  const linkedIds = guardianRows
    .flatMap((guardian) => [guardian.linkedUserId])
    .filter((value) => UUID_PATTERN.test(value));
  const linkedEmails = Array.from(
    new Set(
      guardianRows
        .map((guardian) => normalizeEmail(guardian.linkedUserEmail))
        .filter(Boolean),
    ),
  );

  const usersByEmail =
    linkedEmails.length > 0
      ? await prisma.user.findMany({
          where: { email: { in: linkedEmails } },
          select: { id: true },
        })
      : [];

  return Array.from(
    new Set(
      linkedIds
        .concat(usersByEmail.map((user) => user.id))
        .filter((value) => UUID_PATTERN.test(value)),
    ),
  );
};

const pickRelevantCertificate = (athlete: any, certificateId?: string) => {
  const certificates = asArray(athlete?.medical_certificates);
  if (certificateId) {
    const exact = certificates.find(
      (certificate: any) => String(certificate?.id || "") === certificateId,
    );
    if (exact) return exact;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const thirtyDaysFromNow = new Date(today);
  thirtyDaysFromNow.setDate(today.getDate() + 30);

  return (
    certificates.find((certificate: any) => {
      const expiryDate = certificate?.expiry_date
        ? new Date(certificate.expiry_date)
        : null;
      return (
        !expiryDate ||
        Number.isNaN(expiryDate.getTime()) ||
        expiryDate <= thirtyDaysFromNow
      );
    }) || null
  );
};

export async function POST(request: Request) {
  const session = await requireAuthenticatedUser(request);
  if (!session) return jsonError("Non autenticato", 401);

  const body = await request.json().catch(() => ({}));
  const athleteId = firstText(body?.athleteId, body?.athlete_id, body?.id);
  const requestedOrganizationId = firstText(
    body?.organizationId,
    body?.organization_id,
    request.headers.get("x-active-club-id"),
    request.headers.get("x-organization-id"),
  );

  if (!UUID_PATTERN.test(athleteId)) {
    return jsonError("Atleta non valido", 400);
  }

  const scope = await resolveOrganizationScopeForUser(
    session.db.user_id,
    requestedOrganizationId,
  );

  if (scope.allowedOrganizationIds.length === 0) {
    return jsonError("Club non disponibile", 403);
  }

  const athlete = await prisma.athlete.findFirst({
    where: {
      id: athleteId,
      organization_id: { in: scope.allowedOrganizationIds },
    },
    include: {
      organization: { select: { id: true, name: true } },
      medical_certificates: { orderBy: { expiry_date: "asc" } },
    },
  });

  if (!athlete) return jsonError("Atleta non appartenente al club", 403);

  const parentUserIds = await getParentRecipientIds(athlete);
  if (parentUserIds.length === 0) {
    return jsonError("Nessun account genitore o tutore collegato", 404);
  }

  const certificate = pickRelevantCertificate(
    athlete,
    firstText(body?.certificateId, body?.certificate_id),
  );
  const certificateKey = certificate?.id || "missing";
  const key = `${REMINDER_TYPE}:${athlete.id}:${certificateKey}`;
  const athleteName =
    [athlete.first_name, athlete.last_name].filter(Boolean).join(" ").trim() ||
    "Atleta";
  const expiryDate = certificate?.expiry_date
    ? certificate.expiry_date.toISOString().slice(0, 10)
    : null;
  const title = "Certificato medico da aggiornare";
  const message = expiryDate
    ? `${athleteName}: certificato ${certificate?.type || "medico"} da verificare entro il ${new Date(expiryDate).toLocaleDateString("it-IT")}.`
    : `${athleteName}: certificato medico mancante o da aggiornare.`;

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const existingNotifications = await prisma.notification.findMany({
    where: {
      organization_id: athlete.organization_id,
      user_id: { in: parentUserIds },
      type: REMINDER_TYPE,
      read: false,
      created_at: { gte: sevenDaysAgo },
    },
    select: { user_id: true, data: true },
  });
  const duplicateUserIds = new Set(
    existingNotifications
      .filter((notification) => getReminderKey(notification) === key)
      .map((notification) => notification.user_id)
      .filter(Boolean) as string[],
  );
  const recipientsToNotify = parentUserIds.filter(
    (userId) => !duplicateUserIds.has(userId),
  );

  if (recipientsToNotify.length > 0) {
    await prisma.notification.createMany({
      data: recipientsToNotify.map((userId) => ({
        organization_id: athlete.organization_id,
        user_id: userId,
        title,
        message,
        type: REMINDER_TYPE,
        read: false,
        data: {
          key,
          reminderKey: key,
          source: "certificate_alerts",
          athleteId: athlete.id,
          athleteName,
          certificateId: certificate?.id || null,
          certificateType: certificate?.type || "Certificato Medico",
          expiryDate,
          actionHref: `/parent-view/${athlete.id}`,
        },
      })),
    });
  }

  return NextResponse.json({
    data: {
      created: recipientsToNotify.length,
      skipped: duplicateUserIds.size,
      recipients: parentUserIds.length,
    },
    error: null,
  });
}
