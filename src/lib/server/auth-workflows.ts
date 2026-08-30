import {
  createHash,
  randomBytes,
  randomInt,
  randomUUID,
  timingSafeEqual,
} from "crypto";
import { prisma } from "./prisma";
import { createSessionForUser, hashPassword } from "./auth";
import {
  MAX_OTP_ATTEMPTS,
  shouldExposeVerificationPreviewCode,
} from "../auth/otp-policy";
import {
  getPasswordPolicyMessage,
  validatePassword,
} from "../auth/password-policy";
import {
  isPhoneVerificationEnabled,
  isPhoneVerificationProviderConfigured,
} from "../auth/provider-policy";
import {
  isEmailDeliveryConfigured,
  sendTransactionalEmail,
} from "./email/email-service";

export {
  isPhoneVerificationEnabled,
  isPhoneVerificationProviderConfigured,
} from "../auth/provider-policy";

type VerificationChannel = "email" | "phone";
type VerificationPurpose =
  | "signup"
  | "login"
  | "verify_email"
  | "verify_phone"
  | "reset_password";

type VerificationDispatchResult = {
  sent: boolean;
  previewCode: string | null;
};

const EMAIL_CODE_TTL_MINUTES = 15;
const PHONE_CODE_TTL_MINUTES = 10;
const DEFAULT_WIDGETS = [
  "metrics",
  "activities",
  "trainings",
  "certifications",
];

const slugify = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

const asMetadataRecord = (value: unknown): Record<string, any> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {};

const createOtpCode = () => randomInt(100000, 1_000_000).toString();

const hashOtpCode = (code: string) =>
  createHash("sha256").update(code).digest("hex");

const getAppBaseUrl = () =>
  process.env.AUTH_BASE_URL ||
  process.env.NEXT_PUBLIC_APP_URL ||
  "http://localhost:3001";

const getPreviewCode = (sent: boolean, code: string) =>
  !sent && shouldExposeVerificationPreviewCode() ? code : null;

export const createVerificationReference = () =>
  `verify_${randomBytes(24).toString("hex")}`;

export const findUserByVerificationReference = async (reference: string) => {
  const normalizedReference = String(reference || "").trim();
  if (!normalizedReference) return null;

  const byToken = await prisma.user.findUnique({
    where: { token_verification_id: normalizedReference },
  });
  if (byToken) return byToken;

  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      normalizedReference,
    )
  ) {
    return null;
  }

  return prisma.user.findUnique({ where: { id: normalizedReference } });
};

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
    isPhoneVerificationEnabled() &&
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

  if (!response.ok) {
    console.error("Twilio verification delivery failed", {
      status: response.status,
    });
  }
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

  const delivery = await sendTransactionalEmail({
    to: user.email,
    subject: "Verifica il tuo account EasyGame",
    text: `Il tuo codice EasyGame è ${code}. Scade tra ${EMAIL_CODE_TTL_MINUTES} minuti.`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; color: #0f172a;">
        <h2 style="margin-bottom: 12px;">Verifica accesso EasyGame</h2>
        <p>Ciao ${escapeHtml(user.first_name || "")}, usa questo codice per completare l'accesso:</p>
        <div style="font-size: 32px; font-weight: 700; letter-spacing: 8px; padding: 16px 0;">${code}</div>
        <p>Il codice scade tra ${EMAIL_CODE_TTL_MINUTES} minuti.</p>
      </div>
    `,
  });

  return {
    sent: delivery.status === "sent",
    previewCode: getPreviewCode(delivery.status === "sent", code),
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
    previewCode: getPreviewCode(false, code),
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
      // Le challenge di reset password hanno un token lungo e un flusso
      // proprio: non devono essere consumate da una conferma OTP, altrimenti
      // un reset in corso verrebbe invalidato da un tentativo di verifica.
      purpose: { not: "reset_password" },
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
    throw new Error("Codice non valido o scaduto");
  }

  if (challenge.attempts >= MAX_OTP_ATTEMPTS) {
    await prisma.authVerificationChallenge.update({
      where: { id: challenge.id },
      data: { consumed_at: new Date() },
    });
    throw new Error("Codice non valido o scaduto");
  }

  const isValid = challenge.code_hash === hashOtpCode(code);
  const nextAttempts = challenge.attempts + 1;
  await prisma.authVerificationChallenge.update({
    where: { id: challenge.id },
    data: {
      attempts: nextAttempts,
      consumed_at:
        isValid || nextAttempts >= MAX_OTP_ATTEMPTS
          ? new Date()
          : challenge.consumed_at,
    },
  });

  if (!isValid) {
    throw new Error("Codice non valido o scaduto");
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
  userReference: string,
  code: string,
) => {
  const user = await findUserByVerificationReference(userReference);
  if (!user) throw new Error("Codice non valido o scaduto");

  await verifyInternalChallenge({
    userId: user.id,
    channel: "email",
    code,
  });

  return prisma.user.update({
    where: { id: user.id },
    data: {
      email_verified_at: new Date(),
    },
  });
};

export const confirmPhoneVerification = async (
  userReference: string,
  code: string,
) => {
  const user = await findUserByVerificationReference(userReference);

  if (!user) {
    throw new Error("Codice non valido o scaduto");
  }

  if (!user.phone) {
    throw new Error("Telefono non disponibile");
  }

  if (isPhoneVerificationProviderConfigured()) {
    await verifyPhoneWithTwilio(user.phone, code);
  } else {
    await verifyInternalChallenge({
      userId: user.id,
      channel: "phone",
      code,
    });
  }

  return prisma.user.update({
    where: { id: user.id },
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

  const userMetadata = asMetadataRecord(user.user_metadata);

  const organizationName =
    user.organization_name ||
    (userMetadata.organizationName
      ? String(userMetadata.organizationName)
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
      address: userMetadata.address || null,
      city: userMetadata.city || null,
      postal_code: userMetadata.postalCode || null,
      region: userMetadata.region || null,
      province: userMetadata.province || null,
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

  if (
    isPhoneVerificationEnabled() &&
    user.phone_verification_required &&
    user.phone &&
    !user.phone_verified_at
  ) {
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
      display_name:
        [firstName, lastName].filter(Boolean).join(" ").trim() || null,
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

/**
 * Il tenant Microsoft su cui si autentica, `common` se non e stato scelto.
 *
 * `common`, `organizations` e `consumers` sono i tre endpoint **multi-tenant**:
 * accettano l'utente di qualunque directory, anche una creata poco fa da chi
 * sta attaccando. Un tenant nominato e invece una directory sola, la cui
 * amministrazione e nota.
 */
const MICROSOFT_SHARED_TENANTS = new Set(["common", "organizations", "consumers"]);

/** Due indirizzi sono lo stesso indirizzo. Confronto normalizzato, come al login. */
const sameEmail = (a: unknown, b: unknown) =>
  String(a ?? "").trim().toLowerCase() === String(b ?? "").trim().toLowerCase() &&
  String(a ?? "").trim() !== "";

const microsoftTenant = () =>
  String(process.env.MICROSOFT_TENANT_ID || "").trim() || "common";

const microsoftTenantIsTrusted = () =>
  !MICROSOFT_SHARED_TENANTS.has(microsoftTenant().toLowerCase());

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
          authorizationUrl: `https://login.microsoftonline.com/${microsoftTenant()}/oauth2/v2.0/authorize`,
          tokenUrl: `https://login.microsoftonline.com/${microsoftTenant()}/oauth2/v2.0/token`,
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
              /*
                **Microsoft non verifica l'indirizzo, e lo dice.**

                Il claim `email` di Entra ID e un attributo che l'amministratore
                del tenant scrive: non e legato a un dominio dimostrato. Con
                l'endpoint `/common` il tenant lo puo creare chiunque in pochi
                minuti — quindi chiunque puo presentarsi con l'indirizzo di un
                altro. E la vulnerabilita che Microsoft stessa documenta
                («nOAuth»): l'indirizzo non va usato per decidere chi sei.

                Diventa affidabile solo quando il deployment fissa **il proprio**
                tenant: li l'amministratore e il club, e la sua parola vale.
                Senza `MICROSOFT_TENANT_ID` l'indirizzo resta non verificato, e
                piu sotto un indirizzo non verificato non apre nessun conto
                esistente.
              */
              emailVerified: microsoftTenantIsTrusted(),
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
  emailVerified,
  firstName,
  lastName,
  displayName,
  avatarUrl,
  raw,
}: {
  providerId: string;
  providerAccountId: string;
  email: string;
  emailVerified: boolean;
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
    const existingMetadata = asMetadataRecord(
      existingAccount.user.user_metadata,
    );
    const updatedUser = await prisma.user.update({
      where: { id: existingAccount.user.id },
      data: {
        /*
          **Verificato da chi, e per quale indirizzo.**

          L'identita qui e dimostrata — il provider ha riconosciuto lo stesso
          `sub` di sempre — ma «l'indirizzo e verificato» resta una cosa che
          dice il provider, e la dice **del proprio** indirizzo, non di
          qualunque indirizzo l'account porti in quel momento.

          Senza il confronto, questo ramo era la strada che riapriva il difetto
          chiuso ieri: si collega il proprio account a Google, si cambia il
          proprio indirizzo con quello del tutore di un'altra famiglia — il
          cambio azzera `email_verified_at`, ed e quell'azzeramento a chiudere
          la porta — e poi si rientra da Google. Stesso `sub`, quindi nessun
          controllo, e qui si ristampava «verificato» su un indirizzo che
          nessuno ha mai verificato. Da li l'area genitore riconosceva di
          nuovo il legame per indirizzo, con dentro pagamenti, fatture e
          certificati medici di quel minore.

          Si stampa quindi solo se il provider ha verificato **quell'**
          indirizzo: quello che porta l'account adesso.
        */
        email_verified_at:
          existingAccount.user.email_verified_at ||
          (emailVerified && sameEmail(email, existingAccount.user.email)
            ? new Date()
            : null),
        user_metadata: {
          ...existingMetadata,
          avatarUrl: avatarUrl || existingMetadata.avatarUrl,
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

  /*
    **Un indirizzo non verificato non apre nessun conto, e non ne crea.**

    Sotto questa riga ci sono i due percorsi che si fidano dell'indirizzo: uno
    entra in un conto che esiste gia, l'altro ne crea uno nuovo. Entrambi
    prendono per buono che chi si presenta possieda quell'indirizzo, e finche
    quella prova non c'era il primo era una **presa di possesso**: bastava un
    tenant proprio, un utente con l'indirizzo della vittima e un giro di login
    per ricevere il cookie di sessione della vittima — password, OTP e limiti
    di tentativi scavalcati tutti insieme.

    Il secondo non e innocuo per conto suo: creare un conto sull'indirizzo di
    un altro lo occupa, e quando il legittimo proprietario arrivera davvero
    verificato finira **dentro** il conto occupato, con chi lo aveva occupato
    ancora collegato.

    Il ramo di sopra — il provider riconosce lo stesso `sub` — non passa di
    qui: quell'identita e dimostrata, e chi si e gia collegato continua a
    entrare.
  */
  if (!emailVerified) {
    throw new Error(
      /*
        Il messaggio finisce in `?oauthError=` sulla pagina di login: non ci si
        mette l'indirizzo, che e un dato personale e le query string si
        registrano nei log di ogni intermediario.
      */
      `Accesso negato: ${providerId} non certifica che l'indirizzo dichiarato ` +
        "appartenga a chi ha effettuato l'accesso, e un indirizzo non verificato " +
        "non puo aprire ne creare un account. " +
        "Accedi con la password, oppure configura MICROSOFT_TENANT_ID sul tenant del club.",
    );
  }

  const existingUser = await prisma.user.findUnique({
    where: { email },
  });

  if (existingUser) {
    const existingMetadata = asMetadataRecord(existingUser.user_metadata);
    const updatedUser = await prisma.user.update({
      where: { id: existingUser.id },
      data: {
        first_name: existingUser.first_name || firstName || null,
        last_name: existingUser.last_name || lastName || null,
        email_verified_at: existingUser.email_verified_at || new Date(),
        user_metadata: {
          ...existingMetadata,
          name:
            [
              existingUser.first_name || firstName,
              existingUser.last_name || lastName,
            ]
              .filter(Boolean)
              .join(" ")
              .trim() ||
            displayName ||
            undefined,
          avatarUrl: avatarUrl || existingMetadata.avatarUrl,
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

export const getAuthCapabilities = async () => {
  const emailConfigured = await isEmailDeliveryConfigured();
  return {
    emailVerification: true,
    phoneVerification: isPhoneVerificationEnabled(),
    emailProviderConfigured: emailConfigured,
    phoneProviderConfigured: isPhoneVerificationProviderConfigured(),
    testCodesEnabled: shouldExposeVerificationPreviewCode(),
    providers: getEnabledOAuthProviders().map((provider) => ({
      id: provider.id,
      label: provider.label,
    })),
  };
};

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

/* ------------------------------------------------------------------------- *
 * Reset password (ADR-0015)
 *
 * Diverso dagli OTP a 6 cifre: qui si usa un token lungo casuale consegnato
 * come link via email. Il token e salvato solo come hash SHA-256 e la ricerca
 * della challenge e vincolata anche al `purpose`, cosi un token di reset non
 * puo essere consumato dalla conferma email e viceversa.
 * ------------------------------------------------------------------------- */

const PASSWORD_RESET_TTL_MINUTES = 30;

export const PASSWORD_RESET_GENERIC_MESSAGE =
  "Se l'indirizzo è associato a un account, ti abbiamo inviato le istruzioni per reimpostare la password.";

const createPasswordResetToken = () => randomBytes(32).toString("hex");

export const findUserByEmailForPasswordReset = async (email: string) => {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  if (!normalizedEmail) return null;
  return prisma.user.findUnique({ where: { email: normalizedEmail } });
};

export const sendPasswordResetChallenge = async (user: {
  id: string;
  email: string;
  first_name?: string | null;
}): Promise<VerificationDispatchResult> => {
  const token = createPasswordResetToken();

  // Un solo token di reset valido per volta.
  await prisma.authVerificationChallenge.updateMany({
    where: {
      user_id: user.id,
      channel: "email",
      purpose: "reset_password",
      consumed_at: null,
    },
    data: { consumed_at: new Date() },
  });

  await prisma.authVerificationChallenge.create({
    data: {
      user_id: user.id,
      channel: "email",
      purpose: "reset_password",
      target: user.email,
      code_hash: hashOtpCode(token),
      expires_at: new Date(Date.now() + PASSWORD_RESET_TTL_MINUTES * 60 * 1000),
    },
  });

  const resetUrl = `${getAppBaseUrl()}/auth/reset-password?uid=${encodeURIComponent(
    user.id,
  )}&token=${encodeURIComponent(token)}`;

  const delivery = await sendTransactionalEmail({
    to: user.email,
    subject: "Reimposta la password EasyGame",
    text:
      `Hai richiesto di reimpostare la password del tuo account EasyGame.\n\n` +
      `Apri questo link entro ${PASSWORD_RESET_TTL_MINUTES} minuti:\n${resetUrl}\n\n` +
      `Se non hai richiesto tu il reset, ignora questa email: la password resta invariata.`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; color: #0f172a;">
        <h2 style="margin-bottom: 12px;">Reimposta la password</h2>
        <p>Ciao ${escapeHtml(user.first_name || "")}, hai richiesto di reimpostare la password del tuo account EasyGame.</p>
        <p style="padding: 20px 0;">
          <a href="${resetUrl}" style="background:#2563eb;color:#ffffff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600;">Scegli una nuova password</a>
        </p>
        <p>Il link scade tra ${PASSWORD_RESET_TTL_MINUTES} minuti e può essere usato una sola volta.</p>
        <p style="color:#64748b;font-size:13px;">Se non hai richiesto tu il reset, ignora questa email: la password resta invariata.</p>
      </div>
    `,
  });

  return {
    sent: delivery.status === "sent",
    // In sviluppo, se l'email non parte, il token è consultabile come per gli OTP.
    previewCode: getPreviewCode(delivery.status === "sent", token),
  };
};

export const confirmPasswordReset = async ({
  userId,
  token,
  password,
}: {
  userId: string;
  token: string;
  password: string;
}) => {
  const normalizedUserId = String(userId || "").trim();
  const normalizedToken = String(token || "").trim();

  if (!normalizedUserId || !normalizedToken) {
    throw new Error("Link di reset non valido o scaduto");
  }

  const user = await prisma.user.findUnique({
    where: { id: normalizedUserId },
  });
  if (!user) {
    throw new Error("Link di reset non valido o scaduto");
  }

  const challenge = await prisma.authVerificationChallenge.findFirst({
    where: {
      user_id: user.id,
      channel: "email",
      purpose: "reset_password",
      consumed_at: null,
      expires_at: { gt: new Date() },
    },
    orderBy: { created_at: "desc" },
  });

  if (!challenge) {
    throw new Error("Link di reset non valido o scaduto");
  }

  if (challenge.attempts >= MAX_OTP_ATTEMPTS) {
    await prisma.authVerificationChallenge.update({
      where: { id: challenge.id },
      data: { consumed_at: new Date() },
    });
    throw new Error("Link di reset non valido o scaduto");
  }

  const provided = Buffer.from(hashOtpCode(normalizedToken), "hex");
  const expected = Buffer.from(challenge.code_hash, "hex");
  const matches =
    provided.length === expected.length && timingSafeEqual(provided, expected);

  if (!matches) {
    await prisma.authVerificationChallenge.update({
      where: { id: challenge.id },
      data: { attempts: { increment: 1 } },
    });
    throw new Error("Link di reset non valido o scaduto");
  }

  /*
    **La regola sulla password si controlla dopo il token, non prima.**

    Prima veniva applicata subito dopo aver trovato l'utente, e i suoi messaggi
    escono verbatim dalla rotta: una password corta rispondeva «deve contenere
    almeno 12 caratteri» quando quell'`uid` esisteva e «Link di reset non valido
    o scaduto» quando non esisteva — **senza avere il token**. Chi provava un
    identificativo scopriva cosi se corrispondeva a un account.

    E `validatePassword` confronta anche con la parte locale dell'indirizzo:
    l'errore «una password che non contenga il nome dell'email» confermava
    all'attaccante di aver indovinato l'indirizzo della vittima.

    Adesso chi non ha dimostrato di avere il token riceve una frase sola,
    identica in tutti i casi.
  */
  const policy = validatePassword(password, user.email);
  if (!policy.valid) {
    throw new Error(getPasswordPolicyMessage(policy));
  }

  const password_hash = await hashPassword(password);

  await prisma.$transaction([
    prisma.authVerificationChallenge.update({
      where: { id: challenge.id },
      data: { consumed_at: new Date() },
    }),
    prisma.user.update({
      where: { id: user.id },
      data: {
        password_hash,
        // Chi ha aperto il link ha dimostrato di controllare la casella.
        ...(user.email_verified_at ? {} : { email_verified_at: new Date() }),
      },
    }),
    // Un reset invalida ogni sessione aperta, ovunque.
    prisma.session.deleteMany({ where: { user_id: user.id } }),
  ]);

  return { userId: user.id, email: user.email };
};
