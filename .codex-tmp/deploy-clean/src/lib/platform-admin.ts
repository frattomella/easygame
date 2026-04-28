const splitCsv = (value?: string | null) =>
  String(value || "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);

export const PLATFORM_ADMIN_PRIVATE_PATH = "/private/easygame-platform-admin-0c7a";

export const getPlatformAdminEmails = () =>
  Array.from(
    new Set(
      splitCsv(process.env.NEXT_PUBLIC_EASYGAME_PLATFORM_ADMIN_EMAILS).concat(
        splitCsv(process.env.EASYGAME_PLATFORM_ADMIN_EMAILS),
      ),
    ),
  );

export const isPlatformAdminEmail = (email?: string | null) => {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  if (!normalizedEmail) {
    return false;
  }

  const allowedEmails = getPlatformAdminEmails();
  if (allowedEmails.length > 0) {
    return allowedEmails.includes(normalizedEmail);
  }

  return false;
};

export const isPlatformAdminUser = (user: any) => {
  const role = String(
    user?.user_metadata?.role || user?.app_metadata?.role || user?.role || "",
  ).toLowerCase();
  const email = String(user?.email || "").trim().toLowerCase();
  const allowedEmails = getPlatformAdminEmails();

  if (isPlatformAdminEmail(email)) {
    return true;
  }

  if (allowedEmails.length === 0) {
    return role === "platform_admin" || role === "admin";
  }

  return role === "platform_admin";
};
