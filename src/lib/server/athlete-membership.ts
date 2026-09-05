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

/**
 * **«Di quali di queste schede questa persona e, o e stata, l'account?»**
 * (PP-04, ADR-0123).
 *
 * ---
 *
 * ## Perche `athletes.user_id` non bastava
 *
 * ADR-0122 ha reso esclusivo il ramo diretto di `athleteBelongsToParent`: chi
 * porta `athletes.user_id` e quella scheda, non la sua famiglia, e per lui il
 * ramo del tutore non viene nemmeno valutato. La condizione era pero scritta
 * **sul campo che la revoca cancella**.
 *
 * Un terzo giro di revisione ostile lo ha misurato: `unlinkAthleteAccount` e
 * `revokeAthleteAccess` azzerano `athletes.user_id`, e da quel momento la
 * stessa identita torna a passare dal ramo del tutore — dove `guardians[].email`
 * vale come legame, e dove la casella di famiglia e quasi sempre la stessa su
 * cui il ragazzo era stato invitato. `GET /api/v1/athlete-accounts/me`
 * rispondeva **403** e `GET /api/parent-dashboard/<la stessa scheda>`
 * rispondeva **200**, con quote, ricevute, diagnosi, indirizzo del file del
 * certificato e codice fiscale dei tutori. La guardia era un cortocircuito su
 * un campo, non una domanda sull'identita.
 *
 * ## Cosa risponde alla domanda, e perche sopravvive alla revoca
 *
 * `athlete_account_invites`. La riga di un invito **accettato** dice «questa
 * utenza e diventata l'account di questa scheda», e ne la revoca ne lo
 * scollegamento la cancellano: la revoca scrive `revoked_at` sull'invito
 * accettato **senza toccarne lo `status`** (ADR-0115), e lo scollegamento non
 * lo guarda proprio. E percio il solo fatto durevole che c'e.
 *
 * Si contano solo gli inviti **accettati**: un invito mandato per errore alla
 * persona sbagliata, e mai riscattato, non deve togliere a nessuno l'area
 * della propria famiglia.
 *
 * ## Il caso che questa funzione chiude fuori, e va detto
 *
 * Un tutore che avesse **riscattato per errore** l'invito atleta del proprio
 * figlio resta fuori dal ramo del tutore su quella scheda anche dopo lo
 * scollegamento, perche l'invito accettato resta in archivio. E il prezzo
 * dell'unico fatto durevole disponibile, ed e il verso giusto: il caso raro e
 * ripulibile, la perdita di dati clinici no.
 */
export const athleteCardsEverOwnedByUser = async (
  userId: string,
  athleteIds: readonly string[],
): Promise<Set<string>> => {
  const id = String(userId ?? "").trim();
  const schede = Array.from(new Set(athleteIds.filter(Boolean)));
  if (!id || !schede.length) return new Set();

  const inviti = await prisma.athleteAccountInvite.findMany({
    where: {
      user_id: id,
      athlete_id: { in: schede },
      accepted_at: { not: null },
    },
    select: { athlete_id: true },
  });

  return new Set(inviti.map((riga) => String(riga.athlete_id)));
};
