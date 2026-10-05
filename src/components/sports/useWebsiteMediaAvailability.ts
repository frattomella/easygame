"use client";

import * as React from "react";
import { websiteApi } from "@/lib/website/client";

/**
 * **La libreria immagini c'e?** Foto di squadra e logo di un avversario sono
 * immagini della libreria del sito (allegati `owner_type = website`,
 * ADR-0200 §9): senza sito creato, o senza il modulo, il campo resta spento e
 * dice perche, invece di fallire al momento del caricamento.
 */
export type WebsiteMediaAvailability = {
  checking: boolean;
  available: boolean;
  reason: string | null;
};

export const useWebsiteMediaAvailability = (enabled: boolean): WebsiteMediaAvailability => {
  const [state, setState] = React.useState<WebsiteMediaAvailability>({ checking: enabled, available: false, reason: null });

  React.useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setState({ checking: true, available: false, reason: null });
    void (async () => {
      const response = await websiteApi.overview();
      if (cancelled) return;
      if (response.error) {
        setState({
          checking: false,
          available: false,
          reason:
            "Le immagini si scelgono dalla libreria del sito del club: il modulo Sito web non è attivo, o il tuo ruolo non lo vede.",
        });
        return;
      }
      if (!response.data?.site) {
        setState({
          checking: false,
          available: false,
          reason: "Le immagini si scelgono dalla libreria del sito, che non è ancora stato creato: crealo da Sito web e torna qui.",
        });
        return;
      }
      setState({ checking: false, available: true, reason: null });
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return state;
};
