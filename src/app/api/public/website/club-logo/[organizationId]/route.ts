import { NextResponse } from "next/server";
import { readClubLogoForWebsite } from "@/lib/server/website/public-logos";

/**
 * Il logo del club per il suo sito: letto dall'anagrafica a ogni richiesta
 * (con un'ora di cache), cosi un logo cambiato nel gestionale arriva al sito
 * senza copie. Solo immagini raster; solo per un club che ha un sito.
 */
export const runtime = "nodejs";

type Context = { params: { organizationId: string } };

export async function GET(_request: Request, { params }: Context) {
  const logo = await readClubLogoForWebsite(params.organizationId).catch(() => null);
  if (!logo) return new NextResponse("Not found", { status: 404, headers: { "Cache-Control": "public, max-age=300" } });
  if ("redirect" in logo) return NextResponse.redirect(logo.redirect, 302);
  return new NextResponse(new Uint8Array(logo.content), {
    headers: {
      "Content-Type": logo.mimeType,
      "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
      "X-Content-Type-Options": "nosniff",
      "Cross-Origin-Resource-Policy": "cross-origin",
    },
  });
}
