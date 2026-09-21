import { NextResponse } from "next/server";
import {
  requireAuthenticatedUser,
  resolveOrganizationScopeForUser,
} from "@/lib/server/auth";
import { assertClubResourceAccess } from "@/lib/access-roles";
import { convertDocxToHtml, DocxImportError } from "@/lib/server/docx-import";

/**
 * **L'anteprima di un `.docx` come base per un modello di documento**
 * (mandato multi-stagione E5-E12). Converte e basta: non scrive niente in
 * `document_templates`. Il salvataggio passa dalla rotta generica gia
 * esistente per quella risorsa, con l'HTML di questa risposta come
 * `content_html` — nessun secondo scrittore.
 *
 * Stesso permesso di chi puo creare un modello (`document_templates`,
 * azione `create`): l'import e un modo di iniziarne uno, non un accesso in
 * piu.
 */
export const runtime = "nodejs";
export const maxDuration = 30;

const DOCX_MIME_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export async function POST(request: Request) {
  try {
    const session = await requireAuthenticatedUser(request);
    if (!session) {
      return NextResponse.json({ data: null, error: { message: "Sessione non valida" } }, { status: 401 });
    }

    const scope = await resolveOrganizationScopeForUser(
      session.db.user_id,
      request.headers.get("x-active-club-id"),
      request.headers.get("x-active-access-role"),
    );
    assertClubResourceAccess(scope.activeRole, "document_templates", "create");

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ data: null, error: { message: "Nessun file ricevuto" } }, { status: 400 });
    }

    /*
      **Ne il MIME dichiarato ne il nome, da soli**: un file rinominato
      `.docx` che il browser dichiara come tale ma che il contenuto smentisce
      viene comunque fermato dentro `convertDocxToHtml` (l'archivio non si
      apre, o non e uno zip). Qui si controllano entrambi i segnali esterni
      prima di spendere anche un solo ciclo di conversione.
    */
    const nomeFile = String(file.name || "").toLowerCase();
    const tipoDichiarato = String(file.type || "").toLowerCase();
    if (!nomeFile.endsWith(".docx") || (tipoDichiarato && tipoDichiarato !== DOCX_MIME_TYPE)) {
      return NextResponse.json(
        { data: null, error: { message: "Sono accettati solo file .docx" } },
        { status: 400 },
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const risultato = await convertDocxToHtml(buffer);

    return NextResponse.json({ data: risultato, error: null });
  } catch (error: any) {
    const status = error instanceof DocxImportError ? 400 : String(error?.message || "").includes("Accesso negato") ? 403 : 400;
    return NextResponse.json(
      { data: null, error: { message: error?.message || "Errore nell'import del documento" } },
      { status },
    );
  }
}
