"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
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
  RotateCcw,
  Trash2,
  Upload,
  Users,
} from "lucide-react";
import DocumentEditor from "@/components/forms/DocumentEditor";
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
import { getClubAthletes } from "@/lib/simplified-db";
import {
  ATTESTATION_TEMPLATE_ID,
  ATTESTATION_TEMPLATE_TITLE,
  buildAttestationTemplate,
} from "@/lib/documents/attestation-template";
import {
  createDocumentTemplate,
  deleteDocumentTemplate,
  generateDocuments,
  getDocumentTemplate,
  listDocumentTemplates,
  listGeneratedDocuments,
  previewFilledDocument,
  publishDocumentTemplate,
  saveDocumentTemplateDraft,
  type DocumentTemplateDetail,
  type DocumentTemplateSummary,
  type GeneratedDocumentSummary,
  type TemplateIssue,
  type TemplateStatus,
  type TemplateSubject,
} from "@/lib/api/documents";
import {
  canManageDocumentTemplates,
  canReadDocumentTemplates,
} from "@/lib/documents/permissions";
import { BulkGenerationDialog } from "@/components/documents/BulkGenerationDialog";
import {
  clearStoredBatch,
  readStoredBatch,
  type BulkBatchState,
} from "@/components/documents/bulk-generation";
import { useAuth } from "@/components/providers/AuthProvider";
import { useToast } from "@/components/ui/use-toast";
import { AppLoadingScreen } from "@/components/ui/app-loading-screen";

/**
 * Modulistica: i modelli del club, le loro versioni, i documenti che hanno
 * prodotto.
 *
 * **Cosa e cambiato, e perche.** Fino alla Wave 3 questa pagina leggeva e
 * scriveva `clubs.document_templates`, cioe una colonna JSON della riga del
 * club: due schede aperte insieme si sovrascrivevano, e un modello non aveva
 * ne stato ne versioni. Adesso ogni gesto passa da `src/lib/api/documents.ts`,
 * e un modello ha un ciclo di vita dichiarato — bozza, pubblicato, ritirato.
 *
 * **Tre cose che qui non esistono piu**, e non e una potatura estetica:
 *
 * - i **quattro modelli predefiniti** generati nel browser (`DOC-02`): non li
 *   chiamava nessuno, e scrivevano segnaposto fuori catalogo;
 * - la **compilazione nel browser** (`DOC-03`): era una terza interpretazione
 *   della sostituzione dei segnaposto, con una mappa propria di chiavi
 *   storiche e l'anno sportivo letto da `localStorage`. Sullo stesso modello e
 *   sullo stesso atleta produceva un documento diverso da quello del server;
 * - il **«generatore IA»**: non chiamava nessuna intelligenza artificiale —
 *   componeva una stringa fissa — e ci scriveva dentro `{{first_name}}` e
 *   `{{fiscalCode}}`, che non sono nel catalogo e sarebbero rimasti bianchi
 *   per sempre (§17.3 del planning di Wave 3).
 *
 * Il gesto che resta e uno solo, ed e quello vero: **anteprima** dal
 * risolutore lato server (`/api/v1/documents/filled`, che la pagina non
 * reimplementa), e poi la **produzione** del documento, che scrive una riga
 * con la versione citata.
 */

type Athlete = {
  id: string;
  first_name: string;
  last_name: string;
  data?: {
    [key: string]: any;
    category?: string;
  };
};

type PageTab = "documents" | "online-forms" | "retired" | "generated";

const STATUS_LABELS: Record<TemplateStatus, string> = {
  draft: "Bozza",
  active: "Attivo",
  retired: "Ritirato",
};

const STATUS_CLASSES: Record<TemplateStatus, string> = {
  draft: "border-slate-200 bg-slate-100 text-slate-700",
  active: "border-emerald-200 bg-emerald-50 text-emerald-700",
  retired: "border-amber-200 bg-amber-50 text-amber-800",
};

/**
 * I quattro soggetti che un modello puo dichiarare.
 *
 * Non e una preferenza di catalogazione: il soggetto decide quali segnaposto
 * l'editor propone, e quindi quali dati il modello sapra scrivere.
 */
const SUBJECT_LABELS: Record<TemplateSubject, string> = {
  club: "La societa",
  athlete: "Un atleta",
  person: "Una persona dello staff",
  member: "Un socio",
};

const SUBJECT_HINT =
  "Il soggetto decide quali dati il modello sapra scrivere: un modello che parla di un atleta non ha un allenatore a cui riferirsi, e quei campi resterebbero bianchi.";

const GENERATED_STATUS_LABELS: Record<string, string> = {
  generated: "Generato",
  issued: "Consegnato",
  awaiting_signature: "In attesa di firma",
  signed: "Copia firmata rientrata",
  rejected: "Respinto",
  archived: "Archiviato",
};

const formatDate = (value?: string | null) => {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleDateString("it-IT");
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
        data,
      } as Athlete;
    })
    .filter(
      (athlete) =>
        athlete &&
        athlete.id &&
        (athlete.first_name || athlete.last_name || athlete.data?.category),
    );

const escapeHtmlText = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const signatureBlockHtml = (label: string) =>
  `<div style="margin: 28px 0 18px; padding: 18px; border: 1px dashed #94a3b8; border-radius: 8px; color: #475569; background-color: #f8fafc;"><strong>${label}</strong></div>`;

/*
  Il modulo da compilare a mano: i segnaposto diventano righe da riempire a
  penna. Non e la strada vecchia della compilazione — e un'altra cosa, ed e
  quella giusta per una liberatoria che si firma in segreteria.
*/
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

const TemplateStatusBadge = ({ status }: { status: TemplateStatus }) => (
  <span
    className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_CLASSES[status]}`}
  >
    {STATUS_LABELS[status]}
  </span>
);

/** Lo stato di un modello, detto per intero: versione, e cosa non e uscito. */
const TemplateStateLine = ({
  template,
}: {
  template: DocumentTemplateSummary;
}) => (
  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
    <TemplateStatusBadge status={template.status} />
    <span>
      {template.publishedVersion > 0
        ? `Versione ${template.publishedVersion} del ${formatDate(template.publishedAt)}`
        : "Mai pubblicato"}
    </span>
    {template.hasUnpublishedChanges ? (
      <span className="inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 font-medium text-blue-700">
        Modifiche non pubblicate
      </span>
    ) : null}
    {template.generatedCount > 0 ? (
      <span>
        {template.generatedCount}{" "}
        {template.generatedCount === 1 ? "documento" : "documenti"} prodotti
      </span>
    ) : null}
  </div>
);

function ModulisticaPage() {
  const { activeClub } = useAuth();
  const clubId = activeClub?.id ? String(activeClub.id) : "";
  const activeRole = activeClub?.role ? String(activeClub.role) : "";
  const activeSeasonId = activeClub?.activeSeasonId
    ? String(activeClub.activeSeasonId)
    : null;

  /*
    Il server decide comunque: qui il permesso serve solo a non mostrare un
    pulsante che risponderebbe «Accesso negato», che e un difetto quanto una
    porta aperta.
  */
  const canManage = canManageDocumentTemplates(activeRole);
  const canRead = canReadDocumentTemplates(activeRole);

  const { showToast } = useToast();

  const [templates, setTemplates] = useState<DocumentTemplateSummary[]>([]);
  const [generatedDocuments, setGeneratedDocuments] = useState<
    GeneratedDocumentSummary[]
  >([]);
  const [athletes, setAthletes] = useState<Athlete[]>([]);
  const [athleteSearchTerm, setAthleteSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);

  const [activeView, setActiveView] = useState<"list" | "editor">("list");
  const [activeTab, setActiveTab] = useState<PageTab>("documents");

  const [editorTemplate, setEditorTemplate] =
    useState<DocumentTemplateDetail | null>(null);
  const [editorSubject, setEditorSubject] = useState<TemplateSubject>("athlete");
  const [savingDraft, setSavingDraft] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishIssues, setPublishIssues] = useState<TemplateIssue[] | null>(
    null,
  );

  const [newDocumentDialog, setNewDocumentDialog] = useState(false);
  const [newDocumentTitle, setNewDocumentTitle] = useState("");
  const [newDocumentDescription, setNewDocumentDescription] = useState("");
  const [newDocumentSubject, setNewDocumentSubject] =
    useState<TemplateSubject>("athlete");
  const [creating, setCreating] = useState(false);
  const [addingAttestation, setAddingAttestation] = useState(false);

  const [generateTarget, setGenerateTarget] =
    useState<DocumentTemplateSummary | null>(null);
  const [selectedAthlete, setSelectedAthlete] = useState("");
  const [generatingFilled, setGeneratingFilled] = useState(false);
  const [producing, setProducing] = useState(false);
  const [deleteTarget, setDeleteTarget] =
    useState<DocumentTemplateSummary | null>(null);

  /*
    La generazione massiva (W3-E). Il lotto vive in `sessionStorage`, non qui:
    `interruptedBatch` e solo cio che questa pagina ha trovato li dentro al
    montaggio, cioe un lotto che qualcuno ha lasciato a meta ricaricando.
  */
  const [bulkTarget, setBulkTarget] =
    useState<DocumentTemplateSummary | null>(null);
  const [bulkResume, setBulkResume] = useState<BulkBatchState | null>(null);
  const [interruptedBatch, setInterruptedBatch] =
    useState<BulkBatchState | null>(null);

  /*
    L'anteprima del documento compilato. Non e un dettaglio di comodo: §5.5.24
    chiede che i segnaposto che il risolutore non ha saputo riempire siano
    **elencati prima di produrre**. Un'attestazione con tre righe bianche che
    nessuno ha notato e peggio di un modulo vuoto, perche sembra completa.
  */
  const [filledPreview, setFilledPreview] = useState<{
    templateId: string;
    athleteId: string;
    title: string;
    html: string;
    unresolved: string[];
    missing: string[];
    warnings: string[];
  } | null>(null);

  const loadAll = useCallback(async () => {
    if (!clubId) {
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      const [templatesResult, generatedResult, athletesData] =
        await Promise.all([
          listDocumentTemplates({ includeRetired: true }),
          listGeneratedDocuments({ limit: 100 }),
          getClubAthletes(clubId).catch(() => []),
        ]);

      if (templatesResult.error) {
        showToast("error", templatesResult.error);
      }

      setTemplates(templatesResult.templates);
      setGeneratedDocuments(generatedResult.documents);
      setAthletes(normalizeAthletes((athletesData as any[]) || []));
    } catch {
      showToast("error", "Errore nel caricamento dei modelli");
    } finally {
      setLoading(false);
    }
    // `showToast` cambia identita a ogni render: includerlo qui rifarebbe
    // partire il caricamento a ogni render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clubId]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

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

  /*
    Il lotto lasciato a meta si scopre al montaggio, e non e un dettaglio: e
    **questo** che rende ripartibile la generazione massiva dopo un F5. Senza,
    l'identificativo del lotto resterebbe in `sessionStorage` senza che nessuno
    lo proponga, e chi ha ricaricato ricomincerebbe da capo.
  */
  useEffect(() => {
    setInterruptedBatch(readStoredBatch());
  }, []);

  const bulkAthletes = useMemo(
    () =>
      athletes.map((athlete) => ({
        id: athlete.id,
        label:
          `${athlete.first_name} ${athlete.last_name}`.trim() ||
          "Atleta senza nome",
      })),
    [athletes],
  );

  const filteredAthletes = useMemo(() => {
    const term = athleteSearchTerm.trim().toLowerCase();
    if (!term) return athletes;

    return athletes.filter((athlete) =>
      `${athlete.first_name} ${athlete.last_name}`.toLowerCase().includes(term),
    );
  }, [athleteSearchTerm, athletes]);

  const listedTemplates = useMemo(
    () => templates.filter((template) => template.status !== "retired"),
    [templates],
  );
  const retiredTemplates = useMemo(
    () => templates.filter((template) => template.status === "retired"),
    [templates],
  );
  const hasAttestationTemplate = templates.some(
    (template) => template.catalogKey === ATTESTATION_TEMPLATE_ID,
  );

  /* ------------------------------------------------------------- l'editor */

  const openEditor = async (template: DocumentTemplateSummary) => {
    const { template: detail, error } = await getDocumentTemplate(template.id);
    if (error || !detail) {
      showToast("error", error || "Modello non trovato");
      return;
    }

    setEditorTemplate(detail);
    setEditorSubject(detail.subjectKind);
    setActiveView("editor");
  };

  const handleBackToList = () => {
    setActiveView("list");
    setEditorTemplate(null);
  };

  const handleSaveDraft = async (content: string) => {
    if (!editorTemplate) return;

    setSavingDraft(true);

    const { template, error } = await saveDocumentTemplateDraft(
      editorTemplate.id,
      { content, subjectKind: editorSubject },
    );

    setSavingDraft(false);

    if (error || !template) {
      showToast("error", error || "Errore nel salvataggio del modello");
      return;
    }

    setEditorTemplate(template);
    setTemplates((current) =>
      current.map((item) => (item.id === template.id ? template : item)),
    );
    showToast(
      "success",
      "Bozza salvata. I documenti gia prodotti non cambiano: per farla valere, pubblicala",
    );
  };

  /**
   * Pubblicare non e salvare.
   *
   * Salvare corregge la bozza; pubblicare crea una **versione**, e i documenti
   * prodotti da quel momento la citeranno per sempre. Quando non si puo, le
   * `issues` dicono **quale** parola e sbagliata: «non si puo pubblicare» e
   * basta manda una segreteria a chiamare l'assistenza.
   */
  const handlePublish = async (templateId: string) => {
    setPublishing(true);

    const { template, error, issues } = await publishDocumentTemplate(
      templateId,
    );

    setPublishing(false);

    if (error || !template) {
      if (issues.length) {
        setPublishIssues(issues);
      } else {
        showToast("error", error || "Errore nella pubblicazione del modello");
      }
      return;
    }

    setTemplates((current) =>
      current.map((item) => (item.id === template.id ? template : item)),
    );
    if (editorTemplate?.id === template.id) {
      setEditorTemplate(template);
    }
    showToast("success", `Pubblicata la versione ${template.publishedVersion}`);
  };

  /* ------------------------------------------------------- il ciclo di vita */

  const handleCreateNew = () => {
    setNewDocumentTitle("");
    setNewDocumentDescription("");
    setNewDocumentSubject("athlete");
    setNewDocumentDialog(true);
  };

  const handleCreateNewConfirm = async () => {
    if (!newDocumentTitle.trim()) {
      showToast("error", "Inserisci il titolo del documento");
      return;
    }

    setCreating(true);

    const { template, error } = await createDocumentTemplate({
      title: newDocumentTitle.trim(),
      description: newDocumentDescription.trim(),
      subjectKind: newDocumentSubject,
      content: `<h1>${escapeHtmlText(newDocumentTitle.trim())}</h1><p>Inserisci il contenuto qui.</p>`,
    });

    setCreating(false);

    if (error || !template) {
      showToast("error", error || "Errore nella creazione del documento");
      return;
    }

    setTemplates((current) => [...current, template]);
    setEditorTemplate(template);
    setEditorSubject(template.subjectKind);
    setActiveView("editor");
    setNewDocumentDialog(false);
    setNewDocumentTitle("");
    setNewDocumentDescription("");
    showToast("success", "Nuovo modello creato: e una bozza, finche non lo pubblichi");
  };

  /**
   * Semina il modello «Attestazione di pagamento e frequenza».
   *
   * Nasce bozza come qualunque altro modello: si apre, si corregge, e vale
   * dal momento in cui qualcuno lo pubblica.
   */
  const handleAddAttestationTemplate = async () => {
    const seed = buildAttestationTemplate();

    setAddingAttestation(true);

    const { template, error } = await createDocumentTemplate({
      title: seed.title,
      description: seed.description,
      subjectKind: "athlete",
      content: seed.content,
      catalogKey: ATTESTATION_TEMPLATE_ID,
    });

    setAddingAttestation(false);

    if (error || !template) {
      showToast("error", error || "Errore nella creazione del modello");
      return;
    }

    setTemplates((current) => [...current, template]);
    showToast("success", `Modello «${ATTESTATION_TEMPLATE_TITLE}» aggiunto`);
  };

  const handleChangeStatus = async (
    template: DocumentTemplateSummary,
    status: TemplateStatus,
  ) => {
    const { template: updated, error } = await saveDocumentTemplateDraft(
      template.id,
      { status },
    );

    if (error || !updated) {
      showToast("error", error || "Errore nel cambio di stato del modello");
      return;
    }

    setTemplates((current) =>
      current.map((item) => (item.id === updated.id ? updated : item)),
    );
    showToast(
      "success",
      status === "retired"
        ? "Modello ritirato: non produce documenti nuovi, e continua a spiegare quelli gia prodotti"
        : "Modello riattivato",
    );
  };

  /*
    Cancellare e ammesso solo per un modello che non ha prodotto niente. Il
    server lo rifiuta comunque, con un messaggio scritto per chi lo legge: qui
    si mostra quello, senza riscriverlo.
  */
  const handleDeleteTemplate = async (template: DocumentTemplateSummary) => {
    const { ok, error } = await deleteDocumentTemplate(template.id);

    setDeleteTarget(null);

    if (!ok) {
      showToast("error", error || "Errore nell'eliminazione del modello");
      return;
    }

    setTemplates((current) =>
      current.filter((item) => item.id !== template.id),
    );
    showToast("success", "Modello eliminato");
  };

  /* -------------------------------------------------------- la generazione */

  const openGenerateDialog = (template: DocumentTemplateSummary) => {
    setGenerateTarget(template);
    setSelectedAthlete("");
    setAthleteSearchTerm("");
  };

  const printHtmlPage = (html: string) => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    printWindow.document.write(html);
    printWindow.document.close();
    setTimeout(() => {
      printWindow.print();
    }, 500);
  };

  /** Il modulo vuoto: si stampa e si compila a penna. */
  const generateBlankPdf = async () => {
    if (!generateTarget) return;

    const { template, error } = await getDocumentTemplate(generateTarget.id);
    if (error || !template) {
      showToast("error", error || "Modello non trovato");
      return;
    }

    printHtmlPage(`
      <html>
        <head>
          <title>${escapeHtmlText(template.title)}</title>
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
            ${renderBlankTemplateForPdf(template.draftContent)}
          </div>
        </body>
      </html>
    `);

    setGenerateTarget(null);
  };

  /**
   * L'anteprima del compilato: la costruisce il server, qui si guarda.
   *
   * Il risolutore vive in `src/lib/server/document-placeholders.ts` perche
   * legge il registro incassi e le presenze: farlo qui vorrebbe dire spedire
   * al browser l'intero storico economico di un atleta per stampare una riga,
   * e riscrivere nel client la formula della cassa (ADR-0068). L'anteprima
   * **non scrive niente**: e la differenza con la produzione qui sotto.
   */
  const previewFilled = async () => {
    if (!generateTarget) return;
    if (!selectedAthlete || selectedAthlete === "no-athletes") {
      showToast("error", "Seleziona prima un atleta");
      return;
    }

    setGeneratingFilled(true);

    const { preview, error } = await previewFilledDocument({
      templateId: generateTarget.id,
      athleteId: selectedAthlete,
      seasonId: activeSeasonId,
    });

    setGeneratingFilled(false);

    if (error || !preview) {
      showToast("error", error || "Errore nella generazione del documento");
      return;
    }

    setFilledPreview({
      templateId: generateTarget.id,
      athleteId: selectedAthlete,
      title: preview.title,
      html: preview.html,
      unresolved: Array.isArray(preview.unresolved) ? preview.unresolved : [],
      missing: Array.isArray(preview.missing) ? preview.missing : [],
      warnings: Array.isArray(preview.warnings) ? preview.warnings : [],
    });
    setGenerateTarget(null);
  };

  /**
   * Produrre il documento: questo scrive una riga.
   *
   * Da qui in poi il documento esiste, cita la versione con cui e stato
   * prodotto e conserva la propria resa. E il gesto che l'anteprima non fa, ed
   * e per questo che sono due pulsanti e non uno.
   */
  const produceDocument = async () => {
    if (!filledPreview) return;

    setProducing(true);

    const { outcome, error } = await generateDocuments({
      templateId: filledPreview.templateId,
      subjects: [{ kind: "athlete", id: filledPreview.athleteId }],
      seasonId: activeSeasonId,
    });

    setProducing(false);

    if (error || !outcome) {
      showToast("error", error || "Errore nella produzione del documento");
      return;
    }

    const failure = outcome.failed[0];
    if (failure) {
      showToast("error", failure.reason);
      return;
    }

    setFilledPreview(null);
    setActiveTab("generated");

    const { documents } = await listGeneratedDocuments({ limit: 100 });
    setGeneratedDocuments(documents);

    showToast("success", "Documento prodotto: lo trovi in «Documenti generati»");
  };

  /* --------------------------------------------- la generazione massiva */

  const openBulkDialog = (template: DocumentTemplateSummary) => {
    setBulkResume(null);
    setBulkTarget(template);
  };

  const resumeBulkBatch = () => {
    if (!interruptedBatch) return;

    const template = templates.find(
      (item) => item.id === interruptedBatch.templateId,
    );

    /*
      Il modello e stato cancellato o ritirato mentre il lotto era in sospeso:
      quel lotto non puo piu andare avanti, e tenerlo li vorrebbe dire
      riproporre per sempre un pulsante che non fa niente.
    */
    if (!template) {
      clearStoredBatch();
      setInterruptedBatch(null);
      showToast(
        "error",
        "Il modello di quel lotto non c'e piu: il lotto e stato scartato",
      );
      return;
    }

    setBulkResume(interruptedBatch);
    setBulkTarget(template);
  };

  const discardBulkBatch = () => {
    clearStoredBatch();
    setInterruptedBatch(null);
  };

  const closeBulkDialog = () => {
    setBulkTarget(null);
    setBulkResume(null);
    setInterruptedBatch(readStoredBatch());
  };

  /*
    A lotto finito si rileggono modelli e documenti, non tutta la pagina:
    `loadAll` rimette `loading` a vero, e la schermata di caricamento
    smonterebbe il dialogo con l'esito ancora aperto.
  */
  const refreshAfterBulk = async () => {
    const [templatesResult, generatedResult] = await Promise.all([
      listDocumentTemplates({ includeRetired: true }),
      listGeneratedDocuments({ limit: 100 }),
    ]);

    setTemplates(templatesResult.templates);
    setGeneratedDocuments(generatedResult.documents);
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl space-y-6 py-6">
        <div className="flex min-h-[50vh] items-center justify-center">
          <AppLoadingScreen subtitle="Caricamento documenti del club..." />
        </div>
      </div>
    );
  }

  /*
    Senza club attivo non c'e niente da dire sui permessi: e un'altra cosa, e
    dirla come un diniego manderebbe a chiamare l'assistenza chi doveva solo
    scegliere una societa.
  */
  if (!clubId || !canRead) {
    return (
      <DashboardPageContainer>
        <SharedPageHeader
          title="Modulistica"
          subtitle="Gestisci documenti, moduli e file condivisi del club."
        />
        <Card>
          <CardContent className="py-10 text-center text-sm text-slate-500">
            {clubId
              ? "I modelli di documento li vede chi lavora nella segreteria del club."
              : "Nessun club attivo: scegline uno dal menu in alto."}
          </CardContent>
        </Card>
      </DashboardPageContainer>
    );
  }

  const renderTemplateCard = (template: DocumentTemplateSummary) => (
    <Card key={template.id} className="h-fit">
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="break-words">{template.title}</CardTitle>
            <CardDescription className="break-words">
              {template.description ||
                `Parla di: ${SUBJECT_LABELS[template.subjectKind].toLowerCase()}`}
            </CardDescription>
          </div>
          {canManage ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => void openEditor(template)}>
                  <Edit className="mr-2 h-4 w-4" />
                  Modifica
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => void handlePublish(template.id)}
                >
                  <Upload className="mr-2 h-4 w-4" />
                  Pubblica
                </DropdownMenuItem>
                {template.status === "retired" ? (
                  <DropdownMenuItem
                    onClick={() => void handleChangeStatus(template, "active")}
                  >
                    <RotateCcw className="mr-2 h-4 w-4" />
                    Riattiva
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem
                    onClick={() => void handleChangeStatus(template, "retired")}
                  >
                    <RotateCcw className="mr-2 h-4 w-4" />
                    Ritira
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem
                  onClick={() => setDeleteTarget(template)}
                  className="text-red-600"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Elimina
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
        <TemplateStateLine template={template} />
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-2">
          <Button
            variant="outline"
            className="w-full"
            onClick={() => openGenerateDialog(template)}
          >
            <Download className="mr-2 h-4 w-4" /> Genera documento
          </Button>
          {/*
            Il lotto parte solo da un modello **pubblicato** che parla di un
            atleta: su una bozza il server rifiuterebbe cinquanta volte, e su un
            altro soggetto produrrebbe cinquanta fogli con i campi bianchi.
          */}
          {template.status === "active" && template.subjectKind === "athlete" ? (
            <Button
              variant="outline"
              className="w-full"
              onClick={() => openBulkDialog(template)}
            >
              <Users className="mr-2 h-4 w-4" /> Genera per piu atleti
            </Button>
          ) : null}
          {canManage ? (
            <Button
              variant="outline"
              className="w-full"
              onClick={() => void openEditor(template)}
            >
              <Edit className="mr-2 h-4 w-4" /> Modifica il testo
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );

  return (
    <DashboardPageContainer>
      <SharedPageHeader
        title="Modulistica"
        subtitle="Gestisci documenti, moduli e file condivisi del club."
        actions={
          activeView === "list" && activeTab === "documents" && canManage ? (
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
          onValueChange={(value) => setActiveTab(value as PageTab)}
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
            <TabsTrigger value="retired">Ritirati</TabsTrigger>
            <TabsTrigger value="generated">Documenti generati</TabsTrigger>
          </TabsList>

          <TabsContent value="documents" className="space-y-4">
            {/*
              Il lotto interrotto si propone qui, non dentro il dialogo: chi ha
              ricaricato la pagina non sa piu da quale modello era partito, e
              cercarlo a memoria fra venti schede e il modo per rigenerare tutto
              da capo.
            */}
            {interruptedBatch && !bulkTarget ? (
              <Card className="border-amber-200 bg-amber-50">
                <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 text-sm text-amber-900">
                    <p className="font-medium">
                      Un lotto di «{interruptedBatch.templateTitle}» e rimasto a
                      meta
                    </p>
                    <p className="break-words">
                      {interruptedBatch.servedSubjectIds.length} di{" "}
                      {interruptedBatch.subjects.length} serviti. Riprendendolo
                      si generano solo i mancanti: i documenti gia prodotti non
                      si duplicano.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" onClick={resumeBulkBatch}>
                      Riprendi
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={discardBulkBatch}
                    >
                      Scarta
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : null}

            {listedTemplates.length > 0 ? (
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
                {listedTemplates.map(renderTemplateCard)}
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
                  {canManage ? (
                    <Button className="mt-5" onClick={handleCreateNew}>
                      <Plus className="mr-2 h-4 w-4" /> Nuovo Documento
                    </Button>
                  ) : null}
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="online-forms">
            <FormsDashboard />
          </TabsContent>

          <TabsContent value="retired" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Modelli ritirati</CardTitle>
                <CardDescription>
                  Un modello ritirato non produce documenti nuovi, e continua a
                  spiegare quelli che ha gia prodotto. Per questo si ritira
                  invece di cancellarlo.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {retiredTemplates.length > 0 ? (
                  <div className="space-y-3">
                    {retiredTemplates.map((template) => (
                      <div
                        key={template.id}
                        className="flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="min-w-0">
                          <p className="break-words font-semibold text-slate-900">
                            {template.title}
                          </p>
                          <TemplateStateLine template={template} />
                        </div>
                        {canManage ? (
                          <div className="flex flex-wrap gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                void handleChangeStatus(template, "active")
                              }
                            >
                              <RotateCcw className="mr-2 h-4 w-4" />
                              Riattiva
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-red-600 hover:text-red-700"
                              onClick={() => setDeleteTarget(template)}
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Elimina
                            </Button>
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-slate-500">
                    Nessun modello ritirato.
                  </p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="generated" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Documenti generati</CardTitle>
                <CardDescription>
                  Cio che il club ha prodotto. Aprirne uno lo mostra
                  <strong> com&apos;era</strong>: non viene rigenerato, perche
                  modificare un modello non cambia un documento gia consegnato.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {generatedDocuments.length > 0 ? (
                  /*
                    Una `<table>` non si restringe: senza contenitore
                    scrollabile allargherebbe il documento e a 375 px
                    scorrerebbe tutta la pagina.
                  */
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[640px] text-left text-sm">
                      <thead>
                        <tr className="border-b text-xs uppercase text-slate-500">
                          <th className="px-2 py-2">Modello</th>
                          <th className="px-2 py-2">Versione</th>
                          <th className="px-2 py-2">Soggetto</th>
                          <th className="px-2 py-2">Data</th>
                          <th className="px-2 py-2">Stato</th>
                          <th className="px-2 py-2" />
                        </tr>
                      </thead>
                      <tbody>
                        {generatedDocuments.map((document) => (
                          <tr key={document.id} className="border-b last:border-0">
                            <td className="px-2 py-2 font-medium text-slate-900">
                              {document.templateTitle}
                            </td>
                            <td className="px-2 py-2 text-slate-600">
                              v{document.version}
                            </td>
                            <td className="px-2 py-2 text-slate-600">
                              {document.subjectLabel || document.subjectKind}
                            </td>
                            <td className="px-2 py-2 text-slate-600">
                              {formatDate(document.generatedAt)}
                            </td>
                            <td className="px-2 py-2 text-slate-600">
                              {GENERATED_STATUS_LABELS[document.status] ||
                                document.status}
                            </td>
                            <td className="px-2 py-2 text-right">
                              <a
                                className="text-sm font-medium text-blue-700 hover:underline"
                                href={`/api/v1/documents/generated/${document.id}?format=html`}
                                target="_blank"
                                rel="noreferrer"
                              >
                                Apri
                              </a>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-sm text-slate-500">
                    Nessun documento generato: parti da un modello pubblicato e
                    usa «Genera compilato».
                  </p>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      ) : editorTemplate ? (
        <div>
          <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <h2 className="break-words text-2xl font-semibold">
                {editorTemplate.title}
              </h2>
              <p className="break-words text-muted-foreground">
                {editorTemplate.description}
              </p>
              <TemplateStateLine template={editorTemplate} />
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="w-full sm:w-56">
                <Label htmlFor="editor-subject" className="text-xs text-slate-500">
                  Di chi parla
                </Label>
                <Select
                  value={editorSubject}
                  onValueChange={(value) =>
                    setEditorSubject(value as TemplateSubject)
                  }
                >
                  <SelectTrigger id="editor-subject">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(SUBJECT_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                className="w-full sm:w-auto"
                onClick={() => void handlePublish(editorTemplate.id)}
                disabled={publishing || savingDraft}
              >
                <Upload className="mr-2 h-4 w-4" />
                {publishing ? "Pubblicazione..." : "Pubblica"}
              </Button>
            </div>
          </div>

          <p className="mb-4 text-sm text-muted-foreground">
            <strong>Salva</strong> scrive la bozza e non cambia nessun documento
            gia prodotto. <strong>Pubblica</strong> crea una versione, e i
            documenti generati da quel momento la citeranno per sempre: pubblica
            dopo aver salvato.
          </p>

          {editorTemplate.versions.length > 0 ? (
            <Card className="mb-4">
              <CardHeader>
                <CardTitle className="text-base">Versioni pubblicate</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-1 text-sm text-slate-600">
                  {editorTemplate.versions.map((version) => (
                    <li key={version.id}>
                      <span className="font-medium text-slate-900">
                        Versione {version.version}
                      </span>{" "}
                      — {formatDate(version.publishedAt)} — {version.title}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}

          <DocumentEditor
            initialContent={editorTemplate.draftContent}
            onSave={handleSaveDraft}
            onCancel={handleBackToList}
            readOnly={!canManage}
            subject={editorSubject}
          />
        </div>
      ) : null}

      {/* Genera: le due strade, modulo vuoto o documento compilato */}
      <Dialog
        open={Boolean(generateTarget)}
        onOpenChange={(open) => {
          if (!open) setGenerateTarget(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Genera documento</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="font-medium">{generateTarget?.title}</p>
            <p className="text-sm text-muted-foreground">
              <strong>Genera vuoto</strong> stampa il modulo da compilare a
              mano. <strong>Genera compilato</strong> scrive dentro i dati
              dell&apos;atleta, del club e della cassa: serve un atleta, e serve
              un modello pubblicato.
            </p>

            {generateTarget && generateTarget.subjectKind !== "athlete" ? (
              <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                Questo modello parla di{" "}
                {SUBJECT_LABELS[generateTarget.subjectKind].toLowerCase()}: da
                qui si stampa vuoto. Il compilato parte da un atleta.
              </p>
            ) : null}

            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 transform text-muted-foreground" />
              <Input
                placeholder="Cerca per nome o cognome..."
                value={athleteSearchTerm}
                onChange={(event) => setAthleteSearchTerm(event.target.value)}
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
              onClick={() => setGenerateTarget(null)}
            >
              Annulla
            </Button>
            <Button
              variant="outline"
              className="w-full sm:w-auto"
              onClick={() => void generateBlankPdf()}
            >
              Genera vuoto
            </Button>
            <Button
              className="w-full sm:w-auto"
              onClick={() => void previewFilled()}
              disabled={
                generatingFilled ||
                !selectedAthlete ||
                selectedAthlete === "no-athletes" ||
                generateTarget?.subjectKind !== "athlete"
              }
            >
              {generatingFilled ? "Generazione..." : "Genera compilato"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/*
        Il lotto: montato solo quando serve, cosi che ogni lotto parta da uno
        stato pulito senza che il dialogo debba azzerarsi da solo.
      */}
      {bulkTarget ? (
        <BulkGenerationDialog
          key={`${bulkTarget.id}-${bulkResume?.batchId || "nuovo"}`}
          template={bulkTarget}
          athletes={bulkAthletes}
          seasonId={activeSeasonId}
          resume={bulkResume}
          onClose={closeBulkDialog}
          onCompleted={() => void refreshAfterBulk()}
        />
      ) : null}

      {/* L'anteprima: cosa c'e dentro, e cosa non ci e entrato */}
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

            {filledPreview ? (
              <iframe
                title="Anteprima del documento"
                srcDoc={filledPreview.html}
                sandbox=""
                className="h-64 w-full rounded-md border border-slate-200 bg-white"
              />
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
            <Button
              variant="outline"
              className="w-full sm:w-auto"
              onClick={() =>
                filledPreview ? printHtmlPage(filledPreview.html) : undefined
              }
            >
              Stampa l&apos;anteprima
            </Button>
            <Button
              className="w-full sm:w-auto"
              onClick={() => void produceDocument()}
              disabled={producing}
            >
              {producing ? "Produzione..." : "Produci il documento"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Perche non si puo pubblicare: chiave per chiave */}
      <Dialog
        open={Boolean(publishIssues)}
        onOpenChange={(open) => {
          if (!open) setPublishIssues(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Questo modello non si puo pubblicare</DialogTitle>
          </DialogHeader>
          <div className="max-h-[50vh] space-y-3 overflow-y-auto py-2 text-sm">
            <p className="text-muted-foreground">
              Correggi il testo del modello e riprova. Ogni riga dice la parola
              che lo impedisce.
            </p>
            <ul className="space-y-2">
              {(publishIssues || []).map((issue, index) => (
                <li
                  key={`${issue.field}-${issue.key || index}`}
                  className="rounded-md border border-red-200 bg-red-50 p-3 text-red-900"
                >
                  {issue.key ? (
                    <p className="font-mono text-xs font-semibold">
                      {issue.key}
                    </p>
                  ) : null}
                  <p className="break-words">{issue.message}</p>
                </li>
              ))}
            </ul>
          </div>
          <DialogFooter>
            <Button onClick={() => setPublishIssues(null)}>Ho capito</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Nuovo modello */}
      <Dialog open={newDocumentDialog} onOpenChange={setNewDocumentDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nuovo Documento</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="title">Titolo</Label>
              <Input
                id="title"
                value={newDocumentTitle}
                onChange={(event) => setNewDocumentTitle(event.target.value)}
                placeholder="Inserisci il titolo del documento"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Descrizione</Label>
              <Input
                id="description"
                value={newDocumentDescription}
                onChange={(event) =>
                  setNewDocumentDescription(event.target.value)
                }
                placeholder="Inserisci una breve descrizione"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="subject">Di chi parla</Label>
              <Select
                value={newDocumentSubject}
                onValueChange={(value) =>
                  setNewDocumentSubject(value as TemplateSubject)
                }
              >
                <SelectTrigger id="subject">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(SUBJECT_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">{SUBJECT_HINT}</p>
            </div>
          </div>
          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button
              variant="outline"
              className="w-full sm:w-auto"
              onClick={() => setNewDocumentDialog(false)}
            >
              Annulla
            </Button>
            <Button
              className="w-full sm:w-auto"
              onClick={() => void handleCreateNewConfirm()}
              disabled={creating || !newDocumentTitle.trim()}
            >
              {creating ? "Creazione..." : "Crea"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancellare un modello */}
      <Dialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Eliminare «{deleteTarget?.title}»?</DialogTitle>
          </DialogHeader>
          <div className="py-2 text-sm text-muted-foreground">
            {deleteTarget && deleteTarget.generatedCount > 0 ? (
              <p>
                Questo modello ha gia prodotto {deleteTarget.generatedCount}{" "}
                {deleteTarget.generatedCount === 1 ? "documento" : "documenti"}:
                si ritira, non si cancella, o quei documenti non saprebbero piu
                spiegarsi.
              </p>
            ) : (
              <p>
                Il modello non ha prodotto nessun documento: si puo eliminare.
                L&apos;operazione non si annulla.
              </p>
            )}
          </div>
          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button
              variant="outline"
              className="w-full sm:w-auto"
              onClick={() => setDeleteTarget(null)}
            >
              Annulla
            </Button>
            <Button
              className="w-full bg-red-600 hover:bg-red-700 sm:w-auto"
              onClick={() =>
                deleteTarget ? void handleDeleteTemplate(deleteTarget) : undefined
              }
              disabled={Boolean(deleteTarget && deleteTarget.generatedCount > 0)}
            >
              Elimina
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
