"use client";

import React, { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import Sidebar from "@/components/dashboard/Sidebar";
import Header from "@/components/dashboard/Header";
import { MobileTopBar } from "@/components/layout/MobileTopBar";
import {
  DashboardPageContainer,
  dashboardMainClassName,
} from "@/components/dashboard/dashboard-page-container";
import { SharedPageHeader } from "@/components/dashboard/shared-page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Building,
  CreditCard,
  Mail,
  MapPin,
  Plus,
  Shield,
  Upload,
  Trash2,
  Share2,
  User,
  Phone,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Check,
  X,
} from "lucide-react";
import Image from "next/image";
import { LogoUpload } from "@/components/ui/avatar-upload";
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
import { Badge } from "@/components/ui/badge";
import { SeasonManager } from "@/components/organization/season-manager";
import { cn } from "@/lib/utils";
import { createCoalescingSaver } from "@/lib/performance";
import { SaveStatus, type SaveState } from "@/components/ui/save-status";
import {
  CLUB_PROFILE_SECTIONS,
  clubProfileSectionSnapshot,
  saveClubProfileSection,
  validateClubProfileSection,
  type ClubProfileDraft,
  type ClubProfileSectionId,
} from "@/lib/club-profile";
import { CapitalizedInput } from "@/components/forms/capitalized-input";
import { PhoneField } from "@/components/forms/phone-field";
import {
  AssistedAddressFields,
  AssistedFiscalCodeField,
} from "@/components/forms/assisted-anagrafica";
import { ClubBillingSettings } from "@/components/payments/ClubBillingSettings";
import { FiscalProfilePanel } from "@/components/fiscal/FiscalProfilePanel";
import { readSubscriptionSettingsSource } from "@/lib/entitlements";
import { CapabilityGate } from "@/components/club/capability-gate";
import { ClubPaymentSettings } from "@/components/payments/ClubPaymentSettings";
import {
  normalizeExtraServices,
  normalizePaymentSettings,
  normalizeSubscriptionSettings,
} from "@/lib/payments/payment-config-utils";
import type {
  ClubPaymentSettings as ClubPaymentSettingsType,
  ClubSubscriptionSettings,
  HubExtraService,
} from "@/lib/payments/payment-types";

// Tipologie club (selezione multipla)
const CLUB_TYPES_LIST = ["Dilettante", "Professionista", "Altro"];

// Regimi fiscali comuni in Italia
const TAX_REGIMES_LIST = [
  "Ordinario",
  "398/1991 (ASD/SSD)",
  "Forfettario (L.190/2014)",
  "Regime dei minimi",
  "Altro",
];

// Lista completa degli sport
const SPORTS_LIST = [
  "Calcio",
  "Basket",
  "Pallavolo",
  "Tennis",
  "Nuoto",
  "Atletica Leggera",
  "Rugby",
  "Pallamano",
  "Ciclismo",
  "Ginnastica",
  "Scherma",
  "Judo",
  "Karate",
  "Taekwondo",
  "Boxe",
  "Canottaggio",
  "Vela",
  "Sci",
  "Pattinaggio",
  "Hockey",
  "Golf",
  "Equitazione",
  "Tiro a Segno",
  "Tiro con l'Arco",
  "Altro",
];

// Lista federazioni italiane
const ITALIAN_FEDERATIONS = [
  "FIGC - Federazione Italiana Giuoco Calcio",
  "FIP - Federazione Italiana Pallacanestro",
  "FIPAV - Federazione Italiana Pallavolo",
  "FIT - Federazione Italiana Tennis",
  "FIN - Federazione Italiana Nuoto",
  "FIDAL - Federazione Italiana Atletica Leggera",
  "FIR - Federazione Italiana Rugby",
  "FIGH - Federazione Italiana Giuoco Handball",
  "FCI - Federazione Ciclistica Italiana",
  "FGI - Federazione Ginnastica d'Italia",
  "FIS - Federazione Italiana Scherma",
  "FIJLKAM - Federazione Italiana Judo Lotta Karate Arti Marziali",
  "FPI - Federazione Pugilistica Italiana",
  "FIC - Federazione Italiana Canottaggio",
  "FIV - Federazione Italiana Vela",
  "FISI - Federazione Italiana Sport Invernali",
  "FISG - Federazione Italiana Sport del Ghiaccio",
  "FIH - Federazione Italiana Hockey",
  "FIG - Federazione Italiana Golf",
  "FISE - Federazione Italiana Sport Equestri",
  "FITAV - Federazione Italiana Tiro a Volo",
  "UITS - Unione Italiana Tiro a Segno",
  "FITARCO - Federazione Italiana Tiro con l'Arco",
  "CONI - Comitato Olimpico Nazionale Italiano",
  "CIP - Comitato Italiano Paralimpico",
  "ASI - Associazioni Sportive e Sociali Italiane",
  "CSEN - Centro Sportivo Educativo Nazionale",
  "UISP - Unione Italiana Sport Per tutti",
  "Altro",
];

interface StructurePayment {
  id: string;
  date: string;
  amount: number;
  description?: string;
}

interface ClubStructure {
  id: string;
  name: string;
  address: string;
  isPublic: boolean;
  isRentable: boolean;
  payments: StructurePayment[];
}

/**
 * Attesa prima di scrivere una sezione in autosave. Un secondo e la pausa
 * naturale fra due parole digitate: piu corto genera una scrittura per
 * carattere, piu lungo fa sembrare che non stia salvando niente.
 */
const CLUB_AUTOSAVE_DEBOUNCE_MS = 1000;

/** Le sezioni che si salvano da sole, nell'ordine in cui vanno scritte. */
const AUTOSAVE_SECTIONS = CLUB_PROFILE_SECTIONS.filter(
  (section) => section.autosave,
).map((section) => section.id);

export default function OrganizationPage() {
  const searchParams = useSearchParams() ?? new URLSearchParams();
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [selectedSports, setSelectedSports] = useState<string[]>([]);
  const [customSport, setCustomSport] = useState("");
  const [showCustomSportInput, setShowCustomSportInput] = useState(false);
  const [sportComboboxOpen, setSportComboboxOpen] = useState(false);
  const [sportSearchQuery, setSportSearchQuery] = useState("");

  const [selectedTypes, setSelectedTypes] = useState<string[]>(["Dilettante"]);
  const [customType, setCustomType] = useState("");
  const [showCustomTypeInput, setShowCustomTypeInput] = useState(false);

  const [taxRegimePreset, setTaxRegimePreset] =
    useState<string>("398/1991 (ASD/SSD)");
  const [customTaxRegime, setCustomTaxRegime] = useState("");
  const [showCustomTaxRegimeInput, setShowCustomTaxRegimeInput] =
    useState(false);

  const [companyEmail, setCompanyEmail] = useState("");
  const [companyPec, setCompanyPec] = useState("");
  const [clubSnapshot, setClubSnapshot] = useState<any | null>(null);
  const [paymentSettings, setPaymentSettings] =
    useState<ClubPaymentSettingsType>(() => normalizePaymentSettings(null));
  const [subscriptionSettings, setSubscriptionSettings] =
    useState<ClubSubscriptionSettings>(() => normalizeSubscriptionSettings(null));
  const [extraServices, setExtraServices] = useState<HubExtraService[]>(() =>
    normalizeExtraServices([]),
  );
  const [activeTab, setActiveTab] = useState("generale");

  const organizationTabs = [
    { value: "generale", label: "Generale" },
    { value: "fiscali", label: "Dati Fiscali" },
    { value: "bancari", label: "Dati Bancari" },
    { value: "contatti", label: "Contatti" },
    { value: "federazione", label: "Federazione" },
    { value: "stagioni", label: "Stagioni" },
    { value: "pagamenti", label: "Pagamenti" },
    { value: "fatturazione", label: "Account e Fatturazione" },
    { value: "social", label: "Social" },
  ];

  useEffect(() => {
    const requestedTab = searchParams.get("tab");
    if (requestedTab === "stagioni" || requestedTab === "stagione") {
      setActiveTab("stagioni");
    } else if (requestedTab === "pagamenti" || requestedTab === "payments") {
      setActiveTab("pagamenti");
    } else if (
      requestedTab === "fatturazione" ||
      requestedTab === "billing"
    ) {
      setActiveTab("fatturazione");
    }
  }, [searchParams]);

  const handlePrevTab = () => {
    setActiveTab((prev) => {
      const index = organizationTabs.findIndex((t) => t.value === prev);
      const newIndex =
        (index - 1 + organizationTabs.length) % organizationTabs.length;
      return organizationTabs[newIndex]?.value ?? prev;
    });
  };

  const handleNextTab = () => {
    setActiveTab((prev) => {
      const index = organizationTabs.findIndex((t) => t.value === prev);
      const newIndex = (index + 1) % organizationTabs.length;
      return organizationTabs[newIndex]?.value ?? prev;
    });
  };
  const [organizationData, setOrganizationData] = useState({
    // Generale
    name: "",
    type: "dilettante",
    foundingYear: "",
    address: "",
    city: "",
    postalCode: "",
    region: "",
    province: "",
    country: "Italia",

    // Dati Fiscali - Anagrafica
    businessName: "",
    pec: "",
    vatNumber: "",
    fiscalCode: "",
    taxRegime: "",
    atecoCode: "",
    sdiCode: "",

    // Dati Fiscali - Sede Legale
    legalAddress: "",
    legalCity: "",
    legalPostalCode: "",
    legalCountry: "Italia",
    legalRegion: "",
    legalProvince: "",

    // Dati Fiscali - Legale Rappresentante
    representativeName: "",
    representativeSurname: "",
    representativeFiscalCode: "",

    // Dati Bancari
    bankName: "",
    iban: "",

    // Contatti
    contact1Name: "",
    contact1Phone: "",
    contact1Email: "",
    contact2Name: "",
    contact2Phone: "",
    contact2Email: "",

    // Social
    facebook: "",
    instagram: "",
    twitter: "",
    youtube: "",
    website: "",
  });
const [federations, setFederations] = useState<any[]>([]);
  const [clubId, setClubId] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!showCustomTaxRegimeInput) {
      setOrganizationData((prev) => ({ ...prev, taxRegime: taxRegimePreset }));
    }
  }, [taxRegimePreset, showCustomTaxRegimeInput]);
  useEffect(() => {
    // Load logo from localStorage after mount
    const savedLogo = localStorage.getItem("organization-logo");
    if (savedLogo) {
      setLogoPreview(savedLogo);
    }
  }, []);

  useEffect(() => {
    const loadClubData = async () => {
      try {
        const urlParams = new URLSearchParams(window.location.search);
        const urlClubId = urlParams.get("clubId");

        let activeClubId = urlClubId;

        if (!activeClubId) {
          const activeClub = localStorage.getItem("activeClub");
          if (activeClub) {
            try {
              const parsedClub = JSON.parse(activeClub);
              activeClubId = parsedClub.id;
            } catch (e) {
              console.error("Error parsing active club:", e);
            }
          }
        }

        if (!activeClubId) {
          console.log("No club ID found");
          return;
        }

        setClubId(activeClubId);

        const { getClub } = await import("@/lib/simplified-db");
        const clubData = await getClub(activeClubId);

        if (clubData) {
          setClubSnapshot(clubData);
          const settings =
            typeof (clubData as any).settings === "object" && (clubData as any).settings
              ? ((clubData as any).settings as Record<string, any>)
              : {};
          setPaymentSettings(normalizePaymentSettings(settings.paymentSettings));
          setSubscriptionSettings(
            /*
              Da quale chiave si legge il piano lo decide un posto solo:
              questa pagina e il calcolo degli entitlement leggevano chiavi
              diverse, e il club vedeva un piano che il server non usava.
            */
            normalizeSubscriptionSettings(
              readSubscriptionSettingsSource(settings),
            ),
          );
          setExtraServices(normalizeExtraServices(settings.extraServices));

          setOrganizationData({
            name: clubData.name || "",
            type: (clubData as any).type || settings.type || "dilettante",
            foundingYear:
              (clubData as any).founding_year || settings.foundingYear || "",
            address: clubData.address || "",
            city: clubData.city || "",
            postalCode: clubData.postal_code || "",
            region: clubData.region || "",
            province: clubData.province || "",
            country: clubData.country || "Italia",
            businessName:
              clubData.business_name || settings.businessName || "",
            pec: clubData.pec || settings.pec || settings.companyPec || "",
            vatNumber: clubData.vat_number || "",
            fiscalCode: clubData.fiscal_code || "",
            taxRegime: clubData.tax_regime || settings.tax_regime || "",
            atecoCode: (clubData as any).ateco_code || settings.atecoCode || "",
            sdiCode: clubData.sdi_code || "",
            legalAddress: clubData.legal_address || "",
            legalCity: clubData.legal_city || "",
            legalPostalCode: clubData.legal_postal_code || "",
            legalCountry: clubData.legal_country || "Italia",
            legalRegion: clubData.legal_region || "",
            legalProvince: clubData.legal_province || "",
            representativeName: clubData.representative_name || "",
            representativeSurname: clubData.representative_surname || "",
            representativeFiscalCode: clubData.representative_fiscal_code || "",
            bankName: clubData.bank_name || "",
            iban: clubData.iban || "",
            contact1Name: (clubData as any).contact1_name || settings.contact1Name || "",
            contact1Phone:
              (clubData as any).phone1 ||
              settings.contact1Phone ||
              clubData.contact_phone ||
              settings.phone ||
              "",
            contact1Email:
              (clubData as any).email1 ||
              settings.contact1Email ||
              clubData.contact_email ||
              settings.email ||
              "",
            contact2Name: (clubData as any).contact2_name || settings.contact2Name || "",
            contact2Phone: (clubData as any).phone2 || settings.contact2Phone || "",
            contact2Email: (clubData as any).email2 || settings.contact2Email || "",
            facebook: (clubData as any).facebook || settings.facebook || "",
            instagram: (clubData as any).instagram || settings.instagram || "",
            twitter: (clubData as any).twitter || settings.twitter || "",
            youtube: (clubData as any).youtube || settings.youtube || "",
            website: (clubData as any).website || settings.website || "",
          });
          // Multi Tipologia (da colonna o da settings)
          const rawTypes: any =
            (clubData as any)?.types ??
            (clubData as any)?.settings?.types ??
            null;

          const fallbackType: string | null =
            (clubData as any)?.type ??
            (clubData as any)?.settings?.type ??
            null;

          const typesArray: string[] = Array.isArray(rawTypes)
            ? rawTypes
            : fallbackType
              ? [fallbackType]
              : [];

          if (typesArray.length) {
            const normalized = typesArray.map((t) => {
              // normalize legacy lowercase values
              if (t === "dilettante") return "Dilettante";
              if (t === "professionista") return "Professionista";
              return t;
            });
            setSelectedTypes(normalized);
            const hasCustom = normalized.some(
              (t) => !CLUB_TYPES_LIST.includes(t),
            );
            setShowCustomTypeInput(hasCustom);
            if (hasCustom) {
              const custom = normalized.find(
                (t) => !CLUB_TYPES_LIST.includes(t),
              );
              if (custom) setCustomType(custom);
            }
          } else {
            setSelectedTypes(["Dilettante"]);
          }

          // Email/PEC società
          const emailSoc =
            (clubData as any)?.email ??
            (clubData as any)?.settings?.email ??
            (clubData as any)?.email1 ??
            "";

          const pecSoc =
            (clubData as any)?.pec ??
            (clubData as any)?.settings?.pec ??
            (clubData as any)?.settings?.companyPec ??
            "";

          setCompanyEmail(emailSoc || "");
          setCompanyPec(pecSoc || "");

          // Regime fiscale (preset + altro)
          const taxValue =
            (clubData as any)?.tax_regime ??
            (clubData as any)?.settings?.tax_regime ??
            "";

          if (taxValue) {
            if (TAX_REGIMES_LIST.includes(taxValue)) {
              setTaxRegimePreset(taxValue);
              setShowCustomTaxRegimeInput(false);
              setCustomTaxRegime("");
            } else {
              setTaxRegimePreset("Altro");
              setShowCustomTaxRegimeInput(true);
              setCustomTaxRegime(taxValue);
              setOrganizationData((prev) => ({ ...prev, taxRegime: taxValue }));
            }
          }

          if (clubData.sports && Array.isArray(clubData.sports)) {
            setSelectedSports(clubData.sports);
          } else if (clubData.sport) {
            setSelectedSports([clubData.sport]);
          }

          if (clubData.logo_url) {
            setLogoPreview(clubData.logo_url);
          }

          if ((clubData as any).federations) {
            setFederations((clubData as any).federations);
          } else if (Array.isArray(settings.federations)) {
            setFederations(settings.federations);
          }
        }
      } catch (error) {
        console.error("Error loading club data:", error);
      }
    };

    loadClubData();
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setOrganizationData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSelectChange = (name: string, value: string) => {
    setOrganizationData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  // Tipologia: stesso comportamento dello Sport (dropdown + Altro + multi-selezione)
  const handleTypeSelect = (value: string) => {
    if (value === "Altro") {
      setShowCustomTypeInput(true);
      return;
    }

    setShowCustomTypeInput(false);
    setCustomType("");

    setSelectedTypes((prev) =>
      prev.includes(value) ? prev : [...prev, value],
    );
  };

  const addCustomType = () => {
    const v = customType.trim();
    if (!v) return;
    setSelectedTypes((prev) => (prev.includes(v) ? prev : [...prev, v]));
    setCustomType("");
    setShowCustomTypeInput(false);
  };

  const removeType = (typeLabel: string) => {
    setSelectedTypes((prev) => prev.filter((t) => t !== typeLabel));
  };

  const handleTaxRegimeSelect = (value: string) => {
    setTaxRegimePreset(value);
    if (value === "Altro") {
      setShowCustomTaxRegimeInput(true);
      // keep existing custom value
      return;
    }
    setShowCustomTaxRegimeInput(false);
    // persist directly in organizationData
    setOrganizationData((prev) => ({ ...prev, taxRegime: value }));
  };
  const handleSportToggle = (sport: string) => {
    const normalizedSport = sport.trim();

    if (!normalizedSport) {
      return;
    }

    if (normalizedSport === "Altro") {
      setShowCustomSportInput((previous) => !previous);
      return;
    }

    setSelectedSports((prev) =>
      prev.includes(normalizedSport)
        ? prev.filter((s) => s !== normalizedSport)
        : [...prev, normalizedSport],
    );
  };

  const addCustomSport = () => {
    if (customSport.trim() && !selectedSports.includes(customSport.trim())) {
      setSelectedSports([...selectedSports, customSport.trim()]);
      setCustomSport("");
      setShowCustomSportInput(false);
    }
  };

  const removeSport = (sport: string) => {
    setSelectedSports(selectedSports.filter((s) => s !== sport));
  };

  const filteredSportsList = SPORTS_LIST.filter((sport) =>
    sport.toLowerCase().includes(sportSearchQuery.trim().toLowerCase()),
  );

  const handleLogoChange = (logoData: string | null) => {
    setLogoPreview(logoData);
    if (logoData) {
      localStorage.setItem("organization-logo", logoData);
    } else {
      localStorage.removeItem("organization-logo");
    }
  };

  const syncActiveSeasonLocally = (seasonId: string, seasonLabel: string) => {
    if (typeof window === "undefined") {
      return;
    }

    const activeClubRaw = localStorage.getItem("activeClub");
    if (!activeClubRaw) {
      return;
    }

    try {
      const parsedClub = JSON.parse(activeClubRaw);
      const nextClub = {
        ...parsedClub,
        activeSeasonId: seasonId,
        activeSeasonLabel: seasonLabel,
      };

      localStorage.setItem("activeClub", JSON.stringify(nextClub));
      if (parsedClub?.id) {
        const matchingKeys = [];
        for (let index = 0; index < localStorage.length; index += 1) {
          const key = localStorage.key(index);
          if (key && key.startsWith("activeClub_")) {
            matchingKeys.push(key);
          }
        }

        matchingKeys.forEach((key) => {
          localStorage.setItem(key, JSON.stringify(nextClub));
        });
      }

      window.dispatchEvent(
        new CustomEvent("club-updated", {
          detail: { clubData: nextClub },
        }),
      );
    } catch (error) {
      console.error("Error syncing active season locally:", error);
    }
  };

  // --- autosave della scheda club --------------------------------------------

  const clubProfileDraft = React.useMemo<ClubProfileDraft>(
    () => ({
      name: organizationData.name,
      logoUrl: logoPreview || "",
      types: selectedTypes,
      sports: selectedSports,
      foundingYear: organizationData.foundingYear,
      address: organizationData.address,
      city: organizationData.city,
      postalCode: organizationData.postalCode,
      region: organizationData.region,
      province: organizationData.province,
      country: organizationData.country,
      contact1Name: organizationData.contact1Name,
      contact1Phone: organizationData.contact1Phone,
      contact1Email: organizationData.contact1Email,
      contact2Name: organizationData.contact2Name,
      contact2Phone: organizationData.contact2Phone,
      contact2Email: organizationData.contact2Email,
      companyEmail,
      companyPec,
      website: organizationData.website,
      facebook: organizationData.facebook,
      instagram: organizationData.instagram,
      twitter: organizationData.twitter,
      youtube: organizationData.youtube,
      businessName: organizationData.businessName,
      vatNumber: organizationData.vatNumber,
      fiscalCode: organizationData.fiscalCode,
      taxRegime: showCustomTaxRegimeInput ? customTaxRegime : taxRegimePreset,
      atecoCode: organizationData.atecoCode,
      sdiCode: organizationData.sdiCode,
      legalAddress: organizationData.legalAddress,
      legalCity: organizationData.legalCity,
      legalPostalCode: organizationData.legalPostalCode,
      legalRegion: organizationData.legalRegion,
      legalProvince: organizationData.legalProvince,
      legalCountry: organizationData.legalCountry,
      representativeName: organizationData.representativeName,
      representativeSurname: organizationData.representativeSurname,
      representativeFiscalCode: organizationData.representativeFiscalCode,
      bankName: organizationData.bankName,
      iban: organizationData.iban,
      federations,
      paymentSettings: normalizePaymentSettings(paymentSettings),
    }),
    [
      companyEmail,
      companyPec,
      customTaxRegime,
      federations,
      logoPreview,
      organizationData,
      paymentSettings,
      selectedSports,
      selectedTypes,
      showCustomTaxRegimeInput,
      taxRegimePreset,
    ],
  );

  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const persistedSectionsRef = React.useRef(new Map<string, string>());
  /*
    Cosa sta trattenendo una sezione, se qualcosa lo sta facendo.

    Serve al salvataggio: senza, il successo di **un'altra** sezione scriveva
    «Salvato» sopra l'errore di quella che si sta modificando, e chi aveva
    appena digitato un IBAN incompleto leggeva che era stato salvato. Trovato
    in UAT su staging.
  */
  const blockingRef = React.useRef<string | null>(null);
  const seededClubIdRef = React.useRef<string | null>(null);
  const autosaveRunnerRef = React.useRef<
    | ((value: {
        draft: ClubProfileDraft;
        entries: { section: ClubProfileSectionId; snapshot: string }[];
      }) => Promise<void>)
    | null
  >(null);

  // Cambiando club il runner precedente scriverebbe sul club sbagliato.
  React.useEffect(() => {
    autosaveRunnerRef.current = null;
    seededClubIdRef.current = null;
  }, [clubId]);

  // Stato di partenza: quello appena caricato dal server. Prima di averlo,
  // l'autosave non deve partire, o riscriverebbe il club con un form vuoto.
  React.useEffect(() => {
    if (!clubId || !clubSnapshot || seededClubIdRef.current === clubId) {
      return;
    }

    seededClubIdRef.current = clubId;
    const snapshots = new Map<string, string>();
    AUTOSAVE_SECTIONS.forEach((section) => {
      snapshots.set(section, clubProfileSectionSnapshot(section, clubProfileDraft));
    });
    persistedSectionsRef.current = snapshots;
  }, [clubId, clubProfileDraft, clubSnapshot]);

  const syncClubIdentityLocally = React.useCallback(
    (name: string, logoUrl: string) => {
      try {
        const rawActiveClub = localStorage.getItem("activeClub");
        if (rawActiveClub) {
          const parsedClub = JSON.parse(rawActiveClub);
          if (parsedClub?.id === clubId) {
            parsedClub.name = name;
            parsedClub.logo_url = logoUrl || parsedClub.logo_url;
            localStorage.setItem("activeClub", JSON.stringify(parsedClub));
          }
        }
        localStorage.setItem("organization-name", name);
        if (logoUrl) {
          localStorage.setItem("organization-logo", logoUrl);
        }
        window.dispatchEvent(
          new CustomEvent("club-updated", {
            detail: { clubId, name, logo_url: logoUrl },
          }),
        );
      } catch (error) {
        console.error("Error syncing club identity locally:", error);
      }
    },
    [clubId],
  );

  const persistClubSections = React.useCallback(
    async (
      draft: ClubProfileDraft,
      entries: { section: ClubProfileSectionId; snapshot: string }[],
    ) => {
      if (!clubId || entries.length === 0) {
        return;
      }

      if (!autosaveRunnerRef.current) {
        /*
          Una scrittura per volta, con accorpamento di quelle richieste nel
          frattempo (WP-36). L'accorpamento lavora sull'**insieme** delle
          sezioni sporche, non su una sola: due sezioni diverse scritte in
          parallelo rileggerebbero `settings` entrambe e la seconda
          cancellerebbe la prima.
        */
        autosaveRunnerRef.current = createCoalescingSaver(
          async ({ draft: payload, entries: targets }) => {
            setSaveState("saving");
            try {
              for (const target of targets) {
                if (
                  persistedSectionsRef.current.get(target.section) ===
                  target.snapshot
                ) {
                  continue;
                }

                await saveClubProfileSection(clubId, target.section, payload);
                persistedSectionsRef.current.set(target.section, target.snapshot);

                if (target.section === "generale") {
                  syncClubIdentityLocally(payload.name.trim(), payload.logoUrl);
                }
              }

              setSavedAt(new Date());
              if (blockingRef.current) {
                setSaveError(blockingRef.current);
                setSaveState("error");
              } else {
                setSaveError(null);
                setSaveState("saved");
              }
            } catch (error: any) {
              console.error("Error autosaving club section:", error);
              setSaveError(
                error?.message || "Non salvato: riprova a modificare",
              );
              setSaveState("error");
            }
          },
          {
            isEqual: ({ entries: targets }) =>
              targets.every(
                (target) =>
                  persistedSectionsRef.current.get(target.section) ===
                  target.snapshot,
              ),
          },
        );
      }

      await autosaveRunnerRef.current({ draft, entries });
    },
    [clubId, syncClubIdentityLocally],
  );

  /*
    L'autosave guarda **tutte** le sezioni, non quella aperta.

    Era il difetto piu costoso della scheda: l'effetto dipendeva da
    `activeTab`, quindi cambiando scheda entro il secondo di attesa il timer
    veniva annullato e la modifica appena scritta spariva senza dire niente.
    Adesso cambiare scheda non interrompe nulla, e anche uscire dalla pagina
    trova al piu un secondo di lavoro non ancora scritto.
  */
  React.useEffect(() => {
    if (!clubId || seededClubIdRef.current !== clubId) {
      return;
    }

    const dirty: { section: ClubProfileSectionId; snapshot: string }[] = [];
    let blocking: string | null = null;

    for (const section of AUTOSAVE_SECTIONS) {
      const snapshot = clubProfileSectionSnapshot(section, clubProfileDraft);
      if (persistedSectionsRef.current.get(section) === snapshot) {
        continue;
      }

      /*
        Un valore incompleto non si scrive e si dice perche. E il sostituto
        del pulsante «Salva», che non impediva di salvare un IBAN sbagliato:
        si limitava a chiedere un clic in piu.
      */
      const problem = validateClubProfileSection(section, clubProfileDraft);
      if (problem) {
        blocking = blocking || problem;
        continue;
      }

      dirty.push({ section, snapshot });
    }

    blockingRef.current = blocking;

    if (blocking) {
      setSaveError(blocking);
      setSaveState("error");
    } else {
      setSaveError((current) => (current ? null : current));
      setSaveState((current) => (current === "error" ? "idle" : current));
    }

    if (dirty.length === 0) {
      return;
    }

    const timer = setTimeout(() => {
      void persistClubSections(clubProfileDraft, dirty);
    }, CLUB_AUTOSAVE_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [clubId, clubProfileDraft, persistClubSections]);

  const addFederation = () => {
    const newFederation = {
      id: `fed-${Date.now()}`,
      name: "",
      registrationNumber: "",
      affiliationDate: new Date().toISOString().split("T")[0],
    };
    setFederations([...federations, newFederation]);
  };

  const updateFederation = (id: string, field: string, value: string) => {
    setFederations(
      federations.map((fed) =>
        fed.id === id ? { ...fed, [field]: value } : fed,
      ),
    );
  };

  const deleteFederation = (id: string) => {
    setFederations(federations.filter((fed) => fed.id !== id));
  };

  if (!mounted) {
    return null;
  }

  const renderOrganizationMainContent = () => (
    <main className={dashboardMainClassName}>
      <DashboardPageContainer>
        <SharedPageHeader
          title="Club"
          subtitle="Gestisci struttura, ruoli e informazioni del tuo club."
          /*
            Lo stato del salvataggio sta **una volta sola**, in testa alla
            pagina, e vale per tutte le schede: prima ce n'era uno in fondo
            che riguardava solo la scheda aperta, accanto a un pulsante che
            invece salvava tutto.
          */
          actions={
            <SaveStatus
              state={saveState}
              savedAt={savedAt}
              message={saveError}
            />
          }
        />
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          {/* Mobile carousel for tabs */}
          <div className="flex items-center gap-2 mb-4 md:hidden">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={handlePrevTab}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="flex-1 text-center">
              <span className="inline-flex items-center justify-center rounded-full bg-primary/10 px-4 py-1.5 text-base font-medium text-primary">
                {organizationTabs.find((t) => t.value === activeTab)?.label ??
                  "Tab"}
              </span>
            </div>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={handleNextTab}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          {/* Desktop / tablet tabs list */}
          <TabsList className="hidden md:flex w-full items-center justify-start gap-2 lg:gap-3 overflow-x-auto whitespace-nowrap px-1">
            {organizationTabs.map((tab) => (
              <TabsTrigger
                key={tab.value}
                value={tab.value}
                className="justify-start text-left flex-shrink-0 px-3"
              >
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>

          {/* GENERALE */}
          <TabsContent value="generale" className="space-y-4 mt-4">
            <Card>
              <CardHeader>
                <CardTitle>Informazioni Generali</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-col items-center mb-6">
                  <LogoUpload
                    currentLogo={logoPreview}
                    onLogoChange={handleLogoChange}
                    name={organizationData.name}
                    aspectRatio="square"
                  />
                  <p className="text-sm text-muted-foreground mt-2">
                    Trascina o clicca per caricare il logo
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Nome</Label>
                    <CapitalizedInput
                      id="name"
                      name="name"
                      value={organizationData.name}
                      onChange={handleChange}
                      onValueChange={(value) => handleSelectChange("name", value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Tipologia</Label>
                    <div className="flex flex-wrap gap-2 mb-2">
                      {selectedTypes.map((t) => (
                        <Badge
                          key={t}
                          variant="secondary"
                          className="flex items-center gap-1"
                        >
                          {t}
                          <X
                            className="h-3 w-3 cursor-pointer"
                            onClick={() => removeType(t)}
                          />
                        </Badge>
                      ))}
                    </div>
                    <Select onValueChange={handleTypeSelect}>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleziona una tipologia" />
                      </SelectTrigger>
                      <SelectContent>
                        {CLUB_TYPES_LIST.map((t) => (
                          <SelectItem key={t} value={t}>
                            {t}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    {showCustomTypeInput && (
                      <div className="flex gap-2 mt-2">
                        <Input
                          value={customType}
                          onChange={(e) => setCustomType(e.target.value)}
                          placeholder="Inserisci tipologia"
                        />
                        <Button type="button" onClick={addCustomType}>
                          Aggiungi
                        </Button>
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="foundingYear">Anno di Fondazione</Label>
                  <Input
                    id="foundingYear"
                    name="foundingYear"
                    type="number"
                    value={organizationData.foundingYear}
                    onChange={handleChange}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Sport</Label>
                  <div className="flex flex-wrap gap-2 mb-2">
                    {selectedSports.map((sport) => (
                      <Badge
                        key={sport}
                        variant="secondary"
                        className="flex items-center gap-1"
                      >
                        {sport}
                        <X
                          className="h-3 w-3 cursor-pointer"
                          onClick={() => removeSport(sport)}
                        />
                      </Badge>
                    ))}
                  </div>
                  <div className="relative">
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full justify-between"
                      aria-expanded={sportComboboxOpen}
                      onClick={() => {
                        setSportComboboxOpen((open) => !open);
                        setSportSearchQuery("");
                      }}
                    >
                      Aggiungi sport
                      <ChevronDown
                        className={cn(
                          "h-4 w-4 opacity-60 transition-transform",
                          sportComboboxOpen && "rotate-180",
                        )}
                      />
                    </Button>
                    {sportComboboxOpen ? (
                      <div className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-50 rounded-xl border border-slate-200 bg-white p-2 shadow-xl">
                        <Input
                          value={sportSearchQuery}
                          onChange={(event) =>
                            setSportSearchQuery(event.target.value)
                          }
                          placeholder="Cerca sport..."
                          className="mb-2 h-9"
                          autoFocus
                        />
                        <div className="max-h-72 overflow-y-auto">
                          {filteredSportsList.length > 0 ? (
                            filteredSportsList.map((sport) => (
                              <button
                                key={sport}
                                type="button"
                                className="flex w-full items-center rounded-lg px-3 py-2 text-left text-sm transition hover:bg-blue-50 focus:bg-blue-50 focus:outline-none"
                                onClick={() => {
                                  handleSportToggle(sport);
                                  setSportComboboxOpen(false);
                                  setSportSearchQuery("");
                                }}
                              >
                                <Check
                                  className={cn(
                                    "mr-2 h-4 w-4 text-blue-600",
                                    selectedSports.includes(sport)
                                      ? "opacity-100"
                                      : "opacity-0",
                                  )}
                                />
                                {sport}
                              </button>
                            ))
                          ) : (
                            <p className="px-3 py-4 text-sm text-slate-500">
                              Nessuno sport trovato
                            </p>
                          )}
                        </div>
                      </div>
                    ) : null}
                  </div>
                  {showCustomSportInput && (
                    <div className="flex gap-2 mt-2">
                      <Input
                        placeholder="Inserisci nome sport"
                        value={customSport}
                        onChange={(e) => setCustomSport(e.target.value)}
                      />
                      <Button onClick={addCustomSport} size="sm">
                        Aggiungi
                      </Button>
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="address">Indirizzo</Label>
                  <CapitalizedInput
                      id="address"
                      name="address"
                      value={organizationData.address}
                      onChange={handleChange}
                      onValueChange={(value) => handleSelectChange("address", value)}
                    />
                </div>

                <AssistedAddressFields
                  idPrefix="club-operational"
                  values={{
                    postalCode: organizationData.postalCode,
                    city: organizationData.city,
                    province: organizationData.province,
                    region: organizationData.region,
                    country: organizationData.country,
                  }}
                  onChange={(patch) =>
                    setOrganizationData((prev) => ({ ...prev, ...patch }))
                  }
                />
              </CardContent>
            </Card>
          </TabsContent>

          {/* DATI FISCALI */}
          <TabsContent value="fiscali" className="space-y-4 mt-4">
            <Card>
              <CardHeader>
                <CardTitle>Anagrafica</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="businessName">Ragione Sociale</Label>
                    <CapitalizedInput
                      id="businessName"
                      name="businessName"
                      value={organizationData.businessName}
                      onChange={handleChange}
                      onValueChange={(value) => handleSelectChange("businessName", value)}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="vatNumber">P.IVA</Label>
                    <Input
                      id="vatNumber"
                      name="vatNumber"
                      value={organizationData.vatNumber}
                      onChange={handleChange}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="fiscalCode">Codice Fiscale</Label>
                    <Input
                      id="fiscalCode"
                      name="fiscalCode"
                      value={organizationData.fiscalCode}
                      onChange={handleChange}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="taxRegime">Regime Fiscale</Label>
                    <Select
                      value={taxRegimePreset}
                      onValueChange={handleTaxRegimeSelect}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Seleziona regime fiscale" />
                      </SelectTrigger>
                      <SelectContent>
                        {TAX_REGIMES_LIST.map((r) => (
                          <SelectItem key={r} value={r}>
                            {r}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    {showCustomTaxRegimeInput && (
                      <div className="space-y-2 pt-2">
                        <Label htmlFor="customTaxRegime">
                          Regime fiscale custom
                        </Label>
                        <Input
                          id="customTaxRegime"
                          value={customTaxRegime}
                          onChange={(e) => {
                            const v = e.target.value;
                            setCustomTaxRegime(v);
                            setOrganizationData((prev) => ({
                              ...prev,
                              taxRegime: v,
                            }));
                          }}
                          placeholder="Scrivi il tuo regime fiscale"
                        />
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="atecoCode">Codice ATECO</Label>
                    <Input
                      id="atecoCode"
                      name="atecoCode"
                      value={organizationData.atecoCode}
                      onChange={handleChange}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="sdiCode">Codice SDI</Label>
                  <Input
                    id="sdiCode"
                    name="sdiCode"
                    value={organizationData.sdiCode}
                    onChange={handleChange}
                    placeholder="Codice per fatturazione elettronica"
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Sede Legale</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="legalAddress">Indirizzo</Label>
                  <CapitalizedInput
                      id="legalAddress"
                      name="legalAddress"
                      value={organizationData.legalAddress}
                      onChange={handleChange}
                      onValueChange={(value) => handleSelectChange("legalAddress", value)}
                    />
                </div>

                <AssistedAddressFields
                  idPrefix="club-legal"
                  values={{
                    postalCode: organizationData.legalPostalCode,
                    city: organizationData.legalCity,
                    province: organizationData.legalProvince,
                    region: organizationData.legalRegion,
                    country: organizationData.legalCountry,
                  }}
                  onChange={(patch) =>
                    setOrganizationData((prev) => ({
                      ...prev,
                      ...(patch.postalCode !== undefined
                        ? { legalPostalCode: patch.postalCode }
                        : {}),
                      ...(patch.city !== undefined
                        ? { legalCity: patch.city }
                        : {}),
                      ...(patch.province !== undefined
                        ? { legalProvince: patch.province }
                        : {}),
                      ...(patch.region !== undefined
                        ? { legalRegion: patch.region }
                        : {}),
                      ...(patch.country !== undefined
                        ? { legalCountry: patch.country }
                        : {}),
                    }))
                  }
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Legale Rappresentante</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="representativeName">Nome</Label>
                    <CapitalizedInput
                      id="representativeName"
                      name="representativeName"
                      value={organizationData.representativeName}
                      onChange={handleChange}
                      onValueChange={(value) => handleSelectChange("representativeName", value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="representativeSurname">Cognome</Label>
                    <CapitalizedInput
                      id="representativeSurname"
                      name="representativeSurname"
                      value={organizationData.representativeSurname}
                      onChange={handleChange}
                      onValueChange={(value) => handleSelectChange("representativeSurname", value)}
                    />
                  </div>
                </div>

                <AssistedFiscalCodeField
                  id="representativeFiscalCode"
                  label="Codice Fiscale"
                  value={organizationData.representativeFiscalCode}
                  onChange={(value) =>
                    setOrganizationData((prev) => ({
                      ...prev,
                      representativeFiscalCode: value,
                    }))
                  }
                  person={{
                    firstName: organizationData.representativeName,
                    lastName: organizationData.representativeSurname,
                  }}
                  enableCompute={false}
                />
              </CardContent>
            </Card>
          </TabsContent>

          {/* DATI BANCARI */}
          <TabsContent value="bancari" className="space-y-4 mt-4">
            <Card>
              <CardHeader>
                <CardTitle>Dati Bancari</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="iban">IBAN</Label>
                  <Input
                    id="iban"
                    name="iban"
                    value={organizationData.iban}
                    onChange={handleChange}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="bankName">Nome Banca</Label>
                  <CapitalizedInput
                      id="bankName"
                      name="bankName"
                      value={organizationData.bankName}
                      onChange={handleChange}
                      onValueChange={(value) => handleSelectChange("bankName", value)}
                    />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* CONTATTI */}
          <TabsContent value="contatti" className="space-y-4 mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Building className="h-5 w-5" />
                  Dati Società
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="companyEmail">Email Società</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                      <Input
                        id="companyEmail"
                        type="email"
                        value={companyEmail}
                        onChange={(e) => setCompanyEmail(e.target.value)}
                        className="pl-10"
                        placeholder="email@societa.it"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="companyPec">PEC</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                      <Input
                        id="companyPec"
                        type="email"
                        value={companyPec}
                        onChange={(e) => setCompanyPec(e.target.value)}
                        className="pl-10"
                        placeholder="pec@pec.it"
                      />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <User className="h-5 w-5" />
                  Contatto 1
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="contact1Name">Nome Contatto</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                    <CapitalizedInput
                      id="contact1Name"
                      name="contact1Name"
                      value={organizationData.contact1Name}
                      onChange={handleChange}
                      onValueChange={(value) => handleSelectChange("contact1Name", value)}
                      className="pl-10"
                      placeholder="Nome e Cognome"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <PhoneField
                    id="contact1Phone"
                    label="Telefono"
                    value={organizationData.contact1Phone}
                    onChange={(value) => handleSelectChange("contact1Phone", value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="contact1Email">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                    <Input
                      id="contact1Email"
                      name="contact1Email"
                      type="email"
                      value={organizationData.contact1Email}
                      onChange={handleChange}
                      className="pl-10"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <User className="h-5 w-5" />
                  Contatto 2
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="contact2Name">Nome Contatto</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                    <CapitalizedInput
                      id="contact2Name"
                      name="contact2Name"
                      value={organizationData.contact2Name}
                      onChange={handleChange}
                      onValueChange={(value) => handleSelectChange("contact2Name", value)}
                      className="pl-10"
                      placeholder="Nome e Cognome"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <PhoneField
                    id="contact2Phone"
                    label="Telefono"
                    value={organizationData.contact2Phone}
                    onChange={(value) => handleSelectChange("contact2Phone", value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="contact2Email">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                    <Input
                      id="contact2Email"
                      name="contact2Email"
                      type="email"
                      value={organizationData.contact2Email}
                      onChange={handleChange}
                      className="pl-10"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* FEDERAZIONE */}
          <TabsContent value="federazione" className="space-y-4 mt-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Federazioni e Affiliazioni</CardTitle>
                  <Button onClick={addFederation} size="sm">
                    <Plus className="h-4 w-4 mr-2" />
                    Aggiungi
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Federazione/Ente</TableHead>
                      <TableHead>Codice Affiliazione</TableHead>
                      <TableHead>Data Affiliazione</TableHead>
                      <TableHead className="w-[100px]">Azioni</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {federations.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={4}
                          className="text-center text-muted-foreground"
                        >
                          Nessuna affiliazione registrata
                        </TableCell>
                      </TableRow>
                    ) : (
                      federations.map((fed) => (
                        <TableRow key={fed.id}>
                          <TableCell>
                            <Select
                              value={fed.name}
                              onValueChange={(value) => {
                                if (value === "Altro") {
                                  updateFederation(fed.id, "name", "");
                                } else {
                                  updateFederation(fed.id, "name", value);
                                }
                              }}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Seleziona federazione" />
                              </SelectTrigger>
                              <SelectContent>
                                {ITALIAN_FEDERATIONS.map((federation) => (
                                  <SelectItem
                                    key={federation}
                                    value={federation}
                                  >
                                    {federation}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            {(!fed.name ||
                              !ITALIAN_FEDERATIONS.includes(fed.name)) && (
                              <Input
                                value={fed.name}
                                onChange={(e) =>
                                  updateFederation(
                                    fed.id,
                                    "name",
                                    e.target.value,
                                  )
                                }
                                placeholder="Inserisci nome manualmente"
                                className="mt-2"
                              />
                            )}
                          </TableCell>
                          <TableCell>
                            <Input
                              value={fed.registrationNumber}
                              onChange={(e) =>
                                updateFederation(
                                  fed.id,
                                  "registrationNumber",
                                  e.target.value,
                                )
                              }
                              placeholder="Es. 123456"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="date"
                              value={fed.affiliationDate}
                              onChange={(e) =>
                                updateFederation(
                                  fed.id,
                                  "affiliationDate",
                                  e.target.value,
                                )
                              }
                            />
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => deleteFederation(fed.id)}
                            >
                              <Trash2 className="h-4 w-4 text-red-600" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="stagioni" className="space-y-4 mt-4">
            <SeasonManager
              onActiveSeasonChange={(season) =>
                syncActiveSeasonLocally(season.id, season.label)
              }
            />
          </TabsContent>
          <TabsContent value="pagamenti" className="space-y-4 mt-4">
            {/*
              Gating vero, e non un 403 dopo il click: questa scheda configura
              **solo** gli incassi online, che sono una funzione del piano. I
              metodi manuali della societa non stanno qui e restano
              raggiungibili. Il riquadro dice quale delle quattro strade
              prendere — piano, abbonamento, servizio, assistenza — perche
              sono quattro cose diverse e le percorrono persone diverse.
            */}
            <CapabilityGate feature="online_payments">
              <ClubPaymentSettings
                value={paymentSettings}
                onChange={setPaymentSettings}
                organizationId={clubId}
              />
            </CapabilityGate>
          </TabsContent>

          <TabsContent value="fatturazione" className="space-y-4 mt-4">
            {/*
              Sola lettura: il piano e i servizi appartengono alla
              piattaforma. Lasciarli scegliere qui vorrebbe dire permettere a
              una societa di concedersi il piano superiore da sola (D37), che
              e esattamente cio che impediva di accendere il gating vero.
            */}
            <ClubBillingSettings
              subscription={subscriptionSettings}
              extraServices={extraServices}
              readOnly
            />

            {/*
              Il profilo fiscale sta qui e non in Dati generali: l'anagrafica
              risponde a «come si chiama e dove la trovo», questo a «che
              soggetto e davanti al fisco». Sono due domande che cambiano in
              momenti diversi (ADR-0052). Sta sotto l'abbonamento perche e la
              stessa scheda in cui si guarda quando si parla di documenti.
            */}
            <FiscalProfilePanel organizationId={clubId} />
          </TabsContent>
{/* SOCIAL */}
          <TabsContent value="social" className="space-y-4 mt-4">
            <Card>
              <CardHeader>
                <CardTitle>Social Media e Web</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="facebook">Facebook</Label>
                  <Input
                    id="facebook"
                    name="facebook"
                    value={organizationData.facebook}
                    onChange={handleChange}
                    placeholder="https://facebook.com/..."
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="instagram">Instagram</Label>
                  <Input
                    id="instagram"
                    name="instagram"
                    value={organizationData.instagram}
                    onChange={handleChange}
                    placeholder="https://instagram.com/..."
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="twitter">X (Twitter)</Label>
                  <Input
                    id="twitter"
                    name="twitter"
                    value={organizationData.twitter}
                    onChange={handleChange}
                    placeholder="https://x.com/..."
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="youtube">YouTube</Label>
                  <Input
                    id="youtube"
                    name="youtube"
                    value={organizationData.youtube}
                    onChange={handleChange}
                    placeholder="https://youtube.com/..."
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="website">Sito Web</Label>
                  <Input
                    id="website"
                    name="website"
                    value={organizationData.website}
                    onChange={handleChange}
                    placeholder="https://..."
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </DashboardPageContainer>
    </main>
  );

  return (
    <div className="flex h-[100dvh] bg-gray-50 dark:bg-gray-900">
      {/* Desktop layout */}
      <div className="hidden lg:flex w-full">
        <Sidebar />
        <div className="flex flex-1 flex-col overflow-hidden">
          <Header title="Club" />
          {renderOrganizationMainContent()}
        </div>
      </div>

      {/* Mobile layout */}
      <div className="flex min-w-0 flex-1 flex-col lg:hidden">
        <MobileTopBar />
        {renderOrganizationMainContent()}
      </div>
    </div>
  );
}
