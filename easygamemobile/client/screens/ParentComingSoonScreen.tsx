import React from "react";
import { useRoute, RouteProp } from "@react-navigation/native";

import { SecondaryScreenLayout, StateMessage } from "@/components/signature";
import type { ParentProfileStackParamList } from "@/navigation/ParentProfileStackNavigator";

type Route = RouteProp<ParentProfileStackParamList, "ParentComingSoon">;

/**
 * Una sezione dell'hub non ancora implementata. Il batch Parent WP4-9
 * (ADR-0163/ADR-0164) ha reso reali Pagamenti, Documenti, Consensi,
 * Iscrizione, Appuntamenti, Prenotazioni strutture e Contatti club: oggi
 * questa schermata resta raggiunta solo da "Impostazioni"
 * (`ParentMoreScreen`), che non ha ancora una sezione propria. Onesta
 * invece di finta: nessun bottone morto, nessun elenco vuoto travestito da
 * lista reale — lo dice esplicitamente.
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
