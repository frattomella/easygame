import { NextResponse } from "next/server";
import { imapConfigurationInputSchema } from "@/lib/email/imap-config";
import { requirePlatformAdmin } from "@/lib/server/auth";
import {
  getImapErrorMessage,
  getPublicImapConfiguration,
  saveImapConfiguration,
  toImapErrorCode,
} from "@/lib/server/email/imap-service";

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
    data: await getPublicImapConfiguration(),
    error: null,
  });
}

export async function PUT(request: Request) {
  const session = await requirePlatformAdmin(request);
  if (!session) return forbiddenResponse();

  try {
    const parsed = imapConfigurationInputSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message:
              parsed.error.issues[0]?.message || "Configurazione IMAP non valida",
            code: "IMAP_VALIDATION_FAILED",
          },
        },
        { status: 400 },
      );
    }

    const saved = await saveImapConfiguration(parsed.data, session.db.user_id);
    return NextResponse.json({ data: saved, error: null });
  } catch (error) {
    const code = toImapErrorCode(error);
    return NextResponse.json(
      { data: null, error: { message: getImapErrorMessage(code), code } },
      { status: 400 },
    );
  }
}
