import { NextResponse } from "next/server";
import { publicErrorMessage } from "@/lib/server/api-errors";
import { prisma } from "@/lib/server/prisma";
import { buildStoredFileResponse } from "@/lib/server/stored-file-response";
import { requireAuthenticatedUser } from "@/lib/server/auth";
import { getParentDashboardData } from "@/lib/server/parent-dashboard";
import { readAttachment } from "@/lib/server/attachments";
import { resolveLinkedFamilyScope } from "@/lib/server/document-requests";
import { resolveDossierAttachmentId } from "@/lib/server/document-dossier-legacy";
import { getSharedDocumentsFromAthlete } from "@/lib/shared-documents";

type Context = {
  params: {
    athleteId: string;
    assetId: string;
  };
};

export async function GET(request: Request, context: Context) {
  try {
    const session = await requireAuthenticatedUser(request);
    if (!session) {
      return NextResponse.json(
        {
          data: null,
          error: { message: "Sessione non valida" },
        },
        { status: 401 },
      );
    }

    const dashboard = await getParentDashboardData(
      session.db.user_id,
      context.params.athleteId,
      /*
        **Il cruscotto della famiglia lo apre un tutore** (ADR-0118, ADR-0122).

        Da qui esce il payload intero — quote, ricevute, anagrafica dei tutori,
        contenuto clinico e indirizzo del file del certificato — mentre
        l'atleta di quella scheda ne riceve, dalla propria area, l'elenco
        chiuso di `CAMPI_AREA_ATLETA`. Non c'e niente da dichiarare: dopo
        ADR-0122 il legame diretto e **chiuso per predefinito**, e questa riga
        e qui perche il prossimo lettore non lo riapra credendo di correggere
        una dimenticanza.
      */
    );
    if (!dashboard) {
      return NextResponse.json(
        {
          data: null,
          error: { message: "Atleta non collegato a questo account" },
        },
        { status: 403 },
      );
    }

    /*
      **Prima il fascicolo nuovo, poi l'archivio storico** (Wave 5, lane 5D).

      I documenti entrati da `document_submissions` non hanno un `Asset`, e per
      la famiglia questa e l'unica strada verso i byte: la rotta generica degli
      allegati risponde al permesso della risorsa «atleti», che un genitore non
      ha. Lo scope nasce dal **legame**, non dal ruolo.
    */
    const famiglia = await resolveLinkedFamilyScope(
      session.db.user_id,
      dashboard.athlete.id,
    );
    const attachmentId = await resolveDossierAttachmentId(
      famiglia,
      dashboard.athlete.id,
      context.params.assetId,
    );

    if (attachmentId) {
      const allegato = await readAttachment(attachmentId, famiglia);
      if (!allegato) {
        return NextResponse.json(
          { data: null, error: { message: "Documento non trovato" } },
          { status: 404 },
        );
      }

      return buildStoredFileResponse({
        content: allegato.content,
        mimeType: allegato.metadata.mimeType,
        fileName: allegato.metadata.fileName || "documento",
        download: new URL(request.url).searchParams.has("download"),
      });
    }

    /*
      **L'archivio storico non sta nel payload, e da PP-02 §E non ci sta piu.**

      Questo ripiego leggeva `dashboard.athlete.data`, che era la riga `data`
      grezza. PP-02 §E l'ha ridotta a un elenco chiuso — oggi `address` e
      `medicalVisits` e basta — e da quel momento
      `getSharedDocumentsFromAthlete`, che cerca `sharedDocuments`,
      `parentDocuments` e le loro grafie, non trovava **mai** niente: ogni
      identificativo storico riceveva 403 «Documento non visibile», e la
      `prisma.asset.findFirst` qui sotto era diventata codice morto.

      Le due riduzioni non si contraddicono, e la distinzione e questa: la
      lista chiusa governa **cio che esce verso il browser**, e resta chiusa.
      Qui invece si sta rispondendo a una domanda diversa — «questo documento
      il club lo ha condiviso con la famiglia?» — e quella domanda si fa alla
      riga, sul server, senza che niente di quella riga esca.

      Il legame e gia provato: `getParentDashboardData` ha risposto qui sopra,
      e senza il suo esito non si arriva a questa riga. Cio che si legge e
      soltanto il segno `visibleToParent`, e i byte li consegna comunque
      `buildStoredFileResponse` dopo il vaglio sul bucket e sul percorso.
    */
    const scheda = await prisma.athlete.findFirst({
      where: {
        id: dashboard.athlete.id,
        organization_id: dashboard.club.id,
      },
      select: { id: true, organization_id: true, data: true },
    });

    const document = scheda
      ? getSharedDocumentsFromAthlete(scheda).find(
          (item) => item.assetId === context.params.assetId,
        )
      : undefined;

    if (!document?.visibleToParent) {
      return NextResponse.json(
        {
          data: null,
          error: { message: "Documento non visibile" },
        },
        { status: 403 },
      );
    }

    const asset = await prisma.asset.findFirst({
      where: {
        id: context.params.assetId,
        bucket: { in: ["parent-documents", "shared-documents"] },
        path: {
          startsWith: `${dashboard.club.id}/${dashboard.athlete.id}/`,
        },
      },
    });

    if (!asset?.data_base64) {
      return NextResponse.json(
        {
          data: null,
          error: { message: "Documento non trovato" },
        },
        { status: 404 },
      );
    }

    const base64 = asset.data_base64.includes(",")
      ? asset.data_base64.split(",").pop() || ""
      : asset.data_base64;
    const body = Buffer.from(base64, "base64");

    /*
      Anche il genitore deve poter **guardare** un documento, non solo
      scaricarlo: la risposta era sempre `attachment` e senza `nosniff`
      (RC Fix 1, punto 8).
    */
    return buildStoredFileResponse({
      content: body,
      mimeType: asset.mime_type,
      fileName: asset.file_name || "documento",
      download: new URL(request.url).searchParams.has("download"),
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        data: null,
        error: {
          message: publicErrorMessage(error, "Errore download documento"),
        },
      },
      { status: 500 },
    );
  }
}
