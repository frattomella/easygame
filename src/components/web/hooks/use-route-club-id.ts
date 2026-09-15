"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/providers/AuthProvider";

/**
 * L'identificativo del club per le pagine che lo accettano dall'URL
 * (`?clubId=`), con l'ordine di ripiego che le pagine V1 avevano ciascuna a
 * modo proprio e che qui e uno solo: il parametro dell'URL, poi il club attivo
 * del contesto, poi `localStorage["activeClub_<userId>"]` (l'utente del
 * contesto o `localStorage.userId`), poi `localStorage.activeClub`.
 *
 * Si legge dopo il montaggio: `localStorage` sul server non esiste. Il cambio
 * di club in un'altra scheda del browser arriva dal contesto, che gia lo
 * propaga: non serve ascoltare l'evento `storage`.
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
  const owner = userId || localStorage.getItem("userId");
  if (owner) {
    const own = parseStoredClub(localStorage.getItem(`activeClub_${owner}`));
    if (own) return own;
  }
  return parseStoredClub(localStorage.getItem("activeClub"));
};

const isValid = (value?: string | null) =>
  Boolean(value && value !== "null" && value !== "undefined" && value.trim());

export function useRouteClubId(preferred?: string | null) {
  const { activeClub, user } = useAuth();
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
    setClubId(readStoredClubId(user?.id ? String(user.id) : null));
    setResolved(true);
  }, [preferred, activeClub, user?.id]);

  return { clubId, resolved };
}

/** `/<rotta>/…?clubId=` come la V1 lo componeva, senza il parametro se manca. */
export const withClubId = (path: string, clubId?: string | null) =>
  clubId ? `${path}${path.includes("?") ? "&" : "?"}clubId=${encodeURIComponent(clubId)}` : path;
