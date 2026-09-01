import { MAX_ATTACHMENT_BYTES } from "@/lib/attachments";
import {
  listPendingDocumentSubmissions,
  submitDocument,
} from "@/lib/server/document-requests";
import {
  failure,
  ok,
  resolveDossierScope,
} from "../document-requests/http";

/**
 * I depositi di documenti (Wave 5, lane 5D, §17).
 *
 *   GET  /api/v1/document-submissions?subject_id=…   la coda «da verificare»
 *   POST /api/v1/document-submissions                multipart/form-data
 *
 * **Perche multipart e non JSON con base64.** E la stessa ragione di
 * la rotta degli allegati: base64 costa il 33% in piu, e caricare un PDF da 8 MB
 * come stringa JSON vuol dire tenerne tre copie in memoria fra parsing e
 * decodifica. Le due rotte legacy lo facevano proprio cosi — e i byte
 * finivano in `Asset`, una tabella **senza `organization_id`**.
 *
 * **Il deposito spontaneo passa di qui.** Senza `request_id` nasce una riga
 * con `request_id` nullo, che entra nella stessa coda e riceve la stessa
 * decisione: due percorsi diversi sarebbero due code, e la seconda e quella
 * che nessuno guarda.
 *
 * Il permesso della famiglia e il **legame** con l'atleta, non il ruolo: lo
 * risolve il servizio, che e l'unico posto in cui quella domanda ha una
 * risposta sola.
 */

export const runtime = "nodejs";

const formText = (value: FormDataEntryValue | null) =>
  typeof value === "string" ? value.trim() : "";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const organizationId = url.searchParams.get("organization_id");
    const resolved = await resolveDossierScope(request, organizationId);
    if (resolved.response) return resolved.response;

    const data = await listPendingDocumentSubmissions(resolved.scope, {
      organizationId,
      subjectId: url.searchParams.get("subject_id"),
    });

    return ok(data);
  } catch (error: any) {
    return failure(error, "Lettura della coda dei documenti non riuscita");
  }
}

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const organizationId = formText(form.get("organization_id")) || null;

    const resolved = await resolveDossierScope(request, organizationId);
    if (resolved.response) return resolved.response;

    const file = form.get("file");
    if (!file || typeof file === "string") {
      return failure(new Error("Nessun file ricevuto."), "File mancante");
    }

    /*
      La dimensione si controlla **prima** di leggere i byte: `arrayBuffer()` su
      un file da 200 MB li porta tutti in memoria prima che qualcuno possa
      rifiutarli. Il limite vero, e il tipo, li fa rispettare Attachment Core:
      qui si evita solo di arrivarci con mezzo gigabyte in mano.
    */
    if (Number(file.size || 0) > MAX_ATTACHMENT_BYTES) {
      return failure(
        new Error(
          `Il file supera il limite di ${Math.round(MAX_ATTACHMENT_BYTES / (1024 * 1024))} MB.`,
        ),
        "File troppo grande",
      );
    }

    const content = Buffer.from(await file.arrayBuffer());

    const data = await submitDocument(
      resolved.scope,
      {
        organizationId,
        requestId: formText(form.get("request_id")) || null,
        subjectKind: formText(form.get("subject_kind")),
        subjectId: formText(form.get("subject_id")),
        documentKind: formText(form.get("document_kind")),
        source: formText(form.get("source")),
        file: {
          fileName: formText(form.get("file_name")) || file.name || "documento",
          mimeType: formText(form.get("mime_type")) || file.type || "",
          content,
          /*
            Le date di validita del documento: facoltative, e le valida
            Attachment Core. Su un certificato medico sono quelle che
            finiranno nella riga promossa in `medical_certificates`, cioe
            quelle su cui gira il promemoria notturno.
          */
          validFrom: formText(form.get("valid_from")) || null,
          validUntil: formText(form.get("valid_until")) || null,
        },
      },
      request,
    );

    return ok(data, 201);
  } catch (error: any) {
    return failure(error, "Consegna del documento non riuscita");
  }
}
