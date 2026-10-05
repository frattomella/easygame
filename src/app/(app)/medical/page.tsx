"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowUpRight,
  Bell,
  Download,
  Eye,
  FileHeart,
  FilePlus,
  MoreHorizontal,
  Send,
} from "lucide-react";
import Sidebar from "@/components/dashboard/Sidebar";
import Header from "@/components/dashboard/Header";
import {
  DashboardPageContainer,
  dashboardMainClassName,
} from "@/components/dashboard/dashboard-page-container";
import { AddCertificateForm } from "@/components/forms/AddCertificateForm";
import { useToast } from "@/components/ui/toast-notification";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/providers/AuthProvider";
import { apiRequest } from "@/lib/api/client";
import { getMedicalCertificateStatus } from "@/lib/medical-certificates";
import { getAthleteDisplayName } from "@/lib/athlete-name-utils";
import { getClubCategories, getClubData } from "@/lib/simplified-db";
import { downloadAttachment, openClientFileUrl } from "@/lib/client-files";
import {
  buildCategoryGroups,
  buildSiteIndex,
  getActiveClubSites,
  normalizeClubSites,
  type CategoryGroup,
  type ClubSite,
} from "@/lib/club-sites";
import { buildCategoryDisplayIndex } from "@/lib/categories/display";
import { PageHeader, HeaderStat } from "@/components/web/page/PageHeader";
import { AlertBlock } from "@/components/web/page/Alerts";
import { EmptyStateCard } from "@/components/web/page/Cards";
import { Button, IconButton } from "@/components/web/primitives/Button";
import {
  Menu,
  MenuContent,
  MenuItem,
  MenuTrigger,
} from "@/components/web/primitives/Overlays";
import { Skeleton } from "@/components/web/primitives/Controls";
import { DataGrid } from "@/components/web/datagrid/DataGrid";
import type { BulkActionDef, RowActionDef } from "@/components/web/datagrid/types";
import { formatInteger } from "@/lib/web/format";
import {
  buildCertificateFilters,
  buildCertificateRows,
  buildReminderPayload,
  CERTIFICATE_VIEW_IDS,
  CERTIFICATE_VIEWS,
  classifyReminderResponse,
  collectCertificateTypeOptions,
  countCertificatesByStatus,
  hasCertificateFile,
  isReminderEligible,
  REMINDER_MESSAGES,
  upsertCertificateByAthlete,
  type CertificateRow,
  type MedicalAthleteRecord,
  type MedicalCertificateRecord,
  type ReminderApiResponse,
  type ReminderOutcome,
} from "@/components/medical/v2/certificate-grid-model";
import { buildCertificateColumns } from "@/components/medical/v2/certificate-grid-columns";
import {
  ReminderBulkDrawer,
  type ReminderResult,
} from "@/components/medical/v2/reminder-bulk-drawer";

/*
  Certificati medici nel Web V2 (guideline 07, pattern 1 «Operational list»
  con il blocco di avviso): intestazione con i quattro numeri, l'avviso rosso
  per scaduti e mancanti e quello ambra per chi scade, poi **il** DataGrid.
  La logica dati e quella della V1 — stesse letture, stesso inserimento,
  stessa porta dei promemoria — e vive qui; cio che disegna le colonne, i
  filtri e le viste sta in `src/components/medical/v2/`.
*/
const VIEW_QUERY_IDS = new Set(Object.values(CERTIFICATE_VIEW_IDS));

export default function MedicalPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const { activeClub } = useAuth();

  const [clubId, setClubId] = useState<string | null>(null);
  const [clubResolved, setClubResolved] = useState(false);
  const [rows, setRows] = useState<CertificateRow[]>([]);
  const [athletes, setAthletes] = useState<MedicalAthleteRecord[]>([]);
  const [categoryOptions, setCategoryOptions] = useState<{ id: string; name: string; configured?: boolean | null }[]>([]);
  const [categoryGroups, setCategoryGroups] = useState<CategoryGroup[]>([]);
  const [sites, setSites] = useState<ClubSite[]>([]);
  /** Come si scrive una categoria in questa pagina (ADR-0185). */
  const categoryDisplay = useMemo(
    () => buildCategoryDisplayIndex({ categories: categoryOptions, groups: categoryGroups, sites }),
    [categoryOptions, categoryGroups, sites],
  );
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const [showCertificateDrawer, setShowCertificateDrawer] = useState(false);
  const [drawerAthlete, setDrawerAthlete] = useState<{ id: string; name: string } | null>(null);
  const [remindingAthleteId, setRemindingAthleteId] = useState<string | null>(null);
  const [bulkRows, setBulkRows] = useState<CertificateRow[]>([]);
  const [showBulkDrawer, setShowBulkDrawer] = useState(false);
  const [requestedViewId, setRequestedViewId] = useState<string | null>(null);

  // Fetch club ID from URL or active club
  useEffect(() => {
    const getClubId = async () => {
      try {
        // First check URL query parameter
        const searchParams = new URLSearchParams(window.location.search);
        const urlClubId = searchParams?.get("clubId");

        if (urlClubId) {
          setClubId(urlClubId);
          return;
        }

        // Then check active club from context
        if (activeClub?.id) {
          setClubId(activeClub.id);
          return;
        }

        // Then check localStorage for active club
        const storedActiveClub = localStorage.getItem("activeClub");
        if (storedActiveClub) {
          try {
            const parsedClub = JSON.parse(storedActiveClub);
            if (parsedClub.id) {
              setClubId(parsedClub.id);
              return;
            }
          } catch (e) {
            console.error("Error parsing active club:", e);
          }
        }
      } catch (error) {
        console.error("Error getting club ID:", error);
      } finally {
        setClubResolved(true);
      }
    };

    getClubId();
  }, [activeClub]);

  /*
    I parametri d'ingresso: `?action=new` apre il cassetto (la Dashboard ci
    arriva da «Registra certificato»), `?view=scaduti|mancanti|…` accende una
    vista. Entrambi si consumano e spariscono dall'indirizzo.
  */
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const action = params.get("action");
    const view = params.get("view");
    if (!action && !view) {
      return;
    }

    if (action === "new") {
      setDrawerAthlete(null);
      setShowCertificateDrawer(true);
    }
    if (view && VIEW_QUERY_IDS.has(view)) {
      setRequestedViewId(view);
    }

    params.delete("action");
    params.delete("view");
    const nextQuery = params.toString();
    const nextUrl = nextQuery
      ? `${window.location.pathname}?${nextQuery}`
      : window.location.pathname;
    window.history.replaceState(window.history.state, "", nextUrl);
  }, []);

  // Fetch medical certificates and athletes
  useEffect(() => {
    const fetchData = async () => {
      if (!clubId) return;

      setIsLoading(true);
      setLoadError(null);
      try {
        // Try to fetch from simplified_athletes first (new structure)
        let { data: athletesData, error: athletesError } = await supabase
          .from("simplified_athletes")
          .select("*")
          .eq("club_id", clubId);

        // If not found, try the athletes table (legacy structure)
        if (!athletesData || athletesData.length === 0) {
          const { data: legacyAthletes, error: legacyError } = await supabase
            .from("athletes")
            .select("*")
            .eq("organization_id", clubId);

          if (!legacyError && legacyAthletes) {
            athletesData = legacyAthletes;
            athletesError = null;
          }
        }

        if (athletesError) throw athletesError;
        const athleteRecords = (athletesData || []) as MedicalAthleteRecord[];
        setAthletes(athleteRecords);
        const [categoriesData, rawSites, rawGroups] = await Promise.all([
          getClubCategories(clubId),
          getClubData(clubId, "club_sites").catch(() => []),
          getClubData(clubId, "category_groups").catch(() => []),
        ]);
        setCategoryOptions(categoriesData);
        const normalizedSites = getActiveClubSites(normalizeClubSites(rawSites));
        setSites(normalizedSites);
        const groups = buildCategoryGroups({
          categories: categoriesData,
          sites: normalizeClubSites(rawSites),
          groups: rawGroups,
        });
        setCategoryGroups(groups);

        // Fetch medical certificates - only if we have athletes
        let certificatesData: MedicalCertificateRecord[] = [];
        if (athleteRecords.length > 0) {
          const athleteIds = athleteRecords
            .map((athlete) => athlete.id)
            .filter((id) => id.trim() !== "");

          if (athleteIds.length > 0) {
            const { data, error: certificatesError } = await supabase
              .from("medical_certificates")
              .select("*")
              .in("athlete_id", athleteIds);

            if (certificatesError) throw certificatesError;
            certificatesData = (data || []) as MedicalCertificateRecord[];
          }
        }

        setRows(
          buildCertificateRows({
            athletes: athleteRecords,
            certificates: certificatesData,
            categories: categoriesData,
            groups,
            siteIndex: normalizedSites.length ? buildSiteIndex(normalizedSites) : null,
          }),
        );
      } catch (error) {
        console.error("Error fetching data:", error);
        setLoadError("Non è stato possibile caricare l'elenco.");
        showToast("error", "Errore nel caricamento dei dati");
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [clubId, showToast, reloadToken]);

  const handleAddCertificate = async (certificateData: any) => {
    try {
      // Validate required data
      if (!certificateData.athleteId || !certificateData.organizationId) {
        showToast("error", "Dati mancanti per il salvataggio");
        return false;
      }

      // Validate athlete ID is a valid UUID
      if (
        !certificateData.athleteId ||
        certificateData.athleteId.trim() === ""
      ) {
        showToast("error", "ID atleta non valido");
        return false;
      }

      // Validate file upload
      if (!certificateData.fileUrl || certificateData.fileUrl.trim() === "") {
        showToast("error", "Il caricamento del file è obbligatorio");
        return false;
      }

      // Insert the new certificate into Supabase
      const { data, error } = await supabase
        .from("medical_certificates")
        .insert({
          organization_id: certificateData.organizationId,
          athlete_id: certificateData.athleteId,
          type: certificateData.certificateType,
          issue_date: certificateData.issueDate,
          expiry_date: certificateData.expiryDate,
          file_url: certificateData.fileUrl || null,
          status: getMedicalCertificateStatus(certificateData.expiryDate),
          notes: certificateData.certificateType,
          data: {
            source: "medical-page",
            uploaded_file_name: certificateData.fileName || null,
          },
        })
        .select()
        .single();

      if (error) throw error;

      if (data) {
        // Find the athlete
        const athlete = athletes.find(
          (a) => a.id === certificateData.athleteId,
        );
        const previous = rows.find((row) => row.athleteId === certificateData.athleteId);

        // Create the new certificate object
        const newCertificate: CertificateRow = {
          id: data.id,
          athleteId: certificateData.athleteId,
          athleteName: athlete
            ? getAthleteDisplayName(athlete)
            : certificateData.athleteName,
          certificateType: certificateData.certificateType,
          issueDate: certificateData.issueDate,
          expiryDate: certificateData.expiryDate,
          status: getMedicalCertificateStatus(certificateData.expiryDate),
          fileUrl: certificateData.fileUrl || "",
          avatar:
            athlete?.profile_image ||
            athlete?.data?.avatar ||
            "",
          categoryId: previous?.categoryId ?? null,
          categoryLabel: previous?.categoryLabel ?? "Senza categoria",
          siteIds: previous?.siteIds ?? [],
          siteName: previous?.siteName ?? "",
          athlete: athlete ?? previous?.athlete ?? null,
        };

        setRows((current) => upsertCertificateByAthlete(current, newCertificate));

        setAthletes((currentAthletes) =>
          currentAthletes.map((currentAthlete) => {
            if (currentAthlete.id !== certificateData.athleteId) {
              return currentAthlete;
            }

            const currentExpiry = currentAthlete.data?.medicalCertExpiry;
            const nextExpiry =
              currentExpiry &&
              new Date(currentExpiry).getTime() > new Date(certificateData.expiryDate).getTime()
                ? currentExpiry
                : certificateData.expiryDate;

            return {
              ...currentAthlete,
              data: {
                ...(currentAthlete.data || {}),
                medicalCertExpiry: nextExpiry,
              },
            };
          }),
        );

        try {
          const { updateAthlete } = await import("@/lib/simplified-db");
          const currentExpiry = athlete?.data?.medicalCertExpiry;
          const nextExpiry =
            currentExpiry &&
            new Date(currentExpiry).getTime() > new Date(certificateData.expiryDate).getTime()
              ? currentExpiry
              : certificateData.expiryDate;

          await updateAthlete(certificateData.athleteId, {
            data: {
              medicalCertExpiry: nextExpiry,
            },
          });
        } catch (syncError) {
          console.warn("Unable to sync athlete medical certificate summary:", syncError);
        }

        showToast(
          "success",
          `Certificato per ${newCertificate.athleteName} aggiunto con successo`,
        );

        return true;
      }

      return false;
    } catch (error) {
      console.error("Error adding certificate:", error);
      showToast("error", "Errore nell'aggiunta del certificato");
      return false;
    }
  };

  /* La stessa porta della V1: `POST /api/medical-certificate-reminders`, un atleta alla volta. */
  const postReminder = useCallback(
    async (row: CertificateRow): Promise<ReminderOutcome> => {
      if (!clubId) {
        return { kind: "failed", reason: "Club non selezionato" };
      }
      const response = await apiRequest<ReminderApiResponse>(
        "/api/medical-certificate-reminders",
        {
          method: "POST",
          body: buildReminderPayload(row, clubId),
        },
      );
      if (response.error) {
        return { kind: "failed", reason: response.error.message };
      }
      return classifyReminderResponse(response.data);
    },
    [clubId],
  );

  const handleSendReminder = async (row: CertificateRow) => {
    if (!clubId) {
      showToast("error", "Club non selezionato");
      return;
    }

    setRemindingAthleteId(row.athleteId);
    try {
      const outcome = await postReminder(row);
      if (outcome.kind === "failed") {
        showToast("error", outcome.reason || "Promemoria non inviato");
        return;
      }
      showToast(
        outcome.kind === "sent" ? "success" : "info",
        outcome.kind === "sent"
          ? REMINDER_MESSAGES.sent(row.athleteName)
          : outcome.kind === "already"
            ? REMINDER_MESSAGES.already
            : REMINDER_MESSAGES.no_recipients,
      );
    } finally {
      setRemindingAthleteId(null);
    }
  };

  const openBulkReminder = (targets: CertificateRow[]) => {
    if (!clubId) {
      showToast("error", "Club non selezionato");
      return;
    }
    setBulkRows(targets);
    setShowBulkDrawer(true);
  };

  const handleBulkFinished = (results: ReminderResult[]) => {
    const sent = results.filter((result) => result.outcome.kind === "sent").length;
    const failed = results.filter((result) => result.outcome.kind === "failed").length;
    showToast(
      failed ? "error" : sent ? "success" : "info",
      `Promemoria: ${formatInteger(sent)} inviati · ${formatInteger(results.length - sent - failed)} saltati · ${formatInteger(failed)} non riusciti`,
    );
  };

  const openCertificateDrawer = (row?: CertificateRow) => {
    setDrawerAthlete(row ? { id: row.athleteId, name: row.athleteName } : null);
    setShowCertificateDrawer(true);
  };

  const athleteHref = useCallback(
    (row: CertificateRow) =>
      `/athletes/${row.athleteId}${clubId ? `?clubId=${encodeURIComponent(clubId)}&tab=sanitari` : "?tab=sanitari"}#sanitari`,
    [clubId],
  );

  const viewFile = useCallback(
    (row: CertificateRow) => {
      if (!openClientFileUrl(row.fileUrl)) {
        showToast("error", "File del certificato non disponibile");
      }
    },
    [showToast],
  );

  const downloadFile = useCallback(
    (row: CertificateRow) => {
      if (
        !downloadAttachment(row.fileUrl, {
          documentType: `Certificato ${row.certificateType || "medico"}`,
          fullName: row.athleteName,
          date: row.expiryDate || row.issueDate,
        })
      ) {
        showToast("error", "File del certificato non disponibile");
      }
    },
    [showToast],
  );

  const counts = useMemo(() => countCertificatesByStatus(rows), [rows]);
  const blocking = useMemo(
    () => rows.filter((row) => row.status === "expired" || row.status === "missing"),
    [rows],
  );
  const expiring = useMemo(() => rows.filter((row) => row.status === "expiring"), [rows]);

  const columns = useMemo(
    () =>
      buildCertificateColumns({
        athleteHref,
        onOpenAthlete: (row) => router.push(athleteHref(row)),
        onView: viewFile,
        onDownload: downloadFile,
        showSite: sites.length > 0,
      }),
    [athleteHref, downloadFile, router, sites.length, viewFile],
  );

  const filters = useMemo(
    () =>
      buildCertificateFilters({
        categoryOptions,
        categoryLabel: (category) => categoryDisplay.label(category.id),
        sites: sites.map((site) => ({ id: site.id, name: site.name || site.id })),
        typeOptions: collectCertificateTypeOptions(rows),
      }),
    [categoryDisplay, categoryOptions, rows, sites],
  );

  const search = useMemo(
    () => ({
      placeholder: "Cerca atleti...",
      match: (row: CertificateRow, query: string) =>
        row.athleteName.toLowerCase().includes(query.toLowerCase()),
    }),
    [],
  );

  /*
    Le azioni di riga e di massa sono chiusure sullo stato corrente e si
    ricostruiscono a ogni render: la griglia le usa solo per disegnare.
  */
  const rowActions: RowActionDef<CertificateRow>[] = [
    {
      id: "apri",
      label: "Apri scheda",
      primary: true,
      icon: <ArrowUpRight />,
      onClick: (row) => router.push(athleteHref(row)),
    },
    {
      id: "registra",
      label: "Registra certificato",
      icon: <FilePlus />,
      hidden: (row) => row.status !== "missing",
      onClick: (row) => openCertificateDrawer(row),
    },
    {
      id: "aggiorna",
      label: "Aggiorna certificato",
      icon: <FilePlus />,
      hidden: (row) => row.status === "missing",
      onClick: (row) => openCertificateDrawer(row),
    },
    {
      id: "promemoria",
      label: "Invia promemoria",
      icon: <Send />,
      hidden: (row) => !isReminderEligible(row),
      onClick: (row) => {
        /* Un invio alla volta per atleta: il secondo clic mentre gira non ne fa due. */
        if (remindingAthleteId === row.athleteId) return;
        void handleSendReminder(row);
      },
    },
    {
      id: "visualizza",
      label: "Visualizza allegato",
      icon: <Eye />,
      hidden: (row) => !hasCertificateFile(row),
      onClick: viewFile,
    },
    {
      id: "scarica",
      label: "Scarica allegato",
      icon: <Download />,
      hidden: (row) => !hasCertificateFile(row),
      onClick: downloadFile,
    },
  ];

  const bulkActions: BulkActionDef<CertificateRow>[] = [
    {
      id: "promemoria",
      label: "Invia promemoria",
      icon: <Send />,
      onRun: (selected) => openBulkReminder(selected),
    },
  ];

  const archiveEmpty = !isLoading && !loadError && Boolean(clubId) && rows.length === 0;
  const overflowVisible = blocking.length > 0 || expiring.length > 0;

  return (
    <div className="flex h-[100dvh] bg-egw-page">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Header title="Certificati medici" />
        <main className={dashboardMainClassName}>
          <DashboardPageContainer>
            <PageHeader
              eyebrow="Area sanitaria"
              title="Certificati medici"
              description="Controlla e aggiorna lo stato dei certificati medici degli atleti."
              stats={
                clubId ? (
                  isLoading ? (
                    <Skeleton className="h-9 w-56" />
                  ) : (
                    <>
                      <HeaderStat
                        value={formatInteger(counts.valid)}
                        label="validi"
                        tone="green"
                        onClick={() => setRequestedViewId(CERTIFICATE_VIEW_IDS.valid)}
                      />
                      <HeaderStat
                        value={formatInteger(counts.expiring)}
                        label="in scadenza"
                        tone="amber"
                        onClick={() => setRequestedViewId(CERTIFICATE_VIEW_IDS.expiring)}
                      />
                      <HeaderStat
                        value={formatInteger(counts.expired)}
                        label="scaduti"
                        tone="red"
                        onClick={() => setRequestedViewId(CERTIFICATE_VIEW_IDS.expired)}
                      />
                      <HeaderStat
                        value={formatInteger(counts.missing)}
                        label="mancanti"
                        tone="red"
                        onClick={() => setRequestedViewId(CERTIFICATE_VIEW_IDS.missing)}
                      />
                    </>
                  )
                ) : null
              }
              actions={
                clubId ? (
                  <>
                    {overflowVisible ? (
                      <Menu>
                        <MenuTrigger asChild>
                          <IconButton aria-label="Altre azioni" variant="secondary" size="md">
                            <MoreHorizontal />
                          </IconButton>
                        </MenuTrigger>
                        <MenuContent align="end" width={260}>
                          {blocking.length ? (
                            <MenuItem onSelect={() => openBulkReminder(blocking)}>
                              <Bell />
                              Promemoria a scaduti e mancanti
                            </MenuItem>
                          ) : null}
                          {expiring.length ? (
                            <MenuItem onSelect={() => openBulkReminder(expiring)}>
                              <Bell />
                              Promemoria a chi scade
                            </MenuItem>
                          ) : null}
                        </MenuContent>
                      </Menu>
                    ) : null}
                    <Button
                      variant="primary"
                      icon={<FilePlus />}
                      onClick={() => openCertificateDrawer()}
                    >
                      Registra certificato
                    </Button>
                  </>
                ) : null
              }
            >
              {/*
                Gli avvisi azionabili (guideline 09 §9.6): il conteggio, la
                conseguenza e il verbo che risolve. «Registra certificato» e
                gia il primario di pagina, qui sopra: non si ripete.
              */}
              {!isLoading && blocking.length > 0 ? (
                <AlertBlock
                  severity="danger"
                  title={`${formatInteger(blocking.length)} ${blocking.length === 1 ? "certificato medico scaduto o mancante" : "certificati medici scaduti o mancanti"}`}
                  actions={
                    <>
                      <Button variant="neutral" size="sm" icon={<Send />} onClick={() => openBulkReminder(blocking)}>
                        Invia promemoria a tutti
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setRequestedViewId(CERTIFICATE_VIEW_IDS.expired)}
                      >
                        Vedi elenco
                      </Button>
                    </>
                  }
                >
                  Questi atleti non possono essere convocati finché il certificato non è registrato.
                </AlertBlock>
              ) : null}
              {!isLoading && expiring.length > 0 ? (
                <AlertBlock
                  severity="warning"
                  className={blocking.length > 0 ? "mt-3" : undefined}
                  title={`${formatInteger(expiring.length)} ${expiring.length === 1 ? "certificato medico in scadenza" : "certificati medici in scadenza"}`}
                  actions={
                    <>
                      <Button variant="neutral" size="sm" icon={<Send />} onClick={() => openBulkReminder(expiring)}>
                        Invia promemoria a tutti
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setRequestedViewId(CERTIFICATE_VIEW_IDS.expiring)}
                      >
                        Vedi elenco
                      </Button>
                    </>
                  }
                >
                  Entro un mese questi atleti non potranno più essere convocati.
                </AlertBlock>
              ) : null}
            </PageHeader>

            {!clubId && clubResolved ? (
              <EmptyStateCard
                icon={<FileHeart />}
                iconTone="red"
                title="Club non selezionato"
                description="Seleziona un club per controllare i certificati medici degli atleti"
                primary={
                  <Button variant="neutral" onClick={() => router.push("/dashboard")}>
                    Vai alla Dashboard
                  </Button>
                }
              />
            ) : archiveEmpty ? (
              <EmptyStateCard
                icon={<FileHeart />}
                title="Nessun atleta in archivio"
                description="I certificati medici seguono gli atleti: aggiungi il primo atleta e da qui potrai registrarne il certificato."
                primary={
                  <Button variant="neutral" onClick={() => router.push("/athletes?action=new")}>
                    Aggiungi il primo atleta
                  </Button>
                }
              />
            ) : (
              <DataGrid<CertificateRow>
                module="certificati"
                aria-label="Elenco certificati medici"
                rows={rows}
                getRowId={(row) => row.id}
                rowLabel={(row) => row.athleteName}
                columns={columns}
                filters={filters}
                views={CERTIFICATE_VIEWS}
                search={search}
                defaultSort={{ columnId: "atleta", direction: "asc" }}
                bulkActions={bulkActions}
                rowActions={rowActions}
                onOpenRow={(row) => router.push(athleteHref(row))}
                requestedViewId={requestedViewId}
                state={loadError ? "error" : isLoading ? "loading" : "ready"}
                errorMessage={loadError}
                onRetry={() => setReloadToken((token) => token + 1)}
                empty={{
                  icon: <FileHeart />,
                  title: "Nessun certificato trovato",
                  description: "Prova a modificare i filtri di ricerca",
                }}
                noun={{ singular: "certificato", plural: "certificati" }}
              />
            )}
          </DashboardPageContainer>
        </main>
      </div>

      <AddCertificateForm
        presentation="drawer"
        isOpen={showCertificateDrawer}
        onClose={() => {
          setShowCertificateDrawer(false);
          setDrawerAthlete(null);
        }}
        onSubmit={handleAddCertificate}
        athletes={athletes.map((athlete) => ({
          id: athlete.id,
          name: getAthleteDisplayName(athlete) || "Atleta",
        }))}
        clubId={clubId}
        athleteId={drawerAthlete?.id ?? null}
        athleteName={drawerAthlete?.name ?? null}
        lockAthleteSelection={Boolean(drawerAthlete)}
      />

      <ReminderBulkDrawer
        open={showBulkDrawer}
        onOpenChange={setShowBulkDrawer}
        rows={bulkRows}
        send={postReminder}
        onFinished={handleBulkFinished}
      />
    </div>
  );
}
