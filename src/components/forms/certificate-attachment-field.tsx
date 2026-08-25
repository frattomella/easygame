"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { downloadAttachment, openClientFileUrl } from "@/lib/client-files";
import { CheckCircle2, Download, Eye, Trash2, Upload } from "lucide-react";
import { useToast } from "@/components/ui/toast-notification";
import {
  ATTACHMENT_ACCEPT_ATTRIBUTE,
  resolveAttachmentSource,
  type AttachmentOwnerType,
} from "@/lib/attachments";
import {
  deleteAttachmentById,
  replaceAttachment,
  uploadAttachment,
} from "@/lib/api/attachments";

/**
 * Un allegato con le sue quattro azioni: allega, guarda, scarica, elimina.
 *
 * Esiste perche lo stesso blocco era scritto **sei volte** — BLSD, primo
 * soccorso e antincendio, nella scheda atleta e in quella allenatore — e in
 * tutte e sei aveva gli stessi difetti (Blocco 7, punto 6). Dal Blocco 8 e
 * anche il punto in cui il file **esce dal record**: quello che il componente
 * consegna a chi lo ospita non e piu un data URL da 2 MB, e un riferimento
 * (`attachment:<id>`) di poche decine di caratteri.
 *
 * **Perche il valore resta una `string`.** Ogni campo che lo ospitava
 * conteneva gia una stringa. Cambiarne la forma avrebbe richiesto di migrare
 * ogni record prima di poter usare il componente nuovo; cosi invece i due
 * formati convivono, e un allegato legacy continua a vedersi e a scaricarsi
 * senza che nessuno lo abbia toccato.
 *
 * **Sostituzione, non cancella-e-ricrea.** Se c'e gia un riferimento, il file
 * nuovo sostituisce il contenuto **allo stesso id**: chi ospita il campo non
 * deve nemmeno salvare, e non esiste l'istante in cui il record punta a un
 * allegato che non c'e piu.
 */

export type CertificateAttachmentFieldProps = {
  /** Etichetta del documento: e anche il prefisso del nome del download. */
  documentType: string;
  value?: string | null;
  /** `null` significa «eliminato». */
  onChange: (next: string | null) => void | Promise<void>;
  /**
   * A chi appartiene il file. Senza questo l'allegato non puo essere
   * autorizzato — e per questo non e opzionale: un file senza proprietario e
   * un file che nessuno sa a chi mostrare.
   */
  owner: {
    type: AttachmentOwnerType;
    id: string;
    organizationId?: string | null;
  };
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

/** Un identificativo tecnico stabile per la categoria dell'allegato. */
const categorySlug = (documentType: string) =>
  String(documentType || "documento")
    .toLowerCase()
    .normalize("NFD")
    .replace(new RegExp("[\\u0300-\\u036f]", "g"), "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "documento";

export function CertificateAttachmentField({
  documentType,
  value,
  onChange,
  owner,
  person,
  date,
  accept = ATTACHMENT_ACCEPT_ATTRIBUTE,
  disabled = false,
  className,
  emptyLabel = "Nessun file allegato",
}: CertificateAttachmentFieldProps) {
  const { showToast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const source = resolveAttachmentSource(value);
  const hasFile = source.kind !== "empty";

  const nameInput = {
    documentType,
    firstName: person?.firstName,
    lastName: person?.lastName,
    fullName: person?.fullName,
    date,
  };

  const handleFile = async (file: File | null | undefined) => {
    if (!file) return;

    if (!owner?.id) {
      showToast(
        "error",
        "Salva prima la scheda: un allegato ha bisogno di sapere a chi appartiene",
      );
      return;
    }

    setBusy(true);
    try {
      /*
        Un riferimento gia presente si **sostituisce**: l'id resta, quindi il
        valore salvato nel record non cambia e non c'e niente da riscrivere.
        Un allegato legacy invece si carica come nuovo, e il record passa dal
        data URL al riferimento: e cosi che l'archivio migra, un file alla
        volta, senza una campagna di riscrittura sul database.
      */
      const result =
        source.kind === "reference"
          ? await replaceAttachment(source.id, file, file.name)
          : await uploadAttachment({
              file,
              ownerType: owner.type,
              ownerId: owner.id,
              category: categorySlug(documentType),
              fileName: file.name,
              organizationId: owner.organizationId,
            });

      if (!result.ok) {
        showToast("error", `${documentType}: ${result.message}`);
        return;
      }

      if (source.kind !== "reference") {
        await onChange(result.attachment.reference);
      }

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
      // Prima il record, poi il file: se si cancellasse prima il file e poi
      // il salvataggio fallisse, resterebbe un riferimento a nulla.
      await onChange(null);
      if (source.kind === "reference") {
        await deleteAttachmentById(source.id);
      }
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
