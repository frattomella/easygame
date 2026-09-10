import React from "react";

import { GlassCard, ParentPrimaryScreenLayout } from "@/components/signature";
import { useParentContext } from "@/contexts/ParentContext";

/**
 * WP4: fondazione minima — identita del figlio selezionato, niente altro.
 * `ParentTabNavigator` garantisce che questa schermata monti solo quando
 * esiste almeno un figlio (`ParentContext` "ready"), quindi non ripete qui
 * gli stati vuoto/errore. Il cruscotto reale (prossimi impegni, RSVP in
 * sospeso, iscrizione, moduli) arriva nel WP5 — vedi
 * `docs/knowledge-base/20-work-packages.md`.
 */
export default function ParentHomeScreen() {
  const { children, selectedChildId, selectedChild, switching, selectChild } =
    useParentContext();

  return (
    <ParentPrimaryScreenLayout
      title="Home"
      eyebrow={selectedChild ? selectedChild.clubName : "EasyGame"}
      linkedChildren={children}
      selectedChildId={selectedChildId}
      childrenSwitching={switching}
      onSelectChild={selectChild}
      content={
        <GlassCard
          eyebrow="Bentornato"
          title={selectedChild?.name || "Il tuo account"}
          description={
            selectedChild
              ? [
                  selectedChild.categoryName,
                  `Classe ${selectedChild.birthYear ?? "—"}`,
                ]
                  .filter(Boolean)
                  .join(" · ")
              : undefined
          }
        />
      }
    />
  );
}
