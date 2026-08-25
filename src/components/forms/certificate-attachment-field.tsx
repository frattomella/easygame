"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  downloadAttachment,
  fileToDataUrl,
  openClientFileUrl,
} from "@/lib/client-files";
import { CheckCircle2, Download, Eye, Trash2, Upload } from "lucide-react";
import { useToast } from "@/components/ui/toast-notification";

/**
 * Un allegato con le sue quattro azioni: allega, guarda, scarica, elimina.
 *
 * Esiste perche lo stesso blocco era scritto **sei volte** — BLSD, primo
 * soccorso e antincendio, nella scheda atleta e in quella allenatore — e in
 * tutte e sei aveva gli stessi tre difetti (Blocco 7, punto 6):
 *
 * 1. «Visualizza» faceva `window.open` su un data URL, che i browser bloccano:
 *    apriva una scheda vuota. Ora passa da `openClientFileUrl`, che converte
 *    in object URL;
 * 2. «Scarica» produceva un file chiamato `attestato_blsd`, senza estensione e
 *    senza dire di chi fosse. Ora il nome viene da `buildAttachmentFileName`;
 * 3. non c'era modo di **eliminare** un allegato caricato per sbaglio, ne di
 *    sapere se il caricamento era stato salvato.
 *
 * Il componente non salva: chiama `onChange` e chi lo ospita persiste. E cio
 * che permette allo stesso blocco di stare su un atleta (dove i file vivono in
 * `athlete.certificateFiles`) e su un allenatore (dove vivono nel record
 * dell'allenatore) senza saperlo.
 */

export type CertificateAttachmentFieldProps = {
  /** Etichetta del documento: e anche il prefisso del nome del download. */
  documentType: string;
  value?: string | null;
  /** `null` significa «eliminato». */
  onChange: (next: string | null) => void | Promise<void>;
  person?: {
    firstName?: string | null;
    lastName?: string | null;
    fullName?: string | null;
  };
  /** Data che identifica il documento: scadenza, emissione, caricamento. */
  date?: string | null;
  accept?: string;
  disabled?: boolean;
  className?: string;
  /** Etichetta mostrata quando non c'e nessun file. */
  emptyLabel?: string;
};

const DEFAULT_ACCEPT = ".pdf,.jpg,.jpeg,.png,.webp,.heic";

export function CertificateAttachmentField({
  documentType,
  value,
  onChange,
  person,
  date,
  accept = DEFAULT_ACCEPT,
  disabled = false,
  className,
  emptyLabel = "Nessun file allegato",
}: CertificateAttachmentFieldProps) {
  const { showToast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const hasFile = Boolean(String(value || "").trim());

  const nameInput = {
    documentType,
    firstName: person?.firstName,
    lastName: person?.lastName,
    fullName: person?.fullName,
    date,
  };

  const handleFile = async (file: File | null | undefined) => {
    if (!file) return;

    setBusy(true);
    try {
      const dataUrl = await fileToDataUrl(file);
      if (!dataUrl) {
        showToast("error", "Non sono riuscito a leggere il file");
        return;
      }
      await onChange(dataUrl);
      showToast("success", `${documentType}: file salvato`);
    } catch (error) {
      console.error(`Errore nel salvataggio dell'allegato ${documentType}`, error);
      showToast("error", `${documentType}: salvataggio non riuscito`);
    } finally {
      setBusy(false);
      // Senza questo, ricaricare **lo stesso** file non emette `change`.
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const handleDelete = async () => {
    setBusy(true);
    try {
      await onChange(null);
      showToast("success", `${documentType}: allegato eliminato`);
    } catch (error) {
      console.error(`Errore nell'eliminazione dell'allegato ${documentType}`, error);
      showToast("error", `${documentType}: eliminazione non riuscita`);
    } finally {
      setBusy(false);
      setConfirmingDelete(false);
    }
  };

  return (
    <div className={cn("space-y-3", className)}>
      <input
        type="file"
        ref={inputRef}
        className="hidden"
        accept={accept}
        onChange={(event) => handleFile(event.target.files?.[0])}
      />

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled || busy}
          onClick={() => inputRef.current?.click()}
        >
          <Upload className="mr-2 h-4 w-4" />
          {hasFile ? "Sostituisci file" : "Allega file"}
        </Button>

        {hasFile ? (
          <>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => {
                // Se compare «Visualizza», il file si deve vedere: quando non
                // si puo, va detto invece di non fare niente.
                if (!openClientFileUrl(value)) {
                  showToast(
                    "error",
                    "Non riesco ad aprire il file: controlla che il browser non blocchi le finestre",
                  );
                }
              }}
            >
              <Eye className="mr-2 h-4 w-4" />
              Visualizza
            </Button>

            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => {
                if (!downloadAttachment(value, nameInput)) {
                  showToast("error", "Non riesco a scaricare il file");
                }
              }}
            >
              <Download className="mr-2 h-4 w-4" />
              Scarica
            </Button>

            {confirmingDelete ? (
              <>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  disabled={busy}
                  onClick={handleDelete}
                >
                  Conferma eliminazione
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  onClick={() => setConfirmingDelete(false)}
                >
                  Annulla
                </Button>
              </>
            ) : (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={disabled || busy}
                className="text-red-600 hover:bg-red-50 hover:text-red-700"
                onClick={() => setConfirmingDelete(true)}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Elimina
              </Button>
            )}
          </>
        ) : null}
      </div>

      {hasFile ? (
        <p className="flex items-center gap-1 text-sm text-green-700 dark:text-green-400">
          <CheckCircle2 className="h-4 w-4" />
          File allegato
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">{emptyLabel}</p>
      )}
    </div>
  );
}
