import { NextResponse } from "next/server";
import { isManagementAccessRole } from "@/lib/access-roles";
import {
  hasHealthPermission,
  stripClinicalAthleteFields,
  stripGuardianAccessTokens,
  stripClinicalCertificateFields,
} from "@/lib/health/permissions";
import {
  requireAuthenticatedUser,
  resolveOrganizationScopeForUser,
} from "@/lib/server/auth";
import { athleteWithinAccessScope } from "@/lib/server/access-scope-query";
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

  /*
    **L'autorizzazione si chiede al risolutore, non si ricostruisce a mano.**

    Qui c'erano tre letture grezze — il club posseduto, le tessere, il primo
    ruolo gestionale trovato — e da quelle si ricavava un «ruolo effettivo». Due
    revisioni ostili hanno mostrato cosa costa avere una seconda risposta alla
    stessa domanda:

    1. **nessun perimetro.** Il perimetro di sede e categoria vive sulla
       **tessera**, e questa rotta la tessera non la risolveva: una segreteria
       perimetrata su una sede leggeva per identificativo qualunque atleta del
       club, con tutto il payload. E la stessa forma che il registro generico ha
       appena chiuso — «un filtro di elenco si aggira passando l'id» — su una
       porta che il registro non attraversa;
    2. **nessuna chiave.** `ruoloEffettivo` era lo **slug** letto
       dall'archivio, che non porta le chiavi di un ruolo personalizzato:
       `hasHealthPermission` rispondeva percio sempre `false`, e un club che
       avesse concesso `clinical.read` a un ruolo personalizzato se lo vedeva
       negare solo qui. Sbagliava nel verso prudente, ma nell'altro verso la
       stessa confusione sarebbe stata un buco.

    `resolveOrganizationScopeForUser` risponde a entrambe: risolve il ruolo
    **con** le sue chiavi, riconosce il proprietario anche senza tessera — che
    e la ragione per cui il blocco precedente esisteva — e porta il perimetro.
  */
  const scope = await resolveOrganizationScopeForUser(
    session.db.user_id,
    athlete.organization_id,
    request.headers.get("x-active-access-role"),
  );

  const managementAccess =
    scope.activeOrganizationId === athlete.organization_id &&
    isManagementAccessRole(scope.activeRole);

  if (!directAthleteAccess && !managementAccess) {
    return NextResponse.json(
      { data: null, error: { message: "Accesso atleta non autorizzato" } },
      { status: 403 },
    );
  }

  /*
    **E il perimetro vale anche qui**, perche questa e una lettura per
    identificativo: chi ha un perimetro di sede o categoria non deve leggere di
    qui l'atleta che l'elenco gli nasconde. Chi entra per **legame** — l'atleta
    sul proprio fascicolo — non ha perimetro e non ci passa.
  */
  if (!directAthleteAccess) {
    const dentro = await athleteWithinAccessScope(
      athlete.organization_id,
      athlete.id,
      scope,
    );
    if (!dentro) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message:
              "Accesso negato: questa persona e fuori dal perimetro di sede o categoria dell'accesso",
          },
        },
        { status: 403 },
      );
    }
  }

  const ruoloEffettivo = scope.activeRole;

  const contenutoClinicoConsentito =
    directAthleteAccess || hasHealthPermission(ruoloEffettivo, "clinical.read");

  const certificati = athlete.medical_certificates.map((certificato) =>
    contenutoClinicoConsentito
      ? certificato
      : stripClinicalCertificateFields(certificato as Record<string, any>),
  );

  const anagrafica = contenutoClinicoConsentito
    ? athlete
    : {
        ...athlete,
        data: stripClinicalAthleteFields(athlete.data),
      };

  /*
    **La credenziale del tutore non esce da qui, e non e questione di ruolo.**

    Il taglio applicato sopra e solo quello **clinico**: il gettone con cui un
    tutore si collega non e un dato sanitario, quindi passava. Misurato: un
    collaboratore riceveva 200 e il gettone nel corpo.

    E chi raccoglie quel gettone si lega come tutore, ottenendo **per legame**
    il fascicolo clinico completo — cioe esattamente cio che il taglio qui
    sopra gli nega. Il difetto non era nel taglio: era nell'aver protetto una
    porta sola.
  */
  const anagraficaSenzaCredenziali = {
    ...anagrafica,
    data: stripGuardianAccessTokens(anagrafica.data),
  };

  return NextResponse.json({
    data: {
      athlete: { ...anagraficaSenzaCredenziali, medical_certificates: certificati },
      certificates: certificati,
      categoryMemberships: athlete.category_memberships,
    },
    error: null,
  });
}
