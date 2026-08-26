import { NextResponse } from "next/server";
import { prisma } from "@/lib/server/prisma";
import { hashPassword, verifyPassword } from "@/lib/server/auth";
import {
  createVerificationReference,
  isPhoneVerificationEnabled,
  sendEmailVerificationChallenge,
  sendPhoneVerificationChallenge,
} from "@/lib/server/auth-workflows";
import {
  AUTH_RATE_LIMITS,
  consumeRequestRateLimits,
  getRequestIp,
  rateLimitHeaders,
} from "@/lib/server/auth-rate-limit";
import {
  getPasswordPolicyMessage,
  validatePassword,
} from "@/lib/auth/password-policy";
import { normalizePublicRegistrationRole } from "@/lib/auth/registration-policy";
import { parseInput, validationErrorPayload } from "@/lib/validation";
import { registerInputSchema } from "@/lib/validation/schemas";
import { resolveEmailVerificationPolicy } from "@/lib/auth/email-verification-policy";
import {
  EmailDeliveryError,
  getEmailErrorMessage,
  isEmailDeliveryConfigured,
} from "@/lib/server/email/email-service";

const registrationResponse = ({
  verificationReference,
  email,
  phone,
  emailPreviewCode = null,
  phonePreviewCode = null,
}: {
  verificationReference: string;
  email: string;
  phone: string | null;
  emailPreviewCode?: string | null;
  phonePreviewCode?: string | null;
}) =>
  NextResponse.json(
    {
      data: {
        user: null,
        session: null,
        verification: {
          userId: verificationReference,
          email,
          phone,
          emailRequired: true,
          phoneRequired: Boolean(phone),
          emailPreviewCode,
          phonePreviewCode,
        },
      },
      error: null,
    },
    { status: 202 },
  );

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const userData =
      (typeof body?.options?.data === "object" && body.options.data) ||
      (typeof body?.userData === "object" && body.userData) ||
      {};

    let email = "";
    let password = "";
    try {
      const input = parseInput(registerInputSchema, body);
      email = input.email;
      password = input.password;
    } catch (error) {
      return NextResponse.json(
        {
          ...validationErrorPayload(error),
          data: { user: null, session: null },
        },
        { status: 400 },
      );
    }

    const passwordPolicy = validatePassword(password, email);
    if (!passwordPolicy.valid) {
      return NextResponse.json(
        {
          data: { user: null, session: null },
          error: {
            message: getPasswordPolicyMessage(passwordPolicy),
            code: "WEAK_PASSWORD",
          },
        },
        { status: 400 },
      );
    }

    const ip = getRequestIp(request);
    const rateLimit = await consumeRequestRateLimits([
      { policy: AUTH_RATE_LIMITS.registerIp, identifier: `ip:${ip}` },
      {
        policy: AUTH_RATE_LIMITS.registerIdentity,
        identifier: `identity:${email}`,
      },
    ]);
    if (rateLimit) {
      return NextResponse.json(
        {
          data: { user: null, session: null },
          error: {
            message: "Troppe richieste. Riprova più tardi.",
            code: "RATE_LIMITED",
          },
        },
        { status: 429, headers: rateLimitHeaders(rateLimit) },
      );
    }

    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    const shouldCreateClub = Boolean(body?.createClub ?? userData.createClub);
    const role = normalizePublicRegistrationRole(
      userData.role,
      shouldCreateClub,
    );
    const first_name = String(userData.firstName || "").trim() || null;
    const last_name = String(userData.lastName || "").trim() || null;
    const phoneVerificationEnabled = isPhoneVerificationEnabled();
    const emailVerificationPolicy = resolveEmailVerificationPolicy(
      await isEmailDeliveryConfigured(),
    );
    const phone = phoneVerificationEnabled
      ? String(userData.phone || "").trim() || null
      : null;
    const organization_name = String(
      userData.organizationName ||
        [first_name, last_name].filter(Boolean).join(" ").trim() ||
        "Nuovo Club",
    ).trim();

    if (existingUser) {
      const passwordMatches = await verifyPassword(
        password,
        existingUser.password_hash,
      );

      if (passwordMatches && !existingUser.email_verified_at) {
        const verificationReference = createVerificationReference();
        const pendingUser = await prisma.user.update({
          where: { id: existingUser.id },
          data: { token_verification_id: verificationReference },
        });
        const emailChallenge = emailVerificationPolicy.canSendOtp
          ? await sendEmailVerificationChallenge(pendingUser, "signup")
          : { sent: false, previewCode: null };
        const phoneChallenge = phoneVerificationEnabled
          ? await sendPhoneVerificationChallenge(pendingUser, "signup")
          : { sent: false, previewCode: null };

        return registrationResponse({
          verificationReference,
          email,
          phone: phoneVerificationEnabled ? pendingUser.phone || null : null,
          emailPreviewCode: emailChallenge.previewCode,
          phonePreviewCode: phoneChallenge.previewCode,
        });
      }

      return registrationResponse({
        verificationReference: createVerificationReference(),
        email,
        phone,
      });
    }

    const password_hash = await hashPassword(password);
    const verificationReference = createVerificationReference();

    const createdUser = await prisma.user.create({
      data: {
        email,
        password_hash,
        first_name,
        last_name,
        phone,
        phone_verification_required: Boolean(phoneVerificationEnabled && phone),
        role,
        is_club_creator: shouldCreateClub,
        organization_name: shouldCreateClub ? organization_name : null,
        token_verification_id: verificationReference,
        user_metadata: {
          firstName: first_name || undefined,
          lastName: last_name || undefined,
          name:
            String(userData.name || "").trim() ||
            [first_name, last_name].filter(Boolean).join(" ").trim() ||
            undefined,
          phone: phone || undefined,
          accessCode: userData.accessCode || undefined,
          role,
          createClub: shouldCreateClub,
          organizationName: shouldCreateClub ? organization_name : undefined,
          isClubCreator: shouldCreateClub,
        },
      },
    });

    const emailChallenge = emailVerificationPolicy.canSendOtp
      ? await sendEmailVerificationChallenge(createdUser, "signup")
      : { sent: false, previewCode: null };
    const phoneChallenge = phoneVerificationEnabled
      ? await sendPhoneVerificationChallenge(createdUser, "signup")
      : { sent: false, previewCode: null };

    return registrationResponse({
      verificationReference,
      email,
      phone,
      emailPreviewCode: emailChallenge.previewCode,
      phonePreviewCode: phoneChallenge.previewCode,
    });
  } catch (error: any) {
    if (error instanceof EmailDeliveryError) {
      return NextResponse.json(
        {
          data: { user: null, session: null },
          error: {
            message: getEmailErrorMessage(error.code),
            code: error.code,
          },
        },
        { status: 503 },
      );
    }
    console.error("Registration error:", error);
    return NextResponse.json(
      {
        data: { user: null, session: null },
        error: {
          message: "Errore durante la registrazione",
        },
      },
      { status: 500 },
    );
  }
}
