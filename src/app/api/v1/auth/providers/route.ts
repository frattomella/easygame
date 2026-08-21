import { NextResponse } from "next/server";
import { getAuthCapabilities } from "@/lib/server/auth-workflows";

// SMTP can be enabled or disabled from the admin dashboard at runtime.
// Never cache these capabilities as build-time static data.
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    data: await getAuthCapabilities(),
    error: null,
  });
}
