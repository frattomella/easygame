import { NextResponse } from "next/server";
import {
  clearSessionCookie,
  getSessionFromRequest,
  readAuthToken,
} from "@/lib/server/auth";

export async function GET(request: Request) {
  const token = readAuthToken(request);
  const session = await getSessionFromRequest(request);

  const response = NextResponse.json({
    data: {
      session: session?.payload || null,
    },
    error: null,
  });

  if (token && !session) {
    clearSessionCookie(response);
  }

  return response;
}
