import { apiRequest } from "./client";
import type { AttachmentMetadata } from "@/lib/attachments";
import {
  CLUB_SIGNATURE_KINDS,
  validateClubSignatureInput,
  type ClubSignatureCategory,
  type ClubSignatureKind,
} from "@/lib/club-signature";

/**
 * Accesso client a firma e timbro del presidente.
 *
 * Passa da `apiRequest` come tutto il resto: nessun `fetch` diretto a `/api`
 * dai componenti (regola di ownership in CLAUDE.md). L'unica eccezione e
 * l'**anteprima**, che non e una richiesta ma un indirizzo dentro un `<img>`:
 * per quella c'e `buildClubSignatureUrl` in `@/lib/club-signature`.
 */

export type ClubSignatureSummary = {
  kind: ClubSignatureKind;
  category: ClubSignatureCategory;
  reference: string;
  metadata: AttachmentMetadata;
};

export type ClubSignatureState = {
  organizationId: string;
  signatures: Record<ClubSignatureKind, ClubSignatureSummary | null>;
  /** Cosa dice il **server** sul diritto di scrivere. Il client lo mostra. */
  canManage: boolean;
};

export type ClubSignatureResult =
  | { ok: true; signature: ClubSignatureSummary }
  | { ok: false; message: string };

const endpoint = (clubId: string) =>
  `/api/v1/clubs/${encodeURIComponent(String(clubId || "").trim())}/signature`;

const emptySignatures = (): ClubSignatureState["signatures"] =>
  Object.fromEntries(
    CLUB_SIGNATURE_KINDS.map((kind) => [kind, null]),
  ) as ClubSignatureState["signatures"];

/**
 * Che cosa il club ha caricato, senza scaricare le immagini.
 *
 * Un errore non fa esplodere la scheda: restituisce lo stato vuoto e in sola
 * lettura, che e cio che si vede quando non c'e niente da vedere.
 */
export const loadClubSignatures = async (
  clubId: string,
): Promise<ClubSignatureState> => {
  const { data, error } = await apiRequest<ClubSignatureState>(endpoint(clubId));

  if (error || !data) {
    return {
      organizationId: String(clubId || ""),
      signatures: emptySignatures(),
      canManage: false,
    };
  }

  return {
    organizationId: data.organizationId || String(clubId || ""),
    signatures: { ...emptySignatures(), ...(data.signatures || {}) },
    canManage: Boolean(data.canManage),
  };
};

/**
 * Carica o sostituisce firma o timbro.
 *
 * La validazione si ripete **anche** qui, prima di spedire: dire «troppo
 * grande» dopo aver caricato l'immagine e una risposta corretta data nel
 * momento sbagliato. Il controllo che conta resta quello del server.
 */
export const uploadClubSignature = async (
  clubId: string,
  kind: ClubSignatureKind,
  file: File | Blob,
  fileName?: string | null,
): Promise<ClubSignatureResult> => {
  const validation = validateClubSignatureInput({
    mimeType: file.type,
    sizeBytes: file.size,
  });

  if (!validation.ok) {
    return { ok: false, message: validation.message };
  }

  const name = String(fileName || (file as File).name || `${kind}.png`);

  const form = new FormData();
  form.append("file", file, name);
  form.append("kind", kind);
  form.append("file_name", name);

  const { data, error } = await apiRequest<ClubSignatureSummary>(
    endpoint(clubId),
    { method: "PUT", body: form },
  );

  if (error || !data) {
    return {
      ok: false,
      message: error?.message || "Caricamento dell'immagine non riuscito",
    };
  }

  return { ok: true, signature: data };
};

export const removeClubSignature = async (
  clubId: string,
  kind: ClubSignatureKind,
): Promise<{ ok: boolean; message?: string }> => {
  const { error } = await apiRequest(
    `${endpoint(clubId)}?kind=${encodeURIComponent(kind)}`,
    { method: "DELETE" },
  );

  return error
    ? { ok: false, message: error.message || "Rimozione non riuscita" }
    : { ok: true };
};
