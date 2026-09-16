"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Sidebar, type SidebarIdentity } from "@/components/web/shell/Sidebar";
import { Topbar, type HeaderClubIdentity, type TopbarProps } from "@/components/web/shell/Topbar";
import { useShellArea } from "@/components/web/shell/ShellProvider";
import type { NavGroup } from "@/components/web/shell/navigation";
import { toMobileNavSections } from "@/components/web/shell/area-navigation";
import { DashboardPageContainer, dashboardMainClassName } from "@/components/dashboard/dashboard-page-container";
import { Panel } from "@/components/web/primitives/Surface";
import { Skeleton } from "@/components/web/primitives/Controls";
import { EmptyStateCard } from "@/components/web/page/Cards";

/**
 * **Il guscio delle aree fuori dal gestionale** — famiglia, allenatore,
 * atleta (EGDS v3.1.0, guideline 06).
 *
 * Tre aree avevano tre gusci: tre barre laterali con tre gradienti (blu,
 * blu, smeraldo), tre modi di comprimersi, tre sfondi sfumati con
 * un gradiente blu-viola proprio, e ognuno con il proprio elenco di
 * voci copiato a mano nel menu mobile. Erano la stessa cosa scritta tre
 * volte, e ogni volta un po' diversa: il difetto che il Web V2 esiste per
 * chiudere.
 *
 * Qui il guscio e **uno** — la stessa `Sidebar` e la stessa `Topbar` del
 * club, ambiente 1 (`--egw-page`), la stessa colonna di contenuto — e l'area
 * porta solo cio che la distingue: i suoi gruppi di navigazione (un elenco,
 * letto sia dalla barra larga sia dal menu stretto), il blocco d'identita in
 * alto (il figlio, per la famiglia) e le notifiche del proprio ruolo.
 */
export interface AreaShellProps {
  groups: readonly NavGroup[];
  identity?: SidebarIdentity;
  title: string;
  notifications?: TopbarProps["notifications"];
  notificationCount?: number;
  onMarkRead?: TopbarProps["onMarkRead"];
  clubIdentity?: HeaderClubIdentity | null;
  children: React.ReactNode;
  /** Il contenitore centrato di 1560px; spento per le pagine che governano da se la larghezza. */
  contained?: boolean;
  className?: string;
}

export function AreaShell({
  groups,
  identity,
  title,
  notifications = null,
  notificationCount = 0,
  onMarkRead,
  clubIdentity = null,
  children,
  contained = true,
  className,
}: AreaShellProps) {
  useShellArea(groups);
  const router = useRouter();
  const mobileNavSections = React.useMemo(() => toMobileNavSections(groups), [groups]);
  /*
    Un'area ha sempre la propria identita: senza, la barra ricadrebbe sul
    blocco del club con «Stagioni del club», che e un'azione di gestione e
    che a un allenatore o a un atleta il guscio poi rimbalza (revisione
    ostile ADR-0187, H5). Il ripiego e il club che si sta guardando, con la
    sola uscita verso l'account.
  */
  const areaIdentity: SidebarIdentity = identity || {
    eyebrow: "Club",
    name: clubIdentity?.name || "EasyGame",
    meta: clubIdentity?.seasonLabel ? `Stagione ${clubIdentity.seasonLabel}` : null,
    avatarSrc: clubIdentity?.logoUrl || null,
    actions: [{ id: "account", label: "Torna al mio account", onSelect: () => router.push("/account"), tone: "muted" }],
  };

  return (
    <div className={cn("flex h-[100dvh] overflow-hidden bg-egw-page", className)}>
      <Sidebar groups={groups} identity={areaIdentity} withClubParam={false} />
      {/*
        `min-w-0` accanto a `overflow-hidden`: senza, a 768 px il guscio si
        allarga fino alla larghezza del proprio contenuto invece di lasciarlo
        scorrere.
      */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <Topbar
          title={title}
          showMobileHubLink={false}
          mobileNavSections={mobileNavSections}
          mobileIdentity={areaIdentity}
          notifications={notifications}
          notificationCount={notificationCount}
          onMarkRead={onMarkRead}
          clubIdentity={clubIdentity}
        />
        <main className={dashboardMainClassName}>
          {contained ? <DashboardPageContainer>{children}</DashboardPageContainer> : children}
        </main>
      </div>
    </div>
  );
}

/** Il primo caricamento di un'area: uno scheletro nella forma di cio che arriva. */
export function AreaLoading({ label }: { label: string }) {
  return (
    <div role="status" aria-busy className="flex flex-col gap-[18px]">
      <span className="sr-only">{label}</span>
      <div>
        <Skeleton className="mb-3 h-3 w-24" />
        <Skeleton className="h-8 w-64" />
      </div>
      <div className="grid gap-[18px] md:grid-cols-2 xl:grid-cols-3">
        {[0, 1, 2].map((index) => (
          <Panel key={index}>
            <Skeleton className="mb-3 h-3 w-20" />
            <Skeleton className="mb-2 h-5 w-40" />
            <Skeleton className="h-12 w-full" />
          </Panel>
        ))}
      </div>
    </div>
  );
}

/** Un'area che non puo mostrarsi: il motivo e le porte che restano aperte. */
export function AreaUnavailable({
  title,
  description,
  primary,
  secondary,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  primary?: React.ReactNode;
  secondary?: React.ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-[560px]">
      <EmptyStateCard iconTone="amber" title={title} description={description} primary={primary} secondary={secondary} />
    </div>
  );
}
