"use client";

import React, { useState, useEffect, useRef } from "react";
import { normalizeDocumentKind } from "@/lib/documents/request-model";
import Sidebar from "@/components/dashboard/Sidebar";
import Header from "@/components/dashboard/Header";
import {
  DashboardPageContainer,
  dashboardMainClassName,
} from "@/components/dashboard/dashboard-page-container";
import { Plus, UserX } from "lucide-react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { AddCertificateForm } from "@/components/forms/AddCertificateForm";
import { useToast } from "@/components/ui/toast-notification";
import { useAuth } from "@/components/providers/AuthProvider";
import { resolveActiveClubId } from "@/lib/active-club";
import { supabase } from "@/lib/supabase";
import {
  getLatestMedicalCertificateExpiry,
  compareCertificatesByExpiryDesc,
  getMedicalCertificateStatus,
} from "@/lib/medical-certificates";
import { uploadAttachmentReference } from "@/lib/api/attachments";
import {
  PARENT_TOKEN_EXPIRY_HOURS,
  createParentAccessToken,
  formatParentAccessToken,
  getGuardianDisplayName,
  normalizeGuardianRows,
} from "@/lib/athlete-guardians";
import {
  buildAthleteKitBuilderComponents,
  calculateAgeFromBirthDate,
  coerceBooleanField,
  createEmptyAttachment,
  createEmptyMedicalVisit,
  createEmptyRegistration,
  getTodayDateString,
} from "@/lib/athlete-profile-fields";
import {
  AthleteAccountDialog,
  usePuoGestireAccessoAtleta,
} from "@/components/athletes/profile/athlete-account-section";
import {
  AthleteDataSubjectSection,
  eDatiPersonaliDaSmaltire,
  messaggioDatiPersonali,
  usePuoTrattareDatiPersonali,
} from "@/components/athletes/profile/athlete-data-subject-section";
import { PersonCompensationTab } from "@/components/sport-work/PersonCompensationTab";
import {
  ATHLETE_RECORD_SECTIONS,
  resolveAthleteRecordTarget,
  type AthleteRecordAreaValue,
  type AthleteRecordTarget,
} from "@/lib/athlete-profile-tabs";
import {
  CLOTHING_SIZE_OPTIONS,
  DEFAULT_CLOTHING_SIZES,
  deriveClothingProfile,
} from "@/lib/clothing-sizes";
import {
  buildCategoryGroups,
  isMultiSiteClub,
  normalizeClubSites,
  type ClubSite,
} from "@/lib/club-sites";
import { buildCategoryDisplayIndex } from "@/lib/categories/display";
import { AthleteRegistrationsPanel } from "@/components/athletes/profile/athlete-registrations-panel";
import { AthleteRegistrationDialog } from "@/components/athletes/profile/athlete-registration-dialog";
import {
  applyRegistrationEdit,
  buildRegistrationId,
  findRegistrationIndex,
} from "@/lib/athletes/registration-edits";
import { AthleteCertificatesPanel } from "@/components/athletes/profile/athlete-certificates-panel";
import {
  buildRegistrationFederationReference,
  listClubFederations,
  readRegistrationFederationLabel,
  type ClubFederation,
} from "@/lib/club-federations";
import {
  downloadAttachment,
  downloadClientFileUrl,
  fileToDataUrl,
  openClientFileUrl,
} from "@/lib/client-files";
import {
  normalizeKitAssignmentItems,
  normalizeKitAssignmentRecord,
  normalizeKitRecord,
} from "@/lib/clothing-kit-utils";
import {
  canAssignNumber,
  normalizeClubClothingState,
  serializeClothingAssignment,
  serializeInventoryStock,
  updateClothingAssignmentStatus,
  type ClothingAssignment,
  type ClothingAssignmentStatus,
} from "@/lib/clothing-inventory-utils";
import {
  getAthleteJerseyNumberSummary,
  getJerseyGroupSummary,
} from "@/lib/jersey-numbering-utils";
import {
  getPrimaryAthleteCategoryMembership,
  normalizeAthleteCategoryMemberships,
} from "@/lib/athlete-category-memberships";
import { buildClubCategoryOptions } from "@/lib/category-utils";
import { AthleteCategoryAnalyticsSection } from "@/components/athletes/AthleteCategoryAnalyticsSection";
import { EnrollmentPaymentBreakdown } from "@/components/payments/EnrollmentPaymentBreakdown";
import { AthleteEnrollmentTab } from "@/components/athletes/enrollment/AthleteEnrollmentTab";
import { AthletePaymentDialogs } from "@/components/athletes/profile/athlete-payment-dialogs";
import {
  calculateAthleteCategoryAnalytics,
  type AthleteCategoryAnalyticsResult,
} from "@/lib/athlete-category-analytics";
import {
  normalizeAthleteProfileCollections,
  normalizeCollection,
  normalizeNullableTextValue,
  normalizeRecord,
  normalizeTextValue,
  normalizeStringList,
} from "@/lib/athlete-profile-utils";
import {
  calculateAthleteExpectedIncome,
  mergeAthletePayments,
} from "@/lib/athlete-payment-utils";
import {
  calculatePlanTotal,
  describeProrationResult,
  generateInstallmentPreview,
  findPaymentPlan,
  getPlanServicesForAthlete,
  normalizePaymentPlans,
} from "@/lib/payment-plan-utils";
import { loadActiveSeasonPeriod } from "@/lib/club-profile";
import { normalizeActiveClubSeason } from "@/lib/club-seasons";
import { normalizeAthleteStatus } from "@/lib/athletes/status";
import { CompileFormDialog } from "@/components/forms/compile-form-dialog";
import { getClubPaymentMethodChoices } from "@/lib/payments/payment-config-utils";
import { apiRequest } from "@/lib/api/client";
/* ── Web V2 ──────────────────────────────────────────────────────────── */
import { CollapsedSection } from "@/components/web/record/Record";
import { DetailCard, EmptyStateCard } from "@/components/web/page/Cards";
import { Button } from "@/components/web/primitives/Button";
import { Eyebrow, Hairline, Panel } from "@/components/web/primitives/Surface";
import { Skeleton } from "@/components/web/primitives/Controls";
import { ConfirmDialog, DangerConfirmDialog } from "@/components/web/overlays/Modal";
import { formatDateShort, joinMeta } from "@/lib/web/format";
import { readPreference, writePreference } from "@/lib/web/preferences";
import { AthleteRecordHeader } from "@/components/athletes/profile/v2/AthleteRecordHeader";
import {
  countAlertsByArea,
  deriveAthleteRecordAlerts,
} from "@/components/athletes/profile/v2/athlete-record-alerts";
import {
  AthleteAnagraficaCard,
  AthleteContattiCard,
  AthleteGuardiansPanel,
  AthleteIndirizzoFields,
  summarizeAddress,
} from "@/components/athletes/profile/v2/AthleteProfileSections";
import {
  AthleteCategoriesCard,
  AthleteClothingPanel,
  AthleteJerseyNumbersList,
  AthleteKitAssignmentsList,
} from "@/components/athletes/profile/v2/AthleteActivitySections";
import {
  AddAction,
  AthleteAttestatiPanel,
  AthleteHealthInfoCard,
  AthleteMedicalVisitsList,
} from "@/components/athletes/profile/v2/AthleteHealthSections";
import {
  AddDocumentAction,
  AthleteIdentityDocumentFields,
  AthleteSharedDocumentsPanel,
  AthleteStoredDocumentsList,
  summarizeIdentityDocument,
} from "@/components/athletes/profile/v2/AthleteDocumentSections";
import { useMembershipTargetIndex, type EditorMembership } from "@/components/athletes/v2/AthleteCategoryMembershipEditor";
import {
  AthleteGuardianDrawer,
  AthleteSectionEditDrawer,
  type AthleteEditSection,
} from "@/components/athletes/profile/v2/AthleteProfileDrawers";
import {
  AthleteAttachmentDrawer,
  AthleteMedicalVisitDrawer,
  AthleteOtherDocumentDrawer,
  SharedDocumentRejectDialog,
  SharedDocumentRequestDrawer,
  SharedDocumentUploadDrawer,
} from "@/components/athletes/profile/v2/AthleteDocumentDrawers";
import {
  AthleteJerseyNumberDrawer,
  AthleteKitAssignmentDrawer,
} from "@/components/athletes/profile/v2/AthleteActivityDrawers";
import {
  AthletePlanConfirmationDrawer,
  AthletePlanEditor,
  CreatePaymentsConfirmDialog,
} from "@/components/athletes/profile/v2/AthleteAdministrationParts";

const EMPTY_ATHLETE_CATEGORY_ANALYTICS: AthleteCategoryAnalyticsResult = {
  categories: [],
  unclassifiedEvents: [],
};

/**
 * Le righe chiuse raggiungibili con un salto (avvisi, `?tab=`): dall'ancora
 * del blocco all'`id` della `CollapsedSection`, che e cio che la preferenza
 * `egw.atleta.sections` ricorda.
 */
const COLLAPSED_BY_ANCHOR: Partial<Record<string, string>> = {
  [ATHLETE_RECORD_SECTIONS.indirizzo]: "indirizzo",
  [ATHLETE_RECORD_SECTIONS.datiPersonali]: "dati-personali",
  [ATHLETE_RECORD_SECTIONS.numeri]: "numeri-maglia",
  [ATHLETE_RECORD_SECTIONS.kit]: "kit",
  [ATHLETE_RECORD_SECTIONS.compensi]: "compensi",
  [ATHLETE_RECORD_SECTIONS.visite]: "visite",
  [ATHLETE_RECORD_SECTIONS.attestati]: "attestati",
  [ATHLETE_RECORD_SECTIONS.identita]: "documento-identita",
  [ATHLETE_RECORD_SECTIONS.altriDocumenti]: "altri-documenti",
};

export default function AthleteProfilePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { showToast } = useToast();
  const athleteId = params?.id as string;
  const clubIdFromUrl = searchParams?.get("clubId");
  /**
   * Il club della scheda, quando l'URL non lo dice (RC Fix 2, punto 17).
   *
   * **Il difetto.** `/athletes/<id>` senza `?clubId=` rispondeva «ID del club
   * mancante» e non caricava niente — anche con un club attivo in sessione.
   * Bastava un link copiato, un preferito salvato prima che il parametro
   * esistesse, o un ritorno indietro dal browser.
   *
   * **La regola** e quella di `resolveActiveClubId` (Blocco 7, punto 4): se
   * l'URL nomina un club vince l'URL, altrimenti vale il club attivo della
   * sessione. Il parametro puo solo **restringere** lo scope, mai allargarlo:
   * chi lo scrive a mano non ottiene niente che la sessione non gli desse gia,
   * perche a decidere cosa si vede resta il server
   * (`resolveOrganizationScopeForUser` su ogni rotta).
   */
  const { activeClub } = useAuth();
  /*
    Il pannello «Accesso EasyGame» (PP-01 §G). Lo stato sta qui e non nel
    componente perche il pulsante che lo apre e nell'intestazione, che e un
    altro componente: due stati separati vorrebbero dire due verita su una
    finestra sola.
  */
  const [pannelloAccessoAperto, setPannelloAccessoAperto] = useState(false);
  const puoGestireAccesso = usePuoGestireAccessoAtleta();
  const puoTrattareDatiPersonali = usePuoTrattareDatiPersonali();
  const [clubId, setClubId] = useState<string | null>(clubIdFromUrl || null);
  /*
    Le quattro aree della scheda (09 §9.8). Il `?tab=` accetta sia il nome di
    un'area sia una delle otto schede della V1, che atterra nella sezione che
    la rappresenta; un valore sconosciuto ricade su «Profilo».
  */
  const requestedTab = searchParams?.get("tab");
  const [initialTarget] = useState(() => resolveAthleteRecordTarget(requestedTab));
  const [area, setArea] = useState<AthleteRecordAreaValue>(initialTarget.area);
  const [sectionsEpoch, setSectionsEpoch] = useState(0);
  const [pendingScroll, setPendingScroll] = useState<string | null>(null);
  const initialSectionHandled = useRef(false);
  const [activeSeasonLabel, setActiveSeasonLabel] = useState<string | null>(null);
  const [sharedRequestOpen, setSharedRequestOpen] = useState(false);
  const [sharedUploadOpen, setSharedUploadOpen] = useState(false);
  const [sharedRejectTarget, setSharedRejectTarget] = useState<string | null>(null);
  const [sharedRejectReason, setSharedRejectReason] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [athlete, setAthlete] = useState<any>(null);
  const [clubCategoryOptions, setClubCategoryOptions] = useState<any[]>([]);
  /**
   * Il catalogo di **tutte** le stagioni, per l'identita delle appartenenze
   * (ADR-0196, revisione C3). `clubCategoryOptions` e il catalogo della
   * stagione attiva — giusto per scegliere, sbagliato per riconoscere: con
   * quello un'appartenenza alla «Under 14 Gold» archiviata ripiegava sul
   * nome, si presentava come la «Under 14 Gold» nuova, e al primo salvataggio
   * della sezione veniva **scritta** cosi: un riporto di stagione che nessuno
   * aveva deciso, fatto da un cassetto che stava salvando altro.
   */
  const [clubCategoryCatalogAllSeasons, setClubCategoryCatalogAllSeasons] = useState<any[]>([]);
  const categoryCatalogForIdentity = clubCategoryCatalogAllSeasons.length
    ? clubCategoryCatalogAllSeasons
    : clubCategoryOptions;
  const [clubSites, setClubSites] = useState<ClubSite[]>([]);
  const [clubCategoryGroupsRaw, setClubCategoryGroupsRaw] = useState<any[]>([]);
  /*
    **I gruppi si leggono costruiti, non grezzi** (ADR-0185).

    `clubs.category_groups` porta `siteId` e non il nome della sede; passato
    com'era a `CategoryLabel` la scheda scriveva «Pulcini (site-1787776…)» a
    ogni club con due Pulcini. `buildCategoryGroups` risolve la sede sul
    catalogo e scarta le voci derivate: e la stessa lettura delle altre pagine.
  */
  const clubCategoryGroups = React.useMemo(
    () =>
      buildCategoryGroups({
        categories: clubCategoryOptions,
        sites: clubSites,
        groups: clubCategoryGroupsRaw,
      }),
    [clubCategoryOptions, clubSites, clubCategoryGroupsRaw],
  );
  /* Come si scrive una categoria in questa scheda (ADR-0185): un indice, per ogni sezione che lo chiede. */
  const categoryDisplay = React.useMemo(
    () =>
      buildCategoryDisplayIndex({
        categories: clubCategoryOptions,
        groups: clubCategoryGroups,
        sites: clubSites,
      }),
    [clubCategoryOptions, clubCategoryGroups, clubSites],
  );
  const [athleteCategoryAnalytics, setAthleteCategoryAnalytics] =
    useState<AthleteCategoryAnalyticsResult>(EMPTY_ATHLETE_CATEGORY_ANALYTICS);
  const [editingSection, setEditingSection] = useState<string | null>(null);
  const [editFormData, setEditFormData] = useState<any>({});
  const [guardians, setGuardians] = useState<any[]>([]);
  const [guardianAccessBusyId, setGuardianAccessBusyId] = useState<string | null>(
    null,
  );
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [registrations, setRegistrations] = useState<any[]>([]);
  const [medicalVisits, setMedicalVisits] = useState<any[]>([]);
  const [medicalCertificates, setMedicalCertificates] = useState<any[]>([]);
  const [identityDocuments, setIdentityDocuments] = useState<any[]>([]);
  const [enrollmentDocuments, setEnrollmentDocuments] = useState<any[]>([]);
  const [documents, setDocuments] = useState<any[]>([]);
  const [sharedDocuments, setSharedDocuments] = useState<any[]>([]);
  const [sharedDocumentBusy, setSharedDocumentBusy] = useState(false);
  const [compileFormOpen, setCompileFormOpen] = useState(false);
  /*
    Cambia quando una compilazione approvata ha scritto nella scheda: fa
    ricaricare i dati dell'atleta senza ricaricare la pagina, che perderebbe
    la scheda aperta e la posizione nello scorrimento.
  */
  const [athleteDataVersion, setAthleteDataVersion] = useState(0);
  const [payments, setPayments] = useState<any[]>([]);
  const [athletePaymentRecords, setAthletePaymentRecords] = useState<any[]>([]);
  const [expectedIncomeEntries, setExpectedIncomeEntries] = useState<any[]>([]);
  const [clothingSizes, setClothingSizes] = useState(DEFAULT_CLOTHING_SIZES);
  // ---- Numero maglia (sincronizzato con pagina Abbigliamento) ----
  const [isJerseyNumberDialogOpen, setIsJerseyNumberDialogOpen] =
    useState(false);
  const [jerseyNumberDraft, setJerseyNumberDraft] = useState<string>("");
  const [jerseyGroupDraft, setJerseyGroupDraft] = useState<string>("");
  const [jerseyAssignments, setJerseyAssignments] = useState<any[]>([]);
  const [jerseyGroups, setJerseyGroups] = useState<any[]>([]);
  const [clothingProducts, setClothingProducts] = useState<any[]>([]);
  const [clothingInventory, setClothingInventory] = useState<any[]>([]);
  const [clothingKits, setClothingKits] = useState<any[]>([]);
  const [kitAssignments, setKitAssignments] = useState<any[]>([]);
  const [isNewKitAssignmentOpen, setIsNewKitAssignmentOpen] = useState(false);
  const [newKitAssignment, setNewKitAssignment] = useState<any>({
    assignmentType: "kit",
    kitId: "",
    components: [],
    notes: "",
  });
  const [showEditModal, setShowEditModal] = useState(false);
  const [showAddDocumentModal, setShowAddDocumentModal] = useState(false);
  const [showAddGuardianModal, setShowAddGuardianModal] = useState(false);
  const [showAddRegistrationModal, setShowAddRegistrationModal] =
    useState(false);
  const [showAddMedicalVisitModal, setShowAddMedicalVisitModal] =
    useState(false);
  const [certificateToEdit, setCertificateToEdit] = useState<any>(null);
  const [registrationToEdit, setRegistrationToEdit] = useState<any>(null);
  const [showAddMedicalCertificateModal, setShowAddMedicalCertificateModal] =
    useState(false);
  const [certificateToDelete, setCertificateToDelete] = useState<any | null>(
    null,
  );
  const [deletingCertificateId, setDeletingCertificateId] = useState<
    string | null
  >(null);
  const [medicalVisitToDelete, setMedicalVisitToDelete] = useState<any | null>(
    null,
  );
  const [deletingMedicalVisitId, setDeletingMedicalVisitId] = useState<
    string | null
  >(null);
  const [showAddIdentityDocumentModal, setShowAddIdentityDocumentModal] =
    useState(false);
  const [showAddEnrollmentDocumentModal, setShowAddEnrollmentDocumentModal] =
    useState(false);
  const [clubFederations, setClubFederations] = useState<ClubFederation[]>([]);
  // Metodi di incasso configurati dal club: alimentano la selezione in
  // «Modifica pagamento», che prima era un campo di testo libero (WP-33).
  const [clubPaymentMethodChoices, setClubPaymentMethodChoices] = useState<
    string[]
  >([]);
  const [editingGuardianIndex, setEditingGuardianIndex] = useState<
    number | null
  >(null);
  const [newDocument, setNewDocument] = useState({
    name: "",
    type: "",
    file: null as File | null,
  });
  const [requiredSharedDocument, setRequiredSharedDocument] = useState({
    title: "",
    documentType: "other",
    description: "",
    dueDate: "",
  });
  const [clubSharedDocumentUpload, setClubSharedDocumentUpload] = useState({
    title: "",
    documentType: "other",
    description: "",
    file: null as File | null,
  });
  const [newGuardian, setNewGuardian] = useState({
    id: "",
    name: "",
    surname: "",
    relationship: "",
    fiscalCode: "",
    birthDate: "",
    // Il genitore e una persona come le altre: dal Blocco 7 anche il suo
    // codice fiscale si calcola, e per calcolarlo servono sesso e comune.
    gender: "",
    birthPlace: "",
    birthPlaceCode: "",
    phone: "",
    email: "",
  });
  /*
    La lettura documenti parla di `firstName` e `lastName`, il record di un
    genitore di `name` e `surname`. Le due grafie convivono da prima del
    Blocco 8 e allinearle e una migrazione a se: qui si traduce, in un punto
    solo, e si scartano i campi che un genitore non ha (numero e scadenza del
    documento non stanno nel suo record).
  */
  const guardianExtractionValues = React.useMemo(
    () => ({
      firstName: newGuardian.name,
      lastName: newGuardian.surname,
      fiscalCode: newGuardian.fiscalCode,
      birthDate: newGuardian.birthDate,
      birthPlace: newGuardian.birthPlace,
      birthPlaceCode: newGuardian.birthPlaceCode,
    }),
    [newGuardian],
  );

  const applyExtractionToGuardian = (patch: Record<string, string>) => {
    const { firstName, lastName, ...rest } = patch;
    const mapped: Record<string, string> = {};

    for (const key of ["fiscalCode", "birthDate", "birthPlace", "birthPlaceCode"]) {
      if (rest[key]) mapped[key] = rest[key];
    }

    if (firstName) mapped.name = firstName;
    if (lastName) mapped.surname = lastName;

    return mapped;
  };

  const [newRegistration, setNewRegistration] = useState(createEmptyRegistration);
  const [newMedicalVisit, setNewMedicalVisit] = useState(createEmptyMedicalVisit);
  const [newIdentityDocument, setNewIdentityDocument] =
    useState(createEmptyAttachment);
  const [newEnrollmentDocument, setNewEnrollmentDocument] =
    useState(createEmptyAttachment);
  const [paymentPlans, setPaymentPlans] = useState<any[]>([]);
  /*
    Periodo della stagione attiva: e il ripiego del pro-rata quando il piano
    lo accende senza dichiarare il proprio periodo (RC Fix 1, punto 4).
  */
  const recapitiSoloContatto: string[] =
    (athlete as any)?.contactOnlyIdentities || [];

  const [activeSeasonPeriod, setActiveSeasonPeriod] = useState<{
    startDate: string;
    endDate: string;
  } | null>(null);
  const [discounts, setDiscounts] = useState<any[]>([]);
  const [certificateFiles, setCertificateFiles] = useState<{
    [key: string]: string;
  }>({});
  const [showAddPaymentModal, setShowAddPaymentModal] = useState(false);
  const [showPlanConfirmDialog, setShowPlanConfirmDialog] = useState(false);
  const [showCreatePaymentsDialog, setShowCreatePaymentsDialog] =
    useState(false);
  const [planConfirmationDraft, setPlanConfirmationDraft] = useState<{
    planId: string;
    subscriptionStartDate: string;
    selectedOptionalServiceIds: string[];
    manualEnrollmentAmount: string;
  } | null>(null);
  const [editingPayment, setEditingPayment] = useState<any | null>(null);
  const [paymentEditForm, setPaymentEditForm] = useState({
    description: "",
    amount: "",
    dueDate: "",
    status: "pending",
    method: "",
    notes: "",
  });
  const [paymentPinAction, setPaymentPinAction] = useState<{
    action: "update" | "delete" | "cancel";
    payment: any;
    updates?: Record<string, any>;
    reason?: string;
  } | null>(null);
  const [isPaymentActionSaving, setIsPaymentActionSaving] = useState(false);
  const [newPayment, setNewPayment] = useState({
    date: "",
    description: "",
    type: "Quota",
    amount: "",
    // Una voce a debito nasce da incassare: il pagamento lo dimostra un
    // movimento nel registro, non questo campo (ADR-0036).
    status: "In attesa",
  });
  const [isEnrollmentSaving, setIsEnrollmentSaving] = useState(false);

  // Initialize date on client side to avoid hydration mismatch
  useEffect(() => {
    if (!newPayment.date) {
      setNewPayment((prev) => ({
        ...prev,
        date: getTodayDateString(),
      }));
    }
  }, []);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setNowMs(Date.now());
    }, 60000);

    return () => window.clearInterval(intervalId);
  }, []);


  const refreshSharedDocuments = React.useCallback(async () => {
    if (!athleteId) return [];
    const response = await apiRequest<any[]>(
      `/api/athletes/${athleteId}/documents`,
    );
    if (response.error) {
      throw new Error(response.error.message);
    }
    const nextDocuments = Array.isArray(response.data) ? response.data : [];
    setSharedDocuments(nextDocuments);
    return nextDocuments;
  }, [athleteId]);

  /*
    Il club attivo si risolve dopo il primo render: `resolveActiveClubId` legge
    `window`, e calcolarlo durante il render darebbe un markup diverso fra
    server e client.
  */
  useEffect(() => {
    setClubId((current) => resolveActiveClubId(current || activeClub?.id) || null);
  }, [activeClub?.id, clubIdFromUrl]);

  // Fetch athlete data from database
  useEffect(() => {
    const fetchAthleteData = async () => {
      if (!athleteId) {
        console.error("Missing athleteId parameter");
        showToast({
          title: "Errore",
          description: "ID dell'atleta mancante",
          variant: "destructive",
        });
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      try {
        // Use shared database helpers so athlete sheet and medical page stay aligned.
        const {
          getAthlete,
          getAthleteCertificates,
          getAthletePayments,
          getClub,
          getClubCategories,
          getClubTrainings,
          getClubData,
        } = await import("@/lib/simplified-db");
        const [
          athleteRecord,
          certificateRecords,
          clubRecord,
          categoryOptions,
          trainingRecords,
          catalogoTutteLeStagioni,
          matchRecords,
          athletePaymentRows,
        ] = await Promise.all([
          getAthlete(athleteId),
          getAthleteCertificates(athleteId).catch(() => []),
          clubId ? getClub(clubId).catch(() => null) : Promise.resolve(null),
          clubId ? getClubCategories(clubId).catch(() => []) : Promise.resolve([]),
          clubId ? getClubTrainings(clubId).catch(() => []) : Promise.resolve([]),
          /* Lo stesso catalogo senza il perimetro di stagione: l'header vuoto dice al registro di non filtrare (ADR-0196). */
          clubId
            ? apiRequest<any[]>(`/api/v1/categories?organization_id=${encodeURIComponent(clubId)}`, {
                headers: { "x-active-season-id": "" },
              })
                .then((response) => (response.error ? [] : response.data || []))
                .catch(() => [])
            : Promise.resolve([]),
          clubId
            ? getClubData(clubId, "matches").catch(() => [])
            : Promise.resolve([]),
          getAthletePayments(athleteId).catch(() => []),
        ]);

        if (!athleteRecord) {
          // Only show error if it's not a network issue (network issues are logged as warnings)
          console.warn(
            "Athlete not found or network error. AthleteId:",
            athleteId,
          );
          showToast({
            title: "Errore",
            description: "Atleta non trovato o errore di connessione. Riprova.",
            variant: "destructive",
          });
          setIsLoading(false);
          return;
        }

        /*
          L'atleta sa a che club appartiene. Se ci si e arrivati senza `clubId`
          e senza un club attivo — un link vecchio, un preferito — lo si adotta
          da qui, invece di lasciare mezza scheda vuota: le sezioni che
          leggono dal club (categorie, piani, gruppi) altrimenti resterebbero
          senza dati e sembrerebbero rotte.
        */
        if (!clubId && athleteRecord.club_id) {
          setClubId(String(athleteRecord.club_id));
        }

        // Transform the simplified_athletes record to the expected format
        const athletePayload = normalizeRecord(athleteRecord.data);
        const athleteData: Record<string, any> = {
          id: athleteRecord.id,
          firstName: athleteRecord.first_name,
          lastName: athleteRecord.last_name,
          birthDate: athleteRecord.birth_date,
          ...athletePayload,
        };
        const normalizedCategoryOptions = normalizeCollection<any>(categoryOptions);
        const normalizedTrainingRecords = normalizeCollection<any>(trainingRecords);
        const normalizedMatchRecords = normalizeCollection<any>(matchRecords);
        const normalizedCollections =
          normalizeAthleteProfileCollections(athleteData);
        const normalizedMedicalCertificates = normalizeCollection<any>(
          certificateRecords,
        )
          .map((certificate: any) => ({
            id: certificate.id,
            type: certificate.type || certificate.notes || "Certificato Medico",
            issueDate: certificate.issue_date,
            expiryDate: certificate.expiry_date,
            status: getMedicalCertificateStatus(certificate.expiry_date),
            fileUrl: certificate.file_url || certificate.document_url || "",
          }))
          .sort((left: any, right: any) => {
            const leftTime = left.expiryDate
              ? new Date(left.expiryDate).getTime()
              : 0;
            const rightTime = right.expiryDate
              ? new Date(right.expiryDate).getTime()
              : 0;
            return rightTime - leftTime;
          });
        const latestMedicalCertExpiry =
          getLatestMedicalCertificateExpiry(normalizedMedicalCertificates) ||
          athleteData.medicalCertExpiry ||
          "";
        const resolvedClothingSizes = {
          ...DEFAULT_CLOTHING_SIZES,
          ...normalizedCollections.clothingSizes,
          profile:
            normalizedCollections.clothingSizes.profile ||
            deriveClothingProfile(
              athleteData.gender || "",
              athleteData.birthDate || athleteRecord.birth_date || "",
            ),
        };
        const normalizedMemberships = normalizeAthleteCategoryMemberships(
          athleteRecord,
          normalizedCategoryOptions,
        );
        const primaryMembership = getPrimaryAthleteCategoryMembership(
          normalizedMemberships,
          normalizedCategoryOptions,
        );
        const normalizedCategoryLabels =
          normalizedMemberships.length > 0
            ? normalizedMemberships.map((membership) => membership.categoryName)
            : normalizeStringList(athleteData.categories);
        const categoryAnalytics = calculateAthleteCategoryAnalytics({
          athlete: athleteRecord,
          categoryMemberships: normalizedMemberships,
          trainings: normalizedTrainingRecords,
          matches: normalizedMatchRecords,
          categories: normalizedCategoryOptions,
        });

        setAthlete({
          id: athleteData.id,
          /* Lo stato ha un vocabolario solo (`athletes/status.ts`): la pillola lo legge, non lo cambia. */
          status: normalizeAthleteStatus(
            athleteRecord.status ?? athletePayload?.status,
          ),
          name: normalizeTextValue(athleteData.firstName, "Nome non disponibile"),
          surname: normalizeTextValue(athleteData.lastName),
          jerseyNumber:
            athleteData.jerseyNumber === null ||
            athleteData.jerseyNumber === undefined ||
            athleteData.jerseyNumber === ""
              ? null
              : Number(athleteData.jerseyNumber),
          fiscalCode: normalizeTextValue(athleteData.fiscalCode),
          birthDate: normalizeTextValue(athleteData.birthDate),
          nationality: normalizeTextValue(athleteData.nationality, "Italiana"),
          birthPlace: normalizeTextValue(athleteData.birthPlace),
          gender: normalizeTextValue(athleteData.gender),
          categories: normalizedCategoryLabels,
          categoryMemberships: normalizedMemberships,
          primaryCategoryLabel: primaryMembership?.categoryName || null,
          notes: normalizeTextValue(athleteData.notes),
          registrations: normalizedCollections.registrations,
          phone: normalizeTextValue(athleteData.phone),
          email: normalizeTextValue(athleteData.email),
          address: normalizeTextValue(athleteData.address),
          streetNumber: normalizeTextValue(athleteData.streetNumber),
          city: normalizeTextValue(athleteData.city),
          postalCode: normalizeTextValue(athleteData.postalCode),
          country: normalizeTextValue(athleteData.country, "Italia"),
          region: normalizeTextValue(athleteData.region),
          province: normalizeTextValue(athleteData.province),
          blsd: athleteData.blsd || false,
          firstAid: athleteData.firstAid || false,
          fireSafety: athleteData.fireSafety || false,
          bloodType: normalizeTextValue(athleteData.bloodType),
          allergies: normalizeTextValue(athleteData.allergies),
          chronicDiseases: normalizeTextValue(athleteData.chronicDiseases),
          medications: normalizeTextValue(athleteData.medications),
          emergencyContact: normalizeTextValue(athleteData.emergencyContact),
          emergencyPhone: normalizeTextValue(athleteData.emergencyPhone),
          medicalCertExpiry: latestMedicalCertExpiry,
          enrollmentStatus: coerceBooleanField(
            athleteData.enrollmentStatus ??
              athleteData.isRegistered ??
              athleteData.registered ??
              athleteData.enrolled,
          ),
          enrollmentDate: normalizeTextValue(
            athleteData.enrollmentDate || athleteData.enrollment_date,
          ),
          enrollmentNotes: normalizeTextValue(athleteData.enrollmentNotes),
          selectedPlan: normalizeTextValue(
            athleteData.selectedPlanId ||
              athleteData.selected_plan_id ||
              athleteData.selectedPlan,
          ),
          enrollmentStartDate: normalizeTextValue(
            athleteData.subscriptionStartDate ||
              athleteData.subscription_start_date ||
              athleteData.enrollmentStartDate ||
              athleteData.enrollment_start_date ||
              athleteData.selectedPlanStartDate ||
              athleteData.selected_plan_start_date ||
              athleteData.enrollmentPaymentConfig?.subscriptionStartDate,
          ),
          subscriptionStartDate: normalizeTextValue(
            athleteData.subscriptionStartDate ||
              athleteData.subscription_start_date ||
              athleteData.enrollmentStartDate ||
              athleteData.enrollment_start_date ||
              athleteData.enrollmentPaymentConfig?.subscriptionStartDate,
          ),
          manualEnrollmentAmount:
            athleteData.manualEnrollmentAmount ??
            athleteData.manual_enrollment_amount ??
            athleteData.selectedPlanManualAmount ??
            athleteData.selected_plan_manual_amount ??
            "",
          selectedOptionalServiceIds: Array.isArray(
            athleteData.selectedOptionalServiceIds ||
              athleteData.selected_optional_service_ids ||
              athleteData.enrollmentSelectedOptionalServiceIds,
          )
            ? (
                athleteData.selectedOptionalServiceIds ||
                athleteData.selected_optional_service_ids ||
                athleteData.enrollmentSelectedOptionalServiceIds
              ).map((value: any) => String(value || "").trim()).filter(Boolean)
            : [],
          discount: normalizeTextValue(athleteData.discount),
          documentType: normalizeTextValue(athleteData.documentType),
          documentNumber: normalizeTextValue(athleteData.documentNumber),
          documentExpiry: normalizeTextValue(athleteData.documentExpiry),
          documentIssue: normalizeTextValue(athleteData.documentIssue),
          residencePermitExpiry: normalizeTextValue(athleteData.residencePermitExpiry),
          avatar: normalizeNullableTextValue(athleteData.avatar),
          clothingSizes: resolvedClothingSizes,
          identityDocuments: normalizedCollections.identityDocuments,
          enrollmentDocuments: normalizedCollections.enrollmentDocuments,
          /* Il registro decide chi entra: senza, il badge non lo sa dire. */
          contactOnlyIdentities: athletePayload?.contactOnlyIdentities || [],
        });
        setClubCategoryOptions(normalizedCategoryOptions);
        setClubCategoryCatalogAllSeasons(
          Array.isArray(catalogoTutteLeStagioni) && catalogoTutteLeStagioni.length
            ? buildClubCategoryOptions({ clubCategories: catalogoTutteLeStagioni, resourceCategories: [], athletes: [] })
            : [],
        );
        setAthleteCategoryAnalytics(categoryAnalytics);

        // Draft per dialog numero maglia
        setJerseyNumberDraft(
          athleteData.jerseyNumber === null ||
            athleteData.jerseyNumber === undefined ||
            athleteData.jerseyNumber === ""
            ? ""
            : String(athleteData.jerseyNumber),
        );

        setGuardians(normalizeGuardianRows(normalizedCollections.guardians));
        setRegistrations(normalizedCollections.registrations);
        setMedicalVisits(normalizedCollections.medicalVisits);
        setMedicalCertificates(normalizedMedicalCertificates);
        setIdentityDocuments(normalizedCollections.identityDocuments);
        setEnrollmentDocuments(normalizedCollections.enrollmentDocuments);
        setDocuments(normalizedCollections.documents);
        await refreshSharedDocuments().catch((error) => {
          console.warn("Error loading shared documents:", error);
          setSharedDocuments([]);
        });
        setPayments(normalizedCollections.payments);
        setAthletePaymentRecords(
          Array.isArray(athletePaymentRows) ? athletePaymentRows : [],
        );
        setCertificateFiles(normalizedCollections.certificateFiles);
        setClothingSizes(resolvedClothingSizes);
        setClubFederations(listClubFederations(clubRecord));
        setActiveSeasonLabel(
          clubRecord ? normalizeActiveClubSeason(clubRecord).activeSeasonLabel || null : null,
        );
        setClubPaymentMethodChoices(
          getClubPaymentMethodChoices(clubRecord?.settings),
        );

        // Load payment plans and discounts from club
        try {
          const { getClubData } = await import("@/lib/simplified-db");

          // Get the club ID from the athlete record if available
          const effectiveClubId = athleteRecord.club_id || clubId;

          if (effectiveClubId) {
            const [
              plans,
              clubDiscounts,
              expectedIncome,
              products,
              kits,
              inventory,
              groups,
              assignments,
              jersey,
              sites,
              categoryGroups,
            ] = await Promise.all([
              getClubData(effectiveClubId, "payment_plans"),
              getClubData(effectiveClubId, "discounts"),
              getClubData(effectiveClubId, "expected_income"),
              getClubData(effectiveClubId, "clothing_products"),
              getClubData(effectiveClubId, "clothing_kits"),
              getClubData(effectiveClubId, "clothing_inventory"),
              getClubData(effectiveClubId, "jersey_groups"),
              getClubData(effectiveClubId, "kit_assignments"),
              getClubData(effectiveClubId, "jersey_assignments"),
              getClubData(effectiveClubId, "club_sites"),
              getClubData(effectiveClubId, "category_groups"),
            ]);
            /*
              Il periodo della stagione attiva serve al pro-rata: e il
              «periodo» che il piano chiede e che quasi nessuno riscrive a
              mano ogni anno. Vedi calculateProratedTotal.
            */
            setActiveSeasonPeriod(
              await loadActiveSeasonPeriod(effectiveClubId),
            );
            setClubSites(normalizeClubSites(sites));
            /*
              I gruppi servono soltanto a **scrivere** una categoria (N3): la
              tendina della primaria offriva due voci identiche su un club con
              due «Under 15», e sceglierne una sbagliata sposta un ragazzo di
              squadra senza che nessuno se ne accorga.
            */
            setClubCategoryGroupsRaw(
              Array.isArray(categoryGroups) ? categoryGroups : [],
            );
            setClothingProducts(Array.isArray(products) ? products : []);
            setClothingKits(
              Array.isArray(kits) ? kits.map(normalizeKitRecord) : [],
            );
            setClothingInventory(Array.isArray(inventory) ? inventory : []);
            setJerseyGroups(Array.isArray(groups) ? groups : []);
            setKitAssignments(
              Array.isArray(assignments)
                ? assignments.map(normalizeKitAssignmentRecord)
                : [],
            );
            setJerseyAssignments(Array.isArray(jersey) ? jersey : []);
            setPaymentPlans(Array.isArray(plans) ? plans : []);
            setDiscounts(Array.isArray(clubDiscounts) ? clubDiscounts : []);
            setExpectedIncomeEntries(
              Array.isArray(expectedIncome) ? expectedIncome : [],
            );
          }
        } catch (e) {
          // Silently handle errors - empty arrays are already set as defaults
        }
      } catch (error) {
        console.error("Error fetching athlete data:", error);
        showToast({
          title: "Errore",
          description: "Errore nel caricamento dei dati dell'atleta",
          variant: "destructive",
        });
      } finally {
        setIsLoading(false);
      }
    };

    fetchAthleteData();
  }, [clubId, athleteId, athleteDataVersion, refreshSharedDocuments, showToast]);

  const handleEditSection = (section: string) => {
    setEditingSection(section);
    setEditFormData({ ...athlete });
    setShowEditModal(true);
  };

  const handleSaveSection = async () => {
    if (!clubId || !athleteId) return;

    try {
      const { updateClubAthlete } = await import("@/lib/simplified-db");

      /*
        **Le appartenenze si mandano solo quando le si sta modificando**
        (ADR-0185, revisione ostile H2). `editFormData` e una copia intera
        della scheda, e `updateClubAthlete` cancella e riscrive le righe di
        `athlete_category_memberships` ogni volta che riceve un elenco. Il
        lettore lascia fuori i riferimenti pendenti — la riga con il solo
        nome che non nomina nessuna categoria — quindi rimandare l'elenco dal
        cassetto dei recapiti li avrebbe cancellati in silenzio: una bonifica
        che nessuno ha autorizzato, innescata da un numero di telefono.
      */
      const {
        categoryMemberships,
        category_memberships,
        memberships,
        categories,
        category,
        category_id,
        categoryName,
        category_name,
        ...fuoriDalleCategorie
      } = editFormData;
      const payload =
        editingSection === "general" ? editFormData : fuoriDalleCategorie;

      const updatedAthlete = await updateClubAthlete(clubId, athleteId, {
        ...payload,
        guardians,
        registrations,
        medicalVisits,
        identityDocuments,
        enrollmentDocuments,
        documents,
        payments,
        certificateFiles,
        clothingSizes,
      });

      setAthlete((currentAthlete: any) => ({
        ...currentAthlete,
        ...editFormData,
        categories:
          updatedAthlete?.categories ||
          editFormData.categories ||
          currentAthlete?.categories ||
          [],
        categoryMemberships:
          updatedAthlete?.categoryMemberships ||
          editFormData.categoryMemberships ||
          currentAthlete?.categoryMemberships ||
          [],
        primaryCategoryLabel:
          updatedAthlete?.category_name ||
          currentAthlete?.primaryCategoryLabel ||
          null,
        guardians,
        registrations,
        medicalVisits,
        identityDocuments,
        enrollmentDocuments,
        documents,
        payments,
        certificateFiles,
        clothingSizes,
      }));
      setEditingSection(null);
      setShowEditModal(false);
      showToast("success", "Modifiche salvate con successo");
    } catch (error) {
      console.error("Error updating athlete:", error);
      showToast({
        title: "Errore",
        description: "Errore nel salvataggio delle modifiche",
        variant: "destructive",
      });
    }
  };

  const handleCancelEdit = () => {
    setEditingSection(null);
    setShowEditModal(false);
    setEditFormData({});
  };

  const athleteCategoryMemberships = normalizeAthleteCategoryMemberships(
    athlete,
    categoryCatalogForIdentity,
  );
  const editCategoryMemberships = normalizeAthleteCategoryMemberships(
    editFormData,
    categoryCatalogForIdentity,
  );
  /*
    Le collocazioni scegliibili del club (ADR-0194): una squadra per gruppo
    operativo attivo, la categoria nuda dove non ci sono sedi. La sede
    dell'atleta si deriva da qui, non si sceglie a parte.
  */
  const membershipTargetIndex = useMembershipTargetIndex({
    categories: clubCategoryOptions,
    groups: clubCategoryGroups,
    sites: clubSites,
  });

  /**
   * L'editor condiviso restituisce l'insieme intero delle appartenenze:
   * si scrive nel modulo come righe (`categoryMemberships`) e come etichette.
   * Il salvataggio le manda al writer del dominio, che deriva e vaglia la
   * sede e conserva le righe storiche che l'editor non nomina.
   */
  const handleMembershipsChange = (next: EditorMembership[]) => {
    setEditFormData({
      ...editFormData,
      categoryMemberships: next.map((membership) => ({
        category_id: membership.categoryId,
        category_name: membership.categoryName,
        stored_category_name: membership.storedCategoryName || membership.categoryName,
        is_primary: membership.isPrimary,
        site_id: membership.siteId || "",
      })),
      categories: [
        ...next.filter((m) => m.isPrimary).map((m) => m.categoryName),
        ...next.filter((m) => !m.isPrimary).map((m) => m.categoryName),
      ],
    });
  };

  /**
   * **La cancellazione di una persona chiede conferma come la chiede il resto
   * del prodotto.**
   *
   * Fin qui usava il `confirm()` del browser, mentre due tab piu in la la
   * stessa scheda protegge con un dialogo dell'applicazione la cancellazione
   * di un **certificato**. Il documento aveva piu tutela della persona.
   *
   * Il `confirm()` nativo non e solo brutto: non dice cosa si perde, il
   * browser lo sopprime dopo il primo uso («impedisci a questa pagina di
   * creare altre finestre»), e dentro una webview puo non comparire affatto —
   * cioe l'operazione irreversibile parte senza che nessuno abbia confermato
   * niente. `ConfirmDialog` e la primitiva che questa applicazione usa gia
   * per le conferme (`src/components/ui/dialog.tsx`).
   */
  /*
    Un solo meccanismo di conferma per tutta la scheda, e restituisce una
    promessa: le tre azioni irreversibili di questo file sono `async` e devono
    poter **attendere** la risposta esattamente dove prima attendevano
    `window.confirm`. Cosi la riga chiamante resta una sola, e non nascono tre
    stati diversi per la stessa domanda.
  */
  const [confermaInSospeso, setConfermaInSospeso] = useState<{
    title: string;
    description: string;
    confirmText: string;
    type: "warning" | "info" | "question" | "error";
    /** Per la conferma distruttiva: le righe di «cosa se ne va». */
    consequences?: string[];
    risolvi: (esito: boolean) => void;
  } | null>(null);

  const richiediConferma = (richiesta: {
    title: string;
    description: string;
    confirmText?: string;
    type?: "warning" | "info" | "question" | "error";
    consequences?: string[];
  }) =>
    new Promise<boolean>((risolvi) => {
      setConfermaInSospeso({
        title: richiesta.title,
        description: richiesta.description,
        confirmText: richiesta.confirmText ?? "Conferma",
        type: richiesta.type ?? "warning",
        consequences: richiesta.consequences,
        risolvi,
      });
    });

  const chiudiConferma = (esito: boolean) => {
    setConfermaInSospeso((corrente) => {
      corrente?.risolvi(esito);
      return null;
    });
  };

  const handleDeleteAthlete = async () => {
    if (!clubId || !athleteId) return;

    const nome =
      [athlete?.name, athlete?.surname].filter(Boolean).join(" ") ||
      "questo atleta";

    /*
      **Il dialogo prometteva una cosa che il server non fa piu.**

      Diceva «la scheda, le appartenenze e i certificati medici collegati
      vengono rimossi». Da quando `assertPersonalDataDisposed` e innestata in
      `deleteResource`, un'anagrafica con anche un solo file, consenso,
      richiesta o deposito **non si cancella affatto**: la promessa era falsa
      per quasi ogni atleta reale, perche l'iscrizione online crea richieste
      documentali e i moduli registrano consensi.

      Adesso dice cosa succede davvero, e dice dove sta l'altra strada.
    */
    const confermato = await richiediConferma({
      type: "error",
      title: `Eliminare ${nome}?`,
      confirmText: "Elimina atleta",
      description: "Stai per eliminare la scheda di questo atleta.",
      consequences: [
        "La scheda e le appartenenze alle categorie vengono rimosse.",
        "Le rate e i movimenti già registrati restano in contabilità.",
        "Se questa persona ha file, consensi, richieste o consegne documentali, " +
          "l'eliminazione non parte: quei dati resterebbero in archivio slegati da tutto, " +
          "e vanno trattati dalla sezione «Dati personali» di questa scheda.",
      ],
    });
    if (!confermato) return;

    try {
      const { deleteClubAthlete } = await import("@/lib/simplified-db");
      await deleteClubAthlete(clubId, athleteId);
      showToast("success", "Atleta eliminato con successo");
      router.push(clubId ? `/athletes?clubId=${clubId}` : "/athletes");
    } catch (error: any) {
      console.error("Error deleting athlete:", error);
      /*
        **Il messaggio del server diceva gia perche, e qui veniva buttato via.**

        La guardia elenca i dati che restano — «3 file depositati, 2 consensi
        registrati» — e indica la strada. Sostituirlo con «Errore
        nell'eliminazione dell'atleta» lasciava la persona senza sapere ne cosa
        fosse successo ne cosa fare.
      */
      const messaggio = String(error?.message || "").trim();
      showToast({
        title: "Errore",
        description: eDatiPersonaliDaSmaltire(messaggio)
          ? messaggioDatiPersonali(messaggio)
          : messaggio || "Errore nell'eliminazione dell'atleta",
        variant: "destructive",
      });
    }
  };

  /*
    **«Invia credenziali» non c'e piu, ed e una buona notizia** (W6-26).

    Qui viveva un gestore che non chiamava niente: mostrava un errore, e prima
    ancora un messaggio **verde** che dichiarava un invio mai avvenuto. La
    segreteria chiudeva la scheda convinta di aver fatto una cosa che non era
    successa.

    L'invito adesso esiste come funzione — token opaco, scadenza, revoca,
    audit — e non entra in un pulsante: ha tre stati e quattro azioni, e sta
    nella sezione «Accesso EasyGame» qui sotto.
  */

  // Handle avatar upload
  const handleAvatarChange = async (imageData: string | null) => {
    const newAvatar = imageData || null;
    const updatedAthlete = { ...athlete, avatar: newAvatar };
    setAthlete(updatedAthlete);

    // Save to database immediately
    if (clubId && athleteId) {
      try {
        const { updateClubAthlete } = await import("@/lib/simplified-db");
        await updateClubAthlete(clubId, athleteId, { avatar: newAvatar });
        showToast("success", "Foto profilo aggiornata");
      } catch (error) {
        console.error("Error saving avatar:", error);
        showToast({
          title: "Errore",
          description: "Errore nel salvataggio della foto",
          variant: "destructive",
        });
      }
    }
  };

  /**
   * Salva un attestato e lo **persiste**.
   *
   * Prima l'upload chiamava solo `setCertificateFiles`: il file compariva, e
   * spariva al primo refresh. `persistAthleteCollections` scriveva
   * `certificateFiles` sull'atleta, ma nessuno la chiamava da qui.
   */
  const saveCertificateFile = async (key: string, next: string | null) => {
    const nextFiles = { ...certificateFiles };
    if (next) nextFiles[key] = next;
    else delete nextFiles[key];

    await persistAthleteCollections({ certificateFilesOverride: nextFiles });
    setCertificateFiles(nextFiles);
  };

  const persistAthleteCollections = async ({
    athleteOverrides = {},
    guardiansOverride = guardians,
    registrationsOverride = registrations,
    medicalVisitsOverride = medicalVisits,
    identityDocumentsOverride = identityDocuments,
    enrollmentDocumentsOverride = enrollmentDocuments,
    documentsOverride = documents,
    paymentsOverride = payments,
    certificateFilesOverride = certificateFiles,
    clothingSizesOverride = clothingSizes,
  }: any = {}) => {
    const effectiveClubId = athlete?.club_id || clubId;
    if (!effectiveClubId || !athleteId || !athlete) {
      throw new Error("Atleta o club non disponibile");
    }

    const { updateClubAthlete } = await import("@/lib/simplified-db");
    /*
      **Un certificato non e un cambio di categoria** (ADR-0185 §8, revisione
      ostile A6/C-R2). `...athlete` porterebbe le appartenenze, e il writer
      le rileggerebbe come dichiarate: su una scheda con una riga storica
      non ancora bonificata il salvataggio di un documento fallirebbe, o
      riscriverebbe righe che nessuno ha toccato. Le categorie partono solo
      dal cassetto che le modifica.
    */
    const {
      categoryMemberships: _cm,
      category_memberships: _cms,
      memberships: _m,
      categories: _c,
      category: _cat,
      category_id: _cid,
      categoryName: _cn,
      category_name: _cns,
      ...atletaSenzaCategorie
    } = athlete as Record<string, any>;
    const nextAthlete = {
      ...atletaSenzaCategorie,
      ...athleteOverrides,
      guardians: guardiansOverride,
      registrations: registrationsOverride,
      medicalVisits: medicalVisitsOverride,
      identityDocuments: identityDocumentsOverride,
      enrollmentDocuments: enrollmentDocumentsOverride,
      documents: documentsOverride,
      payments: paymentsOverride,
      certificateFiles: certificateFilesOverride,
      clothingSizes: clothingSizesOverride,
    };

    await updateClubAthlete(effectiveClubId, athleteId, nextAthlete);
    setAthlete(nextAthlete);
  };

  const updateGuardianAccessState = async (
    guardianId: string,
    updates: Record<string, any>,
  ) => {
    const nextGuardians = guardians.map((guardian) =>
      guardian.id === guardianId
        ? {
            ...guardian,
            ...updates,
          }
        : guardian,
    );

    await persistAthleteCollections({
      guardiansOverride: nextGuardians,
    });
    setGuardians(nextGuardians);
    return nextGuardians.find((guardian) => guardian.id === guardianId);
  };

  const copyGuardianAccessToken = async (tokenValue?: string | null) => {
    const normalizedToken = String(tokenValue || "").trim();
    if (!normalizedToken) {
      showToast("error", "Genera prima un token per questo genitore");
      return false;
    }

    try {
      await navigator.clipboard.writeText(
        formatParentAccessToken(normalizedToken),
      );
      showToast("success", "Token genitore copiato negli appunti");
      return true;
    } catch (error) {
      console.error("Error copying guardian token:", error);
      showToast("error", "Impossibile copiare il token");
      return false;
    }
  };

  const handleGenerateGuardianToken = async (guardianId: string) => {
    const guardian = guardians.find((entry) => entry.id === guardianId);
    const effectiveClubId = athlete?.club_id || clubId;

    if (!guardian || !effectiveClubId || !athleteId || !athlete) {
      showToast("error", "Genitore o atleta non disponibile");
      return;
    }

    const existingToken =
      guardian.parentAccessTokenValue ||
      guardian.parent_access_token_value ||
      guardian.accessTokenValue ||
      "";
    const linkedUserId = String(
      guardian.linkedUserId || guardian.linked_user_id || "",
    ).trim();

    if (existingToken && !linkedUserId) {
      const confermato = await richiediConferma({
        type: "question",
        title: "Rigenerare il token di accesso?",
        confirmText: "Rigenera",
        description:
          "Esiste gia un token attivo per questo genitore. Rigenerandolo, " +
          "quello consegnato in precedenza smette di funzionare.",
      });
      if (!confermato) return;
    }

    setGuardianAccessBusyId(guardianId);

    try {
      const headers = {
        "x-active-club-id": effectiveClubId,
      };
      const nowIso = new Date().toISOString();
      const expiresAt = new Date(
        Date.now() + PARENT_TOKEN_EXPIRY_HOURS * 60 * 60 * 1000,
      ).toISOString();
      const tokenValue = createParentAccessToken();
      const previousRecordId =
        guardian.parentAccessTokenRecordId ||
        guardian.parent_access_token_record_id ||
        guardian.accessTokenRecordId ||
        null;

      if (previousRecordId) {
        const expireResponse = await apiRequest(
          `/api/v1/access_tokens/${previousRecordId}`,
          {
            method: "PATCH",
            headers,
            body: {
              status: "expired",
              date: nowIso,
              expired_at: nowIso,
              superseded_at: nowIso,
              superseded_by_guardian_id: guardianId,
            },
          },
        );

        if (expireResponse.error) {
          throw new Error(expireResponse.error.message);
        }
      }

      const createResponse = await apiRequest<any>("/api/v1/access_tokens", {
        method: "POST",
        headers,
        body: {
          organization_id: effectiveClubId,
          name: tokenValue,
          status: "active",
          date: expiresAt,
          role: "parent",
          one_time: true,
          token_type: "parent_access",
          usage_context: "guardian_account_link",
          athlete_id: athleteId,
          athlete_name: `${athlete.firstName || ""} ${athlete.lastName || ""}`.trim(),
          guardian_id: guardianId,
          guardian_name: getGuardianDisplayName(guardian),
          guardian_email: guardian.email || null,
          expires_at: expiresAt,
          generated_at: nowIso,
        },
      });

      if (createResponse.error || !createResponse.data?.id) {
        throw new Error(
          createResponse.error?.message || "Errore generazione token genitore",
        );
      }

      const accessState = {
        parentAccessTokenRecordId: createResponse.data.id,
        parent_access_token_record_id: createResponse.data.id,
        parentAccessTokenValue: tokenValue,
        parent_access_token_value: tokenValue,
        parentAccessTokenStatus: "active",
        parent_access_token_status: "active",
        parentAccessTokenExpiresAt: expiresAt,
        parent_access_token_expires_at: expiresAt,
        parentAccessTokenGeneratedAt: nowIso,
        parent_access_token_generated_at: nowIso,
        parentAccessTokenRedeemedAt: null,
        parent_access_token_redeemed_at: null,
        linkedUserId: null,
        linked_user_id: null,
        linkedUserEmail: "",
        linked_user_email: "",
        linkedAt: null,
        linked_at: null,
      };

      await updateGuardianAccessState(guardianId, accessState);
      await copyGuardianAccessToken(tokenValue);
      showToast(
        "success",
        "Token genitore generato. Il token e collegato solo a questo genitore.",
      );
    } catch (error: any) {
      console.error("Error generating guardian token:", error);
      showToast(
        "error",
        error?.message || "Errore nella generazione del token genitore",
      );
    } finally {
      setGuardianAccessBusyId(null);
    }
  };

  /*
    Una sola chiamata al dominio (`unlinkGuardianAccount`,
    `src/lib/server/profile-account-links.ts`): slega l'utenza da questo
    genitore e revoca il suo token d'accesso, in una scrittura server sola e
    auditata invece di due chiamate client separate (correzione Fortitudo
    Scauri, 2026-09-03). Non tocca `organization_users`: era gia cosi, e resta
    cosi.
  */
  const handleDisconnectGuardianAccount = async (guardianId: string) => {
    const guardian = guardians.find((entry) => entry.id === guardianId);
    const effectiveClubId = athlete?.club_id || clubId;
    const effectiveAthleteId = athlete?.id || athleteId;

    if (!guardian || !effectiveClubId || !effectiveAthleteId) {
      showToast("error", "Genitore non disponibile");
      return;
    }

    const confermato = await richiediConferma({
      type: "warning",
      title: "Scollegare l'account da questo genitore?",
      confirmText: "Scollega",
      description:
        "Il genitore resta nella scheda atleta, ma perde l'accesso all'area " +
        "famiglia: non vedra piu calendario, pagamenti e documenti del " +
        "minore finche non gli viene consegnato un nuovo token.",
    });
    if (!confermato) return;

    setGuardianAccessBusyId(guardianId);

    try {
      const risposta = await apiRequest(
        `/api/v1/guardian-accounts/${encodeURIComponent(effectiveAthleteId)}/${encodeURIComponent(guardianId)}`,
        {
          method: "DELETE",
          headers: { "x-active-club-id": effectiveClubId },
        },
      );

      if (risposta.error) {
        throw new Error(risposta.error.message);
      }

      const nextGuardians = guardians.map((entry) =>
        entry.id === guardianId
          ? {
              ...entry,
              linkedUserId: null,
              linked_user_id: null,
              linkedUserEmail: "",
              linked_user_email: "",
              linkedAt: null,
              linked_at: null,
              parentAccessTokenStatus: "revoked",
              parent_access_token_status: "revoked",
              parentAccessTokenValue: "",
              parent_access_token_value: "",
            }
          : entry,
      );
      setGuardians(nextGuardians);
      showToast("success", "Account scollegato dal genitore");
    } catch (error: any) {
      console.error("Error disconnecting guardian account:", error);
      showToast(
        "error",
        error?.message || "Errore nello scollegamento dell'account genitore",
      );
    } finally {
      setGuardianAccessBusyId(null);
    }
  };

  /**
   * Un allegato pronto da salvare nel record.
   *
   * Il file **non** entra nel record: `uploadAttachmentReference` lo carica e
   * torna `attachment:<id>`, poche decine di caratteri al posto di qualche
   * megabyte di base64 (WP-15, ADR-0034). `fileName` resta perche e il nome
   * con cui l'operatore lo ha caricato, e serve a riconoscerlo nell'elenco.
   */
  const buildStoredAttachment = async (
    input: { name: string; type: string; notes?: string; file: File | null },
    fallbackType: string,
    category: string,
  ) => {
    const fileUrl = await uploadAttachmentReference(input.file, {
      ownerType: "athlete",
      ownerId: athleteId,
      organizationId: clubId,
      category,
    });

    return {
      id: Date.now().toString(),
      name: input.name,
      type: input.type || fallbackType,
      notes: input.notes || "",
      fileName: input.file?.name || "",
      fileUrl,
      uploadDate: new Date().toISOString(),
    };
  };

  const mergedPaymentRecords = React.useMemo(
    () => mergeAthletePayments(payments, athletePaymentRecords),
    [athletePaymentRecords, payments],
  );

  const expectedIncomeSummary = React.useMemo(
    () =>
      calculateAthleteExpectedIncome({
        athlete,
        athleteId,
        paymentPlans,
        discounts,
        payments: mergedPaymentRecords,
        expectedIncomeEntries,
        seasonPeriod: activeSeasonPeriod,
      }),
    [
      activeSeasonPeriod,
      athlete,
      athleteId,
      discounts,
      expectedIncomeEntries,
      mergedPaymentRecords,
      paymentPlans,
    ],
  );

  const normalizedPaymentPlans = React.useMemo(
    () => normalizePaymentPlans(paymentPlans),
    [paymentPlans],
  );

  const selectedAthletePlan = React.useMemo(
    () => findPaymentPlan(athlete?.selectedPlan, paymentPlans),
    [athlete?.selectedPlan, paymentPlans],
  );

  const selectedPlanValue =
    selectedAthletePlan?.id ||
    (athlete?.selectedPlan ? String(athlete.selectedPlan) : "none");
  const selectedOptionalServiceIds = React.useMemo(
    () =>
      Array.isArray(athlete?.selectedOptionalServiceIds)
        ? athlete.selectedOptionalServiceIds.map((value: any) =>
            String(value || "").trim(),
          )
        : [],
    [athlete?.selectedOptionalServiceIds],
  );
  const selectedOptionalServiceIdSet = React.useMemo(
    () => new Set(selectedOptionalServiceIds),
    [selectedOptionalServiceIds],
  );
  const requiredPlanServices = selectedAthletePlan
    ? selectedAthletePlan.services.filter((service) => !service.optional)
    : [];
  const optionalPlanServices = selectedAthletePlan
    ? selectedAthletePlan.services.filter((service) => service.optional)
    : [];
  const openPlanConfirmationDialog = React.useCallback(
    (planId: string) => {
      const plan = findPaymentPlan(planId, paymentPlans);
      if (!plan) {
        showToast("error", "Piano di pagamento non trovato");
        return;
      }

      const isCurrentPlan =
        String(athlete?.selectedPlan || "").trim() === String(plan.id).trim();
      setPlanConfirmationDraft({
        planId: plan.id,
        subscriptionStartDate:
          (isCurrentPlan &&
            (athlete?.subscriptionStartDate || athlete?.enrollmentStartDate)) ||
          athlete?.enrollmentDate ||
          getTodayDateString(),
        selectedOptionalServiceIds: isCurrentPlan
          ? selectedOptionalServiceIds
          : [],
        manualEnrollmentAmount: isCurrentPlan
          ? String(athlete?.manualEnrollmentAmount || "")
          : "",
      });
      setShowPlanConfirmDialog(true);
    },
    [
      athlete?.enrollmentDate,
      athlete?.enrollmentStartDate,
      athlete?.manualEnrollmentAmount,
      athlete?.selectedPlan,
      athlete?.subscriptionStartDate,
      paymentPlans,
      selectedOptionalServiceIds,
      showToast,
    ],
  );
  const planConfirmationPlan = React.useMemo(
    () => findPaymentPlan(planConfirmationDraft?.planId, paymentPlans),
    [paymentPlans, planConfirmationDraft?.planId],
  );
  const planConfirmationSummary = React.useMemo(() => {
    if (!planConfirmationPlan || !planConfirmationDraft) {
      return null;
    }

    return calculateAthleteExpectedIncome({
      athlete: {
        ...athlete,
        selectedPlan: planConfirmationPlan.id,
        selectedPlanId: planConfirmationPlan.id,
        enrollmentDate: athlete?.enrollmentDate || "",
        enrollmentStartDate: planConfirmationDraft.subscriptionStartDate,
        subscriptionStartDate: planConfirmationDraft.subscriptionStartDate,
        selectedOptionalServiceIds:
          planConfirmationDraft.selectedOptionalServiceIds,
        manualEnrollmentAmount: planConfirmationDraft.manualEnrollmentAmount,
      },
      athleteId,
      paymentPlans,
      discounts,
      payments: mergedPaymentRecords,
      expectedIncomeEntries,
      seasonPeriod: activeSeasonPeriod,
    });
  }, [
    activeSeasonPeriod,
    athlete,
    athleteId,
    discounts,
    expectedIncomeEntries,
    mergedPaymentRecords,
    paymentPlans,
    planConfirmationDraft,
    planConfirmationPlan,
  ]);
  const planConfirmationInstallmentPreview = React.useMemo(() => {
    if (!planConfirmationPlan || !planConfirmationDraft || !planConfirmationSummary) {
      return { installments: [], warnings: [] as string[] };
    }

    return generateInstallmentPreview(
      planConfirmationPlan,
      planConfirmationSummary.expectedTotal,
      { startDate: planConfirmationDraft.subscriptionStartDate },
    );
  }, [
    planConfirmationDraft,
    planConfirmationPlan,
    planConfirmationSummary,
  ]);
  const planConfirmationRequiredServices = planConfirmationPlan
    ? planConfirmationPlan.services.filter((service) => !service.optional)
    : [];
  const planConfirmationOptionalServices = planConfirmationPlan
    ? planConfirmationPlan.services.filter((service) => service.optional)
    : [];
  const planConfirmationIncludedServices = planConfirmationPlan
    ? getPlanServicesForAthlete(
        planConfirmationPlan,
        planConfirmationDraft?.selectedOptionalServiceIds || [],
      )
    : [];
  const enrollmentProration = React.useMemo(
    () => describeProrationResult(expectedIncomeSummary.prorationResult),
    [expectedIncomeSummary.prorationResult],
  );
  const planConfirmationProration = React.useMemo(
    () => describeProrationResult(planConfirmationSummary?.prorationResult),
    [planConfirmationSummary?.prorationResult],
  );
  const planConfirmationBaseTotal = planConfirmationPlan
    ? calculatePlanTotal(planConfirmationPlan, {
        selectedOptionalServiceIds:
          planConfirmationDraft?.selectedOptionalServiceIds || [],
      })
    : 0;

  const saveEnrollmentProfile = React.useCallback(
    async (overrides: Record<string, any>, successMessage?: string) => {
      await persistAthleteCollections({
        athleteOverrides: {
          enrollmentStatus: athlete?.enrollmentStatus ?? false,
          enrollmentDate: athlete?.enrollmentDate || "",
          enrollmentNotes: athlete?.enrollmentNotes || "",
          selectedPlan: athlete?.selectedPlan || "",
          selectedPlanId: athlete?.selectedPlan || "",
          subscriptionStartDate:
            athlete?.subscriptionStartDate || athlete?.enrollmentStartDate || "",
          enrollmentStartDate: athlete?.enrollmentStartDate || "",
          manualEnrollmentAmount: athlete?.manualEnrollmentAmount || "",
          selectedOptionalServiceIds: athlete?.selectedOptionalServiceIds || [],
          enrollmentSelectedOptionalServiceIds:
            athlete?.selectedOptionalServiceIds || [],
          discount: athlete?.discount || "",
          ...overrides,
        },
      });

      if (successMessage) {
        showToast("success", successMessage);
      }
    },
    [athlete, showToast],
  );

  const handleEnrollmentToggle = React.useCallback(
    async (checked: boolean) => {
      if (!athlete) {
        return;
      }

      const previousStatus = coerceBooleanField(athlete.enrollmentStatus);
      const previousEnrollmentDate = athlete.enrollmentDate || "";
      const nextEnrollmentDate =
        checked && !previousEnrollmentDate
          ? getTodayDateString()
          : previousEnrollmentDate;
      setAthlete((current: any) =>
        current
          ? {
              ...current,
              enrollmentStatus: checked,
              enrollmentDate: nextEnrollmentDate,
            }
          : current,
      );
      setIsEnrollmentSaving(true);

      try {
        await saveEnrollmentProfile(
          {
            enrollmentStatus: checked,
            enrollmentDate: nextEnrollmentDate,
          },
          checked
            ? "Iscrizione attivata correttamente"
            : "Iscrizione disattivata correttamente",
        );
      } catch (error) {
        console.error("Error updating enrollment status:", error);
        setAthlete((current: any) =>
          current
            ? {
                ...current,
                enrollmentStatus: previousStatus,
                enrollmentDate: previousEnrollmentDate,
              }
            : current,
        );
        showToast("error", "Impossibile salvare lo stato iscrizione");
      } finally {
        setIsEnrollmentSaving(false);
      }
    },
    [athlete, saveEnrollmentProfile, showToast],
  );

  const handleEnrollmentDateBlur = React.useCallback(async () => {
    if (!athlete) {
      return;
    }

    try {
      await saveEnrollmentProfile({
        enrollmentDate: athlete.enrollmentDate || "",
      });
    } catch (error) {
      console.error("Error updating enrollment date:", error);
      showToast("error", "Impossibile salvare la data iscrizione");
    }
  }, [athlete, saveEnrollmentProfile, showToast]);

  const handleContinuePlanConfirmation = React.useCallback(() => {
    if (!planConfirmationPlan || !planConfirmationDraft) {
      showToast("error", "Seleziona un piano valido");
      return;
    }

    if (!planConfirmationDraft.subscriptionStartDate) {
      showToast("error", "Seleziona la data inizio abbonamento");
      return;
    }

    if (planConfirmationInstallmentPreview.warnings.length > 0) {
      showToast("error", planConfirmationInstallmentPreview.warnings[0]);
      return;
    }

    setShowPlanConfirmDialog(false);
    setShowCreatePaymentsDialog(true);
  }, [
    planConfirmationDraft,
    planConfirmationInstallmentPreview.warnings,
    planConfirmationPlan,
    showToast,
  ]);

  const confirmEnrollmentPlanAssignment = React.useCallback(async () => {
    if (
      !athlete ||
      !planConfirmationPlan ||
      !planConfirmationDraft ||
      !planConfirmationSummary
    ) {
      showToast("error", "Dati piano non disponibili");
      return;
    }

    const effectiveClubId = athlete.club_id || clubId;
    if (!effectiveClubId) {
      showToast("error", "Club non disponibile");
      return;
    }

    const installments = planConfirmationInstallmentPreview.installments;
    if (installments.length === 0) {
      showToast("error", "Configura almeno una rata per questo piano");
      return;
    }

    try {
      setIsEnrollmentSaving(true);
      const selectedOptionalIds =
        planConfirmationDraft.selectedOptionalServiceIds;
      const manualAmount = planConfirmationDraft.manualEnrollmentAmount || "";
      const manualOverrideApplied =
        planConfirmationSummary.prorationResult?.method === "manual";

      await saveEnrollmentProfile(
        {
          selectedPlan: planConfirmationPlan.id,
          selectedPlanId: planConfirmationPlan.id,
          subscriptionStartDate: planConfirmationDraft.subscriptionStartDate,
          enrollmentStartDate: planConfirmationDraft.subscriptionStartDate,
          selectedOptionalServiceIds: selectedOptionalIds,
          enrollmentSelectedOptionalServiceIds: selectedOptionalIds,
          manualEnrollmentAmount: manualAmount,
          enrollmentPaymentConfig: {
            planId: planConfirmationPlan.id,
            planName: planConfirmationPlan.name,
            subscriptionStartDate: planConfirmationDraft.subscriptionStartDate,
            enrollmentDate: athlete.enrollmentDate || null,
            selectedOptionalServiceIds: selectedOptionalIds,
            includedServices: planConfirmationIncludedServices,
            baseTotal: planConfirmationBaseTotal,
            grossAmount: planConfirmationSummary.grossAmount,
            totalDiscounts: planConfirmationSummary.totalDiscounts,
            finalTotal: planConfirmationSummary.expectedTotal,
            prorationApplied:
              planConfirmationSummary.prorationResult?.applied || false,
            manualOverrideApplied,
            installments,
            updatedAt: new Date().toISOString(),
          },
        },
      );

      const { syncAthleteEnrollmentInstallmentPayments } = await import(
        "@/lib/simplified-db"
      );
      const syncedPayments = await syncAthleteEnrollmentInstallmentPayments({
        clubId: effectiveClubId,
        athleteId,
        planId: planConfirmationPlan.id,
        planName: planConfirmationPlan.name,
        installments,
        selectedOptionalServiceIds: selectedOptionalIds,
        enrollmentDate: athlete.enrollmentDate || null,
        enrollmentStartDate: planConfirmationDraft.subscriptionStartDate,
        subscriptionStartDate: planConfirmationDraft.subscriptionStartDate,
        manualEnrollmentAmount: manualAmount || null,
        originalAmount: planConfirmationSummary.grossAmount,
        prorationApplied:
          planConfirmationSummary.prorationResult?.applied || false,
        manualOverrideApplied,
      });
      setAthletePaymentRecords(
        Array.isArray(syncedPayments) ? syncedPayments : [],
      );
      setShowCreatePaymentsDialog(false);
      setPlanConfirmationDraft(null);
      showToast(
        "success",
        "Piano assegnato e pagamenti in attesa creati correttamente",
      );
    } catch (error) {
      console.error("Error confirming enrollment plan:", error);
      showToast("error", "Impossibile confermare piano e pagamenti");
    } finally {
      setIsEnrollmentSaving(false);
    }
  }, [
    athlete,
    athleteId,
    clubId,
    planConfirmationBaseTotal,
    planConfirmationDraft,
    planConfirmationIncludedServices,
    planConfirmationInstallmentPreview.installments,
    planConfirmationPlan,
    planConfirmationSummary,
    saveEnrollmentProfile,
    showToast,
  ]);

  /*
    Un incasso registrato sposta la rata: il server la restituisce gia
    riscritta, e sostituirla qui fa aggiornare nello stesso render il
    Riepilogo Incasso, il totale pagato e il residuo. Senza questo passaggio
    resterebbero fermi finche qualcuno non ricarica la pagina.
  */
  const handleLedgerChanged = React.useCallback((updatedCharge: any | null) => {
    if (!updatedCharge?.id) return;

    setAthletePaymentRecords((current) =>
      current.map((payment: any) =>
        String(payment?.id) === String(updatedCharge.id)
          ? { ...payment, ...updatedCharge }
          : payment,
      ),
    );
  }, []);

  const isEditableAthletePayment = (payment: any) =>
    payment?.source === "athlete_payment" &&
    payment?.statusKey !== "cancelled" &&
    payment?.data?.excludedFromTotals !== true;

  // Il metodo gia salvato resta selezionabile anche se il club nel frattempo
  // lo ha rimosso dalla configurazione: modificare l'importo non deve
  // cancellare in silenzio l'informazione su come e stato incassato.
  const paymentMethodOptions = React.useMemo(() => {
    const current = String(paymentEditForm.method || "").trim();
    if (!current) {
      return clubPaymentMethodChoices;
    }

    return clubPaymentMethodChoices.some(
      (method) => method.toLowerCase() === current.toLowerCase(),
    )
      ? clubPaymentMethodChoices
      : [...clubPaymentMethodChoices, current];
  }, [clubPaymentMethodChoices, paymentEditForm.method]);

  const openPaymentEditDialog = (payment: any) => {
    if (!isEditableAthletePayment(payment) || payment.statusKey === "paid") {
      showToast("error", "Solo i pagamenti in attesa possono essere modificati");
      return;
    }

    setEditingPayment(payment);
    setPaymentEditForm({
      description: payment.description || "",
      amount: String(payment.amount || ""),
      dueDate: payment.dueDate
        ? new Date(payment.dueDate).toISOString().slice(0, 10)
        : "",
      status: payment.statusKey === "paid" ? "paid" : "pending",
      method: payment.method || "",
      notes: payment.notes || payment.raw?.notes || "",
    });
  };

  const requestPaymentUpdate = () => {
    if (!editingPayment) {
      return;
    }

    const amount = Number.parseFloat(String(paymentEditForm.amount || ""));
    if (!Number.isFinite(amount) || amount <= 0) {
      showToast("error", "Inserisci un importo valido");
      return;
    }

    setPaymentPinAction({
      action: "update",
      payment: editingPayment,
      updates: {
        ...paymentEditForm,
        amount,
      },
    });
  };

  const requestPaymentDelete = (payment: any) => {
    if (!isEditableAthletePayment(payment)) {
      return;
    }

    if (payment.statusKey === "paid") {
      showToast("error", "Un pagamento saldato va annullato, non eliminato");
      return;
    }

    setPaymentPinAction({
      action: "delete",
      payment,
      reason: "Pagamento eliminato dallo storico atleta",
    });
  };

  /**
   * La riga di `payments` che corrisponde a una rata del registro.
   *
   * Le finestre di dialogo lavorano sull'anagrafica della rata e vogliono il
   * record; il registro ragiona per rate e ne conosce l'id. Il ponte sta qui,
   * in un posto solo, invece di ricostruire il record dal registro — che
   * sarebbe una seconda idea di cos'e una rata.
   */
  const findPaymentRecordForLedger = React.useCallback(
    (ledger: { installmentId?: string | null }) =>
      mergedPaymentRecords.find(
        (record: any) =>
          String(record?.id || "") === String(ledger?.installmentId || ""),
      ) || null,
    [mergedPaymentRecords],
  );

  const requestPaymentCancel = (payment: any) => {
    if (!isEditableAthletePayment(payment)) {
      return;
    }

    setPaymentPinAction({
      action: "cancel",
      payment,
      reason: "Pagamento annullato dallo storico atleta",
    });
  };

  /*
    Il PIN di club e stato rimosso (Blocco 7, punto 17).

    La rotta `/api/athlete-payments/:id` chiedeva un PIN che aveva valore
    predefinito `"1234"` in chiaro nel codice, era leggibile dalle API del
    club (`?fields=payment_pin`) ed era lo stesso per tutti: non diceva chi
    avesse agito ne impediva a chi non doveva di agire.

    Al suo posto la rotta controlla il **ruolo**, cosa che il PIN non ha mai
    fatto: prima un allenatore con accesso al club poteva modificare un
    pagamento conoscendo quattro cifre note a tutti. Restano sessione,
    appartenenza al club, regole di dominio e traccia di audit.
  */
  const executePaymentAction = async () => {
    if (!paymentPinAction) {
      return;
    }

    try {
      setIsPaymentActionSaving(true);
      const response = await apiRequest(
        `/api/athlete-payments/${paymentPinAction.payment.id}`,
        {
          method: "PATCH",
          body: {
            action: paymentPinAction.action,
            updates: paymentPinAction.updates,
            reason: paymentPinAction.reason,
          },
        },
      );

      if (response.error) {
        throw new Error(response.error.message);
      }

      const { getAthletePayments } = await import("@/lib/simplified-db");
      const refreshedPayments = await getAthletePayments(athleteId);
      setAthletePaymentRecords(
        Array.isArray(refreshedPayments) ? refreshedPayments : [],
      );
      setPaymentPinAction(null);
      setEditingPayment(null);
      showToast(
        "success",
        paymentPinAction.action === "update"
          ? "Pagamento aggiornato"
          : paymentPinAction.action === "delete"
            ? "Pagamento eliminato dallo storico"
            : "Pagamento annullato",
      );
    } catch (error: any) {
      showToast("error", error?.message || "PIN non valido o azione non riuscita");
    } finally {
      setIsPaymentActionSaving(false);
    }
  };

  // Handle add document
  const handleAddDocument = async () => {
    if (!newDocument.name || !newDocument.type) {
      showToast({
        title: "Errore",
        description: "Compila tutti i campi obbligatori",
        variant: "destructive",
      });
      return;
    }

    try {
      /*
        **La categoria segue il tipo dichiarato, o il gate sui byte non si
        accende mai.**

        La categoria era la costante `"documento"` anche quando la tendina
        diceva «Certificato Medico». Ma il controllo che protegge i byte di un
        documento sanitario giudica proprio la **categoria**
        (`isMedicalCertificateDocumentKind`), quindi non si accendeva: un
        certificato caricato da qui usciva a chiunque potesse leggere gli
        allegati di un atleta.

        Il tipo lo dichiara chi carica, in italiano; la categoria e il
        vocabolario del fascicolo. `normalizeDocumentKind` traduce dall'uno
        all'altro, ed e lo stesso che il gate interroga: un vocabolario solo per
        la stessa domanda.
      */
      const categoriaDichiarata = normalizeDocumentKind(newDocument.type);
      const doc = await buildStoredAttachment(
        {
          name: newDocument.name,
          type: newDocument.type,
          file: newDocument.file,
        },
        newDocument.type,
        categoriaDichiarata || "documento",
      );
      const nextDocuments = [...documents, doc];

      await persistAthleteCollections({
        documentsOverride: nextDocuments,
      });
      setDocuments(nextDocuments);
      setNewDocument({ name: "", type: "", file: null });
      setShowAddDocumentModal(false);
      showToast("success", "Documento aggiunto con successo");
    } catch (error) {
      console.error("Error adding document:", error);
      showToast("error", "Impossibile aggiungere il documento");
    }
  };

  // Handle add guardian
  const handleAddGuardian = async () => {
    if (!newGuardian.name || !newGuardian.surname) {
      showToast({
        title: "Errore",
        description: "Nome e cognome sono obbligatori",
        variant: "destructive",
      });
      return;
    }

    const existingGuardian =
      editingGuardianIndex !== null ? guardians[editingGuardianIndex] : null;
    const guardian = {
      ...(existingGuardian || {}),
      ...newGuardian,
      id: newGuardian.id || existingGuardian?.id || Date.now().toString(),
    };
    const nextGuardians =
      editingGuardianIndex !== null
        ? guardians.map((item, index) =>
            index === editingGuardianIndex ? guardian : item,
          )
        : [...guardians, guardian];

    try {
      await persistAthleteCollections({
        guardiansOverride: nextGuardians,
      });
      setGuardians(nextGuardians);
      setEditingGuardianIndex(null);
    } catch (error) {
      console.error("Error saving guardian:", error);
      showToast("error", "Impossibile salvare il tutore");
      return;
    }

    setNewGuardian({
      id: "",
      name: "",
      surname: "",
      relationship: "",
      fiscalCode: "",
      birthDate: "",
      gender: "",
      birthPlace: "",
      birthPlaceCode: "",
      phone: "",
      email: "",
    });
    setShowAddGuardianModal(false);
    showToast(
      "success",
      editingGuardianIndex !== null ? "Tutore modificato" : "Tutore aggiunto",
    );
  };

  // Open guardian edit modal
  const openEditGuardianModal = (index: number) => {
    const guardian = guardians[index] || {};
    setEditingGuardianIndex(index);
    /*
      I tutori gia in archivio non hanno le chiavi aggiunte dal Blocco 7
      (sesso, comune di nascita): passarli cosi com'erano renderebbe quei
      campi non controllati, e React se ne lamenta in console mentre l'utente
      digita. Si parte dai vuoti e si sovrascrive con cio che c'e.
    */
    setNewGuardian({
      id: "",
      name: "",
      surname: "",
      relationship: "",
      fiscalCode: "",
      birthDate: "",
      gender: "",
      birthPlace: "",
      birthPlaceCode: "",
      phone: "",
      email: "",
      ...guardian,
    });
    setShowAddGuardianModal(true);
  };

  // Delete document
  const handleDeleteDocument = async (docId: string) => {
    const documento = documents.find((d) => d.id === docId);
    const confermato = await richiediConferma({
      type: "error",
      title: documento?.name ? `Eliminare «${documento.name}»?` : "Eliminare il documento?",
      confirmText: "Elimina",
      description: "Il documento viene tolto dalla scheda dell'atleta.",
      consequences: [documento?.fileName || documento?.type || "Documento"],
    });
    if (!confermato) return;

    try {
      const nextDocuments = documents.filter((d) => d.id !== docId);
      await persistAthleteCollections({
        documentsOverride: nextDocuments,
      });
      setDocuments(nextDocuments);
      showToast("success", "Documento eliminato");
    } catch (error) {
      console.error("Error deleting document:", error);
      showToast("error", "Impossibile eliminare il documento");
    }
  };

  const handleRequestSharedDocument = async () => {
    if (!requiredSharedDocument.title.trim()) {
      showToast("error", "Inserisci il titolo del documento richiesto");
      return false;
    }

    try {
      setSharedDocumentBusy(true);
      const response = await apiRequest<any[]>(
        `/api/athletes/${athleteId}/documents`,
        {
          method: "POST",
          body: {
            action: "require",
            title: requiredSharedDocument.title,
            documentType: requiredSharedDocument.documentType,
            description: requiredSharedDocument.description,
            dueDate: requiredSharedDocument.dueDate,
          },
        },
      );
      if (response.error) throw new Error(response.error.message);
      setSharedDocuments(Array.isArray(response.data) ? response.data : []);
      setRequiredSharedDocument({
        title: "",
        documentType: "other",
        description: "",
        dueDate: "",
      });
      showToast("success", "Documento richiesto alla famiglia");
      return true;
    } catch (error: any) {
      showToast("error", error?.message || "Impossibile richiedere documento");
      return false;
    } finally {
      setSharedDocumentBusy(false);
    }
  };

  const handleUploadClubSharedDocument = async () => {
    if (!clubSharedDocumentUpload.file) {
      showToast("error", "Seleziona un file da condividere");
      return false;
    }

    try {
      setSharedDocumentBusy(true);
      const response = await apiRequest<any[]>(
        `/api/athletes/${athleteId}/documents`,
        {
          method: "POST",
          body: {
            action: "upload",
            title:
              clubSharedDocumentUpload.title ||
              clubSharedDocumentUpload.file.name,
            documentType: clubSharedDocumentUpload.documentType,
            description: clubSharedDocumentUpload.description,
            fileName: clubSharedDocumentUpload.file.name,
            mimeType: clubSharedDocumentUpload.file.type,
            size: clubSharedDocumentUpload.file.size,
            dataBase64: await fileToDataUrl(clubSharedDocumentUpload.file),
            visibleToParent: true,
          },
        },
      );
      if (response.error) throw new Error(response.error.message);
      setSharedDocuments(Array.isArray(response.data) ? response.data : []);
      setClubSharedDocumentUpload({
        title: "",
        documentType: "other",
        description: "",
        file: null,
      });
      showToast("success", "Documento condiviso con la famiglia");
      return true;
    } catch (error: any) {
      showToast("error", error?.message || "Impossibile caricare documento");
      return false;
    } finally {
      setSharedDocumentBusy(false);
    }
  };

  /*
    Il motivo del rifiuto arriva dal dialogo dell'applicazione
    (`SharedDocumentRejectDialog`), non piu da `window.prompt`: era l'unico
    punto della scheda che usava ancora un prompt nativo.
  */
  const handleSharedDocumentAction = async (
    documentId: string,
    action: "approve" | "reject" | "remind" | "delete",
    rejectionReason = "",
  ) => {
    if (action === "reject" && !rejectionReason.trim()) {
      showToast("error", "Il motivo del rifiuto è obbligatorio");
      return false;
    }

    try {
      setSharedDocumentBusy(true);
      const response =
        action === "delete"
          ? await apiRequest<any[]>(`/api/athletes/${athleteId}/documents`, {
              method: "DELETE",
              body: { documentId },
            })
          : await apiRequest<any[]>(`/api/athletes/${athleteId}/documents`, {
              method: "PATCH",
              body: {
                documentId,
                action,
                rejectionReason,
              },
            });

      if (response.error) throw new Error(response.error.message);
      setSharedDocuments(Array.isArray(response.data) ? response.data : []);
      showToast(
        "success",
        action === "approve"
          ? "Documento approvato"
          : action === "reject"
            ? "Documento rifiutato"
            : action === "remind"
              ? "Sollecito inviato"
              : "Documento archiviato",
      );
      return true;
    } catch (error: any) {
      showToast("error", error?.message || "Azione documento non riuscita");
      return false;
    } finally {
      setSharedDocumentBusy(false);
    }
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return "";
    const date = new Date(dateString);
    return date.toLocaleDateString("it-IT", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const addGuardian = () => {
    setEditingGuardianIndex(null);
    setNewGuardian({
      id: "",
      name: "",
      surname: "",
      relationship: "",
      fiscalCode: "",
      birthDate: "",
      gender: "",
      birthPlace: "",
      birthPlaceCode: "",
      phone: "",
      email: "",
    });
    setShowAddGuardianModal(true);
  };

  const removeGuardian = async (id: string) => {
    const tutore = guardians.find((g) => g.id === id);
    const nomeTutore = tutore ? getGuardianDisplayName(tutore) : "questo tutore";
    const confermato = await richiediConferma({
      type: "error",
      title: `Rimuovere ${nomeTutore} dai tutori?`,
      confirmText: "Rimuovi",
      description: "Il tutore viene tolto dalla scheda dell'atleta.",
      consequences: [
        "Non riceve più comunicazioni, pagamenti e documenti di questo atleta.",
        tutore?.linkedUserId || tutore?.linked_user_id
          ? "L'account collegato perde l'accesso all'area famiglia per questo atleta."
          : "Un token di accesso non ancora usato smette di valere.",
      ],
    });
    if (!confermato) return;

    try {
      const nextGuardians = guardians.filter((g) => g.id !== id);
      await persistAthleteCollections({
        guardiansOverride: nextGuardians,
      });
      setGuardians(nextGuardians);
      showToast("success", "Tutore eliminato");
    } catch (error) {
      console.error("Error removing guardian:", error);
      showToast("error", "Impossibile eliminare il tutore");
    }
  };

  const addMedicalVisit = () => {
    setNewMedicalVisit(createEmptyMedicalVisit());
    setShowAddMedicalVisitModal(true);
  };

  const getAthleteFullName = () =>
    [athlete?.name, athlete?.surname].filter(Boolean).join(" ") || "Atleta";

  const resolveLatestExpiry = (
    certificates: any[],
    fallbackExpiry?: string | null,
  ) => getLatestMedicalCertificateExpiry(certificates) || fallbackExpiry || "";

  /**
   * **Correggere un certificato, senza cancellarlo e rifarlo** (N5).
   *
   * Prima esisteva solo la creazione: una scadenza digitata male, o il file
   * arrivato il giorno dopo, si sistemavano solo eliminando la riga e
   * ricreandola — cioe perdendo cio che il club aveva protocollato e lasciando
   * orfano l'allegato di prima.
   *
   * `status` **non si scrive**: lo stato di un certificato e la sua data di
   * scadenza confrontata con oggi, e una colonna che dice «valido» accanto a
   * una data gia passata e il modo in cui un ragazzo scende in campo senza
   * copertura. La colonna resta com'e; a dirlo e `getMedicalCertificateStatus`.
   */
  const handleUpdateMedicalCertificate = async (certificateData: any) => {
    try {
      if (!athleteId || !clubId || !certificateData?.id) {
        showToast("error", "Dati del certificato mancanti");
        return false;
      }

      const { error } = await supabase
        .from("medical_certificates")
        .update({
          type: certificateData.certificateType,
          issue_date: certificateData.issueDate,
          expiry_date: certificateData.expiryDate,
          file_url: certificateData.fileUrl || null,
          notes: certificateData.certificateType,
        })
        .eq("id", certificateData.id);

      if (error) {
        throw error;
      }

      const nextCertificates = medicalCertificates
        .map((certificate: any) =>
          certificate.id === certificateData.id
            ? {
                ...certificate,
                type: certificateData.certificateType,
                issueDate: certificateData.issueDate,
                expiryDate: certificateData.expiryDate,
                status: getMedicalCertificateStatus(certificateData.expiryDate),
                fileUrl: certificateData.fileUrl || "",
              }
            : certificate,
        )
        .sort(compareCertificatesByExpiryDesc);

      const nextExpiry = resolveLatestExpiry(
        nextCertificates,
        athlete?.medicalCertExpiry,
      );

      setMedicalCertificates(nextCertificates);
      setAthlete((current: any) =>
        current ? { ...current, medicalCertExpiry: nextExpiry } : current,
      );

      try {
        const { updateAthlete } = await import("@/lib/simplified-db");
        await updateAthlete(athleteId, {
          data: { medicalCertExpiry: nextExpiry },
        });
      } catch (syncError) {
        console.warn(
          "Unable to sync athlete medical certificate summary:",
          syncError,
        );
      }

      setCertificateToEdit(null);
      showToast("success", "Certificato medico aggiornato");
      return true;
    } catch (error) {
      console.error("Error updating athlete medical certificate:", error);
      showToast("error", "Impossibile aggiornare il certificato medico");
      return false;
    }
  };

  const handleAddMedicalCertificate = async (certificateData: any) => {
    if (certificateData?.id) {
      return handleUpdateMedicalCertificate(certificateData);
    }

    try {
      if (!athleteId || !clubId) {
        showToast("error", "Dati atleta o club mancanti");
        return false;
      }

      if (!certificateData.fileUrl || !certificateData.fileUrl.trim()) {
        showToast("error", "Il caricamento del file e obbligatorio");
        return false;
      }

      const { data, error } = await supabase
        .from("medical_certificates")
        .insert({
          organization_id: clubId,
          athlete_id: athleteId,
          type: certificateData.certificateType,
          issue_date: certificateData.issueDate,
          expiry_date: certificateData.expiryDate,
          file_url: certificateData.fileUrl || null,
          status: getMedicalCertificateStatus(certificateData.expiryDate),
          notes: certificateData.certificateType,
          data: {
            source: "athlete-profile",
            uploaded_file_name: certificateData.fileName || null,
          },
        })
        .select()
        .single();

      if (error) {
        throw error;
      }

      const nextCertificate = {
        id: data?.id || `certificate-${Date.now()}`,
        type:
          data?.type ||
          certificateData.certificateType ||
          "Certificato Medico",
        issueDate: data?.issue_date || certificateData.issueDate,
        expiryDate: data?.expiry_date || certificateData.expiryDate,
        status: getMedicalCertificateStatus(
          data?.expiry_date || certificateData.expiryDate,
        ),
        fileUrl: data?.file_url || certificateData.fileUrl || "",
      };

      const nextCertificates = [nextCertificate, ...medicalCertificates].sort(
        (left: any, right: any) => {
          const leftTime = left.expiryDate
            ? new Date(left.expiryDate).getTime()
            : 0;
          const rightTime = right.expiryDate
            ? new Date(right.expiryDate).getTime()
            : 0;
          return rightTime - leftTime;
        },
      );
      const nextExpiry = resolveLatestExpiry(
        nextCertificates,
        athlete?.medicalCertExpiry,
      );

      setMedicalCertificates(nextCertificates);
      setAthlete((current: any) =>
        current ? { ...current, medicalCertExpiry: nextExpiry } : current,
      );

      try {
        const { updateAthlete } = await import("@/lib/simplified-db");
        await updateAthlete(athleteId, {
          data: {
            medicalCertExpiry: nextExpiry,
          },
        });
      } catch (syncError) {
        console.warn(
          "Unable to sync athlete medical certificate summary:",
          syncError,
        );
      }

      showToast("success", "Certificato medico aggiunto");
      return true;
    } catch (error) {
      console.error("Error adding athlete medical certificate:", error);
      showToast("error", "Impossibile aggiungere il certificato medico");
      return false;
    }
  };

  const deleteMedicalCertificate = async () => {
    if (!certificateToDelete?.id) {
      return;
    }

    try {
      setDeletingCertificateId(certificateToDelete.id);
      const response = await apiRequest(
        `/api/v1/medical_certificates/${certificateToDelete.id}`,
        {
          method: "DELETE",
        },
      );

      if (response.error) {
        throw new Error(
          response.error.message || "Eliminazione certificato non riuscita",
        );
      }

      const nextCertificates = medicalCertificates.filter(
        (certificate) => certificate.id !== certificateToDelete.id,
      );
      const nextExpiry = resolveLatestExpiry(nextCertificates);

      setMedicalCertificates(nextCertificates);
      setAthlete((current: any) =>
        current ? { ...current, medicalCertExpiry: nextExpiry } : current,
      );

      try {
        const { updateAthlete } = await import("@/lib/simplified-db");
        await updateAthlete(athleteId, {
          data: {
            medicalCertExpiry: nextExpiry,
          },
        });
      } catch (syncError) {
        console.warn(
          "Unable to sync athlete medical certificate summary:",
          syncError,
        );
      }

      showToast("success", "Certificato medico eliminato");
      setCertificateToDelete(null);
    } catch (error: any) {
      console.error("Error deleting medical certificate:", error);
      showToast(
        "error",
        error?.message || "Impossibile eliminare il certificato medico",
      );
    } finally {
      setDeletingCertificateId(null);
    }
  };

  const removeMedicalVisit = async (id: string) => {
    try {
      setDeletingMedicalVisitId(id);
      const nextMedicalVisits = medicalVisits.filter((v) => v.id !== id);
      await persistAthleteCollections({
        medicalVisitsOverride: nextMedicalVisits,
      });
      setMedicalVisits(nextMedicalVisits);
      showToast("success", "Visita medica eliminata");
      setMedicalVisitToDelete(null);
    } catch (error) {
      console.error("Error deleting medical visit:", error);
      showToast("error", "Impossibile eliminare la visita medica");
    } finally {
      setDeletingMedicalVisitId(null);
    }
  };

  const handleSaveMedicalVisit = async () => {
    if (!newMedicalVisit.title || !newMedicalVisit.date) {
      showToast("error", "Titolo e data della visita sono obbligatori");
      return;
    }

    try {
      const attachmentUrl = await uploadAttachmentReference(
        newMedicalVisit.file,
        {
          ownerType: "athlete",
          ownerId: athleteId,
          organizationId: clubId,
          category: "visita-medica",
        },
      );
      const visit = {
        id: Date.now().toString(),
        title: newMedicalVisit.title,
        description: newMedicalVisit.description,
        type: newMedicalVisit.type,
        paidBy: newMedicalVisit.paidBy,
        location: newMedicalVisit.location,
        date: newMedicalVisit.date,
        outcome: newMedicalVisit.outcome,
        fileName: newMedicalVisit.file?.name || "",
        fileUrl: attachmentUrl,
      };
      const nextMedicalVisits = [...medicalVisits, visit];

      await persistAthleteCollections({
        medicalVisitsOverride: nextMedicalVisits,
      });
      setMedicalVisits(nextMedicalVisits);
      setNewMedicalVisit(createEmptyMedicalVisit());
      setShowAddMedicalVisitModal(false);
      showToast("success", "Visita medica aggiunta");
    } catch (error) {
      console.error("Error saving medical visit:", error);
      showToast("error", "Impossibile salvare la visita medica");
    }
  };

  const handleSaveRegistration = async () => {
    /*
      Il numero di tessera non e obbligatorio (Blocco 7, punto 9).

      Un tesseramento si registra **prima** che la federazione emetta il
      numero: e la sequenza reale di ogni segreteria a inizio stagione.
      Pretenderlo qui costringeva a inventarlo — e un numero inventato su un
      tesseramento e peggio di un campo vuoto. La federazione invece serve:
      senza di quella il record non dice niente.
    */
    if (!newRegistration.federation) {
      showToast("error", "La federazione o l'ente e obbligatorio");
      return;
    }

    /*
      **L'ente si scrive per identificativo, e deve essere del club** (N2).

      Prima qui finiva il **nome** scelto nella tendina. Rinominare
      un'affiliazione in `/organization` orfanava percio ogni tesseramento gia
      registrato, e niente impediva di scrivere un ente che il club non ha —
      perche la domanda «e uno dei tuoi?» non veniva posta da nessuna parte.

      Si conservano tutti e due: l'identificativo per il legame, il nome come
      etichetta **congelata**, perche uno storico deve poter dire cosa fu vero
      anche dopo che il club ha tolto quell'ente.
    */
    const riferimento = buildRegistrationFederationReference(
      newRegistration.federation,
      clubFederations,
    );

    if (!riferimento) {
      showToast(
        "error",
        "Questa federazione non e fra quelle configurate dal club",
      );
      return;
    }

    try {
      const indiceInModifica = findRegistrationIndex(
        registrations,
        registrationToEdit,
      );
      const inModifica =
        indiceInModifica >= 0 ? registrations[indiceInModifica] : null;

      /*
        Un file nuovo **sostituisce** quello di prima allo stesso id: cosi il
        riferimento sulla riga non cambia e non esiste l'istante in cui punta a
        un allegato che non c'e piu. Senza file nuovo resta quello che c'era.
      */
      const attachmentUrl = newRegistration.file
        ? await uploadAttachmentReference(newRegistration.file, {
            ownerType: "athlete",
            ownerId: athleteId,
            organizationId: clubId,
            category: "tesseramento",
            replaces: String(inModifica?.fileUrl || "") || undefined,
          })
        : String(inModifica?.fileUrl || "");

      const registration = {
        id: String(inModifica?.id || buildRegistrationId()),
        federationId: riferimento.federationId,
        federation: riferimento.federation,
        number: newRegistration.number,
        status: newRegistration.status,
        issueDate: newRegistration.issueDate,
        expiryDate: newRegistration.expiryDate,
        notes: newRegistration.notes,
        fileName:
          newRegistration.file?.name || String(inModifica?.fileName || ""),
        fileUrl: attachmentUrl,
      };

      const nextRegistrations = applyRegistrationEdit(
        registrations,
        indiceInModifica,
        registration,
      );

      await persistAthleteCollections({
        registrationsOverride: nextRegistrations,
        athleteOverrides: {
          registrations: nextRegistrations,
        },
      });
      setRegistrations(nextRegistrations);
      setNewRegistration(createEmptyRegistration());
      setRegistrationToEdit(null);
      setShowAddRegistrationModal(false);
      showToast(
        "success",
        inModifica ? "Tesseramento aggiornato" : "Tesseramento aggiunto",
      );
    } catch (error) {
      console.error("Error saving registration:", error);
      showToast("error", "Impossibile salvare il tesseramento");
    }
  };

  const removeRegistration = async (registrationId: string) => {
    const tesseramento = registrations.find(
      (registration) => String(registration.id || "") === registrationId,
    );
    const confermato = await richiediConferma({
      type: "error",
      title: "Eliminare il tesseramento?",
      confirmText: "Elimina",
      description: "Il tesseramento viene tolto dalla scheda dell'atleta.",
      consequences: [
        readRegistrationFederationLabel(tesseramento || {}, clubFederations) ||
          "Ente non indicato",
        tesseramento?.fileUrl
          ? "L'allegato non sarà più raggiungibile dalla scheda."
          : "Nessun allegato collegato.",
      ],
    });
    if (!confermato) return;

    try {
      const nextRegistrations = registrations.filter(
        (registration) => registration.id !== registrationId,
      );
      await persistAthleteCollections({
        registrationsOverride: nextRegistrations,
        athleteOverrides: {
          registrations: nextRegistrations,
        },
      });
      setRegistrations(nextRegistrations);
      showToast("success", "Tesseramento eliminato");
    } catch (error) {
      console.error("Error deleting registration:", error);
      showToast("error", "Impossibile eliminare il tesseramento");
    }
  };

  const handleSaveIdentityDocument = async () => {
    if (!newIdentityDocument.name || !newIdentityDocument.file) {
      showToast("error", "Nome documento e file sono obbligatori");
      return;
    }

    try {
      const documentRecord = await buildStoredAttachment(
        {
          name: newIdentityDocument.name,
          type: newIdentityDocument.type || "Documento Identità",
          notes: newIdentityDocument.notes,
          file: newIdentityDocument.file,
        },
        "Documento Identità",
        "documento-identita",
      );
      const nextIdentityDocuments = [...identityDocuments, documentRecord];

      await persistAthleteCollections({
        identityDocumentsOverride: nextIdentityDocuments,
        athleteOverrides: {
          identityDocuments: nextIdentityDocuments,
        },
      });
      setIdentityDocuments(nextIdentityDocuments);
      setNewIdentityDocument(createEmptyAttachment());
      setShowAddIdentityDocumentModal(false);
      showToast("success", "Allegato documento aggiunto");
    } catch (error) {
      console.error("Error saving identity document:", error);
      showToast("error", "Impossibile salvare l'allegato documento");
    }
  };

  const handleSaveEnrollmentDocument = async () => {
    if (!newEnrollmentDocument.name || !newEnrollmentDocument.file) {
      showToast("error", "Nome documento e file sono obbligatori");
      return;
    }

    try {
      const documentRecord = await buildStoredAttachment(
        {
          name: newEnrollmentDocument.name,
          type: newEnrollmentDocument.type || "Documento Iscrizione",
          notes: newEnrollmentDocument.notes,
          file: newEnrollmentDocument.file,
        },
        "Documento Iscrizione",
        "documento-iscrizione",
      );
      const nextEnrollmentDocuments = [
        ...enrollmentDocuments,
        documentRecord,
      ];

      await persistAthleteCollections({
        enrollmentDocumentsOverride: nextEnrollmentDocuments,
        athleteOverrides: {
          enrollmentDocuments: nextEnrollmentDocuments,
        },
      });
      setEnrollmentDocuments(nextEnrollmentDocuments);
      setNewEnrollmentDocument(createEmptyAttachment());
      setShowAddEnrollmentDocumentModal(false);
      showToast("success", "Documento di iscrizione aggiunto");
    } catch (error) {
      console.error("Error saving enrollment document:", error);
      showToast("error", "Impossibile salvare il documento di iscrizione");
    }
  };

  const handleSavePayment = async () => {
    if (!newPayment.description || !newPayment.amount || !newPayment.date) {
      showToast("error", "Compila tutti i campi obbligatori");
      return;
    }

    const amount = Number.parseFloat(newPayment.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      showToast("error", "Inserisci un importo valido");
      return;
    }

    try {
      const effectiveClubId = athlete?.club_id || clubId;
      if (!effectiveClubId) {
        throw new Error("Club non disponibile");
      }

      /*
        Una voce aggiunta a mano e un **debito**, e nasce sempre da
        incassare: il denaro lo dimostra un movimento nel registro incassi,
        non una tendina (ADR-0036).
      */
      const response = await apiRequest("/api/v1/simplified_payments", {
        method: "POST",
        body: {
          organization_id: effectiveClubId,
          athlete_id: athleteId,
          description: newPayment.description,
          amount: Number(amount.toFixed(2)),
          due_date: newPayment.date,
          paid_at: null,
          status: "pending",
          method: newPayment.type,
          data: {
            source: "manual_athlete_payment",
            type: newPayment.type,
            athleteId,
            excludedFromTotals: false,
          },
        },
      });

      if (response.error) {
        throw new Error(response.error.message);
      }

      const { getAthletePayments } = await import("@/lib/simplified-db");
      const refreshedPayments = await getAthletePayments(athleteId);
      setAthletePaymentRecords(
        Array.isArray(refreshedPayments) ? refreshedPayments : [],
      );
      setShowAddPaymentModal(false);
      setNewPayment({
        date: getTodayDateString(),
        description: "",
        type: "Quota",
        amount: "",
        status: "In attesa",
      });
      showToast("success", "Voce aggiunta: registrane l'incasso quando arriva");
    } catch (error) {
      console.error("Error adding payment:", error);
      showToast("error", "Impossibile aggiungere il pagamento");
    }
  };

  const removeStoredDocument = async (
    collection: "identity" | "enrollment",
    documentId: string,
  ) => {
    const documento = (collection === "identity" ? identityDocuments : enrollmentDocuments).find(
      (document) => document.id === documentId,
    );
    const confermato = await richiediConferma({
      type: "error",
      title: "Eliminare l'allegato?",
      confirmText: "Elimina",
      description: "L'allegato viene tolto dalla scheda dell'atleta.",
      consequences: [documento?.name || documento?.fileName || "Allegato"],
    });
    if (!confermato) return;

    try {
      if (collection === "identity") {
        const nextIdentityDocuments = identityDocuments.filter(
          (document) => document.id !== documentId,
        );
        await persistAthleteCollections({
          identityDocumentsOverride: nextIdentityDocuments,
          athleteOverrides: {
            identityDocuments: nextIdentityDocuments,
          },
        });
        setIdentityDocuments(nextIdentityDocuments);
      } else {
        const nextEnrollmentDocuments = enrollmentDocuments.filter(
          (document) => document.id !== documentId,
        );
        await persistAthleteCollections({
          enrollmentDocumentsOverride: nextEnrollmentDocuments,
          athleteOverrides: {
            enrollmentDocuments: nextEnrollmentDocuments,
          },
        });
        setEnrollmentDocuments(nextEnrollmentDocuments);
      }

      showToast("success", "Documento eliminato");
    } catch (error) {
      console.error("Error deleting stored document:", error);
      showToast("error", "Impossibile eliminare il documento");
    }
  };

  // ---- Abbigliamento helpers ----
  const clothingState = React.useMemo(
    () =>
      normalizeClubClothingState({
        products: clothingProducts,
        kits: clothingKits,
        inventory: clothingInventory,
        assignments: kitAssignments,
        jerseyGroups,
        jerseyAssignments,
      }),
    [
      clothingInventory,
      clothingKits,
      clothingProducts,
      jerseyAssignments,
      jerseyGroups,
      kitAssignments,
    ],
  );

  const athleteAssignments = React.useMemo(
    () =>
      clothingState.assignments
        .filter((assignment) => assignment.assigneeId === athleteId)
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
    [athleteId, clothingState.assignments],
  );

  const athleteJerseyAssignments = React.useMemo(
    () =>
      clothingState.jerseyAssignments.filter(
        (entry) => entry.athleteId === athleteId && entry.number !== null,
      ),
    [athleteId, clothingState.jerseyAssignments],
  );

  const athleteJerseyNumberDetails = React.useMemo(
    () =>
      getAthleteJerseyNumberSummary({
        athleteId,
        state: clothingState,
        groups: clothingState.numberingGroups,
      }),
    [athleteId, clothingState],
  );

  const jerseyGroupById = React.useMemo(
    () =>
      new Map(
        clothingState.numberingGroups.map((group) => [group.id, group]),
      ),
    [clothingState.numberingGroups],
  );

  const defaultJerseyGroupId =
    athleteJerseyNumberDetails.primaryRecord?.groupId ||
    athleteJerseyAssignments[0]?.groupId ||
    clothingState.numberingGroups[0]?.id ||
    "";
  const jerseyNumberSummary = athleteJerseyNumberDetails.records.length
    ? athleteJerseyNumberDetails.records
        .filter((entry) => entry.number !== null)
        .map(
          (entry) =>
            `${athleteJerseyNumberDetails.groupNameForRecord(entry)}: ${entry.number}`,
        )
        .join(" / ")
    : athlete?.jerseyNumber !== null && athlete?.jerseyNumber !== undefined
      ? `Numero storico: ${athlete.jerseyNumber}`
      : "Nessun numero assegnato";
  const jerseyNumberTileValue =
    athleteJerseyNumberDetails.primaryRecord?.number ??
    (athlete?.jerseyNumber === null || athlete?.jerseyNumber === undefined
      ? null
      : athlete.jerseyNumber);
  const primaryJerseyGroupName =
    athleteJerseyNumberDetails.primaryRecord
      ? athleteJerseyNumberDetails.groupNameForRecord(
          athleteJerseyNumberDetails.primaryRecord,
        )
      : defaultJerseyGroupId
        ? jerseyGroupById.get(defaultJerseyGroupId)?.name || "Gruppo numerazione"
        : "Senza gruppo";
  const hasDuplicateJerseyNumber =
    athleteJerseyNumberDetails.duplicateRecords.length > 0;
  const randomJerseyNumberSuggestion = React.useMemo(() => {
    if (jerseyNumberTileValue !== null && jerseyNumberTileValue !== undefined) {
      return null;
    }

    const group = defaultJerseyGroupId
      ? jerseyGroupById.get(defaultJerseyGroupId)
      : clothingState.numberingGroups[0];
    if (!group) return null;

    const summary = getJerseyGroupSummary({
      group,
      state: clothingState,
      athletes: athlete ? [athlete] : [],
      categories: clubCategoryOptions,
    });

    if (!summary.availableNumbers.length) return null;

    return summary.availableNumbers[
      Math.floor(Math.random() * summary.availableNumbers.length)
    ];
  }, [
    athlete,
    clubCategoryOptions,
    clothingState,
    defaultJerseyGroupId,
    jerseyGroupById,
    jerseyNumberTileValue,
  ]);
  const activeClothingProfile =
    clothingSizes.profile ||
    deriveClothingProfile(athlete?.gender, athlete?.birthDate);
  const activeClothingOptions =
    CLOTHING_SIZE_OPTIONS[
      activeClothingProfile as keyof typeof CLOTHING_SIZE_OPTIONS
    ] || CLOTHING_SIZE_OPTIONS.UOMO;
  const athleteAssignmentSizeOptions = React.useMemo(
    () =>
      Array.from(
        new Set([
          ...activeClothingOptions.shirt,
          ...activeClothingOptions.pants,
          ...activeClothingOptions.shoes,
        ]),
      ),
    [activeClothingOptions],
  );

  const resetNewKitAssignment = () => {
    setNewKitAssignment({
      assignmentType: "kit",
      kitId: "",
      components: [],
      notes: "",
    });
  };

  const saveClothingSizes = async () => {
    try {
      await persistAthleteCollections({
        clothingSizesOverride: clothingSizes,
        athleteOverrides: {
          clothingSizes,
        },
      });
      showToast({ title: "Salvato", description: "Taglie aggiornate." });
    } catch (e: any) {
      showToast({
        title: "Errore",
        description: e?.message || "Impossibile salvare",
        variant: "destructive",
      });
    }
  };

  const sanitizeJerseyDraft = (value: string) => {
    const digitsOnly = (value || "").replace(/\D/g, "");
    return digitsOnly.slice(0, 3);
  };

  const fillRandomJerseyDraft = () => {
    const groupId = jerseyGroupDraft || defaultJerseyGroupId;
    const group = groupId
      ? jerseyGroupById.get(groupId)
      : clothingState.numberingGroups[0];

    if (!group) {
      showToast({
        title: "Gruppo mancante",
        description: "Configura un gruppo numerazione prima di assegnare.",
        variant: "destructive",
      });
      return;
    }

    const summary = getJerseyGroupSummary({
      group,
      state: clothingState,
      athletes: athlete ? [athlete] : [],
      categories: clubCategoryOptions,
    });

    if (!summary.availableNumbers.length) {
      showToast({
        title: "Nessun numero disponibile",
        description: "Tutti i numeri del gruppo sono gia utilizzati o riservati.",
        variant: "destructive",
      });
      return;
    }

    const number =
      summary.availableNumbers[
        Math.floor(Math.random() * summary.availableNumbers.length)
      ];
    setJerseyGroupDraft(group.id);
    setJerseyNumberDraft(String(number));
  };

  const saveJerseyNumber = async () => {
    try {
      const effectiveClubId = athlete?.club_id || clubId;
      if (!effectiveClubId) throw new Error("Club non trovato");

      const cleaned = sanitizeJerseyDraft(jerseyNumberDraft);
      const nextNumber = cleaned === "" ? null : Number(cleaned);
      const groupId = jerseyGroupDraft || defaultJerseyGroupId || "";

      if (
        nextNumber !== null &&
        (Number.isNaN(nextNumber) || nextNumber < 0 || nextNumber > 999)
      ) {
        throw new Error("Numero non valido");
      }

      if (nextNumber !== null && !groupId) {
        throw new Error("Seleziona un gruppo numerazione");
      }

      // Unicità: controlla sia le assegnazioni (pagina Abbigliamento) sia i dati atleti.
      const { getClubData, updateClubData, updateClubAthlete } = await import(
        "@/lib/simplified-db"
      );

      const [currentAssignments, currentKitAssignments] = await Promise.all([
        getClubData(effectiveClubId, "jersey_assignments"),
        getClubData(effectiveClubId, "kit_assignments"),
      ]);

      const assignments = Array.isArray(currentAssignments)
        ? currentAssignments
        : [];

      if (nextNumber !== null) {
        const latestState = normalizeClubClothingState({
          products: clothingProducts,
          kits: clothingKits,
          inventory: clothingInventory,
          assignments: Array.isArray(currentKitAssignments)
            ? currentKitAssignments
            : [],
          jerseyGroups,
          jerseyAssignments: assignments,
        });
        const result = canAssignNumber({
          athleteId,
          groupId,
          number: nextNumber,
          state: latestState,
        });

        if (!result.ok) {
          showToast({
            title: "Numero non disponibile",
            description: result.reason,
            variant: "destructive",
          });
          return;
        }
      }

      // 1) Salva su jersey_assignments (usato dalla pagina Abbigliamento)
      const now = new Date().toISOString();
      const nextAssignments = [...assignments];
      const idx = nextAssignments.findIndex(
        (x: any) => x?.athleteId === athleteId && (x?.groupId || "") === groupId,
      );
      const entry = {
        id: nextAssignments[idx]?.id || `jersey:${athleteId}:${groupId}`,
        athleteId,
        groupId,
        number: nextNumber,
        updatedAt: now,
      };
      if (nextNumber === null && idx >= 0) nextAssignments.splice(idx, 1);
      else if (idx >= 0) nextAssignments[idx] = entry;
      else if (nextNumber !== null) nextAssignments.push(entry);
      await updateClubData(
        effectiveClubId,
        "jersey_assignments",
        nextAssignments,
      );
      setJerseyAssignments(nextAssignments);

      // 2) Salva anche nel record atleta (best-effort / fallback)
      await updateClubAthlete(effectiveClubId, athleteId, {
        jerseyNumber: nextNumber,
      });
      setAthlete((prev: any) => ({ ...prev, jerseyNumber: nextNumber }));

      setJerseyNumberDraft(nextNumber === null ? "" : String(nextNumber));
      setJerseyGroupDraft(groupId);
      setIsJerseyNumberDialogOpen(false);
      showToast({ title: "Salvato", description: "Numero maglia aggiornato." });
    } catch (e: any) {
      showToast({
        title: "Errore",
        description: e?.message || "Impossibile salvare",
        variant: "destructive",
      });
    }
  };

  const addAthleteKitAssignment = async () => {
    try {
      const { addClubData } = await import("@/lib/simplified-db");
      const effectiveClubId = athlete?.club_id || clubId;
      if (!effectiveClubId) throw new Error("Club non trovato");

      const kit = clothingKits.find(
        (k: any) => k.id === newKitAssignment.kitId,
      );
      const components =
        newKitAssignment.assignmentType === "kit"
          ? newKitAssignment.components?.length
            ? newKitAssignment.components
            : buildAthleteKitBuilderComponents(kit?.components)
          : newKitAssignment.components;

      const assignment = {
        id: crypto?.randomUUID ? crypto.randomUUID() : String(Date.now()),
        athleteId,
        assigneeId: athleteId,
        assigneeType: "athlete",
        kitId:
          newKitAssignment.assignmentType === "kit"
            ? newKitAssignment.kitId
            : null,
        kitName: kit?.name || null,
        assignmentType: newKitAssignment.assignmentType,
        source: "manual",
        status: "assigned",
        notes: newKitAssignment.notes || "",
        createdAt: new Date().toISOString(),
        items: normalizeKitAssignmentItems(components),
      };

      await addClubData(effectiveClubId, "kit_assignments", assignment);
      setKitAssignments((prev) => [
        ...prev,
        normalizeKitAssignmentRecord(assignment),
      ]);
      setIsNewKitAssignmentOpen(false);
      resetNewKitAssignment();
      showToast({
        title: "Assegnazione creata",
        description: "Registrata correttamente.",
      });
    } catch (e: any) {
      showToast({
        title: "Errore",
        description: e?.message || "Impossibile creare",
        variant: "destructive",
      });
    }
  };

  const updateAthleteClothingAssignmentStatus = async (
    assignment: ClothingAssignment,
    nextStatus: ClothingAssignmentStatus,
  ) => {
    try {
      const effectiveClubId = athlete?.club_id || clubId;
      if (!effectiveClubId) throw new Error("Club non trovato");
      const { updateClubData } = await import("@/lib/simplified-db");
      const result = updateClothingAssignmentStatus({
        assignmentId: assignment.id,
        nextStatus,
        state: clothingState,
      });
      const serializedAssignments = result.assignments.map(
        serializeClothingAssignment,
      );
      const serializedInventory = result.inventory.map(serializeInventoryStock);
      await Promise.all([
        updateClubData(effectiveClubId, "kit_assignments", serializedAssignments),
        updateClubData(effectiveClubId, "clothing_inventory", serializedInventory),
      ]);
      setKitAssignments(serializedAssignments);
      setClothingInventory(serializedInventory);
      showToast({
        title: "Aggiornato",
        description: "Stato abbigliamento aggiornato.",
      });
    } catch (e: any) {
      showToast({
        title: "Errore",
        description: e?.message || "Impossibile aggiornare lo stato",
        variant: "destructive",
      });
    }
  };

  /* ── Web V2: aree, avvisi, salti di sezione ──────────────────────────── */

  /**
   * Il salto a una sezione: cambia area, apre la riga chiusa se serve e
   * scorre fino al blocco. La striscia degli avvisi e i `?tab=` vecchi
   * passano tutti da qui.
   */
  const goToSection = React.useCallback(
    (target: AthleteRecordTarget) => {
      setArea(target.area);
      if (!target.section) return;
      const collapsedId = COLLAPSED_BY_ANCHOR[target.section];
      if (collapsedId) {
        /*
          Le righe chiuse ricordano lo stato per tipo di record
          (`egw.atleta.sections`): si scrive la preferenza e si rimonta la
          sezione, che al montaggio la rilegge aperta.
        */
        writePreference("atleta", "sections", {
          ...readPreference<Record<string, boolean>>("atleta", "sections", {}),
          [collapsedId]: true,
        });
        setSectionsEpoch((current) => current + 1);
      }
      setPendingScroll(target.section);
    },
    [],
  );

  useEffect(() => {
    if (!pendingScroll || isLoading) return;
    const frame = window.requestAnimationFrame(() => {
      document
        .getElementById(pendingScroll)
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
      setPendingScroll(null);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [pendingScroll, isLoading, area, sectionsEpoch]);

  /* Il `?tab=` dell'indirizzo atterra nella sezione giusta, una volta. */
  useEffect(() => {
    if (isLoading || !athlete || initialSectionHandled.current) return;
    initialSectionHandled.current = true;
    if (initialTarget.section) goToSection(initialTarget);
  }, [athlete, goToSection, initialTarget, isLoading]);

  const athleteIsMinor =
    !athlete?.birthDate || calculateAgeFromBirthDate(athlete.birthDate) < 18;

  const recordAlerts = React.useMemo(
    () =>
      athlete
        ? deriveAthleteRecordAlerts({
            certificates: medicalCertificates,
            payments: mergedPaymentRecords,
            enrollmentStatus: coerceBooleanField(athlete.enrollmentStatus),
            guardians,
            isMinor: athleteIsMinor,
          })
        : [],
    [athlete, athleteIsMinor, guardians, medicalCertificates, mergedPaymentRecords],
  );
  const problemsByArea = React.useMemo(() => countAlertsByArea(recordAlerts), [recordAlerts]);

  const primaryMembership = athleteCategoryMemberships.find((membership) => membership.isPrimary) || null;
  const primarySiteLabel =
    isMultiSiteClub(clubSites) && primaryMembership?.siteId
      ? clubSites.find((site) => String(site.id) === String(primaryMembership.siteId))?.name || null
      : null;

  const openJerseyNumberDrawer = () => {
    const selectedEntry =
      athleteJerseyNumberDetails.primaryRecord ||
      athleteJerseyAssignments.find((entry) => entry.groupId === defaultJerseyGroupId) ||
      athleteJerseyAssignments[0];
    setJerseyGroupDraft(selectedEntry?.groupId || defaultJerseyGroupId || "");
    setJerseyNumberDraft(
      selectedEntry?.number === null || selectedEntry?.number === undefined
        ? jerseyNumberTileValue === null
          ? ""
          : String(jerseyNumberTileValue)
        : String(selectedEntry.number),
    );
    setIsJerseyNumberDialogOpen(true);
  };

  const attestatiConseguiti = [
    athlete?.blsd ? "BLSD" : null,
    athlete?.firstAid ? "Primo soccorso" : null,
    athlete?.fireSafety ? "Antincendio" : null,
  ].filter(Boolean) as string[];

  const shell = (title: string, content: React.ReactNode) => (
    <div className="flex h-[100dvh] bg-egw-page">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header title={title} />
        <main className={dashboardMainClassName}>
          <DashboardPageContainer>{content}</DashboardPageContainer>
        </main>
      </div>
    </div>
  );

  if (isLoading) {
    /* Lo scheletro ha la forma di cio che arriva: intestazione, aree, pannelli. */
    return shell(
      "Scheda atleta",
      <>
        <Panel as="header" className="p-5 lg:p-6">
          <div className="flex flex-wrap items-start gap-5">
            <Skeleton className="h-[72px] w-[72px] rounded-egw-panel-sm" />
            <div className="min-w-0 flex-1">
              <Skeleton className="mb-2 h-3 w-40" />
              <Skeleton className="h-7 w-64" />
              <div className="mt-3 flex gap-2">
                <Skeleton className="h-6 w-28" />
                <Skeleton className="h-6 w-20" />
              </div>
            </div>
            <Skeleton className="h-9 w-40" />
          </div>
          <div className="mt-4 flex justify-end">
            <Skeleton className="h-9 w-[420px] max-w-full" />
          </div>
        </Panel>
        <DetailCard title={<Skeleton className="h-4 w-40" />} loading />
        <DetailCard title={<Skeleton className="h-4 w-32" />} loading columns={2} />
      </>,
    );
  }

  if (!athlete) {
    return shell(
      "Atleta non trovato",
      <EmptyStateCard
        icon={<UserX />}
        iconTone="neutral"
        title="Atleta non trovato"
        description="La scheda non esiste, non è più nel club attivo, o il collegamento è vecchio."
        primary={
          <Button variant="primary" onClick={() => router.push(clubId ? `/athletes?clubId=${clubId}` : "/athletes")}>
            Torna alla lista atleti
          </Button>
        }
      />,
    );
  }

  return (
    <div className="flex h-[100dvh] bg-egw-page">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header title="Scheda atleta" />
        <main className={dashboardMainClassName}>
          <DashboardPageContainer>
            {/*
              L'intestazione della scheda (09 §9.8): identita, chip, pillola
              di stato, al piu due azioni piu il `···` — dove sta anche
              «Elimina atleta», perche il pulsante rosso nell'intestazione e
              deprecato — la striscia degli avvisi e lo switcher delle aree.

              «Accesso EasyGame» resta un'azione dell'intestazione che apre
              il pannello dedicato (PP-01 §G): compare solo a chi puo
              gestirlo, e la chiave del permesso vive nel proprietario del
              dominio, non qui.
            */}
            <AthleteRecordHeader
              athlete={athlete}
              jerseyNumber={jerseyNumberTileValue}
              categories={athleteCategoryMemberships}
              categoryCatalog={clubCategoryOptions}
              categoryGroups={clubCategoryGroups}
              siteLabel={primarySiteLabel}
              seasonLabel={activeSeasonLabel}
              status={athlete.status}
              alerts={recordAlerts}
              onAlertAction={goToSection}
              area={area}
              onAreaChange={setArea}
              problemsByArea={problemsByArea}
              onOpenAccount={
                athleteId && puoGestireAccesso
                  ? () => setPannelloAccessoAperto(true)
                  : null
              }
              onEdit={() => handleEditSection("general")}
              onAvatarChange={handleAvatarChange}
              onDelete={handleDeleteAthlete}
            />

            {athleteId ? (
              <AthleteAccountDialog
                athleteId={athleteId}
                suggestedEmail={athlete?.email || null}
                open={pannelloAccessoAperto}
                onOpenChange={setPannelloAccessoAperto}
              />
            ) : null}

            {/* ═══════════════════════════════════════════ area: Profilo ═══ */}
            {area === "profilo" ? (
              <div key={`profilo-${sectionsEpoch}`} className="flex flex-col gap-[18px]">
                <div id={ATHLETE_RECORD_SECTIONS.anagrafica} className="scroll-mt-24">
                  <AthleteAnagraficaCard
                    athlete={athlete}
                    memberships={athleteCategoryMemberships}
                    categoryCatalog={clubCategoryOptions}
                    categoryGroups={clubCategoryGroups}
                    onEdit={() => handleEditSection("general")}
                  />
                </div>

                <AthleteContattiCard athlete={athlete} onEdit={() => handleEditSection("contact")} />

                <AthleteGuardiansPanel
                  guardians={guardians}
                  contactOnlyIdentities={recapitiSoloContatto}
                  nowMs={nowMs}
                  busyGuardianId={guardianAccessBusyId}
                  onAdd={addGuardian}
                  onEdit={(idx) => openEditGuardianModal(idx)}
                  onRemove={(guardianId) => void removeGuardian(guardianId)}
                  onGenerateToken={(guardianId) => void handleGenerateGuardianToken(guardianId)}
                  onCopyToken={(token) => void copyGuardianAccessToken(token)}
                  onDisconnect={(guardianId) => void handleDisconnectGuardianAccount(guardianId)}
                />

                <div id={ATHLETE_RECORD_SECTIONS.indirizzo} className="scroll-mt-24">
                  <CollapsedSection
                    id="indirizzo"
                    recordType="atleta"
                    title="Indirizzo"
                    summary={summarizeAddress(athlete)}
                    actions={
                      <Button variant="secondary" size="sm" onClick={() => handleEditSection("address")}>
                        Modifica
                      </Button>
                    }
                  >
                    <AthleteIndirizzoFields athlete={athlete} />
                  </CollapsedSection>
                </div>

                {/*
                  **I diritti dell'interessato, in coda a «Profilo»** (PP-01 §I).
                  Non duplicano nessun campo della scheda: mostrano cosa esiste in
                  archivio su questa persona e cosa succederebbe a cancellarlo. La
                  guardia dell'eliminazione nomina questa sezione, e nominare un
                  posto che si raggiunge senza cercarlo e cio che la rende una
                  strada. Compare solo a chi ha una delle due chiavi
                  (`data_subject.export` / `data_subject.erase`), lette dal
                  proprietario del dominio.
                */}
                {athleteId && puoTrattareDatiPersonali ? (
                  <div id={ATHLETE_RECORD_SECTIONS.datiPersonali} className="scroll-mt-24">
                    <CollapsedSection
                      id="dati-personali"
                      recordType="atleta"
                      title="Dati personali"
                      summary="Inventario, esportazione e cancellazione dei dati dell'interessato (GDPR)."
                    >
                      <AthleteDataSubjectSection
                        athleteId={athleteId}
                        athleteName={athlete?.name || null}
                        onErased={() =>
                          router.push(
                            clubId ? `/athletes?clubId=${clubId}` : "/athletes",
                          )
                        }
                      />
                    </CollapsedSection>
                  </div>
                ) : null}
              </div>
            ) : null}

            {/* ═══════════════════════════════════ area: Attività sportiva ═══ */}
            {area === "attivita" ? (
              <div key={`attivita-${sectionsEpoch}`} className="flex flex-col gap-[18px]">
                <AthleteCategoriesCard
                  memberships={athleteCategoryMemberships}
                  categoryCatalog={clubCategoryOptions}
                  categoryGroups={clubCategoryGroups}
                  sites={clubSites}
                  onEdit={() => handleEditSection("general")}
                />

                {/*
                  Le analitiche (presenze, convocazioni) sono il componente
                  condiviso con la vista dell'allenatore: stesso componente,
                  non una seconda stesura.
                */}
                <section id={ATHLETE_RECORD_SECTIONS.analitiche} className="scroll-mt-24">
                  <Eyebrow className="mb-3">Presenze e convocazioni</Eyebrow>
                  <AthleteCategoryAnalyticsSection
                    analytics={athleteCategoryAnalytics}
                    categoryLabel={(reference) => categoryDisplay.label(reference)}
                  />
                </section>

                <AthleteClothingPanel
                  sizes={clothingSizes}
                  activeProfile={activeClothingProfile}
                  options={activeClothingOptions}
                  onChangeSizes={(next) => setClothingSizes({ ...clothingSizes, ...next })}
                  onSaveSizes={() => void saveClothingSizes()}
                  jersey={{
                    value: jerseyNumberTileValue,
                    groupName: primaryJerseyGroupName,
                    summary: jerseyNumberSummary,
                    hasDuplicate: hasDuplicateJerseyNumber,
                    randomSuggestion: randomJerseyNumberSuggestion,
                  }}
                  onEditJersey={openJerseyNumberDrawer}
                />

                <div id={ATHLETE_RECORD_SECTIONS.numeri} className="scroll-mt-24">
                  <CollapsedSection
                    id="numeri-maglia"
                    recordType="atleta"
                    title="Numeri assegnati"
                    count={athleteJerseyNumberDetails.records.filter((entry) => entry.number !== null).length}
                    summary={jerseyNumberSummary}
                  >
                    <AthleteJerseyNumbersList
                      records={athleteJerseyNumberDetails.records}
                      groupById={jerseyGroupById}
                      duplicateIds={new Set<string>(athleteJerseyNumberDetails.duplicateRecords.map((entry: any) => String(entry.id || `${entry.groupId}:${entry.number}`)))}
                      randomSuggestion={randomJerseyNumberSuggestion}
                    />
                  </CollapsedSection>
                </div>

                <div id={ATHLETE_RECORD_SECTIONS.kit} className="scroll-mt-24">
                  <CollapsedSection
                    id="kit"
                    recordType="atleta"
                    title="Assegnazioni kit"
                    count={athleteAssignments.length}
                    summary={
                      athleteAssignments.length
                        ? joinMeta(`Ultima ${formatDateShort(athleteAssignments[0].createdAt)}`, athleteAssignments[0].kitName || "Articoli")
                        : "Nessuna assegnazione registrata"
                    }
                    actions={
                      <Button
                        variant="secondary"
                        size="sm"
                        icon={<Plus />}
                        onClick={() => {
                          resetNewKitAssignment();
                          setIsNewKitAssignmentOpen(true);
                        }}
                      >
                        Nuova assegnazione
                      </Button>
                    }
                  >
                    <AthleteKitAssignmentsList
                      assignments={athleteAssignments}
                      onUpdateStatus={(assignment, next) => void updateAthleteClothingAssignmentStatus(assignment, next)}
                    />
                  </CollapsedSection>
                </div>
              </div>
            ) : null}

            {/* ═══════════════════════════════════ area: Amministrazione ═══ */}
            {area === "amministrazione" ? (
              <div key={`amministrazione-${sectionsEpoch}`} className="flex flex-col gap-[18px]">
                {/*
                  Sei riquadri sono diventati sei sezioni con un ordine e una
                  sola fonte per i numeri (ADR-0056): e il componente
                  condiviso dell'iscrizione, che legge il registro rate dal
                  dominio e non lo ricalcola qui.
                */}
                <section id={ATHLETE_RECORD_SECTIONS.iscrizione} className="scroll-mt-24">
                  <Eyebrow className="mb-3">Iscrizione e quote</Eyebrow>
                  <AthleteEnrollmentTab
                    athleteId={athleteId}
                    athleteName={getAthleteFullName()}
                    enrollmentStatus={Boolean(athlete.enrollmentStatus)}
                    enrollmentDate={athlete.enrollmentDate || ""}
                    enrollmentNotes={athlete.enrollmentNotes || ""}
                    isEnrollmentSaving={isEnrollmentSaving}
                    onEnrollmentToggle={handleEnrollmentToggle}
                    onEnrollmentDateChange={(value: string) =>
                      setAthlete({ ...athlete, enrollmentDate: value })
                    }
                    onEnrollmentDateBlur={handleEnrollmentDateBlur}
                    onEnrollmentNotesChange={(value: string) =>
                      setAthlete({ ...athlete, enrollmentNotes: value })
                    }
                    onSaveEnrollment={async () => {
                      try {
                        setIsEnrollmentSaving(true);
                        await saveEnrollmentProfile({}, "Dati iscrizione salvati");
                      } catch (error) {
                        console.error("Error saving enrollment profile:", error);
                        showToast(
                          "error",
                          "Impossibile salvare i dati di iscrizione",
                        );
                      } finally {
                        setIsEnrollmentSaving(false);
                      }
                    }}
                    charges={athletePaymentRecords}
                    methodChoices={clubPaymentMethodChoices}
                    onLedgerChanged={handleLedgerChanged}
                    onEditInstallment={(entry) => {
                      const record = findPaymentRecordForLedger(entry);
                      if (record) openPaymentEditDialog(record);
                    }}
                    onDeleteInstallment={(entry) => {
                      const record = findPaymentRecordForLedger(entry);
                      if (!record) return;

                      /*
                        Una rata su cui e gia entrato denaro non si cancella: si
                        annulla, e resta nello storico (ADR-0036).
                      */
                      if (entry.paidAmount > 0) requestPaymentCancel(record);
                      else requestPaymentDelete(record);
                    }}
                    onAddInstallment={() => setShowAddPaymentModal(true)}
                    planName={selectedAthletePlan?.name || null}
                    seasonLabel={
                      athlete.subscriptionStartDate || athlete.enrollmentStartDate
                        ? `Abbonamento dal ${formatDate(
                            athlete.subscriptionStartDate ||
                              athlete.enrollmentStartDate,
                          )}`
                        : null
                    }
                    onEditPlan={
                      selectedAthletePlan
                        ? () => openPlanConfirmationDialog(selectedAthletePlan.id)
                        : undefined
                    }
                    breakdown={
                      <EnrollmentPaymentBreakdown
                        summary={expectedIncomeSummary}
                        payments={mergedPaymentRecords}
                        mode="club"
                        showPaymentHistory={false}
                        /*
                          Pagato e residuo stanno nel riepilogo in cima: qui
                          sarebbero un secondo calcolo che, su un atleta con voci
                          fuori piano, lo contraddice (ADR-0056).
                        */
                        showSettlementTotals={false}
                      />
                    }
                    planEditor={
                      <AthletePlanEditor
                        planValue={selectedPlanValue}
                        plans={normalizedPaymentPlans}
                        onPlanChange={(value) => {
                          if (value === "none") {
                            setAthlete({
                              ...athlete,
                              selectedPlan: "",
                              selectedPlanId: "",
                              subscriptionStartDate: "",
                              enrollmentStartDate: "",
                              manualEnrollmentAmount: "",
                              selectedOptionalServiceIds: [],
                            });
                            return;
                          }
                          openPlanConfirmationDialog(value);
                        }}
                        discountValue={athlete.discount || ""}
                        discounts={discounts}
                        onDiscountChange={(value) =>
                          setAthlete({ ...athlete, discount: value === "none" ? "" : value })
                        }
                        selectedPlan={selectedAthletePlan}
                        requiredServices={requiredPlanServices}
                        optionalServices={optionalPlanServices}
                        selectedOptionalServiceIds={selectedOptionalServiceIdSet as Set<string>}
                        proration={enrollmentProration}
                      />
                    }
                    documents={enrollmentDocuments}
                    onCompileForm={() => setCompileFormOpen(true)}
                    onAddDocument={() => {
                      setNewEnrollmentDocument(createEmptyAttachment());
                      setShowAddEnrollmentDocumentModal(true);
                    }}
                    onViewDocument={(document: any) => {
                      if (!openClientFileUrl(document.fileUrl)) {
                        showToast(
                          "error",
                          "File documento iscrizione non disponibile",
                        );
                      }
                    }}
                    onDownloadDocument={(document: any) => {
                      if (
                        !downloadClientFileUrl(
                          document.fileUrl,
                          document.fileName || document.name,
                        )
                      ) {
                        showToast(
                          "error",
                          "File documento iscrizione non disponibile",
                        );
                      }
                    }}
                    onRemoveDocument={(documentId: string) =>
                      removeStoredDocument("enrollment", documentId)
                    }
                  />
                </section>

                <AthleteRegistrationsPanel
                  registrations={registrations}
                  federations={clubFederations}
                  onAdd={() => {
                    setRegistrationToEdit(null);
                    setNewRegistration(createEmptyRegistration());
                    setShowAddRegistrationModal(true);
                  }}
                  onEdit={(registration) => {
                    setRegistrationToEdit(registration);
                    setNewRegistration({
                      ...createEmptyRegistration(),
                      federation: String(
                        registration.federationId || registration.federation || "",
                      ),
                      number: String(registration.number || ""),
                      status: String(registration.status || "In corso"),
                      issueDate: String(registration.issueDate || ""),
                      expiryDate: String(registration.expiryDate || ""),
                      notes: String(registration.notes || ""),
                      file: null,
                    });
                    setShowAddRegistrationModal(true);
                  }}
                  onView={(registration) => {
                    if (!openClientFileUrl(registration.fileUrl)) {
                      showToast(
                        "error",
                        "Allegato del tesseramento non disponibile",
                      );
                    }
                  }}
                  onDownload={(registration) => {
                    if (
                      !downloadAttachment(registration.fileUrl, {
                        documentType: "Tesseramento",
                        firstName: athlete?.name,
                        lastName: athlete?.surname,
                        fullName: athlete?.fullName,
                        date: registration.expiryDate || registration.issueDate,
                      })
                    ) {
                      showToast(
                        "error",
                        "Allegato del tesseramento non disponibile",
                      );
                    }
                  }}
                  onDelete={(registration) =>
                    removeRegistration(String(registration.id || ""))
                  }
                />

                {/*
                  Lavoro e compensi: il componente condiviso con allenatori e
                  staff (`originType` diverso). Si difende da solo dal ruolo:
                  a chi non puo vederlo dice perche.
                */}
                <div id={ATHLETE_RECORD_SECTIONS.compensi} className="scroll-mt-24">
                  <CollapsedSection
                    id="compensi"
                    recordType="atleta"
                    title="Lavoro e compensi"
                    summary="Rapporti di lavoro sportivo, compensi maturati ed erogati, posizione fiscale."
                  >
                    <PersonCompensationTab
                      originType="athlete"
                      originId={athleteId}
                      firstName={athlete?.firstName || athlete?.first_name}
                      lastName={athlete?.lastName || athlete?.last_name}
                      fiscalCode={athlete?.fiscalCode || athlete?.fiscal_code}
                      email={athlete?.email}
                      phone={athlete?.phone}
                    />
                  </CollapsedSection>
                </div>
              </div>
            ) : null}

            {/* ═══════════════════════════════ area: Documenti e sanità ═══ */}
            {area === "documenti" ? (
              <div key={`documenti-${sectionsEpoch}`} className="flex flex-col gap-[18px]">
                <AthleteCertificatesPanel
                  certificates={medicalCertificates}
                  deletingCertificateId={deletingCertificateId}
                  onAdd={() => {
                    setCertificateToEdit(null);
                    setShowAddMedicalCertificateModal(true);
                  }}
                  onEdit={(certificate) => {
                    setCertificateToEdit({
                      id: certificate.id,
                      type: certificate.type,
                      issueDate: certificate.issueDate,
                      expiryDate: certificate.expiryDate,
                      fileUrl: certificate.fileUrl,
                    });
                    setShowAddMedicalCertificateModal(true);
                  }}
                  onView={(certificate) => {
                    if (!openClientFileUrl(certificate.fileUrl)) {
                      showToast(
                        "error",
                        "File del certificato non disponibile",
                      );
                    }
                  }}
                  onDownload={(certificate) => {
                    if (
                      !downloadAttachment(certificate.fileUrl, {
                        documentType: `Certificato ${certificate.type || "medico"}`,
                        firstName: athlete?.name,
                        lastName: athlete?.surname,
                        fullName: athlete?.fullName,
                        date: certificate.expiryDate || certificate.issueDate,
                      })
                    ) {
                      showToast(
                        "error",
                        "File del certificato non disponibile",
                      );
                    }
                  }}
                  onDelete={(certificate) => setCertificateToDelete(certificate)}
                />

                <AthleteSharedDocumentsPanel
                  athleteId={athleteId}
                  documents={sharedDocuments}
                  busy={sharedDocumentBusy}
                  onRefresh={() => void refreshSharedDocuments()}
                  onRequest={() => setSharedRequestOpen(true)}
                  onUpload={() => setSharedUploadOpen(true)}
                  onCompileForm={() => setCompileFormOpen(true)}
                  onApprove={(documentId) => void handleSharedDocumentAction(documentId, "approve")}
                  onReject={(documentId) => {
                    setSharedRejectReason("");
                    setSharedRejectTarget(documentId);
                  }}
                  onRemind={(documentId) => void handleSharedDocumentAction(documentId, "remind")}
                  onDelete={(documentId) => void handleSharedDocumentAction(documentId, "delete")}
                />

                <AthleteHealthInfoCard athlete={athlete} onEdit={() => handleEditSection("medical")} />

                <div id={ATHLETE_RECORD_SECTIONS.visite} className="scroll-mt-24">
                  <CollapsedSection
                    id="visite"
                    recordType="atleta"
                    title="Visite mediche"
                    count={medicalVisits.length}
                    summary={
                      medicalVisits.length
                        ? joinMeta(medicalVisits[medicalVisits.length - 1]?.title, medicalVisits[medicalVisits.length - 1]?.date ? formatDateShort(medicalVisits[medicalVisits.length - 1].date) : null)
                        : "Nessuna visita medica registrata"
                    }
                    actions={<AddAction label="Aggiungi visita" onClick={addMedicalVisit} />}
                  >
                    <AthleteMedicalVisitsList
                      visits={medicalVisits}
                      deletingId={deletingMedicalVisitId}
                      onView={(visit) => {
                        if (visit.fileUrl && !openClientFileUrl(visit.fileUrl)) {
                          showToast("error", "Allegato della visita non disponibile");
                        }
                      }}
                      onDownload={(visit) => {
                        if (
                          visit.fileUrl &&
                          !downloadClientFileUrl(visit.fileUrl, `visita-medica-${visit.title}`)
                        ) {
                          showToast("error", "Allegato della visita non disponibile");
                        }
                      }}
                      onDelete={(visit) => setMedicalVisitToDelete(visit)}
                    />
                  </CollapsedSection>
                </div>

                <div id={ATHLETE_RECORD_SECTIONS.attestati} className="scroll-mt-24">
                  <CollapsedSection
                    id="attestati"
                    recordType="atleta"
                    title="Attestati"
                    count={attestatiConseguiti.length}
                    summary={attestatiConseguiti.length ? attestatiConseguiti.join(" · ") : "Nessun attestato conseguito"}
                  >
                    <AthleteAttestatiPanel
                      athlete={athlete}
                      athleteId={athleteId}
                      clubId={clubId}
                      certificateFiles={certificateFiles}
                      onToggle={(field, checked) => setAthlete({ ...athlete, [field]: checked })}
                      onFileChange={(key, next) => void saveCertificateFile(key, next)}
                    />
                  </CollapsedSection>
                </div>

                <div id={ATHLETE_RECORD_SECTIONS.identita} className="scroll-mt-24">
                  <CollapsedSection
                    id="documento-identita"
                    recordType="atleta"
                    title="Documento di identità"
                    count={identityDocuments.length}
                    summary={summarizeIdentityDocument(athlete)}
                    actions={
                      <>
                        <AddDocumentAction
                          label="Aggiungi allegato"
                          onClick={() => {
                            setNewIdentityDocument(createEmptyAttachment());
                            setShowAddIdentityDocumentModal(true);
                          }}
                        />
                        <Button variant="secondary" size="sm" onClick={() => handleEditSection("identity")}>
                          Modifica
                        </Button>
                      </>
                    }
                  >
                    <AthleteIdentityDocumentFields athlete={athlete} />
                    <Hairline className="my-5" />
                    <Eyebrow className="mb-3">Allegati del documento</Eyebrow>
                    <AthleteStoredDocumentsList
                      aria-label="Allegati del documento di identità"
                      documents={identityDocuments}
                      fallbackType="Documento identità"
                      empty="Nessun allegato documento caricato"
                      onView={(document) => {
                        if (!openClientFileUrl(document.fileUrl)) {
                          showToast("error", "File documento non disponibile");
                        }
                      }}
                      onDownload={(document) => {
                        if (!downloadClientFileUrl(document.fileUrl, document.fileName || document.name)) {
                          showToast("error", "File documento non disponibile");
                        }
                      }}
                      onDelete={(document) => void removeStoredDocument("identity", document.id)}
                    />
                  </CollapsedSection>
                </div>

                <div id={ATHLETE_RECORD_SECTIONS.altriDocumenti} className="scroll-mt-24">
                  <CollapsedSection
                    id="altri-documenti"
                    recordType="atleta"
                    title="Altri documenti"
                    count={documents.length}
                    summary={documents.length ? documents.map((doc) => doc.name).filter(Boolean).slice(0, 3).join(" · ") : "Nessun documento caricato"}
                    actions={<AddDocumentAction label="Aggiungi documento" onClick={() => setShowAddDocumentModal(true)} />}
                  >
                    <AthleteStoredDocumentsList
                      aria-label="Altri documenti"
                      documents={documents}
                      fallbackType="Documento"
                      empty="Nessun documento caricato"
                      onView={(doc) => {
                        if (!openClientFileUrl(doc.fileUrl)) {
                          showToast("error", "File documento non disponibile");
                        }
                      }}
                      onDownload={(doc) => {
                        if (!downloadClientFileUrl(doc.fileUrl, doc.fileName || doc.name)) {
                          showToast("error", "File documento non disponibile");
                        }
                      }}
                      onDelete={(doc) => void handleDeleteDocument(doc.id)}
                    />
                  </CollapsedSection>
                </div>
              </div>
            ) : null}
          </DashboardPageContainer>
        </main>
      </div>

      {/* ══════════════════════════════════ cassetti e conferme ═══ */}
      <AthleteSectionEditDrawer
        section={editingSection as AthleteEditSection | null}
        open={showEditModal}
        onOpenChange={setShowEditModal}
        formData={editFormData}
        setFormData={setEditFormData}
        categories={{
          index: membershipTargetIndex,
          memberships: editCategoryMemberships.map((membership) => ({
            categoryId: membership.categoryId,
            categoryName: membership.categoryName,
            storedCategoryName: membership.storedCategoryName,
            isPrimary: membership.isPrimary,
            siteId: membership.siteId || "",
          })),
          onChange: handleMembershipsChange,
        }}
        onSave={handleSaveSection}
        onCancel={handleCancelEdit}
      />

      <AthleteJerseyNumberDrawer
        open={isJerseyNumberDialogOpen}
        onOpenChange={setIsJerseyNumberDialogOpen}
        groups={clothingState.numberingGroups}
        groupId={jerseyGroupDraft}
        onGroupChange={(value) => {
          const existing = athleteJerseyNumberDetails.records.find(
            (entry) => entry.groupId === value && entry.number !== null,
          );
          setJerseyGroupDraft(value);
          setJerseyNumberDraft(
            existing?.number === null || existing?.number === undefined
              ? ""
              : String(existing.number),
          );
        }}
        number={jerseyNumberDraft}
        onNumberChange={(value) => setJerseyNumberDraft(sanitizeJerseyDraft(value))}
        onRandom={fillRandomJerseyDraft}
        onSave={saveJerseyNumber}
      />

      <AthleteKitAssignmentDrawer
        open={isNewKitAssignmentOpen}
        onOpenChange={setIsNewKitAssignmentOpen}
        draft={newKitAssignment}
        setDraft={setNewKitAssignment}
        kits={clothingKits}
        availableSizes={athleteAssignmentSizeOptions}
        onConfirm={addAthleteKitAssignment}
      />

      <AthletePlanConfirmationDrawer
        open={showPlanConfirmDialog}
        onOpenChange={(open) => {
          setShowPlanConfirmDialog(open);
          if (!open) setPlanConfirmationDraft(null);
        }}
        plan={planConfirmationPlan}
        draft={planConfirmationDraft}
        setDraft={setPlanConfirmationDraft}
        requiredServices={planConfirmationRequiredServices}
        optionalServices={planConfirmationOptionalServices}
        baseTotal={planConfirmationBaseTotal}
        grossAmount={planConfirmationSummary?.grossAmount || 0}
        totalDiscounts={planConfirmationSummary?.totalDiscounts || 0}
        expectedTotal={planConfirmationSummary?.expectedTotal || 0}
        prorationApplied={Boolean(planConfirmationSummary?.prorationResult?.applied)}
        proration={planConfirmationProration}
        prorationWarning={planConfirmationSummary?.prorationResult?.warning || null}
        previewWarnings={planConfirmationInstallmentPreview.warnings}
        installments={planConfirmationInstallmentPreview.installments}
        saving={isEnrollmentSaving}
        onContinue={handleContinuePlanConfirmation}
      />

      <CreatePaymentsConfirmDialog
        open={showCreatePaymentsDialog}
        onOpenChange={setShowCreatePaymentsDialog}
        planName={planConfirmationPlan?.name || null}
        installments={planConfirmationInstallmentPreview.installments}
        saving={isEnrollmentSaving}
        onConfirm={confirmEnrollmentPlanAssignment}
      />

      {/*
        Le finestre dei pagamenti vivono in un componente a parte: sono
        payment-specific, e la scheda atleta non deve crescere ogni volta che
        il dominio pagamenti cambia (WP-19).
      */}
      <AthletePaymentDialogs
        editingPayment={editingPayment}
        onCloseEdit={() => setEditingPayment(null)}
        paymentEditForm={paymentEditForm}
        setPaymentEditForm={setPaymentEditForm}
        paymentMethodOptions={paymentMethodOptions}
        clubPaymentMethodChoices={clubPaymentMethodChoices}
        onRequestPaymentUpdate={requestPaymentUpdate}
        paymentAction={paymentPinAction}
        isPaymentActionSaving={isPaymentActionSaving}
        onClosePaymentAction={() => setPaymentPinAction(null)}
        onExecutePaymentAction={() => void executePaymentAction()}
        showAddPaymentModal={showAddPaymentModal}
        onAddPaymentOpenChange={setShowAddPaymentModal}
        newPayment={newPayment}
        setNewPayment={setNewPayment}
        onSavePayment={() => void handleSavePayment()}
      />

      <AthleteOtherDocumentDrawer
        open={showAddDocumentModal}
        onOpenChange={setShowAddDocumentModal}
        draft={newDocument}
        setDraft={setNewDocument}
        onSave={handleAddDocument}
      />

      <AthleteRegistrationDialog
        open={showAddRegistrationModal}
        onOpenChange={(open) => {
          setShowAddRegistrationModal(open);
          if (!open) setRegistrationToEdit(null);
        }}
        draft={newRegistration}
        onDraftChange={setNewRegistration}
        federations={clubFederations}
        isEditing={Boolean(registrationToEdit)}
        hasExistingFile={Boolean(registrationToEdit?.fileUrl)}
        onSave={handleSaveRegistration}
      />

      <AddCertificateForm
        isOpen={showAddMedicalCertificateModal}
        certificate={certificateToEdit}
        onClose={() => {
          setShowAddMedicalCertificateModal(false);
          setCertificateToEdit(null);
        }}
        onSubmit={handleAddMedicalCertificate}
        athletes={[
          {
            id: athleteId,
            name: getAthleteFullName(),
          },
        ]}
        clubId={clubId}
        athleteId={athleteId}
        athleteName={getAthleteFullName()}
        lockAthleteSelection
      />

      <DangerConfirmDialog
        open={Boolean(certificateToDelete)}
        onOpenChange={(open) => {
          if (!open && !deletingCertificateId) setCertificateToDelete(null);
        }}
        title="Eliminare il certificato medico?"
        description="Il certificato verrà rimosso dalla scheda sanitaria dell'atleta."
        consequences={[
          `${certificateToDelete?.type || "Certificato medico"}${certificateToDelete?.expiryDate ? ` · scadenza ${formatDateShort(certificateToDelete.expiryDate)}` : ""}`,
          "Se era l'ultimo valido, la scheda torna a segnalare il certificato mancante.",
        ]}
        confirmLabel="Elimina"
        loading={Boolean(deletingCertificateId)}
        onConfirm={deleteMedicalCertificate}
      />

      <DangerConfirmDialog
        open={Boolean(medicalVisitToDelete)}
        onOpenChange={(open) => {
          if (!open && !deletingMedicalVisitId) setMedicalVisitToDelete(null);
        }}
        title="Eliminare la visita medica?"
        description="La visita medica verrà rimossa dalla scheda dell'atleta."
        consequences={[
          joinMeta(medicalVisitToDelete?.title || "Visita medica", medicalVisitToDelete?.date ? formatDateShort(medicalVisitToDelete.date) : null),
          medicalVisitToDelete?.fileUrl ? "L'allegato della visita non sarà più raggiungibile dalla scheda." : "Nessun allegato collegato.",
        ]}
        confirmLabel="Elimina"
        loading={Boolean(deletingMedicalVisitId)}
        onConfirm={() => {
          if (medicalVisitToDelete?.id) void removeMedicalVisit(medicalVisitToDelete.id);
        }}
      />

      <AthleteMedicalVisitDrawer
        open={showAddMedicalVisitModal}
        onOpenChange={setShowAddMedicalVisitModal}
        draft={newMedicalVisit}
        setDraft={setNewMedicalVisit}
        onSave={handleSaveMedicalVisit}
      />

      <AthleteAttachmentDrawer
        open={showAddIdentityDocumentModal}
        onOpenChange={setShowAddIdentityDocumentModal}
        eyebrow="Documento di identità"
        title="Aggiungi allegato documento"
        typePlaceholder="Es. Fronte carta identità"
        draft={newIdentityDocument}
        setDraft={setNewIdentityDocument}
        onSave={handleSaveIdentityDocument}
        saveLabel="Salva allegato"
      />

      {/*
        La compilazione non scrive: apre la stessa revisione della coda
        pubblica. Un solo percorso di scrittura, anche quando chi compila e
        la segreteria stessa.
      */}
      <CompileFormDialog
        athleteId={athleteId}
        athleteName={`${athlete?.firstName || ""} ${athlete?.lastName || ""}`.trim()}
        open={compileFormOpen}
        onClose={() => setCompileFormOpen(false)}
        onCompleted={() => setAthleteDataVersion((current) => current + 1)}
      />

      <AthleteAttachmentDrawer
        open={showAddEnrollmentDocumentModal}
        onOpenChange={setShowAddEnrollmentDocumentModal}
        eyebrow="Iscrizione"
        title="Aggiungi documento iscrizione"
        typePlaceholder="Es. Modulo iscrizione firmato"
        draft={newEnrollmentDocument}
        setDraft={setNewEnrollmentDocument}
        onSave={handleSaveEnrollmentDocument}
        saveLabel="Salva documento"
      />

      <AthleteGuardianDrawer
        open={showAddGuardianModal}
        onOpenChange={setShowAddGuardianModal}
        isEditing={editingGuardianIndex !== null}
        draft={newGuardian}
        setDraft={setNewGuardian}
        extractionValues={guardianExtractionValues}
        applyExtraction={applyExtractionToGuardian}
        onSave={handleAddGuardian}
      />

      <SharedDocumentRequestDrawer
        open={sharedRequestOpen}
        onOpenChange={setSharedRequestOpen}
        draft={requiredSharedDocument}
        setDraft={setRequiredSharedDocument}
        busy={sharedDocumentBusy}
        onSubmit={async () => {
          const ok = await handleRequestSharedDocument();
          if (ok) setSharedRequestOpen(false);
        }}
      />

      <SharedDocumentUploadDrawer
        open={sharedUploadOpen}
        onOpenChange={setSharedUploadOpen}
        draft={clubSharedDocumentUpload}
        setDraft={setClubSharedDocumentUpload}
        busy={sharedDocumentBusy}
        onSubmit={async () => {
          const ok = await handleUploadClubSharedDocument();
          if (ok) setSharedUploadOpen(false);
        }}
      />

      <SharedDocumentRejectDialog
        open={Boolean(sharedRejectTarget)}
        onOpenChange={(open) => {
          if (!open && !sharedDocumentBusy) setSharedRejectTarget(null);
        }}
        reason={sharedRejectReason}
        onReasonChange={setSharedRejectReason}
        busy={sharedDocumentBusy}
        onConfirm={async () => {
          if (!sharedRejectTarget) return;
          const ok = await handleSharedDocumentAction(sharedRejectTarget, "reject", sharedRejectReason);
          if (ok) setSharedRejectTarget(null);
        }}
      />

      {/*
        W6-07. Le azioni irreversibili di questa scheda passano da qui: la
        conferma e proporzionata al gesto (08 §8.9) — notevole → conferma
        semplice, distruttiva → il modale rosso con «cosa se ne va» — e mai
        `window.confirm`, che il browser puo sopprimere dopo il primo uso e
        che dentro una webview puo non comparire affatto.
      */}
      {confermaInSospeso?.type === "error" ? (
        <DangerConfirmDialog
          open
          onOpenChange={(open) => {
            if (!open) chiudiConferma(false);
          }}
          title={confermaInSospeso.title}
          description={confermaInSospeso.description}
          consequences={confermaInSospeso.consequences}
          confirmLabel={confermaInSospeso.confirmText}
          onConfirm={() => chiudiConferma(true)}
        />
      ) : (
        <ConfirmDialog
          open={Boolean(confermaInSospeso)}
          onOpenChange={(open) => {
            if (!open) chiudiConferma(false);
          }}
          title={confermaInSospeso?.title ?? ""}
          description={confermaInSospeso?.description ?? ""}
          confirmLabel={confermaInSospeso?.confirmText ?? "Conferma"}
          tone="neutral"
          onConfirm={() => chiudiConferma(true)}
        />
      )}
    </div>
  );
}
