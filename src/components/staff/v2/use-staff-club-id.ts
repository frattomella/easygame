"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/providers/AuthProvider";

/**
 * L'identificativo del club per le pagine staff, con l'ordine di ripiego che
 * le tre pagine V1 avevano ciascuna a modo proprio: il parametro `clubId`
 * dell'URL, poi il club attivo del contesto, poi `localStorage.activeClub`,
 * poi `localStorage["activeClub_<userId>"]`.
 *
 * Si legge dopo il montaggio: `localStorage` sul server non esiste.
 */
const readStoredClubId = (): string | null => {
  if (typeof window === "undefined") return null;
  const parse = (raw: string | null) => {
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      return parsed?.id ? String(parsed.id) : null;
    } catch {
      return null;
    }
  };
  const direct = parse(localStorage.getItem("activeClub"));
  if (direct) return direct;
  const userId = localStorage.getItem("userId");
  if (userId) return parse(localStorage.getItem(`activeClub_${userId}`));
  return null;
};

const isValid = (value?: string | null) =>
  Boolean(value && value !== "null" && value !== "undefined" && value.trim());

export function useStaffClubId(preferred?: string | null) {
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

/** `/staff/…?clubId=` come la V1 lo componeva, senza il parametro se manca. */
export const withClubId = (path: string, clubId?: string | null) =>
  clubId ? `${path}${path.includes("?") ? "&" : "?"}clubId=${encodeURIComponent(clubId)}` : path;
