import { createHash, randomBytes, randomUUID } from "crypto";
import { prisma } from "./prisma";
import { createSessionForUser, hashPassword } from "./auth";

type VerificationChannel = "email" | "phone";
type VerificationPurpose =
  | "signup"
  | "login"
  | "verify_email"
  | "verify_phone";

type VerificationDispatchResult = {
  sent: boolean;
  previewCode: string | null;
};

const EMAIL_CODE_TTL_MINUTES = 15;
const PHONE_CODE_TTL_MINUTES = 10;
const DEFAULT_WIDGETS = ["metrics", "activities", "trainings", "certifications"];

const slugify = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const createOtpCode = () =>
  Math.floor(100000 + Math.random() * 900000).toString();

const hashOtpCode = (code: string) =>
  createHash("sha256").update(code).digest("hex");

const getAppBaseUrl = () =>
  process.env.AUTH_BASE_URL ||
  process.env.NEXT_PUBLIC_APP_URL ||
  "http://localhost:3000";

const isPhoneVerificationProviderConfigured = () =>
  Boolean(
    process.env.TWILIO_ACCOUNT_SID &&
      process.env.TWILIO_AUTH_TOKEN &&
      process.env.TWILIO_VERIFY_SERVICE_SID,
  );

const buildVerificationPayload = (user: {
  id: string;
  email: string;
  phone?: string | null;
  email_verified_at?: Date | null;
  phone_verified_at?: Date | null;
  phone_verification_required?: boolean;
}) => ({
  userId: user.id,
  email: user.email,
  phone: user.phone || null,
  emailRequired: !user.email_verified_at,
  phoneRequired:
    Boolean(user.phone_verification_required && user.phone) &&
    !user.phone_verified_at,
});

const buildTwilioAuthHeader = () =>
  `Basic ${Buffer.from(
    `${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`,
  ).toString("base64")}`;

const createInternalChallenge = async ({
  userId,
  channel,
  purpose,
  target,
  expiresInMinutes,
}: {
  userId: string;
  channel: VerificationChannel;
  purpose: VerificationPurpose;
  target: string;
  expiresInMinutes: number;
}) => {
  const code = createOtpCode();

  await prisma.authVerificationChallenge.updateMany({
    where: {
      user_id: userId,
      channel,
      purpose,
      consumed_at: null,
    },
    data: {
      consumed_at: new Date(),
    },
  });

  await prisma.authVerificationChallenge.create({
    data: {
      user_id: userId,
      channel,
      purpose,
      target,
      code_hash: hashOtpCode(code),
      expires_at: new Date(Date.now() + expiresInMinutes * 60 * 1000),
    },
  });

  return code;
};

const sendEmailViaResend = async ({
  to,
  subject,
  html,
}: {
  to: string;
  subject: string;
  html: string;
}) => {
  if (!process.env.RESEND_API_KEY || !process.env.AUTH_FROM_EMAIL) {
    return false;
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.AUTH_FROM_EMAIL,
      to: [to],
      subject,
      html,
    }),
  });

  return response.ok;
};

const sendPhoneViaTwilioVerify = async (phone: string) => {
  if (!isPhoneVerificationProviderConfigured()) {
    return false;
  }

  const body = new URLSearchParams({
    To: phone,
    Channel: "sms",
  });

  const response = await fetch(
    `https://verify.twilio.com/v2/Services/${process.env.TWILIO_VERIFY_SERVICE_SID}/Verifications`,
    {
      method: "POST",
      headers: {
        Authorization: buildTwilioAuthHeader(),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    },
  );

  return response.ok;
};

export const sendEmailVerificationChallenge = async (
  user: {
    id: string;
    email: string;
    first_name?: string | null;
  },
  purpose: VerificationPurpose = "signup",
): Promise<VerificationDispatchResult> => {
  const code = await createInternalChallenge({
    userId: user.id,
    channel: "email",
    purpose,
    target: user.email,
    expiresInMinutes: EMAIL_CODE_TTL_MINUTES,
  });

  const sent = await sendEmailViaResend({
    to: user.email,
    subject: "Verifica il tuo account EasyGame",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; color: #0f172a;">
        <h2 style="margin-bottom: 12px;">Verifica accesso EasyGame</h2>
        <p>Ciao ${user.first_name || ""}, usa questo codice per completare l'accesso:</p>
        <div style="font-size: 32px; font-weight: 700; letter-spacing: 8px; padding: 16px 0;">${code}</div>
        <p>Il codice scade tra ${EMAIL_CODE_TTL_MINUTES} minuti.</p>
      </div>
    `,
  });

  return {
    sent,
    previewCode: sent ? null : code,
  };
};

export const sendPhoneVerificationChallenge = async (
  user: {
    id: string;
    phone?: string | null;
  },
  purpose: VerificationPurpose = "signup",
): Promise<VerificationDispatchResult> => {
  if (!user.phone) {
    return {
      sent: false,
      previewCode: null,
    };
  }

  if (isPhoneVerificationProviderConfigured()) {
    const sent = await sendPhoneViaTwilioVerify(user.phone);
    return {
      sent,
      previewCode: null,
    };
  }

  const code = await createInternalChallenge({
    userId: user.id,
    channel: "phone",
    purpose,
    target: user.phone,
    expiresInMinutes: PHONE_CODE_TTL_MINUTES,
  });

  return {
    sent: false,
    previewCode: code,
  };
};

const verifyInternalChallenge = async ({
  userId,
  channel,
  code,
}: {
  userId: string;
  channel: VerificationChannel;
  code: string;
}) => {
  const challenge = await prisma.authVerificationChallenge.findFirst({
    where: {
      user_id: userId,
      channel,
      consumed_at: null,
      expires_at: {
        gt: new Date(),
      },
    },
    orderBy: {
      created_at: "desc",
    },
  });

  if (!challenge) {
    throw new Error("Nessun codice valido trovato");
  }

  const isValid = challenge.code_hash === hashOtpCode(code);
  await prisma.authVerificationChallenge.update({
    where: { id: challenge.id },
    data: {
      attempts: challenge.attempts + 1,
      consumed_at: isValid ? new Date() : challenge.consumed_at,
    },
  });

  if (!isValid) {
    throw new Error("Codice di verifica non valido");
  }

  return challenge;
};

const verifyPhoneWithTwilio = async (phone: string, code: string) => {
  const body = new URLSearchParams({
    To: phone,
    Code: code,
  });

  const response = await fetch(
    `https://verify.twilio.com/v2/Services/${process.env.TWILIO_VERIFY_SERVICE_SID}/VerificationCheck`,
    {
      method: "POST",
      headers: {
        Authorization: buildTwilioAuthHeader(),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    },
  );

  if (!response.ok) {
    throw new Error("Codice SMS non valido");
  }

  const payload = (await response.json()) as { status?: string };
  if (payload.status !== "approved") {
    throw new Error("Codice SMS non valido");
  }
};

export const confirmEmailVerification = async (
  userId: string,
  code: string,
) => {
  await verifyInternalChallenge({
    userId,
    channel: "email",
    code,
  });

  return prisma.user.update({
    where: { id: userId },
    data: {
      email_verified_at: new Date(),
    },
  });
};

export const confirmPhoneVerification = async (
  userId: string,
  code: string,
) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    throw new Error("Utente non trovato");
  }

  if (!user.phone) {
    throw new Error("Telefono non disponibile");
  }

  if (isPhoneVerificationProviderConfigured()) {
    await verifyPhoneWithTwilio(user.phone, code);
  } else {
    await verifyInternalChallenge({
      userId,
      channel: "phone",
      code,
    });
  }

  return prisma.user.update({
    where: { id: userId },
    data: {
      phone_verified_at: new Date(),
    },
  });
};

export const ensurePrimaryClubForUser = async (userId: string) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      club_access: true,
    },
  });

  if (!user || !user.is_club_creator) {
    return null;
  }

  if (user.club_access.length > 0) {
    return user.club_access[0]?.organization_id || null;
  }

  const organizationName =
    user.organization_name ||
    (typeof user.user_metadata === "object" &&
    user.user_metadata?.organizationName
      ? String(user.user_metadata.organizationName)
      : "") ||
    [user.first_name, user.last_name].filter(Boolean).join(" ").trim() ||
    "Nuovo Club";

  const club = await prisma.club.create({
    data: {
      name: organizationName,
      slug: `${slugify(organizationName)}-${Date.now().toString().slice(-6)}`,
      creator_id: user.id,
      contact_email: user.email,
      contact_phone: user.phone || null,
      address:
        typeof user.user_metadata === "object" ? user.user_metadata?.address || null : null,
      city:
        typeof user.user_metadata === "object" ? user.user_metadata?.city || null : null,
      postal_code:
        typeof user.user_metadata === "object"
          ? user.user_metadata?.postalCode || null
          : null,
      region:
        typeof user.user_metadata === "object" ? user.user_metadata?.region || null : null,
      province:
        typeof user.user_metadata === "object"
          ? user.user_metadata?.province || null
          : null,
      country: "Italia",
    },
  });

  await prisma.organizationUser.create({
    data: {
      organization_id: club.id,
      user_id: user.id,
      role: "owner",
      is_primary: true,
    },
  });

  await prisma.dashboard.create({
    data: {
      organization_id: club.id,
      creator_id: user.id,
      slug: `${slugify(organizationName)}-dashboard-${Date.now()
        .toString()
        .slice(-6)}`,
      settings: {
        theme: "default",
        layout: "standard",
        widgets: DEFAULT_WIDGETS,
      },
    },
  });

  return club.id;
};

export const finalizeVerifiedSession = async (userId: string) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    throw new Error("Utente non trovato");
  }

  if (!user.email_verified_at) {
    throw new Error("Email non verificata");
  }

  if (user.phone_verification_required && user.phone && !user.phone_verified_at) {
    return {
      user,
      session: null,
      verification: buildVerificationPayload(user),
    };
  }

  await ensurePrimaryClubForUser(user.id);

  const refreshedUser = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!refreshedUser) {
    throw new Error("Utente non trovato");
  }

  const session = await createSessionForUser(refreshedUser);
  return {
    user: refreshedUser,
    session,
    verification: buildVerificationPayload(refreshedUser),
  };
};

export const createOAuthBootstrapUser = async ({
  email,
  firstName,
  lastName,
  avatarUrl,
  provider,
  providerAccountId,
}: {
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  avatarUrl?: string | null;
  provider: string;
  providerAccountId: string;
}) => {
  const randomPassword = randomBytes(24).toString("hex");
  const password_hash = await hashPassword(randomPassword);

  const user = await prisma.user.create({
    data: {
      email,
      password_hash,
      first_name: firstName || null,
      last_name: lastName || null,
      email_verified_at: new Date(),
      user_metadata: {
        role: "user",
        avatarUrl: avatarUrl || undefined,
        oauthPreferredProvider: provider,
      },
    },
  });

  await prisma.externalAccount.create({
    data: {
      user_id: user.id,
      provider,
      provider_account_id: providerAccountId,
      email,
      display_name: [firstName, lastName].filter(Boolean).join(" ").trim() || null,
      avatar_url: avatarUrl || null,
    },
  });

  return user;
};

export const upsertExternalAccount = async ({
  userId,
  provider,
  providerAccountId,
  email,
  displayName,
  avatarUrl,
  data,
}: {
  userId: string;
  provider: string;
  providerAccountId: string;
  email?: string | null;
  displayName?: string | null;
  avatarUrl?: string | null;
  data?: Record<string, any>;
}) => {
  await prisma.externalAccount.upsert({
    where: {
      provider_provider_account_id: {
        provider,
        provider_account_id: providerAccountId,
      },
    },
    update: {
      email: email || null,
      display_name: displayName || null,
      avatar_url: avatarUrl || null,
      data: data || undefined,
    },
    create: {
      user_id: userId,
      provider,
      provider_account_id: providerAccountId,
      email: email || null,
      display_name: displayName || null,
      avatar_url: avatarUrl || null,
      data: data || undefined,
    },
  });
};

type OAuthProviderConfig = {
  id: "google" | "microsoft";
  label: string;
  clientId: string;
  clientSecret: string;
  authorizationUrl: string;
  tokenUrl: string;
  scope: string;
  profile: (accessToken: string) => Promise<{
    providerAccountId: string;
    email: string;
    emailVerified: boolean;
    firstName?: string | null;
    lastName?: string | null;
    displayName?: string | null;
    avatarUrl?: string | null;
    raw: Record<string, any>;
  }>;
};

const oauthProviders: Record<string, OAuthProviderConfig | undefined> = {
  google:
    process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? {
          id: "google",
          label: "Google",
          clientId: process.env.GOOGLE_CLIENT_ID,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth",
          tokenUrl: "https://oauth2.googleapis.com/token",
          scope: "openid email profile",
          profile: async (accessToken: string) => {
            const response = await fetch(
              "https://openidconnect.googleapis.com/v1/userinfo",
              {
                headers: {
                  Authorization: `Bearer ${accessToken}`,
                },
              },
            );
            const payload = (await response.json()) as Record<string, any>;
            return {
              providerAccountId: String(payload.sub),
              email: String(payload.email),
              emailVerified: Boolean(payload.email_verified),
              firstName: payload.given_name || null,
              lastName: payload.family_name || null,
              displayName: payload.name || null,
              avatarUrl: payload.picture || null,
              raw: payload,
            };
          },
        }
      : undefined,
  microsoft:
    process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET
      ? {
          id: "microsoft",
          label: "Microsoft",
          clientId: process.env.MICROSOFT_CLIENT_ID,
          clientSecret: process.env.MICROSOFT_CLIENT_SECRET,
          authorizationUrl:
            "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
          tokenUrl:
            "https://login.microsoftonline.com/common/oauth2/v2.0/token",
          scope: "openid profile email User.Read",
          profile: async (accessToken: string) => {
            const response = await fetch(
              "https://graph.microsoft.com/oidc/userinfo",
              {
                headers: {
                  Authorization: `Bearer ${accessToken}`,
                },
              },
            );
            const payload = (await response.json()) as Record<string, any>;
            return {
              providerAccountId: String(payload.sub || payload.oid),
              email: String(payload.email || payload.preferred_username),
              emailVerified: true,
              firstName: payload.given_name || null,
              lastName: payload.family_name || null,
              displayName: payload.name || null,
              avatarUrl: null,
              raw: payload,
            };
          },
        }
      : undefined,
};

export const getEnabledOAuthProviders = () =>
  Object.values(oauthProviders).filter(
    (provider): provider is OAuthProviderConfig => Boolean(provider),
  );

export const getOAuthProviderById = (providerId: string) => {
  const provider = oauthProviders[providerId];
  if (!provider) {
    throw new Error("Provider OAuth non configurato");
  }
  return provider;
};

export const getOAuthRedirectUri = (providerId: string) =>
  `${getAppBaseUrl()}/api/v1/auth/oauth/${providerId}/callback`;

export const buildOAuthStateCookieName = (providerId: string) =>
  `easygame_oauth_state_${providerId}`;

export const buildOAuthAuthorizationUrl = ({
  providerId,
  state,
}: {
  providerId: string;
  state: string;
}) => {
  const provider = getOAuthProviderById(providerId);
  const params = new URLSearchParams({
    client_id: provider.clientId,
    redirect_uri: getOAuthRedirectUri(providerId),
    response_type: "code",
    scope: provider.scope,
    state,
  });

  if (providerId === "google") {
    params.set("access_type", "offline");
    params.set("prompt", "select_account");
  }

  return `${provider.authorizationUrl}?${params.toString()}`;
};

export const exchangeOAuthCode = async ({
  providerId,
  code,
}: {
  providerId: string;
  code: string;
}) => {
  const provider = getOAuthProviderById(providerId);
  const body = new URLSearchParams({
    code,
    client_id: provider.clientId,
    client_secret: provider.clientSecret,
    redirect_uri: getOAuthRedirectUri(providerId),
    grant_type: "authorization_code",
  });

  const tokenResponse = await fetch(provider.tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });

  if (!tokenResponse.ok) {
    throw new Error("Scambio OAuth non riuscito");
  }

  const tokenPayload = (await tokenResponse.json()) as {
    access_token?: string;
  };

  if (!tokenPayload.access_token) {
    throw new Error("Access token non disponibile");
  }

  return provider.profile(tokenPayload.access_token);
};

export const findOrCreateOAuthUser = async ({
  providerId,
  providerAccountId,
  email,
  firstName,
  lastName,
  displayName,
  avatarUrl,
  raw,
}: {
  providerId: string;
  providerAccountId: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  displayName?: string | null;
  avatarUrl?: string | null;
  raw?: Record<string, any>;
}) => {
  const existingAccount = await prisma.externalAccount.findUnique({
    where: {
      provider_provider_account_id: {
        provider: providerId,
        provider_account_id: providerAccountId,
      },
    },
    include: {
      user: true,
    },
  });

  if (existingAccount?.user) {
    const updatedUser = await prisma.user.update({
      where: { id: existingAccount.user.id },
      data: {
        email_verified_at: existingAccount.user.email_verified_at || new Date(),
        user_metadata: {
          ...(typeof existingAccount.user.user_metadata === "object" &&
          existingAccount.user.user_metadata
            ? existingAccount.user.user_metadata
            : {}),
          avatarUrl: avatarUrl || existingAccount.user.user_metadata?.avatarUrl,
          oauthPreferredProvider: providerId,
        },
      },
    });

    await upsertExternalAccount({
      userId: updatedUser.id,
      provider: providerId,
      providerAccountId,
      email,
      displayName,
      avatarUrl,
      data: raw,
    });

    return updatedUser;
  }

  const existingUser = await prisma.user.findUnique({
    where: { email },
  });

  if (existingUser) {
    const updatedUser = await prisma.user.update({
      where: { id: existingUser.id },
      data: {
        first_name: existingUser.first_name || firstName || null,
        last_name: existingUser.last_name || lastName || null,
        email_verified_at: existingUser.email_verified_at || new Date(),
        user_metadata: {
          ...(typeof existingUser.user_metadata === "object" &&
          existingUser.user_metadata
            ? existingUser.user_metadata
            : {}),
          name:
            [existingUser.first_name || firstName, existingUser.last_name || lastName]
              .filter(Boolean)
              .join(" ")
              .trim() || displayName || undefined,
          avatarUrl: avatarUrl || existingUser.user_metadata?.avatarUrl,
          oauthPreferredProvider: providerId,
        },
      },
    });

    await upsertExternalAccount({
      userId: updatedUser.id,
      provider: providerId,
      providerAccountId,
      email,
      displayName,
      avatarUrl,
      data: raw,
    });

    return updatedUser;
  }

  return createOAuthBootstrapUser({
    email,
    firstName,
    lastName,
    avatarUrl,
    provider: providerId,
    providerAccountId,
  });
};

export const createSessionForOAuthUser = async (userId: string) => {
  const { session } = await finalizeVerifiedSession(userId);
  if (!session) {
    throw new Error("Sessione OAuth non disponibile");
  }
  return session;
};

export const createOAuthState = () => randomUUID();

export const getAuthCapabilities = () => ({
  emailVerification: true,
  phoneVerification: true,
  phoneProviderConfigured: isPhoneVerificationProviderConfigured(),
  providers: getEnabledOAuthProviders().map((provider) => ({
    id: provider.id,
    label: provider.label,
  })),
});

export const buildPendingVerificationResponse = async (userId: string) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    throw new Error("Utente non trovato");
  }

  return {
    user,
    session: null,
    verification: buildVerificationPayload(user),
  };
};
