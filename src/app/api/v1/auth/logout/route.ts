import { NextResponse } from "next/server";
import {
  clearSessionCookie,
  deleteSessionToken,
  readAuthToken,
} from "@/lib/server/auth";

export async function POST(request: Request) {
  const token = readAuthToken(request);
  await deleteSessionToken(token);

  const response = NextResponse.json({
    error: null,
  });
  clearSessionCookie(response);
  return response;
}
