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
  type AthleteImportResult,
  type ImportPermissions,
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
 * vuota del file ha uno stato — pronta, da verificare, da correggere,
 * possibile duplicato, esclusa — e i totali tornano sempre. Le categorie
 * del file sono decisioni del club, una per etichetta; i possibili
 * duplicati sono decisioni del club, una per riga; una correzione si fa qui,
 * senza riaprire Excel, e vive solo in questa sessione.
 *
 * Dal Web V2 vive nel cassetto largo (720). Sotto i 768 px l'elenco delle
 * righe e una lista di schede, non una tabella a quindici colonne.
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

const nomeRiga = (row: ImportRowDiagnostic) =>
  `${row.normalized.lastName} ${row.normalized.firstName}`.trim() || "senza nominativo";

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
  const [permissionsError, setPermissionsError] = useState("");
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [result, setResult] = useState<AthleteImportResult | null>(null);
  const [committedPlan, setCommittedPlan] = useState<AthleteImportPlan | null>(null);
  const [batchId, setBatchId] = useState("");
  const [rowsFilter, setRowsFilter] = useState<"all" | "problems">("problems");
  const [rowsShown, setRowsShown] = useState(ROWS_PAGE);
  const [editingRow, setEditingRow] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

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
      return;
    }
    let attivo = true;
    fetchImportPermissions()
      .then((esito) => {
        if (attivo) setPermissions(esito);
      })
      .catch((error: any) => {
        if (attivo) setPermissionsError(error?.message || "Permessi non leggibili");
      });
    return () => {
      attivo = false;
    };
  }, [open, reset]);

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
    (target: MembershipTarget) => (describeTarget ? describeTarget(target) : target.label),
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
    } catch (error: any) {
      setParseError(error?.message || "Errore durante la lettura del file");
    } finally {
      setIsParsing(false);
    }
  };

  /* ── Import ──────────────────────────────────────────────────────────── */

  const handleImport = async () => {
    const id = batchId || (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);
    setBatchId(id);
    const request = buildAthleteImportRequest(plan, id);
    setCommittedPlan(plan);
    setStep("running");
    setProgress({ done: 0, total: request.rows.length });
    const esito = await applyAthleteImportBatch(request, {
      onProgress: (done, total) => setProgress({ done, total }),
    });
    setResult(esito);
    setStep("done");
    await onImported?.(esito);
  };

  /* Il rapporto passa dal tracciato CSV condiviso: le formule si neutralizzano li (il file e input non fidato). */
  const downloadReport = () => {
    const piano = committedPlan || plan;
    const esiti = new Map((result?.rows || []).map((row) => [row.sourceRowNumber, row]));
    const righe = flattenImportPlan(piano).map((row) => {
      const esito = esiti.get(row.row);
      return { ...row, stato: IMPORT_ROW_STATE_LABELS[row.state], esito: esito?.status || "", motivo: esito?.reason || "" };
    });
    const colonne = [
      { key: "row", label: "Riga" },
      { key: "lastName", label: "Cognome" },
      { key: "firstName", label: "Nome" },
      { key: "birthDate", label: "Nascita" },
      { key: "category", label: "Categoria nel file" },
      { key: "resolution", label: "Squadra" },
      { key: "stato", label: "Stato" },
      { key: "action", label: "Azione" },
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
  const goNext = () => {
    const index = order.indexOf(step);
    if (index >= 0 && index < order.length - 1) setStep(order[index + 1]);
  };
  const goBack = () => {
    const index = order.indexOf(step);
    if (index > 0) setStep(order[index - 1]);
  };
  const nextDisabled =
    (step === "upload" && !sourceRows.length) ||
    (step === "mapping" && !mappingReady);

  const running = step === "running";

  /* ── Corpo ───────────────────────────────────────────────────────────── */

  const body = (
    <FieldSizeProvider size="sm">
      {step !== "running" && step !== "done" ? <StepRail current={step} /> : null}

      {permissionsError ? (
        <AlertBlock severity="warning" title="Permessi non verificati">
          {permissionsError}. Il server rifiutera cio che non e consentito.
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
          labelOf={labelOf}
          onDecide={decideCategory}
        />
      ) : null}

      {step === "duplicates" ? (
        <DuplicatesStep plan={plan} onDecide={decideDuplicate} canLink={permissions?.canLink ?? true} />
      ) : null}

      {step === "preview" ? (
        <PreviewStep plan={plan} labelOf={labelOf} blocked={blockedByDecisions} candidates={sourceRows.length} />
      ) : null}

      {step === "running" ? (
        <div className="flex flex-col gap-4 py-6">
          <p className="egw-num font-brand text-[13px] font-semibold text-egw-ink" role="status" aria-live="polite">
            Scrittura in corso: {progress.done} di {progress.total} atleti.
          </p>
          <ProgressBar value={progress.done} max={Math.max(progress.total, 1)} label="Avanzamento dell'import" />
          <p className="text-[12px] text-egw-ink-62">
            Non chiudere la pagina: ogni atleta e una scrittura sola (scheda e categoria insieme), e quelli gia salvati restano. Se l&apos;import si interrompe, ripeterlo con lo stesso file non crea doppioni.
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
            Importa {formatInteger(importable)} {importable === 1 ? "atleta" : "atleti"}
          </Button>
          <Button variant="secondary" onClick={goBack}>
            Indietro
          </Button>
        </>
      ) : null}
      {step === "running" ? (
        <span className="text-[12px] font-medium text-egw-ink-62">Scrittura in corso: il cassetto si chiude alla fine.</span>
      ) : null}
      {step === "done" ? (
        <>
          <Button variant="primary" onClick={() => onOpenChange(false)}>
            Chiudi
          </Button>
          <Button variant="secondary" onClick={reset}>
            Importa un altro file
          </Button>
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
      description={
        step === "upload"
          ? "CSV, XLS, XLSX o XML. Ogni riga del file viene mostrata con il suo stato: nessuna sparisce."
          : undefined
      }
      locked={running}
      dirty={step !== "upload" && step !== "done"}
      data-test="athlete-import-drawer"
      footer={footer}
    >
      {body}
    </Drawer>
  );
}

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
          </dl>
          <p className="mt-3 text-[12px] text-egw-ink-62">
            Le {formatInteger(candidates)} righe si vedono tutte nei passi successivi, ognuna con il suo stato.
          </p>
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
  const fieldOf = (header: string) => (Object.keys(mapping) as AthleteImportField[]).find((field) => mapping[field] === header) || UNMAPPED;
  const assign = (header: string, field: string) => {
    const next: AthleteImportMapping = { ...mapping };
    for (const key of Object.keys(next) as AthleteImportField[]) if (next[key] === header) delete next[key];
    if (field !== UNMAPPED) next[field as AthleteImportField] = header;
    onChange(next);
  };
  const sample = (header: string) =>
    sourceRows
      .slice(0, 3)
      .map((row) => row.values[header])
      .filter(Boolean)
      .join(", ");
  return (
    <div className="flex flex-col gap-4">
      <p className="text-[12.5px] text-egw-ink-62">
        Proposta in automatico dalle intestazioni: correggi dove serve. Servono almeno cognome e nome (o il nominativo completo).
      </p>
      {!ready ? (
        <AlertBlock severity="warning" title="Manca il nominativo">
          Associa le colonne Cognome e Nome, oppure una colonna con il nominativo completo.
        </AlertBlock>
      ) : null}
      <ul className="flex flex-col gap-2" aria-label="Colonne del file">
        {headers.map((header) => (
          <li key={header} className="grid grid-cols-1 items-center gap-2 rounded-egw-field border border-egw-hairline px-3 py-2 sm:grid-cols-[1fr_auto_1fr]">
            <div className="min-w-0">
              <p className="truncate font-brand text-[13px] font-bold text-egw-ink">{header}</p>
              <p className="truncate text-[11.5px] text-egw-ink-62">{sample(header) || "—"}</p>
            </div>
            <span className="hidden text-egw-ink-42 sm:block" aria-hidden>
              →
            </span>
            <Select
              id={`mapping-${header}`}
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
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
      <SummaryTile label="Rilevate" value={totals.candidates} />
      <SummaryTile label="Pronte" value={totals.ready} tone="positive" />
      <SummaryTile label="Da verificare" value={totals.warning} tone={totals.warning ? "amber" : "neutral"} />
      <SummaryTile label="Da correggere" value={totals.error} tone={totals.error ? "negative" : "neutral"} />
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
  editingRow: number | null;
  onEdit: (row: number | null) => void;
  onCorrect: (row: number, correction: RowCorrection | null) => void;
  onExclude: (row: number, excluded: boolean) => void;
  labelOf: (target: MembershipTarget) => string;
}) {
  const rows = filter === "problems" ? plan.rows.filter((row) => row.state !== "ready") : plan.rows;
  const visible = rows.slice(0, shown);
  return (
    <div className="flex flex-col gap-4">
      <Totals plan={plan} />
      {!plan.totalsConsistent ? (
        <AlertBlock severity="danger" title="I totali non tornano">
          Un difetto del piano: segnalalo. Nessuna riga verra scritta finche i conti non tornano.
        </AlertBlock>
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
            <RowCard
              key={row.sourceRowNumber}
              row={row}
              editing={editingRow === row.sourceRowNumber}
              onEdit={onEdit}
              onCorrect={onCorrect}
              onExclude={onExclude}
              labelOf={labelOf}
            />
          ))}
        </ul>
      )}
      {rows.length > visible.length ? (
        <Button variant="secondary" size="sm" onClick={onShowMore}>
          Mostra altre {formatInteger(Math.min(ROWS_PAGE, rows.length - visible.length))} righe
        </Button>
      ) : null}
    </div>
  );
}

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
  labelOf: (target: MembershipTarget) => string;
}) {
  const [draft, setDraft] = useState<RowCorrection>({});
  useEffect(() => {
    if (editing) {
      setDraft({
        lastName: row.normalized.lastName,
        firstName: row.normalized.firstName,
        birthDate: row.normalized.rawBirth,
        categoryLabel: row.normalized.categoryLabel,
        fiscalCode: row.normalized.fiscalCode,
        email: row.normalized.email,
        phone: row.normalized.phone,
      });
    }
  }, [editing, row]);
  const excluded = row.state === "ignored_by_user" && row.issues.some((issue) => issue.code === "excluded_by_user");
  const resolution =
    row.categoryResolution.kind === "target"
      ? labelOf(row.categoryResolution.target)
      : row.categoryResolution.kind === "create"
        ? `Nuova: ${row.categoryResolution.name}`
        : row.normalized.categoryLabel || "—";
  return (
    <li className={cn("rounded-egw-field border px-3 py-2.5", row.state === "error" ? "border-egw-tint-red-bd" : "border-egw-hairline")} data-row={row.sourceRowNumber}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="font-brand text-[13px] font-bold text-egw-ink">
            <span className="egw-num mr-2 text-egw-ink-42">#{row.sourceRowNumber}</span>
            {nomeRiga(row)}
          </p>
          <p className="egw-num mt-0.5 text-[11.5px] text-egw-ink-62">
            {row.normalized.birthDate || row.normalized.rawBirth || "data mancante"} · {resolution}
            {row.correctedFields.length ? <span className="ml-2 text-egw-blue-700">corretta</span> : null}
          </p>
        </div>
        <DataChip tone={STATE_TONE[row.state]} size="sm">
          {IMPORT_ROW_STATE_LABELS[row.state]}
        </DataChip>
      </div>
      {row.issues.length ? (
        <ul className="mt-1.5 flex flex-col gap-0.5 text-[12px]">
          {row.issues.map((issue, index) => (
            <li key={`${issue.code}-${index}`} className={cn(issue.severity === "error" ? "text-egw-red" : issue.severity === "warning" ? "text-egw-amber-ink" : "text-egw-ink-62")}>
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
        <Button variant="row" size="sm" onClick={() => onExclude(row.sourceRowNumber, !excluded)}>
          {excluded ? "Includi" : "Escludi"}
        </Button>
      </div>
      {editing ? (
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {(
            [
              ["lastName", "Cognome"],
              ["firstName", "Nome"],
              ["birthDate", "Data di nascita (gg/mm/aaaa o anno)"],
              ["categoryLabel", "Categoria (come nel file)"],
              ["fiscalCode", "Codice fiscale"],
              ["email", "Email"],
              ["phone", "Telefono"],
            ] as [keyof RowCorrection, string][]
          ).map(([key, label]) => (
            <Field key={key} label={label} htmlFor={`row-${row.sourceRowNumber}-${key}`}>
              <TextInput id={`row-${row.sourceRowNumber}-${key}`} value={draft[key] || ""} onChange={(event) => setDraft((current) => ({ ...current, [key]: event.target.value }))} />
            </Field>
          ))}
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
  labelOf,
  onDecide,
}: {
  plan: AthleteImportPlan;
  targets: MembershipTargetIndex | null;
  sites: { id: string; name: string }[];
  permissions: ImportPermissions | null;
  labelOf: (target: MembershipTarget) => string;
  onDecide: (key: string, decision: CategoryDecision | null) => void;
}) {
  if (!plan.categories.length) {
    return (
      <InsetBlock className="px-4 py-6 text-center text-[12.5px] text-egw-ink-62">
        Il file non ha una colonna categoria (o e vuota): le schede nascono senza categoria e si assegnano dopo.
      </InsetBlock>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <p className="text-[12.5px] text-egw-ink-62">
        Le categorie scritte nel file non si creano da sole. Per ognuna decidi: collegarla a una squadra che esiste, crearne una nuova, o non importarla.
      </p>
      {plan.totals.pendingCategories ? (
        <AlertBlock severity="warning" title={`${formatInteger(plan.totals.pendingCategories)} ${plan.totals.pendingCategories === 1 ? "categoria da decidere" : "categorie da decidere"}`}>
          Senza una decisione le righe di quella categoria non si importano.
        </AlertBlock>
      ) : null}
      <ul className="flex flex-col gap-3" aria-label="Categorie trovate nel file">
        {plan.categories.map((category) => (
          <CategoryCard key={category.key} category={category} targets={targets} sites={sites} permissions={permissions} labelOf={labelOf} onDecide={onDecide} />
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
  labelOf,
  onDecide,
}: {
  category: ImportCategoryLabel;
  targets: MembershipTargetIndex | null;
  sites: { id: string; name: string }[];
  permissions: ImportPermissions | null;
  labelOf: (target: MembershipTarget) => string;
  onDecide: (key: string, decision: CategoryDecision | null) => void;
}) {
  const decision = category.decision;
  const mode: CategoryMode | null = decision ? decision.kind : null;
  const canCreate = permissions?.canCreateCategories ?? false;
  const canAssignSites = permissions?.canAssignSites ?? false;
  const [createName, setCreateName] = useState(category.label);
  const [createSite, setCreateSite] = useState("");
  const options = (targets?.targets || []).map((target) => ({ value: target.id, label: labelOf(target) }));
  const suggested = category.suggestion.targets;
  const setMode = (next: CategoryMode) => {
    if (next === "map") onDecide(category.key, { kind: "map", targetId: suggested.length === 1 ? suggested[0].id : "" });
    if (next === "create") onDecide(category.key, { kind: "create", name: createName || category.label, siteId: createSite });
    if (next === "skip") onDecide(category.key, { kind: "skip", athletes: "import_without_category" });
  };
  return (
    <li className="rounded-egw-field border border-egw-hairline px-3 py-3" data-category={category.key}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-brand text-[14px] font-bold text-egw-ink">{category.label}</p>
          <p className="egw-num text-[11.5px] text-egw-ink-62">
            {formatInteger(category.count)} {category.count === 1 ? "atleta" : "atleti"}
            {category.birthYearFrom ? ` · nati ${category.birthYearFrom === category.birthYearTo ? category.birthYearFrom : `${category.birthYearFrom}–${category.birthYearTo}`}` : ""}
          </p>
        </div>
        {!decision ? (
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
          Corrispondenza ambigua: «{category.label}» puo essere {suggested.map((target) => labelOf(target)).join(" oppure ")}. Scegli tu.
        </p>
      ) : suggested.length === 1 && !category.suggestion.exact ? (
        <p className="mt-2 text-[12px] text-egw-ink-62">Possibile corrispondenza: {labelOf(suggested[0])}.</p>
      ) : null}

      <SegmentedControl
        className="mt-3"
        size="sm"
        mode="radio"
        aria-label={`Cosa fare di ${category.label}`}
        value={mode || ("none" as CategoryMode)}
        onChange={(next) => setMode(next as CategoryMode)}
        options={[
          { value: "map" as CategoryMode, label: "Collega a squadra esistente" },
          { value: "create" as CategoryMode, label: canCreate ? "Crea nuova categoria" : "Crea nuova (non consentito)", disabled: !canCreate },
          { value: "skip" as CategoryMode, label: "Non importare questa categoria" },
        ]}
      />

      {mode === "map" ? (
        <div className="mt-3">
          <Field label="Squadra" htmlFor={`category-${category.key}-target`}>
            <Select
              id={`category-${category.key}-target`}
              value={decision?.kind === "map" && decision.targetId ? decision.targetId : undefined}
              onValueChange={(targetId) => onDecide(category.key, { kind: "map", targetId })}
              placeholder="Scegli la squadra"
              options={[
                ...suggested.map((target) => ({ value: target.id, label: `${labelOf(target)} (proposta)` })),
                ...options.filter((option) => !suggested.some((target) => target.id === option.value)),
              ]}
            />
          </Field>
          {decision?.kind === "map" && decision.targetId ? (
            <p className="mt-1.5 text-[11.5px] text-egw-ink-62">
              {formatInteger(category.count)} atleti entreranno in {labelOf(targets?.byId(decision.targetId) || suggested[0]) || "questa squadra"} come categoria primaria; la sede e quella della squadra.
            </p>
          ) : null}
        </div>
      ) : null}

      {mode === "create" ? (
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Nome della categoria" htmlFor={`category-${category.key}-name`}>
            <TextInput
              id={`category-${category.key}-name`}
              value={createName}
              onChange={(event) => {
                setCreateName(event.target.value);
                onDecide(category.key, { kind: "create", name: event.target.value, siteId: createSite });
              }}
            />
          </Field>
          <Field label="Sede della squadra" htmlFor={`category-${category.key}-site`} helper={canAssignSites ? "Senza sede la categoria nasce senza squadra: la sede si configura dopo" : "Il tuo ruolo non assegna sedi: la categoria nasce senza squadra"}>
            <Select
              id={`category-${category.key}-site`}
              value={createSite || NO_SITE}
              disabled={!canAssignSites}
              onValueChange={(value) => {
                const siteId = value === NO_SITE ? "" : value;
                setCreateSite(siteId);
                onDecide(category.key, { kind: "create", name: createName || category.label, siteId });
              }}
              options={[{ value: NO_SITE, label: "Nessuna sede" }, ...sites.map((site) => ({ value: site.id, label: site.name }))]}
            />
          </Field>
          <p className="text-[11.5px] text-egw-ink-62 sm:col-span-2">
            La categoria nasce solo quando confermi l&apos;import: annullare non lascia categorie vuote.
          </p>
        </div>
      ) : null}

      {mode === "skip" ? (
        <div className="mt-3">
          <SegmentedControl
            size="sm"
            mode="radio"
            aria-label={`Atleti di ${category.label}`}
            value={decision?.kind === "skip" ? decision.athletes : "import_without_category"}
            onChange={(athletes) => onDecide(category.key, { kind: "skip", athletes: athletes as "import_without_category" | "exclude" })}
            options={[
              { value: "import_without_category", label: "Importa gli atleti senza categoria" },
              { value: "exclude", label: "Escludi questi atleti dall'import" },
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

function DuplicatesStep({
  plan,
  onDecide,
  canLink,
}: {
  plan: AthleteImportPlan;
  onDecide: (row: number, decision: DuplicateDecision | null) => void;
  canLink: boolean;
}) {
  const rows = plan.rows.filter((row) => row.duplicateCandidates.inFile.length || row.duplicateCandidates.existing.length);
  if (!rows.length) {
    return <InsetBlock className="px-4 py-6 text-center text-[12.5px] text-egw-ink-62">Nessun possibile duplicato: nel file e nel club i nominativi sono tutti diversi.</InsetBlock>;
  }
  return (
    <div className="flex flex-col gap-4">
      <p className="text-[12.5px] text-egw-ink-62">
        Stesso nome e stessa data (o stesso codice fiscale) sono un possibile duplicato: decidi tu. Un nome uguale con data diversa e solo un avviso: puo essere un omonimo.
      </p>
      {plan.totals.pendingDuplicates ? (
        <AlertBlock severity="warning" title={`${formatInteger(plan.totals.pendingDuplicates)} da decidere`}>
          Senza una decisione la riga non si importa.
        </AlertBlock>
      ) : null}
      <ul className="flex flex-col gap-3" aria-label="Possibili duplicati">
        {rows.map((row) => {
          const decision = row.duplicateCandidates.decision;
          const strong = row.duplicateCandidates.inFile.some((item) => item.strength === "strong") || row.duplicateCandidates.existing.some((item) => item.strength === "strong");
          return (
            <li key={row.sourceRowNumber} className="rounded-egw-field border border-egw-hairline px-3 py-3" data-row={row.sourceRowNumber}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-brand text-[13.5px] font-bold text-egw-ink">
                    <span className="egw-num mr-2 text-egw-ink-42">#{row.sourceRowNumber}</span>
                    {nomeRiga(row)}
                  </p>
                  <p className="egw-num text-[11.5px] text-egw-ink-62">{row.normalized.birthDate || "data mancante"} · {row.normalized.categoryLabel || "senza categoria"}</p>
                </div>
                <DataChip tone={strong ? "orange" : "amber"} size="sm">
                  {strong ? "Possibile duplicato" : "Possibile omonimo"}
                </DataChip>
              </div>
              <ul className="mt-2 flex flex-col gap-1 text-[12px]">
                {row.duplicateCandidates.inFile.map((item) => (
                  <li key={`file-${item.row}`} className="text-egw-ink-72">
                    Nel file: riga {item.row}{item.strength === "weak" ? " (data diversa o mancante)" : ""}
                  </li>
                ))}
                {row.duplicateCandidates.existing.map((item) => (
                  <li key={`db-${item.athleteId}`} className="text-egw-ink-72">
                    Nel club: {item.label} {item.birthDate ? `(${item.birthDate})` : ""}
                    {item.categoryLabel ? ` · ${item.categoryLabel}` : ""}
                    {item.status !== "active" ? <DataChip tone="neutral" size="sm" className="ml-2">Inattivo</DataChip> : null}
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
                    Collega a {item.label}{item.status !== "active" ? " (resta inattivo)" : ""}
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
              {decision?.kind === "link" ? (
                <p className="mt-1.5 text-[11.5px] text-egw-ink-62">Si completano solo i campi vuoti della scheda; la categoria che ha resta.</p>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function PreviewStep({
  plan,
  labelOf,
  blocked,
  candidates,
}: {
  plan: AthleteImportPlan;
  labelOf: (target: MembershipTarget) => string;
  blocked: boolean;
  candidates: number;
}) {
  const { totals } = plan;
  const describe = (category: ImportCategoryLabel) => {
    const decision = category.decision;
    if (!decision) return "da decidere";
    if (decision.kind === "map") {
      const target = plan.rows.find((row) => row.categoryResolution.kind === "target" && row.categoryResolution.key === category.key);
      return target && target.categoryResolution.kind === "target" ? `→ ${labelOf(target.categoryResolution.target)}` : "→ squadra da scegliere";
    }
    if (decision.kind === "create") return `→ NUOVA CATEGORIA ${decision.name || category.label}`;
    return decision.athletes === "exclude" ? "→ esclusa dall'import" : "→ import senza categoria";
  };
  const skipped = plan.rows.filter((row) => row.finalAction === "skip");
  return (
    <div className="flex flex-col gap-4">
      {blocked ? (
        <AlertBlock severity="warning" title="Ci sono decisioni da prendere">
          {totals.pendingCategories ? `${formatInteger(totals.pendingCategories)} categorie da decidere. ` : ""}
          {totals.pendingDuplicates ? `${formatInteger(totals.pendingDuplicates)} possibili duplicati da decidere.` : ""} Torna ai passi precedenti: l&apos;import parte solo con tutte le decisioni prese.
        </AlertBlock>
      ) : null}
      <InsetBlock className="px-4 py-3">
        <p className="font-brand text-[10px] font-bold uppercase tracking-[var(--egw-track-eyebrow)] text-egw-ink-42">Riepilogo importazione</p>
        <ul className="egw-num mt-2 grid grid-cols-1 gap-1 text-[13px] text-egw-ink sm:grid-cols-2">
          <li>{formatInteger(candidates)} righe rilevate</li>
          <li>{formatInteger(totals.toCreate)} atleti verranno creati</li>
          <li>{formatInteger(totals.toLink)} schede verranno collegate e completate</li>
          <li>{formatInteger(totals.withMembership)} con categoria primaria</li>
          <li>{formatInteger(totals.categoriesToCreate)} categorie da creare</li>
          <li>{formatInteger(skipped.length)} righe non importate</li>
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
                Riga {row.sourceRowNumber}: {nomeRiga(row)} — {IMPORT_ROW_STATE_LABELS[row.state]}
                {row.issues.length ? ` · ${row.issues.map((issue) => issue.message).join(" · ")}` : ""}
              </li>
            ))}
          </ul>
        </DrawerSection>
      ) : null}
      <p className="text-[12px] text-egw-ink-62">Le presenze e lo storico gia registrati non verranno modificati. Ogni atleta viene scritto con la sua categoria in una scrittura sola.</p>
    </div>
  );
}

function ResultStep({ result, plan, onDownload }: { result: AthleteImportResult; plan: AthleteImportPlan; onDownload: () => void }) {
  const { totals } = result;
  const byRow = new Map(plan.rows.map((row) => [row.sourceRowNumber, row]));
  const problemi = result.rows.filter((row) => row.status === "failed" || row.status === "rejected" || row.status === "not_attempted");
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <SummaryTile label="Creati" value={totals.created} tone="positive" />
        <SummaryTile label="Collegati" value={totals.linked} tone={totals.linked ? "positive" : "neutral"} />
        <SummaryTile label="Gia scritti" value={totals.alreadyWritten} />
        <SummaryTile label="Categorie create" value={totals.categoriesCreated} />
        <SummaryTile label="Appartenenze scritte" value={totals.membershipsWritten} />
        <SummaryTile label="Non scritti" value={totals.failed + totals.rejected + totals.notAttempted} tone={totals.failed + totals.rejected + totals.notAttempted ? "negative" : "neutral"} />
      </div>
      {problemi.length ? (
        <AlertBlock severity="danger" title="Righe non scritte">
          <ul className="egw-scroll mt-1 max-h-48 space-y-1 overflow-y-auto">
            {problemi.map((row) => (
              <li key={row.sourceRowNumber}>
                Riga {row.sourceRowNumber}: {byRow.get(row.sourceRowNumber) ? nomeRiga(byRow.get(row.sourceRowNumber)!) : ""} — {row.reason || row.status}
              </li>
            ))}
          </ul>
          <p className="mt-2">Riprovare con lo stesso file non crea doppioni: le righe gia scritte vengono riconosciute.</p>
        </AlertBlock>
      ) : (
        <AlertBlock severity="success" title="Tutte le righe previste sono state scritte." />
      )}
      {result.categories.length ? (
        <InsetBlock className="px-4 py-3 text-[12.5px]">
          <p className="font-brand text-[13px] font-semibold text-egw-ink">Categorie</p>
          <ul className="mt-1 space-y-0.5 text-egw-ink-72">
            {result.categories.map((categoria) => (
              <li key={categoria.key}>
                {categoria.name}: {categoria.status === "created" ? "creata" : categoria.status === "reused" ? "gia esistente, collegata" : `non creata — ${categoria.reason || ""}`}
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

function SummaryTile({ label, value, tone = "neutral" }: { label: string; value: number; tone?: "neutral" | "positive" | "negative" | "amber" }) {
  return (
    <InsetBlock className="px-3 py-2.5">
      <p className="font-brand text-[10px] font-bold uppercase tracking-[var(--egw-track-eyebrow)] text-egw-ink-42">{label}</p>
      <p
        className={cn(
          "egw-num mt-1 font-brand text-[20px] font-extrabold leading-none",
          tone === "positive" && "text-egw-green",
          tone === "negative" && "text-egw-red",
          tone === "amber" && "text-egw-amber-ink",
          tone === "neutral" && "text-egw-ink",
        )}
      >
        {formatInteger(value)}
      </p>
    </InsetBlock>
  );
}
