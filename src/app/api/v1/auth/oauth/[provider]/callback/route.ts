import { NextResponse } from "next/server";
import { attachSessionCookie } from "@/lib/server/auth";
import {
  buildOAuthStateCookieName,
  createSessionForOAuthUser,
  exchangeOAuthCode,
  findOrCreateOAuthUser,
} from "@/lib/server/auth-workflows";

type Context = {
  params: {
    provider: string;
  };
};

export async function GET(request: Request, context: Context) {
  try {
    const { provider } = context.params;
    const url = new URL(request.url);
    const state = url.searchParams.get("state");
    const code = url.searchParams.get("code");
    const error = url.searchParams.get("error");

    if (error) {
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/login?oauthError=${encodeURIComponent(error)}`,
      );
    }

    if (!state || !code) {
      throw new Error("Callback OAuth incompleta");
    }

    const expectedState = request.headers
      .get("cookie")
      ?.split(";")
      .map((part) => part.trim())
      .find((part) =>
        part.startsWith(`${buildOAuthStateCookieName(provider)}=`),
      )
      ?.split("=")[1];

    if (!expectedState || expectedState !== state) {
      throw new Error("State OAuth non valido");
    }

    const profile = await exchangeOAuthCode({
      providerId: provider,
      code,
    });

    const user = await findOrCreateOAuthUser({
      providerId: provider,
      providerAccountId: profile.providerAccountId,
      email: profile.email,
      firstName: profile.firstName,
      lastName: profile.lastName,
      displayName: profile.displayName,
      avatarUrl: profile.avatarUrl,
      raw: profile.raw,
    });

    const session = await createSessionForOAuthUser(user.id);
    const response = NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/auth/complete`,
    );
    attachSessionCookie(response, session);
    response.cookies.set(buildOAuthStateCookieName(provider), "", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 0,
    });
    return response;
  } catch (error: any) {
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/login?oauthError=${encodeURIComponent(
        error?.message || "OAuth error",
      )}`,
    );
  }
}
