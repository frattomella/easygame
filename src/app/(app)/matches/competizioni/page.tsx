"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Shield, Trophy, Users } from "lucide-react";
import Sidebar from "@/components/dashboard/Sidebar";
import Header from "@/components/dashboard/Header";
import { DashboardPageContainer, dashboardMainClassName } from "@/components/dashboard/dashboard-page-container";
import { useAuth } from "@/components/providers/AuthProvider";
import { useToast } from "@/components/ui/toast-notification";
import { HeaderStat, PageHeader } from "@/components/web/page/PageHeader";
import { EmptyStateCard, InfoCard } from "@/components/web/page/Cards";
import { AlertBlock } from "@/components/web/page/Alerts";
import { Button } from "@/components/web/primitives/Button";
import { SegmentedControl, Skeleton } from "@/components/web/primitives/Controls";
import { Field, Select, TextInput } from "@/components/web/forms/Field";
import { DangerConfirmDialog } from "@/components/web/overlays/Modal";
import { formatInteger } from "@/lib/web/format";
import { roleHasPermission } from "@/lib/permissions/catalog";
import { sportsApi, type CompetitionDto, type OpponentDto } from "@/lib/sports/client";
import { CompetitionDrawer } from "@/components/sports/competitions/CompetitionDrawer";
import { OpponentDrawer } from "@/components/sports/competitions/OpponentDrawer";
import { CompetitionsList, OpponentsList } from "@/components/sports/competitions/CompetitionsLists";
import { loadCompetitionSeasons, type CompetitionSeasonOption } from "@/components/sports/competitions/competition-seasons";
import { useWebsiteMediaAvailability } from "@/components/sports/useWebsiteMediaAvailability";

/**
 * `/matches/competizioni` — competizioni e avversari del club (ADR-0200 §8).
 *
 * Due anagrafiche minime che danno un nome alle gare: in che campionato si
 * gioca e contro chi. La classifica di una competizione la inserisce il club;
 * EasyGame non la calcola, perche conosce solo le gare del club. Le gestisce
 * chi gestisce il calendario (`events.manage`); il server lo decide, qui le
 * azioni semplicemente non compaiono.
 */

type Tab = "competizioni" | "avversari";
const ALL = "__all__";
const NO_SEASON = "__none__";

const PageShell = ({ children }: { children: React.ReactNode }) => (
  <div className="flex h-[100dvh] bg-egw-page">
    <Sidebar />
    <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
      <Header title="Competizioni e avversari" />
      <main className={dashboardMainClassName}>
        <DashboardPageContainer>{children}</DashboardPageContainer>
      </main>
    </div>
  </div>
);

export default function CompetizioniPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const { activeClub, userRole } = useAuth();
  const canManage = roleHasPermission(String(activeClub?.role || userRole || ""), "events.manage");
  const clubId = activeClub?.id ? String(activeClub.id) : "";

  const [tab, setTab] = React.useState<Tab>("competizioni");
  const [competitions, setCompetitions] = React.useState<CompetitionDto[]>([]);
  const [opponents, setOpponents] = React.useState<OpponentDto[]>([]);
  const [seasons, setSeasons] = React.useState<CompetitionSeasonOption[]>([]);
  const [activeSeasonId, setActiveSeasonId] = React.useState<string | null>(null);
  const [seasonFilter, setSeasonFilter] = React.useState<string>(ALL);
  const [opponentQuery, setOpponentQuery] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [competitionsError, setCompetitionsError] = React.useState<string | null>(null);
  const [opponentsError, setOpponentsError] = React.useState<string | null>(null);

  const [competitionDrawer, setCompetitionDrawer] = React.useState<{ open: boolean; item: CompetitionDto | null }>({ open: false, item: null });
  const [opponentDrawer, setOpponentDrawer] = React.useState<{ open: boolean; item: OpponentDto | null }>({ open: false, item: null });
  const [competitionToDelete, setCompetitionToDelete] = React.useState<CompetitionDto | null>(null);
  const [opponentToDelete, setOpponentToDelete] = React.useState<OpponentDto | null>(null);
  const [deleting, setDeleting] = React.useState(false);
  const media = useWebsiteMediaAvailability(Boolean(clubId) && canManage);

  const loadCompetitions = React.useCallback(async () => {
    const response = await sportsApi.competitions();
    if (response.error) {
      setCompetitionsError(response.error.message || "Impossibile leggere le competizioni");
      return;
    }
    setCompetitionsError(null);
    setCompetitions(Array.isArray(response.data) ? response.data : []);
  }, []);

  const loadOpponents = React.useCallback(async () => {
    const response = await sportsApi.opponents();
    if (response.error) {
      setOpponentsError(response.error.message || "Impossibile leggere gli avversari");
      return;
    }
    setOpponentsError(null);
    setOpponents(Array.isArray(response.data) ? response.data : []);
  }, []);

  const loadAll = React.useCallback(async () => {
    if (!clubId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    await Promise.all([
      loadCompetitions(),
      loadOpponents(),
      loadCompetitionSeasons(clubId)
        .then((result) => {
          setSeasons(result.seasons);
          setActiveSeasonId(result.activeSeasonId);
        })
        .catch(() => {
          setSeasons([]);
          setActiveSeasonId(null);
        }),
    ]);
    setLoading(false);
  }, [clubId, loadCompetitions, loadOpponents]);

  React.useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const visibleCompetitions = React.useMemo(
    () =>
      seasonFilter === ALL
        ? competitions
        : competitions.filter((competition) => (seasonFilter === NO_SEASON ? !competition.seasonId : competition.seasonId === seasonFilter)),
    [competitions, seasonFilter],
  );
  const visibleOpponents = React.useMemo(() => {
    const query = opponentQuery.trim().toLowerCase();
    if (!query) return opponents;
    return opponents.filter((opponent) =>
      [opponent.name, opponent.shortName, opponent.city].join(" ").toLowerCase().includes(query),
    );
  }, [opponents, opponentQuery]);

  const handleDeleteCompetition = async () => {
    if (!competitionToDelete || deleting) return;
    setDeleting(true);
    const response = await sportsApi.deleteCompetition(competitionToDelete.id);
    setDeleting(false);
    if (response.error) {
      showToast("error", response.error.message || "Impossibile eliminare la competizione");
      return;
    }
    showToast("success", `Competizione «${competitionToDelete.name}» eliminata`);
    setCompetitions((current) => current.filter((item) => item.id !== competitionToDelete.id));
    setCompetitionToDelete(null);
  };

  const handleDeleteOpponent = async () => {
    if (!opponentToDelete || deleting) return;
    setDeleting(true);
    const response = await sportsApi.deleteOpponent(opponentToDelete.id);
    setDeleting(false);
    if (response.error) {
      showToast("error", response.error.message || "Impossibile eliminare l'avversario");
      return;
    }
    showToast("success", `Avversario «${opponentToDelete.name}» eliminato`);
    setOpponents((current) => current.filter((item) => item.id !== opponentToDelete.id));
    setOpponentToDelete(null);
  };

  const seasonFilterOptions = [
    { value: ALL, label: "Tutte le stagioni" },
    ...seasons.map((season) => ({ value: season.id, label: season.active ? `${season.label} (attiva)` : season.label })),
    ...(competitions.some((competition) => !competition.seasonId) ? [{ value: NO_SEASON, label: "Senza stagione" }] : []),
  ];

  return (
    <PageShell>
      <PageHeader
        eyebrow="Attività sportiva"
        title="Competizioni e avversari"
        description="In che campionato si gioca e contro chi: due elenchi che danno un nome alle gare e al sito del club."
        stats={
          !loading && clubId ? (
            <>
              <HeaderStat value={formatInteger(competitions.length)} label={competitions.length === 1 ? "competizione" : "competizioni"} />
              <HeaderStat value={formatInteger(opponents.length)} label={opponents.length === 1 ? "avversario" : "avversari"} />
            </>
          ) : null
        }
        actions={
          <>
            <Button variant="text" icon={<ArrowLeft className="h-4 w-4" />} onClick={() => router.push("/matches")}>
              Gare
            </Button>
            {canManage && clubId ? (
              tab === "competizioni" ? (
                <Button variant="primary" onClick={() => setCompetitionDrawer({ open: true, item: null })}>
                  Nuova competizione
                </Button>
              ) : (
                <Button variant="primary" onClick={() => setOpponentDrawer({ open: true, item: null })}>
                  Nuovo avversario
                </Button>
              )
            ) : null}
          </>
        }
      />

      {!clubId ? (
        <EmptyStateCard
          icon={<Users />}
          iconTone="red"
          title="Club non selezionato"
          description="Seleziona un club per vedere competizioni e avversari."
          primary={
            <Button variant="neutral" onClick={() => router.push("/dashboard")}>
              Vai alla Dashboard
            </Button>
          }
        />
      ) : (
        <>
          <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <SegmentedControl<Tab>
              aria-label="Elenco"
              mode="tabs"
              value={tab}
              onChange={setTab}
              options={[
                { value: "competizioni", label: "Competizioni", count: loading ? null : competitions.length },
                { value: "avversari", label: "Avversari", count: loading ? null : opponents.length },
              ]}
            />
            {tab === "competizioni" && seasons.length ? (
              <Field label="Stagione" htmlFor="competitions-season-filter" className="w-full sm:w-[240px]">
                <Select
                  id="competitions-season-filter"
                  value={seasonFilter}
                  onValueChange={setSeasonFilter}
                  options={seasonFilterOptions}
                />
              </Field>
            ) : null}
            {tab === "avversari" && opponents.length > 6 ? (
              <Field label="Cerca" htmlFor="opponents-search" className="w-full sm:w-[260px]">
                <TextInput
                  id="opponents-search"
                  type="search"
                  value={opponentQuery}
                  onChange={(event) => setOpponentQuery(event.target.value)}
                  placeholder="Nome, nome breve o città"
                />
              </Field>
            ) : null}
          </div>

          {!canManage ? (
            <InfoCard className="mb-5">Competizioni e avversari li gestisce chi gestisce il calendario delle gare: qui puoi consultarli.</InfoCard>
          ) : null}

          {loading ? (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2" aria-busy="true" aria-label="Caricamento">
              {[0, 1, 2, 3].map((index) => (
                <Skeleton key={index} className="h-[132px] w-full rounded-egw-panel" />
              ))}
            </div>
          ) : tab === "competizioni" ? (
            competitionsError ? (
              <AlertBlock
                severity="danger"
                title="Non è stato possibile leggere le competizioni"
                actions={
                  <Button variant="secondary" size="sm" onClick={() => void loadCompetitions()}>
                    Riprova
                  </Button>
                }
              >
                {competitionsError}
              </AlertBlock>
            ) : !visibleCompetitions.length ? (
              <EmptyStateCard
                icon={<Trophy />}
                iconTone="orange"
                title={competitions.length ? "Nessuna competizione in questa stagione" : "Nessuna competizione"}
                description={
                  competitions.length
                    ? "Cambia stagione o aggiungi una competizione."
                    : "Aggiungi il campionato, la coppa o il torneo a cui partecipa il club: le gare potranno indicarlo e il sito mostrarne la classifica."
                }
                primary={
                  canManage ? (
                    <Button variant="neutral" onClick={() => setCompetitionDrawer({ open: true, item: null })}>
                      Nuova competizione
                    </Button>
                  ) : undefined
                }
              />
            ) : (
              <CompetitionsList
                competitions={visibleCompetitions}
                seasons={seasons}
                canManage={canManage}
                onEdit={(item) => setCompetitionDrawer({ open: true, item })}
                onDelete={setCompetitionToDelete}
              />
            )
          ) : opponentsError ? (
            <AlertBlock
              severity="danger"
              title="Non è stato possibile leggere gli avversari"
              actions={
                <Button variant="secondary" size="sm" onClick={() => void loadOpponents()}>
                  Riprova
                </Button>
              }
            >
              {opponentsError}
            </AlertBlock>
          ) : !visibleOpponents.length ? (
            <EmptyStateCard
              icon={<Shield />}
              title={opponents.length ? "Nessun avversario trovato" : "Nessun avversario"}
              description={
                opponents.length
                  ? "Prova con un'altra ricerca."
                  : "Aggiungi le squadre che il club incontra: nome, città e logo compaiono nelle gare e sul sito."
              }
              primary={
                canManage && !opponents.length ? (
                  <Button variant="neutral" onClick={() => setOpponentDrawer({ open: true, item: null })}>
                    Nuovo avversario
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <OpponentsList
              opponents={visibleOpponents}
              canManage={canManage}
              onEdit={(item) => setOpponentDrawer({ open: true, item })}
              onDelete={setOpponentToDelete}
            />
          )}
        </>
      )}

      {canManage ? (
        <>
          <CompetitionDrawer
            open={competitionDrawer.open}
            onOpenChange={(open) => setCompetitionDrawer((current) => ({ open, item: open ? current.item : null }))}
            competition={competitionDrawer.item}
            seasons={seasons}
            defaultSeasonId={seasonFilter !== ALL && seasonFilter !== NO_SEASON ? seasonFilter : activeSeasonId}
            onSaved={() => void loadCompetitions()}
          />
          <OpponentDrawer
            open={opponentDrawer.open}
            onOpenChange={(open) => setOpponentDrawer((current) => ({ open, item: open ? current.item : null }))}
            opponent={opponentDrawer.item}
            media={media}
            onSaved={() => void loadOpponents()}
          />
          <DangerConfirmDialog
            open={Boolean(competitionToDelete)}
            onOpenChange={(open) => {
              if (!open && !deleting) setCompetitionToDelete(null);
            }}
            title={competitionToDelete ? `Eliminare «${competitionToDelete.name}»?` : "Eliminare la competizione?"}
            description="Se non si gioca più, puoi anche solo disattivarla: resta sulle gare che la indicano."
            consequences={[
              "Le gare che la indicavano restano al loro posto, senza competizione.",
              "La classifica inserita si perde e sparisce dal sito.",
            ]}
            confirmLabel="Elimina"
            onConfirm={() => void handleDeleteCompetition()}
            loading={deleting}
          />
          <DangerConfirmDialog
            open={Boolean(opponentToDelete)}
            onOpenChange={(open) => {
              if (!open && !deleting) setOpponentToDelete(null);
            }}
            title={opponentToDelete ? `Eliminare «${opponentToDelete.name}»?` : "Eliminare l'avversario?"}
            consequences={[
              "Le gare già giocate conservano il nome dell'avversario scritto sulla gara.",
              "Il logo e la scheda dell'avversario non compaiono più nelle gare e sul sito.",
            ]}
            confirmLabel="Elimina"
            onConfirm={() => void handleDeleteOpponent()}
            loading={deleting}
          />
        </>
      ) : null}
    </PageShell>
  );
}
