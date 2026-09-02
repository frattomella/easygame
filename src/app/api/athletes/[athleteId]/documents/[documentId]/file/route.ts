import { NextResponse } from "next/server";
import { canAccessClubResource } from "@/lib/access-roles";
import {
  firstText,
  getSharedDocumentsFromAthlete,
} from "@/lib/shared-documents";
import {
  requireAuthenticatedUser,
  resolveOrganizationScopeForUser,
} from "@/lib/server/auth";
import { prisma } from "@/lib/server/prisma";
import { readAttachment } from "@/lib/server/attachments";
import { resolveDossierAttachmentId } from "@/lib/server/document-dossier-legacy";
import { buildStoredFileResponse } from "@/lib/server/stored-file-response";
import { hasHealthPermission } from "@/lib/health/permissions";
import { isMedicalCertificateDocumentKind } from "@/lib/documents/request-model";

type Context = {
  params: {
    athleteId: string;
    documentId: string;
  };
};

const jsonError = (message: string, status = 400) =>
  NextResponse.json({ data: null, error: { message } }, { status });

export async function GET(request: Request, context: Context) {
  try {
    const session = await requireAuthenticatedUser(request);
    if (!session) return jsonError("Sessione non valida", 401);

    const scope = await resolveOrganizationScopeForUser(
      session.db.user_id,
      request.headers.get("x-active-club-id"),
      request.headers.get("x-active-access-role"),
    );

    /*
      Il confine e il **club attivo**, e il permesso e quello dei certificati
      medici: questo endpoint consegna il **file** — una carta d'identita, un
      certificato — e chiedeva soltanto che l'atleta fosse in uno qualunque dei
      club di chi domanda. Un genitore scaricava i documenti di ogni altra
      famiglia conoscendone gli identificativi.
    */
    if (!canAccessClubResource(scope.activeRole, "medical_certificates", "read")) {
      return jsonError("Accesso negato per il ruolo attivo", 403);
    }

    const athlete = scope.activeOrganizationId
      ? await prisma.athlete.findFirst({
          where: {
            id: context.params.athleteId,
            organization_id: scope.activeOrganizationId,
          },
        })
      : null;

    if (!athlete) return jsonError("Atleta non appartenente al club", 403);

    /*
      **Prima il fascicolo nuovo, poi l'archivio storico** (Wave 5, lane 5D).

      I documenti entrati da `document_submissions` non hanno un `Asset`: i loro
      byte stanno in Attachment Core (ADR-0034). Senza questa lettura il
      pulsante «Visualizza» risponderebbe «documento non trovato» su un
      documento che la stessa pagina sta mostrando.
    */
    const attachmentId = await resolveDossierAttachmentId(
      scope,
      context.params.athleteId,
      context.params.documentId,
    );

    if (attachmentId) {
      const allegato = await readAttachment(attachmentId, scope);
      if (!allegato) return jsonError("File non disponibile", 404);

      /*
        **Il permesso dei certificati non e il permesso del dato clinico.**

        Il controllo in cima chiede `canAccessClubResource(…, "medical_certificates")`,
        che l'allenatore ha: e la porta da cui, secondo l'audit indipendente
        della Wave 5, uscivano i byte di un certificato medico di un minore
        verso un ruolo che il taglio di D-4 aveva escluso — e senza nemmeno il
        perimetro di gruppo, quindi per ogni atleta del club.

        Il tipo del documento lo dice la **categoria con cui e stato
        depositato**, e la decide `isMedicalCertificateDocumentKind`: un solo
        elenco di nomi, quello del fascicolo.
      */
      if (
        isMedicalCertificateDocumentKind(allegato.metadata.category) &&
        !hasHealthPermission(scope.activeRole, "clinical.read")
      ) {
        return jsonError(
          "Accesso negato: il contenuto di un documento sanitario lo vede chi ha il permesso sul dato clinico",
          403,
        );
      }

      return buildStoredFileResponse({
        content: allegato.content,
        mimeType: allegato.metadata.mimeType,
        fileName: firstText(allegato.metadata.fileName, "documento"),
        download: new URL(request.url).searchParams.has("download"),
      });
    }

    const document = getSharedDocumentsFromAthlete(athlete, {
      includeArchived: true,
    }).find(
      (item) =>
        item.id === context.params.documentId ||
        item.assetId === context.params.documentId,
    );

    if (!document?.assetId || document.archived) {
      return jsonError("Documento non trovato", 404);
    }

    /*
      **La stessa porta, sull'altro ramo.**

      Il ramo qui sopra — il fascicolo — chiede `clinical.read` prima di
      consegnare i byte di un certificato medico. Questo ramo, l'archivio
      storico, non lo chiedeva: due porte sullo stesso certificato di un
      minore, una chiusa e una aperta.

      Non era teorico. `stripClinicalAthleteFields` lasciava passare
      `data.sharedDocuments`, quindi l'elenco degli atleti serviva
      all'allenatore `assetId` e `documentType: "medical_certificate"` per
      **ogni** atleta del club: gli identificativi da mettere in questa rotta
      arrivavano da un'altra rotta. Quella meta e chiusa nella stessa
      correzione; questa e la seconda, e serve entrambe — chiuderne una sola
      lascia la difesa appesa a cio che un'altra funzione decide di proiettare.

      Il tipo lo dichiara la riga storica (`documentType`), e il predicato e lo
      stesso del fascicolo: un vocabolario solo per la stessa domanda.
    */
    if (
      isMedicalCertificateDocumentKind(document.documentType) &&
      !hasHealthPermission(scope.activeRole, "clinical.read")
    ) {
      return jsonError(
        "Accesso negato: il contenuto di un documento sanitario lo vede chi ha il permesso sul dato clinico",
        403,
      );
    }

    const asset = await prisma.asset.findFirst({
      where: {
        id: document.assetId,
        bucket: { in: ["shared-documents", "parent-documents"] },
        path: {
          startsWith: `${athlete.organization_id}/${athlete.id}/`,
        },
      },
    });

    if (!asset?.data_base64) {
      return jsonError("File non disponibile", 404);
    }

    const base64 = asset.data_base64.includes(",")
      ? asset.data_base64.split(",").pop() || ""
      : asset.data_base64;

    /*
      `?download` distingue le due cose. Prima la risposta era **sempre**
      `attachment`: «Visualizza» su un documento dell'atleta scaricava il file
      invece di mostrarlo, e mancava `nosniff` (RC Fix 1, punto 8).
    */
    return buildStoredFileResponse({
      content: Buffer.from(base64, "base64"),
      mimeType: asset.mime_type,
      fileName: firstText(asset.file_name, document.fileName, "documento"),
      download: new URL(request.url).searchParams.has("download"),
    });
  } catch (error: any) {
    return jsonError(error?.message || "Errore download documento", 500);
  }
}

