"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/AuthProvider";
import { useToast } from "@/components/ui/toast-notification";
import { apiRequest } from "@/lib/api/client";
import {
  getClubAthletes,
  getClubData,
  getClubSettings,
} from "@/lib/simplified-db";
import {
  getTrainerCategoryIds,
  getTrainerDisplayName,
  normalizeTrainerCategories,
} from "@/lib/trainer-utils";
import {
  TrainerDashboardPermissions,
  resolveTrainerDashboardPermissions,
} from "@/lib/trainer-dashboard-permissions";
import {
  extractCategoryTokens,
  getRecordDisplayCategory,
  toTrainerDateTime,
} from "@/lib/trainer-dashboard-helpers";
import {
  getReminderTargetSummary,
  isReminderVisibleToTrainer,
} from "@/lib/reminder-targeting";

type TrainerDashboardContextValue = {
  loading: boolean;
  activeClub: any | null;
  user: any | null;
  trainerProfile: any | null;
  categories: any[];
  assignedCategories: any[];
  assignedAthletes: any[];
  visibleTrainings: any[];
  visibleMatches: any[];
  visibleReminders: any[];
  permissions: TrainerDashboardPermissions;
  reload: () => Promise<void>;
  signOut: () => Promise<void>;
};

const TrainerDashboardContext =
  createContext<TrainerDashboardContextValue | null>(null);

const normalizeValue = (value: unknown) =>
  String(value || "")
    .trim()
    .toLowerCase();

const findCategoryIdsFromRecord = (record: any, categories: any[]) => {
  const source =
    record?.data && typeof record.data === "object" ? record.data : {};
  const explicitCategoryIds = Array.isArray(record?.categories)
    ? record.categories
        .map((value: any) => {
          if (value && typeof value === "object") {
            return String(value.id || value.name || "").trim();
          }
          return String(value || "").trim();
        })
        .filter(Boolean)
    : [];
  const explicitSourceCategoryIds = Array.isArray(source?.categories)
    ? source.categories
        .map((value: any) => {
          if (value && typeof value === "object") {
            return String(value.id || value.name || "").trim();
          }
          return String(value || "").trim();
        })
        .filter(Boolean)
    : [];

  const fallbackValues = [
    String(record?.categoryId || "").trim(),
    String(source?.categoryId || "").trim(),
    String(record?.category_id || "").trim(),
    String(source?.category_id || "").trim(),
    ...String(record?.category || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
    ...String(source?.category || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
    ...String(record?.categoryName || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
    ...String(source?.categoryName || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
    ...String(record?.category_name || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
    ...String(source?.category_name || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  ];

  const rawValues = [
    ...explicitCategoryIds,
    ...explicitSourceCategoryIds,
    ...fallbackValues,
  ].filter(Boolean);
  const ids = rawValues
    .map((value) => {
      const match = categories.find(
        (category) =>
          normalizeValue(category?.id) === normalizeValue(value) ||
          normalizeValue(category?.name) === normalizeValue(value),
      );
      return String(match?.id || value).trim();
    })
    .filter(Boolean);

  return Array.from(new Set(ids));
};

const mergeCategories = (clubCategories: any[], trainerCategories: any[]) => {
  const merged = [...clubCategories];
  const seen = new Set(
    clubCategories.map((category: any) => normalizeValue(category?.id || category?.name)),
  );

  for (const category of trainerCategories) {
    const key = normalizeValue(category?.id || category?.name);
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    merged.push({
      ...category,
      id: String(category?.id || category?.name || "").trim(),
      name: String(category?.name || category?.id || "").trim(),
    });
  }

  return merged.filter((category: any) => category.id || category.name);
};

const buildAssignedAthletes = (athletes: any[], categories: any[], categoryIds: Set<string>) =>
  athletes.filter((athlete: any) => {
    const athleteTokens = extractCategoryTokens(athlete, categories);

    return Array.from(categoryIds).some((categoryId) => {
      const category = categories.find(
        (entry) => normalizeValue(entry?.id) === normalizeValue(categoryId),
      );
      const categoryName = category?.name || categoryId;

      return (
        athleteTokens.has(normalizeValue(categoryId)) ||
        athleteTokens.has(normalizeValue(categoryName))
      );
    });
  });

const buildVisibleTrainings = (
  trainings: any[],
  categories: any[],
  categoryIds: Set<string>,
  trainerProfile: any,
) =>
  trainings
    .filter((training: any) => {
      const trainerIds = Array.isArray(training?.trainerIds)
        ? training.trainerIds.map((value: any) => normalizeValue(value))
        : [];
      const trainerNames = String(training?.trainer || "")
        .split(",")
        .map((value) => normalizeValue(value))
        .filter(Boolean);
      const trainingCategoryIds = findCategoryIdsFromRecord(training, categories);

      return (
        trainerIds.includes(normalizeValue(trainerProfile?.id)) ||
        trainerNames.includes(normalizeValue(trainerProfile?.name)) ||
        trainingCategoryIds.some((categoryId) =>
          categoryIds.has(normalizeValue(categoryId)),
        )
      );
    })
    .map((training: any) => ({
      ...training,
      startsAt: toTrainerDateTime(training?.date, training?.time),
      endsAt: toTrainerDateTime(training?.date, training?.endTime || null),
      trainerNames: String(training?.trainer || "")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
      categoryIds: findCategoryIdsFromRecord(training, categories),
      displayCategory: getRecordDisplayCategory(training, categories),
    }))
    .sort((left: any, right: any) => {
      const leftTime = left?.startsAt ? left.startsAt.getTime() : Number.MAX_SAFE_INTEGER;
      const rightTime = right?.startsAt ? right.startsAt.getTime() : Number.MAX_SAFE_INTEGER;
      return leftTime - rightTime;
    });

const buildVisibleMatches = (
  matches: any[],
  categories: any[],
  categoryIds: Set<string>,
  trainerProfile: any,
) =>
  matches
    .filter((match: any) => {
      const matchTrainerNames = Array.isArray(match?.trainers)
        ? match.trainers.map((value: any) => normalizeValue(value))
        : [];
      const matchCategoryIds = findCategoryIdsFromRecord(match, categories);

      return (
        matchTrainerNames.includes(normalizeValue(trainerProfile?.name)) ||
        matchCategoryIds.some((categoryId) =>
          categoryIds.has(normalizeValue(categoryId)),
        )
      );
    })
    .map((match: any) => ({
      ...match,
      startsAt: toTrainerDateTime(match?.date, match?.time),
      trainerNames: Array.isArray(match?.trainers) ? match.trainers : [],
      categoryIds: findCategoryIdsFromRecord(match, categories),
      displayCategory: getRecordDisplayCategory(match, categories),
    }))
    .sort((left: any, right: any) => {
      const leftTime = left?.startsAt ? left.startsAt.getTime() : Number.MAX_SAFE_INTEGER;
      const rightTime = right?.startsAt ? right.startsAt.getTime() : Number.MAX_SAFE_INTEGER;
      return leftTime - rightTime;
    });

const buildVisibleReminders = (
  reminders: any[],
  trainerProfile: any,
) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return reminders
    .filter((reminder: any) => {
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

      parsedExpiry.setHours(0, 0, 0, 0);
      return parsedExpiry >= today;
    })
    .filter((reminder: any) => isReminderVisibleToTrainer(reminder, trainerProfile))
    .map((reminder: any) => ({
      ...reminder,
      targetSummary: getReminderTargetSummary(reminder),
    }))
    .sort((left: any, right: any) => {
      const leftTime = new Date(
        String(
          left?.expiryDate ||
            left?.expiry_date ||
            left?.date ||
            left?.created_at ||
            Date.now(),
        ),
      ).getTime();
      const rightTime = new Date(
        String(
          right?.expiryDate ||
            right?.expiry_date ||
            right?.date ||
            right?.created_at ||
            Date.now(),
        ),
      ).getTime();

      return leftTime - rightTime;
    });
};

const resolveApiList = <T,>(response: { data: T[] | null; error: any }, fallback: unknown) => {
  if (!response?.error && Array.isArray(response?.data)) {
    return response.data;
  }

  return Array.isArray(fallback) ? fallback : [];
};

export function TrainerDashboardProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const { activeClub, loading: authLoading, signOut, user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [trainerProfile, setTrainerProfile] = useState<any | null>(null);
  const [categories, setCategories] = useState<any[]>([]);
  const [assignedAthletes, setAssignedAthletes] = useState<any[]>([]);
  const [visibleTrainings, setVisibleTrainings] = useState<any[]>([]);
  const [visibleMatches, setVisibleMatches] = useState<any[]>([]);
  const [visibleReminders, setVisibleReminders] = useState<any[]>([]);
  const [permissions, setPermissions] = useState<TrainerDashboardPermissions>(
    resolveTrainerDashboardPermissions({}),
  );

  useEffect(() => {
    if (authLoading) {
      return;
    }

    if (!user?.id) {
      router.replace("/login");
      return;
    }

    if (!activeClub?.id) {
      router.replace("/account");
    }
  }, [activeClub?.id, authLoading, router, user?.id]);

  const loadDashboardData = useCallback(async () => {
    if (!activeClub?.id || !user?.id) {
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      const [
        apiCategories,
        apiTrainers,
        apiStaff,
        apiAthletes,
        apiTrainings,
        apiMatches,
        apiSecretariatNotes,
        legacyCategories,
        legacyTrainers,
        legacyStaff,
        legacyAthletes,
        legacyTrainings,
        legacyMatches,
        legacySecretariatNotes,
        clubSettings,
      ] = await Promise.all([
        apiRequest<any[]>("/api/v1/categories", { method: "GET" }),
        apiRequest<any[]>("/api/v1/trainers", { method: "GET" }),
        apiRequest<any[]>("/api/v1/staff_members", { method: "GET" }),
        apiRequest<any[]>("/api/v1/athletes", { method: "GET" }),
        apiRequest<any[]>("/api/v1/trainings", { method: "GET" }),
        apiRequest<any[]>("/api/v1/matches", { method: "GET" }),
        apiRequest<any[]>("/api/v1/secretariat_notes", { method: "GET" }),
        getClubData(activeClub.id, "categories"),
        getClubData(activeClub.id, "trainers"),
        getClubData(activeClub.id, "staff_members"),
        getClubAthletes(activeClub.id),
        getClubData(activeClub.id, "trainings"),
        getClubData(activeClub.id, "matches"),
        getClubData(activeClub.id, "secretariat_notes"),
        getClubSettings(activeClub.id),
      ]);

      const rawCategories = resolveApiList(apiCategories, legacyCategories);
      const rawTrainers = resolveApiList(apiTrainers, legacyTrainers);
      const rawStaff = resolveApiList(apiStaff, legacyStaff);
      const rawAthletes = resolveApiList(apiAthletes, legacyAthletes);
      const rawTrainings = resolveApiList(apiTrainings, legacyTrainings);
      const rawMatches = resolveApiList(apiMatches, legacyMatches);
      const rawSecretariatNotes = resolveApiList(
        apiSecretariatNotes,
        legacySecretariatNotes,
      );

      const normalizedCategories = (Array.isArray(rawCategories) ? rawCategories : [])
        .map((category: any) => ({
          ...category,
          id: String(
            category?.id || category?.data?.id || category?.data?.name || "",
          ).trim(),
          name: String(
            category?.name ||
              category?.data?.name ||
              category?.data?.id ||
              category?.id ||
              "",
          ).trim(),
        }))
        .filter((category: any) => category.id && category.name);

      const trainerPool = [
        ...(Array.isArray(rawTrainers) ? rawTrainers : []),
        ...(Array.isArray(rawStaff) ? rawStaff : []).filter((staff: any) =>
          ["trainer", "allenatore"].includes(normalizeValue(staff?.role)),
        ),
      ];

      const normalizedTrainerPool = trainerPool.map((trainer: any) => ({
        ...trainer,
        id: String(trainer?.id || trainer?.data?.id || "").trim(),
        name: getTrainerDisplayName(trainer?.data ? { ...trainer, ...trainer.data } : trainer),
        email: String(trainer?.email || trainer?.data?.email || "").trim(),
        phone: String(trainer?.phone || trainer?.data?.phone || "").trim(),
        linkedUserId:
          String(
            trainer?.linkedUserId ||
              trainer?.linked_user_id ||
              trainer?.data?.linkedUserId ||
              trainer?.data?.linked_user_id ||
              "",
          ).trim() ||
          null,
        linkedUserEmail:
          String(
            trainer?.linkedUserEmail ||
              trainer?.linked_user_email ||
              trainer?.data?.linkedUserEmail ||
              trainer?.data?.linked_user_email ||
              trainer?.email ||
              trainer?.data?.email ||
              "",
          ).trim() ||
          null,
        linkedAt:
          String(
            trainer?.linkedAt ||
              trainer?.linked_at ||
              trainer?.data?.linkedAt ||
              trainer?.data?.linked_at ||
              "",
          ).trim() || null,
        categories: normalizeTrainerCategories(
          trainer?.categories ||
            trainer?.data?.categories ||
            trainer?.category ||
            trainer?.data?.category ||
            trainer?.categoryId ||
            trainer?.data?.categoryId ||
            trainer?.category_id ||
            trainer?.data?.category_id ||
            trainer?.categoryName ||
            trainer?.data?.categoryName ||
            trainer?.category_name ||
            trainer?.data?.category_name,
          normalizedCategories,
        ),
      }));

      const nextTrainerProfile =
        normalizedTrainerPool.find(
          (trainer: any) =>
            normalizeValue(trainer.linkedUserId) === normalizeValue(user.id) ||
            normalizeValue(trainer.linkedUserEmail) === normalizeValue(user.email) ||
            normalizeValue(trainer.email) === normalizeValue(user.email),
        ) || null;

      const mergedCategories = mergeCategories(
        normalizedCategories,
        nextTrainerProfile?.categories || [],
      );

      const categoryIdSet = new Set(
        getTrainerCategoryIds(nextTrainerProfile?.categories, mergedCategories).map(
          (value) => normalizeValue(value),
        ),
      );

      const nextAssignedAthletes = buildAssignedAthletes(
        Array.isArray(rawAthletes) ? rawAthletes : [],
        mergedCategories,
        categoryIdSet,
      );
      const nextVisibleTrainings = buildVisibleTrainings(
        Array.isArray(rawTrainings) ? rawTrainings : [],
        mergedCategories,
        categoryIdSet,
        nextTrainerProfile,
      );
      const nextVisibleMatches = buildVisibleMatches(
        Array.isArray(rawMatches) ? rawMatches : [],
        mergedCategories,
        categoryIdSet,
        nextTrainerProfile,
      );
      const nextVisibleReminders = buildVisibleReminders(
        Array.isArray(rawSecretariatNotes) ? rawSecretariatNotes : [],
        nextTrainerProfile,
      );

      setCategories(mergedCategories);
      setTrainerProfile(nextTrainerProfile);
      setAssignedAthletes(nextAssignedAthletes);
      setVisibleTrainings(nextVisibleTrainings);
      setVisibleMatches(nextVisibleMatches);
      setVisibleReminders(nextVisibleReminders);
      setPermissions(resolveTrainerDashboardPermissions(clubSettings));
    } catch (error) {
      console.error("Error loading trainer dashboard:", error);
      showToast("error", "Errore nel caricamento della dashboard allenatore");
    } finally {
      setLoading(false);
    }
  }, [activeClub?.id, showToast, user?.email, user?.id]);

  useEffect(() => {
    void loadDashboardData();
  }, [loadDashboardData]);

  const assignedCategories = useMemo(() => {
    const categoryIds = new Set(
      getTrainerCategoryIds(trainerProfile?.categories, categories).map((value) =>
        normalizeValue(value),
      ),
    );

    const categoryEntries = categories.filter((category) =>
      categoryIds.has(normalizeValue(category?.id)),
    );
    if (categoryEntries.length > 0) {
      return categoryEntries;
    }

    return normalizeTrainerCategories(trainerProfile?.categories, categories);
  }, [categories, trainerProfile?.categories]);

  const contextValue = useMemo(
    () => ({
      loading,
      activeClub,
      user,
      trainerProfile,
      categories,
      assignedCategories,
      assignedAthletes,
      visibleTrainings,
      visibleMatches,
      visibleReminders,
      permissions,
      reload: loadDashboardData,
      signOut,
    }),
    [
      activeClub,
      assignedAthletes,
      assignedCategories,
      categories,
      loadDashboardData,
      loading,
      permissions,
      signOut,
      trainerProfile,
      user,
      visibleMatches,
      visibleReminders,
      visibleTrainings,
    ],
  );

  return (
    <TrainerDashboardContext.Provider value={contextValue}>
      {children}
    </TrainerDashboardContext.Provider>
  );
}

export function useTrainerDashboard() {
  const context = useContext(TrainerDashboardContext);

  if (!context) {
    throw new Error(
      "useTrainerDashboard must be used within TrainerDashboardProvider",
    );
  }

  return context;
}
