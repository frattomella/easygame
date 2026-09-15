"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { FileText, Lock, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import Sidebar from "@/components/dashboard/Sidebar";
import Header from "@/components/dashboard/Header";
import { DashboardPageContainer, dashboardMainClassName } from "@/components/dashboard/dashboard-page-container";
import { useAuth } from "@/components/providers/AuthProvider";
import { useToast } from "@/components/ui/toast-notification";
import { PageHeader } from "@/components/web/page/PageHeader";
import { AlertBlock } from "@/components/web/page/Alerts";
import { EmptyStateCard } from "@/components/web/page/Cards";
import { Button } from "@/components/web/primitives/Button";
import { SegmentedControl } from "@/components/web/primitives/Controls";
import { getClubAthletes } from "@/lib/simplified-db";
import {
  adoptCatalogEntry,
  createDocumentTemplate,
  deleteDocumentTemplate,
  generateDocuments,
  getDocumentTemplate,
  listDocumentCatalog,
  listDocumentTemplates,
  listGeneratedDocuments,
  previewFilledDocument,
  publishDocumentTemplate,
  saveDocumentTemplateDraft,
  type DocumentCatalogEntry,
  type DocumentTemplateDetail,
  type DocumentTemplateSummary,
  type GeneratedDocumentSummary,
  type TemplateIssue,
  type TemplateStatus,
  type TemplateSubject,
} from "@/lib/api/documents";
import { canManageDocumentTemplates, canReadDocumentTemplates } from "@/lib/documents/permissions";
import { canReadClubForms } from "@/lib/forms/permissions";
import { renderBlankFormHtml } from "@/lib/documents/document-view";
import { BulkGenerationDialog } from "@/components/documents/BulkGenerationDialog";
import { buildDocumentBundleHtml, openBundleWindow, openPrintableBundle, renderBundleInto } from "@/components/documents/document-bundle";
import { clearStoredBatch, pendingSubjects, readStoredBatch, type BulkBatchState } from "@/components/documents/bulk-generation";
import { TemplatesGrid } from "@/components/modulistica/v2/templates-grid";
import { CatalogGrid } from "@/components/modulistica/v2/catalog-grid";
import { GeneratedGrid } from "@/components/modulistica/v2/generated-grid";
import { OnlineFormsSection } from "@/components/modulistica/v2/online-forms-section";
import { TemplateEditorView } from "@/components/modulistica/v2/template-editor-view";
import { NewTemplateDrawer, type NewTemplateValues } from "@/components/modulistica/v2/new-template-drawer";
import { GenerateDocumentDrawer } from "@/components/modulistica/v2/generate-document-drawer";
import { FilledPreviewDrawer, type FilledPreviewState } from "@/components/modulistica/v2/filled-preview-drawer";
import { DeleteTemplateDialog, PublishIssuesDialog } from "@/components/modulistica/v2/template-dialogs";
import {
  MODULISTICA_TABS,
  MODULISTICA_TAB_LABELS,
  isModulisticaTab,
  newTemplateContent,
  normalizeAthletes,
  renderBlankTemplateForPdf,
  type AthleteOption,
  type ModulisticaTab,
} from "@/components/modulistica/v2/modulistica-model";

/**
 * `/modulistica` — i modelli del club, le loro versioni, i documenti che
 * hanno prodotto, e i moduli online (Web V2). Audit:
 * `docs/redesign/audit/wave-e-modulistica.md`.
 *
 * Ogni gesto passa da `src/lib/api/documents.ts` e `src/lib/api/forms.ts`:
 * un modello ha un ciclo di vita dichiarato — bozza, pubblicato, ritirato —
 * e il gesto che produce un documento e uno solo: **anteprima** dal
 * risolutore lato server (`/api/v1/documents/filled`, che la pagina non
 * reimplementa), poi la **produzione**, che scrive una riga con la versione
 * citata.
 *
 * **Due domini in una pagina sola, e quindi due cancelli** (W6-42): i
 * modelli di documento che il club stampa e i moduli online che la famiglia
 * compila hanno due proprietari e due matrici. Ogni scheda porta il permesso
 * del suo dominio, e la scheda attiva si **ricava** dall'elenco di quelle
 * disponibili invece di essere sincronizzata da un effetto.
 *
 * **Lo stato di caricamento di una sezione non smonta le altre** (W6-43):
 * il caricamento dei modelli vive dentro le sue griglie, e «Moduli online»
 * si carica da sola.
 */
const PAGE_DESCRIPTION = "Gestisci i modelli di documento, i moduli online e i file che il club produce.";

const PageShell = ({ children }: { children: React.ReactNode }) => (
  <div className="flex h-[100dvh] bg-egw-page">
    <Sidebar />
    <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
      {/* `Header` monta gia `MobileTopBar` sotto i 1024 px: il titolo passa da qui. */}
      <Header title="Modulistica" />
      <main className={dashboardMainClassName}>
        <DashboardPageContainer>{children}</DashboardPageContainer>
      </main>
    </div>
  </div>
);

function ModulisticaPage() {
  const { activeClub } = useAuth();
  const { showToast } = useToast();
  const router = useRouter();
  const pathname = usePathname() || "/modulistica";
  const rawSearchParams = useSearchParams();
  const searchParams = React.useMemo(() => rawSearchParams ?? new URLSearchParams(), [rawSearchParams]);

  const clubId = activeClub?.id ? String(activeClub.id) : "";
  const activeRole = activeClub?.role ? String(activeClub.role) : "";
  const activeSeasonId = activeClub?.activeSeasonId ? String(activeClub.activeSeasonId) : null;

  /*
    Il server decide comunque: qui il permesso serve solo a non mostrare un
    pulsante che risponderebbe «Accesso negato», che e un difetto quanto una
    porta aperta. Si entra nella pagina se **almeno uno** dei due domini e
    aperto.
  */
  const canManage = canManageDocumentTemplates(activeRole);
  const canRead = canReadDocumentTemplates(activeRole);
  const canReadForms = canReadClubForms(activeRole);
  const canOpenPage = canRead || canReadForms;

  const [templates, setTemplates] = React.useState<DocumentTemplateSummary[]>([]);
  const [generatedDocuments, setGeneratedDocuments] = React.useState<GeneratedDocumentSummary[]>([]);
  const [athletes, setAthletes] = React.useState<AthleteOption[]>([]);
  const [catalog, setCatalog] = React.useState<DocumentCatalogEntry[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);

  const [activeView, setActiveView] = React.useState<"list" | "editor">("list");
  const [editorTemplate, setEditorTemplate] = React.useState<DocumentTemplateDetail | null>(null);
  const [editorSubject, setEditorSubject] = React.useState<TemplateSubject>("athlete");
  const [savingDraft, setSavingDraft] = React.useState(false);
  const [publishing, setPublishing] = React.useState(false);
  const [publishIssues, setPublishIssues] = React.useState<TemplateIssue[] | null>(null);

  const [newDocumentDialog, setNewDocumentDialog] = React.useState(false);
  const [creating, setCreating] = React.useState(false);
  const [adoptingKey, setAdoptingKey] = React.useState("");

  const [generateTarget, setGenerateTarget] = React.useState<DocumentTemplateSummary | null>(null);
  const [generatingFilled, setGeneratingFilled] = React.useState(false);
  const [producing, setProducing] = React.useState(false);
  const [deleteTarget, setDeleteTarget] = React.useState<DocumentTemplateSummary | null>(null);
  const [deleting, setDeleting] = React.useState(false);
  const [filledPreview, setFilledPreview] = React.useState<FilledPreviewState | null>(null);

  /*
    La generazione massiva (W3-E). Il lotto vive in `sessionStorage`, non
    qui: `interruptedBatch` e solo cio che questa pagina ha trovato li dentro
    al montaggio, cioe un lotto che qualcuno ha lasciato a meta ricaricando.
  */
  const [bulkTarget, setBulkTarget] = React.useState<DocumentTemplateSummary | null>(null);
  const [bulkResume, setBulkResume] = React.useState<BulkBatchState | null>(null);
  const [interruptedBatch, setInterruptedBatch] = React.useState<BulkBatchState | null>(null);

  /* ── Le schede e l'indirizzo ────────────────────────────────────────── */
  const availableTabs = React.useMemo<ModulisticaTab[]>(() => {
    const tabs: ModulisticaTab[] = [];
    if (canRead) tabs.push("documents");
    if (canManage) tabs.push("catalog");
    if (canReadForms) tabs.push("online-forms");
    if (canRead) tabs.push("generated");
    return tabs;
  }, [canRead, canManage, canReadForms]);

  const [activeTab, setActiveTab] = React.useState<ModulisticaTab>(() => {
    const requested = searchParams.get("tab");
    return isModulisticaTab(requested) ? requested : "documents";
  });

  const currentTab: ModulisticaTab = availableTabs.includes(activeTab) ? activeTab : availableTabs[0] || "documents";

  const selectTab = React.useCallback(
    (next: ModulisticaTab) => {
      setActiveTab(next);
      const params = new URLSearchParams(searchParams.toString());
      if (next === "documents") params.delete("tab");
      else params.set("tab", next);
      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  React.useEffect(() => {
    const requested = searchParams.get("tab");
    if (isModulisticaTab(requested) && requested !== activeTab) setActiveTab(requested);
    // Il valore in URL guida la scheda; `activeTab` cambia per il clic e non deve rieseguire l'effetto.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  /* `?action=new` apre il modulo di creazione (azioni rapide) e viene tolto dall'indirizzo. */
  React.useEffect(() => {
    if (searchParams.get("action") !== "new") return;
    if (canManage) setNewDocumentDialog(true);
    const params = new URLSearchParams(searchParams.toString());
    params.delete("action");
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, canManage]);

  /* ── Le letture ─────────────────────────────────────────────────────── */
  const loadAll = React.useCallback(async () => {
    if (!clubId || !canRead) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [templatesResult, generatedResult, athletesData, catalogResult] = await Promise.all([
        listDocumentTemplates({ includeRetired: true }),
        listGeneratedDocuments({ limit: 100 }),
        getClubAthletes(clubId).catch(() => []),
        canManage ? listDocumentCatalog() : Promise.resolve({ entries: [] as DocumentCatalogEntry[], error: null }),
      ]);
      setTemplates(templatesResult.templates);
      setGeneratedDocuments(generatedResult.documents);
      setAthletes(normalizeAthletes(athletesData));
      setCatalog(catalogResult.entries);
      setLoadError(templatesResult.error || null);
    } catch {
      setLoadError("Errore nel caricamento dei modelli");
    } finally {
      setLoading(false);
    }
  }, [clubId, canManage, canRead]);

  React.useEffect(() => {
    void loadAll();
  }, [loadAll]);

  /*
    Il lotto lasciato a meta si scopre al montaggio: e **questo** che rende
    ripartibile la generazione massiva dopo un F5.
  */
  React.useEffect(() => {
    setInterruptedBatch(readStoredBatch());
  }, []);

  const bulkAthletes = React.useMemo(() => athletes.map((athlete) => ({ id: athlete.id, label: athlete.label })), [athletes]);

  /* ── L'editor ───────────────────────────────────────────────────────── */
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
    const { template, error } = await saveDocumentTemplateDraft(editorTemplate.id, { content, subjectKind: editorSubject });
    setSavingDraft(false);
    if (error || !template) {
      showToast("error", error || "Errore nel salvataggio del modello");
      return;
    }
    setEditorTemplate(template);
    setTemplates((current) => current.map((item) => (item.id === template.id ? template : item)));
    showToast("success", "Bozza salvata. I documenti già prodotti non cambiano: per farla valere, pubblicala");
  };

  /**
   * Pubblicare non e salvare: crea una **versione**, e i documenti prodotti
   * da quel momento la citeranno per sempre. Quando non si puo, le `issues`
   * dicono **quale** parola e sbagliata.
   */
  const handlePublish = async (templateId: string) => {
    setPublishing(true);
    const { template, error, issues } = await publishDocumentTemplate(templateId);
    setPublishing(false);
    if (error || !template) {
      if (issues.length) setPublishIssues(issues);
      else showToast("error", error || "Errore nella pubblicazione del modello");
      return;
    }
    setTemplates((current) => current.map((item) => (item.id === template.id ? template : item)));
    if (editorTemplate?.id === template.id) setEditorTemplate(template);
    showToast("success", `Pubblicata la versione ${template.publishedVersion}`);
  };

  /* ── Il ciclo di vita ───────────────────────────────────────────────── */
  const handleCreateNewConfirm = async (values: NewTemplateValues) => {
    setCreating(true);
    const { template, error } = await createDocumentTemplate({
      title: values.title,
      description: values.description,
      subjectKind: values.subjectKind,
      content: newTemplateContent(values.title),
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
    showToast("success", "Nuovo modello creato: è una bozza, finché non lo pubblichi");
  };

  /**
   * Adottare una voce di catalogo: l'unico gesto che porta un modello di
   * piattaforma dentro il club. Lo fa il server, che di classe,
   * proprietario, rilettura e audit e il proprietario.
   */
  const adoptEntry = async (entry: DocumentCatalogEntry) => {
    setAdoptingKey(entry.key);
    const { template, error } = await adoptCatalogEntry(entry.key);
    setAdoptingKey("");
    if (error || !template) {
      showToast("error", error || "Errore nell'adozione del modello");
      return;
    }
    setTemplates((current) => [...current, template]);
    setCatalog((current) => current.map((voce) => (voce.key === entry.key ? { ...voce, adopted: true, adoptedTemplateId: template.id } : voce)));
    showToast("success", `«${template.title}» adottato: è già pubblicato, lo trovi fra i modelli del club`);
  };

  const handleChangeStatus = async (template: DocumentTemplateSummary, status: TemplateStatus) => {
    const { template: updated, error } = await saveDocumentTemplateDraft(template.id, { status });
    if (error || !updated) {
      showToast("error", error || "Errore nel cambio di stato del modello");
      return;
    }
    setTemplates((current) => current.map((item) => (item.id === updated.id ? updated : item)));
    showToast("success", status === "retired" ? "Modello ritirato: non produce documenti nuovi, e continua a spiegare quelli già prodotti" : "Modello riattivato");
  };

  /*
    Cancellare e ammesso solo per un modello che non ha prodotto niente. Il
    server lo rifiuta comunque, con un messaggio scritto per chi lo legge.
  */
  const handleDeleteTemplate = async (template: DocumentTemplateSummary) => {
    setDeleting(true);
    const { ok, error } = await deleteDocumentTemplate(template.id);
    setDeleting(false);
    setDeleteTarget(null);
    if (!ok) {
      showToast("error", error || "Errore nell'eliminazione del modello");
      return;
    }
    setTemplates((current) => current.filter((item) => item.id !== template.id));
    showToast("success", "Modello eliminato");
  };

  /* ── La generazione ─────────────────────────────────────────────────── */
  const openGenerateDialog = (template: DocumentTemplateSummary) => setGenerateTarget(template);

  /** Una pagina stampabile, aperta come il fascicolo: stampa chi guarda, quando vede che c'e tutto. */
  const printDocumentPage = (input: { id: string; title: string; html: string }) => {
    const aperto = openPrintableBundle(buildDocumentBundleHtml({ title: input.title, documents: [input], printLabel: "Stampa il documento" }));
    if (!aperto) showToast("error", "Il browser ha bloccato la finestra di stampa");
  };

  /**
   * Il modulo vuoto: si stampa e si compila a penna. Stampa la **bozza**
   * (nessuna rotta restituisce il contenuto pubblicato), e il cassetto lo
   * dice prima quando bozza e versione pubblicata non coincidono.
   */
  const generateBlankPdf = async () => {
    if (!generateTarget) return;
    /* La finestra si apre **prima** della lettura: aperta dopo un `await`, il browser la blocca. */
    const finestra = openBundleWindow();
    if (!finestra) {
      showToast("error", "Il browser ha bloccato la finestra di stampa");
      return;
    }
    const { template, error } = await getDocumentTemplate(generateTarget.id);
    if (error || !template) {
      finestra.close();
      showToast("error", error || "Modello non trovato");
      return;
    }
    renderBundleInto(
      finestra,
      buildDocumentBundleHtml({
        title: template.title,
        printLabel: "Stampa il modulo",
        documents: [
          {
            id: template.id,
            title: template.title,
            html: renderBlankFormHtml({ title: template.title, bodyHtml: renderBlankTemplateForPdf(template.draftContent) }),
          },
        ],
      }),
    );
    setGenerateTarget(null);
  };

  /** L'anteprima del compilato: la costruisce il server, qui si guarda. Non scrive niente. */
  const previewFilled = async (athleteId: string) => {
    if (!generateTarget) return;
    if (!athleteId) {
      showToast("error", "Seleziona prima un atleta");
      return;
    }
    setGeneratingFilled(true);
    const { preview, error } = await previewFilledDocument({ templateId: generateTarget.id, athleteId, seasonId: activeSeasonId });
    setGeneratingFilled(false);
    if (error || !preview) {
      showToast("error", error || "Errore nella generazione del documento");
      return;
    }
    setFilledPreview({
      templateId: generateTarget.id,
      athleteId,
      title: preview.title,
      html: preview.html,
      unresolved: Array.isArray(preview.unresolved) ? preview.unresolved : [],
      missing: Array.isArray(preview.missing) ? preview.missing : [],
      warnings: Array.isArray(preview.warnings) ? preview.warnings : [],
    });
    setGenerateTarget(null);
  };

  /** Produrre il documento: questo scrive una riga, che cita la versione con cui e stata prodotta. */
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
    selectTab("generated");
    const { documents } = await listGeneratedDocuments({ limit: 100 });
    setGeneratedDocuments(documents);
    showToast("success", "Documento prodotto: lo trovi in «Documenti generati»");
  };

  /* ── La generazione massiva ─────────────────────────────────────────── */
  /**
   * Un lotto nuovo, ma non sopra uno lasciato a meta: il lotto in sospeso
   * vive sotto **una** chiave di `sessionStorage`, e sovrascriverlo in
   * silenzio faceva sparire i mancanti. Lo stato si rilegge dallo storage e
   * non dalla memoria della pagina, perche fra il montaggio e questo clic il
   * lotto puo essere finito in un'altra scheda.
   */
  const openBulkDialog = (template: DocumentTemplateSummary) => {
    const sospeso = readStoredBatch();
    if (sospeso && !pendingSubjects(sospeso).length) {
      clearStoredBatch();
      setInterruptedBatch(null);
    } else if (sospeso) {
      setInterruptedBatch(sospeso);
      showToast("error", `Un lotto di «${sospeso.templateTitle}» è rimasto a metà: riprendilo o scartalo prima di cominciarne un altro`);
      return;
    }
    setBulkResume(null);
    setBulkTarget(template);
  };

  const resumeBulkBatch = () => {
    if (!interruptedBatch) return;
    const template = templates.find((item) => item.id === interruptedBatch.templateId);
    if (!template) {
      clearStoredBatch();
      setInterruptedBatch(null);
      showToast("error", "Il modello di quel lotto non c'è più: il lotto è stato scartato");
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

  /* A lotto finito si rileggono modelli e documenti, non tutta la pagina. */
  const refreshAfterBulk = async () => {
    const [templatesResult, generatedResult] = await Promise.all([listDocumentTemplates({ includeRetired: true }), listGeneratedDocuments({ limit: 100 })]);
    setTemplates(templatesResult.templates);
    setGeneratedDocuments(generatedResult.documents);
  };

  const documentsLoading = loading;
  const documentsGridState = documentsLoading ? "loading" : loadError ? "error" : "ready";

  /* ── Senza club, o senza permesso ───────────────────────────────────── */
  if (!clubId || !canOpenPage) {
    return (
      <PageShell>
        <PageHeader eyebrow="Segreteria" title="Modulistica" description={PAGE_DESCRIPTION} />
        <EmptyStateCard
          icon={<Lock />}
          iconTone="neutral"
          title={clubId ? "Non hai accesso alla modulistica" : "Nessun club attivo"}
          description={clubId ? "I modelli di documento e i moduli online li vede chi lavora nella segreteria del club." : "Nessun club attivo: scegline uno dal menu in alto."}
        />
      </PageShell>
    );
  }

  const tabOptions = MODULISTICA_TABS.filter((tab) => availableTabs.includes(tab)).map((tab) => ({ value: tab, label: MODULISTICA_TAB_LABELS[tab] }));

  return (
    <PageShell>
      {activeView === "editor" && editorTemplate ? (
        <TemplateEditorView
          template={editorTemplate}
          subject={editorSubject}
          onSubjectChange={setEditorSubject}
          canManage={canManage}
          onSave={(content) => void handleSaveDraft(content)}
          onPublish={() => void handlePublish(editorTemplate.id)}
          onBack={handleBackToList}
          savingDraft={savingDraft}
          publishing={publishing}
        />
      ) : (
        <>
          <PageHeader
            eyebrow="Segreteria"
            title="Modulistica"
            description={PAGE_DESCRIPTION}
            actions={
              currentTab === "documents" && canManage ? (
                <Button variant="primary" icon={<Plus />} onClick={() => setNewDocumentDialog(true)}>
                  Nuovo documento
                </Button>
              ) : null
            }
          >
            {/*
              Ogni scheda compare solo se il **suo** dominio e aperto (W6-42).
              La barra scorre nel proprio contenitore invece di allargare la
              pagina, cosi «Documenti generati» resta raggiungibile da un
              telefono.
            */}
            <SegmentedControl<ModulisticaTab> aria-label="Sezioni della modulistica" value={currentTab} onChange={selectTab} options={tabOptions} className="max-w-full overflow-x-auto" />
          </PageHeader>

          {/* ── Modelli di documento ─────────────────────────────────── */}
          {canRead ? (
            <div className={cn("flex-col gap-[18px]", currentTab === "documents" ? "flex" : "hidden")}>
              {/*
                Il lotto interrotto si propone qui, non dentro il dialogo: chi
                ha ricaricato la pagina non sa piu da quale modello era partito.
              */}
              {interruptedBatch && !bulkTarget ? (
                <AlertBlock
                  severity="warning"
                  title={`Un lotto di «${interruptedBatch.templateTitle}» è rimasto a metà`}
                  actions={
                    <>
                      <Button variant="neutral" size="sm" onClick={resumeBulkBatch}>
                        Riprendi
                      </Button>
                      <Button variant="secondary" size="sm" onClick={discardBulkBatch}>
                        Scarta
                      </Button>
                    </>
                  }
                >
                  <span className="egw-num">{interruptedBatch.servedSubjectIds.length}</span> di <span className="egw-num">{interruptedBatch.subjects.length}</span> serviti. Riprendendolo si
                  generano solo i mancanti: i documenti già prodotti non si duplicano.
                </AlertBlock>
              ) : null}

              <TemplatesGrid
                templates={templates}
                state={documentsGridState}
                errorMessage={loadError}
                onRetry={() => void loadAll()}
                canManage={canManage}
                handlers={{
                  onGenerate: openGenerateDialog,
                  onBulk: openBulkDialog,
                  onEdit: (template) => void openEditor(template),
                  onPublish: (template) => void handlePublish(template.id),
                  onChangeStatus: (template, status) => void handleChangeStatus(template, status),
                  onDelete: setDeleteTarget,
                  onCreate: () => setNewDocumentDialog(true),
                }}
              />
            </div>
          ) : null}

          {/* ── Catalogo: la vede solo chi puo adottare ──────────────── */}
          {canManage ? (
            <div className={cn("flex-col gap-[18px]", currentTab === "catalog" ? "flex" : "hidden")}>
              <CatalogGrid entries={catalog} state={documentsLoading ? "loading" : "ready"} onRetry={() => void loadAll()} adoptingKey={adoptingKey} onAdopt={(entry) => void adoptEntry(entry)} />
            </div>
          ) : null}

          {/* ── Moduli online: si carica da sola (W6-43) ─────────────── */}
          {canReadForms ? (
            <div className={cn("flex-col gap-[18px]", currentTab === "online-forms" ? "flex" : "hidden")}>
              <OnlineFormsSection />
            </div>
          ) : null}

          {/* ── Documenti generati ───────────────────────────────────── */}
          {canRead ? (
            <div className={cn("flex-col gap-[18px]", currentTab === "generated" ? "flex" : "hidden")}>
              <GeneratedGrid documents={generatedDocuments} state={documentsGridState} errorMessage={loadError} onRetry={() => void loadAll()} />
            </div>
          ) : null}
        </>
      )}

      <NewTemplateDrawer open={newDocumentDialog} onOpenChange={setNewDocumentDialog} onCreate={handleCreateNewConfirm} creating={creating} />

      <GenerateDocumentDrawer
        open={Boolean(generateTarget)}
        onOpenChange={(open) => !open && !generatingFilled && setGenerateTarget(null)}
        template={generateTarget}
        athletes={athletes}
        onBlank={() => void generateBlankPdf()}
        onFilled={previewFilled}
        generatingFilled={generatingFilled}
      />

      {/* Il lotto: montato solo quando serve, cosi che ogni lotto parta da uno stato pulito. */}
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

      <FilledPreviewDrawer
        open={Boolean(filledPreview)}
        onOpenChange={(open) => !open && !producing && setFilledPreview(null)}
        preview={filledPreview}
        onPrint={() => (filledPreview ? printDocumentPage({ id: filledPreview.templateId, title: filledPreview.title, html: filledPreview.html }) : undefined)}
        onProduce={produceDocument}
        producing={producing}
      />

      <PublishIssuesDialog issues={publishIssues} onClose={() => setPublishIssues(null)} />

      <DeleteTemplateDialog template={deleteTarget} onOpenChange={(open) => !open && !deleting && setDeleteTarget(null)} onConfirm={handleDeleteTemplate} loading={deleting} />
    </PageShell>
  );
}

export default function ModulisticaPageWithLayout() {
  return (
    <React.Suspense
      fallback={
        <PageShell>
          <PageHeader eyebrow="Segreteria" title="Modulistica" description={PAGE_DESCRIPTION} />
        </PageShell>
      }
    >
      <ModulisticaPage />
    </React.Suspense>
  );
}
