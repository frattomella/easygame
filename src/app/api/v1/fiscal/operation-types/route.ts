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
  fiscalOperationTypeInputSchema,
} from "@/lib/validation/schemas";
import {
  listDocumentSeries,
  listOperationTypes,
  saveDocumentSeries,
  saveOperationType,
} from "@/lib/server/fiscal-config";
import {
  ACTIVITY_SCOPE_LABELS,
  DOCUMENT_ROUTE_LABELS,
} from "@/lib/fiscal/operation-types";

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
  if (!session) return { session: null, organizationId: "" };

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

  return { session, organizationId };
};

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const { session, organizationId } = await resolveOrganization(
      request,
      url.searchParams.get("organization_id"),
    );

    if (!session) return unauthorized();

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
        vocabularies: {
          documentRoutes: Object.entries(DOCUMENT_ROUTE_LABELS).map(
            ([key, label]) => ({ key, label }),
          ),
          activityScopes: Object.entries(ACTIVITY_SCOPE_LABELS).map(
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
    const { session, organizationId } = await resolveOrganization(
      request,
      raw.organization_id || raw.organizationId || null,
    );

    if (!session) return unauthorized();

    const input = parseInput(fiscalOperationTypeInputSchema, raw);

    const operationType = await saveOperationType({
      organizationId,
      code: input.code,
      updates: input,
    });

    return NextResponse.json({ data: { operationType }, error: null });
  } catch (error) {
    return failure(error, "Errore nel salvataggio del tipo di operazione");
  }
}

export async function POST(request: Request) {
  try {
    const raw = (await request.json().catch(() => ({}))) as Record<string, any>;
    const { session, organizationId } = await resolveOrganization(
      request,
      raw.organization_id || raw.organizationId || null,
    );

    if (!session) return unauthorized();

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
