const PUBLIC_SELF_REGISTRATION_ROLES = new Set([
  "user",
  "parent",
  "athlete",
  "trainer",
]);

export const normalizePublicRegistrationRole = (
  requestedRole: unknown,
  shouldCreateClub: boolean,
) => {
  if (shouldCreateClub) return "club_creator";

  const normalizedRole = String(requestedRole || "user").toLowerCase();
  return PUBLIC_SELF_REGISTRATION_ROLES.has(normalizedRole)
    ? normalizedRole
    : "user";
};
