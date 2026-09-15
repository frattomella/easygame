"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/providers/AuthProvider";

/**
 * L'identificativo del club per le pagine sponsor, con l'ordine di ripiego
 * che le due pagine V1 avevano ciascuna a modo proprio: il parametro
 * `clubId` dell'URL (la scheda accettava **solo** quello), poi il club attivo
 * del contesto, poi `localStorage.activeClub` (l'unico ripiego dell'elenco,
 * riscritto quattro volte nello stesso file).
 *
 * Si legge dopo il montaggio: `localStorage` sul server non esiste.
 * Candidato alle fondamenta: e lo stesso gancio di `use-staff-club-id.ts`.
 */
const readStoredClubId = (): string | null => {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem("activeClub");
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.id ? String(parsed.id) : null;
  } catch {
    return null;
  }
};

const isValid = (value?: string | null) =>
  Boolean(value && value !== "null" && value !== "undefined" && value.trim());

export function useSponsorClubId(preferred?: string | null) {
  const { activeClub } = useAuth();
  const [clubId, setClubId] = useState<string | null>(isValid(preferred) ? preferred! : null);
  const [resolved, setResolved] = useState(false);

  useEffect(() => {
    if (isValid(preferred)) {
      setClubId(preferred!);
      setResolved(true);
      return;
    }
    if (activeClub?.id) {
      setClubId(String(activeClub.id));
      setResolved(true);
      return;
    }
    setClubId(readStoredClubId());
    setResolved(true);
  }, [preferred, activeClub]);

  return { clubId, resolved };
}

/** `/sponsors/…?clubId=` come la V1 lo componeva, senza il parametro se manca. */
export const withClubId = (path: string, clubId?: string | null) =>
  clubId ? `${path}${path.includes("?") ? "&" : "?"}clubId=${encodeURIComponent(clubId)}` : path;
