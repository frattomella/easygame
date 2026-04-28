import { NextResponse } from "next/server";
import { prisma } from "@/lib/server/prisma";
import { requireAuthenticatedUser } from "@/lib/server/auth";

export async function POST(request: Request) {
  try {
    const session = await requireAuthenticatedUser(request);
    if (!session) {
      return NextResponse.json(
        {
          data: null,
          error: { message: "Sessione non valida" },
        },
        { status: 401 },
      );
    }

    const body = await request.json().catch(() => ({}));
    const organizationId = String(
      body?.organization_id || body?.club_id || "",
    ).trim();

    if (!organizationId) {
      return NextResponse.json(
        {
          data: null,
          error: { message: "Club da attivare non specificato" },
        },
        { status: 400 },
      );
    }

    const membership = await prisma.organizationUser.findUnique({
      where: {
        organization_id_user_id: {
          organization_id: organizationId,
          user_id: session.db.user_id,
        },
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
          },
        },
      },
    });

    if (!membership) {
      return NextResponse.json(
        {
          data: null,
          error: { message: "Non hai accesso a questo club" },
        },
        { status: 403 },
      );
    }

    await prisma.organizationUser.updateMany({
      where: {
        user_id: session.db.user_id,
        is_primary: true,
      },
      data: {
        is_primary: false,
      },
    });

    const updatedMembership = await prisma.organizationUser.update({
      where: {
        organization_id_user_id: {
          organization_id: organizationId,
          user_id: session.db.user_id,
        },
      },
      data: {
        is_primary: true,
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
          },
        },
      },
    });

    return NextResponse.json({
      data: {
        ...updatedMembership,
        organizations: updatedMembership.organization,
      },
      error: null,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        data: null,
        error: { message: error?.message || "Errore attivazione club" },
      },
      { status: 500 },
    );
  }
}
