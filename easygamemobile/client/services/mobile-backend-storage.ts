import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  Access,
  api,
  Athlete,
  Club,
  ClubCategorySummary,
  Match,
  MembershipRecord,
  Task,
  Training,
  TrainingAttendanceEntry,
  User,
} from "@/services/api";
import {
  DEFAULT_TRAINER_DASHBOARD_PERMISSIONS,
  resolveTrainerDashboardPermissions,
  TrainerDashboardPermissions,
} from "@/lib/trainer-permissions";
import {
  getTrainerCategoryIds,
  getTrainerDisplayName,
  normalizeTrainerCategories,
  normalizeTrainerLookupValue,
} from "@/lib/trainer-data";
import {
  canManageMobileTrainingAttendance,
  formatMobileMatchLocationLabel,
  getMobileReminderTargetSummary,
  isReminderVisibleToMobileContext,
} from "@/lib/trainer-dashboard-utils";

const KEYS = {
  currentContext: "@easygame/mobile/current-context",
} as const;

type CurrentContext = {
  clubId: string;
  role: string;
  accessId?: string | null;
  source?: "owned" | "assigned" | null;
};

type CreateClubInput = {
  name: string;
  city?: string;
  province?: string;
  contactEmail?: string;
  contactPhone?: string;
  logoUrl?: string;
};

type TrainerProfile = {
  id: string;
  name: string;
  email?: string;
  linkedUserId?: string | null;
  linkedUserEmail?: string | null;
  linkedAt?: string | null;
  categories: { id: string; name: string }[];
};

const normalizeText = (value: unknown) =>
  String(value || "")
    .trim()
    .toLowerCase();

const toRecord = (value: unknown) =>
  value && typeof value === "object" ? (value as Record<string, any>) : {};

const toArray = <T = any>(value: unknown): T[] =>
  Array.isArray(value) ? (value as T[]) : [];

const compact = <T,>(value: Array<T | null | undefined | false>) =>
  value.filter(Boolean) as T[];

const unique = (values: string[]) => Array.from(new Set(values.filter(Boolean)));

const roleHasFullClubAccess = (role?: string | null) =>
  role === "owner" || role === "admin";

const isoDate = (value: unknown) => {
  if (!value) {
    return undefined;
  }

  const stringValue = String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(stringValue)) {
    return stringValue;
  }

  const parsed = new Date(stringValue);
  if (Number.isNaN(parsed.getTime())) {
    return stringValue;
  }

  return parsed.toISOString().slice(0, 10);
};

const mapAthleteStatus = (value: unknown): Athlete["status"] => {
  switch (normalizeText(value)) {
    case "injured":
    case "infortunato":
      return "infortunato";
    case "suspended":
    case "squalificato":
      return "squalificato";
    default:
      return "attivo";
  }
};

const mapRoleLabel = (role: string) => {
  switch (role) {
    case "owner":
      return "Proprietario";
    case "admin":
      return "Amministratore";
    case "trainer":
      return "Allenatore";
    case "athlete":
      return "Atleta";
    case "parent":
      return "Genitore";
    default:
      return "Collaboratore";
  }
};

const buildClubPayload = (
  input: CreateClubInput,
  user: User,
  shouldBePrimary: boolean,
) => ({
  name: input.name.trim(),
  creator_id: user.id,
  logo_url: input.logoUrl?.trim() || null,
  city: input.city?.trim() || null,
  province: input.province?.trim() || null,
  contact_email:
    input.contactEmail?.trim().toLowerCase() || user.email.toLowerCase(),
  contact_phone: input.contactPhone?.trim() || user.phone || null,
  settings: {
    email: input.contactEmail?.trim().toLowerCase() || user.email.toLowerCase(),
    phone: input.contactPhone?.trim() || user.phone || null,
  },
  members: [
    {
      user_id: user.id,
      role: "owner",
      is_primary: shouldBePrimary,
    },
  ],
  dashboard_data: {
    settings: {
      theme: "default",
      layout: "standard",
      widgets: ["metrics", "activities", "trainings", "certifications"],
    },
  },
});

const mapMembershipToClub = (
  membership: MembershipRecord,
): Club => {
  const organization = membership.organization || membership.organizations || {};

  return {
    id: membership.organization_id,
    name: String(organization.name || "Club"),
    avatar: String(organization.logo_url || "").trim() || undefined,
    city: String(organization.city || "").trim() || undefined,
    province: String(organization.province || "").trim() || undefined,
    contactEmail: String(organization.contact_email || "").trim() || undefined,
    contactPhone: String(organization.contact_phone || "").trim() || undefined,
    ownerId: String(organization.creator_id || "").trim() || null,
  };
};

const isOwnedMembership = (
  membership: MembershipRecord,
  userId?: string | null,
) => {
  const club = mapMembershipToClub(membership);
  return (
    normalizeText(membership.role) === "owner" ||
    (userId ? normalizeText(club.ownerId) === normalizeText(userId) : false)
  );
};

const mapCategory = (rawCategory: any): ClubCategorySummary | null => {
  const category = toRecord(rawCategory);
  const data = toRecord(category.data);
  const id = String(category.id || data.id || data.name || "").trim();
  const name = String(category.name || data.name || data.id || id).trim();

  if (!id || !name) {
    return null;
  }

  const startYear = Number(data.birthYearStart ?? data.birth_year_start);
  const endYear = Number(data.birthYearEnd ?? data.birth_year_end);
  const birthYearsLabel =
    Number.isFinite(startYear) && Number.isFinite(endYear)
      ? `${startYear}-${endYear}`
      : String(data.birthYearsLabel || data.birthYears || "").trim() || undefined;

  return {
    id,
    name,
    birthYearsLabel,
  };
};

const resolveCategoryName = (
  rawId: unknown,
  rawName: unknown,
  categories: ClubCategorySummary[],
) => {
  const candidates = compact([
    String(rawName || "").trim(),
    String(rawId || "").trim(),
  ]);

  for (const candidate of candidates) {
    const match = categories.find(
      (category) =>
        normalizeText(category.id) === normalizeText(candidate) ||
        normalizeText(category.name) === normalizeText(candidate),
    );
    if (match) {
      return match.name;
    }
  }

  return candidates[0] || "Categoria";
};

const resolveCategoryId = (
  rawId: unknown,
  rawName: unknown,
  categories: ClubCategorySummary[],
) => {
  const candidates = compact([
    String(rawId || "").trim(),
    String(rawName || "").trim(),
  ]);

  for (const candidate of candidates) {
    const match = categories.find(
      (category) =>
        normalizeText(category.id) === normalizeText(candidate) ||
        normalizeText(category.name) === normalizeText(candidate),
    );
    if (match) {
      return match.id;
    }
  }

  return candidates[0] || undefined;
};

const mapAthlete = (rawAthlete: any, categories: ClubCategorySummary[]): Athlete => {
  const athlete = toRecord(rawAthlete);
  const data = toRecord(athlete.data);
  const firstName = String(athlete.first_name || data.firstName || "").trim();
  const lastName = String(athlete.last_name || data.lastName || "").trim();
  const categoryId = resolveCategoryId(
    athlete.category_id || data.categoryId || data.category_id,
    athlete.category_name || data.categoryName || data.category,
    categories,
  );
  const category = resolveCategoryName(
    categoryId,
    athlete.category_name || data.categoryName || data.category,
    categories,
  );

  return {
    id: String(athlete.id || "").trim(),
    clubId: String(athlete.organization_id || athlete.club_id || "").trim() || undefined,
    name:
      String(athlete.name || data.name || "").trim() ||
      [firstName, lastName].filter(Boolean).join(" ").trim() ||
      "Atleta",
    firstName: firstName || undefined,
    lastName: lastName || undefined,
    number: Number(athlete.jersey_number || data.jerseyNumber || 0) || 0,
    position: String(data.position || "").trim() || "Giocatore",
    status: mapAthleteStatus(athlete.status || data.status),
    category,
    categoryId,
    avatar: String(athlete.avatar_url || data.avatar || data.avatarUrl || "").trim() || undefined,
    phone: String(data.phone || "").trim() || undefined,
    email: String(data.email || "").trim() || undefined,
    birthDate: isoDate(athlete.birth_date || data.birthDate),
    city: String(data.city || "").trim() || undefined,
    notes: String(data.notes || "").trim() || undefined,
    medicalCertExpiry: isoDate(data.medicalCertExpiry),
    guardians: toArray(data.guardians),
    registrations: toArray(data.registrations),
    payments: toArray(data.payments),
    documents: toArray(data.documents),
    enrollmentDocuments: toArray(data.enrollmentDocuments),
    identityDocuments: toArray(data.identityDocuments),
    technicalNotes: String(data.technicalNotes || "").trim() || undefined,
    shirtSize: String(data.shirtSize || "").trim() || undefined,
    pantsSize: String(data.pantsSize || "").trim() || undefined,
    shoeSize: String(data.shoeSize || "").trim() || undefined,
    clothingProfile: String(data.clothingProfile || "").trim() || undefined,
  };
};

const mapTraining = (
  rawTraining: any,
  categories: ClubCategorySummary[],
): Training => {
  const training = toRecord(rawTraining);
  const data = toRecord(training.data);
  const categoryId = resolveCategoryId(
    training.categoryId || training.category_id || data.categoryId || data.category_id,
    training.category || training.categoryName || data.category || data.categoryName,
    categories,
  );
  const category = resolveCategoryName(
    categoryId,
    training.category || training.categoryName || data.category || data.categoryName,
    categories,
  );
  const attendance = toArray<TrainingAttendanceEntry>(
    training.attendance || data.attendance,
  );

  return {
    id: String(training.id || "").trim(),
    clubId: String(training.organization_id || training.club_id || "").trim() || undefined,
    title: String(training.title || data.title || `${category} Training`).trim(),
    date: isoDate(training.date || data.date) || "",
    time: String(training.time || data.time || "").trim(),
    endTime: String(training.endTime || data.endTime || "").trim() || undefined,
    location: String(training.location || data.location || "").trim() || "Luogo da definire",
    category,
    categoryId,
    coachName: String(training.trainer || data.trainer || "").trim() || undefined,
    status: String(training.status || data.status || "scheduled").trim() as Training["status"],
    presentCount:
      Number(training.attendees ?? training.presentCount ?? data.attendees ?? data.presentCount) ||
      attendance.filter((entry) => Boolean(entry?.present)).length,
    totalCount:
      Number(
        training.expectedAttendees ??
          training.totalCount ??
          data.expectedAttendees ??
          data.totalCount,
      ) || undefined,
    notes: String(training.notes || data.notes || "").trim() || undefined,
    attendance,
    trainerIds: toArray<string>(training.trainerIds || data.trainerIds),
  };
};

const mapMatch = (rawMatch: any, categories: ClubCategorySummary[]): Match => {
  const match = toRecord(rawMatch);
  const data = toRecord(match.data);
  const isHome = Boolean(match.isHome ?? data.isHome ?? true);
  const categoryId = resolveCategoryId(
    match.categoryId || match.category_id || data.categoryId || data.category_id,
    match.category || data.category,
    categories,
  );
  const category = resolveCategoryName(categoryId, match.category || data.category, categories);
  const opponent = String(match.opponent || data.opponent || "").trim() || undefined;
  const structureId =
    String(match.structureId || data.structureId || "").trim() || undefined;
  const fieldId =
    String(
      match.fieldId ||
        match.locationId ||
        data.fieldId ||
        data.locationId ||
        "",
    ).trim() || undefined;
  const structureName =
    String(match.structureName || data.structureName || "").trim() || undefined;
  const fieldName =
    String(match.fieldName || data.fieldName || "").trim() || undefined;
  const displayLocation = formatMobileMatchLocationLabel({
    structureName,
    fieldName,
    location: String(match.location || data.location || "").trim(),
  });

  return {
    id: String(match.id || "").trim(),
    clubId: String(match.organization_id || match.club_id || "").trim() || undefined,
    date: isoDate(match.date || data.date) || "",
    time: String(match.time || data.time || "").trim(),
    homeTeam:
      String(
        match.homeTeam || data.homeTeam || (!isHome && opponent ? opponent : "Casa"),
      ).trim() || "Casa",
    awayTeam:
      String(
        match.awayTeam || data.awayTeam || (isHome && opponent ? opponent : "Ospiti"),
      ).trim() || "Ospiti",
    opponent,
    location: displayLocation,
    structureId,
    fieldId,
    locationId: fieldId,
    kit: String(match.kit || data.kit || "").trim() || undefined,
    isHome,
    category,
    categoryId,
    convokedCount:
      toArray(match.convocatedAthletes || data.convocatedAthletes).length || undefined,
    totalConvocable: Number(match.totalConvocable || data.totalConvocable || 0) || undefined,
    result:
      typeof match.result === "object" && match.result ? match.result : undefined,
    convocatedAthletes: toArray<string>(
      match.convocatedAthletes || data.convocatedAthletes,
    ),
    convocationsStatus: String(
      match.convocationsStatus || data.convocationsStatus || "none",
    ).trim() as Match["convocationsStatus"],
    trainers: toArray<string>(match.trainers || data.trainers),
  };
};

const resolveMobilePermissions = (settings: unknown): TrainerDashboardPermissions => {
  const source = resolveTrainerDashboardPermissions(settings);
  const rawSettings = toRecord(settings);
  const rawPermissions = toRecord(
    rawSettings.trainerDashboardPermissions || rawSettings.trainer_dashboard_permissions,
  );
  const widgets = toRecord(rawPermissions.widgets);

  return {
    ...source,
    widgets: {
      ...source.widgets,
      todayTrainings:
        typeof widgets.todayTrainings === "boolean"
          ? widgets.todayTrainings
          : source.widgets.todayTrainings,
      todayMatches:
        typeof widgets.todayMatches === "boolean"
          ? widgets.todayMatches
          : source.widgets.todayMatches,
    },
  };
};

class MobileBackendStorageService {
  private async readContext(): Promise<CurrentContext | null> {
    const raw = await AsyncStorage.getItem(KEYS.currentContext);
    if (!raw) {
      return null;
    }

    try {
      return JSON.parse(raw) as CurrentContext;
    } catch {
      return null;
    }
  }

  private async fetchMemberships() {
    return api.getMemberships();
  }

  private async resolveStoredContext(
    memberships?: MembershipRecord[],
  ): Promise<CurrentContext | null> {
    const rawContext = await this.readContext();
    if (!rawContext?.clubId) {
      return null;
    }

    const availableMemberships = memberships || (await this.fetchMemberships());
    const membership =
      availableMemberships.find(
        (entry) => entry.organization_id === rawContext.clubId,
      ) || null;

    if (!membership) {
      await AsyncStorage.removeItem(KEYS.currentContext);
      return null;
    }

    const nextRole = String(membership.role || rawContext.role || "").trim();
    const nextContext: CurrentContext = {
      clubId: rawContext.clubId,
      role: nextRole,
      accessId: roleHasFullClubAccess(nextRole)
        ? null
        : rawContext.accessId || membership.id || null,
      source: roleHasFullClubAccess(nextRole) ? "owned" : "assigned",
    };

    const hasChanged =
      nextContext.role !== rawContext.role ||
      nextContext.source !== rawContext.source ||
      (nextContext.accessId || null) !== (rawContext.accessId || null);

    if (hasChanged) {
      await AsyncStorage.setItem(KEYS.currentContext, JSON.stringify(nextContext));
    }

    return nextContext;
  }

  private async fetchClubCategories(clubId: string) {
    const categories = await api.listResource<any>("categories", { clubId });
    return categories.map(mapCategory).filter(Boolean) as ClubCategorySummary[];
  }

  private normalizeTrainerProfile(rawTrainer: any, categories: ClubCategorySummary[]): TrainerProfile {
    const trainer = toRecord(rawTrainer);
    const data = toRecord(trainer.data);

    return {
      id: String(trainer.id || data.id || "").trim(),
      name: getTrainerDisplayName({ ...trainer, ...data }),
      email: String(trainer.email || data.email || "").trim() || undefined,
      linkedUserId:
        String(
          trainer.linkedUserId ||
            trainer.linked_user_id ||
            data.linkedUserId ||
            data.linked_user_id ||
            "",
        ).trim() || null,
      linkedUserEmail:
        String(
          trainer.linkedUserEmail ||
            trainer.linked_user_email ||
            data.linkedUserEmail ||
            data.linked_user_email ||
            trainer.email ||
            data.email ||
            "",
        ).trim() || null,
      linkedAt:
        String(trainer.linkedAt || trainer.linked_at || data.linkedAt || "").trim() ||
        null,
      categories: normalizeTrainerCategories(
        trainer.categories ||
          data.categories ||
          trainer.category ||
          data.category ||
          trainer.categoryId ||
          data.categoryId ||
          trainer.category_id ||
          data.category_id ||
          trainer.categoryName ||
          data.categoryName ||
          trainer.category_name ||
          data.category_name,
        categories,
      ),
    };
  }

  private async fetchTrainerProfile(clubId: string, user: User, categories: ClubCategorySummary[]) {
    const [trainers, staffMembers] = await Promise.all([
      api.listResource<any>("trainers", { clubId }),
      api.listResource<any>("staff_members", { clubId }).catch(() => []),
    ]);

    const trainerPool = [
      ...toArray(trainers),
      ...toArray(staffMembers).filter((item) =>
        ["trainer", "allenatore"].includes(
          normalizeText(item?.role || item?.data?.role),
        ),
      ),
    ].map((entry) => this.normalizeTrainerProfile(entry, categories));

    return (
      trainerPool.find(
        (trainer) =>
          normalizeTrainerLookupValue(trainer.linkedUserId) ===
            normalizeTrainerLookupValue(user.id) ||
          normalizeTrainerLookupValue(trainer.linkedUserEmail) ===
            normalizeTrainerLookupValue(user.email) ||
          normalizeTrainerLookupValue(trainer.email) ===
            normalizeTrainerLookupValue(user.email),
      ) || null
    );
  }

  private async getActiveSnapshot() {
    const [context, user, memberships] = await Promise.all([
      this.resolveStoredContext(),
      this.getUser(),
      this.fetchMemberships(),
    ]);

    if (!context || !user) {
      return null;
    }

    const membership =
      memberships.find((item) => item.organization_id === context.clubId) || null;
    const categories = await this.fetchClubCategories(context.clubId);
    const clubDetails = await api
      .getResourceById<any>("clubs", context.clubId)
      .catch(() => null);
    const permissions = resolveMobilePermissions(clubDetails?.settings);
    const effectiveRole = String(membership?.role || context.role || "").trim();
    const normalizedContext: CurrentContext = {
      ...context,
      role: effectiveRole,
      accessId: roleHasFullClubAccess(effectiveRole)
        ? null
        : context.accessId || membership?.id || null,
      source: roleHasFullClubAccess(effectiveRole) ? "owned" : "assigned",
    };
    const trainerProfile = roleHasFullClubAccess(effectiveRole)
      ? null
      : await this.fetchTrainerProfile(context.clubId, user, categories);
    const assignedCategoryIds = roleHasFullClubAccess(effectiveRole)
      ? categories.map((category) => category.id)
      : unique([
          ...getTrainerCategoryIds(trainerProfile?.categories, categories),
        ]);
    const assignedCategories =
      assignedCategoryIds.length > 0
        ? categories.filter((category) =>
            assignedCategoryIds.some(
              (value) => normalizeText(value) === normalizeText(category.id),
            ),
          )
        : [];
    const baseClub = membership ? mapMembershipToClub(membership) : null;
    const currentClub = baseClub
      ? {
          ...baseClub,
          contactEmail:
            String(clubDetails?.contact_email || baseClub.contactEmail || "").trim() ||
            undefined,
          contactPhone:
            String(clubDetails?.contact_phone || baseClub.contactPhone || "").trim() ||
            undefined,
          avatar:
            String(clubDetails?.logo_url || baseClub.avatar || "").trim() || undefined,
          categoryItems:
            roleHasFullClubAccess(effectiveRole) || assignedCategories.length === 0
              ? categories
              : assignedCategories,
          categories:
            (
              roleHasFullClubAccess(effectiveRole) ? categories : assignedCategories
            ).map((category) => category.name),
        }
      : null;

    return {
      context: normalizedContext,
      user,
      memberships,
      membership,
      currentClub,
      permissions,
      categories,
      trainerProfile,
      assignedCategoryIds,
      assignedCategories,
    };
  }

  async login(email: string, password: string): Promise<User | null> {
    const session = await api.login(email, password);
    return session.user || null;
  }

  async registerAccount(input: {
    email: string;
    password: string;
    firstName?: string;
    lastName?: string;
    phone?: string;
  }) {
    const session = await api.registerAccount(input);
    return session.user || null;
  }

  async logout() {
    await api.logout();
    await AsyncStorage.removeItem(KEYS.currentContext);
  }

  async isLoggedIn(): Promise<boolean> {
    return api.isLoggedIn();
  }

  async getUser(): Promise<User | null> {
    const storedUser = await api.getStoredUser();
    try {
      return await api.fetchCurrentUser();
    } catch {
      return storedUser;
    }
  }

  async updateUserProfile(
    updates: Partial<Pick<User, "name" | "email" | "phone" | "city" | "avatar">>,
  ) {
    const user = await this.getUser();
    if (!user) {
      return null;
    }

    const names = String(updates.name || user.name || "").trim().split(/\s+/);
    return api.updateCurrentUser({
      email: updates.email || user.email,
      data: {
        ...(user.userMetadata || {}),
        firstName: names[0] || user.firstName || "",
        lastName: names.slice(1).join(" ") || user.lastName || "",
        phone: updates.phone ?? user.phone ?? "",
        city: updates.city ?? user.city ?? "",
        avatarUrl: updates.avatar ?? user.avatar ?? "",
        name: String(updates.name || user.name || "").trim(),
      },
    });
  }

  async setContext(clubId: string, role: string, accessId?: string | null, source?: "owned" | "assigned" | null) {
    await api.activateMembership(clubId).catch(() => null);
    await AsyncStorage.setItem(
      KEYS.currentContext,
      JSON.stringify({
        clubId,
        role,
        accessId: accessId || null,
        source: source || (roleHasFullClubAccess(role) ? "owned" : "assigned"),
      } satisfies CurrentContext),
    );
  }

  async getContext() {
    return this.resolveStoredContext();
  }

  async clearContext() {
    await AsyncStorage.removeItem(KEYS.currentContext);
  }

  async hasContext() {
    const context = await this.getContext();
    return Boolean(context?.clubId && context?.role);
  }

  async getOwnedClubs(): Promise<Club[]> {
    const user = await this.getUser();
    if (!user) {
      return [];
    }

    const memberships = await this.fetchMemberships();
    const ownedMemberships = memberships.filter((membership) =>
      isOwnedMembership(membership, user.id),
    );

    return Promise.all(
      ownedMemberships.map(async (membership) => {
        const club = mapMembershipToClub(membership);
        const categories = await this.fetchClubCategories(membership.organization_id).catch(
          () => [],
        );

        return {
          ...club,
          categoryItems: categories,
          categories: categories.map((category) => category.name),
        } satisfies Club;
      }),
    );
  }

  async createOwnedClub(input: CreateClubInput) {
    const user = await this.getUser();
    if (!user) {
      throw new Error("Utente non autenticato");
    }

    const existingOwnedClubs = await this.getOwnedClubs();
    const created = await api.createResource<any>(
      "clubs",
      buildClubPayload(input, user, existingOwnedClubs.length === 0),
    );

    return created;
  }

  async getAccesses(): Promise<Access[]> {
    const user = await this.getUser();
    if (!user) {
      return [];
    }

    const memberships = await this.fetchMemberships();
    const accesses = await Promise.all(
      memberships.map(async (membership) => {
        const club = mapMembershipToClub(membership);
        const isOwned = isOwnedMembership(membership, user.id);
        if (isOwned) {
          return null;
        }

        const categories = await this.fetchClubCategories(membership.organization_id);
        const trainerProfile = await this.fetchTrainerProfile(
          membership.organization_id,
          user,
          categories,
        ).catch(() => null);
        const clubDetails = await api
          .getResourceById<any>("clubs", membership.organization_id)
          .catch(() => null);
        const permissions = resolveMobilePermissions(clubDetails?.settings);
        const assignedCategoryIds = unique(
          getTrainerCategoryIds(trainerProfile?.categories, categories),
        );
        const assignedCategories = categories
          .filter((category) =>
            assignedCategoryIds.some(
              (value) => normalizeText(value) === normalizeText(category.id),
            ),
          )
          .map((category) => category.name);

        return {
          id: membership.id || `${membership.organization_id}-${membership.role}`,
          clubId: membership.organization_id,
          clubName: club.name,
          clubAvatar: club.avatar,
          role: membership.role,
          status: "active" as const,
          source: "assigned" as const,
          trainerId: trainerProfile?.id,
          linkedTrainerName: trainerProfile?.name,
          linkedAt: trainerProfile?.linkedAt || undefined,
          assignedCategories,
          assignedCategoryIds,
          permissions,
          summary:
            assignedCategories.length > 0
              ? `Accesso ${mapRoleLabel(membership.role)} su ${assignedCategories.length} categorie`
              : `Accesso ${mapRoleLabel(membership.role)} collegato al club`,
        } satisfies Access;
      }),
    );

    return accesses.filter(Boolean) as Access[];
  }

  async getCurrentAccess(): Promise<Access | null> {
    const context = await this.getContext();
    if (!context || roleHasFullClubAccess(context.role)) {
      return null;
    }

    const accesses = await this.getAccesses();
    return (
      accesses.find((access) => access.id === context.accessId) ||
      accesses.find(
        (access) =>
          access.clubId === context.clubId &&
          normalizeText(access.role) === normalizeText(context.role),
      ) ||
      null
    );
  }

  async getCurrentClub() {
    const snapshot = await this.getActiveSnapshot();
    return snapshot?.currentClub || null;
  }

  async getTrainerPermissions() {
    const snapshot = await this.getActiveSnapshot();
    if (!snapshot) {
      return DEFAULT_TRAINER_DASHBOARD_PERMISSIONS;
    }
    return snapshot.permissions;
  }

  async getAssignedCategories() {
    const snapshot = await this.getActiveSnapshot();
    return snapshot?.assignedCategories || [];
  }

  async addAccess(token: string) {
    const response = await api.redeemAccessToken(token);
    if (!response?.membership) {
      return null;
    }

    const accesses = await this.getAccesses();
    return accesses.find(
      (access) => access.clubId === response.membership.organization_id,
    ) || null;
  }

  async getAthletes(query?: string) {
    const snapshot = await this.getActiveSnapshot();
    if (!snapshot?.context?.clubId) {
      return [];
    }

    const athletes = await api.listResource<any>("athletes", {
      clubId: snapshot.context.clubId,
    });
    let mapped = athletes.map((athlete) => mapAthlete(athlete, snapshot.categories));

    if (!roleHasFullClubAccess(snapshot.context.role)) {
      mapped = mapped.filter((athlete) =>
        athlete.categoryId
          ? snapshot.assignedCategoryIds.some(
              (value) => normalizeText(value) === normalizeText(athlete.categoryId),
            )
          : false,
      );
    }

    if (query?.trim()) {
      const search = normalizeText(query);
      mapped = mapped.filter((athlete) =>
        normalizeText(
          [
            athlete.name,
            athlete.category,
            athlete.position,
            athlete.city,
          ].join(" "),
        ).includes(search),
      );
    }

    return mapped;
  }

  async getAthlete(id: string) {
    const athletes = await this.getAthletes();
    return athletes.find((athlete) => athlete.id === id) || null;
  }

  async getTrainings() {
    const snapshot = await this.getActiveSnapshot();
    if (!snapshot?.context?.clubId) {
      return [];
    }

    const trainings = await api.listResource<any>("trainings", {
      clubId: snapshot.context.clubId,
    });
    let mapped = trainings.map((training) => mapTraining(training, snapshot.categories));

    if (!roleHasFullClubAccess(snapshot.context.role)) {
      mapped = mapped.filter((training) => {
        const byCategory =
          training.categoryId &&
          snapshot.assignedCategoryIds.some(
            (value) => normalizeText(value) === normalizeText(training.categoryId),
          );
        const trainerIds = training.trainerIds || [];
        const coachName = training.coachName || "";

        return (
          byCategory ||
          trainerIds.some(
            (value) => normalizeText(value) === normalizeText(snapshot.trainerProfile?.id),
          ) ||
          normalizeText(coachName).includes(
            normalizeText(snapshot.trainerProfile?.name || ""),
          )
        );
      });
    }

    return mapped.sort((left, right) =>
      `${left.date}T${left.time}`.localeCompare(`${right.date}T${right.time}`),
    );
  }

  async saveTrainingAttendance(trainingId: string, attendance: TrainingAttendanceEntry[]) {
    const snapshot = await this.getActiveSnapshot();
    if (!snapshot?.context?.clubId) {
      throw new Error("Club attivo non disponibile");
    }

    const trainings = await this.getTrainings();
    const selectedTraining =
      trainings.find((training) => training.id === trainingId) || null;
    if (!canManageMobileTrainingAttendance(selectedTraining)) {
      throw new Error(
        "Le presenze possono essere registrate solo per allenamenti di oggi o passati",
      );
    }

    return api.updateResource(
      "trainings",
      trainingId,
      {
        attendance,
        attendees: attendance.filter((entry) => entry.present).length,
        updated_at: new Date().toISOString(),
      },
      snapshot.context.clubId,
    );
  }

  async updateTrainingStatus(trainingId: string, status: Training["status"]) {
    const snapshot = await this.getActiveSnapshot();
    if (!snapshot?.context?.clubId) {
      throw new Error("Club attivo non disponibile");
    }

    return api.updateResource(
      "trainings",
      trainingId,
      {
        status,
        updated_at: new Date().toISOString(),
      },
      snapshot.context.clubId,
    );
  }

  async getMatches() {
    const snapshot = await this.getActiveSnapshot();
    if (!snapshot?.context?.clubId) {
      return [];
    }

    const matches = await api.listResource<any>("matches", {
      clubId: snapshot.context.clubId,
    });
    let mapped = matches.map((match) => mapMatch(match, snapshot.categories));

    if (!roleHasFullClubAccess(snapshot.context.role)) {
      mapped = mapped.filter((match) => {
        const byCategory =
          match.categoryId &&
          snapshot.assignedCategoryIds.some(
            (value) => normalizeText(value) === normalizeText(match.categoryId),
          );

        return (
          byCategory ||
          (match.trainers || []).some((trainerName) =>
            normalizeText(trainerName).includes(
              normalizeText(snapshot.trainerProfile?.name || ""),
            ),
          )
        );
      });
    }

    return mapped.sort((left, right) =>
      `${left.date}T${left.time}`.localeCompare(`${right.date}T${right.time}`),
    );
  }

  async saveMatchConvocations(matchId: string, athleteIds: string[]) {
    const snapshot = await this.getActiveSnapshot();
    if (!snapshot?.context?.clubId) {
      throw new Error("Club attivo non disponibile");
    }

    return api.updateResource(
      "matches",
      matchId,
      {
        convocatedAthletes: athleteIds,
        convocationsStatus: athleteIds.length > 0 ? "completed" : "none",
        updated_at: new Date().toISOString(),
      },
      snapshot.context.clubId,
    );
  }

  async getTasks() {
    const snapshot = await this.getActiveSnapshot();
    if (!snapshot?.context?.clubId) {
      return [];
    }

    const reminders = await api
      .listResource<any>("secretariat_notes", { clubId: snapshot.context.clubId })
      .catch(() => []);

    return reminders
      .filter((reminder) => {
        const expiryCandidate =
          reminder?.expiryDate ||
          reminder?.expiry_date ||
          reminder?.data?.expiryDate ||
          reminder?.data?.expiry_date ||
          null;
        if (!expiryCandidate) {
          return true;
        }

        const parsedExpiry = new Date(String(expiryCandidate));
        if (Number.isNaN(parsedExpiry.getTime())) {
          return true;
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        parsedExpiry.setHours(0, 0, 0, 0);
        return parsedExpiry.getTime() >= today.getTime();
      })
      .filter((reminder) =>
        isReminderVisibleToMobileContext(reminder, {
          role: snapshot.context.role,
          user: snapshot.user,
          trainerProfile: snapshot.trainerProfile,
        }),
      )
      .map((reminder) => {
        const data = toRecord(reminder.data);
        return {
          id: String(reminder.id || "").trim(),
          clubId: snapshot.context.clubId,
          title: String(
            reminder.content ||
              data.content ||
              reminder.title ||
              data.title ||
              "Promemoria",
          ).trim(),
          description: getMobileReminderTargetSummary(reminder),
          dueDate: isoDate(
            reminder.expiryDate ||
              reminder.expiry_date ||
              reminder.created_at ||
              data.dueDate,
          ),
          completed: Boolean(reminder.read_at || data.completed),
          type: "reminder",
          roles: [snapshot.context.role],
        } satisfies Task;
      });
  }

  async setServerUrl(url: string) {
    await api.setBaseUrl(url);
  }

  async getServerUrl() {
    return api.getBaseUrl();
  }
}

export const mobileBackendStorage = new MobileBackendStorageService();
