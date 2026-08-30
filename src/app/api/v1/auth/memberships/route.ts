import { NextResponse } from "next/server";
import { prisma } from "@/lib/server/prisma";
import { requireAuthenticatedUser } from "@/lib/server/auth";

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
    const [memberships, ownedClubs] = await Promise.all([
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

    const ridotto = (club: any) =>
      club ? { ...club, settings: soloStagioni(club.settings) } : club;

    const membershipRows = memberships.map((membership) => ({
      ...membership,
      access_kind: "membership",
      is_ownership_record: false,
      organization: ridotto(membership.organization),
      organizations: ridotto(membership.organization),
    }));

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
