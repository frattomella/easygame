import { apiRequest } from "./client";
import {
  ATTACHMENT_ENDPOINT,
  validateAttachmentInput,
  type AttachmentMetadata,
  type AttachmentOwnerType,
} from "@/lib/attachments";

/**
 * Accesso client agli allegati.
 *
 * Passa da `apiRequest` come tutto il resto: nessun `fetch` diretto a `/api`
 * dai componenti (regola di ownership in CLAUDE.md). Il corpo e un `FormData`
 * e `apiRequest` lo riconosce, quindi non gli mette un `Content-Type` sbagliato.
 */

export type UploadAttachmentInput = {
  file: File | Blob;
  ownerType: AttachmentOwnerType;
  /** Id del record che possiede il file: atleta, allenatore, socio… */
  ownerId: string;
  /** Natura del documento: «blsd», «certificato-medico», «documento-identita». */
  category: string;
  fileName?: string | null;
  organizationId?: string | null;
};

export type AttachmentResult =
  | { ok: true; attachment: AttachmentMetadata }
  | { ok: false; message: string };

const nameOf = (file: File | Blob, fallback?: string | null) =>
  String(fallback || (file as File).name || "documento");

/**
 * Carica un file e restituisce i metadati, riferimento compreso.
 *
 * La validazione si ripete **anche** qui, prima di spedire: dire «troppo
 * grande» dopo aver caricato 40 MB su una connessione mobile e una risposta
 * corretta data nel momento sbagliato. Il controllo che conta resta quello
 * del server.
 */
export const uploadAttachment = async (
  input: UploadAttachmentInput,
): Promise<AttachmentResult> => {
  const fileName = nameOf(input.file, input.fileName);
  const validation = validateAttachmentInput({
    mimeType: input.file.type,
    sizeBytes: input.file.size,
    fileName,
  });

  if (!validation.ok) {
    return { ok: false, message: validation.message };
  }

  const form = new FormData();
  form.append("file", input.file, fileName);
  form.append("owner_type", input.ownerType);
  form.append("owner_id", input.ownerId);
  form.append("category", input.category);
  form.append("file_name", fileName);
  if (input.organizationId) {
    form.append("organization_id", input.organizationId);
  }

  const { data, error } = await apiRequest<AttachmentMetadata>(
    ATTACHMENT_ENDPOINT,
    { method: "POST", body: form },
  );

  if (error || !data) {
    return {
      ok: false,
      message: error?.message || "Caricamento dell'allegato non riuscito",
    };
  }

  return { ok: true, attachment: data };
};

/**
 * Sostituisce il contenuto di un allegato **senza cambiarne l'id**.
 *
 * Il riferimento gia salvato nel record resta valido: chi ospita il campo non
 * deve ricordarsi di riscriverlo, e non esiste l'istante in cui il record
 * punta a un allegato cancellato.
 */
export const replaceAttachment = async (
  id: string,
  file: File | Blob,
  fileName?: string | null,
): Promise<AttachmentResult> => {
  const name = nameOf(file, fileName);
  const validation = validateAttachmentInput({
    mimeType: file.type,
    sizeBytes: file.size,
    fileName: name,
  });

  if (!validation.ok) {
    return { ok: false, message: validation.message };
  }

  const form = new FormData();
  form.append("file", file, name);
  form.append("file_name", name);

  const { data, error } = await apiRequest<AttachmentMetadata>(
    `${ATTACHMENT_ENDPOINT}/${encodeURIComponent(id)}`,
    { method: "PUT", body: form },
  );

  if (error || !data) {
    return {
      ok: false,
      message: error?.message || "Sostituzione dell'allegato non riuscita",
    };
  }

  return { ok: true, attachment: data };
};

export const deleteAttachmentById = async (id: string): Promise<boolean> => {
  const { error } = await apiRequest(
    `${ATTACHMENT_ENDPOINT}/${encodeURIComponent(id)}`,
    { method: "DELETE" },
  );
  return !error;
};

export const listAttachmentsFor = async (
  ownerType: AttachmentOwnerType,
  ownerId: string,
  category?: string | null,
): Promise<AttachmentMetadata[]> => {
  const params = new URLSearchParams({
    owner_type: ownerType,
    owner_id: ownerId,
  });
  if (category) params.set("category", category);

  const { data, error } = await apiRequest<AttachmentMetadata[]>(
    `${ATTACHMENT_ENDPOINT}?${params.toString()}`,
  );

  return error || !Array.isArray(data) ? [] : data;
};

/**
 * Carica un file e restituisce **il riferimento da salvare nel record**.
 *
 * E la forma che serve alle decine di posti in cui prima si scriveva
 * `const fileUrl = await fileToDataUrl(file)`: una riga per una riga, stesso
 * tipo di ritorno, e il file non entra piu nel record.
 *
 * Un file assente da stringa vuota, come faceva `fileToDataUrl`: e il caso
 * normale di un allegato facoltativo, non un errore. Un caricamento fallito
 * invece **lancia**, perche salvare il resto del record fingendo che il file
 * ci sia e il modo in cui si perde un certificato.
 */
export const uploadAttachmentReference = async (
  file: File | Blob | null | undefined,
  owner: Omit<UploadAttachmentInput, "file" | "fileName"> & {
    fileName?: string | null;
  },
): Promise<string> => {
  if (!file) return "";

  const result = await uploadAttachment({ ...owner, file });
  if (!result.ok) {
    throw new Error(result.message);
  }

  return result.attachment.reference;
};
