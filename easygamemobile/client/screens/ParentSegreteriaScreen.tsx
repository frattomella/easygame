import React from "react";

import {
  ParentPrimaryScreenLayout,
  StateMessage,
} from "@/components/signature";
import { useParentContext } from "@/contexts/ParentContext";

/**
 * Segreteria — pagamenti, documenti, consensi e iscrizione (`design-source/
 * guidelines/navigation.md`, slot 3 del dock Parent). Fuori perimetro di
 * questo batch (WP4-6): onesto sull'assenza invece di uno schermo vuoto o
 * un bottone che non fa nulla. Il tab esiste comunque, perche lo slot fa
 * parte della lingua di navigazione CURRENT — nasconderlo violerebbe il
 * limite dei cinque slot tanto quanto inventarne il contenuto.
 */
export default function ParentSegreteriaScreen() {
  const { children, selectedChildId, switching, selectChild } =
    useParentContext();

  return (
    <ParentPrimaryScreenLayout
      title="Segreteria"
      eyebrow="In arrivo"
      linkedChildren={children}
      selectedChildId={selectedChildId}
      childrenSwitching={switching}
      onSelectChild={selectChild}
      scrollable={false}
      content={
        <StateMessage
          kind="empty"
          tone="dark"
          title="Sezione in arrivo"
          message="Pagamenti, documenti, consensi e iscrizione arriveranno in un prossimo aggiornamento."
        />
      }
    />
  );
}
