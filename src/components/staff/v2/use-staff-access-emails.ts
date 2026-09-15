"use client";

import { useEffect, useState } from "react";
import { apiRequest, readStoredActiveClub } from "@/lib/api/client";
import { canManageClubConfigurationAsActor } from "@/lib/access-roles";
import { ACCOUNT_STATUS, STATUS_UNKNOWN, type StatusSpec } from "@/lib/web/status";

/**
 * Le email delle utenze reali del club, per la colonna «Accesso EasyGame»
 * dell'elenco staff.
 *
 * Stesso perimetro e stessa rotta della sezione «Accesso EasyGame» della
 * scheda (`ClubPersonAccessCard`, W6-D05): `GET /api/v1/club-roles/assignments`,
 * letta **solo** da chi passa `canManageClubConfigurationAsActor`. A chiunque
 * altro la colonna non compare — assente, non disabilitata (guideline 10
 * §10.5, regola 10). Il legame resta dedotto dall'email, come sulla scheda.
 */
export function useStaffAccessEmails() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [emails, setEmails] = useState<Set<string> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setEnabled(canManageClubConfigurationAsActor(readStoredActiveClub()?.role || ""));
  }, []);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const load = async () => {
      const response = await apiRequest<{ assignments: Array<{ email?: string | null }> }>(
        "/api/v1/club-roles/assignments",
      );
      if (cancelled) return;
      if (response.error) {
        setError(response.error.message);
        setEmails(null);
        return;
      }
      setError(null);
      setEmails(
        new Set(
          (response.data?.assignments || [])
            .map((entry) => String(entry.email ?? "").trim().toLowerCase())
            .filter(Boolean),
        ),
      );
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  /** La pillola per un'email di scheda; `null` finche non si sa. */
  const statusFor = (email?: string | null): StatusSpec | null => {
    if (!emails) return null;
    const key = String(email ?? "").trim().toLowerCase();
    if (!key) return STATUS_UNKNOWN;
    return emails.has(key) ? ACCOUNT_STATUS.linked : ACCOUNT_STATUS.none;
  };

  return { enabled: enabled === true, loading: enabled === true && emails === null && !error, error, statusFor };
}
