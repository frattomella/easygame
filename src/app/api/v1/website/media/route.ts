import { websiteRoute } from "@/lib/server/website/route";
import { listWebsiteMedia, uploadWebsiteMedia } from "@/lib/server/website/media";

/**
 * La libreria immagini del sito: elenco con ricerca e caricamento
 * (multipart: `file`, `category`, `alt`, `title`). I byte passano dal servizio
 * allegati, unico archivio dei file di EasyGame.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return websiteRoute(request, async ({ scope }) => {
    const url = new URL(request.url);
    return listWebsiteMedia(scope, {
      q: url.searchParams.get("q"),
      category: url.searchParams.get("category"),
      cursor: url.searchParams.get("cursor"),
      take: url.searchParams.get("take"),
    });
  });
}

export async function POST(request: Request) {
  return websiteRoute(
    request,
    async ({ scope }) => {
      const form = await request.formData();
      const file = form.get("file");
      if (!file || typeof file === "string") throw new Error("Scegli un'immagine da caricare");
      const content = Buffer.from(await (file as File).arrayBuffer());
      return uploadWebsiteMedia(scope, {
        content,
        fileName: (file as File).name || "immagine",
        mimeType: (file as File).type || "",
        category: form.get("category"),
        alt: form.get("alt"),
        title: form.get("title"),
      });
    },
    { status: 201 },
  );
}
