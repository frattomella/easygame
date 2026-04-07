"use client";

import React, { useState, useEffect } from "react";
import Sidebar from "@/components/dashboard/Sidebar";
import Header from "@/components/dashboard/Header";
import { MobileTopBar } from "@/components/layout/MobileTopBar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast-notification";
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
  X,
} from "lucide-react";
import Image from "next/image";
import { LogoUpload } from "@/components/ui/avatar-upload";
import { Switch } from "@/components/ui/switch";
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
import {
  applySeasonIdToCollection,
  buildSeasonLabelFromDates,
  createSeasonDraft,
  normalizeClubSeasons,
  type ClubSeason,
} from "@/lib/club-seasons";

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

const SEASON_COPYABLE_FIELDS = [
  { key: "categories", label: "Categorie" },
  { key: "trainings", label: "Allenamenti" },
  { key: "weekly_schedule", label: "Programma settimanale" },
  { key: "matches", label: "Gare" },
  { key: "payment_plans", label: "Piani pagamento" },
  { key: "discounts", label: "Sconti" },
  { key: "transactions", label: "Movimenti" },
  { key: "sponsor_payments", label: "Pagamenti sponsor" },
] as const;

type SeasonCopyField = (typeof SEASON_COPYABLE_FIELDS)[number]["key"];

export default function OrganizationPage() {
  const { showToast } = useToast();
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [selectedSports, setSelectedSports] = useState<string[]>([]);
  const [customSport, setCustomSport] = useState("");
  const [showCustomSportInput, setShowCustomSportInput] = useState(false);

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
  const [seasons, setSeasons] = useState<ClubSeason[]>([]);
  const [activeSeasonId, setActiveSeasonId] = useState<string | null>(null);
  const [seasonForm, setSeasonForm] = useState({
    label: "",
    startDate: "",
    endDate: "",
  });
  const [seasonCopyOptions, setSeasonCopyOptions] = useState<
    Record<SeasonCopyField, boolean>
  >({
    categories: true,
    trainings: false,
    weekly_schedule: false,
    matches: false,
    payment_plans: true,
    discounts: true,
    transactions: false,
    sponsor_payments: false,
  });

  const [activeTab, setActiveTab] = useState("generale");

  const organizationTabs = [
    { value: "generale", label: "Generale" },
    { value: "fiscali", label: "Dati Fiscali" },
    { value: "bancari", label: "Dati Bancari" },
    { value: "contatti", label: "Contatti" },
    { value: "federazione", label: "Federazione" },
    { value: "stagioni", label: "Stagioni" },
    { value: "social", label: "Social" },
  ];

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
          const seasonState = normalizeClubSeasons(settings);
          setSeasons(seasonState.seasons);
          setActiveSeasonId(seasonState.activeSeasonId);
          setSeasonForm({
            label: "",
            startDate: "",
            endDate: "",
          });

          setOrganizationData({
            name: clubData.name || "",
            type: (clubData as any).type || settings.type || "dilettante",
            foundingYear:
              (clubData as any).founding_year || settings.foundingYear || "",
            address: clubData.address || "",
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
    if (sport === "Altro") {
      setShowCustomSportInput(!showCustomSportInput);
      return;
    }

    setSelectedSports((prev) =>
      prev.includes(sport) ? prev.filter((s) => s !== sport) : [...prev, sport],
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

  const persistSeasonSettings = async (
    nextSeasons: ClubSeason[],
    nextActiveSeasonId: string,
    extraUpdates: Record<string, any> = {},
  ) => {
    if (!clubId) {
      throw new Error("Club non trovato");
    }

    const { getClub, updateClub } = await import("@/lib/simplified-db");
    const latestClub = clubSnapshot || (await getClub(clubId));
    const latestSettings =
      typeof latestClub?.settings === "object" && latestClub.settings
        ? latestClub.settings
        : {};
    const data = await updateClub(clubId, {
      seasons: nextSeasons,
      activeSeasonId: nextActiveSeasonId,
      settings: {
        ...latestSettings,
        seasons: nextSeasons,
        activeSeasonId: nextActiveSeasonId,
      },
      ...extraUpdates,
    });

    setClubSnapshot(data);
    setSeasons(nextSeasons);
    setActiveSeasonId(nextActiveSeasonId);

    const activeSeason =
      nextSeasons.find((season) => season.id === nextActiveSeasonId) ||
      nextSeasons[0];
    if (activeSeason) {
      syncActiveSeasonLocally(activeSeason.id, activeSeason.label);
    }

    return data;
  };

  const handleActivateSeason = async (seasonId: string) => {
    const selectedSeason = seasons.find((season) => season.id === seasonId);
    if (!selectedSeason) {
      return;
    }

    try {
      await persistSeasonSettings(seasons, selectedSeason.id);
      showToast("success", `Stagione attiva impostata su ${selectedSeason.label}`);
    } catch (error) {
      console.error("Error updating active season:", error);
      showToast("error", "Errore nel cambio stagione");
    }
  };

  const handleCreateSeason = async () => {
    if (!clubId) {
      showToast("error", "Club non trovato");
      return;
    }

    const label =
      seasonForm.label.trim() ||
      buildSeasonLabelFromDates(seasonForm.startDate, seasonForm.endDate);

    if (!seasonForm.startDate || !seasonForm.endDate) {
      showToast("error", "Inserisci data inizio e data fine stagione");
      return;
    }

    if (new Date(seasonForm.startDate) >= new Date(seasonForm.endDate)) {
      showToast("error", "La data di fine deve essere successiva alla data di inizio");
      return;
    }

    const nextSeason = createSeasonDraft(label, seasonForm.startDate, seasonForm.endDate);
    const currentSeasonId =
      activeSeasonId ||
      normalizeClubSeasons(clubSnapshot?.settings || {}).activeSeasonId;
    const baseSnapshot =
      clubSnapshot || (await (await import("@/lib/simplified-db")).getClub(clubId));
    const extraUpdates: Record<string, any> = {};

    SEASON_COPYABLE_FIELDS.forEach(({ key }) => {
      const currentItems = Array.isArray(baseSnapshot?.[key]) ? baseSnapshot[key] : [];
      const seasonAwareItems = currentSeasonId
        ? applySeasonIdToCollection(currentItems, currentSeasonId)
        : currentItems;

      const shouldCopy = seasonCopyOptions[key];
      if (!shouldCopy) {
        extraUpdates[key] = seasonAwareItems;
        return;
      }

      const itemsToClone = seasonAwareItems.filter(
        (item: any) => item?.seasonId === currentSeasonId,
      );
      const clonedItems = itemsToClone.map((item: any, index: number) => ({
        ...item,
        id: `${key}-${nextSeason.id}-${index}-${Math.random().toString(36).slice(2, 7)}`,
        seasonId: nextSeason.id,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }));

      extraUpdates[key] = [...seasonAwareItems, ...clonedItems];
    });

    try {
      const nextSeasons = [nextSeason, ...seasons].map((season) => ({
        ...season,
        status: season.id === nextSeason.id ? "active" : season.status,
      }));
      await persistSeasonSettings(nextSeasons, nextSeason.id, extraUpdates);
      setSeasonForm({
        label: "",
        startDate: "",
        endDate: "",
      });
      showToast("success", `Nuova stagione ${nextSeason.label} creata correttamente`);
    } catch (error) {
      console.error("Error creating season:", error);
      showToast("error", "Errore nella creazione della stagione");
    }
  };

  const handleSave = async () => {
    try {
      let currentClubId = clubId;
      if (!currentClubId) {
        try {
          const activeClubData = localStorage.getItem("activeClub");
          if (activeClubData) {
            const activeClub = JSON.parse(activeClubData);
            currentClubId = activeClub.id;
            setClubId(currentClubId);
          }
        } catch (error) {
          console.error("Error getting club ID from localStorage:", error);
        }
      }

      if (!currentClubId) {
        showToast(
          "error",
          "Nessun club attivo trovato. Seleziona un club prima di salvare.",
        );
        return;
      }

      if (!organizationData.name.trim()) {
        showToast("error", "Il nome dell'organizzazione è obbligatorio");
        return;
      }

      const { updateClub } = await import("@/lib/simplified-db");

      const updateData = {
        name: organizationData.name.trim(),
        type: selectedTypes[0] || organizationData.type,
        types: selectedTypes,
        founding_year: organizationData.foundingYear,
        sports: selectedSports,
        sport: selectedSports[0] || "",
        business_name: organizationData.businessName,
        pec: companyPec,
        email: companyEmail,
        vat_number: organizationData.vatNumber,
        fiscal_code: organizationData.fiscalCode,
        tax_regime: showCustomTaxRegimeInput
          ? customTaxRegime
          : taxRegimePreset,
        ateco_code: organizationData.atecoCode,
        sdi_code: organizationData.sdiCode,
        legal_address: organizationData.legalAddress,
        legal_city: organizationData.legalCity,
        legal_postal_code: organizationData.legalPostalCode,
        legal_country: organizationData.legalCountry,
        legal_region: organizationData.legalRegion,
        legal_province: organizationData.legalProvince,
        representative_name: organizationData.representativeName,
        representative_surname: organizationData.representativeSurname,
        representative_fiscal_code: organizationData.representativeFiscalCode,
        bank_name: organizationData.bankName,
        iban: organizationData.iban,
        address: organizationData.address,
        postal_code: organizationData.postalCode,
        region: organizationData.region,
        province: organizationData.province,
        country: organizationData.country,
        contact1_name: organizationData.contact1Name,
        phone1: organizationData.contact1Phone,
        email1: organizationData.contact1Email,
        contact2_name: organizationData.contact2Name,
        phone2: organizationData.contact2Phone,
        email2: organizationData.contact2Email,
        facebook: organizationData.facebook,
        instagram: organizationData.instagram,
        twitter: organizationData.twitter,
        youtube: organizationData.youtube,
        website: organizationData.website,
        logo_url: logoPreview || "",
        federations: federations,
        seasons,
        activeSeasonId,
        updated_at: new Date().toISOString(),
      };

      const updatedClub = await updateClub(currentClubId, updateData);
      setClubSnapshot(updatedClub);

      if (logoPreview) {
        localStorage.setItem("organization-logo", logoPreview);
      }
      localStorage.setItem("organization-name", organizationData.name);

      const activeSeason = seasons.find((season) => season.id === activeSeasonId);
      if (activeSeason) {
        syncActiveSeasonLocally(activeSeason.id, activeSeason.label);
      }

      const activeClub = localStorage.getItem("activeClub");
      if (activeClub) {
        try {
          const parsedClub = JSON.parse(activeClub);
          if (parsedClub.id === currentClubId) {
            parsedClub.name = organizationData.name;
            parsedClub.logo_url = logoPreview || parsedClub.logo_url;
            parsedClub.activeSeasonId = activeSeasonId || parsedClub.activeSeasonId;
            parsedClub.activeSeasonLabel =
              seasons.find((season) => season.id === activeSeasonId)?.label ||
              parsedClub.activeSeasonLabel;
            localStorage.setItem("activeClub", JSON.stringify(parsedClub));
          }
        } catch (e) {
          console.error("Error updating active club:", e);
        }
      }

      const event = new CustomEvent("club-updated", {
        detail: {
          clubId: currentClubId,
          name: organizationData.name,
          logo_url: logoPreview,
          activeSeasonLabel: activeSeason?.label || null,
        },
      });
      window.dispatchEvent(event);

      showToast(
        "success",
        "Informazioni organizzazione aggiornate con successo",
      );

      setTimeout(() => {
        window.location.reload();
      }, 1000);
    } catch (error) {
      console.error("Error saving organization data:", error);
      showToast("error", "Errore durante il salvataggio delle informazioni");
    }
  };

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
    <main className="flex-1 overflow-y-auto p-4 md:p-6">
      <div className="mx-auto max-w-9xl space-y-6">
        <div className="space-y-2">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
            Gestione Organizzazione
          </h1>
          <p className="text-gray-600 mt-2">
            Gestisci struttura, ruoli e informazioni del tuo club.
          </p>
        </div>
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
                    <Input
                      id="name"
                      name="name"
                      value={organizationData.name}
                      onChange={handleChange}
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
                  <Select onValueChange={handleSportToggle}>
                    <SelectTrigger>
                      <SelectValue placeholder="Seleziona uno sport" />
                    </SelectTrigger>
                    <SelectContent>
                      {SPORTS_LIST.map((sport) => (
                        <SelectItem key={sport} value={sport}>
                          {sport}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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
                  <Input
                    id="address"
                    name="address"
                    value={organizationData.address}
                    onChange={handleChange}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="postalCode">CAP</Label>
                    <Input
                      id="postalCode"
                      name="postalCode"
                      value={organizationData.postalCode}
                      onChange={handleChange}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="country">Nazione</Label>
                    <Input
                      id="country"
                      name="country"
                      value={organizationData.country}
                      onChange={handleChange}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="region">Regione</Label>
                    <Input
                      id="region"
                      name="region"
                      value={organizationData.region}
                      onChange={handleChange}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="province">Provincia</Label>
                    <Input
                      id="province"
                      name="province"
                      value={organizationData.province}
                      onChange={handleChange}
                    />
                  </div>
                </div>
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
                    <Input
                      id="businessName"
                      name="businessName"
                      value={organizationData.businessName}
                      onChange={handleChange}
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
                  <Input
                    id="legalAddress"
                    name="legalAddress"
                    value={organizationData.legalAddress}
                    onChange={handleChange}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="legalCity">Comune</Label>
                    <Input
                      id="legalCity"
                      name="legalCity"
                      value={organizationData.legalCity}
                      onChange={handleChange}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="legalPostalCode">CAP</Label>
                    <Input
                      id="legalPostalCode"
                      name="legalPostalCode"
                      value={organizationData.legalPostalCode}
                      onChange={handleChange}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="legalCountry">Paese</Label>
                    <Input
                      id="legalCountry"
                      name="legalCountry"
                      value={organizationData.legalCountry}
                      onChange={handleChange}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="legalRegion">Regione</Label>
                    <Input
                      id="legalRegion"
                      name="legalRegion"
                      value={organizationData.legalRegion}
                      onChange={handleChange}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="legalProvince">Provincia</Label>
                    <Input
                      id="legalProvince"
                      name="legalProvince"
                      value={organizationData.legalProvince}
                      onChange={handleChange}
                    />
                  </div>
                </div>
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
                    <Input
                      id="representativeName"
                      name="representativeName"
                      value={organizationData.representativeName}
                      onChange={handleChange}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="representativeSurname">Cognome</Label>
                    <Input
                      id="representativeSurname"
                      name="representativeSurname"
                      value={organizationData.representativeSurname}
                      onChange={handleChange}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="representativeFiscalCode">
                    Codice Fiscale
                  </Label>
                  <Input
                    id="representativeFiscalCode"
                    name="representativeFiscalCode"
                    value={organizationData.representativeFiscalCode}
                    onChange={handleChange}
                  />
                </div>
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
                  <Input
                    id="bankName"
                    name="bankName"
                    value={organizationData.bankName}
                    onChange={handleChange}
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
                    <Input
                      id="contact1Name"
                      name="contact1Name"
                      value={organizationData.contact1Name}
                      onChange={handleChange}
                      className="pl-10"
                      placeholder="Nome e Cognome"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="contact1Phone">Telefono</Label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                    <Input
                      id="contact1Phone"
                      name="contact1Phone"
                      type="tel"
                      value={organizationData.contact1Phone}
                      onChange={handleChange}
                      className="pl-10"
                    />
                  </div>
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
                    <Input
                      id="contact2Name"
                      name="contact2Name"
                      value={organizationData.contact2Name}
                      onChange={handleChange}
                      className="pl-10"
                      placeholder="Nome e Cognome"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="contact2Phone">Telefono</Label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                    <Input
                      id="contact2Phone"
                      name="contact2Phone"
                      type="tel"
                      value={organizationData.contact2Phone}
                      onChange={handleChange}
                      className="pl-10"
                    />
                  </div>
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
            <Card>
              <CardHeader>
                <CardTitle>Stagione attiva</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_auto]">
                  <div className="space-y-2">
                    <Label>Annualità selezionata per la dashboard</Label>
                    <Select
                      value={activeSeasonId || undefined}
                      onValueChange={setActiveSeasonId}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Seleziona stagione" />
                      </SelectTrigger>
                      <SelectContent>
                        {seasons.map((season) => (
                          <SelectItem key={season.id} value={season.id}>
                            {season.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-end">
                    <Button
                      onClick={() =>
                        activeSeasonId ? handleActivateSeason(activeSeasonId) : null
                      }
                      disabled={!activeSeasonId}
                    >
                      Applica stagione
                    </Button>
                  </div>
                </div>

                <div className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-800">
                  Ogni club può gestire più stagioni. Cambiando stagione attiva,
                  la dashboard e le configurazioni stagionali leggono l'annualità
                  selezionata mantenendo separati i dati storici.
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Crea una nuova stagione</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                  <div className="space-y-2">
                    <Label htmlFor="seasonLabel">Nome stagione</Label>
                    <Input
                      id="seasonLabel"
                      value={seasonForm.label}
                      onChange={(e) =>
                        setSeasonForm((current) => ({
                          ...current,
                          label: e.target.value,
                        }))
                      }
                      placeholder="Es. 2026/2027"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="seasonStart">Data inizio</Label>
                    <Input
                      id="seasonStart"
                      type="date"
                      value={seasonForm.startDate}
                      onChange={(e) =>
                        setSeasonForm((current) => ({
                          ...current,
                          startDate: e.target.value,
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="seasonEnd">Data fine</Label>
                    <Input
                      id="seasonEnd"
                      type="date"
                      value={seasonForm.endDate}
                      onChange={(e) =>
                        setSeasonForm((current) => ({
                          ...current,
                          endDate: e.target.value,
                        }))
                      }
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  <div>
                    <p className="font-medium text-slate-900">
                      Importa dati dalla stagione corrente
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Seleziona quali dati duplicare nella nuova stagione. Le
                      anagrafiche generali del club restano comunque disponibili.
                    </p>
                  </div>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                    {SEASON_COPYABLE_FIELDS.map((field) => (
                      <div
                        key={field.key}
                        className="flex items-center justify-between rounded-xl border p-3"
                      >
                        <span className="text-sm font-medium">{field.label}</span>
                        <Switch
                          checked={seasonCopyOptions[field.key]}
                          onCheckedChange={(checked) =>
                            setSeasonCopyOptions((current) => ({
                              ...current,
                              [field.key]: Boolean(checked),
                            }))
                          }
                        />
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex justify-end">
                  <Button onClick={handleCreateSeason}>
                    <Plus className="mr-2 h-4 w-4" />
                    Crea nuova stagione
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Archivio stagioni</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {seasons.map((season) => (
                  <div
                    key={season.id}
                    className="flex flex-col gap-3 rounded-2xl border p-4 md:flex-row md:items-center md:justify-between"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-slate-900">{season.label}</h3>
                        {season.id === activeSeasonId ? (
                          <Badge className="bg-blue-600">Attiva</Badge>
                        ) : null}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {season.startDate} - {season.endDate}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      onClick={() => handleActivateSeason(season.id)}
                      disabled={season.id === activeSeasonId}
                    >
                      {season.id === activeSeasonId ? "Stagione attiva" : "Apri stagione"}
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>
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

        <div className="flex justify-end mt-6">
          <Button
            className="bg-blue-600 hover:bg-blue-700"
            onClick={handleSave}
          >
            Salva Modifiche
          </Button>
        </div>
      </div>
    </main>
  );

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-900">
      {/* Desktop layout */}
      <div className="hidden lg:flex w-full">
        <Sidebar />
        <div className="flex flex-1 flex-col overflow-hidden">
          <Header title="Gestione Organizzazione" />
          {renderOrganizationMainContent()}
        </div>
      </div>

      {/* Mobile layout */}
      <div className="flex flex-1 flex-col lg:hidden">
        <MobileTopBar />
        {renderOrganizationMainContent()}
      </div>
    </div>
  );
}
