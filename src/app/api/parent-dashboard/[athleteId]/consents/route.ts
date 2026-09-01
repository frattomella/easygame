import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/server/auth";
import { canParentAccessAthlete } from "@/lib/server/parent-dashboard";
import { prisma } from "@/lib/server/prisma";
import {
  listConsentStates,
  recordConsentDecision,
} from "@/lib/server/consents";
import { AUDIT_ACTIONS, recordAuditEvent } from "@/lib/server/audit";

type Context = { params: { athleteId: string } };

/**
 * **I consensi che la famiglia puo accettare e revocare da se.**
 *
 * Fino alla Wave 5 la famiglia **non poteva decidere niente**: ogni consenso lo
 * registrava la segreteria «con un foglio in mano», e un genitore che cambiava
 * idea su una fotografia doveva telefonare. Il registro c'era, il testo
 * versionato c'era, la derivazione dello stato c'era (ADR-0090): mancava
 * l'unico soggetto che quella decisione la prende davvero.
 *
 * **Il gate e il legame, non il ruolo.** Un tutore puo non avere nessuna
 * membership, quindi un permesso di ruolo lo terrebbe fuori dalla propria area;
 * e il legame lo verifica il **dominio**, non questa rotta, perche una rotta
 * nuova non deve poterlo dimenticare (ADR-0094).
 *
 * **L'evidenza di rete e la riga di audit.** L'evidenza di un consenso e un
 * puntatore e non una copia: qui il puntatore e la riga che
 * `recordAuditEvent` scrive con indirizzo e user agent, e che cita
 * l'identificativo della decisione. Copiare l'indirizzo IP dentro il registro
 * dei consensi vorrebbe dire tenerlo in due posti con due politiche di
 * conservazione diverse.
 */

const errorStatus = (error: any) =>
  String(error?.message || "").includes("Accesso negato") ? 403 : 400;

const scopeFor = async (userId: string, athleteId: string) => {
  const athlete = await prisma.athlete.findUnique({
    where: { id: athleteId },
    select: { id: true, organization_id: true, first_name: true, last_name: true },
  });
  if (!athlete) throw new Error("Atleta non trovato");

  return {
    scope: {
      userId,
      activeOrganizationId: athlete.organization_id,
      /*
        `null` di proposito: cosi ogni controllo di **ruolo** risponde «no», e
        l'unica strada che resta aperta e il legame.
      */
      activeRole: null as string | null,
      allowedOrganizationIds: [athlete.organization_id],
    },
    athlete,
  };
};

export async function GET(request: Request, context: Context) {
  try {
    const session = await requireAuthenticatedUser(request);
    if (!session) {
      return NextResponse.json(
        { data: [], error: { message: "Sessione non valida" } },
        { status: 401 },
      );
    }

    const athleteId = String(context.params.athleteId || "").trim();
    if (!(await canParentAccessAthlete(session.db.user_id, athleteId))) {
      return NextResponse.json(
        {
          data: [],
          error: { message: "Accesso negato: atleta non collegato" },
        },
        { status: 403 },
      );
    }

    const { scope } = await scopeFor(session.db.user_id, athleteId);
    const stati = await listConsentStates(scope, {
      subjectKind: "athlete",
      subjectId: athleteId,
      asSubject: { userId: session.db.user_id, athleteId },
    });

    return NextResponse.json({ data: stati, error: null });
  } catch (error: any) {
    return NextResponse.json(
      {
        data: [],
        error: { message: error?.message || "Errore lettura consensi" },
      },
      { status: errorStatus(error) },
    );
  }
}

export async function POST(request: Request, context: Context) {
  try {
    const session = await requireAuthenticatedUser(request);
    if (!session) {
      return NextResponse.json(
        { data: null, error: { message: "Sessione non valida" } },
        { status: 401 },
      );
    }

    const athleteId = String(context.params.athleteId || "").trim();
    const body = await request.json().catch(() => ({}));
    const definitionId = String(body?.definitionId || body?.definition_id || "").trim();
    const status = String(body?.status || "").trim().toLowerCase();

    const { scope, athlete } = await scopeFor(session.db.user_id, athleteId);

    const esito = await recordConsentDecision(scope, {
      definitionId,
      subjectKind: "athlete",
      subjectId: athleteId,
      subjectLabel:
        [athlete.first_name, athlete.last_name].filter(Boolean).join(" ") ||
        null,
      status,
      source: "subject",
      note: String(body?.note || "").trim() || null,
      asSubject: { userId: session.db.user_id, athleteId },
    });

    await recordAuditEvent({
      action: AUDIT_ACTIONS.consentDecisionRecorded,
      actorUserId: session.db.user_id,
      actorEmail: session.db.user.email,
      actorRole: "parent",
      organizationId: athlete.organization_id,
      resource: "consent_records",
      resourceId: esito.record.id,
      request,
      metadata: { source: "subject", status },
    });

    return NextResponse.json({ data: esito, error: null });
  } catch (error: any) {
    return NextResponse.json(
      {
        data: null,
        error: { message: error?.message || "Errore registrazione consenso" },
      },
      { status: errorStatus(error) },
    );
  }
}
