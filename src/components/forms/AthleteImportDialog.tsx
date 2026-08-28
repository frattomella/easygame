"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast-notification";
import {
  CircleCheck,
  FileSpreadsheet,
  Loader2,
  TriangleAlert,
  Upload,
} from "lucide-react";

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

const MAPPING_FIELDS: { id: AthleteImportField; label: string; hint?: string }[] = [
  { id: "lastName", label: "Cognome" },
  { id: "firstName", label: "Nome" },
  { id: "fullName", label: "Nominativo completo", hint: "usato se nome e cognome non sono separati" },
  { id: "birthDate", label: "Data di nascita" },
  { id: "birthYear", label: "Anno di nascita", hint: "alternativa alla data completa" },
  { id: "category", label: "Categoria" },
  { id: "gender", label: "Sesso" },
  { id: "fiscalCode", label: "Codice fiscale" },
  { id: "email", label: "Email" },
  { id: "phone", label: "Telefono" },
];

const PREVIEW_LIMIT = 50;

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

  const summary = useMemo(() => summarizeImportPlan(previewRows), [previewRows]);

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
      showToast("error", "Nessuna riga importabile: correggi il file o la mappatura");
      return;
    }

    setCommittedPlan({ rows: previewRows, summary });
    setStep("running");
    setProgress({ done: 0, total: payload.length });

    try {
      const result = await onImport(payload, {
        onProgress: (completed) =>
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>Importa atleti</DialogTitle>
          <DialogDescription>
            CSV, XLS, XLSX o XML. Le colonne vengono riconosciute in automatico
            e ogni riga e verificata prima di scrivere.
          </DialogDescription>
        </DialogHeader>

        {step === "upload" ? (
          <div className="space-y-4">
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
              <FileSpreadsheet
                className="mx-auto h-8 w-8 text-slate-400"
                aria-hidden
              />
              <p className="mt-3 font-medium text-slate-900">
                Scegli il file da importare
              </p>
              <p className="mt-1 text-sm text-slate-500">
                La prima riga deve contenere i nomi delle colonne.
              </p>

              <Button
                type="button"
                className="mt-4"
                disabled={isParsing}
                onClick={() => inputRef.current?.click()}
              >
                {isParsing ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <Upload className="mr-2 h-4 w-4" aria-hidden />
                )}
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
            </div>

            {parseError ? (
              <p
                className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800"
                role="alert"
              >
                <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                {parseError}
              </p>
            ) : null}
          </div>
        ) : null}

        {step === "review" ? (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-2.5 py-1.5">
                <FileSpreadsheet className="h-4 w-4 text-slate-500" aria-hidden />
                <span className="font-medium">{fileName}</span>
                <span className="text-slate-500">{format}</span>
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={reset}
              >
                Cambia file
              </Button>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
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

            <div className="grid gap-5 lg:grid-cols-[300px,1fr]">
              <div className="rounded-xl border border-slate-200 p-4">
                <h3 className="font-medium text-slate-900">Mappatura colonne</h3>
                <p className="mt-1 text-sm text-slate-500">
                  Proposta in automatico, correggibile prima di importare.
                </p>

                <div className="mt-4 max-h-[420px] space-y-3 overflow-y-auto pr-1">
                  {MAPPING_FIELDS.map((field) => (
                    <div key={field.id} className="space-y-1">
                      <Label htmlFor={`mapping-${field.id}`}>{field.label}</Label>
                      <select
                        id={`mapping-${field.id}`}
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        value={mapping[field.id] || ""}
                        onChange={(event) =>
                          setMapping((current) => ({
                            ...current,
                            [field.id]: event.target.value || undefined,
                          }))
                        }
                      >
                        <option value="">Non assegnata</option>
                        {headers.map((header) => (
                          <option key={`${field.id}-${header}`} value={header}>
                            {header}
                          </option>
                        ))}
                      </select>
                      {field.hint ? (
                        <p className="text-xs text-slate-500">{field.hint}</p>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h3 className="font-medium text-slate-900">
                    Anteprima
                    <span className="ml-2 text-sm font-normal text-slate-500">
                      {visibleRows.length} righe mostrate
                    </span>
                  </h3>
                  <label className="flex items-center gap-2 text-sm text-slate-600">
                    <input
                      type="checkbox"
                      className="h-4 w-4"
                      checked={showOnlyProblems}
                      onChange={(event) =>
                        setShowOnlyProblems(event.target.checked)
                      }
                    />
                    Solo righe con problemi
                  </label>
                </div>

                <div className="eg-scroll-x mt-3 max-h-[380px] overflow-y-auto rounded-lg border border-slate-200">
                  <table className="w-full min-w-[640px] text-sm">
                    <thead className="sticky top-0 bg-slate-50">
                      <tr className="border-b border-slate-200 text-left">
                        <th className="px-3 py-2 font-medium">#</th>
                        <th className="px-3 py-2 font-medium">Cognome</th>
                        <th className="px-3 py-2 font-medium">Nome</th>
                        <th className="px-3 py-2 font-medium">Nascita</th>
                        <th className="px-3 py-2 font-medium">Categoria</th>
                        <th className="px-3 py-2 font-medium">Esito</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleRows.map((row) => (
                        <tr
                          key={`import-row-${row.rowNumber}`}
                          className="border-b border-slate-100 last:border-0"
                        >
                          <td className="eg-tabular px-3 py-2 text-slate-500">
                            {row.rowNumber}
                          </td>
                          <td className="px-3 py-2">{row.lastName || "—"}</td>
                          <td className="px-3 py-2">{row.firstName || "—"}</td>
                          <td className="eg-tabular px-3 py-2">
                            {row.birthDate || "—"}
                          </td>
                          <td className="px-3 py-2">{row.categoryLabel}</td>
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
                              <span className="text-red-700">
                                <span className="font-medium">Scartata:</span>{" "}
                                {row.errors.join(" · ")}
                              </span>
                            ) : row.warnings.length ? (
                              <span className="text-amber-700">
                                <span className="font-medium">
                                  Importata con avviso:
                                </span>{" "}
                                {row.warnings.join(" · ")}
                              </span>
                            ) : (
                              <span className="text-emerald-700">Pronta</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {previewRows.length > visibleRows.length ? (
                  <p className="mt-3 text-xs text-slate-500">
                    Anteprima limitata a {PREVIEW_LIMIT} righe. All&apos;import
                    vengono elaborate tutte le {summary.importable} righe
                    importabili.
                  </p>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}

        {step === "running" ? (
          <div className="space-y-4 py-6">
            <p className="text-sm text-slate-600" role="status" aria-live="polite">
              Scrittura in corso: {progress.done} di {progress.total} atleti.
            </p>
            <div
              className="h-2.5 w-full overflow-hidden rounded-full bg-slate-200"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={progress.total}
              aria-valuenow={progress.done}
            >
              <div
                className="h-full rounded-full bg-blue-600 transition-[width] duration-200"
                style={{ width: `${percent}%` }}
              />
            </div>
            <p className="eg-tabular text-xs text-slate-500">{percent}%</p>
            <p className="text-xs text-slate-500">
              Non chiudere la pagina: ogni atleta viene scritto singolarmente e
              quelli gia salvati restano.
            </p>
          </div>
        ) : null}

        {step === "done" && outcome ? (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
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
              <div className="rounded-xl border border-red-200 bg-red-50 p-4">
                <p className="flex items-center gap-2 font-medium text-red-900">
                  <TriangleAlert className="h-4 w-4" aria-hidden />
                  Righe non scritte
                </p>
                <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto text-sm text-red-800">
                  {outcome.failed.map((failure) => (
                    <li key={`failure-${failure.rowNumber}-${failure.label}`}>
                      Riga {failure.rowNumber}: {failure.label} — {failure.reason}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
                <CircleCheck className="h-4 w-4" aria-hidden />
                Tutte le righe importabili sono state scritte.
              </p>
            )}

            {committedSummary.discarded ? (
              <div className="rounded-xl border border-slate-200 p-4">
                <p className="font-medium text-slate-900">
                  Scartate prima dell&apos;import
                </p>
                <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto text-sm text-slate-600">
                  {committedRows
                    .filter((row) => row.errors.length)
                    .slice(0, 100)
                    .map((row) => (
                      <li key={`discarded-${row.rowNumber}`}>
                        Riga {row.rowNumber}:{" "}
                        {[row.lastName, row.firstName].filter(Boolean).join(" ") ||
                          "senza nominativo"}{" "}
                        — {row.errors.join(", ")}
                      </li>
                    ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}

        <DialogFooter>
          {step === "review" ? (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Annulla
              </Button>
              <Button onClick={handleImport} disabled={!summary.importable}>
                Importa {summary.importable} atleti
              </Button>
            </>
          ) : null}

          {step === "upload" ? (
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Chiudi
            </Button>
          ) : null}

          {step === "done" ? (
            <>
              <Button variant="outline" onClick={reset}>
                Importa un altro file
              </Button>
              <Button onClick={() => onOpenChange(false)}>Chiudi</Button>
            </>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
  const toneClass =
    tone === "positive"
      ? "text-emerald-700"
      : tone === "negative"
        ? "text-red-700"
        : "text-slate-900";

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`eg-tabular mt-1 text-2xl font-semibold ${toneClass}`}>
        {value}
      </p>
    </div>
  );
}
