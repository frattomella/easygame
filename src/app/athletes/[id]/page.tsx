"use client";

import React, { useState, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import Sidebar from "@/components/dashboard/Sidebar";
import Header from "@/components/dashboard/Header";
import {
  DashboardPageContainer,
  dashboardMainClassName,
} from "@/components/dashboard/dashboard-page-container";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { AvatarUpload } from "@/components/ui/avatar-upload";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Calendar,
  Camera,
  Mail,
  Phone,
  User,
  MapPin,
  Edit,
  Trash2,
  Share2,
  FileText,
  Heart,
  DollarSign,
  BarChart3,
  Upload,
  Plus,
  X,
  Users,
  IdCard,
  CalendarDays,
  Globe,
  Home,
  Save,
  CheckCircle2,
  XCircle,
  Download,
  Eye,
  Award,
  Shirt,
  Loader2,
  RefreshCw,
  Copy,
  KeyRound,
  Unlink2,
} from "lucide-react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { AddCertificateForm } from "@/components/forms/AddCertificateForm";
import {
  AssistedAddressFields,
  AssistedFiscalCodeField,
} from "@/components/forms/assisted-anagrafica";
import { useToast } from "@/components/ui/toast-notification";
import { supabase } from "@/lib/supabase";
import {
  getLatestMedicalCertificateExpiry,
  getMedicalCertificateStatus,
} from "@/lib/medical-certificates";
import { CertificateAttachmentField } from "@/components/forms/certificate-attachment-field";
import { uploadAttachmentReference } from "@/lib/api/attachments";
import {
  PARENT_TOKEN_EXPIRY_HOURS,
  createParentAccessToken,
  formatParentAccessToken,
  getGuardianAccessStatus,
  getGuardianDisplayName,
  getGuardianTokenTiming,
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
  normalizeClubFederations,
} from "@/lib/athlete-profile-fields";
import { AthleteProfileHeader } from "@/components/athletes/profile/athlete-profile-header";
import { AthleteProfileTabsBar } from "@/components/athletes/profile/athlete-profile-tabs";
import { resolveAthleteProfileTab } from "@/lib/athlete-profile-tabs";
import { CapitalizedInput } from "@/components/forms/capitalized-input";
import { DocumentExtractionField } from "@/components/forms/document-extraction-field";
import { PhoneField } from "@/components/forms/phone-field";
import {
  CLOTHING_SIZE_OPTIONS,
  DEFAULT_CLOTHING_SIZES,
  deriveClothingProfile,
} from "@/lib/clothing-sizes";
import { normalizeClubSites, type ClubSite } from "@/lib/club-sites";
import { AthleteCategoriesPanel } from "@/components/athletes/profile/athlete-categories-panel";
import {
  downloadAttachment,
  downloadClientFileUrl,
  fileToDataUrl,
  openClientFileUrl,
} from "@/lib/client-files";
import {
  normalizeKitAssignmentItems,
  normalizeKitAssignmentRecord,
  normalizeKitComponents,
  normalizeKitRecord,
} from "@/lib/clothing-kit-utils";
import {
  assignmentStatusLabels,
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
  parseScannedDocument,
  type DocumentScanResult,
} from "@/lib/document-scan";
import {
  getPrimaryAthleteCategoryMembership,
  normalizeAthleteCategoryMemberships,
} from "@/lib/athlete-category-memberships";
import { AthleteCategoryAnalyticsSection } from "@/components/athletes/AthleteCategoryAnalyticsSection";
import { EnrollmentPaymentBreakdown } from "@/components/payments/EnrollmentPaymentBreakdown";
import { AthletePaymentLedger } from "@/components/payments/AthletePaymentLedger";
import { AthleteFundingSummary } from "@/components/funding/AthleteFundingSummary";
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
  generateInstallmentPreview,
  findPaymentPlan,
  getPlanServicesForAthlete,
  normalizePaymentPlans,
} from "@/lib/payment-plan-utils";
import {
  SHARED_DOCUMENT_TYPES,
  getSharedDocumentStatusClassName,
  getSharedDocumentStatusLabel,
  getSharedDocumentTypeLabel,
} from "@/lib/shared-documents";
import { CompileFormDialog } from "@/components/forms/compile-form-dialog";
import { getClubPaymentMethodChoices } from "@/lib/payments/payment-config-utils";
import { apiRequest } from "@/lib/api/client";
import type { KitComponent } from "@/components/forms/CustomKitComponentsBuilder";

const CustomKitComponentsBuilder = dynamic(
  () =>
    import("@/components/forms/CustomKitComponentsBuilder").then(
      (module) => module.CustomKitComponentsBuilder,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="h-48 animate-pulse rounded-xl border bg-slate-100" />
    ),
  },
);

const EMPTY_ATHLETE_CATEGORY_ANALYTICS: AthleteCategoryAnalyticsResult = {
  categories: [],
  unclassifiedEvents: [],
};

export default function AthleteProfilePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { showToast } = useToast();
  const athleteId = params?.id as string;
  const clubId = searchParams?.get("clubId");
  const requestedTab = searchParams?.get("tab");
  const initialTab = resolveAthleteProfileTab(requestedTab);
  const [isLoading, setIsLoading] = useState(true);
  const [athlete, setAthlete] = useState<any>(null);
  const [clubCategoryOptions, setClubCategoryOptions] = useState<any[]>([]);
  const [clubSites, setClubSites] = useState<ClubSite[]>([]);
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
  const [clubFederations, setClubFederations] = useState<string[]>([]);
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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [paymentPlans, setPaymentPlans] = useState<any[]>([]);
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
  const [showDocumentScannerModal, setShowDocumentScannerModal] =
    useState(false);
  const [documentScanImage, setDocumentScanImage] = useState<string | null>(
    null,
  );
  const [documentScanResult, setDocumentScanResult] =
    useState<DocumentScanResult | null>(null);
  const [documentScanError, setDocumentScanError] = useState("");
  const [isDocumentScanInProgress, setIsDocumentScanInProgress] =
    useState(false);
  const [isCameraStarting, setIsCameraStarting] = useState(false);
  const [isCameraAvailable, setIsCameraAvailable] = useState(false);
  const documentScannerVideoRef = useRef<HTMLVideoElement>(null);
  const documentScannerCanvasRef = useRef<HTMLCanvasElement>(null);
  const documentScannerFileInputRef = useRef<HTMLInputElement>(null);
  const documentScannerStreamRef = useRef<MediaStream | null>(null);

  // Initialize date on client side to avoid hydration mismatch
  useEffect(() => {
    if (!newPayment.date) {
      setNewPayment((prev) => ({
        ...prev,
        date: new Date().toISOString().split("T")[0],
      }));
    }
  }, []);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setNowMs(Date.now());
    }, 60000);

    return () => window.clearInterval(intervalId);
  }, []);

  const stopDocumentScannerCamera = React.useCallback(() => {
    documentScannerStreamRef.current?.getTracks().forEach((track) => {
      track.stop();
    });
    documentScannerStreamRef.current = null;

    if (documentScannerVideoRef.current) {
      documentScannerVideoRef.current.srcObject = null;
    }

    setIsCameraAvailable(false);
  }, []);

  const startDocumentScannerCamera = React.useCallback(async () => {
    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices?.getUserMedia
    ) {
      setDocumentScanError(
        "La fotocamera non e disponibile in questo browser. Puoi comunque caricare una foto del documento.",
      );
      return;
    }

    setIsCameraStarting(true);
    setDocumentScanError("");

    try {
      stopDocumentScannerCamera();

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });

      documentScannerStreamRef.current = stream;

      if (documentScannerVideoRef.current) {
        documentScannerVideoRef.current.srcObject = stream;
        await documentScannerVideoRef.current.play().catch(() => undefined);
      }

      setIsCameraAvailable(true);
    } catch (error) {
      console.error("Error starting document scanner camera:", error);
      setDocumentScanError(
        "Non riesco ad accedere alla fotocamera. Controlla i permessi oppure carica una foto del documento.",
      );
      setIsCameraAvailable(false);
    } finally {
      setIsCameraStarting(false);
    }
  }, [stopDocumentScannerCamera]);

  useEffect(() => {
    if (showDocumentScannerModal) {
      void startDocumentScannerCamera();
      return;
    }

    stopDocumentScannerCamera();
    setDocumentScanImage(null);
    setDocumentScanResult(null);
    setDocumentScanError("");
    setIsDocumentScanInProgress(false);
  }, [
    showDocumentScannerModal,
    startDocumentScannerCamera,
    stopDocumentScannerCamera,
  ]);

  useEffect(() => () => stopDocumentScannerCamera(), [stopDocumentScannerCamera]);


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

  // Fetch athlete data from database
  useEffect(() => {
    const fetchAthleteData = async () => {
      if (!clubId || clubId === "null" || clubId.trim() === "") {
        console.error("Invalid or missing clubId parameter:", clubId);
        showToast({
          title: "Errore",
          description: "ID del club mancante. Torna alla lista atleti.",
          variant: "destructive",
        });
        setIsLoading(false);
        return;
      }

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
          matchRecords,
          athletePaymentRows,
        ] = await Promise.all([
          getAthlete(athleteId),
          getAthleteCertificates(athleteId).catch(() => []),
          clubId ? getClub(clubId).catch(() => null) : Promise.resolve(null),
          clubId ? getClubCategories(clubId).catch(() => []) : Promise.resolve([]),
          clubId ? getClubTrainings(clubId).catch(() => []) : Promise.resolve([]),
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
        });
        setClubCategoryOptions(normalizedCategoryOptions);
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
        setClubFederations(normalizeClubFederations(clubRecord));
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
            ]);
            setClubSites(normalizeClubSites(sites));
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

      const updatedAthlete = await updateClubAthlete(clubId, athleteId, {
        ...editFormData,
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
    clubCategoryOptions,
  );
  const editCategoryMemberships = normalizeAthleteCategoryMemberships(
    editFormData,
    clubCategoryOptions,
  );
  const primaryEditCategoryId =
    getPrimaryAthleteCategoryMembership(editCategoryMemberships, clubCategoryOptions)
      ?.categoryId || "";
  const primaryEditSiteId =
    getPrimaryAthleteCategoryMembership(editCategoryMemberships, clubCategoryOptions)
      ?.siteId || "";

  /**
   * La sede sta sull'appartenenza, non sull'anagrafica (ADR-0038): dice dove
   * l'atleta svolge **quella** categoria. Cambiarla non tocca la categoria e
   * non tocca le appartenenze secondarie.
   */
  const handlePrimarySiteChange = (siteId: string) => {
    setEditFormData({
      ...editFormData,
      categoryMemberships: editCategoryMemberships.map((membership) => ({
        category_id: membership.categoryId,
        category_name: membership.categoryName,
        is_primary: membership.isPrimary,
        site_id: membership.isPrimary ? siteId : membership.siteId || "",
      })),
    });
  };

  const handlePrimaryCategoryChange = (categoryId: string) => {
    const category = clubCategoryOptions.find((item) => item.id === categoryId);
    if (!category) {
      return;
    }

    const existingSecondaryMemberships = editCategoryMemberships
      .filter((membership) => !membership.isPrimary && membership.categoryId !== categoryId)
      .map((membership) => ({
        category_id: membership.categoryId,
        category_name: membership.categoryName,
        is_primary: false,
        site_id: membership.siteId || "",
      }));

    setEditFormData({
      ...editFormData,
      categoryMemberships: [
        {
          category_id: category.id,
          category_name: category.name,
          is_primary: true,
          // La sede non si perde cambiando categoria: l'atleta resta dove si
          // allena, cambia solo in che fascia gioca (ADR-0038).
          site_id: primaryEditSiteId,
        },
        ...existingSecondaryMemberships,
      ],
      categories: [
        category.name,
        ...existingSecondaryMemberships.map(
          (membership) => membership.category_name,
        ),
      ],
    });
  };

  const handleToggleSecondaryCategory = (
    categoryId: string,
    enabled: boolean,
  ) => {
    const category = clubCategoryOptions.find((item) => item.id === categoryId);
    if (!category) {
      return;
    }

    const primaryMembership =
      getPrimaryAthleteCategoryMembership(editCategoryMemberships, clubCategoryOptions) ||
      null;
    const secondaryMemberships = editCategoryMemberships
      .filter((membership) => !membership.isPrimary && membership.categoryId !== categoryId)
      .map((membership) => ({
        category_id: membership.categoryId,
        category_name: membership.categoryName,
        is_primary: false,
        site_id: membership.siteId || "",
      }));

    if (enabled) {
      secondaryMemberships.push({
        category_id: category.id,
        category_name: category.name,
        is_primary: false,
        // Una categoria secondaria nasce senza sede: dichiararla per conto
        // dell'utente vorrebbe dire indovinare dove si allena.
        site_id: "",
      });
    }

    const nextMemberships = [
      ...(primaryMembership
        ? [
            {
              category_id: primaryMembership.categoryId,
              category_name: primaryMembership.categoryName,
              is_primary: true,
              site_id: primaryMembership.siteId || "",
            },
          ]
        : []),
      ...secondaryMemberships,
    ];

    setEditFormData({
      ...editFormData,
      categoryMemberships: nextMemberships,
      categories: nextMemberships.map((membership) => membership.category_name),
    });
  };

  const handleDeleteAthlete = async () => {
    if (!clubId || !athleteId) return;

    if (confirm("Sei sicuro di voler eliminare questo atleta?")) {
      try {
        const { deleteClubAthlete } = await import("@/lib/simplified-db");
        await deleteClubAthlete(clubId, athleteId);
        showToast("success", "Atleta eliminato con successo");
        router.push(`/athletes?clubId=${clubId}`);
      } catch (error) {
        console.error("Error deleting athlete:", error);
        showToast({
          title: "Errore",
          description: "Errore nell'eliminazione dell'atleta",
          variant: "destructive",
        });
      }
    }
  };

  const handleShareCredentials = () => {
    showToast("success", "Credenziali inviate all'atleta via email");
  };

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
    const nextAthlete = {
      ...athlete,
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

    if (
      existingToken &&
      !linkedUserId &&
      !window.confirm(
        "Esiste gia un token attivo per questo genitore. Vuoi rigenerarlo?",
      )
    ) {
      return;
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

  const handleDisconnectGuardianAccount = async (guardianId: string) => {
    const guardian = guardians.find((entry) => entry.id === guardianId);
    const effectiveClubId = athlete?.club_id || clubId;

    if (!guardian || !effectiveClubId) {
      showToast("error", "Genitore non disponibile");
      return;
    }

    if (
      !window.confirm(
        "Scollegare l'account da questo genitore? Il genitore rimarra nella scheda atleta.",
      )
    ) {
      return;
    }

    setGuardianAccessBusyId(guardianId);

    try {
      const recordId =
        guardian.parentAccessTokenRecordId ||
        guardian.parent_access_token_record_id ||
        guardian.accessTokenRecordId ||
        null;
      const nowIso = new Date().toISOString();

      if (recordId) {
        const revokeResponse = await apiRequest(`/api/v1/access_tokens/${recordId}`, {
          method: "PATCH",
          headers: {
            "x-active-club-id": effectiveClubId,
          },
          body: {
            status: "revoked",
            revoked_at: nowIso,
            revoked_by_guardian_id: guardianId,
            revoked_linked_user_id:
              guardian.linkedUserId || guardian.linked_user_id || null,
          },
        });

        if (revokeResponse.error) {
          throw new Error(revokeResponse.error.message);
        }
      }

      await updateGuardianAccessState(guardianId, {
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
      });
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

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("it-IT", {
      style: "currency",
      currency: "EUR",
      minimumFractionDigits: 2,
    }).format(Number.isFinite(value) ? value : 0);

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
      }),
    [
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
    });
  }, [
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
      const doc = await buildStoredAttachment(
        {
          name: newDocument.name,
          type: newDocument.type,
          file: newDocument.file,
        },
        newDocument.type,
        "documento",
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
      return;
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
      showToast("success", "Documento richiesto al parent");
    } catch (error: any) {
      showToast("error", error?.message || "Impossibile richiedere documento");
    } finally {
      setSharedDocumentBusy(false);
    }
  };

  const handleUploadClubSharedDocument = async () => {
    if (!clubSharedDocumentUpload.file) {
      showToast("error", "Seleziona un file da condividere");
      return;
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
      showToast("success", "Documento condiviso con il parent");
    } catch (error: any) {
      showToast("error", error?.message || "Impossibile caricare documento");
    } finally {
      setSharedDocumentBusy(false);
    }
  };

  const handleSharedDocumentAction = async (
    documentId: string,
    action: "approve" | "reject" | "remind" | "delete",
  ) => {
    const rejectionReason =
      action === "reject"
        ? window.prompt("Motivo del rifiuto del documento") || ""
        : "";
    if (action === "reject" && !rejectionReason.trim()) {
      showToast("error", "Il motivo del rifiuto e obbligatorio");
      return;
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
    } catch (error: any) {
      showToast("error", error?.message || "Azione documento non riuscita");
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

  const handleAddMedicalCertificate = async (certificateData: any) => {
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

    try {
      const attachmentUrl = await uploadAttachmentReference(
        newRegistration.file,
        {
          ownerType: "athlete",
          ownerId: athleteId,
          organizationId: clubId,
          category: "tesseramento",
        },
      );
      const registration = {
        id: Date.now().toString(),
        federation: newRegistration.federation,
        number: newRegistration.number,
        status: newRegistration.status,
        issueDate: newRegistration.issueDate,
        expiryDate: newRegistration.expiryDate,
        notes: newRegistration.notes,
        fileName: newRegistration.file?.name || "",
        fileUrl: attachmentUrl,
      };
      const nextRegistrations = [...registrations, registration];

      await persistAthleteCollections({
        registrationsOverride: nextRegistrations,
        athleteOverrides: {
          registrations: nextRegistrations,
        },
      });
      setRegistrations(nextRegistrations);
      setNewRegistration(createEmptyRegistration());
      setShowAddRegistrationModal(false);
      showToast("success", "Tesseramento aggiunto");
    } catch (error) {
      console.error("Error saving registration:", error);
      showToast("error", "Impossibile salvare il tesseramento");
    }
  };

  const removeRegistration = async (registrationId: string) => {
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

  const handleDocumentScanFileChange = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    try {
      const imageUrl = await fileToDataUrl(file);
      setDocumentScanImage(imageUrl);
      setDocumentScanResult(null);
      setDocumentScanError("");
    } catch (error) {
      console.error("Error loading document scan file:", error);
      showToast("error", "Impossibile leggere l'immagine del documento");
    } finally {
      event.target.value = "";
    }
  };

  const captureDocumentSnapshot = async () => {
    const videoElement = documentScannerVideoRef.current;
    const canvasElement = documentScannerCanvasRef.current;

    if (!videoElement || !canvasElement || videoElement.readyState < 2) {
      showToast(
        "error",
        "La fotocamera non e ancora pronta. Attendi un istante e riprova.",
      );
      return;
    }

    const width = videoElement.videoWidth || 1280;
    const height = videoElement.videoHeight || 720;
    canvasElement.width = width;
    canvasElement.height = height;

    const context = canvasElement.getContext("2d");
    if (!context) {
      showToast("error", "Impossibile acquisire l'immagine del documento");
      return;
    }

    context.drawImage(videoElement, 0, 0, width, height);
    const imageUrl = canvasElement.toDataURL("image/jpeg", 0.92);
    setDocumentScanImage(imageUrl);
    setDocumentScanResult(null);
    setDocumentScanError("");
    showToast("success", "Foto del documento acquisita");
  };

  const handleRunDocumentScan = async () => {
    if (!documentScanImage) {
      showToast(
        "error",
        "Acquisisci prima una foto o carica un'immagine del documento",
      );
      return;
    }

    setIsDocumentScanInProgress(true);
    setDocumentScanError("");
    let worker: {
      recognize: (input: string) => Promise<any>;
      terminate: () => Promise<unknown>;
    } | null = null;

    try {
      const { createWorker } = await import("tesseract.js");
      const activeWorker = await createWorker("ita+eng");
      worker = activeWorker;
      const result = await activeWorker.recognize(documentScanImage);

      const rawText = result?.data?.text || "";
      if (!rawText.trim()) {
        throw new Error("Nessun testo riconosciuto");
      }

      const parsedResult = parseScannedDocument(rawText);
      setDocumentScanResult(parsedResult);

      const extractedValues = [
        parsedResult.documentType,
        parsedResult.documentNumber,
        parsedResult.name,
        parsedResult.surname,
        parsedResult.birthDate,
        parsedResult.documentExpiry,
      ].filter(Boolean);

      if (extractedValues.length === 0) {
        setDocumentScanError(
          "Ho letto il documento ma non sono riuscito a ricavare campi affidabili. Puoi comunque copiare il testo OCR qui sotto e completare a mano.",
        );
      } else {
        showToast(
          "success",
          "Documento analizzato. Controlla i dati e applicali alla scheda atleta.",
        );
      }
    } catch (error) {
      console.error("Error scanning document:", error);
      setDocumentScanResult(null);
      setDocumentScanError(
        "Impossibile analizzare il documento. Prova con una foto piu nitida o con luce migliore.",
      );
      showToast("error", "Impossibile analizzare il documento");
    } finally {
      if (worker) {
        await worker.terminate().catch(() => undefined);
      }
      setIsDocumentScanInProgress(false);
    }
  };

  const applyDocumentScanResult = async () => {
    if (!documentScanResult) {
      showToast("error", "Prima analizza il documento");
      return;
    }

    const nextFields: Record<string, any> = {};

    if (documentScanResult.documentType) {
      nextFields.documentType = documentScanResult.documentType;
    }
    if (documentScanResult.documentNumber) {
      nextFields.documentNumber = documentScanResult.documentNumber;
    }
    if (documentScanResult.documentIssue) {
      nextFields.documentIssue = documentScanResult.documentIssue;
    }
    if (documentScanResult.documentExpiry) {
      nextFields.documentExpiry = documentScanResult.documentExpiry;
    }
    if (documentScanResult.name) {
      nextFields.name = documentScanResult.name;
    }
    if (documentScanResult.surname) {
      nextFields.surname = documentScanResult.surname;
    }
    if (documentScanResult.birthDate) {
      nextFields.birthDate = documentScanResult.birthDate;
    }
    if (documentScanResult.birthPlace) {
      nextFields.birthPlace = documentScanResult.birthPlace;
    }
    if (documentScanResult.fiscalCode) {
      nextFields.fiscalCode = documentScanResult.fiscalCode;
    }
    if (documentScanResult.nationality) {
      nextFields.nationality = documentScanResult.nationality;
    }

    if (Object.keys(nextFields).length === 0) {
      showToast(
        "error",
        "Nessun dato affidabile da applicare. Usa il testo OCR come riferimento e completa i campi manualmente.",
      );
      return;
    }

    try {
      await persistAthleteCollections({
        athleteOverrides: nextFields,
      });
      setShowDocumentScannerModal(false);
      showToast("success", "Dati documento applicati alla scheda atleta");
    } catch (error) {
      console.error("Error applying document scan result:", error);
      showToast("error", "Impossibile applicare i dati del documento");
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

  const clothingStatusBadgeClass = (status: string) => {
    if (status === "delivered" || status === "received") {
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    }
    if (status === "to_order" || status === "ordered" || status === "in_production") {
      return "border-amber-200 bg-amber-50 text-amber-700";
    }
    if (status === "cancelled") {
      return "border-red-200 bg-red-50 text-red-700";
    }
    return "border-blue-200 bg-blue-50 text-blue-700";
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

  if (isLoading) {
    return (
      <div className="flex h-[100dvh] bg-gray-50 dark:bg-gray-900">
        <Sidebar />
        <div className="flex flex-1 flex-col overflow-hidden">
          <Header title="Profilo Atleta" />
          <main className={dashboardMainClassName}>
            <div className="flex justify-center items-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-700"></div>
            </div>
          </main>
        </div>
      </div>
    );
  }

  if (!athlete) {
    return (
      <div className="flex h-[100dvh] bg-gray-50 dark:bg-gray-900">
        <Sidebar />
        <div className="flex flex-1 flex-col overflow-hidden">
          <Header title="Atleta Non Trovato" />
          <main className={dashboardMainClassName}>
            <div className="flex flex-col items-center justify-center py-8">
              <h2 className="text-xl font-semibold mb-4">Atleta non trovato</h2>
              <Button onClick={() => router.push(`/athletes?clubId=${clubId}`)}>
                Torna alla lista atleti
              </Button>
            </div>
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-[100dvh] bg-gray-50 dark:bg-gray-900">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header title="Profilo Atleta" />
        <main className={dashboardMainClassName}>
          <DashboardPageContainer className="max-w-7xl">
            <AthleteProfileHeader
              athlete={athlete}
              categories={athleteCategoryMemberships}
              onAvatarChange={handleAvatarChange}
              onScanDocument={() => setShowDocumentScannerModal(true)}
              onShareCredentials={handleShareCredentials}
              onDelete={handleDeleteAthlete}
            />

            {/* Tabs */}
            <Tabs defaultValue={initialTab} className="min-w-0">
              <AthleteProfileTabsBar />

              {/* GENERALE TAB */}
              <TabsContent value="generale" className="mt-4 space-y-6">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle>Informazioni Generali</CardTitle>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleEditSection("general")}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      <div>
                        <h3 className="text-sm font-medium text-muted-foreground">
                          Nome
                        </h3>
                        <p className="mt-1">{athlete.name}</p>
                      </div>
                      <div>
                        <h3 className="text-sm font-medium text-muted-foreground">
                          Cognome
                        </h3>
                        <p className="mt-1">{athlete.surname}</p>
                      </div>
                      <div>
                        <h3 className="text-sm font-medium text-muted-foreground">
                          Codice Fiscale
                        </h3>
                        <p className="mt-1">{athlete.fiscalCode || "-"}</p>
                      </div>
                      <div>
                        <h3 className="text-sm font-medium text-muted-foreground">
                          Data di Nascita
                        </h3>
                        <div className="flex items-center gap-2 mt-1">
                          <CalendarDays className="h-4 w-4 text-muted-foreground" />
                          <p>{formatDate(athlete.birthDate) || "-"}</p>
                        </div>
                      </div>
                      <div>
                        <h3 className="text-sm font-medium text-muted-foreground">
                          Nazionalità
                        </h3>
                        <div className="flex items-center gap-2 mt-1">
                          <Globe className="h-4 w-4 text-muted-foreground" />
                          <p>{athlete.nationality}</p>
                        </div>
                      </div>
                      <div>
                        <h3 className="text-sm font-medium text-muted-foreground">
                          Comune
                        </h3>
                        <p className="mt-1">{athlete.birthPlace || "-"}</p>
                      </div>
                      <div>
                        <h3 className="text-sm font-medium text-muted-foreground">
                          Sesso
                        </h3>
                        <p className="mt-1">{athlete.gender || "-"}</p>
                      </div>
                      <div className="md:col-span-2">
                        <h3 className="text-sm font-medium text-muted-foreground">
                          Categorie di Appartenenza
                        </h3>
                        <div className="flex flex-wrap gap-2 mt-1">
                          {athleteCategoryMemberships.length > 0 ? (
                            athleteCategoryMemberships.map((membership) => (
                              <Badge
                                key={`athlete-general-category-${membership.categoryId}`}
                                variant="outline"
                                className={
                                  membership.isPrimary
                                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                    : "border-sky-200 bg-sky-50 text-sky-700"
                                }
                              >
                                {membership.categoryName}
                                {membership.isPrimary ? " • Primaria" : " • Secondaria"}
                              </Badge>
                            ))
                          ) : (
                            <p className="text-sm text-muted-foreground">-</p>
                          )}
                        </div>
                      </div>
                      <div className="md:col-span-3">
                        <h3 className="text-sm font-medium text-muted-foreground">
                          Note
                        </h3>
                        <p className="mt-1 text-sm">{athlete.notes || "-"}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Tesseramento */}
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle>Tesseramento</CardTitle>
                    <Button
                      size="sm"
                      onClick={() => {
                        setNewRegistration(createEmptyRegistration());
                        setShowAddRegistrationModal(true);
                      }}
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Aggiungi Tesseramento
                    </Button>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b">
                            <th className="text-left p-2">Federazione/Ente</th>
                            <th className="text-left p-2">Numero</th>
                            <th className="text-left p-2">Scadenza</th>
                            <th className="text-left p-2">Stato</th>
                            <th className="text-left p-2">Azioni</th>
                          </tr>
                        </thead>
                        <tbody>
                          {registrations.length > 0 ? (
                            registrations.map(
                              (reg: any, idx: number) => (
                                <tr key={idx} className="border-b">
                                  <td className="p-2">{reg.federation}</td>
                                  <td className="p-2">{reg.number}</td>
                                  <td className="p-2">
                                    {formatDate(reg.expiryDate) || "-"}
                                  </td>
                                  <td className="p-2">
                                    <Badge
                                      className={
                                        reg.status === "In corso"
                                          ? "bg-green-500"
                                          : reg.status === "Scaduto"
                                            ? "bg-red-500"
                                            : "bg-yellow-500"
                                      }
                                    >
                                      {reg.status}
                                    </Badge>
                                  </td>
                                  <td className="p-2">
                                    <div className="flex gap-1">
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => {
                                          if (
                                            !openClientFileUrl(reg.fileUrl)
                                          ) {
                                            showToast(
                                              "error",
                                              "Allegato del tesseramento non disponibile",
                                            );
                                          }
                                        }}
                                      >
                                        <Eye className="h-4 w-4" />
                                      </Button>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => {
                                          if (
                                            !downloadClientFileUrl(
                                              reg.fileUrl,
                                              `tesseramento-${reg.federation}-${reg.number}`,
                                            )
                                          ) {
                                            showToast(
                                              "error",
                                              "Allegato del tesseramento non disponibile",
                                            );
                                          }
                                        }}
                                      >
                                        <Download className="h-4 w-4" />
                                      </Button>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() =>
                                          removeRegistration(reg.id)
                                        }
                                      >
                                        <Trash2 className="h-4 w-4 text-red-500" />
                                      </Button>
                                    </div>
                                  </td>
                                </tr>
                              ),
                            )
                          ) : (
                            <tr>
                              <td
                                colSpan={5}
                                className="p-4 text-center text-muted-foreground"
                              >
                                Nessun tesseramento registrato
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* CONTATTI TAB */}
              <TabsContent value="contatti" className="mt-4 space-y-6">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle>Contatto Atleta</CardTitle>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleEditSection("contact")}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <h3 className="text-sm font-medium text-muted-foreground">
                          Telefono
                        </h3>
                        <div className="flex items-center gap-2 mt-1">
                          <Phone className="h-4 w-4 text-muted-foreground" />
                          <p>{athlete.phone || "-"}</p>
                        </div>
                      </div>
                      <div>
                        <h3 className="text-sm font-medium text-muted-foreground">
                          Email
                        </h3>
                        <div className="flex items-center gap-2 mt-1">
                          <Mail className="h-4 w-4 text-muted-foreground" />
                          <p>{athlete.email || "-"}</p>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Guardians */}
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle className="flex items-center gap-2">
                      <Users className="h-5 w-5" />
                      Contatto Genitore o Tutore Legale
                    </CardTitle>
                    <Button size="sm" onClick={addGuardian}>
                      <Plus className="h-4 w-4 mr-2" />
                      Aggiungi
                    </Button>
                  </CardHeader>
                  <CardContent>
                    {guardians.length > 0 ? (
                      <div className="space-y-4">
                        {guardians.map((guardian, idx) => (
                          <div
                            key={guardian.id}
                            className="p-4 border rounded-lg relative"
                          >
                            <div className="absolute top-2 right-2 flex gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => openEditGuardianModal(idx)}
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => removeGuardian(guardian.id)}
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                              <div>
                                <h4 className="text-sm font-medium text-muted-foreground">
                                  Nome
                                </h4>
                                <p className="mt-1">{guardian.name || "-"}</p>
                              </div>
                              <div>
                                <h4 className="text-sm font-medium text-muted-foreground">
                                  Cognome
                                </h4>
                                <p className="mt-1">
                                  {guardian.surname || "-"}
                                </p>
                              </div>
                              <div>
                                <h4 className="text-sm font-medium text-muted-foreground">
                                  Parentela
                                </h4>
                                <p className="mt-1">
                                  {guardian.relationship || "-"}
                                </p>
                              </div>
                              <div>
                                <h4 className="text-sm font-medium text-muted-foreground">
                                  Codice Fiscale
                                </h4>
                                <p className="mt-1">
                                  {guardian.fiscalCode || "-"}
                                </p>
                              </div>
                              <div>
                                <h4 className="text-sm font-medium text-muted-foreground">
                                  Data di Nascita
                                </h4>
                                <p className="mt-1">
                                  {formatDate(guardian.birthDate) || "-"}
                                </p>
                              </div>
                              <div>
                                <h4 className="text-sm font-medium text-muted-foreground">
                                  Telefono
                                </h4>
                                <p className="mt-1">{guardian.phone || "-"}</p>
                              </div>
                              <div className="md:col-span-3">
                                <h4 className="text-sm font-medium text-muted-foreground">
                                  Email
                                </h4>
                                <p className="mt-1">{guardian.email || "-"}</p>
                              </div>
                            </div>
                            {(() => {
                              const accessStatus =
                                getGuardianAccessStatus(guardian);
                              const tokenValue =
                                guardian.parentAccessTokenValue ||
                                guardian.parent_access_token_value ||
                                guardian.accessTokenValue ||
                                "";
                              const linkedEmail =
                                guardian.linkedUserEmail ||
                                guardian.linked_user_email ||
                                "";
                              const expiresAt =
                                guardian.parentAccessTokenExpiresAt ||
                                guardian.parent_access_token_expires_at ||
                                guardian.accessTokenExpiresAt ||
                                null;
                              const timing = getGuardianTokenTiming(
                                guardian,
                                nowMs,
                              );
                              const isBusy =
                                guardianAccessBusyId === guardian.id;
                              const isLinked = Boolean(
                                guardian.linkedUserId ||
                                  guardian.linked_user_id,
                              );

                              return (
                                <div className="mt-4 space-y-3 border-t border-slate-200 pt-4">
                                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                                    <div>
                                      <p className="text-sm font-semibold text-slate-900">
                                        Accesso genitore
                                      </p>
                                      <div className="mt-2 flex flex-wrap items-center gap-2">
                                        <Badge className={accessStatus.className}>
                                          {accessStatus.label}
                                        </Badge>
                                        {isLinked && linkedEmail ? (
                                          <span className="text-sm text-slate-600">
                                            {linkedEmail}
                                          </span>
                                        ) : null}
                                      </div>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                      {isLinked ? (
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          className="border-red-200 text-red-700 hover:bg-red-50"
                                          disabled={isBusy}
                                          onClick={() => {
                                            void handleDisconnectGuardianAccount(
                                              guardian.id,
                                            );
                                          }}
                                        >
                                          {isBusy ? (
                                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                          ) : (
                                            <Unlink2 className="mr-2 h-4 w-4" />
                                          )}
                                          Scollega account
                                        </Button>
                                      ) : (
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          disabled={isBusy}
                                          onClick={() => {
                                            void handleGenerateGuardianToken(
                                              guardian.id,
                                            );
                                          }}
                                        >
                                          {isBusy ? (
                                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                          ) : tokenValue ? (
                                            <RefreshCw className="mr-2 h-4 w-4" />
                                          ) : (
                                            <KeyRound className="mr-2 h-4 w-4" />
                                          )}
                                          {tokenValue
                                            ? "Rigenera token"
                                            : "Genera token"}
                                        </Button>
                                      )}
                                    </div>
                                  </div>

                                  {tokenValue ? (
                                    <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-3">
                                      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                                        <div>
                                          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-700">
                                            Token genitore
                                          </p>
                                          <p className="mt-1 font-mono text-lg font-semibold text-slate-900">
                                            {formatParentAccessToken(tokenValue)}
                                          </p>
                                        </div>
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          onClick={() => {
                                            void copyGuardianAccessToken(
                                              tokenValue,
                                            );
                                          }}
                                        >
                                          <Copy className="mr-2 h-4 w-4" />
                                          Copia token
                                        </Button>
                                      </div>
                                      <div className="mt-3 space-y-2">
                                        <div className="flex items-center justify-between text-xs text-slate-600">
                                          <span>{timing.label}</span>
                                          <span>
                                            Scade{" "}
                                            {expiresAt
                                              ? new Date(
                                                  expiresAt,
                                                ).toLocaleString("it-IT")
                                              : "-"}
                                          </span>
                                        </div>
                                        <div className="h-2 overflow-hidden rounded-full bg-white">
                                          <div
                                            className={`h-full rounded-full ${
                                              timing.isExpired
                                                ? "bg-amber-500"
                                                : "bg-blue-600"
                                            }`}
                                            style={{
                                              width: `${timing.progress}%`,
                                            }}
                                          />
                                        </div>
                                      </div>
                                    </div>
                                  ) : null}
                                </div>
                              );
                            })()}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-center text-muted-foreground py-4">
                        Nessun genitore o tutore registrato
                      </p>
                    )}
                  </CardContent>
                </Card>

                {/* Address */}
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle className="flex items-center gap-2">
                      <Home className="h-5 w-5" />
                      Indirizzo
                    </CardTitle>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleEditSection("address")}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      <div>
                        <h3 className="text-sm font-medium text-muted-foreground">
                          Indirizzo
                        </h3>
                        <p className="mt-1">{athlete.address || "-"}</p>
                      </div>
                      <div>
                        <h3 className="text-sm font-medium text-muted-foreground">
                          N. Civico
                        </h3>
                        <p className="mt-1">{athlete.streetNumber || "-"}</p>
                      </div>
                      <div>
                        <h3 className="text-sm font-medium text-muted-foreground">
                          Comune
                        </h3>
                        <p className="mt-1">{athlete.city || "-"}</p>
                      </div>
                      <div>
                        <h3 className="text-sm font-medium text-muted-foreground">
                          CAP
                        </h3>
                        <p className="mt-1">{athlete.postalCode || "-"}</p>
                      </div>
                      <div>
                        <h3 className="text-sm font-medium text-muted-foreground">
                          Paese
                        </h3>
                        <p className="mt-1">{athlete.country}</p>
                      </div>
                      <div>
                        <h3 className="text-sm font-medium text-muted-foreground">
                          Regione
                        </h3>
                        <p className="mt-1">{athlete.region || "-"}</p>
                      </div>
                      <div>
                        <h3 className="text-sm font-medium text-muted-foreground">
                          Provincia
                        </h3>
                        <p className="mt-1">{athlete.province || "-"}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* DATI SANITARI TAB */}
              <TabsContent
                id="sanitari"
                value="sanitari"
                className="mt-4 space-y-6"
              >
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle>Certificati Medici</CardTitle>
                    <Button
                      size="sm"
                      onClick={() => setShowAddMedicalCertificateModal(true)}
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Aggiungi certificato medico
                    </Button>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b">
                            <th className="text-left p-2">Tipologia</th>
                            <th className="text-left p-2">Emissione</th>
                            <th className="text-left p-2">Scadenza</th>
                            <th className="text-left p-2">Stato</th>
                            <th className="text-left p-2">Documento</th>
                          </tr>
                        </thead>
                        <tbody>
                          {medicalCertificates.length > 0 ? (
                            medicalCertificates.map((certificate) => {
                              const isVirtualMissing =
                                certificate.status === "missing" ||
                                String(certificate.id || "").startsWith(
                                  "missing-",
                                );

                              return (
                                <tr key={certificate.id} className="border-b">
                                  <td className="p-2">{certificate.type}</td>
                                  <td className="p-2">
                                    {certificate.issueDate
                                      ? formatDate(certificate.issueDate)
                                      : "-"}
                                  </td>
                                  <td className="p-2">
                                    {certificate.expiryDate
                                      ? formatDate(certificate.expiryDate)
                                      : "-"}
                                  </td>
                                  <td className="p-2">
                                    <Badge
                                      className={
                                        certificate.status === "valid"
                                          ? "bg-green-500 text-white"
                                          : certificate.status === "expiring"
                                            ? "bg-amber-500 text-white"
                                            : "bg-red-500 text-white"
                                      }
                                    >
                                      {certificate.status === "valid"
                                        ? "Valido"
                                        : certificate.status === "expiring"
                                          ? "In scadenza"
                                          : "Scaduto"}
                                    </Badge>
                                  </td>
                                  <td className="p-2">
                                    <div className="flex flex-wrap gap-2">
                                      {certificate.fileUrl ? (
                                        <>
                                          <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => {
                                              if (
                                                !openClientFileUrl(
                                                  certificate.fileUrl,
                                                )
                                              ) {
                                                showToast(
                                                  "error",
                                                  "File del certificato non disponibile",
                                                );
                                              }
                                            }}
                                          >
                                            <Eye className="h-4 w-4 mr-2" />
                                            Visualizza
                                          </Button>
                                          <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => {
                                              if (
                                                !downloadAttachment(
                                                  certificate.fileUrl,
                                                  {
                                                    documentType: `Certificato ${certificate.type || "medico"}`,
                                                    firstName: athlete?.name,
                                                    lastName: athlete?.surname,
                                                    fullName: athlete?.fullName,
                                                    date:
                                                      certificate.expiryDate ||
                                                      certificate.issueDate,
                                                  },
                                                )
                                              ) {
                                                showToast(
                                                  "error",
                                                  "File del certificato non disponibile",
                                                );
                                              }
                                            }}
                                          >
                                            <Download className="h-4 w-4 mr-2" />
                                            Scarica
                                          </Button>
                                        </>
                                      ) : (
                                        <span className="text-muted-foreground">
                                          -
                                        </span>
                                      )}
                                      {!isVirtualMissing ? (
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          className="text-red-600 hover:text-red-700"
                                          disabled={
                                            deletingCertificateId ===
                                            certificate.id
                                          }
                                          onClick={() =>
                                            setCertificateToDelete(certificate)
                                          }
                                        >
                                          {deletingCertificateId ===
                                          certificate.id ? (
                                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                          ) : (
                                            <Trash2 className="h-4 w-4 mr-2" />
                                          )}
                                          Elimina
                                        </Button>
                                      ) : null}
                                    </div>
                                  </td>
                                </tr>
                              );
                            })
                          ) : (
                            <tr>
                              <td
                                colSpan={5}
                                className="p-4 text-center text-muted-foreground"
                              >
                                Nessun certificato medico registrato
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle>Visite Mediche</CardTitle>
                    <Button size="sm" onClick={addMedicalVisit}>
                      <Plus className="h-4 w-4 mr-2" />
                      Aggiungi Visita
                    </Button>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b">
                            <th className="text-left p-2">Titolo</th>
                            <th className="text-left p-2">Descrizione</th>
                            <th className="text-left p-2">Tipologia</th>
                            <th className="text-left p-2">Esito</th>
                            <th className="text-left p-2">Pagamento</th>
                            <th className="text-left p-2">Luogo</th>
                            <th className="text-left p-2">Data</th>
                            <th className="text-left p-2">Azioni</th>
                          </tr>
                        </thead>
                        <tbody>
                          {medicalVisits.length > 0 ? (
                            medicalVisits.map((visit) => (
                              <tr key={visit.id} className="border-b">
                                <td className="p-2">{visit.title}</td>
                                <td className="p-2">{visit.description}</td>
                                <td className="p-2">{visit.type}</td>
                                <td className="p-2">{visit.outcome || "-"}</td>
                                <td className="p-2">{visit.paidBy}</td>
                                <td className="p-2">{visit.location}</td>
                                <td className="p-2">
                                  {formatDate(visit.date)}
                                </td>
                                <td className="p-2">
                                  <div className="flex gap-1">
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => {
                                        if (
                                          visit.fileUrl &&
                                          !openClientFileUrl(visit.fileUrl)
                                        ) {
                                          showToast(
                                            "error",
                                            "Allegato della visita non disponibile",
                                          );
                                        }
                                      }}
                                    >
                                      <Eye className="h-4 w-4" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => {
                                        if (
                                          visit.fileUrl &&
                                          !downloadClientFileUrl(
                                            visit.fileUrl,
                                            `visita-medica-${visit.title}`,
                                          )
                                        ) {
                                          showToast(
                                            "error",
                                            "Allegato della visita non disponibile",
                                          );
                                        }
                                      }}
                                    >
                                      <Download className="h-4 w-4" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      disabled={
                                        deletingMedicalVisitId === visit.id
                                      }
                                      onClick={() => setMedicalVisitToDelete(visit)}
                                    >
                                      {deletingMedicalVisitId === visit.id ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                      ) : (
                                        <Trash2 className="h-4 w-4" />
                                      )}
                                    </Button>
                                  </div>
                                </td>
                              </tr>
                            ))
                          ) : (
                            <tr>
                              <td
                                colSpan={8}
                                className="p-4 text-center text-muted-foreground"
                              >
                                Nessuna visita medica registrata
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>

                {/* Certificates */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Award className="h-5 w-5" />
                      Attestati
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-6">
                      {/* BLSD */}
                      <div className="border rounded-lg p-4">
                        <div className="flex items-center justify-between">
                          <Label
                            htmlFor="blsd"
                            className="flex items-center gap-2 text-base font-medium"
                          >
                            <Award className="h-4 w-4 text-blue-500" />
                            BLSD
                          </Label>
                          <Switch
                            id="blsd"
                            checked={athlete.blsd}
                            onCheckedChange={(checked) =>
                              setAthlete({ ...athlete, blsd: checked })
                            }
                          />
                        </div>
                        {athlete.blsd && (
                          <div className="mt-4 border-t pt-4">
                            <CertificateAttachmentField
                              documentType="BLSD"
                              owner={{ type: "athlete", id: athleteId, organizationId: clubId }}
                              value={certificateFiles.blsd}
                              onChange={(next) => saveCertificateFile("blsd", next)}
                              person={{
                                firstName: athlete?.name,
                                lastName: athlete?.surname,
                                fullName: athlete?.fullName,
                              }}
                            />
                          </div>
                        )}
                      </div>

                      {/* Primo Soccorso */}
                      <div className="border rounded-lg p-4">
                        <div className="flex items-center justify-between">
                          <Label
                            htmlFor="firstAid"
                            className="flex items-center gap-2 text-base font-medium"
                          >
                            <Award className="h-4 w-4 text-red-500" />
                            Primo Soccorso
                          </Label>
                          <Switch
                            id="firstAid"
                            checked={athlete.firstAid}
                            onCheckedChange={(checked) =>
                              setAthlete({ ...athlete, firstAid: checked })
                            }
                          />
                        </div>
                        {athlete.firstAid && (
                          <div className="mt-4 border-t pt-4">
                            <CertificateAttachmentField
                              documentType="Primo soccorso"
                              owner={{ type: "athlete", id: athleteId, organizationId: clubId }}
                              value={certificateFiles.firstAid}
                              onChange={(next) => saveCertificateFile("firstAid", next)}
                              person={{
                                firstName: athlete?.name,
                                lastName: athlete?.surname,
                                fullName: athlete?.fullName,
                              }}
                            />
                          </div>
                        )}
                      </div>

                      {/* Antincendio */}
                      <div className="border rounded-lg p-4">
                        <div className="flex items-center justify-between">
                          <Label
                            htmlFor="fireSafety"
                            className="flex items-center gap-2 text-base font-medium"
                          >
                            <Award className="h-4 w-4 text-orange-500" />
                            Antincendio
                          </Label>
                          <Switch
                            id="fireSafety"
                            checked={athlete.fireSafety}
                            onCheckedChange={(checked) =>
                              setAthlete({ ...athlete, fireSafety: checked })
                            }
                          />
                        </div>
                        {athlete.fireSafety && (
                          <div className="mt-4 border-t pt-4">
                            <CertificateAttachmentField
                              documentType="Antincendio"
                              owner={{ type: "athlete", id: athleteId, organizationId: clubId }}
                              value={certificateFiles.fireSafety}
                              onChange={(next) => saveCertificateFile("fireSafety", next)}
                              person={{
                                firstName: athlete?.name,
                                lastName: athlete?.surname,
                                fullName: athlete?.fullName,
                              }}
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Medical Info */}
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle>Anagrafica Sanitaria</CardTitle>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleEditSection("medical")}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <h3 className="text-sm font-medium text-muted-foreground">
                          Gruppo Sanguigno
                        </h3>
                        <p className="mt-1">{athlete.bloodType || "-"}</p>
                      </div>
                      <div>
                        <h3 className="text-sm font-medium text-muted-foreground">
                          Allergie
                        </h3>
                        <p className="mt-1">{athlete.allergies || "-"}</p>
                      </div>
                      <div>
                        <h3 className="text-sm font-medium text-muted-foreground">
                          Malattie Croniche
                        </h3>
                        <p className="mt-1">{athlete.chronicDiseases || "-"}</p>
                      </div>
                      <div>
                        <h3 className="text-sm font-medium text-muted-foreground">
                          Farmaci
                        </h3>
                        <p className="mt-1">{athlete.medications || "-"}</p>
                      </div>
                      <div>
                        <h3 className="text-sm font-medium text-muted-foreground">
                          Contatto di Emergenza
                        </h3>
                        <p className="mt-1">
                          {athlete.emergencyContact || "-"}
                        </p>
                      </div>
                      <div>
                        <h3 className="text-sm font-medium text-muted-foreground">
                          Telefono di Emergenza
                        </h3>
                        <p className="mt-1">{athlete.emergencyPhone || "-"}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* ISCRIZIONE E PAGAMENTI TAB */}
              <TabsContent value="pagamenti" className="mt-4 space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Status Iscrizione</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {/* Iscrizione Attiva - Styled Container */}
                      <div
                        className={`p-4 rounded-lg border-2 ${athlete.enrollmentStatus ? "bg-green-50 dark:bg-green-900/20 border-green-500" : "bg-red-50 dark:bg-red-900/20 border-red-500"}`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            {athlete.enrollmentStatus ? (
                              <CheckCircle2 className="h-6 w-6 text-green-600 dark:text-green-400" />
                            ) : (
                              <XCircle className="h-6 w-6 text-red-600 dark:text-red-400" />
                            )}
                            <div>
                              <Label
                                htmlFor="enrollment"
                                className="text-base font-semibold"
                              >
                                Iscrizione Attiva
                              </Label>
                              <p
                                className={`text-sm ${athlete.enrollmentStatus ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}
                              >
                                {athlete.enrollmentStatus
                                  ? "L'atleta è attualmente iscritto"
                                  : "L'atleta non è iscritto"}
                              </p>
                            </div>
                          </div>
                          <Switch
                            id="enrollment"
                            checked={athlete.enrollmentStatus}
                            disabled={isEnrollmentSaving}
                            onCheckedChange={handleEnrollmentToggle}
                          />
                        </div>
                        <div className="mt-4 max-w-xs">
                          <Label htmlFor="enrollment-date">
                            Data iscrizione
                          </Label>
                          <Input
                            id="enrollment-date"
                            type="date"
                            value={athlete.enrollmentDate || ""}
                            disabled={isEnrollmentSaving}
                            onChange={(event) =>
                              setAthlete({
                                ...athlete,
                                enrollmentDate: event.target.value,
                              })
                            }
                            onBlur={handleEnrollmentDateBlur}
                            className="mt-2 bg-white dark:bg-slate-950"
                          />
                        </div>
                      </div>
                      <div>
                        <Label>Note Iscrizione</Label>
                        <Textarea
                          value={athlete.enrollmentNotes}
                          onChange={(e) =>
                            setAthlete({
                              ...athlete,
                              enrollmentNotes: e.target.value,
                            })
                          }
                          rows={3}
                          className="mt-2"
                        />
                      </div>
                      <div>
                        <Label>Piano di Pagamento Selezionato</Label>
                        <Select
                          value={selectedPlanValue}
                          onValueChange={(value) => {
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
                        >
                          <SelectTrigger className="mt-2">
                            <SelectValue placeholder="Seleziona un piano di pagamento" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">Nessun piano</SelectItem>
                            {normalizedPaymentPlans
                              .filter((plan) => plan.active)
                              .map((plan) => (
                                <SelectItem
                                  key={plan.id}
                                  value={plan.id}
                                >
                                  {plan.name} -{" "}
                                  {formatCurrency(plan.totalAmount)}
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                        {selectedAthletePlan ? (
                          <div className="mt-3 space-y-3 rounded-lg border bg-slate-50 p-3 text-sm dark:bg-slate-900/40">
                            <div>
                              <p className="font-medium">Servizi inclusi</p>
                              <p className="text-xs text-muted-foreground">
                                Gli obbligatori sono sempre inclusi. Gli
                                opzionali valgono solo per questo atleta.
                              </p>
                            </div>

                            <div className="grid gap-3 rounded-md border bg-white p-3 md:grid-cols-2">
                              <div>
                                <Label>Data inizio abbonamento</Label>
                                <Input
                                  type="date"
                                  value={
                                    athlete.subscriptionStartDate ||
                                    athlete.enrollmentStartDate ||
                                    ""
                                  }
                                  disabled
                                />
                              </div>
                              <div>
                                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                  Pro-rata
                                </p>
                                {expectedIncomeSummary.proration?.enabled ? (
                                  <div className="mt-2 space-y-1 text-sm">
                                    <p>
                                      Metodo:{" "}
                                      {expectedIncomeSummary.proration.method ===
                                      "months"
                                        ? "per mesi"
                                        : "per giorni"}
                                    </p>
                                    <p>
                                      Totale ricalcolato:{" "}
                                      <span className="font-semibold">
                                        {formatCurrency(
                                          expectedIncomeSummary.grossAmount,
                                        )}
                                      </span>
                                    </p>
                                  </div>
                                ) : (
                                  <p className="mt-2 text-sm text-muted-foreground">
                                    Non attivo per questo piano.
                                  </p>
                                )}
                              </div>
                              {expectedIncomeSummary.proration
                                ?.allowManualOverride ? (
                                <div className="md:col-span-2">
                                  <Label>Importo manuale opzionale</Label>
                                  <Input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={athlete.manualEnrollmentAmount || ""}
                                    disabled
                                    placeholder="Lascia vuoto per calcolo automatico"
                                  />
                                </div>
                              ) : null}
                              {expectedIncomeSummary.prorationResult?.warning ? (
                                <p className="md:col-span-2 text-sm text-amber-700">
                                  {
                                    expectedIncomeSummary.prorationResult
                                      .warning
                                  }
                                </p>
                              ) : null}
                            </div>

                            <div className="space-y-2">
                              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                Obbligatori
                              </p>
                              {requiredPlanServices.length > 0 ? (
                                requiredPlanServices.map((service) => (
                                  <div
                                    key={service.id}
                                    className="flex justify-between gap-3 rounded-md bg-white px-3 py-2"
                                  >
                                    <span className="text-slate-700">
                                      {service.name}
                                    </span>
                                    <span className="font-medium">
                                      {formatCurrency(service.price)}
                                    </span>
                                  </div>
                                ))
                              ) : (
                                <p className="text-xs text-muted-foreground">
                                  Nessun servizio obbligatorio.
                                </p>
                              )}
                            </div>

                            {optionalPlanServices.length > 0 ? (
                              <div className="space-y-2">
                                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                  Opzionali
                                </p>
                                {optionalPlanServices.map((service) => (
                                  <label
                                    key={service.id}
                                    className="flex items-center justify-between gap-3 rounded-md bg-white px-3 py-2"
                                  >
                                    <span className="flex min-w-0 items-center gap-2">
                                      <Checkbox
                                        checked={selectedOptionalServiceIdSet.has(
                                          service.id,
                                        )}
                                        disabled
                                      />
                                      <span className="min-w-0">
                                        <span className="block truncate font-medium text-slate-800">
                                          {service.name}
                                        </span>
                                        {service.description ? (
                                          <span className="block truncate text-xs text-muted-foreground">
                                            {service.description}
                                          </span>
                                        ) : null}
                                      </span>
                                    </span>
                                    <span className="shrink-0 font-medium">
                                      {formatCurrency(service.price)}
                                    </span>
                                  </label>
                                ))}
                              </div>
                            ) : null}

                            <div className="grid gap-2 rounded-md border bg-white p-3 sm:grid-cols-3">
                              <div>
                                <p className="text-xs text-muted-foreground">
                                  Obbligatori
                                </p>
                                <p className="font-semibold">
                                  {formatCurrency(
                                    expectedIncomeSummary.requiredServicesTotal,
                                  )}
                                </p>
                              </div>
                              <div>
                                <p className="text-xs text-muted-foreground">
                                  Opzionali selezionati
                                </p>
                                <p className="font-semibold">
                                  {formatCurrency(
                                    expectedIncomeSummary.selectedOptionalServicesTotal,
                                  )}
                                </p>
                              </div>
                              <div>
                                <p className="text-xs text-muted-foreground">
                                  Totale finale
                                </p>
                                <p className="font-semibold text-blue-700">
                                  {formatCurrency(
                                    expectedIncomeSummary.expectedTotal,
                                  )}
                                </p>
                              </div>
                            </div>
                          </div>
                        ) : null}
                      </div>
                      <div>
                        <Label>Sconto Applicato</Label>
                        <Select
                          value={athlete.discount || "none"}
                          onValueChange={(value) =>
                            setAthlete({
                              ...athlete,
                              discount: value === "none" ? "" : value,
                            })
                          }
                        >
                          <SelectTrigger className="mt-2">
                            <SelectValue placeholder="Seleziona uno sconto" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">Nessuno sconto</SelectItem>
                            {discounts
                              .filter(
                                (discount: any) => discount.active !== false,
                              )
                              .map((discount: any) => (
                                <SelectItem
                                  key={discount.id}
                                  value={
                                    discount.title ||
                                    discount.name ||
                                    discount.id
                                  }
                                >
                                  {discount.title || discount.name}{" "}
                                  {discount.type === "percentage" &&
                                  discount.value
                                    ? `- ${discount.value}%`
                                    : ""}{" "}
                                  {discount.type === "fixed" && discount.value
                                    ? `- €${discount.value}`
                                    : ""}
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed border-slate-200 bg-slate-50/70 p-3">
                        <p className="text-sm text-slate-600">
                          Salva note, data iscrizione e sconto. Per assegnare o modificare il piano con rate usa la conferma dedicata.
                        </p>
                        {selectedAthletePlan ? (
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() =>
                              openPlanConfirmationDialog(selectedAthletePlan.id)
                            }
                          >
                            <CalendarDays className="mr-2 h-4 w-4" />
                            Modifica piano e rate
                          </Button>
                        ) : null}
                        <Button
                          type="button"
                          onClick={async () => {
                            try {
                              setIsEnrollmentSaving(true);
                              await saveEnrollmentProfile(
                                {},
                                "Dati iscrizione salvati",
                              );
                            } catch (error) {
                              console.error(
                                "Error saving enrollment profile:",
                                error,
                              );
                              showToast(
                                "error",
                                "Impossibile salvare i dati di iscrizione",
                              );
                            } finally {
                              setIsEnrollmentSaving(false);
                            }
                          }}
                          disabled={isEnrollmentSaving}
                        >
                          {isEnrollmentSaving ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              Salvataggio...
                            </>
                          ) : (
                            <>
                              <Save className="mr-2 h-4 w-4" />
                              Salva dati iscrizione
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <CardTitle>Documenti Iscrizione</CardTitle>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setCompileFormOpen(true)}
                      >
                        <FileText className="h-4 w-4 mr-2" />
                        Compila modulo
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => {
                          setNewEnrollmentDocument(createEmptyAttachment());
                          setShowAddEnrollmentDocumentModal(true);
                        }}
                      >
                        <Plus className="h-4 w-4 mr-2" />
                        Aggiungi Documento
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b">
                            <th className="text-left p-2">Nome</th>
                            <th className="text-left p-2">Tipo</th>
                            <th className="text-left p-2">Data Caricamento</th>
                            <th className="text-left p-2">Azioni</th>
                          </tr>
                        </thead>
                        <tbody>
                          {enrollmentDocuments.length > 0 ? (
                            enrollmentDocuments.map((document) => (
                              <tr key={document.id} className="border-b">
                                <td className="p-2">{document.name}</td>
                                <td className="p-2">
                                  {document.type || "Documento Iscrizione"}
                                </td>
                                <td className="p-2">
                                  {formatDate(document.uploadDate)}
                                </td>
                                <td className="p-2">
                                  <div className="flex gap-1">
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => {
                                        if (
                                          !openClientFileUrl(document.fileUrl)
                                        ) {
                                          showToast(
                                            "error",
                                            "File documento iscrizione non disponibile",
                                          );
                                        }
                                      }}
                                    >
                                      <Eye className="h-4 w-4" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => {
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
                                    >
                                      <Download className="h-4 w-4" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() =>
                                        removeStoredDocument(
                                          "enrollment",
                                          document.id,
                                        )
                                      }
                                    >
                                      <Trash2 className="h-4 w-4 text-red-500" />
                                    </Button>
                                  </div>
                                </td>
                              </tr>
                            ))
                          ) : (
                            <tr>
                              <td
                                colSpan={4}
                                className="p-4 text-center text-muted-foreground"
                              >
                                Nessun documento di iscrizione caricato
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Riepilogo Incasso</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <EnrollmentPaymentBreakdown
                      summary={expectedIncomeSummary}
                      payments={mergedPaymentRecords}
                      mode="club"
                      showPaymentHistory={false}
                    />
                  </CardContent>
                </Card>

                {/*
                  Le rate e i loro incassi. Lo stesso componente e montato
                  nell'area Movimenti: registrare un pagamento deve essere lo
                  stesso gesto da qualunque parte lo si faccia (ADR-0036).
                */}
                <Card>
                  <CardHeader>
                    <CardTitle>Rate e incassi</CardTitle>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Lo stato di una rata si ricava dagli incassi registrati:
                      non si imposta a mano.
                    </p>
                  </CardHeader>
                  <CardContent>
                    <AthletePaymentLedger
                      athleteId={athleteId}
                      athleteName={
                        `${athlete?.firstName || ""} ${athlete?.lastName || ""}`.trim() ||
                        null
                      }
                      charges={athletePaymentRecords}
                      methodChoices={clubPaymentMethodChoices}
                      onLedgerChanged={handleLedgerChanged}
                    />
                  </CardContent>
                </Card>

                {/*
                  I contributi stanno in un riquadro **separato** dagli
                  incassi, e non nella loro somma: uno e denaro della
                  famiglia, l'altro e un credito verso un ente. Il momento in
                  cui si sommano e il momento in cui smettono di essere
                  leggibili (ADR-0037).
                */}
                <Card>
                  <CardHeader>
                    <CardTitle>Voucher e contributi</CardTitle>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Un voucher assegnato non e denaro incassato: matura con la
                      frequenza, si rendiconta, e solo alla fine l&apos;ente lo
                      liquida.
                    </p>
                  </CardHeader>
                  <CardContent>
                    <AthleteFundingSummary
                      athleteId={athleteId}
                      athleteName={
                        `${athlete?.firstName || ""} ${athlete?.lastName || ""}`.trim()
                      }
                    />
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between">
                    <div>
                      <CardTitle>Storico Pagamenti</CardTitle>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Totale registrato: {formatCurrency(expectedIncomeSummary.recordedTotal)} ·
                        Pagato: {formatCurrency(expectedIncomeSummary.recordedPaid)} · Residuo:{" "}
                        {formatCurrency(expectedIncomeSummary.residual)}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowAddPaymentModal(true)}
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Aggiungi Pagamento
                    </Button>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b">
                            <th className="text-left p-2">Data</th>
                            <th className="text-left p-2">Descrizione</th>
                            <th className="text-left p-2">Tipo</th>
                            <th className="text-left p-2">Importo</th>
                            <th className="text-left p-2">Stato</th>
                            <th className="text-left p-2">Azioni</th>
                          </tr>
                        </thead>
                        <tbody>
                          {mergedPaymentRecords.length > 0 ? (
                            mergedPaymentRecords.map((payment) => {
                              const isCancelled =
                                payment.statusKey === "cancelled" ||
                                payment.data?.excludedFromTotals === true;
                              const isPaid = payment.statusKey === "paid";
                              const canManage =
                                payment.source === "athlete_payment" &&
                                !isCancelled;

                              return (
                                <tr key={payment.id} className="border-b">
                                  <td className="p-2">
                                    {formatDate(payment.date)}
                                  </td>
                                  <td className="p-2">{payment.description}</td>
                                  <td className="p-2">{payment.type}</td>
                                  <td className="p-2">
                                    {formatCurrency(Number(payment.amount || 0))}
                                  </td>
                                  <td className="p-2">
                                    <Badge
                                      className={
                                        isCancelled
                                          ? "bg-slate-500"
                                          : isPaid
                                            ? "bg-green-500"
                                            : "bg-yellow-500"
                                      }
                                    >
                                      {isCancelled
                                        ? "Annullato"
                                        : isPaid
                                          ? "Pagato"
                                          : payment.status}
                                    </Badge>
                                  </td>
                                  <td className="p-2">
                                    {canManage ? (
                                      <div className="flex flex-wrap gap-2">
                                        {!isPaid ? (
                                          <>
                                            <Button
                                              type="button"
                                              variant="outline"
                                              size="sm"
                                              onClick={() =>
                                                openPaymentEditDialog(payment)
                                              }
                                            >
                                              <Edit className="mr-1 h-3.5 w-3.5" />
                                              Modifica
                                            </Button>
                                            <Button
                                              type="button"
                                              variant="outline"
                                              size="sm"
                                              className="border-red-200 text-red-700 hover:bg-red-50"
                                              onClick={() =>
                                                requestPaymentDelete(payment)
                                              }
                                            >
                                              <Trash2 className="mr-1 h-3.5 w-3.5" />
                                              Elimina
                                            </Button>
                                          </>
                                        ) : (
                                          <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            className="border-red-200 text-red-700 hover:bg-red-50"
                                            onClick={() =>
                                              requestPaymentCancel(payment)
                                            }
                                          >
                                            <XCircle className="mr-1 h-3.5 w-3.5" />
                                            Annulla
                                          </Button>
                                        )}
                                      </div>
                                    ) : (
                                      <span className="text-sm text-muted-foreground">
                                        {isCancelled ? "Escluso" : "Legacy"}
                                      </span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })
                          ) : (
                            <tr>
                              <td
                                colSpan={6}
                                className="p-4 text-center text-muted-foreground"
                              >
                                Nessun pagamento registrato
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* ABBIGLIAMENTO TAB */}
              <TabsContent value="abbigliamento" className="mt-4 space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Taglie</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                      {/* Container taglie */}
                      <div className="md:col-span-3">
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                          <div>
                            <Label>Profilo Taglie</Label>
                            <Select
                              value={activeClothingProfile}
                              onValueChange={(value) =>
                                setClothingSizes({
                                  ...clothingSizes,
                                  profile: value,
                                  shirtSize: "",
                                  pantsSize: "",
                                  shoeSize: "",
                                })
                              }
                            >
                              <SelectTrigger className="mt-2">
                                <SelectValue placeholder="Seleziona profilo" />
                              </SelectTrigger>
                              <SelectContent>
                                {[
                                  "BAMBINO",
                                  "BAMBINA",
                                  "UOMO",
                                  "DONNA",
                                ].map((profile) => (
                                  <SelectItem key={profile} value={profile}>
                                    {profile}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <Label>Taglia Maglietta</Label>
                            <Select
                              value={clothingSizes.shirtSize || ""}
                              onValueChange={(v) =>
                                setClothingSizes({
                                  ...clothingSizes,
                                  shirtSize: v,
                                })
                              }
                            >
                              <SelectTrigger className="mt-2">
                                <SelectValue placeholder="Seleziona" />
                              </SelectTrigger>
                              <SelectContent>
                                {activeClothingOptions.shirt.map((size) => (
                                  <SelectItem key={size} value={size}>
                                    {size}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <Label>Taglia Pantaloni</Label>
                            <Select
                              value={clothingSizes.pantsSize || ""}
                              onValueChange={(v) =>
                                setClothingSizes({
                                  ...clothingSizes,
                                  pantsSize: v,
                                })
                              }
                            >
                              <SelectTrigger className="mt-2">
                                <SelectValue placeholder="Seleziona" />
                              </SelectTrigger>
                              <SelectContent>
                                {activeClothingOptions.pants.map((size) => (
                                  <SelectItem key={size} value={size}>
                                    {size}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <Label>Taglia Scarpe</Label>
                            <Select
                              value={clothingSizes.shoeSize || ""}
                              onValueChange={(v) =>
                                setClothingSizes({
                                  ...clothingSizes,
                                  shoeSize: v,
                                })
                              }
                            >
                              <SelectTrigger className="mt-2">
                                <SelectValue placeholder="Seleziona" />
                              </SelectTrigger>
                              <SelectContent>
                                {activeClothingOptions.shoes.map((size) => (
                                  <SelectItem key={size} value={size}>
                                    {size}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      </div>

                      {/* Riquadro numero maglia */}
                      <div className="md:col-span-1">
                        <Label>Numero maglia</Label>
                        <button
                          type="button"
                          onClick={() => {
                            const selectedEntry =
                              athleteJerseyNumberDetails.primaryRecord ||
                              athleteJerseyAssignments.find(
                                (entry) => entry.groupId === defaultJerseyGroupId,
                              ) || athleteJerseyAssignments[0];
                            setJerseyGroupDraft(
                              selectedEntry?.groupId ||
                                defaultJerseyGroupId ||
                                "",
                            );
                            setJerseyNumberDraft(
                              selectedEntry?.number === null ||
                                selectedEntry?.number === undefined
                                ? jerseyNumberTileValue === null
                                  ? ""
                                  : String(jerseyNumberTileValue)
                                : String(selectedEntry.number),
                            );
                            setIsJerseyNumberDialogOpen(true);
                          }}
                          className="mt-2 w-full group rounded-xl border bg-background shadow-sm hover:shadow-md transition overflow-hidden"
                          aria-label="Modifica numero maglia"
                        >
                          <div className="relative aspect-[4/3] w-full">
                            <div className="absolute inset-0 bg-gradient-to-br from-blue-500 via-blue-600 to-blue-800" />
                            <div className="absolute inset-0 opacity-20">
                              <div className="absolute -top-6 -right-6 w-28 h-28 rounded-full bg-white/30" />
                              <div className="absolute -bottom-8 -left-8 w-36 h-36 rounded-full bg-white/20" />
                            </div>
                            <div className="absolute inset-0 flex items-center justify-center">
                              <div className="relative flex items-center justify-center">
                                <Shirt className="h-20 w-20 text-white/30" />
                                <div className="absolute inset-0 flex items-center justify-center">
                                  <span className="text-4xl font-extrabold tracking-tight text-white drop-shadow-sm">
                                    {jerseyNumberTileValue === null ||
                                    jerseyNumberTileValue === undefined
                                      ? "—"
                                      : String(jerseyNumberTileValue).slice(
                                          0,
                                          3,
                                        )}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </div>
                          <div className="p-3 text-left">
                            <div className="mb-2 flex flex-wrap gap-1">
                              <Badge variant="secondary">
                                {primaryJerseyGroupName}
                              </Badge>
                              {hasDuplicateJerseyNumber ? (
                                <Badge className="bg-amber-100 text-amber-800">
                                  Duplicato
                                </Badge>
                              ) : null}
                              {randomJerseyNumberSuggestion !== null ? (
                                <Badge className="bg-blue-100 text-blue-800">
                                  Random: {randomJerseyNumberSuggestion}
                                </Badge>
                              ) : null}
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {jerseyNumberSummary}
                            </p>
                          </div>
                        </button>
                      </div>
                    </div>

                    <div className="flex justify-end mt-4">
                      <Button
                        onClick={saveClothingSizes}
                        className="bg-blue-600 hover:bg-blue-700"
                      >
                        Salva taglie
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Numeri assegnati</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {athleteJerseyNumberDetails.records.length ? (
                      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                        {athleteJerseyNumberDetails.records
                          .filter((entry) => entry.number !== null)
                          .map((entry) => {
                            const group = entry.groupId
                              ? jerseyGroupById.get(entry.groupId)
                              : null;
                            const duplicated =
                              athleteJerseyNumberDetails.duplicateRecords.some(
                                (duplicate) => duplicate.id === entry.id,
                              );
                          return (
                            <div
                              key={entry.id || `${entry.groupId}:${entry.number}`}
                              className="rounded-lg border bg-white p-4"
                            >
                              <p className="text-sm text-muted-foreground">
                                {group?.name || "Senza gruppo"}
                              </p>
                              <p className="mt-1 text-3xl font-semibold">
                                {entry.number}
                              </p>
                              <div className="mt-2 flex flex-wrap gap-1">
                                <Badge variant="secondary">
                                  {entry.source === "clothing_assignment"
                                    ? "Da assegnazione kit"
                                    : "Manuale"}
                                </Badge>
                                {duplicated ? (
                                  <Badge className="bg-amber-100 text-amber-800">
                                    Duplicato
                                  </Badge>
                                ) : null}
                              </div>
                              <p className="mt-2 text-xs text-muted-foreground">
                                {group?.season || "Numero legato al gruppo"}
                              </p>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                        Nessun numero assegnato a gruppi numerazione.
                        {randomJerseyNumberSuggestion !== null ? (
                          <span className="mt-2 block">
                            Numero random disponibile:{" "}
                            <strong>{randomJerseyNumberSuggestion}</strong>
                          </span>
                        ) : null}
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle>Assegnazioni kit</CardTitle>
                      <Button
                        className="bg-blue-600 hover:bg-blue-700"
                        onClick={() => {
                          resetNewKitAssignment();
                          setIsNewKitAssignmentOpen(true);
                        }}
                      >
                        + Nuova assegnazione
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-muted/50">
                          <tr className="border-b">
                            <th className="text-left p-2">Data</th>
                            <th className="text-left p-2">Kit/Articoli</th>
                            <th className="text-left p-2">Dettagli</th>
                            <th className="text-left p-2">Origine</th>
                            <th className="text-left p-2">Stato</th>
                            <th className="text-left p-2">Azioni</th>
                          </tr>
                        </thead>
                        <tbody>
                          {athleteAssignments.length ? (
                            athleteAssignments.map((a: ClothingAssignment) => (
                              <tr key={a.id} className="border-b align-top">
                                <td className="p-2">
                                  {formatDate(a.createdAt)}
                                </td>
                                <td className="p-2">
                                  <div className="font-medium">
                                    {a.kitName || "Articoli"}
                                  </div>
                                  {a.notes ? (
                                    <div className="mt-1 text-xs text-muted-foreground">
                                      {a.notes}
                                    </div>
                                  ) : null}
                                </td>
                                <td className="p-2">
                                  <div className="space-y-2">
                                    {(a.items || []).map((it) => (
                                      <div
                                        key={it.id}
                                        className="rounded-md border bg-white p-2"
                                      >
                                        <div className="font-medium">
                                          {it.name}
                                        </div>
                                        <div className="mt-1 flex flex-wrap gap-1">
                                          {[it.size, it.color, it.variant]
                                            .filter(Boolean)
                                            .map((value) => (
                                              <Badge
                                                key={String(value)}
                                                variant="secondary"
                                                className="text-xs"
                                              >
                                                {value}
                                              </Badge>
                                            ))}
                                          {it.number !== null &&
                                          it.number !== undefined ? (
                                            <Badge className="border-blue-200 bg-blue-50 text-blue-700">
                                              n.{it.number}
                                            </Badge>
                                          ) : null}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </td>
                                <td className="p-2">
                                  {a.source === "inventory"
                                    ? "Magazzino"
                                    : a.source === "supplier_order"
                                      ? "Fornitore"
                                      : "Manuale"}
                                </td>
                                <td className="p-2">
                                  <Badge
                                    variant="outline"
                                    className={clothingStatusBadgeClass(a.status)}
                                  >
                                    {assignmentStatusLabels[a.status]}
                                  </Badge>
                                </td>
                                <td className="p-2">
                                  <div className="flex flex-wrap gap-2">
                                    {a.status !== "delivered" &&
                                    a.status !== "cancelled" ? (
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() =>
                                          updateAthleteClothingAssignmentStatus(
                                            a,
                                            "delivered",
                                          )
                                        }
                                      >
                                        Consegnato
                                      </Button>
                                    ) : null}
                                    {a.status !== "cancelled" ? (
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() =>
                                          updateAthleteClothingAssignmentStatus(
                                            a,
                                            "cancelled",
                                          )
                                        }
                                      >
                                        Annulla
                                      </Button>
                                    ) : null}
                                  </div>
                                </td>
                              </tr>
                            ))
                          ) : (
                            <tr>
                              <td
                                colSpan={6}
                                className="p-4 text-center text-muted-foreground"
                              >
                                Nessuna assegnazione registrata
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>

                {/* Dialog Nuova Assegnazione */}
                <Dialog
                  open={isNewKitAssignmentOpen}
                  onOpenChange={setIsNewKitAssignmentOpen}
                >
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Nuova assegnazione</DialogTitle>
                    </DialogHeader>

                    <div className="space-y-4 py-2">
                      <div>
                        <Label>Tipo assegnazione</Label>
                        <div className="flex gap-4 mt-2">
                          <div className="flex items-center space-x-2">
                            <input
                              type="radio"
                              id="ass-kit"
                              name="assType"
                              value="kit"
                              checked={
                                newKitAssignment.assignmentType === "kit"
                              }
                              onChange={(e) =>
                                setNewKitAssignment({
                                  ...newKitAssignment,
                                  assignmentType: e.target.value,
                                })
                              }
                            />
                            <Label htmlFor="ass-kit">Kit completo</Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <input
                              type="radio"
                              id="ass-comp"
                              name="assType"
                              value="components"
                              checked={
                                newKitAssignment.assignmentType === "components"
                              }
                              onChange={(e) =>
                                setNewKitAssignment({
                                  ...newKitAssignment,
                                  assignmentType: e.target.value,
                                })
                              }
                            />
                            <Label htmlFor="ass-comp">Componenti singoli</Label>
                          </div>
                        </div>
                      </div>

                      {newKitAssignment.assignmentType === "kit" ? (
                        <div className="space-y-4">
                          <Label>Seleziona kit</Label>
                          <Select
                            value={newKitAssignment.kitId}
                            onValueChange={(val) => {
                              const selectedKit = clothingKits.find(
                                (k: any) => k.id === val,
                              );
                              setNewKitAssignment({
                                ...newKitAssignment,
                                kitId: val,
                                components: buildAthleteKitBuilderComponents(
                                  selectedKit?.components,
                                ),
                              });
                            }}
                          >
                            <SelectTrigger className="mt-2">
                              <SelectValue placeholder="Seleziona kit" />
                            </SelectTrigger>
                            <SelectContent>
                              {clothingKits.map((k: any) => (
                                <SelectItem key={k.id} value={k.id}>
                                  {k.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {newKitAssignment.kitId && (
                            <div>
                              <Label>Dettaglio assegnazione</Label>
                              <div className="mt-2 rounded-xl border bg-slate-50/60 p-4">
                                <CustomKitComponentsBuilder
                                  value={newKitAssignment.components}
                                  onChange={(components) =>
                                    setNewKitAssignment({
                                      ...newKitAssignment,
                                      components,
                                    })
                                  }
                                  defaultComponents={buildAthleteKitBuilderComponents(
                                    clothingKits.find(
                                      (k: any) => k.id === newKitAssignment.kitId,
                                    )?.components,
                                  )}
                                  availableSizes={athleteAssignmentSizeOptions}
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div>
                          <Label>Componenti singoli</Label>
                          <div className="mt-2 rounded-xl border bg-slate-50/60 p-4">
                            <CustomKitComponentsBuilder
                              value={newKitAssignment.components}
                              onChange={(components) =>
                                setNewKitAssignment({
                                  ...newKitAssignment,
                                  components,
                                })
                              }
                              availableSizes={athleteAssignmentSizeOptions}
                            />
                          </div>
                          <p className="mt-2 text-xs text-muted-foreground">
                            Durante l&apos;assegnazione puoi definire taglie e
                            numero maglia del singolo atleta.
                          </p>
                        </div>
                      )}

                      <div>
                        <Label>Note</Label>
                        <Textarea
                          className="mt-2"
                          value={newKitAssignment.notes}
                          onChange={(e) =>
                            setNewKitAssignment({
                              ...newKitAssignment,
                              notes: e.target.value,
                            })
                          }
                        />
                      </div>

                      <div className="flex justify-end gap-2">
                        <Button
                          variant="outline"
                          onClick={() => setIsNewKitAssignmentOpen(false)}
                        >
                          Annulla
                        </Button>
                        <Button
                          className="bg-blue-600 hover:bg-blue-700"
                          onClick={addAthleteKitAssignment}
                          disabled={
                            newKitAssignment.assignmentType === "kit"
                              ? !newKitAssignment.kitId
                              : !(newKitAssignment.components || []).length
                          }
                        >
                          Conferma
                        </Button>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
              </TabsContent>

              {/* DOCUMENTI TAB */}
              <TabsContent value="documenti" className="mt-4 space-y-6">
                <Card>
                  <CardHeader>
                    <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                      <div>
                        <CardTitle>Documenti condivisi con parent</CardTitle>
                        <p className="mt-1 text-sm text-muted-foreground">
                          Richiedi, condividi, approva o rifiuta i documenti visibili alla famiglia.
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void refreshSharedDocuments()}
                        disabled={sharedDocumentBusy}
                      >
                        <RefreshCw className="mr-2 h-4 w-4" />
                        Aggiorna
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="grid gap-4 xl:grid-cols-3">
                      <div className="rounded-lg border p-4">
                        <h3 className="font-semibold text-slate-900">Richiedi documento</h3>
                        <div className="mt-4 grid gap-3">
                          <Input
                            placeholder="Titolo documento"
                            value={requiredSharedDocument.title}
                            onChange={(event) =>
                              setRequiredSharedDocument((current) => ({
                                ...current,
                                title: event.target.value,
                              }))
                            }
                          />
                          <Select
                            value={requiredSharedDocument.documentType}
                            onValueChange={(value) =>
                              setRequiredSharedDocument((current) => ({
                                ...current,
                                documentType: value,
                              }))
                            }
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Tipo documento" />
                            </SelectTrigger>
                            <SelectContent>
                              {SHARED_DOCUMENT_TYPES.map((type) => (
                                <SelectItem key={type.value} value={type.value}>
                                  {type.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Input
                            type="date"
                            value={requiredSharedDocument.dueDate}
                            onChange={(event) =>
                              setRequiredSharedDocument((current) => ({
                                ...current,
                                dueDate: event.target.value,
                              }))
                            }
                          />
                          <Textarea
                            placeholder="Note per il parent"
                            value={requiredSharedDocument.description}
                            onChange={(event) =>
                              setRequiredSharedDocument((current) => ({
                                ...current,
                                description: event.target.value,
                              }))
                            }
                          />
                          <Button onClick={handleRequestSharedDocument} disabled={sharedDocumentBusy}>
                            <FileText className="mr-2 h-4 w-4" />
                            Richiedi al parent
                          </Button>
                        </div>
                      </div>

                      <div className="rounded-lg border p-4">
                        <h3 className="font-semibold text-slate-900">Carica documento club</h3>
                        <div className="mt-4 grid gap-3">
                          <Input
                            placeholder="Titolo documento"
                            value={clubSharedDocumentUpload.title}
                            onChange={(event) =>
                              setClubSharedDocumentUpload((current) => ({
                                ...current,
                                title: event.target.value,
                              }))
                            }
                          />
                          <Select
                            value={clubSharedDocumentUpload.documentType}
                            onValueChange={(value) =>
                              setClubSharedDocumentUpload((current) => ({
                                ...current,
                                documentType: value,
                              }))
                            }
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Tipo documento" />
                            </SelectTrigger>
                            <SelectContent>
                              {SHARED_DOCUMENT_TYPES.map((type) => (
                                <SelectItem key={type.value} value={type.value}>
                                  {type.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Input
                            type="file"
                            accept=".pdf,image/jpeg,image/png,image/heic,image/heif"
                            onChange={(event) =>
                              setClubSharedDocumentUpload((current) => ({
                                ...current,
                                file: event.target.files?.[0] || null,
                              }))
                            }
                          />
                          <Textarea
                            placeholder="Descrizione"
                            value={clubSharedDocumentUpload.description}
                            onChange={(event) =>
                              setClubSharedDocumentUpload((current) => ({
                                ...current,
                                description: event.target.value,
                              }))
                            }
                          />
                          <Button onClick={handleUploadClubSharedDocument} disabled={sharedDocumentBusy}>
                            <Upload className="mr-2 h-4 w-4" />
                            Condividi con parent
                          </Button>
                        </div>
                      </div>

                      <div className="rounded-lg border p-4">
                        <h3 className="font-semibold text-slate-900">Compila un modulo</h3>
                        <p className="mt-1 text-sm text-muted-foreground">
                          L&apos;atleta e gia selezionato e i dati che EasyGame
                          conosce arrivano precompilati.
                        </p>
                        <div className="mt-4">
                          <Button
                            className="w-full"
                            onClick={() => setCompileFormOpen(true)}
                          >
                            <FileText className="mr-2 h-4 w-4" />
                            Compila modulo
                          </Button>
                        </div>
                      </div>
                    </div>

                    {sharedDocuments.length === 0 ? (
                      <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                        Nessun documento condiviso o richiesto.
                      </div>
                    ) : (
                      <div className="grid gap-3">
                        {sharedDocuments.map((document) => (
                          <div key={document.id} className="rounded-lg border bg-white p-4">
                            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                              <div>
                                <div className="flex flex-wrap items-center gap-2">
                                  <p className="font-semibold text-slate-900">{document.title}</p>
                                  <Badge
                                    variant="outline"
                                    className={getSharedDocumentStatusClassName(document.status)}
                                  >
                                    {getSharedDocumentStatusLabel(document.status)}
                                  </Badge>
                                  <Badge variant="secondary">
                                    {getSharedDocumentTypeLabel(document.documentType)}
                                  </Badge>
                                </div>
                                <p className="mt-1 text-sm text-muted-foreground">
                                  {document.uploadedByRole === "parent"
                                    ? "Caricato dal parent"
                                    : "Creato dal club"}
                                  {document.fileName ? ` - ${document.fileName}` : ""}
                                </p>
                                {document.description ? (
                                  <p className="mt-2 text-sm">{document.description}</p>
                                ) : null}
                                {document.dueDate ? (
                                  <p className="mt-1 text-xs text-muted-foreground">
                                    Scadenza: {formatDate(document.dueDate)}
                                  </p>
                                ) : null}
                                {document.rejectionReason ? (
                                  <p className="mt-1 text-xs font-medium text-red-600">
                                    Motivo rifiuto: {document.rejectionReason}
                                  </p>
                                ) : null}
                              </div>

                              <div className="flex flex-wrap gap-2 md:justify-end">
                                {document.assetId ? (
                                  <>
                                    <Button variant="outline" size="sm" asChild>
                                      <a
                                        href={`/api/athletes/${athleteId}/documents/${document.id}/file`}
                                        target="_blank"
                                        rel="noreferrer"
                                      >
                                        <Eye className="mr-2 h-4 w-4" />
                                        Visualizza
                                      </a>
                                    </Button>
                                    <Button variant="outline" size="sm" asChild>
                                      <a
                                        href={`/api/athletes/${athleteId}/documents/${document.id}/file`}
                                        download={document.fileName || document.title}
                                      >
                                        <Download className="mr-2 h-4 w-4" />
                                        Scarica
                                      </a>
                                    </Button>
                                  </>
                                ) : null}
                                {document.uploadedByRole === "parent" &&
                                ["under_review", "uploaded", "rejected"].includes(
                                  String(document.status || ""),
                                ) ? (
                                  <>
                                    <Button
                                      size="sm"
                                      onClick={() =>
                                        handleSharedDocumentAction(document.id, "approve")
                                      }
                                      disabled={sharedDocumentBusy}
                                    >
                                      Approva
                                    </Button>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() =>
                                        handleSharedDocumentAction(document.id, "reject")
                                      }
                                      disabled={sharedDocumentBusy}
                                    >
                                      Rifiuta
                                    </Button>
                                  </>
                                ) : null}
                                {["required", "rejected"].includes(
                                  String(document.status || ""),
                                ) ? (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() =>
                                      handleSharedDocumentAction(document.id, "remind")
                                    }
                                    disabled={sharedDocumentBusy}
                                  >
                                    Sollecita
                                  </Button>
                                ) : null}
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() =>
                                    handleSharedDocumentAction(document.id, "delete")
                                  }
                                  disabled={sharedDocumentBusy}
                                >
                                  <Trash2 className="h-4 w-4 text-red-500" />
                                </Button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle>Documento di Identità</CardTitle>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowDocumentScannerModal(true)}
                      >
                        <Camera className="h-4 w-4 mr-2" />
                        Scansiona documento
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEditSection("identity")}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <h3 className="text-sm font-medium text-muted-foreground">
                          Tipo di Documento
                        </h3>
                        <p className="mt-1">{athlete.documentType || "-"}</p>
                      </div>
                      <div>
                        <h3 className="text-sm font-medium text-muted-foreground">
                          Numero Documento
                        </h3>
                        <p className="mt-1">{athlete.documentNumber || "-"}</p>
                      </div>
                      <div>
                        <h3 className="text-sm font-medium text-muted-foreground">
                          Rilascio
                        </h3>
                        <p className="mt-1">
                          {formatDate(athlete.documentIssue) || "-"}
                        </p>
                      </div>
                      <div>
                        <h3 className="text-sm font-medium text-muted-foreground">
                          Scadenza
                        </h3>
                        <p className="mt-1">
                          {formatDate(athlete.documentExpiry) || "-"}
                        </p>
                      </div>
                      <div className="md:col-span-2">
                        <h3 className="text-sm font-medium text-muted-foreground">
                          Scadenza Permesso di Soggiorno
                        </h3>
                        <p className="mt-1">
                          {formatDate(athlete.residencePermitExpiry) || "-"}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle>Allegati Documento di Identita</CardTitle>
                    <Button
                      size="sm"
                      onClick={() => {
                        setNewIdentityDocument(createEmptyAttachment());
                        setShowAddIdentityDocumentModal(true);
                      }}
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Aggiungi Allegato
                    </Button>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b">
                            <th className="text-left p-2">Nome</th>
                            <th className="text-left p-2">Tipo</th>
                            <th className="text-left p-2">Data Caricamento</th>
                            <th className="text-left p-2">Azioni</th>
                          </tr>
                        </thead>
                        <tbody>
                          {identityDocuments.length > 0 ? (
                            identityDocuments.map((document) => (
                              <tr key={document.id} className="border-b">
                                <td className="p-2">{document.name}</td>
                                <td className="p-2">
                                  {document.type || "Documento Identita"}
                                </td>
                                <td className="p-2">
                                  {formatDate(document.uploadDate)}
                                </td>
                                <td className="p-2">
                                  <div className="flex gap-1">
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => {
                                        if (
                                          !openClientFileUrl(document.fileUrl)
                                        ) {
                                          showToast(
                                            "error",
                                            "File documento non disponibile",
                                          );
                                        }
                                      }}
                                    >
                                      <Eye className="h-4 w-4" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => {
                                        if (
                                          !downloadClientFileUrl(
                                            document.fileUrl,
                                            document.fileName || document.name,
                                          )
                                        ) {
                                          showToast(
                                            "error",
                                            "File documento non disponibile",
                                          );
                                        }
                                      }}
                                    >
                                      <Download className="h-4 w-4" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() =>
                                        removeStoredDocument(
                                          "identity",
                                          document.id,
                                        )
                                      }
                                    >
                                      <Trash2 className="h-4 w-4 text-red-500" />
                                    </Button>
                                  </div>
                                </td>
                              </tr>
                            ))
                          ) : (
                            <tr>
                              <td
                                colSpan={4}
                                className="p-4 text-center text-muted-foreground"
                              >
                                Nessun allegato documento caricato
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle>Altri Documenti</CardTitle>
                    <Button
                      size="sm"
                      onClick={() => setShowAddDocumentModal(true)}
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Aggiungi Documento
                    </Button>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b">
                            <th className="text-left p-2">Nome</th>
                            <th className="text-left p-2">Tipo</th>
                            <th className="text-left p-2">Data Caricamento</th>
                            <th className="text-left p-2">Azioni</th>
                          </tr>
                        </thead>
                        <tbody>
                          {documents.length > 0 ? (
                            documents.map((doc, idx) => (
                              <tr key={idx} className="border-b">
                                <td className="p-2">{doc.name}</td>
                                <td className="p-2">{doc.type}</td>
                                <td className="p-2">
                                  {formatDate(doc.uploadDate)}
                                </td>
                                <td className="p-2">
                                  <div className="flex gap-1">
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => {
                                        if (!openClientFileUrl(doc.fileUrl)) {
                                          showToast(
                                            "error",
                                            "File documento non disponibile",
                                          );
                                        }
                                      }}
                                    >
                                      <Eye className="h-4 w-4" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => {
                                        if (
                                          !downloadClientFileUrl(
                                            doc.fileUrl,
                                            doc.fileName || doc.name,
                                          )
                                        ) {
                                          showToast(
                                            "error",
                                            "File documento non disponibile",
                                          );
                                        }
                                      }}
                                    >
                                      <Download className="h-4 w-4" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() =>
                                        handleDeleteDocument(doc.id)
                                      }
                                    >
                                      <Trash2 className="h-4 w-4 text-red-500" />
                                    </Button>
                                  </div>
                                </td>
                              </tr>
                            ))
                          ) : (
                            <tr>
                              <td
                                colSpan={4}
                                className="p-4 text-center text-muted-foreground"
                              >
                                Nessun documento caricato
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* ANALITICHE TAB */}
              <TabsContent value="analitiche" className="mt-4 space-y-6">
                <AthleteCategoryAnalyticsSection
                  analytics={athleteCategoryAnalytics}
                />
              </TabsContent>
            </Tabs>
          </DashboardPageContainer>
        </main>
      </div>

      {/* Edit Section Modal */}
      <Dialog open={showEditModal} onOpenChange={setShowEditModal}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingSection === "general" && "Modifica Informazioni Generali"}
              {editingSection === "contact" && "Modifica Contatti"}
              {editingSection === "address" && "Modifica Indirizzo"}
              {editingSection === "medical" && "Modifica Dati Sanitari"}
              {editingSection === "identity" &&
                "Modifica Documento di Identità"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {editingSection === "general" && (
              <>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <Label>Nome</Label>
                    <CapitalizedInput
                      value={editFormData.name || ""}
                      onChange={(e) =>
                        setEditFormData({
                          ...editFormData,
                          name: e.target.value,
                        })
                      }
                      onValueChange={(value) =>
                        setEditFormData({ ...editFormData, name: value })
                      }
                    />
                  </div>
                  <div>
                    <Label>Cognome</Label>
                    <CapitalizedInput
                      value={editFormData.surname || ""}
                      onChange={(e) =>
                        setEditFormData({
                          ...editFormData,
                          surname: e.target.value,
                        })
                      }
                      onValueChange={(value) =>
                        setEditFormData({ ...editFormData, surname: value })
                      }
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <Label>Data di Nascita</Label>
                    <Input
                      type="date"
                      value={editFormData.birthDate || ""}
                      onChange={(e) =>
                        setEditFormData({
                          ...editFormData,
                          birthDate: e.target.value,
                        })
                      }
                    />
                  </div>
                  <div>
                    <Label>Nazionalità</Label>
                    <CapitalizedInput
                      value={editFormData.nationality || ""}
                      onChange={(e) =>
                        setEditFormData({
                          ...editFormData,
                          nationality: e.target.value,
                        })
                      }
                      onValueChange={(value) =>
                        setEditFormData({ ...editFormData, nationality: value })
                      }
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <Label>Sesso</Label>
                    <Select
                      value={editFormData.gender || ""}
                      onValueChange={(value) =>
                        setEditFormData({ ...editFormData, gender: value })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Seleziona" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="M">Maschio</SelectItem>
                        <SelectItem value="F">Femmina</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {/*
                  Blocco 7: il codice fiscale sta **dopo** i dati anagrafici,
                  perche da quelli si calcola. Prima stava in cima e chiedeva
                  di calcolare qualcosa che il form non sapeva ancora.
                  Il comune di nascita vive dentro questo campo: e da li che
                  arriva il codice catastale.
                */}
                <AssistedFiscalCodeField
                  id="athlete-fiscal-code"
                  label="Codice Fiscale"
                  value={editFormData.fiscalCode || ""}
                  onChange={(value) =>
                    setEditFormData({ ...editFormData, fiscalCode: value })
                  }
                  person={{
                    firstName: editFormData.name,
                    lastName: editFormData.surname,
                    birthDate: editFormData.birthDate,
                    gender: editFormData.gender,
                  }}
                  belfioreCode={editFormData.birthPlaceCode || ""}
                  onBelfioreCodeChange={(value) =>
                    setEditFormData({ ...editFormData, birthPlaceCode: value })
                  }
                  birthPlace={editFormData.birthPlace || ""}
                  onBirthPlaceChange={(value) =>
                    setEditFormData({ ...editFormData, birthPlace: value })
                  }
                />
                <AthleteCategoriesPanel
                  categories={clubCategoryOptions}
                  memberships={editCategoryMemberships}
                  primaryCategoryId={primaryEditCategoryId}
                  primarySiteId={primaryEditSiteId}
                  sites={clubSites}
                  onPrimaryCategoryChange={handlePrimaryCategoryChange}
                  onPrimarySiteChange={handlePrimarySiteChange}
                  onToggleSecondaryCategory={handleToggleSecondaryCategory}
                />
                <div>
                  <Label>Note</Label>
                  <Textarea
                    value={editFormData.notes || ""}
                    onChange={(e) =>
                      setEditFormData({
                        ...editFormData,
                        notes: e.target.value,
                      })
                    }
                    rows={3}
                  />
                </div>
              </>
            )}

            {editingSection === "contact" && (
              <>
                <div>
                  <PhoneField
                    label="Telefono"
                    value={editFormData.phone || ""}
                    onChange={(value) =>
                      setEditFormData({ ...editFormData, phone: value })
                    }
                  />
                </div>
                <div>
                  <Label>Email</Label>
                  <Input
                    type="email"
                    value={editFormData.email || ""}
                    onChange={(e) =>
                      setEditFormData({
                        ...editFormData,
                        email: e.target.value,
                      })
                    }
                  />
                </div>
              </>
            )}

            {editingSection === "address" && (
              <>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div className="sm:col-span-2">
                    <Label>Indirizzo</Label>
                    <CapitalizedInput
                      value={editFormData.address || ""}
                      onChange={(e) =>
                        setEditFormData({
                          ...editFormData,
                          address: e.target.value,
                        })
                      }
                      onValueChange={(value) =>
                        setEditFormData({ ...editFormData, address: value })
                      }
                    />
                  </div>
                  <div>
                    <Label>N. Civico</Label>
                    <Input
                      value={editFormData.streetNumber || ""}
                      onChange={(e) =>
                        setEditFormData({
                          ...editFormData,
                          streetNumber: e.target.value,
                        })
                      }
                    />
                  </div>
                </div>
                <AssistedAddressFields
                  idPrefix="athlete-residence"
                  values={{
                    postalCode: editFormData.postalCode,
                    city: editFormData.city,
                    province: editFormData.province,
                    region: editFormData.region,
                    country: editFormData.country,
                  }}
                  onChange={(patch) =>
                    setEditFormData((current: any) => ({ ...current, ...patch }))
                  }
                />
              </>
            )}

            {editingSection === "medical" && (
              <>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <Label>Gruppo Sanguigno</Label>
                    <Select
                      value={editFormData.bloodType || ""}
                      onValueChange={(value) =>
                        setEditFormData({ ...editFormData, bloodType: value })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Seleziona" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="A+">A+</SelectItem>
                        <SelectItem value="A-">A-</SelectItem>
                        <SelectItem value="B+">B+</SelectItem>
                        <SelectItem value="B-">B-</SelectItem>
                        <SelectItem value="AB+">AB+</SelectItem>
                        <SelectItem value="AB-">AB-</SelectItem>
                        <SelectItem value="0+">0+</SelectItem>
                        <SelectItem value="0-">0-</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Allergie</Label>
                    <Input
                      value={editFormData.allergies || ""}
                      onChange={(e) =>
                        setEditFormData({
                          ...editFormData,
                          allergies: e.target.value,
                        })
                      }
                    />
                  </div>
                </div>
                <div>
                  <Label>Malattie Croniche</Label>
                  <Textarea
                    value={editFormData.chronicDiseases || ""}
                    onChange={(e) =>
                      setEditFormData({
                        ...editFormData,
                        chronicDiseases: e.target.value,
                      })
                    }
                    rows={2}
                  />
                </div>
                <div>
                  <Label>Farmaci</Label>
                  <Textarea
                    value={editFormData.medications || ""}
                    onChange={(e) =>
                      setEditFormData({
                        ...editFormData,
                        medications: e.target.value,
                      })
                    }
                    rows={2}
                  />
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <Label>Contatto di Emergenza</Label>
                    <CapitalizedInput
                      value={editFormData.emergencyContact || ""}
                      onChange={(e) =>
                        setEditFormData({
                          ...editFormData,
                          emergencyContact: e.target.value,
                        })
                      }
                      onValueChange={(value) =>
                        setEditFormData({ ...editFormData, emergencyContact: value })
                      }
                    />
                  </div>
                  <div>
                    <PhoneField
                      label="Telefono di Emergenza"
                      value={editFormData.emergencyPhone || ""}
                      onChange={(value) =>
                        setEditFormData({ ...editFormData, emergencyPhone: value })
                      }
                    />
                  </div>
                </div>
              </>
            )}

            {editingSection === "identity" && (
              <>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <Label>Tipo di Documento</Label>
                    <Select
                      value={editFormData.documentType || ""}
                      onValueChange={(value) =>
                        setEditFormData({
                          ...editFormData,
                          documentType: value,
                        })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Seleziona" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Carta d'identità">
                          Carta d&apos;identità
                        </SelectItem>
                        <SelectItem value="Passaporto">Passaporto</SelectItem>
                        <SelectItem value="Patente">Patente</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Numero Documento</Label>
                    <Input
                      value={editFormData.documentNumber || ""}
                      onChange={(e) =>
                        setEditFormData({
                          ...editFormData,
                          documentNumber: e.target.value,
                        })
                      }
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <Label>Data Rilascio</Label>
                    <Input
                      type="date"
                      value={editFormData.documentIssue || ""}
                      onChange={(e) =>
                        setEditFormData({
                          ...editFormData,
                          documentIssue: e.target.value,
                        })
                      }
                    />
                  </div>
                  <div>
                    <Label>Data Scadenza</Label>
                    <Input
                      type="date"
                      value={editFormData.documentExpiry || ""}
                      onChange={(e) =>
                        setEditFormData({
                          ...editFormData,
                          documentExpiry: e.target.value,
                        })
                      }
                    />
                  </div>
                </div>
                <div>
                  <Label>Scadenza Permesso di Soggiorno</Label>
                  <Input
                    type="date"
                    value={editFormData.residencePermitExpiry || ""}
                    onChange={(e) =>
                      setEditFormData({
                        ...editFormData,
                        residencePermitExpiry: e.target.value,
                      })
                    }
                  />
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={handleCancelEdit}>
              Annulla
            </Button>
            <Button
              onClick={handleSaveSection}
              className="bg-blue-600 hover:bg-blue-700"
            >
              <Save className="h-4 w-4 mr-2" />
              Salva
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Jersey Number Dialog */}
      <Dialog
        open={isJerseyNumberDialogOpen}
        onOpenChange={(open) => {
          setIsJerseyNumberDialogOpen(open);
          if (open) {
            const selectedEntry =
              athleteJerseyNumberDetails.primaryRecord ||
              athleteJerseyAssignments.find(
                (entry) => entry.groupId === defaultJerseyGroupId,
              ) || athleteJerseyAssignments[0];
            setJerseyGroupDraft(
              selectedEntry?.groupId || defaultJerseyGroupId || "",
            );
            setJerseyNumberDraft(
              selectedEntry?.number === null ||
                selectedEntry?.number === undefined
                ? jerseyNumberTileValue === null
                  ? ""
                  : String(jerseyNumberTileValue)
                : String(selectedEntry.number),
            );
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Numero maglia</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label>Gruppo numerazione</Label>
              <Select
                value={jerseyGroupDraft}
                onValueChange={(value) => {
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
              >
                <SelectTrigger className="mt-2">
                  <SelectValue placeholder="Seleziona gruppo" />
                </SelectTrigger>
                <SelectContent>
                  {clothingState.numberingGroups.map((group) => (
                    <SelectItem key={group.id} value={group.id}>
                      {group.name}
                      {group.season ? ` - ${group.season}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!clothingState.numberingGroups.length ? (
                <p className="mt-2 text-xs text-amber-700">
                  Crea prima un gruppo numerazione dalla pagina Abbigliamento.
                </p>
              ) : null}
            </div>
            <div>
              <Label>Numero (max 3 cifre)</Label>
              <div className="mt-2 flex gap-2">
                <Input
                  inputMode="numeric"
                  placeholder="Es. 7, 23, 101"
                  value={jerseyNumberDraft}
                  onChange={(e) =>
                    setJerseyNumberDraft(sanitizeJerseyDraft(e.target.value))
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Enter") saveJerseyNumber();
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={fillRandomJerseyDraft}
                  disabled={!clothingState.numberingGroups.length}
                >
                  Random
                </Button>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Il numero viene sincronizzato con la pagina Abbigliamento.
                Eventuali duplicati nel gruppo vengono segnalati nella scheda.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsJerseyNumberDialogOpen(false)}
            >
              Annulla
            </Button>
            <Button
              onClick={saveJerseyNumber}
              disabled={!jerseyGroupDraft && clothingState.numberingGroups.length > 0}
              className="bg-blue-600 hover:bg-blue-700"
            >
              <Save className="h-4 w-4 mr-2" />
              Salva
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={showPlanConfirmDialog}
        onOpenChange={setShowPlanConfirmDialog}
      >
        <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Conferma piano / abbonamento</DialogTitle>
          </DialogHeader>
          {planConfirmationPlan && planConfirmationDraft ? (
            <div className="space-y-5 py-2">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <Label>Data inizio abbonamento</Label>
                  <Input
                    type="date"
                    value={planConfirmationDraft.subscriptionStartDate}
                    onChange={(event) =>
                      setPlanConfirmationDraft((current) =>
                        current
                          ? {
                              ...current,
                              subscriptionStartDate: event.target.value,
                            }
                          : current,
                      )
                    }
                    className="mt-2"
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    Default da Data iscrizione atleta, modificabile per questo piano.
                  </p>
                </div>
                {planConfirmationPlan.proration.allowManualOverride ? (
                  <div>
                    <Label>Importo personalizzato</Label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={planConfirmationDraft.manualEnrollmentAmount}
                      onChange={(event) =>
                        setPlanConfirmationDraft((current) =>
                          current
                            ? {
                                ...current,
                                manualEnrollmentAmount: event.target.value,
                              }
                            : current,
                        )
                      }
                      placeholder="Lascia vuoto per calcolo automatico"
                      className="mt-2"
                    />
                  </div>
                ) : null}
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-lg border p-4">
                  <p className="font-semibold">Servizi obbligatori</p>
                  <div className="mt-3 space-y-2">
                    {planConfirmationRequiredServices.length > 0 ? (
                      planConfirmationRequiredServices.map((service) => (
                        <div
                          key={service.id}
                          className="flex items-start justify-between gap-3 rounded-md bg-slate-50 px-3 py-2"
                        >
                          <div>
                            <p className="font-medium">{service.name}</p>
                            {service.description ? (
                              <p className="text-xs text-muted-foreground">
                                {service.description}
                              </p>
                            ) : null}
                          </div>
                          <span className="font-semibold">
                            {formatCurrency(service.price)}
                          </span>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        Nessun servizio obbligatorio.
                      </p>
                    )}
                  </div>
                </div>

                <div className="rounded-lg border p-4">
                  <p className="font-semibold">Servizi opzionali</p>
                  <div className="mt-3 space-y-2">
                    {planConfirmationOptionalServices.length > 0 ? (
                      planConfirmationOptionalServices.map((service) => (
                        <label
                          key={service.id}
                          className="flex items-start justify-between gap-3 rounded-md bg-slate-50 px-3 py-2"
                        >
                          <span className="flex min-w-0 items-start gap-2">
                            <Checkbox
                              checked={planConfirmationDraft.selectedOptionalServiceIds.includes(
                                service.id,
                              )}
                              onCheckedChange={(checked) =>
                                setPlanConfirmationDraft((current) => {
                                  if (!current) return current;
                                  const nextIds = new Set(
                                    current.selectedOptionalServiceIds,
                                  );
                                  if (checked === true) {
                                    nextIds.add(service.id);
                                  } else {
                                    nextIds.delete(service.id);
                                  }
                                  return {
                                    ...current,
                                    selectedOptionalServiceIds:
                                      Array.from(nextIds),
                                  };
                                })
                              }
                            />
                            <span>
                              <span className="block font-medium">
                                {service.name}
                              </span>
                              {service.description ? (
                                <span className="block text-xs text-muted-foreground">
                                  {service.description}
                                </span>
                              ) : null}
                            </span>
                          </span>
                          <span className="font-semibold">
                            {formatCurrency(service.price)}
                          </span>
                        </label>
                      ))
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        Nessun servizio opzionale.
                      </p>
                    )}
                  </div>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-4">
                <div className="rounded-lg bg-slate-50 p-3">
                  <p className="text-xs text-muted-foreground">Servizi</p>
                  <p className="text-lg font-semibold">
                    {formatCurrency(planConfirmationBaseTotal)}
                  </p>
                </div>
                <div className="rounded-lg bg-blue-50 p-3">
                  <p className="text-xs text-muted-foreground">Pro-rata</p>
                  <p className="text-lg font-semibold text-blue-700">
                    {planConfirmationSummary?.prorationResult?.applied
                      ? formatCurrency(planConfirmationSummary.grossAmount)
                      : "Non applicato"}
                  </p>
                </div>
                <div className="rounded-lg bg-amber-50 p-3">
                  <p className="text-xs text-muted-foreground">Sconti</p>
                  <p className="text-lg font-semibold text-amber-700">
                    -{formatCurrency(planConfirmationSummary?.totalDiscounts || 0)}
                  </p>
                </div>
                <div className="rounded-lg bg-green-50 p-3">
                  <p className="text-xs text-muted-foreground">Totale finale</p>
                  <p className="text-lg font-semibold text-green-700">
                    {formatCurrency(planConfirmationSummary?.expectedTotal || 0)}
                  </p>
                </div>
              </div>

              {planConfirmationSummary?.prorationResult?.warning ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                  {planConfirmationSummary.prorationResult.warning}
                </div>
              ) : null}
              {planConfirmationInstallmentPreview.warnings.length > 0 ? (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  {planConfirmationInstallmentPreview.warnings[0]}
                </div>
              ) : null}

              <div className="rounded-lg border p-4">
                <p className="font-semibold">Anteprima pagamenti</p>
                <div className="mt-3 space-y-2">
                  {planConfirmationInstallmentPreview.installments.map(
                    (installment) => (
                      <div
                        key={installment.id}
                        className="grid gap-2 rounded-md bg-slate-50 px-3 py-2 text-sm md:grid-cols-[1fr_auto_auto]"
                      >
                        <span className="font-medium">{installment.label}</span>
                        <span>
                          Scadenza {formatDate(installment.dueDate || "")}
                        </span>
                        <span className="font-semibold">
                          {formatCurrency(installment.amount)}
                        </span>
                      </div>
                    ),
                  )}
                </div>
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowPlanConfirmDialog(false);
                setPlanConfirmationDraft(null);
              }}
            >
              Annulla
            </Button>
            <Button
              onClick={handleContinuePlanConfirmation}
              disabled={
                isEnrollmentSaving ||
                planConfirmationInstallmentPreview.warnings.length > 0
              }
            >
              Continua
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={showCreatePaymentsDialog}
        onOpenChange={setShowCreatePaymentsDialog}
      >
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Creare i pagamenti?</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Verranno creati{" "}
              {planConfirmationInstallmentPreview.installments.length} pagamenti
              in attesa nello storico dell&apos;atleta.
            </p>
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-slate-50">
                    <th className="p-2 text-left">Rata</th>
                    <th className="p-2 text-left">Descrizione</th>
                    <th className="p-2 text-left">Importo</th>
                    <th className="p-2 text-left">Scadenza</th>
                    <th className="p-2 text-left">Stato iniziale</th>
                  </tr>
                </thead>
                <tbody>
                  {planConfirmationInstallmentPreview.installments.map(
                    (installment, index) => (
                      <tr key={installment.id} className="border-b">
                        <td className="p-2">{index + 1}</td>
                        <td className="p-2">
                          {planConfirmationPlan?.name || "Piano"} -{" "}
                          {installment.label}
                        </td>
                        <td className="p-2">
                          {formatCurrency(installment.amount)}
                        </td>
                        <td className="p-2">
                          {formatDate(installment.dueDate || "")}
                        </td>
                        <td className="p-2">
                          <Badge className="border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-50">
                            In attesa
                          </Badge>
                        </td>
                      </tr>
                    ),
                  )}
                </tbody>
              </table>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowCreatePaymentsDialog(false)}
            >
              Annulla
            </Button>
            <Button
              onClick={confirmEnrollmentPlanAssignment}
              disabled={isEnrollmentSaving}
            >
              {isEnrollmentSaving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Conferma e crea pagamenti
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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

      <Dialog
        open={showDocumentScannerModal}
        onOpenChange={setShowDocumentScannerModal}
      >
        <DialogContent className="sm:max-w-5xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Scansiona documento</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 lg:grid-cols-[1.15fr_0.85fr] gap-6 py-2">
            <div className="space-y-4">
              <div className="rounded-3xl border border-slate-200 bg-slate-950 p-4 text-white shadow-xl">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold">Acquisizione documento</p>
                    <p className="text-xs text-white/70">
                      Usa la fotocamera oppure carica una foto fronte documento.
                    </p>
                  </div>
                  <IdCard className="h-5 w-5 text-cyan-300" />
                </div>

                <div className="mt-4 aspect-[4/3] overflow-hidden rounded-2xl border border-white/10 bg-black/60">
                  {documentScanImage ? (
                    <img
                      src={documentScanImage}
                      alt="Anteprima documento"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <video
                      ref={documentScannerVideoRef}
                      autoPlay
                      muted
                      playsInline
                      className="h-full w-full object-cover"
                    />
                  )}
                </div>

                <canvas ref={documentScannerCanvasRef} className="hidden" />
                <Input
                  ref={documentScannerFileInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handleDocumentScanFileChange}
                  className="hidden"
                />

                <div className="mt-4 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      void startDocumentScannerCamera();
                    }}
                    disabled={isCameraStarting}
                    className="border-white/20 bg-white/10 text-white hover:bg-white/20"
                  >
                    {isCameraStarting ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4 mr-2" />
                    )}
                    Avvia fotocamera
                  </Button>
                  <Button
                    type="button"
                    onClick={() => {
                      void captureDocumentSnapshot();
                    }}
                    className="bg-cyan-500 text-slate-950 hover:bg-cyan-400"
                    disabled={!isCameraAvailable}
                  >
                    <Camera className="h-4 w-4 mr-2" />
                    Scatta foto
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => documentScannerFileInputRef.current?.click()}
                    className="border-white/20 bg-white/10 text-white hover:bg-white/20"
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    Carica immagine
                  </Button>
                  <Button
                    type="button"
                    onClick={() => {
                      void handleRunDocumentScan();
                    }}
                    disabled={isDocumentScanInProgress || !documentScanImage}
                    className="bg-white text-slate-950 hover:bg-slate-100"
                  >
                    {isDocumentScanInProgress ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <IdCard className="h-4 w-4 mr-2" />
                    )}
                    Analizza documento
                  </Button>
                </div>

                {documentScanError ? (
                  <div className="mt-4 rounded-2xl border border-amber-300/40 bg-amber-500/10 p-3 text-sm text-amber-100">
                    {documentScanError}
                  </div>
                ) : null}
              </div>

              <div className="rounded-2xl border bg-muted/40 p-4">
                <p className="text-sm font-semibold text-foreground">
                  Consigli per una scansione pulita
                </p>
                <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                  <li>Usa uno sfondo uniforme e tieni il documento intero in vista.</li>
                  <li>Evita riflessi e pieghe sul documento.</li>
                  <li>Se il testo non viene letto bene, prova con una foto piu ravvicinata.</li>
                </ul>
              </div>
            </div>

            <div className="space-y-4">
              <div className="rounded-2xl border bg-background p-4 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold">Dati riconosciuti</p>
                    <p className="text-xs text-muted-foreground">
                      Applichero solo i campi che riesco a leggere in modo affidabile.
                    </p>
                  </div>
                </div>

                {documentScanResult ? (
                  <div className="mt-4 grid grid-cols-1 gap-3 text-sm">
                    <div className="rounded-xl bg-muted/40 p-3">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">
                        Tipo documento
                      </p>
                      <p className="mt-1 font-medium">
                        {documentScanResult.documentType || "-"}
                      </p>
                    </div>
                    <div className="rounded-xl bg-muted/40 p-3">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">
                        Numero documento
                      </p>
                      <p className="mt-1 font-medium">
                        {documentScanResult.documentNumber || "-"}
                      </p>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="rounded-xl bg-muted/40 p-3">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">
                          Nome
                        </p>
                        <p className="mt-1 font-medium">
                          {documentScanResult.name || "-"}
                        </p>
                      </div>
                      <div className="rounded-xl bg-muted/40 p-3">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">
                          Cognome
                        </p>
                        <p className="mt-1 font-medium">
                          {documentScanResult.surname || "-"}
                        </p>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="rounded-xl bg-muted/40 p-3">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">
                          Data di nascita
                        </p>
                        <p className="mt-1 font-medium">
                          {documentScanResult.birthDate || "-"}
                        </p>
                      </div>
                      <div className="rounded-xl bg-muted/40 p-3">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">
                          Luogo di nascita
                        </p>
                        <p className="mt-1 font-medium">
                          {documentScanResult.birthPlace || "-"}
                        </p>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="rounded-xl bg-muted/40 p-3">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">
                          Rilascio
                        </p>
                        <p className="mt-1 font-medium">
                          {documentScanResult.documentIssue || "-"}
                        </p>
                      </div>
                      <div className="rounded-xl bg-muted/40 p-3">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">
                          Scadenza
                        </p>
                        <p className="mt-1 font-medium">
                          {documentScanResult.documentExpiry || "-"}
                        </p>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="rounded-xl bg-muted/40 p-3">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">
                          Codice fiscale
                        </p>
                        <p className="mt-1 font-medium">
                          {documentScanResult.fiscalCode || "-"}
                        </p>
                      </div>
                      <div className="rounded-xl bg-muted/40 p-3">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">
                          Nazionalita
                        </p>
                        <p className="mt-1 font-medium">
                          {documentScanResult.nationality || "-"}
                        </p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="mt-4 rounded-2xl border border-dashed p-6 text-sm text-muted-foreground">
                    Dopo l&apos;analisi vedrai qui i campi estratti dal documento.
                  </div>
                )}
              </div>

              <div className="rounded-2xl border bg-background p-4 shadow-sm">
                <Label>Testo OCR rilevato</Label>
                <Textarea
                  readOnly
                  value={documentScanResult?.rawText || ""}
                  rows={12}
                  className="mt-2 text-xs leading-relaxed"
                  placeholder="Il testo riconosciuto dal documento comparira qui."
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowDocumentScannerModal(false)}
            >
              Annulla
            </Button>
            <Button
              onClick={applyDocumentScanResult}
              disabled={!documentScanResult}
              className="bg-blue-600 hover:bg-blue-700"
            >
              Applica dati alla scheda atleta
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Document Modal */}
      <Dialog
        open={showAddDocumentModal}
        onOpenChange={setShowAddDocumentModal}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Aggiungi Documento</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>Nome Documento *</Label>
              <Input
                value={newDocument.name}
                onChange={(e) =>
                  setNewDocument({ ...newDocument, name: e.target.value })
                }
                placeholder="Es: Certificato medico"
              />
            </div>
            <div>
              <Label>Tipo Documento *</Label>
              <Select
                value={newDocument.type}
                onValueChange={(value) =>
                  setNewDocument({ ...newDocument, type: value })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleziona tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Certificato Medico">
                    Certificato Medico
                  </SelectItem>
                  <SelectItem value="Documento Identità">
                    Documento Identità
                  </SelectItem>
                  <SelectItem value="Tesserino">Tesserino</SelectItem>
                  <SelectItem value="Liberatoria">Liberatoria</SelectItem>
                  <SelectItem value="Privacy">Privacy</SelectItem>
                  <SelectItem value="Altro">Altro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>File (opzionale)</Label>
              <Input
                type="file"
                ref={fileInputRef}
                onChange={(e) =>
                  setNewDocument({
                    ...newDocument,
                    file: e.target.files?.[0] || null,
                  })
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowAddDocumentModal(false)}
            >
              Annulla
            </Button>
            <Button
              onClick={handleAddDocument}
              className="bg-blue-600 hover:bg-blue-700"
            >
              <Plus className="h-4 w-4 mr-2" />
              Aggiungi
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={showAddRegistrationModal}
        onOpenChange={setShowAddRegistrationModal}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Nuovo Tesseramento</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Federazione/Ente *</Label>
                <Select
                  value={newRegistration.federation}
                  onValueChange={(value) =>
                    setNewRegistration({
                      ...newRegistration,
                      federation: value,
                    })
                  }
                >
                  <SelectTrigger className="mt-2">
                    <SelectValue placeholder="Seleziona federazione o ente" />
                  </SelectTrigger>
                  <SelectContent>
                    {clubFederations.map((federation) => (
                      <SelectItem key={federation} value={federation}>
                        {federation}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {clubFederations.length === 0 && (
                  <p className="mt-2 text-xs text-amber-600">
                    Nessuna federazione registrata nel club. Aggiungile prima
                    nella pagina organizzazione.
                  </p>
                )}
              </div>
              <div>
                <Label>Numero Tessera</Label>
                <Input
                  value={newRegistration.number}
                  onChange={(e) =>
                    setNewRegistration({
                      ...newRegistration,
                      number: e.target.value,
                    })
                  }
                  className="mt-2"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Data Emissione</Label>
                <Input
                  type="date"
                  value={newRegistration.issueDate}
                  onChange={(e) =>
                    setNewRegistration({
                      ...newRegistration,
                      issueDate: e.target.value,
                    })
                  }
                  className="mt-2"
                />
              </div>
              <div>
                <Label>Data Scadenza</Label>
                <Input
                  type="date"
                  value={newRegistration.expiryDate}
                  onChange={(e) =>
                    setNewRegistration({
                      ...newRegistration,
                      expiryDate: e.target.value,
                    })
                  }
                  className="mt-2"
                />
              </div>
            </div>
            <div>
              <Label>Stato</Label>
              <Select
                value={newRegistration.status}
                onValueChange={(value) =>
                  setNewRegistration({
                    ...newRegistration,
                    status: value,
                  })
                }
              >
                <SelectTrigger className="mt-2">
                  <SelectValue placeholder="Seleziona stato" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="In corso">In corso</SelectItem>
                  <SelectItem value="In rinnovo">In rinnovo</SelectItem>
                  <SelectItem value="Scaduto">Scaduto</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Note</Label>
              <Textarea
                value={newRegistration.notes}
                onChange={(e) =>
                  setNewRegistration({
                    ...newRegistration,
                    notes: e.target.value,
                  })
                }
                className="mt-2"
              />
            </div>
            <div>
              <Label>Allegato</Label>
              <Input
                type="file"
                onChange={(e) =>
                  setNewRegistration({
                    ...newRegistration,
                    file: e.target.files?.[0] || null,
                  })
                }
                className="mt-2"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowAddRegistrationModal(false)}
            >
              Annulla
            </Button>
            <Button
              onClick={handleSaveRegistration}
              className="bg-blue-600 hover:bg-blue-700"
            >
              Salva Tesseramento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AddCertificateForm
        isOpen={showAddMedicalCertificateModal}
        onClose={() => setShowAddMedicalCertificateModal(false)}
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

      <AlertDialog
        open={Boolean(certificateToDelete)}
        onOpenChange={(open) => {
          if (!open && !deletingCertificateId) {
            setCertificateToDelete(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare il certificato medico?</AlertDialogTitle>
            <AlertDialogDescription>
              Il certificato verra rimosso dalla scheda sanitaria dell&apos;atleta.
              L&apos;operazione non puo essere annullata.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={Boolean(deletingCertificateId)}>
              Annulla
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              disabled={Boolean(deletingCertificateId)}
              onClick={(event) => {
                event.preventDefault();
                void deleteMedicalCertificate();
              }}
            >
              {deletingCertificateId ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : null}
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={Boolean(medicalVisitToDelete)}
        onOpenChange={(open) => {
          if (!open && !deletingMedicalVisitId) {
            setMedicalVisitToDelete(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare la visita medica?</AlertDialogTitle>
            <AlertDialogDescription>
              La visita medica verra rimossa dalla scheda dell&apos;atleta.
              L&apos;operazione non puo essere annullata.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={Boolean(deletingMedicalVisitId)}>
              Annulla
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              disabled={Boolean(deletingMedicalVisitId)}
              onClick={(event) => {
                event.preventDefault();
                if (medicalVisitToDelete?.id) {
                  void removeMedicalVisit(medicalVisitToDelete.id);
                }
              }}
            >
              {deletingMedicalVisitId ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : null}
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog
        open={showAddMedicalVisitModal}
        onOpenChange={setShowAddMedicalVisitModal}
      >
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Nuova Visita Medica</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Titolo *</Label>
                <Input
                  value={newMedicalVisit.title}
                  onChange={(e) =>
                    setNewMedicalVisit({
                      ...newMedicalVisit,
                      title: e.target.value,
                    })
                  }
                  className="mt-2"
                />
              </div>
              <div>
                <Label>Data *</Label>
                <Input
                  type="date"
                  value={newMedicalVisit.date}
                  onChange={(e) =>
                    setNewMedicalVisit({
                      ...newMedicalVisit,
                      date: e.target.value,
                    })
                  }
                  className="mt-2"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label>Tipologia</Label>
                <Select
                  value={newMedicalVisit.type}
                  onValueChange={(value) =>
                    setNewMedicalVisit({
                      ...newMedicalVisit,
                      type: value,
                    })
                  }
                >
                  <SelectTrigger className="mt-2">
                    <SelectValue placeholder="Seleziona tipologia" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Agonistica">Agonistica</SelectItem>
                    <SelectItem value="Non Agonistica">
                      Non agonistica
                    </SelectItem>
                    <SelectItem value="Controllo">Controllo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Pagamento</Label>
                <Select
                  value={newMedicalVisit.paidBy}
                  onValueChange={(value) =>
                    setNewMedicalVisit({
                      ...newMedicalVisit,
                      paidBy: value,
                    })
                  }
                >
                  <SelectTrigger className="mt-2">
                    <SelectValue placeholder="Chi paga" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="atleta">Atleta</SelectItem>
                    <SelectItem value="club">Club</SelectItem>
                    <SelectItem value="famiglia">Famiglia</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Esito</Label>
                <Input
                  value={newMedicalVisit.outcome}
                  onChange={(e) =>
                    setNewMedicalVisit({
                      ...newMedicalVisit,
                      outcome: e.target.value,
                    })
                  }
                  className="mt-2"
                  placeholder="Es. Idoneo"
                />
              </div>
            </div>
            <div>
              <Label>Luogo</Label>
              <Input
                value={newMedicalVisit.location}
                onChange={(e) =>
                  setNewMedicalVisit({
                    ...newMedicalVisit,
                    location: e.target.value,
                  })
                }
                className="mt-2"
              />
            </div>
            <div>
              <Label>Descrizione</Label>
              <Textarea
                value={newMedicalVisit.description}
                onChange={(e) =>
                  setNewMedicalVisit({
                    ...newMedicalVisit,
                    description: e.target.value,
                  })
                }
                className="mt-2"
              />
            </div>
            <div>
              <Label>Allegato Visita</Label>
              <Input
                type="file"
                onChange={(e) =>
                  setNewMedicalVisit({
                    ...newMedicalVisit,
                    file: e.target.files?.[0] || null,
                  })
                }
                className="mt-2"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowAddMedicalVisitModal(false)}
            >
              Annulla
            </Button>
            <Button
              onClick={handleSaveMedicalVisit}
              className="bg-blue-600 hover:bg-blue-700"
            >
              Salva Visita
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={showAddIdentityDocumentModal}
        onOpenChange={setShowAddIdentityDocumentModal}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Aggiungi Allegato Documento</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>Nome Documento *</Label>
              <Input
                value={newIdentityDocument.name}
                onChange={(e) =>
                  setNewIdentityDocument({
                    ...newIdentityDocument,
                    name: e.target.value,
                  })
                }
                className="mt-2"
              />
            </div>
            <div>
              <Label>Tipo</Label>
              <Input
                value={newIdentityDocument.type}
                onChange={(e) =>
                  setNewIdentityDocument({
                    ...newIdentityDocument,
                    type: e.target.value,
                  })
                }
                className="mt-2"
                placeholder="Es. Fronte carta identita"
              />
            </div>
            <div>
              <Label>Note</Label>
              <Textarea
                value={newIdentityDocument.notes}
                onChange={(e) =>
                  setNewIdentityDocument({
                    ...newIdentityDocument,
                    notes: e.target.value,
                  })
                }
                className="mt-2"
              />
            </div>
            <div>
              <Label>File *</Label>
              <Input
                type="file"
                onChange={(e) =>
                  setNewIdentityDocument({
                    ...newIdentityDocument,
                    file: e.target.files?.[0] || null,
                  })
                }
                className="mt-2"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowAddIdentityDocumentModal(false)}
            >
              Annulla
            </Button>
            <Button
              onClick={handleSaveIdentityDocument}
              className="bg-blue-600 hover:bg-blue-700"
            >
              Salva Allegato
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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

      <Dialog
        open={showAddEnrollmentDocumentModal}
        onOpenChange={setShowAddEnrollmentDocumentModal}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Aggiungi Documento Iscrizione</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>Nome Documento *</Label>
              <Input
                value={newEnrollmentDocument.name}
                onChange={(e) =>
                  setNewEnrollmentDocument({
                    ...newEnrollmentDocument,
                    name: e.target.value,
                  })
                }
                className="mt-2"
              />
            </div>
            <div>
              <Label>Tipo</Label>
              <Input
                value={newEnrollmentDocument.type}
                onChange={(e) =>
                  setNewEnrollmentDocument({
                    ...newEnrollmentDocument,
                    type: e.target.value,
                  })
                }
                className="mt-2"
                placeholder="Es. Modulo iscrizione firmato"
              />
            </div>
            <div>
              <Label>Note</Label>
              <Textarea
                value={newEnrollmentDocument.notes}
                onChange={(e) =>
                  setNewEnrollmentDocument({
                    ...newEnrollmentDocument,
                    notes: e.target.value,
                  })
                }
                className="mt-2"
              />
            </div>
            <div>
              <Label>File *</Label>
              <Input
                type="file"
                onChange={(e) =>
                  setNewEnrollmentDocument({
                    ...newEnrollmentDocument,
                    file: e.target.files?.[0] || null,
                  })
                }
                className="mt-2"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowAddEnrollmentDocumentModal(false)}
            >
              Annulla
            </Button>
            <Button
              onClick={handleSaveEnrollmentDocument}
              className="bg-blue-600 hover:bg-blue-700"
            >
              Salva Documento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add/Edit Guardian Modal */}
      <Dialog
        open={showAddGuardianModal}
        onOpenChange={setShowAddGuardianModal}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingGuardianIndex !== null
                ? "Modifica Tutore"
                : "Aggiungi Tutore"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {/*
              Un genitore ha un documento d'identita come chiunque altro, e
              trascriverlo a mano e lo stesso lavoro che si e tolto agli
              atleti, agli allenatori, allo staff e ai soci. Stesso
              componente, stesso flusso: si legge, si vede cosa e stato letto,
              si sceglie cosa applicare.
            */}
            <DocumentExtractionField
              currentValues={guardianExtractionValues}
              onApply={(patch) =>
                setNewGuardian((current: any) => ({
                  ...current,
                  ...applyExtractionToGuardian(patch),
                }))
              }
            />

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <Label>Nome *</Label>
                <CapitalizedInput
                  value={newGuardian.name}
                  onChange={(e) =>
                    setNewGuardian({ ...newGuardian, name: e.target.value })
                  }
                  onValueChange={(value) =>
                    setNewGuardian({ ...newGuardian, name: value })
                  }
                />
              </div>
              <div>
                <Label>Cognome *</Label>
                <CapitalizedInput
                  value={newGuardian.surname}
                  onChange={(e) =>
                    setNewGuardian({ ...newGuardian, surname: e.target.value })
                  }
                  onValueChange={(value) =>
                    setNewGuardian({ ...newGuardian, surname: value })
                  }
                />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <Label>Parentela</Label>
                <Select
                  value={newGuardian.relationship}
                  onValueChange={(value) =>
                    setNewGuardian({ ...newGuardian, relationship: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleziona" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Padre">Padre</SelectItem>
                    <SelectItem value="Madre">Madre</SelectItem>
                    <SelectItem value="Tutore Legale">Tutore Legale</SelectItem>
                    <SelectItem value="Nonno">Nonno</SelectItem>
                    <SelectItem value="Nonna">Nonna</SelectItem>
                    <SelectItem value="Altro">Altro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <PhoneField
                  label="Telefono"
                  value={newGuardian.phone}
                  onChange={(value) =>
                    setNewGuardian({ ...newGuardian, phone: value })
                  }
                />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <Label>Data di Nascita</Label>
                <Input
                  type="date"
                  value={newGuardian.birthDate}
                  onChange={(e) =>
                    setNewGuardian({
                      ...newGuardian,
                      birthDate: e.target.value,
                    })
                  }
                />
              </div>
              <div>
                <Label>Sesso</Label>
                <Select
                  value={newGuardian.gender}
                  onValueChange={(value) =>
                    setNewGuardian({ ...newGuardian, gender: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleziona" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="M">Maschio</SelectItem>
                    <SelectItem value="F">Femmina</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <AssistedFiscalCodeField
              id="guardian-fiscal-code"
              label="Codice Fiscale"
              value={newGuardian.fiscalCode}
              onChange={(value) =>
                setNewGuardian({ ...newGuardian, fiscalCode: value })
              }
              person={{
                firstName: newGuardian.name,
                lastName: newGuardian.surname,
                birthDate: newGuardian.birthDate,
                gender: newGuardian.gender,
              }}
              belfioreCode={newGuardian.birthPlaceCode}
              onBelfioreCodeChange={(value) =>
                setNewGuardian({ ...newGuardian, birthPlaceCode: value })
              }
              birthPlace={newGuardian.birthPlace}
              onBirthPlaceChange={(value) =>
                setNewGuardian({ ...newGuardian, birthPlace: value })
              }
            />
            <div>
              <Label>Email</Label>
              <Input
                type="email"
                value={newGuardian.email}
                onChange={(e) =>
                  setNewGuardian({ ...newGuardian, email: e.target.value })
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowAddGuardianModal(false)}
            >
              Annulla
            </Button>
            <Button
              onClick={handleAddGuardian}
              className="bg-blue-600 hover:bg-blue-700"
            >
              <Save className="h-4 w-4 mr-2" />
              {editingGuardianIndex !== null ? "Salva" : "Aggiungi"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
