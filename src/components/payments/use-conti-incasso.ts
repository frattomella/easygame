"use client";

import React from "react";

import { useAuth } from "@/components/providers/AuthProvider";
import { apiRequest } from "@/lib/api/client";

/**
 * **I conti finanziari del club, per la finestra di incasso.**
 *
 * ---
 *
 * ## Il difetto che chiude
 *
 * La finestra «Registra pagamento» non chiedeva **su quale conto** il denaro
 * fosse arrivato, e non lo mandava: ogni incasso di una famiglia nasceva con
 * `financial_account_id` nullo. Il registro lo mostra — la prima nota e il
 * rendiconto lo contano — ma `listFinancialAccountBalances` somma per conto, e
 * una riga senza conto non entra in nessun saldo.
 *
 * Misurato da una revisione indipendente: mille euro di quote incassate e un
 * saldo di cassa e banca che **non si muove di un centesimo**. Il riquadro dei
 * saldi dichiara di essere «il saldo di apertura piu tutti i movimenti
 * registrati», e sbagliava dell'intero incassato quote del club.
 *
 * ## Perche facoltativo, e perche preselezionato
 *
 * Un club che non ha ancora configurato i conti deve poter incassare lo
 * stesso: il rendiconto raggruppa quelle righe sotto «Senza conto», che e
 * un'assenza dichiarata e non un numero sbagliato.
 *
 * Ma quando un conto c'e — e nella quasi totalita dei casi ce n'e uno solo —
 * chiedere alla segreteria di sceglierlo a ogni incasso significa che prima o
 * poi non lo scegliera. Si preseleziona quindi il primo conto attivo, e resta
 * cambiabile.
 */
export type ContoIncasso = { id: string; name: string; kind: string };

export const useContiIncasso = (): ContoIncasso[] => {
  const { activeClub } = useAuth();
  const clubId = activeClub?.id ? String(activeClub.id) : null;
  const [conti, setConti] = React.useState<ContoIncasso[]>([]);

  React.useEffect(() => {
    let vivo = true;
    setConti([]);

    void (async () => {
      const risposta = await apiRequest<{
        accounts?: Array<{
          id: string;
          name: string;
          kind?: string;
          isArchived?: boolean;
          is_archived?: boolean;
        }>;
      }>("/api/v1/accounting/accounts");
      if (!vivo || risposta.error) return;
      setConti(
        (risposta.data?.accounts || [])
          .filter((conto) => !(conto.isArchived ?? conto.is_archived))
          .map((conto) => ({
            id: String(conto.id),
            name: conto.name,
            kind: String(conto.kind || ""),
          })),
      );
    })();

    return () => {
      vivo = false;
    };
  }, [clubId]);

  return conti;
};
