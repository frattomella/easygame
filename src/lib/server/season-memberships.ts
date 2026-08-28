import { prisma } from "./prisma";

/**
 * I tesserati che passano da una stagione all'altra (W1-A, gap G-01).
 *
 * **Il problema che questo modulo chiude.** Fino alla Wave 1 il riporto di
 * stagione portava categorie e gruppi operativi, e non i tesserati: il club
 * apriva la stagione nuova, leggeva «6 voci create» e si ritrovava le squadre
 * vuote, con le schede degli atleti che citavano ancora una categoria
 * archiviata. Nessuna schermata lo diceva.
 *
 * **Dove vivono le appartenenze.** In `athlete_category_memberships`, una
 * tabella — non una collezione JSON di `clubs.settings`. Per questo il riporto
 * non le puo clonare dentro `planSeasonRollover`, che lavora sulle collezioni:
 * qui si riusa l'`idMap` che il piano ha gia costruito (categoria d'origine →
 * categoria di destinazione) e si scrive in blocco.
 *
 * **Cosa NON fa.** Non cancella niente. Un tesserato non riconfermato resta
 * dov'e, con la sua storia intatta: semplicemente non entra nelle squadre della
 * stagione nuova.
 *
 * **La bandiera «primaria» si sposta, e va detto.** Il database ammette una
 * sola appartenenza primaria per atleta **per club** (indice unico parziale
 * `athlete_category_memberships_single_primary_per_athlete`), non una per
 * stagione: «primaria» significa «la squadra in cui l'atleta sta adesso».
 * Riportare un tesserato quindi sposta quella bandiera sulla riga nuova e la
 * toglie da quella vecchia. La riga della stagione precedente **resta**, con la
 * sua categoria e la sua sede: cambia solo il fatto che non e piu la squadra
 * corrente. E la stessa ragione per cui si riallinea `athletes.category_id`,
 * che altrimenti continuerebbe a mostrare una categoria archiviata.
 */

export type SeasonRosterMembership = {
  membershipId: string;
  categoryId: string;
  categoryName: string;
  siteId: string | null;
  isPrimary: boolean;
};

export type SeasonRosterAthlete = {
  athleteId: string;
  firstName: string;
  lastName: string;
  fullName: string;
  status: string;
  memberships: SeasonRosterMembership[];
};

export type SeasonRoster = {
  athletes: SeasonRosterAthlete[];
  total: number;
};

export type SeasonMembershipRolloverSummary = {
  /**
   * Appartenenze presenti nella stagione di origine. E il numero confrontabile
   * con l'`available` degli altri tipi riportabili, che contano **record** e
   * non persone: un atleta in due squadre e un tesserato e due appartenenze.
   */
  sourceMemberships: number;
  /** Tesserati che la stagione di origine propone. */
  proposed: number;
  /** Tesserati che l'operatore ha riconfermato. */
  confirmed: number;
  /** Proposti e non riconfermati: restano in archivio, non si toccano. */
  notConfirmed: number;
  /** Appartenenze create adesso. */
  created: number;
  /** Appartenenze gia presenti in destinazione: il secondo riporto non duplica. */
  alreadyPresent: number;
  /** Appartenenze di un riconfermato senza categoria di destinazione. */
  unmappable: number;
  /** Atleti con almeno un'appartenenza nella stagione nuova dopo il riporto. */
  carried: number;
  /** `true` se il tipo «Tesserati nelle squadre» era fra quelli scelti. */
  requested: boolean;
};

const emptySummary = (
  sourceMemberships: number,
  proposed: number,
  requested: boolean,
): SeasonMembershipRolloverSummary => ({
  sourceMemberships,
  proposed,
  confirmed: 0,
  notConfirmed: proposed,
  created: 0,
  alreadyPresent: 0,
  unmappable: 0,
  carried: 0,
  requested,
});

const readMembershipsForCategories = async (
  organizationId: string,
  categoryIds: string[],
) => {
  if (!categoryIds.length) {
    return [];
  }

  return prisma.athleteCategoryMembership.findMany({
    where: {
      organization_id: organizationId,
      category_id: { in: categoryIds },
    },
    select: {
      id: true,
      athlete_id: true,
      category_id: true,
      category_name: true,
      site_id: true,
      is_primary: true,
    },
    orderBy: { created_at: "asc" },
  });
};

/**
 * L'elenco che l'operatore vede al passo di riconferma: chi c'era nella
 * stagione di origine, in quale squadra e in quale sede.
 *
 * Non pagina. A 200 tesserati la risposta pesa poche decine di kB e l'elenco
 * deve poter essere scorso tutto per decidere: paginare una scelta di questo
 * tipo la renderebbe piu lenta, non piu leggera. Sopra il migliaio di tesserati
 * va rivisto, ed e dichiarato nel debito tecnico.
 */
export const listSeasonRoster = async (options: {
  organizationId: string;
  sourceCategoryIds: string[];
  categoryNameById?: Record<string, string>;
}): Promise<SeasonRoster> => {
  const { organizationId, sourceCategoryIds, categoryNameById = {} } = options;

  const memberships = await readMembershipsForCategories(
    organizationId,
    sourceCategoryIds,
  );

  if (!memberships.length) {
    return { athletes: [], total: 0 };
  }

  const athleteIds = Array.from(
    new Set(memberships.map((membership) => membership.athlete_id)),
  );

  const athletes = await prisma.athlete.findMany({
    where: { organization_id: organizationId, id: { in: athleteIds } },
    select: {
      id: true,
      first_name: true,
      last_name: true,
      status: true,
    },
  });

  const byAthlete = new Map<string, SeasonRosterAthlete>();

  for (const athlete of athletes) {
    const firstName = String(athlete.first_name || "").trim();
    const lastName = String(athlete.last_name || "").trim();
    byAthlete.set(athlete.id, {
      athleteId: athlete.id,
      firstName,
      lastName,
      fullName: [lastName, firstName].filter(Boolean).join(" ") || "Senza nome",
      status: String(athlete.status || "active"),
      memberships: [],
    });
  }

  for (const membership of memberships) {
    const athlete = byAthlete.get(membership.athlete_id);
    if (!athlete) {
      // L'atleta non c'e piu (o non e di questo club): l'appartenenza non ha
      // nessuno da riportare.
      continue;
    }

    athlete.memberships.push({
      membershipId: membership.id,
      categoryId: membership.category_id,
      categoryName:
        categoryNameById[membership.category_id] ||
        String(membership.category_name || "").trim() ||
        "Categoria senza nome",
      siteId: membership.site_id,
      isPrimary: Boolean(membership.is_primary),
    });
  }

  const list = Array.from(byAthlete.values())
    .filter((athlete) => athlete.memberships.length > 0)
    .sort((left, right) =>
      left.fullName.localeCompare(right.fullName, "it", {
        sensitivity: "base",
      }),
    );

  return { athletes: list, total: list.length };
};

/**
 * Quanti tesserati ha ogni stagione. Una sola interrogazione per tutte: il
 * riepilogo delle stagioni non deve costare una lettura per stagione.
 */
export const countSeasonMemberships = async (options: {
  organizationId: string;
  seasons: Array<{ id: string; categoryIds: string[] }>;
}): Promise<{ bySeason: Record<string, number> }> => {
  const { organizationId, seasons } = options;
  const allCategoryIds = Array.from(
    new Set(seasons.flatMap((season) => season.categoryIds)),
  );

  const bySeason: Record<string, number> = {};
  for (const season of seasons) {
    bySeason[season.id] = 0;
  }

  if (!allCategoryIds.length) {
    return { bySeason };
  }

  const rows = await prisma.athleteCategoryMembership.findMany({
    where: {
      organization_id: organizationId,
      category_id: { in: allCategoryIds },
    },
    select: { athlete_id: true, category_id: true },
  });

  for (const season of seasons) {
    const categoryIds = new Set(season.categoryIds);
    const athletes = new Set(
      rows
        .filter((row) => categoryIds.has(row.category_id))
        .map((row) => row.athlete_id),
    );
    bySeason[season.id] = athletes.size;
  }

  return { bySeason };
};

/**
 * Gli atleti attivi che non appartengono a nessuna squadra della stagione data.
 * E il numero che il club deve vedere subito dopo un cambio di stagione: senza,
 * il vuoto lo si scopre a settembre.
 */
export const countAthletesWithoutTeam = async (options: {
  organizationId: string;
  categoryIds: string[];
}): Promise<number> => {
  const { organizationId, categoryIds } = options;

  /*
    Due letture di soli identificativi, e la differenza si fa qui. Un `some`
    sulla relazione la farebbe fare al database in una interrogazione sola, ma
    su un numero di atleti dell'ordine delle centinaia il guadagno e nullo e il
    costo e una condizione che nessun test puo esprimere: preferisco una
    lettura in piu e una verifica che prova davvero qualcosa.
  */
  const athletes = await prisma.athlete.findMany({
    where: { organization_id: organizationId },
    select: { id: true, status: true },
  });

  const active = athletes.filter(
    (athlete) => String(athlete.status || "active") !== "inactive",
  );

  if (!active.length) {
    return 0;
  }
  if (!categoryIds.length) {
    return active.length;
  }

  const rows = await prisma.athleteCategoryMembership.findMany({
    where: {
      organization_id: organizationId,
      category_id: { in: categoryIds },
    },
    select: { athlete_id: true },
  });

  const withTeam = new Set(rows.map((row) => row.athlete_id));

  return active.filter((athlete) => !withTeam.has(athlete.id)).length;
};

/**
 * Porta le appartenenze nella stagione nuova.
 *
 * Idempotente per costruzione: l'unicita `(organization_id, athlete_id,
 * category_id)` e il vincolo che impedisce la seconda copia, quindi due riporti
 * — anche **simultanei** — non possono produrre un doppione. Il conteggio di
 * cio che e stato creato lo dice il database, non una previsione fatta prima.
 *
 * Restituisce sempre un riepilogo, anche quando il tipo non e stato scelto:
 * dire «0 tesserati riportati» e il difetto che questa Wave chiude.
 */
export const runAthleteMembershipRollover = async (options: {
  organizationId: string;
  /** Categorie della stagione di origine. */
  sourceCategoryIds: string[];
  /** Da categoria d'origine a categoria di destinazione. */
  categoryIdMap: Record<string, string>;
  /** Nome delle categorie di destinazione, per la colonna denormalizzata. */
  targetCategoryNameById?: Record<string, string>;
  /** `null` o assente: tutti i proposti. Un elenco: solo quelli. */
  confirmedAthleteIds?: string[] | null;
  /** `false` quando «Tesserati nelle squadre» non e fra i tipi scelti. */
  requested: boolean;
  preview?: boolean;
}): Promise<SeasonMembershipRolloverSummary> => {
  const {
    organizationId,
    sourceCategoryIds,
    categoryIdMap,
    targetCategoryNameById = {},
    confirmedAthleteIds = null,
    requested,
    preview = false,
  } = options;

  const memberships = await readMembershipsForCategories(
    organizationId,
    sourceCategoryIds,
  );

  const proposedAthleteIds = new Set(
    memberships.map((membership) => membership.athlete_id),
  );
  const proposed = proposedAthleteIds.size;

  if (!requested || !proposed) {
    return emptySummary(memberships.length, proposed, requested);
  }

  const confirmed = confirmedAthleteIds
    ? new Set(
        confirmedAthleteIds
          .map((id) => String(id || "").trim())
          .filter((id) => proposedAthleteIds.has(id)),
      )
    : new Set(proposedAthleteIds);

  const rows: Array<{
    organization_id: string;
    athlete_id: string;
    category_id: string;
    category_name: string | null;
    site_id: string | null;
    is_primary: boolean;
  }> = [];
  const primaryByAthlete = new Map<string, string>();
  /**
   * La prima squadra portata per un atleta che in origine non ne aveva una
   * primaria. Serve solo a riallineare `athletes.category_id`: senza, la sua
   * scheda continuerebbe a citare la categoria archiviata, che e la meta
   * visibile del difetto G-01. La bandiera **non** gliela si inventa.
   */
  const fallbackCategoryByAthlete = new Map<string, string>();
  const carriedAthletes = new Set<string>();
  let unmappable = 0;

  for (const membership of memberships) {
    if (!confirmed.has(membership.athlete_id)) {
      continue;
    }

    const targetCategoryId = categoryIdMap[membership.category_id];
    if (!targetCategoryId) {
      unmappable += 1;
      continue;
    }

    rows.push({
      organization_id: organizationId,
      athlete_id: membership.athlete_id,
      category_id: targetCategoryId,
      category_name:
        targetCategoryNameById[targetCategoryId] || membership.category_name,
      site_id: membership.site_id,
      is_primary: Boolean(membership.is_primary),
    });
    carriedAthletes.add(membership.athlete_id);

    if (membership.is_primary) {
      primaryByAthlete.set(membership.athlete_id, targetCategoryId);
    } else if (!fallbackCategoryByAthlete.has(membership.athlete_id)) {
      fallbackCategoryByAthlete.set(membership.athlete_id, targetCategoryId);
    }
  }

  const summary: SeasonMembershipRolloverSummary = {
    sourceMemberships: memberships.length,
    proposed,
    confirmed: confirmed.size,
    notConfirmed: proposed - confirmed.size,
    created: 0,
    alreadyPresent: 0,
    unmappable,
    carried: carriedAthletes.size,
    requested,
  };

  if (!rows.length) {
    return summary;
  }

  if (preview) {
    // L'anteprima non scrive: conta quante di queste righe esistono gia, cosi
    // il numero annunciato e quello che verra creato.
    const existing = await prisma.athleteCategoryMembership.findMany({
      where: {
        organization_id: organizationId,
        athlete_id: { in: Array.from(carriedAthletes) },
        category_id: {
          in: Array.from(new Set(rows.map((row) => row.category_id))),
        },
      },
      select: { athlete_id: true, category_id: true },
    });
    const existingKeys = new Set(
      existing.map((row) => `${row.athlete_id}:${row.category_id}`),
    );
    const alreadyPresent = rows.filter((row) =>
      existingKeys.has(`${row.athlete_id}:${row.category_id}`),
    ).length;

    summary.alreadyPresent = alreadyPresent;
    summary.created = rows.length - alreadyPresent;
    return summary;
  }

  const created = await prisma.$transaction(async (tx) => {
    // La bandiera «primaria» si sposta prima dell'inserimento, altrimenti
    // l'indice unico parziale rifiuterebbe la riga nuova.
    const movingPrimary = Array.from(primaryByAthlete.keys());
    if (movingPrimary.length) {
      await tx.athleteCategoryMembership.updateMany({
        where: {
          organization_id: organizationId,
          athlete_id: { in: movingPrimary },
          is_primary: true,
        },
        data: { is_primary: false },
      });
    }

    const result = await tx.athleteCategoryMembership.createMany({
      data: rows,
      skipDuplicates: true,
    });

    const athletesByTargetCategory = new Map<string, string[]>();
    for (const [athleteId, categoryId] of primaryByAthlete.entries()) {
      const bucket = athletesByTargetCategory.get(categoryId) || [];
      bucket.push(athleteId);
      athletesByTargetCategory.set(categoryId, bucket);
    }

    /*
      La bandiera si **riassegna** dopo l'inserimento, e non basta averla
      copiata nella riga nuova.

      Il difetto che questa riga chiude: se la riga di destinazione esisteva
      gia — il club aveva assegnato a mano qualche atleta alla squadra nuova,
      con `is_primary` falso — `ON CONFLICT DO NOTHING` la salta, e la bandiera
      appena tolta a quella vecchia non tornava su nessuno. L'atleta restava
      **senza squadra corrente**, mentre `athletes.category_id` diceva il
      contrario. E sicuro farlo qui perche il passo precedente ha gia azzerato
      ogni altra primaria di questi atleti.
    */
    for (const [categoryId, athleteIds] of athletesByTargetCategory.entries()) {
      await tx.athleteCategoryMembership.updateMany({
        where: {
          organization_id: organizationId,
          athlete_id: { in: athleteIds },
          category_id: categoryId,
        },
        data: { is_primary: true },
      });
    }

    // Riallineamento della colonna storica `athletes.category_id`: senza, la
    // scheda continuerebbe a mostrare la categoria della stagione archiviata.
    // Si scrive per categoria, non per atleta: 200 tesserati non devono
    // diventare 200 aggiornamenti.
    const alignByCategory = new Map<string, string[]>(
      [...athletesByTargetCategory].map(([key, ids]) => [key, [...ids]]),
    );
    for (const [athleteId, categoryId] of fallbackCategoryByAthlete.entries()) {
      if (primaryByAthlete.has(athleteId)) continue;
      const bucket = alignByCategory.get(categoryId) || [];
      bucket.push(athleteId);
      alignByCategory.set(categoryId, bucket);
    }

    for (const [categoryId, athleteIds] of alignByCategory.entries()) {
      await tx.athlete.updateMany({
        where: { organization_id: organizationId, id: { in: athleteIds } },
        data: {
          category_id: categoryId,
          category_name: targetCategoryNameById[categoryId] || null,
        },
      });
    }

    return result.count;
  });

  summary.created = created;
  summary.alreadyPresent = rows.length - created;

  return summary;
};
