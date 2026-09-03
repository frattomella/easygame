"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Menu, LogOut, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  EasyGameLogo,
  EasyGameWordmark,
} from "@/components/brand/easygame-logo";
import { cn } from "@/lib/utils";

export type PlatformAdminSection = {
  id: string;
  label: string;
  description: string;
  icon: LucideIcon;
};

/**
 * Shell della console di piattaforma.
 *
 * La dashboard `platform_admin` montava la `Sidebar` e la `Header` del club:
 * un amministratore di piattaforma si trovava davanti "Atleti", "Allenamenti"
 * e la stagione di un club a cui non appartiene, e la topbar mostrava il club
 * attivo memorizzato nel browser. Sono due mestieri diversi e ora hanno due
 * chrome diverse.
 *
 * Il segno della differenza e il fondo scuro: qui non si amministra un club,
 * si amministra l'applicazione.
 */
export function PlatformAdminShell({
  sections,
  activeSection,
  onSectionChange,
  adminEmail,
  children,
}: {
  sections: PlatformAdminSection[];
  activeSection: string;
  onSectionChange: (id: string) => void;
  adminEmail?: string | null;
  children: ReactNode;
}) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);

  const nav = (
    <nav className="flex flex-col gap-1" aria-label="Sezioni piattaforma">
      {sections.map((section) => {
        const active = section.id === activeSection;
        return (
          <button
            key={section.id}
            type="button"
            onClick={() => {
              onSectionChange(section.id);
              setMenuOpen(false);
            }}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400",
              active
                ? "bg-white/10 text-white"
                : "text-slate-400 hover:bg-white/5 hover:text-slate-200",
            )}
          >
            <section.icon className="mt-0.5 h-4 w-4 shrink-0" />
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium">
                {section.label}
              </span>
              <span className="block truncate text-xs text-slate-500">
                {section.description}
              </span>
            </span>
          </button>
        );
      })}
    </nav>
  );

  const footer = (
    <div className="space-y-3 border-t border-white/10 pt-4">
      {adminEmail ? (
        <p className="truncate px-3 text-xs text-slate-500" title={adminEmail}>
          {adminEmail}
        </p>
      ) : null}
      <Button
        variant="ghost"
        onClick={() => router.push("/account")}
        className="w-full justify-start gap-2 text-slate-300 hover:bg-white/5 hover:text-white"
      >
        <LogOut className="h-4 w-4" />
        Torna ai tuoi club
      </Button>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-[var(--eg-paper)]">
      {/* Navigazione laterale, solo da tablet in su. */}
      <aside className="hidden w-64 shrink-0 flex-col justify-between bg-[var(--eg-navy)] p-4 md:flex">
        <div className="space-y-6">
          <Link
            href="/account"
            className="flex items-center gap-3 rounded-lg px-1 py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
          >
            <EasyGameWordmark
              tone="light"
              logoClassName="h-7"
              subtitle="Piattaforma"
            />
          </Link>
          {nav}
        </div>
        {footer}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Topbar: su telefono apre la navigazione, altrove nomina la sezione. */}
        <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-4 md:px-6">
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0 md:hidden"
            onClick={() => setMenuOpen(true)}
            aria-label="Apri le sezioni piattaforma"
          >
            <Menu className="h-5 w-5" />
          </Button>

          <span className="flex min-w-0 items-center gap-2">
            <EasyGameLogo className="h-7 w-7 shrink-0 md:hidden" />
            <span className="eg-eyebrow-sm shrink-0 rounded bg-slate-900 px-1.5 py-1 leading-none text-white">
              Piattaforma
            </span>
            <span className="truncate font-display text-sm font-semibold text-slate-900">
              {sections.find((section) => section.id === activeSection)?.label ||
                "Console"}
            </span>
          </span>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto px-4 py-5 md:px-6 md:py-6">
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
            {children}
          </div>
        </main>
      </div>

      {/* Navigazione su telefono. */}
      {menuOpen ? (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            aria-label="Chiudi le sezioni"
            className="absolute inset-0 bg-slate-900/60"
            onClick={() => setMenuOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col justify-between overflow-y-auto bg-[var(--eg-navy)] p-4">
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <EasyGameWordmark
                  tone="light"
                  logoClassName="h-7"
                  subtitle="Piattaforma"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-slate-300"
                  onClick={() => setMenuOpen(false)}
                  aria-label="Chiudi"
                >
                  <X className="h-5 w-5" />
                </Button>
              </div>
              {nav}
            </div>
            {footer}
          </div>
        </div>
      ) : null}
    </div>
  );
}
