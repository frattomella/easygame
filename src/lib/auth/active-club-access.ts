export type MembershipAccessIdentity = {
  id?: string | null;
  organization_id: string;
  role?: string | null;
  access_kind?: string | null;
  is_ownership_record?: boolean | null;
};

export type StoredAccessIdentity = {
  id?: string | null;
  role?: string | null;
  membershipId?: string | null;
  accessKind?: string | null;
  accessKey?: string | null;
};

const normalize = (value?: string | null) =>
  String(value || "")
    .trim()
    .toLowerCase();

type RoleNormalizer = (value?: string | null) => string;

export const getMembershipAccessKind = (membership: MembershipAccessIdentity) =>
  normalize(
    membership.access_kind ||
      (membership.is_ownership_record ? "ownership" : "membership"),
  );

export const getMembershipAccessKey = (
  membership: MembershipAccessIdentity,
  normalizeRole: RoleNormalizer = normalize,
) => {
  const accessKind = getMembershipAccessKind(membership);
  const role = normalizeRole(membership.role);

  return accessKind === "ownership"
    ? `ownership:${membership.organization_id}`
    : `membership:${membership.id || `${membership.organization_id}:${role}`}`;
};

/**
 * Un club può avere più accessi per lo stesso utente. Il solo organization id
 * non basta: prima confrontiamo membership/access key e ruolo. Il fallback per
 * solo club id è riservato alle cache legacy che non possiedono identità accesso.
 */
export const findStoredAccessMembership = <T extends MembershipAccessIdentity>(
  memberships: T[],
  storedAccess?: StoredAccessIdentity | null,
  normalizeRole: RoleNormalizer = normalize,
) => {
  const organizationId = String(storedAccess?.id || "").trim();
  if (!organizationId) {
    return null;
  }

  const membershipId = String(storedAccess?.membershipId || "").trim();
  if (membershipId) {
    const byMembershipId = memberships.find(
      (membership) =>
        membership.organization_id === organizationId &&
        String(membership.id || "") === membershipId,
    );
    if (byMembershipId) {
      return byMembershipId;
    }
  }

  const accessKey = String(storedAccess?.accessKey || "").trim();
  if (accessKey) {
    const byAccessKey = memberships.find(
      (membership) =>
        membership.organization_id === organizationId &&
        getMembershipAccessKey(membership, normalizeRole) === accessKey,
    );
    if (byAccessKey) {
      return byAccessKey;
    }
  }

  const role = normalizeRole(storedAccess?.role);
  const accessKind = normalize(storedAccess?.accessKind);
  if (role || accessKind) {
    return (
      memberships.find(
        (membership) =>
          membership.organization_id === organizationId &&
          (!role || normalizeRole(membership.role) === role) &&
          (!accessKind || getMembershipAccessKind(membership) === accessKind),
      ) || null
    );
  }

  return (
    memberships.find(
      (membership) => membership.organization_id === organizationId,
    ) || null
  );
};
