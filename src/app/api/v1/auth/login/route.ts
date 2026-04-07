import { NextResponse } from "next/server";
import { prisma } from "@/lib/server/prisma";
import {
  attachSessionCookie,
  serializeAuthUser,
  verifyPassword,
} from "@/lib/server/auth";
import {
  finalizeVerifiedSession,
  sendEmailVerificationChallenge,
  sendPhoneVerificationChallenge,
} from "@/lib/server/auth-workflows";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const email = String(body?.email || "").trim().toLowerCase();
    const password = String(body?.password || "");

    if (!email || !password) {
      return NextResponse.json(
        {
          data: { user: null, session: null },
          error: { message: "Email e password sono obbligatori" },
        },
        { status: 400 },
      );
    }

    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      return NextResponse.json(
        {
          data: { user: null, session: null },
          error: { message: "Invalid login credentials" },
        },
        { status: 401 },
      );
    }

    const isValid = await verifyPassword(password, user.password_hash);
    if (!isValid) {
      return NextResponse.json(
        {
          data: { user: null, session: null },
          error: { message: "Invalid login credentials" },
        },
        { status: 401 },
      );
    }

    if (!user.email_verified_at) {
      const emailChallenge = await sendEmailVerificationChallenge(user, "login");
      return NextResponse.json(
        {
          data: {
            user: serializeAuthUser(user),
            session: null,
            verification: {
              userId: user.id,
              email: user.email,
              phone: user.phone || null,
              emailRequired: true,
              phoneRequired: Boolean(
                user.phone_verification_required && user.phone,
              ),
              emailPreviewCode: emailChallenge.previewCode,
            },
          },
          error: {
            message: "Email non verificata",
            code: "EMAIL_NOT_VERIFIED",
          },
        },
        { status: 403 },
      );
    }

    if (user.phone_verification_required && user.phone && !user.phone_verified_at) {
      const phoneChallenge = await sendPhoneVerificationChallenge(user, "login");
      return NextResponse.json(
        {
          data: {
            user: serializeAuthUser(user),
            session: null,
            verification: {
              userId: user.id,
              email: user.email,
              phone: user.phone,
              emailRequired: false,
              phoneRequired: true,
              phonePreviewCode: phoneChallenge.previewCode,
            },
          },
          error: {
            message: "Telefono non verificato",
            code: "PHONE_NOT_VERIFIED",
          },
        },
        { status: 403 },
      );
    }

    const finalized = await finalizeVerifiedSession(user.id);
    if (!finalized.session) {
      return NextResponse.json(
        {
          data: {
            user: serializeAuthUser(finalized.user),
            session: null,
            verification: finalized.verification,
          },
          error: {
            message: "Verifica account incompleta",
            code: "VERIFICATION_REQUIRED",
          },
        },
        { status: 403 },
      );
    }

    const session = finalized.session;
    const response = NextResponse.json({
      data: {
        user: session.user,
        session,
      },
      error: null,
    });

    attachSessionCookie(response, session);
    return response;
  } catch (error: any) {
    return NextResponse.json(
      {
        data: { user: null, session: null },
        error: { message: error?.message || "Errore durante il login" },
      },
      { status: 500 },
    );
  }
}
