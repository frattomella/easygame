"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { SegmentedControl } from "@/components/web/primitives/Controls";

/**
 * Le tre superfici di «Comunicazioni», una accanto all'altra.
 *
 * La V1 le collegava con pulsanti sparsi nelle intestazioni («Bacheca»,
 * «Automazioni», «Comunicazioni»): tre rotte, tre insiemi di link diversi.
 * Qui e un controllo segmentato unico sotto l'intestazione di pagina, come
 * le sezioni della prima nota — un'automazione e un messaggio che parte da
 * solo, e sta accanto ai messaggi che partono a mano.
 */
export type CommunicationsSection = "send" | "board" | "automations";

const SECTIONS: Array<{ value: CommunicationsSection; label: string; href: string }> = [
  { value: "send", label: "Comunicazione", href: "/communications" },
  { value: "board", label: "Bacheca", href: "/communications/bacheca" },
  { value: "automations", label: "Automazioni", href: "/communications/automazioni" },
];

export const communicationsSectionFor = (pathname: string | null | undefined): CommunicationsSection => {
  if (!pathname) return "send";
  if (pathname.startsWith("/communications/bacheca")) return "board";
  if (pathname.startsWith("/communications/automazioni")) return "automations";
  return "send";
};

export function CommunicationsNav() {
  const router = useRouter();
  const pathname = usePathname();
  const value = communicationsSectionFor(pathname);
  return (
    <SegmentedControl<CommunicationsSection>
      aria-label="Sezioni delle comunicazioni"
      value={value}
      onChange={(next) => {
        const target = SECTIONS.find((section) => section.value === next);
        if (target && target.value !== value) router.push(target.href);
      }}
      options={SECTIONS.map((section) => ({ value: section.value, label: section.label }))}
      className="max-w-full overflow-x-auto"
    />
  );
}
