import { NextResponse } from "next/server";
import {
  findUserByVerificationReference,
  sendPhoneVerificationChallenge,
} from "@/lib/server/auth-workflows";
import {
  AUTH_RATE_LIMITS,
  consumeRequestRateLimits,
  getRequestIp,
  rateLimitHeaders,
} from "@/lib/server/auth-rate-limit";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const userId = String(body?.userId || "").trim();

    if (!userId) {
      return NextResponse.json(
        {
          data: null,
          error: { message: "userId obbligatorio" },
        },
        { status: 400 },
      );
    }

    const rateLimit = await consumeRequestRateLimits([
      {
        policy: AUTH_RATE_LIMITS.otpSend,
        identifier: `phone:${userId}:${getRequestIp(request)}`,
      },
    ]);
    if (rateLimit) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message: "Troppi reinvii. Riprova più tardi.",
            code: "RATE_LIMITED",
          },
        },
        { status: 429, headers: rateLimitHeaders(rateLimit) },
      );
    }

    const user = await findUserByVerificationReference(userId);

    if (!user || !user.phone || user.phone_verified_at) {
      return NextResponse.json({
        data: { sent: true, previewCode: null },
        error: null,
      });
    }

    const challenge = await sendPhoneVerificationChallenge(user, "verify_phone");
    return NextResponse.json({
      data: {
        sent: true,
        previewCode: challenge.previewCode,
      },
      error: null,
    });
  } catch (error: any) {
    console.error("Phone verification resend error:", error);
    return NextResponse.json(
      {
        data: null,
        error: { message: "Errore invio verifica telefono" },
      },
      { status: 500 },
    );
  }
}
