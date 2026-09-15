"use client";

import * as React from "react";
import { readStoredActiveClub } from "@/lib/api/client";
import { hasSportWorkPermission } from "@/lib/sport-work/permissions";

/**
 * I permessi del lavoro sportivo per il ruolo attivo, letti come nella V1
 * (`readStoredActiveClub()?.role`) e risolti dalla matrice **del dominio**
 * (`src/lib/sport-work/permissions.ts`, che passa da `narrowDomainPermission`
 * per i ruoli personalizzati). Nessuna schermata ricostruisce la matrice.
 *
 * `checked` e falso finche lo storage non e stato letto: serve a non mostrare
 * la card «non e per il tuo ruolo» per un istante a chi ha il permesso.
 */
export function useSportWorkRole() {
  const [role, setRole] = React.useState<string | null>(null);
  const [checked, setChecked] = React.useState(false);

  React.useEffect(() => {
    setRole(readStoredActiveClub()?.role || null);
    setChecked(true);
  }, []);

  return React.useMemo(
    () => ({
      role,
      checked,
      canRead: hasSportWorkPermission(role, "sport_work.read"),
      canManage: hasSportWorkPermission(role, "sport_work.manage"),
      canPay: hasSportWorkPermission(role, "sport_work.pay"),
      canFiscal: hasSportWorkPermission(role, "sport_work.fiscal"),
    }),
    [role, checked],
  );
}
