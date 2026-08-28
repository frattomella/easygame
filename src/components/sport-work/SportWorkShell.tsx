"use client";

import React from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import Sidebar from "@/components/dashboard/Sidebar";
import Header from "@/components/dashboard/Header";
import {
  DashboardPageContainer,
  dashboardMainClassName,
} from "@/components/dashboard/dashboard-page-container";
import { SharedPageHeader } from "@/components/dashboard/shared-page-header";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { readStoredActiveClub } from "@/lib/api/client";
import { hasSportWorkPermission } from "@/lib/sport-work/permissions";

/**
 * L'involucro delle cinque pagine di «Lavoro sportivo».
 *
 * Le pagine condividono intestazione, navigazione e — soprattutto — la
 * **verifica del permesso**. Il server la fa comunque su ogni rotta; qui si
 * fa perche una schermata che carica, mostra scheletri vuoti e poi si riempie
 * di errori rossi e peggio di una schermata che dice subito «questa parte non
 * e per il tuo ruolo».
 *
 * La navigazione e una riga di collegamenti e non una barra di schede perche
 * ogni voce e un indirizzo vero: la scadenza di un compenso si manda per
 * email a un collega, e un collegamento che non si puo copiare non si manda.
 */

export const SPORT_WORK_SECTIONS = [
  { id: "dashboard", label: "Dashboard", href: "/sport-work" },
  { id: "relationships", label: "Rapporti", href: "/sport-work/relationships" },
  { id: "compensations", label: "Compensi", href: "/sport-work/compensations" },
  { id: "deadlines", label: "Scadenze", href: "/sport-work/deadlines" },
  { id: "obligations", label: "Adempimenti", href: "/sport-work/obligations" },
] as const;

export type SportWorkShellProps = {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  /** Nasconde la barra delle sezioni: le schede di dettaglio non ne hanno bisogno. */
  hideSections?: boolean;
};

const buildHref = (href: string, clubId: string | null) =>
  clubId ? `${href}?clubId=${encodeURIComponent(clubId)}` : href;

export function SportWorkShell({
  title,
  subtitle,
  actions,
  children,
  hideSections,
}: SportWorkShellProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [role, setRole] = React.useState<string | null>(null);
  const [checked, setChecked] = React.useState(false);

  const clubId = searchParams?.get("clubId") || null;

  React.useEffect(() => {
    setRole(readStoredActiveClub()?.role || null);
    setChecked(true);
  }, []);

  const canRead = hasSportWorkPermission(role, "sport_work.read");

  return (
    <div className="flex h-[100dvh] bg-gray-50 dark:bg-gray-900">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header title={title} />
        <main className={dashboardMainClassName}>
          <DashboardPageContainer>
            <SharedPageHeader
              eyebrow="Lavoro sportivo"
              title={title}
              subtitle={subtitle}
              actions={actions}
            />

            {!hideSections ? (
              <nav
                aria-label="Sezioni del lavoro sportivo"
                className="-mx-1 flex gap-1 overflow-x-auto pb-1"
              >
                {SPORT_WORK_SECTIONS.map((section) => {
                  const active =
                    section.href === "/sport-work"
                      ? pathname === "/sport-work"
                      : pathname?.startsWith(section.href);

                  return (
                    <Link
                      key={section.id}
                      href={buildHref(section.href, clubId)}
                      className={cn(
                        "shrink-0 rounded-full px-4 py-2 text-sm font-medium transition-colors",
                        active
                          ? "bg-blue-600 text-white"
                          : "bg-white text-slate-600 hover:bg-slate-100 dark:bg-gray-800 dark:text-slate-300",
                      )}
                    >
                      {section.label}
                    </Link>
                  );
                })}
              </nav>
            ) : null}

            {checked && !canRead ? (
              <Card>
                <CardContent className="space-y-2 p-6">
                  <p className="text-base font-semibold text-slate-900 dark:text-slate-100">
                    Questa sezione non e per il ruolo attivo
                  </p>
                  <p className="text-sm text-muted-foreground">
                    I compensi dicono quanto guadagna una persona: li vedono il
                    proprietario e il club manager. Se ti serve accesso,
                    chiedilo a chi amministra la societa.
                  </p>
                </CardContent>
              </Card>
            ) : (
              children
            )}
          </DashboardPageContainer>
        </main>
      </div>
    </div>
  );
}

/**
 * Un riquadro di numero, con un secondo numero sotto.
 *
 * Ha due righe e non una perche in questo dominio quasi ogni cifra ne ha
 * un'altra accanto che le da senso: pagato e costo del club, da pagare e
 * scaduto, maturato e programmato. Mostrarne una sola costringe chi legge a
 * indovinare quale delle due sta guardando.
 */
export function SportWorkStat({
  label,
  value,
  hint,
  tone = "default",
  icon,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "positive" | "warning" | "danger";
  icon?: React.ReactNode;
}) {
  const toneClass =
    tone === "positive"
      ? "text-emerald-600"
      : tone === "warning"
        ? "text-amber-600"
        : tone === "danger"
          ? "text-rose-600"
          : "text-slate-900 dark:text-slate-100";

  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className={cn("mt-1 text-2xl font-bold", toneClass)}>{value}</p>
            {hint ? (
              <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
            ) : null}
          </div>
          {icon ? <div className="shrink-0 text-slate-400">{icon}</div> : null}
        </div>
      </CardContent>
    </Card>
  );
}
