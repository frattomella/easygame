import { NextResponse } from "next/server";
import { canManageClubConfiguration } from "@/lib/access-roles";
import {
  requireAuthenticatedUser,
  resolveOrganizationScopeForUser,
} from "@/lib/server/auth";
import { isPlatformAdminUser } from "@/lib/platform-admin";
import { AUDIT_ACTIONS, recordAuditEvent } from "@/lib/server/audit";
import {
  isValidationError,
  parseInput,
  validationErrorPayload,
} from "@/lib/validation";
import { fiscalProfileInputSchema } from "@/lib/validation/schemas";
import { getFiscalProfile, saveFiscalProfile } from "@/lib/server/fiscal-config";
import {
  LEGAL_FORM_DEFINITIONS,
  SPECIAL_REGIME_LABELS,
  TAX_REGIME_CODES,
} from "@/lib/fiscal/legal-forms";
import {
  missingForEInvoicing,
  missingForInvoicing,
} from "@/lib/fiscal/fiscal-profile";

/**
 * Il **profilo fiscale** di una societa.
 *
 *   GET /api/v1/fiscal/profile?organization_id=…
 *   PUT /api/v1/fiscal/profile
 *
 * **Questo dominio e del club, e la differenza conta.** Le condizioni
 * commerciali di EasyGame le decide Cedi Soft e vivono altrove; il proprio
 * regime fiscale lo dichiara la societa, e nessuno puo dichiararlo al posto
 * suo. Un amministratore di piattaforma **legge** qualunque profilo — e cio
 * che gli permette di assistere — ma la scrittura resta di chi risponde di
 * quel che c'e scritto.
 *
 * La lettura porta con se anche i **vocabolari** (forme giuridiche, regimi,
 * codici) perche il modulo che li mostra non li ricostruisca a mano: un elenco
 * di regimi fiscali duplicato nel client e un elenco che diverge al primo
 * aggiornamento.
 */

export const runtime = "nodejs";

const unauthorized = () =>
  NextResponse.json(
    { data: null, error: { message: "Accesso negato: sessione assente" } },
    { status: 401 },
  );

const failure = (error: any, fallback: string) => {
  if (isValidationError(error)) {
    return NextResponse.json(validationErrorPayload(error), { status: 400 });
  }

  const message = String(error?.message || fallback);
  const status = message.includes("Accesso negato")
    ? 403
    : message.includes("non trovato")
      ? 404
      : 400;

  return NextResponse.json(
    {
      data: null,
      error: { message, ...(error?.issues ? { issues: error.issues } : {}) },
    },
    { status },
  );
};

const resolveOrganization = async (
  request: Request,
  requested: string | null,
) => {
  const session = await requireAuthenticatedUser(request);
  if (!session) return { session: null, organizationId: "", isPlatformAdmin: false };

  const scope = await resolveOrganizationScopeForUser(
    session.db.user_id,
    requested || request.headers.get("x-active-club-id"),
    request.headers.get("x-active-access-role"),
  );

  const organizationId = String(
    requested || scope.activeOrganizationId || "",
  ).trim();

  const isPlatformAdmin = isPlatformAdminUser(session.db.user);

  if (!isPlatformAdmin && !scope.allowedOrganizationIds.includes(organizationId)) {
    throw new Error("Accesso negato: il club non e fra quelli accessibili");
  }


  /*
    **Il permesso, che in questo file non c'era affatto.** Il confine c'era —
    il club dev'essere fra quelli dell'utente, e il ruolo viene risolto per
    **quello** perche `requested` passa come club preferito — ma nessuno
    controllava *cosa* quel ruolo puo fare. Il profilo fiscale finisce sulle
    fatture emesse: partita IVA, forma giuridica, regime. Un genitore poteva
    riscriverlo.
  */
  if (!isPlatformAdmin && !canManageClubConfiguration(scope.activeRole)) {
    throw new Error("Accesso negato per il ruolo attivo");
  }

  return { session, organizationId, isPlatformAdmin };
};

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const { session, organizationId } = await resolveOrganization(
      request,
      url.searchParams.get("organization_id"),
    );

    if (!session) return unauthorized();

    const profile = await getFiscalProfile(organizationId);

    return NextResponse.json({
      data: {
        organizationId,
        profile,
        /*
          Cosa manca, e a quale scopo. Sono due elenchi diversi perche sono due
          domande diverse: una fattura di carta e una fattura elettronica non
          chiedono le stesse cose, e mostrarne una sola farebbe promettere piu
          o meno di quel che si puo.
        */
        missing: {
          forInvoicing: missingForInvoicing(profile),
          forEInvoicing: missingForEInvoicing(profile),
        },
        vocabularies: {
          legalForms: Object.values(LEGAL_FORM_DEFINITIONS),
          taxRegimes: TAX_REGIME_CODES,
          specialRegimes: Object.entries(SPECIAL_REGIME_LABELS).map(
            ([key, label]) => ({ key, label }),
          ),
        },
      },
      error: null,
    });
  } catch (error) {
    return failure(error, "Errore nella lettura del profilo fiscale");
  }
}

export async function PUT(request: Request) {
  try {
    const raw = (await request.json().catch(() => ({}))) as Record<string, any>;
    const { session, organizationId } = await resolveOrganization(
      request,
      raw.organization_id || raw.organizationId || null,
    );

    if (!session) return unauthorized();

    const input = parseInput(fiscalProfileInputSchema, raw);
    const previous = await getFiscalProfile(organizationId);

    const result = await saveFiscalProfile({
      organizationId,
      profile: { ...previous, ...input },
      markCompleted: input.markCompleted,
    });

    /*
      Il profilo fiscale finisce sui documenti: chi lo cambia va tracciato come
      si traccia chi cambia un'anagrafica. Nel metadata i **campi**, non i
      valori: una partita IVA in chiaro dentro un log e un dato in piu che gira
      senza bisogno.
    */
    await recordAuditEvent({
      action: AUDIT_ACTIONS.anagraficaUpdated,
      actorUserId: session.db.user_id,
      actorEmail: session.db.user.email,
      organizationId,
      resource: "fiscal_profile",
      resourceId: organizationId,
      request,
      metadata: { changedFields: Object.keys(input) },
    });

    return NextResponse.json({
      data: {
        profile: result.profile,
        missing: {
          forInvoicing: missingForInvoicing(result.profile),
          forEInvoicing: missingForEInvoicing(result.profile),
        },
      },
      error: null,
    });
  } catch (error) {
    return failure(error, "Errore nel salvataggio del profilo fiscale");
  }
}
