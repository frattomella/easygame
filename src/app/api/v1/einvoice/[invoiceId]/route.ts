import { NextResponse } from "next/server";
import {
  requireAuthenticatedUser,
  resolveOrganizationScopeForUser,
} from "@/lib/server/auth";
import { AUDIT_ACTIONS, recordAuditEvent } from "@/lib/server/audit";
import {
  getEInvoiceStatus,
  prepareEInvoice,
  transmitEInvoice,
} from "@/lib/server/einvoice";

/**
 * La **fattura elettronica** di una fattura emessa.
 *
 *   GET  /api/v1/einvoice/:invoiceId              stato e capability
 *   POST /api/v1/einvoice/:invoiceId              `{ action: "prepare" | "transmit" }`
 *
 * **`transmit` esiste e risponde 503.** Sembra strano scrivere una rotta che
 * non funziona; e invece l'unico modo onesto di rappresentare lo stato delle
 * cose. Se l'azione non esistesse, chi legge l'API concluderebbe che manca da
 * implementare; cosi risponde con **il motivo** — nessun intermediario
 * accreditato configurato — e l'interfaccia lo mostra al posto di un pulsante
 * che promette qualcosa. Vedi ADR-0053.
 *
 * Cio che invece funziona per davvero e `prepare`: costruisce il tracciato
 * FatturaPA dallo snapshot del documento, lo valida e lo conserva. Il risultato
 * e un file che si puo scaricare e consegnare a un commercialista — che e
 * esattamente quel che una societa fa oggi, e che EasyGame puo rendere piu
 * rapido senza mentire.
 */

export const runtime = "nodejs";

type Context = { params: { invoiceId: string } };

const unauthorized = () =>
  NextResponse.json(
    { data: null, error: { message: "Accesso negato: sessione assente" } },
    { status: 401 },
  );

const failure = (error: any, fallback: string) => {
  const message = String(error?.message || fallback);

  /*
    «Non configurato» e un 503, non un 400: non e chi ha chiamato ad aver
    sbagliato, e il servizio a non esserci. Dirlo con un 400 manderebbe chi
    integra a cercare l'errore nella propria richiesta.
  */
  const status = message.includes("Accesso negato")
    ? 403
    : message.includes("non trovata")
      ? 404
      : message.includes("non configurato") || message.includes("non e attiva")
        ? 503
        : 400;

  return NextResponse.json({ data: null, error: { message } }, { status });
};

const buildScope = async (request: Request, userId: string) => {
  const scope = await resolveOrganizationScopeForUser(
    userId,
    request.headers.get("x-active-club-id"),
    request.headers.get("x-active-access-role"),
  );

  return {
    userId,
    activeOrganizationId: scope.activeOrganizationId,
    allowedOrganizationIds: scope.allowedOrganizationIds,
  };
};

export async function GET(request: Request, context: Context) {
  try {
    const session = await requireAuthenticatedUser(request);
    if (!session) return unauthorized();

    const scope = await buildScope(request, session.db.user_id);
    const status = await getEInvoiceStatus(
      { invoiceId: context.params.invoiceId },
      scope,
    );

    return NextResponse.json({ data: status, error: null });
  } catch (error) {
    return failure(error, "Errore nella lettura della fattura elettronica");
  }
}

export async function POST(request: Request, context: Context) {
  try {
    const session = await requireAuthenticatedUser(request);
    if (!session) return unauthorized();

    const body = (await request.json().catch(() => ({}))) as Record<string, any>;
    const action = String(body.action || "prepare");
    const scope = await buildScope(request, session.db.user_id);

    if (action === "transmit") {
      /* Lancia sempre, con il motivo. Vedi la nota in testa al file. */
      await transmitEInvoice({ invoiceId: context.params.invoiceId }, scope);
      return failure(new Error("non configurato"), "");
    }

    const result = await prepareEInvoice(
      { invoiceId: context.params.invoiceId },
      scope,
    );

    await recordAuditEvent({
      action: AUDIT_ACTIONS.documentIssued,
      actorUserId: session.db.user_id,
      actorEmail: session.db.user.email,
      organizationId: result.record.organizationId,
      resource: "einvoice",
      resourceId: result.record.invoiceId,
      request,
      metadata: {
        status: result.record.status,
        readyToSend: result.readyToSend,
        /* Il tracciato **non** finisce nell'audit: contiene i dati di una famiglia. */
        validationIssues: result.record.validationErrors.length,
      },
    });

    return NextResponse.json({
      data: {
        record: result.record,
        readyToSend: result.readyToSend,
        capability: result.capability,
        xml: result.xml,
      },
      error: null,
    });
  } catch (error) {
    return failure(error, "Errore nella preparazione della fattura elettronica");
  }
}
