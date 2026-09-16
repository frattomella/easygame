"use client";

import * as React from "react";
import { Suspense } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import Sidebar from "@/components/dashboard/Sidebar";
import Header from "@/components/dashboard/Header";
import { DashboardPageContainer, dashboardMainClassName } from "@/components/dashboard/dashboard-page-container";
import { useAuth } from "@/components/providers/AuthProvider";
import { HeaderStat, PageHeader } from "@/components/web/page/PageHeader";
import { Button } from "@/components/web/primitives/Button";
import { useBreadcrumbLabel } from "@/components/web/shell/ShellProvider";
import { useRouteClubId, withClubId } from "@/components/web/hooks/use-route-club-id";
import { roleHasPermission } from "@/lib/permissions/catalog";
import { formatInteger } from "@/lib/web/format";
import { TrialAthletesPanel } from "@/components/trials/v2/TrialAthletesPanel";

/**
 * `/athletes/in-prova` — le persone in prova del club (ADR-0188). E una
 * vista dentro l'area Atleti, non una categoria: chi viene ad allenarsi prima
 * di iscriversi, con lo storico delle prove e la strada per diventare atleta.
 * Cosa il ruolo puo fare lo dice il catalogo dei permessi (`trials.*`).
 */
function TrialAthletesPageContent() {
  const router = useRouter();
  const { activeClub } = useAuth();
  const { clubId } = useRouteClubId(activeClub?.id ? String(activeClub.id) : null);
  const role = activeClub?.role || null;
  useBreadcrumbLabel("Atleti in prova");

  const canManage = roleHasPermission(role, "trials.manage");
  const canConvert = roleHasPermission(role, "trials.convert");
  const canReadContacts = roleHasPermission(role, "trials.contacts_read");

  return (
    <div className="flex h-[100dvh] bg-egw-page">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Header title="Atleti in prova" />
        <main className={dashboardMainClassName}>
          <DashboardPageContainer>
            <TrialAthletesPanel
              clubId={clubId}
              canManage={canManage}
              canConvert={canConvert}
              canReadContacts={canReadContacts}
              profileMode="page"
              profileHref={(id) => withClubId(`/athletes/in-prova/${id}`, clubId)}
              athleteHref={(athleteId) => withClubId(`/athletes/${athleteId}`, clubId)}
              onNavigate={(href) => router.push(href)}
              header={({ count, openCreate }) => (
                <PageHeader
                  eyebrow="Persone · Atleti"
                  title="Atleti in prova"
                  description="Chi viene ad allenarsi prima di iscriversi: identità stabile, storico delle prove, conversione in atleta."
                  stats={<HeaderStat value={formatInteger(count)} label="in prova" tone="amber" />}
                  actions={
                    <>
                      <Button variant="secondary" onClick={() => router.push(withClubId("/athletes", clubId))}>
                        Tutti gli atleti
                      </Button>
                      {canManage ? (
                        <Button variant="primary" icon={<Plus />} onClick={openCreate}>
                          Registra persona in prova
                        </Button>
                      ) : null}
                    </>
                  }
                />
              )}
            />
          </DashboardPageContainer>
        </main>
      </div>
    </div>
  );
}

export default function TrialAthletesPage() {
  return (
    <Suspense fallback={null}>
      <TrialAthletesPageContent />
    </Suspense>
  );
}
