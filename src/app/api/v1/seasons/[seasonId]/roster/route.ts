import { NextResponse } from "next/server";
import { readSeasonRoster } from "@/lib/server/seasons";
import {
  isSeasonRequestFailure,
  resolveSeasonRequestContext,
  seasonErrorResponse,
} from "../../season-request-context";

type Context = { params: { seasonId: string } };

export const runtime = "nodejs";

/**
 * I tesserati della stagione indicata nel percorso, con la loro squadra e la
 * loro sede.
 *
 * E l'elenco del passo di **riconferma**: prima di riportare qualcuno, il club
 * deve poter vedere chi sta per portare e togliere chi non rinnova. Non pagina
 * — e una scelta, non un'omissione: chi decide deve poter scorrere l'elenco
 * intero. Il peso della risposta e misurato nella UAT della Wave 1.
 */
export async function GET(request: Request, context: Context) {
  const requestContext = await resolveSeasonRequestContext(request);
  if (isSeasonRequestFailure(requestContext)) {
    return requestContext.response;
  }

  try {
    const roster = await readSeasonRoster({
      organizationId: requestContext.organizationId,
      seasonId: context.params.seasonId,
    });

    return NextResponse.json({ data: roster, error: null });
  } catch (error) {
    return seasonErrorResponse(error, 404);
  }
}
