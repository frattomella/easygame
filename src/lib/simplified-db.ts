import { supabase } from "./supabase";
import { apiRequest, readStoredActiveClub } from "./api/client";
import type { ListPageMeta } from "./api/client";
import { normalizeTrainerList } from "./trainer-utils";
import {
  getAthleteCategoryLabels,
  getPrimaryAthleteCategoryMembership,
  normalizeAthleteCategoryMemberships,
} from "./athlete-category-memberships";
import {
  athleteMatchesAnyCategory,
  buildClubCategoryOptions,
  resolveCategoryId,
  resolveCategoryLabel,
} from "./category-utils";
import { compareAthletesByLastName } from "./athlete-name-utils";
import {
  buildTrainingLocationOptions,
  findTrainingLocationOption,
  getFallbackTrainingLocationOptions,
} from "./training-location-options";
import {
  buildTrainingStart,
  compareTrainingsByStart,
  dedupeTrainings,
  formatLocalDateKey,
  formatTrainingTitle,
  getTrainingCategoryReferences,
  getTrainingEndTime,
  getTrainingStartTime,
  isUpcomingGeneratedTraining,
  isValidTimeRange,
  isScheduledTraining,
  resolveCategoryLabelForTraining,
  resolveExplicitWeeklyScheduleDay,
  resolveTrainingWeekday,
} from "./training-utils";
import {
  applySeasonIdToCollection,
  applySeasonIdToRecord,
  filterCollectionBySeason,
  isSeasonScopedDataType,
  normalizeClubSeasons,
} from "./club-seasons";
import {
  isPaymentExcludedFromTotals,
  isPaymentPaidLike,
} from "./payments/payment-status-utils";
import { calculatePlatformFee } from "./payments/platform-fees";
import {
  getAvailableRegistrationPaymentMethods,
  normalizePaymentSettings,
} from "./payments/payment-config-utils";

const CLUB_DIRECT_UPDATE_FIELDS = [
  "categories",
  "category_groups",
  "club_sites",
  "trainings",
  "weekly_schedule",
  "matches",
  "payment_plans",
  "discounts",
  "transactions",
  "sponsor_payments",
  "expected_income",
  "expected_expenses",
  "transfers",
  "procure",
  "secretariat_notes",
  "structures",
  "members",
  "staff_members",
  "sponsors",
  "bank_accounts",
  "document_templates",
  "opening_hours",
  "clothing_kits",
  "clothing_inventory",
  "clothing_products",
  "kit_assignments",
  "jersey_groups",
  "jersey_assignments",
  "dashboard_data",
] as const;

const ATHLETE_CATEGORY_MEMBERSHIPS_RESOURCE = "athlete_category_memberships";
const UUID_PATTERN =
  /^(?:urn:uuid:)?[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const isRecord = (value: unknown): value is Record<string, any> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const isMissingAthleteMembershipResource = (error: any) => {
  const message = String(error?.message || error || "").toLowerCase();
  return (
    message.includes("unsupported resource") ||
    message.includes("athlete_category_memberships") ||
    message.includes("athletecategorymembership") ||
    message.includes("does not exist")
  );
};

const serializeAthleteMemberships = (
  memberships: ReturnType<typeof normalizeAthleteCategoryMemberships>,
  {
    clubId,
    athleteId,
  }: {
    clubId?: string | null;
    athleteId?: string | null;
  } = {},
) =>
  memberships.map((membership) => ({
    id: membership.id,
    organization_id: membership.organizationId || clubId || null,
    athlete_id: membership.athleteId || athleteId || null,
    category_id: membership.categoryId,
    category_name: membership.categoryName,
    is_primary: membership.isPrimary,
    site_id: membership.siteId || null,
  }));

const hydrateAthleteWithMemberships = (
  athlete: any,
  memberships: any[] = [],
) => {
  if (!athlete || typeof athlete !== "object") {
    return athlete;
  }

  const data = isRecord(athlete.data) ? athlete.data : {};
  const normalizedMemberships = normalizeAthleteCategoryMemberships({
    ...athlete,
    data,
    category_memberships: memberships,
    categoryMemberships: memberships,
  });
  const primaryMembership = getPrimaryAthleteCategoryMembership(
    normalizedMemberships,
  );
  const serializedMemberships = serializeAthleteMemberships(normalizedMemberships, {
    clubId: athlete.organization_id || athlete.club_id || null,
    athleteId: athlete.id || null,
  });
  const categoryLabels = getAthleteCategoryLabels(normalizedMemberships);

  return {
    ...athlete,
    club_id: athlete.club_id || athlete.organization_id || null,
    category_id:
      primaryMembership?.categoryId ||
      athlete.category_id ||
      data.category ||
      null,
    category_name:
      primaryMembership?.categoryName ||
      athlete.category_name ||
      data.categoryName ||
      data.category ||
      null,
    category_memberships: serializedMemberships,
    categoryMemberships: serializedMemberships,
    categories: categoryLabels,
    data: {
      ...data,
      category: primaryMembership?.categoryId || data.category || athlete.category_id || null,
      categoryName:
        primaryMembership?.categoryName ||
        data.categoryName ||
        athlete.category_name ||
        data.category ||
        null,
      categoryMemberships: serializedMemberships,
      categories: categoryLabels,
    },
  };
};

const loadClubAthleteMemberships = async (
  clubId: string,
  athleteIds?: string[],
) => {
  if (!clubId) {
    return [];
  }

  try {
    let query = supabase
      .from(ATHLETE_CATEGORY_MEMBERSHIPS_RESOURCE)
      .select("*")
      .eq("organization_id", clubId);

    if (Array.isArray(athleteIds) && athleteIds.length > 0) {
      query = query.in("athlete_id", athleteIds);
    }

    const { data, error } = await query;
    if (error) {
      if (!isMissingAthleteMembershipResource(error)) {
        console.warn("Error loading athlete memberships:", error);
      }
      return [];
    }

    return Array.isArray(data) ? data : [];
  } catch (error) {
    if (!isMissingAthleteMembershipResource(error)) {
      console.warn("Error loading athlete memberships:", error);
    }
    return [];
  }
};

export type ClubAthletesView = "full" | "summary";

/**
 * `summary` chiede al server la proiezione senza allegati: serve alle liste,
 * che mostrano anagrafica e categoria e non aprono mai un documento.
 * Il default resta `full`, cosi nessun chiamante esistente perde campi.
 */
const loadClubAthleteRows = async (
  clubId: string,
  view: ClubAthletesView = "full",
) => {
  if (!clubId) {
    return [];
  }

  const params = new URLSearchParams({ club_id: clubId });
  if (view === "summary") {
    params.set("view", "summary");
  }
  const response = await apiRequest<any[]>(
    `/api/v1/simplified_athletes?${params.toString()}`,
  );

  if (response.error) {
    console.warn(
      "Error fetching club athletes:",
      response.error.message || response.error,
    );
    return [];
  }

  return Array.isArray(response.data) ? response.data : [];
};

/**
 * Come si chiede **una pagina** dell'archivio atleti.
 *
 * I filtri sono quelli che la lista mostra: ricerca, stato, categoria, sede e
 * ordinamento. Vanno al server perche una pagina filtrata nel browser non e
 * una pagina: e una lista intera scaricata e poi tagliata, cioe il difetto
 * che R-02 chiede di chiudere.
 */
export type ClubAthletesQuery = {
  view?: ClubAthletesView;
  limit?: number;
  page?: number;
  search?: string;
  status?: string;
  categoryId?: string;
  siteId?: string;
  orderBy?: string;
  order?: "asc" | "desc";
};

const buildAthleteListParams = (clubId: string, query: ClubAthletesQuery) => {
  const params = new URLSearchParams({ club_id: clubId });

  if ((query.view || "full") === "summary") params.set("view", "summary");
  if (query.limit && query.limit > 0) params.set("limit", String(query.limit));
  if (query.page && query.page > 1) params.set("page", String(query.page));

  const search = String(query.search || "").trim();
  if (search) params.set("q", search);

  /*
    «Tutti» non e un valore da mandare: `status=all` diventerebbe un filtro
    su una stringa che nessun atleta ha, e la lista tornerebbe vuota.
  */
  const status = String(query.status || "").trim();
  if (status && status !== "all") params.set("status", status);

  const categoryId = String(query.categoryId || "").trim();
  if (categoryId) params.set("category_id", categoryId);

  const siteId = String(query.siteId || "").trim();
  if (siteId) params.set("site_id", siteId);

  params.set("order_by", query.orderBy || "last_name");
  params.set("order", query.order || "asc");

  return params;
};

/**
 * Una pagina di atleti, gia unita alle sue appartenenze.
 *
 * **Le appartenenze si chiedono per gli atleti della pagina, non per il
 * club.** Caricarle tutte insieme alla pagina avrebbe lasciato in piedi
 * esattamente il trasferimento che la paginazione serve a togliere: con 2.000
 * atleti sono qualche migliaio di righe scaricate per mostrarne venti.
 */
export async function getClubAthletesPage(
  clubId: string,
  query: ClubAthletesQuery = {},
): Promise<{ athletes: any[]; meta: ListPageMeta | null }> {
  if (!clubId) {
    return { athletes: [], meta: null };
  }

  try {
    const response = await apiRequest<any[]>(
      `/api/v1/simplified_athletes?${buildAthleteListParams(clubId, query).toString()}`,
    );

    if (response.error) {
      console.warn(
        "Error fetching club athletes:",
        response.error.message || response.error,
      );
      return { athletes: [], meta: null };
    }

    const rows = Array.isArray(response.data) ? response.data : [];
    const athleteIds = rows
      .map((row: any) => String(row?.id || "").trim())
      .filter(Boolean);

    const membershipRecords = athleteIds.length
      ? await loadClubAthleteMemberships(clubId, athleteIds)
      : [];

    const membershipsByAthleteId = new Map<string, any[]>();
    membershipRecords.forEach((membership: any) => {
      const athleteId = String(membership?.athlete_id || "").trim();
      if (!athleteId) return;
      if (!membershipsByAthleteId.has(athleteId)) {
        membershipsByAthleteId.set(athleteId, []);
      }
      membershipsByAthleteId.get(athleteId)?.push(membership);
    });

    return {
      athletes: rows
        .map((athlete: any) =>
          hydrateAthleteWithMemberships(
            athlete,
            membershipsByAthleteId.get(String(athlete?.id || "").trim()) || [],
          ),
        )
        .sort(compareAthletesByLastName),
      meta: response.meta || null,
    };
  } catch (error: any) {
    console.warn("Error fetching club athletes page:", error?.message || error);
    return { athletes: [], meta: null };
  }
}

/**
 * La riga di un atleta, come la scrive il database.
 *
 * Sta in una funzione sola perche la scrivono in due — la creazione singola e
 * l'import a scaglioni — e due copie divergerebbero al primo campo aggiunto.
 */
const buildAthleteInsertPayload = (
  clubId: string,
  athleteData: any,
  normalizedMemberships: ReturnType<typeof resolveRequestedAthleteMemberships>,
) => {
  const primaryMembership = getPrimaryAthleteCategoryMembership(
    normalizedMemberships,
  );
  const categoryId =
    primaryMembership?.categoryId || athleteData.category || null;
  const categoryName =
    primaryMembership?.categoryName || athleteData.categoryName || null;
  const status = athleteData.status || "active";
  const accessCode = athleteData.accessCode || null;
  const avatar = athleteData.avatar || null;
  const medicalCertExpiry = athleteData.medicalCertExpiry || null;
  const birthDate =
    typeof athleteData.birthDate === "string" &&
    athleteData.birthDate &&
    !athleteData.birthDate.includes("T")
      ? `${athleteData.birthDate}T00:00:00.000Z`
      : athleteData.birthDate || null;

  return {
    club_id: clubId,
    first_name: athleteData.firstName,
    last_name: athleteData.lastName,
    birth_date: birthDate,
    status,
    category_id: categoryId,
    category_name: categoryName,
    access_code: accessCode,
    avatar_url: avatar,
    data: {
      ...(isRecord(athleteData.data) ? athleteData.data : {}),
      category: categoryId,
      categoryName,
      categoryMemberships: serializeAthleteMemberships(normalizedMemberships, {
        clubId,
      }),
      categories: getAthleteCategoryLabels(normalizedMemberships),
      birthDate,
      medicalCertExpiry,
      accessCode,
      avatar,
      status,
    },
    created_at: new Date().toISOString(),
  };
};

/**
 * Quanti atleti in una richiesta sola.
 *
 * Cinquanta e un compromesso, non un numero magico: abbastanza da ridurre di
 * due ordini di grandezza le richieste di un import, abbastanza poco da
 * lasciare che un errore ne perda pochi e da tenere il corpo della richiesta
 * sotto il limite del server.
 */
const ATHLETE_IMPORT_CHUNK = 50;

/**
 * Importa un gruppo di atleti con **poche richieste**, non una per atleta.
 *
 * **Il difetto che chiude.** Il dialogo di import chiamava `addClubAthlete`
 * dentro un ciclo: duecento atleti erano duecento inserimenti piu duecento
 * scritture di appartenenza, in fila, ognuna con il suo giro sulla rete.
 * Su una connessione di palestra l'import di una squadra durava minuti, e
 * chiudere la finestra a meta lasciava l'archivio a meta.
 *
 * **Perche a scaglioni e non tutto insieme.** Un corpo con duemila anagrafiche
 * e una richiesta che nessun proxy garantisce; e soprattutto un errore su una
 * riga farebbe perdere tutte le altre. A scaglioni, un errore costa uno
 * scaglione — e chi chiama puo riprovare le righe rifiutate una per una per
 * sapere **quale** era sbagliata.
 *
 * **Perche non e transazionale.** Non lo era prima e non lo diventa qui: il
 * CRUD generico crea le righe una per una dentro la richiesta. Un import
 * interrotto lascia gli atleti gia creati, ed e scritto nella matrice RC
 * invece che nascosto.
 */
export async function addClubAthletesBatch(
  clubId: string,
  rows: any[],
  handlers: { onProgress?: (completed: number) => void } = {},
): Promise<{ created: any[]; failedIndexes: number[] }> {
  const created: any[] = [];
  const failedIndexes: number[] = [];
  let completed = 0;

  for (let start = 0; start < rows.length; start += ATHLETE_IMPORT_CHUNK) {
    const chunk = rows.slice(start, start + ATHLETE_IMPORT_CHUNK);

    try {
      const inserted = await insertAthleteChunk(clubId, chunk);
      created.push(...inserted);
    } catch {
      /*
        Lo scaglione non e passato: si riprova riga per riga, cosi una sola
        anagrafica sbagliata non porta via le altre quarantanove e chi ha
        importato sa quale correggere.
      */
      for (let index = 0; index < chunk.length; index += 1) {
        try {
          created.push(await addClubAthlete(clubId, chunk[index]));
        } catch {
          failedIndexes.push(start + index);
        }
      }
    }

    completed += chunk.length;
    handlers.onProgress?.(Math.min(completed, rows.length));
  }

  return { created, failedIndexes };
}

/** Un solo `POST` con l'elenco, piu un solo `POST` per le appartenenze. */
const insertAthleteChunk = async (clubId: string, rows: any[]) => {
  const prepared = rows.map((row) => ({
    row,
    memberships: resolveRequestedAthleteMemberships(row, row),
  }));

  const { data, error } = await supabase
    .from("simplified_athletes")
    .insert(
      prepared.map(({ row, memberships }) =>
        buildAthleteInsertPayload(clubId, row, memberships),
      ),
    )
    .select();

  if (error) throw error;

  const inserted = Array.isArray(data) ? data : [data].filter(Boolean);
  if (inserted.length !== prepared.length) {
    throw new Error("Import parziale: si riprova riga per riga");
  }

  const membershipRows = prepared.flatMap(({ memberships }, index) =>
    serializeAthleteMemberships(memberships, {
      clubId,
      athleteId: inserted[index].id,
    }).map((membership) => {
      const payload = {
        ...membership,
        organization_id: clubId,
        athlete_id: inserted[index].id,
      } as Record<string, any>;
      if (!UUID_PATTERN.test(String(payload.id || "").trim())) {
        delete payload.id;
      }
      return payload;
    }),
  );

  if (membershipRows.length) {
    const { error: membershipError } = await supabase
      .from(ATHLETE_CATEGORY_MEMBERSHIPS_RESOURCE)
      .insert(membershipRows);

    /*
      Un'appartenenza mancata non annulla l'atleta: la scheda resta, la
      categoria si riassegna. Perdere l'anagrafica per una riga di
      collegamento sarebbe il danno piu grande dei due.
    */
    if (membershipError && !isMissingAthleteMembershipResource(membershipError)) {
      console.warn("Error importing athlete memberships:", membershipError);
    }
  }

  return inserted;
};

const replaceAthleteMemberships = async (
  clubId: string,
  athleteId: string,
  memberships: ReturnType<typeof normalizeAthleteCategoryMemberships>,
) => {
  const serializedMemberships = serializeAthleteMemberships(memberships, {
    clubId,
    athleteId,
  });

  try {
    const { error: deleteError } = await supabase
      .from(ATHLETE_CATEGORY_MEMBERSHIPS_RESOURCE)
      .delete()
      .eq("organization_id", clubId)
      .eq("athlete_id", athleteId);

    if (deleteError) {
      throw deleteError;
    }

    for (const membership of serializedMemberships) {
      const payload = {
        ...membership,
        organization_id: clubId,
        athlete_id: athleteId,
      } as Record<string, any>;

      if (!UUID_PATTERN.test(String(payload.id || "").trim())) {
        delete payload.id;
      }

      const { error } = await supabase
        .from(ATHLETE_CATEGORY_MEMBERSHIPS_RESOURCE)
        .insert(payload);

      if (error) {
        throw error;
      }
    }
  } catch (error) {
    if (!isMissingAthleteMembershipResource(error)) {
      console.warn("Error syncing athlete memberships:", error);
    }
  }

  return serializedMemberships;
};

const resolveRequestedAthleteMemberships = (
  currentAthlete: any,
  updates: any,
) => {
  const explicitMemberships =
    updates?.categoryMemberships ??
    updates?.category_memberships ??
    updates?.memberships;

  if (Array.isArray(explicitMemberships)) {
    return normalizeAthleteCategoryMemberships(explicitMemberships);
  }

  const hasSingleCategoryUpdate = [
    updates?.category,
    updates?.category_id,
    updates?.categoryName,
    updates?.category_name,
  ].some((value) => value !== undefined);

  if (hasSingleCategoryUpdate) {
    const currentMemberships = normalizeAthleteCategoryMemberships(currentAthlete);
    const currentPrimary = currentMemberships.find(
      (membership) => membership.isPrimary,
    );
    /*
      La sede segue l'appartenenza, non l'anagrafica: cambiando categoria si
      porta dietro quella dichiarata, a meno che l'aggiornamento non ne indichi
      un'altra. Perderla qui vorrebbe dire che un cambio di categoria in blocco
      scollega dalla sede tutti gli atleti che tocca (ADR-0055).
    */
    const requestedSiteId =
      updates?.siteId ?? updates?.site_id ?? currentPrimary?.siteId ?? "";

    const nextPrimary = normalizeAthleteCategoryMemberships([
      {
        category_id: updates?.category ?? updates?.category_id,
        category_name:
          updates?.categoryName ??
          updates?.category_name ??
          updates?.category ??
          updates?.category_id,
        is_primary: true,
        site_id: requestedSiteId,
      },
    ]);

    const nextPrimaryKey = String(
      nextPrimary[0]?.categoryId || nextPrimary[0]?.categoryName || "",
    ).trim();
    const secondaryMemberships = currentMemberships
      .filter(
        (membership) =>
          membership.categoryId !== nextPrimaryKey &&
          membership.categoryName !== nextPrimaryKey,
      )
      .map((membership) => ({
        category_id: membership.categoryId,
        category_name: membership.categoryName,
        is_primary: false,
        // La sede delle secondarie non c'entra con la categoria che cambia.
        site_id: membership.siteId,
      }));

    return normalizeAthleteCategoryMemberships([
      ...nextPrimary,
      ...secondaryMemberships,
    ]);
  }

  return normalizeAthleteCategoryMemberships(currentAthlete);
};

/**
 * Salva il programma settimanale degli allenamenti nel database
 */
export async function saveWeeklyTrainingSchedule(
  organizationId: string,
  schedule: any[],
  userId: string,
) {
  try {
    // Get current club data
    const { data: clubData, error: fetchError } = await supabase
      .from("clubs")
      .select("weekly_schedule")
      .eq("id", organizationId)
      .single();

    if (fetchError) throw fetchError;

    // Update trainings in the club's JSONB column
    const { error: updateError } = await supabase
      .from("clubs")
      .update({
        weekly_schedule: schedule,
      })
      .eq("id", organizationId);

    if (updateError) throw updateError;

    return schedule;
  } catch (error) {
    console.error("Error saving weekly training schedule:", error);
    throw error;
  }
}

/**
 * Carica il programma settimanale degli allenamenti dal database
 */
export async function loadWeeklyTrainingSchedule(organizationId: string) {
  try {
    const { data: clubData, error } = await supabase
      .from("clubs")
      .select("weekly_schedule")
      .eq("id", organizationId)
      .single();

    if (error) {
      console.error("Error loading training schedule:", error);
      throw error;
    }

    return clubData?.weekly_schedule || [];
  } catch (error) {
    console.error("Error loading weekly training schedule:", error);
    throw error;
  }
}

// Funzioni di utilità per interagire con la struttura semplificata del database

/**
 * Ottiene un club con tutte le sue informazioni
 */
export async function getClub(clubId: string) {
  try {
    if (!clubId) {
      return null;
    }

    // Validate UUID format FIRST - before any database operations
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(clubId)) {
      return null;
    }

    // Check if Supabase is properly configured
    if (!supabase) {
      return null;
    }

    const { data: clubData, error } = await supabase
      .from("clubs")
      .select("*")
      .eq("id", clubId)
      .single();

    if (error) {
      return null;
    }

    return clubData;
  } catch (error) {
    return null;
  }
}

/**
 * Legge **solo** le colonne indicate del club.
 *
 * La riga di un club porta 35 colonne JSON: leggerla intera per modificarne
 * una sola trasferiva centinaia di KB a ogni salvataggio. Passa da
 * `apiRequest` invece che dall'adapter perche la proiezione e una scelta
 * esplicita di questo chiamante, non un comportamento globale delle select
 * (WP-31).
 */
const readClubFields = async (clubId: string, fields: string[]) => {
  const params = new URLSearchParams({
    id: clubId,
    fields: fields.join(","),
  });
  const response = await apiRequest<any[]>(
    `/api/v1/clubs?${params.toString()}`,
  );

  if (response.error) {
    return { data: null, error: response.error };
  }

  const record = Array.isArray(response.data) ? response.data[0] : response.data;
  return { data: record || null, error: null };
};

/**
 * Scrive alcune colonne del club chiedendo indietro solo quelle.
 *
 * Senza `fields` la risposta di una PATCH e la riga intera: su un autosave e
 * il trasferimento piu costoso dell'operazione, e nessuno di questi chiamanti
 * la usa — tutti restituiscono lo stato che hanno gia calcolato (WP-31).
 */
const writeClubFields = async (
  clubId: string,
  updates: Record<string, any>,
) => {
  // `fields=id` restituisce le sole colonne di servizio: non ha senso farsi
  // rimandare indietro la collezione appena inviata.
  const response = await apiRequest<any>(
    `/api/v1/clubs/${encodeURIComponent(clubId)}?fields=id`,
    { method: "PATCH", body: { data: updates } },
  );

  return { data: response.data ?? null, error: response.error };
};

/**
 * Stagione attiva gia nota al browser, senza toccare la rete.
 *
 * E la stessa che `apiRequest` mette in `x-active-season-id`: se il club
 * attivo memorizzato e proprio questo, leggerla da li evita una lettura del
 * club a ogni scrittura, autosave compresi (WP-36).
 */
const readActiveSeasonIdForClub = (clubId: string) => {
  const activeClub = readStoredActiveClub();

  if (!activeClub || String(activeClub.id || "") !== String(clubId)) {
    return null;
  }

  return String(activeClub.activeSeasonId || "").trim() || null;
};

const getClubSeasonState = async (clubId: string) => {
  const knownSeasonId = readActiveSeasonIdForClub(clubId);
  if (knownSeasonId) {
    return {
      seasons: [],
      activeSeasonId: knownSeasonId,
      activeSeason: null,
      legacySeasonId: null,
    };
  }

  const { data, error } = await readClubFields(clubId, ["settings"]);

  if (error) {
    return {
      seasons: [],
      activeSeasonId: null,
      activeSeason: null,
      legacySeasonId: null,
    };
  }

  const settings =
    typeof data?.settings === "object" && data.settings ? data.settings : {};

  return normalizeClubSeasons(settings);
};

/**
 * Ottiene tutti i club di un utente
 */
export async function getUserClubs(userId: string) {
  try {
    const { data: userData, error: userError } = await supabase
      .from("users")
      .select("club_access")
      .eq("id", userId)
      .single();

    if (userError) {
      console.error("Error fetching user club access:", userError);
      // Don't throw error, return empty array instead
      return [];
    }

    if (!userData?.club_access || !userData.club_access.length) {
      return [];
    }

    const clubIds = userData.club_access.map((access: any) => access.club_id);

    const { data: clubs, error: clubsError } = await supabase
      .from("clubs")
      .select("*")
      .in("id", clubIds);

    if (clubsError) {
      console.error("Error fetching clubs:", clubsError);
      return [];
    }

    // Aggiungi il ruolo dell'utente a ciascun club
    return (
      clubs?.map((club: Record<string, any>) => {
        const accessInfo = userData.club_access.find(
          (access: any) => access.club_id === club.id,
        );
        return {
          ...club,
          userRole: accessInfo?.role || "member",
          isPrimary: accessInfo?.is_primary || false,
        };
      }) || []
    );
  } catch (error) {
    console.error("Unexpected error in getUserClubs:", error);
    return [];
  }
}

/**
 * Ottiene tutti gli atleti di un club
 */
export async function getClubAthletes(
  clubId: string,
  options: { view?: ClubAthletesView } = {},
) {
  try {
    const [data, membershipRecords] = await Promise.all([
      loadClubAthleteRows(clubId, options.view || "full"),
      loadClubAthleteMemberships(clubId),
    ]);

    const membershipsByAthleteId = new Map<string, any[]>();
    membershipRecords.forEach((membership: any) => {
      const athleteId = String(membership?.athlete_id || "").trim();
      if (!athleteId) {
        return;
      }

      if (!membershipsByAthleteId.has(athleteId)) {
        membershipsByAthleteId.set(athleteId, []);
      }

      membershipsByAthleteId.get(athleteId)?.push(membership);
    });

    return (data || [])
      .map((athlete: any) =>
        hydrateAthleteWithMemberships(
          athlete,
          membershipsByAthleteId.get(String(athlete?.id || "").trim()) || [],
        ),
      )
      .sort(compareAthletesByLastName);
  } catch (error: any) {
    // Handle network errors gracefully
    if (
      error?.message?.includes("Failed to fetch") ||
      error?.message?.includes("TypeError")
    ) {
      console.warn(
        "Network error fetching club athletes, returning empty array",
      );
      return [];
    }
    console.warn("Error fetching club athletes:", error?.message || error);
    return [];
  }
}

const getClubAthleteCategorySources = async (clubId: string) => {
  try {
    const [data, membershipRecords] = await Promise.all([
      loadClubAthleteRows(clubId),
      loadClubAthleteMemberships(clubId),
    ]);

    const membershipsByAthleteId = new Map<string, any[]>();
    membershipRecords.forEach((membership: any) => {
      const athleteId = String(membership?.athlete_id || "").trim();
      if (!athleteId) {
        return;
      }

      if (!membershipsByAthleteId.has(athleteId)) {
        membershipsByAthleteId.set(athleteId, []);
      }

      membershipsByAthleteId.get(athleteId)?.push(membership);
    });

    return (data || []).map((athlete: any) =>
      hydrateAthleteWithMemberships(
        athlete,
        membershipsByAthleteId.get(String(athlete?.id || "").trim()) || [],
      ),
    );
  } catch (error: any) {
    if (
      error?.message?.includes("Failed to fetch") ||
      error?.message?.includes("TypeError")
    ) {
      console.warn(
        "Network error fetching athlete category sources, returning empty array",
      );
      return [];
    }

    console.warn(
      "Error fetching athlete category sources:",
      error?.message || error,
    );
    return [];
  }
};

/**
 * Aggiunge un nuovo atleta al club
 */
export async function addClubAthlete(clubId: string, athleteData: any) {
  const normalizedMemberships = resolveRequestedAthleteMemberships(
    athleteData,
    athleteData,
  );

  const { data, error } = await supabase
    .from("simplified_athletes")
    .insert(
      buildAthleteInsertPayload(clubId, athleteData, normalizedMemberships),
    )
    .select()
    .single();

  if (error) {
    console.error("Error adding athlete:", error);
    throw error;
  }

  const savedMemberships = await replaceAthleteMemberships(
    clubId,
    data.id,
    normalizedMemberships,
  );

  return hydrateAthleteWithMemberships(data, savedMemberships);
}

/**
 * Ottiene un atleta specifico con tutti i suoi dati
 */
export async function getAthlete(athleteId: string) {
  try {
    const { data, error } = await supabase
      .from("simplified_athletes")
      .select("*")
      .eq("id", athleteId)
      .single();

    if (error) {
      // Handle network errors gracefully - log as warning instead of error
      if (
        error.message?.includes("Failed to fetch") ||
        error.message?.includes("TypeError")
      ) {
        console.warn("Network error fetching athlete, will retry on next load");
        return null;
      }
      console.warn("Error fetching athlete:", error.message || error);
      return null;
    }

    const membershipRecords = await loadClubAthleteMemberships(
      data.organization_id || data.club_id,
      [athleteId],
    );
    return hydrateAthleteWithMemberships(data, membershipRecords);
  } catch (error: any) {
    // Handle network errors gracefully
    if (
      error?.message?.includes("Failed to fetch") ||
      error?.message?.includes("TypeError")
    ) {
      console.warn("Network error fetching athlete, will retry on next load");
      return null;
    }
    console.warn("Unexpected error fetching athlete:", error?.message || error);
    return null;
  }
}

/**
 * Aggiorna un atleta del club
 */
export async function updateClubAthlete(
  clubId: string,
  athleteId: string,
  updates: any,
) {
  try {
    // Get current athlete data
    const { data: currentAthlete, error: fetchError } = await supabase
      .from("simplified_athletes")
      .select("*")
      .eq("id", athleteId)
      .eq("club_id", clubId)
      .single();

    if (fetchError) {
      console.error("Error fetching athlete:", fetchError);
      throw fetchError;
    }

    if (!currentAthlete) {
      throw new Error("Athlete not found");
    }

    // Merge updates with existing data
    const currentData = isRecord(currentAthlete.data) ? currentAthlete.data : {};
    const normalizedMemberships = resolveRequestedAthleteMemberships(
      currentAthlete,
      updates,
    );
    const primaryMembership = getPrimaryAthleteCategoryMembership(
      normalizedMemberships,
    );

    const rawBirthDate = updates.birthDate || updates.birth_date;
    const nextBirthDate =
      typeof rawBirthDate === "string" && rawBirthDate.trim()
        ? rawBirthDate.includes("T")
          ? rawBirthDate
          : `${rawBirthDate.trim()}T00:00:00.000Z`
        : currentAthlete.birth_date || null;

    const nextCategoryId =
      primaryMembership?.categoryId ??
      updates.category ??
      updates.category_id ??
      currentAthlete.category_id ??
      null;
    const nextCategoryName =
      primaryMembership?.categoryName ??
      updates.categoryName ??
      updates.category_name ??
      currentAthlete.category_name ??
      null;
    const nextStatus = updates.status ?? currentAthlete.status ?? "active";
    const nextAccessCode =
      updates.accessCode ?? updates.access_code ?? currentAthlete.access_code ?? null;
    const nextAvatar =
      updates.avatar ?? updates.avatar_url ?? currentAthlete.avatar_url ?? null;
    const nextFirstName =
      updates.firstName ??
      updates.first_name ??
      updates.name ??
      currentAthlete.first_name;
    const nextLastName =
      updates.lastName ??
      updates.last_name ??
      updates.surname ??
      currentAthlete.last_name;
    const nextJerseyNumber =
      updates.jerseyNumber ??
      updates.jersey_number ??
      currentAthlete.jersey_number ??
      null;
    const normalizedJerseyNumber =
      nextJerseyNumber === null ||
      nextJerseyNumber === undefined ||
      nextJerseyNumber === ""
        ? null
        : String(nextJerseyNumber);
    const updatedData = {
      ...currentData,
      ...updates,
      category: nextCategoryId,
      categoryName: nextCategoryName,
      categoryMemberships: serializeAthleteMemberships(normalizedMemberships, {
        clubId,
        athleteId,
      }),
      categories: getAthleteCategoryLabels(normalizedMemberships),
      birthDate: nextBirthDate,
      medicalCertExpiry:
        updates.medicalCertExpiry ??
        currentData.medicalCertExpiry ??
        null,
      accessCode: nextAccessCode,
      avatar: nextAvatar,
      status: nextStatus,
    };

    // Update the athlete
    const { data, error } = await supabase
      .from("simplified_athletes")
      .update({
        first_name: nextFirstName,
        last_name: nextLastName,
        status: nextStatus,
        category_id: nextCategoryId,
        category_name: nextCategoryName,
        birth_date: nextBirthDate,
        access_code: nextAccessCode,
        avatar_url: nextAvatar,
        jersey_number: normalizedJerseyNumber,
        data: updatedData,
        updated_at: new Date().toISOString(),
      })
      .eq("id", athleteId)
      .eq("club_id", clubId)
      .select()
      .single();

    if (error) {
      console.error("Error updating athlete:", error);
      throw error;
    }

    const savedMemberships = await replaceAthleteMemberships(
      clubId,
      athleteId,
      normalizedMemberships,
    );

    return hydrateAthleteWithMemberships(data, savedMemberships);
  } catch (error) {
    console.error("Error updating club athlete:", error);
    throw error;
  }
}

/**
 * Aggiorna un atleta senza richiedere esplicitamente il clubId.
 * Utile per flussi frontend-only che lavorano direttamente sull'id atleta.
 */
export async function updateAthlete(athleteId: string, updates: any) {
  try {
    const { data: currentAthlete, error: fetchError } = await supabase
      .from("simplified_athletes")
      .select("*")
      .eq("id", athleteId)
      .single();

    if (fetchError) {
      throw fetchError;
    }

    if (!currentAthlete) {
      throw new Error("Athlete not found");
    }

    const nextPayload =
      updates?.data && typeof updates.data === "object"
        ? {
            ...updates,
            data: {
              ...(currentAthlete.data || {}),
              ...updates.data,
            },
          }
        : updates;

    const { data, error } = await supabase
      .from("simplified_athletes")
      .update({
        ...nextPayload,
        updated_at: new Date().toISOString(),
      })
      .eq("id", athleteId)
      .select()
      .single();

    if (error) {
      throw error;
    }

    return data;
  } catch (error) {
    console.error("Error updating athlete:", error);
    throw error;
  }
}

/**
 * Elimina un atleta dal club
 */
export async function deleteClubAthlete(clubId: string, athleteId: string) {
  try {
    const { error } = await supabase
      .from("simplified_athletes")
      .delete()
      .eq("id", athleteId)
      .eq("club_id", clubId);

    if (error) {
      console.error("Error deleting athlete:", error);
      throw error;
    }

    return { success: true };
  } catch (error) {
    console.error("Error deleting club athlete:", error);
    throw error;
  }
}

/**
 * Ottiene i pagamenti di un atleta
 */
export async function getAthletePayments(athleteId: string) {
  const { data, error } = await supabase
    .from("simplified_payments")
    .select("*")
    .eq("athlete_id", athleteId);

  if (error) {
    console.error("Error fetching athlete payments:", error);
    throw error;
  }

  return data;
}

export async function syncAthleteEnrollmentInstallmentPayments({
  clubId,
  athleteId,
  planId,
  planName,
  installments,
  selectedOptionalServiceIds = [],
  enrollmentDate = null,
  enrollmentStartDate = null,
  subscriptionStartDate = null,
  manualEnrollmentAmount = null,
  originalAmount = null,
  prorationApplied = false,
  manualOverrideApplied = false,
}: {
  clubId: string;
  athleteId: string;
  planId: string;
  planName: string;
  installments: Array<{
    id: string;
    label: string;
    amount: number;
    dueDate?: string | null;
  }>;
  selectedOptionalServiceIds?: string[];
  enrollmentDate?: string | null;
  enrollmentStartDate?: string | null;
  subscriptionStartDate?: string | null;
  manualEnrollmentAmount?: number | string | null;
  originalAmount?: number | string | null;
  prorationApplied?: boolean;
  manualOverrideApplied?: boolean;
}) {
  if (!clubId || !athleteId || !planId) {
    return getAthletePayments(athleteId);
  }

  const clubSettings = await getClubSettings(clubId);
  const paymentSettings = normalizePaymentSettings(
    clubSettings?.paymentSettings,
  );
  const onlineRegistrationMethods =
    getAvailableRegistrationPaymentMethods(paymentSettings);
  const manualRegistrationMethods = Object.entries(
    paymentSettings.manualMethods || {},
  )
    .filter(([, enabled]) => Boolean(enabled))
    .map(([key]) => ({
      key,
      label:
        key === "bankTransfer"
          ? "Bonifico"
          : key === "cash"
            ? "Contanti"
            : "Altro metodo manuale",
      type: "manual",
    }));
  const availablePaymentMethods = [
    ...onlineRegistrationMethods.map((method) => ({
      key: method.key,
      label: method.label,
      provider: method.provider,
      type: "online",
      checkoutReady: method.checkoutReady,
    })),
    ...manualRegistrationMethods,
  ];
  const preferredPaymentProvider =
    onlineRegistrationMethods[0]?.provider || null;

  const existingPayments = await getAthletePayments(athleteId);
  const currentInstallmentIds = new Set(
    installments.map((installment) => String(installment.id || "").trim()),
  );

  for (const payment of existingPayments || []) {
    const data = isRecord(payment?.data) ? payment.data : {};
    const isEnrollmentPayment =
      data.source === "enrollment_plan" ||
      data.generatedBy === "enrollment_plan" ||
      Boolean(data.enrollmentPlanId || data.planId || data.installmentId);

    if (!isEnrollmentPayment || isPaymentPaidLike(payment)) {
      continue;
    }

    const paymentPlanId = String(data.enrollmentPlanId || data.planId || "").trim();
    const installmentId = String(data.installmentId || "").trim();
    const storedStartDate = String(
      data.subscriptionStartDate || data.enrollmentStartDate || "",
    ).trim();
    const nextStartDate = String(
      subscriptionStartDate || enrollmentStartDate || "",
    ).trim();
    const shouldReplace =
      paymentPlanId !== planId ||
      (Boolean(storedStartDate || nextStartDate) &&
        storedStartDate !== nextStartDate) ||
      installments.length === 0 ||
      !currentInstallmentIds.has(installmentId);

    if (shouldReplace) {
      await supabase
        .from("simplified_payments")
        .update({
          status: "cancelled",
          data: {
            ...data,
            replacedByEnrollmentPlanId: planId,
            replacedAt: new Date().toISOString(),
            originalStatus: payment.status || null,
            originalPaidAt: payment.paid_at || null,
            originalAmount: payment.amount || null,
            excludedFromTotals: true,
          },
          updated_at: new Date().toISOString(),
        })
        .eq("id", payment.id);
    }
  }

  if (installments.length === 0) {
    return getAthletePayments(athleteId);
  }

  const refreshedPayments = await getAthletePayments(athleteId);

  for (const installment of installments) {
    const installmentId = String(installment.id || "").trim();
    const effectiveSubscriptionStartDate =
      subscriptionStartDate || enrollmentStartDate || null;
    const generationKey = `enrollment_plan:${athleteId}:${planId}:${effectiveSubscriptionStartDate || "no-date"}:${installmentId}`;
    const amountCents = Math.max(
      0,
      Math.round(Number(installment.amount || 0) * 100),
    );
    const feeResult =
      onlineRegistrationMethods.length > 0
        ? calculatePlatformFee({
            amountCents,
            percent: paymentSettings.platformFeePercent,
            fixedCents: paymentSettings.platformFeeFixedCents,
          })
        : {
            grossAmountCents: amountCents,
            platformFeeCents: 0,
            clubNetAmountCents: amountCents,
          };
    const existing = (refreshedPayments || []).find((payment: any) => {
      const data = isRecord(payment?.data) ? payment.data : {};
      return (
        !isPaymentExcludedFromTotals(payment) &&
        (String(payment?.reference || "") === generationKey ||
          String(data.generationKey || "") === generationKey ||
          (String(data.enrollmentPlanId || data.planId || "") === planId &&
            String(data.installmentId || "") === installmentId &&
            String(
              data.subscriptionStartDate || data.enrollmentStartDate || "",
            ) === String(effectiveSubscriptionStartDate || "")))
      );
    });

    if (existing && isPaymentPaidLike(existing)) {
      continue;
    }

    const payload = {
      organization_id: clubId,
      athlete_id: athleteId,
      description: `${planName || "Piano iscrizione"} - ${installment.label}`,
      amount: Number(Number(installment.amount || 0).toFixed(2)),
      due_date: installment.dueDate || null,
      status: "pending",
      paid_at: null,
      reference: generationKey,
      data: {
        generatedBy: "enrollment_plan",
        source: "enrollment_plan",
        planId,
        planName,
        enrollmentPlanId: planId,
        installmentId,
        installmentLabel: installment.label,
        subscriptionStartDate: effectiveSubscriptionStartDate,
        enrollmentDate,
        selectedOptionalServiceIds,
        enrollmentStartDate,
        generationKey,
        originalAmount:
          originalAmount === null || originalAmount === undefined
            ? Number(Number(installment.amount || 0).toFixed(2))
            : Number(Number(originalAmount || 0).toFixed(2)),
        prorationApplied,
        manualOverrideApplied,
        manualEnrollmentAmount,
        availablePaymentMethods,
        preferredPaymentProvider,
        platformFeePercent: paymentSettings.platformFeePercent,
        platformFeeFixedCents: paymentSettings.platformFeeFixedCents || 0,
        platformFeePaidBy: paymentSettings.platformFeePaidBy,
        grossAmountCents: feeResult.grossAmountCents,
        platformFeeAmountCents: feeResult.platformFeeCents,
        netAmountCents: feeResult.clubNetAmountCents,
        grossAmount: Number((feeResult.grossAmountCents / 100).toFixed(2)),
        platformFeeAmount: Number((feeResult.platformFeeCents / 100).toFixed(2)),
        netAmount: Number((feeResult.clubNetAmountCents / 100).toFixed(2)),
      },
      updated_at: new Date().toISOString(),
    };

    if (existing?.id) {
      await supabase
        .from("simplified_payments")
        .update(payload)
        .eq("id", existing.id);
    } else {
      await supabase.from("simplified_payments").insert({
        ...payload,
        created_at: new Date().toISOString(),
      });
    }
  }

  return getAthletePayments(athleteId);
}

/**
 * Ottiene i certificati medici di un atleta
 */
export async function getAthleteCertificates(athleteId: string) {
  const { data, error } = await supabase
    .from("simplified_certificates")
    .select("*")
    .eq("athlete_id", athleteId);

  if (error) {
    console.error("Error fetching athlete certificates:", error);
    throw error;
  }

  return data;
}

/**
 * Aggiorna le informazioni di un club
 */
export async function updateClub(clubId: string, updates: any) {
  try {
    const currentClubResponse = await supabase
      .from("clubs")
      .select("settings")
      .eq("id", clubId)
      .maybeSingle();

    const existingSettings =
      typeof currentClubResponse.data?.settings === "object" &&
      currentClubResponse.data?.settings
        ? currentClubResponse.data.settings
        : {};

    const settings = {
      ...existingSettings,
      email: updates.email || updates.contact_email || null,
      phone: updates.phone || updates.contact_phone || null,
      address: updates.address || null,
      city: updates.city || null,
      postal_code: updates.postal_code || null,
      vat_number: updates.vat_number || null,
      fiscal_code: updates.fiscal_code || null,
      type: updates.type || null,
      types: updates.types || [],
      foundingYear: updates.founding_year || null,
      tax_regime: updates.tax_regime || null,
      pec: updates.pec || null,
      companyPec: updates.pec || null,
      bank_name: updates.bank_name || null,
      iban: updates.iban || null,
      website: updates.website || null,
      facebook: updates.facebook || null,
      instagram: updates.instagram || null,
      twitter: updates.twitter || null,
      youtube: updates.youtube || null,
      atecoCode: updates.ateco_code || null,
      contact1Name: updates.contact1_name || null,
      contact1Phone: updates.phone1 || null,
      contact1Email: updates.email1 || null,
      contact2Name: updates.contact2_name || null,
      contact2Phone: updates.phone2 || null,
      contact2Email: updates.email2 || null,
      federations: updates.federations || [],
      businessName: updates.business_name || null,
      seasons: Array.isArray(updates.seasons)
        ? updates.seasons
        : Array.isArray(existingSettings?.seasons)
          ? existingSettings.seasons
          : undefined,
      activeSeasonId:
        updates.activeSeasonId || existingSettings?.activeSeasonId || undefined,
      paymentSettings:
        updates.paymentSettings !== undefined
          ? updates.paymentSettings
          : existingSettings?.paymentSettings,
      subscription:
        updates.subscription !== undefined
          ? updates.subscription
          : existingSettings?.subscription,
      extraServices:
        updates.extraServices !== undefined
          ? updates.extraServices
          : existingSettings?.extraServices,
    };

    const clubUpdates = {
      name: updates.name,
      logo_url: updates.logo_url,
      address: updates.address || null,
      city: updates.city || null,
      postal_code: updates.postal_code || null,
      region: updates.region || null,
      province: updates.province || null,
      country: updates.country || "Italia",
      contact_email: updates.email || updates.contact_email || null,
      contact_phone: updates.phone || updates.contact_phone || null,
      business_name: updates.business_name || null,
      vat_number: updates.vat_number || null,
      fiscal_code: updates.fiscal_code || null,
      pec: updates.pec || null,
      tax_regime: updates.tax_regime || null,
      sdi_code: updates.sdi_code || null,
      bank_name: updates.bank_name || null,
      iban: updates.iban || null,
      legal_address: updates.legal_address || null,
      legal_city: updates.legal_city || null,
      legal_postal_code: updates.legal_postal_code || null,
      legal_region: updates.legal_region || null,
      legal_province: updates.legal_province || null,
      legal_country: updates.legal_country || "Italia",
      representative_name: updates.representative_name || null,
      representative_surname: updates.representative_surname || null,
      representative_fiscal_code: updates.representative_fiscal_code || null,
      settings,
    } as Record<string, any>;

    for (const field of CLUB_DIRECT_UPDATE_FIELDS) {
      if (updates[field] !== undefined) {
        clubUpdates[field] = updates[field];
      }
    }

    const { data, error } = await supabase
      .from("clubs")
      .update(clubUpdates)
      .eq("id", clubId)
      .select()
      .single();

    if (error) {
      console.error("Error updating club:", error);
      throw error;
    }

    return data;
  } catch (error) {
    console.error("Error updating club:", error);
    throw error;
  }
}

/**
 * Aggiorna il logo e il nome di un club
 */

/**
 * Recupera le strutture (impianti/campi) del club dal DB (colonna JSONB `structures`)
 */
export async function getClubStructures(clubId: string) {
  try {
    if (!clubId) return [];
    const { data, error } = await supabase
      .from("clubs")
      .select("structures")
      .eq("id", clubId)
      .single();

    if (error) return [];
    return (data?.structures as any[]) || [];
  } catch (e) {
    return [];
  }
}

/**
 * Salva le strutture (impianti/campi) del club nel DB (colonna JSONB `structures`)
 */
export async function saveClubStructures(clubId: string, structures: any[]) {
  try {
    if (!clubId) return false;

    const { error } = await supabase
      .from("clubs")
      .update({
        structures: structures || [],
        updated_at: new Date().toISOString(),
      })
      .eq("id", clubId);

    return !error;
  } catch (e) {
    return false;
  }
}

export async function updateClubLogoAndName(
  clubId: string,
  name: string,
  logoUrl: string,
) {
  try {
    // First try to update in the organizations table (new structure)
    const { data: orgData, error: orgError } = await supabase
      .from("organizations")
      .update({
        name: name,
        logo_url: logoUrl,
      })
      .eq("id", clubId)
      .select()
      .single();

    let data = orgData;
    let error = orgError;

    // If organization update failed, try clubs table (simplified structure)
    if (orgError) {
      const clubResult = await supabase
        .from("clubs")
        .update({
          name: name,
          logo_url: logoUrl,
        })
        .eq("id", clubId)
        .select()
        .single();

      data = clubResult.data;
      error = clubResult.error;
    }

    if (error) {
      console.error("Error updating club logo and name:", error);
      throw error;
    }

    // Update localStorage to reflect changes
    if (typeof window !== "undefined") {
      const activeClub = localStorage.getItem("activeClub");
      if (activeClub) {
        try {
          const parsedClub = JSON.parse(activeClub);
          if (parsedClub.id === clubId) {
            parsedClub.name = name;
            parsedClub.logo_url = logoUrl;
            localStorage.setItem("activeClub", JSON.stringify(parsedClub));

            // Dispatch custom event to notify other components
            const event = new CustomEvent("club-updated", {
              detail: { clubData: parsedClub },
            });
            window.dispatchEvent(event);
          }
        } catch (e) {
          console.error("Error updating localStorage:", e);
        }
      }

      // Also update user-specific storage
      const userId = data?.creator_id;
      if (userId) {
        const userClubsKey = `userClubs_${userId}`;
        const userClubs = localStorage.getItem(userClubsKey);
        if (userClubs) {
          try {
            const parsedClubs = JSON.parse(userClubs);
            const updatedClubs = parsedClubs.map((club: any) => {
              if (club.id === clubId) {
                return { ...club, name, logo_url: logoUrl };
              }
              return club;
            });
            localStorage.setItem(userClubsKey, JSON.stringify(updatedClubs));
          } catch (e) {
            console.error("Error updating user clubs in localStorage:", e);
          }
        }
      }
    }

    return data;
  } catch (e) {
    console.error("Unexpected error updating club logo and name:", e);
    throw e;
  }
}

/**
 * Aggiunge un membro a un club
 */
export async function addClubMember(
  clubId: string,
  userId: string,
  role: string,
) {
  // 1. Ottieni il club attuale
  const { data: club, error: clubError } = await supabase
    .from("clubs")
    .select("members")
    .eq("id", clubId)
    .single();

  if (clubError) {
    console.error("Error fetching club:", clubError);
    throw clubError;
  }

  // 2. Aggiungi il nuovo membro all'array members
  const members = club.members || [];
  members.push({
    user_id: userId,
    role: role,
    is_primary: false,
    created_at: new Date().toISOString(),
  });

  // 3. Aggiorna il club
  const { error: updateError } = await supabase
    .from("clubs")
    .update({ members })
    .eq("id", clubId);

  if (updateError) {
    console.error("Error updating club members:", updateError);
    throw updateError;
  }

  // 4. Aggiorna l'accesso dell'utente
  const { data: userData, error: userError } = await supabase
    .from("users")
    .select("club_access")
    .eq("id", userId)
    .single();

  if (userError && userError.code !== "PGRST116") {
    // Ignora errore se l'utente non esiste
    console.error("Error fetching user:", userError);
    throw userError;
  }

  const clubAccess = userData?.club_access || [];
  clubAccess.push({
    club_id: clubId,
    role: role,
    is_primary: false,
  });

  const { error: updateUserError } = await supabase
    .from("users")
    .update({ club_access: clubAccess })
    .eq("id", userId);

  if (updateUserError) {
    console.error("Error updating user club access:", updateUserError);
    throw updateUserError;
  }

  return { success: true };
}

/**
 * Crea un nuovo club e assegna l'utente come creatore
 */
export async function createClub(name: string, userId: string) {
  // Genera uno slug dal nome
  const slug =
    name
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^\w\-]+/g, "")
      .replace(/\-\-+/g, "-")
      .replace(/^-+/, "")
      .replace(/-+$/, "") +
    "-" +
    Date.now().toString().slice(-6);

  // 1. Crea il nuovo club
  const { data: club, error: clubError } = await supabase
    .from("clubs")
    .insert([
      {
        name,
        slug,
        creator_id: userId,
        members: [
          {
            user_id: userId,
            role: "club_creator",
            is_primary: true,
            created_at: new Date().toISOString(),
          },
        ],
        dashboard_data: {
          settings: {
            theme: "default",
            layout: "standard",
            widgets: ["metrics", "activities", "trainings", "certifications"],
          },
        },
      },
    ])
    .select()
    .single();

  if (clubError) {
    console.error("Error creating club:", clubError);
    throw clubError;
  }

  // 2. Aggiorna l'accesso dell'utente
  const { data: userData, error: userError } = await supabase
    .from("users")
    .select("club_access")
    .eq("id", userId)
    .single();

  if (userError) {
    console.error("Error fetching user:", userError);
    throw userError;
  }

  const clubAccess = userData?.club_access || [];
  clubAccess.push({
    club_id: club.id,
    role: "club_creator",
    is_primary: true,
  });

  const { error: updateUserError } = await supabase
    .from("users")
    .update({ club_access: clubAccess })
    .eq("id", userId);

  if (updateUserError) {
    console.error("Error updating user club access:", updateUserError);
    throw updateUserError;
  }

  return club;
}

/**
 * Ottiene le notifiche di un utente
 */
export async function getUserNotifications(userId: string) {
  const { data, error } = await supabase
    .from("simplified_notifications")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching user notifications:", error);
    throw error;
  }

  return data;
}

/**
 * Crea una nuova notifica per un utente
 */
export async function createNotification(
  userId: string,
  title: string,
  message: string,
  type: string,
) {
  const { data, error } = await supabase
    .from("simplified_notifications")
    .insert([
      {
        user_id: userId,
        title,
        message,
        type,
        read: false,
        data: {},
      },
    ])
    .select()
    .single();

  if (error) {
    console.error("Error creating notification:", error);
    throw error;
  }

  return data;
}

/**
 * Salva le impostazioni del club nel database
 */
export async function saveClubSettings(clubId: string, settings: any) {
  try {
    console.log(
      "Saving club settings for club ID:",
      clubId,
      "Settings:",
      settings,
    );

    if (!clubId || typeof clubId !== "string") {
      throw new Error("Valid club ID is required");
    }

    // Get current club data
    const { data: clubData, error: fetchError } = await supabase
      .from("clubs")
      .select("settings")
      .eq("id", clubId)
      .single();

    if (fetchError) {
      console.error("Error fetching club data:", fetchError);
      if (fetchError.code === "PGRST116") {
        throw new Error(`Club with ID ${clubId} not found`);
      }
      throw fetchError;
    }

    if (!clubData) {
      throw new Error(`Club with ID ${clubId} not found`);
    }

    // Merge with existing settings
    const currentSettings = clubData?.settings || {};
    const updatedSettings = { ...currentSettings, ...settings };

    console.log("Updating club settings:", updatedSettings);

    // Update the club settings
    const { error: updateError } = await supabase
      .from("clubs")
      .update({
        settings: updatedSettings,
      })
      .eq("id", clubId);

    if (updateError) {
      console.error("Error updating club settings:", updateError);
      throw updateError;
    }

    console.log("Club settings saved successfully");
    return updatedSettings;
  } catch (error) {
    console.error("Error saving club settings:", error);
    throw error;
  }
}

/**
 * Ottiene le impostazioni del club dal database
 */
export async function getClubSettings(clubId: string) {
  try {
    const { data: clubData, error } = await supabase
      .from("clubs")
      .select("settings")
      .eq("id", clubId)
      .single();

    if (error) {
      console.error("Error fetching club settings:", error);
      return {};
    }

    return clubData?.settings || {};
  } catch (error) {
    console.error("Error fetching club settings:", error);
    return {};
  }
}

/**
 * Aggiunge un pagamento per un allenatore
 */
export async function addTrainerPayment(
  clubId: string,
  trainerId: string,
  paymentData: any,
) {
  try {
    // Get current club data - get trainers array instead of trainer_payments
    const { data: clubData, error: fetchError } = await supabase
      .from("clubs")
      .select("trainers")
      .eq("id", clubId)
      .single();

    if (fetchError) throw fetchError;

    const currentTrainers = clubData?.trainers || [];

    // Find the trainer and add payment to their payments array
    const updatedTrainers = currentTrainers.map((trainer: any) => {
      if (trainer.id === trainerId) {
        const currentPayments = trainer.payments || [];
        const newPayment = {
          ...paymentData,
          id:
            paymentData.id ||
            `payment-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          trainer_id: trainerId,
          created_at: new Date().toISOString(),
        };
        return {
          ...trainer,
          payments: [...currentPayments, newPayment],
        };
      }
      return trainer;
    });

    // Update the club data
    const { error: updateError } = await supabase
      .from("clubs")
      .update({
        trainers: updatedTrainers,
      })
      .eq("id", clubId);

    if (updateError) throw updateError;

    // Return the new payment
    const updatedTrainer = updatedTrainers.find((t: any) => t.id === trainerId);
    return updatedTrainer?.payments[updatedTrainer.payments.length - 1];
  } catch (error) {
    console.error("Error adding trainer payment:", error);
    throw error;
  }
}

/**
 * Ottiene i pagamenti di un allenatore
 */
export async function getTrainerPayments(clubId: string, trainerId: string) {
  try {
    const { data: clubData, error } = await supabase
      .from("clubs")
      .select("trainers")
      .eq("id", clubId)
      .single();

    if (error) {
      console.error("Error fetching trainer payments:", error);
      return [];
    }

    // Find the trainer and return their payments
    const trainer = (clubData?.trainers || []).find(
      (t: any) => t.id === trainerId,
    );

    return trainer?.payments || [];
  } catch (error) {
    console.error("Error fetching trainer payments:", error);
    return [];
  }
}

/**
 * Aggiorna un pagamento di un allenatore
 */
export async function updateTrainerPayment(
  clubId: string,
  trainerId: string,
  paymentId: string,
  updates: any,
) {
  try {
    // Get current club data
    const { data: clubData, error: fetchError } = await supabase
      .from("clubs")
      .select("trainers")
      .eq("id", clubId)
      .single();

    if (fetchError) throw fetchError;

    const currentTrainers = clubData?.trainers || [];

    // Find the trainer and update their payment
    const updatedTrainers = currentTrainers.map((trainer: any) => {
      if (trainer.id === trainerId) {
        const currentPayments = trainer.payments || [];
        const updatedPayments = currentPayments.map((payment: any) => {
          if (payment.id === paymentId) {
            return {
              ...payment,
              ...updates,
              updated_at: new Date().toISOString(),
            };
          }
          return payment;
        });
        return {
          ...trainer,
          payments: updatedPayments,
        };
      }
      return trainer;
    });

    // Update the club data
    const { error: updateError } = await supabase
      .from("clubs")
      .update({
        trainers: updatedTrainers,
      })
      .eq("id", clubId);

    if (updateError) throw updateError;

    // Return updated payments for this trainer
    const updatedTrainer = updatedTrainers.find((t: any) => t.id === trainerId);
    return updatedTrainer?.payments || [];
  } catch (error) {
    console.error("Error updating trainer payment:", error);
    throw error;
  }
}

/**
 * Elimina un pagamento di un allenatore
 */
export async function deleteTrainerPayment(
  clubId: string,
  trainerId: string,
  paymentId: string,
) {
  try {
    // Get current club data
    const { data: clubData, error: fetchError } = await supabase
      .from("clubs")
      .select("trainers")
      .eq("id", clubId)
      .single();

    if (fetchError) throw fetchError;

    const currentTrainers = clubData?.trainers || [];

    // Find the trainer and remove the payment
    const updatedTrainers = currentTrainers.map((trainer: any) => {
      if (trainer.id === trainerId) {
        const currentPayments = trainer.payments || [];
        const updatedPayments = currentPayments.filter(
          (payment: any) => payment.id !== paymentId,
        );
        return {
          ...trainer,
          payments: updatedPayments,
        };
      }
      return trainer;
    });

    // Update the club data
    const { error: updateError } = await supabase
      .from("clubs")
      .update({
        trainers: updatedTrainers,
      })
      .eq("id", clubId);

    if (updateError) throw updateError;

    // Return updated payments for this trainer
    const updatedTrainer = updatedTrainers.find((t: any) => t.id === trainerId);
    return updatedTrainer?.payments || [];
  } catch (error) {
    console.error("Error deleting trainer payment:", error);
    throw error;
  }
}

/**
 * Aggiunge dati al club (generico per qualsiasi tipo di dato)
 */
export async function addClubData(
  clubId: string,
  dataType: string,
  newData: any,
) {
  try {
    // Validate inputs
    if (!clubId || typeof clubId !== "string") {
      throw new Error("Valid club ID is required");
    }

    if (!dataType || typeof dataType !== "string") {
      throw new Error("Valid data type is required");
    }

    if (!newData || typeof newData !== "object") {
      throw new Error("Valid data object is required");
    }

    let retryCount = 0;
    const maxRetries = 3;

    while (retryCount < maxRetries) {
      try {
        // Solo la colonna che si sta modificando: la riga intera del club
        // porta 35 colonne JSON e non serve nessuna delle altre.
        const { data: clubData, error: fetchError } = await readClubFields(
          clubId,
          [dataType],
        );

        if (fetchError) {
          // Handle column not found error - return empty array silently
          if (fetchError.code === "42703") {
            console.warn(`Column '${dataType}' does not exist in clubs table`);
            throw new Error(
              `Database error: column clubs.${dataType} does not exist`,
            );
          }
          if (retryCount === maxRetries - 1) {
            console.warn(
              `Error fetching club data for ${dataType}:`,
              fetchError.message || fetchError,
            );
            if (fetchError.code === "PGRST116") {
              throw new Error(`Club with ID ${clubId} not found`);
            }
            throw new Error(
              `Database error: ${fetchError.message || fetchError.code}`,
            );
          }
          retryCount++;
          await new Promise((resolve) =>
            setTimeout(resolve, 1000 * retryCount),
          );
          continue;
        }

        if (!clubData) {
          throw new Error(`Club with ID ${clubId} not found`);
        }

        const currentData = Array.isArray(clubData[dataType])
          ? clubData[dataType]
          : [];

        const seasonState = isSeasonScopedDataType(dataType)
          ? await getClubSeasonState(clubId)
          : null;

        const newItem = {
          ...newData,
          id:
            newData.id ||
            `${dataType}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          created_at: newData.created_at || new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        const seasonAwareItem =
          seasonState?.activeSeasonId && isSeasonScopedDataType(dataType)
            ? applySeasonIdToRecord(newItem, seasonState.activeSeasonId)
            : newItem;

        const updatedData = [...currentData, seasonAwareItem];

        const { data: updateResult, error: updateError } = await writeClubFields(
          clubId,
          { [dataType]: updatedData },
        );

        if (updateError) {
          if (retryCount === maxRetries - 1) {
            console.error(`Error updating club ${dataType}:`, updateError);
            throw new Error(
              `Failed to update club data: ${updateError.message || updateError.code}`,
            );
          }
          retryCount++;
          await new Promise((resolve) =>
            setTimeout(resolve, 1000 * retryCount),
          );
          continue;
        }

        if (!updateResult) {
          throw new Error(
            `No rows updated when adding ${dataType}. Club may not exist.`,
          );
        }

        return seasonAwareItem;
      } catch (fetchError: any) {
        if (retryCount === maxRetries - 1) {
          console.warn(
            `Network error adding ${dataType}:`,
            fetchError?.message || fetchError,
          );
          throw new Error(
            `Network error: ${fetchError?.message || "Unknown error"}`,
          );
        }
        retryCount++;
        await new Promise((resolve) => setTimeout(resolve, 1000 * retryCount));
      }
    }
  } catch (error: any) {
    console.warn(`Error adding ${dataType}:`, error?.message || error);

    // Re-throw with more context if it's already an Error
    if (error instanceof Error) {
      throw error;
    }

    // Convert other error types to Error objects
    throw new Error(`Unknown error adding ${dataType}: ${String(error)}`);
  }
}

/**
 * Ottiene dati dal club (generico per qualsiasi tipo di dato)
 */
export async function getClubData(clubId: string, dataType: string) {
  try {
    const { data: clubData, error } = await readClubFields(clubId, [
      dataType,
    ]);

    if (error) {
      // If the column doesn't exist, return empty array silently for known financial columns
      if (error.code === "42703") {
        const knownMissingColumns = [
          "bank_accounts",
          "transfers",
          "expected_expenses",
          "expected_income",
          "payments",
          "simplified_payments",
          "trainer_payments",
          "supplier_payments",
          "sponsor_payments",
          "structures",
          "procure",
          "transactions",
          "clothing_products",
          "clothing_inventory",
          "clothing_kits",
          "kit_assignments",
        ];

        if (!knownMissingColumns.includes(dataType)) {
          console.warn(
            `Column '${dataType}' does not exist in clubs table, returning empty array`,
          );
        }
        return [];
      }
      // For network errors, log as warning instead of error
      if (
        error.message?.includes("Failed to fetch") ||
        error.message?.includes("TypeError")
      ) {
        console.warn(
          `Network error fetching ${dataType}, returning empty array`,
        );
        return [];
      }
      // For other errors, also return empty array to prevent crashes
      console.warn(`Error fetching ${dataType}:`, error.message || error);
      return [];
    }

    const rawData = clubData?.[dataType] || [];
    const seasonState = normalizeClubSeasons(
      typeof clubData?.settings === "object" && clubData?.settings
        ? clubData.settings
        : {},
    );

    /*
      Le stesse due regole che applica il server (`resolveRequestSeason` in
      `src/lib/server/resources.ts`), perche due percorsi di lettura che
      filtrano diversamente mostrano due elenchi diversi dello stesso club.

      Finche il club non ha salvato nessuna stagione non si filtra: quella che
      `normalizeClubSeasons` restituisce e **sintetizzata** in lettura, non un
      dato, e usarla come perimetro nasconde i record che portano un altro id.
      E un `seasonId` che nomina una stagione che il club non ha e un record
      **orfano**, non un record di un'altra annata: sparirebbe da ogni
      schermata senza che nulla lo dica.
    */
    if (seasonState.isFallback) {
      return Array.isArray(rawData) ? rawData : [];
    }

    return filterCollectionBySeason(
      dataType,
      rawData,
      seasonState.activeSeasonId,
      {
        legacySeasonId: seasonState.legacySeasonId,
        knownSeasonIds: seasonState.seasons.map((season) => season.id),
      },
    );
  } catch (error: any) {
    // Handle network errors gracefully
    if (
      error?.message?.includes("Failed to fetch") ||
      error?.message?.includes("TypeError")
    ) {
      console.warn(`Network error fetching ${dataType}, returning empty array`);
      return [];
    }
    console.warn(`Error fetching ${dataType}:`, error?.message || error);
    // Always return empty array to prevent crashes
    return [];
  }
}

const getClubResourcePayloads = async (clubId: string, resourceType: string) => {
  try {
    const { data, error } = await supabase
      .from("club_resource_items")
      .select("id, name, status, date, created_at, updated_at, payload")
      .eq("organization_id", clubId)
      .eq("resource_type", resourceType)
      .order("created_at", { ascending: true });

    if (error) {
      console.warn(
        `Error fetching resource items for ${resourceType}:`,
        error.message || error,
      );
      return [];
    }

    return Array.isArray(data)
      ? data.flatMap((item: any) => {
          const payload = item?.payload;

          if (Array.isArray(payload)) {
            return payload;
          }

          if (payload && typeof payload === "object") {
            return [
              {
                ...payload,
                id: payload.id || item.id,
                name: payload.name || item.name || null,
                status: payload.status || item.status || null,
                date: payload.date || item.date || null,
                created_at: payload.created_at || item.created_at || null,
                updated_at: payload.updated_at || item.updated_at || null,
              },
            ];
          }

          return [];
        })
      : [];
  } catch (error: any) {
    console.warn(
      `Error fetching resource items for ${resourceType}:`,
      error?.message || error,
    );
    return [];
  }
};

export async function getClubCategories(clubId: string) {
  try {
    const [clubCategories, resourceCategories, athletes] = await Promise.all([
      getClubData(clubId, "categories"),
      getClubResourcePayloads(clubId, "categories"),
      getClubAthleteCategorySources(clubId),
    ]);

    return buildClubCategoryOptions({
      clubCategories,
      resourceCategories,
      athletes,
    });
  } catch (error) {
    console.error("Error fetching club categories:", error);
    return [];
  }
}

const isTrainingRecord = (value: unknown): value is Record<string, any> =>
  Boolean(value) &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  [
    "id",
    "title",
    "date",
    "start_date",
    "startDate",
    "scheduled_at",
    "scheduledAt",
    "time",
    "start_time",
    "startTime",
    "category",
    "categoryId",
    "category_id",
    "trainer",
    "trainerId",
    "trainer_id",
    "location",
  ].some((key) => (value as Record<string, unknown>)[key] !== undefined);

const isWeeklyScheduleRecord = (value: unknown): value is Record<string, any> =>
  Boolean(value) &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  Boolean(resolveExplicitWeeklyScheduleDay(value)) &&
  Boolean(getTrainingStartTime(value));

const toTrainingEntries = (source: unknown): Record<string, any>[] => {
  if (Array.isArray(source)) {
    return source.flatMap((entry) => toTrainingEntries(entry));
  }

  if (!source || typeof source !== "object") {
    return [];
  }

  if (isTrainingRecord(source)) {
    return [source];
  }

  const record = source as Record<string, unknown>;
  const nestedCandidates = [
    record.payload,
    record.trainings,
    record.training,
    record.items,
  ].filter((value) => value !== undefined);

  if (nestedCandidates.length > 0) {
    return nestedCandidates.flatMap((entry) => toTrainingEntries(entry));
  }

  return [];
};

const toWeeklyScheduleEntries = (source: unknown): Record<string, any>[] => {
  if (Array.isArray(source)) {
    return source.flatMap((entry) => toWeeklyScheduleEntries(entry));
  }

  if (!source || typeof source !== "object") {
    return [];
  }

  if (isWeeklyScheduleRecord(source)) {
    return [source];
  }

  const record = source as Record<string, unknown>;
  const nestedCandidates = [
    record.payload,
    record.weekly_schedule,
    record.schedule,
    record.items,
  ].filter((value) => value !== undefined);

  if (nestedCandidates.length > 0) {
    return nestedCandidates.flatMap((entry) => toWeeklyScheduleEntries(entry));
  }

  return [];
};

const buildTrainingIdentityKey = (training: Record<string, any>) => {
  const id = String(training?.id || "").trim();
  if (id) {
    return `id:${id}`;
  }

  return [
    training?.date ||
      training?.start_date ||
      training?.startDate ||
      training?.scheduled_at ||
      training?.scheduledAt ||
      "",
    training?.time || training?.start_time || training?.startTime || "",
    training?.locationId || training?.fieldId || training?.location || "",
    training?.categoryId || training?.category_id || training?.category || "",
    training?.title || "",
  ]
    .map((value) => String(value || "").trim())
    .join("|");
};

const buildWeeklyScheduleIdentityKey = (item: Record<string, any>) => {
  const id = String(item?.id || "").trim();
  if (id) {
    return `id:${id}`;
  }

  return [
    item?.day || "",
    item?.startTime || item?.start_time || item?.time || "",
    item?.endTime || item?.end_time || "",
    item?.categoryId || item?.category_id || item?.category || "",
    item?.structureId || item?.structure_id || "",
    item?.locationId || item?.location_id || item?.location || "",
  ]
    .map((value) => String(value || "").trim())
    .join("|");
};

const getClubDirectCollectionWithLegacySeasonFallback = async (
  clubId: string,
  dataType: "trainings" | "weekly_schedule",
) => {
  const { data, error } = await readClubFields(clubId, [dataType]);

  if (error) {
    console.warn(
      `Error fetching raw club ${dataType}:`,
      error.message || error,
    );
    return [];
  }

  const rawCollection = Array.isArray(data?.[dataType]) ? data[dataType] : [];
  if (!rawCollection.length) {
    return [];
  }

  if (!isSeasonScopedDataType(dataType)) {
    return rawCollection;
  }

  const settings =
    typeof data?.settings === "object" && data.settings ? data.settings : {};
  const { activeSeasonId, legacySeasonId, seasons, isFallback } =
    normalizeClubSeasons(settings);

  // Su un club senza stagioni salvate la stagione e sintetizzata in lettura e
  // non e un perimetro: non si filtra, come fa il server.
  if (isFallback) {
    return rawCollection;
  }

  // I record senza `seasonId` appartengono alla stagione baseline: la regola
  // vive in `filterCollectionBySeason`, qui non serve piu una deroga locale
  // che li rendeva visibili in ogni stagione (WP-32). Un `seasonId` che nomina
  // una stagione che il club non ha e un record orfano, e vale la stessa
  // regola: si mostra, invece di sparire in silenzio.
  return filterCollectionBySeason(dataType, rawCollection, activeSeasonId, {
    legacySeasonId,
    knownSeasonIds: seasons.map((season) => season.id),
  });
};

const getNonEmptyString = (...values: unknown[]) => {
  for (const value of values) {
    const candidate = String(value || "").trim();
    if (candidate) {
      return candidate;
    }
  }

  return "";
};

const normalizeTrainerIds = (value: any): string[] => {
  if (Array.isArray(value)) {
    return value.flatMap((entry) => normalizeTrainerIds(entry));
  }

  if (value && typeof value === "object") {
    return normalizeTrainerIds([
      value.id,
      value.user_id,
      value.linkedUserId,
      value.linked_user_id,
      value.trainerId,
      value.trainer_id,
      value.coachId,
      value.coach_id,
    ]);
  }

  const candidate = String(value || "").trim();
  return candidate ? [candidate] : [];
};

const dedupeStringList = (values: string[]) => {
  const seen = new Set<string>();
  const normalized: string[] = [];

  values.forEach((value) => {
    const candidate = String(value || "").trim();
    if (!candidate || seen.has(candidate)) {
      return;
    }

    seen.add(candidate);
    normalized.push(candidate);
  });

  return normalized;
};

const normalizeWeeklyScheduleSourceItem = (item: Record<string, any>) => {
  const day = resolveExplicitWeeklyScheduleDay(item);
  const startTime = getTrainingStartTime(item);
  const endTime = getTrainingEndTime(item) || "";

  const categoryReference = getNonEmptyString(
    item?.categoryId,
    item?.category_id,
    item?.category?.id,
    item?.categoryName,
    item?.category_name,
    item?.category?.name,
    item?.category,
    getTrainingCategoryReferences(item)[0],
  );
  const categoryId = getNonEmptyString(
    item?.categoryId,
    item?.category_id,
    item?.category?.id,
  );
  const categoryLabel = resolveCategoryLabelForTraining(item, []);
  const trainerIds = dedupeStringList(
    normalizeTrainerIds([
      item?.trainerIds,
      item?.trainer_ids,
      item?.trainerId,
      item?.trainer_id,
      item?.coachId,
      item?.coach_id,
      item?.trainers,
      item?.trainer,
      item?.coach,
    ]),
  );
  const locationReference = getNonEmptyString(
    item?.structureId,
    item?.structure_id,
    item?.locationId,
    item?.location_id,
    item?.fieldId,
    item?.field_id,
    item?.location,
    item?.fieldName,
    item?.field_name,
  );

  if (
    !day ||
    !startTime ||
    !endTime ||
    !isValidTimeRange(startTime, endTime) ||
    !categoryReference ||
    !locationReference ||
    trainerIds.length === 0
  ) {
    return null;
  }

  return {
    id: String(item?.id || buildWeeklyScheduleIdentityKey(item)),
    day,
    startTime,
    endTime,
    categoryId: categoryId || categoryReference,
    categoryName: categoryLabel || null,
    trainerIds,
    structureId: getNonEmptyString(item?.structureId, item?.structure_id),
    locationId: getNonEmptyString(
      item?.locationId,
      item?.location_id,
      item?.fieldId,
      item?.field_id,
    ),
    location: getNonEmptyString(item?.location, item?.fieldName, item?.field_name),
  };
};

export async function getClubTrainings(clubId: string) {
  try {
    const [clubTrainings, resourceTrainings, relationalResponse] =
      await Promise.all([
        getClubDirectCollectionWithLegacySeasonFallback(clubId, "trainings"),
        getClubResourcePayloads(clubId, "trainings"),
        supabase
          .from("trainings")
          .select("*")
          .eq("organization_id", clubId)
          .order("date", { ascending: true }),
      ]);

    if (relationalResponse.error) {
      console.warn(
        "Error fetching relational trainings:",
        relationalResponse.error.message || relationalResponse.error,
      );
    }

    const merged: Record<string, any>[] = [];
    const seen = new Set<string>();

    [clubTrainings, resourceTrainings, relationalResponse.data || []].forEach(
      (source) => {
        toTrainingEntries(source).forEach((training) => {
          const identity = buildTrainingIdentityKey(training);
          if (!identity || seen.has(identity)) {
            return;
          }

          seen.add(identity);
          merged.push(training);
        });
      },
    );

    return dedupeTrainings(merged).sort(compareTrainingsByStart);
  } catch (error) {
    console.error("Error fetching club trainings:", error);
    return [];
  }
}

export async function getClubWeeklySchedule(clubId: string) {
  try {
    const [clubWeeklySchedule, resourceWeeklySchedule] = await Promise.all([
      getClubDirectCollectionWithLegacySeasonFallback(clubId, "weekly_schedule"),
      getClubResourcePayloads(clubId, "weekly_schedule"),
    ]);

    const scheduleSources = [clubWeeklySchedule, resourceWeeklySchedule];
    const merged: Record<string, any>[] = [];
    const seen = new Set<string>();

    scheduleSources.forEach((source) => {
      toWeeklyScheduleEntries(source).forEach((item) => {
        const normalizedItem = normalizeWeeklyScheduleSourceItem(item);
        if (!normalizedItem) {
          return;
        }

        const identity = buildWeeklyScheduleIdentityKey(normalizedItem);
        if (!identity || seen.has(identity)) {
          return;
        }

        seen.add(identity);
        merged.push(normalizedItem);
      });
    });

    return merged;
  } catch (error) {
    console.error("Error fetching weekly training schedule:", error);
    return [];
  }
}

export async function cleanupOrphanScheduledTrainings(
  clubId: string,
  missingCategoryReferences: string[],
) {
  try {
    const normalizedMissingReferences = dedupeStringList(
      (Array.isArray(missingCategoryReferences) ? missingCategoryReferences : []).map(
        (reference) => String(reference || "").trim().toLowerCase(),
      ),
    );

    if (!normalizedMissingReferences.length) {
      return {
        removedWeeklyScheduleItems: [],
        removedUpcomingTrainings: [],
      };
    }

    const { data: clubData, error } = await supabase
      .from("clubs")
      .select("weekly_schedule, trainings")
      .eq("id", clubId)
      .single();

    if (error) {
      throw error;
    }

    const currentWeeklySchedule = Array.isArray(clubData?.weekly_schedule)
      ? clubData.weekly_schedule
      : [];
    const currentTrainings = Array.isArray(clubData?.trainings)
      ? clubData.trainings
      : [];

    const matchesMissingCategory = (record: any) =>
      getTrainingCategoryReferences(record).some((reference) =>
        normalizedMissingReferences.includes(
          String(reference || "").trim().toLowerCase(),
        ),
      );

    const removedWeeklyScheduleItems = currentWeeklySchedule.filter((record: any) =>
      matchesMissingCategory(record),
    );
    const nextWeeklySchedule = currentWeeklySchedule.filter(
      (record: any) => !matchesMissingCategory(record),
    );

    const removedUpcomingTrainings = currentTrainings.filter(
      (record: any) =>
        matchesMissingCategory(record) && isScheduledTraining(record),
    );
    const nextTrainings = currentTrainings.filter(
      (record: any) =>
        !(matchesMissingCategory(record) && isScheduledTraining(record)),
    );

    const { error: updateError } = await supabase
      .from("clubs")
      .update({
        weekly_schedule: nextWeeklySchedule,
        trainings: nextTrainings,
      })
      .eq("id", clubId);

    if (updateError) {
      throw updateError;
    }

    return {
      removedWeeklyScheduleItems,
      removedUpcomingTrainings,
    };
  } catch (error) {
    console.error("Error cleaning orphan scheduled trainings:", error);
    throw error;
  }
}

/**
 * Aggiorna dati del club (generico per qualsiasi tipo di dato)
 */
export async function updateClubData(
  clubId: string,
  dataType: string,
  updatedData: any[],
) {
  try {
    let retryCount = 0;
    const maxRetries = 3;

    while (retryCount < maxRetries) {
      try {
        const seasonState = isSeasonScopedDataType(dataType)
          ? await getClubSeasonState(clubId)
          : null;
        const seasonAwareData =
          seasonState?.activeSeasonId && isSeasonScopedDataType(dataType)
            ? applySeasonIdToCollection(updatedData, seasonState.activeSeasonId)
            : updatedData;

        const { error } = await writeClubFields(clubId, {
          [dataType]: seasonAwareData,
        });

        if (error) {
          if (retryCount === maxRetries - 1) {
            throw error;
          }
          retryCount++;
          await new Promise((resolve) =>
            setTimeout(resolve, 1000 * retryCount),
          );
          continue;
        }

        return seasonAwareData;
      } catch (fetchError) {
        if (retryCount === maxRetries - 1) {
          console.error(`Network error updating ${dataType}:`, fetchError);
          throw new Error(
            `Network error: ${fetchError instanceof Error ? fetchError.message : "Unknown error"}`,
          );
        }
        retryCount++;
        await new Promise((resolve) => setTimeout(resolve, 1000 * retryCount));
      }
    }
  } catch (error) {
    console.error(`Error updating ${dataType}:`, error);
    throw error;
  }
}

/**
 * Elimina un elemento dai dati del club
 */
export async function deleteClubDataItem(
  clubId: string,
  dataType: string,
  itemId: string,
) {
  try {
    const { data: clubData, error: fetchError } = await readClubFields(
      clubId,
      [dataType],
    );

    if (fetchError) throw fetchError;

    const currentData = clubData?.[dataType] || [];
    const updatedData = currentData.filter((item: any) => item.id !== itemId);

    const { error: updateError } = await writeClubFields(clubId, {
      [dataType]: updatedData,
    });

    if (updateError) throw updateError;

    return updatedData;
  } catch (error) {
    console.error(`Error deleting ${dataType} item:`, error);
    throw error;
  }
}

/**
 * Aggiorna completamente un array di dati del club (per sostituire tutti gli elementi)
 */
export async function updateClubDataArray(
  clubId: string,
  dataType: string,
  newData: any[],
) {
  try {
    let retryCount = 0;
    const maxRetries = 3;

    while (retryCount < maxRetries) {
      try {
        console.log(
          `[updateClubDataArray] Updating ${dataType} for club ${clubId}`,
          newData,
        );

        const { data, error } = await supabase
          .from("clubs")
          .update({
            [dataType]: newData,
          })
          .eq("id", clubId)
          .select(dataType)
          .single();

        if (error) {
          console.warn(
            `[updateClubDataArray] Error on attempt ${retryCount + 1}:`,
            error.message,
          );
          if (retryCount === maxRetries - 1) {
            throw error;
          }
          retryCount++;
          await new Promise((resolve) =>
            setTimeout(resolve, 1000 * retryCount),
          );
          continue;
        }

        console.log(
          `[updateClubDataArray] Successfully updated ${dataType}:`,
          data,
        );
        return newData;
      } catch (fetchError: any) {
        if (retryCount === maxRetries - 1) {
          console.warn(
            `Network error updating ${dataType}:`,
            fetchError?.message || fetchError,
          );
          throw new Error(
            `Network error: ${fetchError?.message || "Unknown error"}`,
          );
        }
        retryCount++;
        await new Promise((resolve) => setTimeout(resolve, 1000 * retryCount));
      }
    }
  } catch (error: any) {
    console.warn(`Error updating ${dataType} array:`, error?.message || error);
    throw error;
  }
}

/**
 * Aggiorna un singolo elemento nei dati del club
 */
export async function updateClubDataItem(
  clubId: string,
  dataType: string,
  itemId: string,
  updates: any,
) {
  try {
    // `settings` arriva sempre con la proiezione: serve per stampare la
    // stagione attiva sull'elemento.
    const { data: clubData, error: fetchError } = await readClubFields(
      clubId,
      [dataType],
    );

    if (fetchError) throw fetchError;

    const currentData = clubData?.[dataType] || [];
    const seasonState = isSeasonScopedDataType(dataType)
      ? normalizeClubSeasons(
          typeof clubData?.settings === "object" && clubData?.settings
            ? clubData.settings
            : {},
        )
      : null;
    const updatedData = currentData.map((item: any) =>
      item.id === itemId
        ? {
            ...item,
            ...updates,
            ...(seasonState?.activeSeasonId && isSeasonScopedDataType(dataType)
              ? { seasonId: item.seasonId || seasonState.activeSeasonId }
              : {}),
            updated_at: new Date().toISOString(),
          }
        : item,
    );

    const { error: updateError } = await writeClubFields(clubId, {
      [dataType]: updatedData,
    });

    if (updateError) throw updateError;

    return updatedData;
  } catch (error) {
    console.error(`Error updating ${dataType} item:`, error);
    throw error;
  }
}

/**
 * Salva un template di documento nel database
 */
export async function saveDocumentTemplate(clubId: string, template: any) {
  try {
    return await addClubData(clubId, "document_templates", template);
  } catch (error) {
    console.error("Error saving document template:", error);
    throw error;
  }
}

/**
 * Ottiene tutti i template di documenti di un club
 */
export async function getDocumentTemplates(clubId: string) {
  try {
    return await getClubData(clubId, "document_templates");
  } catch (error) {
    console.error("Error fetching document templates:", error);
    return [];
  }
}

/**
 * Aggiorna un template di documento
 */
export async function updateDocumentTemplate(
  clubId: string,
  templateId: string,
  updates: any,
) {
  try {
    return await updateClubDataItem(
      clubId,
      "document_templates",
      templateId,
      updates,
    );
  } catch (error) {
    console.error("Error updating document template:", error);
    throw error;
  }
}

/**
 * Elimina un template di documento
 */
export async function deleteDocumentTemplate(
  clubId: string,
  templateId: string,
) {
  try {
    return await deleteClubDataItem(clubId, "document_templates", templateId);
  } catch (error) {
    console.error("Error deleting document template:", error);
    throw error;
  }
}

/**
 * Ottiene gli atleti di un club filtrati per categorie
 */
export async function getAthletesByCategories(
  clubId: string,
  categoryIds: string[],
) {
  try {
    const athletes = await getClubAthletes(clubId);
    const filteredAthletes = (athletes || [])
      .filter((athlete: any) => athleteMatchesAnyCategory(athlete, categoryIds))
      .sort(compareAthletesByLastName);

    return filteredAthletes.map((athlete: any) => ({
      id: athlete.id,
      name: `${athlete.first_name} ${athlete.last_name}`,
      avatar:
        athlete.data?.avatar ||
        `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(athlete.first_name + athlete.last_name)}`,
      category: athlete.data?.category,
    }));
  } catch (error) {
    console.error("Error fetching athletes by categories:", error);
    throw error;
  }
}

/**
 * Salva le presenze di un allenamento
 */
export async function saveTrainingAttendance(
  clubId: string,
  trainingId: string,
  attendanceData: {
    athleteId: string;
    present: boolean;
    notes: string;
    isExtraCategory?: boolean;
    isManualExtra?: boolean;
    categoryMembershipType?: string | null;
  }[],
) {
  try {
    const nowIso = new Date().toISOString();
    const normalizedAttendance = attendanceData.map((entry) => ({
      ...entry,
      status: entry.present ? "present" : "absent",
      notes: entry.notes || "",
    }));

    for (const entry of normalizedAttendance) {
      const { data: existingRows, error: existingError } = await supabase
        .from("training_attendance")
        .select("id")
        .eq("organization_id", clubId)
        .eq("training_id", trainingId)
        .eq("athlete_id", entry.athleteId)
        .order("created_at", { ascending: true });

      if (existingError) {
        throw existingError;
      }

      const rowPayload = {
        organization_id: clubId,
        training_id: trainingId,
        athlete_id: entry.athleteId,
        status: entry.status,
        notes: entry.notes || null,
        updated_at: nowIso,
      };

      if (Array.isArray(existingRows) && existingRows.length > 0) {
        const [primaryRow] = existingRows;
        const { error: updateAttendanceError } = await supabase
          .from("training_attendance")
          .update(rowPayload)
          .eq("id", primaryRow.id);

        if (updateAttendanceError) {
          throw updateAttendanceError;
        }

        /*
          **Le righe duplicate non si cancellano piu.**

          Erano la compensazione a un difetto che adesso non esiste: dalla Wave
          2 la chiave unica `(organization_id, training_id, athlete_id)` le
          impedisce a monte. Continuare a cancellarle sarebbe un `DELETE` su
          righe che oggi portano anche la **risposta della famiglia**, e la
          prossima persona che tocca questo blocco non avrebbe modo di sapere
          perche c'era.
        */
      } else {
        const { error: insertAttendanceError } = await supabase
          .from("training_attendance")
          .insert(rowPayload);

        /*
          **Una chiave duplicata qui non e un errore dell'appello.**

          Fra la lettura qui sopra e questo inserimento puo essersi infilata
          un'altra scrittura sulla stessa terna: un secondo clic su «Salva
          presenze», un altro allenatore, una richiesta ritentata dalla rete, o
          la risposta RSVP di una famiglia che fa `upsert` sulla stessa riga.
          Prima della chiave unica quella corsa produceva un doppione silenzioso;
          adesso produrrebbe un `23505` che, risalendo, farebbe fallire **tutto
          l'appello** invece della singola riga — si perderebbe il lavoro
          dell'allenatore per una riga che nel frattempo qualcun altro ha gia
          scritto.

          Si riprova quindi come aggiornamento: e la stessa cosa che il ramo
          sopra avrebbe fatto se la riga fosse esistita un istante prima.
        */
        if (insertAttendanceError) {
          const codice = String((insertAttendanceError as any)?.code || "");
          const messaggio = String((insertAttendanceError as any)?.message || "");
          const duplicata =
            codice === "23505" ||
            codice === "P2002" ||
            /duplicate key|unique constraint/i.test(messaggio);

          if (!duplicata) {
            throw insertAttendanceError;
          }

          const { error: retryError } = await supabase
            .from("training_attendance")
            .update(rowPayload)
            .eq("organization_id", clubId)
            .eq("training_id", trainingId)
            .eq("athlete_id", entry.athleteId);

          if (retryError) {
            throw retryError;
          }
        }
      }
    }

    // Get current club data
    const { data: clubData, error: fetchError } = await supabase
      .from("clubs")
      .select("trainings")
      .eq("id", clubId)
      .single();

    if (fetchError) throw fetchError;

    const currentTrainings = clubData?.trainings || [];
    const updatedTrainings = currentTrainings.map((training: any) => {
      if (training.id === trainingId) {
        return {
          ...training,
          attendance: normalizedAttendance,
          attendees: normalizedAttendance.filter((entry) => entry.present)
            .length,
          updated_at: nowIso,
        };
      }
      return training;
    });

    // Update the club data
    const { error: updateError } = await supabase
      .from("clubs")
      .update({
        trainings: updatedTrainings,
      })
      .eq("id", clubId);

    if (updateError) throw updateError;

    const { data: resourceItems, error: resourceFetchError } = await supabase
      .from("club_resource_items")
      .select("id, payload")
      .eq("organization_id", clubId)
      .eq("resource_type", "trainings");

    if (!resourceFetchError && Array.isArray(resourceItems)) {
      const resourceItem = resourceItems.find((item: any) => {
        const payload = item?.payload;
        return (
          item?.id === trainingId ||
          (payload && typeof payload === "object" && payload.id === trainingId)
        );
      });

      if (resourceItem?.id) {
        const payload =
          resourceItem.payload && typeof resourceItem.payload === "object"
            ? resourceItem.payload
            : {};
        const nextPayload = {
          ...payload,
          attendance: normalizedAttendance,
          attendees: normalizedAttendance.filter((entry) => entry.present)
            .length,
          updated_at: nowIso,
        };

        const { error: resourceUpdateError } = await supabase
          .from("club_resource_items")
          .update({
            payload: nextPayload,
            updated_at: nowIso,
          })
          .eq("id", resourceItem.id);

        if (resourceUpdateError) {
          throw resourceUpdateError;
        }
      }
    } else if (resourceFetchError) {
      console.warn(
        "Unable to sync training attendance resource item:",
        resourceFetchError.message || resourceFetchError,
      );
    }

    return updatedTrainings;
  } catch (error) {
    console.error("Error saving training attendance:", error);
    throw error;
  }
}

export async function clearUpcomingGeneratedTrainings(
  clubId: string,
  referenceDate = new Date(),
) {
  try {
    const { data: clubData, error: fetchError } = await supabase
      .from("clubs")
      .select("trainings")
      .eq("id", clubId)
      .single();

    if (fetchError) throw fetchError;

    const currentTrainings = Array.isArray(clubData?.trainings)
      ? clubData.trainings
      : [];

    const removedTrainings = currentTrainings.filter((training: any) =>
      isUpcomingGeneratedTraining(training, referenceDate),
    );
    const updatedTrainings = currentTrainings.filter(
      (training: any) => !isUpcomingGeneratedTraining(training, referenceDate),
    );

    const { error: updateError } = await supabase
      .from("clubs")
      .update({
        trainings: updatedTrainings,
      })
      .eq("id", clubId);

    if (updateError) throw updateError;

    return {
      removedTrainings,
      updatedTrainings,
    };
  } catch (error) {
    console.error("Error clearing upcoming generated trainings:", error);
    throw error;
  }
}

/**
 * Genera allenamenti automaticamente dal programma settimanale
 */
export async function generateTrainingsFromWeeklySchedule(
  clubId: string,
  weeklySchedule: any[],
  startDate: Date,
  endDate: Date,
) {
  try {
    const generatedTrainings = [];
    const dayMap = {
      Lunedì: 1,
      Martedì: 2,
      Mercoledì: 3,
      Giovedì: 4,
      Venerdì: 5,
      Sabato: 6,
      Domenica: 0,
    };

    const normalizedWeeklySchedule = (Array.isArray(weeklySchedule)
      ? weeklySchedule
      : []
    )
      .map((item) =>
        item && typeof item === "object"
          ? normalizeWeeklyScheduleSourceItem(item)
          : null,
      )
      .filter(Boolean) as Record<string, any>[];

    if (!normalizedWeeklySchedule.length) {
      return [];
    }

    const [
      { data: clubData },
      clubCategories,
      trainers,
      structures,
      athletes,
    ] = await Promise.all([
      supabase.from("clubs").select("trainings").eq("id", clubId).single(),
      getClubData(clubId, "categories"),
      getClubTrainers(clubId),
      getClubStructures(clubId),
      getClubAthletes(clubId),
    ]);

    const existingTrainings = Array.isArray(clubData?.trainings)
      ? clubData.trainings
      : [];
    const normalizedExistingTrainings = dedupeTrainings(existingTrainings);
    const categoryList = Array.isArray(clubCategories) ? clubCategories : [];
    const trainerList = Array.isArray(trainers) ? trainers : [];
    const athleteList = Array.isArray(athletes) ? athletes : [];
    const builtLocationOptions = buildTrainingLocationOptions(structures);
    const locationOptions =
      builtLocationOptions.length > 0
        ? builtLocationOptions
        : getFallbackTrainingLocationOptions();
    const existingKeys = new Set(
      normalizedExistingTrainings.map((training: any) =>
        [
          training.date,
          training.time,
          training.locationId || training.fieldId || "",
          training.categoryId || "",
        ].join("|"),
      ),
    );

    // Generate trainings for each day in the date range
    const currentDate = new Date(startDate);
    while (currentDate <= endDate) {
      const dayName = resolveTrainingWeekday({ date: currentDate });

      if (dayName) {
        const daySchedule = normalizedWeeklySchedule.filter(
          (item) => item.day === dayName,
        );

        for (const scheduleItem of daySchedule) {
          const trainingDate = formatLocalDateKey(currentDate);
          const trainingStart = buildTrainingStart(
            trainingDate,
            scheduleItem.startTime,
          );

          if (!trainingStart || trainingStart <= new Date()) {
            continue;
          }

          const trainingId = `training-${trainingDate}-${scheduleItem.id}`;
          const rawScheduleCategory = String(
            scheduleItem.categoryId ||
              scheduleItem.category?.id ||
              scheduleItem.category?.name ||
              scheduleItem.category ||
              "",
          ).trim();
          const resolvedCategoryId =
            resolveCategoryId(rawScheduleCategory, categoryList) || "";
          const resolvedCategoryLabel = resolveCategoryLabel(
            rawScheduleCategory,
            categoryList,
          );
          const category = categoryList.find(
            (item: any) =>
              String(item?.id || "").trim() === resolvedCategoryId ||
              String(item?.name || "").trim() === resolvedCategoryLabel,
          );
          const categoryId = resolvedCategoryId || rawScheduleCategory;
          const categoryOptions =
            category || categoryId || resolvedCategoryLabel
              ? [
                  category || {
                    id: categoryId || resolvedCategoryLabel,
                    name: resolvedCategoryLabel || categoryId || "Categoria",
                  },
                ]
              : [];
          const trainerNames = Array.isArray(scheduleItem.trainerIds)
            ? scheduleItem.trainerIds
                .map(
                  (trainerId: string) =>
                    trainerList.find((trainer: any) => trainer.id === trainerId)
                      ?.name,
                )
                .filter(Boolean)
            : [];
          const location = findTrainingLocationOption(locationOptions, {
            structureId: scheduleItem.structureId,
            fieldId: scheduleItem.locationId,
            locationId: scheduleItem.locationId,
          });
          const duplicateKey = [
            trainingDate,
            scheduleItem.startTime,
            location?.fieldId || scheduleItem.locationId || "",
            categoryId || "",
          ].join("|");

          // Check if training already exists
          const exists = existingKeys.has(duplicateKey);

          if (!exists) {
            generatedTrainings.push({
              id: trainingId,
              title: formatTrainingTitle(trainingDate),
              date: trainingDate,
              time: scheduleItem.startTime,
              endTime: scheduleItem.endTime,
              categoryId: categoryId || null,
              categories: categoryId ? [categoryId] : [],
              category: resolvedCategoryLabel || category?.name || "Categoria",
              trainerIds: Array.isArray(scheduleItem.trainerIds)
                ? scheduleItem.trainerIds
                : [],
              trainer:
                trainerNames.length > 0
                  ? trainerNames.join(", ")
                  : "Allenatore",
              structureId:
                location?.structureId || scheduleItem.structureId || null,
              locationId: location?.fieldId || scheduleItem.locationId,
              location: location?.name || "Campo",
              attendees: 0,
              expectedAttendees: athleteList.filter((athlete: any) =>
                athleteMatchesAnyCategory(athlete, categoryOptions),
              ).length,
              categoryColor: "bg-blue-500 text-white",
              status: "upcoming",
              generated: true,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            });
            existingKeys.add(duplicateKey);
          }
        }
      }

      currentDate.setDate(currentDate.getDate() + 1);
    }

    const updatedTrainings = dedupeTrainings([
      ...normalizedExistingTrainings,
      ...generatedTrainings,
    ]);

    if (
      generatedTrainings.length > 0 ||
      updatedTrainings.length !== existingTrainings.length
    ) {
      // Add generated trainings to existing ones and persist the deduplicated list.
      // Update the club data
      const { error: updateError } = await supabase
        .from("clubs")
        .update({
          trainings: updatedTrainings,
        })
        .eq("id", clubId);

      if (updateError) throw updateError;
    }

    return generatedTrainings;
  } catch (error) {
    console.error("Error generating trainings from weekly schedule:", error);
    throw error;
  }
}

/**
 * Aggiunge un membro dello staff al club (separato dagli allenatori)
 */
export async function addStaffMember(clubId: string, staffMemberData: any) {
  try {
    console.log("Adding staff member to club:", clubId, staffMemberData);

    if (!clubId) {
      throw new Error("Club ID is required");
    }

    const firstName = String(
      staffMemberData.firstName || staffMemberData.name || "",
    ).trim();
    const lastName = String(
      staffMemberData.lastName || staffMemberData.surname || "",
    ).trim();
    const fullName = [firstName, lastName].filter(Boolean).join(" ").trim();
    const email = String(staffMemberData.email || "")
      .trim()
      .toLowerCase();
    const phone = String(staffMemberData.phone || "").trim();

    if (!firstName || !lastName || !staffMemberData.role) {
      throw new Error("Nome, cognome e ruolo sono obbligatori");
    }

    if (!email && !phone) {
      throw new Error("Inserisci almeno un contatto tra email e telefono");
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (email && !emailRegex.test(email)) {
      throw new Error("Invalid email format");
    }

    // Generate unique ID with timestamp and random component
    const uniqueId = `staff-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const newStaffMember = {
      id: uniqueId,
      name: firstName,
      firstName,
      surname: lastName,
      lastName,
      fullName,
      email,
      phone,
      role: staffMemberData.role.trim(),
      department: staffMemberData.department || "Amministrazione",
      status: staffMemberData.status || "active",
      hireDate:
        staffMemberData.hireDate || new Date().toISOString().split("T")[0],
      avatar:
        staffMemberData.avatar ||
        `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent((fullName || firstName).replace(/\s+/g, ""))}&format=svg`,
      birthDate: staffMemberData.birthDate || "",
      nationality: staffMemberData.nationality || "",
      birthPlace: staffMemberData.birthPlace || "",
      gender: staffMemberData.gender || "",
      address: staffMemberData.address || "",
      city: staffMemberData.city || "",
      postalCode: staffMemberData.postalCode || "",
      fiscalCode: staffMemberData.fiscalCode || "",
      documentType: staffMemberData.documentType || "",
      documentNumber: staffMemberData.documentNumber || "",
      documentExpiry: staffMemberData.documentExpiry || "",
      notes: staffMemberData.notes || "",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    console.log("New staff member object:", newStaffMember);

    // Use the generic addClubData function to add to staff_members array
    const addedStaffMember = await addClubData(
      clubId,
      "staff_members",
      newStaffMember,
    );

    console.log("Staff member added successfully:", addedStaffMember);
    return addedStaffMember;
  } catch (error) {
    console.error("Error adding staff member:", error);

    // Provide more specific error messages
    if (error instanceof Error) {
      throw error;
    } else if (typeof error === "object" && error !== null) {
      if ("message" in error) {
        throw new Error(String(error.message));
      } else if ("code" in error) {
        throw new Error(`Database error: ${error.code}`);
      }
    }

    throw new Error("Unknown error occurred while adding staff member");
  }
}

/**
 * Ottiene tutti i membri dello staff di un club (separati dagli allenatori)
 */
export async function getClubStaff(clubId: string) {
  try {
    console.log("[getClubStaff] Fetching staff for club:", clubId);

    if (!clubId) {
      console.warn("[getClubStaff] No club ID provided");
      return [];
    }

    // Add retry logic for database queries
    let retryCount = 0;
    const maxRetries = 3;
    const retryDelay = 1000; // 1 second base delay

    while (retryCount < maxRetries) {
      try {
        console.log(
          `[getClubStaff] Query attempt ${retryCount + 1}/${maxRetries}`,
        );

        const { data: clubData, error } = await supabase
          .from("clubs")
          .select("staff_members")
          .eq("id", clubId)
          .single();

        if (error) {
          // If column doesn't exist, return empty array
          if (error.code === "42703") {
            console.warn(
              "[getClubStaff] Column 'staff_members' does not exist, returning empty array",
            );
            return [];
          }

          // If club not found, return empty array
          if (error.code === "PGRST116") {
            console.warn(
              `[getClubStaff] Club with ID ${clubId} not found, returning empty array`,
            );
            return [];
          }

          // For network errors, retry
          if (retryCount < maxRetries - 1) {
            console.log(
              `[getClubStaff] Retrying after ${retryDelay * (retryCount + 1)}ms...`,
            );
            await new Promise((resolve) =>
              setTimeout(resolve, retryDelay * (retryCount + 1)),
            );
            retryCount++;
            continue;
          }

          // If all retries failed, return empty array
          console.warn(
            `[getClubStaff] Failed after ${maxRetries} retries, returning empty array`,
          );
          return [];
        }

        const staffMembers = clubData?.staff_members || [];
        console.log(
          "[getClubStaff] Successfully fetched staff members:",
          staffMembers.length,
        );

        // Ensure we return an array with proper structure
        const processedStaff = Array.isArray(staffMembers)
          ? staffMembers
              .map((staff: any) => {
                if (typeof staff === "object" && staff !== null) {
                  const fullName =
                    staff.fullName ||
                    [staff.name, staff.surname || staff.lastName]
                      .filter(Boolean)
                      .join(" ")
                      .trim();

                  return {
                    id:
                      staff.id ||
                      `staff-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                    name: staff.name || fullName || "Nome non disponibile",
                    fullName: fullName || undefined,
                    surname: staff.surname || staff.lastName || "",
                    email: staff.email || "",
                    role: staff.role || "Staff",
                    department: staff.department || "Amministrazione",
                    status: staff.status || "active",
                    phone: staff.phone || "",
                    hireDate:
                      staff.hireDate || new Date().toISOString().split("T")[0],
                    avatar:
                      staff.avatar ||
                      `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent((staff.name || "staff").replace(/\s+/g, ""))}&format=svg`,
                  };
                }
                return null;
              })
              .filter(Boolean)
          : [];

        console.log(
          `[getClubStaff] Returning ${processedStaff.length} processed staff members`,
        );
        return processedStaff;
      } catch (fetchError: any) {
        console.error(
          `[getClubStaff] Network error (attempt ${retryCount + 1}):`,
          fetchError?.message || fetchError,
        );

        if (retryCount < maxRetries - 1) {
          console.log(
            `[getClubStaff] Retrying after ${retryDelay * (retryCount + 1)}ms...`,
          );
          await new Promise((resolve) =>
            setTimeout(resolve, retryDelay * (retryCount + 1)),
          );
          retryCount++;
          continue;
        }

        console.error(
          `[getClubStaff] Network error after ${maxRetries} retries, returning empty array`,
        );
        return [];
      }
    }

    return [];
  } catch (error) {
    console.error("[getClubStaff] Unexpected error:", error);
    // Return empty array instead of throwing to prevent UI crashes
    return [];
  }
}

/**
 * Aggiorna un membro dello staff (separato dagli allenatori)
 */
export async function updateStaffMember(
  clubId: string,
  staffMemberId: string,
  updates: any,
) {
  try {
    console.log("Updating staff member:", clubId, staffMemberId, updates);

    // Get current staff members
    const currentStaffMembers = await getClubData(clubId, "staff_members");

    // Update the specific staff member
    const updatedStaffMembers = currentStaffMembers.map((member: any) => {
      if (member.id === staffMemberId) {
        return {
          ...member,
          ...updates,
          updated_at: new Date().toISOString(),
        };
      }
      return member;
    });

    // Update the club data using the generic function
    await updateClubData(clubId, "staff_members", updatedStaffMembers);

    console.log("Staff member updated successfully");
    return updatedStaffMembers;
  } catch (error) {
    console.error("Error updating staff member:", error);
    throw error;
  }
}

/**
 * Elimina un membro dello staff (separato dagli allenatori)
 */
export async function deleteStaffMember(clubId: string, staffMemberId: string) {
  try {
    console.log("Deleting staff member:", clubId, staffMemberId);

    // Use the generic deleteClubDataItem function to remove from staff_members array
    const updatedStaffMembers = await deleteClubDataItem(
      clubId,
      "staff_members",
      staffMemberId,
    );

    console.log("Staff member deleted successfully");
    return updatedStaffMembers;
  } catch (error) {
    console.error("Error deleting staff member:", error);
    throw error;
  }
}

/**
 * Ottiene tutti gli allenatori di un club
 */
export async function getClubTrainers(clubId: string) {
  try {
    const [clubCategories, trainersData, resourceTrainers, staffMembers] =
      await Promise.all([
        getClubCategories(clubId),
        getClubData(clubId, "trainers"),
        getClubResourcePayloads(clubId, "trainers"),
        getClubData(clubId, "staff_members"),
      ]);

    const legacyTrainerStaff = Array.isArray(staffMembers)
      ? staffMembers.filter(isTrainerLikeStaffMember)
      : [];

    return normalizeTrainerList(
      [trainersData, resourceTrainers, legacyTrainerStaff],
      clubCategories,
    );
  } catch (error) {
    console.error("Error fetching club trainers:", error);
    // Return empty array instead of throwing to prevent UI crashes
    return [];
  }
}

/** Un membro dello staff che `getClubTrainers` considera anche un allenatore. */
export const isTrainerLikeStaffMember = (staff: any) =>
  ["trainer", "allenatore"].includes(
    String(staff?.role || staff?.type || "")
      .trim()
      .toLowerCase(),
  );

const toIdentityToken = (value: unknown) =>
  String(value || "").trim().toLowerCase();

/**
 * Identificatori forti di un allenatore. `normalizeTrainerList` costruisce
 * l'`id` mostrato in lista da uno di questi, quando ce n'e uno.
 */
const getTrainerStrongTokens = (entry: any) => {
  const record = isRecord(entry) ? entry : {};

  return [
    record.id,
    record.trainerId,
    record.trainer_id,
    record.user_id,
    record.userId,
    record.linkedUserId,
    record.linked_user_id,
  ]
    .map(toIdentityToken)
    .filter(Boolean);
};

/**
 * Ripieghi usati da `normalizeTrainerList` quando l'allenatore non ha nessun
 * identificatore forte. Si consultano **solo** se nessuna voce ha risposto sui
 * token forti: un nome puo collidere, un id no.
 */
const getTrainerWeakTokens = (entry: any) => {
  const record = isRecord(entry) ? entry : {};

  return [
    record.email,
    record.mail,
    record.linkedUserEmail,
    record.linked_user_email,
    record.name,
    record.fullName,
  ]
    .map(toIdentityToken)
    .filter(Boolean);
};

/**
 * Elimina davvero un allenatore.
 *
 * `getClubTrainers` unisce **tre** origini: il campo JSON `clubs.trainers`, le
 * righe `club_resource_items` di tipo `trainers` e i membri dello staff con
 * ruolo allenatore. Toccarne una sola faceva ricomparire l'allenatore al primo
 * refresh (WP-32).
 *
 * Scrivere `clubs.trainers` copre anche `club_resource_items`: il server
 * risincronizza le righe dal campo JSON nella stessa transazione.
 */
export async function deleteClubTrainer(clubId: string, trainerId: string) {
  const target = toIdentityToken(trainerId);

  if (!clubId || !target) {
    throw new Error("Allenatore non valido");
  }

  const { data: clubData, error: fetchError } = await readClubFields(clubId, [
    "trainers",
    "staff_members",
  ]);

  if (fetchError) {
    throw fetchError;
  }

  const currentTrainers = Array.isArray(clubData?.trainers)
    ? clubData.trainers
    : [];
  const currentStaff = Array.isArray(clubData?.staff_members)
    ? clubData.staff_members
    : [];
  const trainerLikeStaff = currentStaff.filter(isTrainerLikeStaffMember);
  const candidates = [...currentTrainers, ...trainerLikeStaff];

  const matchedOnStrongToken = candidates.some((entry: any) =>
    getTrainerStrongTokens(entry).includes(target),
  );
  const matchesTarget = (entry: any) =>
    matchedOnStrongToken
      ? getTrainerStrongTokens(entry).includes(target)
      : getTrainerWeakTokens(entry).includes(target);

  const nextTrainers = currentTrainers.filter(
    (entry: any) => !matchesTarget(entry),
  );
  // Un membro dello staff che non e un allenatore non va toccato: qui si sta
  // eliminando un allenatore, non una persona dallo staff.
  const nextStaff = currentStaff.filter(
    (entry: any) => !(isTrainerLikeStaffMember(entry) && matchesTarget(entry)),
  );

  const updates: Record<string, any> = {};
  if (nextTrainers.length !== currentTrainers.length) {
    updates.trainers = nextTrainers;
  }
  if (nextStaff.length !== currentStaff.length) {
    updates.staff_members = nextStaff;
  }

  if (Object.keys(updates).length > 0) {
    const { error: updateError } = await writeClubFields(clubId, updates);

    if (updateError) {
      throw updateError;
    }

    return { removed: true, trainers: nextTrainers };
  }

  // Nessuna corrispondenza nei campi JSON: l'allenatore puo esistere solo come
  // riga `club_resource_items`, se le due rappresentazioni si sono disallineate.
  // L'endpoint della risorsa accetta sia l'UUID della riga sia l'id logico e
  // riallinea il campo JSON del club.
  const deleteResponse = await apiRequest<any>(
    `/api/v1/trainers/${encodeURIComponent(trainerId)}`,
    { method: "DELETE" },
  );

  if (!deleteResponse.error) {
    return { removed: true, trainers: nextTrainers };
  }

  return { removed: false, trainers: currentTrainers };
}
