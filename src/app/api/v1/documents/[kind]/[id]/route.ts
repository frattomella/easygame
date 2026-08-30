import { NextResponse } from "next/server";
import { readDocumentSnapshot } from "@/lib/documents/document-snapshot";
import { canAccessClubResource } from "@/lib/access-roles";
import { assertActiveClub } from "@/lib/auth/active-club-boundary";
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

    /*
      Il confine e il **club attivo**, non l'elenco dei club dell'utente: vedi
      `src/lib/auth/active-club-boundary.ts`. L'indirizzo del documento arriva
      qui come club preferito, quindi il ruolo viene risolto per **quello** e i
      due controlli parlano dello stesso club.
    */
    assertActiveClub(scope, row.organization_id, "il documento");

    /*
      **Il gate di ruolo che mancava.** Il foglio porta il codice fiscale di
      una persona e l'importo che ha versato: non e una pagina che chiunque
      appartenga al club debba poter aprire conoscendone l'identificativo.
    */
    if (
      !canAccessClubResource(
        scope.activeRole,
        kind === "receipt" ? "receipts" : "invoices",
        "read",
      )
    ) {
      return denied(403, "Accesso negato per il ruolo attivo");
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
      **Lo snapshot prima di tutto: era il difetto H-2 dell'audit.**

      Questa rotta ricostruiva il documento dai dati di **adesso** — il club
      corrente per l'intestazione, l'anagrafica corrente per l'intestatario di
      una ricevuta. Un documento consegnato a marzo e ristampato a settembre,
      dopo che la societa aveva cambiato ragione sociale o che qualcuno aveva
      corretto un codice fiscale, usciva **diverso** dall'originale pur
      portando lo stesso numero.

      E esattamente cio contro cui `invoices.snapshot` e `receipts.snapshot`
      esistono, e nessuno li leggeva: `readDocumentSnapshot` aveva due soli
      chiamanti, tutti e due dentro il tracciato FatturaPA. Il documento di
      carta — quello che la famiglia riceve davvero — era l'unico a non
      esserne protetto.

      La ricaduta sui dati correnti resta, e serve: i documenti emessi
      **prima** che lo snapshot esistesse non ne hanno uno, e per quelli questa
      e l'unica ricostruzione possibile. Ma e una ricaduta, non piu la regola.
    */
    const snapshot = readDocumentSnapshot(row.snapshot);

    const recipient = snapshot
      ? {
          name: snapshot.recipient.name,
          fiscalCode: snapshot.recipient.fiscalCode,
          vatNumber: snapshot.recipient.vatNumber,
          address: snapshot.recipient.address,
          city: snapshot.recipient.city,
          postalCode: snapshot.recipient.postalCode,
          province: snapshot.recipient.province,
        }
      : kind === "invoice"
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

    /*
      L'intestazione della societa, congelata allo stesso modo. Il **logo** no,
      ed e voluto: e un'immagine servita dall'applicazione, non un dato
      fiscale, e un logo rifatto non cambia cio che il documento dichiara.
    */
    const issuer = snapshot
      ? {
          name: snapshot.issuer.name,
          logoUrl: club?.logo_url,
          address: snapshot.issuer.address,
          city: snapshot.issuer.city,
          postalCode: snapshot.issuer.postalCode,
          province: snapshot.issuer.province,
          fiscalCode: snapshot.issuer.fiscalCode,
          vatNumber: snapshot.issuer.vatNumber,
          contactEmail: club?.contact_email,
          contactPhone: club?.contact_phone,
        }
      : {
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
        };

    const html = renderDocumentHtml({
      document: {
        kind,
        number: String(
          kind === "receipt" ? row.receipt_number : row.invoice_number,
        ),
        issueDate: row.issue_date,
        amount: row.amount,
        description: String(snapshot?.description || row.description || ""),
        method: kind === "receipt" ? row.method : row.payment_method,
        transactionReference: String(row.data?.transactionId || ""),
        athleteName: athlete
          ? `${athlete.first_name || ""} ${athlete.last_name || ""}`.trim()
          : "",
        /*
          L'annullamento si dichiara sul foglio: vedi `renderDocumentHtml`. Un
          documento ritirato non deve poter essere scambiato per uno valido, e
          fino a ieri usciva identico.
        */
        cancelledAt: row.cancelled_at || null,
        cancellationReason: row.cancellation_reason || null,
      },
      issuer,
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
