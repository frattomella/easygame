"use client";

import React, { useState, useEffect } from "react";
import Sidebar from "@/components/dashboard/Sidebar";
import Header from "@/components/dashboard/Header";
import {
  DashboardPageContainer,
  dashboardMainClassName,
} from "@/components/dashboard/dashboard-page-container";
import { SharedPageHeader } from "@/components/dashboard/shared-page-header";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast-notification";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  CreditCard,
  Plus,
  Trash2,
  Edit,
  Calendar,
  Euro,
  Landmark,
  Save,
  User,
  CheckCircle2,
  Badge as BadgeIcon,
  Search,
  FileText,
  Percent,
  Tag,
  ExternalLink,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/components/providers/AuthProvider";
import {
  getClubData,
  addClubData,
  deleteClubDataItem,
  updateClubDataItem,
  getClubAthletes,
  getClubSettings,
  saveClubSettings,
} from "@/lib/simplified-db";
import {
  CustomKitComponentsBuilder,
  type KitComponent,
} from "@/components/forms/CustomKitComponentsBuilder";
import {
  normalizeKitAssignmentRecord,
  normalizeKitComponents,
  normalizeKitRecord,
} from "@/lib/clothing-kit-utils";
import {
  compareAthletesByLastName,
  getAthleteDisplayName,
} from "@/lib/athlete-name-utils";
import { EntityIcon } from "@/components/ui/entity-icon";
import {
  PAYMENT_PLAN_SERVICE_TYPES,
  calculateProratedTotal,
  calculatePlanTotal,
  generateInstallmentPreview,
  normalizePaymentPlan,
} from "@/lib/payment-plan-utils";
import {
  getAvailableRegistrationPaymentMethods,
  normalizePaymentSettings,
  paymentStatusLabel,
  normalizeClubPaymentMethod as normalizePaymentMethodRecord,
  serializeClubPaymentMethodsForSettings as serializePaymentMethodsForSettings,
} from "@/lib/payments/payment-config-utils";
import {
  PAYMENT_PROVIDER_ORDER,
  PAYMENT_PROVIDER_REGISTRY,
} from "@/lib/payments/provider-registry";
import type { ClubPaymentSettings as ClubPaymentSettingsType } from "@/lib/payments/payment-types";
import { allClothingSizesFor } from "@/lib/clothing-sizes";

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

const buildBuilderComponents = (components: any[]): KitComponent[] =>
  normalizeKitComponents(components).map((componentName, index) => ({
    id: `kit-component-${index}-${componentName.replace(/\s+/g, "-").toLowerCase()}`,
    name: componentName,
    selected: true,
    deliveryStatus: "pending" as const,
  }));

const getAthleteCategoryLabel = (
  categoryId: string,
  categories: { id: string; name: string }[],
) => {
  if (!categoryId) {
    return "";
  }

  return (
    categories.find((category) => category.id === categoryId)?.name ||
    categoryId
  );
};

const createPlanService = () => ({
  id:
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `service_${Date.now()}`,
  name: "",
  description: "",
  price: 0,
  type: "allenamenti",
  optional: false,
  required: true,
  included: true,
});

const createPlanInstallment = (index = 0) => ({
  id:
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `installment_${Date.now()}_${index}`,
  label: index === 0 ? "Pagamento unico" : `Rata ${index + 1}`,
  amountType: index === 0 ? "percentage" : "remaining",
  amount: index === 0 ? 100 : 0,
  dueAfterDays: index * 30,
});

const createPlanProrationSettings = () => ({
  enabled: false,
  method: "none",
  seasonStartDate: "",
  seasonEndDate: "",
  allowManualOverride: true,
});

const createEmptyPaymentPlanForm = () => ({
  name: "",
  description: "",
  amount: 0,
  services: [createPlanService()],
  installments: 1,
  installmentAmount: 0,
  installmentSchedule: [createPlanInstallment()],
  proration: createPlanProrationSettings(),
  applicableDiscountIds: [] as string[],
  notes: "",
  active: true,
});

const formatPlanCurrency = (value: unknown) =>
  new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
  }).format(Number(value || 0));

const resolveAthleteDefaultSize = (componentName: string, athlete: any) => {
  const normalizedName = String(componentName || "").trim().toLowerCase();
  const clothingSizes = athlete?.clothingSizes || {};

  if (
    normalizedName.includes("scar") ||
    normalizedName.includes("shoe") ||
    normalizedName.includes("stival") ||
    normalizedName.includes("calzett")
  ) {
    return clothingSizes.shoeSize || "";
  }

  if (
    normalizedName.includes("pantal") ||
    normalizedName.includes("short") ||
    normalizedName.includes("shorts")
  ) {
    return clothingSizes.pantsSize || "";
  }

  return clothingSizes.shirtSize || "";
};

const buildAthleteAssignmentComponents = (
  components: any[],
  athlete: any,
): KitComponent[] =>
  buildBuilderComponents(components).map((component) => ({
    ...component,
    size: resolveAthleteDefaultSize(component.name, athlete) || undefined,
    jerseyNumber:
      component.name.toLowerCase().includes("maglia") &&
      athlete?.jerseyNumber !== null &&
      athlete?.jerseyNumber !== undefined &&
      athlete?.jerseyNumber !== ""
        ? Number(athlete.jerseyNumber)
        : undefined,
  }));

export default function RegistrationManagementPage() {
  const { showToast } = useToast();
  const { activeClub, user } = useAuth();
  const [loading, setLoading] = useState(true);

  // State for payment plans
  const [paymentPlans, setPaymentPlans] = useState<any[]>([]);

  // State for new payment plan dialog
  const [isNewPlanDialogOpen, setIsNewPlanDialogOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<any>(null);
  const [newPlan, setNewPlan] = useState(createEmptyPaymentPlanForm);

  // State for payment methods
  const [paymentMethods, setPaymentMethods] = useState<any[]>([]);
  const [clubPaymentSettings, setClubPaymentSettings] =
    useState<ClubPaymentSettingsType>(() => normalizePaymentSettings(null));

  // State for new payment method dialog
  const [isNewMethodDialogOpen, setIsNewMethodDialogOpen] = useState(false);
  const [editingMethod, setEditingMethod] = useState<any>(null);
  const [newMethod, setNewMethod] = useState({
    name: "",
    details: "",
    active: true,
  });

  // State for discounts
  const [discounts, setDiscounts] = useState<any[]>([]);
  const [isNewDiscountDialogOpen, setIsNewDiscountDialogOpen] = useState(false);
  const [editingDiscount, setEditingDiscount] = useState<any>(null);
  const [newDiscount, setNewDiscount] = useState({
    title: "",
    type: "percentage",
    value: 0,
    active: true,
  });

  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [assignmentAthleteSearch, setAssignmentAthleteSearch] = useState("");

  // State for athletes and kits
  const [athletes, setAthletes] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [clothingKits, setClothingKits] = useState<any[]>([]);
  const [kitAssignments, setKitAssignments] = useState<any[]>([]);

  // State for clothing kit dialog
  const [isNewKitDialogOpen, setIsNewKitDialogOpen] = useState(false);
  const [editingKit, setEditingKit] = useState<any>(null);
  const [newKit, setNewKit] = useState<{
    name: string;
    description: string;
    price: number;
    components: KitComponent[];
    active: boolean;
  }>({
    name: "",
    description: "",
    price: 0,
    components: [],
    active: true,
  });

  // State for kit assignment dialog
  const [isNewAssignmentDialogOpen, setIsNewAssignmentDialogOpen] =
    useState(false);
  const [newAssignment, setNewAssignment] = useState<{
    athleteId: string;
    kitId: string;
    components: KitComponent[];
    assignmentType: "kit" | "components";
    notes: string;
    status: string;
  }>({
    athleteId: "",
    kitId: "",
    components: [],
    assignmentType: "kit", // "kit" or "components"
    notes: "",
    status: "pending",
  });

  // Load data from database
  useEffect(() => {
    const loadData = async () => {
      if (!activeClub?.id || !user) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);

        // Load payment plans
        try {
          const plansData = await getClubData(activeClub.id, "payment_plans");
          setPaymentPlans(Array.isArray(plansData) ? plansData : []);
        } catch (error) {
          console.warn("Payment plans not found, using empty array");
          setPaymentPlans([]);
        }

        try {
          const categoriesData = await getClubData(activeClub.id, "categories");
          setCategories(Array.isArray(categoriesData) ? categoriesData : []);
        } catch (error) {
          console.warn("Categories not found, using empty array");
          setCategories([]);
        }

        // Load payment methods from club settings fallback shared across the app
        try {
          const clubSettings = await getClubSettings(activeClub.id);
          setClubPaymentSettings(
            normalizePaymentSettings(clubSettings?.paymentSettings),
          );
          const settingsMethods = Array.isArray(clubSettings?.paymentMethods)
            ? clubSettings.paymentMethods.map(normalizePaymentMethodRecord)
            : [];
          setPaymentMethods(settingsMethods);
        } catch (error) {
          console.warn("Payment methods not found, using empty array");
          setClubPaymentSettings(normalizePaymentSettings(null));
          setPaymentMethods([]);
        }

        // Load discounts
        try {
          const discountsData = await getClubData(activeClub.id, "discounts");
          setDiscounts(Array.isArray(discountsData) ? discountsData : []);
        } catch (error) {
          console.warn("Discounts not found, using empty array");
          setDiscounts([]);
        }

        // Load athletes from simplified_athletes table
        try {
          const athletesData = await getClubAthletes(activeClub.id);
          const formattedAthletes = athletesData
            .slice()
            .sort(compareAthletesByLastName)
            .map((athlete: any) => ({
              id: athlete.id,
              name: getAthleteDisplayName(athlete) || "Atleta",
              firstName: athlete.first_name,
              lastName: athlete.last_name,
              birthDate: athlete.birth_date,
              gender: athlete.data?.gender || "",
              category: athlete.data?.category || "",
              categoryName: athlete.data?.category_name || "",
              status: athlete.data?.status || "active",
              jerseyNumber:
                athlete.data?.jerseyNumber ??
                athlete.jersey_number ??
                null,
              clothingSizes: athlete.data?.clothingSizes || {},
              avatar:
                athlete.avatar_url ||
                athlete.data?.avatar ||
                "",
            }));
          setAthletes(formattedAthletes);
        } catch (error) {
          console.warn("Athletes not found, using empty array");
          setAthletes([]);
        }

        // Load clothing kits
        try {
          const kitsData = await getClubData(activeClub.id, "clothing_kits");
          setClothingKits(
            Array.isArray(kitsData) ? kitsData.map(normalizeKitRecord) : [],
          );
        } catch (error) {
          console.warn("Clothing kits not found, using empty array");
          setClothingKits([]);
        }

        // Load kit assignments
        try {
          const assignmentsData = await getClubData(
            activeClub.id,
            "kit_assignments",
          );
          setKitAssignments(
            Array.isArray(assignmentsData)
              ? assignmentsData.map(normalizeKitAssignmentRecord)
              : [],
          );
        } catch (error) {
          console.warn("Kit assignments not found, using empty array");
          setKitAssignments([]);
        }
      } catch (error) {
        console.error("Error loading registration data:", error);
        showToast("error", "Errore nel caricamento dei dati");
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [activeClub, user, showToast]);

  // Handle payment plan form changes
  const handlePlanChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    const { name, value, type } = e.target as HTMLInputElement;

    if (type === "checkbox") {
      const target = e.target as HTMLInputElement;
      setNewPlan({ ...newPlan, [name]: target.checked });
    } else if (name === "installments" || name === "installmentAmount") {
      setNewPlan({ ...newPlan, [name]: parseFloat(value) || 0 });
    } else {
      setNewPlan({ ...newPlan, [name]: value });
    }
  };

  const currentPlanTotal = calculatePlanTotal(newPlan);
  const prorationPreview = calculateProratedTotal({
    total: currentPlanTotal,
    proration: normalizePaymentPlan(newPlan).proration,
    startDate: new Date().toISOString().slice(0, 10),
  });
  const planInstallmentPreview = generateInstallmentPreview(
    newPlan,
    prorationPreview.total,
    { startDate: new Date().toISOString().slice(0, 10) },
  );
  const displayedInstallmentAmount =
    planInstallmentPreview.installments[0]?.amount ||
    (newPlan.installments > 1
      ? newPlan.installmentAmount ||
        Number((currentPlanTotal / Math.max(newPlan.installments, 1)).toFixed(2))
      : currentPlanTotal);
  const onlineRegistrationMethods = React.useMemo(
    () => getAvailableRegistrationPaymentMethods(clubPaymentSettings),
    [clubPaymentSettings],
  );

  const updatePlanService = (
    serviceId: string,
    field: string,
    value: string | number | boolean,
  ) => {
    setNewPlan((current) => ({
      ...current,
      services: current.services.map((service: any) =>
        service.id === serviceId ? { ...service, [field]: value } : service,
      ),
    }));
  };

  const addPlanService = () => {
    setNewPlan((current) => ({
      ...current,
      services: [...current.services, createPlanService()],
    }));
  };

  const removePlanService = (serviceId: string) => {
    setNewPlan((current) => ({
      ...current,
      services:
        current.services.length > 1
          ? current.services.filter((service: any) => service.id !== serviceId)
          : current.services,
    }));
  };

  const updatePlanInstallment = (
    installmentId: string,
    field: string,
    value: string | number,
  ) => {
    setNewPlan((current) => ({
      ...current,
      installmentSchedule: current.installmentSchedule.map((installment: any) =>
        installment.id === installmentId
          ? { ...installment, [field]: value }
          : installment,
      ),
    }));
  };

  const addPlanInstallment = () => {
    setNewPlan((current) => ({
      ...current,
      installmentSchedule: [
        ...current.installmentSchedule,
        createPlanInstallment(current.installmentSchedule.length),
      ],
    }));
  };

  const removePlanInstallment = (installmentId: string) => {
    setNewPlan((current) => ({
      ...current,
      installmentSchedule:
        current.installmentSchedule.length > 1
          ? current.installmentSchedule.filter(
              (installment: any) => installment.id !== installmentId,
            )
          : current.installmentSchedule,
    }));
  };

  const updatePlanProration = (field: string, value: string | boolean) => {
    setNewPlan((current) => {
      const nextProration = {
        ...current.proration,
        [field]: value,
      };

      if (field === "enabled" && value === false) {
        nextProration.method = "none";
      }

      if (field === "enabled" && value === true && nextProration.method === "none") {
        nextProration.method = "days";
      }

      return {
        ...current,
        proration: nextProration,
      };
    });
  };

  const toggleApplicableDiscount = (discountId: string, checked: boolean) => {
    setNewPlan((current) => {
      const currentIds = new Set(current.applicableDiscountIds || []);
      if (checked) {
        currentIds.add(discountId);
      } else {
        currentIds.delete(discountId);
      }

      return {
        ...current,
        applicableDiscountIds: Array.from(currentIds),
      };
    });
  };

  // Handle payment method form changes
  const handleMethodChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    const { name, value, type } = e.target as HTMLInputElement;

    if (type === "checkbox") {
      const target = e.target as HTMLInputElement;
      setNewMethod({ ...newMethod, [name]: target.checked });
    } else {
      setNewMethod({ ...newMethod, [name]: value });
    }
  };

  // Handle search input change
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
  };

  // Filter athletes based on search query
  const filteredAthletes = Array.isArray(athletes)
    ? athletes.filter((athlete) =>
        athlete.name?.toLowerCase().includes(searchQuery.toLowerCase()),
      )
    : [];

  const selectedAssignmentAthlete = athletes.find(
    (athlete) => athlete.id === newAssignment.athleteId,
  );
  const filteredAssignmentAthletes = athletes.filter((athlete) =>
    athlete.name?.toLowerCase().includes(assignmentAthleteSearch.toLowerCase()),
  );
  const assignmentSizeOptions = allClothingSizesFor(
    deriveClothingProfile(
      selectedAssignmentAthlete?.gender,
      selectedAssignmentAthlete?.birthDate,
    ),
  );

  const persistPaymentMethods = async (methods: any[]) => {
    if (!activeClub?.id) {
      throw new Error("Club non trovato");
    }

    const normalizedMethods = methods.map(normalizePaymentMethodRecord);
    await saveClubSettings(activeClub.id, {
      paymentMethods: serializePaymentMethodsForSettings(normalizedMethods),
    });
    return normalizedMethods;
  };

  useEffect(() => {
    if (newAssignment.assignmentType !== "kit" || !newAssignment.kitId) {
      return;
    }

    const selectedKit = clothingKits.find((kit) => kit.id === newAssignment.kitId);
    const nextComponents = buildAthleteAssignmentComponents(
      selectedKit?.components || [],
      selectedAssignmentAthlete,
    );

    setNewAssignment((current) => {
      const currentSerialized = JSON.stringify(current.components || []);
      const nextSerialized = JSON.stringify(nextComponents);

      if (currentSerialized === nextSerialized) {
        return current;
      }

      return {
        ...current,
        components: nextComponents,
      };
    });
  }, [
    clothingKits,
    newAssignment.assignmentType,
    newAssignment.kitId,
    selectedAssignmentAthlete,
  ]);

  const openKitAssignmentDialog = (athleteId?: string) => {
    const nextAthleteId = athleteId || "";
    const nextAthlete = athletes.find((athlete) => athlete.id === nextAthleteId);
    resetNewAssignment();
    setAssignmentAthleteSearch(nextAthlete?.name || "");
    setNewAssignment({
      athleteId: nextAthleteId,
      kitId: "",
      components: [],
      assignmentType: "kit",
      notes: "",
      status: "pending",
    });
    setIsNewAssignmentDialogOpen(true);
  };

  // Save payment plan
  const savePlan = async () => {
    const validServices = newPlan.services.filter((service: any) =>
      String(service.name || "").trim(),
    );

    if (!newPlan.name || validServices.length === 0) {
      showToast("error", "Inserisci nome piano e almeno un servizio");
      return;
    }

    if (!activeClub?.id) {
      showToast("error", "Club non trovato");
      return;
    }

    if (planInstallmentPreview.warnings.length > 0) {
      showToast("error", planInstallmentPreview.warnings[0]);
      return;
    }

    try {
      const normalizedDraft = normalizePaymentPlan({
        ...newPlan,
        services: validServices,
        installmentSchedule: newPlan.installmentSchedule,
        proration: newPlan.proration,
        amount: currentPlanTotal,
        totalAmount: currentPlanTotal,
        installmentsCount: Math.max(newPlan.installmentSchedule.length, 1),
        installmentAmount: displayedInstallmentAmount,
      });
      const normalizedPlanFields = { ...normalizedDraft };
      delete (normalizedPlanFields as any).raw;
      const planToSave = {
        ...editingPlan,
        ...normalizedPlanFields,
        amount: normalizedDraft.totalAmount,
        totalAmount: normalizedDraft.totalAmount,
        installments: normalizedDraft.installmentsCount,
        installmentsCount: normalizedDraft.installmentsCount,
        installmentAmount: normalizedDraft.installmentAmount,
        installmentSchedule: normalizedDraft.installments,
        paymentSchedule: normalizedDraft.installments,
        proration: normalizedDraft.proration,
        applicableDiscountIds: normalizedDraft.applicableDiscountIds,
        services: normalizedDraft.services,
        notes: normalizedDraft.notes,
        active: Boolean(newPlan.active ?? true),
        id: editingPlan?.id || `plan_${Date.now()}`,
        createdAt: editingPlan?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      if (editingPlan) {
        // Update existing plan
        const updatedPlans = await updateClubDataItem(
          activeClub.id,
          "payment_plans",
          editingPlan.id,
          planToSave,
        );
        setPaymentPlans(Array.isArray(updatedPlans) ? updatedPlans : []);
        showToast("success", "Piano di pagamento aggiornato con successo");
      } else {
        // Add new plan
        const savedPlan = await addClubData(
          activeClub.id,
          "payment_plans",
          planToSave,
        );
        setPaymentPlans((prev) =>
          Array.isArray(prev) ? [...prev, savedPlan] : [savedPlan],
        );
        showToast("success", "Nuovo piano di pagamento aggiunto con successo");
      }

      setIsNewPlanDialogOpen(false);
      setEditingPlan(null);
      resetNewPlan();
    } catch (error: any) {
      console.warn("Error saving payment plan:", error?.message || error);
      showToast("error", "Errore nel salvataggio del piano di pagamento");
    }
  };

  // Save payment method
  const saveMethod = async () => {
    if (!newMethod.name) {
      showToast("error", "Inserisci un nome per il metodo di pagamento");
      return;
    }

    if (!activeClub?.id) {
      showToast("error", "Club non trovato");
      return;
    }

    try {
      const normalizedMethod = normalizePaymentMethodRecord({
        ...newMethod,
        id:
          editingMethod?.id ||
          (typeof crypto !== "undefined" && crypto.randomUUID
            ? crypto.randomUUID()
            : `method_${Date.now()}`),
      });
      const nextMethods = editingMethod
        ? paymentMethods.map((method) =>
            method.id === editingMethod.id ? normalizedMethod : method,
          )
        : [...paymentMethods, normalizedMethod];

      const persistedMethods = await persistPaymentMethods(nextMethods);
      setPaymentMethods(persistedMethods);
      showToast(
        "success",
        editingMethod
          ? "Metodo di pagamento aggiornato con successo"
          : "Nuovo metodo di pagamento aggiunto con successo",
      );

      setIsNewMethodDialogOpen(false);
      setEditingMethod(null);
      resetNewMethod();
    } catch (error) {
      console.error("Error saving payment method:", error);
      showToast("error", "Errore nel salvataggio del metodo di pagamento");
    }
  };

  // Edit payment plan
  const editPlan = (plan: any) => {
    const normalizedPlan = normalizePaymentPlan(plan);
    setEditingPlan(plan);
    setNewPlan({
      name: normalizedPlan.name,
      description: normalizedPlan.description,
      amount: normalizedPlan.totalAmount,
      services:
        normalizedPlan.services.length > 0
          ? normalizedPlan.services.map((service) => ({ ...service }))
          : [createPlanService()],
      installments: normalizedPlan.installmentsCount || 1,
      installmentAmount: normalizedPlan.installmentAmount || 0,
      installmentSchedule:
        normalizedPlan.installments.length > 0
          ? normalizedPlan.installments.map((installment) => ({ ...installment }))
          : [createPlanInstallment()],
      proration: {
        ...normalizedPlan.proration,
        seasonStartDate: normalizedPlan.proration.seasonStartDate || "",
        seasonEndDate: normalizedPlan.proration.seasonEndDate || "",
      },
      applicableDiscountIds: normalizedPlan.applicableDiscountIds,
      notes: normalizedPlan.notes,
      active: normalizedPlan.active,
    });
    setIsNewPlanDialogOpen(true);
  };

  // Edit payment method
  const editMethod = (method: any) => {
    setEditingMethod(method);
    setNewMethod({
      name: method.name,
      details: method.details,
      active: method.active,
    });
    setIsNewMethodDialogOpen(true);
  };

  // Delete payment plan
  const deletePlan = async (planId: string) => {
    if (!confirm("Sei sicuro di voler eliminare questo piano di pagamento?")) {
      return;
    }

    if (!activeClub?.id) {
      showToast("error", "Club non trovato");
      return;
    }

    try {
      const updatedPlans = await deleteClubDataItem(
        activeClub.id,
        "payment_plans",
        planId,
      );
      setPaymentPlans(updatedPlans);
      showToast("success", "Piano di pagamento eliminato con successo");
    } catch (error) {
      console.error("Error deleting payment plan:", error);
      showToast("error", "Errore nell'eliminazione del piano di pagamento");
    }
  };

  // Delete payment method
  const deleteMethod = async (methodId: string) => {
    if (!confirm("Sei sicuro di voler eliminare questo metodo di pagamento?")) {
      return;
    }

    if (!activeClub?.id) {
      showToast("error", "Club non trovato");
      return;
    }

    try {
      const updatedMethods = await persistPaymentMethods(
        paymentMethods.filter((method) => method.id !== methodId),
      );
      setPaymentMethods(updatedMethods);
      showToast("success", "Metodo di pagamento eliminato con successo");
    } catch (error) {
      console.error("Error deleting payment method:", error);
      showToast("error", "Errore nell'eliminazione del metodo di pagamento");
    }
  };

  // Reset new plan form
  const resetNewPlan = () => {
    setNewPlan(createEmptyPaymentPlanForm());
  };

  // Reset new method form
  const resetNewMethod = () => {
    setNewMethod({
      name: "",
      details: "",
      active: true,
    });
  };

  // Calculate installment amount
  const calculateInstallmentAmount = () => {
    if (newPlan.installments > 1) {
      const amount = Number(
        (currentPlanTotal / Math.max(newPlan.installments, 1)).toFixed(2),
      );
      setNewPlan({ ...newPlan, installmentAmount: amount });
    }
  };

  // Handle kit form changes
  const handleKitChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    const { name, value, type } = e.target as HTMLInputElement;

    if (type === "checkbox") {
      const target = e.target as HTMLInputElement;
      setNewKit({ ...newKit, [name]: target.checked });
    } else if (name === "price") {
      setNewKit({ ...newKit, [name]: parseFloat(value) || 0 });
    } else {
      setNewKit({ ...newKit, [name]: value });
    }
  };

  // Handle assignment form changes
  const handleAssignmentChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    const { name, value } = e.target as HTMLInputElement;
    setNewAssignment({ ...newAssignment, [name]: value });
  };

  // Save clothing kit
  const saveClothingKit = async () => {
    if (!newKit.name || newKit.price < 0) {
      showToast("error", "Compila tutti i campi obbligatori");
      return;
    }

    if (!activeClub?.id) {
      showToast("error", "Club non trovato");
      return;
    }

    try {
      const kitToSave = {
        ...newKit,
        components: normalizeKitComponents(newKit.components),
        id: editingKit?.id || `kit_${Date.now()}`,
        createdAt: editingKit?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      if (editingKit) {
        // Update existing kit
        const updatedKits = await updateClubDataItem(
          activeClub.id,
          "clothing_kits",
          editingKit.id,
          kitToSave,
        );
        setClothingKits(
          Array.isArray(updatedKits) ? updatedKits.map(normalizeKitRecord) : [],
        );
        showToast("success", "Kit abbigliamento aggiornato con successo");
      } else {
        // Add new kit
        const savedKit = await addClubData(
          activeClub.id,
          "clothing_kits",
          kitToSave,
        );
        setClothingKits(
          Array.isArray(clothingKits)
            ? [...clothingKits, normalizeKitRecord(savedKit)]
            : [normalizeKitRecord(savedKit)],
        );
        showToast("success", "Kit abbigliamento creato con successo");
      }

      setIsNewKitDialogOpen(false);
      setEditingKit(null);
      resetNewKit();
    } catch (error) {
      console.error("Error saving clothing kit:", error);
      showToast("error", "Errore nel salvataggio del kit abbigliamento");
    }
  };

  // Save kit assignment
  const saveKitAssignment = async () => {
    if (
      !newAssignment.athleteId ||
      (!newAssignment.kitId && newAssignment.assignmentType === "kit")
    ) {
      showToast("error", "Compila tutti i campi obbligatori");
      return;
    }

    if (!activeClub?.id) {
      showToast("error", "Club non trovato");
      return;
    }

    try {
      const normalizedAssignmentComponents =
        Array.isArray(newAssignment.components) &&
        newAssignment.components.length > 0
          ? newAssignment.components
          : newAssignment.assignmentType === "kit"
            ? buildAthleteAssignmentComponents(
                clothingKits.find((kit) => kit.id === newAssignment.kitId)
                  ?.components || [],
                selectedAssignmentAthlete,
              )
            : [];

      const assignmentToSave = {
        ...newAssignment,
        components: normalizedAssignmentComponents,
        items: normalizeKitAssignmentRecord({
          components: normalizedAssignmentComponents,
        }).items,
        id: `assignment_${Date.now()}`,
        assignedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      };

      const savedAssignment = await addClubData(
        activeClub.id,
        "kit_assignments",
        assignmentToSave,
      );
      setKitAssignments(
        Array.isArray(kitAssignments)
          ? [...kitAssignments, normalizeKitAssignmentRecord(savedAssignment)]
          : [normalizeKitAssignmentRecord(savedAssignment)],
      );
      showToast("success", "Kit assegnato con successo");
      setIsNewAssignmentDialogOpen(false);
      resetNewAssignment();
    } catch (error) {
      console.error("Error saving kit assignment:", error);
      showToast("error", "Errore nell'assegnazione del kit");
    }
  };

  // Edit clothing kit
  const editKit = (kit: any) => {
    setEditingKit(kit);
    setNewKit({
      name: kit.name,
      description: kit.description,
      price: kit.price,
      components: buildBuilderComponents(kit.components),
      active: kit.active,
    });
    setIsNewKitDialogOpen(true);
  };

  // Delete clothing kit
  const deleteKit = async (kitId: string) => {
    if (!confirm("Sei sicuro di voler eliminare questo kit?")) {
      return;
    }

    if (!activeClub?.id) {
      showToast("error", "Club non trovato");
      return;
    }

    try {
      const updatedKits = await deleteClubDataItem(
        activeClub.id,
        "clothing_kits",
        kitId,
      );
      setClothingKits(
        Array.isArray(updatedKits) ? updatedKits.map(normalizeKitRecord) : [],
      );
      showToast("success", "Kit eliminato con successo");
    } catch (error) {
      console.error("Error deleting kit:", error);
      showToast("error", "Errore nell'eliminazione del kit");
    }
  };

  // Reset new kit form
  const resetNewKit = () => {
    setNewKit({
      name: "",
      description: "",
      price: 0,
      components: [],
      active: true,
    });
  };

  // Reset new assignment form
  const resetNewAssignment = () => {
    setNewAssignment({
      athleteId: "",
      kitId: "",
      components: [],
      assignmentType: "kit",
      notes: "",
      status: "pending",
    });
    setAssignmentAthleteSearch("");
  };

  return (
    <div className="flex h-[100dvh] bg-gray-50 dark:bg-gray-900">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header title="Gestione Iscrizioni" />
        <main className={dashboardMainClassName}>
          <DashboardPageContainer>
            <SharedPageHeader
              title="Gestione iscrizioni"
              subtitle="Configura piani, metodi di pagamento e gestione delle iscrizioni."
            />
            <Tabs defaultValue="payment-plans">
              <TabsList className="mb-4">
                <TabsTrigger
                  value="payment-plans"
                  className="flex items-center gap-2"
                >
                  <CreditCard className="h-4 w-4" />
                  Piani di Pagamento
                </TabsTrigger>
                <TabsTrigger
                  value="payment-methods"
                  className="flex items-center gap-2"
                >
                  <Landmark className="h-4 w-4" />
                  Metodi di Pagamento
                </TabsTrigger>
                <TabsTrigger
                  value="discounts"
                  className="flex items-center gap-2"
                >
                  <Tag className="h-4 w-4" />
                  Sconti e Promozioni
                </TabsTrigger>
              </TabsList>

              {/* Payment Plans Tab */}
              <TabsContent value="payment-plans">
                <Card>
                  <CardHeader>
                    <div className="flex justify-between items-center">
                      <div>
                        <CardTitle>Piani di Pagamento</CardTitle>
                        <CardDescription>
                          Configura i piani di pagamento disponibili per gli
                          atleti
                        </CardDescription>
                      </div>
                      <Dialog
                        open={isNewPlanDialogOpen}
                        onOpenChange={setIsNewPlanDialogOpen}
                      >
                        <DialogTrigger asChild>
                          <Button
                            className="bg-blue-600 hover:bg-blue-700"
                            onClick={() => {
                              resetNewPlan();
                              setEditingPlan(null);
                            }}
                          >
                            <Plus className="h-4 w-4 mr-2" />
                            Nuovo Piano
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
                          <DialogHeader>
                            <DialogTitle>
                              {editingPlan
                                ? "Modifica Piano"
                                : "Nuovo Piano / Abbonamento"}
                            </DialogTitle>
                          </DialogHeader>
                          <div className="space-y-4 py-4">
                            <div className="grid gap-4 md:grid-cols-2">
                              <div>
                                <Label htmlFor="plan-name">Nome Piano</Label>
                                <Input
                                  id="plan-name"
                                  name="name"
                                  value={newPlan.name}
                                  onChange={handlePlanChange}
                                  placeholder="Es. Stagione completa"
                                />
                              </div>
                              <div className="rounded-lg border bg-slate-50 p-4 dark:bg-slate-900/40">
                                <p className="text-sm text-muted-foreground">
                                  Totale automatico
                                </p>
                                <p className="text-2xl font-bold">
                                  {formatPlanCurrency(currentPlanTotal)}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  Somma dei servizi inclusi nel piano.
                                </p>
                              </div>
                            </div>
                            <div>
                              <Label htmlFor="plan-description">
                                Descrizione
                              </Label>
                              <Textarea
                                id="plan-description"
                                name="description"
                                value={newPlan.description}
                                onChange={handlePlanChange}
                                placeholder="Descrizione del piano"
                              />
                            </div>
                            <div className="space-y-3 rounded-lg border p-4">
                              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                <div>
                                  <h3 className="font-semibold">
                                    Servizi inclusi
                                  </h3>
                                  <p className="text-sm text-muted-foreground">
                                    Dettaglia quote, allenamenti, assicurazione,
                                    kit o componenti extra del piano.
                                  </p>
                                </div>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={addPlanService}
                                >
                                  <Plus className="mr-2 h-4 w-4" />
                                  Aggiungi servizio
                                </Button>
                              </div>

                              <div className="space-y-3">
                                {newPlan.services.map(
                                  (service: any, index: number) => (
                                    <div
                                      key={service.id}
                                      className="rounded-lg border bg-white p-3 dark:bg-slate-950/40"
                                    >
                                      <div className="mb-3 flex items-center justify-between gap-3">
                                        <p className="text-sm font-medium">
                                          Servizio {index + 1}
                                        </p>
                                        <Button
                                          type="button"
                                          variant="ghost"
                                          size="icon"
                                          onClick={() =>
                                            removePlanService(service.id)
                                          }
                                          disabled={newPlan.services.length <= 1}
                                          aria-label="Rimuovi servizio"
                                        >
                                          <Trash2 className="h-4 w-4 text-red-600" />
                                        </Button>
                                      </div>
                                      <div className="grid gap-3 md:grid-cols-4">
                                        <div className="md:col-span-2">
                                          <Label>Nome servizio</Label>
                                          <Input
                                            value={service.name}
                                            onChange={(event) =>
                                              updatePlanService(
                                                service.id,
                                                "name",
                                                event.target.value,
                                              )
                                            }
                                            placeholder="Es. Allenamenti stagione"
                                          />
                                        </div>
                                        <div>
                                          <Label>Tipo</Label>
                                          <Select
                                            value={service.type}
                                            onValueChange={(value) =>
                                              updatePlanService(
                                                service.id,
                                                "type",
                                                value,
                                              )
                                            }
                                          >
                                            <SelectTrigger>
                                              <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                              {PAYMENT_PLAN_SERVICE_TYPES.map(
                                                (type) => (
                                                  <SelectItem
                                                    key={type.value}
                                                    value={type.value}
                                                  >
                                                    {type.label}
                                                  </SelectItem>
                                                ),
                                              )}
                                            </SelectContent>
                                          </Select>
                                        </div>
                                        <div>
                                          <Label>Prezzo</Label>
                                          <Input
                                            type="number"
                                            min="0"
                                            step="0.01"
                                            value={service.price}
                                            onChange={(event) =>
                                              updatePlanService(
                                                service.id,
                                                "price",
                                                parseFloat(
                                                  event.target.value,
                                                ) || 0,
                                              )
                                            }
                                            placeholder="0.00"
                                          />
                                        </div>
                                        <div className="md:col-span-4">
                                          <Label>Descrizione servizio</Label>
                                          <Textarea
                                            value={service.description}
                                            onChange={(event) =>
                                              updatePlanService(
                                                service.id,
                                                "description",
                                                event.target.value,
                                              )
                                            }
                                            placeholder="Dettaglio opzionale visibile nel riepilogo"
                                            rows={2}
                                          />
                                        </div>
                                      </div>
                                      <div className="mt-3 flex flex-wrap gap-4">
                                        <label className="flex items-center gap-2 text-sm">
                                          <Checkbox
                                            checked={Boolean(service.optional)}
                                            onCheckedChange={(checked) =>
                                              setNewPlan((current) => ({
                                                ...current,
                                                services: current.services.map(
                                                  (item: any) =>
                                                    item.id === service.id
                                                      ? {
                                                          ...item,
                                                          optional:
                                                            checked === true,
                                                          required:
                                                            checked !== true,
                                                        }
                                                      : item,
                                                ),
                                              }))
                                            }
                                          />
                                          Opzionale per atleta
                                        </label>
                                        <label className="flex items-center gap-2 text-sm">
                                          <Checkbox
                                            checked={service.included}
                                            onCheckedChange={(checked) =>
                                              updatePlanService(
                                                service.id,
                                                "included",
                                                checked === true,
                                              )
                                            }
                                          />
                                          Incluso nel totale
                                        </label>
                                      </div>
                                    </div>
                                  ),
                                )}
                              </div>
                            </div>
                            <div className="space-y-3 rounded-lg border p-4">
                              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                <div>
                                  <h3 className="font-semibold">
                                    Rate e scadenze
                                  </h3>
                                  <p className="text-sm text-muted-foreground">
                                    Le scadenze sono relative alla data inizio
                                    iscrizione dell&apos;atleta.
                                  </p>
                                </div>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={addPlanInstallment}
                                >
                                  <Plus className="mr-2 h-4 w-4" />
                                  Aggiungi rata
                                </Button>
                              </div>

                              <div className="space-y-3">
                                {newPlan.installmentSchedule.map(
                                  (installment: any, index: number) => (
                                    <div
                                      key={installment.id}
                                      className="rounded-lg border bg-white p-3 dark:bg-slate-950/40"
                                    >
                                      <div className="mb-3 flex items-center justify-between gap-3">
                                        <p className="text-sm font-medium">
                                          Rata {index + 1}
                                        </p>
                                        <Button
                                          type="button"
                                          variant="ghost"
                                          size="icon"
                                          onClick={() =>
                                            removePlanInstallment(
                                              installment.id,
                                            )
                                          }
                                          disabled={
                                            newPlan.installmentSchedule.length <=
                                            1
                                          }
                                          aria-label="Rimuovi rata"
                                        >
                                          <Trash2 className="h-4 w-4 text-red-600" />
                                        </Button>
                                      </div>
                                      <div className="grid gap-3 md:grid-cols-[1.3fr_1fr_1fr_1fr]">
                                        <div>
                                          <Label>Nome rata</Label>
                                          <Input
                                            value={installment.label}
                                            onChange={(event) =>
                                              updatePlanInstallment(
                                                installment.id,
                                                "label",
                                                event.target.value,
                                              )
                                            }
                                            placeholder="Es. Prima rata"
                                          />
                                        </div>
                                        <div>
                                          <Label>Tipo importo</Label>
                                          <Select
                                            value={installment.amountType}
                                            onValueChange={(value) =>
                                              updatePlanInstallment(
                                                installment.id,
                                                "amountType",
                                                value,
                                              )
                                            }
                                          >
                                            <SelectTrigger>
                                              <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                              <SelectItem value="percentage">
                                                Percentuale
                                              </SelectItem>
                                              <SelectItem value="fixed">
                                                Importo fisso
                                              </SelectItem>
                                              <SelectItem value="remaining">
                                                Saldo restante
                                              </SelectItem>
                                            </SelectContent>
                                          </Select>
                                        </div>
                                        <div>
                                          <Label>Valore</Label>
                                          <Input
                                            type="number"
                                            min="0"
                                            step="0.01"
                                            value={installment.amount}
                                            disabled={
                                              installment.amountType ===
                                              "remaining"
                                            }
                                            onChange={(event) =>
                                              updatePlanInstallment(
                                                installment.id,
                                                "amount",
                                                parseFloat(
                                                  event.target.value,
                                                ) || 0,
                                              )
                                            }
                                            placeholder={
                                              installment.amountType ===
                                              "percentage"
                                                ? "%"
                                                : "EUR"
                                            }
                                          />
                                        </div>
                                        <div>
                                          <Label>Scadenza dopo giorni</Label>
                                          <Input
                                            type="number"
                                            min="0"
                                            value={installment.dueAfterDays}
                                            onChange={(event) =>
                                              updatePlanInstallment(
                                                installment.id,
                                                "dueAfterDays",
                                                parseInt(
                                                  event.target.value,
                                                  10,
                                                ) || 0,
                                              )
                                            }
                                          />
                                        </div>
                                      </div>
                                    </div>
                                  ),
                                )}
                              </div>

                              {planInstallmentPreview.warnings.length > 0 ? (
                                <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                                  {planInstallmentPreview.warnings[0]}
                                </div>
                              ) : null}
                            </div>

                            <div className="space-y-3 rounded-lg border p-4">
                              <div>
                                <h3 className="font-semibold">
                                  Calcolo quota stagionale
                                </h3>
                                <p className="text-sm text-muted-foreground">
                                  Il pro-rata viene applicato quando assegni il
                                  piano a un atleta con data inizio.
                                </p>
                              </div>
                              <label className="flex items-center gap-2 text-sm">
                                <Checkbox
                                  checked={Boolean(newPlan.proration.enabled)}
                                  onCheckedChange={(checked) =>
                                    updatePlanProration(
                                      "enabled",
                                      checked === true,
                                    )
                                  }
                                />
                                Abilita calcolo proporzionale
                              </label>
                              {newPlan.proration.enabled ? (
                                <div className="grid gap-3 md:grid-cols-2">
                                  <div>
                                    <Label>Metodo</Label>
                                    <Select
                                      value={newPlan.proration.method}
                                      onValueChange={(value) =>
                                        updatePlanProration("method", value)
                                      }
                                    >
                                      <SelectTrigger>
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="days">
                                          Per giorni
                                        </SelectItem>
                                        <SelectItem value="months">
                                          Per mesi
                                        </SelectItem>
                                      </SelectContent>
                                    </Select>
                                  </div>
                                  <div>
                                    <Label>Permetti override manuale</Label>
                                    <label className="mt-2 flex items-center gap-2 text-sm">
                                      <Checkbox
                                        checked={Boolean(
                                          newPlan.proration
                                            .allowManualOverride,
                                        )}
                                        onCheckedChange={(checked) =>
                                          updatePlanProration(
                                            "allowManualOverride",
                                            checked === true,
                                          )
                                        }
                                      />
                                      Modifica importo in scheda atleta
                                    </label>
                                  </div>
                                  <div>
                                    <Label>Inizio periodo/stagione</Label>
                                    <Input
                                      type="date"
                                      value={newPlan.proration.seasonStartDate}
                                      onChange={(event) =>
                                        updatePlanProration(
                                          "seasonStartDate",
                                          event.target.value,
                                        )
                                      }
                                    />
                                  </div>
                                  <div>
                                    <Label>Fine periodo/stagione</Label>
                                    <Input
                                      type="date"
                                      value={newPlan.proration.seasonEndDate}
                                      onChange={(event) =>
                                        updatePlanProration(
                                          "seasonEndDate",
                                          event.target.value,
                                        )
                                      }
                                    />
                                  </div>
                                </div>
                              ) : null}
                            </div>

                            <div className="space-y-3 rounded-lg border bg-slate-50 p-4 dark:bg-slate-900/40">
                              <div>
                                <h3 className="font-semibold">Anteprima</h3>
                                <p className="text-sm text-muted-foreground">
                                  Esempio calcolato con data inizio oggi e rate
                                  arrotondate a multipli di 5 euro.
                                </p>
                              </div>
                              <div className="grid gap-3 md:grid-cols-3">
                                <div className="rounded-lg bg-white p-3 dark:bg-slate-950/40">
                                  <p className="text-xs text-muted-foreground">
                                    Totale servizi
                                  </p>
                                  <p className="text-lg font-semibold">
                                    {formatPlanCurrency(currentPlanTotal)}
                                  </p>
                                </div>
                                <div className="rounded-lg bg-white p-3 dark:bg-slate-950/40">
                                  <p className="text-xs text-muted-foreground">
                                    Totale esempio
                                  </p>
                                  <p className="text-lg font-semibold">
                                    {formatPlanCurrency(
                                      prorationPreview.total,
                                    )}
                                  </p>
                                </div>
                                <div className="rounded-lg bg-white p-3 dark:bg-slate-950/40">
                                  <p className="text-xs text-muted-foreground">
                                    Rate
                                  </p>
                                  <p className="text-lg font-semibold">
                                    {
                                      planInstallmentPreview.installments
                                        .length
                                    }
                                  </p>
                                </div>
                              </div>
                              <div className="space-y-2">
                                {planInstallmentPreview.installments.map(
                                  (installment) => (
                                    <div
                                      key={installment.id}
                                      className="flex flex-col justify-between gap-1 rounded-lg bg-white px-3 py-2 text-sm sm:flex-row sm:items-center dark:bg-slate-950/40"
                                    >
                                      <span className="font-medium">
                                        {installment.label}
                                      </span>
                                      <span className="text-muted-foreground">
                                        Dopo {installment.dueAfterDays} giorni
                                      </span>
                                      <span className="font-semibold">
                                        {formatPlanCurrency(
                                          installment.amount,
                                        )}
                                      </span>
                                    </div>
                                  ),
                                )}
                              </div>
                              {prorationPreview.warning ? (
                                <p className="text-sm text-amber-700">
                                  {prorationPreview.warning}
                                </p>
                              ) : null}
                            </div>

                            <div className="space-y-3 rounded-lg border p-4">
                              <div>
                                <h3 className="font-semibold">
                                  Sconti applicabili
                                </h3>
                                <p className="text-sm text-muted-foreground">
                                  Se non selezioni nulla, tutti gli sconti
                                  restano applicabili a questo piano.
                                </p>
                              </div>
                              {discounts.length > 0 ? (
                                <div className="grid gap-2 md:grid-cols-2">
                                  {discounts
                                    .filter(
                                      (discount: any) =>
                                        discount.active !== false,
                                    )
                                    .map((discount: any) => {
                                      const discountId = String(
                                        discount.id ||
                                          discount.title ||
                                          discount.name,
                                      );

                                      return (
                                        <label
                                          key={discountId}
                                          className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm"
                                        >
                                          <Checkbox
                                            checked={newPlan.applicableDiscountIds.includes(
                                              discountId,
                                            )}
                                            onCheckedChange={(checked) =>
                                              toggleApplicableDiscount(
                                                discountId,
                                                checked === true,
                                              )
                                            }
                                          />
                                          <span>
                                            {discount.title ||
                                              discount.name ||
                                              "Sconto"}
                                          </span>
                                        </label>
                                      );
                                    })}
                                </div>
                              ) : (
                                <p className="text-sm text-muted-foreground">
                                  Nessuno sconto configurato.
                                </p>
                              )}
                            </div>

                            <div>
                              <Label htmlFor="plan-notes">Note interne</Label>
                              <Textarea
                                id="plan-notes"
                                name="notes"
                                value={newPlan.notes}
                                onChange={handlePlanChange}
                                placeholder="Note operative opzionali"
                                rows={3}
                              />
                            </div>
                          </div>
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="outline"
                              onClick={() => setIsNewPlanDialogOpen(false)}
                            >
                              Annulla
                            </Button>
                            <Button onClick={savePlan}>
                              {editingPlan ? "Aggiorna" : "Salva"}
                            </Button>
                          </div>
                        </DialogContent>
                      </Dialog>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {paymentPlans.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">
                          Nessun piano di pagamento configurato. Crea il tuo
                          primo piano.
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                          {Array.isArray(paymentPlans) &&
                            paymentPlans.map((plan) => {
                              const normalizedPlan =
                                normalizePaymentPlan(plan);

                              return (
                              <Card
                                key={normalizedPlan.id}
                                className={`border-l-4 ${normalizedPlan.active ? "border-l-green-500" : "border-l-gray-300"}`}
                              >
                                <CardContent className="p-4">
                                  <div className="flex justify-between items-start mb-2">
                                    <div className="min-w-0">
                                      <h3 className="font-medium">
                                        {normalizedPlan.name}
                                      </h3>
                                      <p className="text-xs text-muted-foreground">
                                        {normalizedPlan.services.length} servizi
                                      </p>
                                    </div>
                                    <div className="flex space-x-1">
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => editPlan(plan)}
                                      >
                                        <Edit className="h-4 w-4 text-blue-600" />
                                      </Button>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() =>
                                          deletePlan(normalizedPlan.id)
                                        }
                                      >
                                        <Trash2 className="h-4 w-4 text-red-600" />
                                      </Button>
                                    </div>
                                  </div>
                                  <p className="text-sm text-muted-foreground mb-3">
                                    {normalizedPlan.description ||
                                      "Nessuna descrizione"}
                                  </p>
                                  <div className="space-y-2">
                                    <div className="flex justify-between">
                                      <span className="text-sm">
                                        Totale servizi:
                                      </span>
                                      <span className="font-medium">
                                        {formatPlanCurrency(
                                          normalizedPlan.totalAmount,
                                        )}
                                      </span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span className="text-sm">Rate:</span>
                                      <span>
                                        {normalizedPlan.installmentsCount}
                                      </span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span className="text-sm">
                                        Prima scadenza:
                                      </span>
                                      <span>
                                        Dopo{" "}
                                        {normalizedPlan.installments[0]
                                          ?.dueAfterDays ?? 0}{" "}
                                        giorni
                                      </span>
                                    </div>
                                    {normalizedPlan.proration.enabled ? (
                                      <div className="flex justify-between">
                                        <span className="text-sm">
                                          Pro-rata:
                                        </span>
                                        <span>
                                          {normalizedPlan.proration.method ===
                                          "months"
                                            ? "Mesi"
                                            : "Giorni"}
                                        </span>
                                      </div>
                                    ) : null}
                                    {normalizedPlan.services.length > 0 ? (
                                      <div className="rounded-md bg-slate-50 p-2 text-xs text-slate-600 dark:bg-slate-900/50 dark:text-slate-300">
                                        {normalizedPlan.services
                                          .slice(0, 3)
                                          .map((service) => (
                                            <div
                                              key={service.id}
                                              className="flex justify-between gap-2"
                                            >
                                              <span className="truncate">
                                                {service.name}
                                              </span>
                                              <span>
                                                {formatPlanCurrency(
                                                  service.price,
                                                )}
                                              </span>
                                            </div>
                                          ))}
                                        {normalizedPlan.services.length > 3 ? (
                                          <p className="mt-1 text-muted-foreground">
                                            +{normalizedPlan.services.length - 3}{" "}
                                            altri servizi
                                          </p>
                                        ) : null}
                                      </div>
                                    ) : null}
                                    <div className="flex justify-between">
                                      <span className="text-sm">Stato:</span>
                                      <span
                                        className={
                                          normalizedPlan.active
                                            ? "text-green-600"
                                            : "text-gray-500"
                                        }
                                      >
                                        {normalizedPlan.active
                                          ? "Attivo"
                                          : "Disattivato"}
                                      </span>
                                    </div>
                                  </div>
                                </CardContent>
                              </Card>
                              );
                            })}
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Payment Methods Tab */}
              <TabsContent value="payment-methods">
                <Card>
                  <CardHeader>
                    <div className="flex justify-between items-center">
                      <div>
                        <CardTitle>Metodi di Pagamento</CardTitle>
                        <CardDescription>
                          Configura i metodi di pagamento accettati dalla tua
                          organizzazione
                        </CardDescription>
                      </div>
                      <Dialog
                        open={isNewMethodDialogOpen}
                        onOpenChange={setIsNewMethodDialogOpen}
                      >
                        <DialogTrigger asChild>
                          <Button
                            className="bg-blue-600 hover:bg-blue-700"
                            onClick={() => {
                              resetNewMethod();
                              setEditingMethod(null);
                            }}
                          >
                            <Plus className="h-4 w-4 mr-2" />
                            Nuovo Metodo
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>
                              {editingMethod
                                ? "Modifica Metodo"
                                : "Nuovo Metodo di Pagamento"}
                            </DialogTitle>
                          </DialogHeader>
                          <div className="space-y-4 py-4">
                            <div>
                              <Label htmlFor="method-name">Nome Metodo</Label>
                              <Input
                                id="method-name"
                                name="name"
                                value={newMethod.name}
                                onChange={handleMethodChange}
                                placeholder="Es. Bonifico Bancario"
                              />
                            </div>
                            <div>
                              <Label htmlFor="method-details">Dettagli</Label>
                              <Textarea
                                id="method-details"
                                name="details"
                                value={newMethod.details}
                                onChange={handleMethodChange}
                                placeholder="Dettagli del metodo di pagamento"
                                rows={4}
                              />
                            </div>
                            <div className="flex items-center gap-2 rounded-lg border bg-muted/30 p-3">
                              <input
                                id="method-active"
                                name="active"
                                type="checkbox"
                                checked={newMethod.active}
                                onChange={handleMethodChange}
                              />
                              <Label htmlFor="method-active">
                                Metodo attivo
                              </Label>
                            </div>
                          </div>
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="outline"
                              onClick={() => setIsNewMethodDialogOpen(false)}
                            >
                              Annulla
                            </Button>
                            <Button onClick={saveMethod}>
                              {editingMethod ? "Aggiorna" : "Salva"}
                            </Button>
                          </div>
                        </DialogContent>
                      </Dialog>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="rounded-lg border bg-muted/20 p-4">
                        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <h3 className="font-semibold">
                              Metodi online da Club &gt; Pagamenti
                            </h3>
                            <p className="text-sm text-muted-foreground">
                              La Gestione Iscrizioni usa solo provider
                              abilitati, configurati e inclusi dal club.
                            </p>
                          </div>
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => {
                              window.location.href = "/organization?tab=pagamenti";
                            }}
                          >
                            <ExternalLink className="mr-2 h-4 w-4" />
                            Apri Pagamenti
                          </Button>
                        </div>
                        {onlineRegistrationMethods.length === 0 ? (
                          <div className="rounded-md border border-dashed bg-background p-4 text-sm text-muted-foreground">
                            Nessun metodo di pagamento online configurato.
                            Configura i metodi nella pagina Club &gt; Pagamenti.
                          </div>
                        ) : null}
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Metodo</TableHead>
                              <TableHead>Provider</TableHead>
                              <TableHead>Stato</TableHead>
                              <TableHead>Disponibile</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {PAYMENT_PROVIDER_ORDER.map((provider) => {
                              const definition = PAYMENT_PROVIDER_REGISTRY[provider];
                              const config = clubPaymentSettings.providers[provider];
                              const onlineMethod = onlineRegistrationMethods.find(
                                (method) => method.provider === provider,
                              );

                              return (
                                <TableRow key={provider}>
                                  <TableCell className="font-medium">
                                    {config.publicLabel || definition.label}
                                  </TableCell>
                                  <TableCell>{definition.label}</TableCell>
                                  <TableCell>
                                    <div className="flex flex-wrap gap-2">
                                      <Badge
                                        variant={
                                          config.enabled ? "default" : "secondary"
                                        }
                                      >
                                        {config.enabled
                                          ? "Abilitato"
                                          : "Disabilitato"}
                                      </Badge>
                                      <Badge variant="outline">
                                        {paymentStatusLabel(config.status)}
                                      </Badge>
                                      {!definition.isImplemented ? (
                                        <Badge variant="secondary">
                                          Predisposto
                                        </Badge>
                                      ) : null}
                                    </div>
                                  </TableCell>
                                  <TableCell>
                                    {onlineMethod ? (
                                      <Badge>Disponibile</Badge>
                                    ) : (
                                      <Badge variant="secondary">
                                        Non disponibile
                                      </Badge>
                                    )}
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </div>

                      {paymentMethods.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">
                          Nessun metodo di pagamento configurato. Crea il tuo
                          primo metodo.
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                          {Array.isArray(paymentMethods) &&
                            paymentMethods.map((method) => (
                              <Card
                                key={method.id}
                                className={`border-l-4 ${method.active ? "border-l-green-500" : "border-l-gray-300"}`}
                              >
                                <CardContent className="p-4">
                                  <div className="flex justify-between items-start mb-2">
                                    <h3 className="font-medium">
                                      {method.name}
                                    </h3>
                                    <div className="flex space-x-1">
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => editMethod(method)}
                                      >
                                        <Edit className="h-4 w-4 text-blue-600" />
                                      </Button>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => deleteMethod(method.id)}
                                      >
                                        <Trash2 className="h-4 w-4 text-red-600" />
                                      </Button>
                                    </div>
                                  </div>
                                  <p className="text-sm text-muted-foreground mb-3 whitespace-pre-line">
                                    {method.details}
                                  </p>
                                  <div>
                                    <span className="text-sm">Stato:</span>
                                    <span
                                      className={
                                        method.active
                                          ? "text-green-600 ml-2"
                                          : "text-gray-500 ml-2"
                                      }
                                    >
                                      {method.active ? "Attivo" : "Disattivato"}
                                    </span>
                                  </div>
                                </CardContent>
                              </Card>
                            ))}
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Discounts Tab */}
              <TabsContent value="discounts">
                <Card>
                  <CardHeader>
                    <div className="flex justify-between items-center">
                      <div>
                        <CardTitle>Sconti e Promozioni</CardTitle>
                        <CardDescription>
                          Configura sconti e promozioni da applicare agli
                          importi
                        </CardDescription>
                      </div>
                      <Dialog
                        open={isNewDiscountDialogOpen}
                        onOpenChange={setIsNewDiscountDialogOpen}
                      >
                        <DialogTrigger asChild>
                          <Button
                            className="bg-blue-600 hover:bg-blue-700"
                            onClick={() => {
                              setNewDiscount({
                                title: "",
                                type: "percentage",
                                value: 0,
                                active: true,
                              });
                              setEditingDiscount(null);
                            }}
                          >
                            <Plus className="h-4 w-4 mr-2" />
                            Nuovo Sconto
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>
                              {editingDiscount
                                ? "Modifica Sconto"
                                : "Nuovo Sconto/Promozione"}
                            </DialogTitle>
                          </DialogHeader>
                          <div className="space-y-4 py-4">
                            <div>
                              <Label htmlFor="discount-title">Titolo</Label>
                              <Input
                                id="discount-title"
                                value={newDiscount.title}
                                onChange={(e) =>
                                  setNewDiscount({
                                    ...newDiscount,
                                    title: e.target.value,
                                  })
                                }
                                placeholder="Es. Sconto Famiglia"
                              />
                            </div>
                            <div>
                              <Label>Tipo di Sconto</Label>
                              <Select
                                value={newDiscount.type}
                                onValueChange={(value) =>
                                  setNewDiscount({
                                    ...newDiscount,
                                    type: value,
                                  })
                                }
                              >
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="percentage">
                                    Percentuale (%)
                                  </SelectItem>
                                  <SelectItem value="fixed">
                                    Importo Fisso (€)
                                  </SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div>
                              <Label htmlFor="discount-value">
                                {newDiscount.type === "percentage"
                                  ? "Percentuale (%)"
                                  : "Importo (€)"}
                              </Label>
                              <Input
                                id="discount-value"
                                type="number"
                                value={newDiscount.value}
                                onChange={(e) =>
                                  setNewDiscount({
                                    ...newDiscount,
                                    value: parseFloat(e.target.value) || 0,
                                  })
                                }
                                placeholder="0"
                                min="0"
                                step={
                                  newDiscount.type === "percentage"
                                    ? "1"
                                    : "0.01"
                                }
                              />
                            </div>
                            <div className="flex items-center gap-2 rounded-lg border bg-muted/30 p-3">
                              <input
                                id="discount-active"
                                type="checkbox"
                                checked={newDiscount.active}
                                onChange={(event) =>
                                  setNewDiscount({
                                    ...newDiscount,
                                    active: event.target.checked,
                                  })
                                }
                              />
                              <Label htmlFor="discount-active">
                                Sconto attivo
                              </Label>
                            </div>
                          </div>
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="outline"
                              onClick={() => setIsNewDiscountDialogOpen(false)}
                            >
                              Annulla
                            </Button>
                            <Button
                              onClick={async () => {
                                if (
                                  !newDiscount.title ||
                                  newDiscount.value <= 0
                                ) {
                                  showToast("error", "Compila tutti i campi");
                                  return;
                                }

                                if (!activeClub?.id) {
                                  showToast("error", "Club non trovato");
                                  return;
                                }

                                try {
                                  const discountToSave = {
                                    ...newDiscount,
                                    id:
                                      editingDiscount?.id ||
                                      `discount_${Date.now()}`,
                                    createdAt:
                                      editingDiscount?.createdAt ||
                                      new Date().toISOString(),
                                    updatedAt: new Date().toISOString(),
                                  };

                                  if (editingDiscount) {
                                    const updatedDiscounts =
                                      await updateClubDataItem(
                                        activeClub.id,
                                        "discounts",
                                        editingDiscount.id,
                                        discountToSave,
                                      );
                                    setDiscounts(
                                      Array.isArray(updatedDiscounts)
                                        ? updatedDiscounts
                                        : [],
                                    );
                                    showToast(
                                      "success",
                                      "Sconto aggiornato con successo",
                                    );
                                  } else {
                                    const savedDiscount = await addClubData(
                                      activeClub.id,
                                      "discounts",
                                      discountToSave,
                                    );
                                    setDiscounts((prev) =>
                                      Array.isArray(prev)
                                        ? [...prev, savedDiscount]
                                        : [savedDiscount],
                                    );
                                    showToast(
                                      "success",
                                      "Sconto aggiunto con successo",
                                    );
                                  }

                                  setIsNewDiscountDialogOpen(false);
                                  setEditingDiscount(null);
                                } catch (error) {
                                  console.error(
                                    "Error saving discount:",
                                    error,
                                  );
                                  showToast(
                                    "error",
                                    "Errore nel salvataggio dello sconto",
                                  );
                                }
                              }}
                            >
                              {editingDiscount ? "Aggiorna" : "Salva"}
                            </Button>
                          </div>
                        </DialogContent>
                      </Dialog>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {discounts.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">
                          <Tag className="h-12 w-12 mx-auto mb-4 opacity-50" />
                          <p>Nessuno sconto configurato</p>
                          <p className="text-sm">
                            Crea il tuo primo sconto o promozione
                          </p>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                          {discounts.map((discount) => (
                            <Card
                              key={discount.id}
                              className={`border-l-4 ${discount.active ? "border-l-green-500" : "border-l-gray-300"}`}
                            >
                              <CardContent className="p-4">
                                <div className="flex justify-between items-start mb-2">
                                  <h3 className="font-medium">
                                    {discount.title}
                                  </h3>
                                  <div className="flex space-x-1">
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => {
                                        setEditingDiscount(discount);
                                        setNewDiscount({
                                          title: discount.title,
                                          type: discount.type,
                                          value: discount.value,
                                          active: discount.active,
                                        });
                                        setIsNewDiscountDialogOpen(true);
                                      }}
                                    >
                                      <Edit className="h-4 w-4 text-blue-600" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={async () => {
                                        if (
                                          !confirm(
                                            "Sei sicuro di voler eliminare questo sconto?",
                                          )
                                        ) {
                                          return;
                                        }

                                        if (!activeClub?.id) {
                                          showToast(
                                            "error",
                                            "Club non trovato",
                                          );
                                          return;
                                        }

                                        try {
                                          const updatedDiscounts =
                                            await deleteClubDataItem(
                                              activeClub.id,
                                              "discounts",
                                              discount.id,
                                            );
                                          setDiscounts(updatedDiscounts);
                                          showToast(
                                            "success",
                                            "Sconto eliminato con successo",
                                          );
                                        } catch (error) {
                                          console.error(
                                            "Error deleting discount:",
                                            error,
                                          );
                                          showToast(
                                            "error",
                                            "Errore nell'eliminazione dello sconto",
                                          );
                                        }
                                      }}
                                    >
                                      <Trash2 className="h-4 w-4 text-red-600" />
                                    </Button>
                                  </div>
                                </div>
                                <div className="space-y-2">
                                  <div className="flex justify-between items-center">
                                    <span className="text-sm">Valore:</span>
                                    <span className="font-bold text-lg flex items-center gap-1">
                                      {discount.type === "percentage" ? (
                                        <>
                                          <Percent className="h-4 w-4" />
                                          {discount.value}%
                                        </>
                                      ) : (
                                        <>
                                          <Euro className="h-4 w-4" />
                                          {discount.value.toFixed(2)}
                                        </>
                                      )}
                                    </span>
                                  </div>
                                  <div className="flex justify-between items-center">
                                    <span className="text-sm">Tipo:</span>
                                    <Badge variant="secondary">
                                      {discount.type === "percentage"
                                        ? "Percentuale"
                                        : "Importo Fisso"}
                                    </Badge>
                                  </div>
                                  <div className="flex justify-between items-center">
                                    <span className="text-sm">Stato:</span>
                                    <span
                                      className={
                                        discount.active
                                          ? "text-green-600"
                                          : "text-gray-500"
                                      }
                                    >
                                      {discount.active
                                        ? "Attivo"
                                        : "Disattivato"}
                                    </span>
                                  </div>
                                </div>
                              </CardContent>
                            </Card>
                          ))}
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Clothing Kits Tab - Updated with Data Grid */}
              <TabsContent value="clothing-kits">
                <Card>
                  <CardHeader>
                    <div className="flex justify-between items-center">
                      <div>
                        <CardTitle>Kit Abbigliamento</CardTitle>
                        <CardDescription>
                          Configura i kit di abbigliamento disponibili per gli
                          atleti
                        </CardDescription>
                      </div>
                      <Dialog
                        open={isNewKitDialogOpen}
                        onOpenChange={setIsNewKitDialogOpen}
                      >
                        <DialogTrigger asChild>
                          <Button
                            className="bg-blue-600 hover:bg-blue-700"
                            onClick={() => {
                              resetNewKit();
                              setEditingKit(null);
                            }}
                          >
                            <Plus className="h-4 w-4 mr-2" />
                            Nuovo Kit
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
                          <DialogHeader>
                            <DialogTitle>
                              {editingKit
                                ? "Modifica Kit"
                                : "Nuovo Kit Abbigliamento"}
                            </DialogTitle>
                          </DialogHeader>
                          <div className="space-y-4 py-4">
                            <div>
                              <Label htmlFor="kit-name">Nome del Kit</Label>
                              <Input
                                id="kit-name"
                                name="name"
                                value={newKit.name}
                                onChange={handleKitChange}
                                placeholder="Es. Kit Base 2024/2025"
                              />
                            </div>
                            <div>
                              <Label htmlFor="kit-description">
                                Descrizione
                              </Label>
                              <Textarea
                                id="kit-description"
                                name="description"
                                value={newKit.description}
                                onChange={handleKitChange}
                                placeholder="Descrizione del kit"
                                rows={3}
                              />
                            </div>
                            <div>
                              <Label htmlFor="kit-price">Prezzo (€)</Label>
                              <Input
                                id="kit-price"
                                name="price"
                                type="number"
                                value={newKit.price}
                                onChange={handleKitChange}
                                placeholder="0.00"
                                min="0"
                                step="0.01"
                              />
                            </div>
                            <div>
                              <Label>Componenti del Kit</Label>
                              <div className="mt-2 rounded-xl border bg-slate-50/60 p-4">
                                <CustomKitComponentsBuilder
                                  value={Array.isArray(newKit.components) ? newKit.components : []}
                                  onChange={(components) =>
                                    setNewKit({
                                      ...newKit,
                                      components,
                                    })
                                  }
                                  defaultComponents={buildBuilderComponents(newKit.components)}
                                  showSizeFields={false}
                                  showJerseyNumbers={false}
                                  showDeliveryStatus={false}
                                  showNotesField={false}
                                />
                              </div>
                              <p className="mt-2 text-xs text-muted-foreground">
                                Il kit salva solo i componenti modello. Taglie
                                e numeri di maglia vengono richiesti solo quando
                                il kit viene assegnato a un atleta.
                              </p>
                              <p className="mt-1 text-xs text-muted-foreground">
                                Componenti selezionati:{" "}
                                {normalizeKitComponents(newKit.components).join(", ") ||
                                  "nessuno"}
                              </p>
                            </div>
                            <div className="flex items-center space-x-2">
                              <input
                                id="kit-active"
                                name="active"
                                type="checkbox"
                                checked={newKit.active}
                                onChange={handleKitChange}
                              />
                              <Label htmlFor="kit-active">Kit attivo</Label>
                            </div>
                          </div>
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="outline"
                              onClick={() => setIsNewKitDialogOpen(false)}
                            >
                              Annulla
                            </Button>
                            <Button onClick={saveClothingKit}>
                              {editingKit ? "Aggiorna" : "Salva"}
                            </Button>
                          </div>
                        </DialogContent>
                      </Dialog>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {clothingKits.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">
                          <User className="h-12 w-12 mx-auto mb-4 opacity-50" />
                          <p>Nessun kit abbigliamento configurato</p>
                          <p className="text-sm">
                            Crea il tuo primo kit per iniziare
                          </p>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                          {Array.isArray(clothingKits) &&
                            clothingKits.map((kit) => (
                              <Card
                                key={kit.id}
                                className={`border-l-4 ${kit.active ? "border-l-green-500" : "border-l-gray-300"}`}
                              >
                                <CardContent className="p-4">
                                  <div className="flex justify-between items-start mb-2">
                                    <h3 className="font-medium">{kit.name}</h3>
                                    <div className="flex space-x-1">
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => editKit(kit)}
                                      >
                                        <Edit className="h-4 w-4 text-blue-600" />
                                      </Button>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => deleteKit(kit.id)}
                                      >
                                        <Trash2 className="h-4 w-4 text-red-600" />
                                      </Button>
                                    </div>
                                  </div>
                                  <p className="text-sm text-muted-foreground mb-3">
                                    {kit.description}
                                  </p>
                                  <div className="space-y-2">
                                    <div className="flex justify-between">
                                      <span className="text-sm">Prezzo:</span>
                                      <span className="font-medium">
                                        €{kit.price?.toFixed(2) || "0.00"}
                                      </span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span className="text-sm">
                                        Componenti:
                                      </span>
                                      <span>{kit.components?.length || 0}</span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                      <span className="text-sm">Stato:</span>
                                      <div className="flex items-center gap-2">
                                        <span
                                          className={
                                            kit.active
                                              ? "text-green-600"
                                              : "text-gray-500"
                                          }
                                        >
                                          {kit.active
                                            ? "Attivo"
                                            : "Disattivato"}
                                        </span>
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          className={
                                            kit.active
                                              ? "border-red-500 text-red-500 text-xs h-6 px-2"
                                              : "border-green-500 text-green-500 text-xs h-6 px-2"
                                          }
                                          onClick={async () => {
                                            try {
                                              const updatedKit = {
                                                ...kit,
                                                active: !kit.active,
                                              };
                                              const updatedKits =
                                                await updateClubDataItem(
                                                  activeClub.id,
                                                  "clothing_kits",
                                                  kit.id,
                                                  updatedKit,
                                                );
                                              setClothingKits(
                                                Array.isArray(updatedKits)
                                                  ? updatedKits.map(
                                                      normalizeKitRecord,
                                                    )
                                                  : [],
                                              );
                                              showToast(
                                                "success",
                                                `Kit ${kit.active ? "disattivato" : "attivato"} con successo`,
                                              );
                                            } catch (error) {
                                              console.error(
                                                "Error updating kit:",
                                                error,
                                              );
                                              showToast(
                                                "error",
                                                "Errore nell'aggiornamento del kit",
                                              );
                                            }
                                          }}
                                        >
                                          {kit.active ? "Disattiva" : "Attiva"}
                                        </Button>
                                      </div>
                                    </div>
                                    {kit.components &&
                                      kit.components.length > 0 && (
                                        <div className="mt-2">
                                          <span className="text-xs text-muted-foreground">
                                            Componenti:
                                          </span>
                                          <div className="flex flex-wrap gap-1 mt-1">
                                            {kit.components
                                              .slice(0, 3)
                                              .map(
                                                (
                                                  component: string,
                                                  index: number,
                                                ) => (
                                                  <Badge
                                                    key={index}
                                                    variant="secondary"
                                                    className="text-xs"
                                                  >
                                                    {component}
                                                  </Badge>
                                                ),
                                              )}
                                            {kit.components.length > 3 && (
                                              <Badge
                                                variant="secondary"
                                                className="text-xs"
                                              >
                                                +{kit.components.length - 3}
                                              </Badge>
                                            )}
                                          </div>
                                        </div>
                                      )}
                                  </div>
                                </CardContent>
                              </Card>
                            ))}
                        </div>
                      )}

                      <div className="mt-8">
                        <div className="flex justify-between items-center mb-4">
                          <h3 className="text-lg font-medium">
                            Assegnazione Kit agli Atleti
                          </h3>
                          <div className="flex items-center gap-2">
                            <Dialog
                              open={isNewAssignmentDialogOpen}
                              onOpenChange={setIsNewAssignmentDialogOpen}
                            >
                              <DialogTrigger asChild>
                                <Button
                                  className="bg-blue-600 hover:bg-blue-700"
                                  onClick={() => openKitAssignmentDialog()}
                                >
                                  <Plus className="h-4 w-4 mr-2" />
                                  Nuova Assegnazione
                                </Button>
                              </DialogTrigger>
                              <DialogContent className="sm:max-w-4xl max-h-[88vh] overflow-hidden">
                                <DialogHeader>
                                  <DialogTitle>
                                    Nuova Assegnazione Kit
                                  </DialogTitle>
                                </DialogHeader>
                                <div className="space-y-4 overflow-y-auto py-4 pr-2 max-h-[72vh]">
                                  <div>
                                    <Label htmlFor="assignment-athlete-search">
                                      Nome e Cognome Atleta
                                    </Label>
                                    <div className="relative mt-2">
                                      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                      <Input
                                        id="assignment-athlete-search"
                                        value={assignmentAthleteSearch}
                                        onChange={(event) =>
                                          setAssignmentAthleteSearch(event.target.value)
                                        }
                                        className="pl-10"
                                        placeholder="Cerca atleta per nome o cognome"
                                      />
                                    </div>
                                    <div className="mt-3 max-h-56 overflow-y-auto rounded-xl border bg-slate-50/60 p-2">
                                      {filteredAssignmentAthletes.length > 0 ? (
                                        filteredAssignmentAthletes.map((athlete) => (
                                          <button
                                            key={athlete.id}
                                            type="button"
                                            onClick={() => {
                                              setNewAssignment({
                                                ...newAssignment,
                                                athleteId: athlete.id,
                                              });
                                              setAssignmentAthleteSearch(athlete.name);
                                            }}
                                            className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                                              newAssignment.athleteId === athlete.id
                                                ? "bg-blue-600 text-white"
                                                : "hover:bg-white"
                                            }`}
                                          >
                                            <span className="font-medium">{athlete.name}</span>
                                            <span
                                              className={`text-xs ${
                                                newAssignment.athleteId === athlete.id
                                                  ? "text-blue-100"
                                                  : "text-muted-foreground"
                                              }`}
                                            >
                                              {athlete.categoryName ||
                                                getAthleteCategoryLabel(
                                                  athlete.category,
                                                  categories,
                                                ) ||
                                                "Senza categoria"}
                                            </span>
                                          </button>
                                        ))
                                      ) : (
                                        <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                                          Nessun atleta trovato
                                        </div>
                                      )}
                                    </div>
                                    {selectedAssignmentAthlete && (
                                      <p className="mt-2 text-xs text-muted-foreground">
                                        Selezionato: {selectedAssignmentAthlete.name}
                                      </p>
                                    )}
                                  </div>
                                  <div>
                                    <Label>Tipo di Assegnazione</Label>
                                    <div className="flex gap-4 mt-2">
                                      <div className="flex items-center space-x-2">
                                        <input
                                          type="radio"
                                          id="kit-completo"
                                          name="assignmentType"
                                          value="kit"
                                          checked={
                                            newAssignment.assignmentType ===
                                            "kit"
                                          }
                                          onChange={() =>
                                            setNewAssignment({
                                              ...newAssignment,
                                              assignmentType: "kit",
                                            })
                                          }
                                        />
                                        <Label htmlFor="kit-completo">
                                          Kit Completo
                                        </Label>
                                      </div>
                                      <div className="flex items-center space-x-2">
                                        <input
                                          type="radio"
                                          id="componenti"
                                          name="assignmentType"
                                          value="components"
                                          checked={
                                            newAssignment.assignmentType ===
                                            "components"
                                          }
                                          onChange={() =>
                                            setNewAssignment({
                                              ...newAssignment,
                                              assignmentType: "components",
                                            })
                                          }
                                        />
                                        <Label htmlFor="componenti">
                                          Componenti Singoli
                                        </Label>
                                      </div>
                                    </div>
                                  </div>
                                  {newAssignment.assignmentType === "kit" && (
                                    <div className="space-y-4">
                                      <Label htmlFor="kit-select">
                                        Seleziona Kit
                                      </Label>
                                      <Select
                                        value={newAssignment.kitId}
                                        onValueChange={(value) => {
                                          const selectedKit = clothingKits.find(
                                            (kit) => kit.id === value,
                                          );
                                          setNewAssignment({
                                            ...newAssignment,
                                            kitId: value,
                                            components: buildAthleteAssignmentComponents(
                                              selectedKit?.components || [],
                                              selectedAssignmentAthlete,
                                            ),
                                          });
                                        }}
                                      >
                                        <SelectTrigger>
                                          <SelectValue placeholder="-- Seleziona un kit --" />
                                        </SelectTrigger>
                                        <SelectContent>
                                          {clothingKits
                                            .filter((kit) => kit.active)
                                            .map((kit) => (
                                              <SelectItem
                                                key={kit.id}
                                                value={kit.id}
                                              >
                                                {kit.name} - €
                                                {kit.price?.toFixed(2) ||
                                                  "0.00"}
                                              </SelectItem>
                                            ))}
                                        </SelectContent>
                                      </Select>
                                      {newAssignment.kitId && (
                                        <div>
                                          <Label>Dettaglio assegnazione</Label>
                                          <div className="mt-2 rounded-xl border bg-slate-50/60 p-4">
                                            <CustomKitComponentsBuilder
                                              value={newAssignment.components}
                                              onChange={(components) =>
                                                setNewAssignment({
                                                  ...newAssignment,
                                                  components,
                                                })
                                              }
                                              defaultComponents={buildAthleteAssignmentComponents(
                                                clothingKits.find(
                                                  (kit) =>
                                                    kit.id === newAssignment.kitId,
                                                )?.components || [],
                                                selectedAssignmentAthlete,
                                              )}
                                              availableSizes={assignmentSizeOptions}
                                            />
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  )}
                                  {newAssignment.assignmentType ===
                                    "components" && (
                                    <div>
                                      <Label>Seleziona Componenti</Label>
                                      <CustomKitComponentsBuilder
                                        value={newAssignment.components}
                                        onChange={(components) =>
                                          setNewAssignment({
                                            ...newAssignment,
                                            components,
                                          })
                                        }
                                        availableSizes={assignmentSizeOptions}
                                      />
                                    </div>
                                  )}
                                  <div>
                                    <Label htmlFor="assignment-notes">
                                      Note
                                    </Label>
                                    <Textarea
                                      id="assignment-notes"
                                      name="notes"
                                      value={newAssignment.notes}
                                      onChange={handleAssignmentChange}
                                      placeholder="Note opzionali sull'assegnazione"
                                      rows={3}
                                    />
                                  </div>
                                </div>
                                <div className="flex justify-end gap-2">
                                  <Button
                                    variant="outline"
                                    onClick={() =>
                                      setIsNewAssignmentDialogOpen(false)
                                    }
                                  >
                                    Annulla
                                  </Button>
                                  <Button onClick={saveKitAssignment}>
                                    Salva Assegnazione
                                  </Button>
                                </div>
                              </DialogContent>
                            </Dialog>

                            <div className="relative w-64">
                              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                              <Input
                                placeholder="Cerca atleti..."
                                className="pl-10"
                                value={searchQuery}
                                onChange={handleSearchChange}
                              />
                            </div>
                          </div>
                        </div>

                        {/* Data Grid for Kit Assignments */}
                        <div className="border rounded-lg overflow-hidden">
                          <div className="overflow-x-auto">
                            <table className="w-full">
                              <thead className="bg-gray-100 dark:bg-gray-800">
                                <tr>
                                  <th className="px-4 py-3 text-left text-sm font-medium">
                                    Atleta
                                  </th>
                                  <th className="px-4 py-3 text-left text-sm font-medium">
                                    Categoria
                                  </th>
                                  <th className="px-4 py-3 text-left text-sm font-medium">
                                    Kit Assegnati
                                  </th>
                                  <th className="px-4 py-3 text-left text-sm font-medium">
                                    Stato
                                  </th>
                                  <th className="px-4 py-3 text-center text-sm font-medium">
                                    Azioni
                                  </th>
                                </tr>
                              </thead>
                              <tbody className="divide-y">
                                {filteredAthletes.length === 0 ? (
                                  <tr>
                                    <td
                                      colSpan={5}
                                      className="px-4 py-8 text-center text-muted-foreground"
                                    >
                                      <User className="h-12 w-12 mx-auto mb-4 opacity-50" />
                                      <p>Nessun atleta trovato</p>
                                      <p className="text-sm">
                                        {searchQuery
                                          ? "Nessun atleta corrisponde alla ricerca"
                                          : "Gli atleti verranno visualizzati qui una volta aggiunti al club"}
                                      </p>
                                    </td>
                                  </tr>
                                ) : (
                                  filteredAthletes.map((athlete) => {
                                    const assignments = kitAssignments.filter(
                                      (assignment) =>
                                        assignment.athleteId === athlete.id,
                                    );
                                    return (
                                      <tr
                                        key={athlete.id}
                                        className="hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                                      >
                                        <td className="px-4 py-3">
                                          <div className="flex items-center space-x-3">
                                            {athlete.avatar ? (
                                              <img
                                                src={athlete.avatar}
                                                alt={athlete.name}
                                                className="w-8 h-8 rounded-full object-cover"
                                              />
                                            ) : (
                                              <EntityIcon
                                                type="athlete"
                                                size="sm"
                                                label={athlete.name}
                                              />
                                            )}
                                            <button
                                              onClick={() => {
                                                const query = activeClub?.id
                                                  ? `?clubId=${encodeURIComponent(activeClub.id)}&tab=clothing`
                                                  : "?tab=clothing";
                                                window.location.href = `/athletes/${athlete.id}${query}`;
                                              }}
                                              className="font-medium hover:text-blue-600 flex items-center gap-1 transition-colors"
                                            >
                                              {athlete.name}
                                              <ExternalLink className="h-3 w-3" />
                                            </button>
                                          </div>
                                        </td>
                                        <td className="px-4 py-3 text-sm">
                                          {athlete.categoryName ||
                                            getAthleteCategoryLabel(
                                              athlete.category,
                                              categories,
                                            ) ||
                                            "N/A"}
                                        </td>
                                        <td className="px-4 py-3">
                                          <div className="flex flex-wrap gap-1">
                                            {assignments.length === 0 ? (
                                              <span className="text-sm text-muted-foreground">
                                                Nessun kit
                                              </span>
                                            ) : (
                                              <>
                                                {assignments
                                                  .slice(0, 2)
                                                  .map((assignment, index) => {
                                                    const kit =
                                                      clothingKits.find(
                                                        (k) =>
                                                          k.id ===
                                                          assignment.kitId,
                                                      );
                                                    return (
                                                      <Badge
                                                        key={index}
                                                        variant="secondary"
                                                        className="text-xs"
                                                      >
                                                        {kit?.name ||
                                                          "Kit sconosciuto"}
                                                      </Badge>
                                                    );
                                                  })}
                                                {assignments.length > 2 && (
                                                  <Badge
                                                    variant="secondary"
                                                    className="text-xs"
                                                  >
                                                    +{assignments.length - 2}
                                                  </Badge>
                                                )}
                                              </>
                                            )}
                                          </div>
                                        </td>
                                        <td className="px-4 py-3">
                                          <Badge
                                            variant={
                                              assignments.length > 0
                                                ? "default"
                                                : "secondary"
                                            }
                                          >
                                            {assignments.length > 0
                                              ? "Assegnato"
                                              : "Non assegnato"}
                                          </Badge>
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                          <Button
                                            className="h-8 w-8 bg-blue-600 p-0 hover:bg-blue-700"
                                            size="sm"
                                            onClick={() =>
                                              openKitAssignmentDialog(athlete.id)
                                            }
                                          >
                                            <Plus className="h-4 w-4" />
                                          </Button>
                                        </td>
                                      </tr>
                                    );
                                  })
                                )}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </DashboardPageContainer>
        </main>
      </div>
    </div>
  );
}
