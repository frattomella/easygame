import { NextResponse } from "next/server";
import { API_REGISTRY } from "@/lib/api/registry";

export async function GET() {
  return NextResponse.json({
    data: API_REGISTRY,
    error: null,
  });
}
