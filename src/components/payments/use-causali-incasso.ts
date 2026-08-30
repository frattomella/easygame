"use client";

import React from "react";

import { useAuth } from "@/components/providers/AuthProvider";
import { apiRequest } from "@/lib/api/client";

/**
 * **Le causali attive del club, per la finestra di incasso.**
 *
 * Erano lette dentro `AthletePaymentLedger`, e da nessun'altra parte. Ma la
 * finestra di incasso e montata in **due** punti, e il secondo — la scheda
 * «Iscrizione» di un atleta, che e la superficie da cui la segreteria incassa
 * davvero — non le passava. La `prop` e facoltativa e vale `[]` per difetto,
 * quindi TypeScript taceva: la tendina si apriva con la sola voce «Non
 * classificato» e dichiarava «il club non ha ancora configurato le causali»,
 * il che era falso per qualunque club che le avesse configurate.
 *
 * La correzione centrale della classificazione fiscale non arrivava percio
 * dove serviva. Adesso la lettura vive qui, e chi monta la finestra la ottiene
 * chiamando una funzione invece di ricordarsi di passare una `prop`.
 *
 * **Perche non nella finestra stessa.** Si apre e si chiude trenta volte di
 * fila: leggere a ogni apertura sarebbe trenta richieste per un elenco che non
 * cambia.
 *
 * **Perche dipende dal club attivo.** Le dipendenze erano `[]`, quindi
 * cambiando societa restavano in tendina le causali della precedente — e una
 * causale che il club non ha viene rifiutata dal server, con un messaggio che
 * parla di un catalogo che chi legge non ha mai visto.
 *
 * Se la lettura fallisce — un ruolo che le causali non le vede — l'elenco
 * resta vuoto e la finestra lo dice, invece di impedire di registrare
 * l'incasso: la causale e facoltativa, e un incasso non classificato resta un
 * incasso.
 */
export type CausaleIncasso = { code: string; label: string };

export const useCausaliIncasso = (): CausaleIncasso[] => {
  const { activeClub } = useAuth();
  const clubId = activeClub?.id ? String(activeClub.id) : null;
  const [causali, setCausali] = React.useState<CausaleIncasso[]>([]);

  React.useEffect(() => {
    let vivo = true;
    setCausali([]);

    void (async () => {
      const risposta = await apiRequest<{
        operationTypes?: Array<{
          code: string;
          label: string;
          isActive?: boolean;
        }>;
      }>("/api/v1/fiscal/operation-types");
      if (!vivo || risposta.error) return;
      setCausali(
        (risposta.data?.operationTypes || [])
          .filter((causale) => causale.isActive !== false)
          .map((causale) => ({ code: causale.code, label: causale.label })),
      );
    })();

    return () => {
      vivo = false;
    };
  }, [clubId]);

  return causali;
};
