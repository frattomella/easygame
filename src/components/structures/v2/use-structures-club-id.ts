"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/providers/AuthProvider";

/**
 * L'identificativo del club per le pagine Strutture, con l'ordine di ripiego
 * che le due pagine V1 avevano: il parametro `clubId` dell'URL (solo la
 * scheda), poi il club attivo del contesto, poi
 * `localStorage["activeClub_<userId>"]`, poi `localStorage.activeClub`.
 *
 * Si legge dopo il montaggio: `localStorage` sul server non esiste. La V1
 * ascoltava anche l'evento `storage` per seguire un cambio di club in
 * un'altra scheda del browser: qui basta il contesto, che gia lo propaga.
 */
const parseStoredClub = (raw: string | null): string | null => {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed?.id ? String(parsed.id) : null;
  } catch {
    return null;
  }
};

const readStoredClubId = (userId?: string | null): string | null => {
  if (typeof window === "undefined") return null;
  if (userId) {
    const own = parseStoredClub(localStorage.getItem(`activeClub_${userId}`));
    if (own) return own;
  }
  return parseStoredClub(localStorage.getItem("activeClub"));
};

const isValid = (value?: string | null) =>
  Boolean(value && value !== "null" && value !== "undefined" && value.trim());

export function useStructuresClubId(preferred?: string | null) {
  const { activeClub, user } = useAuth();
  const [clubId, setClubId] = useState<string | null>(isValid(preferred) ? preferred! : null);
  const [resolved, setResolved] = useState(false);

  useEffect(() => {
    if (isValid(preferred)) {
      setClubId(preferred!);
      setResolved(true);
      return;
    }
    const fromContext = (activeClub as { id?: string } | null)?.id;
    if (fromContext) {
      setClubId(String(fromContext));
      setResolved(true);
      return;
    }
    setClubId(readStoredClubId(user?.id ? String(user.id) : null));
    setResolved(true);
  }, [preferred, activeClub, user?.id]);

  return { clubId, resolved };
}
