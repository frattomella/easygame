import { apiRequest } from "@/lib/api/client";
import type { AthleteImportRequest } from "@/lib/athletes/import/plan";

/**
 * Il trasporto client dell'import da file (ADR-0195): una rotta,
 * `POST /api/v1/athletes/import`, per scaglioni di 200 righe con lo stesso
 * `batchId`. Nessun `fetch` diretto dai componenti, nessuna logica di
 * dominio qui: il piano e del modulo puro, la scrittura e del server.
 */

export type ImportRowOutcome = {
  sourceRowNumber: number;
  status: "created" | "linked" | "already_written" | "failed" | "rejected" | "not_attempted";
  athleteId: string | null;
  membership: "written" | "kept_existing" | "none" | "failed";
  reason?: string;
};

export type ImportCategoryOutcome = {
  key: string;
  id: string;
  name: string;
  siteId: string;
  status: "created" | "reused" | "rejected";
  reason?: string;
};

export type AthleteImportResult = {
  batchId: string;
  rows: ImportRowOutcome[];
  categories: ImportCategoryOutcome[];
  totals: {
    requested: number;
    created: number;
    linked: number;
    alreadyWritten: number;
    failed: number;
    rejected: number;
    notAttempted: number;
    membershipsWritten: number;
    categoriesCreated: number;
  };
};

export type ImportPermissions = {
  canImport: boolean;
  canLink: boolean;
  canCreateCategories: boolean;
  canAssignSites: boolean;
};

export const IMPORT_CHUNK = 200;

const unwrap = <T>(response: { data: T | null; error: { message?: string } | null }, fallback: string): T => {
  if (response.error) throw new Error(response.error.message || fallback);
  if (response.data === null || response.data === undefined) throw new Error(fallback);
  return response.data;
};

export const fetchImportPermissions = async (): Promise<ImportPermissions> => {
  const response = await apiRequest<ImportPermissions>("/api/v1/athletes/import", { method: "GET" });
  return unwrap(response, "Permessi di import non leggibili");
};

/**
 * Applica il lotto a scaglioni. Uno scaglione che non arriva al server non
 * ferma quelli gia scritti: le righe restanti tornano `not_attempted` con
 * il motivo, e riprovare con lo stesso `batchId` non crea doppioni.
 */
export const applyAthleteImportBatch = async (
  request: AthleteImportRequest,
  handlers: { onProgress?: (done: number, total: number) => void } = {},
): Promise<AthleteImportResult> => {
  const rows: ImportRowOutcome[] = [];
  const categories = new Map<string, ImportCategoryOutcome>();
  let fermato: string | null = null;
  const total = request.rows.length;
  for (let start = 0; start < total; start += IMPORT_CHUNK) {
    const scaglione = request.rows.slice(start, start + IMPORT_CHUNK);
    if (fermato) {
      rows.push(...scaglione.map((row) => ({ sourceRowNumber: row.sourceRowNumber, status: "not_attempted" as const, athleteId: null, membership: "none" as const, reason: fermato || undefined })));
      continue;
    }
    try {
      const response = await apiRequest<AthleteImportResult>("/api/v1/athletes/import", {
        method: "POST",
        body: { batchId: request.batchId, categoriesToCreate: request.categoriesToCreate, rows: scaglione },
      });
      const esito = unwrap(response, "Import non riuscito");
      rows.push(...esito.rows);
      for (const categoria of esito.categories) {
        const nota = categories.get(categoria.key);
        if (!nota || nota.status === "rejected" || categoria.status === "created") categories.set(categoria.key, categoria);
      }
    } catch (error: any) {
      fermato = String(error?.message || "richiesta non riuscita");
      rows.push(...scaglione.map((row) => ({ sourceRowNumber: row.sourceRowNumber, status: "not_attempted" as const, athleteId: null, membership: "none" as const, reason: fermato || undefined })));
    }
    handlers.onProgress?.(Math.min(start + scaglione.length, total), total);
  }
  const count = (status: ImportRowOutcome["status"]) => rows.filter((row) => row.status === status).length;
  return {
    batchId: request.batchId,
    rows,
    categories: Array.from(categories.values()),
    totals: {
      requested: total,
      created: count("created"),
      linked: count("linked"),
      alreadyWritten: count("already_written"),
      failed: count("failed"),
      rejected: count("rejected"),
      notAttempted: count("not_attempted"),
      membershipsWritten: rows.filter((row) => row.membership === "written").length,
      categoriesCreated: Array.from(categories.values()).filter((categoria) => categoria.status === "created").length,
    },
  };
};
