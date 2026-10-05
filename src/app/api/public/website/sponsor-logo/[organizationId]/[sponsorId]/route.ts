import { NextResponse } from "next/server";
import { readSponsorLogoForWebsite } from "@/lib/server/website/public-logos";

/**
 * Il logo storico di uno sponsor in vetrina, letto dalla sua scheda. Uno
 * sponsor non in vetrina, o fuori dal suo periodo, non ha un logo pubblico.
 */
export const runtime = "nodejs";

type Context = { params: { organizationId: string; sponsorId: string } };

export async function GET(_request: Request, { params }: Context) {
  const logo = await readSponsorLogoForWebsite(params.organizationId, params.sponsorId).catch(() => null);
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
