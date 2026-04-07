const normalizeValue = (value: unknown) =>
  String(value || "")
    .trim()
    .toLowerCase();

type MatchLocationLike = {
  structureName?: string | null;
  fieldName?: string | null;
  location?: string | null;
  structure?: string | null;
  field?: string | null;
};

type TrainingLike = {
  date?: string | null;
  time?: string | null;
  status?: string | null;
};

type ReminderLike = Record<string, any> | null | undefined;

type ReminderVisibilityContext = {
  role?: string | null;
  user?: {
    id?: string | null;
    email?: string | null;
    name?: string | null;
  } | null;
  trainerProfile?: {
    id?: string | null;
    linkedUserId?: string | null;
    linkedUserEmail?: string | null;
    email?: string | null;
    name?: string | null;
  } | null;
};

export const formatMobileMatchLocationLabel = (
  match: MatchLocationLike | null | undefined,
) => {
  if (!match) {
    return "Luogo da definire";
  }

  const structureName = String(match.structureName || match.structure || "").trim();
  const fieldName = String(match.fieldName || match.field || "").trim();
  const fallbackLocation = String(match.location || "").trim();

  const structuredLocation = [structureName, fieldName].filter(Boolean).join(" - ");
  if (structuredLocation) {
    return structuredLocation;
  }

  if (fallbackLocation) {
    return fallbackLocation.replace(/\s*\/\s*/g, " - ");
  }

  return "Luogo da definire";
};

const parseTrainingStart = (training: TrainingLike) => {
  const rawDate = String(training?.date || "").trim();
  const rawTime = String(training?.time || "").trim();
  if (!rawDate || !rawTime) {
    return null;
  }

  const parsed = new Date(`${rawDate}T${rawTime}`);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
};

const parseTrainingDateOnly = (training: TrainingLike) => {
  const rawDate = String(training?.date || "").trim();
  if (!rawDate) {
    return null;
  }

  const parsed = new Date(rawDate);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  parsed.setHours(0, 0, 0, 0);
  return parsed;
};

export const canManageMobileTrainingAttendance = (
  training: TrainingLike | null | undefined,
  now = new Date(),
) => {
  if (!training) {
    return false;
  }

  const normalizedStatus = normalizeValue(training.status);
  if (normalizedStatus === "cancelled" || normalizedStatus === "annullato") {
    return false;
  }

  const trainingDate = parseTrainingDateOnly(training);
  if (!trainingDate) {
    return false;
  }

  const today = new Date(now);
  today.setHours(0, 0, 0, 0);

  return trainingDate.getTime() <= today.getTime();
};

const getReminderTargetType = (reminder: ReminderLike) =>
  String(
    reminder?.targetType ||
      reminder?.target_type ||
      reminder?.audience ||
      "club_dashboard",
  ).trim();

const getReminderTargetId = (reminder: ReminderLike) =>
  String(
    reminder?.targetId ||
      reminder?.target_id ||
      reminder?.trainerId ||
      reminder?.trainer_id ||
      reminder?.staffMemberId ||
      reminder?.staff_member_id ||
      reminder?.memberId ||
      reminder?.member_id ||
      "",
  ).trim();

export const getMobileReminderTargetSummary = (reminder: ReminderLike) => {
  const targetType = getReminderTargetType(reminder);
  const targetLabel = String(
    reminder?.targetLabel ||
      reminder?.target_label ||
      reminder?.trainerName ||
      reminder?.trainer_name ||
      reminder?.staffMemberName ||
      reminder?.staff_member_name ||
      reminder?.memberName ||
      reminder?.member_name ||
      "",
  ).trim();

  switch (targetType) {
    case "all_trainers":
      return "Destinatari: tutti gli allenatori";
    case "trainer":
      return `Destinatario: ${targetLabel || "allenatore specifico"}`;
    case "staff_member":
      return `Destinatario: ${targetLabel || "membro staff"}`;
    case "member":
      return `Destinatario: ${targetLabel || "socio"}`;
    default:
      return "Promemoria interno dashboard club";
  }
};

const roleHasFullClubAccess = (role?: string | null) =>
  role === "owner" || role === "admin";

export const isReminderVisibleToMobileContext = (
  reminder: ReminderLike,
  context: ReminderVisibilityContext,
) => {
  const targetType = getReminderTargetType(reminder);
  const role = String(context.role || "").trim();

  if (roleHasFullClubAccess(role)) {
    return true;
  }

  const targetId = getReminderTargetId(reminder);
  const userCandidates = [
    context.user?.id,
    context.user?.email,
    context.user?.name,
  ]
    .map((value) => String(value || "").trim())
    .filter(Boolean);
  const trainerCandidates = [
    context.trainerProfile?.id,
    context.trainerProfile?.linkedUserId,
    context.trainerProfile?.linkedUserEmail,
    context.trainerProfile?.email,
    context.trainerProfile?.name,
    ...userCandidates,
  ]
    .map((value) => String(value || "").trim())
    .filter(Boolean);

  switch (targetType) {
    case "all_trainers":
      return role === "trainer";
    case "trainer":
      return (
        role === "trainer" &&
        trainerCandidates.some(
          (candidate) => normalizeValue(candidate) === normalizeValue(targetId),
        )
      );
    case "staff_member":
      return (
        role === "staff_member" &&
        userCandidates.some(
          (candidate) => normalizeValue(candidate) === normalizeValue(targetId),
        )
      );
    case "member":
      return userCandidates.some(
        (candidate) => normalizeValue(candidate) === normalizeValue(targetId),
      );
    default:
      return false;
  }
};
