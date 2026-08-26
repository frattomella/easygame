import { NextResponse } from "next/server";
import {
  requireAuthenticatedUser,
  resolveOrganizationScopeForUser,
} from "@/lib/server/auth";
import { prisma } from "@/lib/server/prisma";
import { renderDocumentHtml } from "@/lib/documents/document-view";
import { isDocumentNumberKind } from "@/lib/documents/numbering";
import { resolveFiscalRecipient } from "@/lib/documents/fiscal-recipient";

/**
 * Il documento stampabile di una ricevuta o di una fattura.
 *
 *   GET /api/v1/documents/receipt/:id
 *   GET /api/v1/documents/invoice/:id
 *
 * **Perche una rotta e non un file archiviato.** Il documento e una
 * proiezione della riga che lo descrive: tutto cio che serve a ristamparlo e
 * gia nel database. Conservarne una copia impaginata vorrebbe dire tenere due
 * verita che divergono la prima volta che il club cambia logo.
 *
 * **Perche restituisce HTML e non JSON.** Chi apre questo indirizzo vuole
 * stampare: il browser mostra il documento con il branding della societa e
 * `Stampa → Salva come PDF` produce il file. Un endpoint JSON costringerebbe
 * ogni schermata a reimpaginarlo, ed e cosi che due schermate stampano due
 * documenti diversi per lo stesso incasso.
 *
 * **Il confine.** Il club non arriva dall'indirizzo: si legge dalla riga del
 * documento e si confronta con i club a cui la sessione ha accesso. Un
 * identificativo indovinato di un'altra societa risponde «Accesso negato».
 */

export const runtime = "nodejs";

type Context = { params: { kind: string; id: string } };

const denied = (status: number, message: string) =>
  NextResponse.json({ data: null, error: { message } }, { status });

export async function GET(request: Request, context: Context) {
  try {
    const session = await requireAuthenticatedUser(request);
    if (!session) {
      return denied(401, "Accesso negato: sessione assente");
    }

    const kind = String(context.params.kind || "").trim();
    if (!isDocumentNumberKind(kind)) {
      return denied(404, "Documento non disponibile");
    }

    const id = String(context.params.id || "").trim();
    const row =
      kind === "receipt"
        ? await (prisma as any).receipt.findUnique({ where: { id } })
        : await (prisma as any).invoice.findUnique({ where: { id } });

    if (!row) {
      return denied(404, "Documento non trovato");
    }

    const scope = await resolveOrganizationScopeForUser(
      session.db.user_id,
      request.headers.get("x-active-club-id") || row.organization_id,
      request.headers.get("x-active-access-role"),
    );

    if (!scope.allowedOrganizationIds.includes(row.organization_id)) {
      return denied(403, "Accesso negato: il documento e di un altro club");
    }

    const [club, athlete] = await Promise.all([
      (prisma as any).club.findUnique({ where: { id: row.organization_id } }),
      row.athlete_id
        ? (prisma as any).athlete.findFirst({
            where: { id: row.athlete_id, organization_id: row.organization_id },
          })
        : null,
    ]);

    /*
      L'intestatario di una fattura e gia congelato sulla riga: e stato
      deciso al momento dell'emissione e non deve cambiare se l'anagrafica
      cambia dopo. Una ricevuta non lo porta, e li si risolve adesso.
    */
    const recipient =
      kind === "invoice"
        ? {
            name: String(row.data?.recipientName || ""),
            fiscalCode: row.fiscal_code,
            vatNumber: row.vat_number,
            address: row.address,
            city: row.city,
            postalCode: row.postal_code,
            province: row.province,
          }
        : resolveFiscalRecipient(athlete);

    const html = renderDocumentHtml({
      document: {
        kind,
        number: String(
          kind === "receipt" ? row.receipt_number : row.invoice_number,
        ),
        issueDate: row.issue_date,
        amount: row.amount,
        description: String(row.description || ""),
        method: kind === "receipt" ? row.method : row.payment_method,
        transactionReference: String(row.data?.transactionId || ""),
        athleteName: athlete
          ? `${athlete.first_name || ""} ${athlete.last_name || ""}`.trim()
          : "",
      },
      issuer: {
        name: String(club?.business_name || club?.name || ""),
        logoUrl: club?.logo_url,
        address: club?.legal_address || club?.address,
        city: club?.legal_city || club?.city,
        postalCode: club?.legal_postal_code || club?.postal_code,
        province: club?.legal_province || club?.province,
        fiscalCode: club?.fiscal_code,
        vatNumber: club?.vat_number,
        contactEmail: club?.contact_email,
        contactPhone: club?.contact_phone,
      },
      recipient,
    });

    return new NextResponse(html, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        /*
          Un documento fiscale non si mette in cache condivisa: contiene il
          codice fiscale di una persona e l'importo che ha versato.
        */
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error: any) {
    const message = String(error?.message || "");
    if (message.includes("Accesso negato")) {
      return denied(403, message);
    }

    console.error("[documents]", message);
    return denied(500, "Errore nella generazione del documento");
  }
}
