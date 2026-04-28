import { NextResponse } from "next/server";
import { prisma } from "@/lib/server/prisma";
import { hashPassword, serializeAuthUser } from "@/lib/server/auth";
import {
  sendEmailVerificationChallenge,
  sendPhoneVerificationChallenge,
} from "@/lib/server/auth-workflows";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const email = String(body?.email || "").trim().toLowerCase();
    const password = String(body?.password || "");
    const userData =
      (typeof body?.options?.data === "object" && body.options.data) ||
      (typeof body?.userData === "object" && body.userData) ||
      {};

    if (!email || !password) {
      return NextResponse.json(
        {
          data: { user: null, session: null },
          error: { message: "Email e password sono obbligatori" },
        },
        { status: 400 },
      );
    }

    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return NextResponse.json(
        {
          data: { user: null, session: null },
          error: { message: "User already registered" },
        },
        { status: 409 },
      );
    }

    const password_hash = await hashPassword(password);
    const requestedRole = String(userData.role || "user");
    const shouldCreateClub = Boolean(body?.createClub ?? userData.createClub);
    const role = shouldCreateClub
      ? "club_creator"
      : requestedRole === "club_creator"
        ? "user"
        : requestedRole;
    const first_name = String(userData.firstName || "").trim() || null;
    const last_name = String(userData.lastName || "").trim() || null;
    const organization_name = String(
      userData.organizationName ||
        [first_name, last_name].filter(Boolean).join(" ").trim() ||
        "Nuovo Club",
    ).trim();

    const createdUser = await prisma.user.create({
      data: {
        email,
        password_hash,
        first_name,
        last_name,
        phone: userData.phone || null,
        phone_verification_required: Boolean(userData.phone),
        role,
        is_club_creator: shouldCreateClub,
        organization_name: shouldCreateClub ? organization_name : null,
        token_verification_id: `token-${Date.now()}-${Math.random()
          .toString(36)
          .slice(2, 8)}`,
        user_metadata: {
          ...userData,
          role,
          createClub: shouldCreateClub,
          organizationName: shouldCreateClub ? organization_name : undefined,
          isClubCreator: shouldCreateClub,
        },
      },
    });

    const emailChallenge = await sendEmailVerificationChallenge(
      createdUser,
      "signup",
    );
    const phoneChallenge = await sendPhoneVerificationChallenge(
      createdUser,
      "signup",
    );

    return NextResponse.json(
      {
        data: {
          user: serializeAuthUser(createdUser),
          session: null,
          verification: {
            userId: createdUser.id,
            email: createdUser.email,
            phone: createdUser.phone || null,
            emailRequired: true,
            phoneRequired: Boolean(
              createdUser.phone_verification_required && createdUser.phone,
            ),
            emailPreviewCode: emailChallenge.previewCode,
            phonePreviewCode: phoneChallenge.previewCode,
          },
        },
        error: null,
      },
      { status: 201 },
    );
  } catch (error: any) {
    return NextResponse.json(
      {
        data: { user: null, session: null },
        error: {
          message: error?.message || "Errore durante la registrazione",
        },
      },
      { status: 500 },
    );
  }
}
