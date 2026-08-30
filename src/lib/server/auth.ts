import { randomBytes, randomUUID } from "crypto";
import type { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "./prisma";
import { isPlatformAdminUser } from "@/lib/platform-admin";
import { normalizeAccessRole } from "@/lib/access-roles";

export const SESSION_COOKIE_NAME = "easygame_session";
const SESSION_DURATION_SECONDS = 60 * 60 * 24 * 14;

export type AuthSessionUser = {
  id: string;
  email: string;
  app_metadata: Record<string, any>;
  aud: string;
  created_at: string;
  updated_at: string;
  user_metadata: Record<string, any>;
};

export type AuthSessionPayload = {
  access_token: string;
  refresh_token: string;
  token_type: "bearer";
  expires_in: number;
  expires_at: number;
  user: AuthSessionUser;
};

export type OrganizationAccessScope = {
  userId: string;
  activeOrganizationId: string | null;
  activeRole: string | null;
  activeMembershipId: string | null;
  allowedOrganizationIds: string[];
};

export const buildUserMetadata = (user: {
  first_name?: string | null;
  last_name?: string | null;
  phone?: string | null;
  role: string;
  is_club_creator?: boolean;
  organization_name?: string | null;
  email_verified_at?: Date | null;
  phone_verified_at?: Date | null;
  phone_verification_required?: boolean;
  user_metadata?: any;
}) => ({
  ...(typeof user.user_metadata === "object" && user.user_metadata
    ? user.user_metadata
    : {}),
  firstName: user.first_name || undefined,
  lastName: user.last_name || undefined,
  name:
    [user.first_name, user.last_name].filter(Boolean).join(" ").trim() ||
    user.user_metadata?.name,
  phone: user.phone || undefined,
  role: user.role,
  isClubCreator: Boolean(user.is_club_creator),
  organizationName: user.organization_name || undefined,
  emailVerified: Boolean(user.email_verified_at),
  phoneVerified: Boolean(user.phone_verified_at),
  phoneVerificationRequired: Boolean(user.phone_verification_required),
});

export const serializeAuthUser = (user: {
  id: string;
  email: string;
  role: string;
  first_name?: string | null;
  last_name?: string | null;
  phone?: string | null;
  created_at: Date;
  updated_at: Date;
  is_club_creator?: boolean;
  organization_name?: string | null;
  email_verified_at?: Date | null;
  phone_verified_at?: Date | null;
  phone_verification_required?: boolean;
  user_metadata?: any;
}): AuthSessionUser => ({
  id: user.id,
  email: user.email,
  aud: "authenticated",
  app_metadata: {
    role: user.role,
  },
  created_at: user.created_at.toISOString(),
  updated_at: user.updated_at.toISOString(),
  user_metadata: buildUserMetadata(user),
});

export const buildSessionPayload = (
  user: Parameters<typeof serializeAuthUser>[0],
  token: string,
  expires_at: Date,
): AuthSessionPayload => ({
  access_token: token,
  refresh_token: token,
  token_type: "bearer",
  expires_in: SESSION_DURATION_SECONDS,
  expires_at: Math.floor(expires_at.getTime() / 1000),
  user: serializeAuthUser(user),
});

export const hashPassword = async (password: string) =>
  bcrypt.hash(password, 10);

export const verifyPassword = async (password: string, password_hash: string) =>
  bcrypt.compare(password, password_hash);

export const createSessionForUser = async (
  user: Parameters<typeof serializeAuthUser>[0],
) => {
  const token = `${randomUUID()}-${randomBytes(16).toString("hex")}`;
  const expires_at = new Date(Date.now() + SESSION_DURATION_SECONDS * 1000);

  await prisma.session.create({
    data: {
      token,
      user_id: user.id,
      expires_at,
    },
  });

  return buildSessionPayload(user, token, expires_at);
};

const parseCookies = (cookieHeader: string | null) => {
  const cookies: Record<string, string> = {};

  if (!cookieHeader) {
    return cookies;
  }

  for (const part of cookieHeader.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (!key) continue;
    cookies[key] = decodeURIComponent(rest.join("="));
  }

  return cookies;
};

export const readAuthToken = (request: Request | NextRequest) => {
  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.slice("Bearer ".length).trim();
  }

  const cookieHeader = request.headers.get("cookie");
  const cookies = parseCookies(cookieHeader);
  return cookies[SESSION_COOKIE_NAME] || null;
};

export const getSessionFromRequest = async (request: Request | NextRequest) => {
  const token = readAuthToken(request);
  if (!token) {
    return null;
  }

  const session = await prisma.session.findUnique({
    where: { token },
    include: { user: true },
  });

  if (!session) {
    return null;
  }

  if (session.expires_at.getTime() <= Date.now()) {
    await prisma.session.delete({ where: { token } }).catch(() => undefined);
    return null;
  }

  return {
    token,
    db: session,
    payload: buildSessionPayload(session.user, token, session.expires_at),
  };
};

export const requireAuthenticatedUser = async (
  request: Request | NextRequest,
) => {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return null;
  }

  return session;
};

export const isPlatformAdminSession = (
  session: Awaited<ReturnType<typeof getSessionFromRequest>> | null,
) => {
  if (!session) {
    return false;
  }

  /*
    **La regola sta in un posto solo.**

    Qui ne viveva una seconda copia, e le due non dicevano la stessa cosa:
    `isPlatformAdminUser` era stata corretta perche con l'elenco configurato
    contasse **solo** l'indirizzo, mentre questa manteneva il ramo alternativo
    su `users.role` anche a elenco pieno — proprio sul controllo che sorveglia
    tutto `/api/v1/admin/*`.

    L'effetto pratico: togliere qualcuno dall'elenco degli indirizzi lo toglieva
    dalla porta d'ingresso ma non dall'API. Non ho trovato una strada con cui
    un utente si scriva `users.role` da solo, quindi non era sfruttabile — ma
    un disegno a due serrature che si contraddicono e gia rotto prima che
    qualcuno trovi come aprirlo.
  */
  return isPlatformAdminUser(session.db.user);
};

export const requirePlatformAdmin = async (request: Request | NextRequest) => {
  const session = await requireAuthenticatedUser(request);
  if (!session || !isPlatformAdminSession(session)) {
    return null;
  }

  return session;
};

export const resolveOrganizationScopeForUser = async (
  userId: string,
  preferredOrganizationId?: string | null,
  preferredRole?: string | null,
): Promise<OrganizationAccessScope> => {
  // Le due letture sono indipendenti e vengono eseguite in parallelo: in serie
  // aggiungevano due round trip a Neon a **ogni** richiesta autenticata.
  const [memberships, ownedClubs] = await Promise.all([
    prisma.organizationUser.findMany({
      where: { user_id: userId },
      select: {
        id: true,
        organization_id: true,
        role: true,
        is_primary: true,
      },
      orderBy: [{ is_primary: "desc" }, { created_at: "asc" }],
    }),
    prisma.club.findMany({
      where: { creator_id: userId },
      select: { id: true },
      orderBy: { created_at: "asc" },
    }),
  ]);

  const allowedOrganizationIds = Array.from(
    new Set(
      memberships
        .map((membership) => membership.organization_id)
        .concat(ownedClubs.map((club) => club.id))
        .filter(Boolean),
    ),
  );

  const activeOrganizationId =
    (preferredOrganizationId &&
    allowedOrganizationIds.includes(preferredOrganizationId)
      ? preferredOrganizationId
      : null) ||
    memberships.find((membership) => membership.is_primary)?.organization_id ||
    ownedClubs[0]?.id ||
    allowedOrganizationIds[0] ||
    null;

  const normalizedPreferredRole = normalizeAccessRole(preferredRole);
  const ownsActiveOrganization = ownedClubs.some(
    (club) => club.id === activeOrganizationId,
  );
  const membershipsForActiveOrganization = memberships.filter(
    (membership) => membership.organization_id === activeOrganizationId,
  );
  const preferredMembership = normalizedPreferredRole
    ? membershipsForActiveOrganization.find(
        (membership) =>
          normalizeAccessRole(membership.role) === normalizedPreferredRole,
      )
    : null;
  const primaryMembership = membershipsForActiveOrganization.find(
    (membership) => membership.is_primary,
  );
  const selectedMembership =
    preferredMembership ||
    primaryMembership ||
    membershipsForActiveOrganization[0] ||
    null;
  const activeRole =
    normalizedPreferredRole === "owner" && ownsActiveOrganization
      ? "owner"
      : preferredRole && !preferredMembership
        ? null
        : normalizeAccessRole(selectedMembership?.role) ||
          (ownsActiveOrganization ? "owner" : null);

  return {
    userId,
    activeOrganizationId,
    activeRole,
    activeMembershipId: selectedMembership?.id || null,
    allowedOrganizationIds,
  };
};

export const attachSessionCookie = (
  response: NextResponse,
  session: AuthSessionPayload,
) => {
  response.cookies.set(SESSION_COOKIE_NAME, session.access_token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(session.expires_at * 1000),
  });
};

export const clearSessionCookie = (response: NextResponse) => {
  response.cookies.set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
};

export const deleteSessionToken = async (token: string | null) => {
  if (!token) return;

  await prisma.session.deleteMany({
    where: {
      token,
    },
  });
};
