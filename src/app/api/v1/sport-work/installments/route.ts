import { ok, sportWorkRoute } from "@/lib/server/sport-work-route";
import { listInstallments } from "@/lib/server/sport-work";

/**
 * Le scadenze compenso del club.
 *
 *   GET /api/v1/sport-work/installments?status=OVERDUE&due_before=2026-12-31
 */
export const runtime = "nodejs";

export const GET = sportWorkRoute("sport_work.read", async ({ url, scope }) =>
  ok(
    await listInstallments(
      {
        organizationId: url.searchParams.get("organization_id"),
        relationshipId: url.searchParams.get("relationship_id"),
        status: url.searchParams.get("status"),
        dueBefore: url.searchParams.get("due_before"),
      },
      scope,
    ),
  ),
);
