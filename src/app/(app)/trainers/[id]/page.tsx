"use client";

import React, { useState, useEffect } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Camera, CheckCircle2, Circle, Pencil, Trash2, UserCheck, UserX } from "lucide-react";
import Sidebar from "@/components/dashboard/Sidebar";
import Header from "@/components/dashboard/Header";
import {
  DashboardPageContainer,
  dashboardMainClassName,
} from "@/components/dashboard/dashboard-page-container";
import { useBreadcrumbLabel } from "@/components/web/shell/ShellProvider";
import {
  RecordAlertStrip,
  RecordAreaSwitcher,
  RecordHeader,
  type RecordAction,
} from "@/components/web/record/Record";
import { DetailCard, EmptyStateCard, type DetailField } from "@/components/web/page/Cards";
import { AlertBlock } from "@/components/web/page/Alerts";
import { Panel, PanelHeader, InsetBlock } from "@/components/web/primitives/Surface";
import { Button } from "@/components/web/primitives/Button";
import { DataChip, StatusPill } from "@/components/web/primitives/StatusPill";
import { Skeleton } from "@/components/web/primitives/Controls";
import { DateInput, Field, FormGrid, Select } from "@/components/web/forms/Field";
import { Drawer } from "@/components/web/overlays/Drawer";
import { ConfirmDialog, DangerConfirmDialog } from "@/components/web/overlays/Modal";
import { formatDateShort, formatMoney, joinMeta, MISSING } from "@/lib/web/format";
import { AvatarUpload } from "@/components/ui/avatar-upload";
import { useToast } from "@/components/ui/toast-notification";
import { PersonCompensationTab } from "@/components/sport-work/PersonCompensationTab";
import { CertificateAttachmentField } from "@/components/forms/certificate-attachment-field";
import { ClothingSizesSummary } from "@/components/forms/clothing-sizes-fields";
import { TrainerDocumentsPanel } from "@/components/trainer/trainer-documents-panel";
import { TrainerSectionDrawer, type TrainerSection } from "@/components/trainer/v2/trainer-section-drawer";
import { TrainerAccessPanel } from "@/components/trainer/v2/trainer-access-panel";
import { TrainerPaymentsPanel, type TrainerPayment } from "@/components/trainer/v2/trainer-payments-panel";
import {
  TOKEN_EXPIRY_HOURS,
  TRAINER_AREAS,
  createTrainerAccessToken,
  deriveTrainerRecordAlerts,
  formatTrainerAccessToken,
  medicalVisitStatus,
  normalizeTrainerStatusValue,
  resolveTrainerAccess,
  resolveTrainerArea,
  trainerStatusSpec,
  type TrainerArea,
} from "@/components/trainer/v2/trainer-record-model";
import { supabase } from "@/lib/supabase";
import { apiRequest } from "@/lib/api/client";
import {
  getTrainerDocumentsFromRecord,
  resolveTrainerDocumentStatus,
  type TrainerDocument,
} from "@/lib/trainer-documents";
import { paymentDateOf, sortByDateDesc } from "@/lib/sorting";
import {
  DEFAULT_MEDICAL_VISIT_TYPE,
  medicalVisitTypeOptions,
  normalizeMedicalVisitType,
} from "@/lib/medical-visits";
import {
  deleteStaffMember,
  addTrainerPayment,
  updateTrainerPayment,
  deleteTrainerPayment,
} from "@/lib/simplified-db";
import {
  getTrainerCategoryIds,
  getTrainerDisplayName,
  getTrainerGroupIds,
  normalizeTrainerCategories,
} from "@/lib/trainer-utils";
import { normalizeClubSeasons, type ClubSeason } from "@/lib/club-seasons";
import { useAuth } from "@/components/providers/AuthProvider";
import {
  mergeTrainerAssignmentsForSeason,
  splitTrainerAssignmentsBySeason,
} from "@/lib/trainers/season-assignments";
import {
  buildCategoryGroups,
  compareCategoryGroups,
  normalizeClubSites,
  type CategoryGroup,
  labelCategoryGroupOptions,
} from "@/lib/club-sites";
import { buildCategoryDisplayIndex } from "@/lib/categories/display";
import { todayLocalDateOnly } from "@/lib/date-only";

/**
 * La scheda allenatore nel Web V2 (pattern 2, guideline 09 §9.8):
 * intestazione con identita, chip e pillola di stato, striscia degli avvisi,
 * quattro aree al posto delle sette tab della V1, sezioni in sola lettura con
 * la modifica in un cassetto. Le letture e le scritture sono quelle della V1.
 *
 * Tab V1 → area V2: Anagrafica → Profilo · Dati Societari → Club e accesso
 * (categorie, tesseramento) e Profilo (taglie) e Documenti (documenti) ·
 * Accesso Account → Club e accesso · Dati Medici → Documenti e sanita ·
 * Pagamenti → Lavoro e compensi · Lavoro e compensi → Lavoro e compensi ·
 * Presenze → rimossa (mai popolata: nessuna lettura la alimentava).
 */
const genderLabel = (value: unknown) => {
  const normalized = String(value ?? "").trim().toUpperCase();
  if (normalized === "M") return "Maschio";
  if (normalized === "F") return "Femmina";
  return String(value ?? "").trim();
};

export default function TrainerDetailsPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { showToast } = useToast();
  const trainerId = params?.id as string;
  const clubIdFromParams = searchParams?.get("clubId");
  const [clubId, setClubId] = useState<string | null>(clubIdFromParams || null);
  const [isLoading, setIsLoading] = useState(true);
  const [categories, setCategories] = useState<any[]>([]);
  const [categoryGroups, setCategoryGroups] = useState<CategoryGroup[]>([]);
  const [trainer, setTrainer] = React.useState<any>(null);
  /**
   * Le stagioni del club e la stagione scelta (ADR-0197 §18): le squadre
   * mostrate come attuali sono quelle di questa stagione; le altre sono
   * storico, con la loro etichetta. Il catalogo letto sotto e di tutte le
   * stagioni, e serve proprio a riconoscere lo storico.
   */
  const [seasonState, setSeasonState] = useState<{
    seasons: ClubSeason[];
    activeSeasonId: string | null;
    legacySeasonId: string | null;
  }>({ seasons: [], activeSeasonId: null, legacySeasonId: null });
  const { activeClub } = useAuth();
  const selectedSeasonId = React.useMemo(() => {
    if (!seasonState.seasons.length) return null;
    /* Dal contesto, come l'elenco: un cambio di stagione arriva anche alla scheda aperta (revisione D-L3). */
    const dichiarata = String(activeClub?.activeSeasonId || "").trim();
    return seasonState.seasons.some((season) => season.id === dichiarata)
      ? dichiarata
      : seasonState.activeSeasonId;
  }, [activeClub?.activeSeasonId, seasonState]);
  const selectedSeasonLabel =
    seasonState.seasons.find((season) => season.id === selectedSeasonId)?.label || null;
  const seasonInput = React.useMemo(
    () => ({
      categories,
      groups: categoryGroups.map((group) => ({ id: group.id, categoryId: group.categoryId })),
      seasons: seasonState.seasons,
      seasonId: selectedSeasonId,
      legacySeasonId: seasonState.legacySeasonId,
    }),
    [categories, categoryGroups, seasonState, selectedSeasonId],
  );
  /** Le assegnazioni spaccate per stagione, dal record grezzo. */
  const assignments = React.useMemo(
    () => splitTrainerAssignmentsBySeason({ ...seasonInput, trainer: trainer?.raw || trainer }),
    [seasonInput, trainer],
  );
  /** Le categorie della stagione scelta: cio che l'editor offre (ADR-0197 §20). */
  const seasonCategories = React.useMemo(() => {
    if (!selectedSeasonId) return categories;
    const known = new Set(seasonState.seasons.map((season) => season.id));
    return categories.filter((category: any) => {
      const own = String(category?.seasonId || "").trim();
      return (own && known.has(own) ? own : seasonState.legacySeasonId) === selectedSeasonId;
    });
  }, [categories, seasonState, selectedSeasonId]);

  /*
    I documenti dell'allenatore stanno **dentro** il suo record e i byte in
    Attachment Core: vedi src/lib/trainer-documents.ts.
  */
  const [trainerDocuments, setTrainerDocuments] = useState<TrainerDocument[]>([]);
  /** Visita medica: tipologia, scadenza e certificato, uno stato solo. */
  const [medicalVisit, setMedicalVisit] = useState<{ type: string; expiry: string; file: string | null }>({
    type: DEFAULT_MEDICAL_VISIT_TYPE,
    expiry: "",
    file: null,
  });
  const [certificateFiles, setCertificateFiles] = useState<{ [key: string]: string }>({});
  const [payments, setPayments] = React.useState<TrainerPayment[]>([]);

  const [editingSection, setEditingSection] = useState<TrainerSection | null>(null);
  const [editInitialValues, setEditInitialValues] = useState<Record<string, any>>({});
  const [photoOpen, setPhotoOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [suspendOpen, setSuspendOpen] = useState(false);
  const [statusBusy, setStatusBusy] = useState(false);

  /* Le aree: `?area=` nuovo, `?tab=` vecchio, entrambi accettati. */
  const [area, setAreaState] = useState<TrainerArea>(() =>
    resolveTrainerArea(searchParams?.get("area") || searchParams?.get("tab")),
  );
  const setArea = (next: TrainerArea) => {
    setAreaState(next);
    const query = new URLSearchParams();
    if (clubId) query.set("clubId", clubId);
    query.set("area", next);
    router.replace(`/trainers/${trainerId}?${query.toString()}`, { scroll: false });
  };

  // Get clubId from localStorage if not in URL params
  useEffect(() => {
    if (!clubIdFromParams && typeof window !== "undefined") {
      const storedClub = localStorage.getItem("activeClub");
      if (storedClub) {
        try {
          const parsed = JSON.parse(storedClub);
          if (parsed?.id) setClubId(parsed.id);
        } catch (e) {
          console.error("Error parsing activeClub from localStorage", e);
        }
      }
    }
  }, [clubIdFromParams]);

  // Fetch trainer data from database
  useEffect(() => {
    const fetchTrainerData = async () => {
      if (!clubId || clubId === "null" || clubId.trim() === "") {
        setIsLoading(false);
        return;
      }
      if (!trainerId) {
        console.error("Missing trainerId parameter");
        showToast("error", "ID dell'allenatore mancante");
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      try {
        const { data: clubData, error: clubError } = await supabase
          .from("clubs")
          .select("categories, trainers, staff_members, club_sites, category_groups, settings")
          .eq("id", clubId)
          .maybeSingle();

        if (clubError) {
          console.error("Error fetching club data:", clubError);
          showToast("error", `Errore nel caricamento dei dati del club: ${clubError.message}`);
          setIsLoading(false);
          return;
        }
        if (!clubData) {
          console.error("Club data not found for clubId:", clubId);
          showToast("error", "Club non trovato. Verifica l'ID del club.");
          setIsLoading(false);
          return;
        }

        const clubCategories = clubData?.categories || [];
        setCategories(clubCategories);
        const stagioni = normalizeClubSeasons(clubData?.settings || {});
        setSeasonState(
          stagioni.isFallback
            ? { seasons: [], activeSeasonId: null, legacySeasonId: null }
            : { seasons: stagioni.seasons, activeSeasonId: stagioni.activeSeasonId, legacySeasonId: stagioni.legacySeasonId },
        );
        setCategoryGroups(
          buildCategoryGroups({
            categories: clubCategories,
            sites: normalizeClubSites(clubData?.club_sites),
            groups: clubData?.category_groups,
          }),
        );

        // L'allenatore vive in `trainers` o, per i piu vecchi, in `staff_members`.
        let trainerData = null;
        if (Array.isArray(clubData?.trainers)) {
          trainerData = clubData.trainers.find((item: any) => item.id === trainerId);
        }
        if (!trainerData && Array.isArray(clubData?.staff_members)) {
          trainerData = clubData.staff_members.find(
            (staff: any) => staff.id === trainerId && (staff.role === "trainer" || staff.role === "allenatore"),
          );
        }
        if (!trainerData) {
          console.error("Trainer not found in club data. TrainerId:", trainerId);
          showToast("error", "Allenatore non trovato");
          setIsLoading(false);
          return;
        }

        const trainerCategories = normalizeTrainerCategories(trainerData.categories, clubCategories);

        setTrainer({
          id: trainerData.id,
          // Anagrafica
          name: getTrainerDisplayName(trainerData),
          firstName: trainerData.firstName || trainerData.first_name || "",
          lastName: trainerData.lastName || trainerData.last_name || trainerData.surname || "",
          surname: trainerData.surname || trainerData.lastName || trainerData.last_name || "",
          age: trainerData.age || "",
          birthDate: trainerData.birthDate || "",
          nationality: trainerData.nationality || "Italiana",
          birthPlace: trainerData.birthPlace || "",
          birthPlaceCode: trainerData.birthPlaceCode || "",
          gender: trainerData.gender || "",
          education: trainerData.education || "",
          notes: trainerData.notes || "",
          // Documento di identita
          documentType: trainerData.documentType || "",
          documentNumber: trainerData.documentNumber || "",
          documentExpiry: trainerData.documentExpiry || "",
          documentIssueDate: trainerData.documentIssueDate || "",
          residencePermitExpiry: trainerData.residencePermitExpiry || "",
          // Contatti
          email: trainerData.email || "",
          phone: trainerData.phone || "",
          address: trainerData.address || "",
          city: trainerData.city || "",
          postalCode: trainerData.postalCode || "",
          // Pagamenti
          iban: trainerData.iban || "",
          salary: trainerData.salary?.toString() || "0",
          // Dati societari
          role: trainerData.role || "Allenatore",
          status: normalizeTrainerStatusValue(trainerData.status),
          isMember: trainerData.isMember || false,
          membershipNumber: trainerData.membershipNumber || "",
          membershipDate: trainerData.membershipDate || "",
          clothingSizes: trainerData.clothingSizes || null,
          // Dati medici
          medicalVisitExpiry: trainerData.medicalVisitExpiry || "",
          medicalVisitType: trainerData.medicalVisitType || "",
          hasBlsd: trainerData.hasBlsd || false,
          hasFirstAid: trainerData.hasFirstAid || false,
          hasFireSafety: trainerData.hasFireSafety || false,
          healthCard: trainerData.healthCard || "",
          pathologies: trainerData.pathologies || "",
          insurance: trainerData.insurance || "",
          allergies: trainerData.allergies || "",
          /*
            La data di inizio si e sempre chiamata in due modi (`hireDate`
            alla creazione, `startDate` alla modifica): si legge la prima
            delle due che c'e, e si scrivono entrambe.
          */
          startDate: trainerData.startDate || trainerData.hireDate || "",
          bio: trainerData.bio || "Allenatore professionista",
          avatar: trainerData.avatar || null,
          categories: trainerCategories,
          groupIds: getTrainerGroupIds(trainerData),
          /* Il record com'e in archivio: le assegnazioni si spaccano per stagione da qui (ADR-0197). */
          raw: { categories: trainerData.categories, groupIds: getTrainerGroupIds(trainerData) },
          fiscalCode: trainerData.fiscalCode || "",
          accessTokenValue: trainerData.accessTokenValue || trainerData.access_token_value || trainerData.token || "",
          accessTokenRecordId: trainerData.accessTokenRecordId || trainerData.access_token_record_id || null,
          accessTokenStatus:
            trainerData.accessTokenStatus ||
            trainerData.access_token_status ||
            (trainerData.linkedUserId || trainerData.linked_user_id ? "linked" : ""),
          accessTokenExpiresAt: trainerData.accessTokenExpiresAt || trainerData.access_token_expires_at || null,
          accessTokenGeneratedAt: trainerData.accessTokenGeneratedAt || trainerData.access_token_generated_at || null,
          accessTokenRedeemedAt: trainerData.accessTokenRedeemedAt || trainerData.access_token_redeemed_at || null,
          linkedUserId: trainerData.linkedUserId || trainerData.linked_user_id || null,
          linkedUserEmail: trainerData.linkedUserEmail || trainerData.linked_user_email || "",
          linkedAt: trainerData.linkedAt || trainerData.linked_at || null,
        });

        // Compensi e contratti sono eventi nel tempo: si leggono dall'ultimo.
        setPayments(sortByDateDesc(trainerData.payments || [], paymentDateOf));
        setTrainerDocuments(getTrainerDocumentsFromRecord(trainerData));
        setCertificateFiles(trainerData.certificateFiles || {});
        setMedicalVisit({
          type: normalizeMedicalVisitType(trainerData.medicalVisitType),
          expiry: trainerData.medicalVisitExpiry || "",
          file: trainerData.medicalVisitFile || null,
        });
      } catch (error) {
        console.error("Error fetching trainer data:", error);
        showToast("error", "Errore nel caricamento dei dati dell'allenatore");
      } finally {
        setIsLoading(false);
      }
    };

    void fetchTrainerData();
  }, [clubId, trainerId, showToast]);

  const [isGeneratingAccessToken, setIsGeneratingAccessToken] = useState(false);
  const [isLoadingAccessData, setIsLoadingAccessData] = useState(false);
  const [isDisconnectingAccess, setIsDisconnectingAccess] = useState(false);
  const [linkedAccountDetails, setLinkedAccountDetails] = useState<any | null>(null);
  const [linkedMembershipDetails, setLinkedMembershipDetails] = useState<any | null>(null);
  const [tokenDetails, setTokenDetails] = useState<any | null>(null);

  const trainerHeaderName = React.useMemo(() => {
    if (!trainer) return "";
    const fullName = String(trainer.name || "").trim();
    const surname = String(trainer.surname || "").trim();
    if (!surname) return fullName;
    return fullName.toLowerCase().endsWith(surname.toLowerCase()) ? fullName : `${fullName} ${surname}`.trim();
  }, [trainer]);

  useBreadcrumbLabel(trainerHeaderName || null);

  const access = React.useMemo(() => resolveTrainerAccess(trainer), [trainer]);

  const refreshAccessControlData = async (trainerSnapshot?: any) => {
    const currentTrainer = trainerSnapshot || trainer;
    if (!clubId || !currentTrainer) {
      setLinkedAccountDetails(null);
      setLinkedMembershipDetails(null);
      setTokenDetails(null);
      return;
    }
    setIsLoadingAccessData(true);
    try {
      const headers = { "x-active-club-id": clubId };
      let nextTokenDetails: any | null = null;
      let nextAccountDetails: any | null = null;
      let nextMembershipDetails: any | null = null;

      if (currentTrainer.accessTokenRecordId) {
        const tokenResponse = await apiRequest<any>(`/api/v1/access_tokens/${currentTrainer.accessTokenRecordId}`, {
          method: "GET",
          headers,
        });
        if (!tokenResponse.error) nextTokenDetails = tokenResponse.data;
      }

      if (currentTrainer.linkedUserId) {
        const [userResponse, membershipResponse] = await Promise.all([
          apiRequest<any>(`/api/v1/users/${currentTrainer.linkedUserId}`, { method: "GET", headers }),
          apiRequest<any[]>(
            `/api/v1/organization_users?organization_id=${encodeURIComponent(clubId)}&user_id=${encodeURIComponent(currentTrainer.linkedUserId)}&role=trainer`,
            { method: "GET", headers },
          ),
        ]);
        if (!userResponse.error) nextAccountDetails = userResponse.data;
        if (!membershipResponse.error) {
          nextMembershipDetails = Array.isArray(membershipResponse.data) ? membershipResponse.data[0] || null : null;
        }
      }

      setTokenDetails(nextTokenDetails);
      setLinkedAccountDetails(nextAccountDetails);
      setLinkedMembershipDetails(nextMembershipDetails);
    } catch (error) {
      console.error("Error loading trainer access data:", error);
    } finally {
      setIsLoadingAccessData(false);
    }
  };

  useEffect(() => {
    void refreshAccessControlData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clubId, trainer?.accessTokenRecordId, trainer?.linkedUserId]);

  /**
   * Le squadre a cui si puo assegnare un allenatore: solo quelle di categorie
   * che hanno **piu** di una squadra (ADR-0055).
   */
  /** Come si scrive una categoria in questa pagina (ADR-0185). */
  const categoryDisplay = React.useMemo(
    () => buildCategoryDisplayIndex({ categories, groups: categoryGroups }),
    [categories, categoryGroups],
  );

  const assignableGroups = React.useMemo(() => {
    const counts = new Map<string, number>();
    categoryGroups.forEach((group) => {
      if (!group.active) return;
      counts.set(group.categoryId, (counts.get(group.categoryId) || 0) + 1);
    });
    return categoryGroups
      .filter((group) => group.active && (counts.get(group.categoryId) || 0) > 1)
      .sort(compareCategoryGroups);
  }, [categoryGroups]);

  /* I gruppi seguiti con la regola condivisa (ADR-0185): la sede quando il nome ne nomina due, come nell'elenco atleti. */
  const followedGroupLabels: string[] = React.useMemo(() => {
    const etichetta = labelCategoryGroupOptions(categoryGroups);
    return assignments.current.groupIds
      .map((groupId: string): CategoryGroup | undefined =>
        categoryGroups.find((group) => String(group.id) === String(groupId)),
      )
      .filter((group: CategoryGroup | undefined): group is CategoryGroup => Boolean(group))
      .map((group: CategoryGroup) => etichetta(group));
  }, [assignments, categoryGroups]);
  /** Le categorie attuali, con l'etichetta della pagina. */
  const currentCategoryLabels: string[] = React.useMemo(
    () => assignments.current.categoryIds.map((categoryId) => categoryDisplay.label(categoryId)),
    [assignments, categoryDisplay],
  );
  /** Lo storico per stagione: «2025/26: U15 Gold». */
  const historyLabels: string[] = React.useMemo(() => {
    const etichetta = labelCategoryGroupOptions(categoryGroups);
    return assignments.history.map((entry) => {
      const gruppi = entry.groupIds
        .map((groupId) => categoryGroups.find((group) => String(group.id) === String(groupId)))
        .filter((group): group is CategoryGroup => Boolean(group))
        .map((group) => etichetta(group));
      const squadre = gruppi.length ? gruppi : entry.categoryIds.map((id) => categoryDisplay.label(id));
      return `${entry.seasonLabel}: ${squadre.join(", ")}`;
    });
  }, [assignments.history, categoryDisplay, categoryGroups]);

  const handleEditSection = (section: TrainerSection) => {
    setEditInitialValues({
      ...trainer,
      /* L'editor mostra e modifica la stagione scelta: lo storico non si tocca (ADR-0197 §20). */
      categoryIds: assignments.current.categoryIds,
      groupIds: assignments.current.groupIds,
    });
    setEditingSection(section);
  };

  const updateTrainerRecord = async (updates: Record<string, any>) => {
    if (!clubId || !trainerId) throw new Error("Allenatore non valido");
    const { updateClubDataItem } = await import("@/lib/simplified-db");
    try {
      await updateClubDataItem(clubId, "trainers", trainerId, updates);
    } catch {
      await updateClubDataItem(clubId, "staff_members", trainerId, updates);
    }
  };

  const copyAccessToken = async (tokenValue?: string | null) => {
    const normalizedToken = String(tokenValue || "").trim();
    if (!normalizedToken) {
      showToast("error", "Genera prima un token di accesso");
      return false;
    }
    try {
      await navigator.clipboard.writeText(formatTrainerAccessToken(normalizedToken));
      showToast("success", "Token copiato negli appunti");
      return true;
    } catch (error) {
      console.error("Error copying trainer token:", error);
      showToast("error", "Impossibile copiare il token");
      return false;
    }
  };

  const handleGenerateAccessToken = async () => {
    if (!clubId || !trainerId || !trainer) {
      showToast("error", "Allenatore non valido");
      return;
    }
    setIsGeneratingAccessToken(true);
    try {
      const nowIso = new Date().toISOString();
      const expiresAt = new Date(Date.now() + TOKEN_EXPIRY_HOURS * 60 * 60 * 1000).toISOString();
      const tokenValue = createTrainerAccessToken();
      const headers = { "x-active-club-id": clubId };

      if (trainer.accessTokenRecordId) {
        const expireResponse = await apiRequest(`/api/v1/access_tokens/${trainer.accessTokenRecordId}`, {
          method: "PATCH",
          headers,
          body: {
            status: "expired",
            date: nowIso,
            expired_at: nowIso,
            superseded_at: nowIso,
            superseded_by_trainer_id: trainerId,
          },
        });
        if (expireResponse.error) throw new Error(expireResponse.error.message);
      }

      const createResponse = await apiRequest<any>("/api/v1/access_tokens", {
        method: "POST",
        headers,
        body: {
          organization_id: clubId,
          name: tokenValue,
          status: "active",
          date: expiresAt,
          role: "trainer",
          one_time: true,
          token_type: "trainer_access",
          usage_context: "trainer_account_link",
          trainer_id: trainerId,
          trainer_name: trainerHeaderName || getTrainerDisplayName(trainer),
          trainer_email: trainer.email || null,
          trainer_phone: trainer.phone || null,
          expires_at: expiresAt,
          generated_at: nowIso,
        },
      });
      if (createResponse.error || !createResponse.data?.id) {
        throw new Error(createResponse.error?.message || "Errore nella generazione del token");
      }

      const accessState = {
        accessTokenRecordId: createResponse.data.id,
        accessTokenValue: tokenValue,
        accessTokenStatus: "active",
        accessTokenExpiresAt: expiresAt,
        accessTokenGeneratedAt: nowIso,
        accessTokenRedeemedAt: null,
        linkedUserId: null,
        linkedUserEmail: "",
        linkedAt: null,
        token: tokenValue,
      };

      await updateTrainerRecord(accessState);
      const nextTrainerState = { ...(trainer || {}), ...accessState };
      setTrainer((previous: any) => ({ ...previous, ...accessState }));
      await refreshAccessControlData(nextTrainerState);
      await copyAccessToken(tokenValue);
      showToast("success", "Token allenatore generato. L'allenatore dovrà inserirlo nella home account, sezione accessi.");
    } catch (error: any) {
      console.error("Error generating trainer access token:", error);
      showToast("error", error?.message || "Errore nella generazione del token allenatore");
    } finally {
      setIsGeneratingAccessToken(false);
    }
  };

  /*
    **Scollega, non revoca.** Una sola chiamata al dominio
    (`unlinkTrainerAccount`, `src/lib/server/profile-account-links.ts`):
    slega l'utenza da questa scheda e revoca il gettone d'accesso associato.
    Non tocca `organization_users`: la tessera si revoca dalla Gestione
    accessi (ADR-0110).
  */
  const handleDisconnectLinkedAccount = async () => {
    if (!clubId || !trainerId || !trainer) {
      showToast("error", "Allenatore non valido");
      return;
    }
    setIsDisconnectingAccess(true);
    try {
      const risposta = await apiRequest(`/api/v1/trainer-accounts/${encodeURIComponent(trainerId)}`, {
        method: "DELETE",
        headers: { "x-active-club-id": clubId },
      });
      if (risposta.error) throw new Error(risposta.error.message);

      const resetAccessState = {
        linkedUserId: null,
        linked_user_id: null,
        linkedUserEmail: "",
        linked_user_email: "",
        linkedAt: null,
        linked_at: null,
        accessTokenStatus: "revoked",
        access_token_status: "revoked",
        accessTokenValue: "",
        access_token_value: "",
        token: "",
      };
      const nextTrainerState = { ...(trainer || {}), ...resetAccessState };
      setTrainer((previous: any) => ({ ...previous, ...resetAccessState }));
      await refreshAccessControlData(nextTrainerState);
      showToast("success", "Account scollegato dal profilo allenatore");
    } catch (error: any) {
      console.error("Error disconnecting trainer account:", error);
      showToast("error", error?.message || "Errore nello scollegamento dell'account");
      throw error;
    } finally {
      setIsDisconnectingAccess(false);
    }
  };

  const handleSaveSection = async (editFormData: Record<string, any>) => {
    if (!clubId || !trainerId) return;
    try {
      const sceltePerStagione = getTrainerCategoryIds(editFormData.categoryIds || editFormData.categories, categories);
      /*
        **Si scrive la stagione scelta e lo storico resta** (ADR-0197): la
        fusione tiene le categorie e i gruppi delle altre stagioni e mette
        al loro posto, per questa, cio che l'editor ha spuntato. Una
        categoria di un'altra stagione non passa.
      */
      const fusione = mergeTrainerAssignmentsForSeason({
        ...seasonInput,
        trainer: trainer?.raw || trainer,
        categoryIds: sceltePerStagione,
        groupIds:
          editFormData.groupIds !== undefined
            ? (Array.isArray(editFormData.groupIds) ? editFormData.groupIds.filter(Boolean) : [])
            : assignments.current.groupIds,
      });
      if (fusione.rejectedCategoryIds.length || fusione.rejectedGroupIds.length) {
        showToast(
          "error",
          `${fusione.rejectedCategoryIds.length + fusione.rejectedGroupIds.length} squadre non appartengono alla stagione ${selectedSeasonLabel || "scelta"} e non sono state assegnate`,
        );
      }
      const nextCategoryIds = fusione.categories;
      const normalizedUpdateData: Record<string, any> = { ...editFormData, categories: nextCategoryIds };
      delete normalizedUpdateData.categoryIds;

      /*
        I gruppi seguiti si salvano solo se il club ne ha piu d'uno per
        categoria: su un club mono-sede sarebbero una copia delle categorie
        (ADR-0055).
      */
      if (editFormData.groupIds !== undefined) {
        normalizedUpdateData.groupIds = fusione.groupIds;
      }

      // Le due chiavi della data di inizio restano allineate.
      if (normalizedUpdateData.startDate !== undefined) {
        normalizedUpdateData.hireDate = normalizedUpdateData.startDate;
      }

      await updateTrainerRecord(normalizedUpdateData);
      setTrainer((previous: any) => ({
        ...previous,
        ...normalizedUpdateData,
        categories: normalizeTrainerCategories(nextCategoryIds, categories),
        raw: { categories: nextCategoryIds, groupIds: normalizedUpdateData.groupIds ?? previous?.raw?.groupIds ?? [] },
      }));
      setEditingSection(null);
      showToast("success", "Modifiche salvate con successo");
    } catch (error) {
      console.error("Error updating trainer:", error);
      showToast("error", "Errore nel salvataggio delle modifiche");
      throw error;
    }
  };

  const handleSetStatus = async (status: "active" | "suspended") => {
    if (!clubId || !trainerId || statusBusy) return;
    setStatusBusy(true);
    try {
      await updateTrainerRecord({ status });
      setTrainer((previous: any) => ({ ...previous, status }));
      showToast("success", status === "active" ? "Allenatore attivato" : "Allenatore sospeso");
      setSuspendOpen(false);
    } catch (error) {
      console.error("Error updating trainer status:", error);
      showToast("error", "Errore nel salvataggio delle modifiche");
    } finally {
      setStatusBusy(false);
    }
  };

  const handleDeleteTrainer = async () => {
    if (!clubId || !trainerId || deleting) return;
    setDeleting(true);
    try {
      await deleteStaffMember(clubId, trainerId);
      showToast("success", "Allenatore eliminato con successo");
      router.push(`/trainers`);
    } catch (error) {
      console.error("Error deleting trainer:", error);
      showToast("error", "Errore nell'eliminazione dell'allenatore");
      setDeleting(false);
    }
  };

  const handleAvatarChange = async (imageData: string | null) => {
    const newAvatar = imageData || null;
    setTrainer({ ...trainer, avatar: newAvatar });
    if (clubId && trainerId) {
      try {
        const { updateClubDataItem } = await import("@/lib/simplified-db");
        await updateClubDataItem(clubId, "trainers", trainerId, { avatar: newAvatar });
        showToast("success", "Foto profilo aggiornata");
      } catch (error) {
        console.error("Error saving avatar:", error);
        showToast("error", "Errore nel salvataggio della foto");
      }
    }
  };

  /* ── Registro pagamenti (promemoria) ─────────────────────────────────── */
  const handlePaySalary = async (paymentId: string) => {
    if (!clubId) return;
    try {
      const updates = { status: "paid", date: todayLocalDateOnly() };
      await updateTrainerPayment(clubId, trainerId, paymentId, updates);
      setPayments((current) => current.map((payment) => (payment.id === paymentId ? { ...payment, ...updates } : payment)));
      showToast("success", "Pagamento registrato con successo");
    } catch (error) {
      showToast("error", "Errore nella registrazione del pagamento");
    }
  };

  const handleAddPayment = async (paymentData: TrainerPayment) => {
    if (!clubId) return;
    try {
      const newPayment = await addTrainerPayment(clubId, trainerId, paymentData);
      setPayments((current) => sortByDateDesc([...current, newPayment], paymentDateOf));
      showToast("success", "Pagamento aggiunto con successo");
    } catch (error) {
      showToast("error", "Errore nell'aggiunta del pagamento");
      throw error;
    }
  };

  const handleDeletePayment = async (paymentId: string) => {
    if (!clubId) return;
    try {
      await deleteTrainerPayment(clubId, trainerId, paymentId);
      setPayments((current) => current.filter((p) => p.id !== paymentId));
      showToast("success", "Pagamento eliminato con successo");
    } catch (error) {
      showToast("error", "Errore nell'eliminazione del pagamento");
      throw error;
    }
  };

  const handleChangePaymentStatus = async (paymentId: string) => {
    if (!clubId) return;
    try {
      const payment = payments.find((p) => p.id === paymentId);
      if (!payment) return;
      const newStatus = payment.status === "paid" ? "pending" : "paid";
      const updates = { status: newStatus, date: newStatus === "paid" ? todayLocalDateOnly() : "" };
      await updateTrainerPayment(clubId, trainerId, paymentId, updates);
      setPayments((current) => current.map((p) => (p.id === paymentId ? { ...p, ...updates } : p)));
      showToast("success", "Stato del pagamento modificato con successo");
    } catch (error) {
      showToast("error", "Errore nella modifica dello stato del pagamento");
      throw error;
    }
  };

  /** Scrive l'elenco dei documenti nel record dell'allenatore. */
  const persistTrainerDocuments = React.useCallback(
    async (documents: TrainerDocument[]) => {
      await updateTrainerRecord({ documents });
      setTrainerDocuments(documents);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [clubId, trainerId],
  );

  /**
   * Salva tipologia, scadenza o certificato della visita medica: prima nel
   * record e poi nello stato, cosi cio che si vede e cio che e in archivio.
   */
  const saveMedicalVisit = async (updates: {
    medicalVisitType?: string;
    medicalVisitExpiry?: string;
    medicalVisitFile?: string | null;
  }) => {
    try {
      await updateTrainerRecord(updates);
      setMedicalVisit((current) => ({
        type: updates.medicalVisitType !== undefined ? updates.medicalVisitType : current.type,
        expiry: updates.medicalVisitExpiry !== undefined ? updates.medicalVisitExpiry : current.expiry,
        file: updates.medicalVisitFile !== undefined ? updates.medicalVisitFile : current.file,
      }));
      setTrainer((current: any) => (current ? { ...current, ...updates } : current));
    } catch (error) {
      console.error("Errore nel salvataggio della visita medica", error);
      showToast("error", "Salvataggio della visita medica non riuscito");
      throw error;
    }
  };

  /** Salva un attestato e lo persiste. */
  const saveCertificateFile = async (key: string, next: string | null) => {
    const nextFiles = { ...certificateFiles };
    if (next) nextFiles[key] = next;
    else delete nextFiles[key];
    await updateTrainerRecord({ certificateFiles: nextFiles });
    setCertificateFiles(nextFiles);
  };

  /* ── Derivazioni per l'intestazione ──────────────────────────────────── */
  const alerts = React.useMemo(
    () =>
      trainer
        ? deriveTrainerRecordAlerts({
            access,
            medicalVisitExpiry: medicalVisit.expiry,
            documentExpiry: trainer.documentExpiry,
            expiredDocuments: trainerDocuments.filter((document) => resolveTrainerDocumentStatus(document) === "expired").length,
          })
        : [],
    [access, medicalVisit.expiry, trainer, trainerDocuments],
  );

  const problemsByArea = React.useMemo(() => {
    const map: Partial<Record<TrainerArea, number>> = {};
    for (const alert of alerts) map[alert.area] = (map[alert.area] || 0) + 1;
    return map;
  }, [alerts]);

  const headerChipLabels: string[] = followedGroupLabels.length
    ? followedGroupLabels
    : currentCategoryLabels;

  const shell = (title: string, children: React.ReactNode) => (
    <div className="flex h-[100dvh] bg-egw-page">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Header title={title} />
        <main className={dashboardMainClassName}>
          <DashboardPageContainer className="max-w-[1280px]">{children}</DashboardPageContainer>
        </main>
      </div>
    </div>
  );

  if (isLoading) {
    return shell(
      "Scheda allenatore",
      <>
        <Panel as="header" className="p-5 lg:p-6">
          <div className="flex flex-wrap items-start gap-5">
            <Skeleton className="h-[72px] w-[72px] rounded-full" />
            <div className="min-w-0 flex-1">
              <Skeleton className="mb-3 h-7 w-56" />
              <Skeleton className="h-5 w-40" />
            </div>
          </div>
        </Panel>
        <DetailCard title="Informazioni personali" loading />
        <DetailCard title="Contatti e residenza" loading />
      </>,
    );
  }

  if (!trainer) {
    return shell(
      "Allenatore non trovato",
      <EmptyStateCard
        iconTone="neutral"
        title="Allenatore non trovato"
        description="La scheda che cerchi non è tra gli allenatori di questo club."
        primary={
          <Button variant="primary" onClick={() => router.push(`/trainers`)}>
            Torna alla lista allenatori
          </Button>
        }
      />,
    );
  }

  const headerActions: RecordAction[] = [
    { id: "edit", label: "Modifica anagrafica", icon: <Pencil />, onClick: () => handleEditSection("personal") },
    { id: "photo", label: "Foto profilo", icon: <Camera />, onClick: () => setPhotoOpen(true) },
    trainer.status === "suspended"
      ? { id: "activate", label: "Riattiva allenatore", icon: <UserCheck />, overflow: true, onClick: () => void handleSetStatus("active") }
      : { id: "suspend", label: "Sospendi allenatore", icon: <UserX />, overflow: true, onClick: () => setSuspendOpen(true) },
    { id: "delete", label: "Elimina allenatore", icon: <Trash2 />, tone: "danger", overflow: true, onClick: () => setDeleteOpen(true) },
  ];

  const personalFields: DetailField[] = [
    { label: "Nome", value: trainer.name },
    { label: "Cognome", value: trainer.surname },
    { label: "Età", value: trainer.age },
    { label: "Data di nascita", value: trainer.birthDate ? formatDateShort(trainer.birthDate) : "" },
    { label: "Nazionalità", value: trainer.nationality },
    { label: "Luogo di nascita", value: trainer.birthPlace },
    { label: "Sesso", value: genderLabel(trainer.gender) },
    { label: "Formazione scolastica", value: trainer.education },
    { label: "Codice fiscale", value: trainer.fiscalCode ? <span className="egw-num uppercase">{trainer.fiscalCode}</span> : "" },
    { label: "Note", value: trainer.notes, wide: true },
  ];

  const documentFields: DetailField[] = [
    { label: "Tipo di documento", value: trainer.documentType },
    { label: "Numero documento", value: trainer.documentNumber ? <span className="egw-num">{trainer.documentNumber}</span> : "" },
    { label: "Data di rilascio", value: trainer.documentIssueDate ? formatDateShort(trainer.documentIssueDate) : "" },
    { label: "Scadenza del documento", value: trainer.documentExpiry ? formatDateShort(trainer.documentExpiry) : "" },
    { label: "Scadenza permesso di soggiorno", value: trainer.residencePermitExpiry ? formatDateShort(trainer.residencePermitExpiry) : "" },
  ];

  const contactFields: DetailField[] = [
    { label: "Email", value: trainer.email },
    { label: "Telefono", value: trainer.phone ? <span className="egw-num">{trainer.phone}</span> : "" },
    { label: "Indirizzo", value: trainer.address },
    { label: "Città", value: trainer.city },
    { label: "CAP", value: trainer.postalCode ? <span className="egw-num">{trainer.postalCode}</span> : "" },
  ];

  const companyFields: DetailField[] = [
    { label: "Tesserato", value: trainer.isMember ? "Sì" : "No" },
    { label: "Numero di tesseramento", value: trainer.membershipNumber ? <span className="egw-num">{trainer.membershipNumber}</span> : "" },
    { label: "Data di tesseramento", value: trainer.membershipDate ? formatDateShort(trainer.membershipDate) : "" },
    { label: "Data di inizio", value: trainer.startDate ? formatDateShort(trainer.startDate) : "" },
    {
      label: selectedSeasonLabel ? `Categorie assegnate · stagione ${selectedSeasonLabel}` : "Categorie assegnate",
      wide: true,
      value: currentCategoryLabels.length ? (
        <span className="flex flex-wrap gap-1.5">
          {currentCategoryLabels.map((label) => (
            <DataChip key={label} tone="blue">
              {label}
            </DataChip>
          ))}
        </span>
      ) : (
        <span className="text-egw-ink-62">
          {selectedSeasonLabel
            ? `Nessuna categoria assegnata nella stagione ${selectedSeasonLabel}`
            : "Nessuna categoria assegnata"}
        </span>
      ),
    },
    /* Lo storico e storico: si legge con la sua stagione, mai come attuale (ADR-0197 §18). */
    ...(historyLabels.length
      ? [
          {
            label: "Stagioni precedenti",
            wide: true,
            value: (
              <span className="flex flex-col gap-0.5 text-egw-ink-62">
                {historyLabels.map((label) => (
                  <span key={label}>{label}</span>
                ))}
              </span>
            ),
          } satisfies DetailField,
        ]
      : []),
    ...(assignableGroups.length
      ? [
          {
            label: "Gruppi seguiti",
            wide: true,
            value: followedGroupLabels.length ? (
              <span className="flex flex-wrap gap-1.5">
                {followedGroupLabels.map((label) => (
                  <DataChip key={label} tone="blue">
                    {label}
                  </DataChip>
                ))}
              </span>
            ) : (
              <span className="text-egw-ink-62">Tutte le squadre delle sue categorie</span>
            ),
          } satisfies DetailField,
        ]
      : []),
  ];

  const healthFields: DetailField[] = [
    { label: "Tessera sanitaria", value: trainer.healthCard ? <span className="egw-num">{trainer.healthCard}</span> : "" },
    { label: "Assicurazione", value: trainer.insurance },
    { label: "Patologie e malattie", value: trainer.pathologies, wide: true },
    { label: "Allergie e preferenze alimentari", value: trainer.allergies, wide: true },
  ];

  const bankingFields: DetailField[] = [
    { label: "IBAN", value: trainer.iban ? <span className="egw-num uppercase">{trainer.iban}</span> : "" },
    { label: "Stipendio mensile", value: <span className="egw-num">{formatMoney(trainer.salary)}</span> },
  ];

  const certificates = [
    { key: "blsd", label: "BLSD", documentType: "BLSD", has: Boolean(trainer.hasBlsd) },
    { key: "firstAid", label: "Primo soccorso", documentType: "Primo soccorso", has: Boolean(trainer.hasFirstAid) },
    { key: "fireSafety", label: "Antincendio", documentType: "Antincendio", has: Boolean(trainer.hasFireSafety) },
  ];

  const medicalStatus = medicalVisitStatus(medicalVisit.expiry);
  const medicalHint = medicalVisitTypeOptions(medicalVisit.type).find((option) => option.value === medicalVisit.type)?.hint || "";

  const runAlertAction = (alertId: string, target: TrainerArea) => {
    if (alertId === "access") {
      if (access.key === "token") void copyAccessToken(trainer.accessTokenValue);
      else void handleGenerateAccessToken();
      setArea("club");
      return;
    }
    if (alertId === "identity-document") {
      setArea("profilo");
      handleEditSection("document");
      return;
    }
    setArea(target);
  };

  return (
    <>
      {shell(
        "Scheda allenatore",
        <>
          <RecordHeader
            eyebrow="Allenatore"
            name={trainerHeaderName}
            identity={{ name: trainerHeaderName, avatarSrc: trainer.avatar, round: true }}
            chips={headerChipLabels.slice(0, 3).map((label) => (
              <DataChip key={label} tone="blue">
                {label}
              </DataChip>
            ))}
            status={<StatusPill status={trainerStatusSpec(trainer.status)} />}
            meta={joinMeta(trainer.email, trainer.phone) || undefined}
            actions={headerActions}
            areas={
              /* Quattro segmenti non entrano in 375px: scorrono nel proprio contenitore. */
              <div className="egw-scroll max-w-full overflow-x-auto">
                <RecordAreaSwitcher
                  value={area}
                  onChange={setArea}
                  areas={TRAINER_AREAS.map((item) => ({ ...item, problems: problemsByArea[item.value] }))}
                />
              </div>
            }
          >
            <RecordAlertStrip
              items={alerts.map((alert) => ({
                id: alert.id,
                severity: alert.severity,
                text: alert.text,
                action: (
                  <Button variant="text" size="xs" onClick={() => runAlertAction(alert.id, alert.area)}>
                    {alert.action}
                  </Button>
                ),
              }))}
            />
          </RecordHeader>

          {area === "profilo" ? (
            <>
              <DetailCard eyebrow="Anagrafica" title="Informazioni personali" fields={personalFields} onEdit={() => handleEditSection("personal")} />
              <DetailCard eyebrow="Anagrafica" title="Documento d'identità" fields={documentFields} onEdit={() => handleEditSection("document")} />
              <DetailCard eyebrow="Contatti" title="Contatti e residenza" fields={contactFields} onEdit={() => handleEditSection("contacts")} />
              {/*
                Le taglie si raccoglievano alla creazione e poi sparivano: qui
                si leggono e si correggono. Nessun numero di maglia.
              */}
              <DetailCard eyebrow="Vestiario" title="Taglie vestiario" onEdit={() => handleEditSection("clothing")}>
                <ClothingSizesSummary value={trainer?.clothingSizes} person={{ gender: trainer?.gender, birthDate: trainer?.birthDate }} />
              </DetailCard>
            </>
          ) : null}

          {area === "club" ? (
            <>
              {/*
                «Ruolo» non e qui: su una scheda allenatore vale sempre
                «Allenatore» e ripeterebbe il titolo della pagina.
              */}
              <DetailCard eyebrow="Club" title="Informazioni societarie" fields={companyFields} onEdit={() => handleEditSection("company")} />
              <TrainerAccessPanel
                trainer={trainer}
                access={access}
                tokenDetails={tokenDetails}
                linkedAccountDetails={linkedAccountDetails}
                linkedMembershipDetails={linkedMembershipDetails}
                loadingDetails={isLoadingAccessData}
                generating={isGeneratingAccessToken}
                disconnecting={isDisconnectingAccess}
                onGenerate={handleGenerateAccessToken}
                onCopy={() => copyAccessToken(trainer.accessTokenValue)}
                onDisconnect={handleDisconnectLinkedAccount}
              />
            </>
          ) : null}

          {area === "documenti" ? (
            <>
              {/*
                Visita medica: i tre campi si modificano e si salvano nello
                stesso posto, subito; l'allegato usa il componente condiviso.
              */}
              <Panel as="section">
                <PanelHeader
                  eyebrow="Sanità"
                  title="Visita medica"
                  actions={<StatusPill status={medicalStatus} detail={medicalVisit.expiry ? formatDateShort(medicalVisit.expiry) : undefined} />}
                />
                <FormGrid>
                  <Field label="Tipologia" htmlFor="medical-visit-type" helper={medicalHint || undefined}>
                    <Select
                      id="medical-visit-type"
                      value={medicalVisit.type}
                      onValueChange={(value) => saveMedicalVisit({ medicalVisitType: value }).catch(() => undefined)}
                      options={medicalVisitTypeOptions(medicalVisit.type).map((option) => ({ value: option.value, label: option.label }))}
                      placeholder="Seleziona la tipologia"
                    />
                  </Field>
                  <Field label="Data di scadenza" htmlFor="medical-visit-expiry" width="20ch">
                    <DateInput
                      id="medical-visit-expiry"
                      value={medicalVisit.expiry}
                      onChange={(event) => saveMedicalVisit({ medicalVisitExpiry: event.target.value }).catch(() => undefined)}
                    />
                  </Field>
                  <div className="laptop:col-span-2">
                    <p className="mb-2 font-brand text-[12px] font-semibold text-egw-ink-62">Certificato</p>
                    <CertificateAttachmentField
                      documentType="Visita medica"
                      owner={{ type: "trainer", id: trainerId, organizationId: clubId }}
                      value={medicalVisit.file}
                      date={medicalVisit.expiry}
                      onChange={(next) => saveMedicalVisit({ medicalVisitFile: next })}
                      person={{ firstName: trainer?.firstName, lastName: trainer?.lastName, fullName: trainer?.name }}
                      emptyLabel="Nessun certificato allegato"
                    />
                  </div>
                </FormGrid>
              </Panel>

              <DetailCard eyebrow="Sanità" title="Attestati" onEdit={() => handleEditSection("certificates")}>
                <div className="flex flex-col gap-3">
                  {certificates.map((certificate) => (
                    <InsetBlock key={certificate.key}>
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <span className="font-brand text-[13.5px] font-semibold text-egw-ink">{certificate.label}</span>
                        <span className="inline-flex items-center gap-1.5 font-brand text-[12px] font-medium text-egw-ink-62 [&>svg]:h-4 [&>svg]:w-4">
                          {certificate.has ? <CheckCircle2 className="text-egw-green" /> : <Circle />}
                          {certificate.has ? "Conseguito" : "Non conseguito"}
                        </span>
                      </div>
                      {certificate.has ? (
                        <div className="mt-3 border-t border-egw-hairline pt-3">
                          <CertificateAttachmentField
                            documentType={certificate.documentType}
                            owner={{ type: "trainer", id: trainerId, organizationId: clubId }}
                            value={certificateFiles[certificate.key]}
                            onChange={(next) => saveCertificateFile(certificate.key, next)}
                            person={{ firstName: trainer?.firstName, lastName: trainer?.lastName, fullName: trainer?.name }}
                          />
                        </div>
                      ) : null}
                    </InsetBlock>
                  ))}
                </div>
              </DetailCard>

              <DetailCard eyebrow="Sanità" title="Anagrafica sanitaria" fields={healthFields} onEdit={() => handleEditSection("health")} />

              {/*
                I documenti: una griglia sola, dentro la scheda. «Visualizza»
                apre il file e nessun comando cambia pagina.
              */}
              <TrainerDocumentsPanel
                documents={trainerDocuments}
                trainerId={trainerId}
                trainerName={trainer?.name || ""}
                organizationId={clubId}
                onPersist={persistTrainerDocuments}
              />
            </>
          ) : null}

          {area === "compensi" ? (
            <>
              {/*
                Lavoro e compensi: il rapporto, il piano, le erogazioni e la
                posizione verso le soglie. Il registro qui sotto e il
                promemoria storico (`payments[]`) e non calcola contributi.
              */}
              <PersonCompensationTab
                originType="trainer"
                originId={trainerId}
                firstName={trainer.name}
                lastName={trainer.surname}
                fiscalCode={trainer.fiscalCode || trainer.fiscal_code}
                email={trainer.email}
                phone={trainer.phone}
              />

              <AlertBlock severity="warning" title="Il registro pagamenti è un promemoria, non una contabilità dei compensi">
                Non conosce il rapporto di lavoro, i contributi, l&apos;anno fiscale né lo storno. Il modulo che li governa è «Lavoro e
                compensi», qui sopra. Le righe già registrate restano leggibili e non vengono toccate.
              </AlertBlock>

              <DetailCard eyebrow="Promemoria" title="Informazioni bancarie" fields={bankingFields} columns={2} onEdit={() => handleEditSection("banking")} />

              <TrainerPaymentsPanel
                payments={payments}
                trainer={trainer}
                onAdd={handleAddPayment}
                onPay={handlePaySalary}
                onToggleStatus={handleChangePaymentStatus}
                onDelete={handleDeletePayment}
              />
            </>
          ) : null}
        </>,
      )}

      <TrainerSectionDrawer
        section={editingSection}
        initialValues={editInitialValues}
        categories={seasonCategories}
        categoryLabel={(categoryId) => categoryDisplay.label(categoryId)}
        assignableGroups={assignableGroups.filter((group) =>
          seasonCategories.some((category: any) => String(category.id) === String(group.categoryId)),
        )}
        onClose={() => setEditingSection(null)}
        onSave={handleSaveSection}
      />

      <Drawer
        open={photoOpen}
        onOpenChange={setPhotoOpen}
        width="narrow"
        eyebrow="Profilo"
        title="Foto profilo"
        description="La foto si salva subito: non serve confermare."
      >
        <div className="flex flex-col items-center gap-4 py-4">
          <AvatarUpload currentImage={trainer.avatar} onImageChange={handleAvatarChange} name={trainerHeaderName} size="xl" type="user" />
          <p className="font-brand text-[12px] text-egw-ink-62">{trainer.avatar ? "Foto caricata" : MISSING}</p>
        </div>
      </Drawer>

      <ConfirmDialog
        open={suspendOpen}
        onOpenChange={setSuspendOpen}
        title={`Sospendere ${trainerHeaderName}?`}
        description="L'allenatore resta in archivio ma non compare tra gli attivi. Potrai riattivarlo in qualsiasi momento."
        confirmLabel="Sospendi"
        loading={statusBusy}
        onConfirm={() => handleSetStatus("suspended")}
      />

      <DangerConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={`Eliminare ${trainerHeaderName}?`}
        description="La scheda viene tolta dal club e non si recupera."
        consequences={[
          "Anagrafica, contatti, taglie e note",
          `${trainerDocuments.length} ${trainerDocuments.length === 1 ? "documento caricato" : "documenti caricati"}, visita medica e attestati`,
          `${payments.length} ${payments.length === 1 ? "pagamento registrato" : "pagamenti registrati"} nel promemoria`,
          "Token di accesso EasyGame e inviti in sospeso legati a questa scheda",
        ]}
        confirmLabel="Elimina"
        loading={deleting}
        onConfirm={handleDeleteTrainer}
      />
    </>
  );
}
