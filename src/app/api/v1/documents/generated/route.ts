import { NextResponse } from "next/server";

import {
  requireAuthenticatedUser,
  resolveOrganizationScopeForUser,
} from "@/lib/server/auth";
import { canReadDocumentTemplates } from "@/lib/documents/permissions";
import { resolveDocumentForSubject } from "@/lib/server/document-placeholders";
import {
  listGeneratedDocuments,
  loadPublishableVersion,
  recordGeneratedDocument,
} from "@/lib/server/document-templates";
import { renderFilledDocumentHtml } from "@/lib/documents/document-view";
import { MAX_GENERATION_BATCH } from "@/lib/documents/template-model";
import { AUDIT_ACTIONS, recordAuditEvent } from "@/lib/server/audit";
import { publicErrorMessage } from "@/lib/server/api-errors";

/**
 * I documenti generati: elencali, oppure producine di nuovi.
 *
 *   GET  /api/v1/documents/generated?template_id=&subject_id=&batch_id=
 *   POST /api/v1/documents/generated
 *        { template_id, season_id?, batch_id?, subjects: [{ kind, id }] }
 *
 * **Uno o cento, la stessa rotta.** La generazione singola e un lotto da uno.
 * Due percorsi diversi sarebbero due posti dove sbagliare il permesso, due
 * posti dove dimenticare l'audit, e due comportamenti diversi davanti a un
 * codice fiscale mancante.
 *
 * ## Le regole del lotto (§12 del planning)
 *
 * 1. **`batch_id` lo dichiara il client**, come `communication_id` per l'invio
 *    a lotti di Wave 2: senza, il secondo lotto non saprebbe chi e gia stato
 *    servito. E cio che rende ripartibile un lotto dopo un ricaricamento della
 *    pagina;
 * 2. **al piu 50 soggetti per chiamata.** Non 200 come i messaggi: qui ogni
 *    elemento e una risoluzione di segnaposto con letture di cassa e presenze;
 * 3. **un fallimento e un documento in meno, non un lotto perso**: chi fallisce
 *    compare nell'esito **con il motivo**, e il lotto continua;
 * 4. **rieseguire lo stesso `batch_id` non produce doppioni**: l'indice unico
 *    `(organization_id, batch_id, subject_kind, subject_id)` lo impedisce nel
 *    database, non in memoria;
 * 5. **un lotto e un evento di audit solo**, non cento.
 */

export const runtime = "nodejs";

const fail = (status: number, message: string) =>
  NextResponse.json({ data: null, error: { message } }, { status });

const scopeFor = async (request: Request, session: any) => {
  const url = new URL(request.url);
  return resolveOrganizationScopeForUser(
    session.db.user_id,
    request.headers.get("x-active-club-id") || url.searchParams.get("clubId"),
    request.headers.get("x-active-access-role"),
  );
};

export async function GET(request: Request) {
  try {
    const session = await requireAuthenticatedUser(request);
    if (!session) return fail(401, "Accesso negato: sessione assente");

    const scope = await scopeFor(request, session);
    if (!scope.activeOrganizationId) {
      return fail(403, "Accesso negato: nessun club attivo");
    }
    if (!canReadDocumentTemplates(scope.activeRole)) {
      return fail(
        403,
        "Accesso negato: i documenti li vede la segreteria del club",
      );
    }

    const url = new URL(request.url);
    const data = await listGeneratedDocuments(
      {
        userId: session.db.user_id,
        activeOrganizationId: scope.activeOrganizationId,
        allowedOrganizationIds: scope.allowedOrganizationIds,
        role: scope.activeRole,
      },
      {
        templateId: url.searchParams.get("template_id"),
        subjectKind: url.searchParams.get("subject_kind"),
        subjectId: url.searchParams.get("subject_id"),
        batchId: url.searchParams.get("batch_id"),
        limit: Number(url.searchParams.get("limit") || 200),
      },
    );

    return NextResponse.json(
      { data, error: null },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error: any) {
    const message = publicErrorMessage(error, "Impossibile leggere i documenti");
    return fail(message.includes("Accesso negato") ? 403 : 400, message);
  }
}

type SubjectRequest = { kind: string; id: string };

const readSubjects = (body: any): SubjectRequest[] => {
  const raw = Array.isArray(body?.subjects) ? body.subjects : [];
  const seen = new Set<string>();
  const subjects: SubjectRequest[] = [];

  for (const entry of raw) {
    const kind = String(entry?.kind || entry?.subject_kind || "athlete")
      .trim()
      .toLowerCase();
    const id = String(entry?.id || entry?.subject_id || "").trim();
    if (!id) continue;

    /*
      Lo stesso soggetto due volte nella stessa richiesta e quasi sempre una
      selezione fatta due volte, non una richiesta di due copie: si serve una
      volta. Chi vuole due copie stampa due volte, e sono due righe distinte
      solo se non c'e un lotto (vedi `recordGeneratedDocument`).
    */
    const key = `${kind}:${id}`;
    if (seen.has(key)) continue;
    seen.add(key);

    subjects.push({ kind, id });
  }

  return subjects;
};

export async function POST(request: Request) {
  try {
    const session = await requireAuthenticatedUser(request);
    if (!session) return fail(401, "Accesso negato: sessione assente");

    const scope = await scopeFor(request, session);
    const organizationId = scope.activeOrganizationId;
    if (!organizationId) {
      return fail(403, "Accesso negato: nessun club attivo");
    }
    if (!canReadDocumentTemplates(scope.activeRole)) {
      return fail(
        403,
        "Accesso negato: i documenti li genera chi lavora nella segreteria del club",
      );
    }

    const body = await request.json().catch(() => ({}));
    const templateId = String(body?.template_id || body?.templateId || "").trim();
    const seasonId = String(body?.season_id || body?.seasonId || "").trim();
    const batchId = String(body?.batch_id || body?.batchId || "").trim();
    const subjects = readSubjects(body);

    if (!templateId) return fail(400, "Indicare il modello");

    /*
      Un lotto fatto di soli spazi diventava `null`, e con lui **spariva
      l'idempotenza**: la riesecuzione avrebbe prodotto doppioni, e la risposta
      lo diceva soltanto a chi fosse andato a leggere `batchId: null`. Un
      identificativo che non si puo usare va rifiutato, non ridotto in silenzio
      a nessun identificativo.
    */
    const batchIdGrezzo = body?.batch_id ?? body?.batchId;
    if (batchIdGrezzo !== undefined && batchIdGrezzo !== null && !batchId) {
      return fail(
        400,
        "L'identificativo del lotto e vuoto: senza, la riesecuzione produrrebbe doppioni",
      );
    }
    if (!subjects.length) return fail(400, "Indicare almeno un destinatario");
    if (subjects.length > MAX_GENERATION_BATCH) {
      return fail(
        400,
        `Un lotto porta al piu ${MAX_GENERATION_BATCH} documenti per volta: dividilo`,
      );
    }

    const templateScope = {
      userId: session.db.user_id,
      activeOrganizationId: organizationId,
      allowedOrganizationIds: scope.allowedOrganizationIds,
      role: scope.activeRole,
    };

    /*
      Il modello e la versione si caricano **una volta sola** per tutto il
      lotto, e con loro il permesso: cento documenti dallo stesso modello non
      sono cento domande «posso?».
    */
    const { version } = await loadPublishableVersion(templateScope, templateId);

    const produced: any[] = [];
    const failed: Array<{ subject: SubjectRequest; reason: string }> = [];

    for (const subject of subjects) {
      try {
        /*
          Il soggetto del documento deve essere quello che il **modello**
          dichiara: generare un'attestazione da atleta su un socio produrrebbe
          un foglio con tutti i campi della persona bianchi, e nessuno saprebbe
          perche.
        */
        if (subject.kind !== String(version.subject_kind || "athlete")) {
          throw new Error(
            `Questo modello parla di «${version.subject_kind}»: non si genera su un «${subject.kind}»`,
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
            subject.kind === "club"
              ? { kind: "club" }
              : ({ kind: subject.kind, id: subject.id } as any),
          seasonId: seasonId || null,
          scope,
        });

        const page = renderFilledDocumentHtml({
          title: resolved.title,
          bodyHtml: resolved.html,
          issuer: resolved.issuer,
        });

        const document = await recordGeneratedDocument(templateScope, {
          organizationId,
          templateId: String(version.template_id),
          versionId: String(version.id),
          subjectKind: subject.kind,
          subjectId: subject.id,
          /*
            Il nome del soggetto arriva da `recipientName`, **non** da
            `values`: quella mappa porta solo cio che il modello ha davvero
            scritto, e nessuna voce del catalogo nomina `{{recipient.name}}` —
            scrivono nome e cognome separati. Leggendolo da li, il registro
            perdeva il destinatario di **ogni** documento adottato dal
            catalogo, e un lotto da trenta produceva trenta righe
            indistinguibili.
          */
          subjectLabel: resolved.recipientName || null,
          seasonId: seasonId || null,
          valuesSnapshot: resolved.values,
          contentHtml: page,
          unresolved: resolved.unresolved,
          missing: resolved.missing,
          warnings: resolved.warnings,
          sensitivity: version.sensitivity || [],
          batchId: batchId || null,
        });

        produced.push(document);
      } catch (error: any) {
        const reason = publicErrorMessage(error, "Errore sconosciuto");
        /*
          Il lotto **continua**. Chi non si e potuto generare compare qui con
          il suo motivo, esattamente come gli esclusi di una comunicazione
          massiva: un lotto che si ferma al primo intoppo obbliga a rifare
          tutto, e nessuno saprebbe da dove.
        */
        failed.push({ subject, reason });
      }
    }

    await recordAuditEvent({
      action: batchId
        ? AUDIT_ACTIONS.documentBatchGenerated
        : AUDIT_ACTIONS.documentGenerated,
      actorUserId: session.db.user_id,
      actorEmail: session.db.user.email,
      actorRole: scope.activeRole,
      organizationId,
      resource: "generated_documents",
      resourceId: batchId || produced[0]?.id || null,
      metadata: {
        template: version.template_id,
        version: Number(version.version || 0),
        requested: subjects.length,
        produced: produced.length,
        failed: failed.length,
        sensitivity: version.sensitivity || [],
      },
    });

    /*
      **Quando non e uscito niente, il motivo va nell'errore.**

      Prima la risposta era `400` con `error: null` e il motivo nascosto in
      `failed[0].reason`: il trasporto del client, non trovando un errore
      nell'envelope, sintetizzava il messaggio dallo `statusText` — e la
      segreteria leggeva **«Bad Request»** al posto di «l'atleta non appartiene
      a questo club». Su HTTP/2, dove `statusText` e vuoto, leggeva «API
      request failed».

      I falliti restano dove sono, perche in un lotto parziale servono tutti;
      qui si porta in evidenza il primo, che nel caso singolo e l'unico.
    */
    const nienteProdotto = produced.length === 0;

    return NextResponse.json(
      {
        data: {
          batchId: batchId || null,
          templateId: version.template_id,
          versionId: version.id,
          requested: subjects.length,
          produced,
          /*
            Quanti erano **gia** nel lotto. Non e un dettaglio contabile: e la
            differenza fra «ho generato cinquanta documenti» e «cinquanta
            c'erano gia», e chi riprende un lotto ha diritto di sapere quale
            delle due e successa.
          */
          reused: produced.filter((documento: any) => documento?.reused).length,
          failed,
        },
        error: nienteProdotto
          ? {
              message:
                failed[0]?.reason || "Nessun documento e stato generato",
            }
          : null,
      },
      {
        status: nienteProdotto ? 400 : 201,
        headers: { "Cache-Control": "private, no-store" },
      },
    );
  } catch (error: any) {
    const message = publicErrorMessage(error, "Impossibile generare");
    if (message.includes("Accesso negato")) return fail(403, message);
    return fail(400, message);
  }
}
