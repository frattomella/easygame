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
  signature: string;
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

/** Quanti atleti per richiesta: lo stesso tetto del server (`MAX_ATHLETES_PER_REQUEST`). */
export const MEMBERSHIP_CHUNK = 200;

/**
 * L'applicazione va a richieste da `MEMBERSHIP_CHUNK` atleti con lo stesso
 * `batchId` (revisione ostile D1): una funzione serverless non tiene
 * duemila atleti in un colpo. Se una richiesta cade, le precedenti sono
 * scritte e il rapporto lo dice: gli atleti non tentati escono
 * `not_attempted` con il motivo, mai «riuscito» a meta.
 */
export const applyMembershipChange = async (
  athleteIds: string[],
  command: MembershipChangeCommandInput,
  batchId?: string | null,
  expected?: Record<string, string> | null,
) => {
  const ids = Array.from(new Set(athleteIds));
  const rapporti: MembershipChangeReport[] = [];
  let fermato: string | null = null;
  for (let inizio = 0; inizio < ids.length; inizio += MEMBERSHIP_CHUNK) {
    const lotto = ids.slice(inizio, inizio + MEMBERSHIP_CHUNK);
    if (fermato) {
      rapporti.push({
        batchId: batchId || "",
        mode: "apply",
        target: rapporti[0]?.target || null,
        totals: { athletes: lotto.length, updated: 0, unchanged: 0, blocked: 0, newPrimaries: 0, promoted: 0, added: 0, removedMemberships: 0, keptAsSecondary: 0, keptSecondaries: 0, warnings: 0, failed: 0, notAttempted: lotto.length },
        athletes: lotto.map((athleteId) => ({ athleteId, name: "", before: [], after: [], status: "not_attempted", signature: "", warnings: [], summary: { primaryChanged: false, promoted: false, added: false, removed: 0, keptAsSecondary: false, keptSecondaries: 0 }, error: fermato || undefined })),
      });
      continue;
    }
    try {
      const response = await apiRequest<MembershipChangeReport>("/api/v1/athletes/memberships", {
        method: "POST",
        body: {
          data: {
            mode: "apply",
            athleteIds: lotto,
            command,
            batchId: batchId || undefined,
            expected: expected ? Object.fromEntries(lotto.filter((id) => expected[id]).map((id) => [id, expected[id]])) : undefined,
          },
        },
      });
      rapporti.push(unwrap(response, "Impossibile applicare il cambio di categoria"));
    } catch (error: any) {
      if (!rapporti.length) throw error;
      fermato = String(error?.message || "richiesta non riuscita");
      inizio -= MEMBERSHIP_CHUNK;
    }
  }
  return fondi(rapporti, batchId || null);
};

const fondi = (rapporti: MembershipChangeReport[], batchId: string | null): MembershipChangeReport => {
  if (rapporti.length === 1) return rapporti[0];
  const totals = rapporti.reduce(
    (acc, r) => {
      for (const k of Object.keys(acc) as Array<keyof MembershipChangeReport["totals"]>) acc[k] += r.totals[k] || 0;
      return acc;
    },
    { athletes: 0, updated: 0, unchanged: 0, blocked: 0, newPrimaries: 0, promoted: 0, added: 0, removedMemberships: 0, keptAsSecondary: 0, keptSecondaries: 0, warnings: 0, failed: 0, notAttempted: 0 },
  );
  return {
    batchId: rapporti[0]?.batchId || batchId || "",
    mode: "apply",
    target: rapporti[0]?.target || null,
    totals,
    athletes: rapporti.flatMap((r) => r.athletes),
  };
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

export type SavedMembershipSet = {
  rows: SavedMembershipRow[];
  changed: boolean;
  /** La proiezione come l'ha scritta il writer, nella stessa transazione delle righe. */
  athlete: { category_id: string | null; category_name: string | null; data: Record<string, unknown> };
};

export const replaceAthleteMembershipsOnServer = async (
  athleteId: string,
  memberships: readonly MembershipRowInput[],
  /** Le righe lette prima della modifica: un archivio cambiato nel frattempo risponde 409, non sovrascrive. */
  expectedRowIds?: readonly string[] | null,
) => {
  const response = await apiRequest<SavedMembershipSet>(
    `/api/v1/athletes/${encodeURIComponent(athleteId)}/memberships`,
    { method: "PUT", body: { data: { memberships, ...(expectedRowIds ? { expectedRowIds } : {}) } } },
  );
  return unwrap(response, "Impossibile salvare le categorie dell'atleta");
};
