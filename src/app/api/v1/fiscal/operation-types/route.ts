import { NextResponse } from "next/server";
import {
  requireAuthenticatedUser,
  resolveOrganizationScopeForUser,
} from "@/lib/server/auth";
import { isPlatformAdminUser } from "@/lib/platform-admin";
import {
  isValidationError,
  parseInput,
  validationErrorPayload,
} from "@/lib/validation";
import {
  documentSeriesInputSchema,
  fiscalOperationTypeActionSchema,
  fiscalOperationTypeInputSchema,
} from "@/lib/validation/schemas";
import {
  deleteOperationType,
  listDocumentSeries,
  listOperationTypes,
  saveDocumentSeries,
  saveOperationType,
  setOperationTypeActive,
} from "@/lib/server/fiscal-config";
import {
  ACTIVITY_SCOPE_LABELS,
  DIRECTION_HINT_LABELS,
  DOCUMENT_ROUTE_LABELS,
} from "@/lib/fiscal/operation-types";
import {
  assertAccountingPermission,
  hasAccountingPermission,
} from "@/lib/accounting/permissions";

/**
 * La **classificazione delle operazioni** e le **serie di numerazione** di una
 * societa.
 *
 *   GET  /api/v1/fiscal/operation-types?organization_id=…
 *   PUT  /api/v1/fiscal/operation-types      un tipo di operazione
 *   POST /api/v1/fiscal/operation-types      una serie di numerazione
 *
 * **Perche le serie stanno su questa rotta e non su una loro.** Perche si
 * configurano nella stessa schermata e nello stesso momento — «per le
 * sponsorizzazioni emetto fattura, in serie SPO» e una frase sola — e due
 * rotte avrebbero voluto dire due letture per disegnare un pannello.
 *
 * La lettura semina il catalogo iniziale al primo accesso: nove voci che sono
 * un punto di partenza, non una conclusione fiscale. Vedi ADR-0052.
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

  return NextResponse.json({ data: null, error: { message } }, { status });
};

const resolveOrganization = async (
  request: Request,
  requested: string | null,
) => {
  const session = await requireAuthenticatedUser(request);
  if (!session) return { session: null, organizationId: "", activeRole: null };

  const scope = await resolveOrganizationScopeForUser(
    session.db.user_id,
    requested || request.headers.get("x-active-club-id"),
    request.headers.get("x-active-access-role"),
  );

  const organizationId = String(
    requested || scope.activeOrganizationId || "",
  ).trim();

  if (
    !isPlatformAdminUser(session.db.user) &&
    !scope.allowedOrganizationIds.includes(organizationId)
  ) {
    throw new Error("Accesso negato: il club non e fra quelli accessibili");
  }

  return { session, organizationId, activeRole: scope.activeRole };
};

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const { session, organizationId, activeRole } = await resolveOrganization(
      request,
      url.searchParams.get("organization_id"),
    );

    if (!session) return unauthorized();

    /*
      Leggere le causali e lavoro di segreteria: senza l'elenco non si registra
      un movimento, e la causale sul movimento manuale e obbligatoria.
      **Modificarle no**: cambiarne la classificazione cambia la natura fiscale
      di cio che si registrera dopo, ed e configurazione societaria.
    */
    assertAccountingPermission(activeRole, "accounting.read");
    const canManage = hasAccountingPermission(
      activeRole,
      "accounting.causes_manage",
    );

    const [operationTypes, receiptSeries, invoiceSeries] = await Promise.all([
      listOperationTypes(organizationId),
      listDocumentSeries({ organizationId, kind: "receipt" }),
      listDocumentSeries({ organizationId, kind: "invoice" }),
    ]);

    return NextResponse.json({
      data: {
        organizationId,
        operationTypes,
        series: { receipt: receiptSeries, invoice: invoiceSeries },
        /*
          La superficie riceve **il permesso**, e non lo deduce dal ruolo: un
          pulsante che si vede e poi risponde 403 e un difetto quanto una porta
          aperta, ed e la lezione W3-14 che il piano cita al §30.
        */
        permissions: { canManage },
        vocabularies: {
          documentRoutes: Object.entries(DOCUMENT_ROUTE_LABELS).map(
            ([key, label]) => ({ key, label }),
          ),
          activityScopes: Object.entries(ACTIVITY_SCOPE_LABELS).map(
            ([key, label]) => ({ key, label }),
          ),
          directionHints: Object.entries(DIRECTION_HINT_LABELS).map(
            ([key, label]) => ({ key, label }),
          ),
        },
      },
      error: null,
    });
  } catch (error) {
    return failure(error, "Errore nella lettura della configurazione fiscale");
  }
}

export async function PUT(request: Request) {
  try {
    const raw = (await request.json().catch(() => ({}))) as Record<string, any>;
    const { session, organizationId, activeRole } = await resolveOrganization(
      request,
      raw.organization_id || raw.organizationId || null,
    );

    if (!session) return unauthorized();

    assertAccountingPermission(activeRole, "accounting.causes_manage");

    const input = parseInput(fiscalOperationTypeInputSchema, raw);

    /*
      Solo le chiavi che il corpo nomina davvero arrivano al servizio: `zod`
      restituisce l'oggetto con le chiavi assenti a `undefined`, e passarlo
      intero renderebbe indistinguibile «non l'ho toccato» da «mettilo a
      niente» — cioe farebbe azzerare la classificazione a ogni rinomina.
    */
    const updates = Object.fromEntries(
      Object.entries(input).filter(
        ([key, value]) =>
          key !== "code" &&
          (value !== undefined ||
            Object.prototype.hasOwnProperty.call(raw, key)),
      ),
    );

    const operationType = await saveOperationType({
      organizationId,
      code: input.code,
      updates,
      actorUserId: session.db.user_id,
    });

    return NextResponse.json({ data: { operationType }, error: null });
  } catch (error) {
    return failure(error, "Errore nel salvataggio del tipo di operazione");
  }
}

/**
 * Disattiva, riattiva o cancella una causale.
 *
 *   DELETE /api/v1/fiscal/operation-types?code=…&action=deactivate|activate|delete
 *
 * **`delete` quasi sempre disattiva lo stesso**, e lo dichiara nella risposta:
 * una voce di sistema non si cancella mai, e una voce gia citata da un
 * movimento nemmeno — il vincolo del database e `RESTRICT`. Cancellare
 * riesce solo su una causale del club che nessuno ha ancora usato, cioe su un
 * errore di battitura di dieci minuti prima.
 */
export async function DELETE(request: Request) {
  try {
    const url = new URL(request.url);
    const { session, organizationId, activeRole } = await resolveOrganization(
      request,
      url.searchParams.get("organization_id"),
    );

    if (!session) return unauthorized();

    assertAccountingPermission(activeRole, "accounting.causes_manage");

    const input = parseInput(fiscalOperationTypeActionSchema, {
      code: url.searchParams.get("code"),
      action: url.searchParams.get("action") || "deactivate",
    });

    if (input.action === "delete") {
      const outcome = await deleteOperationType({
        organizationId,
        code: input.code,
      });

      return NextResponse.json({
        data: {
          deleted: outcome.deleted,
          operationType: outcome.operationType,
          /*
            Chi ha premuto «elimina» deve sapere che il sistema ha fatto altro,
            e perche. Una risposta muta lo lascerebbe a credere che la causale
            sia sparita, e a cercarla nel posto sbagliato.
          */
          message: outcome.deleted
            ? "Causale eliminata"
            : "La causale e citata da movimenti gia registrati: e stata disattivata, non eliminata",
        },
        error: null,
      });
    }

    const operationType = await setOperationTypeActive({
      organizationId,
      code: input.code,
      isActive: input.action === "activate",
    });

    return NextResponse.json({
      data: { deleted: false, operationType },
      error: null,
    });
  } catch (error) {
    return failure(error, "Errore nella disattivazione del tipo di operazione");
  }
}

export async function POST(request: Request) {
  try {
    const raw = (await request.json().catch(() => ({}))) as Record<string, any>;
    const { session, organizationId, activeRole } = await resolveOrganization(
      request,
      raw.organization_id || raw.organizationId || null,
    );

    if (!session) return unauthorized();

    assertAccountingPermission(activeRole, "accounting.causes_manage");

    const input = parseInput(documentSeriesInputSchema, raw);

    const series = await saveDocumentSeries({
      organizationId,
      kind: input.kind,
      code: input.code,
      label: input.label,
      prefix: input.prefix,
      isDefault: input.isDefault,
      isActive: input.isActive,
    });

    return NextResponse.json({ data: { series }, error: null });
  } catch (error) {
    return failure(error, "Errore nel salvataggio della serie");
  }
}
