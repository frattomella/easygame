import { NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/server/auth";

export async function GET(request: Request) {
  const session = await getSessionFromRequest(request);

  return NextResponse.json({
    data: {
      session: session?.payload || null,
    },
    error: null,
  });
}
