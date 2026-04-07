const normalizeReminderValue = (value: unknown) =>
  String(value || "")
    .trim()
    .toLowerCase();

export type ReminderTargetType =
  | "club_dashboard"
  | "all_trainers"
  | "trainer"
  | "staff_member"
  | "member";

export type ReminderTargetSource = {
  targetType?: ReminderTargetType | string | null;
  targetId?: string | null;
  targetLabel?: string | null;
  linkedTrainerId?: string | null;
  linkedUserId?: string | null;
  linkedUserEmail?: string | null;
  email?: string | null;
  id?: string | null;
  name?: string | null;
};

export const getReminderTargetType = (
  reminder: Record<string, any> | null | undefined,
): ReminderTargetType => {
  const rawValue = String(
    reminder?.targetType ||
      reminder?.target_type ||
      reminder?.audience ||
      "club_dashboard",
  ).trim();

  switch (rawValue) {
    case "all_trainers":
    case "trainer":
    case "staff_member":
    case "member":
      return rawValue;
    default:
      return "club_dashboard";
  }
};

export const getReminderTargetId = (
  reminder: Record<string, any> | null | undefined,
) =>
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

export const getReminderTargetLabel = (
  reminder: Record<string, any> | null | undefined,
) =>
  String(
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

export const getReminderTargetSummary = (
  reminder: Record<string, any> | null | undefined,
) => {
  const targetType = getReminderTargetType(reminder);
  const targetLabel = getReminderTargetLabel(reminder);

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

export const isReminderVisibleToTrainer = (
  reminder: Record<string, any> | null | undefined,
  trainerProfile?: ReminderTargetSource | null,
) => {
  const targetType = getReminderTargetType(reminder);
  if (targetType === "all_trainers") {
    return true;
  }

  if (targetType !== "trainer" || !trainerProfile) {
    return false;
  }

  const targetId = getReminderTargetId(reminder);
  if (!targetId) {
    return false;
  }

  const candidates = [
    trainerProfile.id,
    trainerProfile.linkedTrainerId,
    trainerProfile.linkedUserId,
    trainerProfile.linkedUserEmail,
    trainerProfile.email,
    trainerProfile.name,
  ]
    .map((value) => String(value || "").trim())
    .filter(Boolean);

  return candidates.some(
    (candidate) => normalizeReminderValue(candidate) === normalizeReminderValue(targetId),
  );
};
