import { NextResponse, type NextRequest } from "next/server";
import {
  requireAuthenticatedUser,
  resolveOrganizationScopeForUser,
} from "@/lib/server/auth";
import { prisma } from "@/lib/server/prisma";
import { sendNotificationEmails } from "@/lib/server/email/email-service";
import {
  buildReminderKey,
  createReminderNotifications,
  findAlreadyNotifiedRecipients,
  getReminderWindowStart,
  pickRelevantCertificate,
  resolveGuardianRecipientIds,
  runMedicalCertificateRemindersForAllClubs,
  UUID_PATTERN,
} from "@/lib/server/medical-certificate-reminders";

/**
 * I promemoria sui certificati medici.
 *
 *   POST /api/medical-certificate-reminders   — a mano, su un atleta
 *   GET  /api/medical-certificate-reminders   — da cron, su tutti i club
 *
 * **Le due porte esistono entrambe di proposito.** Il `POST` serve a chi, in
 * segreteria, vuole sollecitare **quella** famiglia adesso, e passa dai
 * permessi come ogni altra rotta. Il `GET` e quello che invoca Vercel Cron,
 * non ha un attore e per questo si autentica con `CRON_SECRET` — la stessa
 * convenzione del giro del lavoro sportivo e dell'automazione allenamenti.
 *
 * **Le regole stanno in `src/lib/server/medical-certificate-reminders.ts`**,
 * non qui: la deduplica scritta due volte sarebbe due deduplica diverse dopo
 * la prima modifica. Le due porte usano le stesse funzioni con parametri
 * diversi, e le differenze sono dichiarate li:
 *
 *   - il `POST` non filtra i destinatari per club, il giro automatico si:
 *     e la rotta a mano, e il suo comportamento non lo cambia il cron;
 *   - il `POST` guarda solo le notifiche non lette, il giro automatico tutte.
 *     Per una persona un promemoria letto e ignorato merita un sollecito; per
 *     un cron sarebbe un doppione ogni notte.
 */

const jsonError = (message: string, status = 400) =>
  NextResponse.json({ data: null, error: { message } }, { status });

const firstText = (...values: unknown[]) => {
  for (const value of values) {
    const text = String(value || "").trim();
    if (text) return text;
  }

  return "";
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

  const parentUserIds = await resolveGuardianRecipientIds(athlete);
  if (parentUserIds.length === 0) {
    return jsonError("Nessun account genitore o tutore collegato", 404);
  }

  const certificate = pickRelevantCertificate(
    athlete,
    firstText(body?.certificateId, body?.certificate_id),
  );
  const key = buildReminderKey(athlete.id, certificate?.id);

  const duplicateUserIds = await findAlreadyNotifiedRecipients({
    organizationId: athlete.organization_id,
    userIds: parentUserIds,
    key,
    since: getReminderWindowStart(new Date()),
    onlyUnread: true,
  });
  const recipientsToNotify = parentUserIds.filter(
    (userId) => !duplicateUserIds.has(userId),
  );

  if (recipientsToNotify.length > 0) {
    await createReminderNotifications({
      organizationId: athlete.organization_id,
      athlete,
      certificate,
      key,
      recipientIds: recipientsToNotify,
    });
    await sendNotificationEmails(recipientsToNotify);
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

export async function GET(request: NextRequest) {
  const cronSecret = String(process.env.CRON_SECRET || "").trim();
  const authHeader = request.headers.get("authorization");

  if (cronSecret) {
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json(
        { data: null, error: { message: "Accesso negato: cron non autenticato" } },
        { status: 401 },
      );
    }
  } else if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      {
        data: null,
        error: {
          message:
            "CRON_SECRET non configurato. Imposta la variabile ambiente prima di esporre il giro automatico dei promemoria.",
        },
      },
      { status: 503 },
    );
  }

  try {
    const report = await runMedicalCertificateRemindersForAllClubs(new Date());

    return NextResponse.json({ data: report, error: null });
  } catch (error: any) {
    return NextResponse.json(
      {
        data: null,
        error: {
          message:
            error?.message ||
            "Errore durante il giro dei promemoria sui certificati medici",
        },
      },
      { status: 500 },
    );
  }
}
