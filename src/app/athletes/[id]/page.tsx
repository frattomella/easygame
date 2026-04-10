"use client";

import React, { useState, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import Sidebar from "@/components/dashboard/Sidebar";
import Header from "@/components/dashboard/Header";
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
} from "lucide-react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useToast } from "@/components/ui/toast-notification";
import {
  getLatestMedicalCertificateExpiry,
  getMedicalCertificateStatus,
} from "@/lib/medical-certificates";
import {
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
  parseScannedDocument,
  type DocumentScanResult,
} from "@/lib/document-scan";
import {
  getPrimaryAthleteCategoryMembership,
  normalizeAthleteCategoryMemberships,
} from "@/lib/athlete-category-memberships";
import { buildAthleteParticipationAnalytics } from "@/lib/athlete-participation-utils";
import {
  type AthleteAnalyticsView,
  EMPTY_ATHLETE_ANALYTICS,
  filterAthleteAnalytics,
  groupAthleteAnalyticsByType,
  normalizeAthleteAnalytics,
  normalizeAthleteProfileCollections,
  normalizeCollection,
  normalizeNullableTextValue,
  normalizeRecord,
  normalizeTextValue,
  normalizeStringList,
} from "@/lib/athlete-profile-utils";

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

const DEFAULT_CLOTHING_SIZES = {
  profile: "",
  shirtSize: "",
  pantsSize: "",
  shoeSize: "",
};

const CLOTHING_SIZE_OPTIONS = {
  BAMBINO: {
    shirt: ["3-4A", "5-6A", "7-8A", "9-10A", "11-12A", "13-14A"],
    pants: ["3-4A", "5-6A", "7-8A", "9-10A", "11-12A", "13-14A"],
    shoes: ["26", "27", "28", "29", "30", "31", "32", "33", "34", "35", "36", "37", "38", "39"],
  },
  BAMBINA: {
    shirt: ["3-4A", "5-6A", "7-8A", "9-10A", "11-12A", "13-14A"],
    pants: ["3-4A", "5-6A", "7-8A", "9-10A", "11-12A", "13-14A"],
    shoes: ["26", "27", "28", "29", "30", "31", "32", "33", "34", "35", "36", "37", "38", "39"],
  },
  UOMO: {
    shirt: ["XS", "S", "M", "L", "XL", "XXL", "3XL"],
    pants: ["XS", "S", "M", "L", "XL", "XXL", "3XL", "46", "48", "50", "52", "54", "56", "58", "60"],
    shoes: ["38", "39", "40", "41", "42", "43", "44", "45", "46", "47", "48"],
  },
  DONNA: {
    shirt: ["XXS", "XS", "S", "M", "L", "XL", "XXL"],
    pants: ["36", "38", "40", "42", "44", "46", "48", "50", "52"],
    shoes: ["35", "36", "37", "38", "39", "40", "41", "42"],
  },
} as const;

const createEmptyMedicalVisit = () => ({
  title: "",
  description: "",
  type: "Agonistica",
  paidBy: "atleta",
  location: "",
  date: "",
  outcome: "",
  file: null as File | null,
});

const createEmptyRegistration = () => ({
  federation: "",
  number: "",
  status: "In corso",
  issueDate: "",
  expiryDate: "",
  notes: "",
  file: null as File | null,
});

const createEmptyAttachment = () => ({
  name: "",
  type: "",
  notes: "",
  file: null as File | null,
});

const normalizeClubFederations = (clubData: any) => {
  const rawFederations = Array.isArray(clubData?.federations)
    ? clubData.federations
    : Array.isArray(clubData?.settings?.federations)
      ? clubData.settings.federations
      : [];

  const names = rawFederations
    .map((federation: any) =>
      typeof federation === "string"
        ? federation
        : federation?.name || federation?.title || "",
    )
    .map((name: string) => String(name || "").trim())
    .filter(Boolean);

  return [...new Set(names)];
};

const calculateAgeFromBirthDate = (birthDate?: string) => {
  if (!birthDate) {
    return 0;
  }

  const today = new Date();
  const birth = new Date(birthDate);
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();

  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age -= 1;
  }

  return age;
};

const deriveClothingProfile = (gender?: string, birthDate?: string) => {
  const normalizedGender = String(gender || "").trim().toLowerCase();
  const isFemale =
    normalizedGender === "f" ||
    normalizedGender === "femmina" ||
    normalizedGender === "female" ||
    normalizedGender === "donna";
  const age = calculateAgeFromBirthDate(birthDate);

  if (age > 0 && age < 15) {
    return isFemale ? "BAMBINA" : "BAMBINO";
  }

  return isFemale ? "DONNA" : "UOMO";
};

const buildAthleteKitBuilderComponents = (components: any[]) =>
  normalizeKitComponents(components).map((componentName, index) => ({
    id: `athlete-kit-component-${index}-${componentName.replace(/\s+/g, "-").toLowerCase()}`,
    name: componentName,
    selected: true,
    deliveryStatus: "pending",
  }));

export default function AthleteProfilePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { showToast } = useToast();
  const athleteId = params?.id as string;
  const clubId = searchParams?.get("clubId");
  const [isLoading, setIsLoading] = useState(true);
  const [athlete, setAthlete] = useState<any>(null);
  const [clubCategoryOptions, setClubCategoryOptions] = useState<any[]>([]);
  const [athleteAnalytics, setAthleteAnalytics] = useState<{
    presenceCount: number;
    convocationCount: number;
    playedMatchesCount: number;
    extraCategoryCount: number;
    events: Array<{
      id: string;
      type: "training" | "match";
      title: string;
      date: string | null;
      categoryLabel: string;
      statusLabel: string;
      context: "primary" | "secondary" | "extra";
      contextLabel: string;
      notes?: string;
    }>;
  }>(EMPTY_ATHLETE_ANALYTICS);
  const [analyticsView, setAnalyticsView] = useState<AthleteAnalyticsView>("all");
  const [analyticsSearchQuery, setAnalyticsSearchQuery] = useState("");
  const [analyticsCategoryFilter, setAnalyticsCategoryFilter] = useState("all");
  const [analyticsContextFilter, setAnalyticsContextFilter] = useState<
    "all" | "primary" | "secondary" | "extra"
  >("all");
  const [editingSection, setEditingSection] = useState<string | null>(null);
  const [editFormData, setEditFormData] = useState<any>({});
  const [guardians, setGuardians] = useState<any[]>([]);
  const [registrations, setRegistrations] = useState<any[]>([]);
  const [medicalVisits, setMedicalVisits] = useState<any[]>([]);
  const [medicalCertificates, setMedicalCertificates] = useState<any[]>([]);
  const [identityDocuments, setIdentityDocuments] = useState<any[]>([]);
  const [enrollmentDocuments, setEnrollmentDocuments] = useState<any[]>([]);
  const [documents, setDocuments] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [clothingSizes, setClothingSizes] = useState(DEFAULT_CLOTHING_SIZES);
  // ---- Numero maglia (sincronizzato con pagina Abbigliamento) ----
  const [isJerseyNumberDialogOpen, setIsJerseyNumberDialogOpen] =
    useState(false);
  const [jerseyNumberDraft, setJerseyNumberDraft] = useState<string>("");
  const [jerseyAssignments, setJerseyAssignments] = useState<any[]>([]);
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
  const [showAddIdentityDocumentModal, setShowAddIdentityDocumentModal] =
    useState(false);
  const [showAddEnrollmentDocumentModal, setShowAddEnrollmentDocumentModal] =
    useState(false);
  const [clubFederations, setClubFederations] = useState<string[]>([]);
  const [editingGuardianIndex, setEditingGuardianIndex] = useState<
    number | null
  >(null);
  const [newDocument, setNewDocument] = useState({
    name: "",
    type: "",
    file: null as File | null,
  });
  const [newGuardian, setNewGuardian] = useState({
    id: "",
    name: "",
    surname: "",
    relationship: "",
    fiscalCode: "",
    birthDate: "",
    phone: "",
    email: "",
  });
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
  const [newPayment, setNewPayment] = useState({
    date: "",
    description: "",
    type: "Quota",
    amount: "",
    status: "Pagato",
  });
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

  const blsdFileRef = useRef<HTMLInputElement>(null);
  const firstAidFileRef = useRef<HTMLInputElement>(null);
  const fireSafetyFileRef = useRef<HTMLInputElement>(null);

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
        ] = await Promise.all([
          getAthlete(athleteId),
          getAthleteCertificates(athleteId).catch(() => []),
          clubId ? getClub(clubId).catch(() => null) : Promise.resolve(null),
          clubId ? getClubCategories(clubId).catch(() => []) : Promise.resolve([]),
          clubId ? getClubTrainings(clubId).catch(() => []) : Promise.resolve([]),
          clubId
            ? getClubData(clubId, "matches").catch(() => [])
            : Promise.resolve([]),
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
        const athleteData = {
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
        const participationAnalytics = normalizeAthleteAnalytics(
          buildAthleteParticipationAnalytics({
          athleteId: athleteRecord.id,
          athlete: athleteRecord,
          trainings: normalizedTrainingRecords,
          matches: normalizedMatchRecords,
          categories: normalizedCategoryOptions,
        }),
        );

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
          enrollmentStatus: athleteData.enrollmentStatus || false,
          enrollmentNotes: normalizeTextValue(athleteData.enrollmentNotes),
          selectedPlan: normalizeTextValue(athleteData.selectedPlan),
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
        setAthleteAnalytics(participationAnalytics);

        // Draft per dialog numero maglia
        setJerseyNumberDraft(
          athleteData.jerseyNumber === null ||
            athleteData.jerseyNumber === undefined ||
            athleteData.jerseyNumber === ""
            ? ""
            : String(athleteData.jerseyNumber),
        );

        setGuardians(normalizedCollections.guardians);
        setRegistrations(normalizedCollections.registrations);
        setMedicalVisits(normalizedCollections.medicalVisits);
        setMedicalCertificates(normalizedMedicalCertificates);
        setIdentityDocuments(normalizedCollections.identityDocuments);
        setEnrollmentDocuments(normalizedCollections.enrollmentDocuments);
        setDocuments(normalizedCollections.documents);
        setPayments(normalizedCollections.payments);
        setCertificateFiles(normalizedCollections.certificateFiles);
        setClothingSizes(resolvedClothingSizes);
        setClubFederations(normalizeClubFederations(clubRecord));

        // Load payment plans and discounts from club
        try {
          const { getClubData } = await import("@/lib/simplified-db");

          // Get the club ID from the athlete record if available
          const effectiveClubId = athleteRecord.club_id || clubId;

          if (effectiveClubId) {
            const plans = await getClubData(effectiveClubId, "payment_plans");
            const clubDiscounts = await getClubData(
              effectiveClubId,
              "discounts",
            );
            const kits = await getClubData(effectiveClubId, "clothing_kits");
            const assignments = await getClubData(
              effectiveClubId,
              "kit_assignments",
            );
            const jersey = await getClubData(
              effectiveClubId,
              "jersey_assignments",
            );
            setClothingKits(
              Array.isArray(kits) ? kits.map(normalizeKitRecord) : [],
            );
            setKitAssignments(
              Array.isArray(assignments)
                ? assignments.map(normalizeKitAssignmentRecord)
                : [],
            );
            setJerseyAssignments(Array.isArray(jersey) ? jersey : []);
            setPaymentPlans(Array.isArray(plans) ? plans : []);
            setDiscounts(Array.isArray(clubDiscounts) ? clubDiscounts : []);
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
  }, [clubId, athleteId, showToast]);

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
  const analyticsGroups = React.useMemo(
    () => groupAthleteAnalyticsByType(athleteAnalytics.events),
    [athleteAnalytics.events],
  );
  const analyticsCategoryOptions = React.useMemo(
    () =>
      Array.from(
        new Set(
          athleteAnalytics.events
            .map((event) => String(event.categoryLabel || "").trim())
            .filter(Boolean),
        ),
      ).sort((left, right) =>
        left.localeCompare(right, "it", { sensitivity: "base" }),
      ),
    [athleteAnalytics.events],
  );
  const filteredAnalyticsEvents = React.useMemo(
    () =>
      filterAthleteAnalytics({
        events: athleteAnalytics.events,
        view: analyticsView,
        search: analyticsSearchQuery,
        category: analyticsCategoryFilter,
        context: analyticsContextFilter,
      }),
    [
      athleteAnalytics.events,
      analyticsCategoryFilter,
      analyticsContextFilter,
      analyticsSearchQuery,
      analyticsView,
    ],
  );
  React.useEffect(() => {
    setAnalyticsView("all");
    setAnalyticsSearchQuery("");
    setAnalyticsCategoryFilter("all");
    setAnalyticsContextFilter("all");
  }, [athleteId]);
  const editCategoryMemberships = normalizeAthleteCategoryMemberships(
    editFormData,
    clubCategoryOptions,
  );
  const primaryEditCategoryId =
    getPrimaryAthleteCategoryMembership(editCategoryMemberships, clubCategoryOptions)
      ?.categoryId || "";

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
      }));

    setEditFormData({
      ...editFormData,
      categoryMemberships: [
        {
          category_id: category.id,
          category_name: category.name,
          is_primary: true,
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
      }));

    if (enabled) {
      secondaryMemberships.push({
        category_id: category.id,
        category_name: category.name,
        is_primary: false,
      });
    }

    const nextMemberships = [
      ...(primaryMembership
        ? [
            {
              category_id: primaryMembership.categoryId,
              category_name: primaryMembership.categoryName,
              is_primary: true,
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

  const buildStoredAttachment = async (
    input: { name: string; type: string; notes?: string; file: File | null },
    fallbackType: string,
  ) => {
    const fileUrl = await fileToDataUrl(input.file);

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

  const paymentSummary = React.useMemo(() => {
    return payments.reduce(
      (summary, payment) => {
        const amount = Number(payment?.amount) || 0;
        const status = String(payment?.status || "").toLowerCase();

        summary.total += amount;

        if (status === "pagato") {
          summary.paid += amount;
        } else {
          summary.pending += amount;
        }

        return summary;
      },
      { paid: 0, pending: 0, total: 0 },
    );
  }, [payments]);

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
  const handleAddGuardian = () => {
    if (!newGuardian.name || !newGuardian.surname) {
      showToast({
        title: "Errore",
        description: "Nome e cognome sono obbligatori",
        variant: "destructive",
      });
      return;
    }

    const guardian = {
      ...newGuardian,
      id: Date.now().toString(),
    };

    if (editingGuardianIndex !== null) {
      const updatedGuardians = [...guardians];
      updatedGuardians[editingGuardianIndex] = guardian;
      setGuardians(updatedGuardians);
      setEditingGuardianIndex(null);
    } else {
      setGuardians([...guardians, guardian]);
    }

    setNewGuardian({
      id: "",
      name: "",
      surname: "",
      relationship: "",
      fiscalCode: "",
      birthDate: "",
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
    setEditingGuardianIndex(index);
    setNewGuardian(guardians[index]);
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
      phone: "",
      email: "",
    });
    setShowAddGuardianModal(true);
  };

  const removeGuardian = (id: string) => {
    setGuardians(guardians.filter((g) => g.id !== id));
  };

  const addMedicalVisit = () => {
    setNewMedicalVisit(createEmptyMedicalVisit());
    setShowAddMedicalVisitModal(true);
  };

  const removeMedicalVisit = async (id: string) => {
    try {
      const nextMedicalVisits = medicalVisits.filter((v) => v.id !== id);
      await persistAthleteCollections({
        medicalVisitsOverride: nextMedicalVisits,
      });
      setMedicalVisits(nextMedicalVisits);
      showToast("success", "Visita medica eliminata");
    } catch (error) {
      console.error("Error deleting medical visit:", error);
      showToast("error", "Impossibile eliminare la visita medica");
    }
  };

  const handleSaveMedicalVisit = async () => {
    if (!newMedicalVisit.title || !newMedicalVisit.date) {
      showToast("error", "Titolo e data della visita sono obbligatori");
      return;
    }

    try {
      const attachmentUrl = await fileToDataUrl(newMedicalVisit.file);
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
    if (!newRegistration.federation || !newRegistration.number) {
      showToast(
        "error",
        "Federazione/ente e numero di tesseramento sono obbligatori",
      );
      return;
    }

    try {
      const attachmentUrl = await fileToDataUrl(newRegistration.file);
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
    let worker: { recognize: (input: string) => Promise<any>; terminate: () => Promise<void> } | null = null;

    try {
      const { createWorker } = await import("tesseract.js");
      worker = await createWorker("ita+eng");
      const result = await worker.recognize(documentScanImage);

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
      const paymentData = {
        id:
          typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
            ? crypto.randomUUID()
            : `payment-${Date.now()}`,
        date: newPayment.date,
        description: newPayment.description,
        type: newPayment.type,
        amount: Number(amount.toFixed(2)),
        status: newPayment.status,
        createdAt: new Date().toISOString(),
      };
      const updatedPayments = [...payments, paymentData];

      await persistAthleteCollections({
        paymentsOverride: updatedPayments,
        athleteOverrides: {
          payments: updatedPayments,
        },
      });

      setPayments(updatedPayments);
      setShowAddPaymentModal(false);
      setNewPayment({
        date: new Date().toISOString().split("T")[0],
        description: "",
        type: "Quota",
        amount: "",
        status: "Pagato",
      });
      showToast("success", "Pagamento aggiunto con successo");
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
  const normalizeAssignments = React.useCallback((assignments: any[]) => {
    return (assignments || []).map((a: any) => {
      const assigneeId = a.assigneeId || a.athleteId || a.memberId || "";
      const assigneeType =
        a.assigneeType || (a.athleteId ? "athlete" : "member");
      const createdAt =
        a.createdAt || a.date || a.created_at || new Date().toISOString();
      const items = normalizeKitAssignmentItems(
        Array.isArray(a.items) && a.items.length > 0 ? a.items : a,
      );
      return { ...a, assigneeId, assigneeType, createdAt, items };
    });
  }, []);

  const athleteAssignments = React.useMemo(() => {
    const all = normalizeAssignments(kitAssignments);
    return all.filter((a: any) => a.assigneeId === athleteId);
  }, [kitAssignments, athleteId, normalizeAssignments]);
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

  const saveJerseyNumber = async () => {
    try {
      const effectiveClubId = athlete?.club_id || clubId;
      if (!effectiveClubId) throw new Error("Club non trovato");

      const cleaned = sanitizeJerseyDraft(jerseyNumberDraft);
      const nextNumber = cleaned === "" ? null : Number(cleaned);

      if (
        nextNumber !== null &&
        (Number.isNaN(nextNumber) || nextNumber < 0 || nextNumber > 999)
      ) {
        throw new Error("Numero non valido");
      }

      // Unicità: controlla sia le assegnazioni (pagina Abbigliamento) sia i dati atleti.
      const {
        getClubAthletes,
        getClubData,
        updateClubData,
        updateClubAthlete,
      } = await import("@/lib/simplified-db");

      const [clubAthletes, currentAssignments] = await Promise.all([
        getClubAthletes(effectiveClubId),
        getClubData(effectiveClubId, "jersey_assignments"),
      ]);

      const assignments = Array.isArray(currentAssignments)
        ? currentAssignments
        : [];

      if (nextNumber !== null) {
        const dupInAssignments = assignments.some(
          (x: any) =>
            x?.athleteId !== athleteId &&
            x?.number !== null &&
            x?.number !== undefined &&
            Number(x.number) === nextNumber,
        );

        const dupInAthletes = (Array.isArray(clubAthletes) ? clubAthletes : [])
          .filter((a: any) => a?.id !== athleteId)
          .some((a: any) => {
            const raw = a?.data?.jerseyNumber;
            if (raw === null || raw === undefined || raw === "") return false;
            const n = Number(raw);
            return !Number.isNaN(n) && n === nextNumber;
          });

        if (dupInAssignments || dupInAthletes) {
          showToast({
            title: "Numero già in uso",
            description: "Scegli un numero univoco per l'atleta.",
            variant: "destructive",
          });
          return;
        }
      }

      // 1) Salva su jersey_assignments (usato dalla pagina Abbigliamento)
      const now = new Date().toISOString();
      const nextAssignments = [...assignments];
      const idx = nextAssignments.findIndex(
        (x: any) => x?.athleteId === athleteId,
      );
      const entry = {
        athleteId,
        groupId: null,
        number: nextNumber,
        updatedAt: now,
      };
      if (idx >= 0) nextAssignments[idx] = entry;
      else nextAssignments.push(entry);
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
        assigneeId: athleteId,
        assigneeType: "athlete",
        kitId:
          newKitAssignment.assignmentType === "kit"
            ? newKitAssignment.kitId
            : null,
        kitName: kit?.name || null,
        assignmentType: newKitAssignment.assignmentType,
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

  if (isLoading) {
    return (
      <div className="flex h-screen bg-gray-50 dark:bg-gray-900">
        <Sidebar />
        <div className="flex flex-1 flex-col overflow-hidden">
          <Header title="Profilo Atleta" />
          <main className="flex-1 overflow-y-auto p-4 md:p-6">
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
      <div className="flex h-screen bg-gray-50 dark:bg-gray-900">
        <Sidebar />
        <div className="flex flex-1 flex-col overflow-hidden">
          <Header title="Atleta Non Trovato" />
          <main className="flex-1 overflow-y-auto p-4 md:p-6">
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
    <div className="flex h-screen bg-gray-50 dark:bg-gray-900">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header title="Profilo Atleta" />
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          <div className="mx-auto max-w-7xl space-y-6">
            {/* Header with avatar and actions */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div className="flex items-center gap-4">
                <AvatarUpload
                  currentImage={athlete.avatar}
                  onImageChange={handleAvatarChange}
                  name={`${athlete.name} ${athlete.surname || ""}`}
                  size="xl"
                  shape="square"
                  type="user"
                />
                <div>
                  <h1 className="text-2xl font-bold">
                    {athlete.name} {athlete.surname}
                  </h1>
                  <div className="flex flex-wrap items-center gap-2 mt-1">
                    {athleteCategoryMemberships.map((membership) => (
                      <Badge
                        key={`athlete-header-category-${membership.categoryId}`}
                        className={
                          membership.isPrimary
                            ? "bg-blue-500 text-white"
                            : "border border-sky-200 bg-sky-50 text-sky-700"
                        }
                      >
                        {membership.categoryName}
                        {membership.isPrimary ? " • Primaria" : " • Secondaria"}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
              <div className="flex gap-2 w-full md:w-auto">
                <Button
                  variant="outline"
                  className="flex-1 md:flex-none"
                  onClick={() => setShowDocumentScannerModal(true)}
                >
                  <Camera className="h-4 w-4 mr-2" />
                  Scansiona documento
                </Button>
                <Button
                  variant="outline"
                  className="flex-1 md:flex-none"
                  onClick={handleShareCredentials}
                >
                  <Share2 className="h-4 w-4 mr-2" />
                  Invia Credenziali
                </Button>
                <Button
                  variant="destructive"
                  className="flex-1 md:flex-none"
                  onClick={handleDeleteAthlete}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Elimina
                </Button>
              </div>
            </div>

            {/* Tabs */}
            <Tabs defaultValue="generale" className="min-w-0">
              <div className="-mx-4 overflow-x-auto px-4 pb-1 md:mx-0 md:px-0">
              <TabsList className="inline-flex h-auto min-w-max flex-nowrap items-stretch gap-1 rounded-xl bg-muted/80 p-1">
                <TabsTrigger value="generale" className="shrink-0 gap-2 whitespace-nowrap">
                  <User className="h-4 w-4 mr-2" />
                  <span className="hidden sm:inline">Generale</span>
                </TabsTrigger>
                <TabsTrigger value="contatti" className="shrink-0 gap-2 whitespace-nowrap">
                  <Phone className="h-4 w-4 mr-2" />
                  <span className="hidden sm:inline">Contatti</span>
                </TabsTrigger>
                <TabsTrigger value="sanitari" className="shrink-0 gap-2 whitespace-nowrap">
                  <Heart className="h-4 w-4 mr-2" />
                  <span className="hidden sm:inline">Dati Sanitari</span>
                </TabsTrigger>
                <TabsTrigger value="pagamenti" className="shrink-0 gap-2 whitespace-nowrap">
                  <DollarSign className="h-4 w-4 mr-2" />
                  <span className="hidden sm:inline">Iscrizione</span>
                </TabsTrigger>
                <TabsTrigger value="abbigliamento" className="shrink-0 gap-2 whitespace-nowrap">
                  <Shirt className="h-4 w-4 mr-2" />
                  <span className="hidden sm:inline">Abbigliamento</span>
                </TabsTrigger>

                <TabsTrigger value="documenti" className="shrink-0 gap-2 whitespace-nowrap">
                  <FileText className="h-4 w-4 mr-2" />
                  Documenti
                </TabsTrigger>
                <TabsTrigger value="analitiche" className="shrink-0 gap-2 whitespace-nowrap">
                  <BarChart3 className="h-4 w-4 mr-2" />
                  Analitiche
                </TabsTrigger>
              </TabsList>
              </div>

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
              <TabsContent value="sanitari" className="mt-4 space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Certificati Medici</CardTitle>
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
                            medicalCertificates.map((certificate) => (
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
                                  {certificate.fileUrl ? (
                                    <div className="flex flex-wrap gap-2">
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => {
                                          if (
                                            !openClientFileUrl(certificate.fileUrl)
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
                                            !downloadClientFileUrl(
                                              certificate.fileUrl,
                                              `certificato-${athlete.name || athleteId}-${certificate.type}`,
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
                                    </div>
                                  ) : (
                                    <span className="text-muted-foreground">-</span>
                                  )}
                                </td>
                              </tr>
                            ))
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
                                      onClick={() => removeMedicalVisit(visit.id)}
                                    >
                                      <Trash2 className="h-4 w-4" />
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
                          <div className="mt-4 pt-4 border-t space-y-3">
                            <div className="flex items-center gap-2">
                              <input
                                type="file"
                                ref={blsdFileRef}
                                className="hidden"
                                accept=".pdf,.jpg,.jpeg,.png"
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) {
                                    const reader = new FileReader();
                                    reader.onloadend = () => {
                                      setCertificateFiles({
                                        ...certificateFiles,
                                        blsd: reader.result as string,
                                      });
                                    };
                                    reader.readAsDataURL(file);
                                  }
                                }}
                              />
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => blsdFileRef.current?.click()}
                              >
                                <Upload className="h-4 w-4 mr-2" />
                                {certificateFiles.blsd
                                  ? "Sostituisci File"
                                  : "Allega File"}
                              </Button>
                              {certificateFiles.blsd && (
                                <>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() =>
                                      window.open(
                                        certificateFiles.blsd,
                                        "_blank",
                                      )
                                    }
                                  >
                                    <Eye className="h-4 w-4 mr-2" />
                                    Visualizza
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => {
                                      const link = document.createElement("a");
                                      link.href = certificateFiles.blsd;
                                      link.download = "attestato_blsd";
                                      link.click();
                                    }}
                                  >
                                    <Download className="h-4 w-4 mr-2" />
                                    Scarica
                                  </Button>
                                </>
                              )}
                            </div>
                            {certificateFiles.blsd && (
                              <p className="text-sm text-green-600 dark:text-green-400 flex items-center gap-1">
                                <CheckCircle2 className="h-4 w-4" />
                                File allegato
                              </p>
                            )}
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
                          <div className="mt-4 pt-4 border-t space-y-3">
                            <div className="flex items-center gap-2">
                              <input
                                type="file"
                                ref={firstAidFileRef}
                                className="hidden"
                                accept=".pdf,.jpg,.jpeg,.png"
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) {
                                    const reader = new FileReader();
                                    reader.onloadend = () => {
                                      setCertificateFiles({
                                        ...certificateFiles,
                                        firstAid: reader.result as string,
                                      });
                                    };
                                    reader.readAsDataURL(file);
                                  }
                                }}
                              />
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => firstAidFileRef.current?.click()}
                              >
                                <Upload className="h-4 w-4 mr-2" />
                                {certificateFiles.firstAid
                                  ? "Sostituisci File"
                                  : "Allega File"}
                              </Button>
                              {certificateFiles.firstAid && (
                                <>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() =>
                                      window.open(
                                        certificateFiles.firstAid,
                                        "_blank",
                                      )
                                    }
                                  >
                                    <Eye className="h-4 w-4 mr-2" />
                                    Visualizza
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => {
                                      const link = document.createElement("a");
                                      link.href = certificateFiles.firstAid;
                                      link.download =
                                        "attestato_primo_soccorso";
                                      link.click();
                                    }}
                                  >
                                    <Download className="h-4 w-4 mr-2" />
                                    Scarica
                                  </Button>
                                </>
                              )}
                            </div>
                            {certificateFiles.firstAid && (
                              <p className="text-sm text-green-600 dark:text-green-400 flex items-center gap-1">
                                <CheckCircle2 className="h-4 w-4" />
                                File allegato
                              </p>
                            )}
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
                          <div className="mt-4 pt-4 border-t space-y-3">
                            <div className="flex items-center gap-2">
                              <input
                                type="file"
                                ref={fireSafetyFileRef}
                                className="hidden"
                                accept=".pdf,.jpg,.jpeg,.png"
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) {
                                    const reader = new FileReader();
                                    reader.onloadend = () => {
                                      setCertificateFiles({
                                        ...certificateFiles,
                                        fireSafety: reader.result as string,
                                      });
                                    };
                                    reader.readAsDataURL(file);
                                  }
                                }}
                              />
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() =>
                                  fireSafetyFileRef.current?.click()
                                }
                              >
                                <Upload className="h-4 w-4 mr-2" />
                                {certificateFiles.fireSafety
                                  ? "Sostituisci File"
                                  : "Allega File"}
                              </Button>
                              {certificateFiles.fireSafety && (
                                <>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() =>
                                      window.open(
                                        certificateFiles.fireSafety,
                                        "_blank",
                                      )
                                    }
                                  >
                                    <Eye className="h-4 w-4 mr-2" />
                                    Visualizza
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => {
                                      const link = document.createElement("a");
                                      link.href = certificateFiles.fireSafety;
                                      link.download = "attestato_antincendio";
                                      link.click();
                                    }}
                                  >
                                    <Download className="h-4 w-4 mr-2" />
                                    Scarica
                                  </Button>
                                </>
                              )}
                            </div>
                            {certificateFiles.fireSafety && (
                              <p className="text-sm text-green-600 dark:text-green-400 flex items-center gap-1">
                                <CheckCircle2 className="h-4 w-4" />
                                File allegato
                              </p>
                            )}
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
                            onCheckedChange={(checked) =>
                              setAthlete({
                                ...athlete,
                                enrollmentStatus: checked,
                              })
                            }
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
                          value={athlete.selectedPlan || "none"}
                          onValueChange={(value) =>
                            setAthlete({
                              ...athlete,
                              selectedPlan: value === "none" ? "" : value,
                            })
                          }
                        >
                          <SelectTrigger className="mt-2">
                            <SelectValue placeholder="Seleziona un piano di pagamento" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">Nessun piano</SelectItem>
                            {paymentPlans
                              .filter((plan: any) => plan.active !== false)
                              .map((plan: any) => (
                                <SelectItem
                                  key={plan.id}
                                  value={plan.name || plan.id}
                                >
                                  {plan.name}{" "}
                                  {plan.amount ? `- €${plan.amount}` : ""}
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
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
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle>Documenti Iscrizione</CardTitle>
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
                    <CardTitle>Riepilogo Pagamenti</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
                        <h3 className="text-sm font-medium text-muted-foreground">
                          Incassato
                        </h3>
                        <p className="text-2xl font-bold text-green-600 dark:text-green-400 mt-1">
                          {formatCurrency(paymentSummary.paid)}
                        </p>
                      </div>
                      <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
                        <h3 className="text-sm font-medium text-muted-foreground">
                          Da Incassare
                        </h3>
                        <p className="text-2xl font-bold text-yellow-600 dark:text-yellow-400 mt-1">
                          {formatCurrency(paymentSummary.pending)}
                        </p>
                      </div>
                      <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                        <h3 className="text-sm font-medium text-muted-foreground">
                          Totale
                        </h3>
                        <p className="text-2xl font-bold text-blue-600 dark:text-blue-400 mt-1">
                          {formatCurrency(paymentSummary.total)}
                        </p>
                      </div>
                    </div>
                    <div className="hidden">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
                        <h3 className="text-sm font-medium text-muted-foreground">
                          Incassato
                        </h3>
                        <p className="text-2xl font-bold text-green-600 dark:text-green-400 mt-1">
                          € 0,00
                        </p>
                      </div>
                      <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
                        <h3 className="text-sm font-medium text-muted-foreground">
                          Da Incassare
                        </h3>
                        <p className="text-2xl font-bold text-yellow-600 dark:text-yellow-400 mt-1">
                          € 0,00
                        </p>
                      </div>
                      <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                        <h3 className="text-sm font-medium text-muted-foreground">
                          Totale
                        </h3>
                        <p className="text-2xl font-bold text-blue-600 dark:text-blue-400 mt-1">
                          € 0,00
                        </p>
                      </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between">
                    <div>
                      <CardTitle>Storico Pagamenti</CardTitle>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Totale registrato: {formatCurrency(paymentSummary.total)} ·
                        Pagato: {formatCurrency(paymentSummary.paid)} · Da incassare:{" "}
                        {formatCurrency(paymentSummary.pending)}
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
                          </tr>
                        </thead>
                        <tbody>
                          {payments.length > 0 ? (
                            payments.map((payment, idx) => (
                              <tr key={idx} className="border-b">
                                <td className="p-2">
                                  {formatDate(payment.date)}
                                </td>
                                <td className="p-2">{payment.description}</td>
                                <td className="p-2">{payment.type}</td>
                                <td className="p-2">€ {payment.amount}</td>
                                <td className="p-2">
                                  <Badge
                                    className={
                                      payment.status === "Pagato"
                                        ? "bg-green-500"
                                        : "bg-yellow-500"
                                    }
                                  >
                                    {payment.status}
                                  </Badge>
                                </td>
                              </tr>
                            ))
                          ) : (
                            <tr>
                              <td
                                colSpan={5}
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
                            setJerseyNumberDraft(
                              athlete?.jerseyNumber === null ||
                                athlete?.jerseyNumber === undefined
                                ? ""
                                : String(athlete.jerseyNumber),
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
                                    {athlete?.jerseyNumber === null ||
                                    athlete?.jerseyNumber === undefined
                                      ? "—"
                                      : String(athlete.jerseyNumber).slice(
                                          0,
                                          3,
                                        )}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </div>
                          <div className="p-3 text-left">
                            <p className="text-xs text-muted-foreground">
                              Clicca sulla canotta per personalizzare
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
                            <th className="text-left p-2">Kit/Prodotto</th>
                            <th className="text-left p-2">Componenti</th>
                            <th className="text-left p-2">Note</th>
                          </tr>
                        </thead>
                        <tbody>
                          {athleteAssignments.length ? (
                            athleteAssignments.map((a: any) => (
                              <tr key={a.id} className="border-b align-top">
                                <td className="p-2">
                                  {formatDate(a.createdAt)}
                                </td>
                                <td className="p-2">
                                  {a.kitName ||
                                    (a.assignmentType === "components"
                                      ? "Componenti"
                                      : "-")}
                                </td>
                                <td className="p-2">
                                  <div className="flex flex-wrap gap-2">
                                    {(a.items || []).map(
                                      (it: any, i: number) => (
                                        <Badge
                                          key={i}
                                          variant="secondary"
                                          className="text-xs"
                                        >
                                          {it.name}
                                        </Badge>
                                      ),
                                    )}
                                  </div>
                                </td>
                                <td className="p-2">{a.notes || "-"}</td>
                              </tr>
                            ))
                          ) : (
                            <tr>
                              <td
                                colSpan={4}
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
                <Card>
                  <CardHeader>
                    <CardTitle>Report e Statistiche</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
                      <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                        <h3 className="text-sm font-medium text-muted-foreground">
                          Presenze
                        </h3>
                        <p className="text-2xl font-bold text-blue-600 dark:text-blue-400 mt-1">
                          {athleteAnalytics.presenceCount}
                        </p>
                      </div>
                      <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
                        <h3 className="text-sm font-medium text-muted-foreground">
                          Convocazioni
                        </h3>
                        <p className="text-2xl font-bold text-green-600 dark:text-green-400 mt-1">
                          {athleteAnalytics.convocationCount}
                        </p>
                      </div>
                      <div className="p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
                        <h3 className="text-sm font-medium text-muted-foreground">
                          Partite Giocate
                        </h3>
                        <p className="text-2xl font-bold text-purple-600 dark:text-purple-400 mt-1">
                          {athleteAnalytics.playedMatchesCount}
                        </p>
                      </div>
                      <div className="p-4 bg-amber-50 dark:bg-amber-900/20 rounded-lg">
                        <h3 className="text-sm font-medium text-muted-foreground">
                          Eventi Fuori Categoria
                        </h3>
                        <p className="text-2xl font-bold text-amber-600 dark:text-amber-400 mt-1">
                          {athleteAnalytics.extraCategoryCount}
                        </p>
                      </div>
                    </div>
                    <div className="mt-6 space-y-4">
                      <div>
                        <h3 className="text-sm font-semibold text-slate-900">
                          Cronologia presenze e convocazioni
                        </h3>
                        <p className="mt-1 text-sm text-muted-foreground">
                          Include anche gli eventi in cui l’atleta è stato inserito fuori dalla categoria primaria.
                        </p>
                      </div>

                      {athleteAnalytics.events.length > 0 ? (
                        <div className="space-y-3">
                          <Tabs
                            value={analyticsView}
                            onValueChange={(value) =>
                              setAnalyticsView(value as AthleteAnalyticsView)
                            }
                            className="min-w-0"
                          >
                            <div className="-mx-1 overflow-x-auto px-1 pb-1">
                              <TabsList className="inline-flex h-auto min-w-max flex-nowrap gap-1 rounded-xl bg-slate-100 p-1">
                                <TabsTrigger value="all" className="shrink-0 whitespace-nowrap">
                                  Tutto ({analyticsGroups.all.length})
                                </TabsTrigger>
                                <TabsTrigger value="trainings" className="shrink-0 whitespace-nowrap">
                                  Allenamenti ({analyticsGroups.trainings.length})
                                </TabsTrigger>
                                <TabsTrigger value="matches" className="shrink-0 whitespace-nowrap">
                                  Partite ({analyticsGroups.matches.length})
                                </TabsTrigger>
                                <TabsTrigger value="presences" className="shrink-0 whitespace-nowrap">
                                  Presenze ({analyticsGroups.presences.length})
                                </TabsTrigger>
                                <TabsTrigger value="absences" className="shrink-0 whitespace-nowrap">
                                  Assenze ({analyticsGroups.absences.length})
                                </TabsTrigger>
                                <TabsTrigger value="convocations" className="shrink-0 whitespace-nowrap">
                                  Convocazioni ({analyticsGroups.convocations.length})
                                </TabsTrigger>
                              </TabsList>
                            </div>
                          </Tabs>

                          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_220px_220px]">
                            <Input
                              value={analyticsSearchQuery}
                              onChange={(event) =>
                                setAnalyticsSearchQuery(event.target.value)
                              }
                              placeholder="Cerca evento, avversario, categoria o nota..."
                            />
                            <Select
                              value={analyticsCategoryFilter}
                              onValueChange={setAnalyticsCategoryFilter}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Tutte le categorie" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="all">Tutte le categorie</SelectItem>
                                {analyticsCategoryOptions.map((categoryLabel) => (
                                  <SelectItem
                                    key={`analytics-category-${categoryLabel}`}
                                    value={categoryLabel}
                                  >
                                    {categoryLabel}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Select
                              value={analyticsContextFilter}
                              onValueChange={(value) =>
                                setAnalyticsContextFilter(
                                  value as "all" | "primary" | "secondary" | "extra",
                                )
                              }
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Tutti i contesti" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="all">Tutti i contesti</SelectItem>
                                <SelectItem value="primary">Categoria primaria</SelectItem>
                                <SelectItem value="secondary">Categoria secondaria</SelectItem>
                                <SelectItem value="extra">Extra categoria</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>

                          <p className="text-xs text-muted-foreground">
                            {filteredAnalyticsEvents.length} eventi trovati.
                          </p>

                          {filteredAnalyticsEvents.length > 0 ? (
                          filteredAnalyticsEvents.map((event) => (
                            <div
                              key={event.id}
                              className="rounded-xl border border-slate-200 bg-white p-4"
                            >
                              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                <div>
                                  <div className="flex flex-wrap items-center gap-2">
                                    <p className="font-medium text-slate-900">
                                      {event.title}
                                    </p>
                                    <Badge
                                      variant="outline"
                                      className={
                                        event.context === "extra"
                                          ? "border-amber-200 bg-amber-50 text-amber-800"
                                          : event.context === "secondary"
                                            ? "border-sky-200 bg-sky-50 text-sky-800"
                                            : "border-emerald-200 bg-emerald-50 text-emerald-700"
                                      }
                                    >
                                      {event.contextLabel}
                                    </Badge>
                                  </div>
                                  <p className="mt-1 text-sm text-muted-foreground">
                                    {event.type === "training" ? "Allenamento" : "Partita"} • {event.categoryLabel}
                                  </p>
                                  {event.notes ? (
                                    <p className="mt-2 text-sm text-slate-600">
                                      Note: {event.notes}
                                    </p>
                                  ) : null}
                                </div>
                                <div className="text-sm text-slate-500 sm:text-right">
                                  <p>{event.statusLabel}</p>
                                  <p>
                                    {event.date
                                      ? new Date(event.date).toLocaleDateString("it-IT", {
                                          year: "numeric",
                                          month: "short",
                                          day: "numeric",
                                        })
                                      : "Data non disponibile"}
                                  </p>
                                </div>
                              </div>
                            </div>
                          ))
                          ) : (
                            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-muted-foreground">
                              Nessun evento corrisponde ai filtri selezionati.
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-muted-foreground">
                          Nessuna presenza o convocazione registrata per questo atleta.
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
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
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Nome</Label>
                    <Input
                      value={editFormData.name || ""}
                      onChange={(e) =>
                        setEditFormData({
                          ...editFormData,
                          name: e.target.value,
                        })
                      }
                    />
                  </div>
                  <div>
                    <Label>Cognome</Label>
                    <Input
                      value={editFormData.surname || ""}
                      onChange={(e) =>
                        setEditFormData({
                          ...editFormData,
                          surname: e.target.value,
                        })
                      }
                    />
                  </div>
                </div>
                <div>
                  <Label>Codice Fiscale</Label>
                  <Input
                    value={editFormData.fiscalCode || ""}
                    onChange={(e) =>
                      setEditFormData({
                        ...editFormData,
                        fiscalCode: e.target.value,
                      })
                    }
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
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
                    <Input
                      value={editFormData.nationality || ""}
                      onChange={(e) =>
                        setEditFormData({
                          ...editFormData,
                          nationality: e.target.value,
                        })
                      }
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Luogo di Nascita</Label>
                    <Input
                      value={editFormData.birthPlace || ""}
                      onChange={(e) =>
                        setEditFormData({
                          ...editFormData,
                          birthPlace: e.target.value,
                        })
                      }
                    />
                  </div>
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
                <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/70 p-4">
                  <div>
                    <Label>Categoria primaria</Label>
                    <select
                      value={primaryEditCategoryId}
                      onChange={(event) =>
                        handlePrimaryCategoryChange(event.target.value)
                      }
                      className="mt-2 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    >
                      <option value="">Seleziona categoria primaria</option>
                      {clubCategoryOptions.map((category) => (
                        <option key={`athlete-primary-category-${category.id}`} value={category.id}>
                          {category.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label>Categorie secondarie</Label>
                    {clubCategoryOptions.length > 0 ? (
                      <div className="grid gap-2 sm:grid-cols-2">
                        {clubCategoryOptions.map((category) => {
                          const isPrimary = primaryEditCategoryId === category.id;
                          const isSelected = editCategoryMemberships.some(
                            (membership) =>
                              membership.categoryId === category.id &&
                              !membership.isPrimary,
                          );

                          return (
                            <label
                              key={`athlete-secondary-category-${category.id}`}
                              className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm ${isPrimary ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400" : "cursor-pointer border-slate-200 bg-white"}`}
                            >
                              <Checkbox
                                checked={isSelected}
                                disabled={isPrimary}
                                onCheckedChange={(checked) =>
                                  handleToggleSecondaryCategory(
                                    category.id,
                                    Boolean(checked),
                                  )
                                }
                              />
                              <span>{category.name}</span>
                            </label>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        Nessuna categoria disponibile per il club.
                      </p>
                    )}
                  </div>
                </div>
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
                  <Label>Telefono</Label>
                  <Input
                    value={editFormData.phone || ""}
                    onChange={(e) =>
                      setEditFormData({
                        ...editFormData,
                        phone: e.target.value,
                      })
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
                <div className="grid grid-cols-3 gap-4">
                  <div className="col-span-2">
                    <Label>Indirizzo</Label>
                    <Input
                      value={editFormData.address || ""}
                      onChange={(e) =>
                        setEditFormData({
                          ...editFormData,
                          address: e.target.value,
                        })
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
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Comune</Label>
                    <Input
                      value={editFormData.city || ""}
                      onChange={(e) =>
                        setEditFormData({
                          ...editFormData,
                          city: e.target.value,
                        })
                      }
                    />
                  </div>
                  <div>
                    <Label>CAP</Label>
                    <Input
                      value={editFormData.postalCode || ""}
                      onChange={(e) =>
                        setEditFormData({
                          ...editFormData,
                          postalCode: e.target.value,
                        })
                      }
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Regione</Label>
                    <Input
                      value={editFormData.region || ""}
                      onChange={(e) =>
                        setEditFormData({
                          ...editFormData,
                          region: e.target.value,
                        })
                      }
                    />
                  </div>
                  <div>
                    <Label>Provincia</Label>
                    <Input
                      value={editFormData.province || ""}
                      onChange={(e) =>
                        setEditFormData({
                          ...editFormData,
                          province: e.target.value,
                        })
                      }
                    />
                  </div>
                </div>
                <div>
                  <Label>Paese</Label>
                  <Input
                    value={editFormData.country || ""}
                    onChange={(e) =>
                      setEditFormData({
                        ...editFormData,
                        country: e.target.value,
                      })
                    }
                  />
                </div>
              </>
            )}

            {editingSection === "medical" && (
              <>
                <div className="grid grid-cols-2 gap-4">
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
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Contatto di Emergenza</Label>
                    <Input
                      value={editFormData.emergencyContact || ""}
                      onChange={(e) =>
                        setEditFormData({
                          ...editFormData,
                          emergencyContact: e.target.value,
                        })
                      }
                    />
                  </div>
                  <div>
                    <Label>Telefono di Emergenza</Label>
                    <Input
                      value={editFormData.emergencyPhone || ""}
                      onChange={(e) =>
                        setEditFormData({
                          ...editFormData,
                          emergencyPhone: e.target.value,
                        })
                      }
                    />
                  </div>
                </div>
              </>
            )}

            {editingSection === "identity" && (
              <>
                <div className="grid grid-cols-2 gap-4">
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
                          Carta d'identità
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
                <div className="grid grid-cols-2 gap-4">
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
            setJerseyNumberDraft(
              athlete?.jerseyNumber === null ||
                athlete?.jerseyNumber === undefined
                ? ""
                : String(athlete.jerseyNumber),
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
              <Label>Numero (max 3 cifre)</Label>
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
                className="mt-2"
              />
              <p className="mt-2 text-xs text-muted-foreground">
                Il numero viene sincronizzato con la pagina Abbigliamento e deve
                essere univoco.
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
              className="bg-blue-600 hover:bg-blue-700"
            >
              <Save className="h-4 w-4 mr-2" />
              Salva
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Payment Modal */}
      <Dialog open={showAddPaymentModal} onOpenChange={setShowAddPaymentModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Aggiungi Pagamento</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>Data *</Label>
              <Input
                type="date"
                value={newPayment.date}
                onChange={(e) =>
                  setNewPayment({ ...newPayment, date: e.target.value })
                }
              />
            </div>
            <div>
              <Label>Descrizione *</Label>
              <Input
                value={newPayment.description}
                onChange={(e) =>
                  setNewPayment({ ...newPayment, description: e.target.value })
                }
                placeholder="Es: Quota mensile Gennaio"
              />
            </div>
            <div>
              <Label>Tipo *</Label>
              <Select
                value={newPayment.type}
                onValueChange={(value) =>
                  setNewPayment({ ...newPayment, type: value })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleziona tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Quota">Quota</SelectItem>
                  <SelectItem value="Iscrizione">Iscrizione</SelectItem>
                  <SelectItem value="Abbigliamento">Abbigliamento</SelectItem>
                  <SelectItem value="Trasferta">Trasferta</SelectItem>
                  <SelectItem value="Altro">Altro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Importo (€) *</Label>
              <Input
                type="number"
                step="0.01"
                value={newPayment.amount}
                onChange={(e) =>
                  setNewPayment({ ...newPayment, amount: e.target.value })
                }
                placeholder="0.00"
              />
            </div>
            <div>
              <Label>Stato *</Label>
              <Select
                value={newPayment.status}
                onValueChange={(value) =>
                  setNewPayment({ ...newPayment, status: value })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleziona stato" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Pagato">Pagato</SelectItem>
                  <SelectItem value="In attesa">In attesa</SelectItem>
                  <SelectItem value="Scaduto">Scaduto</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowAddPaymentModal(false)}
            >
              Annulla
            </Button>
            <Button
              onClick={handleSavePayment}
              className="bg-blue-600 hover:bg-blue-700"
            >
              <Plus className="h-4 w-4 mr-2" />
              Aggiungi
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
                    Dopo l'analisi vedrai qui i campi estratti dal documento.
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
                <Label>Numero Tessera *</Label>
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
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Nome *</Label>
                <Input
                  value={newGuardian.name}
                  onChange={(e) =>
                    setNewGuardian({ ...newGuardian, name: e.target.value })
                  }
                />
              </div>
              <div>
                <Label>Cognome *</Label>
                <Input
                  value={newGuardian.surname}
                  onChange={(e) =>
                    setNewGuardian({ ...newGuardian, surname: e.target.value })
                  }
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
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
                <Label>Codice Fiscale</Label>
                <Input
                  value={newGuardian.fiscalCode}
                  onChange={(e) =>
                    setNewGuardian({
                      ...newGuardian,
                      fiscalCode: e.target.value,
                    })
                  }
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
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
                <Label>Telefono</Label>
                <Input
                  value={newGuardian.phone}
                  onChange={(e) =>
                    setNewGuardian({ ...newGuardian, phone: e.target.value })
                  }
                />
              </div>
            </div>
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
