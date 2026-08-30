import { NextResponse } from "next/server";
import { isPhoneVerificationEnabled } from "@/lib/auth/provider-policy";
import { prisma } from "@/lib/server/prisma";
import {
  buildSessionPayload,
  getSessionFromRequest,
  hashPassword,
} from "@/lib/server/auth";
import {
  getPasswordPolicyMessage,
  validatePassword,
} from "@/lib/auth/password-policy";

export async function GET(request: Request) {
  const session = await getSessionFromRequest(request);

  return NextResponse.json({
    data: {
      user: session?.payload.user || null,
    },
    error: null,
  });
}

export async function PATCH(request: Request) {
  try {
    const session = await getSessionFromRequest(request);
    if (!session) {
      return NextResponse.json(
        {
          data: { user: null },
          error: { message: "Sessione non valida" },
        },
        { status: 401 },
      );
    }

    const body = await request.json();
    const email =
      body?.email !== undefined
        ? String(body.email || "")
            .trim()
            .toLowerCase()
        : undefined;
    /*
      **Le chiavi che il soggetto di un dato non puo scrivere su se stesso.**

      `user_metadata` e una colonna JSON libera, e va bene che lo sia: e il
      posto dove una persona tiene le sue preferenze. Ma da qui si scriveva
      **qualunque** chiave, e `isPlatformAdminUser` ne leggeva una: `role`.
      Da un account qualunque — un genitore, un atleta, uno appena registrato
      e senza club — bastava
      `{"user_metadata":{"role":"platform_admin"}}` per diventare
      amministratore della piattaforma alla richiesta successiva.

      Il controllo di `platform-admin.ts` non legge piu quel campo, e questa
      lista e la seconda meta della stessa correzione: due difese per lo stesso
      privilegio, perche una sola prima o poi si dimentica.
    */
    const CHIAVI_NON_SCRIVIBILI = ["role", "app_metadata", "is_platform_admin"];

    const metadataGrezzo =
      (typeof body?.data === "object" && body.data) ||
      (typeof body?.user_metadata === "object" && body.user_metadata) ||
      {};

    const metadata = Object.fromEntries(
      Object.entries(metadataGrezzo).filter(
        ([chiave]) => !CHIAVI_NON_SCRIVIBILI.includes(chiave),
      ),
    ) as Record<string, any>;
    const phone =
      metadata.phone !== undefined
        ? String(metadata.phone || "").trim()
        : undefined;

    if (email !== undefined && !email) {
      return NextResponse.json(
        {
          data: { user: null },
          error: { message: "Email obbligatoria" },
        },
        { status: 400 },
      );
    }

    const requestedPassword =
      body?.password !== undefined ? String(body.password) : undefined;
    if (requestedPassword !== undefined) {
      const passwordPolicy = validatePassword(
        requestedPassword,
        email || session.db.user.email,
      );
      if (!passwordPolicy.valid) {
        return NextResponse.json(
          {
            data: { user: null },
            error: {
              message: getPasswordPolicyMessage(passwordPolicy),
              code: "WEAK_PASSWORD",
            },
          },
          { status: 400 },
        );
      }
    }

    if (email && email !== session.db.user.email) {
      const existingUser = await prisma.user.findUnique({
        where: { email },
      });

      if (existingUser && existingUser.id !== session.db.user_id) {
        return NextResponse.json(
          {
            data: { user: null },
            error: { message: "Email gia in uso" },
          },
          { status: 409 },
        );
      }
    }

    const emailChanged = email !== undefined && email !== session.db.user.email;
    const phoneChanged =
      phone !== undefined && phone !== String(session.db.user.phone || "");

    const updated = await prisma.user.update({
      where: { id: session.db.user_id },
      data: {
        email: emailChanged ? email : undefined,
        password_hash: requestedPassword
          ? await hashPassword(requestedPassword)
          : undefined,
        first_name:
          metadata.firstName !== undefined
            ? String(metadata.firstName || "")
            : undefined,
        last_name:
          metadata.lastName !== undefined
            ? String(metadata.lastName || "")
            : undefined,
        phone: phone !== undefined ? phone || null : undefined,
        email_verified_at: emailChanged ? null : undefined,
        phone_verified_at: phoneChanged ? null : undefined,
        phone_verification_required:
          phone !== undefined
            ? Boolean(phone) && isPhoneVerificationEnabled()
            : undefined,
        organization_name:
          metadata.organizationName !== undefined
            ? metadata.organizationName || null
            : undefined,
        user_metadata: {
          ...(typeof session.db.user.user_metadata === "object" &&
          session.db.user.user_metadata
            ? session.db.user.user_metadata
            : {}),
          ...metadata,
        },
      },
    });

    return NextResponse.json({
      data: {
        user: buildSessionPayload(
          updated,
          session.payload.access_token,
          session.db.expires_at,
        ).user,
      },
      error: null,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        data: { user: null },
        error: { message: error?.message || "Errore aggiornamento utente" },
      },
      { status: 500 },
    );
  }
}
