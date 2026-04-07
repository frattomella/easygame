import { NextResponse } from "next/server";
import {
  buildOAuthAuthorizationUrl,
  buildOAuthStateCookieName,
  createOAuthState,
} from "@/lib/server/auth-workflows";

type Context = {
  params: {
    provider: string;
  };
};

export async function GET(_request: Request, context: Context) {
  try {
    const { provider } = context.params;
    const state = createOAuthState();
    const authorizationUrl = buildOAuthAuthorizationUrl({
      providerId: provider,
      state,
    });

    const response = NextResponse.redirect(authorizationUrl);
    response.cookies.set(buildOAuthStateCookieName(provider), state, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 10,
    });
    return response;
  } catch (error: any) {
    return NextResponse.json(
      {
        data: null,
        error: { message: error?.message || "Errore avvio OAuth" },
      },
      { status: 400 },
    );
  }
}
