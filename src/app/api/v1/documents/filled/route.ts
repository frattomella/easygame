import { NextResponse } from "next/server";
import {
  requireAuthenticatedUser,
  resolveOrganizationScopeForUser,
} from "@/lib/server/auth";
import { canManageClubConfiguration } from "@/lib/access-roles";
import { getResourceById } from "@/lib/server/resources";
import { resolveDocumentPlaceholders } from "@/lib/server/document-placeholders";
import { getDocumentTemplatesFromClub } from "@/lib/document-templates";
import { renderFilledDocumentHtml } from "@/lib/documents/document-view";

/**
 * Il modello di modulistica **gia compilato**.
 *
 *   GET /api/v1/documents/filled?templateId=…&athleteId=…&seasonId=…
 *   GET /api/v1/documents/filled?…&format=html
 *
 * **Perche una rotta e non una funzione nel browser.** Perche il risolutore
 * legge il registro incassi e le presenze, e quei dati non vanno spediti al
 * client per essere sommati li: `/modulistica` riceverebbe l'intero ledger di
 * un atleta per stampare una riga. E perche la firma del presidente e un
 * allegato del club, che esce da Attachment Core con lo scope applicato.
 *
 * **Perche non e sotto `/documents/:kind/:id`.** Quella rotta stampa una
 * **riga gia emessa** — una ricevuta, una fattura — identificata dal suo id.
 * Qui non c'e nessuna riga: c'e un modello, un atleta e una stagione, e il
 * documento nasce dalla loro combinazione. Un segmento statico accanto a
 * `[kind]` tiene separate le due cose senza inventare un secondo spazio dei
 * nomi.
 *
 * **Le due forme della risposta.** `format=json` (predefinita) restituisce il
 * documento **insieme** ai segnaposto non risolti: e cio che l'anteprima
 * mostra prima di stampare, perche §5.5.24 chiede che il documento non menta.
 * `format=html` restituisce la sola pagina, per chi la vuole aprire diretta.
 *
 * **Un documento, un atleta.** Nessuna stampa massiva: e G-43, ed e Wave 3.
 *
 * **Il confine.** Il club non arriva dall'indirizzo: arriva dallo scope della
 * sessione. Un atleta di un'altra societa risponde «Accesso negato», e il
 * messaggio dell'ORM non esce mai.
 */

export const runtime = "nodejs";

const denied = (status: number, message: string) =>
  NextResponse.json({ data: null, error: { message } }, { status });

export async function GET(request: Request) {
  try {
    const session = await requireAuthenticatedUser(request);
    if (!session) {
      return denied(401, "Accesso negato: sessione assente");
    }

    const url = new URL(request.url);
    const templateId = String(url.searchParams.get("templateId") || "").trim();
    const athleteId = String(url.searchParams.get("athleteId") || "").trim();
    const seasonId = String(url.searchParams.get("seasonId") || "").trim();
    const format =
      String(url.searchParams.get("format") || "json").trim().toLowerCase() ===
      "html"
        ? "html"
        : "json";

    if (!templateId || !athleteId) {
      return denied(400, "Indicare il modello e l'atleta");
    }

    const scope = await resolveOrganizationScopeForUser(
      session.db.user_id,
      request.headers.get("x-active-club-id") ||
        url.searchParams.get("clubId"),
      request.headers.get("x-active-access-role"),
    );

    const organizationId = scope.activeOrganizationId;
    if (!organizationId) {
      return denied(403, "Accesso negato: nessun club attivo");
    }

    /*
      **Il documento compilato dice quanto ha pagato una famiglia.**

      Fino all'audit di fine Wave questa rotta chiedeva solo una sessione e
      l'appartenenza al club: un genitore o un allenatore poteva scorrere gli
      identificativi degli atleti e scaricare l'attestazione di chiunque —
      codice fiscale, indirizzo, telefono dei tutori, versato, dovuto e
      residuo. La schermata che la usa, `/modulistica`, e riservata alla
      direzione del club (`MANAGEMENT_ADMIN_ONLY_PATH_PREFIXES` in
      `access-roles.ts`); la rotta deve dire la stessa cosa, o il gate della
      pagina e una tenda davanti a una porta aperta.
    */
    if (!canManageClubConfiguration(scope.activeRole)) {
      return denied(
        403,
        "Accesso negato: i documenti con i dati di una famiglia li genera la direzione del club",
      );
    }

    const club = await getResourceById("clubs", organizationId, scope);
    if (!club) {
      return denied(404, "Club non trovato");
    }

    /*
      Il modello si cerca fra quelli **di questo club**: e la stessa lettura
      della pagina Modulistica, filtro dei moduli online compreso, cosi non
      esiste un modello raggiungibile dall'API che la pagina non mostri.
    */
    const template = getDocumentTemplatesFromClub(
      (club as Record<string, any>).document_templates,
    ).find((item: any) => String(item?.id || "") === templateId);

    if (!template) {
      return denied(404, "Modello non trovato");
    }

    const resolved = await resolveDocumentPlaceholders({
      template: {
        id: String((template as any).id || ""),
        title: String((template as any).title || (template as any).name || ""),
        content: String((template as any).content || ""),
      },
      organizationId,
      athleteId,
      seasonId: seasonId || null,
      scope,
    });

    const page = renderFilledDocumentHtml({
      title: resolved.title,
      bodyHtml: resolved.html,
      issuer: resolved.issuer,
    });

    /*
      Un'attestazione porta il codice fiscale di una persona e l'importo che ha
      versato: non finisce in una cache condivisa, come per gli altri documenti.
    */
    const headers = { "Cache-Control": "private, no-store" };

    if (format === "html") {
      return new NextResponse(page, {
        status: 200,
        headers: { ...headers, "Content-Type": "text/html; charset=utf-8" },
      });
    }

    return NextResponse.json(
      {
        data: {
          title: resolved.title,
          html: page,
          values: resolved.values,
          unresolved: resolved.unresolved,
          missing: resolved.missing,
          warnings: resolved.warnings,
        },
        error: null,
      },
      { status: 200, headers },
    );
  } catch (error: any) {
    const message = String(error?.message || "");
    if (message.includes("Accesso negato")) {
      return denied(403, message);
    }

    /*
      Il messaggio dell'ORM non esce: una violazione di vincolo o un id
      malformato racconterebbero lo schema a chi non deve conoscerlo. Resta nel
      log del server, dove serve.
    */
    console.error("[documents.filled]", message);
    return denied(500, "Errore nella generazione del documento");
  }
}
