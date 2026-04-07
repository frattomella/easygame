import { NextResponse } from "next/server";
import { getAuthCapabilities } from "@/lib/server/auth-workflows";

export async function GET() {
  return NextResponse.json({
    data: getAuthCapabilities(),
    error: null,
  });
}
