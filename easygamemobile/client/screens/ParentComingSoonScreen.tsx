import React from "react";
import { useRoute, RouteProp } from "@react-navigation/native";

import { SecondaryScreenLayout, StateMessage } from "@/components/signature";
import type { ParentProfileStackParamList } from "@/navigation/ParentProfileStackNavigator";

type Route = RouteProp<ParentProfileStackParamList, "ParentComingSoon">;

/**
 * Una sezione dell'hub non ancora implementata (Pagamenti, Documenti,
 * Consensi, Iscrizione, Appuntamenti, Prenotazioni strutture, Contatti
 * club, Impostazioni — fuori perimetro di WP4-6, ADR-0163). Onesta invece
 * di finta: nessun bottone morto, nessun elenco vuoto travestito da lista
 * reale — lo dice esplicitamente.
 */
export default function ParentComingSoonScreen() {
  const route = useRoute<Route>();
  const { title, message } = route.params;

  return (
    <SecondaryScreenLayout title={title} eyebrow="In arrivo">
      <StateMessage
        kind="empty"
        title="Sezione in arrivo"
        message={message || `${title} arrivera in un prossimo aggiornamento.`}
      />
    </SecondaryScreenLayout>
  );
}
