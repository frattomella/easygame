/**
 * **Quanti club puo fondare un account** (ADR-0201).
 *
 * `user_metadata.clubSlotLimit` lo assegna la piattaforma: un numero positivo
 * e un tetto, qualunque altra cosa (assente, zero, testo) e «nessun limite».
 * L'area account lo mostra e il server lo fa valere su `POST /api/v1/clubs`:
 * leggono questa funzione tutti e due, cosi le due risposte non divergono.
 *
 * La chiave e fra quelle che la persona non scrive su se stessa
 * (`user-metadata-policy.ts`): un tetto che si alza da soli non e un tetto.
 *
 * Modulo puro: nessun Prisma, nessuna rete.
 */
export const resolveClubSlotLimit = (metadata: unknown): number | null => {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }
  const raw = Number((metadata as Record<string, unknown>).clubSlotLimit);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : null;
};

/** `true` se con `ownedCount` club gia fondati se ne puo fondare un altro. */
export const hasClubSlotAvailable = (limit: number | null, ownedCount: number) =>
  limit === null || ownedCount < limit;

export const CLUB_SLOTS_EXHAUSTED_MESSAGE =
  "Accesso negato: hai esaurito gli slot disponibili per i club";
