import { prisma } from "./prisma";
import {
  buildSeasonContext,
  readRequestedSeason,
  type RequestedSeason,
  type SeasonContext,
} from "@/lib/seasons/context";

export {
  buildSeasonContext,
  readRequestedSeason,
  recordBelongsToSeason,
  seasonIdForNewRecord,
  seasonLabelOf,
  seasonWhere,
} from "@/lib/seasons/context";
export type { RequestedSeason, SeasonContext, SeasonContextKind } from "@/lib/seasons/context";

/**
 * Il contesto di stagione di una richiesta, letto dal club (ADR-0197).
 *
 * `requested` e cio che la richiesta dichiara: la `Request` stessa (si legge
 * `x-active-season-id`), un parametro esplicito, o niente. Un lavoro di
 * sfondo passa `undefined` e riceve la stagione attiva del club.
 *
 * Una sola lettura di `clubs.settings`, e chi ha gia il club in mano usa la
 * versione pura (`buildSeasonContext`) senza una query in piu.
 */
export const resolveSeasonContext = async (
  organizationId: string | null | undefined,
  requested?: Request | Headers | string | RequestedSeason | null,
): Promise<SeasonContext> => {
  const declared: RequestedSeason =
    requested && typeof requested === "object" && "declared" in requested
      ? requested
      : readRequestedSeason(requested as Request | Headers | string | null | undefined);

  if (!organizationId) {
    return buildSeasonContext({}, declared);
  }

  const club = await prisma.club.findUnique({
    where: { id: organizationId },
    select: { settings: true },
  });

  return buildSeasonContext(club?.settings ?? {}, declared);
};
