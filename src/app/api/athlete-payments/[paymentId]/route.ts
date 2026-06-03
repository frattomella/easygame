import { NextResponse } from "next/server";
import {
  requireAuthenticatedUser,
  resolveOrganizationScopeForUser,
} from "@/lib/server/auth";
import { prisma } from "@/lib/server/prisma";
import {
  isPaymentExcludedFromTotals,
  isPaymentPaidLike,
} from "@/lib/payments/payment-status-utils";

type Context = {
  params: {
    paymentId: string;
  };
};

const asRecord = (value: unknown): Record<string, any> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {};

const asDateOrNull = (value: unknown) => {
  const raw = String(value || "").trim();
  if (!raw) return null;

  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
};

const toAmount = (value: unknown) => {
  const parsed =
    typeof value === "number"
      ? value
      : Number.parseFloat(String(value || "").replace(",", "."));
  return Number.isFinite(parsed) ? Number(parsed.toFixed(2)) : NaN;
};

const verifyClubPin = async (organizationId: string, pin: unknown) => {
  const club = await prisma.club.findUnique({
    where: { id: organizationId },
    select: { payment_pin: true },
  });
  const expectedPin = String(club?.payment_pin || "1234").trim();
  return Boolean(expectedPin) && String(pin || "").trim() === expectedPin;
};

const jsonError = (message: string, status = 400) =>
  NextResponse.json({ data: null, error: { message } }, { status });

export async function PATCH(request: Request, context: Context) {
  try {
    const session = await requireAuthenticatedUser(request);
    if (!session) {
      return jsonError("Sessione non valida", 401);
    }

    const payment = await prisma.athletePayment.findUnique({
      where: { id: context.params.paymentId },
    });
    if (!payment) {
      return jsonError("Pagamento non trovato", 404);
    }

    const scope = await resolveOrganizationScopeForUser(
      session.db.user_id,
      request.headers.get("x-active-club-id"),
    );
    if (!scope.allowedOrganizationIds.includes(payment.organization_id)) {
      return jsonError("Accesso negato al pagamento", 403);
    }

    const body = await request.json().catch(() => ({}));
    if (!(await verifyClubPin(payment.organization_id, body?.pin))) {
      return jsonError("PIN non corretto", 403);
    }

    const action = String(body?.action || "update").trim();
    const currentData = asRecord(payment.data);
    const now = new Date();
    const auditBase = {
      actorUserId: session.db.user_id,
      at: now.toISOString(),
      action,
    };

    if (isPaymentExcludedFromTotals(payment)) {
      return jsonError("Il pagamento e gia annullato");
    }

    if (action === "update") {
      if (isPaymentPaidLike(payment)) {
        return jsonError("I pagamenti gia pagati non possono essere modificati");
      }

      const updates = asRecord(body?.updates);
      const amount = toAmount(updates.amount);
      if (!Number.isFinite(amount) || amount <= 0) {
        return jsonError("Importo non valido");
      }

      const status = String(updates.status || payment.status || "pending").trim();
      const normalizedStatus = status.toLowerCase();
      const nextPaidAt =
        normalizedStatus === "paid" ||
        normalizedStatus === "pagato" ||
        normalizedStatus === "saldato"
          ? payment.paid_at || now
          : null;

      const updated = await prisma.athletePayment.update({
        where: { id: payment.id },
        data: {
          description:
            String(updates.description || "").trim() || payment.description,
          amount,
          due_date: asDateOrNull(updates.dueDate),
          status,
          method: String(updates.method || payment.method || "").trim() || null,
          notes: String(updates.notes || "").trim() || null,
          paid_at: nextPaidAt,
          data: {
            ...currentData,
            updatedWithPinAt: now.toISOString(),
            updatedBy: session.db.user_id,
            audit: [
              ...(Array.isArray(currentData.audit) ? currentData.audit : []),
              {
                ...auditBase,
                before: {
                  description: payment.description,
                  amount: payment.amount,
                  dueDate: payment.due_date?.toISOString() || null,
                  status: payment.status,
                  notes: payment.notes || null,
                },
              },
            ],
          },
        },
      });

      return NextResponse.json({ data: updated, error: null });
    }

    if (action === "delete") {
      if (isPaymentPaidLike(payment)) {
        return jsonError(
          "I pagamenti pagati non possono essere eliminati: annullali invece",
        );
      }

      const updated = await prisma.athletePayment.update({
        where: { id: payment.id },
        data: {
          status: "cancelled",
          data: {
            ...currentData,
            deletedAt: now.toISOString(),
            deletedBy: session.db.user_id,
            deletionReason:
              String(body?.reason || "").trim() ||
              "Pagamento eliminato dallo storico atleta",
            originalStatus: payment.status,
            originalPaidAt: payment.paid_at?.toISOString() || null,
            originalAmount: payment.amount,
            excludedFromTotals: true,
            audit: [
              ...(Array.isArray(currentData.audit) ? currentData.audit : []),
              auditBase,
            ],
          },
        },
      });

      return NextResponse.json({ data: updated, error: null });
    }

    if (action === "cancel") {
      const updated = await prisma.athletePayment.update({
        where: { id: payment.id },
        data: {
          status: "cancelled",
          data: {
            ...currentData,
            cancelledAt: now.toISOString(),
            cancelledBy: session.db.user_id,
            cancellationReason:
              String(body?.reason || "").trim() ||
              "Pagamento annullato dallo storico atleta",
            originalStatus: payment.status,
            originalPaidAt: payment.paid_at?.toISOString() || null,
            originalAmount: payment.amount,
            excludedFromTotals: true,
            audit: [
              ...(Array.isArray(currentData.audit) ? currentData.audit : []),
              auditBase,
            ],
          },
        },
      });

      return NextResponse.json({ data: updated, error: null });
    }

    return jsonError("Azione pagamento non supportata");
  } catch (error: any) {
    return jsonError(error?.message || "Errore aggiornamento pagamento", 500);
  }
}
