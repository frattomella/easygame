"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MembershipTarget, MembershipTargetIndex } from "@/lib/categories/placement";
import {
  guessAthleteImportMapping,
  parseAthleteImportFile,
  type AthleteImportFileDiagnostics,
  type AthleteImportField,
  type AthleteImportMapping,
} from "@/lib/athlete-import";
import {
  buildAthleteImportPlan,
  buildAthleteImportRequest,
  describeCategoryResolution,
  flattenImportPlan,
  IMPORT_ROW_STATE_LABELS,
  type AthleteImportDecisions,
  type AthleteImportPlan,
  type CategoryDecision,
  type DuplicateDecision,
  type ExistingAthleteIdentity,
  type ImportCategoryLabel,
  type ImportRowDiagnostic,
  type ImportRowState,
  type ParsedImportRow,
  type RowCorrection,
} from "@/lib/athletes/import/plan";
import {
  applyAthleteImportBatch,
  fetchImportPermissions,
  IMPORT_CHUNK,
  type AthleteImportResult,
  type ImportPermissions,
  type ImportRowOutcome,
} from "@/lib/athletes/import-client";
import { Drawer, DrawerSection } from "@/components/web/overlays/Drawer";
import { Button } from "@/components/web/primitives/Button";
import { Field, FieldSizeProvider, Select, TextInput } from "@/components/web/forms/Field";
import { ProgressBar, SegmentedControl } from "@/components/web/primitives/Controls";
import { InsetBlock } from "@/components/web/primitives/Surface";
import { AlertBlock } from "@/components/web/page/Alerts";
import { DataChip, IconChip } from "@/components/web/primitives/StatusPill";
import { formatInteger } from "@/lib/web/format";
import { csvFileName, downloadCsv, toCsv, withCsvBom } from "@/lib/csv";
import { cn } from "@/lib/utils";
import { Download, FileSpreadsheet, Upload } from "lucide-react";

/**
 * **Importa atleti: il wizard** (ADR-0195).
 *
 * Sette passi, un modello solo: il piano (`buildAthleteImportPlan`) e cio
 * che si vede, cio che si manda e cio che i test misurano. Ogni riga non
 * vuota del file ha uno stato — pronta, da verificare, da decidere, da
 * correggere, possibile duplicato, esclusa — e i totali tornano sempre. Le
 * categorie del file sono decisioni del club, una per etichetta; i
 * possibili duplicati sono decisioni del club, una per riga; una correzione
 * si fa qui, senza riaprire Excel, e vive solo in questa sessione.
 *
 * Il lotto ha un identificativo (`batchId`) che nasce con il file e resta
 * lo stesso finche il cassetto e aperto: «Riprova le righe non scritte»
 * rimanda lo stesso lotto e il server riconosce cio che ha gia scritto
 * (revisione ostile C1).
 *
 * Dal Web V2 vive nel cassetto largo (720). Sotto i 768 px l'elenco delle
 * righe e una lista di schede, non una tabella a quindici colonne, e le
 * scelte vanno a capo invece di uscire dallo schermo.
 */

type WizardStep = "upload" | "mapping" | "rows" | "categories" | "duplicates" | "preview" | "running" | "done";

const STEPS: { id: WizardStep; label: string }[] = [
  { id: "upload", label: "File" },
  { id: "mapping", label: "Colonne" },
  { id: "rows", label: "Verifica" },
  { id: "categories", label: "Categorie" },
  { id: "duplicates", label: "Duplicati" },
  { id: "preview", label: "Anteprima" },
  { id: "running", label: "Import" },
];

const STEP_TITLES: Record<WizardStep, string> = {
  upload: "Carica il file",
  mapping: "Associa le colonne",
  rows: "Verifica i dati",
  categories: "Gestisci le categorie",
  duplicates: "Possibili duplicati",
  preview: "Anteprima",
  running: "Import in corso",
  done: "Importazione completata",
};

const stepEyebrow = (step: WizardStep) => {
  const index = STEPS.findIndex((item) => item.id === (step === "done" ? "running" : step));
  return `Passo ${index + 1} di ${STEPS.length} · ${STEPS[index]?.label || ""}`;
};

const MAPPING_FIELDS: { id: AthleteImportField; label: string }[] = [
  { id: "lastName", label: "Cognome" },
  { id: "firstName", label: "Nome" },
  { id: "fullName", label: "Nominativo completo (Cognome Nome)" },
  { id: "birthDate", label: "Data di nascita" },
  { id: "birthYear", label: "Anno di nascita" },
  { id: "category", label: "Categoria / squadra" },
  { id: "gender", label: "Sesso" },
  { id: "fiscalCode", label: "Codice fiscale" },
  { id: "email", label: "Email" },
  { id: "phone", label: "Telefono" },
];

const UNMAPPED = "__unmapped__";
/* Il selettore non accetta una stringa vuota come valore: «nessuna sede» ha un suo valore. */
const NO_SITE = "__no_site__";
const ROWS_PAGE = 60;

const STATE_TONE: Record<ImportRowState, "green" | "amber" | "red" | "orange" | "neutral"> = {
  ready: "green",
  warning: "amber",
  error: "red",
  duplicate_candidate: "orange",
  ignored_by_user: "neutral",
};

const OUTCOME_LABELS: Record<ImportRowOutcome["status"], string> = {
  created: "Creata",
  linked: "Collegata",
  already_written: "Già scritta",
  failed: "Non scritta",
  rejected: "Rifiutata dal server",
  not_attempted: "Non inviata",
};

const nomeRiga = (row: ImportRowDiagnostic) =>
  `${row.normalized.lastName} ${row.normalized.firstName}`.trim() || "senza nominativo";

/** Una riga ferma solo perche una categoria e da decidere: non un errore dei dati. */
const attendeDecisione = (row: ImportRowDiagnostic) =>
  row.state === "error" &&
  row.validation.errors.every((issue) => issue.code === "category_pending" || issue.code === "category_ambiguous" || issue.code === "category_unknown");

const statoRiga = (row: ImportRowDiagnostic) => (attendeDecisione(row) ? "Da decidere" : IMPORT_ROW_STATE_LABELS[row.state]);
const tonoRiga = (row: ImportRowDiagnostic): "green" | "amber" | "red" | "orange" | "neutral" | "blue" =>
  attendeDecisione(row) ? "blue" : STATE_TONE[row.state];

const newBatchId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;

interface AthleteImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Le squadre del club (ADR-0194 §17): la sede e quella della squadra. */
  targets?: MembershipTargetIndex | null;
  /** Le sedi del club, per la squadra di una categoria nuova. */
  sites?: { id: string; name: string }[];
  /** Le schede gia nel club: servono a riconoscere i duplicati. */
  existingAthletes?: ExistingAthleteIdentity[];
  /** Come scrivere una squadra nelle tendine: due omonime si distinguono qui (stagione). */
  describeTarget?: (target: MembershipTarget) => string;
  onImported?: (result: AthleteImportResult) => void | Promise<void>;
}

export function AthleteImportDialog({
  open,
  onOpenChange,
  targets = null,
  sites = [],
  existingAthletes = [],
  describeTarget,
  onImported,
}: AthleteImportDialogProps) {
  const [step, setStep] = useState<WizardStep>("upload");
  const [fileName, setFileName] = useState("");
  const [format, setFormat] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [sourceRows, setSourceRows] = useState<ParsedImportRow[]>([]);
  const [diagnostics, setDiagnostics] = useState<AthleteImportFileDiagnostics | null>(null);
  const [mapping, setMapping] = useState<AthleteImportMapping>({});
  const [decisions, setDecisions] = useState<AthleteImportDecisions>({});
  const [parseError, setParseError] = useState("");
  const [isParsing, setIsParsing] = useState(false);
  const [permissions, setPermissions] = useState<ImportPermissions | null>(null);
  const [permissionsState, setPermissionsState] = useState<"loading" | "ready" | "failed">("loading");
  const [permissionsRetry, setPermissionsRetry] = useState(0);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [result, setResult] = useState<AthleteImportResult | null>(null);
  const [committedPlan, setCommittedPlan] = useState<AthleteImportPlan | null>(null);
  /** L'identificativo del lotto: nasce con il file e resta lo stesso per ogni riprova. */
  const [batchId, setBatchId] = useState("");
  const [rowsFilter, setRowsFilter] = useState<"all" | "problems">("problems");
  const [rowsShown, setRowsShown] = useState(ROWS_PAGE);
  const [editingRow, setEditingRow] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const headingRef = useRef<HTMLParagraphElement | null>(null);

  const reset = useCallback(() => {
    setStep("upload");
    setFileName("");
    setFormat("");
    setHeaders([]);
    setSourceRows([]);
    setDiagnostics(null);
    setMapping({});
    setDecisions({});
    setParseError("");
    setIsParsing(false);
    setProgress({ done: 0, total: 0 });
    setResult(null);
    setCommittedPlan(null);
    setBatchId("");
    setRowsFilter("problems");
    setRowsShown(ROWS_PAGE);
    setEditingRow(null);
  }, []);

  useEffect(() => {
    if (!open) {
      reset();
      setPermissions(null);
      setPermissionsState("loading");
      return;
    }
    let attivo = true;
    setPermissionsState("loading");
    fetchImportPermissions()
      .then((esito) => {
        if (!attivo) return;
        setPermissions(esito);
        setPermissionsState("ready");
      })
      .catch(() => {
        if (attivo) setPermissionsState("failed");
      });
    return () => {
      attivo = false;
    };
  }, [open, reset, permissionsRetry]);

  /* Ogni passo annuncia il suo titolo: chi legge con uno screen reader sa dove e (revisione ostile M5). */
  useEffect(() => {
    headingRef.current?.focus();
  }, [step]);

  const plan = useMemo(
    () =>
      buildAthleteImportPlan({
        rows: sourceRows,
        mapping,
        targets,
        existingAthletes,
        decisions,
        canCreateCategories: permissions?.canCreateCategories ?? false,
      }),
    [sourceRows, mapping, targets, existingAthletes, decisions, permissions],
  );

  const labelOf = useCallback(
    (target: MembershipTarget | null | undefined) => (target ? (describeTarget ? describeTarget(target) : target.label) : "squadra non più disponibile"),
    [describeTarget],
  );

  /* ── Decisioni ───────────────────────────────────────────────────────── */

  const decideCategory = (key: string, decision: CategoryDecision | null) =>
    setDecisions((current) => {
      const categories = { ...(current.categories || {}) };
      if (decision) categories[key] = decision;
      else delete categories[key];
      return { ...current, categories };
    });

  const acceptSuggestions = () =>
    setDecisions((current) => {
      const categories = { ...(current.categories || {}) };
      for (const category of plan.categories) {
        if (category.decision || category.suggestion.ambiguous || category.suggestion.targets.length !== 1) continue;
        categories[category.key] = { kind: "map", targetId: category.suggestion.targets[0].id };
      }
      return { ...current, categories };
    });

  const decideDuplicate = (row: number, decision: DuplicateDecision | null) =>
    setDecisions((current) => {
      const duplicates = { ...(current.duplicates || {}) };
      if (decision) duplicates[row] = decision;
      else delete duplicates[row];
      return { ...current, duplicates };
    });

  const toggleExcluded = (row: number, excluded: boolean) =>
    setDecisions((current) => {
      const set = new Set(current.excludedRows || []);
      if (excluded) set.add(row);
      else set.delete(row);
      return { ...current, excludedRows: Array.from(set) };
    });

  const correctRow = (row: number, correction: RowCorrection | null) =>
    setDecisions((current) => {
      const corrections = { ...(current.corrections || {}) };
      if (correction && Object.keys(correction).length) corrections[row] = { ...(corrections[row] || {}), ...correction };
      else delete corrections[row];
      return { ...current, corrections };
    });

  /* ── File ────────────────────────────────────────────────────────────── */

  const handleFileSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setIsParsing(true);
    setParseError("");
    try {
      const parsed = await parseAthleteImportFile(file);
      if (!parsed.sourceRows.length) {
        setParseError("Il file non contiene righe leggibili. Controlla che la prima riga sia l'intestazione delle colonne.");
        return;
      }
      setFileName(file.name);
      setFormat(parsed.format);
      setHeaders(parsed.headers);
      setSourceRows(parsed.sourceRows);
      setDiagnostics(parsed.diagnostics);
      setMapping(guessAthleteImportMapping(parsed.headers));
      setDecisions({});
      setBatchId(newBatchId());
    } catch (error: any) {
      setParseError(error?.message || "Errore durante la lettura del file");
    } finally {
      setIsParsing(false);
    }
  };

  /* ── Import ──────────────────────────────────────────────────────────── */

  const runImport = async (piano: AthleteImportPlan, soloRighe: Set<number> | null) => {
    const id = batchId || newBatchId();
    setBatchId(id);
    const request = buildAthleteImportRequest(piano, id);
    if (soloRighe) request.rows = request.rows.filter((row) => soloRighe.has(row.sourceRowNumber));
    setCommittedPlan(piano);
    setStep("running");
    setProgress({ done: 0, total: request.rows.length });
    const esito = await applyAthleteImportBatch(request, {
      onProgress: (done, total) => setProgress({ done, total }),
    });
    setResult((previous) => (soloRighe && previous ? mergeResults(previous, esito) : esito));
    setStep("done");
    await onImported?.(esito);
  };

  const handleImport = () => runImport(plan, null);

  /** Rimanda **lo stesso lotto** con le sole righe non scritte: il server riconosce quelle gia scritte. */
  const handleRetry = () => {
    if (!committedPlan || !result) return;
    const daRifare = new Set(result.rows.filter((row) => row.status === "failed" || row.status === "not_attempted").map((row) => row.sourceRowNumber));
    if (!daRifare.size) return;
    void runImport(committedPlan, daRifare);
  };

  /* Il rapporto passa dal tracciato CSV condiviso: le formule si neutralizzano li (il file e input non fidato). */
  const downloadReport = () => {
    const piano = committedPlan || plan;
    const esiti = new Map((result?.rows || []).map((row) => [row.sourceRowNumber, row]));
    const perRiga = new Map(piano.rows.map((row) => [row.sourceRowNumber, row]));
    const righe = flattenImportPlan(piano, labelOf).map((row) => {
      const esito = esiti.get(row.row);
      const diagnostica = perRiga.get(row.row);
      return {
        ...row,
        stato: diagnostica && attendeDecisione(diagnostica) ? "Da decidere" : row.stateLabel,
        azione: row.actionLabel,
        esito: esito ? OUTCOME_LABELS[esito.status] : result ? "Non inviata" : "",
        motivo: esito?.reason || "",
      };
    });
    const colonne = [
      { key: "row", label: "Riga" },
      { key: "lastName", label: "Cognome" },
      { key: "firstName", label: "Nome" },
      { key: "birthDate", label: "Nascita" },
      { key: "category", label: "Categoria nel file" },
      { key: "resolution", label: "Squadra" },
      { key: "stato", label: "Stato" },
      { key: "azione", label: "Azione" },
      { key: "issues", label: "Note" },
      { key: "esito", label: "Esito" },
      { key: "motivo", label: "Motivo" },
    ];
    downloadCsv(csvFileName("import-atleti"), withCsvBom(toCsv(colonne, righe)));
  };

  /* ── Navigazione ─────────────────────────────────────────────────────── */

  const mappingReady = Boolean(mapping.fullName || (mapping.firstName && mapping.lastName));
  const canImport = permissions?.canImport ?? false;
  const importable = plan.totals.toCreate + plan.totals.toLink;
  const blockedByDecisions = plan.totals.pendingCategories > 0 || plan.totals.pendingDuplicates > 0;
  const order: WizardStep[] = ["upload", "mapping", "rows", "categories", "duplicates", "preview"];
  const goTo = (target: WizardStep) => setStep(target);
  const goNext = () => {
    const index = order.indexOf(step);
    if (index >= 0 && index < order.length - 1) setStep(order[index + 1]);
  };
  const goBack = () => {
    const index = order.indexOf(step);
    if (index > 0) setStep(order[index - 1]);
  };
  const nextDisabled = (step === "upload" && !sourceRows.length) || (step === "mapping" && !mappingReady);

  const running = step === "running";
  const retryable = Boolean(result && result.rows.some((row) => row.status === "failed" || row.status === "not_attempted"));

  /* ── Corpo ───────────────────────────────────────────────────────────── */

  const body = (
    <FieldSizeProvider size="sm">
      <p ref={headingRef} tabIndex={-1} className="sr-only" aria-live="polite">
        {stepEyebrow(step)}: {STEP_TITLES[step]}
      </p>
      {step !== "running" && step !== "done" ? <StepRail current={step} /> : null}

      {permissionsState === "failed" ? (
        <AlertBlock severity="warning" title="Permessi non verificati">
          Senza i permessi verificati l&apos;import resta bloccato.{" "}
          <Button variant="text" size="sm" onClick={() => setPermissionsRetry((current) => current + 1)}>
            Riprova
          </Button>
        </AlertBlock>
      ) : null}
      {permissions && !permissions.canImport ? (
        <AlertBlock severity="danger" title="Non puoi importare atleti" role="alert">
          Il tuo ruolo non crea schede atleta: chiedi alla direzione.
        </AlertBlock>
      ) : null}

      {step === "upload" ? (
        <UploadStep
          fileName={fileName}
          format={format}
          diagnostics={diagnostics}
          candidates={sourceRows.length}
          isParsing={isParsing}
          parseError={parseError}
          inputRef={inputRef}
          onFileSelected={handleFileSelected}
          onChangeFile={reset}
        />
      ) : null}

      {step === "mapping" ? (
        <MappingStep headers={headers} sourceRows={sourceRows} mapping={mapping} onChange={setMapping} ready={mappingReady} />
      ) : null}

      {step === "rows" ? (
        <RowsStep
          plan={plan}
          filter={rowsFilter}
          onFilter={setRowsFilter}
          shown={rowsShown}
          onShowMore={() => setRowsShown((current) => current + ROWS_PAGE)}
          onShowAll={() => setRowsShown(plan.rows.length)}
          editingRow={editingRow}
          onEdit={setEditingRow}
          onCorrect={correctRow}
          onExclude={toggleExcluded}
          labelOf={labelOf}
        />
      ) : null}

      {step === "categories" ? (
        <CategoriesStep
          plan={plan}
          targets={targets}
          sites={sites}
          permissions={permissions}
          permissionsState={permissionsState}
          labelOf={labelOf}
          onDecide={decideCategory}
          onAcceptSuggestions={acceptSuggestions}
        />
      ) : null}

      {step === "duplicates" ? (
        <DuplicatesStep plan={plan} onDecide={decideDuplicate} canLink={permissions?.canLink ?? false} permissionsState={permissionsState} />
      ) : null}

      {step === "preview" ? (
        <PreviewStep plan={plan} labelOf={labelOf} blocked={blockedByDecisions} candidates={sourceRows.length} onGoTo={goTo} />
      ) : null}

      {step === "running" ? (
        <div className="flex flex-col gap-4 py-6">
          <p className="egw-num font-brand text-[13px] font-semibold text-egw-ink" role="status" aria-live="polite">
            {progress.total <= IMPORT_CHUNK ? `Scrittura di ${progress.total} atleti in corso.` : `Scrittura in corso: ${progress.done} di ${progress.total} atleti.`}
          </p>
          <ProgressBar value={progress.total <= IMPORT_CHUNK ? null : progress.done} max={Math.max(progress.total, 1)} label="Avanzamento dell'import" />
          <p className="text-[12px] text-egw-ink-62">
            Non chiudere la pagina: ogni atleta è una scrittura sola (scheda e categoria insieme), e quelli già salvati restano. Se l&apos;import si interrompe, «Riprova le righe non scritte» rimanda lo stesso lotto senza creare doppioni.
          </p>
        </div>
      ) : null}

      {step === "done" && result ? <ResultStep result={result} plan={committedPlan || plan} onDownload={downloadReport} /> : null}
    </FieldSizeProvider>
  );

  const footer = (
    <>
      {step === "upload" ? (
        <>
          <Button variant="primary" onClick={goNext} disabled={nextDisabled}>
            Avanti
          </Button>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Annulla
          </Button>
        </>
      ) : null}
      {step === "mapping" || step === "rows" || step === "categories" || step === "duplicates" ? (
        <>
          <Button variant="primary" onClick={goNext} disabled={nextDisabled}>
            Avanti
          </Button>
          <Button variant="secondary" onClick={goBack}>
            Indietro
          </Button>
        </>
      ) : null}
      {step === "preview" ? (
        <>
          <Button variant="primary" onClick={handleImport} disabled={!canImport || !importable || blockedByDecisions}>
            Scrivi {formatInteger(importable)} {importable === 1 ? "riga" : "righe"}
            {plan.totals.toLink ? ` (${formatInteger(plan.totals.toCreate)} nuove, ${formatInteger(plan.totals.toLink)} collegate)` : ""}
          </Button>
          <Button variant="secondary" onClick={goBack}>
            Indietro
          </Button>
        </>
      ) : null}
      {step === "running" ? <span className="text-[12px] font-medium text-egw-ink-62">Scrittura in corso: al termine vedrai il riepilogo.</span> : null}
      {step === "done" ? (
        <>
          {retryable ? (
            <Button variant="primary" onClick={handleRetry}>
              Riprova le righe non scritte
            </Button>
          ) : (
            <Button variant="primary" onClick={() => onOpenChange(false)}>
              Chiudi
            </Button>
          )}
          <Button variant="secondary" onClick={reset}>
            Importa un altro file
          </Button>
          {retryable ? (
            <Button variant="text" onClick={() => onOpenChange(false)}>
              Chiudi
            </Button>
          ) : null}
        </>
      ) : null}
    </>
  );

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      width="wide"
      eyebrow={stepEyebrow(step)}
      title={STEP_TITLES[step]}
      description={step === "upload" ? "CSV, XLS, XLSX o XML. Ogni riga del file viene mostrata con il suo stato: nessuna sparisce." : undefined}
      locked={running}
      dirty={(step !== "upload" || sourceRows.length > 0) && step !== "done"}
      data-test="athlete-import-drawer"
      footer={footer}
    >
      {body}
    </Drawer>
  );
}

/** Dopo una riprova il rapporto e la somma: le righe rifatte sostituiscono il loro esito precedente. */
const mergeResults = (previous: AthleteImportResult, next: AthleteImportResult): AthleteImportResult => {
  const perRiga = new Map(previous.rows.map((row) => [row.sourceRowNumber, row]));
  for (const row of next.rows) perRiga.set(row.sourceRowNumber, row);
  const rows = Array.from(perRiga.values()).sort((left, right) => left.sourceRowNumber - right.sourceRowNumber);
  const perCategoria = new Map(previous.categories.map((categoria) => [categoria.key, categoria]));
  for (const categoria of next.categories) {
    const nota = perCategoria.get(categoria.key);
    if (!nota || nota.status === "rejected" || categoria.status === "created") perCategoria.set(categoria.key, categoria);
  }
  const count = (status: ImportRowOutcome["status"]) => rows.filter((row) => row.status === status).length;
  const categories = Array.from(perCategoria.values());
  return {
    batchId: next.batchId,
    rows,
    categories,
    totals: {
      requested: rows.length,
      created: count("created"),
      linked: count("linked"),
      alreadyWritten: count("already_written"),
      failed: count("failed"),
      rejected: count("rejected"),
      notAttempted: count("not_attempted"),
      membershipsWritten: rows.filter((row) => row.membership === "written").length,
      categoriesCreated: categories.filter((categoria) => categoria.status === "created").length,
    },
  };
};

/* ── Passi ─────────────────────────────────────────────────────────────── */

function StepRail({ current }: { current: WizardStep }) {
  const index = STEPS.findIndex((step) => step.id === current);
  return (
    <ol className="mb-5 flex flex-wrap gap-1.5" aria-label="Passi dell'import">
      {STEPS.map((step, position) => (
        <li
          key={step.id}
          aria-current={position === index ? "step" : undefined}
          className={cn(
            "rounded-egw-chip border px-2 py-0.5 font-brand text-[10.5px] font-bold uppercase tracking-[var(--egw-track-eyebrow)]",
            position === index
              ? "border-egw-tint-blue-bd bg-egw-tint-blue text-egw-blue-800"
              : position < index
                ? "border-egw-tint-green-bd bg-egw-tint-green text-egw-green"
                : "border-[rgba(11,26,58,.12)] bg-egw-page-100 text-egw-ink-42",
          )}
        >
          {position + 1}. {step.label}
        </li>
      ))}
    </ol>
  );
}

function UploadStep({
  fileName,
  format,
  diagnostics,
  candidates,
  isParsing,
  parseError,
  inputRef,
  onFileSelected,
  onChangeFile,
}: {
  fileName: string;
  format: string;
  diagnostics: AthleteImportFileDiagnostics | null;
  candidates: number;
  isParsing: boolean;
  parseError: string;
  inputRef: React.MutableRefObject<HTMLInputElement | null>;
  onFileSelected: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onChangeFile: () => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      {!fileName ? (
        <InsetBlock dashed className="flex flex-col items-center px-6 py-8 text-center">
          <IconChip tone="blue" size={44} className="mb-4 [&>svg]:h-5 [&>svg]:w-5">
            <FileSpreadsheet aria-hidden />
          </IconChip>
          <p className="font-brand text-[15px] font-bold text-egw-ink">Scegli il file da importare</p>
          <p className="mt-1.5 max-w-[46ch] font-brand text-[12.5px] leading-[1.5] text-egw-ink-62">
            La prima riga deve contenere i nomi delle colonne. Fino a 10 MB e 5.000 righe.
          </p>
          <Button type="button" variant="primary" className="mt-5" loading={isParsing} icon={<Upload aria-hidden />} onClick={() => inputRef.current?.click()}>
            {isParsing ? "Lettura in corso" : "Seleziona file"}
          </Button>
          <input ref={inputRef} id="athlete-import-file" type="file" accept=".csv,.xls,.xlsx,.xml" className="hidden" onChange={onFileSelected} />
        </InsetBlock>
      ) : (
        <InsetBlock className="px-4 py-4">
          <div className="flex flex-wrap items-center gap-2">
            <FileSpreadsheet className="h-4 w-4 text-egw-ink-62" aria-hidden />
            <span className="font-brand text-[13.5px] font-bold text-egw-ink">{fileName}</span>
            <span className="text-[11px] uppercase text-egw-ink-42">{format}</span>
            <Button type="button" variant="text" size="sm" onClick={onChangeFile}>
              Cambia file
            </Button>
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-[12.5px] sm:grid-cols-3">
            {diagnostics?.sheetName ? <Stat label="Foglio" value={diagnostics.sheetName} /> : null}
            <Stat label="Righe atleta rilevate" value={formatInteger(candidates)} strong />
            <Stat label="Righe vuote ignorate" value={formatInteger(diagnostics?.emptyRows || 0)} />
            {diagnostics?.hiddenRows.length ? <Stat label="Righe nascoste" value={formatInteger(diagnostics.hiddenRows.length)} /> : null}
            {diagnostics?.formulaCells ? <Stat label="Celle con formula (letto il valore)" value={formatInteger(diagnostics.formulaCells)} /> : null}
            {diagnostics?.truncatedRows ? <Stat label="Righe oltre il limite, non lette" value={formatInteger(diagnostics.truncatedRows)} /> : null}
            {diagnostics?.skippedSheets?.length ? <Stat label="Altri fogli, non letti" value={diagnostics.skippedSheets.join(", ")} /> : null}
          </dl>
          <p className="mt-3 text-[12px] text-egw-ink-62">Le {formatInteger(candidates)} righe si vedono tutte nei passi successivi, ognuna con il suo stato.</p>
        </InsetBlock>
      )}
      {parseError ? (
        <AlertBlock severity="danger" title="Il file non si legge" role="alert">
          {parseError}
        </AlertBlock>
      ) : null}
    </div>
  );
}

function Stat({ label, value, strong }: { label: string; value: React.ReactNode; strong?: boolean }) {
  return (
    <div>
      <dt className="font-brand text-[10px] font-bold uppercase tracking-[var(--egw-track-eyebrow)] text-egw-ink-42">{label}</dt>
      <dd className={cn("egw-num mt-0.5", strong ? "font-brand text-[18px] font-extrabold text-egw-ink" : "text-egw-ink")}>{value}</dd>
    </div>
  );
}

function MappingStep({
  headers,
  sourceRows,
  mapping,
  onChange,
  ready,
}: {
  headers: string[];
  sourceRows: ParsedImportRow[];
  mapping: AthleteImportMapping;
  onChange: (next: AthleteImportMapping) => void;
  ready: boolean;
}) {
  const [note, setNote] = useState("");
  const fieldOf = (header: string) => (Object.keys(mapping) as AthleteImportField[]).find((field) => mapping[field] === header) || UNMAPPED;
  const assign = (header: string, field: string) => {
    const next: AthleteImportMapping = { ...mapping };
    const rubata = field !== UNMAPPED ? next[field as AthleteImportField] : undefined;
    for (const key of Object.keys(next) as AthleteImportField[]) if (next[key] === header) delete next[key];
    if (field !== UNMAPPED) next[field as AthleteImportField] = header;
    onChange(next);
    setNote(rubata && rubata !== header ? `La colonna «${rubata}» non è più associata: era ${MAPPING_FIELDS.find((item) => item.id === field)?.label || field}.` : "");
  };
  const sample = (header: string) =>
    sourceRows
      .slice(0, 3)
      .map((row) => row.values[header])
      .filter(Boolean)
      .join(", ");
  return (
    <div className="flex flex-col gap-4">
      <p className="text-[12.5px] text-egw-ink-62">Proposta in automatico dalle intestazioni: correggi dove serve. Servono almeno cognome e nome (o il nominativo completo).</p>
      {!ready ? (
        <AlertBlock severity="warning" title="Manca il nominativo">
          Associa le colonne Cognome e Nome, oppure una colonna con il nominativo completo.
        </AlertBlock>
      ) : null}
      {note ? (
        <p className="text-[12px] text-egw-amber-ink" role="status">
          {note}
        </p>
      ) : null}
      <ul className="flex flex-col gap-2" aria-label="Colonne del file">
        {headers.map((header, index) => (
          <li key={`${index}-${header}`} className="grid grid-cols-1 items-center gap-2 rounded-egw-field border border-egw-hairline px-3 py-2 sm:grid-cols-[1fr_auto_1fr]">
            <div className="min-w-0">
              <p className="truncate font-brand text-[13px] font-bold text-egw-ink">{header}</p>
              <p className="truncate text-[11.5px] text-egw-ink-62">{sample(header) || "—"}</p>
            </div>
            <span className="hidden text-egw-ink-42 sm:block" aria-hidden>
              →
            </span>
            <Select
              id={`mapping-${index}`}
              aria-label={`Campo EasyGame per la colonna ${header}`}
              value={fieldOf(header)}
              onValueChange={(field) => assign(header, field)}
              options={[{ value: UNMAPPED, label: "Non importare" }, ...MAPPING_FIELDS.map((field) => ({ value: field.id, label: field.label }))]}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

function Totals({ plan }: { plan: AthleteImportPlan }) {
  const { totals } = plan;
  const daCorreggere = totals.error - totals.awaitingDecision;
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
      <SummaryTile label="Rilevate" value={totals.candidates} />
      <SummaryTile label="Pronte" value={totals.ready} tone="positive" />
      <SummaryTile label="Da verificare" value={totals.warning} tone={totals.warning ? "amber" : "neutral"} />
      <SummaryTile label="Da decidere" value={totals.awaitingDecision} tone={totals.awaitingDecision ? "blue" : "neutral"} />
      <SummaryTile label="Da correggere" value={daCorreggere} tone={daCorreggere ? "negative" : "neutral"} />
      <SummaryTile label="Duplicati" value={totals.duplicate} tone={totals.duplicate ? "amber" : "neutral"} />
      <SummaryTile label="Escluse" value={totals.excluded} />
    </div>
  );
}

function RowsStep({
  plan,
  filter,
  onFilter,
  shown,
  onShowMore,
  onShowAll,
  editingRow,
  onEdit,
  onCorrect,
  onExclude,
  labelOf,
}: {
  plan: AthleteImportPlan;
  filter: "all" | "problems";
  onFilter: (next: "all" | "problems") => void;
  shown: number;
  onShowMore: () => void;
  onShowAll: () => void;
  editingRow: number | null;
  onEdit: (row: number | null) => void;
  onCorrect: (row: number, correction: RowCorrection | null) => void;
  onExclude: (row: number, excluded: boolean) => void;
  labelOf: (target: MembershipTarget | null | undefined) => string;
}) {
  const rows = filter === "problems" ? plan.rows.filter((row) => row.state !== "ready") : plan.rows;
  const visible = rows.slice(0, shown);
  return (
    <div className="flex flex-col gap-4">
      <Totals plan={plan} />
      {!plan.totalsConsistent ? (
        <AlertBlock severity="danger" title="I totali non tornano">
          Un difetto del piano: segnalalo. Nessuna riga verrà scritta finché i conti non tornano.
        </AlertBlock>
      ) : null}
      {plan.totals.awaitingDecision ? (
        <p className="text-[12px] text-egw-ink-62">
          «Da decidere» sono le righe di una categoria del file su cui il club non ha ancora scelto: si sistemano al passo Categorie, non qui.
        </p>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SegmentedControl
          size="sm"
          aria-label="Righe mostrate"
          value={filter}
          onChange={onFilter}
          options={[
            { value: "problems", label: `Da guardare (${formatInteger(plan.rows.filter((row) => row.state !== "ready").length)})` },
            { value: "all", label: `Tutte (${formatInteger(plan.rows.length)})` },
          ]}
        />
        <p className="text-[11.5px] text-egw-ink-62">Correggi un valore qui, senza toccare il file: vale solo per questo import.</p>
      </div>
      {!rows.length ? (
        <InsetBlock className="px-4 py-6 text-center text-[12.5px] text-egw-ink-62">Nessuna riga da guardare: sono tutte pronte.</InsetBlock>
      ) : (
        <ul className="flex flex-col gap-2" aria-label="Righe del file">
          {visible.map((row) => (
            <RowCard key={row.sourceRowNumber} row={row} editing={editingRow === row.sourceRowNumber} onEdit={onEdit} onCorrect={onCorrect} onExclude={onExclude} labelOf={labelOf} />
          ))}
        </ul>
      )}
      {rows.length > visible.length ? (
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={onShowMore}>
            Mostra altre {formatInteger(Math.min(ROWS_PAGE, rows.length - visible.length))} righe
          </Button>
          <Button variant="text" size="sm" onClick={onShowAll}>
            Mostra tutte ({formatInteger(rows.length)})
          </Button>
        </div>
      ) : null}
    </div>
  );
}

const CORRECTION_FIELDS: [keyof RowCorrection, string][] = [
  ["lastName", "Cognome"],
  ["firstName", "Nome"],
  ["birthDate", "Data di nascita (gg/mm/aaaa o anno)"],
  ["categoryLabel", "Categoria (come nel file)"],
  ["fiscalCode", "Codice fiscale"],
  ["email", "Email"],
  ["phone", "Telefono"],
];

function RowCard({
  row,
  editing,
  onEdit,
  onCorrect,
  onExclude,
  labelOf,
}: {
  row: ImportRowDiagnostic;
  editing: boolean;
  onEdit: (row: number | null) => void;
  onCorrect: (row: number, correction: RowCorrection | null) => void;
  onExclude: (row: number, excluded: boolean) => void;
  labelOf: (target: MembershipTarget | null | undefined) => string;
}) {
  const [draft, setDraft] = useState<RowCorrection>({});
  useEffect(() => {
    if (editing) {
      setDraft({
        lastName: row.normalized.lastName,
        firstName: row.normalized.firstName,
        birthDate: row.normalized.rawBirth,
        categoryLabel: row.normalized.categoryLabel,
        gender: row.normalized.gender,
        fiscalCode: row.normalized.fiscalCode,
        email: row.normalized.email,
        phone: row.normalized.phone,
      });
    }
  }, [editing, row]);
  const excludedByUser = row.issues.some((issue) => issue.code === "excluded_by_user");
  const excludedByCategory = row.issues.some((issue) => issue.code === "category_excluded");
  const resolution = describeCategoryResolution(row.categoryResolution, labelOf);
  return (
    <li className={cn("rounded-egw-field border px-3 py-2.5", row.state === "error" && !attendeDecisione(row) ? "border-egw-tint-red-bd" : "border-egw-hairline")} data-row={row.sourceRowNumber}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="font-brand text-[13px] font-bold text-egw-ink">
            <span className="egw-num mr-2 text-egw-ink-42">#{row.sourceRowNumber}</span>
            {nomeRiga(row)}
          </p>
          <p className="egw-num mt-0.5 text-[11.5px] text-egw-ink-62">
            {row.normalized.birthDate || row.normalized.rawBirth || "data mancante"} · {row.normalized.categoryLabel ? `${row.normalized.categoryLabel} → ${resolution}` : resolution}
            {row.correctedFields.length ? <span className="ml-2 text-egw-blue-700">corretta</span> : null}
          </p>
        </div>
        <DataChip tone={tonoRiga(row)} size="sm">
          {statoRiga(row)}
        </DataChip>
      </div>
      {row.issues.length ? (
        <ul className="mt-1.5 flex flex-col gap-0.5 text-[12px]">
          {row.issues.map((issue, index) => (
            <li
              key={`${issue.code}-${index}`}
              className={cn(
                issue.severity === "error" ? (attendeDecisione(row) ? "text-egw-blue-700" : "text-egw-red") : issue.severity === "warning" ? "text-egw-amber-ink" : "text-egw-ink-62",
              )}
            >
              {issue.message}
            </li>
          ))}
        </ul>
      ) : null}
      <div className="mt-2 flex flex-wrap gap-1.5">
        {!editing ? (
          <Button variant="row" size="sm" onClick={() => onEdit(row.sourceRowNumber)}>
            Correggi
          </Button>
        ) : null}
        {row.correctedFields.length && !editing ? (
          <Button variant="row" size="sm" onClick={() => onCorrect(row.sourceRowNumber, null)}>
            Ripristina il file
          </Button>
        ) : null}
        {excludedByCategory && !excludedByUser ? (
          <span className="self-center text-[11.5px] text-egw-ink-62">Esclusa dalla scelta sulla categoria</span>
        ) : (
          <Button variant="row" size="sm" onClick={() => onExclude(row.sourceRowNumber, !excludedByUser)}>
            {excludedByUser ? "Includi" : "Escludi"}
          </Button>
        )}
      </div>
      {editing ? (
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {CORRECTION_FIELDS.map(([key, label]) => (
            <Field key={key} label={label} htmlFor={`row-${row.sourceRowNumber}-${key}`}>
              <TextInput id={`row-${row.sourceRowNumber}-${key}`} value={draft[key] || ""} onChange={(event) => setDraft((current) => ({ ...current, [key]: event.target.value }))} />
            </Field>
          ))}
          <Field label="Sesso" htmlFor={`row-${row.sourceRowNumber}-gender`}>
            <Select
              id={`row-${row.sourceRowNumber}-gender`}
              value={draft.gender || "-"}
              onValueChange={(value) => setDraft((current) => ({ ...current, gender: value === "-" ? "" : value }))}
              options={[
                { value: "-", label: "Non indicato" },
                { value: "M", label: "M" },
                { value: "F", label: "F" },
              ]}
            />
          </Field>
          <div className="flex gap-2 sm:col-span-2">
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                onCorrect(row.sourceRowNumber, draft);
                onEdit(null);
              }}
            >
              Salva correzione
            </Button>
            <Button variant="secondary" size="sm" onClick={() => onEdit(null)}>
              Annulla
            </Button>
          </div>
        </div>
      ) : null}
    </li>
  );
}

function CategoriesStep({
  plan,
  targets,
  sites,
  permissions,
  permissionsState,
  labelOf,
  onDecide,
  onAcceptSuggestions,
}: {
  plan: AthleteImportPlan;
  targets: MembershipTargetIndex | null;
  sites: { id: string; name: string }[];
  permissions: ImportPermissions | null;
  permissionsState: "loading" | "ready" | "failed";
  labelOf: (target: MembershipTarget | null | undefined) => string;
  onDecide: (key: string, decision: CategoryDecision | null) => void;
  onAcceptSuggestions: () => void;
}) {
  if (!plan.categories.length) {
    return (
      <InsetBlock className="px-4 py-6 text-center text-[12.5px] text-egw-ink-62">
        Il file non ha una colonna categoria (o è vuota): le schede nascono senza categoria e si assegnano dopo.
      </InsetBlock>
    );
  }
  const proponibili = plan.categories.filter((category) => !category.decision && !category.suggestion.ambiguous && category.suggestion.targets.length === 1).length;
  return (
    <div className="flex flex-col gap-4">
      <p className="text-[12.5px] text-egw-ink-62">
        Le categorie scritte nel file non si creano da sole. Per ognuna decidi: collegarla a una squadra che esiste, crearne una nuova, o non importarla.
      </p>
      {plan.totals.pendingCategories ? (
        <AlertBlock severity="warning" title={`${formatInteger(plan.totals.pendingCategories)} ${plan.totals.pendingCategories === 1 ? "categoria da decidere" : "categorie da decidere"}`}>
          Senza una decisione le righe di quella categoria non si importano.
          {proponibili ? (
            <>
              {" "}
              <Button variant="text" size="sm" onClick={onAcceptSuggestions}>
                Accetta le {formatInteger(proponibili)} proposte
              </Button>
            </>
          ) : null}
        </AlertBlock>
      ) : null}
      <ul className="flex flex-col gap-3" aria-label="Categorie trovate nel file">
        {plan.categories.map((category) => (
          <CategoryCard key={category.key} category={category} targets={targets} sites={sites} permissions={permissions} permissionsState={permissionsState} labelOf={labelOf} onDecide={onDecide} />
        ))}
      </ul>
    </div>
  );
}

type CategoryMode = "map" | "create" | "skip";

function CategoryCard({
  category,
  targets,
  sites,
  permissions,
  permissionsState,
  labelOf,
  onDecide,
}: {
  category: ImportCategoryLabel;
  targets: MembershipTargetIndex | null;
  sites: { id: string; name: string }[];
  permissions: ImportPermissions | null;
  permissionsState: "loading" | "ready" | "failed";
  labelOf: (target: MembershipTarget | null | undefined) => string;
  onDecide: (key: string, decision: CategoryDecision | null) => void;
}) {
  const decision = category.decision;
  const mode: CategoryMode | null = decision ? decision.kind : null;
  const canCreate = permissions?.canCreateCategories ?? false;
  const canAssignSites = permissions?.canAssignSites ?? false;
  /* Il modulo «crea» legge dalla decisione: tornare indietro non lo riporta ai valori del file (revisione ostile H2). */
  const createName = decision?.kind === "create" ? decision.name : category.label;
  const createSite = decision?.kind === "create" ? decision.siteId : "";
  const options = (targets?.targets || []).map((target) => ({ value: target.id, label: labelOf(target) }));
  const suggested = category.suggestion.targets;
  const chosenTarget = decision?.kind === "map" ? targets?.byId(decision.targetId) || null : null;
  const setMode = (next: CategoryMode) => {
    if (next === "map") onDecide(category.key, { kind: "map", targetId: suggested.length === 1 && !category.suggestion.ambiguous ? suggested[0].id : "" });
    if (next === "create") onDecide(category.key, { kind: "create", name: category.label, siteId: "" });
    if (next === "skip") onDecide(category.key, { kind: "skip", athletes: "import_without_category" });
  };
  const createLabel = permissionsState === "loading" ? "Crea nuova categoria (verifica permessi…)" : canCreate ? "Crea nuova categoria" : "Crea nuova (non consentito al tuo ruolo)";
  return (
    <li className="rounded-egw-field border border-egw-hairline px-3 py-3" data-category={category.key}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-brand text-[14px] font-bold text-egw-ink">
            {category.label}
            {category.spellings.length > 1 ? <span className="ml-2 text-[11.5px] font-medium text-egw-ink-62">(nel file anche: {category.spellings.slice(1).join(", ")})</span> : null}
          </p>
          <p className="egw-num text-[11.5px] text-egw-ink-62">
            {formatInteger(category.count)} {category.count === 1 ? "atleta" : "atleti"}
            {category.birthYearFrom ? ` · nati ${category.birthYearFrom === category.birthYearTo ? category.birthYearFrom : `${category.birthYearFrom}–${category.birthYearTo}`}` : ""}
          </p>
        </div>
        {!category.resolved ? (
          <DataChip tone="amber" size="sm">
            Da decidere
          </DataChip>
        ) : category.suggested ? (
          <DataChip tone="blue" size="sm">
            Proposta da EasyGame
          </DataChip>
        ) : (
          <DataChip tone="green" size="sm">
            Decisa
          </DataChip>
        )}
      </div>

      {category.suggestion.ambiguous ? (
        <p className="mt-2 text-[12px] text-egw-amber-ink">
          Corrispondenza ambigua: «{category.label}» può essere {suggested.map((target) => labelOf(target)).join(" oppure ")}. Scegli tu.
        </p>
      ) : suggested.length === 1 && !category.decision ? (
        <p className="mt-2 flex flex-wrap items-center gap-2 text-[12px] text-egw-ink-62">
          Possibile corrispondenza: {labelOf(suggested[0])}.
          <Button variant="row" size="sm" onClick={() => onDecide(category.key, { kind: "map", targetId: suggested[0].id })}>
            Usa questa
          </Button>
        </p>
      ) : null}

      <SegmentedControl
        className="mt-3"
        size="sm"
        mode="radio"
        wrap
        aria-label={`Cosa fare di ${category.label}`}
        value={mode || ("none" as CategoryMode)}
        onChange={(next) => setMode(next as CategoryMode)}
        options={[
          { value: "map" as CategoryMode, label: "Collega a squadra esistente" },
          { value: "create" as CategoryMode, label: createLabel, disabled: !canCreate },
          { value: "skip" as CategoryMode, label: "Senza questa categoria" },
        ]}
      />

      {mode === "map" ? (
        <div className="mt-3">
          <Field label="Squadra" htmlFor={`category-${category.key}-target`} error={decision?.kind === "map" && !chosenTarget ? "Scegli la squadra: senza, la categoria resta da decidere" : undefined}>
            <Select
              id={`category-${category.key}-target`}
              value={chosenTarget ? chosenTarget.id : undefined}
              onValueChange={(targetId) => onDecide(category.key, { kind: "map", targetId })}
              placeholder="Scegli la squadra"
              options={[
                ...suggested.map((target) => ({ value: target.id, label: labelOf(target) })),
                ...options.filter((option) => !suggested.some((target) => target.id === option.value)),
              ]}
            />
          </Field>
          {chosenTarget ? (
            <p className="mt-1.5 text-[11.5px] text-egw-ink-62">
              {formatInteger(category.count)} atleti entreranno in {labelOf(chosenTarget)} come categoria primaria; la sede è quella della squadra.
            </p>
          ) : null}
        </div>
      ) : null}

      {mode === "create" ? (
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Nome della categoria" htmlFor={`category-${category.key}-name`} error={!createName.trim() ? "Serve un nome" : undefined}>
            <TextInput id={`category-${category.key}-name`} value={createName} onChange={(event) => onDecide(category.key, { kind: "create", name: event.target.value, siteId: createSite })} />
          </Field>
          <Field
            label="Sede della squadra"
            htmlFor={`category-${category.key}-site`}
            helper={canAssignSites ? "Senza sede la categoria nasce senza squadra: la sede si configura dopo" : "Il tuo ruolo non assegna sedi: la categoria nasce senza squadra"}
          >
            <Select
              id={`category-${category.key}-site`}
              value={createSite || NO_SITE}
              disabled={!canAssignSites}
              onValueChange={(value) => onDecide(category.key, { kind: "create", name: createName, siteId: value === NO_SITE ? "" : value })}
              options={[{ value: NO_SITE, label: "Nessuna sede" }, ...sites.map((site) => ({ value: site.id, label: site.name }))]}
            />
          </Field>
          <p className="text-[11.5px] text-egw-ink-62 sm:col-span-2">
            La categoria nasce solo quando confermi l&apos;import: annullare non lascia categorie vuote. Se una categoria con questo nome esiste già, l&apos;import si ferma e ti chiede di collegarla.
          </p>
        </div>
      ) : null}

      {mode === "skip" ? (
        <div className="mt-3">
          <SegmentedControl
            size="sm"
            mode="radio"
            wrap
            aria-label={`Atleti di ${category.label}`}
            value={decision?.kind === "skip" ? decision.athletes : "import_without_category"}
            onChange={(athletes) => onDecide(category.key, { kind: "skip", athletes: athletes as "import_without_category" | "exclude" })}
            options={[
              { value: "import_without_category", label: "Importa le schede senza categoria" },
              { value: "exclude", label: `Escludi le ${formatInteger(category.count)} righe dall'import` },
            ]}
          />
          <p className="mt-1.5 text-[11.5px] text-egw-ink-62">
            {decision?.kind === "skip" && decision.athletes === "exclude"
              ? `${formatInteger(category.count)} righe non verranno importate.`
              : `${formatInteger(category.count)} schede nasceranno senza categoria: si assegna dopo.`}
          </p>
        </div>
      ) : null}
    </li>
  );
}

function DuplicateCard({
  row,
  onDecide,
  canLink,
  permissionsState,
}: {
  row: ImportRowDiagnostic;
  onDecide: (row: number, decision: DuplicateDecision | null) => void;
  canLink: boolean;
  permissionsState: "loading" | "ready" | "failed";
}) {
  const decision = row.duplicateCandidates.decision;
  const strong = row.duplicateCandidates.inFile.some((item) => item.strength === "strong") || row.duplicateCandidates.existing.some((item) => item.strength === "strong");
  const pending = strong && !decision && row.state !== "ignored_by_user";
  return (
    <li className="rounded-egw-field border border-egw-hairline px-3 py-3" data-row={row.sourceRowNumber}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-brand text-[13.5px] font-bold text-egw-ink">
            <span className="egw-num mr-2 text-egw-ink-42">#{row.sourceRowNumber}</span>
            {nomeRiga(row)}
          </p>
          <p className="egw-num text-[11.5px] text-egw-ink-62">
            {row.normalized.birthDate || "data mancante"} · {row.normalized.categoryLabel || "senza categoria"}
          </p>
        </div>
        <DataChip tone={pending ? "orange" : decision ? "green" : "amber"} size="sm">
          {pending ? "Da decidere" : decision ? (decision.kind === "link" ? "Collega" : decision.kind === "new" ? "Importa comunque" : "Non importare") : "Solo avviso"}
        </DataChip>
      </div>
      <ul className="mt-2 flex flex-col gap-1 text-[12px]">
        {row.duplicateCandidates.inFile.map((item) => (
          <li key={`file-${item.row}`} className="text-egw-ink-72">
            Nel file: riga {item.row}
            {item.strength === "weak" ? " (data diversa o mancante)" : ""}
          </li>
        ))}
        {row.duplicateCandidates.existing.map((item) => (
          <li key={`db-${item.athleteId}`} className="text-egw-ink-72">
            Nel club: {item.label} {item.birthDate ? `(${item.birthDate})` : ""}
            {item.categoryLabel ? ` · ${item.categoryLabel}` : ""}
            {item.status !== "active" ? (
              <DataChip tone="neutral" size="sm" className="ml-2">
                Inattivo
              </DataChip>
            ) : null}
          </li>
        ))}
      </ul>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {row.duplicateCandidates.existing.map((item) => (
          <Button
            key={`link-${item.athleteId}`}
            variant={decision?.kind === "link" && decision.athleteId === item.athleteId ? "neutral" : "row"}
            size="sm"
            disabled={!canLink}
            onClick={() => onDecide(row.sourceRowNumber, { kind: "link", athleteId: item.athleteId })}
          >
            Collega a {item.label}
            {item.status !== "active" ? " (resta inattivo)" : ""}
          </Button>
        ))}
        <Button variant={decision?.kind === "new" ? "neutral" : "row"} size="sm" onClick={() => onDecide(row.sourceRowNumber, { kind: "new" })}>
          {row.duplicateCandidates.existing.length ? "Importa come nuovo" : "Importa comunque"}
        </Button>
        <Button variant={decision?.kind === "skip" ? "neutral" : "row"} size="sm" onClick={() => onDecide(row.sourceRowNumber, { kind: "skip" })}>
          Non importare
        </Button>
        {decision ? (
          <Button variant="text" size="sm" onClick={() => onDecide(row.sourceRowNumber, null)}>
            Annulla scelta
          </Button>
        ) : null}
      </div>
      {row.duplicateCandidates.existing.length && !canLink && permissionsState !== "loading" ? (
        <p className="mt-1.5 text-[11.5px] text-egw-ink-62">Il tuo ruolo non collega schede esistenti: chiedi alla direzione, o non importare la riga.</p>
      ) : null}
      {decision?.kind === "link" ? (
        <p className="mt-1.5 text-[11.5px] text-egw-ink-62">Per la scheda collegata restano presenze, storico e categoria; si completano solo i campi vuoti.</p>
      ) : null}
    </li>
  );
}

function DuplicatesStep({
  plan,
  onDecide,
  canLink,
  permissionsState,
}: {
  plan: AthleteImportPlan;
  onDecide: (row: number, decision: DuplicateDecision | null) => void;
  canLink: boolean;
  permissionsState: "loading" | "ready" | "failed";
}) {
  const [showWeak, setShowWeak] = useState(false);
  const withCandidates = plan.rows.filter((row) => row.duplicateCandidates.inFile.length || row.duplicateCandidates.existing.length);
  const strong = withCandidates.filter((row) => row.duplicateCandidates.inFile.some((item) => item.strength === "strong") || row.duplicateCandidates.existing.some((item) => item.strength === "strong"));
  const weak = withCandidates.filter((row) => !strong.includes(row));
  if (!withCandidates.length) {
    return <InsetBlock className="px-4 py-6 text-center text-[12.5px] text-egw-ink-62">Nessun possibile duplicato: nel file e nel club i nominativi sono tutti diversi.</InsetBlock>;
  }
  return (
    <div className="flex flex-col gap-4">
      <p className="text-[12.5px] text-egw-ink-62">
        Stesso nome e stessa data (o stesso codice fiscale) sono un possibile duplicato: decidi tu. Un nome uguale con data diversa è solo un avviso: può essere un omonimo.
      </p>
      {plan.totals.pendingDuplicates ? (
        <AlertBlock severity="warning" title={`${formatInteger(plan.totals.pendingDuplicates)} da decidere`}>
          Senza una decisione la riga non si importa.
        </AlertBlock>
      ) : null}
      {strong.length ? (
        <ul className="flex flex-col gap-3" aria-label="Possibili duplicati">
          {strong.map((row) => (
            <DuplicateCard key={row.sourceRowNumber} row={row} onDecide={onDecide} canLink={canLink} permissionsState={permissionsState} />
          ))}
        </ul>
      ) : (
        <InsetBlock className="px-4 py-4 text-center text-[12.5px] text-egw-ink-62">Nessun duplicato da decidere.</InsetBlock>
      )}
      {weak.length ? (
        <div>
          <Button variant="text" size="sm" onClick={() => setShowWeak((current) => !current)}>
            {showWeak ? "Nascondi" : "Mostra"} {formatInteger(weak.length)} {weak.length === 1 ? "omonimo (solo avviso)" : "omonimi (solo avviso)"}
          </Button>
          {showWeak ? (
            <ul className="mt-2 flex flex-col gap-3" aria-label="Possibili omonimi">
              {weak.map((row) => (
                <DuplicateCard key={row.sourceRowNumber} row={row} onDecide={onDecide} canLink={canLink} permissionsState={permissionsState} />
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function PreviewStep({
  plan,
  labelOf,
  blocked,
  candidates,
  onGoTo,
}: {
  plan: AthleteImportPlan;
  labelOf: (target: MembershipTarget | null | undefined) => string;
  blocked: boolean;
  candidates: number;
  onGoTo: (step: WizardStep) => void;
}) {
  const { totals } = plan;
  const describe = (category: ImportCategoryLabel) => {
    const decision = category.decision;
    if (!decision || !category.resolved) return "da decidere";
    if (decision.kind === "map") {
      const target = plan.rows.find((row) => row.categoryResolution.kind === "target" && row.categoryResolution.key === category.key);
      return target && target.categoryResolution.kind === "target" ? `→ ${labelOf(target.categoryResolution.target)}` : "→ squadra da scegliere";
    }
    if (decision.kind === "create") return `→ NUOVA CATEGORIA ${decision.name || category.label}`;
    return decision.athletes === "exclude" ? "→ esclusa dall'import" : "→ import senza categoria";
  };
  const skipped = plan.rows.filter((row) => row.finalAction === "skip");
  const daCorreggere = totals.error - totals.awaitingDecision;
  return (
    <div className="flex flex-col gap-4">
      {blocked ? (
        <AlertBlock severity="warning" title="Ci sono decisioni da prendere">
          {totals.pendingCategories ? (
            <>
              {formatInteger(totals.pendingCategories)} categorie da decidere.{" "}
              <Button variant="text" size="sm" onClick={() => onGoTo("categories")}>
                Vai a Categorie
              </Button>{" "}
            </>
          ) : null}
          {totals.pendingDuplicates ? (
            <>
              {formatInteger(totals.pendingDuplicates)} possibili duplicati da decidere.{" "}
              <Button variant="text" size="sm" onClick={() => onGoTo("duplicates")}>
                Vai a Duplicati
              </Button>
            </>
          ) : null}
          <span className="block">L&apos;import parte solo con tutte le decisioni prese.</span>
        </AlertBlock>
      ) : null}
      <InsetBlock className="px-4 py-3">
        <p className="font-brand text-[10px] font-bold uppercase tracking-[var(--egw-track-eyebrow)] text-egw-ink-42">Riepilogo importazione</p>
        <ul className="egw-num mt-2 grid grid-cols-1 gap-1 text-[13px] text-egw-ink sm:grid-cols-2">
          <li>{formatInteger(candidates)} righe rilevate</li>
          <li>{formatInteger(totals.toCreate)} atleti verranno creati</li>
          <li>{formatInteger(totals.toLink)} schede verranno collegate e completate</li>
          <li>{formatInteger(totals.withMembership)} con la categoria del file</li>
          <li>{formatInteger(totals.categoriesToCreate)} categorie da creare</li>
          <li>
            {formatInteger(skipped.length)} righe non importate
            {skipped.length
              ? ` (${[
                  totals.awaitingDecision ? `${formatInteger(totals.awaitingDecision)} da decidere` : "",
                  daCorreggere ? `${formatInteger(daCorreggere)} da correggere` : "",
                  totals.duplicate ? `${formatInteger(totals.duplicate)} duplicati da decidere` : "",
                  totals.excluded ? `${formatInteger(totals.excluded)} escluse` : "",
                ]
                  .filter(Boolean)
                  .join(" · ")})`
              : ""}
          </li>
        </ul>
      </InsetBlock>
      {plan.categories.length ? (
        <DrawerSection eyebrow="Categorie">
          <ul className="flex flex-col gap-1 text-[12.5px]">
            {plan.categories.map((category) => (
              <li key={category.key} className="flex flex-wrap items-baseline justify-between gap-2 border-b border-egw-rule py-1.5 last:border-0">
                <span className="font-semibold text-egw-ink">{category.label}</span>
                <span className="text-egw-ink-72">{describe(category)}</span>
                <span className="egw-num text-egw-ink-62">{formatInteger(category.count)} atleti</span>
              </li>
            ))}
          </ul>
        </DrawerSection>
      ) : null}
      {skipped.length ? (
        <DrawerSection eyebrow="Righe non importate">
          <ul className="egw-scroll max-h-56 space-y-1 overflow-y-auto text-[12px] text-egw-ink-72">
            {skipped.map((row) => (
              <li key={row.sourceRowNumber}>
                Riga {row.sourceRowNumber}: {nomeRiga(row)} — {statoRiga(row)}
                {row.issues.length ? ` · ${row.issues.map((issue) => issue.message).join(" · ")}` : ""}
              </li>
            ))}
          </ul>
        </DrawerSection>
      ) : null}
      <p className="text-[12px] text-egw-ink-62">Ogni atleta viene scritto con la sua categoria in una scrittura sola. Presenze e storico già registrati nel club non vengono toccati.</p>
    </div>
  );
}

function ResultStep({ result, plan, onDownload }: { result: AthleteImportResult; plan: AthleteImportPlan; onDownload: () => void }) {
  const { totals } = result;
  const byRow = new Map(plan.rows.map((row) => [row.sourceRowNumber, row]));
  const problemi = result.rows.filter((row) => row.status === "failed" || row.status === "rejected" || row.status === "not_attempted");
  const nonInviate = plan.rows.filter((row) => row.finalAction === "skip");
  const scritte = totals.created + totals.linked + totals.alreadyWritten;
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <SummaryTile label="Creati" value={totals.created} tone="positive" />
        <SummaryTile label="Collegati" value={totals.linked} tone={totals.linked ? "positive" : "neutral"} />
        <SummaryTile label="Già scritti" value={totals.alreadyWritten} />
        <SummaryTile label="Non scritti" value={totals.failed + totals.rejected + totals.notAttempted} tone={totals.failed + totals.rejected + totals.notAttempted ? "negative" : "neutral"} />
        <SummaryTile label="Categorie create" value={totals.categoriesCreated} />
        <SummaryTile label="Appartenenze scritte" value={totals.membershipsWritten} />
        <SummaryTile label="Non inviate (per scelta o errore)" value={nonInviate.length} tone={nonInviate.length ? "amber" : "neutral"} />
        <SummaryTile label="Righe del file" value={plan.rows.length} />
      </div>
      {problemi.length ? (
        <AlertBlock severity="danger" title={`Scritte ${formatInteger(scritte)} righe su ${formatInteger(plan.rows.length)} del file: ${formatInteger(problemi.length)} non scritte`}>
          <ul className="egw-scroll mt-1 max-h-48 space-y-1 overflow-y-auto">
            {problemi.map((row) => (
              <li key={row.sourceRowNumber}>
                Riga {row.sourceRowNumber}: {byRow.get(row.sourceRowNumber) ? nomeRiga(byRow.get(row.sourceRowNumber)!) : ""} — {OUTCOME_LABELS[row.status]}
                {row.reason ? ` · ${row.reason}` : ""}
              </li>
            ))}
          </ul>
          <p className="mt-2">«Riprova le righe non scritte» rimanda lo stesso lotto: le righe già scritte vengono riconosciute, non duplicate.</p>
        </AlertBlock>
      ) : (
        <AlertBlock
          severity={nonInviate.length ? "warning" : "success"}
          title={
            nonInviate.length
              ? `Scritte ${formatInteger(scritte)} righe su ${formatInteger(plan.rows.length)} del file: ${formatInteger(nonInviate.length)} non inviate per scelta o perché da correggere.`
              : `Scritte tutte le ${formatInteger(scritte)} righe del file.`
          }
        />
      )}
      {nonInviate.length ? (
        <InsetBlock className="px-4 py-3 text-[12.5px]">
          <p className="font-brand text-[13px] font-semibold text-egw-ink">Righe non inviate</p>
          <ul className="egw-scroll mt-1 max-h-40 space-y-0.5 overflow-y-auto text-egw-ink-72">
            {nonInviate.map((row) => (
              <li key={row.sourceRowNumber}>
                Riga {row.sourceRowNumber}: {nomeRiga(row)} — {statoRiga(row)}
              </li>
            ))}
          </ul>
        </InsetBlock>
      ) : null}
      {result.categories.length ? (
        <InsetBlock className="px-4 py-3 text-[12.5px]">
          <p className="font-brand text-[13px] font-semibold text-egw-ink">Categorie</p>
          <ul className="mt-1 space-y-0.5 text-egw-ink-72">
            {result.categories.map((categoria) => (
              <li key={categoria.key}>
                {categoria.name}: {categoria.status === "created" ? "creata" : categoria.status === "reused" ? "già creata da questo lotto" : `non creata — ${categoria.reason || ""}`}
              </li>
            ))}
          </ul>
        </InsetBlock>
      ) : null}
      <Button variant="secondary" size="sm" icon={<Download aria-hidden />} onClick={onDownload}>
        Scarica il rapporto (CSV)
      </Button>
    </div>
  );
}

function SummaryTile({ label, value, tone = "neutral" }: { label: string; value: number; tone?: "neutral" | "positive" | "negative" | "amber" | "blue" }) {
  return (
    <InsetBlock className="px-3 py-2.5">
      <p className="font-brand text-[10px] font-bold uppercase tracking-[var(--egw-track-eyebrow)] text-egw-ink-42">{label}</p>
      <p
        className={cn(
          "egw-num mt-1 font-brand text-[20px] font-extrabold leading-none",
          tone === "positive" && "text-egw-green",
          tone === "negative" && "text-egw-red",
          tone === "amber" && "text-egw-amber-ink",
          tone === "blue" && "text-egw-blue-700",
          tone === "neutral" && "text-egw-ink",
        )}
      >
        {formatInteger(value)}
      </p>
    </InsetBlock>
  );
}
