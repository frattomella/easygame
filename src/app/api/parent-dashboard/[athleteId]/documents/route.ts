import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/server/auth";
import { publicErrorMessage } from "@/lib/server/api-errors";
import {
  resolveLinkedFamilyScope,
  submitDocument,
} from "@/lib/server/document-requests";
import {
  isLegacyOnlyDocument,
  legacyDocumentReadOnly,
  listAthleteDocumentsWithLegacy,
} from "@/lib/server/document-dossier-legacy";

/**
 * I documenti di un atleta, dal lato della famiglia — **rotta legacy, in sola
 * lettura sull'archivio storico** (Wave 5, lane 5D, §17).
 *
 * ---
 *
 * ## Cosa e cambiato, e perche
 *
 * Prima questa rotta creava una riga `Asset` con i byte in base64 — una tabella
 * **senza `organization_id`**, dove il confine multi-tenant era il prefisso di
 * una stringa di percorso — e poi riscriveva a mano
 * `athletes.data.sharedDocuments` con `prisma.athlete.update`. Il caricamento
 * di un documento di un minore non lasciava nessuna traccia di audit.
 *
 * Adesso il deposito passa da `document-requests.ts`, i byte da Attachment Core
 * (ADR-0034), e la notifica alla segreteria resta indirizzata per ruolo
 * (`club-notifications.ts`) — la correzione della Wave 4 che ha smesso di
 * pubblicare il nome di un minore nella bacheca di ogni altra famiglia.
 *
 * ## Il permesso e il **legame**, non il ruolo
 *
 * Un genitore collegato solo come tutore puo non avere nessuna appartenenza al
 * club: il suo ruolo attivo sarebbe `null`, e ogni controllo di ruolo lo
 * respingerebbe. Lo scope lo costruisce `resolveLinkedFamilyScope` dal legame
 * con l'atleta, e il club arriva dalla riga dell'atleta, mai dal client.
 *
 * ## I due formati, per un rilascio solo
 *
 * `POST` accetta **multipart** — che e la forma nuova, quella di
 * `/api/v1/document-submissions` — e continua ad accettare il JSON con base64
 * finche l'interfaccia non e passata. Base64 costa il 33% in piu e tiene tre
 * copie del file in memoria: e la ragione per cui la forma nuova esiste, e
 * anche la ragione per cui non si spegne la vecchia nello stesso rilascio in
 * cui si sposta l'archivio.
 *
 * Il file sparisce con la lane 5J.
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

const decodeBase64 = (value: string) => {
  const base64 = value.includes(",") ? value.split(",").pop() || "" : value;
  return Buffer.from(base64, "base64");
};

type Deposito = {
  requestId: string;
  documentKind: string;
  fileName: string;
  mimeType: string;
  content: Buffer;
};

/**
 * Il deposito, da qualunque dei due formati arrivi.
 *
 * Restituisce un messaggio invece di lanciare quando il corpo non e un
 * deposito: e la risposta che la famiglia legge sullo schermo, e «file
 * documento mancante» dice cosa fare, «operazione non riuscita» no.
 */
const readDeposito = async (
  request: Request,
): Promise<{ deposito?: Deposito; message?: string }> => {
  const contentType = String(request.headers.get("content-type") || "");

  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    const file = form.get("file");
    if (!file || typeof file === "string") {
      return { message: "File documento mancante" };
    }
    if (Number(file.size || 0) > MAX_UPLOAD_BYTES) {
      return { message: "File troppo grande. Limite massimo 10MB." };
    }

    return {
      deposito: {
        requestId: firstText(form.get("request_id"), form.get("document_id")),
        documentKind: firstText(form.get("document_kind"), "other"),
        fileName: firstText(form.get("file_name"), file.name, "documento"),
        mimeType:
          firstText(form.get("mime_type"), file.type) ||
          "application/octet-stream",
        content: Buffer.from(await file.arrayBuffer()),
      },
    };
  }

  const body = await request.json().catch(() => ({}));
  const fileName = firstText(body?.fileName, body?.file_name);
  const dataBase64 = firstText(body?.dataBase64, body?.data_base64);
  if (!fileName || !dataBase64) return { message: "File documento mancante" };

  const content = decodeBase64(dataBase64);
  if (content.length > MAX_UPLOAD_BYTES) {
    return { message: "File troppo grande. Limite massimo 10MB." };
  }

  return {
    deposito: {
      requestId: firstText(
        body?.requestId,
        body?.request_id,
        body?.documentId,
        body?.document_id,
        body?.templateId,
        body?.template_id,
      ),
      documentKind: firstText(
        body?.documentType,
        body?.document_type,
        "other",
      ),
      fileName,
      mimeType:
        firstText(body?.mimeType, body?.mime_type) ||
        "application/octet-stream",
      content,
    },
  };
};

export async function GET(request: Request, context: Context) {
  try {
    const session = await requireAuthenticatedUser(request);
    if (!session) return jsonError("Sessione non valida", 401);

    const scope = await resolveLinkedFamilyScope(
      session.db.user_id,
      context.params.athleteId,
    );

    const data = await listAthleteDocumentsWithLegacy(
      scope,
      context.params.athleteId,
    );

    return NextResponse.json({ data, error: null });
  } catch (error: any) {
    return failure(error, "Errore caricamento documenti");
  }
}

export async function POST(request: Request, context: Context) {
  try {
    const session = await requireAuthenticatedUser(request);
    if (!session) return jsonError("Sessione non valida", 401);

    const scope = await resolveLinkedFamilyScope(
      session.db.user_id,
      context.params.athleteId,
    );

    const { deposito, message } = await readDeposito(request);
    if (!deposito) return jsonError(message || "File documento mancante");

    /*
      Il modulo storico non e una richiesta del fascicolo nuovo: depositarci
      sopra scriverebbe una riga che punta a niente. Si accetta comunque il
      file, ma come deposito **spontaneo** — che e cio che di fatto e, finche il
      travaso non ha portato la richiesta di la.
    */
    const requestId =
      deposito.requestId &&
      !(await isLegacyOnlyDocument(scope, deposito.requestId))
        ? deposito.requestId
        : "";

    if (deposito.requestId && !requestId) {
      /*
        Non e un errore da mostrare: e il caso normale prima del travaso. Si
        registra dove chi legge i log lo cerchera, e si prosegue.
      */
      console.info(
        "[fascicolo] deposito spontaneo: la richiesta e ancora nell'archivio storico",
        { documentId: legacyDocumentReadOnly(deposito.requestId).message },
      );
    }

    const data = await submitDocument(
      scope,
      {
        requestId: requestId || null,
        subjectKind: "athlete",
        subjectId: context.params.athleteId,
        documentKind: deposito.documentKind,
        source: "parent",
        file: {
          fileName: deposito.fileName,
          mimeType: deposito.mimeType,
          content: deposito.content,
        },
      },
      request,
    );

    return NextResponse.json({ data, error: null });
  } catch (error: any) {
    return failure(error, "Errore caricamento documento");
  }
}
