"use client";

import * as React from "react";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/**
 * **Il nome di una pagina, quando della pagina resta solo l'icona.**
 *
 * Le tre barre laterali di EasyGame — gestionale, allenatore, famiglia — si
 * comprimono a 80 px e mostrano solo icone. Fin qui, in quello stato:
 *
 * - la barra dell'allenatore e quella della famiglia non dicevano **niente**:
 *   nessun tooltip e nemmeno l'attributo `title`. Icone mute;
 * - quella gestionale aveva `title={label}`, che e il tooltip del **browser**:
 *   nessuno stile, circa un secondo di attesa, e — cio che conta di piu —
 *   **invisibile a chi naviga da tastiera**, perche il browser lo mostra al
 *   passaggio del mouse e non al fuoco.
 *
 * Questo componente e uno solo per tutte e tre. Non perche tre copie sarebbero
 * costate di piu, ma perche tre copie divergono: e gia successo con i toast,
 * con lo storage del mobile e con le dashboard.
 *
 * ## Due proprieta che valgono la pena di essere dette
 *
 * **A barra aperta il tooltip non esiste.** Non e nascosto: non viene proprio
 * montato. Un suggerimento che ripete un'etichetta gia scritta accanto e
 * rumore, e per chi usa un lettore di schermo e una ripetizione.
 *
 * **Il fuoco da tastiera lo apre.** E la ragione per cui si usa la primitiva
 * Radix (`src/components/ui/tooltip.tsx`) e non `title`: `TooltipTrigger`
 * risponde a `focus` oltre che a `mouseenter`, quindi la barra compressa e
 * percorribile con il tabulatore e ogni icona si annuncia. Il contenuto e
 * legato al trigger da `aria-describedby`, che Radix mette da se.
 */
export function SidebarItemTooltip({
  label,
  collapsed,
  children,
}: {
  /** Il nome della pagina. E lo stesso testo che comparirebbe accanto all'icona. */
  label: string;
  /** Se la barra e compressa. A barra aperta il tooltip non viene montato. */
  collapsed: boolean;
  children: React.ReactElement;
}) {
  if (!collapsed) return children;

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>{children}</TooltipTrigger>
        <TooltipContent side="right" sideOffset={8}>
          {label}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
