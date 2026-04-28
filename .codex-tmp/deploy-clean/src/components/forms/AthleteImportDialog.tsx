"use client";

import React, { useMemo, useState } from "react";
import {
  AthleteImportField,
  AthleteImportMapping,
  guessAthleteImportMapping,
  normalizeImportedAthletes,
  parseAthleteImportFile,
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
import { useGlobalLoading } from "@/components/providers/GlobalLoadingProvider";
import { Upload, FileSpreadsheet } from "lucide-react";

interface AthleteImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: { id: string; name: string }[];
  onImport: (
    rows: {
      firstName: string;
      lastName: string;
      birthDate: string;
      categoryId: string | null;
      categoryLabel: string;
    }[],
  ) => Promise<{ successCount: number; failedRows: string[] }>;
}

const MAPPING_FIELDS: { id: AthleteImportField; label: string }[] = [
  { id: "firstName", label: "Colonna Nome" },
  { id: "lastName", label: "Colonna Cognome" },
  { id: "fullName", label: "Colonna Nominativo completo" },
  { id: "birthDate", label: "Colonna Data di nascita" },
  { id: "birthYear", label: "Colonna Anno di nascita" },
  { id: "category", label: "Colonna Categoria" },
];

export function AthleteImportDialog({
  open,
  onOpenChange,
  categories,
  onImport,
}: AthleteImportDialogProps) {
  const { showToast } = useToast();
  const { runWithLoader } = useGlobalLoading();
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, any>[]>([]);
  const [mapping, setMapping] = useState<AthleteImportMapping>({});
  const [format, setFormat] = useState("");
  const [isParsing, setIsParsing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  React.useEffect(() => {
    if (!open) {
      setFileName("");
      setHeaders([]);
      setRows([]);
      setMapping({});
      setFormat("");
      setIsParsing(false);
    }
  }, [open]);

  const previewRows = useMemo(
    () => normalizeImportedAthletes(rows, mapping, categories),
    [rows, mapping, categories],
  );

  const validRows = previewRows.filter((row) => row.warnings.length === 0);

  const handleFileSelected = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setIsParsing(true);
    try {
      await runWithLoader(
        "Lettura del file atleti in corso, attendi un momento...",
        async () => {
          const parsed = await parseAthleteImportFile(file);
          setFileName(file.name);
          setHeaders(parsed.headers);
          setRows(parsed.rows);
          setFormat(parsed.format);
          setMapping(guessAthleteImportMapping(parsed.headers));

          if (!parsed.rows.length) {
            showToast("error", "Nessuna riga valida trovata nel file importato");
          }
        },
      );
    } catch (error: any) {
      console.error("Error parsing import file:", error);
      showToast(
        "error",
        error?.message || "Errore durante la lettura del file importato",
      );
      setFileName("");
      setHeaders([]);
      setRows([]);
      setMapping({});
      setFormat("");
    } finally {
      setIsParsing(false);
      event.target.value = "";
    }
  };

  const handleImport = async () => {
    if (!validRows.length) {
      showToast("error", "Non ci sono righe valide da importare");
      return;
    }

    try {
      setIsImporting(true);
      const result = await runWithLoader(
        "Importazione atleti in corso, non chiudere la pagina...",
        async () =>
          onImport(
            validRows.map((row) => ({
              firstName: row.firstName,
              lastName: row.lastName,
              birthDate: row.birthDate,
              categoryId: row.categoryId,
              categoryLabel: row.categoryLabel,
            })),
          ),
      );

      if (result.failedRows.length) {
        showToast(
          "warning",
          `Import completato con ${result.successCount} righe riuscite e ${result.failedRows.length} righe da rivedere`,
        );
      } else {
        showToast(
          "success",
          `${result.successCount} atleti importati con successo`,
        );
      }

      onOpenChange(false);
    } catch (error: any) {
      console.error("Error importing athletes:", error);
      showToast(
        "error",
        error?.message || "Errore durante l'importazione degli atleti",
      );
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>Importa Atleti</DialogTitle>
          <DialogDescription>
            Carica un file CSV, XLS, XLSX o XML. Il sistema prova a collegare
            automaticamente le colonne e ti mostra subito l&apos;anteprima.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          <div className="rounded-2xl border border-dashed bg-slate-50 p-5 dark:bg-slate-900/50">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="font-medium">File supportati</p>
                <p className="text-sm text-muted-foreground">
                  CSV, XLS, XLSX e XML con anagrafica atleti
                </p>
              </div>

              <Label
                htmlFor="athlete-import-file"
                className="inline-flex cursor-pointer items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                <Upload className="h-4 w-4" />
                Seleziona file
              </Label>
            </div>

            <Input
              id="athlete-import-file"
              type="file"
              accept=".csv,.xls,.xlsx,.xml"
              className="hidden"
              onChange={handleFileSelected}
            />

            {fileName ? (
              <div className="mt-4 flex items-center gap-2 text-sm">
                <FileSpreadsheet className="h-4 w-4 text-blue-600" />
                <span className="font-medium">{fileName}</span>
                <span className="text-muted-foreground">({format})</span>
              </div>
            ) : null}
          </div>

          {headers.length ? (
            <div className="grid gap-6 lg:grid-cols-[320px,1fr]">
              <div className="rounded-2xl border p-4">
                <h3 className="font-medium">Mappatura automatica</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  La mappatura e&apos; proposta in automatico ma puo' essere
                  corretta prima dell&apos;import.
                </p>

                <div className="mt-4 space-y-3">
                  {MAPPING_FIELDS.map((field) => (
                    <div key={field.id} className="space-y-1">
                      <Label>{field.label}</Label>
                      <select
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
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="font-medium">Anteprima import</h3>
                    <p className="text-sm text-muted-foreground">
                      Righe lette: {previewRows.length}. Importabili subito:{" "}
                      {validRows.length}.
                    </p>
                  </div>
                </div>

                <div className="mt-4 max-h-[420px] overflow-auto rounded-xl border">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-white dark:bg-slate-950">
                      <tr className="border-b">
                        <th className="px-3 py-2 text-left">Riga</th>
                        <th className="px-3 py-2 text-left">Nome</th>
                        <th className="px-3 py-2 text-left">Cognome</th>
                        <th className="px-3 py-2 text-left">Data nascita</th>
                        <th className="px-3 py-2 text-left">Categoria</th>
                        <th className="px-3 py-2 text-left">Esito</th>
                      </tr>
                    </thead>
                    <tbody>
                      {previewRows.slice(0, 40).map((row) => (
                        <tr key={`import-row-${row.rowNumber}`} className="border-b">
                          <td className="px-3 py-2">{row.rowNumber}</td>
                          <td className="px-3 py-2">{row.firstName || "-"}</td>
                          <td className="px-3 py-2">{row.lastName || "-"}</td>
                          <td className="px-3 py-2">{row.birthDate || "-"}</td>
                          <td className="px-3 py-2">{row.categoryLabel}</td>
                          <td className="px-3 py-2">
                            {row.warnings.length ? (
                              <span className="text-amber-600">
                                {row.warnings.join(", ")}
                              </span>
                            ) : (
                              <span className="text-green-600">Pronta</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {previewRows.length > 40 ? (
                  <p className="mt-3 text-xs text-muted-foreground">
                    Anteprima limitata alle prime 40 righe. In import vengono
                    elaborate tutte le righe valide.
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annulla
          </Button>
            <Button
              onClick={handleImport}
              className="bg-blue-600 hover:bg-blue-700"
            disabled={isParsing || isImporting || !headers.length}
          >
            {isParsing
              ? "Lettura file..."
              : isImporting
                ? "Import in corso..."
                : "Importa atleti"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
