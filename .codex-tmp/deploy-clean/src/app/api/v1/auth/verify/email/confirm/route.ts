import { NextResponse } from "next/server";
import { attachSessionCookie, serializeAuthUser } from "@/lib/server/auth";
import {
  buildPendingVerificationResponse,
  confirmEmailVerification,
  finalizeVerifiedSession,
} from "@/lib/server/auth-workflows";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const userId = String(body?.userId || "").trim();
    const code = String(body?.code || "").trim();

    if (!userId || !code) {
      return NextResponse.json(
        {
          data: null,
          error: { message: "userId e codice sono obbligatori" },
        },
        { status: 400 },
      );
    }

    await confirmEmailVerification(userId, code);
    const finalized = await finalizeVerifiedSession(userId);

    if (!finalized.session) {
      const pending = await buildPendingVerificationResponse(userId);
      return NextResponse.json({
        data: {
          user: serializeAuthUser(pending.user),
          session: null,
          verification: pending.verification,
        },
        error: null,
      });
    }

    const response = NextResponse.json({
      data: {
        user: finalized.session.user,
        session: finalized.session,
        verification: finalized.verification,
      },
      error: null,
    });

    attachSessionCookie(response, finalized.session);
    return response;
  } catch (error: any) {
    return NextResponse.json(
      {
        data: null,
        error: { message: error?.message || "Errore verifica email" },
      },
      { status: 400 },
    );
  }
}
