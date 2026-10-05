"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ExternalLink, Globe, Lock, Sparkles } from "lucide-react";
import Header from "@/components/dashboard/Header";
import Sidebar from "@/components/dashboard/Sidebar";
import { DashboardPageContainer, dashboardMainClassName } from "@/components/dashboard/dashboard-page-container";
import { PageHeader } from "@/components/web/page/PageHeader";
import { AlertBlock } from "@/components/web/page/Alerts";
import { EmptyStateCard } from "@/components/web/page/Cards";
import { Button } from "@/components/web/primitives/Button";
import { Skeleton } from "@/components/web/primitives/Controls";
import { websiteApi, type WebsiteOverviewDto } from "@/lib/website/client";
import type { WebsitePermission } from "@/lib/website/permissions";

/**
 * **Il guscio dell'area «Sito web» del gestionale** (ADR-0200).
 *
 * Legge una volta la panoramica (stato del servizio, bozza, permessi del
 * ruolo) e la passa alle schermate figlie con un contesto. Tre stati:
 *
 * - servizio non attivo → la pagina spiega cos'e e come si attiva (Hub);
 * - sospeso → tutto in sola lettura, con l'avviso;
 * - prova o attivo → le schermate lavorano, ognuna con i suoi permessi.
 *
 * Il guscio non decide niente di sicurezza: le rotte rifiutano comunque. Qui
 * si evita di mostrare un bottone che il server rifiuterebbe.
 */

type WebsiteAreaValue = {
  overview: WebsiteOverviewDto;
  reload: () => Promise<void>;
  can: (permission: WebsitePermission) => boolean;
  canEdit: boolean;
};

const WebsiteAreaContext = React.createContext<WebsiteAreaValue | null>(null);

export const useWebsiteArea = () => {
  const value = React.useContext(WebsiteAreaContext);
  if (!value) throw new Error("useWebsiteArea fuori dal guscio dell'area Sito web");
  return value;
};

const NAV = [
  { href: "/website", label: "Panoramica", permission: "website.read" },
  { href: "/website/editor", label: "Editor", permission: "website.read" },
  { href: "/website/news", label: "News", permission: "website.read" },
  { href: "/website/persone", label: "Persone", permission: "website.people.manage" },
  { href: "/website/sponsor", label: "Sponsor", permission: "website.read" },
  { href: "/website/media", label: "Immagini", permission: "website.read" },
  { href: "/website/messaggi", label: "Messaggi", permission: "website.settings.manage" },
  { href: "/website/versioni", label: "Versioni", permission: "website.read" },
  { href: "/website/domini", label: "Dominio", permission: "website.read" },
  { href: "/website/impostazioni", label: "Impostazioni", permission: "website.read" },
] as const satisfies ReadonlyArray<{ href: string; label: string; permission: WebsitePermission }>;

export function WebsiteAreaShell({
  title,
  description,
  actions,
  children,
  requireSite = true,
}: {
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  /** Le schermate che non hanno senso prima di creare il sito (tutte tranne la panoramica). */
  requireSite?: boolean;
}) {
  const pathname = usePathname();
  const [overview, setOverview] = React.useState<WebsiteOverviewDto | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const reload = React.useCallback(async () => {
    const result = await websiteApi.overview();
    if (result.error) {
      setError(result.error.message);
      return;
    }
    setError(null);
    setOverview(result.data);
  }, []);

  React.useEffect(() => {
    void reload();
  }, [reload]);

  const value = React.useMemo<WebsiteAreaValue | null>(() => {
    if (!overview) return null;
    const permissions = new Set(overview.permissions);
    return {
      overview,
      reload,
      can: (permission) => permissions.has(permission),
      canEdit: overview.access.canEdit,
    };
  }, [overview, reload]);

  const primary = overview?.domains.find((domain) => domain.role === "primary" && domain.state === "active");

  let body: React.ReactNode;
  if (error) {
    body = <AlertBlock severity="danger" title="Il sito non si puo aprire">{error}</AlertBlock>;
  } else if (!value) {
    body = (
      <div className="space-y-3">
        <Skeleton className="h-10 w-1/3" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  } else if (value.overview.access.state === "unavailable") {
    body = (
      <EmptyStateCard
        icon={<Sparkles className="h-6 w-6" />}
        title="EasyGame Website non e attivo"
        description="Il sito della societa sul vostro dominio, alimentato dal gestionale: squadre, rose, calendario, risultati, sponsor e news senza ricopiare niente. Si attiva come servizio aggiuntivo."
        primary={
          <Button asChild variant="primary">
            <Link href="/hub">Vai all&apos;Hub dei servizi</Link>
          </Button>
        }
      />
    );
  } else if (requireSite && !value.overview.site) {
    body = (
      <EmptyStateCard
        icon={<Globe className="h-6 w-6" />}
        title="Il sito non e ancora stato creato"
        description="Parti da un template dalla panoramica: in pochi passi scegli lo stile, i colori e le pagine."
        primary={
          <Button asChild variant="primary">
            <Link href="/website">Crea il sito</Link>
          </Button>
        }
      />
    );
  } else {
    body = children;
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="min-w-0 flex-1">
        <Header title="Sito web" />
        <main className={dashboardMainClassName}>
          <DashboardPageContainer>
            <PageHeader
              eyebrow="EasyGame Website"
              title={title}
              description={description}
              actions={
                <div className="flex flex-wrap items-center gap-2">
                  {primary ? (
                    <Button asChild variant="secondary" size="sm" icon={<ExternalLink className="h-4 w-4" />}>
                      <a href={`https://${primary.hostname}`} target="_blank" rel="noopener noreferrer">
                        {primary.hostname}
                      </a>
                    </Button>
                  ) : null}
                  {actions}
                </div>
              }
            >
              {value?.overview.access.state === "suspended" ? (
                <AlertBlock severity="warning" title="Servizio sospeso" className="mt-3">
                  <span className="inline-flex items-center gap-2"><Lock className="h-4 w-4" />{value.overview.access.message}</span>
                </AlertBlock>
              ) : value?.overview.access.state === "trial" ? (
                <AlertBlock severity="info" title="Prova gratuita" className="mt-3">
                  {value.overview.access.message}
                </AlertBlock>
              ) : null}
            </PageHeader>
            {value && value.overview.access.state !== "unavailable" ? (
              <nav aria-label="Sezioni del sito" className="-mx-1 mb-5 flex gap-1 overflow-x-auto border-b border-egw-hairline pb-px">
                {NAV.filter((item) => value.can(item.permission)).map((item) => {
                  const active = item.href === "/website" ? pathname === "/website" : pathname?.startsWith(item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={`whitespace-nowrap rounded-t-md px-3 py-2 text-[13px] font-semibold ${active ? "border-b-2 border-egw-blue text-egw-ink" : "text-egw-ink-62 hover:text-egw-ink"}`}
                    >
                      {item.label}
                    </Link>
                  );
                })}
              </nav>
            ) : null}
            <WebsiteAreaContext.Provider value={value}>{body}</WebsiteAreaContext.Provider>
          </DashboardPageContainer>
        </main>
      </div>
    </div>
  );
}
