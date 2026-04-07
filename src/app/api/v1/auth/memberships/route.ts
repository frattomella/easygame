import { NextResponse } from "next/server";
import { prisma } from "@/lib/server/prisma";
import { requireAuthenticatedUser } from "@/lib/server/auth";

export async function GET(request: Request) {
  try {
    const session = await requireAuthenticatedUser(request);
    if (!session) {
      return NextResponse.json(
        {
          data: [],
          error: { message: "Sessione non valida" },
        },
        { status: 401 },
      );
    }

    const memberships = await prisma.organizationUser.findMany({
      where: {
        user_id: session.db.user_id,
      },
      include: {
        organization: {
          select: {
            id: true,
            name: true,
            logo_url: true,
            creator_id: true,
            contact_email: true,
            contact_phone: true,
            city: true,
            province: true,
            created_at: true,
            settings: true,
          },
        },
      },
      orderBy: [{ is_primary: "desc" }, { created_at: "asc" }],
    });

    return NextResponse.json({
      data: memberships.map((membership) => ({
        ...membership,
        organizations: membership.organization,
      })),
      error: null,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        data: [],
        error: { message: error?.message || "Errore caricamento membership" },
      },
      { status: 500 },
    );
  }
}
