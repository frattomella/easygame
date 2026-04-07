import { NextResponse } from "next/server";
import { prisma } from "@/lib/server/prisma";
import { requirePlatformAdmin } from "@/lib/server/auth";

type Context = {
  params: {
    id: string;
  };
};

export async function DELETE(request: Request, context: Context) {
  const session = await requirePlatformAdmin(request);
  if (!session) {
    return NextResponse.json(
      {
        data: null,
        error: { message: "Accesso riservato all'amministratore piattaforma" },
      },
      { status: 403 },
    );
  }

  try {
    const deletedUser = await prisma.user.delete({
      where: { id: context.params.id },
      select: {
        id: true,
        email: true,
      },
    });

    return NextResponse.json({
      data: deletedUser,
      error: null,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        data: null,
        error: { message: error?.message || "Errore eliminazione account" },
      },
      { status: 400 },
    );
  }
}
