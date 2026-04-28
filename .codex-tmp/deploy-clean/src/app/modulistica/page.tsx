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
  Download,
  Edit,
  Plus,
  FileText,
  Search,
  MoreVertical,
  Trash2,
  Sparkles,
} from "lucide-react";
import DocumentEditor from "@/components/forms/DocumentEditor";
import LayoutWithMobileNav from "@/app/layout-with-mobile-nav";
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
import { Textarea } from "@/components/ui/textarea";
import {
  getClubAthletes,
  getClub,
  saveDocumentTemplate,
  getDocumentTemplates,
  updateDocumentTemplate,
  deleteDocumentTemplate,
} from "@/lib/simplified-db";
import { useToast } from "@/components/ui/use-toast";
import { AppLoadingScreen } from "@/components/ui/app-loading-screen";

type DocumentTemplate = {
  id: string;
  title: string;
  description: string;
  content: string;
};

type Athlete = {
  id: string;
  first_name: string;
  last_name: string;
  birth_date: string;
  data?: {
    category?: string;
    fiscalCode?: string;
    address?: string;
    email?: string;
    phone?: string;
    medicalCertExpiry?: string;
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
  (Array.isArray(value) ? value : [])
    .map((item) => ({
      id: String(item?.id || item?.template_id || `template-${Date.now()}`),
      title: String(item?.title || item?.name || "Documento"),
      description: String(item?.description || item?.summary || ""),
      content: String(item?.content || item?.html || "<p></p>"),
    }))
    .filter((template) => template.id && template.title);

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
  const [aiGeneratorDialog, setAiGeneratorDialog] = useState<boolean>(false);
  const [aiDescription, setAiDescription] = useState<string>("");
  const [aiGenerating, setAiGenerating] = useState<boolean>(false);
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

    if (action === "ai") {
      setAiGeneratorDialog(true);
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

      if (existingTemplates.length === 0) {
        const generatedTemplates = generateDocumentTemplates(normalizedClub);
        setTemplates(generatedTemplates);

        for (const template of generatedTemplates) {
          try {
            await saveDocumentTemplate(resolvedClubId, template);
          } catch (error) {
            console.error("Error saving template:", error);
          }
        }
      } else {
        setTemplates(existingTemplates);
      }
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
      id: `template-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      title: newDocumentTitle.trim(),
      description: newDocumentDescription.trim(),
      content:
        "<h1>" +
        newDocumentTitle.trim() +
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

    // Replace placeholders with athlete data
    const replacements = {
      first_name: athlete.first_name || "",
      last_name: athlete.last_name || "",
      birth_date: athlete.birth_date || "",
      fiscalCode: athlete.data?.fiscalCode || "",
      address: athlete.data?.address || "",
      email: athlete.data?.email || "",
      phone: athlete.data?.phone || "",
      category: athlete.data?.category || "",
    };

    Object.entries(replacements).forEach(([key, value]) => {
      compiledText = compiledText.replace(new RegExp(`{{${key}}}`, "g"), value);
    });

    setCompiledContent(compiledText);
    setActiveView("compile");
    setShowCompileDialog(false);
  };

  const generatePdf = () => {
    if (!activeTemplate) return;

    // In a real application, you would use a library like jsPDF or call a backend API
    // For now, we'll simulate PDF generation by opening the content in a new window
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
              ${activeTemplate.content}
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
      showToast(
        "error",
        `Errore nella generazione del documento IA: ${error?.message || error}`,
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

  return (
    <div className="mx-auto max-w-9xl space-y-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
            Modulistica
          </h1>
          <p className="text-gray-600 mt-2">
            Gestisci documenti, moduli e file condivisi del club.
          </p>
        </div>
        {activeView === "list" ? (
          <div className="flex gap-2">
            <Button onClick={handleCreateNew}>
              <Plus className="mr-2 h-4 w-4" /> Nuovo Documento
            </Button>
            <Button
              onClick={() => setAiGeneratorDialog(true)}
              variant="outline"
            >
              <Sparkles className="mr-2 h-4 w-4" /> Genera con IA
            </Button>
          </div>
        ) : (
          <Button variant="outline" onClick={handleBackToList}>
            Torna alla lista
          </Button>
        )}
      </div>

      {activeView === "list" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {templates.map((template) => (
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
                      onClick={() => handleEditTemplate(template)}
                    >
                      <Edit className="mr-2 h-4 w-4" /> Modifica
                    </Button>
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

      {/* PDF Export Dialog */}
      <Dialog open={showPdfDialog} onOpenChange={setShowPdfDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Esporta come PDF</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p>Sei sicuro di voler esportare questo documento come PDF?</p>
            <p className="font-medium mt-2">{activeTemplate?.title}</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPdfDialog(false)}>
              Annulla
            </Button>
            <Button onClick={generatePdf}>Esporta PDF</Button>
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

      {/* AI Document Generator Dialog */}
      <Dialog open={aiGeneratorDialog} onOpenChange={setAiGeneratorDialog}>
        <DialogContent className="max-w-9xl">
          <DialogHeader>
            <DialogTitle>Genera Documento con IA</DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <p className="text-sm text-muted-foreground">
              Descrivi dettagliatamente il tipo di documento che vuoi generare:
            </p>
            <Textarea
              placeholder="Es: Crea un modulo di consenso per l'utilizzo di immagini degli atleti sui social media, includendo sezioni per i dati personali, il tipo di utilizzo consentito, e la durata del consenso..."
              value={aiDescription}
              onChange={(e) => setAiDescription(e.target.value)}
              rows={6}
              className="min-h-[120px]"
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setAiGeneratorDialog(false);
                setAiDescription("");
              }}
              disabled={aiGenerating}
            >
              Annulla
            </Button>
            <Button
              onClick={generateAIDocument}
              disabled={!aiDescription.trim() || aiGenerating}
            >
              {aiGenerating ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Generando...
                </>
              ) : (
                <>
                  <Sparkles className="mr-2 h-4 w-4" />
                  Genera Documento
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function ModulisticaPageWithLayout() {
  return (
    <LayoutWithMobileNav>
      <ModulisticaPage />
    </LayoutWithMobileNav>
  );
}
