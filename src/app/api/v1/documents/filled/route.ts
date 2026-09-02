import { NextResponse } from "next/server";
import {
  requireAuthenticatedUser,
  resolveOrganizationScopeForUser,
} from "@/lib/server/auth";
import { canReadDocumentTemplates } from "@/lib/documents/permissions";
import { resolveDocumentForSubject } from "@/lib/server/document-placeholders";
import { loadPublishableVersion } from "@/lib/server/document-templates";
import { renderFilledDocumentHtml } from "@/lib/documents/document-view";
import { publicErrorMessage } from "@/lib/server/api-errors";

/**
 * L'**anteprima** di un modello compilato.
 *
 *   GET /api/v1/documents/filled?templateId=…&athleteId=…&seasonId=…
 *   GET /api/v1/documents/filled?…&format=html
 *
 * **Questa rotta non scrive niente, ed e il suo scopo.** Fino alla Wave 3 era
 * anche l'unico modo di ottenere un documento compilato, e quel documento non
 * lasciava traccia: nasceva nel browser e moriva alla chiusura della scheda.
 * Adesso il documento che **conta** lo produce
 * `POST /api/v1/documents/generated`, che scrive una riga con la versione, i
 * valori e la resa. Qui resta cio che serve prima di premere: vedere il foglio,
 * e soprattutto vedere **cosa non e riuscito a scriverci dentro**.
 *
 * Il §5 del planning lo chiede esplicitamente: generare da una bozza non
 * pubblicata e possibile solo in anteprima, e l'anteprima non scrive nessuna
 * riga in `generated_documents`.
 *
 * **Perche una rotta e non una funzione nel browser.** Perche il risolutore
 * legge il registro incassi e le presenze, e quei dati non vanno spediti al
 * client per essere sommati li. E perche la firma del presidente e un allegato
 * del club, che esce da Attachment Core con lo scope applicato.
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
    /*
      `athleteId` resta il nome del parametro storico: la schermata di Wave 1 lo
      manda cosi, e cambiarlo avrebbe rotto un indirizzo che qualcuno puo aver
      salvato. `subjectKind`/`subjectId` sono la forma generale.
    */
    const subjectKind = (String(url.searchParams.get("subjectKind") || "athlete").trim().toLowerCase()) || "athlete";
    const athleteId = String(url.searchParams.get("subjectId") || url.searchParams.get("athleteId") || "").trim();
    const seasonId = String(url.searchParams.get("seasonId") || "").trim();
    const format =
      String(url.searchParams.get("format") || "json").trim().toLowerCase() ===
      "html"
        ? "html"
        : "json";

    if (!templateId || !athleteId) {
      return denied(400, "Indicare il modello e il soggetto");
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
      **Il permesso vero non e questo.** Chi puo vedere l'anteprima di *quale*
      modello dipende da cosa il modello dice: un'attestazione con gli importi
      la vede la direzione, una dichiarazione di iscrizione anche la segreteria.
      La decisione sta in `loadPublishableVersion`, che conosce la sensibilita
      **della versione**; qui si tiene fuori soltanto chi non ha niente a che
      fare con i documenti.
    */
    if (!canReadDocumentTemplates(scope.activeRole)) {
      return denied(
        403,
        "Accesso negato: i documenti li genera chi lavora nella segreteria del club",
      );
    }

    const templateScope = {
      userId: session.db.user_id,
      activeOrganizationId: organizationId,
      allowedOrganizationIds: scope.allowedOrganizationIds,
      role: scope.activeRole,
    };

    const { version } = await loadPublishableVersion(templateScope, templateId);

    /*
      **L'anteprima applica la stessa regola della generazione.** Prima non lo
      faceva: si poteva vedere un foglio che poi il server si rifiutava di
      produrre, e nulla nell'anteprima diceva perche. Un'anteprima che mostra
      qualcosa di irraggiungibile e peggio di nessuna anteprima.
    */
    if (subjectKind !== String(version.subject_kind || "athlete")) {
      return denied(
        400,
        `Questo modello parla di «${version.subject_kind}»: non si genera su un «${subjectKind}»`,
      );
    }

    const resolved = await resolveDocumentForSubject({
      template: {
        id: String(version.template_id || ""),
        title: String(version.title || ""),
        content: String(version.content_html || ""),
      },
      organizationId,
      subject:
        subjectKind === "club"
          ? { kind: "club" }
          : ({ kind: subjectKind, id: athleteId } as any),
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
          templateId: version.template_id,
          versionId: version.id,
          version: Number(version.version || 0),
          sensitivity: version.sensitivity || [],
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
    const message = publicErrorMessage(error, "");
    if (message.includes("Accesso negato")) {
      return denied(403, message);
    }

    /*
      Un modello che non esiste, che non e mai stato pubblicato o che e stato
      ritirato sono tre cose che chi genera deve poter leggere: sono sue
      decisioni, non difetti del server.
    */
    if (
      message.includes("non e mai stato pubblicato") ||
      message.includes("ritirato") ||
      message.includes("Nessun atleta")
    ) {
      return denied(400, message);
    }

    /*
      Il messaggio dell'ORM non esce: una violazione di vincolo o un id
      malformato racconterebbero lo schema a chi non deve conoscerlo. Resta nel
      log del server, dove serve.
    */
    /* eslint-disable-next-line no-console -- il messaggio gia redatto da publicErrorMessage */
    console.error("[documents.filled]", message);
    return denied(500, "Errore nella generazione del documento");
  }
}
