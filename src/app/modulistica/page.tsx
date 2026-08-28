"use client";

import React, { useState, useEffect } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Archive,
  Download,
  Edit,
  Plus,
  FileText,
  Search,
  MoreVertical,
  RotateCcw,
  Trash2,
} from "lucide-react";
import DocumentEditor, {
  DOCUMENT_TEMPLATE_TOKENS,
} from "@/components/forms/DocumentEditor";
import Sidebar from "@/components/dashboard/Sidebar";
import Header from "@/components/dashboard/Header";
import { MobileTopBar } from "@/components/layout/MobileTopBar";
import {
  DashboardPageContainer,
  dashboardMainClassName,
} from "@/components/dashboard/dashboard-page-container";
import { SharedPageHeader } from "@/components/dashboard/shared-page-header";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FormsDashboard } from "@/components/forms/forms-dashboard";
import {
  getClubAthletes,
  getClub,
  saveDocumentTemplate,
  getDocumentTemplates,
  updateDocumentTemplate,
  deleteDocumentTemplate,
} from "@/lib/simplified-db";
import { getDocumentTemplatesFromClub } from "@/lib/document-templates";
import {
  ATTESTATION_TEMPLATE_ID,
  ATTESTATION_TEMPLATE_TITLE,
  buildAttestationTemplate,
} from "@/lib/documents/attestation-template";
import { apiRequest } from "@/lib/api/client";
import { useToast } from "@/components/ui/use-toast";
import { AppLoadingScreen } from "@/components/ui/app-loading-screen";

type DocumentTemplate = {
  id: string;
  title: string;
  description: string;
  content: string;
  archived?: boolean;
  archivedAt?: string | null;
};

type Athlete = {
  id: string;
  first_name: string;
  last_name: string;
  birth_date: string;
  category_name?: string;
  data?: {
    [key: string]: any;
    category?: string;
    categoryName?: string;
    category_name?: string;
    fiscalCode?: string;
    fiscal_code?: string;
    address?: string;
    email?: string;
    phone?: string;
    medicalCertExpiry?: string;
    parentName?: string;
    guardianName?: string;
    parent_name?: string;
    guardian_name?: string;
    accessCode?: string;
    avatar?: string;
    status?: string;
  };
};

type ClubData = {
  id: string;
  name: string;
  logo_url?: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  postal_code?: string;
  vat_number?: string;
  fiscal_code?: string;
  website?: string;
  contact_email?: string;
  contact_phone?: string;
};

type StoredActiveClub = Partial<ClubData> & {
  id?: string;
  activeSeasonId?: string | null;
  activeSeasonLabel?: string | null;
};

const readStoredActiveClub = (): StoredActiveClub | null => {
  if (typeof window === "undefined") {
    return null;
  }

  const candidateKeys = ["activeClub"];

  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (key && key.startsWith("activeClub_")) {
      candidateKeys.push(key);
    }
  }

  for (const key of candidateKeys) {
    const rawValue = window.localStorage.getItem(key);
    if (!rawValue) {
      continue;
    }

    try {
      const parsedValue = JSON.parse(rawValue);
      if (parsedValue?.id) {
        return parsedValue as StoredActiveClub;
      }
    } catch {
      window.localStorage.removeItem(key);
    }
  }

  return null;
};

const normalizeClubData = (
  club: Partial<ClubData> | null | undefined,
  fallbackClub?: StoredActiveClub | null,
): ClubData => {
  const source = club || fallbackClub || {};

  return {
    id: String(source.id || fallbackClub?.id || ""),
    name: String(source.name || fallbackClub?.name || "EasyGame Club"),
    logo_url: source.logo_url || fallbackClub?.logo_url || "",
    email:
      source.email ||
      source.contact_email ||
      fallbackClub?.email ||
      fallbackClub?.contact_email ||
      "",
    phone:
      source.phone ||
      source.contact_phone ||
      fallbackClub?.phone ||
      fallbackClub?.contact_phone ||
      "",
    address: source.address || fallbackClub?.address || "",
    city: source.city || fallbackClub?.city || "",
    postal_code: source.postal_code || fallbackClub?.postal_code || "",
    vat_number: source.vat_number || fallbackClub?.vat_number || "",
    fiscal_code: source.fiscal_code || fallbackClub?.fiscal_code || "",
    website: source.website || fallbackClub?.website || "",
    contact_email:
      source.contact_email || fallbackClub?.contact_email || source.email || "",
    contact_phone:
      source.contact_phone || fallbackClub?.contact_phone || source.phone || "",
  };
};

const normalizeAthletes = (athletesData: any[]): Athlete[] =>
  (Array.isArray(athletesData) ? athletesData : [])
    .map((athlete) => {
      const data =
        typeof athlete?.data === "object" && athlete.data ? athlete.data : {};
      const firstName =
        athlete?.first_name ||
        athlete?.name ||
        data.first_name ||
        data.firstName ||
        "";
      const lastName =
        athlete?.last_name ||
        athlete?.surname ||
        data.last_name ||
        data.lastName ||
        "";

      return {
        ...athlete,
        first_name: String(firstName || "").trim(),
        last_name: String(lastName || "").trim(),
        birth_date: String(athlete?.birth_date || athlete?.birthDate || ""),
        data,
      } as Athlete;
    })
    .filter(
      (athlete) =>
        athlete &&
        athlete.id &&
        (athlete.first_name || athlete.last_name || athlete.data?.category),
    );

const normalizeTemplates = (value: any): DocumentTemplate[] =>
  getDocumentTemplatesFromClub(value)
    .map((item) => ({
      id: String(item?.id || item?.template_id || `template-${Date.now()}`),
      title: String(item?.title || item?.name || "Documento"),
      description: String(item?.description || item?.summary || ""),
      content: String(item?.content || item?.html || "<p></p>"),
      archived: Boolean(item?.archived || item?.status === "archived"),
      archivedAt: item?.archivedAt || item?.archived_at || null,
    }))
    .filter((template) => template.id && template.title);

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const escapeHtmlText = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const firstNonEmptyString = (...values: unknown[]) => {
  for (const value of values) {
    const candidate = String(value || "").trim();
    if (candidate) {
      return candidate;
    }
  }

  return "";
};

const signatureBlockHtml = (label: string) =>
  `<div style="margin: 28px 0 18px; padding: 18px; border: 1px dashed #94a3b8; border-radius: 8px; color: #475569; background-color: #f8fafc;"><strong>${label}</strong></div>`;

const renderBlankTemplateForPdf = (content: string) =>
  String(content || "")
    .replace(
      /<span[^>]*data-template-placeholder=["'][^"']+["'][^>]*>.*?<\/span>/gis,
      '<span class="blank-field"></span>',
    )
    .replace(
      /<div[^>]*data-signature-placeholder=["'][^"']+["'][^>]*>.*?<\/div>/gis,
      signatureBlockHtml("Firma"),
    )
    .replace(/{{\s*signature\.[^}]+}}/g, signatureBlockHtml("Firma"))
    .replace(/{{\s*[^}]+}}/g, '<span class="blank-field"></span>');

function ModulisticaPage() {
  const [templates, setTemplates] = useState<DocumentTemplate[]>([]);
  const [athletes, setAthletes] = useState<Athlete[]>([]);
  const [filteredAthletes, setFilteredAthletes] = useState<Athlete[]>([]);
  const [clubData, setClubData] = useState<ClubData | null>(null);
  const [athleteSearchTerm, setAthleteSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const { showToast } = useToast();

  const [activeView, setActiveView] = useState<"list" | "editor" | "compile">(
    "list",
  );
  const [activeTab, setActiveTab] = useState<
    "documents" | "online-forms" | "archive"
  >("documents");
  const [activeTemplate, setActiveTemplate] = useState<DocumentTemplate | null>(
    null,
  );
  const [compiledContent, setCompiledContent] = useState<string>("");
  const [selectedAthlete, setSelectedAthlete] = useState<string>("");
  const [showPdfDialog, setShowPdfDialog] = useState<boolean>(false);
  const [showCompileDialog, setShowCompileDialog] = useState<boolean>(false);
  const [newDocumentDialog, setNewDocumentDialog] = useState<boolean>(false);
  const [newDocumentTitle, setNewDocumentTitle] = useState<string>("");
  const [newDocumentDescription, setNewDocumentDescription] =
    useState<string>("");
  const [aiDescription, setAiDescription] = useState<string>("");
  /*
    L'anteprima del documento compilato. Non e un dettaglio di comodo: §5.5.24
    chiede che i segnaposto che il risolutore non ha saputo riempire siano
    **elencati prima di stampare**. Un'attestazione con tre righe bianche che
    nessuno ha notato e peggio di un modulo vuoto, perche sembra completa.
  */
  const [filledPreview, setFilledPreview] = useState<{
    title: string;
    html: string;
    unresolved: string[];
    missing: string[];
    warnings: string[];
  } | null>(null);
  const [generatingFilled, setGeneratingFilled] = useState<boolean>(false);
  const [addingAttestation, setAddingAttestation] = useState<boolean>(false);
  const [, setAiGeneratorDialog] = useState<boolean>(false);
  const [, setAiGenerating] = useState<boolean>(false);
  const [clubId, setClubId] = useState<string>("");

  const resolveCurrentClub = () => {
    const urlParams = new URLSearchParams(window.location.search);
    const storedActiveClub = readStoredActiveClub();
    const resolvedClubId =
      urlParams.get("clubId") || storedActiveClub?.id || clubId || "";

    return {
      storedActiveClub,
      resolvedClubId,
    };
  };

  // Load data on component mount
  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const action = params.get("action");
    if (!action) {
      return;
    }

    if (action === "new") {
      setNewDocumentDialog(true);
    }

    params.delete("action");
    const nextQuery = params.toString();
    const nextUrl = nextQuery
      ? `${window.location.pathname}?${nextQuery}`
      : window.location.pathname;
    window.history.replaceState(window.history.state, "", nextUrl);
  }, []);

  // Initialize club ID immediately when component mounts
  useEffect(() => {
    const initializeClubId = () => {
      try {
        const { resolvedClubId } = resolveCurrentClub();
        if (resolvedClubId) {
          setClubId(resolvedClubId);
          return;
        }

        console.warn(
          "No active club data found - some features may be limited",
        );
      } catch (error) {
        console.warn("Error initializing club ID:", error);
      }
    };

    initializeClubId();
  }, []);

  // Filter athletes based on search term
  useEffect(() => {
    if (athleteSearchTerm.trim() === "") {
      setFilteredAthletes(athletes);
    } else {
      const filtered = athletes.filter((athlete) => {
        const firstName = athlete.first_name || "";
        const lastName = athlete.last_name || "";
        const searchTerm = athleteSearchTerm.toLowerCase();

        return (
          firstName.toLowerCase().includes(searchTerm) ||
          lastName.toLowerCase().includes(searchTerm)
        );
      });
      setFilteredAthletes(filtered);
    }
  }, [athleteSearchTerm, athletes]);

  const loadData = async () => {
    try {
      setLoading(true);
      const { storedActiveClub, resolvedClubId } = resolveCurrentClub();
      if (!resolvedClubId) {
        showToast("error", "Nessun club attivo trovato");
        return;
      }

      setClubId(resolvedClubId);

      const club = await getClub(resolvedClubId);
      const normalizedClub = normalizeClubData(
        (club as Partial<ClubData> | null) || null,
        storedActiveClub,
      );
      setClubData(normalizedClub);

      const athletesData = await getClubAthletes(resolvedClubId);
      const validAthletes = normalizeAthletes(athletesData || []);
      setAthletes(validAthletes);
      setFilteredAthletes(validAthletes);

      const existingTemplates = normalizeTemplates(
        await getDocumentTemplates(resolvedClubId),
      );

      setTemplates(existingTemplates);
    } catch (error) {
      console.error("Error loading data:", error);
      showToast("error", "Errore nel caricamento dei dati");
    } finally {
      setLoading(false);
    }
  };

  const generateDocumentTemplates = (clubInput: ClubData | null) => {
    const club = normalizeClubData(clubInput);
    const logoHtml = club.logo_url
      ? `<div style="text-align: center; margin-bottom: 20px;"><img src="${club.logo_url}" alt="Logo ${club.name}" style="max-height: 100px; max-width: 200px;"/></div>`
      : "";

    const clubInfo = `
      <div style="margin-bottom: 20px;">
        <strong>${club.name}</strong><br/>
        ${club.address ? `${club.address}<br/>` : ""}
        ${club.city && club.postal_code ? `${club.postal_code} ${club.city}<br/>` : ""}
        ${club.email ? `Email: ${club.email}<br/>` : ""}
        ${club.phone ? `Tel: ${club.phone}<br/>` : ""}
        ${club.vat_number ? `P.IVA: ${club.vat_number}<br/>` : ""}
        ${club.fiscal_code ? `C.F.: ${club.fiscal_code}` : ""}
      </div>
    `;

    const generatedTemplates: DocumentTemplate[] = [
      {
        id: "1",
        title: "Modulo di iscrizione",
        description: "Modulo per nuovi atleti",
        content: `
          ${logoHtml}
          ${clubInfo}
          <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">Modulistica</h1><p class="text-gray-600 mt-2">Gestisci documenti, moduli e file condivisi del club.</p>
          <p><strong>Il/La sottoscritto/a:</strong></p>
          <p>Nome: <strong>{{first_name}}</strong></p>
          <p>Cognome: <strong>{{last_name}}</strong></p>
          <p>Data di nascita: <strong>{{birth_date}}</strong></p>
          <p>Codice Fiscale: <strong>{{fiscalCode}}</strong></p>
          <p>Indirizzo: <strong>{{address}}</strong></p>
          <p>Email: <strong>{{email}}</strong></p>
          <p>Telefono: <strong>{{phone}}</strong></p>
          <br/>
          <p><strong>CHIEDE</strong></p>
          <p>di essere iscritto/a alla società sportiva <strong>${club.name}</strong> per la stagione sportiva in corso.</p>
          <br/>
          <p>Data: _______________</p>
          <p>Firma: _______________</p>
        `,
      },
      {
        id: "2",
        title: "Liberatoria privacy",
        description: "Informativa sulla privacy",
        content: `
          ${logoHtml}
          ${clubInfo}
          <h1 style="text-align: center; color: #1e40af;">LIBERATORIA PRIVACY</h1>
          <p>Il/La sottoscritto/a <strong>{{first_name}} {{last_name}}</strong>, nato/a il <strong>{{birth_date}}</strong>, residente in <strong>{{address}}</strong>,</p>
          <br/>
          <p><strong>DICHIARA</strong></p>
          <p>di aver preso visione dell'informativa sul trattamento dei dati personali ai sensi del Regolamento UE 2016/679 (GDPR) e di prestare il proprio consenso al trattamento dei dati personali per le finalità indicate nell'informativa stessa.</p>
          <br/>
          <p><strong>AUTORIZZA</strong></p>
          <p>la società <strong>${club.name}</strong> al trattamento dei propri dati personali per:</p>
          <ul>
            <li>Gestione dell'attività sportiva</li>
            <li>Adempimenti fiscali e contabili</li>
            <li>Comunicazioni relative all'attività sportiva</li>
            <li>Pubblicazione di foto e video per scopi promozionali (previo consenso specifico)</li>
          </ul>
          <br/>
          <p>Data: _______________</p>
          <p>Firma: _______________</p>
        `,
      },
      {
        id: "3",
        title: "Autorizzazione trasferte",
        description: "Permesso per trasferte",
        content: `
          ${logoHtml}
          ${clubInfo}
          <h1 style="text-align: center; color: #1e40af;">AUTORIZZAZIONE TRASFERTE</h1>
          <p>Il/La sottoscritto/a <strong>{{first_name}} {{last_name}}</strong>, nato/a il <strong>{{birth_date}}</strong>,</p>
          <br/>
          <p><strong>AUTORIZZA</strong></p>
          <p>la società <strong>${club.name}</strong> ad organizzare trasferte e gare fuori sede per l'atleta sopra indicato.</p>
          <br/>
          <p><strong>DICHIARA</strong></p>
          <p>di sollevare la società da ogni responsabilità per eventuali danni che potrebbero verificarsi durante le trasferte, fatta eccezione per i casi di dolo o colpa grave.</p>
          <br/>
          <p><strong>SI IMPEGNA</strong></p>
          <p>a rispettare il regolamento interno della società e le disposizioni degli accompagnatori durante le trasferte.</p>
          <br/>
          <p>Data: _______________</p>
          <p>Firma dell'atleta: _______________</p>
          <p>Firma del genitore/tutore (se minorenne): _______________</p>
        `,
      },
      {
        id: "4",
        title: "Modulo rimborso",
        description: "Richiesta rimborsi",
        content: `
          ${logoHtml}
          ${clubInfo}
          <h1 style="text-align: center; color: #1e40af;">MODULO RIMBORSO</h1>
          <p>Il/La sottoscritto/a <strong>{{first_name}} {{last_name}}</strong>,</p>
          <p>Email: <strong>{{email}}</strong></p>
          <p>Telefono: <strong>{{phone}}</strong></p>
          <br/>
          <p><strong>CHIEDE</strong></p>
          <p>il rimborso delle seguenti spese sostenute per conto della società <strong>${club.name}</strong>:</p>
          <br/>
          <table border="1" style="width: 100%; border-collapse: collapse;">
            <tr>
              <th style="padding: 8px;">Data</th>
              <th style="padding: 8px;">Descrizione</th>
              <th style="padding: 8px;">Importo</th>
            </tr>
            <tr>
              <td style="padding: 8px;">___________</td>
              <td style="padding: 8px;">_________________________</td>
              <td style="padding: 8px;">€ _______</td>
            </tr>
            <tr>
              <td style="padding: 8px;">___________</td>
              <td style="padding: 8px;">_________________________</td>
              <td style="padding: 8px;">€ _______</td>
            </tr>
          </table>
          <br/>
          <p><strong>Totale richiesto: € ___________</strong></p>
          <br/>
          <p>Allega le ricevute/fatture originali.</p>
          <br/>
          <p>Data: _______________</p>
          <p>Firma: _______________</p>
        `,
      },
      {
        id: "5",
        title: "Regolamento interno",
        description: "Regole della società sportiva",
        content: `
          ${logoHtml}
          ${clubInfo}
          <h1 style="text-align: center; color: #1e40af;">REGOLAMENTO INTERNO</h1>
          <h2>Art. 1 - Finalità</h2>
          <p>La società <strong>${club.name}</strong> ha come finalità la promozione e la pratica dell'attività sportiva.</p>
          
          <h2>Art. 2 - Doveri degli atleti</h2>
          <ul>
            <li>Rispettare gli orari di allenamento e gara</li>
            <li>Mantenere un comportamento corretto e rispettoso</li>
            <li>Utilizzare l'abbigliamento ufficiale della società</li>
            <li>Rispettare le strutture e le attrezzature</li>
            <li>Seguire le indicazioni degli allenatori</li>
          </ul>
          
          <h2>Art. 3 - Sanzioni disciplinari</h2>
          <p>In caso di violazione del presente regolamento, potranno essere applicate le seguenti sanzioni:</p>
          <ul>
            <li>Richiamo verbale</li>
            <li>Richiamo scritto</li>
            <li>Sospensione temporanea</li>
            <li>Esclusione dalla società</li>
          </ul>
          
          <h2>Art. 4 - Disposizioni finali</h2>
          <p>Il presente regolamento entra in vigore dalla data di approvazione e può essere modificato dal Consiglio Direttivo.</p>
          <br/>
          <p>Data di approvazione: _______________</p>
          <p>Il Presidente: _______________</p>
        `,
      },
    ];

    return generatedTemplates;
  };

  const handleEditTemplate = (template: DocumentTemplate) => {
    setActiveTemplate(template);
    setActiveView("editor");
  };

  const handleSaveTemplate = async (content: string) => {
    if (activeTemplate && clubId) {
      try {
        // Update template in database
        await updateDocumentTemplate(clubId, activeTemplate.id, { content });

        // Update local state
        const updatedTemplates = templates.map((template) =>
          template.id === activeTemplate.id
            ? { ...template, content }
            : template,
        );
        setTemplates(updatedTemplates);
        setActiveView("list");
        setActiveTemplate(null);

        showToast("success", "Documento salvato con successo");
      } catch (error) {
        console.error("Error saving template:", error);
        showToast("error", "Errore nel salvataggio del documento");
      }
    }
  };

  const handleCreateNew = () => {
    setNewDocumentTitle("");
    setNewDocumentDescription("");
    setNewDocumentDialog(true);
  };

  const handleCreateNewConfirm = async () => {
    if (!newDocumentTitle.trim() || !newDocumentDescription.trim()) {
      showToast("error", "Inserisci titolo e descrizione del documento");
      return;
    }

    let currentClubId = clubId;
    if (!currentClubId) {
      const { resolvedClubId } = resolveCurrentClub();
      currentClubId = resolvedClubId;
      if (resolvedClubId) {
        setClubId(resolvedClubId);
      }
    }

    if (!currentClubId) {
      showToast("error", "ID club non disponibile. Ricarica la pagina e riprova.");
      return;
    }

    const newTemplate: DocumentTemplate = {
      id:
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `template-${Date.now()}`,
      title: newDocumentTitle.trim(),
      description: newDocumentDescription.trim(),
      content:
        "<h1>" +
        escapeHtmlText(newDocumentTitle.trim()) +
        "</h1><p>Inserisci il contenuto qui.</p>",
    };

    try {
      console.log("Creating template with club ID:", currentClubId);
      console.log("New template data:", newTemplate);
      // Save to database
      await saveDocumentTemplate(currentClubId, newTemplate);

      setTemplates([...templates, newTemplate]);
      setActiveTemplate(newTemplate);
      setActiveView("editor");
      setNewDocumentDialog(false);
      setNewDocumentTitle("");
      setNewDocumentDescription("");

      showToast("success", "Nuovo documento creato con successo");
    } catch (error) {
      console.error("Error creating template:", error);
      showToast("error", "Errore nella creazione del documento");
    }
  };

  const handleBackToList = () => {
    setActiveView("list");
    setActiveTemplate(null);
    setCompiledContent("");
  };

  const handleExportPdf = (template: DocumentTemplate) => {
    setActiveTemplate(template);
    setShowPdfDialog(true);
  };

  const handleCompileDocument = (template: DocumentTemplate) => {
    setActiveTemplate(template);
    setShowCompileDialog(true);
  };

  const compileDocument = () => {
    if (!activeTemplate || !selectedAthlete) return;

    const athlete = athletes.find((a) => a.id === selectedAthlete);
    if (!athlete) return;

    let compiledText = activeTemplate.content;
    const guardianName = firstNonEmptyString(
      athlete.data?.parentName,
      athlete.data?.guardianName,
      athlete.data?.parent_name,
      athlete.data?.guardian_name,
    );
    const parentFirstName = firstNonEmptyString(
      athlete.data?.parentFirstName,
      athlete.data?.parent_first_name,
      athlete.data?.guardianFirstName,
      athlete.data?.guardian_first_name,
      guardianName.split(" ")[0],
    );
    const parentLastName = firstNonEmptyString(
      athlete.data?.parentLastName,
      athlete.data?.parent_last_name,
      athlete.data?.guardianLastName,
      athlete.data?.guardian_last_name,
      guardianName.split(" ").slice(1).join(" "),
    );
    const parentPhone = firstNonEmptyString(
      athlete.data?.parentPhone,
      athlete.data?.parent_phone,
      athlete.data?.guardianPhone,
      athlete.data?.guardian_phone,
    );
    const parentEmail = firstNonEmptyString(
      athlete.data?.parentEmail,
      athlete.data?.parent_email,
      athlete.data?.guardianEmail,
      athlete.data?.guardian_email,
    );
    const categoryName = firstNonEmptyString(
      athlete.category_name,
      athlete.data?.categoryName,
      athlete.data?.category_name,
      athlete.data?.category,
    );
    const fiscalCode = firstNonEmptyString(
      athlete.data?.fiscalCode,
      athlete.data?.fiscal_code,
    );
    const medicalExpiry = firstNonEmptyString(
      athlete.data?.medicalCertExpiry,
      athlete.data?.medical_certificate_expiry_date,
      athlete.data?.medicalCertificateExpiryDate,
    );
    const medicalStatus = medicalExpiry ? "Presente" : "";

    // Replace placeholders with athlete data
    const replacements = {
      "athlete.first_name": athlete.first_name || "",
      "athlete.last_name": athlete.last_name || "",
      "athlete.birth_date": athlete.birth_date || "",
      "athlete.fiscal_code": fiscalCode,
      "athlete.address": athlete.data?.address || "",
      "athlete.email": athlete.data?.email || "",
      "athlete.phone": athlete.data?.phone || "",
      "athlete.category": categoryName,
      "athlete.category_name": categoryName,
      "parent.first_name": parentFirstName,
      "parent.last_name": parentLastName,
      "parent.phone": parentPhone,
      "parent.email": parentEmail,
      "parent.1.first_name": parentFirstName,
      "parent.1.last_name": parentLastName,
      "parent.1.phone": parentPhone,
      "parent.1.email": parentEmail,
      "parent.2.first_name": firstNonEmptyString(
        athlete.data?.parent2FirstName,
        athlete.data?.parent_2_first_name,
        athlete.data?.secondGuardianFirstName,
      ),
      "parent.2.last_name": firstNonEmptyString(
        athlete.data?.parent2LastName,
        athlete.data?.parent_2_last_name,
        athlete.data?.secondGuardianLastName,
      ),
      "parent.2.phone": firstNonEmptyString(
        athlete.data?.parent2Phone,
        athlete.data?.parent_2_phone,
        athlete.data?.secondGuardianPhone,
      ),
      "parent.2.email": firstNonEmptyString(
        athlete.data?.parent2Email,
        athlete.data?.parent_2_email,
        athlete.data?.secondGuardianEmail,
      ),
      "medical_certificate.status": medicalStatus,
      "medical_certificate.expiry_date": medicalExpiry,
      "club.name": clubData?.name || "",
      "club.address": clubData?.address || "",
      "club.city": clubData?.city || "",
      "club.email": clubData?.email || clubData?.contact_email || "",
      "club.phone": clubData?.phone || clubData?.contact_phone || "",
      "club.fiscal_code": clubData?.fiscal_code || "",
      "club.vat_number": clubData?.vat_number || "",
      "club.website": clubData?.website || "",
      current_date: new Date().toLocaleDateString("it-IT"),
      "season.year": readStoredActiveClub()?.activeSeasonLabel || "",
      "guardian.name": guardianName,
      "signature.parent": signatureBlockHtml("Firma genitore"),
      "signature.athlete": signatureBlockHtml("Firma atleta"),
      "signature.club_representative": signatureBlockHtml(
        "Firma presidente/club",
      ),
      "signature.trainer": signatureBlockHtml("Firma allenatore"),
      first_name: athlete.first_name || "",
      last_name: athlete.last_name || "",
      birth_date: athlete.birth_date || "",
      fiscalCode,
      address: athlete.data?.address || "",
      email: athlete.data?.email || "",
      phone: athlete.data?.phone || "",
      category: categoryName,
      "image.placeholder": "Immagine",
    };

    Object.entries(replacements).forEach(([key, value]) => {
      compiledText = compiledText.replace(
        new RegExp(`{{\\s*${escapeRegExp(key)}\\s*}}`, "g"),
        value,
      );
    });

    setCompiledContent(compiledText);
    setActiveView("compile");
    setShowCompileDialog(false);
  };

  const generatePdf = () => {
    if (!activeTemplate) return;

    const pdfContent = renderBlankTemplateForPdf(activeTemplate.content);
    const printWindow = window.open("", "_blank");
    if (printWindow) {
      printWindow.document.write(`
        <html>
          <head>
            <title>${activeTemplate.title}</title>
            <style>
              @page { size: A4; margin: 18mm; }
              body { font-family: Arial, sans-serif; background: #fff; color: #111827; }
              .pdf-container { max-width: 794px; margin: 0 auto; font-size: 14px; line-height: 1.65; }
              .blank-field { display: inline-block; min-width: 160px; height: 1.2em; border-bottom: 1px solid #94a3b8; vertical-align: baseline; }
              .easygame-page-break { break-before: page; page-break-before: always; height: 0; overflow: hidden; }
              img { max-width: 100%; height: auto; }
            </style>
          </head>
          <body>
            <div class="pdf-container">
              ${pdfContent}
            </div>
          </body>
        </html>
      `);
      printWindow.document.close();
      setTimeout(() => {
        printWindow.print();
      }, 500);
    }

    setShowPdfDialog(false);
  };

  /**
   * Il documento compilato: lo costruisce il server, qui si stampa e basta.
   *
   * Il risolutore vive in `src/lib/server/document-placeholders.ts` perche
   * legge il registro incassi e le presenze: farlo qui vorrebbe dire spedire
   * al browser l'intero storico economico di un atleta per stampare una riga,
   * e riscrivere nel client la formula della cassa (ADR-0068). Torna una
   * pagina gia impaginata **piu** l'elenco di cio che non e stato riempito.
   */
  const generateFilledPdf = async () => {
    if (!activeTemplate) return;
    if (!selectedAthlete || selectedAthlete === "no-athletes") {
      showToast("error", "Seleziona prima un atleta");
      return;
    }

    setGeneratingFilled(true);

    try {
      const params = new URLSearchParams({
        templateId: activeTemplate.id,
        athleteId: selectedAthlete,
      });

      const storedActiveClub = readStoredActiveClub();
      if (storedActiveClub?.activeSeasonId) {
        params.set("seasonId", String(storedActiveClub.activeSeasonId));
      }
      if (clubId) {
        params.set("clubId", clubId);
      }

      const { data, error } = await apiRequest<{
        title: string;
        html: string;
        unresolved: string[];
        missing: string[];
        warnings: string[];
      }>(`/api/v1/documents/filled?${params.toString()}`);

      if (error || !data) {
        showToast(
          "error",
          error?.message || "Errore nella generazione del documento",
        );
        return;
      }

      setShowPdfDialog(false);
      setFilledPreview({
        title: data.title,
        html: data.html,
        unresolved: Array.isArray(data.unresolved) ? data.unresolved : [],
        missing: Array.isArray(data.missing) ? data.missing : [],
        warnings: Array.isArray(data.warnings) ? data.warnings : [],
      });
    } catch (error) {
      console.error("Error generating filled document:", error);
      showToast("error", "Errore nella generazione del documento");
    } finally {
      setGeneratingFilled(false);
    }
  };

  const printFilledDocument = () => {
    if (!filledPreview) return;

    const printWindow = window.open("", "_blank");
    if (printWindow) {
      // La pagina arriva gia autonoma dal server — stile dentro, nessuna
      // richiesta verso l'esterno — quindi qui non si reimpagina niente.
      printWindow.document.write(filledPreview.html);
      printWindow.document.close();
      setTimeout(() => {
        printWindow.print();
      }, 500);
    }

    setFilledPreview(null);
  };

  /**
   * Semina il modello «Attestazione di pagamento e frequenza».
   *
   * Passa dalla creazione di sempre (`saveDocumentTemplate`): appena creato e
   * una bozza come le altre, modificabile e cancellabile. **Non** apre la
   * libreria dei modelli, che e lavoro editoriale e sta in Wave 3: qui ce n'e
   * uno, quello che ogni famiglia chiede.
   */
  const handleAddAttestationTemplate = async () => {
    if (!clubId) {
      showToast("error", "ID club non disponibile");
      return;
    }

    setAddingAttestation(true);

    try {
      await saveDocumentTemplate(clubId, buildAttestationTemplate());
      await loadData();
      showToast("success", `Modello «${ATTESTATION_TEMPLATE_TITLE}» aggiunto`);
    } catch (error) {
      console.error("Error seeding attestation template:", error);
      showToast("error", "Errore nella creazione del modello");
    } finally {
      setAddingAttestation(false);
    }
  };

  const handleDeleteTemplate = async (templateId: string) => {
    try {
      await deleteDocumentTemplate(clubId, templateId);
      const updatedTemplates = templates.filter((t) => t.id !== templateId);
      setTemplates(updatedTemplates);

      showToast("success", "Documento eliminato con successo");
    } catch (error) {
      console.error("Error deleting template:", error);
      showToast("error", "Errore nell'eliminazione del documento");
    }
  };

  const handleArchiveTemplate = async (template: DocumentTemplate) => {
    if (!clubId) {
      showToast("error", "ID club non disponibile");
      return;
    }

    const archivedAt = new Date().toISOString();

    try {
      await updateDocumentTemplate(clubId, template.id, {
        archived: true,
        archivedAt,
      });
      setTemplates((currentTemplates) =>
        currentTemplates.map((currentTemplate) =>
          currentTemplate.id === template.id
            ? { ...currentTemplate, archived: true, archivedAt }
            : currentTemplate,
        ),
      );
      showToast("success", "Documento archiviato");
    } catch (error) {
      console.error("Error archiving template:", error);
      showToast("error", "Errore nell'archiviazione del documento");
    }
  };

  const handleRestoreTemplate = async (template: DocumentTemplate) => {
    if (!clubId) {
      showToast("error", "ID club non disponibile");
      return;
    }

    try {
      await updateDocumentTemplate(clubId, template.id, {
        archived: false,
        archivedAt: null,
      });
      setTemplates((currentTemplates) =>
        currentTemplates.map((currentTemplate) =>
          currentTemplate.id === template.id
            ? { ...currentTemplate, archived: false, archivedAt: null }
            : currentTemplate,
        ),
      );
      showToast("success", "Documento ripristinato");
    } catch (error) {
      console.error("Error restoring template:", error);
      showToast("error", "Errore nel ripristino del documento");
    }
  };

  const generateAIDocument = async () => {
    if (!aiDescription.trim()) {
      showToast("error", "Inserisci una descrizione per il documento");
      return;
    }

    let currentClubId = clubId;
    const { storedActiveClub, resolvedClubId } = resolveCurrentClub();
    if (!currentClubId) {
      currentClubId = resolvedClubId;
      if (resolvedClubId) {
        setClubId(resolvedClubId);
      }
    }

    if (!currentClubId) {
      showToast("error", "ID club non disponibile. Ricarica la pagina e riprova.");
      return;
    }

    setAiGenerating(true);
    try {
      console.log("Generating AI document with club ID:", currentClubId);

      const club = normalizeClubData(
        (await getClub(currentClubId)) as Partial<ClubData> | null,
        storedActiveClub,
      );
      const logoHtml = club.logo_url
        ? `<div style="text-align: center; margin-bottom: 20px;"><img src="${club.logo_url}" alt="Logo ${club.name}" style="max-height: 100px; max-width: 200px;"/></div>`
        : "";

      const clubInfo = `
        <div style="margin-bottom: 20px;">
          <strong>${club.name || "Club"}</strong><br/>
          ${club.address ? `${club.address}<br/>` : ""}
          ${club.city && club.postal_code ? `${club.postal_code} ${club.city}<br/>` : ""}
          ${club.email ? `Email: ${club.email}<br/>` : ""}
          ${club.phone ? `Tel: ${club.phone}<br/>` : ""}
        </div>
      `;

      // Enhanced AI generation with club context and better content based on description
      const aiGeneratedContent = `
        ${logoHtml}
        ${clubInfo}
        <h1 style="text-align: center; color: #1e40af;">DOCUMENTO GENERATO DALL'IA</h1>
        <h2>Richiesta: ${aiDescription}</h2>
        <br/>
        <p>Questo documento è stato generato automaticamente per <strong>${club?.name || "il club"}</strong> in base alla descrizione fornita.</p>
        <br/>
        <div style="border: 1px solid #e2e8f0; padding: 15px; margin: 20px 0; background-color: #f8fafc;">
          <h3>Contenuto del documento:</h3>
          <p>${aiDescription}</p>
        </div>
        <br/>
        <p><strong>Dati dell'interessato:</strong></p>
        <p>Nome: <strong>{{first_name}}</strong></p>
        <p>Cognome: <strong>{{last_name}}</strong></p>
        <p>Data di nascita: <strong>{{birth_date}}</strong></p>
        <p>Codice Fiscale: <strong>{{fiscalCode}}</strong></p>
        <p>Indirizzo: <strong>{{address}}</strong></p>
        <p>Email: <strong>{{email}}</strong></p>
        <p>Telefono: <strong>{{phone}}</strong></p>
        <p>Categoria: <strong>{{category}}</strong></p>
        <br/>
        <p><strong>DICHIARA/AUTORIZZA/RICHIEDE</strong></p>
        <p>Il contenuto specifico del documento in base alla richiesta: "${aiDescription}"</p>
        <br/>
        <p>Data: _______________</p>
        <p>Firma: _______________</p>
        <br/>
        <p style="font-size: 12px; color: #64748b;">Documento generato automaticamente il ${new Date().toLocaleDateString()} - Modificabile tramite editor</p>
      `;

      const aiTemplate: DocumentTemplate = {
        id: `ai-${Date.now()}`,
        title: `Documento IA - ${aiDescription.substring(0, 30)}${aiDescription.length > 30 ? "..." : ""}`,
        description: `Generato dall'IA: ${aiDescription.substring(0, 100)}${aiDescription.length > 100 ? "..." : ""}`,
        content: aiGeneratedContent,
      };

      console.log("Saving AI template to database...");
      // Save to database
      await saveDocumentTemplate(currentClubId, aiTemplate);
      console.log("AI template saved successfully");

      setTemplates([...templates, aiTemplate]);
      setActiveTemplate(aiTemplate);
      setActiveView("editor");
      setAiGeneratorDialog(false);
      setAiDescription("");

      showToast("success", "Documento generato dall'IA con successo");
    } catch (error) {
      console.error("Error generating AI document:", error);
      const errorMessage =
        error instanceof Error ? error.message : String(error || "");
      showToast(
        "error",
        `Errore nella generazione del documento IA: ${errorMessage}`,
      );
    } finally {
      setAiGenerating(false);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl space-y-6 py-6">
        <div className="flex justify-center items-center min-h-[50vh]">
          <AppLoadingScreen subtitle="Caricamento documenti del club..." />
        </div>
      </div>
    );
  }

  const activeTemplates = templates.filter((template) => !template.archived);
  const archivedTemplates = templates.filter((template) => template.archived);
  // Il modello dell'attestazione si propone finche il club non ce l'ha, in
  // archivio compreso: riproporlo a chi lo ha archiviato di proposito
  // significherebbe non aver capito la risposta.
  const hasAttestationTemplate = templates.some(
    (template) => template.id === ATTESTATION_TEMPLATE_ID,
  );

  return (
    <DashboardPageContainer>
      <SharedPageHeader
        title="Modulistica"
        subtitle="Gestisci documenti, moduli e file condivisi del club."
        actions={
          activeView === "list" && activeTab === "documents" ? (
            /*
              In colonna sotto i 640 px: due azioni affiancate a 375 px
              tagliavano la seconda.
            */
            <div className="flex flex-col gap-2 sm:flex-row">
              {hasAttestationTemplate ? null : (
                <Button
                  variant="outline"
                  onClick={handleAddAttestationTemplate}
                  disabled={addingAttestation}
                >
                  <FileText className="mr-2 h-4 w-4" />
                  {addingAttestation
                    ? "Aggiunta..."
                    : "Aggiungi attestazione di pagamento"}
                </Button>
              )}
              <Button onClick={handleCreateNew}>
                <Plus className="mr-2 h-4 w-4" /> Nuovo Documento
              </Button>
            </div>
          ) : activeView === "list" ? null : (
          <Button variant="outline" onClick={handleBackToList}>
            Torna alla lista
          </Button>
          )
        }
      />

      {activeView === "list" ? (
        <Tabs
          value={activeTab}
          onValueChange={(value) =>
            setActiveTab(value as "documents" | "online-forms" | "archive")
          }
          className="space-y-5"
        >
          {/*
            `w-full` perche `flex-wrap` possa servire a qualcosa: la barra e
            `inline-flex`, quindi si dimensiona sul contenuto e non manda mai
            a capo. A 375 px «Archivio» finiva quarantanove pixel oltre il
            bordo e veniva tagliata via.
          */}
          <TabsList className="h-auto w-full flex-wrap justify-start">
            <TabsTrigger value="documents">Documenti / Template</TabsTrigger>
            <TabsTrigger value="online-forms">Moduli online</TabsTrigger>
            <TabsTrigger value="archive">Archivio</TabsTrigger>
          </TabsList>

          <TabsContent value="documents" className="space-y-4">
            {activeTemplates.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {activeTemplates.map((template) => (
                  <Card key={template.id} className="h-fit">
                  <CardHeader>
                    <div className="flex justify-between items-start">
                      <div>
                        <CardTitle>{template.title}</CardTitle>
                        <CardDescription>{template.description}</CardDescription>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => handleEditTemplate(template)}
                          >
                            <Edit className="mr-2 h-4 w-4" />
                            Modifica
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => handleArchiveTemplate(template)}
                          >
                            <Archive className="mr-2 h-4 w-4" />
                            Archivia
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => handleDeleteTemplate(template.id)}
                            className="text-red-600"
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Elimina
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="mb-4">
                      Documento {template.title.toLowerCase()}.
                    </p>
                    <div className="flex flex-col space-y-2">
                      <div className="flex space-x-2">
                        <Button
                          variant="outline"
                          className="flex-1"
                          onClick={() => handleCompileDocument(template)}
                        >
                          <FileText className="mr-2 h-4 w-4" /> Compila
                        </Button>
                      </div>
                      <Button
                        variant="outline"
                        className="w-full"
                        onClick={() => handleExportPdf(template)}
                      >
                        <Download className="mr-2 h-4 w-4" /> Esporta PDF
                      </Button>
                    </div>
                  </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <Card className="border-dashed">
                <CardContent className="flex min-h-[280px] flex-col items-center justify-center text-center">
                  <FileText className="mb-4 h-12 w-12 text-slate-400" />
                  <h2 className="text-xl font-semibold text-slate-900">
                    Nessun modello salvato
                  </h2>
                  <p className="mt-2 max-w-xl text-sm text-slate-500">
                    Crea un nuovo documento e modificalo direttamente nel foglio
                    visuale, senza scrivere HTML.
                  </p>
                  <Button className="mt-5" onClick={handleCreateNew}>
                    <Plus className="mr-2 h-4 w-4" /> Nuovo Documento
                  </Button>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="online-forms">
            <FormsDashboard />
          </TabsContent>

          <TabsContent value="archive" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Documenti e template archiviati</CardTitle>
                <CardDescription>
                  Documenti nascosti dalla lista attiva ma ancora ripristinabili.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {archivedTemplates.length > 0 ? (
                  <div className="space-y-3">
                    {archivedTemplates.map((template) => (
                      <div
                        key={template.id}
                        className="flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div>
                          <p className="font-semibold text-slate-900">
                            {template.title}
                          </p>
                          <p className="text-sm text-slate-500">
                            Documento/template
                            {template.archivedAt
                              ? ` - archiviato il ${new Date(
                                  template.archivedAt,
                                ).toLocaleDateString("it-IT")}`
                              : ""}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleRestoreTemplate(template)}
                          >
                            <RotateCcw className="mr-2 h-4 w-4" />
                            Ripristina
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-red-600 hover:text-red-700"
                            onClick={() => handleDeleteTemplate(template.id)}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Elimina
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-slate-500">
                    Nessun documento archiviato.
                  </p>
                )}
              </CardContent>
            </Card>

            {/*
              I moduli archiviati stanno nella scheda «Moduli online», con il
              loro interruttore: erano qui perche la prima versione teneva
              moduli e modelli di stampa nello stesso archivio JSON, non
              perche fosse il posto giusto per cercarli.
            */}
          </TabsContent>
        </Tabs>
      ) : activeView === "editor" ? (
        activeTemplate && (
          <div>
            <div className="mb-4">
              <h2 className="text-2xl font-semibold">{activeTemplate.title}</h2>
              <p className="text-muted-foreground">
                {activeTemplate.description}
              </p>
            </div>
            <DocumentEditor
              initialContent={activeTemplate.content}
              onSave={handleSaveTemplate}
              onCancel={handleBackToList}
              tokens={DOCUMENT_TEMPLATE_TOKENS}
            />
          </div>
        )
      ) : (
        activeTemplate &&
        compiledContent && (
          <div>
            <div className="mb-4">
              <h2 className="text-2xl font-semibold">
                {activeTemplate.title} - Compilato
              </h2>
              <p className="text-muted-foreground">
                {activeTemplate.description}
              </p>
            </div>
            <Card className="w-full">
              <CardHeader>
                <CardTitle>Documento Compilato</CardTitle>
              </CardHeader>
              <CardContent>
                <div
                  className="mb-4 document-content"
                  dangerouslySetInnerHTML={{ __html: compiledContent }}
                />
                <div className="flex justify-end space-x-2">
                  <Button variant="outline" onClick={handleBackToList}>
                    Torna alla lista
                  </Button>
                  <Button
                    onClick={() => {
                      const printWindow = window.open("", "_blank");
                      if (printWindow) {
                        printWindow.document.write(`
                        <html>
                          <head>
                            <title>${activeTemplate.title}</title>
                            <style>
                              body { font-family: Arial, sans-serif; padding: 20px; }
                              .pdf-container { max-width: 800px; margin: 0 auto; }
                            </style>
                          </head>
                          <body>
                            <div class="pdf-container">
                              ${compiledContent}
                            </div>
                          </body>
                        </html>
                      `);
                        printWindow.document.close();
                        setTimeout(() => {
                          printWindow.print();
                        }, 500);
                      }
                    }}
                  >
                    <Download className="mr-2 h-4 w-4" /> Esporta PDF
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )
      )}

      {/* PDF Export Dialog — le due strade: modulo vuoto o documento compilato */}
      <Dialog open={showPdfDialog} onOpenChange={setShowPdfDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Esporta come PDF</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="font-medium">{activeTemplate?.title}</p>
            <p className="text-sm text-muted-foreground">
              <strong>Genera vuoto</strong> stampa il modulo da compilare a
              mano. <strong>Genera compilato</strong> scrive dentro i dati
              dell&apos;atleta, del club e della cassa: serve un atleta.
            </p>

            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 transform text-muted-foreground" />
              <Input
                placeholder="Cerca per nome o cognome..."
                value={athleteSearchTerm}
                onChange={(e) => setAthleteSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>

            <Select value={selectedAthlete} onValueChange={setSelectedAthlete}>
              <SelectTrigger>
                <SelectValue placeholder="Seleziona un atleta (solo per il compilato)" />
              </SelectTrigger>
              <SelectContent>
                {filteredAthletes.length === 0 ? (
                  <SelectItem value="no-athletes" disabled>
                    {athleteSearchTerm
                      ? "Nessun atleta trovato"
                      : "Nessun atleta disponibile"}
                  </SelectItem>
                ) : (
                  filteredAthletes.map((athlete) => (
                    <SelectItem key={athlete.id} value={athlete.id}>
                      {athlete.first_name} {athlete.last_name}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>
          {/*
            In colonna sotto i 640 px: tre azioni affiancate a 375 px si
            tagliano a vicenda.
          */}
          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button
              variant="outline"
              className="w-full sm:w-auto"
              onClick={() => setShowPdfDialog(false)}
            >
              Annulla
            </Button>
            <Button
              variant="outline"
              className="w-full sm:w-auto"
              onClick={generatePdf}
            >
              Genera vuoto
            </Button>
            <Button
              className="w-full sm:w-auto"
              onClick={generateFilledPdf}
              disabled={
                generatingFilled ||
                !selectedAthlete ||
                selectedAthlete === "no-athletes"
              }
            >
              {generatingFilled ? "Generazione..." : "Genera compilato"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Anteprima del documento compilato: cosa c'e dentro, e cosa manca */}
      <Dialog
        open={Boolean(filledPreview)}
        onOpenChange={(open) => {
          if (!open) setFilledPreview(null);
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{filledPreview?.title || "Documento"}</DialogTitle>
          </DialogHeader>
          <div className="max-h-[60vh] space-y-4 overflow-y-auto py-2 text-sm">
            {filledPreview?.warnings.length ? (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-900">
                <ul className="list-disc space-y-1 pl-4">
                  {filledPreview.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            {filledPreview?.missing.length ? (
              <div>
                <p className="font-medium text-slate-900">
                  Dati mancanti: restano campi da riempire a mano
                </p>
                <p className="mt-1 break-words text-muted-foreground">
                  {filledPreview.missing.join(", ")}
                </p>
              </div>
            ) : null}

            {filledPreview?.unresolved.length ? (
              <div>
                <p className="font-medium text-slate-900">
                  Segnaposto non riconosciuti: restano vuoti
                </p>
                <p className="mt-1 break-words text-muted-foreground">
                  {filledPreview.unresolved.join(", ")}
                </p>
              </div>
            ) : null}

            {!filledPreview?.warnings.length &&
            !filledPreview?.missing.length &&
            !filledPreview?.unresolved.length ? (
              <p className="text-muted-foreground">
                Tutti i segnaposto del modello sono stati compilati.
              </p>
            ) : null}
          </div>
          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button
              variant="outline"
              className="w-full sm:w-auto"
              onClick={() => setFilledPreview(null)}
            >
              Annulla
            </Button>
            <Button className="w-full sm:w-auto" onClick={printFilledDocument}>
              Stampa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Compile Document Dialog */}
      <Dialog open={showCompileDialog} onOpenChange={setShowCompileDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Compila Documento</DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <p className="text-sm text-muted-foreground">
              Seleziona un atleta per compilare automaticamente il documento:
            </p>

            {/* Search bar */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Cerca per nome o cognome..."
                value={athleteSearchTerm}
                onChange={(e) => setAthleteSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>

            {/* Athletes selection */}
            <Select value={selectedAthlete} onValueChange={setSelectedAthlete}>
              <SelectTrigger>
                <SelectValue placeholder="Seleziona un atleta" />
              </SelectTrigger>
              <SelectContent>
                {filteredAthletes.length === 0 ? (
                  <SelectItem value="no-athletes" disabled>
                    {athleteSearchTerm
                      ? "Nessun atleta trovato"
                      : "Nessun atleta disponibile"}
                  </SelectItem>
                ) : (
                  filteredAthletes.map((athlete) => (
                    <SelectItem key={athlete.id} value={athlete.id}>
                      {athlete.first_name} {athlete.last_name}
                      {athlete.data?.category && (
                        <span className="text-muted-foreground ml-2">
                          ({athlete.data.category})
                        </span>
                      )}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowCompileDialog(false);
                setAthleteSearchTerm("");
                setSelectedAthlete("");
              }}
            >
              Annulla
            </Button>
            <Button
              onClick={compileDocument}
              disabled={!selectedAthlete || selectedAthlete === "no-athletes"}
            >
              Compila
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New Document Dialog */}
      <Dialog open={newDocumentDialog} onOpenChange={setNewDocumentDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nuovo Documento</DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">Titolo</Label>
              <Input
                id="title"
                value={newDocumentTitle}
                onChange={(e) => setNewDocumentTitle(e.target.value)}
                placeholder="Inserisci il titolo del documento"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Descrizione</Label>
              <Input
                id="description"
                value={newDocumentDescription}
                onChange={(e) => setNewDocumentDescription(e.target.value)}
                placeholder="Inserisci una breve descrizione"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setNewDocumentDialog(false)}
            >
              Annulla
            </Button>
            <Button
              onClick={handleCreateNewConfirm}
              disabled={
                !newDocumentTitle.trim() || !newDocumentDescription.trim()
              }
            >
              Crea
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardPageContainer>
  );
}

/**
 * Il guscio di questa pagina e lo stesso di tutte le altre.
 *
 * **Cosa c'era prima, e cosa faceva.** Modulistica era l'unica pagina che
 * montava `LayoutWithMobileNav`, una seconda generazione di guscio che
 * accostava `MobileNavigation` — una navigazione **in flusso normale** — al
 * contenuto. Su un telefono quella colonna prendeva 229 pixel su 375: la
 * pagina lavorava in 146, la targhetta della stagione finiva fuori schermo, e
 * comparivano un secondo marchio EasyGame e un secondo menu accanto al primo.
 *
 * Era l'errore tipico numero 1 di CLAUDE.md — una seconda implementazione di
 * qualcosa che esiste gia — e si vedeva solo aprendo la pagina a 375 px.
 */
export default function ModulisticaPageWithLayout() {
  return (
    <div className="flex h-[100dvh] bg-gray-50 dark:bg-gray-900">
      <div className="hidden lg:block">
        <Sidebar />
      </div>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="hidden lg:block">
          <Header title="Modulistica" />
        </div>
        <div className="lg:hidden">
          <MobileTopBar />
        </div>

        <main className={dashboardMainClassName}>
          <ModulisticaPage />
        </main>
      </div>
    </div>
  );
}
