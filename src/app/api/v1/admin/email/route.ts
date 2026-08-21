import { NextResponse } from "next/server";
import { smtpConfigurationInputSchema } from "@/lib/email/smtp-config";
import { requirePlatformAdmin } from "@/lib/server/auth";
import {
  EmailDeliveryError,
  getEmailErrorMessage,
  getPublicSmtpConfiguration,
  saveSmtpConfiguration,
} from "@/lib/server/email/email-service";

const forbiddenResponse = () =>
  NextResponse.json(
    {
      data: null,
      error: { message: "Accesso riservato all'amministratore piattaforma" },
    },
    { status: 403 },
  );

export async function GET(request: Request) {
  const session = await requirePlatformAdmin(request);
  if (!session) return forbiddenResponse();

  return NextResponse.json({
    data: await getPublicSmtpConfiguration(),
    error: null,
  });
}

export async function PUT(request: Request) {
  const session = await requirePlatformAdmin(request);
  if (!session) return forbiddenResponse();

  try {
    const parsed = smtpConfigurationInputSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message:
              parsed.error.issues[0]?.message ||
              "Configurazione SMTP non valida",
            code: "SMTP_VALIDATION_FAILED",
          },
        },
        { status: 400 },
      );
    }

    const saved = await saveSmtpConfiguration(parsed.data, session.db.user_id);
    return NextResponse.json({ data: saved, error: null });
  } catch (error) {
    const code =
      error instanceof EmailDeliveryError
        ? error.code
        : "SMTP_CONFIGURATION_INVALID";
    return NextResponse.json(
      {
        data: null,
        error: { message: getEmailErrorMessage(code), code },
      },
      { status: 400 },
    );
  }
}
