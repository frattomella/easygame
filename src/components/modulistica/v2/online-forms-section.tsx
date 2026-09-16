"use client";

import * as React from "react";
import {
  UserCheck,
  MessageSquareWarning,
  CheckCircle2, Archive, ArchiveRestore, ClipboardList, Copy, FileText, Inbox, Plus, Search, Sparkles, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/toast-notification";
import { DataGrid } from "@/components/web/datagrid/DataGrid";
import type { ColumnDef, FilterDef, FilterState, GridState, RowActionDef } from "@/components/web/datagrid/types";
import { Button } from "@/components/web/primitives/Button";
import { SegmentedControl } from "@/components/web/primitives/Controls";
import { KpiCard } from "@/components/web/page/Cards";
import { DataChip, IconChip, StatusPill } from "@/components/web/primitives/StatusPill";
import { InfoCard } from "@/components/web/page/Cards";
import { InsetBlock } from "@/components/web/primitives/Surface";
import { useConfirm } from "@/components/web/overlays/useConfirm";
import { formatDateShort, formatInteger, joinMeta, MISSING } from "@/lib/web/format";
import { FormBuilder } from "@/components/forms/form-builder";
import { SubmissionReviewDialog } from "@/components/forms/submission-review-dialog";
import { FORM_STATUS_LABELS, FORM_SUBMISSION_STATUS_LABELS, type FormSubmissionRecord, type FormTemplateDetail, type FormTemplateSummary } from "@/lib/forms/model";
import { FORM_SUBJECTS } from "@/lib/forms/dynamic-fields";
import { buildFormFromCatalog, DISTRIBUTABLE_FORM_CATALOG, type FormCatalogEntry } from "@/lib/forms/catalog";
import * as formsApi from "@/lib/api/forms";
import {
  FORM_VIEWS,
  SUBMISSION_VIEWS,
  formCatalogClassLabel,
  formCatalogTitle,
  formStatusSpec,
  submissionStatusFromFilters,
  submissionStatusSpec,
} from "@/components/modulistica/v2/modulistica-model";

/**
 * I moduli online del club (Web V2): i moduli, la coda della segreteria, i
 * modelli consigliati. Sostituisce `forms-dashboard.tsx` con tre griglie;
 * l'editor del modulo (`FormBuilder`) e il dialogo di esame
 * (`SubmissionReviewDialog`, condiviso con la scheda atleta) restano
 * un'implementazione sola e si riusano.
 *
 * Le prime due sezioni sono le due domande che si fanno aprendo questa
 * pagina: «che moduli ho?» e «cosa e arrivato?». Il secondo numero e quello
 * che conta ed e sull'etichetta: una compilazione che resta in coda per tre
 * settimane e un'iscrizione persa. La terza risponde a «cosa potrei
 * prendere?»: un catalogo, con la stessa forma di quello dei modelli di
 * documento (ADR-0092), e la copia che il club adotta dice da quale modello
 * viene.
 *
 * **Tre stati, non due** (W6-44): caricamento, errore ed elenco vuoto sono
 * tre schermate distinte, e un elenco letto male si butta invece di restare
 * accanto all'errore.
 */
type Section = "moduli" | "coda" | "modelli";

type LoadState = { status: "loading" | "ready" | "error"; error: string };
const LOADING: LoadState = { status: "loading", error: "" };
const READY: LoadState = { status: "ready", error: "" };

const gridStateOf = (state: LoadState): GridState => (state.status === "loading" ? "loading" : state.status === "error" ? "error" : "ready");

const submissionName = (submission: FormSubmissionRecord) =>
  submission.subjects.find((selection) => selection.label)?.label || submission.respondentName || submission.respondentEmail || "Compilazione senza nome";

/*
  Nessun predicato client sulle scritture, come nella V1: la matrice della
  risorsa `forms` (`canAccessClubResource`) non distingue la lettura dalla
  scrittura per i ruoli che arrivano fin qui, e il server la applica.
*/
export function OnlineFormsSection() {
  const { showToast } = useToast();
  const [confirm, confirmDialog] = useConfirm();
  const [section, setSection] = React.useState<Section>("moduli");
  const [templates, setTemplates] = React.useState<FormTemplateSummary[]>([]);
  const [submissions, setSubmissions] = React.useState<FormSubmissionRecord[]>([]);
  const [openTemplate, setOpenTemplate] = React.useState<FormTemplateDetail | null>(null);
  const [reviewing, setReviewing] = React.useState<string>("");
  const [statusFilter, setStatusFilter] = React.useState("pending");
  const [templatesState, setTemplatesState] = React.useState<LoadState>(LOADING);
  const [submissionsState, setSubmissionsState] = React.useState<LoadState>(LOADING);
  const [adoptingKey, setAdoptingKey] = React.useState("");
  const [expandedEntry, setExpandedEntry] = React.useState<string | null>(null);

  /*
    Gli archiviati si leggono sempre e li nasconde la vista «In uso»: la V1
    li chiedeva al server solo con «Mostra archiviati», ma una vista della
    griglia e il modo del sistema di rispondere alla stessa domanda.
  */
  const loadTemplates = React.useCallback(async () => {
    setTemplatesState(LOADING);
    try {
      setTemplates(await formsApi.fetchFormTemplates({ includeArchived: true }));
      setTemplatesState(READY);
    } catch (error: any) {
      setTemplates([]);
      setTemplatesState({ status: "error", error: error?.message || "Non riesco a leggere i moduli" });
    }
  }, []);

  const loadSubmissions = React.useCallback(async () => {
    setSubmissionsState(LOADING);
    try {
      const result = await formsApi.fetchFormSubmissions({ status: statusFilter, limit: 50 });
      setSubmissions(result.items);
      setSubmissionsState(READY);
    } catch (error: any) {
      setSubmissions([]);
      setSubmissionsState({ status: "error", error: error?.message || "Non riesco a leggere la coda" });
    }
  }, [statusFilter]);

  React.useEffect(() => {
    void loadTemplates();
  }, [loadTemplates]);

  React.useEffect(() => {
    void loadSubmissions();
  }, [loadSubmissions]);

  const pendingTotal = React.useMemo(() => templates.reduce((total, template) => total + template.pendingCount, 0), [templates]);
  /* I contatori della coda (ADR-0189 §16): sommati dai moduli, uno per stato. */
  const statusTotals = React.useMemo(() => {
    const totals = { pending: 0, changes_requested: 0, approved: 0, converted: 0, rejected: 0, archived: 0 };
    for (const template of templates) {
      for (const key of Object.keys(totals) as Array<keyof typeof totals>) {
        totals[key] += template.statusCounts?.[key] || 0;
      }
    }
    return totals;
  }, [templates]);

  /*
    Creare un modulo vuoto e adottare un modello sono lo **stesso** gesto e
    la stessa rotta: cambia solo cosa si cita. Due strade per creare un
    modulo sarebbero due modi di finire con impostazioni diverse.
  */
  const create = async (starter: string) => {
    setAdoptingKey(starter);
    try {
      const created = await formsApi.createFormTemplate(starter);
      await loadTemplates();
      setOpenTemplate(created);
    } catch (error: any) {
      showToast("error", error?.message || "Non riesco a creare il modulo");
    } finally {
      setAdoptingKey("");
    }
  };

  const adoptedCatalogKeys = React.useMemo(() => new Set(templates.map((template) => template.catalogKey).filter((key): key is string => Boolean(key))), [templates]);

  const open = async (id: string) => {
    try {
      setOpenTemplate(await formsApi.fetchFormTemplate(id));
    } catch (error: any) {
      showToast("error", error?.message || "Non riesco ad aprire il modulo");
    }
  };

  const runOnTemplate = async (operation: () => Promise<unknown>, message: string) => {
    try {
      await operation();
      await loadTemplates();
      showToast("success", message);
    } catch (error: any) {
      showToast("error", error?.message || "Operazione non riuscita");
    }
  };

  const deleteTemplate = async (template: FormTemplateSummary) => {
    const ok = await confirm({
      tone: "danger",
      title: `Eliminare «${template.title}»?`,
      description: "Un modulo con delle compilazioni non si cancella: viene archiviato, e le compilazioni restano leggibili.",
      consequences: ["I campi e le impostazioni del modulo", "Il link pubblico, che smette di rispondere"],
      confirmLabel: "Elimina",
      irreversible: template.submissionCount === 0,
    });
    if (!ok) return;
    await runOnTemplate(async () => {
      const result = await formsApi.deleteForm(template.id);
      if (result.archived) {
        showToast("info", "Il modulo ha già delle compilazioni: è stato archiviato invece che cancellato.");
      }
    }, "Modulo eliminato");
  };

  /* ── La coda: il server filtra per stato, la vista dice quale ────────── */
  const onSubmissionFilters = React.useCallback((filters: FilterState) => {
    setStatusFilter(submissionStatusFromFilters(filters));
  }, []);

  /* ── Colonne ──────────────────────────────────────────────────────────── */
  const templateColumns = React.useMemo<ColumnDef<FormTemplateSummary>[]>(
    () => [
      {
        id: "identity",
        header: "Modulo",
        kind: "identity",
        locked: true,
        width: 2,
        cell: (row) => (
          <span className="flex min-w-0 items-center gap-2.5">
            <IconChip tone="blue" size={32} className="[&>svg]:h-4 [&>svg]:w-4">
              <ClipboardList />
            </IconChip>
            <span className="min-w-0 flex-1">
              <button
                type="button"
                onClick={() => void open(row.id)}
                className="egw-ellipsis block max-w-full text-left font-brand text-[12.5px] font-semibold text-egw-ink hover:text-egw-blue-700 hover:underline focus-visible:outline-none focus-visible:underline"
              >
                {row.title}
              </button>
              <span className="egw-ellipsis block font-brand text-[10px] leading-[1.4] text-[rgba(11,26,58,.5)]">
                {joinMeta(`${row.fieldCount} campi`, row.publishedVersion ? `versione ${row.publishedVersion}` : null, formCatalogTitle(row.catalogKey) ? `Da modello EasyGame: ${formCatalogTitle(row.catalogKey)}` : null)}
              </span>
            </span>
          </span>
        ),
        sortValue: (row) => row.title.toLowerCase(),
        exportValue: (row) => row.title,
        title: (row) => row.title,
      },
      {
        id: "status",
        header: "Stato",
        kind: "status",
        cell: (row) => <StatusPill status={formStatusSpec(row.status)} />,
        sortValue: (row) => FORM_STATUS_LABELS[row.status],
        exportValue: (row) => FORM_STATUS_LABELS[row.status],
      },
      {
        id: "pending",
        header: "Da esaminare",
        kind: "number",
        align: "right",
        cell: (row) =>
          row.pendingCount ? (
            <DataChip size="sm" tone="amber">
              {formatInteger(row.pendingCount)} da esaminare
            </DataChip>
          ) : null,
        sortValue: (row) => row.pendingCount,
        exportValue: (row) => row.pendingCount,
      },
      {
        id: "unpublished",
        header: "Bozza",
        kind: "chips",
        cell: (row) =>
          row.hasUnpublishedChanges ? (
            <DataChip size="sm" tone="blue">
              Modifiche non pubblicate
            </DataChip>
          ) : null,
        sortValue: (row) => (row.hasUnpublishedChanges ? 1 : 0),
        exportValue: (row) => (row.hasUnpublishedChanges ? "Modifiche non pubblicate" : ""),
      },
      {
        id: "subjects",
        header: "Soggetti",
        kind: "chips",
        width: 1.3,
        cell: (row) => (
          <span className="flex min-w-0 items-center gap-1">
            {row.subjects.slice(0, 2).map((subject) => (
              <DataChip key={subject} size="sm">
                {FORM_SUBJECTS[subject]?.label || subject}
              </DataChip>
            ))}
            {row.subjects.length > 2 ? (
              <DataChip size="sm" title={row.subjects.slice(2).map((s) => FORM_SUBJECTS[s]?.label || s).join(", ")}>
                +{row.subjects.length - 2}
              </DataChip>
            ) : null}
          </span>
        ),
        sortValue: (row) => row.subjects.length,
        exportValue: (row) => row.subjects.map((subject) => FORM_SUBJECTS[subject]?.label || subject).join(", "),
      },
      {
        id: "fields",
        header: "Campi",
        kind: "number",
        align: "right",
        hidden: true,
        cell: (row) => <span className="egw-num">{formatInteger(row.fieldCount)}</span>,
        sortValue: (row) => row.fieldCount,
        exportValue: (row) => row.fieldCount,
      },
      {
        id: "version",
        header: "Versione",
        kind: "number",
        hidden: true,
        cell: (row) => (row.publishedVersion ? <span className="egw-num">{formatInteger(row.publishedVersion)}</span> : null),
        sortValue: (row) => row.publishedVersion,
        exportValue: (row) => row.publishedVersion,
      },
      {
        id: "updatedAt",
        header: "Aggiornato il",
        kind: "date",
        cell: (row) => (row.updatedAt ? <span className="egw-num">{formatDateShort(row.updatedAt)}</span> : null),
        sortValue: (row) => row.updatedAt || null,
        exportValue: (row) => row.updatedAt,
      },
      {
        id: "catalog",
        header: "Da modello EasyGame",
        kind: "text",
        hidden: true,
        cell: (row) => formCatalogTitle(row.catalogKey),
        sortValue: (row) => formCatalogTitle(row.catalogKey) || null,
        exportValue: (row) => formCatalogTitle(row.catalogKey),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const templateFilters = React.useMemo<FilterDef<FormTemplateSummary>[]>(
    () => [
      {
        id: "status",
        label: "Stato",
        type: "multi",
        pinned: true,
        options: (["published", "draft", "archived"] as const).map((status) => ({
          value: status,
          label: FORM_STATUS_LABELS[status],
          count: templates.filter((row) => row.status === status).length,
        })),
        apply: (row, value) => (Array.isArray(value) && value.length ? value.includes(row.status) : true),
      },
      {
        id: "pending",
        label: "Con compilazioni da esaminare",
        type: "boolean",
        apply: (row, value) => (value === true ? row.pendingCount > 0 : true),
      },
      {
        id: "enrollment",
        label: "Iscrizione e rinnovo",
        type: "boolean",
        apply: (row, value) => (value === true ? row.isEnrollment : true),
      },
    ],
    [templates],
  );

  const templateActions = React.useMemo<RowActionDef<FormTemplateSummary>[]>(
    () => [
      { id: "open", label: "Apri", icon: <FileText />, primary: true, onClick: (row) => void open(row.id) },
      { id: "duplicate", label: "Duplica", icon: <Copy />, onClick: (row) => void runOnTemplate(() => formsApi.duplicateForm(row.id), "Modulo duplicato") },
      { id: "restore", label: "Ripristina", icon: <ArchiveRestore />, hidden: (row) => row.status !== "archived", onClick: (row) => void runOnTemplate(() => formsApi.restoreForm(row.id), "Modulo ripristinato come bozza") },
      { id: "archive", label: "Archivia", icon: <Archive />, hidden: (row) => row.status === "archived", onClick: (row) => void runOnTemplate(() => formsApi.archiveForm(row.id), "Modulo archiviato") },
      { id: "delete", label: "Elimina", icon: <Trash2 />, tone: "danger", onClick: (row) => void deleteTemplate(row) },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const submissionColumns = React.useMemo<ColumnDef<FormSubmissionRecord>[]>(
    () => [
      {
        id: "identity",
        header: "Compilazione",
        kind: "identity",
        locked: true,
        width: 2,
        cell: (row) => (
          <span className="flex min-w-0 items-center gap-2.5">
            <IconChip tone="amber" size={32} className="[&>svg]:h-4 [&>svg]:w-4">
              <Inbox />
            </IconChip>
            <span className="min-w-0 flex-1">
              <button
                type="button"
                onClick={() => setReviewing(row.id)}
                className="egw-ellipsis block max-w-full text-left font-brand text-[12.5px] font-semibold text-egw-ink hover:text-egw-blue-700 hover:underline focus-visible:outline-none focus-visible:underline"
              >
                {submissionName(row)}
              </button>
              <span className="egw-ellipsis block font-brand text-[10px] leading-[1.4] text-[rgba(11,26,58,.5)]">{joinMeta(row.templateTitle, `versione ${row.version}`)}</span>
            </span>
          </span>
        ),
        sortValue: (row) => submissionName(row).toLowerCase(),
        exportValue: (row) => submissionName(row),
        title: (row) => submissionName(row),
      },
      {
        id: "template",
        header: "Modulo",
        kind: "text",
        width: 1.4,
        cell: (row) => row.templateTitle,
        sortValue: (row) => row.templateTitle.toLowerCase(),
        title: (row) => row.templateTitle,
      },
      {
        id: "status",
        header: "Stato",
        kind: "status",
        cell: (row) => <StatusPill status={submissionStatusSpec(row.status)} />,
        sortValue: (row) => FORM_SUBMISSION_STATUS_LABELS[row.status],
        exportValue: (row) => FORM_SUBMISSION_STATUS_LABELS[row.status],
      },
      {
        id: "submittedAt",
        header: "Inviata il",
        kind: "date",
        cell: (row) => (
          <span className="egw-num">
            {row.submittedAt ? formatDateShort(row.submittedAt) : MISSING}
            {row.revision > 1 ? <span className="ml-1 text-egw-ink-62">· rev. {row.revision}</span> : null}
          </span>
        ),
        sortValue: (row) => row.submittedAt || null,
        exportValue: (row) => row.submittedAt,
      },
      {
        id: "completeness",
        header: "Completezza",
        kind: "classification",
        cell: (row) => {
          const legali = row.declarations.length;
          const accettate = row.declarations.filter((d) => d.answer).length;
          const allegati = row.files.length;
          return (
            <span className="flex flex-wrap gap-1">
              {allegati ? <DataChip size="sm">{allegati} {allegati === 1 ? "allegato" : "allegati"}</DataChip> : null}
              {legali ? <DataChip size="sm" tone={accettate === legali ? "green" : "amber"}>{accettate}/{legali} dichiarazioni</DataChip> : null}
              {row.athleteId ? <DataChip size="sm" tone="blue">scheda collegata</DataChip> : null}
              {row.trialAthleteId ? <DataChip size="sm" tone="amber">da prova</DataChip> : null}
            </span>
          );
        },
        sortValue: (row) => row.files.length,
        exportValue: (row) => `${row.files.length} allegati · ${row.declarations.filter((d) => d.answer).length}/${row.declarations.length} dichiarazioni`,
      },
      {
        id: "version",
        header: "Versione",
        kind: "number",
        hidden: true,
        cell: (row) => <span className="egw-num">{formatInteger(row.version)}</span>,
        sortValue: (row) => row.version,
        exportValue: (row) => row.version,
      },
      {
        id: "source",
        header: "Provenienza",
        kind: "classification",
        hidden: true,
        cell: (row) => <DataChip size="sm">{row.source === "public" ? "Modulo pubblico" : "Compilato in segreteria"}</DataChip>,
        sortValue: (row) => row.source,
        exportValue: (row) => (row.source === "public" ? "Modulo pubblico" : "Compilato in segreteria"),
      },
    ],
    [],
  );

  const submissionFilters = React.useMemo<FilterDef<FormSubmissionRecord>[]>(
    () => [
      {
        id: "status",
        label: "Stato",
        type: "select",
        pinned: true,
        options: [
          { value: "pending", label: "Da revisionare", tone: "amber" },
          { value: "changes_requested", label: "Integrazione richiesta", tone: "amber" },
          { value: "approved", label: "Approvate", tone: "green" },
          { value: "converted", label: "Atleta creato", tone: "green" },
          { value: "rejected", label: "Rifiutate", tone: "red" },
          { value: "archived", label: "Archiviate", tone: "neutral" },
        ],
        /* Il filtro lo applica il server (`fetchFormSubmissions({ status })`): qui non toglie niente. */
        apply: () => true,
      },
    ],
    [],
  );

  const submissionActions = React.useMemo<RowActionDef<FormSubmissionRecord>[]>(
    () => [{ id: "review", label: "Esamina", icon: <Search />, primary: true, onClick: (row) => setReviewing(row.id) }],
    [],
  );

  if (openTemplate) {
    return (
      <FormBuilder
        template={openTemplate}
        onTemplateChange={(next) => {
          setOpenTemplate(next);
          void loadTemplates();
        }}
        onBack={() => {
          setOpenTemplate(null);
          void loadTemplates();
        }}
      />
    );
  }

  return (
    <div className="flex flex-col gap-[18px]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SegmentedControl<Section>
          aria-label="Sezioni dei moduli online"
          value={section}
          onChange={setSection}
          options={[
            { value: "moduli", label: "Moduli", count: templates.length || null },
            { value: "coda", label: "Iscrizioni online", count: pendingTotal || null },
            { value: "modelli", label: "Modelli consigliati" },
          ]}
          className="max-w-full overflow-x-auto"
        />
        {section === "moduli" ? (
          <Button variant="secondary" icon={<Plus />} onClick={() => void create("blank")} loading={adoptingKey === "blank"} disabled={Boolean(adoptingKey)}>
            Nuovo modulo
          </Button>
        ) : null}
      </div>

      {section === "moduli" ? (
        <DataGrid<FormTemplateSummary>
          module="modulistica-moduli"
          aria-label="Moduli online del club"
          rows={templates}
          getRowId={(row) => row.id}
          rowLabel={(row) => row.title}
          columns={templateColumns}
          filters={templateFilters}
          views={FORM_VIEWS}
          defaultSort={{ columnId: "updatedAt", direction: "desc" }}
          rowActions={templateActions}
          onOpenRow={(row) => void open(row.id)}
          canSelect={false}
          state={gridStateOf(templatesState)}
          errorMessage={templatesState.error || null}
          onRetry={() => void loadTemplates()}
          noun={{ singular: "modulo", plural: "moduli" }}
          empty={{
            icon: <ClipboardList />,
            title: "Nessun modulo, per ora",
            description: "«Iscrizione online» è già scritto: lo trovi in Modelli consigliati, con link pubblico, dati dell'atleta, contatti del genitore, documenti e consenso.",
            primary: (
              <Button variant="primary" size="sm" icon={<Sparkles />} onClick={() => setSection("modelli")}>
                Vedi i modelli consigliati
              </Button>
            ),
          }}
        />
      ) : null}

      {section === "coda" ? (
        /*
          **La coda delle iscrizioni online** (ADR-0189 §16): i contatori
          per stato sopra la griglia, cliccabili, e la griglia filtrata dal
          server. «Completate» sono le pratiche da cui e nata una scheda.
        */
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4" data-test="inbox-counters">
          <KpiCard label="Da revisionare" value={formatInteger(statusTotals.pending)} icon={<Inbox />} iconTone="amber" onClick={() => setStatusFilter("pending")} ariaLabel="Mostra le pratiche da revisionare" />
          <KpiCard label="Integrazione richiesta" value={formatInteger(statusTotals.changes_requested)} icon={<MessageSquareWarning />} iconTone="orange" onClick={() => setStatusFilter("changes_requested")} ariaLabel="Mostra le pratiche in attesa di integrazione" />
          <KpiCard label="Approvate" value={formatInteger(statusTotals.approved)} icon={<CheckCircle2 />} iconTone="green" onClick={() => setStatusFilter("approved")} ariaLabel="Mostra le pratiche approvate" />
          <KpiCard label="Completate" value={formatInteger(statusTotals.converted)} qualifier="atleta creato o collegato" icon={<UserCheck />} iconTone="blue" onClick={() => setStatusFilter("converted")} ariaLabel="Mostra le pratiche completate" />
        </div>
      ) : null}

      {section === "coda" ? (
        <DataGrid<FormSubmissionRecord>
          module="modulistica-coda"
          aria-label="Iscrizioni online"
          rows={submissions}
          getRowId={(row) => row.id}
          rowLabel={(row) => submissionName(row)}
          columns={submissionColumns}
          filters={submissionFilters}
          views={SUBMISSION_VIEWS}
          onFiltersChange={onSubmissionFilters}
          defaultSort={{ columnId: "submittedAt", direction: "desc" }}
          rowActions={submissionActions}
          onOpenRow={(row) => setReviewing(row.id)}
          canSelect={false}
          state={gridStateOf(submissionsState)}
          errorMessage={submissionsState.error || null}
          onRetry={() => void loadSubmissions()}
          noun={{ singular: "compilazione", plural: "compilazioni" }}
          empty={{
            icon: <Inbox />,
            title: "Niente in coda",
            description: "Le compilazioni arrivate compaiono qui prima di toccare l'anagrafica.",
          }}
        />
      ) : null}

      {section === "modelli" ? (
        <div className="flex flex-col gap-[18px]">
          <InfoCard eyebrow="Modelli consigliati EasyGame">
            Moduli già scritti che il club può adottare. Adottarne uno ne crea una <strong>copia del club</strong>: da quel momento si
            modifica liberamente e il catalogo non la tocca più.
          </InfoCard>
          <ul className="flex flex-col gap-3">
            {DISTRIBUTABLE_FORM_CATALOG.map((entry) => (
              <li key={entry.key}>
                <FormCatalogRow
                  entry={entry}
                  adopted={adoptedCatalogKeys.has(entry.key)}
                  adopting={adoptingKey === entry.key}
                  busy={Boolean(adoptingKey)}
                  expanded={expandedEntry === entry.key}
                  onToggle={() => setExpandedEntry((current) => (current === entry.key ? null : entry.key))}
                  onAdopt={() => void create(entry.key)}
                />
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {reviewing ? (
        <SubmissionReviewDialog
          submissionId={reviewing}
          onClose={() => setReviewing("")}
          onReviewed={() => {
            void loadSubmissions();
            void loadTemplates();
          }}
        />
      ) : null}

      {confirmDialog}
    </div>
  );
}

/**
 * Una voce del catalogo dei moduli: classe, chi risponde del contenuto,
 * quando e stata riletta, e **cosa chiede** (PP-02 §J: l'elenco dei campi e
 * cio che distingue due modelli dallo stesso titolo, e prima bisognava
 * adottarlo per saperlo). Due voci non fanno una griglia: e un pannello con
 * righe di piano 0.
 */
function FormCatalogRow({
  entry,
  adopted,
  adopting,
  busy,
  expanded,
  onToggle,
  onAdopt,
}: {
  entry: FormCatalogEntry;
  adopted: boolean;
  adopting: boolean;
  busy: boolean;
  expanded: boolean;
  onToggle: () => void;
  onAdopt: () => void;
}) {
  const fields = React.useMemo(() => (expanded ? buildFormFromCatalog(entry).fields : []), [entry, expanded]);
  const contentId = `form-catalog-${entry.key}`;
  return (
    <InsetBlock className={cn("bg-white", "flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between")}>
      <div className="min-w-0 flex-1">
        <p className="break-words font-brand text-[13.5px] font-bold text-egw-ink">{entry.title}</p>
        <p className="mt-1 break-words font-brand text-[12.5px] leading-[1.5] text-egw-ink-62">{entry.description}</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <DataChip size="sm" tone="blue" title={formCatalogClassLabel(entry.catalogClass)}>
            {formCatalogClassLabel(entry.catalogClass)}
          </DataChip>
          {entry.purpose === "enrollment" ? (
            <DataChip size="sm" tone="green">
              Iscrizione e rinnovo
            </DataChip>
          ) : null}
        </div>
        <p className="mt-2 break-words font-brand text-[11.5px] text-egw-ink-62">
          Del contenuto risponde {entry.editorialOwner} · riletto il <span className="egw-num">{formatDateShort(entry.lastReviewedAt)}</span>
        </p>
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={contentId}
          onClick={onToggle}
          className="mt-2 font-brand text-[12px] font-semibold text-egw-blue-700 hover:underline focus-visible:outline-none focus-visible:underline"
        >
          Cosa chiede questo modulo
        </button>
        {expanded ? (
          <ul id={contentId} className="mt-2 flex flex-col gap-1 font-brand text-[12px] text-egw-ink-72">
            {fields.map((campo) => (
              <li key={campo.id} className="break-words">
                · {campo.label}
                {campo.required ? " (obbligatorio)" : ""}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      <div className="shrink-0">
        {adopted ? (
          <StatusPill status={{ label: "GIÀ FRA I MODULI DEL CLUB", weight: "solid", hue: "green" }} />
        ) : (
          <Button variant="secondary" size="sm" icon={<Plus />} onClick={onAdopt} loading={adopting} disabled={busy}>
            Usa modello
          </Button>
        )}
      </div>
    </InsetBlock>
  );
}
