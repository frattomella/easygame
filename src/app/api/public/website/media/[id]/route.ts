import { NextResponse } from "next/server";
import { readPublicWebsiteMedia } from "@/lib/server/website/media";
import { readRequestId, reportServerError } from "@/lib/server/observability";

/**
 * **Un file della libreria del sito**, per il pubblico (ADR-0200 §9).
 *
 * Nessuna sessione: un'immagine del sito e pubblica per natura e il suo
 * identificativo e opaco. Fuori da qui non esce niente che non sia del sito
 * (un documento, un certificato): `readPublicWebsiteMedia` accetta solo
 * allegati `owner_type = website` di un formato immagine, e una foto di
 * persona solo se la policy di pubblicazione la lascia passare **adesso**.
 *
 * Le immagini della libreria non cambiano mai di contenuto (non esiste una
 * sostituzione), quindi si mettono in cache a lungo. Le foto delle persone no:
 * una revoca del consenso deve fermarle entro pochi minuti, anche nelle cache.
 */
export const runtime = "nodejs";

type Context = { params: { id: string } };

export async function GET(request: Request, { params }: Context) {
  try {
    const media = await readPublicWebsiteMedia(params.id);
    if (!media) {
      return new NextResponse("Not found", { status: 404, headers: { "Cache-Control": "public, max-age=60" } });
    }
    return new NextResponse(new Uint8Array(media.content), {
      status: 200,
      headers: {
        "Content-Type": media.mimeType,
        "Content-Length": String(media.content.length),
        "Cache-Control": media.isPersonPhoto
          ? "public, max-age=300, s-maxage=300"
          : "public, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'",
        "Cross-Origin-Resource-Policy": "cross-origin",
      },
    });
  } catch (error) {
    reportServerError(error, { requestId: readRequestId(request), route: "/api/public/website/media/[id]", method: "GET" });
    return new NextResponse("Errore", { status: 500 });
  }
}
