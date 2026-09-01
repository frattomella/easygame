import { NextResponse } from "next/server";
import { isManagementAccessRole } from "@/lib/access-roles";
import {
  hasHealthPermission,
  stripClinicalAthleteFields,
  stripClinicalCertificateFields,
} from "@/lib/health/permissions";
import { requireAuthenticatedUser } from "@/lib/server/auth";
import { prisma } from "@/lib/server/prisma";

type Context = {
  params: { athleteId: string };
};

/**
 * **La porta clinica che non proiettava** (W6-34).
 *
 * Questa rotta restituiva `athlete` e `medical_certificates` **interi**, ed era
 * l'unica lettura di certificati del prodotto a non passare da
 * `stripClinicalAthleteFields` / `stripClinicalCertificateFields`. Il taglio
 * che la Wave 5 ha imposto ovunque — chi vede lo **stato** del certificato non
 * vede per cio stesso il **contenuto** clinico — qui semplicemente non c'era:
 * allergie, patologie, farmaci, gruppo sanguigno, BLSD e il file del
 * certificato uscivano a chiunque avesse un ruolo gestionale, compresi quelli
 * che la matrice del dominio sanitario esclude.
 *
 * **Il legame vale piu del ruolo, e resta intatto.** L'atleta che legge il
 * proprio fascicolo — `directAthleteAccess` — non passa dalla proiezione: e la
 * regola scritta in `src/lib/health/permissions.ts`, «un genitore e un atleta
 * leggono il proprio fascicolo per legame». Chi guarda il fascicolo **di
 * qualcun altro** passa da `clinical.read`, e chi non ce l'ha riceve lo stato
 * e la data di scadenza, che sono la risposta a «puo scendere in campo».
 */
export async function GET(request: Request, context: Context) {
  const session = await requireAuthenticatedUser(request);
  if (!session) {
    return NextResponse.json(
      { data: null, error: { message: "Sessione non valida" } },
      { status: 401 },
    );
  }

  const athlete = await prisma.athlete.findUnique({
    where: { id: context.params.athleteId },
    include: {
      category_memberships: true,
      medical_certificates: true,
    },
  });

  if (!athlete) {
    return NextResponse.json(
      { data: null, error: { message: "Atleta non trovato" } },
      { status: 404 },
    );
  }

  const directAthleteAccess = athlete.user_id === session.db.user_id;
  const ownsClub = await prisma.club.findFirst({
    where: {
      id: athlete.organization_id,
      creator_id: session.db.user_id,
    },
    select: { id: true },
  });
  const memberships = await prisma.organizationUser.findMany({
    where: {
      organization_id: athlete.organization_id,
      user_id: session.db.user_id,
    },
    select: { role: true },
  });
  const managementAccess =
    Boolean(ownsClub) ||
    memberships.some((membership) => isManagementAccessRole(membership.role));

  if (!directAthleteAccess && !managementAccess) {
    return NextResponse.json(
      { data: null, error: { message: "Accesso atleta non autorizzato" } },
      { status: 403 },
    );
  }

  /*
    Il proprietario del club non ha sempre una riga di membership — puo averne
    zero — e in quel caso il ruolo effettivo su questa lettura e `owner`.
    Risolverlo qui e non fidarsi della prima membership trovata evita che un
    proprietario senza tessera perda il contenuto del proprio fascicolo.
  */
  const ruoloEffettivo = ownsClub
    ? "owner"
    : memberships.find((membership) =>
        isManagementAccessRole(membership.role),
      )?.role || null;

  const contenutoClinicoConsentito =
    directAthleteAccess || hasHealthPermission(ruoloEffettivo, "clinical.read");

  const certificati = athlete.medical_certificates.map((certificato) =>
    contenutoClinicoConsentito
      ? certificato
      : stripClinicalCertificateFields(certificato as Record<string, any>),
  );

  const anagrafica = contenutoClinicoConsentito
    ? athlete
    : { ...athlete, data: stripClinicalAthleteFields(athlete.data) };

  return NextResponse.json({
    data: {
      athlete: { ...anagrafica, medical_certificates: certificati },
      certificates: certificati,
      categoryMemberships: athlete.category_memberships,
    },
    error: null,
  });
}
