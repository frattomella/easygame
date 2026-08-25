"use client";

import { TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  BarChart3,
  DollarSign,
  FileText,
  Heart,
  Phone,
  Shirt,
  User,
} from "lucide-react";
import {
  ATHLETE_PROFILE_TABS,
  type AthleteProfileTabValue,
} from "@/lib/athlete-profile-tabs";

/**
 * La barra delle sezioni della scheda atleta.
 *
 * **Perche e un componente** (WP-19, Blocco 8). Era JSX a riga 3.445 di
 * `src/app/athletes/[id]/page.tsx`, che supera le 8.000 righe. L'elenco delle
 * sezioni sta in `src/lib/athlete-profile-tabs.ts`, dove si puo leggere e
 * provare; qui resta solo il disegno.
 *
 * Scorre orizzontalmente sotto `md` invece di mandare a capo: sette sezioni su
 * due righe a 375 px spingono il contenuto sotto la piega prima ancora che la
 * pagina cominci. E il comportamento che aveva prima, e l'estrazione non lo
 * cambia.
 */

const ICONS: Record<AthleteProfileTabValue, typeof User> = {
  generale: User,
  contatti: Phone,
  sanitari: Heart,
  pagamenti: DollarSign,
  abbigliamento: Shirt,
  documenti: FileText,
  analitiche: BarChart3,
};

export function AthleteProfileTabsBar() {
  return (
    <div className="-mx-4 overflow-x-auto px-4 pb-1 md:mx-0 md:px-0">
      <TabsList className="inline-flex h-auto min-w-max flex-nowrap items-stretch gap-1 rounded-xl bg-muted/80 p-1">
        {ATHLETE_PROFILE_TABS.map((tab) => {
          const Icon = ICONS[tab.value];
          return (
            <TabsTrigger
              key={tab.value}
              value={tab.value}
              className="shrink-0 gap-2 whitespace-nowrap"
            >
              <Icon className="h-4 w-4 mr-2" />
              {tab.labelAlwaysVisible ? (
                tab.label
              ) : (
                <span className="hidden sm:inline">{tab.label}</span>
              )}
            </TabsTrigger>
          );
        })}
      </TabsList>
    </div>
  );
}
