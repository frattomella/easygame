"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  guessAthleteImportMapping,
  normalizeImportedAthletes,
  parseAthleteImportFile,
  summarizeImportPlan,
  toImportPayload,
  type AthleteImportField,
  type AthleteImportMapping,
  type AthleteImportOutcome,
  type AthleteImportPayload,
  type AthleteImportSummary,
  type ExistingAthleteIdentity,
  type NormalizedImportedAthleteRow,
} from "@/lib/athlete-import";
import { Drawer, DrawerSection } from "@/components/web/overlays/Drawer";
import { Button } from "@/components/web/primitives/Button";
import { Field, FieldSizeProvider, Select } from "@/components/web/forms/Field";
import { Checkbox } from "@/components/web/primitives/Controls";
import { InsetBlock } from "@/components/web/primitives/Surface";
import { AlertBlock } from "@/components/web/page/Alerts";
import { IconChip } from "@/components/web/primitives/StatusPill";
import { formatInteger } from "@/lib/web/format";
import { useToast } from "@/components/ui/toast-notification";
import { cn } from "@/lib/utils";
import { FileSpreadsheet, Upload } from "lucide-react";

/**
 * Import atleti in quattro passi: file, mappatura, scrittura, riepilogo.
 *
 * Prima l'operazione era un unico gesto al buio: si sceglieva il file e si
 * premeva "Importa", con una tendina di attesa senza avanzamento; alla fine
 * un toast diceva quante righe erano riuscite, senza dire **quali** erano
 * fallite ne perche. Con un file da 200 righe non c'era modo di sapere cosa
 * ricontrollare.
 *
 * Ora: le righe non importabili sono visibili **prima** di scrivere, la barra
 * misura le righe realmente scritte, e il riepilogo finale resta a schermo
 * con l'elenco degli scarti.
 *
 * Dal Web V2 vive nel cassetto largo (720, guideline 07 §7.10): stessi
 * quattro passi, stesse parole, stesso scrittore. Il cassetto non si chiude
 * mentre scrive (`locked`), perche chiudere il browser non annulla cio che e
 * gia stato scritto — e il testo lo dice.
 */

type ImportStep = "upload" | "review" | "running" | "done";

interface AthleteImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: { id: string; name: string }[];
  /** Anagrafiche gia presenti: servono a riconoscere i duplicati. */
  existingAthletes?: ExistingAthleteIdentity[];
  onImport: (
    rows: AthleteImportPayload[],
    handlers: { onProgress: (completed: number) => void },
  ) => Promise<AthleteImportOutcome>;
}

const MAPPING_FIELDS: {
  id: AthleteImportField;
  label: string;
  hint?: string;
}[] = [
  { id: "lastName", label: "Cognome" },
  { id: "firstName", label: "Nome" },
  {
    id: "fullName",
    label: "Nominativo completo",
    hint: "usato se nome e cognome non sono separati",
  },
  { id: "birthDate", label: "Data di nascita" },
  {
    id: "birthYear",
    label: "Anno di nascita",
    hint: "alternativa alla data completa",
  },
  { id: "category", label: "Categoria" },
  { id: "gender", label: "Sesso" },
  { id: "fiscalCode", label: "Codice fiscale" },
  { id: "email", label: "Email" },
  { id: "phone", label: "Telefono" },
];

const PREVIEW_LIMIT = 50;

/** Il valore della tendina di mappatura quando la colonna non e assegnata. */
const UNMAPPED = "__unmapped__";

const STEP_EYEBROW: Record<ImportStep, string> = {
  upload: "Passo 1 di 4 · File",
  review: "Passo 2 di 4 · Anteprima",
  running: "Passo 3 di 4 · Scrittura",
  done: "Passo 4 di 4 · Esito",
};

export function AthleteImportDialog({
  open,
  onOpenChange,
  categories,
  existingAthletes,
  onImport,
}: AthleteImportDialogProps) {
  const { showToast } = useToast();
  const [step, setStep] = useState<ImportStep>("upload");
  const [fileName, setFileName] = useState("");
  const [format, setFormat] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, any>[]>([]);
  const [mapping, setMapping] = useState<AthleteImportMapping>({});
  const [parseError, setParseError] = useState("");
  const [isParsing, setIsParsing] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [outcome, setOutcome] = useState<AthleteImportOutcome | null>(null);
  /**
   * Il piano com'era **al momento di premere Importa**.
   *
   * L'anteprima si ricalcola quando cambiano le anagrafiche gia nel club, e al
   * termine dell'import quelle anagrafiche comprendono le righe appena
   * scritte: il riepilogo finale le rileggeva come «Atleta gia presente nel
   * club» e annunciava 220 importati accanto a 202 scartati su 223 righe.
   * Numeri che non tornano fanno dubitare di un import riuscito. Visto in UAT
   * su staging con un file da 223 righe.
   */
  const [committedPlan, setCommittedPlan] = useState<{
    rows: NormalizedImportedAthleteRow[];
    summary: AthleteImportSummary;
  } | null>(null);
  const [showOnlyProblems, setShowOnlyProblems] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const reset = useCallback(() => {
    setStep("upload");
    setFileName("");
    setFormat("");
    setHeaders([]);
    setRows([]);
    setMapping({});
    setParseError("");
    setIsParsing(false);
    setProgress({ done: 0, total: 0 });
    setOutcome(null);
    setCommittedPlan(null);
    setShowOnlyProblems(false);
  }, []);

  useEffect(() => {
    if (!open) reset();
  }, [open, reset]);

  const previewRows = useMemo(
    () =>
      normalizeImportedAthletes(rows, mapping, categories, {
        existingAthletes,
      }),
    [rows, mapping, categories, existingAthletes],
  );

  const summary = useMemo(
    () => summarizeImportPlan(previewRows),
    [previewRows],
  );

  const visibleRows = useMemo(
    () =>
      (showOnlyProblems
        ? previewRows.filter(
            (row) => row.errors.length > 0 || row.warnings.length > 0,
          )
        : previewRows
      ).slice(0, PREVIEW_LIMIT),
    [previewRows, showOnlyProblems],
  );

  const handleFileSelected = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setIsParsing(true);
    setParseError("");

    try {
      const parsed = await parseAthleteImportFile(file);

      if (!parsed.rows.length) {
        setParseError(
          "Il file non contiene righe leggibili. Controlla che la prima riga sia l'intestazione delle colonne.",
        );
        setIsParsing(false);
        return;
      }

      setFileName(file.name);
      setFormat(parsed.format);
      setHeaders(parsed.headers);
      setRows(parsed.rows);
      setMapping(guessAthleteImportMapping(parsed.headers));
      setStep("review");
    } catch (error: any) {
      setParseError(error?.message || "Errore durante la lettura del file");
    } finally {
      setIsParsing(false);
    }
  };

  const handleImport = async () => {
    const payload = toImportPayload(previewRows);
    if (!payload.length) {
      showToast(
        "error",
        "Nessuna riga importabile: correggi il file o la mappatura",
      );
      return;
    }

    setCommittedPlan({ rows: previewRows, summary });
    setStep("running");
    setProgress({ done: 0, total: payload.length });

    try {
      const result = await onImport(payload, {
        onProgress: (completed: number) =>
          setProgress({ done: completed, total: payload.length }),
      });
      setOutcome(result);
      setStep("done");
    } catch (error: any) {
      // L'import scrive una riga per volta: quelle gia scritte restano, e il
      // riepilogo deve dirlo invece di far credere che non sia successo nulla.
      setOutcome({
        imported: 0,
        failed: [
          {
            rowNumber: 0,
            label: "Import interrotto",
            reason: error?.message || "Errore imprevisto durante l'import",
          },
        ],
      });
      setStep("done");
    }
  };

  /*
    Dopo l'import il riepilogo racconta **l'import che e avvenuto**, non una
    rivalutazione del file contro il club di adesso.
  */
  const committedSummary = committedPlan?.summary ?? summary;
  const committedRows = committedPlan?.rows ?? previewRows;

  const percent = progress.total
    ? Math.round((progress.done / progress.total) * 100)
    : 0;

  const running = step === "running";

  /*
    Il corpo prima del piede, nel sorgente come a schermo: il piede legge
    `summary` per il conteggio del pulsante «Importa», il riepilogo finale
    legge solo il piano congelato.
  */
  const body = (
    <FieldSizeProvider size="sm">
      {step === "upload" ? (
        <div className="flex flex-col gap-4">
          <InsetBlock
            dashed
            className="flex flex-col items-center px-6 py-8 text-center"
          >
            <IconChip
              tone="blue"
              size={44}
              className="mb-4 [&>svg]:h-5 [&>svg]:w-5"
            >
              <FileSpreadsheet aria-hidden />
            </IconChip>
            <p className="font-brand text-[15px] font-bold text-egw-ink">
              Scegli il file da importare
            </p>
            <p className="mt-1.5 max-w-[46ch] font-brand text-[12.5px] leading-[1.5] text-egw-ink-62">
              La prima riga deve contenere i nomi delle colonne.
            </p>

            <Button
              type="button"
              variant="primary"
              className="mt-5"
              loading={isParsing}
              icon={<Upload aria-hidden />}
              onClick={() => inputRef.current?.click()}
            >
              {isParsing ? "Lettura in corso" : "Seleziona file"}
            </Button>

            <input
              ref={inputRef}
              id="athlete-import-file"
              type="file"
              accept=".csv,.xls,.xlsx,.xml"
              className="hidden"
              onChange={handleFileSelected}
            />
          </InsetBlock>

          {parseError ? (
            <AlertBlock
              severity="danger"
              title="Il file non si legge"
              role="alert"
            >
              {parseError}
            </AlertBlock>
          ) : null}
        </div>
      ) : null}

      {step === "review" ? (
        <div className="flex flex-col gap-5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex h-8 items-center gap-2 rounded-egw-chip border border-[rgba(11,26,58,.12)] bg-egw-page-100 px-2.5 text-[12px]">
              <FileSpreadsheet
                className="h-3.5 w-3.5 text-egw-ink-62"
                aria-hidden
              />
              <span className="font-semibold text-egw-ink">{fileName}</span>
              <span className="uppercase text-egw-ink-42">{format}</span>
            </span>
            <Button type="button" variant="text" size="sm" onClick={reset}>
              Cambia file
            </Button>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <SummaryTile label="Righe lette" value={summary.total} />
            <SummaryTile
              label="Importabili"
              value={summary.importable}
              tone="positive"
            />
            <SummaryTile
              label="Da scartare"
              value={summary.discarded}
              tone={summary.discarded ? "negative" : "neutral"}
            />
          </div>

          <DrawerSection
            eyebrow="Mappatura colonne"
            title="Proposta in automatico, correggibile prima di importare"
          >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {MAPPING_FIELDS.map((field) => (
                <Field
                  key={field.id}
                  label={field.label}
                  htmlFor={`mapping-${field.id}`}
                  helper={field.hint}
                >
                  <Select
                    id={`mapping-${field.id}`}
                    value={mapping[field.id] || UNMAPPED}
                    onValueChange={(next) =>
                      setMapping((current) => ({
                        ...current,
                        [field.id]: next === UNMAPPED ? undefined : next,
                      }))
                    }
                    options={[
                      { value: UNMAPPED, label: "Non assegnata" },
                      ...headers.map((header) => ({
                        value: header,
                        label: header,
                      })),
                    ]}
                  />
                </Field>
              ))}
            </div>
          </DrawerSection>

          <DrawerSection eyebrow="Anteprima">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="font-brand text-[13.5px] font-bold text-egw-ink">
                Anteprima
                <span className="egw-num ml-2 text-[12px] font-medium text-egw-ink-62">
                  {visibleRows.length} righe mostrate
                </span>
              </p>
              <label className="flex items-center gap-2 text-[12.5px] font-medium text-egw-ink">
                <Checkbox
                  size={16}
                  checked={showOnlyProblems}
                  onChange={(event) =>
                    setShowOnlyProblems(event.target.checked)
                  }
                />
                Solo righe con problemi
              </label>
            </div>

            <div className="egw-scroll mt-3 max-h-[380px] overflow-auto rounded-egw-field border border-egw-hairline">
              <table className="w-full min-w-[640px] text-[12.5px]">
                <thead className="sticky top-0 bg-egw-page-100">
                  <tr className="border-b border-[rgba(11,26,58,.1)] text-left text-[9.5px] font-bold uppercase tracking-[var(--egw-track-col-head)] text-[rgba(11,26,58,.52)]">
                    <th className="px-3 py-2.5">#</th>
                    <th className="px-3 py-2.5">Cognome</th>
                    <th className="px-3 py-2.5">Nome</th>
                    <th className="px-3 py-2.5">Nascita</th>
                    <th className="px-3 py-2.5">Categoria</th>
                    <th className="px-3 py-2.5">Esito</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((row) => (
                    <tr
                      key={`import-row-${row.rowNumber}`}
                      className="border-b border-egw-rule last:border-0"
                    >
                      <td className="egw-num px-3 py-2 text-egw-ink-62">
                        {row.rowNumber}
                      </td>
                      <td className="px-3 py-2 text-egw-ink">
                        {row.lastName || "—"}
                      </td>
                      <td className="px-3 py-2 text-egw-ink">
                        {row.firstName || "—"}
                      </td>
                      <td className="egw-num px-3 py-2 text-egw-ink">
                        {row.birthDate || "—"}
                      </td>
                      <td className="px-3 py-2 text-egw-ink-72">
                        {row.categoryLabel}
                      </td>
                      {/*
                        La differenza fra le due righe con un problema non
                        e il problema: e la conseguenza. «Codice fiscale
                        non valido» significa che l'atleta **non verra
                        creato**; «Sesso non riconosciuto» significa che
                        verra creato senza quel dato. Finche a dirlo era
                        solo il colore — rosso contro ambra — le due frasi
                        si leggevano uguali, e chi non distingue quei due
                        colori non aveva modo di sapere quali otto righe
                        stava perdendo.
                      */}
                      <td className="px-3 py-2">
                        {row.errors.length ? (
                          <span className="text-egw-red">
                            <span className="font-medium">Scartata:</span>{" "}
                            {row.errors.join(" · ")}
                          </span>
                        ) : row.warnings.length ? (
                          <span className="text-egw-amber-ink">
                            <span className="font-semibold">
                              Importata con avviso:
                            </span>{" "}
                            {row.warnings.join(" · ")}
                          </span>
                        ) : (
                          <span className="font-semibold text-egw-green">
                            Pronta
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {previewRows.length > visibleRows.length ? (
              <p className="mt-3 text-[11.5px] text-egw-ink-62">
                Anteprima limitata a {PREVIEW_LIMIT} righe. All&apos;import
                vengono elaborate tutte le {summary.importable} righe
                importabili.
              </p>
            ) : null}
          </DrawerSection>
        </div>
      ) : null}

      {step === "running" ? (
        <div className="flex flex-col gap-4 py-6">
          <p
            className="egw-num font-brand text-[13px] font-semibold text-egw-ink"
            role="status"
            aria-live="polite"
          >
            Scrittura in corso: {progress.done} di {progress.total} atleti.
          </p>
          <div
            className="relative h-1.5 w-full overflow-hidden rounded-egw-pill bg-[rgba(11,26,58,.08)]"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={progress.total}
            aria-valuenow={progress.done}
          >
            <div
              className="h-full rounded-egw-pill bg-egw-action transition-[width] duration-panel ease-egw"
              style={{ width: `${percent}%` }}
            />
          </div>
          <p className="egw-num text-[11.5px] font-semibold text-egw-ink-62">
            {percent}%
          </p>
          <p className="text-[12px] text-egw-ink-62">
            Non chiudere la pagina: ogni atleta viene scritto singolarmente e
            quelli già salvati restano.
          </p>
        </div>
      ) : null}

      {step === "done" && outcome ? (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <SummaryTile
              label="Importati"
              value={outcome.imported}
              tone="positive"
            />
            <SummaryTile
              label="Scartati in anteprima"
              value={committedSummary.discarded}
              tone={committedSummary.discarded ? "negative" : "neutral"}
            />
            <SummaryTile
              label="Errori in scrittura"
              value={outcome.failed.length}
              tone={outcome.failed.length ? "negative" : "neutral"}
            />
          </div>

          {outcome.failed.length ? (
            <AlertBlock severity="danger" title="Righe non scritte">
              <ul className="egw-scroll mt-1 max-h-48 space-y-1 overflow-y-auto">
                {outcome.failed.map((failure) => (
                  <li key={`failure-${failure.rowNumber}-${failure.label}`}>
                    Riga {failure.rowNumber}: {failure.label} — {failure.reason}
                  </li>
                ))}
              </ul>
            </AlertBlock>
          ) : (
            <AlertBlock
              severity="success"
              title="Tutte le righe importabili sono state scritte."
            />
          )}

          {committedSummary.discarded ? (
            <InsetBlock>
              <p className="font-brand text-[13px] font-semibold text-egw-ink">
                Scartate prima dell&apos;import
              </p>
              <ul className="egw-scroll mt-2 max-h-40 space-y-1 overflow-y-auto text-[12.5px] text-egw-ink-72">
                {committedRows
                  .filter((row) => row.errors.length)
                  .slice(0, 100)
                  .map((row) => (
                    <li key={`discarded-${row.rowNumber}`}>
                      Riga {row.rowNumber}:{" "}
                      {[row.lastName, row.firstName]
                        .filter(Boolean)
                        .join(" ") || "senza nominativo"}{" "}
                      — {row.errors.join(", ")}
                    </li>
                  ))}
              </ul>
            </InsetBlock>
          ) : null}
        </div>
      ) : null}
    </FieldSizeProvider>
  );

  const footer = (
    <>
      {step === "review" ? (
        <>
          <Button
            variant="primary"
            onClick={handleImport}
            disabled={!summary.importable}
          >
            Importa {formatInteger(summary.importable)} atleti
          </Button>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Annulla
          </Button>
        </>
      ) : null}

      {step === "upload" ? (
        <Button variant="secondary" onClick={() => onOpenChange(false)}>
          Chiudi
        </Button>
      ) : null}

      {step === "running" ? (
        <span className="text-[12px] font-medium text-egw-ink-62">
          Scrittura in corso: il cassetto si chiude alla fine.
        </span>
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
      eyebrow={STEP_EYEBROW[step]}
      title="Importa atleti"
      description="CSV, XLS, XLSX o XML. Le colonne vengono riconosciute in automatico e ogni riga è verificata prima di scrivere."
      locked={running}
      dirty={step === "review"}
      data-test="athlete-import-drawer"
      footer={footer}
    >
      {body}
    </Drawer>
  );
}

function SummaryTile({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: number;
  tone?: "neutral" | "positive" | "negative";
}) {
  return (
    <InsetBlock className="px-4 py-3">
      <p className="font-brand text-[10px] font-bold uppercase tracking-[var(--egw-track-eyebrow)] text-egw-ink-42">
        {label}
      </p>
      <p
        className={cn(
          "egw-num mt-1 font-brand text-[22px] font-extrabold leading-none",
          tone === "positive" && "text-egw-green",
          tone === "negative" && "text-egw-red",
          tone === "neutral" && "text-egw-ink",
        )}
      >
        {formatInteger(value)}
      </p>
    </InsetBlock>
  );
}
