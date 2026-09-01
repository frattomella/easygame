"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { fileToDataUrl } from "@/lib/client-files";
import {
  MAX_DOCUMENT_SCAN_BYTES,
  acceptAttributeFor,
  acceptExtractedFields,
  listExtractedFields,
  validateDocumentForExtraction,
  type DocumentExtractionProvider,
  type DocumentExtractionResult,
  type ExtractedPersonFields,
} from "@/lib/document-extraction";
import { ocrExtractionProvider } from "@/lib/document-extraction-ocr";
import { Camera, Loader2, ScanLine, TriangleAlert, Upload } from "lucide-react";

/**
 * Lettura assistita di un documento durante la compilazione di un'anagrafica.
 *
 * Quattro passi, e il quarto e il motivo per cui il componente esiste:
 *
 * 1. si carica la foto del documento;
 * 2. il motore la legge (oggi OCR locale: il documento non lascia il browser);
 * 3. si vede **cosa** e stato letto, campo per campo, con quanta fiducia;
 * 4. si sceglie cosa applicare, e solo allora il form cambia.
 *
 * Il terzo e il quarto passo non sono ornamenti. Un OCR sbaglia, e in
 * un'anagrafica sportiva un dato sbagliato che nessuno ha guardato finisce su
 * un tesseramento. Nessun campo viene scritto senza una conferma esplicita.
 *
 * I campi gia compilati a mano sono **deselezionati** di partenza: chi ha
 * digitato aveva il documento davanti.
 */

export type DocumentExtractionFieldProps = {
  /** Applica i campi accettati allo stato del form. */
  onApply: (patch: Record<string, string>) => void;
  /** Valori gia presenti: servono a non sovrascriverli per distrazione. */
  currentValues?: Record<string, unknown>;
  provider?: DocumentExtractionProvider;
  disabled?: boolean;
  className?: string;
};

export function DocumentExtractionField({
  onApply,
  currentValues,
  provider = ocrExtractionProvider,
  disabled = false,
  className,
}: DocumentExtractionFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [conFotocamera, setConFotocamera] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    setConFotocamera(window.matchMedia("(pointer: coarse)").matches);
  }, []);
  /**
   * L'anteprima dei dati letti.
   *
   * Ci si porta il fuoco quando la lettura riesce (RC Fix 2, punto 19). Chi
   * naviga da tastiera preme «Carica documento», sceglie un file e si ritrova
   * il fuoco sul pulsante: l'elenco dei dati riconosciuti compare **sotto**,
   * e per accorgersene bisogna andarlo a cercare. Chi naviga a voce non se ne
   * accorge affatto.
   */
  const resultsRef = useRef<HTMLDivElement>(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<DocumentExtractionResult | null>(null);
  const [accepted, setAccepted] = useState<Set<keyof ExtractedPersonFields>>(
    new Set(),
  );

  const hasValue = (key: keyof ExtractedPersonFields) =>
    Boolean(String(currentValues?.[key] ?? "").trim());

  const handleFile = async (file: File | null | undefined) => {
    if (!file) return;

    // Il rifiuto arriva **prima** di caricare il worker OCR, che pesa alcuni
    // MB: dire «non leggo i PDF» dopo averli scaricati e una scortesia.
    const validation = validateDocumentForExtraction(file, provider);
    if (!validation.ok) {
      setResult(null);
      setError(validation.message);
      if (inputRef.current) inputRef.current.value = "";
      return;
    }

    setBusy(true);
    setError("");
    setResult(null);

    try {
      const dataUrl = await fileToDataUrl(file);
      if (!dataUrl) {
        setError("Non sono riuscito a leggere il file.");
        return;
      }

      const extraction = await provider.extract(dataUrl);
      setResult(extraction);

      if (extraction.empty) {
        setError(
          "Ho letto il documento ma non sono riuscito a ricavare campi affidabili. Prova con una foto piu nitida, o compila a mano.",
        );
        return;
      }

      // Preselezione: solo cio che il form non ha gia, e solo cio di cui il
      // motore e sicuro.
      setAccepted(
        new Set(
          listExtractedFields(extraction.fields)
            .filter((entry) => entry.confidence === "high" && !hasValue(entry.key))
            .map((entry) => entry.key),
        ),
      );
    } catch (caught) {
      console.error("Errore nella lettura del documento", caught);
      setError(
        "Impossibile analizzare il documento. Prova con una foto piu nitida o con luce migliore.",
      );
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const entriesCount = result ? listExtractedFields(result.fields).length : 0;

  useEffect(() => {
    if (entriesCount) resultsRef.current?.focus();
  }, [entriesCount]);

  const toggle = (key: keyof ExtractedPersonFields) =>
    setAccepted((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const entries = result ? listExtractedFields(result.fields) : [];

  return (
    <div className={cn("space-y-3 rounded-lg border border-dashed p-4", className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Label className="flex items-center gap-2">
            <ScanLine className="h-4 w-4 text-slate-500" aria-hidden />
            Compila dal documento
          </Label>
          <p className="mt-1 text-xs text-muted-foreground">
            Carica la foto di un documento d&apos;identita: i dati vengono
            proposti, non scritti. La lettura avviene nel browser.
          </p>
          {/*
            I formati si dichiarano invece di lasciarli scoprire: la domanda
            «perche non legge il mio PDF» e stata posta prima che il rifiuto
            avesse una spiegazione.
          */}
          <p className="mt-1 text-xs text-slate-500">
            JPG, PNG, WEBP o HEIC, fino a{" "}
            {Math.round(MAX_DOCUMENT_SCAN_BYTES / (1024 * 1024))} MB. Un PDF
            va bene se contiene la fotografia del documento — e quello che
            salva un telefono quando «scansiona».
          </p>
        </div>

        <input
          type="file"
          ref={inputRef}
          className="hidden"
          accept={acceptAttributeFor(provider)}
          onChange={(event) => handleFile(event.target.files?.[0])}
        />
        {/*
          W6 §16, secondo attrito. **La fotocamera esisteva in un punto solo**
          di tutta l applicazione — la scheda atleta — e le altre quattro
          schermate che leggono un documento accettavano soltanto un file
          gia salvato. Chi ha il documento in mano e il telefono in mano
          doveva fotografarlo, salvarlo e poi cercarlo.

          Si usa `capture` e non `getUserMedia`: apre la fotocamera di
          sistema, che mette a fuoco e stabilizza meglio di un fotogramma
          preso da un flusso video — e su un documento la nitidezza e
          esattamente cio da cui dipende il riconoscimento. In piu non chiede
          un permesso alla pagina, e funziona su iOS, dove un flusso video
          dentro una scheda ha una storia di casi particolari.
        */}
        <input
          type="file"
          ref={cameraRef}
          className="hidden"
          accept="image/*"
          capture="environment"
          onChange={(event) => handleFile(event.target.files?.[0])}
        />
        <div className="flex flex-wrap gap-2">
          {/*
            Su un dispositivo a puntatore fine — un mouse — `capture` non
            apre niente: il browser lo ignora e mostra lo stesso selettore di
            file. Un pulsante «Scatta una foto» che apre un selettore di file
            e una promessa non mantenuta, quindi li non compare.
          */}
          {conFotocamera ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={disabled || busy}
              onClick={() => cameraRef.current?.click()}
            >
              <Camera className="mr-2 h-4 w-4" />
              Scatta una foto
            </Button>
          ) : null}
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled || busy}
            onClick={() => inputRef.current?.click()}
          >
            {busy ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Upload className="mr-2 h-4 w-4" />
            )}
            {busy ? "Lettura in corso…" : "Carica documento"}
          </Button>
        </div>
      </div>

      {error ? (
        <p className="flex items-start gap-1.5 text-xs text-amber-700" role="alert">
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          {error}
        </p>
      ) : null}

      {entries.length ? (
        <div
          ref={resultsRef}
          tabIndex={-1}
          role="group"
          aria-label="Dati letti dal documento"
          className="space-y-3 outline-none"
        >
          <p className="text-xs font-medium text-slate-600" role="status">
            Dati letti — scegli cosa applicare:
          </p>

          <ul className="space-y-1">
            {entries.map((entry) => (
              <li key={entry.key}>
                <label className="flex cursor-pointer items-start gap-2 rounded px-2 py-1.5 text-sm hover:bg-slate-50">
                  <Checkbox
                    className="mt-0.5"
                    checked={accepted.has(entry.key)}
                    onCheckedChange={() => toggle(entry.key)}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="text-xs text-muted-foreground">
                      {entry.label}
                    </span>
                    <span className="block truncate font-medium text-slate-900">
                      {entry.value}
                    </span>
                    {entry.confidence === "low" ? (
                      <span className="text-xs text-amber-700">
                        Lettura incerta: controllala prima di applicarla
                      </span>
                    ) : null}
                    {hasValue(entry.key) ? (
                      <span className="text-xs text-slate-500">
                        Il campo e gia compilato: applicando lo sostituisci
                      </span>
                    ) : null}
                  </span>
                </label>
              </li>
            ))}
          </ul>

          <Button
            type="button"
            size="sm"
            disabled={!accepted.size}
            onClick={() => {
              if (!result) return;
              onApply(
                acceptExtractedFields(result.fields, Array.from(accepted)),
              );
              setResult(null);
              setAccepted(new Set());
            }}
          >
            Applica {accepted.size} {accepted.size === 1 ? "campo" : "campi"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
