import { NextResponse } from "next/server";
import {
  requireAuthenticatedUser,
  resolveOrganizationScopeForUser,
} from "@/lib/server/auth";
import { prisma } from "@/lib/server/prisma";
import { sendNotificationEmails } from "@/lib/server/email/email-service";
import { isTrainerAccessRole } from "@/lib/access-roles";

const TRAINER_OPERATIONAL_NOTIFICATION_TYPES = [
  "missing_attendance",
  "missing_convocations",
];

const normalizeAlert = (alert: any) => {
  const key = String(alert?.key || "").trim();
  const type = String(alert?.type || "").trim();
  const title = String(alert?.title || "").trim();
  const message = String(alert?.message || "").trim();

  if (
    !key ||
    !title ||
    !message ||
    !TRAINER_OPERATIONAL_NOTIFICATION_TYPES.includes(type)
  ) {
    return null;
  }

  return {
    key,
    type,
    title,
    message,
    recordId: String(alert?.recordId || "").trim(),
    actionHref: String(alert?.actionHref || "").trim(),
  };
};

const getNotificationKey = (notification: { data?: any }) => {
  const data =
    notification?.data && typeof notification.data === "object"
      ? notification.data
      : {};

  return String(data.key || data.notificationKey || "").trim();
};

export async function POST(request: Request) {
  const session = await requireAuthenticatedUser(request);
  if (!session) {
    return NextResponse.json(
      { data: null, error: { message: "Non autenticato" } },
      { status: 401 },
    );
  }

  const requestedOrganizationId =
    request.headers.get("x-active-club-id") ||
    request.headers.get("x-organization-id");
  const scope = await resolveOrganizationScopeForUser(
    session.db.user.id,
    requestedOrganizationId,
    request.headers.get("x-active-access-role"),
  );

  if (!scope.activeOrganizationId || !isTrainerAccessRole(scope.activeRole)) {
    return NextResponse.json(
      { data: null, error: { message: "Accesso allenatore non autorizzato" } },
      { status: 403 },
    );
  }

  const payload = await request.json().catch(() => ({}));
  const rawAlerts: unknown[] = Array.isArray(payload?.alerts)
    ? payload.alerts
    : [];
  const alerts = rawAlerts
    .map(normalizeAlert)
    .filter((alert): alert is NonNullable<ReturnType<typeof normalizeAlert>> =>
      Boolean(alert),
    );
  const activeKeys = new Set(alerts.map((alert) => alert.key));

  const existingNotifications = await prisma.notification.findMany({
    where: {
      organization_id: scope.activeOrganizationId,
      user_id: session.db.user.id,
      type: { in: TRAINER_OPERATIONAL_NOTIFICATION_TYPES },
    },
    orderBy: { created_at: "asc" },
  });

  const existingByKey = new Map<
    string,
    (typeof existingNotifications)[number]
  >();

  for (const notification of existingNotifications) {
    const key = getNotificationKey(notification);
    if (!key) {
      continue;
    }

    if (!existingByKey.has(key)) {
      existingByKey.set(key, notification);
      continue;
    }

    await prisma.notification.update({
      where: { id: notification.id },
      data: {
        read: true,
        data: {
          ...(notification.data && typeof notification.data === "object"
            ? notification.data
            : {}),
          resolved: true,
          resolvedAt: new Date().toISOString(),
          duplicate: true,
        },
      },
    });
  }

  for (const alert of alerts) {
    const existing = existingByKey.get(alert.key);
    const data = {
      key: alert.key,
      recordId: alert.recordId,
      actionHref: alert.actionHref,
      resolved: false,
    };

    if (existing) {
      await prisma.notification.update({
        where: { id: existing.id },
        data: {
          title: alert.title,
          message: alert.message,
          type: alert.type,
          read: false,
          data,
        },
      });
      continue;
    }

    await prisma.notification.create({
      data: {
        organization_id: scope.activeOrganizationId,
        user_id: session.db.user.id,
        title: alert.title,
        message: alert.message,
        type: alert.type,
        read: false,
        data,
      },
    });
    await sendNotificationEmails([session.db.user.id]);
  }

  for (const notification of existingNotifications) {
    const key = getNotificationKey(notification);
    if (!key || activeKeys.has(key)) {
      continue;
    }

    await prisma.notification.update({
      where: { id: notification.id },
      data: {
        read: true,
        data: {
          ...(notification.data && typeof notification.data === "object"
            ? notification.data
            : {}),
          resolved: true,
          resolvedAt: new Date().toISOString(),
        },
      },
    });
  }

  return NextResponse.json({
    data: {
      synced: alerts.length,
    },
    error: null,
  });
}
