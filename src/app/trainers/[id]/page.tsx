"use client";

import React, { useState, useEffect } from "react";
import Sidebar from "@/components/dashboard/Sidebar";
import Header from "@/components/dashboard/Header";
import {
  DashboardPageContainer,
  dashboardMainClassName,
} from "@/components/dashboard/dashboard-page-container";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { AvatarUpload } from "@/components/ui/avatar-upload";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Calendar,
  Clock,
  MapPin,
  Mail,
  Phone,
  User,
  CalendarDays,
  Edit,
  Trash2,
  DollarSign,
  MessageSquare,
  FileText,
  CheckCircle,
  X,
  Plus,
  Search,
  ArrowLeft,
  CreditCard,
  Shield,
  Activity,
  AlertCircle,
  Heart,
  Briefcase,
  GraduationCap,
  Globe,
  IdCard,
  Download,
  Eye,
  Award,
  Copy,
  ChevronDown,
  ChevronRight,
  KeyRound,
  Link2,
  Loader2,
  RefreshCw,
  Shirt,
  Unlink2,
} from "lucide-react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useToast } from "@/components/ui/toast-notification";
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
import { AddTrainerPaymentForm } from "@/components/forms/AddTrainerPaymentForm";
import { supabase } from "@/lib/supabase";
import { apiRequest } from "@/lib/api/client";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { CertificateAttachmentField } from "@/components/forms/certificate-attachment-field";
import { TrainerDocumentsPanel } from "@/components/trainer/trainer-documents-panel";
import {
  getTrainerDocumentsFromRecord,
  type TrainerDocument,
} from "@/lib/trainer-documents";
import { buildAttachmentFileName } from "@/lib/attachment-names";
import { CapitalizedInput } from "@/components/forms/capitalized-input";
import { PhoneField } from "@/components/forms/phone-field";
import {
  AssistedFiscalCodeField,
  PersonResidenceFields,
} from "@/components/forms/assisted-anagrafica";
import { paymentDateOf, sortByDateDesc } from "@/lib/sorting";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DEFAULT_MEDICAL_VISIT_TYPE,
  medicalVisitTypeOptions,
  normalizeMedicalVisitType,
} from "@/lib/medical-visits";
import {
  deleteStaffMember,
  updateStaffMember,
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
import {
  buildCategoryGroups,
  compareCategoryGroups,
  normalizeClubSites,
  type CategoryGroup,
} from "@/lib/club-sites";
import {
  ClothingSizesFields,
  ClothingSizesSummary,
} from "@/components/forms/clothing-sizes-fields";
import { normalizeGenderLetter } from "@/lib/italian-registry";

const TOKEN_EXPIRY_HOURS = 72;

const createTrainerAccessToken = () => {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const randomBytes = new Uint32Array(9);

  if (typeof window !== "undefined" && window.crypto?.getRandomValues) {
    window.crypto.getRandomValues(randomBytes);
  } else {
    for (let index = 0; index < randomBytes.length; index += 1) {
      randomBytes[index] = Math.floor(Math.random() * alphabet.length);
    }
  }

  return `TRN${Array.from(randomBytes, (value) => alphabet[value % alphabet.length]).join("")}`;
};

const formatTrainerAccessToken = (value?: string | null) => {
  const normalized = String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/-/g, "");

  if (!normalized) {
    return "-";
  }

  return normalized.match(/.{1,4}/g)?.join("-") || normalized;
};

const getTrainerAccessStatusMeta = (trainer: any) => {
  const expiresAt = trainer?.accessTokenExpiresAt
    ? new Date(trainer.accessTokenExpiresAt)
    : null;
  const hasExpiry = Boolean(expiresAt && !Number.isNaN(expiresAt.getTime()));
  const isExpired = Boolean(hasExpiry && expiresAt && expiresAt.getTime() < Date.now());
  const status = String(trainer?.accessTokenStatus || "").trim().toLowerCase();

  if (trainer?.linkedUserId) {
    return {
      label: "Account collegato",
      className:
        "border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-50",
      description: "Questo allenatore ha gia collegato il proprio account EasyGame al club.",
    };
  }

  if (status === "revoked" || status === "unlinked" || status === "disconnected") {
    return {
      label: "Scollegato",
      className:
        "border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-50",
      description:
        "Il collegamento precedente e stato revocato dal club. Per consentire un nuovo accesso genera un altro token.",
    };
  }

  if (status === "redeemed") {
    return {
      label: "Token usato",
      className:
        "border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-50",
      description: "Il token e stato gia riscattato e l'accesso e attivo.",
    };
  }

  if ((status === "expired" || isExpired) && trainer?.accessTokenRecordId) {
    return {
      label: "Token scaduto",
      className:
        "border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-50",
      description: "Rigenera un nuovo token se l'allenatore deve ancora collegare il suo account.",
    };
  }

  if (trainer?.accessTokenValue && trainer?.accessTokenRecordId) {
    return {
      label: "Token attivo",
      className:
        "border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-50",
      description:
        "Condividi questo token temporaneo all'allenatore: dovra inserirlo nella home account, sezione accessi.",
    };
  }

  return {
    label: "Non collegato",
    className:
      "border border-slate-200 bg-slate-100 text-slate-700 hover:bg-slate-100",
    description:
      "Genera un token temporaneo da condividere all'allenatore dopo la creazione del suo account EasyGame.",
  };
};

export default function TrainerDetailsPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { showToast } = useToast();
  const trainerId = params?.id as string;
  const clubIdFromParams = searchParams?.get("clubId");
  const [clubId, setClubId] = useState<string | null>(clubIdFromParams || null);
  const [searchValue, setSearchValue] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [categories, setCategories] = useState<any[]>([]);
  const [categoryGroups, setCategoryGroups] = useState<CategoryGroup[]>([]);

  // Expand trainer data structure to include all fields
  const [trainer, setTrainer] = React.useState<any>(null);

  /*
    I documenti dell'allenatore stanno **dentro** il suo record e i byte in
    Attachment Core: vedi src/lib/trainer-documents.ts per il perche di questa
    scelta e per i tre posti diversi in cui finivano prima.
  */
  const [trainerDocuments, setTrainerDocuments] = useState<TrainerDocument[]>(
    [],
  );
  /**
   * Visita medica: tipologia, scadenza e certificato.
   *
   * Prima erano tre cose scollegate — due campi di sola lettura che nessun
   * form impostava e un file in uno stato React mai salvato. Ora sono uno
   * stato solo, che si carica dal record e si riscrive nel record.
   */
  const [medicalVisit, setMedicalVisit] = useState<{
    type: string;
    expiry: string;
    file: string | null;
  }>({ type: DEFAULT_MEDICAL_VISIT_TYPE, expiry: "", file: null });
  const [certificateFiles, setCertificateFiles] = useState<{[key: string]: string}>({});

  // Add state for edit modals
  const [editingSection, setEditingSection] = useState<string | null>(null);
  const [editFormData, setEditFormData] = useState<any>({});

  // Get clubId from localStorage if not in URL params
  useEffect(() => {
    if (!clubIdFromParams && typeof window !== "undefined") {
      const storedClub = localStorage.getItem("activeClub");
      if (storedClub) {
        try {
          const parsed = JSON.parse(storedClub);
          if (parsed?.id) {
            setClubId(parsed.id);
          }
        } catch (e) {
          console.error("Error parsing activeClub from localStorage", e);
        }
      }
    }
  }, [clubIdFromParams]);

  // Fetch trainer data from database
  useEffect(() => {
    const fetchTrainerData = async () => {
      // Validate clubId - check if it's null, "null", or empty
      if (!clubId || clubId === "null" || clubId.trim() === "") {
        // Don't show error immediately, wait for localStorage check
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
        console.log("Fetching club data for clubId:", clubId);
        
        // Fetch club data - removed trainer_payments from select
        const { data: clubData, error: clubError } = await supabase
          .from("clubs")
          .select("categories, trainers, staff_members, club_sites, category_groups")
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

        console.log("Club data loaded successfully:", clubData);

        // Set payment pin

        // Set categories
        const clubCategories = clubData?.categories || [];
        setCategories(clubCategories);
        setCategoryGroups(
          buildCategoryGroups({
            categories: clubCategories,
            sites: normalizeClubSites(clubData?.club_sites),
            groups: clubData?.category_groups,
          }),
        );

        // Look for trainer in multiple places
        let trainerData = null;

        // First check trainers array
        if (clubData?.trainers && Array.isArray(clubData.trainers)) {
          trainerData = clubData.trainers.find(
            (trainer: any) => trainer.id === trainerId,
          );
        }

        // If not found in trainers array, check staff_members array
        if (
          !trainerData &&
          clubData?.staff_members &&
          Array.isArray(clubData.staff_members)
        ) {
          trainerData = clubData.staff_members.find(
            (staff: any) =>
              staff.id === trainerId &&
              (staff.role === "trainer" || staff.role === "allenatore"),
          );
        }

        if (!trainerData) {
          console.error("Trainer not found in club data. TrainerId:", trainerId);
          console.log("Available trainers:", clubData?.trainers);
          console.log("Available staff members:", clubData?.staff_members);
          showToast("error", "Allenatore non trovato");
          setIsLoading(false);
          return;
        }

        // Map categories for this trainer
        const trainerCategories = normalizeTrainerCategories(
          trainerData.categories,
          clubCategories,
        );

        if (trainerData) {
          setTrainer({
            id: trainerData.id,
            // Anagrafica
            name: getTrainerDisplayName(trainerData),
            surname:
              trainerData.surname ||
              trainerData.lastName ||
              trainerData.last_name ||
              "",
            age: trainerData.age || "",
            birthDate: trainerData.birthDate || "",
            nationality: trainerData.nationality || "Italiana",
            birthPlace: trainerData.birthPlace || "",
            gender: trainerData.gender || "",
            education: trainerData.education || "",
            notes: trainerData.notes || "",
            
            // Documento di identità
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
            isMember: trainerData.isMember || false,
            membershipNumber: trainerData.membershipNumber || "",
            membershipDate: trainerData.membershipDate || "",
            
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
            
            // Existing fields
            /*
              La data di inizio si e sempre chiamata in due modi.

              Il form di creazione scriveva `hireDate` **e** `startDate`, la
              scheda leggeva solo `hireDate` e la modifica salvava solo
              `startDate`: cambiare la data di inizio sembrava funzionare e
              tornava indietro al refresh successivo. Si legge la prima delle
              due che c'e, e si scrivono entrambe (Blocco 7).
            */
            startDate: trainerData.startDate || trainerData.hireDate || "",
            bio: trainerData.bio || "Allenatore professionista",
            avatar: trainerData.avatar || null,
            categories: trainerCategories,
            fiscalCode: trainerData.fiscalCode || "",
            accessTokenValue:
              trainerData.accessTokenValue ||
              trainerData.access_token_value ||
              trainerData.token ||
              "",
            accessTokenRecordId:
              trainerData.accessTokenRecordId ||
              trainerData.access_token_record_id ||
              null,
            accessTokenStatus:
              trainerData.accessTokenStatus ||
              trainerData.access_token_status ||
              (trainerData.linkedUserId || trainerData.linked_user_id
                ? "linked"
                : ""),
            accessTokenExpiresAt:
              trainerData.accessTokenExpiresAt ||
              trainerData.access_token_expires_at ||
              null,
            accessTokenGeneratedAt:
              trainerData.accessTokenGeneratedAt ||
              trainerData.access_token_generated_at ||
              null,
            accessTokenRedeemedAt:
              trainerData.accessTokenRedeemedAt ||
              trainerData.access_token_redeemed_at ||
              null,
            linkedUserId:
              trainerData.linkedUserId || trainerData.linked_user_id || null,
            linkedUserEmail:
              trainerData.linkedUserEmail ||
              trainerData.linked_user_email ||
              "",
            linkedAt: trainerData.linkedAt || trainerData.linked_at || null,
          });

          // Load trainer payments from trainerData if available
          /*
            Compensi e contratti sono eventi nel tempo: si leggono dall'ultimo.

            Comparivano nell'ordine in cui erano stati scritti nel JSON — cioe
            di inserimento, che per una segreteria non significa niente
            (Blocco 7, punto 16).
          */
          const trainerPayments = sortByDateDesc(
            trainerData.payments || [],
            paymentDateOf,
          );
          setPayments(trainerPayments);
          
          setTrainerDocuments(getTrainerDocumentsFromRecord(trainerData));

          // Load certificate files from trainerData if available
          const trainerCertificateFiles = trainerData.certificateFiles || {};
          setCertificateFiles(trainerCertificateFiles);
          // Il certificato non veniva **mai** riletto dal record: chi lo
          // caricava lo vedeva sparire al refresh successivo.
          setMedicalVisit({
            type: normalizeMedicalVisitType(trainerData.medicalVisitType),
            expiry: trainerData.medicalVisitExpiry || "",
            file: trainerData.medicalVisitFile || null,
          });
        }
      } catch (error) {
        console.error("Error fetching trainer data:", error);
        showToast("error", "Errore nel caricamento dei dati dell'allenatore");
      } finally {
        setIsLoading(false);
      }
    };

    fetchTrainerData();
  }, [clubId, trainerId, showToast]);

  /*
    Il compenso non e piu nascosto dietro un PIN (Blocco 7, punto 17).

    Chi puo aprire la scheda di un allenatore ha gia accesso ai suoi dati
    economici: e la matrice permessi a decidere chi entra nell'area, non un
    codice di quattro cifre uguale per tutto il club e con valore predefinito
    `1234`. Restava un gesto in piu, non una protezione.
  */
  const [showAddPaymentModal, setShowAddPaymentModal] = useState(false);
  const [showDeletePaymentDialog, setShowDeletePaymentDialog] = useState(false);
  const [showChangeStatusDialog, setShowChangeStatusDialog] = useState(false);
  const [isTrainerAccessOpen, setIsTrainerAccessOpen] = useState(false);
  const [isGeneratingAccessToken, setIsGeneratingAccessToken] = useState(false);
  const [isLoadingAccessData, setIsLoadingAccessData] = useState(false);
  const [isDisconnectingAccess, setIsDisconnectingAccess] = useState(false);
  const [showDisconnectAccessDialog, setShowDisconnectAccessDialog] =
    useState(false);
  const [linkedAccountDetails, setLinkedAccountDetails] = useState<any | null>(
    null,
  );
  const [linkedMembershipDetails, setLinkedMembershipDetails] = useState<any | null>(
    null,
  );
  const [tokenDetails, setTokenDetails] = useState<any | null>(null);
  const [selectedPaymentId, setSelectedPaymentId] = useState<string | null>(
    null,
  );

  // Real data for training sessions and payments - initially empty, will be loaded from database
  const [trainingSessions, setTrainingSessions] = React.useState<any[]>([]);
  const [payments, setPayments] = React.useState<any[]>([]);
  const [messages, setMessages] = React.useState<any[]>([]);
  const [newMessage, setNewMessage] = React.useState("");

  // Filter payments based on search value
  // Il filtro non deve poter cambiare l'ordine: si riordina anche qui.
  const filteredPayments = sortByDateDesc(
    payments.filter((payment) =>
      String(payment?.month || "").toLowerCase().includes(searchValue.toLowerCase()),
    ),
    paymentDateOf,
  );

  // Calculate attendance statistics
  const calculateAttendanceStats = () => {
    const total = trainingSessions.length;
    const present = trainingSessions.filter(s => s.attendance === 'present').length;
    const absent = trainingSessions.filter(s => s.attendance === 'absent').length;
    const noResponse = trainingSessions.filter(s => s.attendance === 'no-response').length;
    const percentage = total > 0 ? ((present / total) * 100).toFixed(1) : "0";
    
    return { total, present, absent, noResponse, percentage };
  };

  const attendanceStats = calculateAttendanceStats();
  const trainerHeaderName = React.useMemo(() => {
    if (!trainer) {
      return "";
    }

    const fullName = String(trainer.name || "").trim();
    const surname = String(trainer.surname || "").trim();

    if (!surname) {
      return fullName;
    }

    return fullName.toLowerCase().endsWith(surname.toLowerCase())
      ? fullName
      : `${fullName} ${surname}`.trim();
  }, [trainer]);
  const trainerAccessStatus = React.useMemo(
    () => getTrainerAccessStatusMeta(trainer),
    [trainer],
  );
  const linkedAccountDisplayName = React.useMemo(() => {
    const metadata = linkedAccountDetails?.user_metadata || {};
    const fullName = [
      metadata.firstName,
      metadata.lastName,
    ]
      .filter(Boolean)
      .join(" ")
      .trim();

    return (
      fullName ||
      String(metadata.name || "").trim() ||
      String(linkedAccountDetails?.email || trainer?.linkedUserEmail || "").trim() ||
      "-"
    );
  }, [linkedAccountDetails, trainer?.linkedUserEmail]);
  const linkedAccountPhone = React.useMemo(() => {
    const metadata = linkedAccountDetails?.user_metadata || {};
    return (
      String(linkedAccountDetails?.phone || metadata.phone || "").trim() || "-"
    );
  }, [linkedAccountDetails]);
  const accessTokenStatusLabel = React.useMemo(
    () => String(tokenDetails?.status || trainer?.accessTokenStatus || "-").trim() || "-",
    [tokenDetails?.status, trainer?.accessTokenStatus],
  );
  const accessTokenExpiryValue =
    tokenDetails?.expires_at ||
    tokenDetails?.date ||
    trainer?.accessTokenExpiresAt ||
    null;

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
      const headers = {
        "x-active-club-id": clubId,
      };

      let nextTokenDetails: any | null = null;
      let nextAccountDetails: any | null = null;
      let nextMembershipDetails: any | null = null;

      if (currentTrainer.accessTokenRecordId) {
        const tokenResponse = await apiRequest<any>(
          `/api/v1/access_tokens/${currentTrainer.accessTokenRecordId}`,
          {
            method: "GET",
            headers,
          },
        );

        if (!tokenResponse.error) {
          nextTokenDetails = tokenResponse.data;
        }
      }

      if (currentTrainer.linkedUserId) {
        const [userResponse, membershipResponse] = await Promise.all([
          apiRequest<any>(`/api/v1/users/${currentTrainer.linkedUserId}`, {
            method: "GET",
            headers,
          }),
          apiRequest<any[]>(
            `/api/v1/organization_users?organization_id=${encodeURIComponent(clubId)}&user_id=${encodeURIComponent(currentTrainer.linkedUserId)}&role=trainer`,
            {
              method: "GET",
              headers,
            },
          ),
        ]);

        if (!userResponse.error) {
          nextAccountDetails = userResponse.data;
        }

        if (!membershipResponse.error) {
          nextMembershipDetails = Array.isArray(membershipResponse.data)
            ? membershipResponse.data[0] || null
            : null;
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
  }, [clubId, trainer?.accessTokenRecordId, trainer?.linkedUserId]);

  /**
   * Le squadre a cui si puo assegnare un allenatore.
   *
   * Solo quelle di categorie che hanno **piu** di una squadra: dove la
   * categoria coincide con la squadra, spuntarla due volte non aggiunge
   * niente (ADR-0055).
   */
  const assignableGroups = React.useMemo(() => {
    const counts = new Map<string, number>();
    categoryGroups.forEach((group) => {
      if (!group.active) return;
      counts.set(group.categoryId, (counts.get(group.categoryId) || 0) + 1);
    });

    return categoryGroups
      .filter(
        (group) => group.active && (counts.get(group.categoryId) || 0) > 1,
      )
      .sort(compareCategoryGroups);
  }, [categoryGroups]);

  // Add function to open edit modal for specific section
  const handleEditSection = (section: string) => {
    setEditingSection(section);
    setEditFormData({
      ...trainer,
      categoryIds: getTrainerCategoryIds(trainer?.categories, categories),
      groupIds: getTrainerGroupIds(trainer),
    });
  };

  const updateTrainerRecord = async (updates: Record<string, any>) => {
    if (!clubId || !trainerId) {
      throw new Error("Allenatore non valido");
    }

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

    const hasActiveToken =
      Boolean(trainer.accessTokenValue) &&
      String(trainer.accessTokenStatus || "").toLowerCase() !== "expired" &&
      !trainer.linkedUserId;

    if (
      hasActiveToken &&
      !window.confirm(
        "Esiste gia un token attivo per questo allenatore. Vuoi rigenerarlo e invalidare quello precedente?",
      )
    ) {
      return;
    }

    setIsGeneratingAccessToken(true);

    try {
      const nowIso = new Date().toISOString();
      const expiresAt = new Date(
        Date.now() + TOKEN_EXPIRY_HOURS * 60 * 60 * 1000,
      ).toISOString();
      const tokenValue = createTrainerAccessToken();
      const headers = {
        "x-active-club-id": clubId,
      };

      if (trainer.accessTokenRecordId) {
        const expireResponse = await apiRequest(
          `/api/v1/access_tokens/${trainer.accessTokenRecordId}`,
          {
            method: "PATCH",
            headers,
            body: {
              status: "expired",
              date: nowIso,
              expired_at: nowIso,
              superseded_at: nowIso,
              superseded_by_trainer_id: trainerId,
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
        throw new Error(
          createResponse.error?.message || "Errore nella generazione del token",
        );
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
      const nextTrainerState = {
        ...(trainer || {}),
        ...accessState,
      };
      setTrainer((previous: any) => ({
        ...previous,
        ...accessState,
      }));
      await refreshAccessControlData(nextTrainerState);

      await copyAccessToken(tokenValue);
      showToast(
        "success",
        "Token allenatore generato. L'allenatore dovra inserirlo nella home account, sezione accessi.",
      );
    } catch (error: any) {
      console.error("Error generating trainer access token:", error);
      showToast(
        "error",
        error?.message || "Errore nella generazione del token allenatore",
      );
    } finally {
      setIsGeneratingAccessToken(false);
    }
  };

  const handleDisconnectLinkedAccount = async () => {
    if (!clubId || !trainerId || !trainer) {
      showToast("error", "Allenatore non valido");
      return;
    }

    setIsDisconnectingAccess(true);

    try {
      const headers = {
        "x-active-club-id": clubId,
      };
      const nowIso = new Date().toISOString();

      if (trainer.linkedUserId) {
        const membershipResponse = await apiRequest<any[]>(
          `/api/v1/organization_users?organization_id=${encodeURIComponent(clubId)}&user_id=${encodeURIComponent(trainer.linkedUserId)}&role=trainer`,
          {
            method: "GET",
            headers,
          },
        );

        if (membershipResponse.error) {
          throw new Error(membershipResponse.error.message);
        }

        const membership = Array.isArray(membershipResponse.data)
          ? membershipResponse.data[0]
          : null;

        if (membership?.id) {
          const deleteMembershipResponse = await apiRequest(
            `/api/v1/organization_users/${membership.id}`,
            {
              method: "DELETE",
              headers,
            },
          );

          if (deleteMembershipResponse.error) {
            throw new Error(deleteMembershipResponse.error.message);
          }
        }
      }

      if (trainer.accessTokenRecordId) {
        const revokeTokenResponse = await apiRequest(
          `/api/v1/access_tokens/${trainer.accessTokenRecordId}`,
          {
            method: "PATCH",
            headers,
            body: {
              status: "revoked",
              revoked_at: nowIso,
              revoked_by_trainer_id: trainerId,
              revoked_linked_user_id: trainer.linkedUserId || null,
            },
          },
        );

        if (revokeTokenResponse.error) {
          throw new Error(revokeTokenResponse.error.message);
        }
      }

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

      await updateTrainerRecord(resetAccessState);
      const nextTrainerState = {
        ...(trainer || {}),
        ...resetAccessState,
      };
      setTrainer((previous: any) => ({
        ...previous,
        ...resetAccessState,
      }));
      await refreshAccessControlData(nextTrainerState);
      setShowDisconnectAccessDialog(false);
      showToast(
        "success",
        "Account scollegato dal profilo allenatore e accesso al club revocato",
      );
    } catch (error: any) {
      console.error("Error disconnecting trainer account:", error);
      showToast(
        "error",
        error?.message || "Errore nello scollegamento dell'account",
      );
    } finally {
      setIsDisconnectingAccess(false);
    }
  };

  const handleSaveSection = async () => {
    if (!clubId || !trainerId) return;

    try {
      const nextCategoryIds = getTrainerCategoryIds(
        editFormData.categoryIds || editFormData.categories,
        categories,
      );
      const normalizedUpdateData: Record<string, any> = {
        ...editFormData,
        categories: nextCategoryIds,
      };
      delete normalizedUpdateData.categoryIds;

      /*
        I gruppi seguiti si salvano solo se il club ne ha piu d'uno per
        categoria: su un club mono-sede sarebbero una copia delle categorie, e
        una copia e una cosa che prima o poi diverge (ADR-0055).
      */
      if (editFormData.groupIds !== undefined) {
        normalizedUpdateData.groupIds = Array.isArray(editFormData.groupIds)
          ? editFormData.groupIds.filter(Boolean)
          : [];
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
      }));
      setEditingSection(null);
      showToast("success", "Modifiche salvate con successo");
    } catch (error) {
      console.error("Error updating trainer:", error);
      showToast("error", "Errore nel salvataggio delle modifiche");
    }
  };

  const handleDeleteTrainer = async () => {
    if (!clubId || !trainerId) return;

    if (confirm("Sei sicuro di voler eliminare questo allenatore?")) {
      try {
        await deleteStaffMember(clubId, trainerId);
        showToast("success", "Allenatore eliminato con successo");
        router.push(`/trainers`);
      } catch (error) {
        console.error("Error deleting trainer:", error);
        showToast("error", "Errore nell'eliminazione dell'allenatore");
      }
    }
  };

  const handleSendMessage = () => {
    if (!newMessage.trim()) {
      showToast("error", "Inserisci un messaggio");
      return;
    }

    const message = {
      id: `msg-${Date.now()}`,
      content: newMessage,
      date: new Date().toISOString(),
      sender: "admin",
      read: false,
    };

    setMessages([...messages, message]);
    setNewMessage("");
    showToast("success", "Messaggio inviato");
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

  const formatMessageDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString("it-IT", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const handlePaySalary = async (paymentId: string) => {
    if (!clubId) return;

    try {
      const updates = {
        status: "paid",
        date: new Date().toISOString().split("T")[0],
      };

      await updateTrainerPayment(clubId, trainerId, paymentId, updates);

      setPayments(
        payments.map((payment) =>
          payment.id === paymentId ? { ...payment, ...updates } : payment,
        ),
      );
      showToast("success", "Pagamento registrato con successo");
    } catch (error) {
      showToast("error", "Errore nella registrazione del pagamento");
    }
  };

  const handleAddPayment = async (paymentData: any) => {
    if (!clubId) return;

    try {
      const newPayment = await addTrainerPayment(
        clubId,
        trainerId,
        paymentData,
      );
      setPayments(sortByDateDesc([...payments, newPayment], paymentDateOf));
      showToast("success", "Pagamento aggiunto con successo");
    } catch (error) {
      showToast("error", "Errore nell'aggiunta del pagamento");
    }
  };

  /*
    Il PIN di club e stato rimosso (Blocco 7, punto 17).

    Non proteggeva niente: era un segreto condiviso da tutto il club, con
    valore predefinito `"1234"` scritto in chiaro nel codice di un repository
    pubblico, e `payment_pin` era leggibile dalle API del club. In piu era una
    barriera **solo** nell'interfaccia: le stesse operazioni erano gia
    raggiungibili chiamando le API.

    Al suo posto restano i controlli veri: sessione, appartenenza al club,
    ruolo, e la matrice permessi che decide chi apre l'area pagamenti.
  */
  const handleDeletePayment = async () => {
    if (!selectedPaymentId || !clubId) return;

    try {
      await deleteTrainerPayment(clubId, trainerId, selectedPaymentId);
      setPayments(payments.filter((p) => p.id !== selectedPaymentId));
      showToast("success", "Pagamento eliminato con successo");
      setSelectedPaymentId(null);
    } catch (error) {
      showToast("error", "Errore nell'eliminazione del pagamento");
    }

    setShowDeletePaymentDialog(false);
  };

  const handleChangePaymentStatus = async () => {
    if (!selectedPaymentId || !clubId) return;

    try {
      const payment = payments.find((p) => p.id === selectedPaymentId);
      if (payment) {
        const newStatus = payment.status === "paid" ? "pending" : "paid";
        const updates = {
          status: newStatus,
          date:
            newStatus === "paid" ? new Date().toISOString().split("T")[0] : "",
        };

        await updateTrainerPayment(
          clubId,
          trainerId,
          selectedPaymentId,
          updates,
        );

        setPayments(
          payments.map((p) =>
            p.id === selectedPaymentId ? { ...p, ...updates } : p,
          ),
        );
        showToast("success", "Stato del pagamento modificato con successo");
        setSelectedPaymentId(null);
      }
    } catch (error) {
      showToast("error", "Errore nella modifica dello stato del pagamento");
    }

    setShowChangeStatusDialog(false);
  };

  /*
    Compenso e scheda pagamenti erano dietro il PIN.

    Chi puo aprire la scheda di un allenatore puo gia vedere il suo compenso:
    la matrice permessi (`canAccessPath`) decide chi entra nell'area, e un PIN
    uguale per tutto il club non aggiungeva nulla. Restava solo il gesto.
  */
  const [showPaymentsTab, setShowPaymentsTab] = useState(true);

  const handlePaymentsTabAccess = () => {
    setShowPaymentsTab(true);
  };

  /**
   * Scrive l'elenco dei documenti nel record dell'allenatore.
   *
   * Prima esistevano due pagine dedicate ai «contratti» che scrivevano su una
   * colonna inesistente (`clubs.trainer_contracts`) e ne leggevano un'altra:
   * il documento non arrivava da nessuna parte. Qui la scrittura passa dallo
   * stesso percorso di ogni altro campo dell'allenatore.
   */
  const persistTrainerDocuments = React.useCallback(
    async (documents: TrainerDocument[]) => {
      await updateTrainerRecord({ documents });
      setTrainerDocuments(documents);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [clubId, trainerId],
  );

  /**
   * Salva tipologia, scadenza o certificato della visita medica.
   *
   * Scrive prima nel record e poi nello stato: se la scrittura fallisce, cio
   * che si vede resta cio che e in archivio, invece di mostrare un valore che
   * nessuno ha salvato.
   */
  const saveMedicalVisit = async (updates: {
    medicalVisitType?: string;
    medicalVisitExpiry?: string;
    medicalVisitFile?: string | null;
  }) => {
    try {
      await updateTrainerRecord(updates);

      setMedicalVisit((current) => ({
        type:
          updates.medicalVisitType !== undefined
            ? updates.medicalVisitType
            : current.type,
        expiry:
          updates.medicalVisitExpiry !== undefined
            ? updates.medicalVisitExpiry
            : current.expiry,
        file:
          updates.medicalVisitFile !== undefined
            ? updates.medicalVisitFile
            : current.file,
      }));
      setTrainer((current: any) =>
        current ? { ...current, ...updates } : current,
      );
    } catch (error) {
      console.error("Errore nel salvataggio della visita medica", error);
      showToast("error", "Salvataggio della visita medica non riuscito");
      throw error;
    }
  };

  /**
   * Salva un attestato e lo persiste.
   *
   * L'upload chiamava solo `setCertificateFiles`: il file compariva e spariva
   * al primo refresh, perche nessuno lo scriveva nel record.
   */
  const saveCertificateFile = async (key: string, next: string | null) => {
    const nextFiles = { ...certificateFiles };
    if (next) nextFiles[key] = next;
    else delete nextFiles[key];

    await updateTrainerRecord({ certificateFiles: nextFiles });
    setCertificateFiles(nextFiles);
  };

  // Show loading state
  if (isLoading) {
    return (
      <div className="flex h-[100dvh] bg-gray-50 dark:bg-gray-900">
        <Sidebar />
        <div className="flex flex-1 flex-col overflow-hidden">
          <Header title="Dettaglio Allenatore" />
          <main className={dashboardMainClassName}>
            <div className="flex justify-center items-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-700"></div>
            </div>
          </main>
        </div>
      </div>
    );
  }

  // Show error state if trainer not found
  if (!trainer) {
    return (
      <div className="flex h-[100dvh] bg-gray-50 dark:bg-gray-900">
        <Sidebar />
        <div className="flex flex-1 flex-col overflow-hidden">
          <Header title="Allenatore Non Trovato" />
          <main className={dashboardMainClassName}>
            <div className="flex flex-col items-center justify-center py-8">
              <h2 className="text-xl font-semibold mb-4">
                Allenatore non trovato
              </h2>
              <Button onClick={() => router.push(`/trainers`)}>
                Torna alla lista allenatori
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
        <Header title="Dettaglio Allenatore" />
        <main className={dashboardMainClassName}>
          <DashboardPageContainer className="max-w-7xl">
            {/* Header with avatar and actions */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div className="flex items-center gap-4">
                <AvatarUpload
                  currentImage={trainer.avatar}
                  onImageChange={async (imageData) => {
                    const newAvatar = imageData || null;
                    setTrainer({ ...trainer, avatar: newAvatar });
                    
                    // Save to database immediately
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
                  }}
                  name={trainerHeaderName}
                  size="lg"
                  type="user"
                />
                <div>
                  <h1 className="bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-3xl font-bold leading-tight tracking-tight text-transparent md:text-4xl">{trainerHeaderName}</h1>
                  <div className="flex items-center gap-2 mt-1">
                    {trainer.categories.map((category: { id: string; name: string }) => (
                      <Badge key={category.id} className="bg-blue-500 text-white">
                        {category.name}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
              <div className="flex gap-2 w-full flex-wrap md:w-auto md:justify-end">
                <Button variant="destructive" className="flex-1 md:flex-none" onClick={handleDeleteTrainer}>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Elimina
                </Button>
              </div>
            </div>

            {/* Tabs for different sections */}
            <Tabs defaultValue="anagrafica">
              <TabsList className="grid w-full grid-cols-2 md:grid-cols-6">
                <TabsTrigger value="anagrafica">
                  <User className="h-4 w-4 mr-2" />
                  Anagrafica
                </TabsTrigger>
                <TabsTrigger value="pagamenti" onClick={handlePaymentsTabAccess}>
                  <DollarSign className="h-4 w-4 mr-2" />
                  Pagamenti
                </TabsTrigger>
                <TabsTrigger value="accesso">
                  <Link2 className="h-4 w-4 mr-2" />
                  Accesso Account
                </TabsTrigger>
                <TabsTrigger value="societari">
                  <Briefcase className="h-4 w-4 mr-2" />
                  Dati Societari
                </TabsTrigger>
                <TabsTrigger value="medici">
                  <Heart className="h-4 w-4 mr-2" />
                  Dati Medici
                </TabsTrigger>
                <TabsTrigger value="presenze">
                  <Activity className="h-4 w-4 mr-2" />
                  Presenze
                </TabsTrigger>
              </TabsList>

              {/* ANAGRAFICA TAB */}
              <TabsContent value="anagrafica" className="mt-4 space-y-6">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle className="flex items-center gap-2">
                      <User className="h-5 w-5" />
                      Informazioni Personali
                    </CardTitle>
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={() => handleEditSection('personal')}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      <div>
                        <h3 className="text-sm font-medium text-muted-foreground">Nome</h3>
                        <p className="mt-1">{trainer.name}</p>
                      </div>
                      <div>
                        <h3 className="text-sm font-medium text-muted-foreground">Cognome</h3>
                        <p className="mt-1">{trainer.surname || "-"}</p>
                      </div>
                      <div>
                        <h3 className="text-sm font-medium text-muted-foreground">Età</h3>
                        <p className="mt-1">{trainer.age || "-"}</p>
                      </div>
                      <div>
                        <h3 className="text-sm font-medium text-muted-foreground">Data di Nascita</h3>
                        <div className="flex items-center gap-2 mt-1">
                          <CalendarDays className="h-4 w-4 text-muted-foreground" />
                          <p>{formatDate(trainer.birthDate) || "-"}</p>
                        </div>
                      </div>
                      <div>
                        <h3 className="text-sm font-medium text-muted-foreground">Nazionalità</h3>
                        <div className="flex items-center gap-2 mt-1">
                          <Globe className="h-4 w-4 text-muted-foreground" />
                          <p>{trainer.nationality}</p>
                        </div>
                      </div>
                      <div>
                        <h3 className="text-sm font-medium text-muted-foreground">Luogo di Nascita</h3>
                        <div className="flex items-center gap-2 mt-1">
                          <MapPin className="h-4 w-4 text-muted-foreground" />
                          <p>{trainer.birthPlace || "-"}</p>
                        </div>
                      </div>
                      <div>
                        <h3 className="text-sm font-medium text-muted-foreground">Sesso</h3>
                        <p className="mt-1">{trainer.gender || "-"}</p>
                      </div>
                      <div>
                        <h3 className="text-sm font-medium text-muted-foreground">Formazione Scolastica</h3>
                        <div className="flex items-center gap-2 mt-1">
                          <GraduationCap className="h-4 w-4 text-muted-foreground" />
                          <p>{trainer.education || "-"}</p>
                        </div>
                      </div>
                      <div>
                        <h3 className="text-sm font-medium text-muted-foreground">Codice Fiscale</h3>
                        <p className="mt-1">{trainer.fiscalCode || "-"}</p>
                      </div>
                      <div className="md:col-span-3">
                        <h3 className="text-sm font-medium text-muted-foreground">Note</h3>
                        <p className="mt-1 text-sm">{trainer.notes || "-"}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle className="flex items-center gap-2">
                      <IdCard className="h-5 w-5" />
                      Documento di Identità
                    </CardTitle>
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={() => handleEditSection('document')}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <h3 className="text-sm font-medium text-muted-foreground">Tipo di Documento</h3>
                        <p className="mt-1">{trainer.documentType || "-"}</p>
                      </div>
                      <div>
                        <h3 className="text-sm font-medium text-muted-foreground">Numero Documento</h3>
                        <p className="mt-1">{trainer.documentNumber || "-"}</p>
                      </div>
                      <div>
                        <h3 className="text-sm font-medium text-muted-foreground">Data di Rilascio</h3>
                        <p className="mt-1">{formatDate(trainer.documentIssueDate) || "-"}</p>
                      </div>
                      <div>
                        <h3 className="text-sm font-medium text-muted-foreground">Scadenza del Documento</h3>
                        <p className="mt-1">{formatDate(trainer.documentExpiry) || "-"}</p>
                      </div>
                      <div className="md:col-span-2">
                        <h3 className="text-sm font-medium text-muted-foreground">Scadenza Permesso di Soggiorno</h3>
                        <p className="mt-1">{formatDate(trainer.residencePermitExpiry) || "-"}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle>Contatti e Residenza</CardTitle>
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={() => handleEditSection('contacts')}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <h3 className="text-sm font-medium text-muted-foreground">Email</h3>
                        <div className="flex items-center gap-2 mt-1">
                          <Mail className="h-4 w-4 text-muted-foreground" />
                          <p>{trainer.email}</p>
                        </div>
                      </div>
                      <div>
                        <h3 className="text-sm font-medium text-muted-foreground">Telefono</h3>
                        <div className="flex items-center gap-2 mt-1">
                          <Phone className="h-4 w-4 text-muted-foreground" />
                          <p>{trainer.phone}</p>
                        </div>
                      </div>
                      <div>
                        <h3 className="text-sm font-medium text-muted-foreground">Indirizzo</h3>
                        <div className="flex items-center gap-2 mt-1">
                          <MapPin className="h-4 w-4 text-muted-foreground" />
                          <p>{trainer.address}</p>
                        </div>
                      </div>
                      <div>
                        <h3 className="text-sm font-medium text-muted-foreground">Città</h3>
                        <p className="mt-1">{trainer.city}</p>
                      </div>
                      <div>
                        <h3 className="text-sm font-medium text-muted-foreground">CAP</h3>
                        <p className="mt-1">{trainer.postalCode}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* PAGAMENTI TAB */}
              <TabsContent value="pagamenti" className="mt-4 space-y-6">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle className="flex items-center gap-2">
                      <CreditCard className="h-5 w-5" />
                      Informazioni Bancarie
                    </CardTitle>
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={() => handleEditSection('banking')}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <h3 className="text-sm font-medium text-muted-foreground">IBAN</h3>
                        <p className="mt-1 font-mono">{trainer.iban || "-"}</p>
                      </div>
                      <div>
                        <h3 className="text-sm font-medium text-muted-foreground">Stipendio Mensile</h3>
                        <div className="flex items-center gap-2 mt-1">
                          <DollarSign className="h-4 w-4 text-muted-foreground" />
                          <p>€{trainer.salary}</p>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle>Registro Pagamenti</CardTitle>
                    <div className="flex items-center gap-2">
                      <div className="relative">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                          type="search"
                          placeholder="Cerca pagamento..."
                          className="pl-8 w-[200px] md:w-[300px]"
                          value={searchValue}
                          onChange={(e) => setSearchValue(e.target.value)}
                        />
                      </div>
                      <Button className="bg-blue-600 hover:bg-blue-700" onClick={() => setShowAddPaymentModal(true)}>
                        <Plus className="h-4 w-4 mr-2" />
                        Aggiungi Pagamento
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b">
                            <th className="text-left py-3 px-4 font-medium">
                              Mese
                            </th>
                            <th className="text-left py-3 px-4 font-medium">
                              Importo
                            </th>
                            <th className="text-left py-3 px-4 font-medium">
                              Data Pagamento
                            </th>
                            <th className="text-left py-3 px-4 font-medium">
                              Stato
                            </th>
                            <th className="text-left py-3 px-4 font-medium">
                              Azioni
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredPayments.length === 0 ? (
                            <tr>
                              <td
                                colSpan={5}
                                className="py-8 text-center text-muted-foreground"
                              >
                                Nessun pagamento registrato per questo
                                allenatore
                              </td>
                            </tr>
                          ) : (
                            filteredPayments.map((payment) => (
                              <tr
                                key={payment.id}
                                className="border-b hover:bg-gray-50 dark:hover:bg-gray-800"
                              >
                                <td className="py-3 px-4">{payment.month}</td>
                                <td className="py-3 px-4">
                                  <span>€{payment.amount}</span>
                                </td>
                                <td className="py-3 px-4">
                                  {formatDate(payment.date) || "-"}
                                </td>
                                <td className="py-3 px-4">
                                  {payment.status === "paid" ? (
                                    <Badge className="bg-green-500 text-white flex items-center gap-1">
                                      <CheckCircle className="h-3 w-3" />
                                      Pagato
                                    </Badge>
                                  ) : (
                                    <Badge
                                      variant="outline"
                                      className="text-amber-500 border-amber-500 flex items-center gap-1"
                                    >
                                      <Clock className="h-3 w-3" />
                                      In Attesa
                                    </Badge>
                                  )}
                                </td>
                                <td className="py-3 px-4">
                                  <div className="flex space-x-2">
                                    {payment.status === "pending" ? (
                                      <Button
                                        size="sm"
                                        className="bg-blue-600 hover:bg-blue-700"
                                        onClick={() =>
                                          handlePaySalary(payment.id)
                                        }
                                      >
                                        Registra Pagamento
                                      </Button>
                                    ) : (
                                      <div className="flex gap-2">
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          onClick={() => {
                                            // Crea un documento di ricevuta
                                            const receiptContent = `
                                              RICEVUTA DI PAGAMENTO
                                              
                                              Allenatore: ${trainer.name}
                                              Codice Fiscale: ${trainer.fiscalCode}
                                              Mese: ${payment.month}
                                              Importo: €${payment.amount}
                                              Data pagamento: ${formatDate(payment.date)}
                                              
                                              Ricevuta generata il ${new Date().toLocaleDateString()}
                                            `;

                                            const blob = new Blob(
                                              [receiptContent],
                                              { type: "text/plain" },
                                            );
                                            const url =
                                              URL.createObjectURL(blob);
                                            const a =
                                              document.createElement("a");
                                            a.href = url;
                                            a.download = buildAttachmentFileName({
                                              documentType: "Ricevuta compenso",
                                              lastName: trainer?.lastName,
                                              firstName: trainer?.firstName,
                                              fullName: trainer?.name,
                                              date: payment.date,
                                              mimeType: "text/plain",
                                            });
                                            document.body.appendChild(a);
                                            a.click();
                                            document.body.removeChild(a);
                                            URL.revokeObjectURL(url);

                                            showToast(
                                              "success",
                                              "Ricevuta scaricata con successo",
                                            );
                                          }}
                                        >
                                          Ricevuta
                                        </Button>
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          className="border-blue-500 text-blue-500 hover:bg-blue-50"
                                          onClick={() => {
                                            // Crea un documento di fattura
                                            const invoiceContent = `
                                              FATTURA
                                              
                                              Numero: INV-${Date.now().toString().substring(8)}
                                              Data: ${new Date().toLocaleDateString()}
                                              
                                              Allenatore: ${trainer.name}
                                              Codice Fiscale: ${trainer.fiscalCode}
                                              Indirizzo: ${trainer.address}
                                              
                                              Descrizione: Compenso per attività di allenatore - ${payment.month}
                                              Importo: €${payment.amount}
                                              IVA: €0.00
                                              Totale: €${payment.amount}
                                              
                                              Data pagamento: ${formatDate(payment.date)}
                                              Metodo di pagamento: Bonifico Bancario
                                              
                                              Note: Operazione fuori campo IVA ai sensi dell'art. 5 DPR 633/72
                                            `;

                                            const blob = new Blob(
                                              [invoiceContent],
                                              { type: "text/plain" },
                                            );
                                            const url =
                                              URL.createObjectURL(blob);
                                            const a =
                                              document.createElement("a");
                                            a.href = url;
                                            a.download = buildAttachmentFileName({
                                              documentType: "Fattura compenso",
                                              lastName: trainer?.lastName,
                                              firstName: trainer?.firstName,
                                              fullName: trainer?.name,
                                              date: payment.date,
                                              mimeType: "text/plain",
                                            });
                                            document.body.appendChild(a);
                                            a.click();
                                            document.body.removeChild(a);
                                            URL.revokeObjectURL(url);

                                            showToast(
                                              "success",
                                              "Fattura scaricata con successo",
                                            );
                                          }}
                                        >
                                          Fattura
                                        </Button>
                                      </div>
                                    )}
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="border-amber-500 text-amber-500 hover:bg-amber-50"
                                      onClick={() => {
                                        setSelectedPaymentId(payment.id);
                                        setShowChangeStatusDialog(true);
                                      }}
                                    >
                                      Cambia Stato
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="border-red-500 text-red-500 hover:bg-red-50"
                                      onClick={() => {
                                        setSelectedPaymentId(payment.id);
                                        setShowDeletePaymentDialog(true);
                                      }}
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                  </div>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="accesso" className="mt-4 space-y-6">
                <Card className="border-blue-100 bg-gradient-to-br from-white to-blue-50/60">
                  <CardHeader className="flex flex-col gap-3 border-b border-blue-100/80 md:flex-row md:items-start md:justify-between">
                    <div className="space-y-2">
                      <CardTitle className="flex items-center gap-2">
                        <Link2 className="h-5 w-5 text-blue-600" />
                        Accesso account allenatore
                      </CardTitle>
                      <p className="text-sm text-muted-foreground">
                        Da questa tab il club gestisce il collegamento tra il profilo
                        allenatore e l&apos;account EasyGame personale dell&apos;allenatore.
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge className={trainerAccessStatus.className}>
                        {trainerAccessStatus.label}
                      </Badge>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          setIsTrainerAccessOpen((current) => !current)
                        }
                      >
                        {isTrainerAccessOpen ? (
                          <ChevronDown className="mr-2 h-4 w-4" />
                        ) : (
                          <ChevronRight className="mr-2 h-4 w-4" />
                        )}
                        {isTrainerAccessOpen ? "Chiudi" : "Apri"}
                      </Button>
                    </div>
                  </CardHeader>
                  {isTrainerAccessOpen ? (
                  <CardContent className="space-y-5 pt-6">
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                      <div className="rounded-2xl border border-slate-200/80 bg-white/80 p-4">
                        <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
                          Token attuale
                        </p>
                        <p className="mt-2 font-mono text-lg font-semibold text-slate-900">
                          {formatTrainerAccessToken(trainer.accessTokenValue)}
                        </p>
                      </div>
                      <div className="rounded-2xl border border-slate-200/80 bg-white/80 p-4">
                        <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
                          Stato token
                        </p>
                        <p className="mt-2 text-sm font-semibold capitalize text-slate-900">
                          {accessTokenStatusLabel}
                        </p>
                      </div>
                      <div className="rounded-2xl border border-slate-200/80 bg-white/80 p-4">
                        <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
                          Scadenza
                        </p>
                        <p className="mt-2 text-sm font-semibold text-slate-900">
                          {accessTokenExpiryValue
                            ? formatMessageDate(accessTokenExpiryValue)
                            : "-"}
                        </p>
                      </div>
                      <div className="rounded-2xl border border-slate-200/80 bg-white/80 p-4">
                        <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
                          Ultimo collegamento
                        </p>
                        <p className="mt-2 text-sm font-semibold text-slate-900">
                          {trainer.linkedAt ? formatMessageDate(trainer.linkedAt) : "-"}
                        </p>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-dashed border-blue-200 bg-white/70 p-4">
                      <p className="text-sm text-slate-700">
                        {trainerAccessStatus.description}
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-3">
                      <Button
                        onClick={() => {
                          void handleGenerateAccessToken();
                        }}
                        disabled={isGeneratingAccessToken}
                        className="bg-blue-600 hover:bg-blue-700"
                      >
                        {isGeneratingAccessToken ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : trainer.accessTokenValue ? (
                          <RefreshCw className="mr-2 h-4 w-4" />
                        ) : (
                          <KeyRound className="mr-2 h-4 w-4" />
                        )}
                        {trainer.accessTokenValue ? "Rigenera Token" : "Genera Token"}
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => {
                          void copyAccessToken(trainer.accessTokenValue);
                        }}
                        disabled={!trainer.accessTokenValue}
                      >
                        <Copy className="mr-2 h-4 w-4" />
                        Copia Token
                      </Button>
                      <Button
                        variant="destructive"
                        onClick={() => setShowDisconnectAccessDialog(true)}
                        disabled={!trainer.linkedUserId || isDisconnectingAccess}
                      >
                        {isDisconnectingAccess ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Unlink2 className="mr-2 h-4 w-4" />
                        )}
                        Scollega Account
                      </Button>
                      <Button
                        variant="outline"
                        className="border-red-200 text-red-700 hover:bg-red-50"
                        onClick={() => setShowDisconnectAccessDialog(true)}
                        disabled={!trainer.linkedUserId || isDisconnectingAccess}
                      >
                        <Unlink2 className="mr-2 h-4 w-4" />
                        Scollega tutti gli account
                      </Button>
                    </div>
                  </CardContent>
                  ) : null}
                </Card>

                {isTrainerAccessOpen ? (
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle className="flex items-center gap-2">
                      <User className="h-5 w-5" />
                      Account Collegato
                    </CardTitle>
                    {isLoadingAccessData && <Loader2 className="h-4 w-4 animate-spin text-slate-500" />}
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                      <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                        <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
                          Nome account
                        </p>
                        <p className="mt-2 text-sm font-semibold text-slate-900">
                          {linkedAccountDisplayName}
                        </p>
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                        <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
                          Email
                        </p>
                        <p className="mt-2 text-sm font-semibold text-slate-900">
                          {linkedAccountDetails?.email || trainer.linkedUserEmail || "-"}
                        </p>
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                        <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
                          Telefono
                        </p>
                        <p className="mt-2 text-sm font-semibold text-slate-900">
                          {linkedAccountPhone}
                        </p>
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                        <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
                          ID account
                        </p>
                        <p className="mt-2 break-all text-sm font-semibold text-slate-900">
                          {trainer.linkedUserId || "-"}
                        </p>
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                        <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
                          Ruolo nel club
                        </p>
                        <p className="mt-2 text-sm font-semibold capitalize text-slate-900">
                          {linkedMembershipDetails?.role || "trainer"}
                        </p>
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                        <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
                          Membership creata il
                        </p>
                        <p className="mt-2 text-sm font-semibold text-slate-900">
                          {linkedMembershipDetails?.created_at
                            ? formatMessageDate(linkedMembershipDetails.created_at)
                            : "-"}
                        </p>
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                        <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
                          Account creato il
                        </p>
                        <p className="mt-2 text-sm font-semibold text-slate-900">
                          {linkedAccountDetails?.created_at
                            ? formatMessageDate(linkedAccountDetails.created_at)
                            : "-"}
                        </p>
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                        <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
                          Token generato il
                        </p>
                        <p className="mt-2 text-sm font-semibold text-slate-900">
                          {trainer.accessTokenGeneratedAt
                            ? formatMessageDate(trainer.accessTokenGeneratedAt)
                            : "-"}
                        </p>
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                        <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
                          Token riscattato il
                        </p>
                        <p className="mt-2 text-sm font-semibold text-slate-900">
                          {trainer.accessTokenRedeemedAt
                            ? formatMessageDate(trainer.accessTokenRedeemedAt)
                            : "-"}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                ) : null}
              </TabsContent>

              {/* DATI SOCIETARI TAB */}
              <TabsContent value="societari" className="mt-4 space-y-6">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle className="flex items-center gap-2">
                      <Briefcase className="h-5 w-5" />
                      Informazioni Societarie
                    </CardTitle>
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={() => handleEditSection('company')}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                  </CardHeader>
                  <CardContent>
                    {/*
                      «Ruolo» non e piu qui (Blocco 7).

                      Su una scheda allenatore valeva sempre «Allenatore»: un
                      campo modificabile che nessuno aveva ragione di
                      modificare, e che ripeteva cio che dice gia il titolo
                      della pagina. Il ruolo vero di un membro dello staff si
                      sceglie nella scheda Staff, dove l'elenco esiste.
                    */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <h3 className="text-sm font-medium text-muted-foreground">Tesserato</h3>
                        <Badge className={trainer.isMember ? "bg-green-500" : "bg-gray-500"}>
                          {trainer.isMember ? "SÌ" : "NO"}
                        </Badge>
                      </div>
                      <div>
                        <h3 className="text-sm font-medium text-muted-foreground">Numero di Tesseramento</h3>
                        <p className="mt-1">{trainer.membershipNumber || "-"}</p>
                      </div>
                      <div>
                        <h3 className="text-sm font-medium text-muted-foreground">Data di Tesseramento</h3>
                        <p className="mt-1">{formatDate(trainer.membershipDate) || "-"}</p>
                      </div>
                      <div>
                        <h3 className="text-sm font-medium text-muted-foreground">Data di Inizio</h3>
                        <div className="flex items-center gap-2 mt-1">
                          <Calendar className="h-4 w-4 text-muted-foreground" />
                          <p>{formatDate(trainer.startDate)}</p>
                        </div>
                      </div>
                      <div>
                        <h3 className="text-sm font-medium text-muted-foreground">Categorie Assegnate</h3>
                        <div className="flex flex-wrap gap-2 mt-1">
                          {trainer.categories.map((category: { id: string; name: string }) => (
                            <Badge key={category.id} className="bg-blue-500 text-white">
                              {category.name}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-dashed border-slate-200 bg-slate-50/70">
                  <CardContent className="flex flex-col gap-3 py-5 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">
                        Gestione collegamento account
                      </p>
                      <p className="text-sm text-slate-500">
                        Token, stato del collegamento e controllo account sono ora
                        disponibili nella tab dedicata <span className="font-medium">Accesso Account</span>.
                      </p>
                    </div>
                    <Badge className={trainerAccessStatus.className}>
                      {trainerAccessStatus.label}
                    </Badge>
                  </CardContent>
                </Card>

                {/*
                  I documenti: una griglia sola, dentro la scheda.

                  Prima erano un riquadro che ne mostrava tre con nome e data
                  vuoti — leggeva `contract.name` e `contract.date`, mentre chi
                  li salvava scriveva `title` e `uploadDate` — un pulsante di
                  scaricamento senza `onClick`, e due pagine dedicate che non
                  trovavano nemmeno l'allenatore. Vedi
                  src/lib/trainer-documents.ts.
                */}
                <TrainerDocumentsPanel
                  documents={trainerDocuments}
                  trainerId={trainerId}
                  trainerName={trainer?.name || ""}
                  organizationId={clubId}
                  onPersist={persistTrainerDocuments}
                />

                {/*
                  Le taglie si raccoglievano alla creazione e poi sparivano:
                  nessuna scheda di dettaglio le mostrava, quindi non si
                  potevano ne leggere ne correggere (Blocco A, punto 13).
                  Nessun numero di maglia qui: appartiene a chi scende in campo.
                */}
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle className="flex items-center gap-2">
                      <Shirt className="h-5 w-5" />
                      Taglie vestiario
                    </CardTitle>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleEditSection("clothing")}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                  </CardHeader>
                  <CardContent>
                    <ClothingSizesSummary
                      value={trainer?.clothingSizes}
                      person={{
                        gender: trainer?.gender,
                        birthDate: trainer?.birthDate,
                      }}
                    />
                  </CardContent>
                </Card>
              </TabsContent>

              {/* DATI MEDICI TAB */}
              <TabsContent value="medici" className="mt-4 space-y-6">
                {/*
                  Visita medica: prima era una card di sola lettura con un
                  caricamento che non salvava.

                  «Tipologia» e «Data di scadenza» si vedevano ma nessun form
                  le impostava: mostravano `-` per sempre. Il file caricato
                  viveva in uno stato React mai persistito, quindi spariva al
                  primo refresh, e «Visualizza» apriva un dialog con un `iframe`
                  su un data URL — che i browser bloccano.

                  Ora i tre campi si modificano e si salvano nello stesso posto,
                  e l'allegato usa il componente condiviso: guarda, scarica,
                  sostituisci, elimina.
                */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Heart className="h-5 w-5" />
                      Visita Medica
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="medical-visit-type">Tipologia</Label>
                        <Select
                          value={medicalVisit.type}
                          onValueChange={(value) =>
                            saveMedicalVisit({ medicalVisitType: value })
                          }
                        >
                          <SelectTrigger id="medical-visit-type">
                            <SelectValue placeholder="Seleziona la tipologia" />
                          </SelectTrigger>
                          <SelectContent>
                            {medicalVisitTypeOptions(medicalVisit.type).map(
                              (option) => (
                                <SelectItem key={option.value} value={option.value}>
                                  {option.label}
                                </SelectItem>
                              ),
                            )}
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">
                          {medicalVisitTypeOptions(medicalVisit.type).find(
                            (option) => option.value === medicalVisit.type,
                          )?.hint || ""}
                        </p>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="medical-visit-expiry">
                          Data di scadenza
                        </Label>
                        <Input
                          id="medical-visit-expiry"
                          type="date"
                          value={medicalVisit.expiry}
                          onChange={(event) =>
                            saveMedicalVisit({
                              medicalVisitExpiry: event.target.value,
                            })
                          }
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>Certificato</Label>
                      <CertificateAttachmentField
                        documentType="Visita medica"
                        owner={{ type: "trainer", id: trainerId, organizationId: clubId }}
                        value={medicalVisit.file}
                        date={medicalVisit.expiry}
                        onChange={(next) =>
                          saveMedicalVisit({ medicalVisitFile: next })
                        }
                        person={{
                          firstName: trainer?.firstName,
                          lastName: trainer?.lastName,
                          fullName: trainer?.name,
                        }}
                        emptyLabel="Nessun certificato allegato"
                      />
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle className="flex items-center gap-2">
                      <Shield className="h-5 w-5" />
                      Attestati
                    </CardTitle>
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={() => handleEditSection('certificates')}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-6">
                      {/* BLSD */}
                      <div className="border rounded-lg p-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Shield className="h-4 w-4 text-blue-500" />
                            <h3 className="text-base font-medium">BLSD</h3>
                          </div>
                          <Badge className={trainer.hasBlsd ? "bg-green-500" : "bg-gray-500"}>
                            {trainer.hasBlsd ? "SÌ" : "NO"}
                          </Badge>
                        </div>
                        {trainer.hasBlsd && (
                          <div className="mt-4 border-t pt-4">
                            <CertificateAttachmentField
                              documentType="BLSD"
                              owner={{ type: "trainer", id: trainerId, organizationId: clubId }}
                              value={certificateFiles.blsd}
                              onChange={(next) => saveCertificateFile("blsd", next)}
                              person={{
                                firstName: trainer?.firstName,
                                lastName: trainer?.lastName,
                                fullName: trainer?.name,
                              }}
                            />
                          </div>
                        )}
                      </div>

                      {/* Primo Soccorso */}
                      <div className="border rounded-lg p-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Shield className="h-4 w-4 text-red-500" />
                            <h3 className="text-base font-medium">Primo Soccorso</h3>
                          </div>
                          <Badge className={trainer.hasFirstAid ? "bg-green-500" : "bg-gray-500"}>
                            {trainer.hasFirstAid ? "SÌ" : "NO"}
                          </Badge>
                        </div>
                        {trainer.hasFirstAid && (
                          <div className="mt-4 border-t pt-4">
                            <CertificateAttachmentField
                              documentType="Primo soccorso"
                              owner={{ type: "trainer", id: trainerId, organizationId: clubId }}
                              value={certificateFiles.firstAid}
                              onChange={(next) => saveCertificateFile("firstAid", next)}
                              person={{
                                firstName: trainer?.firstName,
                                lastName: trainer?.lastName,
                                fullName: trainer?.name,
                              }}
                            />
                          </div>
                        )}
                      </div>

                      {/* Antincendio */}
                      <div className="border rounded-lg p-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Shield className="h-4 w-4 text-orange-500" />
                            <h3 className="text-base font-medium">Antincendio</h3>
                          </div>
                          <Badge className={trainer.hasFireSafety ? "bg-green-500" : "bg-gray-500"}>
                            {trainer.hasFireSafety ? "SÌ" : "NO"}
                          </Badge>
                        </div>
                        {trainer.hasFireSafety && (
                          <div className="mt-4 border-t pt-4">
                            <CertificateAttachmentField
                              documentType="Antincendio"
                              owner={{ type: "trainer", id: trainerId, organizationId: clubId }}
                              value={certificateFiles.fireSafety}
                              onChange={(next) => saveCertificateFile("fireSafety", next)}
                              person={{
                                firstName: trainer?.firstName,
                                lastName: trainer?.lastName,
                                fullName: trainer?.name,
                              }}
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle>Anagrafica Sanitaria</CardTitle>
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={() => handleEditSection('health')}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <h3 className="text-sm font-medium text-muted-foreground">Tessera Sanitaria</h3>
                        <p className="mt-1">{trainer.healthCard || "-"}</p>
                      </div>
                      <div>
                        <h3 className="text-sm font-medium text-muted-foreground">Assicurazione</h3>
                        <p className="mt-1">{trainer.insurance || "-"}</p>
                      </div>
                      <div className="md:col-span-2">
                        <h3 className="text-sm font-medium text-muted-foreground">Patologie e Malattie</h3>
                        <p className="mt-1 text-sm">{trainer.pathologies || "-"}</p>
                      </div>
                      <div className="md:col-span-2">
                        <h3 className="text-sm font-medium text-muted-foreground">Allergie/Preferenze Alimentari</h3>
                        <p className="mt-1 text-sm">{trainer.allergies || "-"}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* PRESENZE TAB */}
              <TabsContent value="presenze" className="mt-4 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <Card>
                    <CardContent className="pt-6">
                      <div className="text-center">
                        <p className="text-sm text-muted-foreground">Presenze</p>
                        <p className="text-3xl font-bold text-green-600">{attendanceStats.present}</p>
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-6">
                      <div className="text-center">
                        <p className="text-sm text-muted-foreground">Assenze</p>
                        <p className="text-3xl font-bold text-red-600">{attendanceStats.absent}</p>
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-6">
                      <div className="text-center">
                        <p className="text-sm text-muted-foreground">Nessuna Risposta</p>
                        <p className="text-3xl font-bold text-gray-600">{attendanceStats.noResponse}</p>
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-6">
                      <div className="text-center">
                        <p className="text-sm text-muted-foreground">Tasso di Presenza</p>
                        <p className="text-3xl font-bold text-blue-600">{attendanceStats.percentage}%</p>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                <Card>
                  <CardHeader>
                    <CardTitle>Report Presenze Allenamenti</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b">
                            <th className="text-left py-3 px-4 font-medium">Data</th>
                            <th className="text-left py-3 px-4 font-medium">Ora</th>
                            <th className="text-left py-3 px-4 font-medium">Titolo</th>
                            <th className="text-left py-3 px-4 font-medium">Categoria</th>
                            <th className="text-left py-3 px-4 font-medium">Luogo</th>
                            <th className="text-left py-3 px-4 font-medium">Presenza</th>
                          </tr>
                        </thead>
                        <tbody>
                          {trainingSessions.length === 0 ? (
                            <tr>
                              <td colSpan={6} className="py-8 text-center text-muted-foreground">
                                Nessun allenamento registrato
                              </td>
                            </tr>
                          ) : (
                            trainingSessions.map((session) => (
                              <tr key={session.id} className="border-b hover:bg-gray-50 dark:hover:bg-gray-800">
                                <td className="py-3 px-4">{formatDate(session.date)}</td>
                                <td className="py-3 px-4">{session.time}</td>
                                <td className="py-3 px-4">{session.title}</td>
                                <td className="py-3 px-4">{session.category}</td>
                                <td className="py-3 px-4">{session.location}</td>
                                <td className="py-3 px-4">
                                  {session.attendance === 'present' && (
                                    <Badge className="bg-green-500 text-white">Presente</Badge>
                                  )}
                                  {session.attendance === 'absent' && (
                                    <Badge className="bg-red-500 text-white">Assente</Badge>
                                  )}
                                  {session.attendance === 'no-response' && (
                                    <Badge className="bg-gray-500 text-white">Nessuna Risposta</Badge>
                                  )}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </DashboardPageContainer>
        </main>
      </div>
      
      <AddTrainerPaymentForm
        isOpen={showAddPaymentModal}
        onClose={() => setShowAddPaymentModal(false)}
        onSubmit={handleAddPayment}
      />

      {/*
        Eliminazione e cambio di stato di un compenso restano confermati, ma da
        una conferma normale: e la conferma a proteggere dal gesto involontario,
        non quattro cifre uguali per tutto il club.
      */}
      <AlertDialog
        open={showDeletePaymentDialog}
        onOpenChange={(open) => {
          if (!open) setShowDeletePaymentDialog(false);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare il compenso?</AlertDialogTitle>
            <AlertDialogDescription>
              Il compenso verra rimosso dalla scheda dell&apos;allenatore.
              L&apos;operazione non puo essere annullata.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={(event) => {
                event.preventDefault();
                void handleDeletePayment();
              }}
            >
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={showChangeStatusDialog}
        onOpenChange={(open) => {
          if (!open) setShowChangeStatusDialog(false);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Cambiare lo stato del compenso?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Lo stato passera da pagato a in attesa, o viceversa.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                void handleChangePaymentStatus();
              }}
            >
              Conferma
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/*
        Il visualizzatore della visita medica e stato rimosso (Blocco 7).

        Mostrava il certificato con un `<img src={dataUrl}>`: funzionava solo
        se il file era un'immagine, e i certificati sono quasi sempre PDF —
        dove restava un riquadro rotto. Ora l'allegato si apre con
        `openClientFileUrl`, che lo passa al visualizzatore del browser con il
        suo tipo MIME.
      */}

      {/* NEW: Edit Section Modal */}
      {editingSection && (
        <div 
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => setEditingSection(null)}
        >
          <div 
            className="bg-white dark:bg-gray-800 rounded-lg max-w-2xl w-full max-h-[90vh] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="text-lg font-semibold">Modifica Informazioni</h3>
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => setEditingSection(null)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="p-6 overflow-auto max-h-[calc(90vh-140px)]">
              {editingSection === 'personal' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <Label>Nome</Label>
                      <CapitalizedInput
                        value={editFormData.name || ''}
                        onChange={(e) => setEditFormData({...editFormData, name: e.target.value})}
                        onValueChange={(value) => setEditFormData({...editFormData, name: value})}
                      />
                    </div>
                    <div>
                      <Label>Cognome</Label>
                      <CapitalizedInput
                        value={editFormData.surname || ''}
                        onChange={(e) => setEditFormData({...editFormData, surname: e.target.value})}
                        onValueChange={(value) => setEditFormData({...editFormData, surname: value})}
                      />
                    </div>
                    <div>
                      <Label>Età</Label>
                      <Input 
                        type="number"
                        value={editFormData.age || ''} 
                        onChange={(e) => setEditFormData({...editFormData, age: e.target.value})}
                      />
                    </div>
                    <div>
                      <Label>Data di Nascita</Label>
                      <Input 
                        type="date"
                        value={editFormData.birthDate || ''} 
                        onChange={(e) => setEditFormData({...editFormData, birthDate: e.target.value})}
                      />
                    </div>
                    <div>
                      <Label>Nazionalità</Label>
                      <CapitalizedInput
                        value={editFormData.nationality || ''}
                        onChange={(e) => setEditFormData({...editFormData, nationality: e.target.value})}
                        onValueChange={(value) => setEditFormData({...editFormData, nationality: value})}
                      />
                    </div>
                    <div>
                      <Label>Luogo di Nascita</Label>
                      <CapitalizedInput
                        value={editFormData.birthPlace || ''}
                        onChange={(e) => setEditFormData({...editFormData, birthPlace: e.target.value})}
                        onValueChange={(value) => setEditFormData({...editFormData, birthPlace: value})}
                      />
                    </div>
                    <div>
                      {/*
                        Il sesso era un campo di testo libero: ci finiva
                        «M», «maschio», «Maschile». Il calcolo del codice
                        fiscale ha bisogno di una delle due lettere, e con
                        tre grafie non poteva funzionare.
                      */}
                      <Label>Sesso</Label>
                      <select
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        value={normalizeGenderLetter(editFormData.gender)}
                        onChange={(e) => setEditFormData({...editFormData, gender: e.target.value})}
                      >
                        <option value="">Non indicato</option>
                        <option value="M">Maschio</option>
                        <option value="F">Femmina</option>
                      </select>
                    </div>
                    <div>
                      <Label>Formazione Scolastica</Label>
                      <CapitalizedInput
                        value={editFormData.education || ''}
                        onChange={(e) => setEditFormData({...editFormData, education: e.target.value})}
                        onValueChange={(value) => setEditFormData({...editFormData, education: value})}
                      />
                    </div>
                    {/*
                      Stesso campo assistito del modulo di creazione: il
                      comune di nascita si cerca e porta con se il codice
                      catastale. Prima la scheda di dettaglio era l'unico
                      posto in cui il codice fiscale si digitava a mano.
                    */}
                    <div className="col-span-2">
                      <AssistedFiscalCodeField
                        id="trainer-edit-fiscal-code"
                        label="Codice fiscale"
                        value={editFormData.fiscalCode || ''}
                        onChange={(value) => setEditFormData({...editFormData, fiscalCode: value})}
                        person={{
                          firstName: editFormData.name,
                          lastName: editFormData.surname,
                          birthDate: editFormData.birthDate,
                          gender: editFormData.gender,
                        }}
                        belfioreCode={editFormData.birthPlaceCode || ''}
                        onBelfioreCodeChange={(value) => setEditFormData({...editFormData, birthPlaceCode: value})}
                        birthPlace={editFormData.birthPlace || ''}
                        onBirthPlaceChange={(value) => setEditFormData({...editFormData, birthPlace: value})}
                      />
                    </div>
                    <div className="col-span-2">
                      <Label>Note</Label>
                      <Textarea 
                        value={editFormData.notes || ''} 
                        onChange={(e) => setEditFormData({...editFormData, notes: e.target.value})}
                        rows={3}
                      />
                    </div>
                  </div>
                </div>
              )}

              {editingSection === 'document' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <Label>Tipo di Documento</Label>
                      <Input 
                        value={editFormData.documentType || ''} 
                        onChange={(e) => setEditFormData({...editFormData, documentType: e.target.value})}
                      />
                    </div>
                    <div>
                      <Label>Numero Documento</Label>
                      <Input 
                        value={editFormData.documentNumber || ''} 
                        onChange={(e) => setEditFormData({...editFormData, documentNumber: e.target.value})}
                      />
                    </div>
                    <div>
                      <Label>Data di Rilascio</Label>
                      <Input 
                        type="date"
                        value={editFormData.documentIssueDate || ''} 
                        onChange={(e) => setEditFormData({...editFormData, documentIssueDate: e.target.value})}
                      />
                    </div>
                    <div>
                      <Label>Scadenza del Documento</Label>
                      <Input 
                        type="date"
                        value={editFormData.documentExpiry || ''} 
                        onChange={(e) => setEditFormData({...editFormData, documentExpiry: e.target.value})}
                      />
                    </div>
                    <div className="col-span-2">
                      <Label>Scadenza Permesso di Soggiorno</Label>
                      <Input 
                        type="date"
                        value={editFormData.residencePermitExpiry || ''} 
                        onChange={(e) => setEditFormData({...editFormData, residencePermitExpiry: e.target.value})}
                      />
                    </div>
                  </div>
                </div>
              )}

              {editingSection === 'contacts' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <Label>Email</Label>
                      <Input 
                        type="email"
                        value={editFormData.email || ''} 
                        onChange={(e) => setEditFormData({...editFormData, email: e.target.value})}
                      />
                    </div>
                    <div>
                      <PhoneField
                        label="Telefono"
                        value={editFormData.phone || ''}
                        onChange={(value) => setEditFormData({...editFormData, phone: value})}
                      />
                    </div>
                    {/*
                      Via, comune e CAP dal componente condiviso: il comune si
                      cerca nell'archivio ISTAT e porta con se il CAP quando ne
                      ha uno solo (Blocco A, punti 9 e 10).
                    */}
                    <div className="col-span-2">
                      <PersonResidenceFields
                        idPrefix="trainer-edit"
                        values={editFormData}
                        onChange={(patch) =>
                          setEditFormData({ ...editFormData, ...patch })
                        }
                      />
                    </div>
                  </div>
                </div>
              )}

              {editingSection === 'banking' && (
                <div className="space-y-4">
                  <div>
                    <Label>IBAN</Label>
                    <Input 
                      value={editFormData.iban || ''} 
                      onChange={(e) => setEditFormData({...editFormData, iban: e.target.value})}
                    />
                  </div>
                  <div>
                    <Label>Stipendio Mensile (€)</Label>
                    <Input 
                      type="number"
                      value={editFormData.salary || ''} 
                      onChange={(e) => setEditFormData({...editFormData, salary: e.target.value})}
                    />
                  </div>
                </div>
              )}

              {editingSection === 'company' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <Label>Tesserato</Label>
                      <select 
                        className="w-full h-10 rounded-md border border-input bg-background px-3"
                        value={editFormData.isMember ? 'true' : 'false'}
                        onChange={(e) => setEditFormData({...editFormData, isMember: e.target.value === 'true'})}
                      >
                        <option value="true">SÌ</option>
                        <option value="false">NO</option>
                      </select>
                    </div>
                    <div>
                      <Label>Numero di Tesseramento</Label>
                      <Input 
                        value={editFormData.membershipNumber || ''} 
                        onChange={(e) => setEditFormData({...editFormData, membershipNumber: e.target.value})}
                      />
                    </div>
                    <div>
                      <Label>Data di Tesseramento</Label>
                      <Input 
                        type="date"
                        value={editFormData.membershipDate || ''} 
                        onChange={(e) => setEditFormData({...editFormData, membershipDate: e.target.value})}
                      />
                    </div>
                    {/*
                      La data di inizio si vedeva in scheda ma non compariva in
                      nessun form: era leggibile e non modificabile, e l'unico
                      modo di correggerla era ricreare l'allenatore.
                    */}
                    <div>
                      <Label>Data di Inizio</Label>
                      <Input
                        type="date"
                        value={editFormData.startDate || ''}
                        onChange={(e) => setEditFormData({...editFormData, startDate: e.target.value})}
                      />
                    </div>
                  </div>
                  <div className="space-y-3">
                    <div>
                      <Label>Categorie assegnate</Label>
                      <p className="text-sm text-muted-foreground mt-1">
                        Un allenatore può avere più categorie assegnate.
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2 rounded-xl border border-border bg-muted/30 p-3">
                      {categories.length === 0 ? (
                        <span className="text-sm text-muted-foreground">
                          Nessuna categoria disponibile.
                        </span>
                      ) : (
                        categories.map((category) => {
                          const selected = (
                            editFormData.categoryIds || []
                          ).includes(category.id);

                          return (
                            <Button
                              key={category.id}
                              type="button"
                              variant={selected ? "default" : "outline"}
                              size="sm"
                              className={selected ? "bg-blue-600 hover:bg-blue-700" : ""}
                              onClick={() =>
                                setEditFormData({
                                  ...editFormData,
                                  categoryIds: selected
                                    ? (editFormData.categoryIds || []).filter(
                                        (id: string) => id !== category.id,
                                      )
                                    : [...(editFormData.categoryIds || []), category.id],
                                })
                              }
                            >
                              {category.name}
                            </Button>
                          );
                        })
                      )}
                    </div>
                  </div>

                  {/*
                    I gruppi operativi compaiono solo dove esistono davvero:
                    con una squadra sola per categoria sarebbero una seconda
                    spunta che dice la stessa cosa (ADR-0055).
                  */}
                  {assignableGroups.length > 0 ? (
                    <div className="space-y-3">
                      <div>
                        <Label>Gruppi seguiti</Label>
                        <p className="text-sm text-muted-foreground mt-1">
                          Lo stesso allenatore puo seguire piu squadre della
                          stessa categoria in sedi diverse. Senza nessuna
                          spunta segue tutte le squadre delle sue categorie.
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2 rounded-xl border border-border bg-muted/30 p-3">
                        {assignableGroups.map((group) => {
                          const selected = (
                            editFormData.groupIds || []
                          ).includes(group.id);

                          return (
                            <Button
                              key={group.id}
                              type="button"
                              variant={selected ? "default" : "outline"}
                              size="sm"
                              aria-pressed={selected}
                              className={selected ? "bg-blue-600 hover:bg-blue-700" : ""}
                              onClick={() =>
                                setEditFormData({
                                  ...editFormData,
                                  groupIds: selected
                                    ? (editFormData.groupIds || []).filter(
                                        (id: string) => id !== group.id,
                                      )
                                    : [...(editFormData.groupIds || []), group.id],
                                })
                              }
                            >
                              {group.name}
                            </Button>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}
                </div>
              )}

              {editingSection === "clothing" && (
                <ClothingSizesFields
                  idPrefix="trainer-clothing"
                  value={editFormData.clothingSizes}
                  person={{
                    gender: editFormData.gender,
                    birthDate: editFormData.birthDate,
                  }}
                  onChange={(next) =>
                    setEditFormData({ ...editFormData, clothingSizes: next })
                  }
                />
              )}

              {editingSection === 'certificates' && (
                <div className="space-y-4">
                  <div className="space-y-6">
                    {/* BLSD */}
                    <div className="border rounded-lg p-4">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="blsd" className="flex items-center gap-2 text-base font-medium">
                          <Award className="h-4 w-4 text-blue-500" />
                          BLSD
                        </Label>
                        <Switch
                          id="blsd"
                          checked={editFormData.hasBlsd}
                          onCheckedChange={(checked) => setEditFormData({...editFormData, hasBlsd: checked})}
                        />
                      </div>
                    </div>

                    {/* Primo Soccorso */}
                    <div className="border rounded-lg p-4">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="firstAid" className="flex items-center gap-2 text-base font-medium">
                          <Award className="h-4 w-4 text-red-500" />
                          Primo Soccorso
                        </Label>
                        <Switch
                          id="firstAid"
                          checked={editFormData.hasFirstAid}
                          onCheckedChange={(checked) => setEditFormData({...editFormData, hasFirstAid: checked})}
                        />
                      </div>
                    </div>

                    {/* Antincendio */}
                    <div className="border rounded-lg p-4">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="fireSafety" className="flex items-center gap-2 text-base font-medium">
                          <Award className="h-4 w-4 text-orange-500" />
                          Antincendio
                        </Label>
                        <Switch
                          id="fireSafety"
                          checked={editFormData.hasFireSafety}
                          onCheckedChange={(checked) => setEditFormData({...editFormData, hasFireSafety: checked})}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {editingSection === 'health' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <Label>Tessera Sanitaria</Label>
                      <Input 
                        value={editFormData.healthCard || ''} 
                        onChange={(e) => setEditFormData({...editFormData, healthCard: e.target.value})}
                      />
                    </div>
                    <div>
                      <Label>Assicurazione</Label>
                      <Input 
                        value={editFormData.insurance || ''} 
                        onChange={(e) => setEditFormData({...editFormData, insurance: e.target.value})}
                      />
                    </div>
                    <div className="col-span-2">
                      <Label>Patologie e Malattie</Label>
                      <Textarea 
                        value={editFormData.pathologies || ''} 
                        onChange={(e) => setEditFormData({...editFormData, pathologies: e.target.value})}
                        rows={3}
                      />
                    </div>
                    <div className="col-span-2">
                      <Label>Allergie/Preferenze Alimentari</Label>
                      <Textarea 
                        value={editFormData.allergies || ''} 
                        onChange={(e) => setEditFormData({...editFormData, allergies: e.target.value})}
                        rows={3}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 p-4 border-t">
              <Button variant="outline" onClick={() => setEditingSection(null)}>
                Annulla
              </Button>
              <Button onClick={handleSaveSection} className="bg-blue-600 hover:bg-blue-700">
                Salva Modifiche
              </Button>
            </div>
          </div>
        </div>
      )}

      <AlertDialog
        open={showDisconnectAccessDialog}
        onOpenChange={setShowDisconnectAccessDialog}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Scollegare questo account?</AlertDialogTitle>
            <AlertDialogDescription>
              L&apos;utente perdera l&apos;accesso a questo club come allenatore e il
              collegamento con il profilo allenatore verra revocato. Se servira,
              potrai poi generare un nuovo token dalla tab Accesso Account.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDisconnectingAccess}>
              Annulla
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={isDisconnectingAccess}
              onClick={(event) => {
                event.preventDefault();
                void handleDisconnectLinkedAccount();
              }}
              className="bg-red-600 hover:bg-red-700"
            >
              {isDisconnectingAccess ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Unlink2 className="mr-2 h-4 w-4" />
              )}
              Conferma scollegamento
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
