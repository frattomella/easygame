import { NextResponse } from "next/server";
import {
  createClothingAssignment,
  normalizeClubClothingState,
  serializeClothingAssignment,
  serializeInventoryStock,
  serializeJerseyNumberAssignment,
} from "@/lib/clothing-inventory-utils";
import {
  requireAuthenticatedUser,
  resolveOrganizationScopeForUser,
} from "@/lib/server/auth";
import { prisma } from "@/lib/server/prisma";

export async function POST(request: Request) {
  try {
    const session = await requireAuthenticatedUser(request);
    if (!session) {
      return NextResponse.json(
        { data: null, error: { message: "Sessione non valida" } },
        { status: 401 },
      );
    }

    const body = await request.json();
    const scope = await resolveOrganizationScopeForUser(
      session.db.user_id,
      request.headers.get("x-active-club-id") || body?.organizationId,
    );
    const organizationId = scope.activeOrganizationId;

    if (!organizationId) {
      return NextResponse.json(
        { data: null, error: { message: "Club non trovato" } },
        { status: 400 },
      );
    }

    const athleteId = String(body?.athleteId || "").trim();
    const athlete = await prisma.athlete.findFirst({
      where: {
        id: athleteId,
        organization_id: organizationId,
      },
      select: { id: true },
    });

    if (!athlete) {
      return NextResponse.json(
        { data: null, error: { message: "Atleta non appartenente al club" } },
        { status: 403 },
      );
    }

    const club = await prisma.club.findUnique({
      where: { id: organizationId },
      select: {
        clothing_products: true,
        clothing_kits: true,
        clothing_inventory: true,
        kit_assignments: true,
        jersey_groups: true,
        jersey_assignments: true,
      },
    });

    if (!club) {
      return NextResponse.json(
        { data: null, error: { message: "Club non trovato" } },
        { status: 404 },
      );
    }

    const state = normalizeClubClothingState({
      products: Array.isArray(club.clothing_products)
        ? club.clothing_products
        : [],
      kits: Array.isArray(club.clothing_kits) ? club.clothing_kits : [],
      inventory: Array.isArray(club.clothing_inventory)
        ? club.clothing_inventory
        : [],
      assignments: Array.isArray(club.kit_assignments)
        ? club.kit_assignments
        : [],
      jerseyGroups: Array.isArray(club.jersey_groups) ? club.jersey_groups : [],
      jerseyAssignments: Array.isArray(club.jersey_assignments)
        ? club.jersey_assignments
        : [],
    });

    const result = createClothingAssignment({
      request: {
        ...body,
        organizationId,
      },
      state,
    });

    await prisma.club.update({
      where: { id: organizationId },
      data: {
        clothing_inventory: result.inventory.map(serializeInventoryStock),
        kit_assignments: result.assignments.map(serializeClothingAssignment),
        jersey_assignments: result.jerseyAssignments.map(
          serializeJerseyNumberAssignment,
        ),
      },
    });

    return NextResponse.json({
      data: {
        assignment: serializeClothingAssignment(result.assignment),
        inventory: result.inventory.map(serializeInventoryStock),
        assignments: result.assignments.map(serializeClothingAssignment),
        jerseyAssignments: result.jerseyAssignments.map(
          serializeJerseyNumberAssignment,
        ),
      },
      error: null,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        data: null,
        error: {
          message: error?.message || "Errore creazione assegnazione",
        },
      },
      { status: 400 },
    );
  }
}
