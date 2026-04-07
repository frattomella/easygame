import { supabase } from "./supabase";
import {
  getTrainerDisplayName,
  normalizeTrainerCategories,
} from "./trainer-utils";
import {
  buildTrainingLocationOptions,
  findTrainingLocationOption,
  getFallbackTrainingLocationOptions,
} from "./training-location-options";
import {
  isUpcomingGeneratedTraining,
} from "./training-utils";
import {
  applySeasonIdToCollection,
  applySeasonIdToRecord,
  filterCollectionBySeason,
  isSeasonScopedDataType,
  normalizeClubSeasons,
} from "./club-seasons";

const CLUB_DIRECT_UPDATE_FIELDS = [
  "categories",
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

const getClubSeasonState = async (clubId: string) => {
  const { data, error } = await supabase
    .from("clubs")
    .select("settings")
    .eq("id", clubId)
    .single();

  if (error) {
    return {
      seasons: [],
      activeSeasonId: null,
      activeSeason: null,
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
      clubs?.map((club) => {
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
export async function getClubAthletes(clubId: string) {
  try {
    const { data, error } = await supabase
      .from("simplified_athletes")
      .select("*")
      .eq("club_id", clubId);

    if (error) {
      // Handle network errors gracefully
      if (
        error.message?.includes("Failed to fetch") ||
        error.message?.includes("TypeError")
      ) {
        console.warn(
          "Network error fetching club athletes, returning empty array",
        );
        return [];
      }
      console.warn("Error fetching club athletes:", error.message || error);
      return [];
    }

    return data || [];
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

/**
 * Aggiunge un nuovo atleta al club
 */
export async function addClubAthlete(clubId: string, athleteData: any) {
  const categoryId = athleteData.category || null;
  const categoryName = athleteData.categoryName || null;
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

  const { data, error } = await supabase
    .from("simplified_athletes")
    .insert({
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
        category: categoryId,
        categoryName,
        birthDate,
        medicalCertExpiry,
        accessCode,
        avatar,
        status,
      },
      created_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) {
    console.error("Error adding athlete:", error);
    throw error;
  }

  return data;
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

    return data;
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
    const updatedData = {
      ...currentAthlete.data,
      ...updates,
    };

    const rawBirthDate = updates.birthDate || updates.birth_date;
    const nextBirthDate =
      typeof rawBirthDate === "string" && rawBirthDate.trim()
        ? rawBirthDate.includes("T")
          ? rawBirthDate
          : `${rawBirthDate.trim()}T00:00:00.000Z`
        : currentAthlete.birth_date || null;

    const nextCategoryId =
      updates.category ?? updates.category_id ?? currentAthlete.category_id ?? null;
    const nextCategoryName =
      updates.categoryName ??
      updates.category_name ??
      currentAthlete.category_name ??
      null;
    const nextStatus = updates.status ?? currentAthlete.status ?? "active";
    const nextAccessCode =
      updates.accessCode ?? updates.access_code ?? currentAthlete.access_code ?? null;
    const nextAvatar =
      updates.avatar ?? updates.avatar_url ?? currentAthlete.avatar_url ?? null;
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

    // Update the athlete
    const { data, error } = await supabase
      .from("simplified_athletes")
      .update({
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

    return data;
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
 * Aggiunge un contratto per un allenatore
 */
export async function addTrainerContract(
  clubId: string,
  trainerId: string,
  contractData: any,
) {
  try {
    console.log(
      "Adding trainer contract to club:",
      clubId,
      trainerId,
      contractData,
    );

    // Validate inputs
    if (!clubId || typeof clubId !== "string") {
      throw new Error("Valid club ID is required");
    }

    if (!trainerId || typeof trainerId !== "string") {
      throw new Error("Valid trainer ID is required");
    }

    if (!contractData || typeof contractData !== "object") {
      throw new Error("Valid contract data is required");
    }

    let retryCount = 0;
    const maxRetries = 3;

    while (retryCount < maxRetries) {
      try {
        // Get current club data
        const { data: clubData, error: fetchError } = await supabase
          .from("clubs")
          .select("trainer_contracts, id")
          .eq("id", clubId)
          .single();

        if (fetchError) {
          if (retryCount === maxRetries - 1) {
            console.error(
              "Error fetching club data for trainer contracts:",
              fetchError,
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

        const currentContracts = Array.isArray(clubData.trainer_contracts)
          ? clubData.trainer_contracts
          : [];

        const newContract = {
          ...contractData,
          id:
            contractData.id ||
            `contract-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          trainer_id: trainerId,
          created_at: contractData.created_at || new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        const updatedContracts = [...currentContracts, newContract];

        console.log(
          `Updating club ${clubId} with new trainer contract:`,
          updatedContracts,
        );

        // Update the club data
        const { data: updateResult, error: updateError } = await supabase
          .from("clubs")
          .update({
            trainer_contracts: updatedContracts,
          })
          .eq("id", clubId)
          .select();

        if (updateError) {
          if (retryCount === maxRetries - 1) {
            console.error(
              "Error updating club trainer contracts:",
              updateError,
            );
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

        if (!updateResult || updateResult.length === 0) {
          throw new Error(
            "No rows updated when adding trainer contract. Club may not exist.",
          );
        }

        console.log("Successfully added trainer contract:", newContract);
        return newContract;
      } catch (fetchError) {
        if (retryCount === maxRetries - 1) {
          console.error("Network error adding trainer contract:", fetchError);
          throw new Error(`Network error: ${fetchError.message}`);
        }
        retryCount++;
        await new Promise((resolve) => setTimeout(resolve, 1000 * retryCount));
      }
    }
  } catch (error) {
    console.error("Error adding trainer contract:", error);

    // Re-throw with more context if it's already an Error
    if (error instanceof Error) {
      throw error;
    }

    // Convert other error types to Error objects
    throw new Error(`Unknown error adding trainer contract: ${String(error)}`);
  }
}

/**
 * Ottiene i contratti di un allenatore
 */
export async function getTrainerContracts(clubId: string, trainerId: string) {
  try {
    const { data: clubData, error } = await supabase
      .from("clubs")
      .select("trainer_contracts")
      .eq("id", clubId)
      .single();

    if (error) {
      // If the column doesn't exist, return empty array instead of throwing error
      if (error.code === "42703") {
        console.warn(
          "Column 'trainer_contracts' does not exist in clubs table, returning empty array",
        );
        return [];
      }
      throw error;
    }

    const contracts = (clubData?.trainer_contracts || []).filter(
      (contract: any) => contract.trainer_id === trainerId,
    );

    return contracts;
  } catch (error) {
    console.error("Error fetching trainer contracts:", error);
    // If it's a column not found error, return empty array
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "42703"
    ) {
      return [];
    }
    throw error;
  }
}

/**
 * Elimina un contratto di un allenatore
 */
export async function deleteTrainerContract(
  clubId: string,
  trainerId: string,
  contractId: string,
) {
  try {
    // Get current club data
    const { data: clubData, error: fetchError } = await supabase
      .from("clubs")
      .select("trainer_contracts")
      .eq("id", clubId)
      .single();

    if (fetchError) throw fetchError;

    const currentContracts = clubData?.trainer_contracts || [];
    const updatedContracts = currentContracts.filter(
      (contract: any) =>
        !(contract.id === contractId && contract.trainer_id === trainerId),
    );

    // Update the club data
    const { error: updateError } = await supabase
      .from("clubs")
      .update({
        trainer_contracts: updatedContracts,
      })
      .eq("id", clubId);

    if (updateError) throw updateError;

    return updatedContracts.filter(
      (contract: any) => contract.trainer_id === trainerId,
    );
  } catch (error) {
    console.error("Error deleting trainer contract:", error);
    throw error;
  }
}

/**
 * Ottiene il PIN di pagamento del club
 */
export async function getClubPaymentPin(clubId: string) {
  try {
    const { data: clubData, error } = await supabase
      .from("clubs")
      .select("payment_pin")
      .eq("id", clubId)
      .single();

    if (error) throw error;

    return clubData?.payment_pin || "1234"; // fallback to default
  } catch (error) {
    console.error("Error fetching club payment pin:", error);
    return "1234"; // fallback to default
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
    console.log(`Adding ${dataType} to club ${clubId}:`, newData);

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
        // Get current club data
        const { data: clubData, error: fetchError } = await supabase
          .from("clubs")
          .select(`${dataType}, id`)
          .eq("id", clubId)
          .single();

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

        console.log(
          `Updating club ${clubId} with new ${dataType} data:`,
          updatedData,
        );

        // Update the club data
        const { data: updateResult, error: updateError } = await supabase
          .from("clubs")
          .update({
            [dataType]: updatedData,
          })
          .eq("id", clubId)
          .select();

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

        if (!updateResult || updateResult.length === 0) {
          throw new Error(
            `No rows updated when adding ${dataType}. Club may not exist.`,
          );
        }

        console.log(`Successfully added ${dataType} to club:`, seasonAwareItem);
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
    const { data: clubData, error } = await supabase
      .from("clubs")
      .select(`${dataType}, settings`)
      .eq("id", clubId)
      .single();

    if (error) {
      // If the column doesn't exist, return empty array silently for known financial columns
      if (error.code === "42703") {
        const knownMissingColumns = [
          "bank_accounts",
          "transfers",
          "expected_expenses",
          "expected_income",
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

    return filterCollectionBySeason(
      dataType,
      rawData,
      seasonState.activeSeasonId,
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

        const { error } = await supabase
          .from("clubs")
          .update({
            [dataType]: seasonAwareData,
          })
          .eq("id", clubId);

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
          throw new Error(`Network error: ${fetchError.message}`);
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
    // Get current club data
    const { data: clubData, error: fetchError } = await supabase
      .from("clubs")
      .select(`${dataType}, settings`)
      .eq("id", clubId)
      .single();

    if (fetchError) throw fetchError;

    const currentData = clubData?.[dataType] || [];
    const updatedData = currentData.filter((item: any) => item.id !== itemId);

    // Update the club data
    const { error: updateError } = await supabase
      .from("clubs")
      .update({
        [dataType]: updatedData,
      })
      .eq("id", clubId);

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
    // Get current club data
    const { data: clubData, error: fetchError } = await supabase
      .from("clubs")
      .select(dataType)
      .eq("id", clubId)
      .single();

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

    // Update the club data
    const { error: updateError } = await supabase
      .from("clubs")
      .update({
        [dataType]: updatedData,
      })
      .eq("id", clubId);

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
    const { data: athletes, error } = await supabase
      .from("simplified_athletes")
      .select("*")
      .eq("club_id", clubId);

    if (error) {
      console.error("Error fetching athletes:", error);
      throw error;
    }

    // Filter athletes by categories
    const filteredAthletes = (athletes || []).filter((athlete: any) => {
      const athleteCategory = athlete.data?.category;
      return categoryIds.includes(athleteCategory);
    });

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
  }[],
) {
  try {
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
          attendance: attendanceData,
          attendees: attendanceData.filter((entry) => entry.present).length,
          updated_at: new Date().toISOString(),
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
    const categoryList = Array.isArray(clubCategories) ? clubCategories : [];
    const trainerList = Array.isArray(trainers) ? trainers : [];
    const athleteList = Array.isArray(athletes) ? athletes : [];
    const builtLocationOptions = buildTrainingLocationOptions(structures);
    const locationOptions =
      builtLocationOptions.length > 0
        ? builtLocationOptions
        : getFallbackTrainingLocationOptions();
    const existingKeys = new Set(
      existingTrainings.map((training: any) =>
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
      const dayOfWeek = currentDate.getDay();
      const dayName = Object.keys(dayMap).find(
        (key) => dayMap[key] === dayOfWeek,
      );

      if (dayName) {
        const daySchedule = weeklySchedule.filter(
          (item) => item.day === dayName,
        );

        for (const scheduleItem of daySchedule) {
          const trainingDate = currentDate.toISOString().split("T")[0];
          const trainingId = `training-${trainingDate}-${scheduleItem.id}`;
          const category = categoryList.find(
            (item: any) => item.id === scheduleItem.categoryId,
          );
          const categoryIds = scheduleItem.categoryId
            ? [scheduleItem.categoryId]
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
            scheduleItem.categoryId || "",
          ].join("|");

          // Check if training already exists
          const exists = existingKeys.has(duplicateKey);

          if (!exists) {
            generatedTrainings.push({
              id: trainingId,
              title: category?.name
                ? `Allenamento ${category.name}`
                : `Allenamento ${dayName}`,
              date: trainingDate,
              time: scheduleItem.startTime,
              endTime: scheduleItem.endTime,
              categoryId: scheduleItem.categoryId,
              categories: categoryIds,
              category: category?.name || "Categoria",
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
                categoryIds.includes(
                  athlete?.data?.category || athlete?.category_id,
                ),
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

    if (generatedTrainings.length > 0) {
      // Add generated trainings to existing ones
      const updatedTrainings = [...existingTrainings, ...generatedTrainings];

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
    console.log("Fetching trainers for club:", clubId);

    // Use the generic getClubData function to get trainers array
    const trainersData = await getClubData(clubId, "trainers");
    const clubCategories = await getClubData(clubId, "categories");

    console.log("Found trainers data:", trainersData);
    const processedTrainers: any[] = [];

    for (const trainer of trainersData || []) {
      const trainerCategories = normalizeTrainerCategories(
        trainer.categories,
        clubCategories || [],
      );
      const trainerName = getTrainerDisplayName(trainer);

      processedTrainers.push({
        id: trainer.id,
        name: trainerName,
        email: trainer.email,
        phone: trainer.phone || "",
        categories: trainerCategories,
        salary: trainer.salary?.toString() || "0",
        avatar:
          trainer.avatar ||
          `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(trainerName.replace(/\s+/g, ""))}`,
        status: trainer.status || "active",
      });
    }

    console.log("Processed trainers:", processedTrainers);
    return processedTrainers;
  } catch (error) {
    console.error("Error fetching club trainers:", error);
    // Return empty array instead of throwing to prevent UI crashes
    return [];
  }
}
