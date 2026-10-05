"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Layers, Shield, Users } from "lucide-react";
import Sidebar from "@/components/dashboard/Sidebar";
import Header from "@/components/dashboard/Header";
import { DashboardPageContainer, dashboardMainClassName } from "@/components/dashboard/dashboard-page-container";
import { useAuth } from "@/components/providers/AuthProvider";
import { useToast } from "@/components/ui/toast-notification";
import { HeaderStat, PageHeader } from "@/components/web/page/PageHeader";
import { EmptyStateCard, InfoCard } from "@/components/web/page/Cards";
import { AlertBlock } from "@/components/web/page/Alerts";
import { Button } from "@/components/web/primitives/Button";
import { Skeleton } from "@/components/web/primitives/Controls";
import { DangerConfirmDialog } from "@/components/web/overlays/Modal";
import { formatInteger } from "@/lib/web/format";
import { canManageClubConfiguration } from "@/lib/access-roles";
import { sportsApi, type ClubTeamDto } from "@/lib/sports/client";
import { TeamDrawer } from "@/components/sports/teams/TeamDrawer";
import { TeamsList } from "@/components/sports/teams/TeamsList";
import { TeamsFromCategoriesModal } from "@/components/sports/teams/TeamsFromCategoriesModal";
import { loadTeamEditorOptions, type TeamEditorOptions } from "@/components/sports/teams/team-options";
import { useWebsiteMediaAvailability } from "@/components/sports/useWebsiteMediaAvailability";

/**
 * `/categories/squadre` — le squadre stabili del club (ADR-0200 §8).
 *
 * Una categoria nasce e muore con la stagione; una squadra no. Qui si da alla
 * «Serie C» un'identita che attraversa le stagioni e la si collega, stagione
 * per stagione, alla categoria (e al gruppo) che la rappresenta. Il sito usa
 * lo slug della squadra per l'indirizzo pubblico, che quindi non cambia
 * quando cambia la stagione. La scrittura e di chi configura il club; il
 * server lo decide, qui le azioni semplicemente non compaiono.
 */

const PageShell = ({ children }: { children: React.ReactNode }) => (
  <div className="flex h-[100dvh] bg-egw-page">
    <Sidebar />
    <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
      <Header title="Squadre stabili" />
      <main className={dashboardMainClassName}>
        <DashboardPageContainer>{children}</DashboardPageContainer>
      </main>
    </div>
  </div>
);

export default function SquadreStabiliPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const { activeClub, userRole } = useAuth();
  const canManage = canManageClubConfiguration(String(activeClub?.role || userRole || ""));
  const clubId = activeClub?.id ? String(activeClub.id) : "";

  const [teams, setTeams] = React.useState<ClubTeamDto[]>([]);
  const [options, setOptions] = React.useState<TeamEditorOptions | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [optionsError, setOptionsError] = React.useState<string | null>(null);
  const [editing, setEditing] = React.useState<ClubTeamDto | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [fromCategoriesOpen, setFromCategoriesOpen] = React.useState(false);
  const [toDelete, setToDelete] = React.useState<ClubTeamDto | null>(null);
  const [deleting, setDeleting] = React.useState(false);
  const media = useWebsiteMediaAvailability(Boolean(clubId) && canManage);

  const loadTeams = React.useCallback(async () => {
    const response = await sportsApi.teams();
    if (response.error) {
      setError(response.error.message || "Impossibile leggere le squadre");
      return;
    }
    setError(null);
    setTeams(Array.isArray(response.data) ? response.data : []);
  }, []);

  const loadAll = React.useCallback(async () => {
    if (!clubId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    await Promise.all([
      loadTeams(),
      loadTeamEditorOptions(clubId)
        .then((next) => {
          setOptions(next);
          setOptionsError(null);
        })
        .catch((caught: unknown) => {
          setOptionsError(caught instanceof Error ? caught.message : "Impossibile leggere stagioni e categorie");
        }),
    ]);
    setLoading(false);
    /* La stagione mostrata e una dipendenza: cambiarla ricarica (ADR-0197). */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clubId, activeClub?.activeSeasonId, loadTeams]);

  React.useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const openCreate = () => {
    setEditing(null);
    setDrawerOpen(true);
  };

  const handleDelete = async () => {
    if (!toDelete || deleting) return;
    setDeleting(true);
    const response = await sportsApi.deleteTeam(toDelete.id);
    setDeleting(false);
    if (response.error) {
      showToast("error", response.error.message || "Impossibile eliminare la squadra");
      return;
    }
    showToast("success", `Squadra «${toDelete.name}» eliminata`);
    setTeams((current) => current.filter((team) => team.id !== toDelete.id));
    setToDelete(null);
  };

  const active = teams.filter((team) => team.active).length;
  const unlinked = teams.filter((team) => !team.seasonLinks.length).length;
  const canCreateFromCategories = canManage && Boolean(options && !options.seasonsMissing && options.seasons.length);

  return (
    <PageShell>
      <PageHeader
        eyebrow="Sport"
        title="Squadre stabili"
        description="Le squadre del club che restano le stesse da una stagione all'altra, con il loro indirizzo sul sito."
        stats={
          !loading && teams.length ? (
            <>
              <HeaderStat value={formatInteger(teams.length)} label={teams.length === 1 ? "squadra" : "squadre"} />
              <HeaderStat value={formatInteger(active)} label="attive" tone="green" />
              {unlinked ? <HeaderStat value={formatInteger(unlinked)} label="senza categoria" tone="amber" /> : null}
            </>
          ) : null
        }
        actions={
          <>
            <Button variant="text" icon={<ArrowLeft className="h-4 w-4" />} onClick={() => router.push("/categories")}>
              Categorie
            </Button>
            {canCreateFromCategories ? (
              <Button variant="secondary" icon={<Layers className="h-4 w-4" />} onClick={() => setFromCategoriesOpen(true)}>
                Crea dalle categorie della stagione
              </Button>
            ) : null}
            {canManage ? (
              <Button variant="primary" onClick={openCreate} disabled={!clubId}>
                Nuova squadra
              </Button>
            ) : null}
          </>
        }
      >
        {optionsError ? (
          <AlertBlock
            severity="warning"
            title="Stagioni e categorie non sono arrivate"
            actions={
              <Button variant="secondary" size="sm" onClick={() => void loadAll()}>
                Riprova
              </Button>
            }
          >
            {optionsError}. Le squadre si vedono, ma i collegamenti alle categorie non si possono modificare.
          </AlertBlock>
        ) : null}
      </PageHeader>

      <InfoCard eyebrow="Che cos'è una squadra stabile" className="mb-5">
        Una categoria appartiene a una stagione; la squadra invece resta. «Serie C» è la stessa squadra nel 2025/26 e nel
        2026/27, anche se ogni anno corrisponde a una categoria diversa del gestionale. Per ogni stagione si collega alla
        sua categoria e, se il club ha più sedi, a un gruppo operativo. Il sito pubblico usa la squadra per indirizzi che
        non cambiano, come <span className="egw-num font-semibold">/squadre/serie-c</span>, e le gare possono indicare
        quale squadra le gioca.
        {!canManage ? " Le squadre le configura la direzione del club: qui puoi consultarle." : ""}
      </InfoCard>

      {!clubId ? (
        <EmptyStateCard
          icon={<Users />}
          iconTone="red"
          title="Club non selezionato"
          description="Seleziona un club per vedere le sue squadre."
          primary={
            <Button variant="neutral" onClick={() => router.push("/dashboard")}>
              Vai alla Dashboard
            </Button>
          }
        />
      ) : loading ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2" aria-busy="true" aria-label="Caricamento delle squadre">
          {[0, 1, 2, 3].map((index) => (
            <Skeleton key={index} className="h-[150px] w-full rounded-egw-panel" />
          ))}
        </div>
      ) : error ? (
        <AlertBlock
          severity="danger"
          title="Non è stato possibile leggere le squadre"
          actions={
            <Button variant="secondary" size="sm" onClick={() => void loadAll()}>
              Riprova
            </Button>
          }
        >
          {error}
        </AlertBlock>
      ) : !teams.length ? (
        <EmptyStateCard
          icon={<Shield />}
          title="Nessuna squadra stabile"
          description={
            canManage
              ? "Crea la prima squadra, oppure parti dalle categorie della stagione: ne nasce una per categoria, da rinominare e correggere."
              : "Il club non ha ancora configurato le sue squadre."
          }
          primary={
            canManage ? (
              <Button variant="neutral" onClick={openCreate}>
                Nuova squadra
              </Button>
            ) : undefined
          }
          secondary={
            canCreateFromCategories ? (
              <Button variant="secondary" onClick={() => setFromCategoriesOpen(true)}>
                Crea dalle categorie della stagione
              </Button>
            ) : undefined
          }
        />
      ) : (
        <TeamsList
          teams={teams}
          options={options}
          canManage={canManage}
          onEdit={(team) => {
            setEditing(team);
            setDrawerOpen(true);
          }}
          onDelete={setToDelete}
        />
      )}

      {canManage ? (
        <>
          <TeamDrawer
            open={drawerOpen}
            onOpenChange={(open) => {
              setDrawerOpen(open);
              if (!open) setEditing(null);
            }}
            team={editing}
            options={options}
            media={media}
            onSaved={() => void loadTeams()}
          />
          <TeamsFromCategoriesModal
            open={fromCategoriesOpen}
            onOpenChange={setFromCategoriesOpen}
            seasons={options?.seasons || []}
            activeSeasonId={options?.activeSeasonId || null}
            onDone={() => void loadTeams()}
          />
          <DangerConfirmDialog
            open={Boolean(toDelete)}
            onOpenChange={(open) => {
              if (!open && !deleting) setToDelete(null);
            }}
            title={toDelete ? `Eliminare la squadra «${toDelete.name}»?` : "Eliminare la squadra?"}
            description="Se vuoi solo toglierla dal sito, disattivala: resta collegata alle sue gare e alle sue stagioni."
            consequences={[
              "Le gare che la indicavano restano al loro posto, con la loro categoria, ma senza squadra.",
              toDelete ? `L'indirizzo /squadre/${toDelete.slug} smette di rispondere sul sito.` : "Il suo indirizzo sul sito smette di rispondere.",
              "I collegamenti alle categorie delle stagioni si perdono; le categorie non si toccano.",
            ]}
            confirmLabel="Elimina"
            onConfirm={() => void handleDelete()}
            loading={deleting}
          />
        </>
      ) : null}
    </PageShell>
  );
}
