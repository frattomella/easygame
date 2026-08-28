import { ok, sportWorkRoute } from "@/lib/server/sport-work-route";
import { syncObligations } from "@/lib/server/sport-work-agenda";

/**
 * Riallinea l'agenda con cio che rapporti ed erogazioni richiedono.
 *
 *   POST /api/v1/sport-work/obligations/sync
 *
 * **Idempotente.** Ogni adempimento derivato porta una chiave deterministica:
 * la seconda esecuzione aggiorna invece di duplicare. Senza, dopo una settimana
 * di esecuzioni notturne ci sarebbero sette promemoria identici per la stessa
 * scadenza, e chi li riceve smette di leggerli.
 */
export const runtime = "nodejs";

export const POST = sportWorkRoute(
  "sport_work.manage",
  async ({ scope }) =>
    ok(await syncObligations(String(scope.activeOrganizationId || ""), scope)),
  "Sincronizzazione dell'agenda non riuscita",
);
