import { NextResponse } from "next/server";
import { prisma } from "@/lib/server/prisma";
import { sendEmailVerificationChallenge } from "@/lib/server/auth-workflows";

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

    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return NextResponse.json(
        {
          data: null,
          error: { message: "Utente non trovato" },
        },
        { status: 404 },
      );
    }

    const challenge = await sendEmailVerificationChallenge(user, "verify_email");
    return NextResponse.json({
      data: {
        sent: challenge.sent,
        previewCode: challenge.previewCode,
      },
      error: null,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        data: null,
        error: { message: error?.message || "Errore invio verifica email" },
      },
      { status: 500 },
    );
  }
}
