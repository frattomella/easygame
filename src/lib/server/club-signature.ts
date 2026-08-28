import {
  createAttachment,
  deleteAttachment,
  getAttachmentMetadata,
  readAttachment,
  type AttachmentAccessScope,
} from "./attachments";
import { getResourceById, updateResource } from "./resources";
import { parseAttachmentReference, type AttachmentMetadata } from "@/lib/attachments";
import {
  CLUB_SIGNATURE_CATEGORY_BY_KIND,
  CLUB_SIGNATURE_SETTINGS_KEY_BY_KIND,
  isClubSignatureKind,
  validateClubSignatureInput,
  type ClubSignatureCategory,
  type ClubSignatureKind,
} from "@/lib/club-signature";

/**
 * Firma e timbro del presidente: **l'unico** proprietario, lato server.
 *
 * Non e un secondo sistema di allegati e non deve diventarlo: i byte passano
 * per intero da Attachment Core (`src/lib/server/attachments.ts`), con
 * `owner_type: "club"` e `owner_id: <organization_id>`. Qui c'e soltanto cio
 * che Attachment Core non sa: che di firme ce n'e **una sola per club**, che
 * il suo riferimento vive in `clubs.settings`, e che caricarne una nuova
 * significa sostituire la precedente.
 *
 * **Il confine di sicurezza e `organization_id`**, come per ogni allegato:
 * ogni funzione riceve lo scope e lo applica prima di leggere o scrivere. Il
 * messaggio contiene «Accesso negato», che e la stringa da cui il route
 * handler ricava il 403.
 *
 * **Chi puo scrivere** non si decide qui. Il permesso e
 * `canManageClubConfiguration` (proprietario e gestore del club) e lo applica
 * la rotta: firma e timbro sono configurazione della societa, non un dominio
 * con permessi propri. Un secondo sistema di permessi per due immagini
 * sarebbe una superficie in piu da tenere allineata a `access-roles.ts`.
 *
 * ---
 *
 * ## Contratto per il generatore documentale
 *
 * Il generatore (lane W1-G) chiama **una** funzione:
 *
 * ```ts
 * import { readClubSignatureImage } from "@/lib/server/club-signature";
 *
 * const firma = await readClubSignatureImage(organizationId, "signature", scope);
 * const timbro = await readClubSignatureImage(organizationId, "stamp", scope);
 * //    { metadata: AttachmentMetadata; content: Buffer; dataUrl: string } | null
 *
 * if (firma) html += `<img src="${firma.dataUrl}" alt="Firma del presidente" />`;
 * ```
 *
 * `dataUrl` c'e apposta: un documento stampabile e **HTML autonomo**, che
 * viene aperto, salvato o mandato in stampa fuori dalla sessione che lo ha
 * prodotto. Un `<img src="/api/v1/clubs/…/signature">` dentro quel file
 * chiederebbe di nuovo l'autenticazione al momento sbagliato — o resterebbe
 * un riquadro vuoto in un PDF. `null` significa «il club non ne ha caricata
 * una»: e il caso normale, non un errore, e il documento deve saperlo
 * gestire (spazio per la firma a mano).
 */

export type ClubSignatureScope = AttachmentAccessScope;

export type ClubSignature = {
  kind: ClubSignatureKind;
  category: ClubSignatureCategory;
  /** Il riferimento salvato in `clubs.settings`: `attachment:<id>`. */
  reference: string;
  metadata: AttachmentMetadata;
};

export type ClubSignatureImage = {
  metadata: AttachmentMetadata;
  content: Buffer;
  /** `data:image/png;base64,…` — la forma che serve a un documento autonomo. */
  dataUrl: string;
};

export type SaveClubSignatureInput = {
  organizationId: string;
  kind: string;
  fileName?: string | null;
  mimeType?: string | null;
  content: Buffer;
};

const denied = (message: string) => new Error(`Accesso negato: ${message}`);

/**
 * Il club esiste, e chi chiede ne fa parte.
 *
 * Il controllo si ripete qui **oltre** a quello di Attachment Core: la lettura
 * delle impostazioni passa da `resources.ts` e non dal servizio allegati,
 * quindi senza questa riga esisterebbe un percorso — «di che club e la firma?»
 * — che il confine non attraversa.
 */
const ensureClubAccess = (
  scope: ClubSignatureScope | undefined,
  organizationId: string,
) => {
  if (!organizationId) throw new Error("Nessun club indicato");
  if (!scope) return;
  if (!scope.allowedOrganizationIds.includes(organizationId)) {
    throw denied("il club non e fra quelli accessibili");
  }
};

const normalizeKind = (value: string): ClubSignatureKind => {
  const kind = String(value || "").trim().toLowerCase();
  if (!isClubSignatureKind(kind)) {
    throw new Error(
      "Indicare che cosa si sta caricando: «signature» (firma) o «stamp» (timbro).",
    );
  }
  return kind;
};

/**
 * Le impostazioni del club, lette dal proprietario del dato.
 *
 * Non una `prisma.club.findUnique` scritta qui: CLAUDE.md riserva l'accesso
 * club-scoped a `resources.ts`, ed e la stessa regola che tiene allineati
 * `club_resource_items`.
 */
const readClubSettings = async (
  organizationId: string,
  scope?: ClubSignatureScope,
): Promise<Record<string, any>> => {
  const club = await getResourceById("clubs", organizationId, scope);
  if (!club) throw new Error("Club non trovato");

  const settings = (club as Record<string, any>).settings;
  return settings && typeof settings === "object" && !Array.isArray(settings)
    ? (settings as Record<string, any>)
    : {};
};

/** L'id dell'allegato attualmente referenziato, o stringa vuota. */
const readStoredAttachmentId = async (
  organizationId: string,
  kind: ClubSignatureKind,
  scope?: ClubSignatureScope,
) => {
  const settings = await readClubSettings(organizationId, scope);
  return parseAttachmentReference(
    settings[CLUB_SIGNATURE_SETTINGS_KEY_BY_KIND[kind]],
  );
};

/**
 * Scrive la chiave della firma **e nessun'altra**.
 *
 * `settings` e una colonna JSON unica: riscriverla intera farebbe sparire la
 * scheda che qualcun altro ha salvato un istante prima (ADR-0069). Il patch
 * per chiavi e l'unico modo di toccarne una sola.
 */
const writeSignatureReference = async (
  organizationId: string,
  kind: ClubSignatureKind,
  reference: string,
  scope?: ClubSignatureScope,
) => {
  await updateResource(
    "clubs",
    organizationId,
    {
      settings_patch: {
        [CLUB_SIGNATURE_SETTINGS_KEY_BY_KIND[kind]]: reference,
      },
    },
    scope,
  );
};

/* ----------------------------------------------------------------- scrittura */

/**
 * Carica firma o timbro, sostituendo quello che c'era.
 *
 * **L'ordine non e casuale.** Prima si crea l'allegato nuovo, poi si sposta il
 * riferimento, e **solo alla fine** si elimina il vecchio: cosi non esiste un
 * istante in cui il club sia senza firma, e un errore a meta lascia le cose
 * come stavano invece che a meta. Se lo spostamento del riferimento fallisce,
 * l'allegato appena creato viene rimosso: un file che nessuno referenzia e
 * spazio occupato che nessuno ritrovera piu.
 *
 * Non usa `replaceAttachmentContent` di proposito: quella mantiene l'identita
 * dell'allegato, che qui non serve a nessuno, e in cambio farebbe perdere la
 * possibilita di tornare indietro se la scrittura delle impostazioni fallisce.
 */
export const saveClubSignature = async (
  input: SaveClubSignatureInput,
  scope?: ClubSignatureScope,
): Promise<ClubSignature> => {
  const organizationId = String(input.organizationId || "").trim();
  ensureClubAccess(scope, organizationId);

  const kind = normalizeKind(input.kind);
  const category = CLUB_SIGNATURE_CATEGORY_BY_KIND[kind];

  const content = input.content;
  if (!Buffer.isBuffer(content) || content.length === 0) {
    throw new Error("Il file e vuoto.");
  }

  const validation = validateClubSignatureInput({
    mimeType: input.mimeType,
    sizeBytes: content.length,
  });
  if (!validation.ok) {
    throw new Error(validation.message);
  }

  const previousId = await readStoredAttachmentId(organizationId, kind, scope);

  const metadata = await createAttachment(
    {
      organizationId,
      ownerType: "club",
      ownerId: organizationId,
      category,
      fileName: input.fileName || `${category}.png`,
      mimeType: validation.mimeType,
      content,
    },
    scope,
  );

  try {
    await writeSignatureReference(
      organizationId,
      kind,
      metadata.reference,
      scope,
    );
  } catch (error) {
    await deleteAttachment(metadata.id, scope).catch(() => {});
    throw error;
  }

  if (previousId && previousId !== metadata.id) {
    // Il riferimento e gia spostato: se questa fallisce resta un file orfano,
    // che e un difetto molto meno grave di una firma che sparisce.
    await deleteAttachment(previousId, scope).catch(() => {});
  }

  return { kind, category, reference: metadata.reference, metadata };
};

/* ------------------------------------------------------------------ lettura */

/**
 * I metadati della firma, o `null` se il club non ne ha una.
 *
 * `null` anche quando il riferimento c'e ma l'allegato non esiste piu: un
 * riferimento appeso al nulla e, per chi guarda, la stessa cosa di nessuna
 * firma, e farlo diventare un errore romperebbe la scheda del club.
 */
export const getClubSignature = async (
  organizationId: string,
  kind: string,
  scope?: ClubSignatureScope,
): Promise<ClubSignature | null> => {
  const clubId = String(organizationId || "").trim();
  ensureClubAccess(scope, clubId);

  const normalizedKind = normalizeKind(kind);
  const attachmentId = await readStoredAttachmentId(
    clubId,
    normalizedKind,
    scope,
  );
  if (!attachmentId) return null;

  const metadata = await getAttachmentMetadata(attachmentId, scope);
  if (!metadata) return null;

  return {
    kind: normalizedKind,
    category: CLUB_SIGNATURE_CATEGORY_BY_KIND[normalizedKind],
    reference: metadata.reference,
    metadata,
  };
};

/**
 * I byte della firma, piu il `data:` URL da incorporare in un documento.
 *
 * **E la funzione che il generatore documentale consuma** (vedi il contratto
 * in testa al file). Restituisce `null` quando il club non ha caricato nulla.
 */
export const readClubSignatureImage = async (
  organizationId: string,
  kind: string,
  scope?: ClubSignatureScope,
): Promise<ClubSignatureImage | null> => {
  const clubId = String(organizationId || "").trim();
  ensureClubAccess(scope, clubId);

  const normalizedKind = normalizeKind(kind);
  const attachmentId = await readStoredAttachmentId(
    clubId,
    normalizedKind,
    scope,
  );
  if (!attachmentId) return null;

  const attachment = await readAttachment(attachmentId, scope);
  if (!attachment) return null;

  const { metadata, content } = attachment;

  return {
    metadata,
    content,
    dataUrl: `data:${metadata.mimeType};base64,${content.toString("base64")}`,
  };
};

/* ------------------------------------------------------------- eliminazione */

/**
 * Toglie firma o timbro.
 *
 * Prima il riferimento, poi il file: l'ordine inverso lascerebbe — se la
 * scrittura delle impostazioni fallisse — una scheda che promette una firma
 * che non c'e piu. Restituisce `false` quando non c'era nulla da togliere.
 */
export const deleteClubSignature = async (
  organizationId: string,
  kind: string,
  scope?: ClubSignatureScope,
): Promise<boolean> => {
  const clubId = String(organizationId || "").trim();
  ensureClubAccess(scope, clubId);

  const normalizedKind = normalizeKind(kind);
  const attachmentId = await readStoredAttachmentId(
    clubId,
    normalizedKind,
    scope,
  );
  if (!attachmentId) return false;

  await writeSignatureReference(clubId, normalizedKind, "", scope);
  await deleteAttachment(attachmentId, scope).catch(() => {});

  return true;
};
