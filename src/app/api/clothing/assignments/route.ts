import { NextResponse } from "next/server";
import { canAccessClubResource } from "@/lib/access-roles";
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
import { replaceClubResourceCollections } from "@/lib/server/resources";

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

    /*
      **Questa rotta non chiedeva nessun ruolo.**

      Sessione, club attivo, «l'atleta e di questo club», e poi scriveva. Una
      revisione ostile l'ha chiamata con un account che nel club e soltanto
      **genitore**, sull'atleta di un'altra famiglia: 200, assegnazione creata,
      scorte consumate.

      E una rotta sotto `/api/` e non `/api/v1/`, cioe la stessa classe di
      difetto gia trovata due volte: la ricognizione delle guardie si era
      fermata al prefisso versionato. Il magazzino e una risorsa di club, e la
      matrice sa gia chi lo tocca.
    */
    if (!canAccessClubResource(scope.activeRole, "kit_assignments", "create")) {
      return NextResponse.json(
        {
          data: null,
          error: {
            message:
              "Accesso negato: l'assegnazione del materiale la registra chi lavora nel club",
          },
        },
        { status: 403 },
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

    /*
      Le tre collezioni passano da `resources.ts`, non da `prisma.club.update`.

      Scrivendo le colonne JSON con Prisma diretto, `club_resource_items`
      restava alla versione precedente: le pagine dell'abbigliamento leggono
      il JSON e non se ne accorgevano, ma il CRUD generico
      (`/api/v1/kit_assignments`) serviva dati vecchi, e il disallineamento
      cresceva a ogni assegnazione. E la trappola numero 3 di CLAUDE.md.

      Una sola transazione per tutte e tre: magazzino, assegnazioni e numeri
      di maglia cambiano insieme o non cambiano.
    */
    await replaceClubResourceCollections(organizationId, [
      {
        resource_type: "clothing_inventory",
        items: result.inventory.map(serializeInventoryStock),
      },
      {
        resource_type: "kit_assignments",
        items: result.assignments.map(serializeClothingAssignment),
      },
      {
        resource_type: "jersey_assignments",
        items: result.jerseyAssignments.map(serializeJerseyNumberAssignment),
      },
    ]);

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
