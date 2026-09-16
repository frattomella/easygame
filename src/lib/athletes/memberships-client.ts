import { apiRequest } from "@/lib/api/client";

/**
 * Il trasporto client delle appartenenze (ADR-0194): le rotte
 * `/api/v1/athletes/memberships` (blocco: anteprima e applicazione) e
 * `/api/v1/athletes/:id/memberships` (una scheda: insieme intero o un
 * comando). Nessun `fetch` diretto dai componenti (CLAUDE.md §2), e nessuna
 * logica di dominio qui: il piano lo calcola il server, l'anteprima e cio
 * che il server risponde.
 */

export type MembershipRole = "primary" | "secondary";

export type MembershipChangeCommandInput =
  | {
      kind: "assign";
      targetId?: string;
      categoryId?: string;
      siteId?: string;
      role: MembershipRole;
      previousPrimaryPolicy?: "remove" | "keep_as_secondary";
      otherSecondariesPolicy?: "keep" | "remove";
    }
  | { kind: "remove"; categoryId: string };

export type MembershipReportRow = {
  categoryId: string;
  label: string;
  isPrimary: boolean;
  siteId: string;
  siteName: string;
};

export type MembershipChangeAthleteReport = {
  athleteId: string;
  name: string;
  before: MembershipReportRow[];
  after: MembershipReportRow[];
  status: "updated" | "unchanged" | "blocked" | "failed" | "not_attempted" | "planned";
  warnings: string[];
  summary: {
    primaryChanged: boolean;
    promoted: boolean;
    added: boolean;
    removed: number;
    keptAsSecondary: boolean;
    keptSecondaries: number;
  };
  error?: string;
};

export type MembershipChangeReport = {
  batchId: string;
  mode: "preview" | "apply";
  target: { id: string; label: string; categoryId: string; siteId: string; siteName: string } | null;
  totals: {
    athletes: number;
    updated: number;
    unchanged: number;
    blocked: number;
    newPrimaries: number;
    promoted: number;
    added: number;
    removedMemberships: number;
    keptAsSecondary: number;
    keptSecondaries: number;
    warnings: number;
    failed: number;
    notAttempted: number;
  };
  athletes: MembershipChangeAthleteReport[];
};

const unwrap = <T>(response: { data: T | null; error: { message?: string } | null }, fallback: string): T => {
  if (response.error) throw new Error(response.error.message || fallback);
  if (response.data === null || response.data === undefined) throw new Error(fallback);
  return response.data;
};

export const previewMembershipChange = async (athleteIds: string[], command: MembershipChangeCommandInput) => {
  const response = await apiRequest<MembershipChangeReport>("/api/v1/athletes/memberships", {
    method: "POST",
    body: { data: { mode: "preview", athleteIds, command } },
  });
  return unwrap(response, "Impossibile calcolare l'anteprima del cambio di categoria");
};

export const applyMembershipChange = async (
  athleteIds: string[],
  command: MembershipChangeCommandInput,
  batchId?: string | null,
) => {
  const response = await apiRequest<MembershipChangeReport>("/api/v1/athletes/memberships", {
    method: "POST",
    body: { data: { mode: "apply", athleteIds, command, batchId: batchId || undefined } },
  });
  return unwrap(response, "Impossibile applicare il cambio di categoria");
};

export const applyAthleteMembershipCommand = async (athleteId: string, command: MembershipChangeCommandInput) => {
  const response = await apiRequest<MembershipChangeReport>(
    `/api/v1/athletes/${encodeURIComponent(athleteId)}/memberships`,
    { method: "POST", body: { data: { command } } },
  );
  return unwrap(response, "Impossibile cambiare la categoria");
};

/** La riga come la manda la scheda: chiavi camel o snake, entrambe lette dal server. */
export type MembershipRowInput = {
  categoryId?: unknown;
  category_id?: unknown;
  categoryName?: unknown;
  category_name?: unknown;
  storedCategoryName?: unknown;
  stored_category_name?: unknown;
  isPrimary?: unknown;
  is_primary?: unknown;
  siteId?: unknown;
  site_id?: unknown;
};

export type SavedMembershipRow = {
  id: string;
  category_id: string;
  category_name: string | null;
  is_primary: boolean;
  site_id: string | null;
};

export const replaceAthleteMembershipsOnServer = async (athleteId: string, memberships: readonly MembershipRowInput[]) => {
  const response = await apiRequest<{ rows: SavedMembershipRow[]; changed: boolean }>(
    `/api/v1/athletes/${encodeURIComponent(athleteId)}/memberships`,
    { method: "PUT", body: { data: { memberships } } },
  );
  return unwrap(response, "Impossibile salvare le categorie dell'atleta");
};
