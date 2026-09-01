import { NextResponse } from "next/server";
import {
  requireAuthenticatedUser,
  resolveOrganizationScopeForUser,
} from "@/lib/server/auth";
import { publicErrorMessage } from "@/lib/server/api-errors";
import {
  cancelDocumentRequest,
  createDocumentRequest,
  decideDocumentSubmission,
  remindDocumentRequest,
  submitDocument,
  type DocumentDossierScope,
} from "@/lib/server/document-requests";
import {
  isLegacyOnlyDocument,
  legacyDocumentReadOnly,
  listAthleteDocumentsWithLegacy,
} from "@/lib/server/document-dossier-legacy";

/**
 * I documenti di un atleta, dal lato del club — **rotta legacy, in sola
 * lettura sull'archivio storico** (Wave 5, lane 5D, §17).
 *
 * ---
 *
 * ## Cosa e cambiato qui, e perche
 *
 * Prima questo file **era** il dominio: apriva `athletes.data.sharedDocuments`,
 * ci scriveva dentro con `prisma.athlete.update` diretto — aggirando
 * `resources.ts` — creava righe in `Asset` con i byte in base64, e decideva da
 * solo cosa fosse un'approvazione. Nessuna delle sue quattro scritture
 * chiamava `recordAuditEvent`: accettare o rifiutare il documento di un minore
 * non lasciava traccia.
 *
 * Adesso non decide piu niente. Le letture uniscono il fascicolo nuovo a
 * quello storico, perche il giorno del rilascio la segreteria non deve vedere
 * meta archivio sparire; le scritture passano tutte da
 * `src/lib/server/document-requests.ts`, che e l'unico scrittore.
 *
 * ## Cosa non fa piu, di proposito
 *
 * - **non modifica** titolo, tipo e scadenza di una richiesta gia inviata: la
 *   famiglia ha letto una cosa, e cambiarla sotto le mani produce un fascicolo
 *   che non corrisponde a nessun messaggio ricevuto. Si annulla e si richiede;
 * - **non tocca** le righe dell'archivio storico: quelle entrano nel fascicolo
 *   nuovo con il travaso, e fino ad allora si leggono e basta.
 *
 * Il file sparisce con la lane 5J, insieme a `src/lib/shared-documents.ts`.
 */

export const runtime = "nodejs";

type Context = { params: { athleteId: string } };

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

const jsonError = (message: string, status = 400) =>
  NextResponse.json({ data: null, error: { message } }, { status });

const failure = (error: any, fallback: string) => {
  const message = publicErrorMessage(error, fallback);
  const status = message.includes("Accesso negato")
    ? 403
    : /non trovat[oa]/i.test(message)
      ? 404
      : 400;
  return jsonError(message, status);
};

const firstText = (...values: unknown[]) => {
  for (const value of values) {
    const text = String(value ?? "").trim();
    if (text) return text;
  }
  return "";
};

type ResolvedScope =
  | { scope: DocumentDossierScope; response?: undefined }
  | { scope?: undefined; response: NextResponse };

const resolveScope = async (
  request: Request,
  preferredOrganizationId?: string,
): Promise<ResolvedScope> => {
  const session = await requireAuthenticatedUser(request);
  if (!session) return { response: jsonError("Sessione non valida", 401) };

  const scope = await resolveOrganizationScopeForUser(
    session.db.user_id,
    preferredOrganizationId || request.headers.get("x-active-club-id"),
    request.headers.get("x-active-access-role"),
  );

  if (!scope.activeOrganizationId) {
    return { response: jsonError("Nessun club disponibile", 403) };
  }

  return { scope };
};

/**
 * Il file arriva ancora in base64 su questa rotta, e resta cosi.
 *
 * L'upload **multipart** e quello della rotta nuova (`/api/v1/document-submissions`).
 * Cambiare il formato anche qui costringerebbe a toccare l'interfaccia dentro
 * lo stesso rilascio in cui si sposta l'archivio: due cambiamenti in volo sullo
 * stesso schermo sono il modo in cui non si capisce piu quale dei due ha rotto
 * cosa. I byte, pero, finiscono gia in Attachment Core.
 */
const decodeBase64 = (value: string) => {
  const base64 = value.includes(",") ? value.split(",").pop() || "" : value;
  return Buffer.from(base64, "base64");
};

export async function GET(request: Request, context: Context) {
  try {
    const resolved = await resolveScope(request);
    if (resolved.response) return resolved.response;

    const data = await listAthleteDocumentsWithLegacy(
      resolved.scope,
      context.params.athleteId,
    );

    return NextResponse.json({ data, error: null });
  } catch (error: any) {
    return failure(error, "Errore caricamento documenti");
  }
}

export async function POST(request: Request, context: Context) {
  try {
    const body = await request.json().catch(() => ({}));
    const resolved = await resolveScope(
      request,
      firstText(body?.organizationId, body?.organization_id),
    );
    if (resolved.response) return resolved.response;

    const athleteId = context.params.athleteId;
    const action = firstText(body?.action) || "upload";

    if (action === "require") {
      await createDocumentRequest(
        resolved.scope,
        {
          subjectKind: "athlete",
          subjectId: athleteId,
          documentKind: firstText(
            body?.documentType,
            body?.document_type,
            "other",
          ),
          title: firstText(body?.title) || "Documento richiesto",
          description: firstText(body?.description) || null,
          required: true,
          dueDate: firstText(body?.dueDate, body?.due_date) || null,
        },
        request,
      );
    } else {
      const fileName = firstText(body?.fileName, body?.file_name);
      const dataBase64 = firstText(body?.dataBase64, body?.data_base64);
      if (!fileName || !dataBase64) return jsonError("File documento mancante");

      const content = decodeBase64(dataBase64);
      if (content.length > MAX_UPLOAD_BYTES) {
        return jsonError("File troppo grande. Limite massimo 10MB.");
      }

      const documentId = firstText(body?.documentId, body?.document_id);
      if (documentId && (await isLegacyOnlyDocument(resolved.scope, documentId))) {
        return failure(legacyDocumentReadOnly(documentId), "Documento storico");
      }

      await submitDocument(
        resolved.scope,
        {
          requestId: documentId || null,
          subjectKind: "athlete",
          subjectId: athleteId,
          documentKind: firstText(
            body?.documentType,
            body?.document_type,
            "other",
          ),
          /* Lo carica la segreteria: la famiglia lo trova gia nel fascicolo. */
          source: "club",
          file: {
            fileName,
            mimeType:
              firstText(body?.mimeType, body?.mime_type) ||
              "application/octet-stream",
            content,
          },
        },
        request,
      );
    }

    const data = await listAthleteDocumentsWithLegacy(
      resolved.scope,
      athleteId,
      { includeArchived: true },
    );
    return NextResponse.json({ data, error: null });
  } catch (error: any) {
    return failure(error, "Errore salvataggio documento");
  }
}

export async function PATCH(request: Request, context: Context) {
  try {
    const body = await request.json().catch(() => ({}));
    const resolved = await resolveScope(
      request,
      firstText(body?.organizationId, body?.organization_id),
    );
    if (resolved.response) return resolved.response;

    const documentId = firstText(body?.documentId, body?.document_id);
    if (!documentId) return jsonError("Documento non indicato");

    if (await isLegacyOnlyDocument(resolved.scope, documentId)) {
      return failure(legacyDocumentReadOnly(documentId), "Documento storico");
    }

    const action = firstText(body?.action) || "update";

    if (action === "approve" || action === "reject") {
      await decideDocumentSubmission(
        resolved.scope,
        documentId,
        {
          decision: action === "approve" ? "approved" : "rejected",
          note: firstText(body?.rejectionReason, body?.rejection_reason) || null,
        },
        request,
      );
    } else if (action === "remind") {
      await remindDocumentRequest(resolved.scope, documentId, request);
    } else {
      /*
        L'aggiornamento libero non esiste piu. Non e una funzione tolta per
        semplificare: cambiare titolo, tipo o scadenza di una richiesta gia
        inviata produce un fascicolo che non corrisponde a nessun messaggio che
        la famiglia abbia ricevuto.
      */
      return jsonError(
        "Una richiesta inviata non si modifica: si annulla e si richiede",
      );
    }

    const data = await listAthleteDocumentsWithLegacy(
      resolved.scope,
      context.params.athleteId,
      { includeArchived: true },
    );
    return NextResponse.json({ data, error: null });
  } catch (error: any) {
    return failure(error, "Errore aggiornamento documento");
  }
}

export async function DELETE(request: Request, context: Context) {
  try {
    const body = await request.json().catch(() => ({}));
    const resolved = await resolveScope(
      request,
      firstText(body?.organizationId, body?.organization_id),
    );
    if (resolved.response) return resolved.response;

    const documentId = firstText(body?.documentId, body?.document_id);
    if (!documentId) return jsonError("Documento non indicato");

    if (await isLegacyOnlyDocument(resolved.scope, documentId)) {
      return failure(legacyDocumentReadOnly(documentId), "Documento storico");
    }

    await cancelDocumentRequest(
      resolved.scope,
      documentId,
      { reason: firstText(body?.reason) || null },
      request,
    );

    const data = await listAthleteDocumentsWithLegacy(
      resolved.scope,
      context.params.athleteId,
      { includeArchived: true },
    );
    return NextResponse.json({ data, error: null });
  } catch (error: any) {
    return failure(error, "Errore archiviazione documento");
  }
}
