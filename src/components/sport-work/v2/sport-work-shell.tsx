"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Lock } from "lucide-react";
import Sidebar from "@/components/dashboard/Sidebar";
import Header from "@/components/dashboard/Header";
import { DashboardPageContainer, dashboardMainClassName } from "@/components/dashboard/dashboard-page-container";
import { PageHeader } from "@/components/web/page/PageHeader";
import { EmptyStateCard } from "@/components/web/page/Cards";
import { SegmentedControl } from "@/components/web/primitives/Controls";
import { useSportWorkRole } from "@/components/sport-work/v2/use-sport-work-role";
import { withClubId } from "@/components/sport-work/v2/sport-work-model";

/**
 * L'involucro delle cinque pagine di «Lavoro sportivo» (Web V2).
 *
 * Le pagine condividono il guscio, l'intestazione di pagina e — soprattutto —
 * la **verifica del permesso**: il server la fa su ogni rotta, qui si fa
 * perche una schermata che carica scheletri e poi si riempie di errori e
 * peggio di una che dice subito «questa parte non e per il tuo ruolo».
 *
 * La navigazione fra le sezioni e un controllo segmentato **che cambia URL**:
 * ogni voce resta un indirizzo vero, con `?clubId=` propagato, perche la
 * scadenza di un compenso si manda per email a un collega e un collegamento
 * che non si puo copiare non si manda.
 */
export const SPORT_WORK_SECTIONS = [
  { id: "dashboard", label: "Cruscotto", href: "/sport-work" },
  { id: "relationships", label: "Rapporti", href: "/sport-work/relationships" },
  { id: "compensations", label: "Compensi", href: "/sport-work/compensations" },
  { id: "deadlines", label: "Scadenze", href: "/sport-work/deadlines" },
  { id: "obligations", label: "Adempimenti", href: "/sport-work/obligations" },
] as const;

export type SportWorkSectionId = (typeof SPORT_WORK_SECTIONS)[number]["id"];

export const sectionOfPath = (pathname: string | null): SportWorkSectionId => {
  if (!pathname || pathname === "/sport-work") return "dashboard";
  return SPORT_WORK_SECTIONS.find((section) => section.href !== "/sport-work" && pathname.startsWith(section.href))?.id || "dashboard";
};

export type SportWorkShellProps = {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  context?: React.ReactNode;
  stats?: React.ReactNode;
  children: React.ReactNode;
  /** Nasconde la riga delle sezioni: la scheda di un rapporto non ne ha bisogno. */
  hideSections?: boolean;
  /** Un blocco sotto l'intestazione (avviso di pagina). */
  banner?: React.ReactNode;
};

export function SportWorkShell({ title, description, actions, context, stats, children, hideSections, banner }: SportWorkShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const clubId = searchParams?.get("clubId") || null;
  const { checked, canRead } = useSportWorkRole();
  const current = sectionOfPath(pathname);

  return (
    <div className="flex h-[100dvh] bg-egw-page">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Header title={title} />
        <main className={dashboardMainClassName}>
          <DashboardPageContainer>
            <PageHeader eyebrow="Lavoro sportivo" title={title} description={description} actions={checked && canRead ? actions : null} context={checked && canRead ? context : null} stats={stats}>
              {!hideSections ? (
                <SegmentedControl<SportWorkSectionId>
                  aria-label="Sezioni del lavoro sportivo"
                  value={current}
                  onChange={(next) => {
                    const section = SPORT_WORK_SECTIONS.find((item) => item.id === next);
                    if (section) router.push(withClubId(section.href, clubId));
                  }}
                  options={SPORT_WORK_SECTIONS.map((section) => ({ value: section.id, label: section.label }))}
                  className="max-w-full overflow-x-auto"
                />
              ) : null}
              {banner}
            </PageHeader>

            {checked && !canRead ? (
              <EmptyStateCard
                icon={<Lock />}
                iconTone="neutral"
                title="Questa sezione non è per il ruolo attivo"
                description="I compensi dicono quanto guadagna una persona: li vedono il proprietario e il club manager. Se ti serve accesso, chiedilo a chi amministra la società."
              />
            ) : (
              children
            )}
          </DashboardPageContainer>
        </main>
      </div>
    </div>
  );
}
