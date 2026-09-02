import { NextResponse } from "next/server";
import { prisma } from "@/lib/server/prisma";
import { requireAuthenticatedUser, risolviTessere } from "@/lib/server/auth";
import { normalizeAccessRole } from "@/lib/access-roles";
import { getParentLinkedAthletes } from "@/lib/server/parent-dashboard";

export async function GET(request: Request) {
  try {
    const session = await requireAuthenticatedUser(request);
    if (!session) {
      return NextResponse.json(
        {
          data: [],
          error: { message: "Sessione non valida" },
        },
        { status: 401 },
      );
    }

    const clubSummarySelect = {
      id: true,
      name: true,
      logo_url: true,
      creator_id: true,
      contact_email: true,
      contact_phone: true,
      city: true,
      province: true,
      created_at: true,
      settings: true,
    } as const;

    /**
     * **Di `settings` esce la sola parte che il client legge.**
     *
     * Questa rotta sceglie le colonne a mano, quindi non passa da
     * `serializeRecord` e non conosce `CLUB_CAMPI_DI_IDENTITA`: mandava
     * l'intero `clubs.settings` — piano e stato dell'abbonamento, riferimento
     * della firma, `paymentSettings`, campi fiscali storici — di **ogni**
     * club dell'utente, attivo o no. E la colonna JSON piu grande della riga,
     * e contraddiceva l'invariante che il resto della Wave ha costruito: del
     * club non attivo escono le sole colonne che servono a sceglierlo.
     *
     * Il client ne legge una cosa sola: le stagioni
     * (`AuthProvider.buildActiveClubFromMembership`).
     */
    const soloStagioni = (settings: unknown) => {
      const valore = settings && typeof settings === "object" ? (settings as any) : {};
      return { seasons: valore.seasons ?? null };
    };

    // Letture indipendenti, eseguite in parallelo: questa rotta e sul percorso
    // critico di ogni caricamento di pagina (AuthProvider).
    const [tessereGrezze, ownedClubs] = await Promise.all([
      prisma.organizationUser.findMany({
        where: {
          user_id: session.db.user_id,
        },
        include: {
          organization: {
            select: clubSummarySelect,
          },
        },
        orderBy: [{ is_primary: "desc" }, { created_at: "asc" }],
      }),
      prisma.club.findMany({
        where: {
          creator_id: session.db.user_id,
        },
        select: clubSummarySelect,
        orderBy: { created_at: "asc" },
      }),
    ]);

    /**
     * **Una tessera che non si puo risolvere non si elenca.**
     *
     * Questa rotta e cio che il browser usa per **disegnare il selettore dei
     * club**: `AuthProvider` ne costruisce `activeClub`, e il ruolo che ne
     * legge lo rimanda poi come `x-active-access-role`. Elencava le tessere
     * grezze, quindi elencava anche quelle che `resolveOrganizationScopeForUser`
     * scarta:
     *
     *   * `role` con uno slug `custom:<base>:<slug>` e `custom_role_id` nullo;
     *   * `custom_role_id` che punta a un ruolo cancellato, disattivato, di un
     *     altro club, o il cui slug non corrisponde piu a `role`.
     *
     * L'effetto non era estetico. Il club compariva nell'elenco con
     * un'etichetta di ruolo ricavata dallo slug; chi lo sceglieva otteneva dal
     * risolutore di scope `activeRole: null` e trovava ogni schermata vuota o
     * negata, senza che niente dicesse perche. Peggio: se quella era l'unica
     * tessera del club, il club stesso non e nemmeno in
     * `allowedOrganizationIds`, e l'intera sessione lavorava su un club a cui
     * non aveva accesso.
     *
     * La regola non si riscrive qui: la **si chiama**, ed e la stessa funzione
     * che decide il ruolo attivo. Due copie divergerebbero, e la copia che
     * mente sarebbe proprio quella che disegna il menu.
     */
    const idCoerenti = new Set(
      (await risolviTessere(tessereGrezze)).map((tessera) => tessera.id),
    );
    const memberships = tessereGrezze.filter((tessera) =>
      idCoerenti.has(tessera.id),
    );

    const ridotto = (club: any) =>
      club ? { ...club, settings: soloStagioni(club.settings) } : club;

    /**
     * **Il legame genitore-figlio deve sopravvivere a un F5.**
     *
     * L'elenco dei figli lo calcolava soltanto l'attivazione del club, e
     * finiva in `localStorage`. Un ricaricamento della pagina ricostruisce
     * `activeClub` da **questa** rotta, che non lo conosceva: la guardia
     * d'area non trovava nessun figlio e rimandava su `/account` un genitore
     * che era esattamente dov'era autorizzato a stare.
     *
     * Il calcolo costa solo a chi ha davvero un accesso famiglia, ed e sempre
     * lo stesso proprietario della domanda — mai una seconda risoluzione del
     * legame.
     */
    const ruoliFamiglia = ["parent", "athlete"];
    const accessiFamiglia = memberships.filter((membership) =>
      ruoliFamiglia.includes(normalizeAccessRole(membership.role)),
    );
    const figli: string[] = [];
    const seStesso: string[] = [];
    if (accessiFamiglia.length) {
      const linkedAthletes = await getParentLinkedAthletes(session.db.user_id);
      for (const athlete of linkedAthletes) {
        /*
          **L'elenco non si filtra per club, e non e una svista.**

          La guardia d'area risponde alla domanda «questo profilo e uno dei
          miei», che riguarda la persona e non la societa: un genitore con un
          figlio in due societa diverse cambia figlio senza passare da
          `/account`, ed e uno degli scenari che il collaudo pretende. Il
          confine vero resta sul server — `/api/parent-dashboard/:id` risolve
          di nuovo il legame a ogni lettura — e questo elenco governa solo
          quale percorso il browser puo aprire.
        */
        figli.push(String(athlete.id));
        /*
          L'atleta e se stesso, non i propri fratelli: chi entra con il ruolo
          atleta apre la **propria** scheda, e il legame di tutela vale solo
          nell'area genitore.
        */
        if (String(athlete.user_id || "") === session.db.user_id) {
          seStesso.push(String(athlete.id));
        }
      }
    }

    const membershipRows = memberships.map((membership) => {
      const ruolo = normalizeAccessRole(membership.role);
      const linkedAthleteIds =
        ruolo === "parent" ? figli : ruolo === "athlete" ? seStesso : [];

      return {
        ...membership,
        access_kind: "membership",
        is_ownership_record: false,
        linked_athlete_ids: linkedAthleteIds,
        linked_athlete_id: linkedAthleteIds[0] || null,
        organization: ridotto(membership.organization),
        organizations: ridotto(membership.organization),
      };
    });

    const ownershipRows = ownedClubs.map((club) => {
      const matchingPrimaryMembership = memberships.find(
        (membership) =>
          membership.organization_id === club.id &&
          membership.role === "owner" &&
          membership.is_primary,
      );

      return {
        id: `ownership:${club.id}`,
        organization_id: club.id,
        user_id: session.db.user_id,
        role: "owner",
        is_primary: Boolean(matchingPrimaryMembership),
        access_kind: "ownership",
        is_ownership_record: true,
        created_at: club.created_at,
        updated_at: club.created_at,
        organization: ridotto(club),
        organizations: ridotto(club),
      };
    });

    return NextResponse.json({
      data: [...ownershipRows, ...membershipRows],
      error: null,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        data: [],
        error: { message: error?.message || "Errore caricamento membership" },
      },
      { status: 500 },
    );
  }
}
