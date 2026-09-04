import { prisma } from "./prisma";
import { normalizeAccessRole } from "@/lib/access-roles";

/**
 * **«Questa persona e ancora un atleta di questo club?»** (ADR-0114, esteso da
 * ADR-0117).
 *
 * ---
 *
 * ## Perche e un modulo e non una riga
 *
 * Perche la stessa domanda ha **due lettori**, e finche ne aveva uno solo il
 * secondo rispondeva di si a chi non doveva.
 *
 * `athletes.user_id` e un legame, e un legame puo restare indietro rispetto
 * alla tessera: due strade lo producono, entrambe misurate contro PostgreSQL —
 * il cambio di ruolo (`assignClubRole` cancella le tessere sostituite senza
 * chiamare nessuno sweep) e la revoca di una tessera il cui slug non e fra i
 * tre che lo sweep riconosce. ADR-0114 ha chiuso `findAthleteProfileForUser`,
 * cioe la porta dell'area atleta. Ma **lo stesso campo** ha un secondo lettore,
 * `athleteBelongsToParent` in `parent-dashboard.ts`, e quello consegna
 * strettamente **di piu**: denaro, tutori, contenuto clinico, e delle
 * scritture.
 *
 * Una revisione ostile lo ha misurato: con **zero tessere** nel club,
 * `GET /api/v1/athlete-accounts/me` rispondeva 403 e
 * `GET /api/parent-dashboard/<la stessa scheda>` rispondeva 200, e un
 * `PATCH .../notifications` scriveva. La porta d'ingresso era chiusa e quella
 * di servizio dava su una stanza piu grande.
 *
 * Mettere la stessa condizione anche li, **copiata**, sarebbe stato il difetto
 * di partenza con un nome nuovo: due elenchi che divergono. Qui c'e una
 * funzione sola, e i due lettori la chiamano.
 *
 * ## Cosa conta come «ancora atleta»
 *
 * Una tessera in quel club il cui ruolo **risolto** — alias e ruoli
 * personalizzati compresi, quindi `normalizeAccessRole(base_role ?? role)` —
 * vale `athlete`. Non un elenco di slug: il difetto **e** un elenco di slug,
 * e `normalizeAccessRole` e il vocabolario unico del repository.
 *
 * Piu l'essere `clubs.creator_id`, la cui appartenenza non nasce da una
 * tessera e che percio non si potrebbe chiudere fuori da casa propria.
 *
 * Questo modulo non scrive niente: `athletes.user_id` resta di
 * `athlete-accounts.ts` (ADR-0104).
 */
export const clubsWhereStillAthlete = async (
  userId: string,
  organizationIds: readonly string[],
): Promise<Set<string>> => {
  const id = String(userId ?? "").trim();
  const clubs = Array.from(new Set(organizationIds.filter(Boolean)));
  if (!id || !clubs.length) return new Set();

  const [tessere, fondati] = await Promise.all([
    prisma.organizationUser.findMany({
      where: { user_id: id, organization_id: { in: clubs } },
      select: {
        organization_id: true,
        role: true,
        custom_role: { select: { base_role: true } },
      },
    }),
    prisma.club.findMany({
      where: { id: { in: clubs }, creator_id: id },
      select: { id: true },
    }),
  ]);

  return new Set([
    ...tessere
      .filter(
        (tessera) =>
          normalizeAccessRole(
            tessera.custom_role?.base_role || tessera.role,
          ) === "athlete",
      )
      .map((tessera) => tessera.organization_id),
    ...fondati.map((riga) => riga.id),
  ]);
};
